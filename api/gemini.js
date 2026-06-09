import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
model: "gemini-1.5-atest",      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            covenin: { type: "string" },
            unidad: { type: "string" },
            cantidad: { type: "number" },
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
          required: ["covenin", "unidad", "cantidad", "materiales", "equipos", "mo"]
        }
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const parsedData = JSON.parse(text);
    return res.status(200).json({ ok: true, data: parsedData });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
