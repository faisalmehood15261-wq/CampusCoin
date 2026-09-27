export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const monthKey = (value = new Date()) => new Date(value).toISOString().slice(0, 7);
export const cleanUser = (user) => ({ id: user._id, name: user.name, email: user.email, avatar: user.avatar, role: user.role, academicYear: user.academicYear, monthlyAllowance: user.monthlyAllowance, savingsGoal: user.savingsGoal, authProvider: user.authProvider });
