import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import {
  catalogoKeyFromCampo,
  resolverEtiquetasCatalogo,
} from './gestionCatalogosService.js';

export async function getCamposTipo(tipo, { soloActivos = true } = {}) {
  const t = Number(tipo);
  if (!Number.isFinite(t) || t < 1) return [];
  try {
    const clauses = ['tipo = :tipo'];
    if (soloActivos) clauses.push('activo = 1');
    const rows = await sequelize.query(
      `SELECT id, tipo, campo_key, columna_db, label, tipo_input,
              visible_lista, visible_detalle, visible_form, requerido, orden, opciones_json, activo
       FROM gestion_tipo_campos
       WHERE ${clauses.join(' AND ')}
       ORDER BY orden ASC, id ASC`,
      { replacements: { tipo: t }, type: QueryTypes.SELECT },
    );
    return rows.map((c) => ({
      ...c,
      catalogo: catalogoKeyFromCampo(c),
    }));
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
export async function leerValoresCamposTipo(tipo, idInscripcion) {
  const campos = await getCamposTipo(tipo);
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
export async function guardarValoresCamposTipo(tipo, idInscripcion, body) {
  const campos = await getCamposTipo(tipo);
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
    const raw = value == null || String(value).trim() === '' ? null : value;
    repl[param] = raw;
  }

  if (!sets.length) return;
  await sequelize.query(
    `UPDATE inscripciones_1 SET ${sets.join(', ')} WHERE IDInscripcion = :id`,
    { replacements: repl, type: QueryTypes.UPDATE },
  );
}
