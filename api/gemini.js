// SEINCA - API Proxy Gemini APU para APU
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
    apu.materiales = apu.materiales.map(e => ({
      ...e,
      parcial: parseFloat(((e.cant || 0) * (e.precio || 0)).toFixed(2))
    }));
  }
  
  if (Array.isArray(apu.equipos)) {
    apu.equipos = apu.equipos.map(e => ({
      ...e,
      parcial: parseFloat(((e.cant || 0) * (e.tarifa || 0)).toFixed(2))
    }));
  }
  
  if (Array.isArray(apu.mo)) {
    apu.mo = apu.mo.map(e => ({
      ...e,
      parcial: parseFloat(((e.cant || 0) * (e.jornal || 0)).toFixed(2))
    }));
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
  // Tiempo de espera de 50 segundos (dentro de maxDuration=60 de vercel.json)
  const timeoutId = setTimeout(() => controller.abort(), 50000);
  
const reinforcedPrompt = `ERES INGENIERO CIVIL SENIOR CON 20+ AÑOS DE EXPERIENCIA EN VENEZUELA.
REFERENCIA NORMATIVA: COVENIN (Comisión Venezolana de Normas Industriales).

=== TAREA ===
Generar APU JSON COMPLETO Y EXHAUSTIVO para: "${prompt}"

=== TERMINOLOGÍA TÉCNICA VENEZOLANA (OBLIGATORIO) ===
Debes usar jerga profesional de ingeniería civil venezolana:
- Cabillas (no "varillas"): acero de refuerzo corrugado según COVENIN 316
- Concreto armado (no "hormigón"): f'c especificado en kg/cm²
- Encofrado y desencofrado: formaletas metálicas o de madera
- Friso (no "enlucido"): revestimiento de mortero sobre muros
- Pego (no "mortero de pega"): mezcla para adherencia
- Boquilla: relleno de juntas en cerámicas/porcelanatos
- Pañeteo: capa base de mortero previo al friso
- Arrocillo/Piedra picada: agregado grueso triturado
- Sabieta/Arena lavada: agregado fino
- Mezcladora trompo: equipo para mezcla de concreto

ñil: oficial/maestro de obra especializado
- Ayudante: peón de obra
- Vibradora de concreto: compactador mecánico
- Taladro percutor: rotomartillo
- Plomada, nivel de burbuja, escuadra: instrumentos de medición

=== REGLAS CRÍTICAS ===
1. PROHIBIDO valores en 0. Si un material/equipo/mano de obra no aplica, NO lo incluyas.
2. Precios USD mercado venezolano 2026 (referencias actualizadas):
   - Cemento gris 42.5kg: $8-10/saco
   - Bloques arcilla 10cm: $0.50-0.65/und | 15cm: $0.55-0.75/und
   - Arena lavada: $20-28/m3
   - Piedra picada 3/4": $22-35/m3
   - Cabillas 3/8" (6m): $4.50-6.50/varilla | 1/2": $7-10 | 5/8": $11-15 | 3/4": $18-24
   - Alambre amarre #18: $2.50-3.50/kg
   - Mezcladora trompo 1 saco: $3.50-5/hora
   - Vibradora concreto: $4-6/hora
   - Albañil maestro: $30-40/día (jornal 8hrs)
   - Ayudante: $18-25/día
   - Chofer camión: $35-45/día
   - Operador maquinaria: $40-55/día

3. CANTIDADES EXACTAS con 5-10% desperdicio en materiales (Ya incluido en cálculos).
4. RENDIMIENTO (rdto): unidades completadas por cuadrilla en 1 día laboral (8hrs).
5. FACTOR DE CARGA (fc_ar): Factor ajuste resistencia concreto (rango 210-350 kg/cm²).
6. DESCRIPCIÓN TÉCNICA COMPLETA: Debe incluir TODAS las actividades:
   - Para TANQUES/CISTERNAS:
     * Excavación/Movimiento tierras (m3 según profundidad)
     * Relleno compactado (material de préstamo o producto excavación)
     * Concreto pobre e=5-10cm (base nivelación)
     * Acero refuerzo cabillas (kg total calculado: losa fondo + muros + losa tapa)
     * Alambre amarre #18 (2-3% peso cabillas)
     * Encofrado/Formaletas muros (m2 área contacto)
     * Concreto estructural f'c=210-250kg/cm2 (m3 losa+muros+tapa)
     * Impermeabilizante interior (mortero impermeabilizado o membranas)
     * Brocal/Tapa acceso (concreto armado o prefabricada)
     * Tuberías: entrada, salida, rebose, ventilación (PVC 2"-4")
     * Válvulas/Accesorios hidráulicos
     * Compactación con vibradora
     * Curado concreto (mantún húmedo 7 días)
   - Para ESTRUCTURAS:
     * Replanteo y nivelación
     * Excavación zapatas/vigas fundación
     * Acero refuerzo (separado: zapatas, columnas, vigas, losas)
     * Encofrado (zapatas, columnas, vigas, losas)
     * Concreto (especificar f'c para cada elemento)
     * Desencofrado y limpieza

7. ESTRUCTURA JSON ESTRICTA (sin markdown ```json):
{
  "covenin": "Código COVENIN (Ej: E.531.01.02 para concreto, H.211 para excavación)",
  "unidad": "m2|m3|ml|kg|und|gln",
  "computo": [NÚMERO calculado según descripción usuario],
  "rdto": [Rendimiento numérico diario],
  "fc_ar": [Factor resistencia concreto 210-350, omitir si no aplica],
  "admn_imprvt": "15 / 5 / 10" (Admin 15%, Imprevistos 5%, Utilidad 10%),
  "descripcion": "TEXTO TÉCNICO EXHAUSTIVO con capacidad, dimensiones, procesos incluidos, materiales, acabados. Ejemplo: 'Construcción de tanque subterráneo de concreto armado f'c=210kg/cm² para agua potable. Capacidad: XXXX litros. Dimensiones interiores: LxAxH. Incluye: excavación manual/mecánica a profundidad XX m, relleno compactado con arena/granzón, solado concreto pobre e=10cm, acero refuerzo cabillas 3/8"-1/2" según diseño estructural, alambre amarre #18, encofrado metálico/madera muros y losa tapa, vaciado concreto f'c=210kg/cm² con vibradora, impermeabilización interior con mortero+aditivo hidrofúgo, brocal concreto armado, tapa acceso concreto e=10cm con asa, tuberías PVC: entrada 2", salida 2", rebose 2", ventilación 2", válvulas check, compuerta, curado húmedo 7 días. No incluye: sistema bombeo, instalaciones eléctricas exteriores.'",
  "materiales": [
    {"desc": "Cemento gris Portland tipo I (42.5kg)", "unid": "saco", "cant": XX.XX, "precio": 9.00, "parcial": [calculado]},
    {"desc": "Arena lavada", "unid": "m3", "cant": XX.XX, "precio": 25.00, "parcial": [calculado]},
    {"desc": "Piedra picada 3/4\"", "unid": "m3", "cant": XX.XX, "precio": 30.00, "parcial": [calculado]},
    {"desc": "Cabilla corrugada 3/8\" (6m)", "unid": "varilla", "cant": XX, "precio": 5.50, "parcial": [calculado]},
    {"desc": "Cabilla corrugada 1/2\" (6m)", "unid": "varilla", "cant": XX, "precio": 9.00, "parcial": [calculado]},
    {"desc": "Alambre negro amarre #18", "unid": "kg", "cant": XX.XX, "precio": 3.00, "parcial": [calculado]},
    {"desc": "Madera pino encofrado (tabla 1x6\")", "unid": "p2", "cant": XXX, "precio": 0.45, "parcial": [calculado]},
    {"desc": "Clavos acero 2\"-3\"", "unid": "kg", "cant": XX, "precio": 2.80, "parcial": [calculado]},
    {"desc": "Impermeabilizante acrílico (galón)", "unid": "gln", "cant": XX, "precio": 15.00, "parcial": [calculado]},
    {"desc": "Tubo PVC sanitario 2\" (6m)", "unid": "tubo", "cant": X, "precio": 8.00, "parcial": [calculado]},
    {"desc": "Codo PVC 90º 2\"", "unid": "und", "cant": X, "precio": 1.50, "parcial": [calculado]},
    {"desc": "Válvula compuerta bronce 2\"", "unid": "und", "cant": X, "precio": 25.00, "parcial": [calculado]}
  ],
  "equipos": [
    {"desc": "Mezcladora trompo 1 saco (P11)", "cant": XX.XX, "tarifa": 4.00, "parcial": [calculado]},
    {"desc": "Vibradora concreto (gasolina/eléctrica)", "cant": XX.XX, "tarifa": 5.00, "parcial": [calculado]},
    {"desc": "Herramientas menores (palas, picos, carretillas, nivel, plomada)", "cant": XX.XX, "tarifa": 8.00, "parcial": [calculado]}
  ],
  "mo": [
    {"cargo": "Albañil maestro de obra", "cant": XX.XX, "jornal": 35.00, "parcial": [calculado]},
    {"cargo": "Ayudante/peón", "cant": XX.XX, "jornal": 22.00, "parcial": [calculado]},
    {"cargo": "Cabo/Capataz (supervisión)", "cant": XX.XX, "jornal": 40.00, "parcial": [calculado]}
  ]
}

=== IMPORTANTE ===
- Calcula TODO: NO omitas materiales estructurales (cabillas, alambre, encofrado, concreto).
- Usa fórmulas ingeniería para volumetría:
  * Concreto tanque rectangular: Losa fondo + 4 muros + losa tapa
  * Volumen concreto (m3) = [(Largo x Ancho x espesor losa) + (perímetro x altura x espesor muro) + (Largo x Ancho x espesor tapa)]
  * Acero: usar 80-120 kg/m3 concreto como referencia (ajustar según criticidad estructura)
  * Encofrado: 2 x área muros (contacto ambas caras)
- JSON puro sin formato markdown.
- Devuelve SOLO el objeto JSON, nada más.`;
  
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: reinforcedPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8000 }
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
    return res.status(405).json({ error: 'Solo POST permitido' });
  }
  
  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Falta el campo "prompt"' });
  }
  if (!apiKey) {
    return res.status(500).json({ error: 'API key no configurada' });
  }
  
  const modelsToTry = workingModel ? [workingModel, ...MODEL_FALLBACK_LIST.filter(m => m !== workingModel)] : MODEL_FALLBACK_LIST;
  
  let lastError = null;
  for (const model of modelsToTry) {
    try {
      console.log(`Intentando modelo: ${model}`);
      const rawText = await callGemini(model, prompt, apiKey);
      
      if (!rawText) {
        throw new Error('Respuesta vacía del modelo');
      }
      
      // Limpiar markdown
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\\s*/i, '').replace(/```\\s*$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\\s*/, '').replace(/```\\s*$/, '');
      }
      
      const apu = JSON.parse(cleaned);
      const apuConCalculos = calcularParciales(apu);
      
      workingModel = model;
      console.log(`✓ Modelo exitoso: ${model}`);
          return res.status(200).json({ ok: true, data: apuConCalculos });
    } catch (err) {
      console.error(`✗ Error con ${model}:`, err.message);
      lastError = err;
      if (model === workingModel) {
        workingModel = null;
      }
    }
  }
  
  return res.status(500).json({ 
    error: 'Máximo reintentos alcanzado', 
    detalle: lastError?.message || 'Error desconocido' 
  });
}
