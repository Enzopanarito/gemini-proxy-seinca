const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Lista de modelos preferidos en orden de prioridad
const PREFERRED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash'
];

// Cache del modelo seleccionado (se refresca cada hora)
let cachedModel = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

async function detectBestModel(apiKey) {
  const now = Date.now();
  if (cachedModel && (now - cacheTimestamp) < CACHE_TTL) {
    console.log(`Usando modelo en cache: ${cachedModel}`);
    return cachedModel;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );
    if (!response.ok) throw new Error(`Error listando modelos: ${response.status}`);
    const data = await response.json();
    const availableNames = (data.models || []).map(m => m.name.replace('models/', ''));
    console.log('Modelos disponibles:', availableNames.slice(0, 10));

    for (const preferred of PREFERRED_MODELS) {
      const match = availableNames.find(n => n === preferred || n.startsWith(preferred));
      if (match) {
        console.log(`Modelo autodetectado: ${match}`);
        cachedModel = match;
        cacheTimestamp = now;
        return match;
      }
    }
  } catch (e) {
    console.warn('No se pudo autodetectar modelo, usando fallback:', e.message);
  }

  // Fallback seguro
  cachedModel = 'gemini-2.5-flash';
  cacheTimestamp = now;
  return cachedModel;
}

function calcularParciales(apu) {
  // Calcular parciales para materiales
  if (Array.isArray(apu.materiales)) {
    apu.materiales = apu.materiales.map(m => ({
      ...m,
      parcial: parseFloat(((m.cant || 0) * (m.precio || 0)).toFixed(2))
    }));
  }
  // Calcular parciales para equipos
  if (Array.isArray(apu.equipos)) {
    apu.equipos = apu.equipos.map(e => ({
      ...e,
      parcial: parseFloat(((e.cant || 0) * (e.tarifa || 0)).toFixed(2))
    }));
  }
  // Calcular parciales para mano de obra
  if (Array.isArray(apu.mo)) {
    apu.mo = apu.mo.map(m => ({
      ...m,
      parcial: parseFloat(((m.cant || 0) * (m.jornal || 0)).toFixed(2))
    }));
  }

  // Calcular subtotales
  const totalMateriales = (apu.materiales || []).reduce((s, m) => s + (m.parcial || 0), 0);
  const totalEquipos = (apu.equipos || []).reduce((s, e) => s + (e.parcial || 0), 0);
  const totalMO = (apu.mo || []).reduce((s, m) => s + (m.parcial || 0), 0);
  const totalGeneral = totalMateriales + totalEquipos + totalMO;

  apu.subtotal_materiales = parseFloat(totalMateriales.toFixed(2));
  apu.subtotal_equipos = parseFloat(totalEquipos.toFixed(2));
  apu.subtotal_mo = parseFloat(totalMO.toFixed(2));
  apu.total_general = parseFloat(totalGeneral.toFixed(2));

  return apu;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ ok: false, error: 'API key not configured' });
  if (!prompt) return res.status(400).json({ ok: false, error: 'Missing prompt' });

  // Autodetectar mejor modelo disponible
  const modelName = await detectBestModel(apiKey);
  console.log(`Usando modelo: ${modelName}`);

  const MAX_RETRIES = 3;
  let attempt = 0;

  const reinforcedPrompt = `Actua como Ingeniero Civil Senior y Consultor en Ingenieria de Costos en Venezuela, normas COVENIN.
Genera un APU detallado para: "${prompt}".
REGLAS OBLIGATORIAS:
1. PROHIBIDO valores en 0. Usa precios reales USD del mercado venezolano.
2. Precios de referencia: Bloque 0.50 USD, Cemento 9 USD/saco, Arena 25 USD/m3, Cabilla#3 2.80 USD, Mezcladora 30 USD/dia, Albanil 35 USD/dia, Ayudante 20 USD/dia.
3. Calcula cantidades exactas con medidas dadas. Aplica 5-10% desperdicio en materiales.
4. El campo rendimiento debe ser numerico (unidades por dia).
5. FORMATO JSON ESTRICTO, sin texto adicional, sin markdown.
Esquema exacto (NO incluyas campo parcial, lo calcula el backend):
{
  "covenin": "string",
  "unidad": "string",
  "cantidad": number,
  "rendimiento": number,
  "descripcion_tecnica": "string",
  "materiales": [{"desc": "string", "und": "string", "cant": number, "precio": number}],
  "equipos": [{"desc": "string", "cant": number, "tarifa": number}],
  "mo": [{"cargo": "string", "cant": number, "jornal": number}]
}`;

  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      console.log(`Intento ${attempt} de ${MAX_RETRIES} con modelo ${modelName}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: reinforcedPrompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
            ]
          })
        }
      );

      clearTimeout(timeoutId);

      if (response.status === 429 || response.status >= 500) {
        // Si el modelo falla, invalidar cache para forzar nueva deteccion
        if (response.status === 404 || response.status === 400) {
          cachedModel = null;
        }
        throw new Error(`Status ${response.status} recuperable`);
      }

      if (!response.ok) {
        const errData = await response.json();
        return res.status(response.status).json({ ok: false, error: errData.error?.message || 'Error Gemini API', modelo_usado: modelName });
      }

      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      let parsed = JSON.parse(text);

      // Calcular parciales y totales en el backend (garantiza precision)
      parsed = calcularParciales(parsed);
      parsed.modelo_usado = modelName;

      return res.status(200).json({ ok: true, data: parsed });

    } catch (error) {
      console.error(`Intento ${attempt} fallido:`, error.message);
      if (attempt >= MAX_RETRIES) {
        return res.status(500).json({ ok: false, error: `Maximo reintentos (${MAX_RETRIES}): ${error.message}`, modelo_intentado: modelName });
      }
      await wait(Math.pow(2, attempt) * 1000);
    }
  }
};
