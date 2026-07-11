import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGroundedResult } from '../lib/grounded-research.js';

const raw = {
  unidad: 'm2', cantidad: 100, rendimiento: 80, fcas: 250,
  descripcion_tecnica: 'Pintura interior dos manos', memoria_calculo: '10 x 10 = 100 m2',
  justificacion_rendimiento: 'Cuadrilla de pintor y ayudante.', criterio_ejecucion: 'Preparar y aplicar.',
  supuestos: [], exclusiones: [], advertencias: [],
  exchange_rate: { usd_ves: 50, source_url: 'https://www.bcv.org.ve/tasa', source_title: 'BCV' },
  covenin_candidates: [
    { code: 'COVENIN 2000-92', title: 'Construcción', year: '1992', applies_to: 'Medición', source_title: 'SENCAMER', source_url: 'https://www.sencamer.gob.ve/norma', official: true }
  ],
  materiales: [
    { desc: 'Pintura de caucho', und: 'gal', cant: 0.12, quotes: [
      { price: 40, currency: 'USD', price_usd: 40, supplier: 'Proveedor A', source_title: 'Pintura', source_url: 'https://proveedor-a.example/pintura', source_type: 'direct_supplier', notes: '' },
      { price: 42, currency: 'USD', price_usd: 42, supplier: 'Proveedor B', source_title: 'Pintura', source_url: 'https://proveedor-b.example/pintura', source_type: 'direct_supplier', notes: '' }
    ] }
  ],
  equipos: [],
  mo: [
    { cargo: 'Pintor', cant: 1, quotes: [
      { price: 2000, currency: 'VES', price_usd: 40, supplier: 'Servicio', source_title: 'Jornal', source_url: 'https://servicio.example/pintor', source_type: 'service_listing', notes: '' }
    ] }
  ]
};
const sources = ['https://www.bcv.org.ve/tasa', 'https://www.sencamer.gob.ve/norma', 'https://proveedor-a.example/pintura', 'https://proveedor-b.example/pintura', 'https://servicio.example/pintor'];

test('convierte búsqueda fundamentada en un APU compatible', () => {
  const result = normalizeGroundedResult(raw, sources, 'Pintura');
  assert.equal(result.apu.materiales[0].precio, 41);
  assert.equal(result.apu.materiales[0].precio_verificado, true);
  assert.equal(result.apu.mo[0].jornal, 40);
  assert.equal(result.apu.covenin_verificado, true);
  assert.equal(result.coverage.priced, 2);
});

test('descarta URLs que no fueron citadas por la búsqueda', () => {
  const result = normalizeGroundedResult(raw, ['https://www.bcv.org.ve/tasa'], 'Pintura');
  assert.equal(result.apu.materiales[0].precio, 0);
  assert.equal(result.apu.materiales[0].precio_verificado, false);
  assert.ok(result.apu.advertencias.some((warning) => warning.includes('no se encontró precio web')));
});
