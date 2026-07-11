import { APP_VERSION, text } from '../lib/apu-core.js';

const OPENAI_MODELS = String(process.env.OPENAI_MODELS || process.env.OPENAI_MODEL || 'gpt-5.6,gpt-5.6-terra,gpt-5.6-luna')
  .split(',').map((value) => value.trim()).filter(Boolean);
const GEMINI_MODELS = String(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-2.5-flash,gemini-2.5-flash-lite')
  .split(',').map((value) => value.trim()).filter(Boolean);

async function request(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      error: response.ok ? null : text(payload?.error?.message || raw || `HTTP ${response.status}`, 500)
    };
  } catch (error) {
    return {
      ok: false,
      status: error?.name === 'AbortError' ? 408 : 0,
      ms: Date.now() - started,
      error: error?.name === 'AbortError' ? 'Tiempo de espera agotado' : text(error?.message || error, 500)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkOpenAI(key) {
  if (!key) return { configured: false, ok: false, error: 'OPENAI_API_KEY no configurada en Production' };
  const attempts = [];
  for (const model of OPENAI_MODELS.slice(0, 3)) {
    const result = await request(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${key}` }
    });
    attempts.push({ model, ...result });
    if (result.ok) return { configured: true, ok: true, model, status: result.status, ms: result.ms, attempts };
  }
  const last = attempts.at(-1) || {};
  return { configured: true, ok: false, model: last.model, status: last.status || 0, ms: last.ms || 0, error: last.error || 'No se pudo verificar OpenAI', attempts };
}

async function checkGemini(key) {
  if (!key) return { configured: false, ok: false, error: 'GEMINI_API_KEY no configurada en Production' };
  const attempts = [];
  for (const model of GEMINI_MODELS.slice(0, 3)) {
    const result = await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(key)}`);
    attempts.push({ model, ...result });
    if (result.ok) return { configured: true, ok: true, model, status: result.status, ms: result.ms, attempts };
  }
  const last = attempts.at(-1) || {};
  return { configured: true, ok: false, model: last.model, status: last.status || 0, ms: last.ms || 0, error: last.error || 'No se pudo verificar Gemini', attempts };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-SEINCA-Version', APP_VERSION);
  if (req.method === 'HEAD') return res.status(204).end();
  const [openai, gemini] = await Promise.all([
    checkOpenAI(process.env.OPENAI_API_KEY),
    checkGemini(process.env.GEMINI_API_KEY || process.env.GEMINT_API_KEY)
  ]);
  return res.status(200).json({
    ok: openai.ok || gemini.ok,
    version: APP_VERSION,
    mode: openai.ok && gemini.ok ? 'hybrid' : openai.ok ? 'openai-only' : gemini.ok ? 'gemini-only' : 'unavailable',
    providers: { openai, gemini },
    checkedAt: new Date().toISOString()
  });
}
