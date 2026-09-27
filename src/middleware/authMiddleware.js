import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { asyncHandler, fail } from '../utils/http.js';

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies.campus_coin_session;
  if (!token) throw fail('Authentication required.', 401);
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw fail('Your session is no longer active.', 401);
  req.user = user; next();
});
export const requireAdmin = (req, _res, next) => req.user?.role === 'admin' ? next() : next(fail('Administrator access required.', 403));
