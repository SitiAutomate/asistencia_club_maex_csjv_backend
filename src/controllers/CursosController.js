import { Op } from 'sequelize';
import Cursos from '../database/models/CursosModel.js';
import Asignaciones from '../database/models/AsignacionModel.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';

async function buildWhereCursosDocente(correo, soloMisCursos, scopeAll) {
  const whereCursos = {
    Estado_del_curso: { [Op.eq]: 'ACTIVO' },
    Tipo: { [Op.eq]: 1 },
  };

  if (scopeAll) {
    return { whereCursos, tieneApoyoGlobal: true };
  }

  if (soloMisCursos) {
    whereCursos.Docente = { [Op.eq]: correo };
    return { whereCursos, tieneApoyoGlobal: false };
  }

  const asignacionesDocente = await Asignaciones.findAll({
    where: {
      docente: correo,
      estado: { [Op.eq]: 'ACTIVO' },
    },
    attributes: ['actividad', 'apoyo'],
  });

  if (asignacionesDocente.length === 0) {
    return { sinAsignaciones: true };
  }

  const tieneApoyoGlobal = asignacionesDocente.some((asignacion) => {
    const apoyo = asignacion.apoyo;
    return apoyo === 1 || apoyo === '1' || apoyo === true || apoyo === 'true';
  });

  if (!tieneApoyoGlobal) {
    const actividades = [
      ...new Set(
        asignacionesDocente
          .map((asignacion) => asignacion.actividad)
          .filter((actividad) => actividad !== null && actividad !== undefined),
      ),
    ];

    whereCursos.Actividad = { [Op.in]: actividades };
  }

  return { whereCursos, tieneApoyoGlobal };
}

export const obtenerCursos = async (req, res) => {
  try {
    const correo = req.params.correo || req.query.correo;
    const soloMisCursos = String(req.query.soloMisCursos || 'false').toLowerCase() === 'true';
    const scopeAll = String(req.query.scope || '').toLowerCase() === 'all';

    if (!correo && !scopeAll) {
      return sendError(res, 400, 'Debes enviar el correo del docente');
    }

    const { whereCursos, sinAsignaciones, tieneApoyoGlobal } = await buildWhereCursosDocente(
      correo,
      soloMisCursos,
      scopeAll,
    );
    if (sinAsignaciones) {
      return sendSuccess(res, 200, { cursos: [] }, 'El docente no tiene asignaciones');
    }

    const cursos = await Cursos.findAll({
      where: whereCursos,
      attributes: ['ID_Curso', 'Nombre_del_curso', 'Nombre_Corto_Curso', 'Actividad'],
      order: [['Nombre_del_curso', 'ASC']],
    });

    return sendSuccess(
      res,
      200,
      { cursos, tieneApoyoGlobal: Boolean(tieneApoyoGlobal) },
      'Cursos obtenidos correctamente para el docente',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al obtener los cursos', error.message);
  }
};
