import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { sendError, sendSuccess, handleError } from '../utils/responseHandler.js';
import { registrarAuditoria, buildCambios, resumenFromCambios } from '../services/auditoriaAdminService.js';
import { GESTION_MODULOS } from '../constants/gestionPermisos.js';

const clip = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
};

const emptyToNull = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
};

const parseLimit = (raw, fallback = 40, { max = 200 } = {}) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
};

const parsePage = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
};

function isDuplicateKeyError(error) {
  const code = error?.original?.code || error?.parent?.code || error?.code;
  return code === 'ER_DUP_ENTRY' || Number(code) === 1062;
}

/** Apoyo en salidas → flag `apoyo` usado por courseAccess (1 / 0). */
function normalizeApoyo(value) {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (value === true || value === 1 || s === '1' || s === 'true' || s === 'si' || s === 'sí') {
    return '1';
  }
  return '0';
}

function normalizeLider(value) {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (value === true || value === 1 || s === '1' || s === 'true' || s === 'si' || s === 'sí') {
    return 'Si';
  }
  return 'No';
}

function mapEntrenadorRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    correo: row.correo,
    countAsignaciones: Number(row.countAsignaciones || 0),
    countCursos: Number(row.countCursos || 0),
  };
}

async function fetchEntrenadorById(id) {
  const [row] = await sequelize.query(
    `SELECT e.ID AS id, e.Nombre_Docente AS nombre, e.Correo AS correo
     FROM entrenadores e
     WHERE e.ID = :id
     LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return row || null;
}

async function fetchAsignacionesByCorreo(correo) {
  if (!correo) return [];
  return sequelize.query(
    `SELECT a.docente,
            a.estado,
            a.actividad,
            a.apoyo,
            a.lider,
            act.Nombre_Actividad AS nombreActividad
     FROM asignacion_entrenadores a
     LEFT JOIN actividades act ON act.IDActividad = a.actividad
     WHERE a.docente = :correo
     ORDER BY act.Nombre_Actividad ASC, a.actividad ASC`,
    { replacements: { correo }, type: QueryTypes.SELECT },
  );
}

async function fetchCursosByEntrenador({ id, correo }) {
  return sequelize.query(
    `SELECT c.ID_Curso AS id,
            c.Nombre_del_curso AS nombre,
            c.Nombre_Corto_Curso AS nombreCorto,
            c.Sede AS sede,
            c.Estado_del_curso AS estado,
            c.Tipo AS tipo,
            c.Actividad AS actividad,
            c.Docente AS docente,
            act.Nombre_Actividad AS nombreActividad
     FROM cursos_2025 c
     LEFT JOIN actividades act ON act.IDActividad = c.Actividad
     WHERE c.Docente = :id
        OR (:correo IS NOT NULL AND :correo <> '' AND c.Docente = :correo)
     ORDER BY c.Nombre_del_curso ASC`,
    { replacements: { id, correo: correo || null }, type: QueryTypes.SELECT },
  );
}

function mapAsignacion(row) {
  const apoyoRaw = row.apoyo;
  const apoyo =
    apoyoRaw === 1 ||
    apoyoRaw === '1' ||
    apoyoRaw === true ||
    String(apoyoRaw).toLowerCase() === 'true' ||
    String(apoyoRaw).toLowerCase() === 'si' ||
    String(apoyoRaw).toLowerCase() === 'sí';
  const lider = String(row.lider || '').trim().toLowerCase() === 'si' || row.lider === 1 || row.lider === '1';
  return {
    actividad: row.actividad != null ? Number(row.actividad) : null,
    nombreActividad: row.nombreActividad || null,
    estado: row.estado || 'ACTIVO',
    apoyo,
    lider,
    apoyoRaw: row.apoyo,
    liderRaw: row.lider,
  };
}

export const listarEntrenadoresGestion = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const offset = (page - 1) * limit;

    const clauses = ['1=1'];
    const repl = { limit, offset };
    if (q) {
      clauses.push(`(e.ID LIKE :searchQ OR e.Nombre_Docente LIKE :searchQ OR e.Correo LIKE :searchQ)`);
      repl.searchQ = `%${q}%`;
    }
    const whereSql = clauses.join(' AND ');

    const [countRow] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM entrenadores e WHERE ${whereSql}`,
      { replacements: repl, type: QueryTypes.SELECT },
    );
    const total = Number(countRow?.total || 0);

    const rows = await sequelize.query(
      `SELECT e.ID AS id,
              e.Nombre_Docente AS nombre,
              e.Correo AS correo,
              (
                SELECT COUNT(*)
                FROM asignacion_entrenadores a
                WHERE a.docente = e.Correo
              ) AS countAsignaciones,
              (
                SELECT COUNT(*)
                FROM cursos_2025 c
                WHERE c.Docente = e.ID
                   OR (e.Correo IS NOT NULL AND e.Correo <> '' AND c.Docente = e.Correo)
              ) AS countCursos
       FROM entrenadores e
       WHERE ${whereSql}
       ORDER BY e.Nombre_Docente ASC
       LIMIT :limit OFFSET :offset`,
      { replacements: repl, type: QueryTypes.SELECT },
    );

    return sendSuccess(
      res,
      200,
      {
        entrenadores: rows.map(mapEntrenadorRow),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit) || 1),
        },
      },
      'Entrenadores obtenidos',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar entrenadores', error.message);
  }
};

export const obtenerEntrenadorGestion = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return sendError(res, 400, 'ID de entrenador requerido');

    const row = await fetchEntrenadorById(id);
    if (!row) return sendError(res, 404, 'Entrenador no encontrado');

    const [asignaciones, cursos] = await Promise.all([
      fetchAsignacionesByCorreo(row.correo),
      fetchCursosByEntrenador({ id: row.id, correo: row.correo }),
    ]);

    return sendSuccess(
      res,
      200,
      {
        entrenador: {
          id: row.id,
          nombre: row.nombre,
          correo: row.correo,
        },
        asignaciones: asignaciones.map(mapAsignacion),
        cursos,
      },
      'Entrenador obtenido',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al obtener entrenador', error.message);
  }
};

export const crearEntrenadorGestion = async (req, res) => {
  try {
    const body = req.body || {};
    const id = String(body.id || '').trim();
    const nombre = emptyToNull(body.nombre ?? body.nombreDocente);
    const correo = emptyToNull(body.correo);
    if (!id) return sendError(res, 400, 'ID requerido');
    if (!nombre) return sendError(res, 400, 'Nombre requerido');
    if (!correo) return sendError(res, 400, 'Correo requerido');

    const [yaExiste] = await sequelize.query(
      `SELECT ID AS id FROM entrenadores WHERE ID = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (yaExiste) {
      return sendError(res, 409, `Ya existe un entrenador con ID ${id}`);
    }

    await sequelize.query(
      `INSERT INTO entrenadores (ID, Nombre_Docente, Correo)
       VALUES (:id, :nombre, :correo)`,
      {
        replacements: {
          id: clip(id, 40),
          nombre: clip(nombre, 120),
          correo: clip(correo, 120),
        },
        type: QueryTypes.INSERT,
      },
    );

    const asignaciones = Array.isArray(body.asignaciones) ? body.asignaciones : [];
    if (asignaciones.length > 0) {
      await replaceAsignaciones(correo, asignaciones);
    }

    await registrarAuditoria({
      req,
      accion: 'CREAR',
      modulo: GESTION_MODULOS.ENTRENADORES,
      entidad: 'entrenador',
      entidadId: id,
      resumen: `Entrenador ${id} creado`,
      despues: { id, nombre, correo },
    });

    return sendSuccess(res, 201, { id }, 'Entrenador creado');
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendError(res, 409, 'Ya existe un entrenador con ese ID o correo', error.message);
    }
    return handleError(res, error, 'Error al crear entrenador');
  }
};

export const actualizarEntrenadorGestion = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return sendError(res, 400, 'ID de entrenador requerido');

    const before = await fetchEntrenadorById(id);
    if (!before) return sendError(res, 404, 'Entrenador no encontrado');

    const body = req.body || {};
    const nombre =
      body.nombre !== undefined || body.nombreDocente !== undefined
        ? emptyToNull(body.nombre ?? body.nombreDocente)
        : before.nombre;
    const correo = body.correo !== undefined ? emptyToNull(body.correo) : before.correo;

    if (!nombre) return sendError(res, 400, 'Nombre requerido');
    if (!correo) return sendError(res, 400, 'Correo requerido');

    await sequelize.query(
      `UPDATE entrenadores
       SET Nombre_Docente = :nombre, Correo = :correo
       WHERE ID = :id`,
      {
        replacements: {
          id,
          nombre: clip(nombre, 120),
          correo: clip(correo, 120),
        },
        type: QueryTypes.UPDATE,
      },
    );

    if (before.correo && correo && before.correo !== correo) {
      await sequelize.query(
        `UPDATE asignacion_entrenadores SET docente = :nuevo WHERE docente = :anterior`,
        {
          replacements: { anterior: before.correo, nuevo: correo },
          type: QueryTypes.UPDATE,
        },
      );
    }

    if (Array.isArray(body.asignaciones)) {
      await replaceAsignaciones(correo, body.asignaciones);
    }

    const cambios = buildCambios(
      { nombre: before.nombre, correo: before.correo },
      { nombre, correo },
    );

    await registrarAuditoria({
      req,
      accion: 'EDITAR',
      modulo: GESTION_MODULOS.ENTRENADORES,
      entidad: 'entrenador',
      entidadId: id,
      resumen: resumenFromCambios(`Entrenador ${id}`, cambios) || `Entrenador ${id} actualizado`,
      antes: before,
      despues: { id, nombre, correo },
      cambios,
    });

    return sendSuccess(res, 200, { id }, 'Entrenador actualizado');
  } catch (error) {
    return handleError(res, error, 'Error al actualizar entrenador');
  }
};

async function replaceAsignaciones(correo, asignaciones) {
  const email = String(correo || '').trim();
  if (!email) throw new Error('Correo requerido para asignaciones');

  await sequelize.query(`DELETE FROM asignacion_entrenadores WHERE docente = :correo`, {
    replacements: { correo: email },
    type: QueryTypes.DELETE,
  });

  const seen = new Set();
  for (const item of asignaciones) {
    const actividad = Number(item?.actividad);
    if (!Number.isFinite(actividad) || actividad <= 0) continue;
    if (seen.has(actividad)) continue;
    seen.add(actividad);

    const estado = emptyToNull(item?.estado) || 'ACTIVO';
    const apoyo = normalizeApoyo(item?.apoyo);
    const lider = normalizeLider(item?.lider);

    await sequelize.query(
      `INSERT INTO asignacion_entrenadores (docente, estado, actividad, apoyo, lider)
       VALUES (:docente, :estado, :actividad, :apoyo, :lider)`,
      {
        replacements: {
          docente: clip(email, 120),
          estado: clip(estado, 20),
          actividad,
          apoyo,
          lider,
        },
        type: QueryTypes.INSERT,
      },
    );
  }
}

export const guardarAsignacionesEntrenador = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return sendError(res, 400, 'ID de entrenador requerido');

    const entrenador = await fetchEntrenadorById(id);
    if (!entrenador) return sendError(res, 404, 'Entrenador no encontrado');
    if (!entrenador.correo) {
      return sendError(res, 400, 'El entrenador no tiene correo; no se pueden guardar asignaciones');
    }

    const asignaciones = Array.isArray(req.body?.asignaciones) ? req.body.asignaciones : null;
    if (!asignaciones) return sendError(res, 400, 'asignaciones debe ser un arreglo');

    const antes = await fetchAsignacionesByCorreo(entrenador.correo);
    await replaceAsignaciones(entrenador.correo, asignaciones);
    const despues = await fetchAsignacionesByCorreo(entrenador.correo);

    await registrarAuditoria({
      req,
      accion: 'EDITAR',
      modulo: GESTION_MODULOS.ENTRENADORES,
      entidad: 'asignacion_entrenador',
      entidadId: id,
      resumen: `Asignaciones de ${id} actualizadas (${despues.length})`,
      antes: { asignaciones: antes.map(mapAsignacion) },
      despues: { asignaciones: despues.map(mapAsignacion) },
    });

    return sendSuccess(
      res,
      200,
      { asignaciones: despues.map(mapAsignacion) },
      'Asignaciones guardadas',
    );
  } catch (error) {
    return handleError(res, error, 'Error al guardar asignaciones');
  }
};
