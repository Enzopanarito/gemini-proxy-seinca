import { APP_VERSION, normalizeConfig, text, validateApu } from '../lib/apu-core.js';
import { LOCATION, RESEARCH_SCHEMA, buildResearchPrompt, normalizeGroundedResult, scoreGrounded } from '../lib/grounded-research.js';

const ENGINE_VERSION = '6.0.0-grounded-caracas';
const OPENAI_MODELS = String(process.env.OPENAI_MODELS || process.env.OPENAI_MODEL || 'gpt-5.6,gpt-5.5').split(',').map((v) => v.trim()).filter(Boolean);
const GEMINI_MODELS = String(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-2.5-flash').split(',').map((v) => v.trim()).filter(Boolean);
const MODEL_TIMEOUT_MS = 52000;
const RATE_LIMIT = Number.parseInt(process.env.RATE_LIMIT_PER_MINUTE || '20', 10) || 20;
const buckets = new Map();
const asArray = (value) => Array.isArray(value) ? value : [];

function requestId() { return globalThis.crypto?.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function providerMode(value) { const mode = String(value || 'AUTO').toUpperCase(); return ['AUTO', 'OPENAI', 'GEMINI', 'DUAL'].includes(mode) ? mode : 'AUTO'; }
function clientType(value) { return String(value || '').toUpperCase() === 'ESTADO' ? 'ESTADO' : 'PRIVADO'; }
function clientIp(req) { return text(req.headers['x-forwarded-for'], 500).split(',')[0].trim() || text(req.socket?.remoteAddress, 100) || 'unknown'; }
function rateLimit(req) {
  const minute = Math.floor(Date.now() / 60000); const key = `${clientIp(req)}:${minute}`; const next = (buckets.get(key) || 0) + 1; buckets.set(key, next);
  if (buckets.size > 1800) for (const bucketKey of buckets.keys()) { const m = Number(bucketKey.split(':').pop()); if (Number.isFinite(m) && m < minute - 2) buckets.delete(bucketKey); }
  return next <= RATE_LIMIT;
}
function allowedOrigins(req) {
  const origins = String(process.env.ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean); const host = text(req.headers.host, 255);
  if (host) origins.push(`https://${host}`, `http://${host}`); origins.push('http://localhost:3000', 'http://127.0.0.1:3000'); return new Set(origins);
}
function applyCors(req, res) {
  const origin = text(req.headers.origin, 500); const accepted = !origin || allowedOrigins(req).has(origin);
  if (accepted) res.setHeader('Access-Control-Allow-Origin', origin || '*'); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SEINCA-Client'); return accepted;
}
function parseJson(value) {
  const cleaned = text(value, 250000).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
  const candidates = [cleaned]; const first = cleaned.indexOf('{'); const last = cleaned.lastIndexOf('}'); if (first >= 0 && last > first) candidates.push(cleaned.slice(first, last + 1));
  for (const candidate of candidates) { try { return JSON.parse(candidate); } catch {} try { return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')); } catch {} }
  throw new Error('La respuesta investigada no pudo interpretarse como JSON.');
}
function validUrl(value) { try { const u = new URL(String(value || '')); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : ''; } catch { return ''; } }

async function fetchWithTimeout(url, options, provider, model, signal = null) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS); const abort = () => controller.abort();
  if (signal) { if (signal.aborted) controller.abort(); else signal.addEventListener('abort', abort, { once: true }); }
  try {
    const response = await fetch(url, { ...options, signal: controller.signal }); const raw = await response.text(); let payload = null; try { payload = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) { const error = new Error(text(payload?.error?.message || raw || `HTTP ${response.status}`, 1000)); error.status = response.status; error.provider = provider; error.model = model; throw error; }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') { const e = new Error('Tiempo de espera agotado'); e.status = 408; e.provider = provider; e.model = model; throw e; }
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

function openAIText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim(); const parts = [];
  for (const item of asArray(payload?.output)) for (const content of asArray(item?.content)) if (typeof content?.text === 'string') parts.push(content.text);
  return parts.join('').trim();
}
function openAISources(payload) {
  const urls = [];
  for (const item of asArray(payload?.output)) {
    if (item?.type === 'web_search_call') for (const source of asArray(item?.action?.sources)) { const u = validUrl(source?.url || source?.source_url); if (u) urls.push(u); }
    for (const content of asArray(item?.content)) for (const annotation of asArray(content?.annotations)) if (annotation?.type === 'url_citation') { const u = validUrl(annotation?.url); if (u) urls.push(u); }
  }
  return [...new Set(urls)];
}
async function callOpenAI({ model, prompt, context, apiKey, schema = true, signal }) {
  const body = {
    model, reasoning: { effort: 'medium' },
    tools: [{ type: 'web_search', search_context_size: 'high', user_location: { type: 'approximate', country: 'VE', city: 'Caracas', region: 'Distrito Capital' } }],
    tool_choice: 'required', include: ['web_search_call.action.sources'], input: buildResearchPrompt({ prompt, ...context }), max_output_tokens: 10000, store: false
  };
  if (schema) body.text = { format: { type: 'json_schema', name: 'seinca_grounded_apu', strict: true, schema: RESEARCH_SCHEMA } };
  const payload = await fetchWithTimeout('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) }, 'openai', model, signal);
  const sources = openAISources(payload); const searched = asArray(payload?.output).some((item) => item?.type === 'web_search_call');
  if (!searched || !sources.length) throw Object.assign(new Error('OpenAI no demostró búsqueda web con fuentes.'), { status: 422, provider: 'openai', model });
  const raw = parseJson(openAIText(payload)); return { ...normalizeGroundedResult(raw, sources, prompt, `OpenAI ${model}`), provider: 'openai', model };
}

function geminiText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim(); if (typeof payload?.output === 'string') return payload.output.trim(); const parts = [];
  for (const step of asArray(payload?.steps)) if (step?.type === 'model_output') for (const block of asArray(step?.content)) if (typeof block?.text === 'string') parts.push(block.text);
  for (const output of asArray(payload?.outputs || payload?.output)) { if (typeof output?.text === 'string') parts.push(output.text); for (const part of asArray(output?.content || output?.parts)) if (typeof part?.text === 'string') parts.push(part.text); }
  return parts.join('').trim();
}
function geminiSources(payload) {
  const urls = []; let searched = false;
  for (const step of asArray(payload?.steps)) {
    if (step?.type === 'google_search_call') searched = true;
    if (step?.type === 'model_output') for (const block of asArray(step?.content)) for (const annotation of asArray(block?.annotations)) if (annotation?.type === 'url_citation') { const u = validUrl(annotation?.url); if (u) urls.push(u); }
  }
  return { searched, urls: [...new Set(urls)] };
}
async function callGemini({ model, prompt, context, apiKey, schema = true, signal }) {
  const body = { model, input: buildResearchPrompt({ prompt, ...context }), tools: [{ type: 'google_search' }], generation_config: { temperature: 0.1, max_output_tokens: 10000 }, store: false };
  if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'seinca_grounded_apu', schema: RESEARCH_SCHEMA } };
  const payload = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) }, 'gemini', model, signal);
  const grounding = geminiSources(payload); if (!grounding.searched || !grounding.urls.length) throw Object.assign(new Error('Gemini no demostró Google Search con fuentes.'), { status: 422, provider: 'gemini', model });
  const raw = parseJson(geminiText(payload)); return { ...normalizeGroundedResult(raw, grounding.urls, prompt, `Gemini ${model}`), provider: 'gemini', model };
}

function attempt(error) { return { provider: text(error?.provider || 'desconocido', 30), model: text(error?.model || '', 100), status: Number(error?.status) || 0, message: text(error?.message || 'Error desconocido', 700) }; }
async function tryModel(provider, model, options, signal) {
  const caller = provider === 'openai' ? callOpenAI : callGemini; const attempts = [];
  for (const schema of [true, false]) {
    try {
      const result = await caller({ ...options, model, schema, signal });
      const validation = validateApu(result.apu, options.context.config, { stage: 'draft' }); const fatal = validation.errors.filter((message) => !message.includes('precio'));
      if (fatal.length || result.coverage.priced < 1) throw Object.assign(new Error(fatal.join(' ') || 'No se obtuvo ningún precio web utilizable.'), { status: 422, provider, model });
      return { ...result, validation, attempts };
    } catch (error) { attempts.push(attempt(error)); if (signal?.aborted || (schema && ![400, 422, 502].includes(Number(error?.status)))) break; }
  }
  const failure = new Error(`${provider} ${model} no produjo un APU investigado utilizable`); failure.attempts = attempts; throw failure;
}
async function runProvider(provider, options) {
  const models = [...new Set(provider === 'openai' ? OPENAI_MODELS : GEMINI_MODELS)].slice(0, 2); const cancel = new AbortController();
  try { const winner = await Promise.any(models.map((model) => tryModel(provider, model, options, cancel.signal))); cancel.abort(); return winner; }
  catch (aggregate) { cancel.abort(); const error = new Error(`${provider === 'openai' ? 'OpenAI' : 'Gemini'} no pudo generar e investigar el APU`); error.attempts = asArray(aggregate?.errors).flatMap((reason) => asArray(reason?.attempts)); throw error; }
}
async function generate({ prompt, mode, context, openaiKey, geminiKey }) {
  const jobs = [];
  if (openaiKey && mode !== 'GEMINI') jobs.push(runProvider('openai', { prompt, context, apiKey: openaiKey }));
  if (geminiKey && mode !== 'OPENAI') jobs.push(runProvider('gemini', { prompt, context, apiKey: geminiKey }));
  if (!jobs.length) throw new Error('El motor seleccionado no tiene una clave API configurada.');
  const settled = await Promise.allSettled(jobs); const successes = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value); const attempts = settled.flatMap((r) => r.status === 'rejected' ? asArray(r.reason?.attempts) : asArray(r.value?.attempts));
  if (!successes.length) { const error = new Error('Los motores no lograron generar un APU con investigación web respaldada.'); error.attempts = attempts; throw error; }
  successes.sort((a, b) => scoreGrounded(b) - scoreGrounded(a));
  const selected = successes[0]; const reviewer = successes[1] ? `${successes[1].provider === 'openai' ? 'OpenAI' : 'Gemini'} ${successes[1].model} (contraste web)` : null;
  return { selected, reviewer, attempts };
}

export default async function handler(req, res) {
  const accepted = applyCors(req, res); const id = requestId(); res.setHeader('X-SEINCA-Version', ENGINE_VERSION); res.setHeader('X-Request-Id', id); res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(accepted ? 204 : 403).end(); if (!accepted) return res.status(403).json({ ok: false, error: 'Origen no autorizado', requestId: id });
  const openaiKey = process.env.OPENAI_API_KEY; const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINT_API_KEY;
  if (req.method === 'HEAD') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: Boolean(openaiKey || geminiKey), service: 'SEINCA grounded APU AI', version: ENGINE_VERSION, appVersion: APP_VERSION, location: LOCATION, configured: { openai: Boolean(openaiKey), gemini: Boolean(geminiKey) } });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, HEAD, POST, OPTIONS'); return res.status(405).json({ ok: false, error: 'Método no permitido', requestId: id }); }
  if (!rateLimit(req)) return res.status(429).json({ ok: false, error: 'Demasiadas solicitudes', detalle: 'Espera un minuto y vuelve a intentar.', requestId: id });
  if (!openaiKey && !geminiKey) return res.status(500).json({ ok: false, error: 'Motores no configurados', detalle: 'Configura OPENAI_API_KEY o GEMINI_API_KEY en Vercel.', requestId: id });
  const prompt = text(req.body?.prompt, 16000); if (prompt.length < 15) return res.status(400).json({ ok: false, error: 'Descripción insuficiente', detalle: 'Describe la partida con al menos 15 caracteres.', requestId: id });
  const mode = providerMode(req.body?.provider || req.body?.motor); const tipoCliente = clientType(req.body?.tipoCliente || req.body?.clientType); const altura = Math.max(0, Math.min(300, Number(req.body?.altura ?? req.body?.height) || 0));
  const context = { tipoCliente, altura, config: normalizeConfig(req.body?.config || {}), catalog: asArray(req.body?.catalog).filter((item) => item?.verificado).slice(0, 100) };
  try {
    const result = await generate({ prompt, mode, context, openaiKey, geminiKey }); const selected = result.selected;
    const researchWarnings = selected.apu.advertencias.map((message) => ({ provider: 'investigación', model: selected.model, status: 200, message }));
    return res.status(200).json({
      ok: true, data: selected.apu,
      modelo: `${selected.provider === 'openai' ? 'OpenAI' : 'Gemini'} ${selected.model} + investigación web Caracas${result.reviewer ? ` + ${result.reviewer}` : ''}`,
      motor: { solicitado: mode, generador: `${selected.provider}:${selected.model}`, revisor: result.reviewer, modo: result.reviewer ? 'dual-grounded' : 'grounded', ubicacion: LOCATION, cobertura: selected.coverage, fuentes: selected.sources.slice(0, 40), normas: selected.norms },
      tipoCliente, altura, requestId: id, advertencias_motor: [...result.attempts, ...researchWarnings].slice(-20)
    });
  } catch (error) {
    const attempts = asArray(error?.attempts).slice(-16); console.error('[SEINCA grounded]', { requestId: id, message: error?.message, attempts });
    return res.status(502).json({ ok: false, error: 'No fue posible generar el APU investigado', detalle: text(error?.message, 900), intentos: attempts, requestId: id });
  }
}
