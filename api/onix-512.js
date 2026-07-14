const SOURCE_URL = 'https://drive.google.com/uc?export=download&id=11AoBHcqXFeZXt9YYp7L6AD3YZF8fLUNu&confirm=t&v=20260714164645';
const RELEASE = 'ONIX-V13-CDN-SELF-CONTAINED-20260714';
const EXPECTED_SOURCE = 'ONIX-V12-VERCEL-IMPORT-SELF-CONTAINED-20260714';

function externalizeInlineResources(source) {
  let html = source
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');

  const headAssets = [
    '<link rel="stylesheet" href="/onix-512/style.css?v=20260714">',
    `<meta name="seinca-cdn-release" content="${RELEASE}">`
  ].join('');

  const bodyAssets = '<script src="/onix-512/portal.js?v=20260714" defer></script>';
  html = html.replace(/<\/head>/i, `${headAssets}</head>`);
  html = html.replace(/<\/body>/i, `${bodyAssets}</body>`);
  return html;
}

export default async function handler(req, res) {
  try {
    const upstream = await fetch(SOURCE_URL, {
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'SEINCA-Onix-Portal/13.0'
      }
    });

    if (!upstream.ok) throw new Error(`Fuente HTTP ${upstream.status}`);
    const source = await upstream.text();
    if (!source.includes(EXPECTED_SOURCE)) throw new Error('La fuente no corresponde a la revisión aprobada');

    const html = externalizeInlineResources(source);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
    res.setHeader('X-SEINCA-Release', RELEASE);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).send(html);
  } catch (error) {
    console.error('ONIX_512_PORTAL_ERROR', error);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send('<!doctype html><meta charset="utf-8"><title>SEINCA | Onix 512</title><main><h1>Presentación temporalmente no disponible</h1><p>Utilice el respaldo offline de la entrega Onix 512.</p></main>');
  }
}
