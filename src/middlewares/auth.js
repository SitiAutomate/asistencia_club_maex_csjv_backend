import { sendError } from '../utils/responseHandler.js';
import Usuarios from '../database/models/UsuariosModel.js';
import { verifyAccessToken } from '../utils/authJwt.js';
import { env } from '../config/env.js';
import { ROLES } from '../constants/roles.js';
import { agentDebugLog } from '../utils/agentDebugLog.js';
import { getDbPoolStats } from '../utils/dbPoolMonitor.js';

const AUTH_USER_CACHE_TTL_MS = 45_000;
const authUserCache = new Map();

const isDatabaseConnectivityError = (error) => {
  const code = String(error?.parent?.code || error?.original?.code || error?.code || '');
  const name = String(error?.name || '');
  if (name.startsWith('Sequelize') && name.includes('Connection')) return true;
  if (name === 'SequelizeDatabaseError' && ['EADDRNOTAVAIL', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'].includes(code)) {
    return true;
  }
  return ['EADDRNOTAVAIL', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'].includes(code);
};

function userFromJwtPayload(payload) {
  return {
    usuarioid: String(payload.usuarioid || '').trim(),
    email: String(payload.email || '').trim(),
    nombre: '',
    rol: String(payload.rol || '').trim(),
  };
}

function getCachedAuthUser(email) {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return null;
  const entry = authUserCache.get(key);
  if (!entry || Date.now() - entry.ts > AUTH_USER_CACHE_TTL_MS) {
    if (entry) authUserCache.delete(key);
    return null;
  }
  return entry.user;
}

function setCachedAuthUser(email, user) {
  const key = String(email || '').trim().toLowerCase();
  if (!key || !user) return;
  authUserCache.set(key, { ts: Date.now(), user });
  if (authUserCache.size > 500) {
    const oldest = authUserCache.keys().next().value;
    if (oldest) authUserCache.delete(oldest);
  }
}

const JWT_ONLY_ROLES = new Set([ROLES.MAESTRO_LVLUP, ROLES.ENTRENADOR]);

export const requireAuth = async (req, res, next) => {
  try {
    if (!env.jwt.secret) {
      return sendError(res, 500, 'JWT_SECRET no configurado en el servidor');
    }
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      return sendError(res, 401, 'Envie Authorization: Bearer <token>');
    }
    const payload = verifyAccessToken(token);
    const rolJwt = String(payload.rol || '').trim();

    if (JWT_ONLY_ROLES.has(rolJwt)) {
      req.user = userFromJwtPayload(payload);
      return next();
    }

    const cached = getCachedAuthUser(payload.email);
    if (cached) {
      req.user = cached;
      return next();
    }

    const authDbStarted = Date.now();
    const user = await Usuarios.findOne({
      where: { email: payload.email },
    });
    // #region agent log
    agentDebugLog({
      location: 'auth.js:requireAuth',
      message: 'Auth DB lookup completed',
      hypothesisId: 'D',
      data: {
        durationMs: Date.now() - authDbStarted,
        pool: getDbPoolStats(),
        path: req.originalUrl,
      },
    });
    // #endregion

    if (user) {
      if (!user.confirmado) {
        return sendError(res, 403, 'Usuario no confirmado');
      }
      req.user = {
        usuarioid: user.usuarioid,
        email: String(user.email || '').trim(),
        nombre: user.nombre,
        rol: user.rol,
      };
      setCachedAuthUser(payload.email, req.user);
      return next();
    }

    // Acceso Microsoft sin registro local: se confía en claims del JWT emitido por el servidor.
    req.user = userFromJwtPayload(payload);
    setCachedAuthUser(payload.email, req.user);
    next();
  } catch (e) {
    if (isDatabaseConnectivityError(e)) {
      // #region agent log
      agentDebugLog({
        location: 'auth.js:requireAuth',
        message: 'Auth DB connectivity error',
        hypothesisId: 'A',
        data: {
          pool: getDbPoolStats(),
          path: req.originalUrl,
          errorCode: e?.parent?.code || e?.original?.code || e?.code || null,
        },
      });
      // #endregion
      return sendError(
        res,
        503,
        'Base de datos temporalmente no disponible. Intente de nuevo en unos segundos.',
        env.nodeEnv === 'development' ? e.message : null,
      );
    }
    return sendError(
      res,
      401,
      'Token invalido o expirado',
      env.nodeEnv === 'development' ? e.message : null,
    );
  }
};

export const requireRoles =
  (...rolesPermitidos) =>
  (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'No autenticado');
    }
    if (!rolesPermitidos.includes(req.user.rol)) {
      return sendError(res, 403, 'No tiene permisos para esta accion');
    }
    next();
  };
