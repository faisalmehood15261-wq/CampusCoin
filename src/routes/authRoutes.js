import { Router } from 'express';
import { adminLogin, forgotPassword, google, login, logout, me, register, resetPassword } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
const router = Router();
router.post('/register', register); router.post('/login', login); router.post('/admin/login', adminLogin); router.post('/google', google); router.post('/logout', logout); router.get('/me', requireAuth, me); router.post('/forgot-password', forgotPassword); router.post('/reset-password', resetPassword);
export default router;
