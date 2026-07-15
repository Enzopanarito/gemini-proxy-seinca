const SCRIPT = `
ONIX quinientos doce es un proyecto desarrollado especialmente para la Familia Rivas, concebido a partir de sus necesidades, su estilo de vida y la visión que desean convertir en realidad.

La propuesta integra diseño, ingeniería, presupuesto, análisis de precios unitarios, cómputos métricos, planos y criterios de acabados dentro de una sola solución preparada para ejecutarse.

Antes de construir, el expediente define cuarenta y ocho partidas, cantidades, costos, procura, logística, coordinación técnica y un plazo estimado de diez a doce semanas.

De esta manera, la Familia Rivas no tiene que ocuparse de compras, proveedores, cuadrillas, improvisaciones ni del seguimiento operativo diario de la obra.

Séinca asume la planificación, la procura, la supervisión, el control de calidad, la coordinación de especialidades y la responsabilidad integral de la ejecución.

ONIX quinientos doce representa una inversión total de cuarenta y cinco mil novecientos diecisiete dólares con ocho centavos, IVA incluido. La Familia Rivas aprueba. Séinca coordina, ejecuta y responde, con control técnico, entrega formal y garantía de ejecución.
`.trim();

const INSTRUCTIONS = `Habla en español latino neutro con una voz cálida, humana, elegante y corporativa. Mantén un ritmo pausado pero dinámico, con dicción clara, respiraciones naturales y pausas breves entre párrafos. No uses tono de locutor radial exagerado ni tono robótico. Pronuncia la marca SEINCA exactamente como “SÉIN-ca”: una sola palabra, con énfasis en la primera sílaba. No la deletrees y no digas “se-ín-ca”. Pronuncia “Familia Rivas” con claridad y énfasis respetuoso.`;

function commonHeaders(res) {
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable');
  res.setHeader('X-SEINCA-Voice', 'AI-generated');
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Narración temporalmente no disponible' });

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: 'marin',
        input: SCRIPT,
        instructions: INSTRUCTIONS,
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI TTS respondió ${response.status}: ${detail.slice(0, 300)}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error('La narración llegó vacía');

    commonHeaders(res);
    res.setHeader('Content-Length', String(bytes.length));
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).end(bytes);
  } catch (error) {
    console.error('ONIX_VOICE_ERROR', error);
    return res.status(502).json({ error: 'No fue posible generar la narración empresarial' });
  }
}
