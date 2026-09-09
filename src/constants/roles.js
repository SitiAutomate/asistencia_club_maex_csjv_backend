export const ROLES = {
  SUPER_ADMINISTRADOR: 'SuperAdministrador',
  ADMINISTRADOR: 'Administrador',
  ENTRENADOR: 'Entrenador',
  MAESTRO_LVLUP: 'MaestroLVLUP',
  PROVEEDOR: 'Proveedor',
  DESARROLLADOR: 'Desarrollador',
};

/** Informes, gestión e alcance admin operativo (no docs/swagger). */
export const ROLES_ADMIN_LIKE = [ROLES.ADMINISTRADOR, ROLES.SUPER_ADMINISTRADOR];

export const isAdminLikeRole = (rol) => ROLES_ADMIN_LIKE.includes(String(rol || '').trim());

export const ROLES_MICROSOFT = [
  ROLES.SUPER_ADMINISTRADOR,
  ROLES.ADMINISTRADOR,
  ROLES.ENTRENADOR,
  ROLES.MAESTRO_LVLUP,
];

/** Roles que inician sesión con correo y contraseña en POST /api/auth/login */
export const ROLES_PASSWORD_LOGIN = [ROLES.PROVEEDOR, ROLES.DESARROLLADOR];
