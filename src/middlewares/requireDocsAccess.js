import { requireAuth, requireRoles } from './auth.js';
import { ROLES } from '../constants/roles.js';

/** Documentación interna: Desarrollador y Administrador */
export const requireDocsAccess = [requireAuth, requireRoles(ROLES.DESARROLLADOR, ROLES.ADMINISTRADOR)];
