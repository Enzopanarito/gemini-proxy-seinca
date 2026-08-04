const MODELS = String(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-3.6-flash,gemini-3.5-flash,gemini-2.5-flash,gemini-2.5-flash-lite')
  .split(',').map((value) => value.trim()).filter(Boolean);
const CLIENT_ID = 'villa-los-apamates-payment-proof-v1';
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 18000;
const RATE_LIMIT_PER_MINUTE = 12;
const buckets = new Map();

const METHODS = new Set(['TRANSFER_VE', 'MOBILE_PAYMENT_VE', 'ZELLE', 'TRANSFER_US', 'BINANCE_PAY', 'CRYPTO_TRANSFER', 'OTHER', 'UNKNOWN']);
const CURRENCIES = new Set(['VES', 'USD', 'UNKNOWN']);
const STATUSES = new Set(['COMPLETED', 'SENT', 'PROCESSED', 'PENDING', 'SCHEDULED', 'FAILED', 'CANCELLED', 'REJECTED', 'UNKNOWN']);
const OUTPUT_KEYS = Object.freeze([
  'method', 'bank_or_platform', 'amount', 'currency', 'transaction_date', 'transaction_time', 'reference',
  'transaction_status', 'recipient_name', 'recipient_phone', 'recipient_email', 'recipient_account_visible',
  'memo', 'confidence', 'critical_fields_visible', 'warnings', 'possible_visual_modification'
]);

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
    'Incluye exactamente todas las propiedades indicadas, sin propiedades adicionales. Usa null cuando un dato no sea visible.',
    'Campos exactos requeridos:',
    '{"method":"TRANSFER_VE|MOBILE_PAYMENT_VE|ZELLE|TRANSFER_US|BINANCE_PAY|CRYPTO_TRANSFER|OTHER|UNKNOWN","bank_or_platform":string|null,"amount":number|null,"currency":"VES|USD|UNKNOWN","transaction_date":"YYYY-MM-DD"|null,"transaction_time":"HH:mm:ss"|null,"reference":string|null,"transaction_status":"COMPLETED|SENT|PROCESSED|PENDING|SCHEDULED|FAILED|CANCELLED|REJECTED|UNKNOWN","recipient_name":string|null,"recipient_phone":string|null,"recipient_email":string|null,"recipient_account_visible":string|null,"memo":string|null,"confidence":number,"critical_fields_visible":boolean,"warnings":string[],"possible_visual_modification":boolean}',
    'Reconoce comprobantes bancarios venezolanos, pago móvil, Zelle y Binance. Para USDT, USDC o FDUSD usa currency="USD" y conserva activo/red en memo.',
    'Usa como reference el ID de orden, TxID o referencia visible completa.',
    'confidence debe reflejar legibilidad y certeza. critical_fields_visible solo puede ser true si se ven monto, moneda/activo, fecha, referencia, estado y algún dato del receptor.',
    'Si detectas señales visuales sospechosas, marca possible_visual_modification=true y explícalas brevemente en warnings.'
  ].join('\n');
}

function normalizedToken(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function firstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && clean(value) !== '') return value;
  }
  return null;
}
function nullableText(value, maxLength = 500) {
  const text = clean(value);
  return text ? text.slice(0, maxLength) : null;
}
function parseJsonObject(raw) {
  let text = clean(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw Object.assign(new Error('Gemini no devolvió un objeto JSON.'), { code: 'INVALID_OUTPUT', status: 422 });
    try { parsed = JSON.parse(text.slice(start, end + 1)); }
    catch { throw Object.assign(new Error('Gemini devolvió JSON inválido.'), { code: 'INVALID_OUTPUT', status: 422 }); }
  }
  if (parsed?.analysis && typeof parsed.analysis === 'object' && !Array.isArray(parsed.analysis)) parsed = parsed.analysis;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('Gemini no devolvió un objeto utilizable.'), { code: 'INVALID_OUTPUT', status: 422 });
  }
  return parsed;
}
function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
  let text = clean(value).replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
  if (!text) return null;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    text = text.replace(thousands, '').replace(decimal, '.');
  } else if (comma >= 0) {
    const digits = text.length - comma - 1;
    text = digits > 0 && digits <= 2 ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (dot >= 0) {
    const dots = (text.match(/\./g) || []).length;
    const digits = text.length - dot - 1;
    if (dots > 1) text = digits > 0 && digits <= 2 ? `${text.slice(0, dot).replace(/\./g, '')}.${text.slice(dot + 1)}` : text.replace(/\./g, '');
    else if (digits === 3 && text.slice(0, dot).replace('-', '').length > 0) text = text.replace('.', '');
  }
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
}
function normalizeCurrency(value, evidence = '') {
  const token = normalizedToken(value);
  if (CURRENCIES.has(token)) return token;
  if (['BS', 'BSS', 'VES_BS', 'BOLIVAR', 'BOLIVARES', 'BOLIVARES_DIGITALES'].includes(token)) return 'VES';
  if (['DOLAR', 'DOLARES', 'US_DOLLAR', 'US_DOLLARS', 'USDT', 'USDC', 'FDUSD'].includes(token)) return 'USD';
  const text = normalizedToken(evidence);
  if (/(^|_)(BS|VES|BOLIVAR|BOLIVARES)(_|$)/.test(text)) return 'VES';
  if (/(^|_)(USD|USDT|USDC|FDUSD|DOLAR|DOLARES)(_|$)/.test(text) || clean(evidence).includes('$')) return 'USD';
  return 'UNKNOWN';
}
function normalizeMethod(value, evidence = '') {
  const token = normalizedToken(value);
  if (METHODS.has(token)) return token;
  const text = `${token}_${normalizedToken(evidence)}`;
  if (text.includes('BINANCE_PAY')) return 'BINANCE_PAY';
  if (/(TXID|ON_CHAIN|BLOCKCHAIN|TRANSFERENCIA_CRIPTO|CRYPTO)/.test(text)) return 'CRYPTO_TRANSFER';
  if (text.includes('ZELLE')) return 'ZELLE';
  if (/(PAGO_MOVIL|PAGOMOVIL|MOBILE_PAYMENT)/.test(text)) return 'MOBILE_PAYMENT_VE';
  if (/(ACH|WIRE|TRANSFER_US|TRANSFERENCIA_INTERNACIONAL)/.test(text)) return 'TRANSFER_US';
  if (/(TRANSFER|TRANSFERENCIA|BANCO)/.test(text)) return 'TRANSFER_VE';
  return token ? 'OTHER' : 'UNKNOWN';
}
function normalizeStatus(value) {
  const token = normalizedToken(value);
  if (STATUSES.has(token)) return token;
  if (/(COMPLET|EXITOS|APROBAD|SUCCESS|REALIZAD|CONFIRMAD)/.test(token)) return 'COMPLETED';
  if (/(ENVIAD|SENT)/.test(token)) return 'SENT';
  if (/(PROCESAD|PROCESSED)/.test(token)) return 'PROCESSED';
  if (/(PENDIENT|PENDING)/.test(token)) return 'PENDING';
  if (/(PROGRAMAD|SCHEDULED)/.test(token)) return 'SCHEDULED';
  if (/(FALLID|FAILED|ERROR)/.test(token)) return 'FAILED';
  if (/(CANCELAD|CANCELLED|CANCELED)/.test(token)) return 'CANCELLED';
  if (/(RECHAZAD|REJECTED|DENIED)/.test(token)) return 'REJECTED';
  return 'UNKNOWN';
}
function validDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function normalizeDate(value) {
  const text = clean(value);
  if (!text) return null;
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (match && validDate(match[1], match[2], match[3])) return `${match[1]}-${match[2]}-${match[3]}`;
  match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) {
    const day = String(match[1]).padStart(2, '0');
    const month = String(match[2]).padStart(2, '0');
    if (validDate(match[3], month, day)) return `${match[3]}-${month}-${day}`;
  }
  return null;
}
function normalizeTime(value) {
  const text = clean(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]), second = Number(match[3] || 0), meridiem = clean(match[4]).toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}
function normalizeConfidence(value) {
  let number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number > 1 && number <= 100) number /= 100;
  return Math.max(0, Math.min(1, Math.round(number * 1000) / 1000));
}
function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const token = normalizedToken(value);
  if (['TRUE', 'SI', 'YES', '1'].includes(token)) return true;
  if (['FALSE', 'NO', '0'].includes(token)) return false;
  return fallback;
}
function normalizeWarnings(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((item) => clean(item).slice(0, 300)).filter(Boolean).slice(0, 30);
}

export function normalizePaymentProofRaw(raw) {
  const source = parseJsonObject(raw);
  const evidence = JSON.stringify(source);
  const amount = parseAmount(firstValue(source, ['amount', 'monto', 'monto_pagado', 'paid_amount', 'transaction_amount', 'total']));
  const currency = normalizeCurrency(firstValue(source, ['currency', 'moneda', 'asset', 'activo']), evidence);
  const bank = nullableText(firstValue(source, ['bank_or_platform', 'bank', 'banco', 'platform', 'plataforma', 'payment_method', 'metodo']), 160);
  const method = normalizeMethod(firstValue(source, ['method', 'metodo', 'payment_method', 'transaction_type', 'tipo']), `${bank || ''} ${evidence}`);
  const transactionDate = normalizeDate(firstValue(source, ['transaction_date', 'transactionDate', 'date', 'fecha', 'fecha_operacion', 'operation_date']));
  const transactionTime = normalizeTime(firstValue(source, ['transaction_time', 'transactionTime', 'time', 'hora', 'hora_operacion', 'operation_time']));
  const reference = nullableText(firstValue(source, ['reference', 'referencia', 'transaction_id', 'transactionId', 'operation_id', 'order_id', 'txid', 'pay_id', 'confirmation']), 160);
  const status = normalizeStatus(firstValue(source, ['transaction_status', 'transactionStatus', 'status', 'estado', 'result', 'resultado']));
  const recipientName = nullableText(firstValue(source, ['recipient_name', 'recipientName', 'beneficiary', 'beneficiario', 'receiver_name', 'receptor', 'destinatario']), 200);
  const recipientPhone = nullableText(firstValue(source, ['recipient_phone', 'recipientPhone', 'phone', 'telefono_receptor', 'receiver_phone']), 80);
  const recipientEmail = nullableText(firstValue(source, ['recipient_email', 'recipientEmail', 'email', 'correo_receptor', 'receiver_email']), 254);
  const recipientAccount = nullableText(firstValue(source, ['recipient_account_visible', 'recipientAccountVisible', 'recipient_account', 'account', 'cuenta_receptora', 'receiver_account']), 120);
  const memo = nullableText(firstValue(source, ['memo', 'concept', 'concepto', 'description', 'descripcion', 'note', 'nota']), 500);
  const confidence = normalizeConfidence(firstValue(source, ['confidence', 'confianza', 'score']));
  const warnings = normalizeWarnings(firstValue(source, ['warnings', 'advertencias', 'alerts', 'alertas']));
  const possibleVisualModification = normalizeBoolean(firstValue(source, ['possible_visual_modification', 'possibleVisualModification', 'possible_edit', 'posible_modificacion_visual']), false);
  const inferredCritical = Boolean(amount && currency !== 'UNKNOWN' && transactionDate && reference && status !== 'UNKNOWN' && (recipientName || recipientPhone || recipientEmail || recipientAccount));
  const criticalFieldsVisible = normalizeBoolean(firstValue(source, ['critical_fields_visible', 'criticalFieldsVisible', 'campos_criticos_visibles']), inferredCritical);

  const normalized = {
    method,
    bank_or_platform: bank,
    amount,
    currency,
    transaction_date: transactionDate,
    transaction_time: transactionTime,
    reference,
    transaction_status: status,
    recipient_name: recipientName,
    recipient_phone: recipientPhone,
    recipient_email: recipientEmail,
    recipient_account_visible: recipientAccount,
    memo,
    confidence,
    critical_fields_visible: criticalFieldsVisible,
    warnings,
    possible_visual_modification: possibleVisualModification
  };
  if (Object.keys(normalized).join('|') !== OUTPUT_KEYS.join('|')) {
    throw Object.assign(new Error('El normalizador no produjo el contrato esperado.'), { code: 'INVALID_OUTPUT', status: 422 });
  }
  return normalized;
}

export function paymentProofNormalizerSelfTest() {
  const canonical = normalizePaymentProofRaw(JSON.stringify({
    method: 'MOBILE_PAYMENT_VE', bank_or_platform: 'Mercantil', amount: 123.45, currency: 'VES',
    transaction_date: '2026-08-04', transaction_time: '11:14:00', reference: '0012345',
    transaction_status: 'COMPLETED', recipient_name: 'Villa Los Apamates', recipient_phone: null,
    recipient_email: null, recipient_account_visible: null, memo: null, confidence: 0.98,
    critical_fields_visible: true, warnings: [], possible_visual_modification: false
  }));
  if (canonical.reference !== '0012345' || canonical.amount !== 123.45) throw new Error('canonical');

  const spanish = normalizePaymentProofRaw('```json\n' + JSON.stringify({ analysis: {
    metodo: 'Pago móvil', banco: 'Banco de Venezuela', monto: 'Bs. 12.345,67', moneda: 'bolívares',
    fecha: '04/08/2026', hora: '11:14', referencia: '987654321012', estado: 'Completado',
    receptor: 'Villa Los Apamates', confianza: 96, extra_property: 'discard'
  } }) + '\n```');
  if (spanish.amount !== 12345.67 || spanish.currency !== 'VES' || spanish.transaction_date !== '2026-08-04' || spanish.transaction_time !== '11:14:00') throw new Error('spanish');
  if (spanish.method !== 'MOBILE_PAYMENT_VE' || spanish.transaction_status !== 'COMPLETED') throw new Error('spanish-enums');

  const binance = normalizePaymentProofRaw(JSON.stringify({
    payment_method: 'Binance Pay', amount: '85.00', asset: 'USDT', date: '2026-08-04T15:00:00Z',
    order_id: 'PAY-123', status: 'Successful', beneficiary: 'VLA', score: 0.9
  }));
  if (binance.method !== 'BINANCE_PAY' || binance.currency !== 'USD' || binance.reference !== 'PAY-123') throw new Error('binance');

  const missing = normalizePaymentProofRaw('{"amount":"1,25","currency":"USD","status":"pending"}');
  if (missing.amount !== 1.25 || missing.transaction_status !== 'PENDING' || missing.reference !== null) throw new Error('missing');
  return 4;
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
        generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 1600 }
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
  if (req.method === 'HEAD') {
    try {
      const cases = paymentProofNormalizerSelfTest();
      res.setHeader('X-VLA-Payment-Normalizer', `pass; cases=${cases}`);
      return res.status(204).end();
    } catch (error) {
      res.setHeader('X-VLA-Payment-Normalizer', `fail; ${clean(error?.message).slice(0, 60)}`);
      return res.status(500).end();
    }
  }
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
      const normalized = normalizePaymentProofRaw(raw);
      return res.status(200).json({ ok: true, raw: JSON.stringify(normalized), model, normalized: true });
    } catch (error) {
      attempts.push({ model, status: Number(error?.status) || 0, code: clean(error?.code), message: clean(error?.message).slice(0, 220) });
      if (Number(error?.status) === 401 || Number(error?.status) === 403 || Number(error?.status) === 429) break;
    }
  }
  console.error('[VLA payment proof]', attempts);
  const status = attempts.some((item) => item.status === 429) ? 429 : 502;
  return res.status(status).json({ ok: false, code: status === 429 ? 'RATE_LIMIT' : 'AI_PROVIDER_ERROR', message: 'No fue posible analizar el comprobante.', attempts });
}
