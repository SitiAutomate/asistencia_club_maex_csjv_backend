import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import Evaluaciones from '../database/models/EvaluacionesModel.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';

function anioMesBogota() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value ?? new Date().getFullYear());
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  return { anio: y, mes: m, mesNum: Number(m) };
}

function buildListWhere(query) {
  const fechaInicio = query.fechaInicio ? String(query.fechaInicio).trim() : '';
  const fechaFin = query.fechaFin ? String(query.fechaFin).trim() : '';
  const anio = query.anio ? String(query.anio).trim() : '';
  const categoria = query.categoria ? String(query.categoria).trim() : '';
  const entrenador = query.entrenador ? String(query.entrenador).trim() : '';
  const estado = query.estado ? String(query.estado).trim().toLowerCase() : 'todos';

  const clauses = ['1=1'];
  const repl = [];

  if (fechaInicio && fechaFin) {
    const ini = new Date(`${fechaInicio}T00:00:00`);
    const fin = new Date(`${fechaFin}T23:59:59.999`);
    if (!Number.isNaN(ini.getTime()) && !Number.isNaN(fin.getTime())) {
      clauses.push('e.fecha_creacion BETWEEN ? AND ?');
      repl.push(ini, fin);
    }
  } else if (fechaInicio) {
    const ini = new Date(`${fechaInicio}T00:00:00`);
    if (!Number.isNaN(ini.getTime())) {
      clauses.push('e.fecha_creacion >= ?');
      repl.push(ini);
    }
  } else if (fechaFin) {
    const fin = new Date(`${fechaFin}T23:59:59.999`);
    if (!Number.isNaN(fin.getTime())) {
      clauses.push('e.fecha_creacion <= ?');
      repl.push(fin);
    }
  }

  if (/^\d{4}$/.test(anio)) {
    clauses.push('YEAR(e.fecha_creacion) = ?');
    repl.push(Number(anio));
  }

  if (categoria) {
    clauses.push('e.categoria = ?');
    repl.push(categoria);
  }

  if (estado === 'enviado') {
    clauses.push('e.enviado = 1');
  } else if (estado === 'no_enviado') {
    clauses.push('(e.enviado IS NULL OR e.enviado = 0)');
  } else if (estado === 'con_pdf') {
    clauses.push("(e.informe IS NOT NULL AND TRIM(e.informe) <> '')");
  } else if (estado === 'sin_pdf') {
    clauses.push("(e.informe IS NULL OR TRIM(e.informe) = '')");
  }

  if (entrenador) {
    clauses.push(
      `EXISTS (SELECT 1 FROM detalle_evaluacion d WHERE d.id_evaluacion = e.id AND TRIM(d.responsable) = ?)`,
    );
    repl.push(entrenador);
  }

  return { whereSql: clauses.join(' AND '), repl, categoria, entrenador, anio };
}

export const getResumenInformes = async (req, res) => {
  try {
    const { whereSql, repl, categoria, entrenador, anio } = buildListWhere(req.query);
    const [rowResumen] = await sequelize.query(
      `SELECT
         COUNT(*) AS totalEvaluaciones,
         SUM(CASE WHEN (e.informe IS NOT NULL AND TRIM(e.informe) <> '') THEN 1 ELSE 0 END) AS conInforme,
         SUM(CASE WHEN (e.informe IS NULL OR TRIM(e.informe) = '') THEN 1 ELSE 0 END) AS sinInforme,
         SUM(CASE WHEN e.enviado = 1 THEN 1 ELSE 0 END) AS enviados
       FROM evaluaciones e
       WHERE ${whereSql}`,
      {
        replacements: [...repl],
        type: QueryTypes.SELECT,
      },
    );

    const totalEvaluaciones = Number(rowResumen?.totalEvaluaciones ?? 0);
    const conInforme = Number(rowResumen?.conInforme ?? 0);
    const sinInforme = Number(rowResumen?.sinInforme ?? 0);
    const enviados = Number(rowResumen?.enviados ?? 0);

    const { anio: anioActualBogota, mes, mesNum } = anioMesBogota();
    const anioRef = /^\d{4}$/.test(anio) ? Number(anio) : anioActualBogota;
    const replSinInformeMes = { mes, anio: anioRef, mesNum };
    const extraClauses = [];
    if (categoria) {
      extraClauses.push('AND TRIM(i.IDCurso) = :categoria');
      replSinInformeMes.categoria = categoria;
    }
    if (entrenador) {
      extraClauses.push(
        `AND EXISTS (
          SELECT 1 FROM detalle_evaluacion d
          INNER JOIN evaluaciones ev ON ev.id = d.id_evaluacion
          WHERE TRIM(ev.identificacion) = TRIM(i.validador_participante)
            AND TRIM(ev.categoria) = TRIM(i.IDCurso)
            AND YEAR(ev.fecha_creacion) = :anio
            AND MONTH(ev.fecha_creacion) = :mesNum
            AND TRIM(d.responsable) = :entrenador
        )`,
      );
      replSinInformeMes.entrenador = entrenador;
    }

    const [row] = await sequelize.query(
      `SELECT COUNT(*) AS c
       FROM inscripciones_1 i
       WHERE i.Estado = 'CONFIRMADO' AND i.Tipo = 1 AND i.Mes = :mes AND i.año = :anio
       ${extraClauses.join('\n')}
       AND NOT EXISTS (
         SELECT 1 FROM evaluaciones e
         WHERE TRIM(e.identificacion) = TRIM(i.validador_participante)
         AND TRIM(e.categoria) = TRIM(i.IDCurso)
         AND e.informe IS NOT NULL
         AND YEAR(e.fecha_creacion) = :anio
         AND MONTH(e.fecha_creacion) = :mesNum
       )`,
      {
        replacements: replSinInformeMes,
        type: QueryTypes.SELECT,
      },
    );
    const participantesSinInformeMesActual = Number(row?.c ?? 0);

    return sendSuccess(res, 200, {
      totalEvaluaciones,
      conInforme,
      sinInforme,
      enviados,
      participantesSinInformeMesActual,
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
         ) AS nombre
       FROM evaluaciones e
       LEFT JOIN cursos_2025 c ON TRIM(c.ID_Curso) = TRIM(e.categoria)
       WHERE e.categoria IS NOT NULL AND TRIM(e.categoria) <> ''
       ORDER BY nombre ASC`,
      { type: QueryTypes.SELECT },
    );
    const categorias = rows
      .map((r) => ({ id: String(r.id || '').trim(), nombre: String(r.nombre || '').trim() }))
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

    const { whereSql, repl } = buildListWhere(req.query);

    const countRows = await sequelize.query(`SELECT COUNT(*) AS c FROM evaluaciones e WHERE ${whereSql}`, {
      replacements: [...repl],
      type: QueryTypes.SELECT,
    });
    const total = Number(countRows[0]?.c ?? 0);

    const rows = await sequelize.query(
      `SELECT e.id, e.participante, e.identificacion, e.categoria, e.nombreCategoria, e.informe,
              e.enviado, e.fechaEnvio, e.fecha_creacion, e.fecha_modificacion,
              (SELECT MIN(TRIM(d.responsable)) FROM detalle_evaluacion d WHERE d.id_evaluacion = e.id) AS entrenador
       FROM evaluaciones e
       WHERE ${whereSql}
       ORDER BY e.fecha_creacion DESC
       LIMIT ? OFFSET ?`,
      {
        replacements: [...repl, limit, offset],
        type: QueryTypes.SELECT,
      },
    );

    const evaluaciones = rows.map((r) => ({
      id: r.id,
      participante: r.participante,
      identificacion: r.identificacion,
      categoria: r.categoria,
      nombreCategoria: r.nombreCategoria,
      informe: r.informe,
      enviado: Boolean(r.enviado),
      fechaEnvio: r.fechaEnvio,
      fecha_creacion: r.fecha_creacion,
      fecha_modificacion: r.fecha_modificacion,
      entrenador: r.entrenador || null,
    }));

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

export const getGraficoCategoriasInformes = async (req, res) => {
  try {
    const categoria = req.query.categoria ? String(req.query.categoria).trim() : '';
    const entrenador = req.query.entrenador ? String(req.query.entrenador).trim() : '';
    const fechaInicio = req.query.fechaInicio ? String(req.query.fechaInicio).trim() : '';
    const fechaFin = req.query.fechaFin ? String(req.query.fechaFin).trim() : '';
    const anioFiltro = req.query.anio ? String(req.query.anio).trim() : '';
    const { anio: anioActualBogota, mes } = anioMesBogota();
    const anio = /^\d{4}$/.test(anioFiltro) ? Number(anioFiltro) : anioActualBogota;

    const repl = { anio, mes };
    const inscClauses = [
      'i.Tipo = 1',
      "i.Estado IN ('CONFIRMADO', 'INCAPACITADO', 'RETIRADO')",
      'i.año = :anio',
      'i.Mes = :mes',
    ];
    if (categoria) {
      inscClauses.push('TRIM(i.IDCurso) = :categoria');
      repl.categoria = categoria;
    }

    const evalClauses = [
      'TRIM(e.identificacion) = TRIM(i.validador_participante)',
      'TRIM(e.categoria) = TRIM(i.IDCurso)',
      "e.informe IS NOT NULL AND TRIM(e.informe) <> ''",
    ];

    if (fechaInicio && fechaFin) {
      const ini = new Date(`${fechaInicio}T00:00:00`);
      const fin = new Date(`${fechaFin}T23:59:59.999`);
      if (!Number.isNaN(ini.getTime()) && !Number.isNaN(fin.getTime())) {
        evalClauses.push('e.fecha_creacion BETWEEN :fechaInicio AND :fechaFin');
        repl.fechaInicio = ini;
        repl.fechaFin = fin;
      }
    } else if (fechaInicio) {
      const ini = new Date(`${fechaInicio}T00:00:00`);
      if (!Number.isNaN(ini.getTime())) {
        evalClauses.push('e.fecha_creacion >= :fechaInicio');
        repl.fechaInicio = ini;
      }
    } else if (fechaFin) {
      const fin = new Date(`${fechaFin}T23:59:59.999`);
      if (!Number.isNaN(fin.getTime())) {
        evalClauses.push('e.fecha_creacion <= :fechaFin');
        repl.fechaFin = fin;
      }
    }

    if (entrenador) {
      evalClauses.push(
        `EXISTS (
           SELECT 1
           FROM detalle_evaluacion d
           WHERE d.id_evaluacion = e.id
             AND TRIM(d.responsable) = :entrenador
         )`,
      );
      repl.entrenador = entrenador;
    }

    const evalExisteSql = evalClauses.join(' AND ');

    const rows = await sequelize.query(
      `SELECT
         COALESCE(
           NULLIF(TRIM(c.Nombre_Corto_Curso), ''),
           NULLIF(TRIM(c.Nombre_del_curso), ''),
           TRIM(i.IDCurso),
           'Sin categoría'
         ) AS categoria,
         SUM(
           CASE WHEN EXISTS (
             SELECT 1
             FROM evaluaciones e
             WHERE ${evalExisteSql}
               AND e.enviado = 1
           ) THEN 1 ELSE 0 END
         ) AS enviados,
         SUM(
           CASE WHEN EXISTS (
             SELECT 1
             FROM evaluaciones e
             WHERE ${evalExisteSql}
           ) THEN 0 ELSE 1 END
         ) AS noEnviados,
         COUNT(*) AS total
       FROM inscripciones_1 i
       LEFT JOIN cursos_2025 c ON TRIM(c.ID_Curso) = TRIM(i.IDCurso)
       WHERE ${inscClauses.join(' AND ')}
       GROUP BY COALESCE(
         NULLIF(TRIM(c.Nombre_Corto_Curso), ''),
         NULLIF(TRIM(c.Nombre_del_curso), ''),
         TRIM(i.IDCurso),
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
