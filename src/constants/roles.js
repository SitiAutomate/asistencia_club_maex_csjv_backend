export const ROLES = {
  ADMINISTRADOR: 'Administrador',
  ENTRENADOR: 'Entrenador',
  MAESTRO_LVLUP: 'MaestroLVLUP',
  PROVEEDOR: 'Proveedor',
  DESARROLLADOR: 'Desarrollador',
};

export const ROLES_MICROSOFT = [ROLES.ADMINISTRADOR, ROLES.ENTRENADOR, ROLES.MAESTRO_LVLUP];

/** Roles que inician sesión con correo y contraseña en POST /api/auth/login */
export const ROLES_PASSWORD_LOGIN = [ROLES.PROVEEDOR, ROLES.DESARROLLADOR];
