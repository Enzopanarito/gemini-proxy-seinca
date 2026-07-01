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
    const sorted = [];
    for (const pattern of MODEL_PRIORITY_PATTERNS) {
      const matching = models.filter(m => pattern.test(m));
      const flash = matching.filter(m => m.includes('flash'));
      const others = matching.filter(m => !m.includes('flash'));
      sorted.push(...flash, ...others);
    }
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
    apu.descripcion_tecnica = apu.descripcion || '';
  return apu;
}

async function callGemini(model, prompt, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 segundos para analisis profundo

  const optimizedPrompt = `Eres un INGENIERO CALCULISTA VENEZOLANO DE ELITE con 30 anos de experiencia en proyectos de construccion. Tu especialidad es elaborar Analisis de Precios Unitarios (APU) completos, detallados y tecnicamente impecables.

PARTIDA SOLICITADA POR EL USUARIO: "${prompt}"

== PASO 1: REFORMULA EL ENUNCIADO ==
Reescribe el enunciado de forma TECNICA Y PROFESIONAL como apareceria en un pliego de condiciones tecnicas o memoria descriptiva de proyecto. El campo "descripcion" del JSON DEBE contener esta version mejorada, NO el texto original del usuario.
CRITICO: Mantén los valores numericos EXACTOS del usuario (dimensiones, medidas, cantidades). Si el usuario escribe '3000m de largo', la descripcion DEBE decir '3000.00 metros de longitud', NO cambies los numeros.

== PASO 2: INVESTIGACION Y DESCOMPOSICION TOTAL ==
Actua como un ingeniero calculista que debe ejecutar esta obra desde cero. Descompone la partida en TODOS sus elementos constructivos necesarios. No te limites solo a lo que menciona el usuario. Piensa en la secuencia constructiva completa:

- Si hay PAREDES DE BLOQUES: incluye fundacion corrida (excavacion, concreto, cabillas), columnas de confinamiento (cabillas longitudinales + estribos + alambre de amarre + concreto + encofrado), vigas de riostre inferiores, vigas de amarre superiores (cabillas + estribos + concreto + encofrado), bloques, pego (mortero de pega), friso en ambas caras, boquilla, agua para curado.
- Si hay LOSAS: incluye encofrado (formaleta), cabillas positivas y negativas, estribos, concreto, vibradora, curado, desencofrado.
- Si hay ACABADOS: friso fino, masilla, pintura base, pintura caucho 2 manos.
- Si hay PINTURA: lija, sellador, pintura base, pintura final 2 manos.
- Si hay ESTRUCTURAS DE CONCRETO: cemento, arena, piedra, agua, encofrado, vibrado, curado.

== PASO 3: CALCULO METRICO VENEZOLANO ==
Calcula las cantidades usando el sistema metrico. Aplica desperdicios:
- Bloques: +5%, Cabillas: +10%, Cemento: +5%, Arena/Piedra: +15%, Pintura: +10%
- rdto = rendimiento de la cuadrilla por dia (unidades ejecutadas en 8 horas)

== PASO 4: TERMINOLOGIA VENEZOLANA OBLIGATORIA ==
Usa siempre: Cabillas (NO varillas), Friso (NO repello), Pego (NO mortero de pega simple), Boquilla, Paneteo, Arrocillo, Sabieta, Bloque 15cm / Bloque 20cm, Mezcladora trompo, Oficial albanil, Ayudante de albanileria, Maestro de obra, Vibradora electrica.

== PASO 5: TABLA DE PRECIOS USD VENEZUELA 2026 ==
Materiales: Cemento Portland $9.00/saco(42.5kg), Cabilla 3/8" $5.50/ml, Cabilla 1/2" $9.00/ml, Cabilla 5/8" $14.00/ml, Cabilla 3/4" $20.00/ml, Alambre recocido #18 $3.00/kg, Bloque de concreto 15cm $0.70/und, Bloque de concreto 20cm $1.10/und, Arena lavada $25.00/m3, Piedra triturada $30.00/m3, Agua $2.00/m3, Pintura caucho mate $40.00/galon, Pintura base (sellador) $25.00/galon, Friso (mortero seco) $8.00/saco, Pego (adhesivo) $10.00/saco, Tabla encofrado $4.00/und, Puntal metalico $3.00/dia.
Mano de Obra: Oficial albanil $35.00/dia, Ayudante de albanileria $22.00/dia, Maestro de obra $45.00/dia, Pintor oficial $35.00/dia, Carpintero encofrador $38.00/dia.
Equipos: Mezcladora trompo $25.00/dia, Vibradora electrica $20.00/dia, Andamio tubular $5.00/dia/modulo, Carretilla $2.00/dia, Nivel de burbuja $2.00/dia.

== REGLAS CRITICAS ==
1. NINGUN valor en 0 (ni cant, ni precio, ni parcial, ni rdto, ni computo)
2. Incluir TODOS los elementos constructivos necesarios aunque el usuario no los mencione
3. El campo "descripcion" debe ser el enunciado MEJORADO y PROFESIONAL (no el texto del usuario)
4. Unidades correctas: m2 (areas), m3 (volumenes), ml (longitudes), kg (pesos), und (unidades)
5. fc_ar = factor de armado (normalmente entre 1.0 y 1.3 segun complejidad)
6. admn_imprvt = siempre "15/5/10" (Administracion 15% / Imprevistos 5% / Utilidad 10%)
7. Codigo COVENIN venezolano apropiado para la partida
8. Retornar EXCLUSIVAMENTE JSON puro, SIN markdown, SIN explicaciones, SIN texto adicional
9. NUNCA modifiques los valores numericos del usuario: si dice '3000m' el JSON debe tener computo:3000, y la descripcion debe decir '3000.00 metros', JAMAS '10m' u otro numero diferente

== ESTRUCTURA JSON REQUERIDA ==
{"covenin":"CODIGO_COVENIN","unidad":"m2","computo":NUM,"rdto":NUM,"fc_ar":NUM,"admn_imprvt":"15/5/10","descripcion":"DESCRIPCION TECNICA MEJORADA Y PROFESIONAL QUE REEMPLAZA EL TEXTO DEL USUARIO","materiales":[{"desc":"nombre del material","unid":"und/saco/m3/kg/ml","cant":XX,"precio":XX,"parcial":XX}],"equipos":[{"desc":"nombre del equipo","cant":XX,"tarifa":XX,"parcial":XX}],"mo":[{"cargo":"cargo del obrero","cant":XX,"jornal":XX,"parcial":XX}]}

Devuelve UNICAMENTE el JSON, comenzando con { y terminando con }`;

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
        generationConfig: {temperature: 0.2, maxOutputTokens: 8000}
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

  const availableModels = await getAvailableModels(apiKey);

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
        detectedModels = null;
      }
    }
  }
  return res.status(500).json({error: 'Maximo reintentos alcanzado', detalle: lastError?.message || 'Error desconocido'});
}
