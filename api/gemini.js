// SEINCA - Proxy Gemini API para APU
// Lista de modelos en orden de preferencia (sin llamada HTTP extra)
const MODEL_FALLBACK_LIST = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

// Cache simple del modelo que funciona (se resetea si falla)
let workingModel = null;

function calcularParciales(apu) {
  if (Array.isArray(apu.materiales)) {
    apu.materiales = apu.materiales.map(m => ({
      ...m,
      parcial: parseFloat(((m.cant || 0) * (m.precio || 0)).toFixed(2))
    }));
  }
  if (Array.isArray(apu.equipos)) {
    apu.equipos = apu.equipos.map(e => ({
      ...e,
      parcial: parseFloat(((e.cant || 0) * (e.tarifa || 0)).toFixed(2))
    }));
  }
  if (Array.isArray(apu.mo)) {
    apu.mo = apu.mo.map(m => ({
      ...m,
      parcial: parseFloat(((m.cant || 0) * (m.jornal || 0)).toFixed(2))
    }));
  }
  const subMat = (apu.materiales || []).reduce((s, m) => s + (m.parcial || 0), 0);
  const subEq  = (apu.equipos   || []).reduce((s, e) => s + (e.parcial || 0), 0);
  const subMO  = (apu.mo        || []).reduce((s, m) => s + (m.parcial || 0), 0);
  apu.subtotal_materiales = parseFloat(subMat.toFixed(2));
  apu.subtotal_equipos    = parseFloat(subEq.toFixed(2));
  apu.subtotal_mo         = parseFloat(subMO.toFixed(2));
  apu.total_general       = parseFloat((subMat + subEq + subMO).toFixed(2));
  return apu;
}

async function callGemini(model, prompt, apiKey) {
  const controller = new AbortController();
  // Timeout de 50s (dentro del maxDuration=60 de vercel.json)
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  const reinforcedPrompt = `Eres Ingeniero Civil Senior especialista en costos Venezuela (normas COVENIN).
Genera APU JSON para: "${prompt}"
REGLAS:
- Sin valores en 0. Precios USD mercado venezolano.
- Ref: Bloque15cm=0.50, Cemento=9/saco, Arena=25/m3, Cabilla#3=2.80, Mezcladora=30/dia, Albanil=35/dia, Ayudante=20/dia.
- Cantidades exactas + 5-10% desperdicio en materiales.
- rendimiento: numero de unidades/dia.
- JSON puro sin markdown.
Esquema:
{"covenin":"str","unidad":"str","cantidad":num,"rendimiento":num,"descripcion_tecnica":"str","materiales":[{"desc":"str","und":"str","cant":num,"precio":num}],"equipos":[{"desc":"str","cant":num,"tarifa":num}],"mo":[{"cargo":"str","cant":num,"jornal":num}]}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: reinforcedPrompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
          ]
        })
      }
    );
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { prompt } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ ok: false, error: 'API key no configurada' });
  if (!prompt) return res.status(400).json({ ok: false, error: 'Falta el prompt' });

  // Construir lista de modelos a intentar: el que funciono primero, luego el resto
  const modelsToTry = workingModel
    ? [workingModel, ...MODEL_FALLBACK_LIST.filter(m => m !== workingModel)]
    : [...MODEL_FALLBACK_LIST];

  for (const model of modelsToTry) {
    console.log(`Intentando con modelo: ${model}`);
    try {
      const response = await callGemini(model, prompt, apiKey);

      // Si el modelo no existe o no esta disponible, probar el siguiente
      if (response.status === 404 || response.status === 400) {
        console.warn(`Modelo ${model} no disponible (${response.status}), probando siguiente...`);
        if (workingModel === model) workingModel = null; // resetear cache
        continue;
      }

      // Rate limit: retornar error claro
      if (response.status === 429) {
        return res.status(429).json({ ok: false, error: 'Rate limit alcanzado. Intenta en unos segundos.', modelo: model });
      }

      // Otros errores no recuperables
      if (!response.ok) {
        let errMsg = `Error ${response.status} en API Gemini`;
        try { const e = await response.json(); errMsg = e.error?.message || errMsg; } catch {}
        return res.status(response.status).json({ ok: false, error: errMsg, modelo: model });
      }

      // Exito: parsear y calcular
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return res.status(500).json({ ok: false, error: 'Respuesta vacia de Gemini', modelo: model });
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Intentar limpiar markdown si viene con backticks
        const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        parsed = JSON.parse(clean);
      }

      parsed = calcularParciales(parsed);
      parsed.modelo_usado = model;
      workingModel = model; // guardar el modelo exitoso

      return res.status(200).json({ ok: true, data: parsed });

    } catch (err) {
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
      console.error(`Error con modelo ${model}:`, err.message);

      if (isAbort) {
        // Timeout: no intentar mas modelos, devolver error claro
        return res.status(504).json({
          ok: false,
          error: 'La generacion del APU tardo demasiado. Intenta con una descripcion mas corta o vuelve a intentarlo.',
          modelo: model
        });
      }
      // Otro error: continuar con el siguiente modelo
      continue;
    }
  }

  // Si todos los modelos fallaron
  return res.status(503).json({
    ok: false,
    error: 'Ningún modelo de Gemini está disponible en este momento. Verifica tu API key o intenta más tarde.'
  });
};
