import { Op, fn, col, where as sqlWhere, QueryTypes } from 'sequelize';
import Asistencia from '../database/models/AsistenciaModel.js';
import Asignaciones from '../database/models/AsignacionModel.js';
import Cursos from '../database/models/CursosModel.js';
import { sequelize } from '../database/sequelize.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import { sincronizarRutaSeguraSegunAsistenciaDelDia } from '../utils/asistenciaRutaSeguraSync.js';
import { fechaHoyColombiaYmd } from '../utils/fechaColombia.js';
import { anioMesBogota } from '../utils/inscripcionesPeriodo.js';
import { isAdminLikeRole } from '../constants/roles.js';

async function resolveCursosAsignados(correo) {
  const asignaciones = await Asignaciones.findAll({
    where: {
      docente: correo,
      estado: { [Op.eq]: 'ACTIVO' },
    },
    attributes: ['actividad', 'apoyo'],
  });

  if (!asignaciones.length) return [];

  const tieneApoyoGlobal = asignaciones.some((a) => {
    const apoyo = a.apoyo;
    return apoyo === 1 || apoyo === '1' || apoyo === true || apoyo === 'true';
  });

  const whereCursos = {
    Estado_del_curso: { [Op.eq]: 'ACTIVO' },
    Tipo: { [Op.eq]: 1 },
  };

  if (!tieneApoyoGlobal) {
    const actividades = [
      ...new Set(
        asignaciones.map((a) => a.actividad).filter((actividad) => actividad !== null && actividad !== undefined),
      ),
    ];
    whereCursos.Actividad = { [Op.in]: actividades };
  }

  const cursos = await Cursos.findAll({
    where: whereCursos,
    attributes: ['ID_Curso'],
  });

  return cursos.map((c) => String(c.ID_Curso)).filter(Boolean);
}

export const obtenerAsistencia = async (req, res) => {
  try {
    const responsable = req.user.email;
    const cursosAsignados = await resolveCursosAsignados(responsable);

    if (!cursosAsignados.length) {
      return sendSuccess(
        res,
        200,
        { asistencia: [], cursosAsignados: [] },
        'No tienes asignación de cursos activa',
      );
    }

    let fechaInicio = req.query.fechaInicio ? String(req.query.fechaInicio).trim() : '';
    let fechaFin = req.query.fechaFin ? String(req.query.fechaFin).trim() : '';
    const q = req.query.q ? String(req.query.q).trim() : '';

    // Por defecto, historial del último mes desde hoy.
    if (!fechaInicio && !fechaFin) {
      const now = new Date();
      const end = new Date(now);
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      const toIsoDate = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`;
      fechaInicio = toIsoDate(start);
      fechaFin = toIsoDate(end);
    }

    const where = {
      idcurso: { [Op.in]: cursosAsignados },
    };

    /** Comparar por fecha de calendario (solo día) para evitar desfases por hora/UTC en DATETIME. */
    if (fechaInicio || fechaFin) {
      const dateParts = [];
      if (fechaInicio) {
        dateParts.push(sqlWhere(fn('DATE', col('fecha')), { [Op.gte]: fechaInicio }));
      }
      if (fechaFin) {
        dateParts.push(sqlWhere(fn('DATE', col('fecha')), { [Op.lte]: fechaFin }));
      }
      if (dateParts.length) {
        where[Op.and] = [...(where[Op.and] || []), ...dateParts];
      }
    }

    if (q) {
      where[Op.or] = [
        { nombre: { [Op.like]: `%${q}%` } },
        { documento: { [Op.like]: `%${q}%` } },
        { curso: { [Op.like]: `%${q}%` } },
        { reporte: { [Op.like]: `%${q}%` } },
        { comentarios: { [Op.like]: `%${q}%` } },
        { ruta: { [Op.like]: `%${q}%` } },
      ];
    }

    const asistencia = await Asistencia.findAll({
      where,
      order: [['fecha', 'DESC'], ['hora', 'DESC']],
    });
    return sendSuccess(
      res,
      200,
      { asistencia, cursosAsignados },
      'Asistencia obtenida correctamente',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al obtener asistencia', error.message);
  }
};

export const registrarAsistencia = async (req, res) => {
  try {
    const { documento, nombre, idcurso, curso, reporte, comentarios, ruta, sede, tieneRutaExtra } = req.body;
    const responsable = req.user.email;
    const responsableLabel =
      String(req.user?.nombre || '').trim() || String(req.user?.email || '').trim();
    const tieneRuta = Boolean(tieneRutaExtra) && Boolean(documento) && Boolean(sede);
    const reportoAsistencia = String(reporte || '').trim() === 'Asistió';
    const debeSyncRutaSegura = Boolean(documento && sede) && (tieneRuta || reportoAsistencia);

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const inicioManana = new Date(inicioHoy);
    inicioManana.setDate(inicioManana.getDate() + 1);

    const asistenciaHoy = await Asistencia.findOne({
      where: {
        fecha: {
          [Op.gte]: inicioHoy,
          [Op.lt]: inicioManana,
        },
        documento,
        idcurso,
        responsable,
      },
    });

    if (asistenciaHoy) {
      await Asistencia.update(
        { nombre, curso, reporte, comentarios, ruta },
        {
          where: {
            fecha: {
              [Op.gte]: inicioHoy,
              [Op.lt]: inicioManana,
            },
            documento,
            idcurso,
            responsable,
          },
        },
      );

      const asistenciaActualizada = await Asistencia.findOne({
        where: {
          fecha: {
            [Op.gte]: inicioHoy,
            [Op.lt]: inicioManana,
          },
          documento,
          idcurso,
          responsable,
        },
      });

      if (debeSyncRutaSegura) {
        await sincronizarRutaSeguraSegunAsistenciaDelDia({
          sede,
          documento,
          tieneRutaExtra: tieneRuta,
          responsable: responsableLabel,
        });
      }

      return sendSuccess(
        res,
        200,
        { asistencia: asistenciaActualizada },
        'Asistencia actualizada correctamente',
      );
    }

    const asistencia = await Asistencia.create({
      documento,
      nombre,
      idcurso,
      curso,
      responsable,
      reporte,
      comentarios,
      ruta,
    });

    if (debeSyncRutaSegura) {
      await sincronizarRutaSeguraSegunAsistenciaDelDia({
        sede,
        documento,
        tieneRutaExtra: tieneRuta,
        responsable: responsableLabel,
      });
    }

    return sendSuccess(res, 200, { asistencia }, 'Asistencia registrada correctamente');
  } catch (error) {
    return sendError(res, 500, 'Error al registrar asistencia', error.message);
  }
};

/** Columna de día de la semana en cursos_2025 según calendario Bogotá. */
function columnaDiaCursoHoyBogota() {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    weekday: 'short',
  }).format(new Date());
  const map = {
    Mon: 'Lunes',
    Tue: 'Martes',
    Wed: 'Miércoles',
    Thu: 'Jueves',
    Fri: 'Viernes',
    Sat: 'SÁBADO',
  };
  return map[weekday] || null;
}

function diaMarcadoSql(colName) {
  // Columna puede tener acentos; quote con backticks.
  const col = `\`${String(colName).replace(/`/g, '')}\``;
  return `(
    UPPER(TRIM(IFNULL(${col}, ''))) IN ('X', 'SI', 'SÍ', '1', 'TRUE')
  )`;
}

/**
 * Cursos Tipo=1 activos que tienen clase hoy (Bogotá) y aún no tienen
 * ninguna asistencia registrada en el día. Para gestores.
 */
export const listarCursosSinAsistenciaHoy = async (req, res) => {
  try {
    if (!isAdminLikeRole(req.user?.rol)) {
      return sendError(res, 403, 'Solo gestores pueden ver este listado');
    }

    const hoy = fechaHoyColombiaYmd();
    const { anio, mes } = anioMesBogota();
    const sede = String(req.query.sede || '').trim();
    const diaCol = columnaDiaCursoHoyBogota();

    if (!diaCol) {
      return sendSuccess(
        res,
        200,
        { fecha: hoy, dia: null, total: 0, cursos: [] },
        'Hoy no hay clases programadas (domingo)',
      );
    }

    const clauses = [
      'c.Tipo = 1',
      `c.Estado_del_curso = 'ACTIVO'`,
      diaMarcadoSql(diaCol),
      `EXISTS (
         SELECT 1 FROM inscripciones_1 i
         WHERE TRIM(i.IDCurso) = TRIM(c.ID_Curso)
           AND i.Tipo = 1
           AND CAST(i.\`año\` AS UNSIGNED) = :anio
           AND LPAD(TRIM(i.Mes), 2, '0') = :mes
           AND TRIM(i.Estado) IN ('CONFIRMADO', 'ACTIVO', 'INCAPACITADO')
       )`,
      `NOT EXISTS (
         SELECT 1 FROM asistencia a
         WHERE TRIM(a.idcurso) = TRIM(c.ID_Curso)
           AND DATE(a.fecha) = :hoy
       )`,
    ];
    const repl = { hoy, anio, mes };

    if (sede) {
      clauses.push(`UPPER(TRIM(IFNULL(c.Sede, ''))) = UPPER(TRIM(:sede))`);
      repl.sede = sede;
    }

    const rows = await sequelize.query(
      `SELECT
          TRIM(c.ID_Curso) AS idCurso,
          c.Nombre_del_curso AS nombre,
          c.Nombre_Corto_Curso AS nombreCorto,
          TRIM(c.Sede) AS sede,
          c.Actividad AS actividadId,
          a.Nombre_Actividad AS actividad,
          COALESCE(
            NULLIF(TRIM(e.Nombre_Docente), ''),
            NULLIF(TRIM(e2.Nombre_Docente), ''),
            NULLIF(TRIM(c.Docente), '')
          ) AS docente
       FROM cursos_2025 c
       LEFT JOIN actividades a ON a.IDActividad = c.Actividad
       LEFT JOIN entrenadores e ON CONVERT(TRIM(e.ID) USING utf8mb4) = CONVERT(TRIM(c.Docente) USING utf8mb4)
       LEFT JOIN entrenadores e2 ON CONVERT(TRIM(e2.Correo) USING utf8mb4) = CONVERT(TRIM(c.Docente) USING utf8mb4)
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.Nombre_Actividad ASC, c.Nombre_del_curso ASC`,
      { replacements: repl, type: QueryTypes.SELECT },
    );

    const cursos = rows.map((r) => ({
      idCurso: String(r.idCurso || ''),
      nombre: r.nombre || r.nombreCorto || String(r.idCurso || ''),
      nombreCorto: r.nombreCorto || null,
      sede: r.sede || null,
      actividadId: r.actividadId != null ? Number(r.actividadId) : null,
      actividad: r.actividad || null,
      docente: r.docente || null,
    }));

    return sendSuccess(
      res,
      200,
      {
        fecha: hoy,
        dia: diaCol,
        total: cursos.length,
        cursos,
      },
      'Cursos sin asistencia de hoy',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar cursos sin asistencia', error.message);
  }
};
