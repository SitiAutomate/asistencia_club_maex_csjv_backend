import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import { ROLES } from '../constants/roles.js';
import {
  GESTION_MODULO_GRUPOS,
  GESTION_MODULO_LABELS,
  GESTION_MODULOS,
} from '../constants/gestionPermisos.js';
import {
  getPermisosEfectivos,
  listarPermisosUsuario,
} from '../services/gestionPermisosService.js';
import { registrarAuditoria } from '../services/auditoriaAdminService.js';

export const obtenerMisPermisosGestion = async (req, res) => {
  try {
    const efectivos = await getPermisosEfectivos(req.user);
    return sendSuccess(
      res,
      200,
      {
        source: efectivos.source,
        permisos: efectivos.permisos,
        modulos: Object.entries(GESTION_MODULO_LABELS).map(([id, label]) => ({
          id,
          label,
          grupo: GESTION_MODULO_GRUPOS[id] || 'Otros',
        })),
      },
      'Permisos obtenidos',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al obtener permisos', error.message);
  }
};

export const listarAdminsPermisos = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, email, nombre, rol
       FROM usuarios
       WHERE rol IN (:admin, :super)
       ORDER BY rol ASC, email ASC`,
      {
        replacements: {
          admin: ROLES.ADMINISTRADOR,
          super: ROLES.SUPER_ADMINISTRADOR,
        },
        type: QueryTypes.SELECT,
      },
    );
    return sendSuccess(res, 200, { usuarios: rows }, 'Administradores obtenidos');
  } catch (error) {
    return sendError(res, 500, 'Error al listar administradores', error.message);
  }
};

export const obtenerPermisosUsuario = async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuarioId);
    if (!Number.isFinite(usuarioId)) return sendError(res, 400, 'usuarioId inválido');
    const permisos = await listarPermisosUsuario(usuarioId);
    return sendSuccess(res, 200, { usuarioId, permisos }, 'Permisos del usuario');
  } catch (error) {
    return sendError(res, 500, 'Error al obtener permisos del usuario', error.message);
  }
};

/** Body: { permisos: [{ modulo, leer, crear, editar, eliminar }] } — reemplaza todos. */
export const guardarPermisosUsuario = async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuarioId);
    if (!Number.isFinite(usuarioId)) return sendError(res, 400, 'usuarioId inválido');

    const [user] = await sequelize.query(
      `SELECT id, email, rol FROM usuarios WHERE id = :id LIMIT 1`,
      { replacements: { id: usuarioId }, type: QueryTypes.SELECT },
    );
    if (!user) return sendError(res, 404, 'Usuario no encontrado');
    if (String(user.rol) === ROLES.SUPER_ADMINISTRADOR) {
      return sendError(res, 400, 'SuperAdministrador siempre tiene acceso pleno');
    }

    const list = Array.isArray(req.body?.permisos) ? req.body.permisos : [];
    const validMods = new Set(Object.values(GESTION_MODULOS));

    const prev = await listarPermisosUsuario(usuarioId);
    await sequelize.query(`DELETE FROM admin_permisos WHERE usuario_id = :id`, {
      replacements: { id: usuarioId },
      type: QueryTypes.DELETE,
    });

    for (const item of list) {
      const modulo = String(item.modulo || '').trim();
      if (!validMods.has(modulo)) continue;
      const leer = Boolean(item.leer);
      const crear = Boolean(item.crear);
      const editar = Boolean(item.editar);
      const eliminar = Boolean(item.eliminar);
      // Sin ningún permiso en el módulo = no se guarda fila (usuario sin acceso a ese módulo).
      if (!leer && !crear && !editar && !eliminar) continue;
      await sequelize.query(
        `INSERT INTO admin_permisos
          (usuario_id, modulo, puede_leer, puede_crear, puede_editar, puede_eliminar)
         VALUES
          (:usuarioId, :modulo, :leer, :crear, :editar, :eliminar)`,
        {
          replacements: {
            usuarioId,
            modulo,
            leer: leer ? 1 : 0,
            crear: crear ? 1 : 0,
            editar: editar ? 1 : 0,
            eliminar: eliminar ? 1 : 0,
          },
          type: QueryTypes.INSERT,
        },
      );
    }

    const next = await listarPermisosUsuario(usuarioId);
    await registrarAuditoria({
      req,
      accion: 'EDITAR',
      modulo: GESTION_MODULOS.PERMISOS,
      entidad: 'usuario',
      entidadId: usuarioId,
      resumen: `Permisos actualizados para ${user.email}`,
      antes: prev,
      despues: next,
    });

    return sendSuccess(res, 200, { usuarioId, permisos: next }, 'Permisos guardados');
  } catch (error) {
    return sendError(res, 500, 'Error al guardar permisos', error.message);
  }
};

export const listarAuditoriaGestion = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const offset = (page - 1) * limit;
    const modulo = String(req.query.modulo || '').trim();
    const q = String(req.query.q || '').trim();
    const clauses = ['1=1'];
    const repl = {};
    if (modulo) {
      clauses.push('modulo = :modulo');
      repl.modulo = modulo;
    }
    if (q) {
      clauses.push(
        `(email LIKE :q OR resumen LIKE :q OR entidad_id LIKE :q OR accion LIKE :q)`,
      );
      repl.q = `%${q}%`;
    }
    const where = clauses.join(' AND ');
    const [countRow] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM auditoria_admin WHERE ${where}`,
      { replacements: repl, type: QueryTypes.SELECT },
    );
    const rows = await sequelize.query(
      `SELECT id, usuario_id AS usuarioId, email, rol, accion, modulo, entidad,
              entidad_id AS entidadId, resumen, antes_json AS antesJson, despues_json AS despuesJson,
              ip, user_agent AS userAgent, creado_en AS creadoEn
       FROM auditoria_admin
       WHERE ${where}
       ORDER BY id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      { replacements: repl, type: QueryTypes.SELECT },
    );
    const total = Number(countRow?.total || 0);
    return sendSuccess(
      res,
      200,
      {
        eventos: rows.map((r) => ({
          ...r,
          antes: r.antesJson ? safeParse(r.antesJson) : null,
          despues: r.despuesJson ? safeParse(r.despuesJson) : null,
        })),
        meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      },
      'Auditoría obtenida',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar auditoría', error.message);
  }
};

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
