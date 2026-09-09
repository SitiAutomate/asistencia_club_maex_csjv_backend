import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import { GESTION_MODULOS } from '../constants/gestionPermisos.js';
import { registrarAuditoria } from '../services/auditoriaAdminService.js';
import { getCatalogoDef } from '../constants/gestionCatalogos.js';
import {
  cargarOpcionesCatalogo,
  listarCatalogosDisponibles,
} from '../services/gestionCatalogosService.js';

const mapCampo = (row) => {
  const opciones = row.opciones_json ? safeParse(row.opciones_json) : null;
  const catalogo =
    (opciones && typeof opciones === 'object' && opciones.catalogo) || null;
  return {
    id: row.id,
    tipo: Number(row.tipo),
    campoKey: row.campo_key,
    columnaDb: row.columna_db,
    label: row.label,
    tipoInput: row.tipo_input || 'text',
    visibleLista: Boolean(Number(row.visible_lista)),
    visibleDetalle: Boolean(Number(row.visible_detalle)),
    visibleForm: Boolean(Number(row.visible_form)),
    requerido: Boolean(Number(row.requerido)),
    orden: Number(row.orden || 0),
    opciones,
    catalogo: catalogo ? String(catalogo) : null,
    activo: Boolean(Number(row.activo)),
  };
};

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildOpcionesJson(body) {
  let base = {};
  if (body.opciones != null && typeof body.opciones === 'object') {
    base = { ...body.opciones };
  } else if (body.opciones_json != null) {
    const parsed = typeof body.opciones_json === 'string' ? safeParse(body.opciones_json) : body.opciones_json;
    if (parsed && typeof parsed === 'object') base = { ...parsed };
  }
  const catalogoRaw = body.catalogo != null ? String(body.catalogo).trim() : base.catalogo;
  if (catalogoRaw) {
    if (!getCatalogoDef(catalogoRaw)) {
      return { error: `Catálogo no permitido: ${catalogoRaw}` };
    }
    base.catalogo = catalogoRaw;
  } else {
    delete base.catalogo;
  }
  return { json: Object.keys(base).length ? JSON.stringify(base) : null };
}

/** Columnas candidatas de inscripciones_1 para mapear. */
export const listarColumnasInscripciones = async (_req, res) => {
  try {
    const rows = await sequelize.query(`SHOW COLUMNS FROM inscripciones_1`, {
      type: QueryTypes.SELECT,
    });
    return sendSuccess(
      res,
      200,
      {
        columnas: rows.map((r) => ({
          field: r.Field,
          type: r.Type,
          nullable: r.Null === 'YES',
        })),
      },
      'Columnas obtenidas',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar columnas', error.message);
  }
};

export const listarCatalogosGestion = async (_req, res) => {
  try {
    return sendSuccess(
      res,
      200,
      { catalogos: listarCatalogosDisponibles() },
      'Catálogos disponibles',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar catálogos', error.message);
  }
};

export const listarOpcionesCatalogoGestion = async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!getCatalogoDef(key)) return sendError(res, 404, 'Catálogo no encontrado');
    const q = String(req.query.q || '').trim();
    const opciones = await cargarOpcionesCatalogo(key, { q });
    return sendSuccess(res, 200, { catalogo: key, opciones }, 'Opciones del catálogo');
  } catch (error) {
    return sendError(res, 500, 'Error al listar opciones del catálogo', error.message);
  }
};

export const listarCamposTipoGestion = async (req, res) => {
  try {
    const tipo = Number(req.query.tipo || req.params.tipo);
    if (!Number.isFinite(tipo) || tipo < 1) {
      return sendError(res, 400, 'Tipo inválido');
    }
    const soloActivos = String(req.query.soloActivos || 'true').toLowerCase() !== 'false';
    const clauses = ['tipo = :tipo'];
    if (soloActivos) clauses.push('activo = 1');
    const rows = await sequelize.query(
      `SELECT * FROM gestion_tipo_campos
       WHERE ${clauses.join(' AND ')}
       ORDER BY orden ASC, id ASC`,
      { replacements: { tipo }, type: QueryTypes.SELECT },
    );
    return sendSuccess(res, 200, { tipo, campos: rows.map(mapCampo) }, 'Campos del tipo');
  } catch (error) {
    return sendError(res, 500, 'Error al listar campos del tipo', error.message);
  }
};

export const upsertCampoTipoGestion = async (req, res) => {
  try {
    const body = req.body || {};
    const tipo = Number(body.tipo);
    const campoKey = String(body.campoKey || body.campo_key || '').trim();
    const columnaDb = String(body.columnaDb || body.columna_db || '').trim();
    const label = String(body.label || '').trim();
    if (!Number.isFinite(tipo) || !campoKey || !columnaDb || !label) {
      return sendError(res, 400, 'tipo, campoKey, columnaDb y label son obligatorios');
    }

    const optsBuilt = buildOpcionesJson(body);
    if (optsBuilt.error) return sendError(res, 400, optsBuilt.error);

    const id = body.id != null ? Number(body.id) : null;
    const hasCatalogo = Boolean(body.catalogo || (optsBuilt.json && safeParse(optsBuilt.json)?.catalogo));
    const payload = {
      tipo,
      campoKey,
      columnaDb,
      label,
      tipoInput: String(
        body.tipoInput || body.tipo_input || (hasCatalogo ? 'relation' : 'text'),
      ).slice(0, 32),
      visibleLista: body.visibleLista === false || body.visible_lista === false ? 0 : 1,
      visibleDetalle: body.visibleDetalle === false || body.visible_detalle === false ? 0 : 1,
      visibleForm: body.visibleForm === false || body.visible_form === false ? 0 : 1,
      requerido: body.requerido ? 1 : 0,
      orden: Number(body.orden) || 0,
      opcionesJson: optsBuilt.json,
      activo: body.activo === false ? 0 : 1,
    };

    let savedId = id;
    if (id && Number.isFinite(id)) {
      await sequelize.query(
        `UPDATE gestion_tipo_campos SET
           tipo = :tipo, campo_key = :campoKey, columna_db = :columnaDb, label = :label,
           tipo_input = :tipoInput, visible_lista = :visibleLista, visible_detalle = :visibleDetalle,
           visible_form = :visibleForm, requerido = :requerido, orden = :orden,
           opciones_json = :opcionesJson, activo = :activo
         WHERE id = :id`,
        { replacements: { ...payload, id }, type: QueryTypes.UPDATE },
      );
    } else {
      const result = await sequelize.query(
        `INSERT INTO gestion_tipo_campos
          (tipo, campo_key, columna_db, label, tipo_input, visible_lista, visible_detalle,
           visible_form, requerido, orden, opciones_json, activo)
         VALUES
          (:tipo, :campoKey, :columnaDb, :label, :tipoInput, :visibleLista, :visibleDetalle,
           :visibleForm, :requerido, :orden, :opcionesJson, :activo)
         ON DUPLICATE KEY UPDATE
           columna_db = VALUES(columna_db), label = VALUES(label), tipo_input = VALUES(tipo_input),
           visible_lista = VALUES(visible_lista), visible_detalle = VALUES(visible_detalle),
           visible_form = VALUES(visible_form), requerido = VALUES(requerido),
           orden = VALUES(orden), opciones_json = VALUES(opciones_json), activo = VALUES(activo)`,
        { replacements: payload, type: QueryTypes.INSERT },
      );
      savedId = Number(result?.[0] || 0) || null;
    }

    await registrarAuditoria({
      req,
      accion: id ? 'EDITAR' : 'CREAR',
      modulo: GESTION_MODULOS.TIPO_CAMPOS,
      entidad: 'gestion_tipo_campos',
      entidadId: savedId || `${tipo}:${campoKey}`,
      resumen: `${label} (tipo ${tipo})`,
      despues: payload,
    });

    return sendSuccess(res, id ? 200 : 201, { id: savedId }, 'Campo guardado');
  } catch (error) {
    return sendError(res, 500, 'Error al guardar campo', error.message);
  }
};

export const eliminarCampoTipoGestion = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, 400, 'ID inválido');
    const [existing] = await sequelize.query(
      `SELECT * FROM gestion_tipo_campos WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!existing) return sendError(res, 404, 'Campo no encontrado');
    await sequelize.query(`DELETE FROM gestion_tipo_campos WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.DELETE,
    });
    await registrarAuditoria({
      req,
      accion: 'ELIMINAR',
      modulo: GESTION_MODULOS.TIPO_CAMPOS,
      entidad: 'gestion_tipo_campos',
      entidadId: id,
      resumen: existing.label,
      antes: mapCampo(existing),
    });
    return sendSuccess(res, 200, { id }, 'Campo eliminado');
  } catch (error) {
    return sendError(res, 500, 'Error al eliminar campo', error.message);
  }
};
