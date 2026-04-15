import { sendError } from '../utils/responseHandler.js';
import Usuarios from '../database/models/UsuariosModel.js';
import { verifyAccessToken } from '../utils/authJwt.js';
import { env } from '../config/env.js';

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
    const user = await Usuarios.findOne({
      where: { email: payload.email },
    });
    if (!user) {
      return sendError(res, 401, 'Usuario no encontrado');
    }
    if (!user.confirmado) {
      return sendError(res, 403, 'Usuario no confirmado');
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
