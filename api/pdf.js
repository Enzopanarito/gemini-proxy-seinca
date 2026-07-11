import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  APP_VERSION,
  calculateApu,
  migrateProject,
  normalizeConfig,
  number,
  stableHash,
  text,
  validateApu
} from '../lib/apu-core.js';

const PAGE = { width: 612, height: 792, margin: 42 };
const COLOR = {
  primary: rgb(0.56, 0.09, 0.13),
  dark: rgb(0.09, 0.13, 0.20),
  light: rgb(0.95, 0.96, 0.98),
  border: rgb(0.58, 0.61, 0.66),
  white: rgb(1, 1, 1),
  muted: rgb(0.32, 0.36, 0.42)
};

function formatNumber(value, digits = 2) {
  return number(value).toLocaleString('es-VE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function money(value, currency) {
  return `${currency} ${formatNumber(value)}`;
}

function safeFilename(value) {
  return text(value || 'presupuesto', 120).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'presupuesto';
}

function wrap(value, font, size, width) {
  const paragraphs = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').split(/\n+/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) current = next;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    lines.push(current || '');
  }
  return lines.length ? lines : [''];
}

function parseLogo(value) {
  const match = String(value || '').match(/^data:(image\/(?:png|jpeg));base64,(.+)$/i);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), bytes: Buffer.from(match[2], 'base64') };
}

async function embedLogo(pdf, value) {
  const parsed = parseLogo(value);
  if (!parsed) return null;
  try {
    return parsed.mime === 'image/png' ? await pdf.embedPng(parsed.bytes) : await pdf.embedJpg(parsed.bytes);
  } catch {
    return null;
  }
}

function normalizeItem(item, config) {
  const apu = item.apuData || item.apu || item;
  return {
    id: item.id || stableHash(apu),
    status: item.status === 'APROBADO' ? 'APROBADO' : 'BORRADOR',
    technicalReview: Boolean(item.technicalReview),
    aiMeta: item.aiMeta || null,
    apu,
    calculation: calculateApu(apu, config),
    validation: validateApu(apu, config, { stage: item.status === 'APROBADO' ? 'approve' : 'draft' })
  };
}

function drawHeader(page, fonts, logo, title, subtitle) {
  const top = PAGE.height - PAGE.margin;
  if (logo) {
    const scale = Math.min(125 / logo.width, 44 / logo.height);
    page.drawImage(logo, {
      x: PAGE.margin,
      y: top - logo.height * scale,
      width: logo.width * scale,
      height: logo.height * scale
    });
  } else {
    page.drawText('SEINCA', { x: PAGE.margin, y: top - 22, size: 21, font: fonts.bold, color: COLOR.primary });
  }
  page.drawText('SERVICIOS INTEGRALES', { x: PAGE.width - PAGE.margin - 145, y: top - 12, size: 8, font: fonts.bold, color: COLOR.dark });
  page.drawText('RIF: J-297575472', { x: PAGE.width - PAGE.margin - 145, y: top - 26, size: 8, font: fonts.regular, color: COLOR.dark });
  page.drawLine({ start: { x: PAGE.margin, y: top - 53 }, end: { x: PAGE.width - PAGE.margin, y: top - 53 }, thickness: 2.5, color: COLOR.primary });
  page.drawText(title, { x: PAGE.margin, y: top - 79, size: 14, font: fonts.bold, color: COLOR.dark });
  if (subtitle) page.drawText(subtitle, { x: PAGE.margin, y: top - 94, size: 7.5, font: fonts.regular, color: COLOR.muted });
  return top - 110;
}

function drawFooter(page, fonts, pageNumber, documentHash) {
  page.drawLine({ start: { x: PAGE.margin, y: 30 }, end: { x: PAGE.width - PAGE.margin, y: 30 }, thickness: 0.5, color: COLOR.border });
  page.drawText(`SEINCA ${APP_VERSION} · Documento generado digitalmente`, { x: PAGE.margin, y: 17, size: 6.5, font: fonts.regular, color: COLOR.muted });
  const right = `${documentHash} · Página ${pageNumber}`;
  page.drawText(right, { x: PAGE.width - PAGE.margin - fonts.regular.widthOfTextAtSize(right, 6.5), y: 17, size: 6.5, font: fonts.regular, color: COLOR.muted });
}

function drawInfoCell(page, fonts, x, y, width, label, value) {
  page.drawRectangle({ x, y: y - 23, width, height: 23, borderWidth: 0.5, borderColor: COLOR.border });
  page.drawText(label, { x: x + 4, y: y - 8, size: 6.5, font: fonts.bold, color: COLOR.muted });
  const line = wrap(value, fonts.regular, 8, width - 8)[0] || '';
  page.drawText(line, { x: x + 4, y: y - 18, size: 8, font: fonts.regular, color: COLOR.dark });
}

function drawTableHeader(page, fonts, y, columns) {
  let x = PAGE.margin;
  for (const column of columns) {
    page.drawRectangle({ x, y: y - 20, width: column.width, height: 20, color: COLOR.dark, borderWidth: 0.4, borderColor: COLOR.white });
    page.drawText(column.label, { x: x + 3, y: y - 13, size: 6.6, font: fonts.bold, color: COLOR.white });
    x += column.width;
  }
  return y - 20;
}

function drawTableRow(page, fonts, y, columns, values, options = {}) {
  const fontSize = options.fontSize || 7;
  const lineHeight = options.lineHeight || 9;
  const wrapped = columns.map((column, index) => wrap(values[index] ?? '', fonts.regular, fontSize, column.width - 6));
  const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
  const height = Math.max(18, lineCount * lineHeight + 6);
  let x = PAGE.margin;
  columns.forEach((column, index) => {
    page.drawRectangle({ x, y: y - height, width: column.width, height, color: options.fill || COLOR.white, borderWidth: 0.35, borderColor: COLOR.border });
    wrapped[index].forEach((line, lineIndex) => {
      let textX = x + 3;
      if (column.align === 'right') textX = x + column.width - 3 - fonts.regular.widthOfTextAtSize(line, fontSize);
      if (column.align === 'center') textX = x + (column.width - fonts.regular.widthOfTextAtSize(line, fontSize)) / 2;
      page.drawText(line, { x: textX, y: y - 12 - lineIndex * lineHeight, size: fontSize, font: fonts.regular, color: COLOR.dark });
    });
    x += column.width;
  });
  return y - height;
}

function drawSectionTitle(page, fonts, y, title) {
  page.drawRectangle({ x: PAGE.margin, y: y - 18, width: PAGE.width - PAGE.margin * 2, height: 18, color: COLOR.light });
  page.drawText(title, { x: PAGE.margin + 5, y: y - 12, size: 8, font: fonts.bold, color: COLOR.primary });
  return y - 24;
}

function drawParagraph(page, fonts, y, value, maxLines = 12) {
  const lines = wrap(value, fonts.regular, 7.3, PAGE.width - PAGE.margin * 2).slice(0, maxLines);
  lines.forEach((line, index) => page.drawText(line, { x: PAGE.margin, y: y - index * 9, size: 7.3, font: fonts.regular, color: COLOR.dark }));
  return y - Math.max(12, lines.length * 9);
}

function resourceRows(item, type) {
  const apu = item.apu;
  const rendimiento = Math.max(0.000001, number(apu.rendimiento, 1));
  const rows = type === 'materiales' ? apu.materiales || [] : type === 'equipos' ? apu.equipos || [] : apu.mo || [];
  return rows.map((row) => {
    const description = type === 'mo' ? row.cargo : row.desc;
    const unit = type === 'materiales' ? row.und : 'día';
    const price = type === 'materiales' ? row.precio : type === 'equipos' ? row.tarifa : row.jornal;
    let partial = number(row.cant) * number(price);
    if (type !== 'materiales') partial /= rendimiento;
    if (type === 'mo') partial *= 1 + number(apu.fcas) / 100;
    return [description, unit, formatNumber(row.cant, 4), money(price, item.calculation.config.currency), row.fuente_precio || '', row.fecha_precio || '', money(partial, item.calculation.config.currency)];
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-SEINCA-Version', APP_VERSION);
  try {
    const project = migrateProject(req.body?.project || req.body);
    const config = normalizeConfig(project.config || {});
    const items = (project.items || []).slice(0, 300).map((item) => normalizeItem(item, config));
    if (!items.length) return res.status(400).json({ ok: false, error: 'El proyecto no contiene partidas.' });

    const pdf = await PDFDocument.create();
    pdf.setTitle(`Presupuesto ${project.general?.obra || 'SEINCA'}`);
    pdf.setAuthor('SEINCA');
    pdf.setCreator(`SEINCA ${APP_VERSION}`);
    pdf.setProducer('SEINCA Enterprise PDF Engine');
    pdf.setCreationDate(new Date());
    const fonts = {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold)
    };
    const logo = await embedLogo(pdf, project.logo);
    const documentHash = stableHash({ general: project.general, config, items: items.map((item) => item.apu) });
    let pageNumber = 0;

    const addPage = (title, subtitle = '') => {
      const page = pdf.addPage([PAGE.width, PAGE.height]);
      pageNumber += 1;
      const y = drawHeader(page, fonts, logo, title, subtitle);
      drawFooter(page, fonts, pageNumber, documentHash);
      return { page, y };
    };

    let { page, y } = addPage('PRESUPUESTO GENERAL DE OBRA', `Código ${project.general?.code || 'S/C'} · Revisión ${project.general?.revision || '0'} · Estado ${project.general?.status || 'BORRADOR'}`);
    const half = (PAGE.width - PAGE.margin * 2) / 2;
    drawInfoCell(page, fonts, PAGE.margin, y, half, 'OBRA', project.general?.obra || '');
    drawInfoCell(page, fonts, PAGE.margin + half, y, half, 'CONTRATANTE', project.general?.cliente || '');
    y -= 23;
    drawInfoCell(page, fonts, PAGE.margin, y, half, 'UBICACIÓN', project.general?.ubicacion || '');
    drawInfoCell(page, fonts, PAGE.margin + half, y, half, 'FECHA / VALIDEZ', `${project.general?.fecha || ''} / ${project.general?.validityDays || 15} días`);
    y -= 34;

    const budgetColumns = [
      { label: 'N°', width: 25, align: 'center' },
      { label: 'COVENIN', width: 60, align: 'center' },
      { label: 'DESCRIPCIÓN', width: 245 },
      { label: 'UND.', width: 38, align: 'center' },
      { label: 'CANT.', width: 50, align: 'right' },
      { label: 'P. UNIT.', width: 70, align: 'right' },
      { label: 'TOTAL', width: 70, align: 'right' }
    ];
    y = drawTableHeader(page, fonts, y, budgetColumns);
    let subtotal = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      subtotal += item.calculation.subtotal;
      const descriptionLines = wrap(item.apu.descripcion_tecnica, fonts.regular, 7, budgetColumns[2].width - 6);
      const estimatedHeight = Math.max(18, descriptionLines.length * 9 + 6);
      if (y - estimatedHeight < 80) {
        ({ page, y } = addPage('PRESUPUESTO GENERAL DE OBRA · CONTINUACIÓN', `Código ${project.general?.code || 'S/C'} · ${items.length} partidas`));
        y = drawTableHeader(page, fonts, y, budgetColumns);
      }
      y = drawTableRow(page, fonts, y, budgetColumns, [
        index + 1,
        item.apu.covenin,
        `${item.status === 'APROBADO' ? '' : '[BORRADOR] '}${item.apu.descripcion_tecnica}`,
        item.apu.unidad,
        formatNumber(item.apu.cantidad, 4),
        money(item.calculation.unitContract, config.currency),
        money(item.calculation.subtotal, config.currency)
      ]);
    }
    if (y < 130) ({ page, y } = addPage('RESUMEN ECONÓMICO', documentHash));
    const tax = subtotal * config.taxPct / 100;
    const summaryColumns = [{ label: 'CONCEPTO', width: 390 }, { label: 'MONTO', width: 138, align: 'right' }];
    y -= 12;
    y = drawTableHeader(page, fonts, y, summaryColumns);
    y = drawTableRow(page, fonts, y, summaryColumns, ['SUBTOTAL', money(subtotal, config.currency)]);
    y = drawTableRow(page, fonts, y, summaryColumns, [`IMPUESTO ${formatNumber(config.taxPct)}%`, money(tax, config.currency)]);
    y = drawTableRow(page, fonts, y, summaryColumns, ['TOTAL GENERAL', money(subtotal + tax, config.currency)], { fill: COLOR.light });
    y -= 36;
    page.drawLine({ start: { x: PAGE.margin + 30, y }, end: { x: PAGE.margin + 230, y }, thickness: 0.7, color: COLOR.dark });
    page.drawLine({ start: { x: PAGE.width - PAGE.margin - 230, y }, end: { x: PAGE.width - PAGE.margin - 30, y }, thickness: 0.7, color: COLOR.dark });
    page.drawText('Ing. Jesús Fandiño', { x: PAGE.margin + 85, y: y - 13, size: 8, font: fonts.bold, color: COLOR.dark });
    page.drawText('Ingeniero Civil responsable del presupuesto · SEINCA', { x: PAGE.margin + 35, y: y - 25, size: 6.5, font: fonts.regular, color: COLOR.dark });
    page.drawText('Aprobado por · Ente contratante', { x: PAGE.width - PAGE.margin - 185, y: y - 18, size: 7, font: fonts.regular, color: COLOR.dark });

    const resourceColumns = [
      { label: 'DESCRIPCIÓN', width: 150 },
      { label: 'UND.', width: 32, align: 'center' },
      { label: 'CANT.', width: 42, align: 'right' },
      { label: 'PRECIO', width: 66, align: 'right' },
      { label: 'FUENTE', width: 118 },
      { label: 'FECHA', width: 52, align: 'center' },
      { label: 'PARCIAL', width: 68, align: 'right' }
    ];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      ({ page, y } = addPage(`ANÁLISIS DE PRECIO UNITARIO · PARTIDA ${index + 1}`, `${item.status} · Calidad ${item.validation.score}/100 · ${item.aiMeta?.modelo || 'Elaboración manual'}`));
      const quarter = (PAGE.width - PAGE.margin * 2) / 4;
      drawInfoCell(page, fonts, PAGE.margin, y, quarter, 'COVENIN', item.apu.covenin);
      drawInfoCell(page, fonts, PAGE.margin + quarter, y, quarter, 'UNIDAD', item.apu.unidad);
      drawInfoCell(page, fonts, PAGE.margin + quarter * 2, y, quarter, 'CANTIDAD', formatNumber(item.apu.cantidad, 4));
      drawInfoCell(page, fonts, PAGE.margin + quarter * 3, y, quarter, 'RENDIMIENTO', `${formatNumber(item.apu.rendimiento, 4)}/día`);
      y -= 31;
      y = drawSectionTitle(page, fonts, y, 'DESCRIPCIÓN TÉCNICA');
      y = drawParagraph(page, fonts, y, item.apu.descripcion_tecnica, 8) - 5;

      for (const [title, type] of [['MATERIALES POR UNIDAD', 'materiales'], ['EQUIPOS DE CUADRILLA', 'equipos'], ['MANO DE OBRA', 'mo']]) {
        const rows = resourceRows(item, type);
        if (!rows.length) continue;
        if (y < 150) ({ page, y } = addPage(`APU PARTIDA ${index + 1} · CONTINUACIÓN`, title));
        y = drawSectionTitle(page, fonts, y, title);
        y = drawTableHeader(page, fonts, y, resourceColumns);
        for (const row of rows) {
          const estimated = Math.max(18, wrap(row[0], fonts.regular, 6.5, resourceColumns[0].width - 6).length * 8 + 6);
          if (y - estimated < 55) {
            ({ page, y } = addPage(`APU PARTIDA ${index + 1} · CONTINUACIÓN`, title));
            y = drawTableHeader(page, fonts, y, resourceColumns);
          }
          y = drawTableRow(page, fonts, y, resourceColumns, row, { fontSize: 6.4, lineHeight: 8 });
        }
        y -= 6;
      }

      if (y < 215) ({ page, y } = addPage(`APU PARTIDA ${index + 1} · RESUMEN`, documentHash));
      const calc = item.calculation;
      const costColumns = [{ label: 'CONCEPTO', width: 390 }, { label: 'MONTO', width: 138, align: 'right' }];
      y = drawSectionTitle(page, fonts, y, 'RESUMEN DE COSTOS');
      y = drawTableHeader(page, fonts, y, costColumns);
      const costRows = [
        ['Materiales', calc.materials],
        ['Equipos', calc.equipment],
        [`Mano de obra + FCAS ${formatNumber(item.apu.fcas)}%`, calc.labor],
        ['Costo directo', calc.direct],
        [`Administración ${formatNumber(config.administrationPct)}%`, calc.administration],
        [`Imprevistos ${formatNumber(config.contingencyPct)}%`, calc.contingency],
        [`Utilidad ${formatNumber(config.profitPct)}%`, calc.profit],
        [`Financiamiento ${formatNumber(config.financingPct)}%`, calc.financing],
        [`Factor contractual ${formatNumber(config.clientFactor)}x`, calc.unitContract]
      ];
      for (const [label, value] of costRows) y = drawTableRow(page, fonts, y, costColumns, [label, money(value, config.currency)], { fontSize: 6.8 });
      if (y > 95) {
        y -= 8;
        y = drawSectionTitle(page, fonts, y, 'MEMORIA DE CÁLCULO Y ADVERTENCIAS');
        y = drawParagraph(page, fonts, y, item.apu.memoria_calculo || 'No indicada.', 8);
        const warningText = item.validation.warnings.length ? item.validation.warnings.map((warning) => `• ${warning}`).join('\n') : 'Sin advertencias.';
        drawParagraph(page, fonts, y - 4, warningText, 8);
      }
    }

    const bytes = await pdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="SEINCA_${safeFilename(project.general?.obra)}.pdf"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('X-SEINCA-Document-Hash', documentHash);
    return res.status(200).send(Buffer.from(bytes));
  } catch (error) {
    console.error('[SEINCA PDF]', error);
    return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF', detalle: text(error?.message, 800) });
  }
}
