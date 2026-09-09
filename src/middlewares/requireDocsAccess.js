import { requireAuth, requireRoles } from './auth.js';
import { ROLES } from '../constants/roles.js';

/** Documentación interna: SuperAdministrador y Desarrollador (no Administrador). */
export const requireDocsAccess = [
  requireAuth,
  requireRoles(ROLES.DESARROLLADOR, ROLES.SUPER_ADMINISTRADOR),
];
