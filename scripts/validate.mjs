import fs from 'node:fs';
import vm from 'node:vm';

const indexPath = new URL('../index.html', import.meta.url);
const apiPath = new URL('../api/gemini.js', import.meta.url);
const html = fs.readFileSync(indexPath, 'utf8');
const api = fs.readFileSync(apiPath, 'utf8');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);

if (!scripts.length) {
  fail('No se encontró el JavaScript monolítico de index.html.');
} else {
  try {
    new vm.Script(scripts.at(-1), { filename: 'index.html:inline.js' });
  } catch (error) {
    fail(`JavaScript inválido en index.html: ${error.message}`);
  }
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) fail(`IDs duplicados: ${[...new Set(duplicates)].join(', ')}`);

const referencedIds = [...scripts.join('\n').matchAll(/byId\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
const missingIds = [...new Set(referencedIds.filter((id) => !ids.includes(id)))];
if (missingIds.length) fail(`IDs usados por JavaScript y ausentes en el DOM: ${missingIds.join(', ')}`);

const requiredFrontendTokens = [
  'function calculateApu()',
  'function saveItemToBudget()',
  'function exportPdf()',
  'const STATE_FACTOR = 3;',
  "const IVA_RATE = 0.16;"
];
for (const token of requiredFrontendTokens) {
  if (!html.includes(token)) fail(`Falta componente crítico del frontend: ${token}`);
}

const requiredApiTokens = [
  "'gemini-3.5-flash'",
  'const APU_SCHEMA',
  'response_format:',
  'thinking_level:',
  'checkRateLimit(req)',
  'covenin="POR VERIFICAR"'
];
for (const token of requiredApiTokens) {
  if (!api.includes(token)) fail(`Falta componente crítico del backend: ${token}`);
}

if (!process.exitCode) {
  console.log(`SEINCA validado: ${ids.length} IDs únicos, ${referencedIds.length} referencias DOM y sintaxis correcta.`);
}
