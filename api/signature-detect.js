const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'];
const MAX_IMAGE_CHARS = 3_800_000;
const buckets = new Map();

function cors(req, res) {
  const origin = String(req.headers.origin || '');
  const allowed =
    !origin ||
    origin === 'https://italianidelvenezuela.vercel.app' ||
    origin === 'https://italianidelvenezuela-laboratorio.vercel.app' ||
    /^https:\/\/italianidelvenezuela-laboratorio-[a-z0-9-]+\.vercel\.app$/i.test(origin) ||
    /^https:\/\/italianidelvenezuela-[a-z0-9-]+\.vercel\.app$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (allowed) res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return allowed;
}

function limited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const minute = Math.floor(Date.now() / 60000);
  const key = ip + ':' + minute;
  const n = (buckets.get(key) || 0) + 1;
  buckets.set(key, n);
  if (buckets.size > 1000) {
    for (const k of buckets.keys()) {
      const m = Number(k.split(':').pop());
      if (Number.isFinite(m) && m < minute - 2) buckets.delete(k);
    }
  }
  return n > 20;
}

function cleanBase64(value) {
  const raw = String(value || '');
  const m = raw.match(/^data:([^;]+);base64,(.+)$/s);
  return m ? { mimeType: m[1], data: m[2] } : { mimeType: 'image/jpeg', data: raw };
}

function parseJson(text) {
  const cleaned = String(text || '').replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\x60\x60\x60\s*$/i, '').trim();
  const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? cleaned.slice(a, b + 1) : cleaned);
}

function validBox(box) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const nums = box.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [y1, x1, y2, x2] = nums.map((n) => Math.max(0, Math.min(1000, Math.round(n))));
  if (y2 <= y1 || x2 <= x1) return null;
  return [y1, x1, y2, x2];
}

async function callGemini(apiKey, model, mimeType, data) {
  const prompt = [
    'Analyze this identity-document image.',
    'Locate the handwritten signature of the DOCUMENT HOLDER only.',
    'Ignore printed text, fingerprints, portraits, stamps, barcodes, seals, and signatures of officials/directors.',
    'On Venezuelan cedulas, prefer the handwriting next to or above the label FIRMA TITULAR.',
    'Also locate the outer visible boundary of the identity card itself, excluding table/background around the card.',
    'Read the document type, document number, and holder name if clearly visible.',
    'Return ONLY JSON with: signature_found (boolean), confidence (0..1), signature_box_2d, document_box_2d, document_type, document_number, holder_name.',
    'Boxes must be [ymin, xmin, ymax, xmax] normalized 0..1000 and tight around the requested object.',
    'Add only a very small margin around the signature strokes.'
  ].join(' ');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);
  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { inline_data: { mime_type: mimeType, data } },
            { text: prompt }
          ] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1200,
            responseFormat: {
              text: {
                mimeType: 'APPLICATION_JSON',
                schema: {
                  type: 'object',
                  properties: {
                    signature_found: { type: 'boolean' },
                    confidence: { type: 'number' },
                    signature_box_2d: { type: ['array','null'], items: { type: 'integer' }, minItems: 4, maxItems: 4 },
                    document_box_2d: { type: ['array','null'], items: { type: 'integer' }, minItems: 4, maxItems: 4 },
                    document_type: { type: 'string' },
                    document_number: { type: 'string' },
                    holder_name: { type: 'string' }
                  },
                  required: ['signature_found','confidence','signature_box_2d','document_box_2d','document_type','document_number','holder_name']
                }
              }
            }
          }
        })
      }
    );
    const raw = await response.text();
    if (!response.ok) throw new Error('Gemini ' + response.status + ': ' + raw.slice(0, 300));
    const payload = JSON.parse(raw);
    const text = (payload?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('');
    return parseJson(text);
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const accepted = cors(req, res);
  if (req.method === 'OPTIONS') return res.status(accepted ? 204 : 403).end();
  if (!accepted) return res.status(403).json({ ok: false, error: 'Origen no autorizado' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metodo no permitido' });
  if (limited(req)) return res.status(429).json({ ok: false, error: 'Demasiadas solicitudes' });

  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINT_API_KEY;
  if (!apiKey) return res.status(503).json({ ok: false, error: 'Gemini no configurado' });

  const image = cleanBase64(req.body?.image);
  if (!image.data || image.data.length > MAX_IMAGE_CHARS) {
    return res.status(400).json({ ok: false, error: 'Imagen ausente o demasiado grande' });
  }
  const mimeType = /^image\/(jpeg|png|webp)$/i.test(image.mimeType) ? image.mimeType : 'image/jpeg';

  let lastError = null;
  for (const model of MODELS) {
    try {
      const out = await callGemini(apiKey, model, mimeType, image.data);
      const signatureBox = validBox(out?.signature_box_2d);
      const documentBox = validBox(out?.document_box_2d) || [0, 0, 1000, 1000];
      const found = Boolean(out?.signature_found && signatureBox);
      return res.status(200).json({
        ok: true,
        model,
        signature_found: found,
        confidence: Math.max(0, Math.min(1, Number(out?.confidence) || 0)),
        signature_box_2d: found ? signatureBox : null,
        document_box_2d: documentBox,
        document_type: String(out?.document_type || '').slice(0, 80),
        document_number: String(out?.document_number || '').slice(0, 80),
        holder_name: String(out?.holder_name || '').slice(0, 140)
      });
    } catch (error) {
      lastError = error;
    }
  }
  console.error('[signature-detect]', String(lastError?.message || lastError || 'unknown'));
  return res.status(502).json({ ok: false, error: 'No se pudo analizar el documento' });
}
