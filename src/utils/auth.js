import jwt from 'jsonwebtoken';

// A cross-site session cookie must be Secure + SameSite=None, otherwise the browser drops it
// on every request coming from the Netlify origin: each authenticated call answers 401 and a
// reload signs the student out. Derive this from the request rather than NODE_ENV, because a
// deployed function does not always report NODE_ENV=production and guessing wrong is silent.
function isSecureRequest(req) {
  if (!req) return process.env.NODE_ENV === 'production';
  if (req.secure) return true;
  const forwarded = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwarded === 'https';
}

function sessionCookie(req) {
  const secure = isSecureRequest(req);
  return { httpOnly: true, secure, sameSite: secure ? 'none' : 'lax', path: '/' };
}

export function cookieOptions(req) {
  return { ...sessionCookie(req), maxAge: 1000 * 60 * 60 * 24 * 7 };
}

export function setSession(req, res, user) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is required.');
  const token = jwt.sign({ sub: user._id.toString(), role: user.role }, secret, { expiresIn: '7d' });
  res.cookie('campus_coin_session', token, cookieOptions(req));
}

export function clearSession(req, res) {
  res.clearCookie('campus_coin_session', sessionCookie(req));
}
