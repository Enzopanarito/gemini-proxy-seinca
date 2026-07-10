const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-2.5-pro,gemini-2.5-flash')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const GLOBAL_TIMEOUT_MS = 52000;
const MAX_REQUESTS_PER_MINUTE = Number.parseInt(process.env.RATE_LIMIT_PER_MINUTE || '12', 10) || 12;
const MAX_PROMPT_LENGTH = 12000;
const rateBuckets = new Map();

const APU_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    covenin: {
      type: 'string',
      description: 'Código o referencia COVENIN. Usar POR VERIFICAR cuando no exista certeza documental.'
    },
    covenin_verificado: {
      type: 'boolean',
      description: 'Verdadero solo si existe alta certeza sobre la correspondencia del código.'
    },
    criterio_covenin: {
      type: 'string',
      description: 'Explicación breve del criterio normativo empleado y de cualquier verificación pendiente.'
    },
    unidad: {
      type: 'string',
      enum: ['m', 'ml', 'm2', 'm3', 'kg', 't', 'l', 'gal', 'saco', 'und', 'día', 'mes', 'global']
    },
    cantidad: {
      type: 'number',
      minimum: 0.0001,
      description: 'Cómputo métrico total solicitado por el usuario.'
    },
    rendimiento: {
      type: 'number',
      minimum: 0.0001,
      description: 'Producción diaria de la cuadrilla expresada en la unidad de la partida por jornada de 8 horas.'
    },
    fcas: {
      type: 'number',
      minimum: 0,
      maximum: 1000,
      description: 'Factor de costos asociados al salario expresado como porcentaje editable.'
    },
    descripcion_tecnica: { type: 'string' },
    memoria_calculo: {
      type: 'string',
      description: 'Resumen verificable del cómputo, desperdicios, rendimiento y secuencia constructiva.'
    },
    justificacion_rendimiento: { type: 'string' },
    criterio_ejecucion: { type: 'string' },
    supuestos: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    exclusiones: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    advertencias: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    materiales: {
      type: 'array',
      minItems: 1,
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          desc: { type: 'string' },
          und: { type: 'string' },
          cant: { type: 'number', minimum: 0.000001 },
          precio: { type: 'number', minimum: 0 },
          fuente_precio: { type: 'string' }
        },
        required: ['desc', 'und', 'cant', 'precio', 'fuente_precio']
      }
    },
    equipos: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          desc: { type: 'string' },
          cant: { type: 'number', minimum: 0.000001 },
          tarifa: { type: 'number', minimum: 0 },
          fuente_precio: { type: 'string' }
        },
        required: ['desc', 'cant', 'tarifa', 'fuente_precio']
      }
    },
    mo: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cargo: { type: 'string' },
          cant: { type: 'number', minimum: 0.000001 },
          jornal: { type: 'number', minimum: 0 },
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

function numberOr(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value, maxLength = 5000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeClientType(value) {
  return String(value || '').toUpperCase() === 'ESTADO' ? 'ESTADO' : 'PRIVADO';
}

function getAllowedOrigins(req) {
  const configured = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const host = cleanText(req.headers.host, 255);
  if (host) configured.push(`https://${host}`, `http://${host}`);
  configured.push('null', 'http://localhost:3000', 'http://127.0.0.1:3000');
  return new Set(configured);
}

function applyCors(req, res) {
  const origin = cleanText(req.headers.origin, 500);
  const allowedOrigins = getAllowedOrigins(req);
  if (!origin || allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  return !origin || allowedOrigins.has(origin);
}

function getClientIp(req) {
  const forwarded = cleanText(req.headers['x-forwarded-for'], 500);
  return forwarded.split(',')[0].trim() || cleanText(req.socket?.remoteAddress, 100) || 'unknown';
}

function checkRateLimit(req) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${getClientIp(req)}:${minute}`;
  const count = (rateBuckets.get(key) || 0) + 1;
  rateBuckets.set(key, count);
  if (rateBuckets.size > 1000) {
    for (const bucketKey of rateBuckets.keys()) {
      const bucketMinute = Number(bucketKey.split(':').pop());
      if (Number.isFinite(bucketMinute) && bucketMinute < minute - 2) rateBuckets.delete(bucketKey);
    }
  }
  return count <= MAX_REQUESTS_PER_MINUTE;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return [408, 409, 429, 500, 502, 503, 504].includes(status);
}

function buildSystemInstruction(tipoCliente, altura) {
  const alturaTexto = altura > 0
    ? `${altura.toFixed(2)} m sobre el nivel de piso terminado. Debes considerar pérdida de productividad, medios de acceso, izaje, seguridad, transporte vertical y riesgo laboral cuando técnicamente correspondan.`
    : '0.00 m sobre el nivel de piso terminado. No inventes costos de altura que no correspondan.';

  const clienteTexto = tipoCliente === 'ESTADO'
    ? 'El contratante es un ente del Estado. Estructura una solución conservadora, trazable y auditable: cuadrilla suficiente, desperdicios técnicamente defendibles, equipos de respaldo cuando sean necesarios, controles de calidad, seguridad y logística. No infles cantidades arbitrariamente: cada incremento debe estar explicado.'
    : 'El contratante es privado. Optimiza recursos sin sacrificar calidad, seguridad, normativa ni ejecución completa.';

  return `Actúas como Ingeniero Civil venezolano senior, especialista en cómputos métricos, presupuestos, licitaciones y Análisis de Precios Unitarios (APU) para obras ejecutadas en Venezuela.

OBJETIVO
Entregar un APU profesional, completo, editable y auditable en USD. Debes pensar como calculista y constructor: interpretar el alcance, identificar la unidad correcta, calcular el cómputo, proponer una cuadrilla realista, definir rendimiento diario y listar exclusivamente los recursos necesarios para ejecutar UNA unidad de la partida.

CONDICIONES DEL PROYECTO
- Tipo de cliente: ${tipoCliente}. ${clienteTexto}
- Altura de ejecución: ${alturaTexto}
- Jornada de trabajo: 8 horas.
- Administración: 15% del costo directo.
- Imprevistos: 5% del costo directo.
- Utilidad: 10% del costo directo.
- El sistema calculará matemáticamente los parciales; tú solo propones cantidades, precios, rendimiento y FCAS.

REGLAS DE INGENIERÍA
1. Conserva exactamente las medidas y cantidades explícitas del usuario. Puedes derivar áreas, volúmenes, longitudes y desperdicios, pero debes explicar el cálculo en memoria_calculo.
2. Los consumos de materiales deben expresarse POR UNIDAD de partida. El campo cantidad representa el cómputo total de la partida, no debe multiplicarse dentro de los recursos.
3. Para equipos y mano de obra, cant representa el número de equipos o trabajadores de la cuadrilla. El sistema divide sus costos diarios entre el rendimiento.
4. FCAS es un porcentaje aplicado al jornal directo. Propón un valor técnicamente razonable y editable; no lo presentes como tasa legal universal.
5. No inventes normas. Si no puedes asegurar un código COVENIN concreto, usa covenin="POR VERIFICAR", covenin_verificado=false y explica qué documento debe revisarse.
6. Usa terminología venezolana: cabilla, friso, bloque, pego, encofrado, mezcladora tipo trompo, oficial de albañilería, ayudante, maestro de obra, etc.
7. No combines en una sola partida actividades que normalmente deban medirse y pagarse separadamente, salvo que el usuario solicite una partida global. Señala esas situaciones en advertencias.
8. Los precios son referencias editables en USD para Venezuela. No afirmes que son cotizaciones vigentes. En fuente_precio escribe "Referencia IA editable - verificar cotización local".
9. Ningún rendimiento, cantidad o número de integrantes puede ser cero. Un precio puede ser cero únicamente si el usuario expresamente indica que el recurso es suministrado sin costo; de lo contrario usa una referencia razonable.
10. Evita duplicidades: si usas concreto premezclado, no vuelvas a incluir cemento, arena y piedra para ese mismo concreto.
11. Incluye seguridad, acceso, acarreo interno, andamios o izaje solo cuando formen parte real del costo unitario de la partida.
12. La descripción técnica debe definir alcance, material, método, calidad, transporte interno, preparación, ejecución, desperdicios, pruebas y limpieza final cuando correspondan.

REFERENCIAS DE PRECIO BASE EDITABLES (USD, solo como punto de partida cuando el usuario no aporta cotización)
Cemento Portland 42,5 kg: 9,00/saco; bloque concreto 15 cm: 0,70/und; bloque 20 cm: 1,10/und; arena lavada: 25,00/m3; piedra triturada: 30,00/m3; agua: 2,00/m3; cabilla 3/8: 5,50/ml; cabilla 1/2: 9,00/ml; alambre recocido: 3,00/kg; pintura caucho: 40,00/gal; sellador: 25,00/gal; oficial: 35,00/día; ayudante: 22,00/día; maestro: 45,00/día; pintor: 35,00/día; carpintero encofrador: 38,00/día; mezcladora: 25,00/día; vibradora: 20,00/día; andamio tubular: 5,00/día por módulo.

CONTROL DE CALIDAD ANTES DE RESPONDER
- Verifica coherencia entre unidad, cantidad, consumos y rendimiento.
- Verifica que materiales sean consumos unitarios y que equipos/MO representen una cuadrilla diaria.
- Verifica que la descripción no contradiga las tablas.
- Declara supuestos, exclusiones y advertencias.
- Devuelve únicamente el objeto estructurado solicitado.`;
}

function buildUserInput(prompt) {
  return `Elabora el APU de la siguiente partida o alcance:\n\n${prompt}`;
}

function extractInteractionText(payload) {
  const texts = [];
  for (const step of Array.isArray(payload?.steps) ? payload.steps : []) {
    if (step?.type !== 'model_output') continue;
    for (const content of Array.isArray(step.content) ? step.content : []) {
      if (content?.type === 'text' && typeof content.text === 'string') texts.push(content.text);
    }
  }
  return texts.join('').trim();
}

function assertFinitePositive(value, fieldName, allowZero = false) {
  const parsed = numberOr(value, Number.NaN);
  const valid = Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0);
  if (!valid) throw new Error(`Valor inválido en ${fieldName}`);
  return parsed;
}

function normalizeApu(raw, fallbackPrompt) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('La IA no devolvió un objeto APU válido');
  }

  const normalizeMaterial = (item, index) => ({
    desc: cleanText(item?.desc, 250) || `Material ${index + 1}`,
    und: cleanText(item?.und, 30) || 'und',
    cant: assertFinitePositive(item?.cant, `materiales[${index}].cant`),
    precio: assertFinitePositive(item?.precio, `materiales[${index}].precio`, true),
    fuente_precio: cleanText(item?.fuente_precio, 250) || 'Referencia IA editable - verificar cotización local'
  });
  const normalizeEquipo = (item, index) => ({
    desc: cleanText(item?.desc, 250) || `Equipo ${index + 1}`,
    cant: assertFinitePositive(item?.cant, `equipos[${index}].cant`),
    tarifa: assertFinitePositive(item?.tarifa, `equipos[${index}].tarifa`, true),
    fuente_precio: cleanText(item?.fuente_precio, 250) || 'Referencia IA editable - verificar cotización local'
  });
  const normalizeMo = (item, index) => ({
    cargo: cleanText(item?.cargo, 250) || `Trabajador ${index + 1}`,
    cant: assertFinitePositive(item?.cant, `mo[${index}].cant`),
    jornal: assertFinitePositive(item?.jornal, `mo[${index}].jornal`, true),
    fuente_precio: cleanText(item?.fuente_precio, 250) || 'Referencia IA editable - verificar cotización local'
  });

  const materiales = (Array.isArray(raw.materiales) ? raw.materiales : []).map(normalizeMaterial);
  const equipos = (Array.isArray(raw.equipos) ? raw.equipos : []).map(normalizeEquipo);
  const mo = (Array.isArray(raw.mo) ? raw.mo : []).map(normalizeMo);
  if (!materiales.length && !mo.length) throw new Error('El APU debe contener materiales o mano de obra');

  return {
    covenin: cleanText(raw.covenin, 80) || 'POR VERIFICAR',
    covenin_verificado: Boolean(raw.covenin_verificado),
    criterio_covenin: cleanText(raw.criterio_covenin, 1500),
    unidad: cleanText(raw.unidad, 20) || 'und',
    cantidad: assertFinitePositive(raw.cantidad, 'cantidad'),
    rendimiento: assertFinitePositive(raw.rendimiento, 'rendimiento'),
    fcas: Math.min(1000, assertFinitePositive(raw.fcas, 'fcas', true)),
    descripcion_tecnica: cleanText(raw.descripcion_tecnica, 5000) || cleanText(fallbackPrompt, 5000),
    memoria_calculo: cleanText(raw.memoria_calculo, 5000),
    justificacion_rendimiento: cleanText(raw.justificacion_rendimiento, 3000),
    criterio_ejecucion: cleanText(raw.criterio_ejecucion, 3000),
    supuestos: (Array.isArray(raw.supuestos) ? raw.supuestos : []).map((v) => cleanText(v, 500)).filter(Boolean),
    exclusiones: (Array.isArray(raw.exclusiones) ? raw.exclusiones : []).map((v) => cleanText(v, 500)).filter(Boolean),
    advertencias: (Array.isArray(raw.advertencias) ? raw.advertencias : []).map((v) => cleanText(v, 500)).filter(Boolean),
    materiales,
    equipos,
    mo
  };
}

async function callInteractionsApi({ model, prompt, tipoCliente, altura, apiKey, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model,
        input: buildUserInput(prompt),
        system_instruction: buildSystemInstruction(tipoCliente, altura),
        response_format: { type: 'text', mime_type: 'application/json', schema: APU_SCHEMA },
        generation_config: {
          temperature: 0.1,
          top_p: 0.85,
          thinking_level: 'high',
          thinking_summaries: 'none',
          max_output_tokens: 12000
        },
        store: false
      }),
      signal: controller.signal
    });

    const rawBody = await response.text();
    let payload = null;
    try { payload = rawBody ? JSON.parse(rawBody) : null; } catch { payload = null; }
    if (!response.ok) {
      const message = cleanText(payload?.error?.message || rawBody || `HTTP ${response.status}`, 1200);
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const outputText = extractInteractionText(payload);
    if (!outputText) throw new Error('Gemini devolvió una respuesta vacía');
    let parsed;
    try { parsed = JSON.parse(outputText); }
    catch { throw new Error('La respuesta estructurada de Gemini no pudo convertirse a JSON'); }
    return { apu: normalizeApu(parsed, prompt), usage: payload?.usage || null };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const corsAllowed = applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(corsAllowed ? 204 : 403).end();
  if (!corsAllowed) return res.status(403).json({ ok: false, error: 'Origen no autorizado' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }
  if (!checkRateLimit(req)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ ok: false, error: 'Demasiadas solicitudes. Intenta nuevamente en un minuto.' });
  }

  const contentLength = numberOr(req.headers['content-length'], 0);
  if (contentLength > 50000) return res.status(413).json({ ok: false, error: 'Solicitud demasiado grande' });
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINT_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'GEMINI_API_KEY no está configurada en Vercel' });

  const prompt = cleanText(req.body?.prompt, MAX_PROMPT_LENGTH);
  const tipoCliente = normalizeClientType(req.body?.tipoCliente);
  const altura = Math.max(0, Math.min(300, numberOr(req.body?.altura, 0)));
  if (prompt.length < 10) return res.status(400).json({ ok: false, error: 'Describe la partida con al menos 10 caracteres' });

  const models = [...new Set([PRIMARY_MODEL, ...FALLBACK_MODELS])].slice(0, 3);
  const startedAt = Date.now();
  const attempts = [];
  for (let index = 0; index < models.length; index += 1) {
    const remaining = GLOBAL_TIMEOUT_MS - (Date.now() - startedAt);
    if (remaining < 8000) break;
    const model = models[index];
    const timeoutMs = Math.min(index === 0 ? 30000 : 20000, remaining - 1500);
    try {
      const result = await callInteractionsApi({ model, prompt, tipoCliente, altura, apiKey, timeoutMs });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ok: true,
        data: result.apu,
        modelo: model,
        tipoCliente,
        altura,
        usage: result.usage
      });
    } catch (error) {
      const status = Number(error?.status) || 0;
      const message = cleanText(error?.name === 'AbortError' ? 'Tiempo de espera agotado' : error?.message, 1200);
      attempts.push({ model, status, message });
      console.error(`[SEINCA] Error con ${model}:`, status, message);
      const canRetry = index < models.length - 1 && (status === 0 || isRetryableStatus(status));
      if (!canRetry) break;
      const delay = Math.min(2500, 650 * (2 ** index) + Math.floor(Math.random() * 350));
      if (Date.now() - startedAt + delay < GLOBAL_TIMEOUT_MS - 7000) await sleep(delay);
    }
  }

  const lastAttempt = attempts[attempts.length - 1];
  return res.status(502).json({
    ok: false,
    error: 'No fue posible generar el APU en este momento',
    detalle: lastAttempt?.message || 'Error desconocido',
    intentos: attempts.map(({ model, status }) => ({ model, status }))
  });
}
