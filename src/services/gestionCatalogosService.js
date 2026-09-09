import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { getCatalogoDef, listCatalogosMeta } from '../constants/gestionCatalogos.js';

function quoteCol(name) {
  return `\`${String(name).replace(/`/g, '')}\``;
}

export function listarCatalogosDisponibles() {
  return listCatalogosMeta();
}

/**
 * Opciones de un catálogo: [{ value, label }]
 */
export async function cargarOpcionesCatalogo(catalogoKey, { q = '', limit = 300 } = {}) {
  const def = getCatalogoDef(catalogoKey);
  if (!def) return [];

  const clauses = ['1=1'];
  const repl = {};
  if (q) {
    clauses.push(
      `(CAST(${quoteCol(def.valor)} AS CHAR) LIKE :q OR ${quoteCol(def.etiqueta)} LIKE :q)`,
    );
    repl.q = `%${q}%`;
  }

  const rows = await sequelize.query(
    `SELECT ${quoteCol(def.valor)} AS value, ${quoteCol(def.etiqueta)} AS label
     FROM ${quoteCol(def.tabla)}
     WHERE ${clauses.join(' AND ')}
     ORDER BY ${quoteCol(def.etiqueta)} ASC
     LIMIT ${Math.min(500, Math.max(1, Number(limit) || 300))}`,
    { replacements: repl, type: QueryTypes.SELECT },
  );

  return rows.map((r) => ({
    value: r.value == null ? '' : String(r.value),
    label: r.label == null ? String(r.value ?? '') : String(r.label),
  }));
}

/**
 * Resuelve etiquetas para un mapa id→label de un catálogo.
 * @param {string} catalogoKey
 * @param {Array<string|number>} ids
 */
export async function resolverEtiquetasCatalogo(catalogoKey, ids = []) {
  const def = getCatalogoDef(catalogoKey);
  const unique = [...new Set(ids.map((v) => String(v ?? '').trim()).filter(Boolean))];
  if (!def || !unique.length) return new Map();

  const rows = await sequelize.query(
    `SELECT CAST(${quoteCol(def.valor)} AS CHAR) AS value, ${quoteCol(def.etiqueta)} AS label
     FROM ${quoteCol(def.tabla)}
     WHERE CAST(${quoteCol(def.valor)} AS CHAR) IN (:ids)`,
    { replacements: { ids: unique }, type: QueryTypes.SELECT },
  );

  const map = new Map();
  for (const r of rows) {
    map.set(String(r.value), r.label == null ? String(r.value) : String(r.label));
  }
  return map;
}

/** Extrae key de catálogo desde fila/campo (opciones_json o propiedad). */
export function catalogoKeyFromCampo(campo) {
  if (!campo) return null;
  if (campo.catalogo) return String(campo.catalogo);
  let opts = campo.opciones_json ?? campo.opciones ?? null;
  if (typeof opts === 'string') {
    try {
      opts = JSON.parse(opts);
    } catch {
      opts = null;
    }
  }
  if (opts && typeof opts === 'object') {
    if (opts.catalogo) return String(opts.catalogo);
  }
  return null;
}
