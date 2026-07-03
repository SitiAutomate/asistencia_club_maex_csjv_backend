import { Op, QueryTypes } from 'sequelize';
import Cursos from '../database/models/CursosModel.js';
import Asignaciones from '../database/models/AsignacionModel.js';
import { sequelize } from '../database/sequelize.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import {
  buildWhereCursosDocente,
  isAdminUser,
} from '../utils/courseAccess.js';

async function getLiderMetadata(correo) {
  if (!correo) {
    return { esLider: false, actividadesLider: [] };
  }

  const asignacionesLider = await Asignaciones.findAll({
    where: {
      docente: correo,
      estado: { [Op.eq]: 'ACTIVO' },
      lider: { [Op.eq]: 'Si' },
    },
    attributes: ['actividad'],
  });

  const actividadesLider = [
    ...new Set(
      asignacionesLider
        .map((asignacion) => asignacion.actividad)
        .filter((actividad) => actividad !== null && actividad !== undefined),
    ),
  ];

  return {
    esLider: asignacionesLider.length > 0,
    actividadesLider,
  };
}

export const obtenerCursos = async (req, res) => {
  try {
    const isAdmin = isAdminUser(req.user);
    const scopeAll = String(req.query.scope || '').toLowerCase() === 'all';

    if (scopeAll && !isAdmin) {
      return sendError(res, 403, 'Solo administradores pueden usar scope=all');
    }

    let correo = String(req.params.correo || req.query.correo || '').trim().toLowerCase();
    if (!isAdmin) {
      correo = String(req.user.email || '').trim().toLowerCase();
    } else if (req.params.correo) {
      const paramCorreo = String(req.params.correo || '').trim().toLowerCase();
      if (paramCorreo !== correo && correo && paramCorreo !== String(req.user.email || '').trim().toLowerCase()) {
        correo = paramCorreo;
      }
    }

    if (!correo && !scopeAll) {
      return sendError(res, 400, 'Debes enviar el correo del docente');
    }

    if (!isAdmin && req.params.correo) {
      const paramCorreo = String(req.params.correo || '').trim().toLowerCase();
      if (paramCorreo !== correo) {
        return sendError(res, 403, 'No puede consultar cursos de otro docente');
      }
    }

    const soloMisCursos = String(req.query.soloMisCursos || 'false').toLowerCase() === 'true';

    const { whereCursos, sinAsignaciones, tieneApoyoGlobal } = await buildWhereCursosDocente(
      correo,
      soloMisCursos,
      scopeAll,
    );
    const liderMeta = scopeAll ? { esLider: false, actividadesLider: [] } : await getLiderMetadata(correo);

    if (sinAsignaciones) {
      return sendSuccess(
        res,
        200,
        { cursos: [], tieneApoyoGlobal: false, ...liderMeta },
        'El docente no tiene asignaciones',
      );
    }

    const cursos = await Cursos.findAll({
      where: whereCursos,
      attributes: [
        'ID_Curso',
        'Nombre_del_curso',
        'Nombre_Corto_Curso',
        'Linea',
        'Actividad',
      ],
      order: [['Nombre_del_curso', 'ASC']],
    });

    const lineIds = [...new Set(cursos.map((c) => Number(c?.Linea)).filter((id) => Number.isFinite(id)))];
    let lineMap = new Map();
    if (lineIds.length > 0) {
      const lineRows = await sequelize.query(
        `SELECT IDLinea, Nombre_Linea
         FROM linea
         WHERE IDLinea IN (:lineIds)`,
        {
          replacements: { lineIds },
          type: QueryTypes.SELECT,
        },
      );
      lineMap = new Map(
        lineRows.map((row) => [Number(row.IDLinea), String(row.Nombre_Linea || '').trim()]),
      );
    }

    const cursosConLinea = cursos.map((curso) => {
      const plain = curso.get({ plain: true });
      return {
        ...plain,
        Nombre_Linea: lineMap.get(Number(plain.Linea)) || '',
      };
    });

    return sendSuccess(
      res,
      200,
      { cursos: cursosConLinea, tieneApoyoGlobal: Boolean(tieneApoyoGlobal), ...liderMeta },
      'Cursos obtenidos correctamente para el docente',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al obtener los cursos', error.message);
  }
};
