import { Op, QueryTypes } from 'sequelize';
import Cursos from '../database/models/CursosModel.js';
import Inscripciones from '../database/models/InscripcionesModel.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import Padres from '../database/models/PadresModel.js';
import Participantes from '../database/models/ParticipantesModel.js';
import Responsable from '../database/models/ResponsableModel.js';
import { sequelize } from '../database/sequelize.js';
import { enriquecerConRutaExtra } from '../utils/rutaSegura.js';
import {
  ESTADOS_INFORME_INSCRIPCION,
  inscripcionesValidasPeriodoSubquery,
  resolvePeriodoFiltro,
} from '../utils/inscripcionesPeriodo.js';

const anioActual = new Date().getFullYear();

const mesActual = String(new Date().getMonth() + 1).padStart(2, '0');

const parseEstadosQuery = (estadoQuery, fallback) => {
  const estados = estadoQuery
    ? String(estadoQuery)
        .split(',')
        .map((estado) => estado.trim())
        .filter(Boolean)
    : [...fallback];
  const allowed = new Set(ESTADOS_INFORME_INSCRIPCION);
  const filtered = estados.filter((e) => allowed.has(e.toUpperCase()));
  return filtered.length ? filtered.map((e) => e.toUpperCase()) : [...ESTADOS_INFORME_INSCRIPCION];
};

const mapInscripcionPeriodoRow = (row) => ({
  Tipo: row.Tipo,
  validador_participante: row.validador_participante,
  validador_responsable: row.validador_responsable,
  IDCurso: row.IDCurso,
  Transporte: row.Transporte,
  Sede: row.Sede,
  Estado: row.Estado,
  Mes: row.Mes,
  año: row.año,
  curso: row.Nombre_del_curso
    ? {
        ID_Curso: row.ID_Curso,
        Nombre_del_curso: row.Nombre_del_curso,
      }
    : null,
  participante: row.idParticipante
    ? {
        idParticipante: row.idParticipante,
        nombreCompleto: row.nombreCompleto,
        grupo: row.grupo,
      }
    : null,
});

const obtenerInscritosPeriodo = async (req, res) => {
  const withRutaExtra = String(req.query.withRutaExtra || 'false').toLowerCase() === 'true';
  const idCurso = req.query.idCurso ? String(req.query.idCurso).trim() : null;
  const estados = parseEstadosQuery(req.query.estado, ESTADOS_INFORME_INSCRIPCION);
  const { anio, mesInicio, mesFin } = resolvePeriodoFiltro({
    periodo: req.query.periodo,
    anio: req.query.anio,
  });

  const repl = { anio, mesInicio, mesFin };
  const clauses = ['1=1'];
  if (idCurso) {
    clauses.push('TRIM(li.IDCurso) = :idCurso');
    repl.idCurso = idCurso;
  }
  if (estados.length) {
    clauses.push(`TRIM(li.Estado) IN (${estados.map((_, i) => `:estado${i}`).join(', ')})`);
    estados.forEach((estado, i) => {
      repl[`estado${i}`] = estado;
    });
  }

  const rows = await sequelize.query(
    `SELECT
       li.validador_participante, li.IDCurso, li.Tipo, li.año, li.Mes, li.Estado,
       li.validador_responsable, li.Transporte, li.Sede,
       c.ID_Curso, c.Nombre_del_curso,
       p.IDParticipante AS idParticipante, p.Nombre_Completo AS nombreCompleto, p.Grupo AS grupo
     FROM ${inscripcionesValidasPeriodoSubquery()} li
     LEFT JOIN cursos_2025 c ON TRIM(c.ID_Curso) = TRIM(li.IDCurso)
     LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(li.validador_participante)
     WHERE ${clauses.join(' AND ')}
     ORDER BY p.Nombre_Completo ASC`,
    {
      replacements: repl,
      type: QueryTypes.SELECT,
    },
  );

  let inscritos = rows.map(mapInscripcionPeriodoRow);

  if (withRutaExtra) {
    inscritos = await enriquecerConRutaExtra(inscritos);
  }

  return sendSuccess(res, 200, { inscritos }, 'Inscritos del periodo obtenidos correctamente');
};

export const obtenerInscritosActivos = async (req, res) => {
  try {
    const scopePeriodo =
      String(req.query.scope || '').toLowerCase() === 'periodo' || Boolean(req.query.periodo);

    if (scopePeriodo) {
      return obtenerInscritosPeriodo(req, res);
    }

    const withRutaExtra = String(req.query.withRutaExtra || 'false').toLowerCase() === 'true';
    const lite = String(req.query.lite || 'false').toLowerCase() === 'true';
    const idCurso = req.query.idCurso ? String(req.query.idCurso).trim() : null;

    const estadoQuery = req.query.estado;
    const estados = estadoQuery
      ? estadoQuery.split(',').map((estado) => estado.trim()).filter(Boolean)
      : ['CONFIRMADO'];

    const whereInscritos = {
      año: {
        [Op.eq]: anioActual,
      },
      Tipo: {
        [Op.eq]: 1,
      },
      Estado: estados.length === 1
        ? {
            [Op.eq]: estados[0],
          }
        : {
            [Op.in]: estados,
          },
      Mes: {
        [Op.eq]: mesActual,
      },
    };

    if (idCurso) {
      whereInscritos.IDCurso = {
        [Op.eq]: idCurso,
      };
    }

    const include = [
      {
        model: Cursos,
        as: 'curso',
        attributes: ['ID_Curso', 'Nombre_del_curso'],
      },
      {
        model: Participantes,
        as: 'participante',
        attributes: lite
          ? ['idParticipante', 'nombreCompleto', 'grupo']
          : ['idParticipante', 'nombreCompleto', 'fechaNacimiento', 'grupo'],
        required: false,
        include: lite
          ? []
          : [
              {
                model: Padres,
                as: 'padreInfo',
                attributes: [
                  'docAlumno',
                  'nombrePadre',
                  'emailPadre',
                  'celularPadre',
                  'nombreMadre',
                  'emailMadre',
                  'celularMadre',
                ],
                required: false,
              },
              {
                model: Responsable,
                as: 'responsableInfo',
                attributes: ['IDResponsable', 'Nombre_Completo', 'Celular_Responsable', 'Correo_Responsable'],
                required: false,
              },
            ],
      },
    ];

    const inscritos = await Inscripciones.findAll({
      include,
      where: whereInscritos,
    });

    if (!withRutaExtra) {
      return sendSuccess(res, 200, { inscritos }, 'Inscritos obtenidos correctamente');
    }

    const inscritosConRutaExtra = await enriquecerConRutaExtra(inscritos);
    return sendSuccess(res, 200, { inscritos: inscritosConRutaExtra }, 'Inscritos con ruta EXTRA obtenidos correctamente');
  } catch (error) {
    return sendError(res, 500, 'Error al obtener los inscritos', error.message);
  }
};
