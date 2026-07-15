const DOCUMENTS = {
  indice: { id: '1Bcj7V59afMCXICGGPwL-7vfmircg7f3-', filename: '00_Indice_de_Entrega_Documental.pdf' },
  dossier: { id: '1w5gyygDTzk_4NLO7gKRzvVk_lg--ipuZ', filename: '01_Dossier_Ejecutivo_SEINCA_Onix_512.pdf' },
  presupuesto: { id: '1AGFoyQOhE5-qc8Uz_vOlx5XnEPEaO2Ue', filename: '02_Presupuesto_APU_y_Computos_Metricos_SEINCA_Onix_512.pdf' },
  memoria: { id: '12T2Wz7Ji8JvsqgdtQJolPeBZvM0TxIFK', filename: '03_Memoria_Descriptiva_e_Informe_Tecnico_SEINCA_Onix_512.pdf' },
  computos: { id: '1gNANfC8OJhgb9gwvBEKRqKAvnWxrwOnQ', filename: '04_Anexo_Computos_Metricos_SEINCA_Onix_512.pdf' },
  acabados: { id: '1mkuniCmJhhVjpB3s2wBhF1aIcy9hNASj', filename: '05_Ficha_Seleccion_y_Aprobacion_de_Acabados.pdf' },
  acta: { id: '1ptAIFm4U6U3ajVgY8edcyrVPJiEttbSU', filename: '06_Acta_de_Aceptacion_Propuesta_SEINCA_Onix_512.pdf' },
  presentacion: { id: '1d0Uk9tBzM96bXZov34C0fb0T2ifhC6c-', filename: 'P00_Presentacion_Proyecto_Onix_512.pdf' },
  planta: { id: '1keFABVLuOirLPQ_OXh63wq8vA9aRlIpe', filename: 'P01_Planta_General_Onix_512_SEINCA.pdf' },
  techo: { id: '1Wb641QTvAFNAn67vuOceSdZeS2q7Odhw', filename: 'P02_Planta_Techo_Onix_512_SEINCA.pdf' },
  luminarias: { id: '18Sn0W2JUKofsbC3U0FrNA5zO1dCZhT-j', filename: 'P03_Replanteo_Piso_Luminarias_Onix_512_SEINCA.pdf' },
  cortes: { id: '1KMU8AzvL7rh-oYFj30uBoAcKNcksLjTq', filename: 'P04_Cortes_AA_BB_Onix_512_SEINCA.pdf' },
  revestimientos: { id: '1tuKJBKQYZnNdIGJNdVPH7gHaP_X5F6-F', filename: 'P05_Revestimientos_Onix_512_SEINCA.pdf' }
};

function setCommonHeaders(res) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

function isPdf(bytes) {
  return bytes.length > 4 && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
}

async function downloadPdf(id) {
  const sources = [
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}&confirm=t`,
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`
  ];
  const failures = [];
  for (const source of sources) {
    try {
      const upstream = await fetch(source, { redirect: 'follow', cache: 'no-store', headers: { 'User-Agent': 'SEINCA-ONIX-Document-Service/1.1' } });
      if (!upstream.ok) { failures.push(`HTTP ${upstream.status}`); continue; }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (isPdf(bytes)) return bytes;
      failures.push(`contenido ${upstream.headers.get('content-type') || 'desconocido'}`);
    } catch (error) {
      failures.push(String(error?.message || error));
    }
  }
  throw new Error(`No se recibió un PDF válido: ${failures.join(' | ')}`);
}

export default async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  const key = String(req.query.key || '').toLowerCase();
  const document = DOCUMENTS[key];
  if (!document) return res.status(404).json({ error: 'Documento no encontrado' });
  try {
    const bytes = await downloadPdf(document.id);
    const download = String(req.query.download || '') === '1';
    setCommonHeaders(res);
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${document.filename}"`);
    if (req.method === 'HEAD') { res.setHeader('Content-Length', String(bytes.length)); return res.status(200).end(); }
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) { res.status(416).setHeader('Content-Range', `bytes */${bytes.length}`).end(); return; }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : bytes.length - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= bytes.length) { res.status(416).setHeader('Content-Range', `bytes */${bytes.length}`).end(); return; }
      const boundedEnd = Math.min(end, bytes.length - 1);
      const chunk = bytes.subarray(start, boundedEnd + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${boundedEnd}/${bytes.length}`);
      res.setHeader('Content-Length', String(chunk.length));
      res.end(chunk);
      return;
    }
    res.setHeader('Content-Length', String(bytes.length));
    return res.status(200).end(bytes);
  } catch (error) {
    console.error('ONIX_DOCUMENT_PROXY_ERROR', key, error);
    return res.status(502).json({ error: 'No fue posible cargar el documento solicitado' });
  }
}
