import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { Category, DEFAULT_CATEGORIES, ActivityLog, PasswordReset, User } from '../models/index.js';
import { asyncHandler, cleanUser, fail } from '../utils/http.js';
import { clearSession, setSession } from '../utils/auth.js';
import { sendMail } from '../services/emailService.js';

async function ensureDefaultCategories() { const defaults = await Category.countDocuments({ isDefault: true }); if (!defaults) await Category.insertMany(DEFAULT_CATEGORIES.map(([name, type, icon]) => ({ name, type, icon, isDefault: true }))); }
const recordLogin = (userId) => ActivityLog.create({ userId, action: 'login', entityType: 'session' });
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, confirmPassword, academicYear, monthlyAllowance, savingsGoal } = req.body;
  if (!name || !email || !password) throw fail('Name, email, and password are required.');
  if (password.length < 8) throw fail('Use a password with at least 8 characters.');
  if (password !== confirmPassword) throw fail('Passwords do not match.');
  const normalized = String(email).trim().toLowerCase(); if (await User.exists({ email: normalized })) throw fail('An account already exists for this email.', 409);
  await ensureDefaultCategories();
  const user = await User.create({ name, email: normalized, passwordHash: await bcrypt.hash(password, 12), academicYear, monthlyAllowance: Number(monthlyAllowance) || 0, savingsGoal: Number(savingsGoal) || 0 });
  setSession(req, res, user); await recordLogin(user._id); res.status(201).json({ success: true, user: cleanUser(user) });
});
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body; const user = await User.findOne({ email: String(email || '').trim().toLowerCase() }).select('+passwordHash');
  if (!user || user.role === 'admin' || !user.passwordHash || !(await bcrypt.compare(password || '', user.passwordHash))) throw fail('Invalid email or password.', 401);
  if (!user.isActive) throw fail('This account has been disabled. Contact your administrator.', 403);
  user.lastLoginAt = new Date(); await user.save(); setSession(req, res, user); await recordLogin(user._id); res.json({ success: true, user: cleanUser(user) });
});
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').trim().toLowerCase() }).select('+passwordHash');
  // Keep this response deliberately generic: it must not disclose whether an account exists.
  if (!user || user.role !== 'admin' || !user.passwordHash || !(await bcrypt.compare(password || '', user.passwordHash))) {
    throw fail('Invalid administrator credentials.', 401);
  }
  if (!user.isActive) throw fail('This account has been disabled. Contact your administrator.', 403);
  user.lastLoginAt = new Date(); await user.save();
  setSession(req, res, user); await recordLogin(user._id);
  res.json({ success: true, user: cleanUser(user) });
});
export const google = asyncHandler(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) throw fail('Google sign-in is not configured.', 503); const { credential } = req.body; if (!credential) throw fail('Google credential is required.');
  const ticket = await new OAuth2Client(process.env.GOOGLE_CLIENT_ID).verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID }); const profile = ticket.getPayload();
  if (!profile?.sub || !profile.email || !profile.email_verified) throw fail('Google did not return a verified email.', 401);
  await ensureDefaultCategories(); let user = await User.findOne({ $or: [{ googleId: profile.sub }, { email: profile.email.toLowerCase() }] });
  if (user && !user.googleId) { user.googleId = profile.sub; user.authProvider = 'google'; user.avatar ||= profile.picture; await user.save(); }
  if (!user) user = await User.create({ name: profile.name || profile.email.split('@')[0], email: profile.email.toLowerCase(), googleId: profile.sub, avatar: profile.picture, authProvider: 'google' });
  if (!user.isActive) throw fail('This account has been disabled. Contact your administrator.', 403);
  user.lastLoginAt = new Date(); await user.save(); setSession(req, res, user); await recordLogin(user._id); res.json({ success: true, user: cleanUser(user) });
});
export const logout = asyncHandler(async (req, res) => { clearSession(req, res); res.json({ success: true }); });
export const me = asyncHandler(async (req, res) => res.json({ success: true, user: cleanUser(req.user) }));
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();

  const user = await User.findOne({ email });

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');

    await PasswordReset.deleteMany({
      userId: user._id
    });

    await PasswordReset.create({
      userId: user._id,
      tokenHash: crypto
        .createHash('sha256')
        .update(token)
        .digest('hex'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const link = `${
      process.env.CLIENT_URL || 'https://studentscampuscoin.netlify.app'
    }/reset-password/${token}`;

    await sendMail({
      to: user.email,
      subject: 'Reset your Campus Coin password',
      text: `Use this link within one hour: ${link}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Reset your Campus Coin password</h2>
          <p>Click the button below to reset your password.</p>
          <p>
            <a
              href="${link}"
              style="
                display:inline-block;
                padding:12px 20px;
                background:#2563eb;
                color:#ffffff;
                text-decoration:none;
                border-radius:8px;
              "
            >
              Reset Password
            </a>
          </p>
          <p>This link will expire in one hour.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `
    });

    console.log(`Password reset email sent to ${user.email}`);
  }

  res.json({
    success: true,
    message: 'If an eligible account exists, a password reset link has been sent.'
  });
});
export const resetPassword = asyncHandler(async (req, res) => { const { token, password, confirmPassword } = req.body; if (!token || !password || password !== confirmPassword || password.length < 8) throw fail('Provide matching passwords with at least 8 characters.'); const tokenHash = crypto.createHash('sha256').update(token).digest('hex'); const reset = await PasswordReset.findOne({ tokenHash, expiresAt: { $gt: new Date() } }); if (!reset) throw fail('This reset link is invalid or expired.', 400); const user = await User.findById(reset.userId).select('+passwordHash'); if (!user || !user.isActive) throw fail('This reset link is invalid or expired.', 400); user.passwordHash = await bcrypt.hash(password, 12); user.authProvider = user.googleId ? user.authProvider : 'local'; await user.save(); await PasswordReset.deleteMany({ userId: user._id }); clearSession(req, res); res.json({ success: true, message: 'Password updated. Please sign in.' }); });
