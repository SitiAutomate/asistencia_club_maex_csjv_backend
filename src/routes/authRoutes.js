/** Mantener sincronizado con docs/openapi.yaml */
import { Router } from 'express';
import {
  registerProveedor,
  verifyEmail,
  loginProveedor,
  microsoftAuthorizeInfo,
  microsoftToken,
  forgotPassword,
  resetPassword,
  me,
} from '../controllers/AuthController.js';
import { requireAuth } from '../middlewares/auth.js';
import { authRateLimiter } from '../middlewares/rateLimit.js';

const router = Router();

router.post('/register', authRateLimiter, registerProveedor);
router.post('/login', authRateLimiter, loginProveedor);
router.get('/verify-email', verifyEmail);
router.post('/verify-email', verifyEmail);
router.get('/microsoft/url', microsoftAuthorizeInfo);
router.post('/microsoft/token', authRateLimiter, microsoftToken);
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/reset-password', resetPassword);
router.get('/me', requireAuth, me);

export default router;
