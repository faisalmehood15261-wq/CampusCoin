// The canonical public origin of the web client, used to build links that leave the API
// (password resets). CLIENT_URL itself is a CORS allow-list and may hold several origins,
// so only its first entry is meaningful here - never interpolate the whole list into a URL.
const FALLBACK_APP_URL = 'https://campus-coin-client.vercel.app';

export function publicAppUrl() {
  const [first] = String(process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return (first || FALLBACK_APP_URL).replace(/\/+$/, '');
}
