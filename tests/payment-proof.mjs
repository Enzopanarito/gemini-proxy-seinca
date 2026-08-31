import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeWithHealthyModels,
  callGemini,
  clearPaymentModelCache,
  compatiblePaymentModels,
  discoverPaymentModels,
  thinkingConfigFor
} from '../api/payment-proof.js';

const VALID_RAW = JSON.stringify({
  method: 'MOBILE_PAYMENT_VE',
  bank_or_platform: 'Mercantil',
  amount: 95074,
  currency: 'VES',
  transaction_date: '2026-08-31',
  transaction_time: '09:37:39',
  reference: '10400401',
  transaction_status: 'COMPLETED',
  recipient_name: 'Enzo Urb',
  recipient_phone: '0414-0554700',
  recipient_email: null,
  recipient_account_visible: null,
  memo: 'Condominio Casa 15',
  confidence: 0.98,
  critical_fields_visible: true,
  warnings: [],
  possible_visual_modification: false
});

test.beforeEach(() => clearPaymentModelCache());

test('prioriza modelos Flash-Lite estables reportados por el catálogo oficial', () => {
  const models = compatiblePaymentModels([
    { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.7-flash-preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.1-flash-image-preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }
  ]);
  assert.deepEqual(models, ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash']);
});

test('usa el control de razonamiento correcto según la familia Gemini', () => {
  assert.deepEqual(thinkingConfigFor('gemini-3.5-flash'), { thinkingLevel: 'minimal' });
  assert.deepEqual(thinkingConfigFor('gemini-2.5-flash-lite'), { thinkingBudget: 0 });
});

test('consulta el catálogo vivo y conserva la selección durante el día', async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({ models: [
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] }
    ] }) };
  };
  const first = await discoverPaymentModels({ apiKey: 'test', fetchFn, now: () => 1000 });
  const second = await discoverPaymentModels({ apiKey: 'test', fetchFn, now: () => 2000 });
  assert.equal(first.models[0], 'gemini-2.5-flash-lite');
  assert.equal(second.source, 'memory-catalog');
  assert.equal(calls, 1);
});

test('dos modelos se prueban en paralelo y gana el primero que devuelve lectura válida', async () => {
  const calls = [];
  const result = await analyzeWithHealthyModels({
    apiKey: 'test',
    models: ['gemini-3.6-flash', 'gemini-3.5-flash'],
    content: 'base64',
    contentType: 'image/jpeg',
    callFn: async ({ model }) => {
      calls.push(model);
      if (model === 'gemini-3.6-flash') throw Object.assign(new Error('timeout'), { code: 'TIMEOUT', status: 408 });
      return VALID_RAW;
    }
  });
  assert.deepEqual(calls.sort(), ['gemini-3.5-flash', 'gemini-3.6-flash']);
  assert.equal(result.model, 'gemini-3.5-flash');
  assert.equal(JSON.parse(result.raw).reference, '10400401');
});

test('la petición Gemini elimina muestreo obsoleto y usa pensamiento mínimo', async () => {
  let requestBody = null;
  const raw = await callGemini({
    apiKey: 'test',
    model: 'gemini-3.5-flash',
    content: 'base64',
    contentType: 'image/jpeg',
    promptVersion: 'test',
    fetchFn: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: VALID_RAW }] } }] }) };
    }
  });
  assert.equal(raw, VALID_RAW);
  assert.equal(requestBody.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  assert.equal('temperature' in requestBody.generationConfig, false);
  assert.equal(requestBody.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
});
