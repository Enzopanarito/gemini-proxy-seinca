const KEYS = ['logo', 'hero', 'render', 'planta', 'luces', 'techo', 'audio'];

const EXPECTED_TYPES = {
  logo: 'image/jpeg',
  hero: 'image/jpeg',
  render: 'image/jpeg',
  planta: 'image/jpeg',
  luces: 'image/jpeg',
  techo: 'image/jpeg',
  audio: 'audio/mpeg'
};

function signature(bytes) {
  return Buffer.from(bytes.slice(0, 12)).toString('hex');
}

function signatureMatches(key, hex) {
  if (key === 'audio') {
    return hex.startsWith('494433') || hex.startsWith('fffb') || hex.startsWith('fff3') || hex.startsWith('fff2');
  }
  return hex.startsWith('ffd8ff');
}

export default async function handler(req, res) {
  const requested = String(req.query.key || 'all');
  const keys = requested === 'all' ? KEYS : KEYS.includes(requested) ? [requested] : [];
  if (!keys.length) {
    res.status(400).json({ ok: false, error: 'Clave de recurso inválida' });
    return;
  }

  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers.host;

  const results = await Promise.all(keys.map(async key => {
    try {
      const url = `${protocol}://${host}/api/onix-media?key=${encodeURIComponent(key)}&v=18`;
      const response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const type = String(response.headers.get('content-type') || '').split(';')[0].trim();
      const hex = signature(bytes);
      const ok = response.status === 200 && bytes.length > 0 && type === EXPECTED_TYPES[key] && signatureMatches(key, hex);
      return {
        key,
        ok,
        status: response.status,
        contentType: type,
        contentLengthHeader: Number(response.headers.get('content-length') || 0),
        byteLength: bytes.length,
        signature: hex
      };
    } catch (error) {
      return { key, ok: false, error: String(error?.message || error) };
    }
  }));

  const ok = results.every(item => item.ok);
  res.setHeader('Cache-Control', 'no-store');
  res.status(ok ? 200 : 503).json({ ok, checkedAt: new Date().toISOString(), results });
}
