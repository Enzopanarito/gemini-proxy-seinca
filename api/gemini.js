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

    // Endpoint actualizado a gemini-2.5-flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              covenin: { type: "string" },
              unidad: { type: "string" },
              cantidad: { type: "number" },
              descripcion_tecnica: { type: "string" },
              materiales: { type: "array", items: { type: "object", properties: { descripcion: { type: "string" }, unidad: { type: "string" }, cantidad: { type: "number" }, precio: { type: "number" } } } },
              equipos: { type: "array", items: { type: "object", properties: { descripcion: { type: "string" }, cantidad: { type: "number" }, tarifa: { type: "number" } } } },
              mo: { type: "array", items: { type: "object", properties: { cargo: { type: "string" }, cantidad: { type: "number" }, jornal: { type: "number" } } } }
            },
            required: ["covenin", "unidad", "cantidad", "descripcion_tecnica", "materiales", "equipos", "mo"]
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Error en la API de Google');

    const text = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ ok: true, data: JSON.parse(text) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
