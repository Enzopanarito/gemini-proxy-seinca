// Función auxiliar para esperas (backoff)
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
  // SIEMPRE respuesta JSON
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'API key not configured' });
  }
  
  if (!prompt) {
    return res.status(400).json({ ok: false, error: 'Missing prompt' });
  }

  // Sistema de REINTENTOS con backoff exponencial
  const MAX_RETRIES = 3;
  let attempt = 0;

  // Prompt MAESTRO nivel ingeniería profesional
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

  // BUCLE DE REINTENTOS
  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      console.log(`Intento ${attempt} de ${MAX_RETRIES}`);
      
      // AbortController para timeout de 20 segundos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: reinforcedPrompt }] }],
            generationConfig: {
              temperature: 0.2, // Determinista para cálculos
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
            },
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
          })
        }
      );

      clearTimeout(timeoutId);

      // Manejar errores recuperables (429, 500+)
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Status ${response.status}: Rate limit o error de servidor - RECUPERABLE`);
      }

      // Error no recuperable
      if (!response.ok) {
        const errorData = await response.json();
        return res.status(response.status).json({ 
          ok: false, 
          error: errorData.error?.message || 'Error en API de Gemini' 
        });
      }

      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      
      // ÉXITO: Devolver datos
      return res.status(200).json({ ok: true, data: JSON.parse(text) });

    } catch (error) {
      console.error(`Intento ${attempt} fallido:`, error.message);
      
      // Si llegamos al máximo de reintentos, fallar
      if (attempt >= MAX_RETRIES) {
        return res.status(500).json({ 
          ok: false, 
          error: `Máximo de reintentos alcanzado (${MAX_RETRIES}): ${error.message}` 
        });
      }
      
      // Backoff exponencial: 2s, 4s, 8s
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`Esperando ${waitTime}ms antes del siguiente intento...`);
      await wait(waitTime);
    }
  }
}
