const DOCS = [
  { no: '01', key: 'indice', type: 'Control documental', title: 'Índice de entrega', description: 'Relación de documentos, revisiones y páginas.' },
  { no: '02', key: 'dossier', type: 'Resumen ejecutivo', title: 'Dossier ejecutivo', description: 'Alcance, inversión, plazo, riesgos y ruta de aprobación.' },
  { no: '03', key: 'presupuesto', type: 'Documento económico', title: 'Presupuesto, APU y cómputos métricos', description: '48 partidas, análisis unitarios y trazabilidad de cantidades.' },
  { no: '04', key: 'memoria', type: 'Documento técnico', title: 'Memoria descriptiva e informe técnico', description: 'Justificación integral del alcance, metodología y monto.' },
  { no: '05', key: 'computos', type: 'Anexo técnico', title: 'Cómputos métricos', description: 'Fórmulas, mediciones y niveles de certeza por partida.' },
  { no: '06', key: 'acabados', type: 'Control de acabados', title: 'Aprobación de acabados', description: 'Porcelanato, revestimientos, pinturas, luminarias y paisajismo.' },
  { no: '07', key: 'acta', type: 'Control contractual', title: 'Acta de aceptación', description: 'Documento para formalizar la aceptación de la propuesta.' }
];

const PLANS = [
  { no: 'P00', key: 'presentacion', title: 'Presentación del proyecto', asset: 'hero' },
  { no: 'P01', key: 'planta', title: 'Planta general', asset: 'planta' },
  { no: 'P02', key: 'techo', title: 'Planta de techo', asset: 'techo' },
  { no: 'P03', key: 'luminarias', title: 'Replanteo, piso y luminarias', asset: 'luces' },
  { no: 'P04', key: 'cortes', title: 'Cortes A-A y B-B', asset: 'planta' },
  { no: 'P05', key: 'revestimientos', title: 'Revestimientos', asset: 'render' }
];

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
const mediaUrl = key => `/api/onix-media?key=${encodeURIComponent(key)}&v=21`;
const pdfUrl = key => `/api/onix-document?key=${encodeURIComponent(key)}`;
const downloadUrl = key => `${pdfUrl(key)}&download=1`;
const ASSETS = { logo: mediaUrl('logo'), hero: mediaUrl('hero'), render: mediaUrl('render'), planta: mediaUrl('planta'), luces: mediaUrl('luces'), techo: mediaUrl('techo') };

function buildCards() {
  const docGrid = $('#doc-grid');
  const planGrid = $('#plan-grid');
  if (docGrid) docGrid.innerHTML = DOCS.map(doc => `<article class="doc-card reveal"><span class="doc-no">${doc.no}</span><small>${doc.type}</small><h3>${doc.title}</h3><p>${doc.description}</p><div class="doc-actions"><a href="${pdfUrl(doc.key)}" target="_blank" rel="noopener">Abrir PDF ↗</a><a href="${downloadUrl(doc.key)}" target="_blank" rel="noopener" data-download>Descargar ↓</a></div></article>`).join('');
  if (planGrid) planGrid.innerHTML = PLANS.map(plan => `<article class="plan-card reveal"><img data-asset="${plan.asset}" alt="Vista previa: ${plan.title}" loading="lazy"><div><small>${plan.no}</small><h3>${plan.title}</h3><div class="plan-actions"><a href="${pdfUrl(plan.key)}" target="_blank" rel="noopener">Abrir PDF ↗</a><a href="${downloadUrl(plan.key)}" target="_blank" rel="noopener" data-download>Descargar ↓</a></div></div></article>`).join('');
}

function hydrateAssets() {
  $$('img[data-asset]').forEach(image => { image.src = ASSETS[image.dataset.asset] || ''; });
  $$('img[data-logo]').forEach(image => { image.src = ASSETS.logo; });
}

function initReveal() {
  const elements = $$('.reveal');
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { elements.forEach(element => element.classList.add('in')); return; }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in'); observer.unobserve(entry.target); } }), { threshold: 0.1 });
  elements.forEach(element => observer.observe(element));
}

function initNav() {
  const menu = $('#menu');
  const nav = $('#nav');
  if (!menu || !nav) return;
  menu.addEventListener('click', () => { const open = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); });
  $$('#nav a').forEach(link => link.addEventListener('click', () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }));
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (!entry.isIntersecting) return; $$('#nav a').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`)); }), { rootMargin: '-35% 0px -55%' });
  $$('main section[id]').forEach(section => observer.observe(section));
}

function initLightbox() {
  const modal = $('#lightbox');
  const image = $('#lightbox-img');
  const caption = $('#lightbox-caption');
  if (!modal || !image || !caption) return;
  $$('[data-lightbox-key]').forEach(button => button.addEventListener('click', () => { const source = ASSETS[button.dataset.lightboxKey]; if (!source) return showToast('La vista no está disponible.'); image.src = source; image.alt = button.dataset.caption || ''; caption.textContent = button.dataset.caption || ''; modal.hidden = false; document.body.style.overflow = 'hidden'; }));
  const close = () => { modal.hidden = true; document.body.style.overflow = ''; };
  $('[data-close]')?.addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });
}

function validateAssets() { $$('img').forEach(image => image.addEventListener('error', () => { image.classList.add('asset-error'); console.error('ONIX_ASSET_UNAVAILABLE', image.currentSrc || image.src); })); }
function initDownloads() { $$('[data-download]').forEach(link => link.addEventListener('click', () => showToast('Preparando la descarga del PDF oficial.'))); }
function showToast(text) { const toast = $('#toast'); if (!toast) return; toast.textContent = text; toast.classList.add('show'); window.clearTimeout(showToast.timeoutId); showToast.timeoutId = window.setTimeout(() => toast.classList.remove('show'), 2800); }

buildCards();
hydrateAssets();
initReveal();
initNav();
initLightbox();
validateAssets();
initDownloads();
