import { Op } from 'sequelize';
import Asistencia from '../database/models/AsistenciaModel.js';
import Asignaciones from '../database/models/AsignacionModel.js';
import Cursos from '../database/models/CursosModel.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import {
  eliminarNovedadRutaSegura,
  registrarNovedadRutaSegura,
} from '../utils/rutaSegura.js';

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

    if (fechaInicio || fechaFin) {
      where.fecha = {};
      if (fechaInicio) where.fecha[Op.gte] = fechaInicio;
      if (fechaFin) where.fecha[Op.lte] = fechaFin;
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
    const tieneRuta = Boolean(tieneRutaExtra) && Boolean(documento) && Boolean(sede);
    const reportNormalizado = String(reporte || '').trim();

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
      const reportePrevio = String(asistenciaHoy.reporte || '').trim();
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

      if (tieneRuta) {
        if (reportNormalizado === 'Faltó' || reportNormalizado === 'Excusa') {
          const note = reportNormalizado === 'Excusa' ? String(comentarios || '').trim() || 'Excusa' : 'Faltó';
          await registrarNovedadRutaSegura({ sede, document: documento, note });
        } else if (reportNormalizado === 'Asistió' && (reportePrevio === 'Faltó' || reportePrevio === 'Excusa')) {
          await eliminarNovedadRutaSegura({ sede, document: documento });
        }
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

    if (tieneRuta && (reportNormalizado === 'Faltó' || reportNormalizado === 'Excusa')) {
      const note = reportNormalizado === 'Excusa' ? String(comentarios || '').trim() || 'Excusa' : 'Faltó';
      await registrarNovedadRutaSegura({ sede, document: documento, note });
    }

    return sendSuccess(res, 200, { asistencia }, 'Asistencia registrada correctamente');
  } catch (error) {
    return sendError(res, 500, 'Error al registrar asistencia', error.message);
  }
};
