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

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiBody = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || data.error?.status || JSON.stringify(data.error) || 'Gemini API error';
      return res.status(response.status).json({ error: errMsg });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data);
        // Parse JSON from Gemini response
        let parsedData;
        try {
                // Remove markdown code blocks if present
                const cleanText = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
                parsedData = JSON.parse(cleanText);
              } catch (parseError) {
                return res.status(500).json({ error: 'Failed to parse JSON from Gemini: ' + text });
              }
    
    return res.status(200).json({  ok: true, data: parsedData });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
