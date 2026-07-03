import { sendError } from '../utils/responseHandler.js';
import Usuarios from '../database/models/UsuariosModel.js';
import { verifyAccessToken } from '../utils/authJwt.js';
import { env } from '../config/env.js';
import { ROLES } from '../constants/roles.js';

const SWAGGER_COOKIE = 'swagger_bearer';

async function resolveSwaggerUser(token) {
  if (!env.jwt.secret) {
    throw new Error('JWT_SECRET no configurado');
  }
  const payload = verifyAccessToken(token);
  const user = await Usuarios.findOne({
    where: { email: payload.email },
  });
  if (!user) return null;
  if (!user.confirmado) return null;
  if (user.rol !== ROLES.DESARROLLADOR) return null;
  return {
    usuarioid: user.usuarioid,
    email: String(user.email || '').trim(),
    nombre: user.nombre,
    rol: user.rol,
  };
}

export const setSwaggerSession = async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const headerToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const bodyToken = String(req.body?.token || '').trim();
    const token = headerToken || bodyToken;
    if (!token) {
      return sendError(res, 401, 'Token requerido');
    }

    const user = await resolveSwaggerUser(token);
    if (!user) {
      return sendError(res, 403, 'Solo el rol Desarrollador puede acceder a la documentación API');
    }

    const secure = env.nodeEnv === 'production';
    res.cookie(SWAGGER_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: 5 * 60 * 1000,
      path: '/api-docs',
    });
    return res.status(204).end();
  } catch (e) {
    return sendError(
      res,
      401,
      'Token invalido o expirado',
      env.nodeEnv === 'development' ? e.message : null,
    );
  }
};

/**
 * Acceso a /api-docs solo para usuarios con rol Desarrollador.
 * Acepta Authorization: Bearer o cookie de sesión corta emitida por setSwaggerSession.
 */
export const requireSwaggerAccess = async (req, res, next) => {
  try {
    if (!env.jwt.secret) {
      return sendError(res, 500, 'JWT_SECRET no configurado en el servidor');
    }

    let token = null;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      token = header.slice(7).trim();
    } else if (req.cookies?.[SWAGGER_COOKIE]) {
      token = String(req.cookies[SWAGGER_COOKIE]).trim();
    }

    if (!token) {
      return sendError(
        res,
        401,
        'Acceso restringido. Inicie sesión como Desarrollador o use Authorization: Bearer <token>',
      );
    }

    const user = await resolveSwaggerUser(token);
    if (!user) {
      return sendError(res, 403, 'Solo el rol Desarrollador puede acceder a la documentación API');
    }

    req.user = user;
    next();
  } catch (e) {
    return sendError(
      res,
      401,
      'Token invalido o expirado',
      env.nodeEnv === 'development' ? e.message : null,
    );
  }
};
