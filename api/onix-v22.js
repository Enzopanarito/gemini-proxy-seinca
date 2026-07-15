const PAGE = {
  id: '1Nq6Ox7xNiX-6E5P2RFlW8L29D8zlPNTQ',
  type: 'text/html; charset=utf-8'
};

const HEADER_LOGO_FIX = `<style id="onix-header-logo-only-fix-runtime">
/* ÚNICO AJUSTE: mantener el logo del encabezado dentro de la barra */
.topbar{overflow:hidden}
.topbar .brand{height:86px;overflow:hidden}
.topbar .brand img[data-logo]{width:118px;max-width:118px;height:auto;flex:0 0 118px}
</style>`;

export default async function handler(req, res) {
  try {
    const source = `https://drive.google.com/uc?export=download&id=${PAGE.id}&v=23`;
    const upstream = await fetch(source, { redirect: 'follow', cache: 'no-store' });
    if (!upstream.ok) throw new Error(`Drive respondió ${upstream.status}`);

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length) throw new Error('Archivo vacío');

    const html = bytes.toString('utf8');
    const correctedHtml = html.includes('onix-header-logo-only-fix-runtime')
      ? html
      : html.replace('</head>', `${HEADER_LOGO_FIX}</head>`);
    const output = Buffer.from(correctedHtml, 'utf8');

    res.setHeader('Content-Type', PAGE.type);
    res.setHeader('Content-Length', String(output.length));
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-SEINCA-Build', 'ONIX-V22.2-NEURAL-PDF');
    res.status(200).send(output);
  } catch (error) {
    console.error('ONIX_V22_PAGE_ERROR', error);
    res.status(502).json({ error: 'No fue posible cargar el portal empresarial ONIX 512' });
  }
}