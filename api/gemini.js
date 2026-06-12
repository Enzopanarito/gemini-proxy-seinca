const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

Esquema exacto:
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
      console.log(`Intento ${attempt} de ${MAX_RETRIES}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
        throw new Error(`Status ${response.status} recuperable`);
      }

      if (!response.ok) {
        const errData = await response.json();
        return res.status(response.status).json({ ok: false, error: errData.error?.message || 'Error Gemini API' });
      }

      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(text);

      return res.status(200).json({ ok: true, data: parsed });

    } catch (error) {
      console.error(`Intento ${attempt} fallido:`, error.message);
      if (attempt >= MAX_RETRIES) {
        return res.status(500).json({ ok: false, error: `Maximo reintentos (${MAX_RETRIES}): ${error.message}` });
      }
      await wait(Math.pow(2, attempt) * 1000);
    }
  }
};
