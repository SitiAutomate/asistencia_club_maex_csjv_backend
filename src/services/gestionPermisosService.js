import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { ROLES, isAdminLikeRole } from '../constants/roles.js';
import {
  GESTION_ACCIONES,
  GESTION_MODULOS,
  mapPermisoRow,
  permisoPleno,
} from '../constants/gestionPermisos.js';
import { logger } from '../config/logger.js';

const ACCION_COL = {
  [GESTION_ACCIONES.LEER]: 'puede_leer',
  [GESTION_ACCIONES.CREAR]: 'puede_crear',
  [GESTION_ACCIONES.EDITAR]: 'puede_editar',
  [GESTION_ACCIONES.ELIMINAR]: 'puede_eliminar',
};

export async function listarPermisosUsuario(usuarioId) {
  const rows = await sequelize.query(
    `SELECT modulo, puede_leer, puede_crear, puede_editar, puede_eliminar
     FROM admin_permisos
     WHERE usuario_id = :usuarioId`,
    { replacements: { usuarioId }, type: QueryTypes.SELECT },
  );
  return rows.map(mapPermisoRow);
}

/** Resuelve usuarios.id numérico (admin_permisos.usuario_id). */
async function resolveUsuarioPk(user) {
  const direct = Number(user?.id);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const email = String(user?.email || '').trim();
  const usuarioid = String(user?.usuarioid || '').trim();
  if (!email && !usuarioid) return null;

  try {
    const rows = await sequelize.query(
      `SELECT id FROM usuarios
       WHERE (:email <> '' AND LOWER(TRIM(email)) = LOWER(TRIM(:email)))
          OR (:usuarioid <> '' AND usuarioid = :usuarioid)
       LIMIT 1`,
      {
        replacements: { email, usuarioid },
        type: QueryTypes.SELECT,
      },
    );
    const id = Number(rows?.[0]?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch (err) {
    logger.warn(`resolveUsuarioPk: ${err.message}`);
    return null;
  }
}

/**
 * Efectivos: SuperAdministrador = todo.
 * Administrador sin filas = sin acceso (debe asignarse explícitamente).
 * Con filas = solo lo configurado.
 */
export async function getPermisosEfectivos(user) {
  const rol = String(user?.rol || '').trim();
  const full = {};
  for (const mod of Object.values(GESTION_MODULOS)) {
    full[mod] = permisoPleno();
  }
  const empty = {};

  if (rol === ROLES.SUPER_ADMINISTRADOR) {
    return { source: 'super', permisos: full };
  }
  if (!isAdminLikeRole(rol)) {
    return { source: 'none', permisos: empty };
  }

  const id = await resolveUsuarioPk(user);
  if (!id) {
    return { source: 'none', permisos: empty, usuarioId: null };
  }

  try {
    const rows = await listarPermisosUsuario(id);
    if (!rows.length) {
      return { source: 'none', permisos: empty, usuarioId: id };
    }
    const permisos = {};
    for (const row of rows) {
      permisos[row.modulo] = {
        leer: row.leer,
        crear: row.crear,
        editar: row.editar,
        eliminar: row.eliminar,
      };
    }
    return { source: 'custom', permisos, usuarioId: id };
  } catch (err) {
    // Tabla aún no creada: denegar por defecto (salvo SuperAdmin ya retornado arriba).
    logger.warn(`admin_permisos no disponible: ${err.message}`);
    return { source: 'fallback', permisos: empty, usuarioId: id };
  }
}

export function tienePermiso(efectivos, modulo, accion) {
  const p = efectivos?.permisos?.[modulo];
  if (!p) return false;
  if (accion === GESTION_ACCIONES.LEER) return Boolean(p.leer);
  if (accion === GESTION_ACCIONES.CREAR) return Boolean(p.crear);
  if (accion === GESTION_ACCIONES.EDITAR) return Boolean(p.editar);
  if (accion === GESTION_ACCIONES.ELIMINAR) return Boolean(p.eliminar);
  return false;
}

/** Middleware: requireGestionPermiso('cursos', 'editar') */
export function requireGestionPermiso(modulo, accion = GESTION_ACCIONES.LEER) {
  return async (req, res, next) => {
    try {
      const efectivos = await getPermisosEfectivos(req.user);
      req.gestionPermisos = efectivos;
      if (!tienePermiso(efectivos, modulo, accion)) {
        return res.status(403).json({
          ok: false,
          message: 'No tiene permiso para esta acción',
          code: 'GESTION_FORBIDDEN',
          modulo,
          accion,
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Permite si el usuario tiene al menos uno de los pares módulo/acción.
 * Útil para catálogos usados también desde formularios de inscripción.
 * @param {{ modulo: string, accion?: string }[]} checks
 */
export function requireAnyGestionPermiso(checks = []) {
  return async (req, res, next) => {
    try {
      const efectivos = await getPermisosEfectivos(req.user);
      req.gestionPermisos = efectivos;
      const ok = (checks || []).some(({ modulo, accion = GESTION_ACCIONES.LEER }) =>
        tienePermiso(efectivos, modulo, accion),
      );
      if (!ok) {
        return res.status(403).json({
          ok: false,
          message: 'No tiene permiso para esta acción',
          code: 'GESTION_FORBIDDEN',
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Inscripciones tipo 1 vs otros tipos: elige módulo según query/body
 * o permite si tiene cualquiera al operar por :id.
 */
export function requireInscripcionGestionPermiso(accion = GESTION_ACCIONES.LEER) {
  return async (req, res, next) => {
    try {
      const efectivos = await getPermisosEfectivos(req.user);
      req.gestionPermisos = efectivos;
      const excludeTipo1 = String(req.query.excludeTipo1 || '').toLowerCase() === 'true';
      const tipoBody = Number(req.body?.tipo ?? req.body?.Tipo);
      const tipoQuery = Number(req.query.tipo);
      let modulo = GESTION_MODULOS.INSCRIPCIONES;

      if (req.params.id) {
        const ok =
          tienePermiso(efectivos, GESTION_MODULOS.INSCRIPCIONES, accion) ||
          tienePermiso(efectivos, GESTION_MODULOS.OTROS, accion);
        if (!ok) {
          return res.status(403).json({
            ok: false,
            message: 'No tiene permiso para esta acción',
            code: 'GESTION_FORBIDDEN',
            accion,
          });
        }
        return next();
      }

      if (excludeTipo1 || (Number.isFinite(tipoBody) && tipoBody > 1) || (Number.isFinite(tipoQuery) && tipoQuery > 1)) {
        modulo = GESTION_MODULOS.OTROS;
      }
      if (!tienePermiso(efectivos, modulo, accion)) {
        return res.status(403).json({
          ok: false,
          message: 'No tiene permiso para esta acción',
          code: 'GESTION_FORBIDDEN',
          modulo,
          accion,
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export { ACCION_COL };
