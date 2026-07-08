import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Clave por usuario cuando hay sesión (Bearer token), con fallback a IP.
 * Evita penalizar a todos los que comparten una misma IP pública (WiFi del
 * colegio detrás de NAT): cada token tiene su propio contador.
 */
const perUserOrIpKey = (req, res) => {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return `u:${token.slice(-40)}`;
  }
  return `ip:${ipKeyGenerator(req.ip)}`;
};

export const authRateLimiter = rateLimit({
  windowMs: env.rateLimit.authWindowMs,
  max: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos. Intente de nuevo en unos minutos.',
  },
});

export const integracionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.rateLimit.integracionMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Limite de solicitudes excedido.',
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.rateLimit.apiMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserOrIpKey,
  message: {
    success: false,
    message: 'Limite de solicitudes excedido.',
  },
});
