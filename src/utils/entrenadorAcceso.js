import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { ROLES, isAdminLikeRole } from '../constants/roles.js';

export const ACCESO_ASISTENCIA = {
  HISTORIAL: 'historial',
  ASISTENCIA_HISTORIAL: 'asistencia_historial',
};

export function normalizeAccesoAsistencia(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === ACCESO_ASISTENCIA.HISTORIAL || v === 'solo_historial' || v === 'historial_only') {
    return ACCESO_ASISTENCIA.HISTORIAL;
  }
  return ACCESO_ASISTENCIA.ASISTENCIA_HISTORIAL;
}

export function puedeRegistrarAsistencia(acceso) {
  return normalizeAccesoAsistencia(acceso) === ACCESO_ASISTENCIA.ASISTENCIA_HISTORIAL;
}

/** Lectura desde tabla entrenadores por correo (sesión Microsoft / Entrenador). */
export async function getEntrenadorAccesoByCorreo(correo) {
  const email = String(correo || '')
    .trim()
    .toLowerCase();
  if (!email) return ACCESO_ASISTENCIA.ASISTENCIA_HISTORIAL;
  try {
    const [row] = await sequelize.query(
      `SELECT acceso_asistencia AS acceso
       FROM entrenadores
       WHERE LOWER(TRIM(Correo)) = :email
       LIMIT 1`,
      { replacements: { email }, type: QueryTypes.SELECT },
    );
    if (!row) return ACCESO_ASISTENCIA.ASISTENCIA_HISTORIAL;
    return normalizeAccesoAsistencia(row.acceso);
  } catch {
    // Columna aún no migrada u otro error: no bloquear el flujo.
    return ACCESO_ASISTENCIA.ASISTENCIA_HISTORIAL;
  }
}

export async function resolveAccesoAsistenciaForUser(user) {
  const rol = String(user?.rol || '').trim();
  if (isAdminLikeRole(rol) || rol === ROLES.DESARROLLADOR) {
    return ACCESO_ASISTENCIA.ASISTENCIA_HISTORIAL;
  }
  if (rol === ROLES.ENTRENADOR) {
    return getEntrenadorAccesoByCorreo(user?.email);
  }
  return ACCESO_ASISTENCIA.ASISTENCIA_HISTORIAL;
}
