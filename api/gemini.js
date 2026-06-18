// SEINCA - API Proxy Gemini APU (OPTIMIZADO)
const MODEL_FALLBACK_LIST = ['gemini-2.0-flash', 'gemini-1.5-flash'];
let workingModel = null;

function calcularParciales(apu) {
  if (Array.isArray(apu.materiales)) {
    apu.materiales = apu.materiales.map(e => ({...e, parcial: parseFloat(((e.cant || 0) * (e.precio || 0)).toFixed(2))}));
  }
  if (Array.isArray(apu.equipos)) {
    apu.equipos = apu.equipos.map(e => ({...e, parcial: parseFloat(((e.cant || 0) * (e.tarifa || 0)).toFixed(2))}));
  }
  if (Array.isArray(apu.mo)) {
    apu.mo = apu.mo.map(e => ({...e, parcial: parseFloat(((e.cant || 0) * (e.jornal || 0)).toFixed(2))}));
  }
  const subMat = (apu.materiales || []).reduce((s, m) => s + (m.parcial || 0), 0);
  const subEq = (apu.equipos || []).reduce((s, e) => s + (e.parcial || 0), 0);
  const subMO = (apu.mo || []).reduce((s, m) => s + (m.parcial || 0), 0);
  apu.subtotal_materiales = parseFloat(subMat.toFixed(2));
  apu.subtotal_equipos = parseFloat(subEq.toFixed(2));
  apu.subtotal_mo = parseFloat(subMO.toFixed(2));
  apu.total_general = parseFloat((subMat + subEq + subMO).toFixed(2));
  return apu;
}

async function callGemini(model, prompt, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18000); // 18 segundos

  const optimizedPrompt = `ERES INGENIERO CIVIL SENIOR VENEZOLANO - GENERA APU JSON COMPLETO
Para: "${prompt}"

TERMINOLOGÍA: Cabillas (acero refuerzo), Concreto armado, Friso, Pego, Boquilla, Pañeteo, Arrocillo, Sabieta, Mezcladora trompo, Oficial, Ayudante, Vibradora.

PRECIOS USD 2026 VE: Cemento $9/saco, Cabillas 3/8"=$5.50, 1/2"=$9, Bloques 15cm=$0.70, Arena=$25/m3, Piedra=$30/m3, Albañil=$35/día, Ayudante=$22/día.

REGLAS:
1. NO valores en 0
2. Cantidades exactas + 5-10% desperdicio
3. rdto = unidades/día (cuadrilla 8hrs)
4. Descripción técnica completa con procesos, materiales, dimensiones
5. JSON puro (sin markdown)

ESTRUCTURA:
{"covenin":"código","unidad":"m2|m3|ml|kg|und","computo":NUM,"rdto":NUM,"fc_ar":NUM,"admn_imprvt":"15/5/10","descripcion":"TEXTO EXHAUSTIVO","materiales":[{"desc":"...","unid":"...","cant":XX,"precio":XX,"parcial":XX}],"equipos":[{"desc":"...","cant":XX,"tarifa":XX,"parcial":XX}],"mo":[{"cargo":"...","cant":XX,"jornal":XX,"parcial":XX}]}

Devuelve SOLO el JSON:`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{parts: [{text: optimizedPrompt}]}],
        safetySettings: [
          {category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE'},
          {category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE'},
          {category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE'},
          {category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE'}
        ],
        generationConfig: {temperature: 0.3, maxOutputTokens: 8000}
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({error: 'Solo POST permitido'});
  }

  const {prompt} = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!prompt) return res.status(400).json({error: 'Falta el campo "prompt"'});
  if (!apiKey) return res.status(500).json({error: 'API key no configurada'});

  const modelsToTry = workingModel ? [workingModel, ...MODEL_FALLBACK_LIST.filter(m => m !== workingModel)] : MODEL_FALLBACK_LIST;

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      console.log(`Intentando modelo: ${model}`);
      const rawText = await callGemini(model, prompt, apiKey);

      if (!rawText) throw new Error('Respuesta vacía del modelo');

      let cleaned = rawText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      const apu = JSON.parse(cleaned);
      const apuConCalculos = calcularParciales(apu);

      workingModel = model;
      console.log(`✓ Modelo exitoso: ${model}`);
      return res.status(200).json({ok: true, data: apuConCalculos});
    } catch (err) {
      console.error(`✗ Error con ${model}:`, err.message);
      lastError = err;
      if (model === workingModel) workingModel = null;
    }
  }

  return res.status(500).json({error: 'Máximo reintentos alcanzado', detalle: lastError?.message || 'Error desconocido'});
}
