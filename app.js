import {
  APP_VERSION,
  DEFAULT_CONFIG,
  PROJECT_SCHEMA_VERSION,
  applyCatalog,
  calculateApu,
  catalogKey,
  isoDate,
  migrateProject,
  newProject,
  normalizeApu,
  normalizeConfig,
  normalizeUnit,
  number,
  stableHash,
  text,
  validateApu
} from '/lib/apu-core.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'seinca.enterprise.v5';
const HISTORY_KEY = 'seinca.enterprise.history.v5';
const RESOURCE_TABLES = {
  materiales: 'materialsTable',
  equipos: 'equipmentTable',
  mo: 'laborTable'
};

let project = loadLocalProject() || newProject();
let editingItemId = null;
let aiMetadata = null;
let saveTimer = null;
let silent = false;

const clone = (value) => structuredClone(value);
const uniqueId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const toLines = (value) => String(value ?? '').split(/\r?\n/).map((item) => text(item, 700)).filter(Boolean);
const formatNumber = (value) => new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(number(value));
const formatMoney = (value) => `${project.config.currency} ${formatNumber(value)}`;

function loadLocalProject() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? migrateProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function addAudit(action, detail = '') {
  project.auditTrail ||= [];
  project.auditTrail.push({
    at: new Date().toISOString(),
    action,
    by: 'Usuario local',
    detail: text(detail, 500)
  });
  project.auditTrail = project.auditTrail.slice(-300);
}

function createSnapshot(reason) {
  try {
    const currentHash = stableHash(project);
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (history[0]?.hash === currentHash) return;
    history.unshift({
      at: new Date().toISOString(),
      reason,
      hash: currentHash,
      project: { ...clone(project), logo: '' },
      keepLogo: Boolean(project.logo)
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 8)));
  } catch {
    // El historial es una ayuda local y no debe interrumpir el trabajo.
  }
}

function saveLocal(reason = 'Cambio') {
  if (silent) return;
  clearTimeout(saveTimer);
  $('autosaveStatus').textContent = 'Guardando…';
  saveTimer = setTimeout(() => {
    syncProjectFromForm(false);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(project));
      $('autosaveStatus').textContent = 'Guardado';
      createSnapshot(reason);
    } catch {
      $('autosaveStatus').textContent = 'Almacenamiento lleno';
    }
  }, 450);
}

function setNotice(message = '', kind = '') {
  const element = $('aiNotice');
  element.textContent = message;
  element.className = `callout${kind ? ` ${kind}` : ''}${message ? '' : ' hidden'}`;
}

function setHealth(message, kind = '') {
  const badge = $('healthBadge');
  badge.textContent = message;
  badge.className = `status-badge${kind ? ` ${kind}` : ''}`;
}

function readConfig() {
  return normalizeConfig({
    currency: $('currency').value,
    workdayHours: $('workdayHours').value,
    clientFactor: $('clientFactor').value,
    defaultFcasPct: $('defaultFcas').value,
    administrationPct: $('administrationPct').value,
    contingencyPct: $('contingencyPct').value,
    profitPct: $('profitPct').value,
    financingPct: $('financingPct').value,
    taxPct: $('taxPct').value,
    maxPriceAgeDays: $('maxPriceAgeDays').value,
    requireVerifiedPricesForApproval: $('requireVerifiedPrices').checked
  });
}

function syncProjectFromForm(renderAfter = true) {
  project.general = {
    ...project.general,
    code: text($('projectCode').value, 60),
    revision: text($('projectRevision').value, 20) || '0',
    status: $('projectStatus').value,
    fecha: $('projectDate').value || isoDate(),
    obra: text($('projectName').value, 250),
    cliente: text($('clientName').value, 200),
    ubicacion: text($('projectLocation').value, 250),
    validityDays: Math.max(1, number($('validityDays').value, 15)),
    paymentTerms: text($('paymentTerms').value, 3000),
    notes: text($('projectNotes').value, 4000)
  };
  project.config = readConfig();
  project.general.currency = project.config.currency;
  project.appVersion = APP_VERSION;
  project.schemaVersion = PROJECT_SCHEMA_VERSION;
  project.updatedAt = new Date().toISOString();
  if (renderAfter) renderAll();
}

function fillProjectForm() {
  silent = true;
  const general = project.general;
  const config = normalizeConfig(project.config);
  const values = {
    projectCode: general.code || '',
    projectRevision: general.revision || '0',
    projectStatus: general.status || 'BORRADOR',
    projectDate: general.fecha || isoDate(),
    projectName: general.obra || '',
    clientName: general.cliente || '',
    projectLocation: general.ubicacion || '',
    validityDays: general.validityDays || 15,
    paymentTerms: general.paymentTerms || '',
    projectNotes: general.notes || '',
    currency: config.currency,
    workdayHours: config.workdayHours,
    clientFactor: config.clientFactor,
    defaultFcas: config.defaultFcasPct,
    administrationPct: config.administrationPct,
    contingencyPct: config.contingencyPct,
    profitPct: config.profitPct,
    financingPct: config.financingPct,
    taxPct: config.taxPct,
    maxPriceAgeDays: config.maxPriceAgeDays
  };
  for (const [id, value] of Object.entries(values)) $(id).value = value;
  $('requireVerifiedPrices').checked = config.requireVerifiedPricesForApproval;
  silent = false;
}

function makeCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.className = className;
  if (value instanceof Node) cell.append(value);
  else cell.textContent = value ?? '';
  row.append(cell);
  return cell;
}

function makeInput(className, value, type = 'text') {
  const input = document.createElement('input');
  input.className = className;
  input.type = type;
  input.value = value ?? '';
  if (type === 'number') {
    input.min = '0';
    input.step = '0.0001';
  }
  input.addEventListener('input', () => {
    recalculateEditor();
    saveLocal('Edición de APU');
  });
  return input;
}

function makeRemoveButton(row) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-remove';
  button.textContent = 'Eliminar';
  button.addEventListener('click', () => {
    row.remove();
    recalculateEditor();
    saveLocal('Recurso eliminado');
  });
  return button;
}

function addResourceRow(type, data = {}) {
  const row = document.createElement('tr');
  row.dataset.id = data.id || uniqueId(type);
  makeCell(row, makeInput('desc', type === 'mo' ? data.cargo : data.desc));
  if (type === 'materiales') makeCell(row, makeInput('unit', data.und || 'und'));
  makeCell(row, makeInput('qty', data.cant || 0, 'number'));
  makeCell(row, makeInput('price', type === 'materiales' ? data.precio || 0 : type === 'equipos' ? data.tarifa || 0 : data.jornal || 0, 'number'));
  makeCell(row, makeInput('source', data.fuente_precio || ''));
  makeCell(row, makeInput('price-date', data.fecha_precio || '', 'date'));
  const verified = makeInput('verified', '');
  verified.type = 'checkbox';
  verified.checked = Boolean(data.precio_verificado);
  verified.addEventListener('change', () => {
    recalculateEditor();
    saveLocal('Verificación de precio');
  });
  makeCell(row, verified, 'center');
  const partial = makeCell(row, '0,00', 'money-cell partial');
  partial.dataset.raw = '0';
  makeCell(row, makeRemoveButton(row));
  $(RESOURCE_TABLES[type]).querySelector('tbody').append(row);
  recalculateEditor();
}

function readResources(type) {
  return [...$(RESOURCE_TABLES[type]).querySelectorAll('tbody tr')]
    .map((row) => {
      const common = {
        id: row.dataset.id,
        cant: number(row.querySelector('.qty').value),
        fuente_precio: text(row.querySelector('.source').value, 300),
        fecha_precio: row.querySelector('.price-date').value,
        precio_verificado: row.querySelector('.verified').checked
      };
      if (type === 'materiales') {
        return {
          ...common,
          desc: text(row.querySelector('.desc').value, 250),
          und: normalizeUnit(row.querySelector('.unit').value),
          precio: number(row.querySelector('.price').value)
        };
      }
      if (type === 'equipos') {
        return {
          ...common,
          desc: text(row.querySelector('.desc').value, 250),
          tarifa: number(row.querySelector('.price').value)
        };
      }
      return {
        ...common,
        cargo: text(row.querySelector('.desc').value, 250),
        jornal: number(row.querySelector('.price').value)
      };
    })
    .filter((row) => row.desc || row.cargo || row.cant);
}

function emptyApu() {
  return normalizeApu({
    covenin: 'POR VERIFICAR',
    unidad: 'und',
    cantidad: 0,
    rendimiento: 0,
    fcas: project.config.defaultFcasPct,
    materiales: [],
    equipos: [],
    mo: []
  }, '', 'Editor');
}

function readEditorApu() {
  return normalizeApu({
    covenin: $('covenin').value,
    covenin_verificado: $('coveninVerified').checked,
    criterio_covenin: $('coveninVerified').checked ? 'Verificado por el usuario.' : 'Pendiente de verificación documental.',
    unidad: $('unit').value,
    cantidad: $('quantity').value,
    rendimiento: $('rendimiento').value,
    fcas: $('fcas').value,
    descripcion_tecnica: $('technicalDescription').value,
    memoria_calculo: $('calculationMemory').value,
    justificacion_rendimiento: $('performanceJustification').value,
    criterio_ejecucion: $('executionCriteria').value,
    supuestos: toLines($('assumptions').value),
    exclusiones: toLines($('exclusions').value),
    advertencias: aiMetadata?.warnings || [],
    materiales: readResources('materiales'),
    equipos: readResources('equipos'),
    mo: readResources('mo')
  }, $('prompt').value, aiMetadata?.modelo || 'Editor');
}

function fillEditor(apuValue, item = null) {
  const apu = normalizeApu(apuValue, '', item?.aiMeta?.modelo || 'Proyecto');
  silent = true;
  const values = {
    covenin: apu.covenin || 'POR VERIFICAR',
    unit: apu.unidad || 'und',
    quantity: apu.cantidad || '',
    rendimiento: apu.rendimiento || '',
    fcas: apu.fcas ?? project.config.defaultFcasPct,
    technicalDescription: apu.descripcion_tecnica || '',
    calculationMemory: apu.memoria_calculo || '',
    performanceJustification: apu.justificacion_rendimiento || '',
    executionCriteria: apu.criterio_ejecucion || '',
    assumptions: apu.supuestos.join('\n'),
    exclusions: apu.exclusiones.join('\n')
  };
  for (const [id, value] of Object.entries(values)) $(id).value = value;
  $('coveninVerified').checked = apu.covenin_verificado;
  for (const type of Object.keys(RESOURCE_TABLES)) {
    $(RESOURCE_TABLES[type]).querySelector('tbody').innerHTML = '';
    (apu[type] || []).forEach((row) => addResourceRow(type, row));
  }
  $('technicalReview').checked = Boolean(item?.technicalReview);
  if (item) {
    $('prompt').value = item.prompt || '';
    $('clientType').value = item.clientType || 'PRIVADO';
    $('height').value = item.height || 0;
  }
  silent = false;
  recalculateEditor();
}

function renderQuality(validation) {
  const pill = $('qualityPill');
  pill.textContent = `Calidad ${validation.score}/100`;
  pill.className = `quality-pill ${validation.score >= 85 ? 'good' : validation.score >= 60 ? 'warn' : 'bad'}`;
  const targets = [
    ['qualityErrors', validation.errors, 'Sin errores bloqueantes.'],
    ['qualityWarnings', validation.warnings, 'Sin advertencias.']
  ];
  for (const [id, entries, fallback] of targets) {
    const list = $(id);
    list.innerHTML = '';
    (entries.length ? entries : [fallback]).forEach((entry) => {
      const item = document.createElement('li');
      item.textContent = entry;
      list.append(item);
    });
  }
}

function recalculateEditor() {
  let apu;
  try { apu = readEditorApu(); }
  catch { apu = emptyApu(); }
  const validation = validateApu(apu, project.config, { stage: 'draft' });
  const calculation = validation.calculation;
  const totals = {
    materialsTotal: calculation.materials,
    equipmentTotal: calculation.equipment,
    laborTotal: calculation.labor,
    directTotal: calculation.direct,
    indirectTotal: calculation.indirect,
    unitContractTotal: calculation.unitContract
  };
  for (const [id, value] of Object.entries(totals)) $(id).textContent = formatMoney(value);
  renderQuality(validation);
  const rendimiento = Math.max(0.000001, apu.rendimiento || 1);
  for (const type of Object.keys(RESOURCE_TABLES)) {
    $(RESOURCE_TABLES[type]).querySelectorAll('tbody tr').forEach((row) => {
      let value = number(row.querySelector('.qty').value) * number(row.querySelector('.price').value);
      if (type !== 'materiales') value /= rendimiento;
      if (type === 'mo') value *= 1 + apu.fcas / 100;
      row.querySelector('.partial').textContent = formatNumber(value);
      row.querySelector('.partial').dataset.raw = String(value);
    });
  }
  return { apu, validation, calculation };
}

function addCatalogRow(data = {}) {
  const row = document.createElement('tr');
  row.dataset.id = data.id || uniqueId('catalog');
  const type = document.createElement('select');
  type.className = 'cat-type';
  for (const optionValue of ['material', 'equipo', 'mano_obra']) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue === 'mano_obra' ? 'Mano de obra' : optionValue[0].toUpperCase() + optionValue.slice(1);
    type.append(option);
  }
  type.value = data.type || 'material';
  makeCell(row, type);
  makeCell(row, makeInput('cat-desc', data.desc || ''));
  makeCell(row, makeInput('cat-unit', data.und || 'und'));
  makeCell(row, makeInput('cat-price', data.precio || 0, 'number'));
  makeCell(row, makeInput('cat-source', data.fuente || ''));
  makeCell(row, makeInput('cat-date', data.fecha || isoDate(), 'date'));
  const verified = makeInput('cat-verified', '');
  verified.type = 'checkbox';
  verified.checked = Boolean(data.verificado);
  makeCell(row, verified, 'center');
  makeCell(row, makeRemoveButton(row));
  for (const control of row.querySelectorAll('input,select')) {
    control.addEventListener('input', () => {
      project.catalog = readCatalogRows();
      saveLocal('Catálogo de precios');
    });
  }
  $('catalogTable').querySelector('tbody').append(row);
}

function readCatalogRows() {
  return [...$('catalogTable').querySelectorAll('tbody tr')].map((row) => ({
    id: row.dataset.id,
    type: row.querySelector('.cat-type').value,
    desc: text(row.querySelector('.cat-desc').value, 250),
    und: normalizeUnit(row.querySelector('.cat-unit').value),
    precio: number(row.querySelector('.cat-price').value),
    fuente: text(row.querySelector('.cat-source').value, 300),
    fecha: row.querySelector('.cat-date').value,
    verificado: row.querySelector('.cat-verified').checked
  })).filter((row) => row.desc);
}

function renderCatalog() {
  $('catalogTable').querySelector('tbody').innerHTML = '';
  (project.catalog || []).forEach((item) => addCatalogRow(item));
}

function normalizeProjectItem(item) {
  const apuData = normalizeApu(item.apuData || item.apu || item, item.prompt || '', item.aiMeta?.modelo || 'Proyecto');
  return {
    id: item.id || uniqueId('item'),
    status: item.status === 'APROBADO' ? 'APROBADO' : 'BORRADOR',
    prompt: item.prompt || '',
    clientType: item.clientType || item.tipoCliente || 'PRIVADO',
    height: number(item.height ?? item.altura, 0),
    technicalReview: Boolean(item.technicalReview),
    apuData,
    aiMeta: item.aiMeta || null,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function saveItem(stage) {
  syncProjectFromForm(false);
  const { apu, validation } = recalculateEditor();
  const approval = stage === 'approve';
  const finalValidation = validateApu(apu, project.config, { stage: approval ? 'approve' : 'draft' });
  if (approval && !$('technicalReview').checked) finalValidation.errors.unshift('Debe confirmar la revisión profesional de la partida.');
  if (approval && finalValidation.errors.length) {
    renderQuality(finalValidation);
    setNotice(`No se puede aprobar:\n• ${finalValidation.errors.join('\n• ')}`, 'error');
    return;
  }
  if (!apu.descripcion_tecnica || !(apu.cantidad > 0) || !(apu.rendimiento > 0)) {
    setNotice('Completa descripción, cantidad y rendimiento antes de guardar.', 'error');
    return;
  }
  const existing = project.items.find((item) => item.id === editingItemId);
  const item = normalizeProjectItem({
    id: editingItemId || uniqueId('item'),
    status: approval ? 'APROBADO' : 'BORRADOR',
    prompt: text($('prompt').value, 16000),
    clientType: $('clientType').value,
    height: number($('height').value),
    technicalReview: $('technicalReview').checked,
    apuData: apu,
    aiMeta: aiMetadata,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  if (existing) Object.assign(existing, item);
  else project.items.push(item);
  addAudit(approval ? 'ITEM_APPROVED' : 'ITEM_SAVED_DRAFT', apu.descripcion_tecnica.slice(0, 160));
  editingItemId = null;
  aiMetadata = null;
  clearEditor();
  renderAll();
  saveLocal(approval ? 'Partida aprobada' : 'Partida en borrador');
  setNotice(approval ? 'Partida aprobada y agregada al presupuesto.' : 'Partida guardada como borrador.', 'success');
}

function clearEditor() {
  editingItemId = null;
  aiMetadata = null;
  $('prompt').value = '';
  $('requestId').textContent = '';
  fillEditor(emptyApu());
  $('technicalReview').checked = false;
  $('saveDraftItem').textContent = 'Guardar como borrador';
  $('approveItem').textContent = 'Aprobar y agregar';
}

function editItem(id) {
  const item = project.items.find((entry) => entry.id === id);
  if (!item) return;
  editingItemId = id;
  aiMetadata = item.aiMeta || null;
  fillEditor(item.apuData, item);
  $('saveDraftItem').textContent = 'Actualizar borrador';
  $('approveItem').textContent = item.status === 'APROBADO' ? 'Reaprobar cambios' : 'Aprobar y agregar';
  document.querySelector('.workspace').scrollTo({ top: document.querySelector('#editorTitle').offsetTop - 20, behavior: 'smooth' });
}

function deleteItem(id) {
  const item = project.items.find((entry) => entry.id === id);
  if (!item || !confirm(`¿Eliminar la partida: ${item.apuData.descripcion_tecnica.slice(0, 100)}?`)) return;
  project.items = project.items.filter((entry) => entry.id !== id);
  addAudit('ITEM_DELETED', item.apuData.descripcion_tecnica.slice(0, 160));
  renderAll();
  saveLocal('Partida eliminada');
}

function makeActionButton(label, handler, className = 'row-action') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderBudget() {
  const body = $('budgetBody');
  body.innerHTML = '';
  const query = text($('budgetSearch').value, 100).toLowerCase();
  let subtotal = 0;
  project.items.forEach((item, index) => {
    const calculation = calculateApu(item.apuData, project.config);
    subtotal += calculation.subtotal;
    if (query && !`${item.apuData.covenin} ${item.apuData.descripcion_tecnica}`.toLowerCase().includes(query)) return;
    const row = document.createElement('tr');
    row.className = item.status === 'APROBADO' ? 'approved-row' : 'draft-row';
    const values = [
      index + 1,
      item.apuData.covenin,
      item.apuData.descripcion_tecnica,
      item.apuData.unidad,
      formatNumber(item.apuData.cantidad),
      formatMoney(calculation.unitContract),
      formatMoney(calculation.subtotal)
    ];
    values.forEach((value) => makeCell(row, value));
    const actions = makeCell(row, '', 'no-print');
    actions.append(makeActionButton('Editar', () => editItem(item.id)));
    actions.append(makeActionButton('Borrar', () => deleteItem(item.id), 'row-remove'));
    body.append(row);
  });
  const tax = subtotal * project.config.taxPct / 100;
  $('budgetSubtotal').textContent = formatMoney(subtotal);
  $('taxLabel').textContent = `IMPUESTO ${formatNumber(project.config.taxPct)}%`;
  $('budgetTax').textContent = formatMoney(tax);
  $('budgetGrandTotal').textContent = formatMoney(subtotal + tax);
  $('emptyBudget').classList.toggle('hidden', project.items.length > 0);
}

function logoHtml() {
  return project.logo ? `<img src="${project.logo}" alt="Logo SEINCA">` : 'SEINCA';
}

function resourceRowsHtml(rows, type, apu) {
  const rendimiento = Math.max(0.000001, apu.rendimiento || 1);
  return (rows || []).map((row) => {
    const description = type === 'mo' ? row.cargo : row.desc;
    const unit = type === 'materiales' ? row.und : 'día';
    const price = type === 'materiales' ? row.precio : type === 'equipos' ? row.tarifa : row.jornal;
    let partial = number(row.cant) * number(price);
    if (type !== 'materiales') partial /= rendimiento;
    if (type === 'mo') partial *= 1 + apu.fcas / 100;
    return `<tr><td>${escapeHtml(description)}</td><td>${escapeHtml(unit)}</td><td>${formatNumber(row.cant)}</td><td>${formatMoney(price)}</td><td>${escapeHtml(row.fuente_precio || '')}</td><td>${escapeHtml(row.fecha_precio || '')}</td><td>${formatMoney(partial)}</td></tr>`;
  }).join('');
}

function renderApuPages() {
  const container = $('apuPages');
  container.innerHTML = '';
  project.items.forEach((item, index) => {
    const apu = item.apuData;
    const calculation = calculateApu(apu, project.config);
    const validation = validateApu(apu, project.config, { stage: item.status === 'APROBADO' ? 'approve' : 'draft' });
    const page = document.createElement('article');
    page.className = 'paper';
    page.innerHTML = `
      <header class="document-header"><div class="document-logo">${logoHtml()}</div><div class="company-block"><strong>SEINCA</strong><span>SERVICIOS INTEGRALES</span><span>RIF: J-297575472</span></div></header>
      <h2 class="document-title">ANÁLISIS DE PRECIO UNITARIO · PARTIDA ${index + 1}</h2>
      <div class="apu-meta">
        <div><strong>ESTADO</strong><span class="apu-state ${item.status === 'APROBADO' ? 'approved' : 'draft'}">${item.status}</span></div>
        <div><strong>COVENIN</strong>${escapeHtml(apu.covenin)}</div>
        <div><strong>UNIDAD</strong>${escapeHtml(apu.unidad)}</div>
        <div><strong>CANT. / REND.</strong>${formatNumber(apu.cantidad)} / ${formatNumber(apu.rendimiento)}</div>
      </div>
      <table class="info-table"><tr><th>DESCRIPCIÓN</th><td>${escapeHtml(apu.descripcion_tecnica)}</td></tr></table>
      <h3 class="apu-section-title">MATERIALES</h3><table class="document-table"><thead><tr><th>Descripción</th><th>Und.</th><th>Cant.</th><th>Precio</th><th>Fuente</th><th>Fecha</th><th>Parcial</th></tr></thead><tbody>${resourceRowsHtml(apu.materiales, 'materiales', apu)}</tbody></table>
      <h3 class="apu-section-title">EQUIPOS</h3><table class="document-table"><thead><tr><th>Descripción</th><th>Und.</th><th>Cant.</th><th>Tarifa</th><th>Fuente</th><th>Fecha</th><th>Parcial</th></tr></thead><tbody>${resourceRowsHtml(apu.equipos, 'equipos', apu)}</tbody></table>
      <h3 class="apu-section-title">MANO DE OBRA</h3><table class="document-table"><thead><tr><th>Cargo</th><th>Und.</th><th>Cant.</th><th>Jornal</th><th>Fuente</th><th>Fecha</th><th>Parcial + FCAS</th></tr></thead><tbody>${resourceRowsHtml(apu.mo, 'mo', apu)}</tbody></table>
      <table class="document-summary"><tr><th>COSTO DIRECTO</th><td>${formatMoney(calculation.direct)}</td></tr><tr><th>INDIRECTOS</th><td>${formatMoney(calculation.indirect)}</td></tr><tr><th>PRECIO UNITARIO</th><td>${formatMoney(calculation.unitContract)}</td></tr></table>
      <div class="apu-notes"><div><strong>MEMORIA</strong><p>${escapeHtml(apu.memoria_calculo || 'No indicada.')}</p><strong>RENDIMIENTO</strong><p>${escapeHtml(apu.justificacion_rendimiento || 'No indicado.')}</p></div><div><strong>ADVERTENCIAS</strong><ul>${(validation.warnings.length ? validation.warnings : ['Sin advertencias.']).map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul><strong>MOTOR</strong><p>${escapeHtml(item.aiMeta?.modelo || 'Manual')}</p></div></div>
      <footer class="document-footer"><span>${stableHash({ id: item.id, apu })}</span><span>Partida ${index + 1} · ${APP_VERSION}</span></footer>`;
    container.append(page);
  });
}

function renderAll() {
  project.items = (project.items || []).map(normalizeProjectItem);
  const general = project.general;
  $('docCode').textContent = general.code || 'S/C';
  $('docRevision').textContent = general.revision || '0';
  $('docProject').textContent = general.obra || '';
  $('docClient').textContent = general.cliente || '';
  $('docDate').textContent = general.fecha || '';
  $('docLocation').textContent = general.ubicacion || '';
  $('docStatus').textContent = general.status || 'BORRADOR';
  $('documentLogo').innerHTML = logoHtml();
  $('documentHash').textContent = stableHash({ general, config: project.config, items: project.items.map((item) => item.apuData) });
  $('documentVersion').textContent = `${APP_VERSION} · ${project.items.length} partida(s)`;
  $('versionLabel').textContent = `${APP_VERSION} · Esquema ${PROJECT_SCHEMA_VERSION}`;
  renderBudget();
  renderApuPages();
  recalculateEditor();
}

async function generateApu() {
  syncProjectFromForm(false);
  const prompt = text($('prompt').value, 16000);
  if (prompt.length < 15) {
    setNotice('Describe la partida con mayor precisión.', 'error');
    return;
  }
  $('aiLoader').classList.remove('hidden');
  $('generateApu').disabled = true;
  setHealth('IA calculando…', 'busy');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 59000);
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        prompt,
        provider: $('providerMode').value,
        tipoCliente: $('clientType').value,
        altura: number($('height').value),
        config: project.config,
        catalog: (project.catalog || []).filter((item) => item.verificado).slice(0, 120)
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const attempts = (payload?.intentos || []).map((item) => `${item.provider} ${item.model}: ${item.message}`).join('\n');
      throw new Error(`${payload?.detalle || payload?.error || response.status}${attempts ? `\n${attempts}` : ''}`);
    }
    const normalized = normalizeApu(payload.data, prompt, payload.modelo);
    const withCatalog = applyCatalog(normalized, project.catalog);
    aiMetadata = {
      modelo: payload.modelo,
      motor: payload.motor,
      requestId: payload.requestId,
      generatedAt: new Date().toISOString(),
      warnings: (payload.advertencias_motor || []).map((item) => item.message)
    };
    editingItemId = null;
    fillEditor(withCatalog);
    $('requestId').textContent = payload.requestId || '';
    setNotice(`APU generado con ${payload.modelo}. Debe ser revisado antes de aprobarse.`, 'success');
    await checkHealth();
  } catch (error) {
    setNotice(`No se pudo generar: ${error.name === 'AbortError' ? 'La solicitud agotó el tiempo disponible.' : text(error.message, 3000)}`, 'error');
    setHealth('Error de IA', 'error');
  } finally {
    clearTimeout(timeout);
    $('aiLoader').classList.add('hidden');
    $('generateApu').disabled = false;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function saveProjectJson() {
  syncProjectFromForm(false);
  downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `SEINCA_${text(project.general.obra, 50).replace(/\W+/g, '_') || 'proyecto'}.json`);
}

function loadProjectJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      project = migrateProject(JSON.parse(reader.result));
      fillProjectForm();
      renderCatalog();
      clearEditor();
      renderAll();
      saveLocal('Proyecto importado');
      setNotice('Proyecto cargado correctamente.', 'success');
    } catch (error) {
      setNotice(`Archivo inválido: ${error.message}`, 'error');
    }
  };
  reader.readAsText(file);
}

async function exportPdf() {
  syncProjectFromForm(false);
  if (!project.items.length) {
    setNotice('No hay partidas para exportar.', 'error');
    return;
  }
  try {
    $('exportPdf').disabled = true;
    const response = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detalle || payload.error || response.status);
    }
    downloadBlob(await response.blob(), `SEINCA_${text(project.general.obra, 50).replace(/\W+/g, '_') || 'presupuesto'}.pdf`);
    setNotice('PDF profesional generado en el servidor.', 'success');
  } catch (error) {
    setNotice(`Error al generar PDF: ${error.message}`, 'error');
  } finally {
    $('exportPdf').disabled = false;
  }
}

function exportCsv() {
  const rows = [['N', 'Estado', 'COVENIN', 'Descripción', 'Unidad', 'Cantidad', 'Precio unitario', 'Total']];
  project.items.forEach((item, index) => {
    const calculation = calculateApu(item.apuData, project.config);
    rows.push([index + 1, item.status, item.apuData.covenin, item.apuData.descripcion_tecnica, item.apuData.unidad, item.apuData.cantidad, calculation.unitContract, calculation.subtotal]);
  });
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  downloadBlob(new Blob(['\uFEFF', csv], { type: 'text/csv' }), 'SEINCA_presupuesto.csv');
}

function showHistory() {
  const container = $('historyList');
  container.innerHTML = '';
  let history = [];
  try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { }
  history.forEach((snapshot) => {
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    entry.innerHTML = `<div><strong>${escapeHtml(snapshot.reason)}</strong><div class="subtle">${new Date(snapshot.at).toLocaleString('es-VE')} · ${snapshot.hash}</div></div>`;
    entry.append(makeActionButton('Restaurar', () => {
      const currentLogo = project.logo;
      project = migrateProject(snapshot.project);
      if (snapshot.keepLogo) project.logo = currentLogo;
      fillProjectForm();
      renderCatalog();
      clearEditor();
      renderAll();
      $('historyDialog').close();
    }));
    container.append(entry);
  });
  if (!history.length) container.textContent = 'No hay versiones guardadas.';
  $('historyDialog').showModal();
}

function loadCatalogFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const incoming = Array.isArray(data) ? data : data.catalog;
      if (!Array.isArray(incoming)) throw new Error('Formato de catálogo inválido.');
      const map = new Map((project.catalog || []).map((item) => [catalogKey(item.type, item.desc, item.und), item]));
      incoming.forEach((item) => map.set(catalogKey(item.type, item.desc, item.und), item));
      project.catalog = [...map.values()];
      renderCatalog();
      saveLocal('Catálogo importado');
      setNotice('Catálogo importado.', 'success');
    } catch (error) {
      setNotice(error.message, 'error');
    }
  };
  reader.readAsText(file);
}

async function checkHealth() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const payload = await response.json();
    const openai = payload.providers?.openai?.ok;
    const gemini = payload.providers?.gemini?.ok;
    if (openai && gemini) setHealth('OpenAI + Gemini operativos');
    else if (openai) setHealth('OpenAI operativo · Gemini pendiente', 'warn');
    else if (gemini) setHealth('Gemini operativo · OpenAI pendiente', 'warn');
    else setHealth('IA no disponible', 'error');
  } catch {
    setHealth('No se pudo verificar la IA', 'warn');
  }
}

function bindEvents() {
  const projectFields = [
    'projectCode', 'projectRevision', 'projectStatus', 'projectDate', 'projectName', 'clientName',
    'projectLocation', 'validityDays', 'paymentTerms', 'projectNotes', 'currency', 'workdayHours',
    'clientFactor', 'defaultFcas', 'administrationPct', 'contingencyPct', 'profitPct', 'financingPct',
    'taxPct', 'maxPriceAgeDays', 'requireVerifiedPrices'
  ];
  projectFields.forEach((id) => $(id).addEventListener('input', () => {
    syncProjectFromForm();
    saveLocal('Proyecto');
  }));

  const editorFields = [
    'covenin', 'coveninVerified', 'unit', 'quantity', 'rendimiento', 'fcas', 'technicalDescription',
    'calculationMemory', 'performanceJustification', 'executionCriteria', 'assumptions', 'exclusions',
    'technicalReview'
  ];
  editorFields.forEach((id) => $(id).addEventListener('input', () => {
    recalculateEditor();
    saveLocal('APU');
  }));

  document.querySelectorAll('[data-add-resource]').forEach((button) => button.addEventListener('click', () => addResourceRow(button.dataset.addResource)));
  $('generateApu').addEventListener('click', generateApu);
  $('saveDraftItem').addEventListener('click', () => saveItem('draft'));
  $('approveItem').addEventListener('click', () => saveItem('approve'));
  $('clearEditor').addEventListener('click', clearEditor);
  $('saveProject').addEventListener('click', saveProjectJson);
  $('loadProjectButton').addEventListener('click', () => $('loadProjectFile').click());
  $('loadProjectFile').addEventListener('change', (event) => loadProjectJson(event.target.files[0]));
  $('exportPdf').addEventListener('click', exportPdf);
  $('exportCsv').addEventListener('click', exportCsv);
  $('printDocument').addEventListener('click', () => window.print());
  $('budgetSearch').addEventListener('input', renderBudget);
  $('undoSnapshot').addEventListener('click', showHistory);
  $('newProject').addEventListener('click', () => {
    if (!confirm('¿Crear un proyecto nuevo?')) return;
    createSnapshot('Proyecto anterior');
    project = newProject();
    fillProjectForm();
    renderCatalog();
    clearEditor();
    renderAll();
    saveLocal('Proyecto nuevo');
  });
  $('resetConfig').addEventListener('click', () => {
    project.config = { ...DEFAULT_CONFIG };
    fillProjectForm();
    renderAll();
    saveLocal('Configuración restablecida');
  });
  $('addCatalogRow').addEventListener('click', () => {
    addCatalogRow({ fecha: isoDate() });
    project.catalog = readCatalogRows();
    saveLocal('Catálogo');
  });
  $('exportCatalog').addEventListener('click', () => downloadBlob(new Blob([JSON.stringify({ catalog: readCatalogRows() }, null, 2)], { type: 'application/json' }), 'SEINCA_catalogo.json'));
  $('importCatalogButton').addEventListener('click', () => $('importCatalogFile').click());
  $('importCatalogFile').addEventListener('change', (event) => loadCatalogFile(event.target.files[0]));
  $('logoInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file || file.size > 1_200_000) {
      setNotice('El logotipo debe ser PNG/JPG y pesar menos de 1,2 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      project.logo = reader.result;
      renderAll();
      saveLocal('Logotipo');
    };
    reader.readAsDataURL(file);
  });
}

project.items = (project.items || []).map(normalizeProjectItem);
fillProjectForm();
renderCatalog();
fillEditor(emptyApu());
bindEvents();
renderAll();
checkHealth();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
