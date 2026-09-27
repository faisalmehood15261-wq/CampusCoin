import jwt from 'jsonwebtoken';
export function cookieOptions() { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 1000 * 60 * 60 * 24 * 7, path: '/' }; }
export function setSession(res, user) { const secret = process.env.JWT_ACCESS_SECRET; if (!secret) throw new Error('JWT_ACCESS_SECRET is required.'); res.cookie('campus_coin_session', jwt.sign({ sub: user._id.toString(), role: user.role }, secret, { expiresIn: '7d' }), cookieOptions()); }
export function clearSession(res) { res.clearCookie('campus_coin_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', path: '/' }); }
