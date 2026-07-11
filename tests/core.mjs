import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_VERSION,
  DEFAULT_CONFIG,
  applyCatalog,
  calculateApu,
  migrateProject,
  newProject,
  normalizeApu,
  stableHash,
  validateApu
} from '../lib/apu-core.js';

const verified = {
  covenin: 'POR VERIFICAR', covenin_verificado: false, criterio_covenin: '', unidad: 'm2', cantidad: 100,
  rendimiento: 50, fcas: 100, descripcion_tecnica: 'Aplicación de pintura en dos manos.',
  memoria_calculo: '10 m x 10 m = 100 m2', justificacion_rendimiento: 'Cuadrilla de un pintor y un ayudante.',
  criterio_ejecucion: 'Preparación, sellado y dos manos.', supuestos: [], exclusiones: [], advertencias: [],
  materiales: [{ desc: 'Pintura', und: 'gal', cant: 0.1, precio: 40, fuente_precio: 'Cotización A', fecha_precio: '2026-07-10', precio_verificado: true }],
  equipos: [{ desc: 'Andamio', cant: 1, tarifa: 5, fuente_precio: 'Alquiler A', fecha_precio: '2026-07-10', precio_verificado: true }],
  mo: [{ cargo: 'Pintor', cant: 1, jornal: 35, fuente_precio: 'Nómina', fecha_precio: '2026-07-10', precio_verificado: true }]
};

test('normaliza APU sin inventar recursos', () => {
  const apu = normalizeApu(verified, '', 'Test');
  assert.equal(apu.materiales.length, 1);
  assert.equal(apu.equipos.length, 1);
  assert.equal(apu.mo.length, 1);
  const empty = normalizeApu({ ...verified, materiales: [], equipos: [], mo: [] }, '', 'Test');
  assert.equal(empty.materiales.length + empty.equipos.length + empty.mo.length, 0);
});

test('calcula APU de forma determinística', () => {
  const calc = calculateApu(verified, { ...DEFAULT_CONFIG, administrationPct: 10, contingencyPct: 5, profitPct: 10, financingPct: 0, taxPct: 16, clientFactor: 1 });
  assert.equal(calc.materials, 4);
  assert.equal(calc.equipment, 0.1);
  assert.equal(calc.laborDirect, 0.7);
  assert.equal(calc.laborBenefits, 0.7);
  assert.equal(Number(calc.direct.toFixed(2)), 5.5);
  assert.equal(Number(calc.unitBase.toFixed(3)), 6.875);
  assert.equal(Number(calc.subtotal.toFixed(1)), 687.5);
});

test('bloquea aprobación con precios no verificados', () => {
  const apu = normalizeApu({ ...verified, materiales: [{ ...verified.materiales[0], precio_verificado: false }] }, '', 'Test');
  const result = validateApu(apu, DEFAULT_CONFIG, { stage: 'approve', now: new Date('2026-07-11T00:00:00Z') });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /no verificado/i);
});

test('catálogo verificado sustituye precio y metadatos', () => {
  const apu = normalizeApu({ ...verified, materiales: [{ ...verified.materiales[0], precio: 1, precio_verificado: false }] }, '', 'Test');
  const updated = applyCatalog(apu, [{ type: 'material', desc: 'Pintura', und: 'gal', precio: 55, fuente: 'Proveedor B', fecha: '2026-07-11', verificado: true }]);
  assert.equal(updated.materiales[0].precio, 55);
  assert.equal(updated.materiales[0].precio_verificado, true);
});

test('migra proyectos y conserva versión actual', () => {
  const project = newProject();
  const migrated = migrateProject(project);
  assert.equal(migrated.appVersion, APP_VERSION);
  assert.equal(migrated.schemaVersion, 5);
});

test('hash documental es estable', () => {
  assert.equal(stableHash({ a: 1, b: 2 }), stableHash({ a: 1, b: 2 }));
  assert.notEqual(stableHash({ a: 1 }), stableHash({ a: 2 }));
});
