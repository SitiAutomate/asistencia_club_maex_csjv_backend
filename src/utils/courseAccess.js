import { Op } from 'sequelize';
import Cursos from '../database/models/CursosModel.js';
import Asignaciones from '../database/models/AsignacionModel.js';
import Inscripciones from '../database/models/InscripcionesModel.js';
import Evaluaciones from '../database/models/EvaluacionesModel.js';
import { ROLES } from '../constants/roles.js';

export function isAdminUser(user) {
  return user?.rol === ROLES.ADMINISTRADOR;
}

export async function buildWhereCursosDocente(correo, soloMisCursos, scopeAll) {
  const whereCursos = {
    Estado_del_curso: { [Op.eq]: 'ACTIVO' },
    Tipo: { [Op.eq]: 1 },
  };

  if (scopeAll) {
    return { whereCursos, tieneApoyoGlobal: true };
  }

  if (soloMisCursos) {
    const asignacionesLider = await Asignaciones.findAll({
      where: {
        docente: correo,
        estado: { [Op.eq]: 'ACTIVO' },
        lider: { [Op.eq]: 'Si' },
      },
      attributes: ['actividad'],
    });

    if (asignacionesLider.length > 0) {
      const actividades = [
        ...new Set(
          asignacionesLider
            .map((asignacion) => asignacion.actividad)
            .filter((actividad) => actividad !== null && actividad !== undefined),
        ),
      ];

      if (actividades.length > 0) {
        whereCursos[Op.or] = [
          { Docente: { [Op.eq]: correo } },
          { Actividad: { [Op.in]: actividades } },
        ];
      } else {
        whereCursos.Docente = { [Op.eq]: correo };
      }
    } else {
      whereCursos.Docente = { [Op.eq]: correo };
    }

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

async function getAccessibleCursoIdSet(user) {
  if (isAdminUser(user)) return null;

  const correo = String(user?.email || '').trim();
  if (!correo) return new Set();

  const { whereCursos, sinAsignaciones } = await buildWhereCursosDocente(correo, false, false);
  if (sinAsignaciones) return new Set();

  const cursos = await Cursos.findAll({
    where: whereCursos,
    attributes: ['ID_Curso'],
  });

  return new Set(cursos.map((c) => String(c.ID_Curso).trim()).filter(Boolean));
}

export async function userCanAccessCurso(user, idCurso) {
  const cursoKey = String(idCurso || '').trim();
  if (!cursoKey) return false;
  const accessible = await getAccessibleCursoIdSet(user);
  if (accessible === null) return true;
  return accessible.has(cursoKey);
}

export async function userCanAccessParticipante(user, identificacion) {
  const identKey = String(identificacion || '').trim();
  if (!identKey) return false;
  if (isAdminUser(user)) return true;

  const accessible = await getAccessibleCursoIdSet(user);
  if (!accessible || accessible.size === 0) return false;

  const inscripciones = await Inscripciones.findAll({
    where: { validador_participante: identKey },
    attributes: ['IDCurso'],
    limit: 50,
  });

  return inscripciones.some((row) => accessible.has(String(row.IDCurso).trim()));
}

export async function assertCursoAccess(user, idCurso) {
  const ok = await userCanAccessCurso(user, idCurso);
  return ok;
}

export async function assertParticipanteAccess(user, identificacion) {
  const ok = await userCanAccessParticipante(user, identificacion);
  return ok;
}

export async function userCanAccessUploadPath(user, publicPath) {
  if (isAdminUser(user)) return true;

  const normalized = String(publicPath || '').replace(/\\/g, '/').trim();
  if (!normalized.startsWith('/uploads/')) return false;

  const evaluacion = await Evaluaciones.findOne({
    where: {
      [Op.or]: [{ foto: normalized }, { informe: normalized }],
    },
    attributes: ['categoria', 'identificacion'],
  });

  if (evaluacion?.categoria) {
    return userCanAccessCurso(user, evaluacion.categoria);
  }
  if (evaluacion?.identificacion) {
    return userCanAccessParticipante(user, evaluacion.identificacion);
  }

  return false;
}
