import { isoDate, normalizeUnit, number, text } from './apu-core.js';

export const LOCATION = 'Caracas, Distrito Capital, Venezuela';

const QUOTE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    price: { type: 'number' }, currency: { type: 'string' }, price_usd: { type: 'number' },
    supplier: { type: 'string' }, source_title: { type: 'string' }, source_url: { type: 'string' },
    source_type: { type: 'string' }, notes: { type: 'string' }
  },
  required: ['price', 'currency', 'price_usd', 'supplier', 'source_title', 'source_url', 'source_type', 'notes']
};

const PRICE_RESOURCE = (descriptionKey, withUnit = false) => ({
  type: 'object', additionalProperties: false,
  properties: {
    [descriptionKey]: { type: 'string' },
    ...(withUnit ? { und: { type: 'string' } } : {}),
    cant: { type: 'number' },
    quotes: { type: 'array', items: QUOTE_SCHEMA }
  },
  required: [descriptionKey, ...(withUnit ? ['und'] : []), 'cant', 'quotes']
});

export const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    unidad: { type: 'string' }, cantidad: { type: 'number' }, rendimiento: { type: 'number' }, fcas: { type: 'number' },
    descripcion_tecnica: { type: 'string' }, memoria_calculo: { type: 'string' },
    justificacion_rendimiento: { type: 'string' }, criterio_ejecucion: { type: 'string' },
    supuestos: { type: 'array', items: { type: 'string' } },
    exclusiones: { type: 'array', items: { type: 'string' } },
    advertencias: { type: 'array', items: { type: 'string' } },
    exchange_rate: {
      type: 'object', additionalProperties: false,
      properties: { usd_ves: { type: 'number' }, source_url: { type: 'string' }, source_title: { type: 'string' } },
      required: ['usd_ves', 'source_url', 'source_title']
    },
    covenin_candidates: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: {
          code: { type: 'string' }, title: { type: 'string' }, year: { type: 'string' }, applies_to: { type: 'string' },
          source_title: { type: 'string' }, source_url: { type: 'string' }, official: { type: 'boolean' }
        },
        required: ['code', 'title', 'year', 'applies_to', 'source_title', 'source_url', 'official']
      }
    },
    materiales: { type: 'array', items: PRICE_RESOURCE('desc', true) },
    equipos: { type: 'array', items: PRICE_RESOURCE('desc') },
    mo: { type: 'array', items: PRICE_RESOURCE('cargo') }
  },
  required: [
    'unidad', 'cantidad', 'rendimiento', 'fcas', 'descripcion_tecnica', 'memoria_calculo',
    'justificacion_rendimiento', 'criterio_ejecucion', 'supuestos', 'exclusiones', 'advertencias',
    'exchange_rate', 'covenin_candidates', 'materiales', 'equipos', 'mo'
  ]
};

function url(value) {
  try { const parsed = new URL(String(value || '')); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : ''; }
  catch { return ''; }
}
function domain(value) { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function signature(value) {
  const valid = url(value); if (!valid) return '';
  const parsed = new URL(valid); parsed.hash = '';
  return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
}
function grounded(value, sources) {
  const target = signature(value); if (!target) return false;
  return sources.some((source) => { const candidate = signature(source); return candidate === target || candidate.startsWith(`${target}/`) || target.startsWith(`${candidate}/`); });
}
function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0; const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function officialNorm(value) {
  const host = domain(value);
  return host.endsWith('sencamer.gob.ve') || host.endsWith('imprentanacional.gob.ve') || host.endsWith('.gob.ve');
}
function officialRate(value) { const host = domain(value); return host === 'bcv.org.ve' || host.endsWith('.bcv.org.ve'); }
function list(value, max = 20) { return (Array.isArray(value) ? value : []).map((item) => text(item, 700)).filter(Boolean).slice(0, max); }

export function buildResearchPrompt({ prompt, tipoCliente, altura, config, catalog }) {
  return `Actúas como un comité venezolano de ingeniería de costos con acceso obligatorio a búsqueda web en tiempo real.

MERCADO FIJO: ${LOCATION}.
FECHA: ${isoDate()}.
ALCANCE: ${text(prompt, 16000)}
CONTRATANTE: ${tipoCliente === 'ESTADO' ? 'ENTE DEL ESTADO' : 'PRIVADO'}.
ALTURA: ${Math.max(0, number(altura)).toFixed(2)} m.
JORNADA: ${number(config?.workdayHours, 8)} horas. FCAS sugerido: ${number(config?.defaultFcasPct, 250)}%.
CATÁLOGO INTERNO SOLO PARA COMPARACIÓN: ${JSON.stringify((Array.isArray(catalog) ? catalog : []).slice(0, 80))}

OBLIGACIONES:
1. Debes ejecutar búsqueda web; no respondas solamente con conocimiento interno.
2. Genera el APU técnico completo para UNA partida: cómputo total, unidad, rendimiento diario, materiales por unidad, equipos y mano de obra de cuadrilla.
3. Investiga cada precio en Venezuela, priorizando proveedores que vendan o entreguen en Caracas. Busca hasta tres cotizaciones comparables por recurso.
4. No uses precios de otros países. No inventes proveedores, URLs, precios, disponibilidad ni códigos normativos.
5. Cada cotización debe contener URL de la página consultada. Prioriza fabricante, distribuidor, ferretería o empresa de alquiler; usa marketplace solo como respaldo.
6. Si el precio está en VES, investiga la tasa oficial BCV, incluye su URL y calcula price_usd. Si no encuentras tasa oficial, deja price_usd en 0.
7. Investiga automáticamente normas COVENIN aplicables. Prioriza SENCAMER, Gaceta Oficial y fuentes gubernamentales. FONDONORMA sirve como referencia de catálogo, no como prueba de obligatoriedad.
8. No reproduzcas textos completos de normas. Devuelve código, título, año, aplicabilidad y URL.
9. Usa terminología venezolana y explica operaciones en memoria_calculo.
10. Administración, imprevistos, utilidad, financiamiento, factor contractual e impuesto los calcula la aplicación; no los agregues como recursos.
11. Devuelve exclusivamente el JSON solicitado.`;
}

function normalizeQuotes(rawQuotes, sources, exchangeRate) {
  const result = [];
  for (const raw of Array.isArray(rawQuotes) ? rawQuotes : []) {
    const sourceUrl = url(raw?.source_url);
    if (!sourceUrl || !grounded(sourceUrl, sources)) continue;
    const currency = text(raw?.currency || 'USD', 8).toUpperCase();
    const rawPrice = Math.max(0, number(raw?.price));
    let usd = Math.max(0, number(raw?.price_usd));
    if (currency === 'USD' && !usd) usd = rawPrice;
    if (currency === 'VES') usd = exchangeRate > 0 ? rawPrice / exchangeRate : 0;
    if (!(usd > 0)) continue;
    result.push({
      priceUsd: usd, supplier: text(raw?.supplier || raw?.source_title, 180), sourceUrl,
      sourceType: text(raw?.source_type, 50).toLowerCase(), title: text(raw?.source_title, 220)
    });
  }
  const unique = new Map();
  for (const quote of result) unique.set(`${signature(quote.sourceUrl)}|${quote.priceUsd.toFixed(4)}`, quote);
  return [...unique.values()];
}

function resource(raw, kind, sources, exchangeRate, warnings) {
  const description = text(kind === 'mo' ? raw?.cargo : raw?.desc, 250);
  const quotes = normalizeQuotes(raw?.quotes, sources, exchangeRate);
  const selected = median(quotes.map((quote) => quote.priceUsd));
  const domains = new Set(quotes.map((quote) => domain(quote.sourceUrl)).filter(Boolean));
  const direct = quotes.some((quote) => ['direct_supplier', 'manufacturer', 'official_store'].includes(quote.sourceType));
  const verified = selected > 0 && (domains.size >= 2 || direct);
  const source = quotes.slice(0, 2).map((quote) => `${quote.supplier || quote.title || domain(quote.sourceUrl)} — ${quote.sourceUrl}`).join(' | ');
  if (!(selected > 0)) warnings.push(`${description || 'Recurso'}: no se encontró precio web respaldado en Caracas/Venezuela.`);
  else if (!verified) warnings.push(`${description}: precio web con una sola fuente no directa; requiere confirmación.`);
  const common = {
    cant: Math.max(0, number(raw?.cant)), fuente_precio: source || 'Sin precio web respaldado',
    fecha_precio: selected > 0 ? isoDate() : '', precio_verificado: verified
  };
  if (kind === 'material') return { desc: description, und: normalizeUnit(raw?.und), precio: Number(selected.toFixed(4)), ...common };
  if (kind === 'equipo') return { desc: description, tarifa: Number(selected.toFixed(4)), ...common };
  return { cargo: description, jornal: Number(selected.toFixed(4)), ...common };
}

export function normalizeGroundedResult(raw, citedSources, prompt = '', providerName = 'IA con web') {
  if (!raw || typeof raw !== 'object') throw new Error('La investigación no devolvió un objeto válido.');
  const sources = [...new Set((Array.isArray(citedSources) ? citedSources : []).map(url).filter(Boolean))];
  if (!sources.length) throw new Error('La respuesta no contiene fuentes web citadas.');
  const warnings = list(raw.advertencias, 30);
  const rateUrl = url(raw?.exchange_rate?.source_url);
  const exchangeRate = rateUrl && grounded(rateUrl, sources) && officialRate(rateUrl) ? Math.max(0, number(raw?.exchange_rate?.usd_ves)) : 0;
  if (number(raw?.exchange_rate?.usd_ves) > 0 && !exchangeRate) warnings.push('La tasa de cambio fue descartada porque no estaba respaldada por una URL oficial del BCV.');

  const materiales = (Array.isArray(raw.materiales) ? raw.materiales : []).map((item) => resource(item, 'material', sources, exchangeRate, warnings)).filter((item) => item.desc && item.cant > 0);
  const equipos = (Array.isArray(raw.equipos) ? raw.equipos : []).map((item) => resource(item, 'equipo', sources, exchangeRate, warnings)).filter((item) => item.desc && item.cant > 0);
  const mo = (Array.isArray(raw.mo) ? raw.mo : []).map((item) => resource(item, 'mo', sources, exchangeRate, warnings)).filter((item) => item.cargo && item.cant > 0);

  const norms = (Array.isArray(raw.covenin_candidates) ? raw.covenin_candidates : []).map((item) => {
    const sourceUrl = url(item?.source_url);
    if (!text(item?.code, 100) || !sourceUrl || !grounded(sourceUrl, sources)) return null;
    return {
      code: text(item.code, 100), title: text(item.title, 300), year: text(item.year, 20), appliesTo: text(item.applies_to, 600),
      sourceUrl, official: Boolean(item.official) && officialNorm(sourceUrl)
    };
  }).filter(Boolean);
  const official = norms.filter((item) => item.official);
  const selectedNorms = official.length ? official : norms;
  const covenin = selectedNorms.length ? [...new Set(selectedNorms.map((item) => item.code))].slice(0, 5).join('; ') : 'POR VERIFICAR';
  if (!norms.length) warnings.push('La búsqueda no encontró una referencia COVENIN citada y aplicable.');
  else if (!official.length) warnings.push('Las referencias COVENIN halladas son de catálogo o fuentes no gubernamentales y requieren verificación documental.');

  const apu = {
    covenin, covenin_verificado: official.length > 0,
    criterio_covenin: norms.length ? norms.map((item) => `${item.code}${item.title ? ` — ${item.title}` : ''}${item.year ? ` (${item.year})` : ''}. ${item.appliesTo} Fuente: ${item.sourceUrl}`).join('\n') : 'POR VERIFICAR: no se encontró fuente institucional concluyente.',
    unidad: normalizeUnit(raw.unidad), cantidad: number(raw.cantidad), rendimiento: number(raw.rendimiento), fcas: Math.max(0, Math.min(1000, number(raw.fcas, 250))),
    descripcion_tecnica: text(raw.descripcion_tecnica || prompt, 8000), memoria_calculo: text(raw.memoria_calculo, 8000),
    justificacion_rendimiento: text(raw.justificacion_rendimiento, 5000), criterio_ejecucion: text(raw.criterio_ejecucion, 5000),
    supuestos: list(raw.supuestos), exclusiones: list(raw.exclusiones), advertencias: [...new Set(warnings)].slice(0, 30), materiales, equipos, mo
  };
  const allResources = [...materiales, ...equipos, ...mo];
  return {
    apu, providerName, sources, norms,
    coverage: { requested: allResources.length, priced: allResources.filter((item) => (item.precio || item.tarifa || item.jornal) > 0).length, verified: allResources.filter((item) => item.precio_verificado).length, norms: norms.length, officialNorms: official.length }
  };
}

export function scoreGrounded(result) {
  const coverage = result?.coverage || {};
  return coverage.priced * 20 + coverage.verified * 12 + coverage.officialNorms * 8 + Math.min(15, (result?.apu?.memoria_calculo?.length || 0) / 200) - (result?.apu?.advertencias?.length || 0);
}
