import { GoogleGenAI } from '@google/genai';

export function getGemini() {
  const raw = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const apiKey = raw.trim().replace(/^["']|["']$/g, '');

  if (!apiKey) {
    throw Object.assign(
      new Error(
        'GEMINI_API_KEY missing. Add GEMINI_API_KEY to server/.env and restart the server.'
      ),
      { statusCode: 503 }
    );
  }

  return new GoogleGenAI({ apiKey });
}