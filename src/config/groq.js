import Groq from 'groq-sdk';

export function getGroq() {
  const raw = process.env.GROQ_API_KEY || '';
  const apiKey = raw.trim().replace(/^['"]|['"]$/g, '');

  if (!apiKey) {
    throw Object.assign(
      new Error('GROQ_API_KEY missing. Add GROQ_API_KEY to server/.env and restart the server.'),
      { statusCode: 503 }
    );
  }

  return new Groq({ apiKey });
}