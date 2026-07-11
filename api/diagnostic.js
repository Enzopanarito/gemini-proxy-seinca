const OPENAI_MODELS = ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna'];
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

async function timedFetch(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw.slice(0, 600); }
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      error: response.ok ? null : String(body?.error?.message || body || '').slice(0, 700),
      body: response.ok ? body : undefined
    };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function testOpenAI(apiKey) {
  if (!apiKey) return { configured: false };
  const tests = [];
  for (const model of OPENAI_MODELS) {
    const result = await timedFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: 'Responde únicamente con la palabra OK.',
        reasoning: { effort: 'low' },
        max_output_tokens: 40,
        store: false
      })
    });
    tests.push({ model, ok: result.ok, status: result.status, ms: result.ms, error: result.error });
    if (result.ok) break;
  }
  return { configured: true, tests };
}

async function testGemini(apiKey) {
  if (!apiKey) return { configured: false };
  const tests = [];
  for (const model of GEMINI_MODELS) {
    const interactions = await timedFetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model,
        input: 'Responde únicamente con la palabra OK.',
        generation_config: { temperature: 0, max_output_tokens: 40 },
        store: false
      })
    });
    tests.push({ endpoint: 'interactions', model, ok: interactions.ok, status: interactions.status, ms: interactions.ms, error: interactions.error });
    if (interactions.ok) break;

    const generateContent = await timedFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Responde únicamente con la palabra OK.' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 40 }
      })
    });
    tests.push({ endpoint: 'generateContent', model, ok: generateContent.ok, status: generateContent.status, ms: generateContent.ms, error: generateContent.error });
    if (generateContent.ok) break;
  }
  return { configured: true, tests };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET solamente' });
  res.setHeader('Cache-Control', 'no-store');
  const [openai, gemini] = await Promise.all([
    testOpenAI(process.env.OPENAI_API_KEY),
    testGemini(process.env.GEMINI_API_KEY || process.env.GEMINT_API_KEY)
  ]);
  return res.status(200).json({ ok: true, timestamp: new Date().toISOString(), openai, gemini });
}
