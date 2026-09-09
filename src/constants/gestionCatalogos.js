/**
 * Catálogos permitidos para campos relacionados (whitelist anti SQL-injection).
 * valor = columna ID guardada en inscripciones_1
 * etiqueta = texto visible
 */
export const GESTION_CATALOGOS = {
  asignaturas: {
    key: 'asignaturas',
    label: 'Asignaturas',
    tabla: 'asignaturas',
    valor: 'IDAsignatura',
    etiqueta: 'Asignatura',
  },
  actividades: {
    key: 'actividades',
    label: 'Actividades',
    tabla: 'actividades',
    valor: 'IDActividad',
    etiqueta: 'Nombre_Actividad',
  },
  lineas: {
    key: 'lineas',
    label: 'Líneas',
    tabla: 'linea',
    valor: 'IDLinea',
    etiqueta: 'Nombre_Linea',
  },
  entrenadores: {
    key: 'entrenadores',
    label: 'Entrenadores / docentes',
    tabla: 'entrenadores',
    valor: 'ID',
    etiqueta: 'Nombre_Docente',
  },
};

export function getCatalogoDef(key) {
  if (!key) return null;
  return GESTION_CATALOGOS[String(key)] || null;
}

export function listCatalogosMeta() {
  return Object.values(GESTION_CATALOGOS).map(({ key, label, valor, etiqueta }) => ({
    key,
    label,
    valor,
    etiqueta,
  }));
}
