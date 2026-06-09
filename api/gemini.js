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
    const reinforcedPrompt = `Actúa como Ingeniero Civil experto en costos en Venezuela.
Analiza la siguiente obra: "${prompt}".

TABLA DE REFERENCIA DE COSTOS (USA ESTOS RANGOS):
- Materiales: Bloque arcilla (0.45-0.60 USD), Cemento (8-10 USD/saco), Arena (20-30 USD/m3).
- Equipos: Mezcladora (20-40 USD/día), Vibrador (15-25 USD/día).
- Mano de Obra: Albañil (25-40 USD/día), Ayudante (15-25 USD/día).

INSTRUCCIONES CRÍTICAS:
1. NO USES VALORES EN 0. Debes elegir un valor dentro de los rangos anteriores.
2. Si un insumo no está en la tabla, estima un valor de mercado realista en USD.
3. El resultado debe ser un JSON estricto que cumpla con el esquema definido.
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: reinforcedPrompt }] }],
        generationConfig: {
          temperature: 0.7,
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
