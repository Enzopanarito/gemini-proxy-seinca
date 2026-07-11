import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const html = read('index.html');
const app = read('app.js');
const core = read('lib/apu-core.js');
const api = read('api/gemini.js');
const pdf = read('api/pdf.js');
const health = read('api/health.js');
const css = read('styles.css');
const serviceWorker = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const vercel = JSON.parse(read('vercel.json'));
let failed = false;

function fail(message) {
  console.error(`ERROR: ${message}`);
  failed = true;
}

function requireTokens(source, tokens, label) {
  for (const token of tokens) if (!source.includes(token)) fail(`${label}: falta ${token}`);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) fail(`IDs duplicados: ${[...new Set(duplicates)].join(', ')}`);

const referencedIds = [...app.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
const missingIds = [...new Set(referencedIds.filter((id) => !ids.includes(id)))];
if (missingIds.length) fail(`IDs usados por app.js y ausentes en HTML: ${missingIds.join(', ')}`);

requireTokens(html, [
  '/styles.css', '/app.js', 'Ingeniero Civil responsable del presupuesto · SEINCA',
  'Catálogo trazable de precios', 'PDF profesional', 'Confirmo que un profesional revisó'
], 'Frontend');
requireTokens(app, [
  'validateApu', 'applyCatalog', "fetch('/api/pdf'", "fetch('/api/health'", "fetch('/api/gemini'",
  'createSnapshot', 'technicalReview', 'APROBADO', 'BORRADOR'
], 'Aplicación');
requireTokens(core, [
  "APP_VERSION = '5.0.0-enterprise-foundation'", 'calculateApu', 'validateApu', 'stableHash',
  'requireVerifiedPricesForApproval', 'No se agregó'
], 'Núcleo');
requireTokens(api, [
  'APP_VERSION', 'gpt-5.6', 'gemini-3.5-flash', '/v1beta/interactions', 'response_format',
  'runProvider', 'validateApu', 'requestId'
], 'API IA');
requireTokens(pdf, [
  'PDFDocument', 'stableHash', 'Content-Disposition', 'Ingeniero Civil responsable del presupuesto',
  'X-SEINCA-Document-Hash'
], 'PDF');
requireTokens(health, [
  'gpt-5.6', 'gemini-3.5-flash', "mode: openai.ok && gemini.ok ? 'hybrid'"
], 'Salud');
requireTokens(css, ['@media print', '.paper', '.quality-panel', '.editor-table'], 'CSS');
requireTokens(serviceWorker, ['seinca-enterprise-v5', "url.pathname.startsWith('/api/')"], 'PWA');

if (manifest.start_url !== '/' || manifest.display !== 'standalone') fail('Manifest PWA incompleto.');
if (!vercel.functions?.['api/pdf.js'] || !vercel.functions?.['api/gemini.js'] || !vercel.functions?.['api/health.js']) fail('Vercel no configura las funciones críticas.');
if (failed) process.exit(1);
console.log(`SEINCA Enterprise validado: ${ids.length} IDs, ${referencedIds.length} referencias DOM, motor determinístico, IA híbrida, PDF servidor y PWA.`);
