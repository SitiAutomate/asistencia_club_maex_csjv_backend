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

const router = Router();

router.post('/register', registerProveedor);
router.post('/login', loginProveedor);
router.get('/verify-email', verifyEmail);
router.post('/verify-email', verifyEmail);
router.get('/microsoft/url', microsoftAuthorizeInfo);
router.post('/microsoft/token', microsoftToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/reset-password', resetPassword);
router.get('/me', requireAuth, me);

export default router;
