/** Módulos con control de permisos (operación + gestión). */
export const GESTION_MODULOS = {
  ASISTENCIA: 'asistencia',
  INFORMACION: 'informacion',
  RUBRICAS: 'rubricas',
  REPORTES: 'reportes',
  INFORMES: 'informes',
  LVLUP: 'lvlup',
  INSCRIPCIONES: 'inscripciones',
  OTROS: 'otros',
  PARTICIPANTES: 'participantes',
  RESPONSABLES: 'responsables',
  CURSOS: 'cursos',
  AUDITORIA: 'auditoria',
  PERMISOS: 'permisos',
  TIPO_CAMPOS: 'tipo_campos',
};

export const GESTION_MODULO_LABELS = {
  [GESTION_MODULOS.ASISTENCIA]: 'Asistencia',
  [GESTION_MODULOS.INFORMACION]: 'Información',
  [GESTION_MODULOS.RUBRICAS]: 'Gestión de rúbricas',
  [GESTION_MODULOS.REPORTES]: 'Reportes',
  [GESTION_MODULOS.INFORMES]: 'Informes',
  [GESTION_MODULOS.LVLUP]: 'LVL UP',
  [GESTION_MODULOS.INSCRIPCIONES]: 'Inscripciones (tipo 1)',
  [GESTION_MODULOS.OTROS]: 'Otros tipos',
  [GESTION_MODULOS.PARTICIPANTES]: 'Participantes',
  [GESTION_MODULOS.RESPONSABLES]: 'Responsables',
  [GESTION_MODULOS.CURSOS]: 'Cursos',
  [GESTION_MODULOS.AUDITORIA]: 'Auditoría',
  [GESTION_MODULOS.PERMISOS]: 'Permisos de administradores',
  [GESTION_MODULOS.TIPO_CAMPOS]: 'Campos por tipo',
};

/** Grupo UI en la pantalla de permisos. */
export const GESTION_MODULO_GRUPOS = {
  [GESTION_MODULOS.ASISTENCIA]: 'Operación',
  [GESTION_MODULOS.INFORMACION]: 'Operación',
  [GESTION_MODULOS.RUBRICAS]: 'Operación',
  [GESTION_MODULOS.REPORTES]: 'Operación',
  [GESTION_MODULOS.INFORMES]: 'Operación',
  [GESTION_MODULOS.LVLUP]: 'Operación',
  [GESTION_MODULOS.INSCRIPCIONES]: 'Gestión',
  [GESTION_MODULOS.OTROS]: 'Gestión',
  [GESTION_MODULOS.PARTICIPANTES]: 'Gestión',
  [GESTION_MODULOS.RESPONSABLES]: 'Gestión',
  [GESTION_MODULOS.CURSOS]: 'Gestión',
  [GESTION_MODULOS.TIPO_CAMPOS]: 'Gestión',
  [GESTION_MODULOS.AUDITORIA]: 'Administración',
  [GESTION_MODULOS.PERMISOS]: 'Administración',
};

export const GESTION_ACCIONES = {
  LEER: 'leer',
  CREAR: 'crear',
  EDITAR: 'editar',
  ELIMINAR: 'eliminar',
};

/** Permiso pleno (SuperAdministrador / asignación total). */
export function permisoPleno() {
  return {
    leer: true,
    crear: true,
    editar: true,
    eliminar: true,
  };
}

export function mapPermisoRow(row) {
  return {
    modulo: row.modulo,
    leer: Boolean(Number(row.puede_leer)),
    crear: Boolean(Number(row.puede_crear)),
    editar: Boolean(Number(row.puede_editar)),
    eliminar: Boolean(Number(row.puede_eliminar)),
  };
}
