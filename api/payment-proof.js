const MODELS = String(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-2.5-flash,gemini-2.5-flash-lite')
  .split(',').map((value) => value.trim()).filter(Boolean);
const CLIENT_ID = 'villa-los-apamates-payment-proof-v1';
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 30000;
const RATE_LIMIT_PER_MINUTE = 12;
const buckets = new Map();

function clean(value) { return String(value ?? '').trim(); }
function requestIp(req) { return clean(req.headers['x-forwarded-for']).split(',')[0] || clean(req.socket?.remoteAddress) || 'unknown'; }
function rateAllowed(req) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${requestIp(req)}:${minute}`;
  const count = (buckets.get(key) || 0) + 1;
  buckets.set(key, count);
  if (buckets.size > 1000) {
    for (const existing of buckets.keys()) {
      const keyMinute = Number(existing.split(':').pop());
      if (Number.isFinite(keyMinute) && keyMinute < minute - 2) buckets.delete(existing);
    }
  }
  return count <= RATE_LIMIT_PER_MINUTE;
}
function responseText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.map((part) => typeof part?.text === 'string' ? part.text : '').join('').trim() : '';
}
function extractionPrompt(promptVersion = '') {
  return [
    `Contrato de extracción: ${clean(promptVersion) || 'VLA_PAYMENT_PROOF_V2'}.`,
    'Analiza exclusivamente el comprobante adjunto. Devuelve un único objeto JSON, sin Markdown ni texto adicional.',
    'No apruebes ni rechaces pagos, no declares autenticidad y no decidas acceso al portón. Solo extrae evidencia visible.',
    'Campos exactos requeridos:',
    '{"method":"TRANSFER_VE|MOBILE_PAYMENT_VE|ZELLE|TRANSFER_US|BINANCE_PAY|CRYPTO_TRANSFER|OTHER|UNKNOWN","bank_or_platform":string|null,"amount":number|null,"currency":"VES|USD|UNKNOWN","transaction_date":"YYYY-MM-DD"|null,"transaction_time":"HH:mm:ss"|null,"reference":string|null,"transaction_status":"COMPLETED|SENT|PROCESSED|PENDING|SCHEDULED|FAILED|CANCELLED|REJECTED|UNKNOWN","recipient_name":string|null,"recipient_phone":string|null,"recipient_email":string|null,"recipient_account_visible":string|null,"memo":string|null,"confidence":number,"critical_fields_visible":boolean,"warnings":string[],"possible_visual_modification":boolean}',
    'Reconoce comprobantes bancarios venezolanos, pago móvil, Zelle y Binance. Para USDT, USDC o FDUSD usa currency="USD" y conserva activo/red en memo.',
    'Usa como reference el ID de orden, TxID o referencia visible completa. Usa null cuando un dato no sea visible.',
    'confidence debe reflejar legibilidad y certeza. critical_fields_visible solo puede ser true si se ven monto, moneda/activo, fecha, referencia, estado y algún dato del receptor.',
    'Si detectas señales visuales sospechosas, marca possible_visual_modification=true y explícalas brevemente en warnings.'
  ].join('\n');
}
async function callGemini({ apiKey, model, content, contentType, promptVersion }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: extractionPrompt(promptVersion) },
          { inlineData: { mimeType: contentType, data: content } }
        ] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(clean(payload?.error?.message) || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const raw = responseText(payload);
    if (!raw) throw Object.assign(new Error('Gemini no devolvió contenido.'), { status: 502 });
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, HEAD');
    return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
  }
  if (clean(req.headers['x-vla-client']) !== CLIENT_ID) return res.status(403).json({ ok: false, code: 'CLIENT_NOT_ALLOWED' });
  if (!rateAllowed(req)) return res.status(429).json({ ok: false, code: 'RATE_LIMIT', message: 'Demasiadas lecturas en este momento.' });

  const apiKey = clean(process.env.GEMINI_API_KEY || process.env.GEMINT_API_KEY);
  if (!apiKey) return res.status(503).json({ ok: false, code: 'AI_NOT_CONFIGURED', message: 'Gemini no está configurado.' });

  const content = clean(req.body?.content);
  const contentType = clean(req.body?.contentType).toLowerCase();
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
  if (!content || !allowedTypes.has(contentType)) return res.status(400).json({ ok: false, code: 'INVALID_ATTACHMENT', message: 'Adjunto inválido.' });
  let bytes;
  try { bytes = Buffer.from(content, 'base64'); } catch { return res.status(400).json({ ok: false, code: 'INVALID_ATTACHMENT' }); }
  if (!bytes.length || bytes.length > MAX_BYTES) return res.status(413).json({ ok: false, code: 'ATTACHMENT_TOO_LARGE', message: 'El comprobante supera 3 MB.' });

  const attempts = [];
  for (const model of [...new Set(MODELS)].slice(0, 4)) {
    try {
      const raw = await callGemini({ apiKey, model, content, contentType, promptVersion: req.body?.promptVersion });
      return res.status(200).json({ ok: true, raw, model });
    } catch (error) {
      attempts.push({ model, status: Number(error?.status) || 0, message: clean(error?.message).slice(0, 220) });
      if (Number(error?.status) === 401 || Number(error?.status) === 403 || Number(error?.status) === 429) break;
    }
  }
  console.error('[VLA payment proof]', attempts);
  const status = attempts.some((item) => item.status === 429) ? 429 : 502;
  return res.status(status).json({ ok: false, code: status === 429 ? 'RATE_LIMIT' : 'AI_PROVIDER_ERROR', message: 'No fue posible analizar el comprobante.', attempts });
}
