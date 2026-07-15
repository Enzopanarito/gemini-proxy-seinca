const MEDIA = {
  logo: { id: '1e1czm5osM-c_tFblB8QCbKG1rkyufA_j', type: 'image/jpeg' },
  hero: { id: '1_8vdhSzANaG4cWXiYMmSblDuKrhG-pi9', type: 'image/jpeg' },
  render: { id: '1b4Sgq2BJMWzEdN3Cm7MReUu0YizwdV00', type: 'image/jpeg' },
  planta: { id: '1Sl9I4VflEnWoIpGoaVhVCbZSHHOvsI0s', type: 'image/jpeg' },
  luces: { id: '1JsEuHkLszeQ_9yUEbwu6DQQvOQlrvT5L', type: 'image/jpeg' },
  techo: { id: '1K74S40jEMayDBdMDFugRDC900XsRN1Rl', type: 'image/jpeg' },
  audio: { id: '1np9TxbBn41q81tJhX-LCAoc3BHyZ-ymZ', type: 'audio/mpeg' }
};

export default async function handler(req, res) {
  const key = String(req.query.key || '');
  const media = MEDIA[key];
  if (!media) {
    res.status(404).json({ error: 'Media no encontrado' });
    return;
  }

  try {
    const source = `https://drive.google.com/uc?export=download&id=${media.id}`;
    const upstream = await fetch(source, { redirect: 'follow' });
    if (!upstream.ok) {
      throw new Error(`Drive respondió ${upstream.status}`);
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length) {
      throw new Error('Archivo vacío');
    }

    res.setHeader('Content-Type', media.type);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(bytes);
  } catch (error) {
    console.error('ONIX_MEDIA_PROXY_ERROR', key, error);
    res.status(502).json({ error: 'No fue posible cargar el recurso solicitado' });
  }
}
