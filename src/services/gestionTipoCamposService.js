/**
 * Lee valores dinámicos de columnas configuradas por tipo (y opcionalmente por curso).
 * id_curso = '' → aplica a todos los cursos del tipo.
 * Si hay fila para un curso concreto, tiene prioridad sobre la global.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import {
  catalogoKeyFromCampo,
  resolverEtiquetasCatalogo,
} from './gestionCatalogosService.js';

let ensuredIdCurso = false;

export async function ensureGestionTipoCamposIdCurso() {
  if (ensuredIdCurso) return;
  try {
    const cols = await sequelize.query(`SHOW COLUMNS FROM gestion_tipo_campos LIKE 'id_curso'`, {
      type: QueryTypes.SELECT,
    });
    if (!cols?.length) {
      await sequelize.query(
        `ALTER TABLE gestion_tipo_campos
         ADD COLUMN id_curso VARCHAR(40) NOT NULL DEFAULT '' AFTER tipo`,
      );
    }
    try {
      await sequelize.query(`ALTER TABLE gestion_tipo_campos DROP INDEX uq_gestion_tipo_campo`);
    } catch {
      /* may not exist */
    }
    try {
      await sequelize.query(
        `ALTER TABLE gestion_tipo_campos
         ADD UNIQUE KEY uq_gestion_tipo_campo_curso (tipo, campo_key, id_curso)`,
      );
    } catch {
      /* already exists */
    }
  } catch {
    /* table may not exist yet */
  }
  ensuredIdCurso = true;
}

function mapCampoRow(c) {
  return {
    ...c,
    id_curso: c.id_curso != null ? String(c.id_curso) : '',
    catalogo: catalogoKeyFromCampo(c),
  };
}

/**
 * @param {number|string} tipo
 * @param {{ soloActivos?: boolean, idCurso?: string|null, includeAllCourseFields?: boolean }} [opts]
 */
export async function getCamposTipo(tipo, { soloActivos = true, idCurso = null, includeAllCourseFields = false } = {}) {
  const t = Number(tipo);
  if (!Number.isFinite(t) || t < 1) return [];
  await ensureGestionTipoCamposIdCurso();
  try {
    const clauses = ['tipo = :tipo'];
    if (soloActivos) clauses.push('activo = 1');
    const rows = await sequelize.query(
      `SELECT id, tipo, id_curso, campo_key, columna_db, label, tipo_input,
              visible_lista, visible_detalle, visible_form, requerido, orden, opciones_json, activo
       FROM gestion_tipo_campos
       WHERE ${clauses.join(' AND ')}
       ORDER BY orden ASC, id ASC`,
      { replacements: { tipo: t }, type: QueryTypes.SELECT },
    );
    const mapped = rows.map(mapCampoRow);
    const curso = idCurso != null && String(idCurso).trim() !== '' ? String(idCurso).trim() : null;

    if (curso) {
      const byKey = new Map();
      for (const c of mapped) {
        const key = c.campo_key;
        const isExact = String(c.id_curso || '') === curso;
        const isGlobal = !c.id_curso;
        if (!isExact && !isGlobal) continue;
        const prev = byKey.get(key);
        if (!prev || isExact) byKey.set(key, c);
      }
      return [...byKey.values()].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));
    }

    if (includeAllCourseFields) {
      const byKey = new Map();
      for (const c of mapped) {
        const key = c.campo_key;
        const prev = byKey.get(key);
        const isGlobal = !c.id_curso;
        if (!prev) {
          byKey.set(key, c);
          continue;
        }
        if (isGlobal && prev.id_curso) byKey.set(key, c);
      }
      return [...byKey.values()].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));
    }

    return mapped
      .filter((c) => !c.id_curso)
      .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));
  } catch {
    return [];
  }
}

/** Quote identifier safely for MySQL column names (spaces/accents). */
function quoteCol(name) {
  return `\`${String(name).replace(/`/g, '')}\``;
}

/**
 * Enriquece campos con etiquetas de catálogo (valueLabel).
 */
export async function enriquecerCamposConCatalogo(camposConValor) {
  if (!camposConValor?.length) return camposConValor || [];

  const byCatalog = new Map();
  for (const c of camposConValor) {
    const key = c.catalogo || null;
    if (!key || c.value == null || String(c.value).trim() === '') continue;
    if (!byCatalog.has(key)) byCatalog.set(key, []);
    byCatalog.get(key).push(c.value);
  }

  const labelMaps = new Map();
  for (const [key, ids] of byCatalog.entries()) {
    labelMaps.set(key, await resolverEtiquetasCatalogo(key, ids));
  }

  return camposConValor.map((c) => {
    const map = c.catalogo ? labelMaps.get(c.catalogo) : null;
    const valueLabel = map?.get(String(c.value)) || null;
    return {
      ...c,
      valueLabel,
      displayValue: valueLabel || (c.value != null && String(c.value).trim() !== '' ? String(c.value) : null),
    };
  });
}

/**
 * Lee valores de columnas configuradas para un ID de inscripción.
 */
export async function leerValoresCamposTipo(tipo, idInscripcion, idCurso = null) {
  let curso = idCurso;
  if (!curso && idInscripcion) {
    const [row] = await sequelize.query(
      `SELECT IDCurso AS idCurso FROM inscripciones_1 WHERE IDInscripcion = :id LIMIT 1`,
      { replacements: { id: idInscripcion }, type: QueryTypes.SELECT },
    );
    curso = row?.idCurso || null;
  }
  const campos = await getCamposTipo(tipo, { idCurso: curso });
  if (!campos.length || !idInscripcion) return [];

  const cols = [...new Set(campos.map((c) => c.columna_db).filter(Boolean))];
  if (!cols.length) return [];

  const selectSql = cols.map((c) => `${quoteCol(c)} AS ${quoteCol(c)}`).join(', ');
  const [row] = await sequelize.query(
    `SELECT ${selectSql} FROM inscripciones_1 WHERE IDInscripcion = :id LIMIT 1`,
    { replacements: { id: idInscripcion }, type: QueryTypes.SELECT },
  );
  if (!row) return [];

  const mapped = campos.map((c) => ({
    campoKey: c.campo_key,
    label: c.label,
    columnaDb: c.columna_db,
    tipoInput: c.tipo_input || 'text',
    catalogo: c.catalogo || null,
    idCurso: c.id_curso || '',
    value: row[c.columna_db] ?? null,
    visibleLista: Boolean(Number(c.visible_lista)),
    visibleDetalle: Boolean(Number(c.visible_detalle)),
    visibleForm: Boolean(Number(c.visible_form)),
    requerido: Boolean(Number(c.requerido)),
    orden: Number(c.orden || 0),
  }));

  return enriquecerCamposConCatalogo(mapped);
}

/**
 * Persiste campos extra desde body.camposExtra = { campoKey: value } o body[campoKey].
 */
export async function guardarValoresCamposTipo(tipo, idInscripcion, body, idCurso = null) {
  let curso = idCurso;
  if (!curso && idInscripcion) {
    const [row] = await sequelize.query(
      `SELECT IDCurso AS idCurso FROM inscripciones_1 WHERE IDInscripcion = :id LIMIT 1`,
      { replacements: { id: idInscripcion }, type: QueryTypes.SELECT },
    );
    curso = row?.idCurso || null;
  }
  const campos = await getCamposTipo(tipo, { idCurso: curso });
  if (!campos.length || !idInscripcion) return;

  const sets = [];
  const repl = { id: idInscripcion };
  const extras = body?.camposExtra && typeof body.camposExtra === 'object' ? body.camposExtra : {};

  for (const c of campos) {
    if (!Number(c.visible_form) && !Number(c.requerido)) continue;
    const key = c.campo_key;
    let value;
    if (Object.prototype.hasOwnProperty.call(extras, key)) value = extras[key];
    else if (Object.prototype.hasOwnProperty.call(body || {}, key)) value = body[key];
    else continue;

    const param = `x_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    sets.push(`${quoteCol(c.columna_db)} = :${param}`);
    repl[param] = value === '' || value == null ? null : value;
  }

  if (!sets.length) return;
  await sequelize.query(`UPDATE inscripciones_1 SET ${sets.join(', ')} WHERE IDInscripcion = :id`, {
    replacements: repl,
    type: QueryTypes.UPDATE,
  });
}
