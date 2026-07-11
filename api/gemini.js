const VERSION = '4.0.0-stable-hybrid';
const OPENAI_MODELS = String(process.env.OPENAI_MODELS || process.env.OPENAI_MODEL || 'gpt-5.6,gpt-5.6-terra,gpt-5.6-luna')
  .split(',').map((value) => value.trim()).filter(Boolean);
const GEMINI_MODELS = String(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-2.5-flash,gemini-2.5-flash-lite')
  .split(',').map((value) => value.trim()).filter(Boolean);
const MAX_PROMPT_LENGTH = 12000;
const REQUEST_TIMEOUT_MS = 42000;
const MAX_REQUESTS_PER_MINUTE = Number.parseInt(process.env.RATE_LIMIT_PER_MINUTE || '30', 10) || 30;
const HEALTH_CACHE_MS = 5 * 60 * 1000;
const rateBuckets = new Map();
let healthCache = null;

const APU_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    covenin: { type: 'string' },
    covenin_verificado: { type: 'boolean' },
    criterio_covenin: { type: 'string' },
    unidad: { type: 'string' },
    cantidad: { type: 'number' },
    rendimiento: { type: 'number' },
    fcas: { type: 'number' },
    descripcion_tecnica: { type: 'string' },
    memoria_calculo: { type: 'string' },
    justificacion_rendimiento: { type: 'string' },
    criterio_ejecucion: { type: 'string' },
    supuestos: { type: 'array', items: { type: 'string' } },
    exclusiones: { type: 'array', items: { type: 'string' } },
    advertencias: { type: 'array', items: { type: 'string' } },
    materiales: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          desc: { type: 'string' },
          und: { type: 'string' },
          cant: { type: 'number' },
          precio: { type: 'number' },
          fuente_precio: { type: 'string' }
        },
        required: ['desc', 'und', 'cant', 'precio', 'fuente_precio']
      }
    },
    equipos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          desc: { type: 'string' },
          cant: { type: 'number' },
          tarifa: { type: 'number' },
          fuente_precio: { type: 'string' }
        },
        required: ['desc', 'cant', 'tarifa', 'fuente_precio']
      }
    },
    mo: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cargo: { type: 'string' },
          cant: { type: 'number' },
          jornal: { type: 'number' },
          fuente_precio: { type: 'string' }
        },
        required: ['cargo', 'cant', 'jornal', 'fuente_precio']
      }
    }
  },
  required: [
    'covenin', 'covenin_verificado', 'criterio_covenin', 'unidad', 'cantidad',
    'rendimiento', 'fcas', 'descripcion_tecnica', 'memoria_calculo',
    'justificacion_rendimiento', 'criterio_ejecucion', 'supuestos', 'exclusiones',
    'advertencias', 'materiales', 'equipos', 'mo'
  ]
};

function text(value, max = 5000) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function number(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clientType(value) {
  return String(value || '').toUpperCase() === 'ESTADO' ? 'ESTADO' : 'PRIVADO';
}

function providerMode(value) {
  const mode = String(value || 'AUTO').toUpperCase();
  return ['AUTO', 'OPENAI', 'GEMINI', 'DUAL'].includes(mode) ? mode : 'AUTO';
}

function allowedOrigins(req) {
  const configured = String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const host = text(req.headers.host, 255);
  if (host) configured.push(`https://${host}`, `http://${host}`);
  configured.push('null', 'http://localhost:3000', 'http://127.0.0.1:3000');
  return new Set(configured);
}

function applyCors(req, res) {
  const origin = text(req.headers.origin, 500);
  const allowed = allowedOrigins(req);
  if (!origin || allowed.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return !origin || allowed.has(origin);
}

function clientIp(req) {
  return text(req.headers['x-forwarded-for'], 500).split(',')[0].trim()
    || text(req.socket?.remoteAddress, 100)
    || 'unknown';
}

function rateLimit(req) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${clientIp(req)}:${minute}`;
  const next = (rateBuckets.get(key) || 0) + 1;
  rateBuckets.set(key, next);
  if (rateBuckets.size > 1500) {
    for (const bucketKey of rateBuckets.keys()) {
      const bucketMinute = Number(bucketKey.split(':').pop());
      if (Number.isFinite(bucketMinute) && bucketMinute < minute - 2) rateBuckets.delete(bucketKey);
    }
  }
  return next <= MAX_REQUESTS_PER_MINUTE;
}

function normalizeUnit(value) {
  const raw = text(value, 30).toLowerCase().replaceAll('²', '2').replaceAll('³', '3');
  const aliases = {
    metro: 'm', metros: 'm', 'm.l.': 'ml', lineal: 'ml',
    'm^2': 'm2', 'm^3': 'm3', unidad: 'und', unidades: 'und',
    dia: 'día', dias: 'día', días: 'día', litro: 'l', litros: 'l',
    tonelada: 't', toneladas: 't'
  };
  return aliases[raw] || raw || 'und';
}

function first(obj, keys, fallback = undefined) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return fallback;
}

function cleanJsonText(value) {
  return text(value, 150000)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function parseJson(value) {
  const cleaned = cleanJsonText(value);
  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { }
    try { return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')); } catch { }
  }
  throw new Error('La IA respondió, pero el JSON no pudo interpretarse');
}

function normalizeApu(raw, prompt, providerName) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('La IA no devolvió un objeto APU');
  }

  const warnings = array(first(raw, ['advertencias', 'warnings'])).map((item) => text(item, 600)).filter(Boolean);
  const sourceFallback = `Referencia ${providerName} editable - verificar cotización local`;

  const rawMaterials = array(first(raw, ['materiales', 'materials']));
  const materiales = rawMaterials.slice(0, 24).map((item, index) => {
    const cant = number(first(item, ['cant', 'cantidad', 'quantity', 'consumo']), 0);
    if (cant <= 0) {
      warnings.push(`Se omitió el material ${index + 1} por cantidad inválida.`);
      return null;
    }
    return {
      desc: text(first(item, ['desc', 'descripcion', 'description', 'material']), 250) || `Material ${index + 1}`,
      und: text(first(item, ['und', 'unidad', 'unit']), 30) || 'und',
      cant,
      precio: Math.max(0, number(first(item, ['precio', 'precio_unitario', 'price', 'unit_price']), 0)),
      fuente_precio: text(first(item, ['fuente_precio', 'fuente', 'source']), 250) || sourceFallback
    };
  }).filter(Boolean);

  const rawEquipment = array(first(raw, ['equipos', 'equipment', 'maquinaria']));
  const equipos = rawEquipment.slice(0, 12).map((item, index) => {
    const cant = number(first(item, ['cant', 'cantidad', 'quantity']), 0);
    if (cant <= 0) {
      warnings.push(`Se omitió el equipo ${index + 1} por cantidad inválida.`);
      return null;
    }
    return {
      desc: text(first(item, ['desc', 'descripcion', 'description', 'equipo']), 250) || `Equipo ${index + 1}`,
      cant,
      tarifa: Math.max(0, number(first(item, ['tarifa', 'precio', 'tarifa_dia', 'rate']), 0)),
      fuente_precio: text(first(item, ['fuente_precio', 'fuente', 'source']), 250) || sourceFallback
    };
  }).filter(Boolean);

  const rawLabor = array(first(raw, ['mo', 'mano_obra', 'manoObra', 'labor']));
  const mo = rawLabor.slice(0, 12).map((item, index) => {
    const cant = number(first(item, ['cant', 'cantidad', 'quantity']), 0);
    if (cant <= 0) {
      warnings.push(`Se omitió el cargo ${index + 1} por cantidad inválida.`);
      return null;
    }
    return {
      cargo: text(first(item, ['cargo', 'desc', 'descripcion', 'role']), 250) || `Trabajador ${index + 1}`,
      cant,
      jornal: Math.max(0, number(first(item, ['jornal', 'precio', 'jornal_dia', 'wage']), 0)),
      fuente_precio: text(first(item, ['fuente_precio', 'fuente', 'source']), 250) || sourceFallback
    };
  }).filter(Boolean);

  if (!materiales.length && !equipos.length && !mo.length) {
    mo.push({
      cargo: 'Cuadrilla provisional para revisión',
      cant: 1,
      jornal: 0,
      fuente_precio: 'Valor provisional: completar jornal antes de guardar'
    });
    warnings.push('La IA no devolvió recursos utilizables. Se agregó una cuadrilla provisional con costo cero para evitar perder la partida; debe completarse manualmente.');
  }

  let cantidad = number(first(raw, ['cantidad', 'computo', 'quantity']), 1);
  if (cantidad <= 0) {
    cantidad = 1;
    warnings.push('La cantidad no era válida y se sustituyó temporalmente por 1,00.');
  }

  let rendimiento = number(first(raw, ['rendimiento', 'rdto', 'performance']), 1);
  if (rendimiento <= 0) {
    rendimiento = 1;
    warnings.push('El rendimiento no era válido y se sustituyó temporalmente por 1,00.');
  }

  let fcas = number(first(raw, ['fcas', 'fcas_porcentaje', 'fc_ar']), 250);
  fcas = Math.min(1000, Math.max(0, fcas));

  const covenin = text(first(raw, ['covenin', 'codigo_covenin', 'code']), 80) || 'POR VERIFICAR';
  const list = (value) => array(value).map((item) => text(item, 600)).filter(Boolean).slice(0, 12);

  return {
    covenin,
    covenin_verificado: covenin !== 'POR VERIFICAR' && Boolean(first(raw, ['covenin_verificado', 'verified'], false)),
    criterio_covenin: text(first(raw, ['criterio_covenin', 'criterio_normativo', 'normative_criterion']), 1600),
    unidad: normalizeUnit(first(raw, ['unidad', 'unit'])),
    cantidad,
    rendimiento,
    fcas,
    descripcion_tecnica: text(first(raw, ['descripcion_tecnica', 'descripcion', 'description']), 6000) || text(prompt, 6000),
    memoria_calculo: text(first(raw, ['memoria_calculo', 'memoria', 'calculation_memory']), 6000),
    justificacion_rendimiento: text(first(raw, ['justificacion_rendimiento', 'rendimiento_justificacion', 'performance_justification']), 3500),
    criterio_ejecucion: text(first(raw, ['criterio_ejecucion', 'metodo_ejecucion', 'execution_criterion']), 3500),
    supuestos: list(first(raw, ['supuestos', 'assumptions'], [])),
    exclusiones: list(first(raw, ['exclusiones', 'exclusions'], [])),
    advertencias: [...new Set(warnings)].slice(0, 12),
    materiales,
    equipos,
    mo
  };
}

function engineeringInstructions(tipoCliente, altura) {
  const state = tipoCliente === 'ESTADO'
    ? 'El contratante es un ente del Estado. El análisis debe ser conservador, trazable y auditable, sin inflar cantidades ni precios.'
    : 'El contratante es privado. Optimiza recursos sin sacrificar alcance, calidad, seguridad ni normativa.';
  const height = altura > 0
    ? `La ejecución ocurre a ${altura.toFixed(2)} m. Considera acceso, transporte vertical, andamios, izaje, seguridad y reducción de rendimiento solo cuando correspondan.`
    : 'La altura declarada es 0,00 m; no agregues costos de altura.';

  return `Actúas como un comité venezolano de ingeniería de costos integrado por un Ingeniero Civil calculista, un presupuestista y un constructor senior.

OBJETIVO
Generar un APU profesional en USD para una sola partida, con cómputo, unidad, rendimiento, FCAS, descripción, memoria, materiales, equipos y mano de obra. Debe ser editable, coherente y auditable.

CONDICIONES
- ${state}
- ${height}
- Jornada: 8 horas.
- El sistema calculará administración 15%, imprevistos 5% y utilidad 10% sobre costo directo.

REGLAS
1. Respeta todas las medidas suministradas y explica las operaciones en memoria_calculo.
2. materiales[].cant es consumo POR UNA UNIDAD de partida.
3. equipos[].cant y mo[].cant son cantidades de la cuadrilla diaria; el sistema divide entre rendimiento.
4. No inventes códigos COVENIN. Sin certeza usa POR VERIFICAR y covenin_verificado=false.
5. Usa terminología venezolana: cabilla, friso, pego, encofrado, mezcladora tipo trompo, oficial, ayudante y maestro de obra.
6. Evita duplicidades y separa actividades que normalmente se pagan como partidas distintas.
7. Los precios son referencias editables, no cotizaciones vigentes; indícalo en fuente_precio.
8. FCAS es un porcentaje editable, no una tasa legal universal.
9. No inventes materiales para demoliciones ni mano de obra para suministros puros.
10. Devuelve todos los campos solicitados aunque algún arreglo de recursos deba quedar vacío.
11. Devuelve exclusivamente JSON, sin Markdown ni comentarios externos.

REFERENCIAS EDITABLES CUANDO NO HAYA COTIZACIÓN
Cemento 42,5 kg 9 USD/saco; bloque 15 cm 0,70 USD/und; bloque 20 cm 1,10 USD/und; arena 25 USD/m3; piedra 30 USD/m3; agua 2 USD/m3; cabilla 3/8 5,50 USD/ml; cabilla 1/2 9 USD/ml; alambre 3 USD/kg; pintura caucho 40 USD/gal; sellador 25 USD/gal; oficial 35 USD/día; ayudante 22 USD/día; maestro 45 USD/día; pintor 35 USD/día; carpintero 38 USD/día; mezcladora 25 USD/día; vibradora 20 USD/día; andamio 5 USD/día/módulo.`;
}

function task(prompt, candidate = null) {
  if (!candidate) return `Elabora el APU de esta partida:\n\n${prompt}`;
  return `Audita y corrige este APU sin cambiar las medidas expresas del alcance. Devuelve el APU final completo en JSON.\n\nALCANCE:\n${prompt}\n\nAPU CANDIDATO:\n${JSON.stringify(candidate)}`;
}

function providerError(provider, model, status, message) {
  const error = new Error(text(message, 1000) || `${provider} falló`);
  error.provider = provider;
  error.model = model;
  error.status = Number(status) || 0;
  return error;
}

async function fetchTimeout(url, options, timeoutMs, provider, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw providerError(provider, model, 408, 'Tiempo de espera agotado');
    throw providerError(provider, model, 0, error?.message || 'Error de red');
  } finally {
    clearTimeout(timer);
  }
}

function openAIText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const parts = [];
  for (const item of array(payload?.output)) {
    for (const content of array(item?.content)) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('').trim();
}

async function callOpenAI({ model, prompt, tipoCliente, altura, apiKey, candidate = null, schema = true, timeoutMs = 30000 }) {
  const body = {
    model,
    instructions: engineeringInstructions(tipoCliente, altura),
    input: task(prompt, candidate),
    reasoning: { effort: candidate ? 'low' : 'medium' },
    max_output_tokens: 9000,
    store: false
  };
  if (schema) body.text = { format: { type: 'json_schema', name: 'seinca_apu', strict: true, schema: APU_SCHEMA } };

  const response = await fetchTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  }, timeoutMs, 'openai', model);

  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { }
  if (!response.ok) throw providerError('openai', model, response.status, payload?.error?.message || raw || `HTTP ${response.status}`);
  const output = openAIText(payload);
  if (!output) throw providerError('openai', model, 502, 'Respuesta vacía');
  return { apu: normalizeApu(parseJson(output), prompt, `OpenAI ${model}`), model, provider: 'openai' };
}

function geminiText(payload) {
  return array(payload?.candidates?.[0]?.content?.parts).map((part) => part?.text || '').join('').trim();
}

async function callGemini({ model, prompt, tipoCliente, altura, apiKey, candidate = null, schema = true, timeoutMs = 30000 }) {
  const generationConfig = {
    temperature: 0.1,
    topP: 0.85,
    maxOutputTokens: 9000,
    responseMimeType: 'application/json'
  };
  if (schema) generationConfig.responseJsonSchema = APU_SCHEMA;

  const response = await fetchTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: engineeringInstructions(tipoCliente, altura) }] },
        contents: [{ role: 'user', parts: [{ text: task(prompt, candidate) }] }],
        generationConfig
      })
    },
    timeoutMs,
    'gemini',
    model
  );

  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { }
  if (!response.ok) throw providerError('gemini', model, response.status, payload?.error?.message || raw || `HTTP ${response.status}`);
  const output = geminiText(payload);
  if (!output) throw providerError('gemini', model, 502, 'Respuesta vacía');
  return { apu: normalizeApu(parseJson(output), prompt, `Gemini ${model}`), model, provider: 'gemini' };
}

function attempt(error) {
  return {
    provider: text(error?.provider || 'desconocido', 30),
    model: text(error?.model || '', 100),
    status: Number(error?.status) || 0,
    message: text(error?.message || 'Error desconocido', 700)
  };
}

async function runProvider(provider, options) {
  const models = provider === 'openai' ? OPENAI_MODELS : GEMINI_MODELS;
  const call = provider === 'openai' ? callOpenAI : callGemini;
  const attempts = [];
  const started = Date.now();

  for (const model of [...new Set(models)].slice(0, 3)) {
    const elapsed = Date.now() - started;
    const remaining = REQUEST_TIMEOUT_MS - elapsed;
    if (remaining < 7000) break;

    try {
      return { ...(await call({ ...options, model, schema: true, timeoutMs: Math.min(26000, remaining) })), attempts };
    } catch (error) {
      attempts.push(attempt(error));
      const remainingAfter = REQUEST_TIMEOUT_MS - (Date.now() - started);
      if (remainingAfter > 9000 && [400, 422, 502].includes(Number(error?.status))) {
        try {
          return { ...(await call({ ...options, model, schema: false, timeoutMs: Math.min(15000, remainingAfter) })), attempts };
        } catch (fallbackError) {
          attempts.push(attempt(fallbackError));
        }
      }
    }
  }

  const error = new Error(`${provider === 'openai' ? 'OpenAI' : 'Gemini'} no produjo un APU utilizable`);
  error.attempts = attempts;
  throw error;
}

function score(apu) {
  if (!apu) return -Infinity;
  return (apu.materiales?.length || 0) * 2
    + (apu.equipos?.length || 0) * 2
    + (apu.mo?.length || 0) * 3
    + Math.min(20, Math.floor((apu.descripcion_tecnica?.length || 0) / 180))
    + Math.min(15, Math.floor((apu.memoria_calculo?.length || 0) / 150))
    - (apu.advertencias?.length || 0);
}

function compareApus(a, b, aName, bName) {
  if (!b) return a;
  const chosen = structuredClone(score(b) > score(a) ? b : a);
  const warnings = [...array(chosen.advertencias)];
  if (a.unidad !== b.unidad) warnings.push(`Revisión cruzada: ${aName} propuso unidad ${a.unidad} y ${bName} ${b.unidad}.`);
  const difference = (x, y) => Math.abs(number(x) - number(y)) / Math.max(Math.abs(number(x)), Math.abs(number(y)), 0.000001);
  if (difference(a.cantidad, b.cantidad) > 0.05) warnings.push(`Revisión cruzada: diferencia de cómputo (${a.cantidad} vs ${b.cantidad}).`);
  if (difference(a.rendimiento, b.rendimiento) > 0.30) warnings.push(`Revisión cruzada: diferencia importante de rendimiento (${a.rendimiento} vs ${b.rendimiento}).`);
  chosen.advertencias = [...new Set(warnings)].slice(0, 12);
  return chosen;
}

async function generate({ prompt, tipoCliente, altura, mode, openaiKey, geminiKey }) {
  const jobs = [];
  const common = { prompt, tipoCliente, altura };
  if (openaiKey && mode !== 'GEMINI') jobs.push({ provider: 'openai', promise: runProvider('openai', { ...common, apiKey: openaiKey }) });
  if (geminiKey && mode !== 'OPENAI') jobs.push({ provider: 'gemini', promise: runProvider('gemini', { ...common, apiKey: geminiKey }) });
  if (!jobs.length) throw new Error('El motor seleccionado no tiene una clave API configurada');

  if (mode === 'AUTO' && jobs.length > 1) {
    try {
      const winner = await Promise.any(jobs.map((job) => job.promise));
      return {
        apu: winner.apu,
        generator: `${winner.provider === 'openai' ? 'OpenAI' : 'Gemini'} ${winner.model}`,
        reviewer: null,
        attempts: winner.attempts || []
      };
    } catch (aggregate) {
      const attempts = [];
      for (const reason of array(aggregate?.errors)) attempts.push(...array(reason?.attempts));
      const error = new Error('Los motores configurados no produjeron un APU utilizable');
      error.attempts = attempts;
      throw error;
    }
  }

  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  const successes = [];
  const attempts = [];
  settled.forEach((result) => {
    if (result.status === 'fulfilled') {
      successes.push(result.value);
      attempts.push(...array(result.value.attempts));
    } else {
      attempts.push(...array(result.reason?.attempts));
    }
  });
  if (!successes.length) {
    const error = new Error('Los motores configurados no produjeron un APU utilizable');
    error.attempts = attempts;
    throw error;
  }

  if (successes.length === 1) {
    const only = successes[0];
    return {
      apu: only.apu,
      generator: `${only.provider === 'openai' ? 'OpenAI' : 'Gemini'} ${only.model}`,
      reviewer: null,
      attempts
    };
  }

  const openai = successes.find((item) => item.provider === 'openai');
  const gemini = successes.find((item) => item.provider === 'gemini');
  const apu = compareApus(openai.apu, gemini.apu, `OpenAI ${openai.model}`, `Gemini ${gemini.model}`);
  return {
    apu,
    generator: `OpenAI ${openai.model}`,
    reviewer: `Gemini ${gemini.model} (revisión cruzada)`,
    attempts
  };
}

async function pingOpenAI(apiKey) {
  if (!apiKey) return { configured: false, ok: false, error: 'OPENAI_API_KEY no configurada' };
  const model = OPENAI_MODELS[0];
  try {
    const result = await callOpenAI({
      model,
      prompt: 'Suministro e instalación de un metro cuadrado de pintura interior sobre pared preparada.',
      tipoCliente: 'PRIVADO',
      altura: 0,
      apiKey,
      schema: false,
      timeoutMs: 15000
    });
    return { configured: true, ok: true, model: result.model };
  } catch (error) {
    return { configured: true, ok: false, model, status: Number(error?.status) || 0, error: text(error?.message, 500) };
  }
}

async function pingGemini(apiKey) {
  if (!apiKey) return { configured: false, ok: false, error: 'GEMINI_API_KEY no configurada' };
  const model = GEMINI_MODELS[0];
  try {
    const result = await callGemini({
      model,
      prompt: 'Suministro e instalación de un metro cuadrado de pintura interior sobre pared preparada.',
      tipoCliente: 'PRIVADO',
      altura: 0,
      apiKey,
      schema: false,
      timeoutMs: 15000
    });
    return { configured: true, ok: true, model: result.model };
  } catch (error) {
    return { configured: true, ok: false, model, status: Number(error?.status) || 0, error: text(error?.message, 500) };
  }
}

async function health(openaiKey, geminiKey) {
  if (healthCache && Date.now() - healthCache.createdAt < HEALTH_CACHE_MS) return healthCache.value;
  const [openai, gemini] = await Promise.all([pingOpenAI(openaiKey), pingGemini(geminiKey)]);
  const value = { openai, gemini };
  healthCache = { createdAt: Date.now(), value };
  return value;
}

export default async function handler(req, res) {
  const corsAllowed = applyCors(req, res);
  res.setHeader('X-SEINCA-Version', VERSION);
  if (req.method === 'OPTIONS') return res.status(corsAllowed ? 204 : 403).end();
  if (!corsAllowed) return res.status(403).json({ ok: false, error: 'Origen no autorizado' });

  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINT_API_KEY;

  if (req.method === 'HEAD') return res.status(204).end();
  if (req.method === 'GET') {
    const live = await health(openaiKey, geminiKey);
    return res.status(200).json({
      ok: live.openai.ok || live.gemini.ok,
      service: 'SEINCA Stable Hybrid APU AI',
      version: VERSION,
      mode: openaiKey && geminiKey ? 'hybrid' : openaiKey ? 'openai-only' : geminiKey ? 'gemini-only' : 'unconfigured',
      live
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, HEAD, POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }
  if (!rateLimit(req)) return res.status(429).json({ ok: false, error: 'Demasiadas solicitudes', detalle: 'Espera un minuto y vuelve a intentar.' });
  if (!openaiKey && !geminiKey) return res.status(500).json({ ok: false, error: 'Motores no configurados', detalle: 'Configura OPENAI_API_KEY o GEMINI_API_KEY en Vercel.' });

  const prompt = text(req.body?.prompt, MAX_PROMPT_LENGTH);
  const tipoCliente = clientType(req.body?.tipoCliente || req.body?.clientType);
  const altura = Math.max(0, Math.min(300, number(req.body?.altura ?? req.body?.height, 0)));
  const mode = providerMode(req.body?.provider || req.body?.motor);
  if (prompt.length < 10) return res.status(400).json({ ok: false, error: 'Descripción insuficiente', detalle: 'Describe la partida con al menos 10 caracteres.' });

  try {
    const result = await generate({ prompt, tipoCliente, altura, mode, openaiKey, geminiKey });
    return res.status(200).json({
      ok: true,
      data: result.apu,
      modelo: result.reviewer ? `${result.generator} + ${result.reviewer}` : result.generator,
      motor: { solicitado: mode, generador: result.generator, revisor: result.reviewer, modo: result.reviewer ? 'dual' : 'simple' },
      tipoCliente,
      altura,
      advertencias_motor: result.attempts.slice(-10)
    });
  } catch (error) {
    const attempts = array(error?.attempts).slice(-12);
    console.error('[SEINCA]', { message: error?.message, attempts });
    return res.status(502).json({
      ok: false,
      error: 'No fue posible generar el APU',
      detalle: text(error?.message, 800),
      intentos: attempts
    });
  }
}
