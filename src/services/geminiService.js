import { getGemini } from '../config/gemini.js';
import { getGroq } from '../config/groq.js';

// Multiple models add kar diye hain taake ek fail ho toh dusra chal jaye
const MODEL_FALLBACKS = [
  'gemini-3.8-flash',
  'gemini-3.8-pro'
];

function extractText(response) {
  if (!response) return '';

  if (typeof response.text === 'string' && response.text.trim()) {
    return response.text.trim();
  }

  if (typeof response.text === 'function') {
    try {
      const t = response.text();
      if (t && String(t).trim()) return String(t).trim();
    } catch {}
  }

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (Array.isArray(parts) && parts.length) {
    const joined = parts.map(p => p?.text || '').join('').trim();
    if (joined) return joined;
  }

  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  return '';
}

function isAuthError(err) {
  if (!err) return false;
  if (err.status === 401 || err.statusCode === 401 || err.status === 403) return true;
  const msg = String(err.message || '');
  return /UNAUTHENTICATED|ACCESS_TOKEN_TYPE_UNSUPPORTED|API[_ ]?key|PERMISSION_DENIED|invalid.*credential|API_KEY_INVALID/i.test(
    msg
  );
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function reportProvider(options, provider, model) {
  options.onProvider?.({ provider, model });
}

async function askGroq(prompt) {
  const groq = getGroq();
  const model = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';
  const response = await groq.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 1024,
  });
  const text = response.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${model}: empty response`);
  return { text, model };
}

export async function askGemini(prompt, options = {}) {
  let ai;
  try {
    ai = getGemini();
  } catch (err) {
    console.warn('[Gemini] Configuration unavailable:', err.message);
  }

  const errors = [];

  if (ai) {
    for (const model of MODEL_FALLBACKS) {
      let retries = 2;

      while (retries > 0) {
        try {
          console.log(`[Gemini] Trying model: ${model}`);
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { temperature: 0.2, maxOutputTokens: 1024 },
          });
          const text = extractText(response);
          if (text) {
            reportProvider(options, 'gemini', model);
            return text;
          }
          errors.push(`${model}: empty response (no text/candidates)`);
          break;
        } catch (err) {
          errors.push(`${model}: ${err?.message || String(err)}`);
          if (isAuthError(err)) break;

          if (err.status === 'UNAVAILABLE' || err.statusCode === 503 || String(err.message).includes('503')) {
            retries -= 1;
            if (retries > 0) await delay(2000);
          } else {
            break;
          }
        }
      }
    }
  }

  try {
    const { text, model } = await askGroq(prompt);
    console.log(`[Groq] Success with ${model}`);
    reportProvider(options, 'groq', model);
    return text;
  } catch (err) {
    const note = `Groq: ${err?.message || String(err)}`;
    console.warn('[Groq] Fallback unavailable:', note);
    errors.push(note);
  }

  if (options.fallbackHandler) {
    reportProvider(options, 'rules', null);
    return options.fallbackHandler(prompt);
  }

  throw Object.assign(
    new Error(`Gemini and Groq requests failed. ${errors.join(' | ')}`),
    { statusCode: 502 }
  );
}