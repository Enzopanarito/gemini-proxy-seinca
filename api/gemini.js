// SEINCA - API Proxy Gemini APU (OPTIMIZADO CON AUTODETECCION DE MODELO)
// Prioriza modelos gemini-2.5, luego 2.0, luego 1.5
const MODEL_PRIORITY_PATTERNS = [
  /^gemini-2\.5/,
  /^gemini-2\.0/,
  /^gemini-1\.5/
];
const MODEL_FALLBACK_LIST = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'];
let workingModel = null;
let detectedModels = null;
let lastModelDetectionTime = 0;
const MODEL_CACHE_TTL = 3600000; // 1 hora

async function getAvailableModels(apiKey) {
  const now = Date.now();
  if (detectedModels && (now - lastModelDetectionTime) < MODEL_CACHE_TTL) {
    return detectedModels;
  }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = (data.models || [])
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(name => name.startsWith('gemini'));
    // Ordenar por prioridad: 2.5 > 2.0 > 1.5
    const sorted = [];
    for (const pattern of MODEL_PRIORITY_PATTERNS) {
      const matching = models.filter(m => pattern.test(m));
      // Preferir modelos -flash sobre otros dentro del mismo grupo
      const flash = matching.filter(m => m.includes('flash'));
      const others = matching.filter(m => !m.includes('flash'));
      sorted.push(...flash, ...others);
    }
    // Agregar cualquier modelo restante no cubierto por los patrones
    const remaining = models.filter(m => !sorted.includes(m));
    sorted.push(...remaining);
    detectedModels = sorted.length > 0 ? sorted : MODEL_FALLBACK_LIST;
    lastModelDetectionTime = now;
    console.log('Modelos disponibles detectados:', detectedModels.slice(0, 5));
    return detectedModels;
  } catch (err) {
    console.warn('No se pudo obtener lista de modelos, usando fallback:', err.message);
    return MODEL_FALLBACK_LIST;
  }
}

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
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 segundos para 2.5
  const optimizedPrompt = `ERES INGENIERO CIVIL SENIOR VENEZOLANO - GENERA APU JSON COMPLETO
Para: "${prompt}"
TERMINOLOGIA: Cabillas (acero refuerzo), Concreto armado, Friso, Pego, Boquilla, Paneteo, Arrocillo, Sabieta, Mezcladora trompo, Oficial, Ayudante, Vibradora.
PRECIOS USD 2026 VE: Cemento $9/saco, Cabillas 3/8"=$5.50, 1/2"=$9, Bloques 15cm=$0.70, Arena=$25/m3, Piedra=$30/m3, Albanil=$35/dia, Ayudante=$22/dia.
REGLAS:
1. NO valores en 0
2. Cantidades exactas + 5-10% desperdicio
3. rdto = unidades/dia (cuadrilla 8hrs)
4. Descripcion tecnica completa con procesos, materiales, dimensiones
5. JSON puro (sin markdown)
ESTRUCTURA:
{"covenin":"codigo","unidad":"m2|m3|ml|kg|und","computo":NUM,"rdto":NUM,"fc_ar":NUM,"admn_imprvt":"15/5/10","descripcion":"TEXTO EXHAUSTIVO","materiales":[{"desc":"...","unid":"...","cant":XX,"precio":XX,"parcial":XX}],"equipos":[{"desc":"...","cant":XX,"tarifa":XX,"parcial":XX}],"mo":[{"cargo":"...","cant":XX,"jornal":XX,"parcial":XX}]}
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
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINT_API_KEY;
  if (!prompt) return res.status(400).json({error: 'Falta el campo "prompt"'});
  if (!apiKey) return res.status(500).json({error: 'API key no configurada'});

  // Autodetectar modelos disponibles para esta API key
  const availableModels = await getAvailableModels(apiKey);

  // Si ya tenemos un modelo que funciono, intentarlo primero
  const modelsToTry = workingModel
    ? [workingModel, ...availableModels.filter(m => m !== workingModel)]
    : availableModels;

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      console.log(`Intentando modelo: ${model}`);
      const rawText = await callGemini(model, prompt, apiKey);
      if (!rawText) throw new Error('Respuesta vacia del modelo');
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }
      const apu = JSON.parse(cleaned);
      const apuConCalculos = calcularParciales(apu);
      workingModel = model;
      console.log(`Modelo exitoso: ${model}`);
      return res.status(200).json({ok: true, data: apuConCalculos, modelo: model});
    } catch (err) {
      console.error(`Error con ${model}:`, err.message);
      lastError = err;
      if (model === workingModel) {
        workingModel = null;
        detectedModels = null; // Forzar re-deteccion
      }
    }
  }
  return res.status(500).json({error: 'Maximo reintentos alcanzado', detalle: lastError?.message || 'Error desconocido'});
}
