import { sendError } from '../utils/responseHandler.js';
import Usuarios from '../database/models/UsuariosModel.js';
import { verifyAccessToken } from '../utils/authJwt.js';
import { env } from '../config/env.js';
import { ROLES } from '../constants/roles.js';

/**
 * Acceso a /api-docs solo para usuarios con rol Desarrollador.
 * Acepta Authorization: Bearer o ?access_token= en GET (apertura desde el front).
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
    } else if (req.method === 'GET' && req.query.access_token) {
      token = String(req.query.access_token).trim();
    }

    if (!token) {
      return sendError(
        res,
        401,
        'Acceso restringido. Inicie sesión como Desarrollador o use Authorization: Bearer <token>',
      );
    }

    const payload = verifyAccessToken(token);
    const user = await Usuarios.findOne({
      where: { email: payload.email },
    });

    if (!user) {
      return sendError(res, 403, 'Usuario no encontrado');
    }
    if (!user.confirmado) {
      return sendError(res, 403, 'Usuario no confirmado');
    }
    if (user.rol !== ROLES.DESARROLLADOR) {
      return sendError(res, 403, 'Solo el rol Desarrollador puede acceder a la documentación API');
    }

    req.user = {
      usuarioid: user.usuarioid,
      email: String(user.email || '').trim(),
      nombre: user.nombre,
      rol: user.rol,
    };
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
