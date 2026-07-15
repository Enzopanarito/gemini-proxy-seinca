const PAGE = {
  id: '1Nq6Ox7xNiX-6E5P2RFlW8L29D8zlPNTQ',
  type: 'text/html; charset=utf-8'
};

export default async function handler(req, res) {
  try {
    const source = `https://drive.google.com/uc?export=download&id=${PAGE.id}&v=211`;
    const upstream = await fetch(source, { redirect: 'follow', cache: 'no-store' });
    if (!upstream.ok) throw new Error(`Drive respondió ${upstream.status}`);

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length) throw new Error('Archivo vacío');

    res.setHeader('Content-Type', PAGE.type);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(bytes);
  } catch (error) {
    console.error('ONIX_V21_PAGE_ERROR', error);
    res.status(502).json({ error: 'No fue posible cargar la presentación V21.1' });
  }
}
