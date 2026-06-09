export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    // Prompt reforzado con tabla de referencia de precios
    // Prompt MAESTRO nivel ingeniería profesional internacional
    const reinforcedPrompt = `Actúa como Ingeniero Civil Senior y Consultor Internacional en Ingeniería de Costos, especializado en el mercado venezolano y normas COVENIN.
Tu objetivo: Generar un Análisis de Precios Unitarios (APU) profesional para: "${prompt}".

REGLAS DE CÁLCULO OBLIGATORIAS:
1. CALCULA TODO: Realiza cálculos matemáticos precisos de áreas, volúmenes, rendimientos y cantidades.
2. APLICA FACTORES DE DESPERDICIO: Añade 5-10% de desperdicio a materiales según el tipo.
3. USA RENDIMIENTOS REALES: Basa los cálculos en cuadrillas tipo (ej: 1 albañil + 1 ayudante).
4. PRECIOS DE MERCADO VENEZOLANO (USD): 
   - Materiales: Bloque arcilla 0.45-0.60 USD, Cemento 8-10 USD/saco, Arena 20-30 USD/m³, Cabilla #3 2.80 USD/unidad
   - Equipos: Mezcladora 20-40 USD/día, Vibrador 15-25 USD/día, Andamios 3-5 USD/día
   - Mano de Obra: Albañil especializado 30-40 USD/día, Albañil 25-35 USD/día, Ayudante 15-25 USD/día
5. CERO TOLERANCIA A VALORES NULOS: PROHIBIDO generar valores en 0. Si no conoces un precio exacto, estima un valor de mercado lógico fundamentado.
6. CANTIDADES PRECISAS: Calcula cantidades exactas basándote en la descripción de la obra y rendimientos estándar.
7. FORMATO JSON ESTRICTO: Respeta el esquema solicitado completamente.
`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: reinforcedPrompt }] }],
        generationConfig: {
          temperature: 00.27,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              covenin: { type: "string" },
              unidad: { type: "string" },
              cantidad: { type: "number" },
              descripcion_tecnica: { type: "string" },
              materiales: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    descripcion: { type: "string" },
                    unidad: { type: "string" },
                    cantidad: { type: "number" },
                    precio: { type: "number" }
                  }
                }
              },
              equipos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    descripcion: { type: "string" },
                    cantidad: { type: "number" },
                    tarifa: { type: "number" }
                  }
                }
              },
              mo: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    cargo: { type: "string" },
                    cantidad: { type: "number" },
                    jornal: { type: "number" }
                  }
                }
              }
            },
            required: ["covenin", "unidad", "cantidad", "descripcion_tecnica", "materiales", "equipos", "mo"]
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Error al conectar con Gemini');
    }

    const text = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ ok: true, data: JSON.parse(text) });

  } catch (error) {
    console.error('Error en proxy:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
