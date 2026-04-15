import { Op } from 'sequelize';
import Cursos from '../database/models/CursosModel.js';
import Inscripciones from '../database/models/InscripcionesModel.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import Padres from '../database/models/PadresModel.js';
import Participantes from '../database/models/ParticipantesModel.js';
import Responsable from '../database/models/ResponsableModel.js';
import { enriquecerConRutaExtra } from '../utils/rutaSegura.js';

const anioActual = new Date().getFullYear();

const mesActual = String(new Date().getMonth() + 1).padStart(2, '0');

export const obtenerInscritosActivos = async (req, res) => {
  try {
    const withRutaExtra = String(req.query.withRutaExtra || 'false').toLowerCase() === 'true';
    const lite = String(req.query.lite || 'false').toLowerCase() === 'true';
    const idCurso = req.query.idCurso ? String(req.query.idCurso).trim() : null;

    const estadoQuery = req.query.estado;
    const estados = estadoQuery 
      ? estadoQuery.split(',').map(estado => estado.trim()).filter(Boolean)
      : ['CONFIRMADO'];

    const whereInscritos = {
      año: {
        [Op.eq]: anioActual
      },
      Tipo: {
        [Op.eq]: 1
      },
      Estado: estados.length === 1
        ? {
          [Op.eq]: estados[0]
        }
        : {
          [Op.in]: estados
        },
      Mes: {
        [Op.eq]: mesActual
      }
    };

    if (idCurso) {
      whereInscritos.IDCurso = {
        [Op.eq]: idCurso
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