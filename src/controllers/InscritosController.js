import { Op, QueryTypes } from 'sequelize';
import Cursos from '../database/models/CursosModel.js';
import Inscripciones, { INSCRIPCIONES_ATTRS_BASE } from '../database/models/InscripcionesModel.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import Padres from '../database/models/PadresModel.js';
import Participantes from '../database/models/ParticipantesModel.js';
import Responsable from '../database/models/ResponsableModel.js';
import { sequelize } from '../database/sequelize.js';
import { enriquecerConRutaExtra } from '../utils/rutaSegura.js';
import {
  ESTADOS_INFORME_INSCRIPCION,
  getPeriodosInformesConfig,
  inscripcionesValidasPeriodoSubquery,
  resolvePeriodoFiltro,
} from '../utils/inscripcionesPeriodo.js';
import { userCanAccessCurso } from '../utils/courseAccess.js';

const anioActual = new Date().getFullYear();

const mesActual = String(new Date().getMonth() + 1).padStart(2, '0');

const parseEstadosQuery = (estadoQuery, fallback, { allowRetirado = false } = {}) => {
  const estados = estadoQuery
    ? String(estadoQuery)
        .split(',')
        .map((estado) => estado.trim())
        .filter(Boolean)
    : [...fallback];
  const allowed = new Set(ESTADOS_INFORME_INSCRIPCION);
  if (allowRetirado) allowed.add('RETIRADO');
  const filtered = estados.filter((e) => allowed.has(e.toUpperCase()));
  return filtered.length ? filtered.map((e) => e.toUpperCase()) : [...ESTADOS_INFORME_INSCRIPCION];
};

const mapInscripcionPeriodoRow = (row, { fullDetail = false } = {}) => {
  let participante = null;
  if (row.idParticipante) {
    participante = {
      idParticipante: row.idParticipante,
      nombreCompleto: row.nombreCompleto,
      grupo: row.grupo,
    };
    if (fullDetail) {
      participante.fechaNacimiento = row.fechaNacimiento;
      participante.padreInfo = {
        nombrePadre: row.nombrePadre || '',
        emailPadre: row.emailPadre || '',
        celularPadre: row.celularPadre || '',
        nombreMadre: row.nombreMadre || '',
        emailMadre: row.emailMadre || '',
        celularMadre: row.celularMadre || '',
      };
    }
  }

  return {
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
    participante,
  };
};

const estadosQueryIncluyenIncapacitado = (estadoQuery) =>
  String(estadoQuery || '')
    .split(',')
    .map((estado) => estado.trim().toUpperCase())
    .includes('INCAPACITADO');

const shouldUsePeriodoScope = (query) =>
  String(query.scope || '').toLowerCase() === 'periodo' ||
  String(query.scope || '').toLowerCase() === 'informacion' ||
  Boolean(query.periodo) ||
  String(query.forReportes || '').toLowerCase() === 'true' ||
  String(query.forReportes || '') === '1' ||
  estadosQueryIncluyenIncapacitado(query.estado);

const obtenerInscritosPeriodo = async (req, res) => {
  const scopeInformacion = String(req.query.scope || '').toLowerCase() === 'informacion';
  const withRutaExtra = String(req.query.withRutaExtra || 'false').toLowerCase() === 'true';
  const idCurso = req.query.idCurso ? String(req.query.idCurso).trim() : null;
  if (idCurso) {
    const allowed = await userCanAccessCurso(req.user, idCurso);
    if (!allowed) {
      return sendError(res, 403, 'No tiene permisos para consultar inscritos de este curso');
    }
  }
  const estados = parseEstadosQuery(req.query.estado, ESTADOS_INFORME_INSCRIPCION, {
    allowRetirado: scopeInformacion,
  });
  const { periodo, anio, mesInicio, mesFin } = resolvePeriodoFiltro({
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

  const participanteSelect = scopeInformacion
    ? `p.IDParticipante AS idParticipante,
       p.Nombre_Completo AS nombreCompleto,
       p.Grupo AS grupo,
       p.Fecha_Nacimiento AS fechaNacimiento,
       pad.\`Nombre del padre\` AS nombrePadre,
       pad.\`E-mail padre\` AS emailPadre,
       pad.\`Celular padre\` AS celularPadre,
       pad.\`Nombre de la madre\` AS nombreMadre,
       pad.\`E-mail madre\` AS emailMadre,
       pad.\`Celular madre\` AS celularMadre`
    : `p.IDParticipante AS idParticipante, p.Nombre_Completo AS nombreCompleto, p.Grupo AS grupo`;

  const padresJoin = scopeInformacion
    ? 'LEFT JOIN padres pad ON TRIM(pad.`Doc. Alumno`) = TRIM(p.IDParticipante)'
    : '';

  const rows = await sequelize.query(
    `SELECT
       li.validador_participante, li.IDCurso, li.Tipo, li.año, li.Mes, li.Estado,
       li.validador_responsable, li.Transporte, li.Sede,
       c.ID_Curso, c.Nombre_del_curso,
       ${participanteSelect}
     FROM ${inscripcionesValidasPeriodoSubquery()} li
     LEFT JOIN cursos_2025 c ON TRIM(c.ID_Curso) = TRIM(li.IDCurso)
     LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(li.validador_participante)
     ${padresJoin}
     WHERE ${clauses.join(' AND ')}
     ORDER BY p.Nombre_Completo ASC`,
    {
      replacements: repl,
      type: QueryTypes.SELECT,
    },
  );

  let inscritos = rows.map((row) => mapInscripcionPeriodoRow(row, { fullDetail: scopeInformacion }));

  if (withRutaExtra) {
    inscritos = await enriquecerConRutaExtra(inscritos);
  }

  return sendSuccess(
    res,
    200,
    {
      inscritos,
      meta: {
        scope: scopeInformacion ? 'informacion' : 'periodo',
        periodo,
        anio,
        mesInicio,
        mesFin,
        total: inscritos.length,
      },
    },
    'Inscritos del periodo obtenidos correctamente',
  );
};

export const obtenerConfigPeriodoInformes = async (_req, res) => {
  try {
    return sendSuccess(res, 200, getPeriodosInformesConfig(), 'Configuración de periodos obtenida');
  } catch (error) {
    return sendError(res, 500, 'Error al obtener configuración de periodos', error.message);
  }
};

export const obtenerInscritosReportes = async (req, res) => {
  try {
    return obtenerInscritosPeriodo(req, res);
  } catch (error) {
    return sendError(res, 500, 'Error al obtener inscritos para reportes', error.message);
  }
};

export const obtenerInscritosActivos = async (req, res) => {
  try {
    if (shouldUsePeriodoScope(req.query)) {
      return obtenerInscritosPeriodo(req, res);
    }

    const withRutaExtra = String(req.query.withRutaExtra || 'false').toLowerCase() === 'true';
    const lite = String(req.query.lite || 'false').toLowerCase() === 'true';
    const idCurso = req.query.idCurso ? String(req.query.idCurso).trim() : null;

    if (idCurso) {
      const allowed = await userCanAccessCurso(req.user, idCurso);
      if (!allowed) {
        return sendError(res, 403, 'No tiene permisos para consultar inscritos de este curso');
      }
    }

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
      attributes: INSCRIPCIONES_ATTRS_BASE,
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
