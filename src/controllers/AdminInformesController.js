import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import {
  anioMesBogota,
  getPeriodoDefault,
  getPeriodoMonths,
  inscripcionesValidasPeriodoSubquery,
} from '../utils/inscripcionesPeriodo.js';

/** Evaluación más reciente del año por participante+categoría (sin filtrar mes de creación). */
const evalRecienteAnioSubquery = () => `(
  SELECT
    e.id,
    e.participante,
    e.identificacion,
    e.categoria,
    e.nombreCategoria,
    e.informe,
    e.enviado,
    e.fechaEnvio,
    e.fecha_creacion,
    e.fecha_modificacion
  FROM evaluaciones e
  INNER JOIN (
    SELECT
      TRIM(identificacion) AS identificacion,
      TRIM(categoria) AS categoria,
      MAX(fecha_creacion) AS max_fecha
    FROM evaluaciones
    WHERE YEAR(fecha_creacion) = :anio
    GROUP BY TRIM(identificacion), TRIM(categoria)
  ) mx
    ON TRIM(e.identificacion) = mx.identificacion
   AND TRIM(e.categoria) = mx.categoria
   AND e.fecha_creacion = mx.max_fecha
  WHERE YEAR(e.fecha_creacion) = :anio
)`;

function buildAdminInscripcionesFilters(query) {
  const fechaInicio = query.fechaInicio ? String(query.fechaInicio).trim() : '';
  const fechaFin = query.fechaFin ? String(query.fechaFin).trim() : '';
  const anioFiltro = query.anio ? String(query.anio).trim() : '';
  const categoria = query.categoria ? String(query.categoria).trim() : '';
  const entrenador = query.entrenador ? String(query.entrenador).trim() : '';
  const linea = query.linea ? String(query.linea).trim() : '';
  const periodo = query.periodo ? String(query.periodo).trim() : '';
  const estado = query.estado ? String(query.estado).trim().toLowerCase() : 'todos';
  const { anio: anioActualBogota, mesNum: mesActualBogota } = anioMesBogota();
  const anio = /^\d{4}$/.test(anioFiltro) ? Number(anioFiltro) : anioActualBogota;
  const periodoNormalizado =
    periodo === 'ene_jul' || periodo === 'ago_dic' ? periodo : getPeriodoDefault(mesActualBogota);
  const { mesInicio, mesFin } = getPeriodoMonths(periodoNormalizado, mesActualBogota);

  const repl = { anio, mesInicio, mesFin };
  const inscClauses = ['1=1'];
  const outerClauses = ['1=1'];

  if (categoria) {
    inscClauses.push('TRIM(iu.IDCurso) = :categoria');
    repl.categoria = categoria;
  }

  if (linea) {
    inscClauses.push(
      `EXISTS (
         SELECT 1 FROM cursos_2025 cx
         LEFT JOIN linea lx ON lx.IDLinea = cx.Linea
         WHERE TRIM(cx.ID_Curso) = TRIM(iu.IDCurso)
           AND TRIM(lx.Nombre_Linea) = :linea
       )`,
    );
    repl.linea = linea;
  }

  if (estado === 'enviado') {
    outerClauses.push('ev.enviado = 1');
  } else if (estado === 'no_enviado') {
    outerClauses.push('(ev.id IS NULL OR ev.enviado IS NULL OR ev.enviado = 0)');
  } else if (estado === 'con_pdf') {
    outerClauses.push("(ev.informe IS NOT NULL AND TRIM(ev.informe) <> '')");
  } else if (estado === 'sin_pdf') {
    outerClauses.push("(ev.id IS NULL OR ev.informe IS NULL OR TRIM(ev.informe) = '')");
  }

  if (entrenador) {
    outerClauses.push(
      `ev.id IS NOT NULL AND EXISTS (
         SELECT 1 FROM detalle_evaluacion d
         WHERE d.id_evaluacion = ev.id
           AND TRIM(d.responsable) = :entrenador
       )`,
    );
    repl.entrenador = entrenador;
  }

  if (fechaInicio && fechaFin) {
    const ini = new Date(`${fechaInicio}T00:00:00`);
    const fin = new Date(`${fechaFin}T23:59:59.999`);
    if (!Number.isNaN(ini.getTime()) && !Number.isNaN(fin.getTime())) {
      outerClauses.push(
        `(ev.id IS NULL OR (ev.fecha_creacion >= :fechaInicio AND ev.fecha_creacion <= :fechaFin))`,
      );
      repl.fechaInicio = ini;
      repl.fechaFin = fin;
    }
  } else if (fechaInicio) {
    const ini = new Date(`${fechaInicio}T00:00:00`);
    if (!Number.isNaN(ini.getTime())) {
      outerClauses.push('(ev.id IS NULL OR ev.fecha_creacion >= :fechaInicio)');
      repl.fechaInicio = ini;
    }
  } else if (fechaFin) {
    const fin = new Date(`${fechaFin}T23:59:59.999`);
    if (!Number.isNaN(fin.getTime())) {
      outerClauses.push('(ev.id IS NULL OR ev.fecha_creacion <= :fechaFin)');
      repl.fechaFin = fin;
    }
  }

  return {
    repl,
    inscClauses,
    outerClauses,
    anio,
    mesInicio,
    mesFin,
    periodo: periodoNormalizado,
    categoria,
    entrenador,
    linea,
  };
}

function buildAdminInscripcionesFromSql() {
  return `
    FROM ${inscripcionesValidasPeriodoSubquery()} iu
    LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(iu.validador_participante)
    LEFT JOIN cursos_2025 c ON TRIM(c.ID_Curso) = TRIM(iu.IDCurso)
    LEFT JOIN ${evalRecienteAnioSubquery()} ev
      ON TRIM(ev.identificacion) = TRIM(iu.validador_participante)
     AND TRIM(ev.categoria) = TRIM(iu.IDCurso)
    LEFT JOIN (
      SELECT id_evaluacion, MIN(TRIM(responsable)) AS entrenador
      FROM detalle_evaluacion
      WHERE responsable IS NOT NULL AND TRIM(responsable) <> ''
      GROUP BY id_evaluacion
    ) d ON d.id_evaluacion = ev.id`;
}

function mapAdminInformeRow(r) {
  const identificacion = String(r.identificacion || '').trim();
  const categoria = String(r.categoria || '').trim();
  const informe = String(r.informe || '').trim();
  return {
    id: r.id ?? null,
    rowKey: r.id != null ? String(r.id) : `${identificacion}__${categoria}`,
    participante: r.participante || null,
    identificacion: identificacion || null,
    categoria: categoria || null,
    nombreCategoria: r.nombreCategoria || null,
    informe: informe || null,
    enviado: Boolean(r.enviado),
    fechaEnvio: r.fechaEnvio ?? null,
    fecha_creacion: r.fecha_creacion ?? null,
    fecha_modificacion: r.fecha_modificacion ?? null,
    entrenador: r.entrenador || null,
  };
}

async function queryAdminInformesRows(query, { limit, offset = 0, forExport = false } = {}) {
  const { repl, inscClauses, outerClauses } = buildAdminInscripcionesFilters(query);
  const fromSql = buildAdminInscripcionesFromSql();
  const whereSql = `${inscClauses.join(' AND ')} AND ${outerClauses.join(' AND ')}`;

  const orderSql = forExport
    ? `ORDER BY COALESCE(p.Nombre_Completo, ev.participante) ASC, TRIM(iu.IDCurso) ASC`
    : `ORDER BY
         CASE WHEN ev.fecha_creacion IS NULL THEN 1 ELSE 0 END,
         ev.fecha_creacion DESC,
         COALESCE(p.Nombre_Completo, ev.participante) ASC,
         TRIM(iu.IDCurso) ASC`;

  const selectSql = forExport
    ? `SELECT
         ev.id,
         COALESCE(NULLIF(TRIM(ev.participante), ''), NULLIF(TRIM(p.Nombre_Completo), '')) AS participante,
         TRIM(iu.validador_participante) AS identificacion,
         TRIM(iu.IDCurso) AS categoria,
         COALESCE(
           NULLIF(TRIM(c.Nombre_Corto_Curso), ''),
           NULLIF(TRIM(c.Nombre_del_curso), ''),
           NULLIF(TRIM(ev.nombreCategoria), ''),
           TRIM(iu.IDCurso)
         ) AS nombreCategoria,
         NULLIF(TRIM(ev.informe), '') AS informe,
         ev.enviado,
         ev.fecha_creacion,
         d.entrenador`
    : `SELECT
         ev.id,
         COALESCE(NULLIF(TRIM(ev.participante), ''), NULLIF(TRIM(p.Nombre_Completo), '')) AS participante,
         TRIM(iu.validador_participante) AS identificacion,
         TRIM(iu.IDCurso) AS categoria,
         COALESCE(
           NULLIF(TRIM(c.Nombre_Corto_Curso), ''),
           NULLIF(TRIM(c.Nombre_del_curso), ''),
           NULLIF(TRIM(ev.nombreCategoria), ''),
           TRIM(iu.IDCurso)
         ) AS nombreCategoria,
         NULLIF(TRIM(ev.informe), '') AS informe,
         ev.enviado,
         ev.fechaEnvio,
         ev.fecha_creacion,
         ev.fecha_modificacion,
         d.entrenador`;

  let sql = `${selectSql} ${fromSql} WHERE ${whereSql} ${orderSql}`;
  const replacements = { ...repl };

  if (limit != null) {
    sql += ' LIMIT :limit OFFSET :offset';
    replacements.limit = limit;
    replacements.offset = offset;
  }

  return sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });
}

export const getResumenInformes = async (req, res) => {
  try {
    const { repl, inscClauses, outerClauses } = buildAdminInscripcionesFilters(req.query);
    const fromSql = buildAdminInscripcionesFromSql();
    const whereSql = `${inscClauses.join(' AND ')} AND ${outerClauses.join(' AND ')}`;

    const [rowResumen] = await sequelize.query(
      `SELECT
         COUNT(*) AS totalEvaluaciones,
         SUM(CASE WHEN (ev.informe IS NOT NULL AND TRIM(ev.informe) <> '') THEN 1 ELSE 0 END) AS conInforme,
         SUM(CASE WHEN (ev.id IS NULL OR ev.informe IS NULL OR TRIM(ev.informe) = '') THEN 1 ELSE 0 END) AS sinInforme,
         SUM(CASE WHEN ev.enviado = 1 THEN 1 ELSE 0 END) AS enviados
       ${fromSql}
       WHERE ${whereSql}`,
      {
        replacements: repl,
        type: QueryTypes.SELECT,
      },
    );

    const totalEvaluaciones = Number(rowResumen?.totalEvaluaciones ?? 0);
    const conInforme = Number(rowResumen?.conInforme ?? 0);
    const sinInforme = Number(rowResumen?.sinInforme ?? 0);
    const enviados = Number(rowResumen?.enviados ?? 0);

    return sendSuccess(res, 200, {
      totalEvaluaciones,
      conInforme,
      sinInforme,
      enviados,
      participantesSinInformePeriodo: sinInforme,
    });
  } catch (error) {
    return sendError(res, 500, 'Error al obtener resumen de informes', error.message);
  }
};

export const getEntrenadoresInformes = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT TRIM(d.responsable) AS email
       FROM detalle_evaluacion d
       WHERE d.responsable IS NOT NULL AND TRIM(d.responsable) <> ''`,
      { type: QueryTypes.SELECT },
    );
    const entrenadores = rows.map((r) => r.email).filter(Boolean).sort();
    return sendSuccess(res, 200, { entrenadores });
  } catch (error) {
    return sendError(res, 500, 'Error al listar entrenadores', error.message);
  }
};

export const getCategoriasInformes = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT
         TRIM(e.categoria) AS id,
         COALESCE(
           NULLIF(TRIM(c.Nombre_Corto_Curso), ''),
           NULLIF(TRIM(e.nombreCategoria), ''),
           TRIM(e.categoria)
         ) AS nombre,
         NULLIF(TRIM(l.Nombre_Linea), '') AS nombreLinea
       FROM evaluaciones e
       LEFT JOIN cursos_2025 c ON TRIM(c.ID_Curso) = TRIM(e.categoria)
       LEFT JOIN linea l ON l.IDLinea = c.Linea
       WHERE e.categoria IS NOT NULL AND TRIM(e.categoria) <> ''
       ORDER BY nombre ASC`,
      { type: QueryTypes.SELECT },
    );
    const categorias = rows
      .map((r) => ({
        id: String(r.id || '').trim(),
        nombre: String(r.nombre || '').trim(),
        nombreLinea: String(r.nombreLinea || '').trim(),
      }))
      .filter((r) => r.id);
    return sendSuccess(res, 200, { categorias });
  } catch (error) {
    return sendError(res, 500, 'Error al listar categorías', error.message);
  }
};

export const listarInformesAdmin = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const { repl, inscClauses, outerClauses } = buildAdminInscripcionesFilters(req.query);
    const fromSql = buildAdminInscripcionesFromSql();
    const whereSql = `${inscClauses.join(' AND ')} AND ${outerClauses.join(' AND ')}`;

    const countRows = await sequelize.query(
      `SELECT COUNT(*) AS c ${fromSql} WHERE ${whereSql}`,
      {
        replacements: repl,
        type: QueryTypes.SELECT,
      },
    );
    const total = Number(countRows[0]?.c ?? 0);

    const rows = await queryAdminInformesRows(req.query, { limit, offset, forExport: false });
    const evaluaciones = rows.map(mapAdminInformeRow);

    return sendSuccess(res, 200, {
      evaluaciones,
      total,
      page,
      limit,
    });
  } catch (error) {
    return sendError(res, 500, 'Error al listar informes', error.message);
  }
};

export const exportarInformesAdmin = async (req, res) => {
  try {
    const max = Math.min(50_000, Math.max(1, Number(req.query.max) || 50_000));
    const rows = await queryAdminInformesRows(req.query, { limit: max, offset: 0, forExport: true });
    const evaluaciones = rows.map(mapAdminInformeRow);

    return sendSuccess(res, 200, {
      evaluaciones,
      total: evaluaciones.length,
    });
  } catch (error) {
    return sendError(res, 500, 'Error al exportar informes', error.message);
  }
};

export const getGraficoCategoriasInformes = async (req, res) => {
  try {
    const { repl, inscClauses, outerClauses } = buildAdminInscripcionesFilters(req.query);
    const fromSql = buildAdminInscripcionesFromSql();
    const whereSql = `${inscClauses.join(' AND ')} AND ${outerClauses.join(' AND ')}`;

    const rows = await sequelize.query(
      `SELECT
         COALESCE(
           NULLIF(TRIM(c.Nombre_Corto_Curso), ''),
           NULLIF(TRIM(c.Nombre_del_curso), ''),
           TRIM(iu.IDCurso),
           'Sin categoría'
         ) AS categoria,
         SUM(CASE WHEN ev.enviado = 1 THEN 1 ELSE 0 END) AS enviados,
         SUM(CASE WHEN COALESCE(ev.enviado, 0) <> 1 THEN 1 ELSE 0 END) AS noEnviados,
         COUNT(*) AS total
       ${fromSql}
       WHERE ${whereSql}
       GROUP BY COALESCE(
         NULLIF(TRIM(c.Nombre_Corto_Curso), ''),
         NULLIF(TRIM(c.Nombre_del_curso), ''),
         TRIM(iu.IDCurso),
         'Sin categoría'
       )
       ORDER BY enviados ASC, total ASC, categoria ASC`,
      {
        replacements: repl,
        type: QueryTypes.SELECT,
      },
    );

    const categorias = rows.map((row) => ({
      categoria: row.categoria,
      enviados: Number(row.enviados ?? 0),
      noEnviados: Number(row.noEnviados ?? 0),
      total: Number(row.total ?? 0),
    }));

    return sendSuccess(res, 200, { categorias });
  } catch (error) {
    return sendError(res, 500, 'Error al construir gráfico por categoría', error.message);
  }
};
