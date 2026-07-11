import {
  APP_VERSION,
  normalizeApu,
  normalizeConfig,
  number,
  text,
  validateApu
} from '../lib/apu-core.js';

const OPENAI_MODELS = String(process.env.OPENAI_MODELS || process.env.OPENAI_MODEL || 'gpt-5.6,gpt-5.6-terra,gpt-5.6-luna')
  .split(',').map((value) => value.trim()).filter(Boolean);
const GEMINI_MODELS = String(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-2.5-flash,gemini-2.5-flash-lite')
  .split(',').map((value) => value.trim()).filter(Boolean);
const MAX_PROMPT_LENGTH = 16000;
const MODEL_TIMEOUT_MS = 50000;
const RATE_LIMIT = Number.parseInt(process.env.RATE_LIMIT_PER_MINUTE || '20', 10) || 20;
const rateBuckets = new Map();

const PRICE_PROPERTIES = {
  fuente_precio: { type: 'string' },
  fecha_precio: { type: 'string' },
  precio_verificado: { type: 'boolean' }
};

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
        type: 'object', additionalProperties: false,
        properties: {
          desc: { type: 'string' }, und: { type: 'string' }, cant: { type: 'number' }, precio: { type: 'number' },
          ...PRICE_PROPERTIES
        },
        required: ['desc', 'und', 'cant', 'precio', 'fuente_precio', 'fecha_precio', 'precio_verificado']
      }
    },
    equipos: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          desc: { type: 'string' }, cant: { type: 'number' }, tarifa: { type: 'number' },
          ...PRICE_PROPERTIES
        },
        required: ['desc', 'cant', 'tarifa', 'fuente_precio', 'fecha_precio', 'precio_verificado']
      }
    },
    mo: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          cargo: { type: 'string' }, cant: { type: 'number' }, jornal: { type: 'number' },
          ...PRICE_PROPERTIES
        },
        required: ['cargo', 'cant', 'jornal', 'fuente_precio', 'fecha_precio', 'precio_verificado']
      }
    }
  },
  required: [
    'covenin', 'covenin_verificado', 'criterio_covenin', 'unidad', 'cantidad', 'rendimiento', 'fcas',
    'descripcion_tecnica', 'memoria_calculo', 'justificacion_rendimiento', 'criterio_ejecucion',
    'supuestos', 'exclusiones', 'advertencias', 'materiales', 'equipos', 'mo'
  ]
};

const asArray = (value) => Array.isArray(value) ? value : [];

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function providerMode(value) {
  const mode = String(value || 'AUTO').toUpperCase();
  return ['AUTO', 'OPENAI', 'GEMINI', 'DUAL'].includes(mode) ? mode : 'AUTO';
}

function clientType(value) {
  return String(value || '').toUpperCase() === 'ESTADO' ? 'ESTADO' : 'PRIVADO';
}

function allowedOrigins(req) {
  const origins = String(process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  const host = text(req.headers.host, 255);
  if (host) origins.push(`https://${host}`, `http://${host}`);
  origins.push('http://localhost:3000', 'http://127.0.0.1:3000');
  return new Set(origins);
}

function applyCors(req, res) {
  const origin = text(req.headers.origin, 500);
  const allowed = allowedOrigins(req);
  const accepted = !origin || allowed.has(origin);
  if (accepted) res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SEINCA-Client');
  return accepted;
}

function clientIp(req) {
  return text(req.headers['x-forwarded-for'], 500).split(',')[0].trim() || text(req.socket?.remoteAddress, 100) || 'unknown';
}

function checkRateLimit(req) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${clientIp(req)}:${minute}`;
  const next = (rateBuckets.get(key) || 0) + 1;
  rateBuckets.set(key, next);
  if (rateBuckets.size > 2000) {
    for (const bucketKey of rateBuckets.keys()) {
      const bucketMinute = Number(bucketKey.split(':').pop());
      if (Number.isFinite(bucketMinute) && bucketMinute < minute - 2) rateBuckets.delete(bucketKey);
    }
  }
  return next <= RATE_LIMIT;
}

function parseJson(value) {
  const cleaned = text(value, 200000)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { }
    try { return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')); } catch { }
  }
  throw new Error('La respuesta no pudo interpretarse como JSON.');
}

function catalogContext(input) {
  const catalog = asArray(input).slice(0, 120).map((item) => ({
    tipo: text(item.type, 20),
    descripcion: text(item.desc, 250),
    unidad: text(item.und, 30),
    precio: Math.max(0, number(item.precio)),
    fuente: text(item.fuente, 250),
    fecha: text(item.fecha, 20),
    verificado: Boolean(item.verificado)
  })).filter((item) => item.descripcion && item.verificado);
  return catalog.length
    ? `CATÁLOGO VERIFICADO DEL USUARIO. Cuando coincida el recurso, copia exactamente precio, fuente, fecha y verificado:\n${JSON.stringify(catalog)}`
    : 'No se suministró un catálogo verificado. Todo precio estimado debe marcarse como no verificado.';
}

function instructions({ tipoCliente, altura, config, catalog }) {
  const clientRule = tipoCliente === 'ESTADO'
    ? 'El contratante es un ente del Estado: exige trazabilidad, metodología conservadora y controles, sin inflar cantidades.'
    : 'El contratante es privado: optimiza recursos sin sacrificar alcance, calidad, seguridad ni normativa.';
  const heightRule = altura > 0
    ? `La ejecución ocurre a ${altura.toFixed(2)} m. Considera acceso, andamios, transporte vertical, izaje, seguridad y rendimiento solo cuando corresponda.`
    : 'La altura declarada es 0,00 m. No agregues costos por altura.';
  return `Actúas como un comité venezolano de ingeniería de costos compuesto por un Ingeniero Civil calculista, un presupuestista, un planificador y un auditor de obra.

OBJETIVO
Genera un APU profesional para UNA sola partida, técnicamente ejecutable, matemáticamente coherente, editable y auditable.

DATOS
- ${clientRule}
- ${heightRule}
- Moneda: ${config.currency}.
- Jornada: ${config.workdayHours} horas.
- FCAS sugerido: ${config.defaultFcasPct}% (editable, no tasa legal universal).
- Administración, imprevistos, utilidad, financiamiento, factor contractual e impuesto los calcula el sistema. No los incluyas como recursos.

REGLAS
1. Respeta medidas expresas y demuestra el cómputo en memoria_calculo.
2. cantidad es el cómputo TOTAL de la partida.
3. materiales[].cant es consumo por UNA unidad de partida.
4. equipos[].cant y mo[].cant son cantidades de la cuadrilla diaria; el sistema divide entre rendimiento.
5. No inventes códigos COVENIN. Sin fuente segura usa POR VERIFICAR y covenin_verificado=false.
6. No dupliques actividades o recursos. Señala actividades separables en exclusiones o advertencias.
7. No inventes materiales en demoliciones ni mano de obra en suministros puros.
8. Usa unidades normalizadas: m, ml, m2, m3, kg, t, l, und, día, h.
9. Cada precio requiere fuente, fecha y estado de verificación.
10. Un precio estimado por IA debe usar precio_verificado=false, fuente_precio="Estimación IA no verificada" y fecha_precio="".
11. Nunca presentes una ausencia de información como verificada.
12. Incluye desperdicio, acarreo interno, seguridad, andamios o izaje solo cuando sean aplicables.
13. Devuelve todos los campos y exclusivamente JSON válido.

${catalogContext(catalog)}`;
}

function task(prompt, candidate = null) {
  if (!candidate) return `Elabora el APU del siguiente alcance:\n\n${prompt}`;
  return `Audita y mejora este APU sin cambiar las medidas expresas. Corrige unidad, cómputo, rendimiento, recursos, duplicidades y trazabilidad. Devuelve el APU final completo.\n\nALCANCE:\n${prompt}\n\nCANDIDATO:\n${JSON.stringify(candidate)}`;
}

function providerError(provider, model, status, message) {
  const error = new Error(text(message, 1200) || `${provider} falló`);
  error.provider = provider;
  error.model = model;
  error.status = Number(status) || 0;
  return error;
}

async function fetchWithTimeout(url, options, provider, model, signal = null, timeoutMs = MODEL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw providerError(provider, model, 408, 'Tiempo de espera agotado');
    throw providerError(provider, model, 0, error?.message || 'Error de red');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function openAIText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  const parts = [];
  for (const item of asArray(payload?.output)) {
    for (const content of asArray(item?.content)) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('').trim();
}

async function callOpenAI({ model, prompt, context, apiKey, candidate = null, schema = true, signal = null }) {
  const body = {
    model,
    instructions: instructions(context),
    input: task(prompt, candidate),
    reasoning: { effort: candidate ? 'low' : 'medium' },
    max_output_tokens: 9000,
    store: false
  };
  if (schema) body.text = { format: { type: 'json_schema', name: 'seinca_apu', strict: true, schema: APU_SCHEMA } };
  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  }, 'openai', model, signal);
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  if (!response.ok) throw providerError('openai', model, response.status, payload?.error?.message || raw || `HTTP ${response.status}`);
  const output = openAIText(payload);
  if (!output) throw providerError('openai', model, 502, 'Respuesta vacía');
  const apu = normalizeApu(parseJson(output), prompt, `OpenAI ${model}`);
  return { apu, provider: 'openai', model, usage: payload?.usage };
}

function interactionText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  if (typeof payload?.output === 'string') return payload.output.trim();
  const pieces = [];
  for (const output of asArray(payload?.outputs || payload?.output)) {
    if (typeof output?.text === 'string') pieces.push(output.text);
    for (const part of asArray(output?.content || output?.parts)) if (typeof part?.text === 'string') pieces.push(part.text);
  }
  return pieces.join('').trim();
}

function generateContentText(payload) {
  return asArray(payload?.candidates?.[0]?.content?.parts).map((part) => part?.text || '').join('').trim();
}

async function callGeminiInteractions({ model, prompt, context, apiKey, candidate = null, schema = true, signal = null }) {
  const body = {
    model,
    input: task(prompt, candidate),
    system_instruction: instructions(context),
    generation_config: { temperature: 0.1, max_output_tokens: 9000 },
    store: false
  };
  if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'seinca_apu', schema: APU_SCHEMA } };
  const response = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body)
  }, 'gemini', model, signal);
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  if (!response.ok) throw providerError('gemini', model, response.status, payload?.error?.message || raw || `HTTP ${response.status}`);
  const output = interactionText(payload);
  if (!output) throw providerError('gemini', model, 502, 'Respuesta vacía en Interactions API');
  return { apu: normalizeApu(parseJson(output), prompt, `Gemini ${model}`), provider: 'gemini', model, endpoint: 'interactions' };
}

async function callGeminiGenerateContent({ model, prompt, context, apiKey, candidate = null, schema = true, signal = null }) {
  const generationConfig = { temperature: 0.1, topP: 0.85, maxOutputTokens: 9000, responseMimeType: 'application/json' };
  if (schema) generationConfig.responseJsonSchema = APU_SCHEMA;
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions(context) }] },
      contents: [{ role: 'user', parts: [{ text: task(prompt, candidate) }] }],
      generationConfig
    })
  }, 'gemini', model, signal);
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  if (!response.ok) throw providerError('gemini', model, response.status, payload?.error?.message || raw || `HTTP ${response.status}`);
  const output = generateContentText(payload);
  if (!output) throw providerError('gemini', model, 502, 'Respuesta vacía en generateContent');
  return { apu: normalizeApu(parseJson(output), prompt, `Gemini ${model}`), provider: 'gemini', model, endpoint: 'generateContent' };
}

async function callGemini(options) {
  try {
    return await callGeminiInteractions(options);
  } catch (firstError) {
    if (options.signal?.aborted) throw firstError;
    try { return await callGeminiGenerateContent(options); }
    catch (secondError) {
      secondError.previous = firstError;
      throw secondError;
    }
  }
}

function attempt(error) {
  return {
    provider: text(error?.provider || 'desconocido', 30),
    model: text(error?.model || '', 100),
    status: Number(error?.status) || 0,
    message: text(error?.message || 'Error desconocido', 700)
  };
}

function ensureUsable(result, context) {
  const validation = validateApu(result.apu, context.config, { stage: 'draft' });
  const fatal = validation.errors.filter((message) => !message.includes('precio'));
  if (fatal.length) throw providerError(result.provider, result.model, 422, fatal.join(' '));
  return { ...result, validation };
}

async function tryModel(provider, model, options, signal) {
  const caller = provider === 'openai' ? callOpenAI : callGemini;
  const attempts = [];
  for (const schema of [true, false]) {
    try {
      const result = await caller({ ...options, model, schema, signal });
      return { ...ensureUsable(result, options.context), attempts };
    } catch (error) {
      attempts.push(attempt(error));
      if (signal?.aborted) break;
      if (schema && ![400, 422, 502].includes(Number(error?.status))) break;
    }
  }
  const failure = new Error(`${provider} ${model} no produjo un APU utilizable`);
  failure.attempts = attempts;
  throw failure;
}

async function runProvider(provider, options) {
  const models = [...new Set(provider === 'openai' ? OPENAI_MODELS : GEMINI_MODELS)].slice(0, 2);
  if (!models.length) throw new Error(`No hay modelos configurados para ${provider}`);
  const cancel = new AbortController();
  const jobs = models.map((model) => tryModel(provider, model, options, cancel.signal));
  try {
    const winner = await Promise.any(jobs);
    cancel.abort();
    return winner;
  } catch (aggregate) {
    cancel.abort();
    const error = new Error(`${provider === 'openai' ? 'OpenAI' : 'Gemini'} no produjo un APU utilizable`);
    error.attempts = asArray(aggregate?.errors).flatMap((reason) => asArray(reason?.attempts));
    throw error;
  }
}

function score(result) {
  const apu = result?.apu;
  if (!apu) return -Infinity;
  return (apu.materiales?.length || 0) * 3 + (apu.equipos?.length || 0) * 2 + (apu.mo?.length || 0) * 4
    + Math.min(20, Math.floor((apu.memoria_calculo?.length || 0) / 180))
    + Math.min(15, Math.floor((apu.descripcion_tecnica?.length || 0) / 160))
    - (result.validation?.warnings?.length || 0) * 2;
}

function compareResults(openai, gemini) {
  const selected = cloneResult(score(gemini) > score(openai) ? gemini : openai);
  const warnings = [...asArray(selected.apu.advertencias)];
  if (openai.apu.unidad !== gemini.apu.unidad) warnings.push(`Contraste IA: unidades distintas (${openai.apu.unidad} vs ${gemini.apu.unidad}).`);
  const ratio = (a, b) => Math.abs(number(a) - number(b)) / Math.max(Math.abs(number(a)), Math.abs(number(b)), 0.000001);
  if (ratio(openai.apu.cantidad, gemini.apu.cantidad) > 0.05) warnings.push(`Contraste IA: diferencia de cómputo (${openai.apu.cantidad} vs ${gemini.apu.cantidad}).`);
  if (ratio(openai.apu.rendimiento, gemini.apu.rendimiento) > 0.30) warnings.push(`Contraste IA: diferencia importante de rendimiento (${openai.apu.rendimiento} vs ${gemini.apu.rendimiento}).`);
  selected.apu.advertencias = [...new Set(warnings)].slice(0, 20);
  return selected;
}

function cloneResult(result) {
  return { ...result, apu: structuredClone(result.apu), validation: structuredClone(result.validation) };
}

async function generate({ prompt, mode, context, openaiKey, geminiKey }) {
  const jobs = [];
  const options = { prompt, context };
  if (openaiKey && mode !== 'GEMINI') jobs.push({ provider: 'openai', promise: runProvider('openai', { ...options, apiKey: openaiKey }) });
  if (geminiKey && mode !== 'OPENAI') jobs.push({ provider: 'gemini', promise: runProvider('gemini', { ...options, apiKey: geminiKey }) });
  if (!jobs.length) throw new Error('El motor seleccionado no tiene una clave API configurada.');

  if (mode === 'AUTO') {
    try {
      const winner = await Promise.any(jobs.map((job) => job.promise));
      return { selected: winner, generator: `${winner.provider === 'openai' ? 'OpenAI' : 'Gemini'} ${winner.model}`, reviewer: null, attempts: winner.attempts || [] };
    } catch (aggregate) {
      const error = new Error('Los motores configurados no produjeron un APU utilizable.');
      error.attempts = asArray(aggregate?.errors).flatMap((reason) => asArray(reason?.attempts));
      throw error;
    }
  }

  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  const successes = settled.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const attempts = settled.flatMap((result) => result.status === 'fulfilled' ? asArray(result.value.attempts) : asArray(result.reason?.attempts));
  if (!successes.length) {
    const error = new Error('Los motores configurados no produjeron un APU utilizable.');
    error.attempts = attempts;
    throw error;
  }
  if (successes.length === 1) {
    const only = successes[0];
    return { selected: only, generator: `${only.provider === 'openai' ? 'OpenAI' : 'Gemini'} ${only.model}`, reviewer: null, attempts };
  }
  const openai = successes.find((result) => result.provider === 'openai');
  const gemini = successes.find((result) => result.provider === 'gemini');
  const selected = compareResults(openai, gemini);
  return {
    selected,
    generator: `${selected.provider === 'openai' ? 'OpenAI' : 'Gemini'} ${selected.model}`,
    reviewer: `${selected.provider === 'openai' ? `Gemini ${gemini.model}` : `OpenAI ${openai.model}`} (contraste cruzado)`,
    attempts
  };
}

export default async function handler(req, res) {
  const acceptedOrigin = applyCors(req, res);
  const id = requestId();
  res.setHeader('X-SEINCA-Version', APP_VERSION);
  res.setHeader('X-Request-Id', id);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(acceptedOrigin ? 204 : 403).end();
  if (!acceptedOrigin) return res.status(403).json({ ok: false, error: 'Origen no autorizado', requestId: id });

  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINT_API_KEY;
  if (req.method === 'HEAD') return res.status(204).end();
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: Boolean(openaiKey || geminiKey),
      service: 'SEINCA Enterprise Hybrid APU AI',
      version: APP_VERSION,
      configured: { openai: Boolean(openaiKey), gemini: Boolean(geminiKey) },
      models: { openai: OPENAI_MODELS, gemini: GEMINI_MODELS },
      requestId: id
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, HEAD, POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Método no permitido', requestId: id });
  }
  if (!checkRateLimit(req)) return res.status(429).json({ ok: false, error: 'Demasiadas solicitudes', detalle: 'Espera un minuto y vuelve a intentar.', requestId: id });
  if (!openaiKey && !geminiKey) return res.status(503).json({ ok: false, error: 'Motores no configurados', detalle: 'Configura OPENAI_API_KEY o GEMINI_API_KEY en Vercel.', requestId: id });

  const prompt = text(req.body?.prompt, MAX_PROMPT_LENGTH);
  if (prompt.length < 15) return res.status(400).json({ ok: false, error: 'Descripción insuficiente', detalle: 'Describe la partida con al menos 15 caracteres.', requestId: id });
  const mode = providerMode(req.body?.provider || req.body?.motor);
  const context = {
    tipoCliente: clientType(req.body?.tipoCliente || req.body?.clientType),
    altura: Math.max(0, Math.min(300, number(req.body?.altura ?? req.body?.height, 0))),
    config: normalizeConfig(req.body?.config || {}),
    catalog: asArray(req.body?.catalog)
  };

  try {
    const result = await generate({ prompt, mode, context, openaiKey, geminiKey });
    return res.status(200).json({
      ok: true,
      data: result.selected.apu,
      modelo: result.reviewer ? `${result.generator} + ${result.reviewer}` : result.generator,
      motor: { solicitado: mode, generador: result.generator, revisor: result.reviewer, modo: result.reviewer ? 'dual' : 'simple' },
      advertencias_motor: result.attempts.slice(-12),
      quality: result.selected.validation,
      requestId: id
    });
  } catch (error) {
    const attempts = asArray(error?.attempts).slice(-12);
    console.error('[SEINCA Enterprise]', { requestId: id, message: error?.message, attempts });
    return res.status(502).json({
      ok: false,
      error: 'No fue posible generar el APU',
      detalle: text(error?.message, 900),
      intentos: attempts,
      requestId: id
    });
  }
}
