const ASSETS = {
  page: { id: '1PxxsHvJxWJFkstVh5xIlZwMmHDaVFLvs', type: 'text/html; charset=utf-8', cache: 'no-store' },
  css: { id: '1j0YwqX13NMI_GJwkLy0vfk_jWU6J3Q0b', type: 'text/css; charset=utf-8', cache: 'public, max-age=3600, s-maxage=3600' },
  js: { id: '1AAM4yzqlGVPqfgAB9aciFXz651RPmept', type: 'text/javascript; charset=utf-8', cache: 'public, max-age=3600, s-maxage=3600' }
};

export default async function handler(req, res) {
  const key = String(req.query.key || 'page');
  const asset = ASSETS[key];

  if (!asset) {
    res.status(404).json({ error: 'Recurso V21 no encontrado' });
    return;
  }

  try {
    const source = `https://drive.google.com/uc?export=download&id=${asset.id}`;
    const upstream = await fetch(source, { redirect: 'follow', cache: 'no-store' });
    if (!upstream.ok) throw new Error(`Drive respondió ${upstream.status}`);

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length) throw new Error('Archivo vacío');

    res.setHeader('Content-Type', asset.type);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', asset.cache);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(bytes);
  } catch (error) {
    console.error('ONIX_V21_PROXY_ERROR', key, error);
    res.status(502).json({ error: 'No fue posible cargar la presentación V21' });
  }
}
