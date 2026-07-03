import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { ROLES } from '../constants/roles.js';

export function isLvlupAdmin(req) {
  return String(req.user?.rol || '').trim() === ROLES.ADMINISTRADOR;
}

export async function findMaestroAcademicoByCorreo(correo) {
  const email = String(correo || '').trim().toLowerCase();
  if (!email) return null;

  const rows = await sequelize.query(
    `SELECT id, documento, nombre, correo, sede, nivel_1, dx_nivel_2, activo
     FROM maestros_academicos
     WHERE LOWER(TRIM(correo)) = :email AND activo = 1
     LIMIT 1`,
    { replacements: { email }, type: QueryTypes.SELECT },
  );
  return rows[0] || null;
}

export async function findMaestroAcademicoById(maestroId) {
  const id = Number(maestroId);
  if (!Number.isInteger(id) || id < 1) return null;
  const rows = await sequelize.query(
    `SELECT id, documento, nombre, correo, sede, nivel_1, dx_nivel_2, activo
     FROM maestros_academicos WHERE id = :id AND activo = 1 LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return rows[0] || null;
}

export async function listMaestrosAcademicosActivos() {
  return sequelize.query(
    `SELECT id, documento, nombre, correo, sede
     FROM maestros_academicos
     WHERE activo = 1
     ORDER BY nombre ASC`,
    { type: QueryTypes.SELECT },
  );
}

/** Maestro efectivo para la petición. Admin: maestroId query > correo en maestros > null (ver todas). */
export async function resolveMaestroFromRequest(req) {
  const maestroIdParam = Number(req.query.maestroId || req.body?.maestroId);

  if (Number.isInteger(maestroIdParam) && maestroIdParam > 0) {
    return findMaestroAcademicoById(maestroIdParam);
  }

  if (isLvlupAdmin(req)) {
    return findMaestroAcademicoByCorreo(req.user?.email);
  }

  return findMaestroAcademicoByCorreo(req.user?.email);
}
