import { sendError, sendSuccess } from '../utils/responseHandler.js';
import Rubricas from '../database/models/RubricasModel.js';
import { Op } from 'sequelize';
import Asignaciones from '../database/models/AsignacionModel.js';
import Cursos from '../database/models/CursosModel.js';
import { ROLES } from '../constants/roles.js';

export const crearRubrica = async (req, res) => {
    try {
        const { nombre, tipo, descripcion, categoria, nombreCategoria, alto, medio, bajo, actividad, comun, estado } = req.body;
        const responsable = req.user.email;
        const rubrica = await Rubricas.create({
            nombre,
            tipo,
            descripcion,
            responsable,
            categoria,
            nombreCategoria,
            alto,
            medio,
            bajo,
            actividad,
            comun,
            estado: estado || 'ACTIVO'
        });
        return sendSuccess(res, 200, rubrica, 'Rubrica creada correctamente');
    } catch (error) {
        return sendError(res, 500, 'Error al crear la rubrica', error.message);
    }
}

export const editarRubrica = async (req, res) => {
    try {
        const { id } = req.params;
        const rubricaFind = await Rubricas.findByPk(id);
        if (!rubricaFind) {
            return sendError(res, 404, 'Rubrica no encontrada');
        }
        const fechaModificacion = new Date();
        const { nombre, tipo, descripcion, categoria, nombreCategoria, alto, medio, bajo, actividad, comun, estado } = req.body;
        const responsable = req.user.email;
        await Rubricas.update({
            nombre,
            tipo,
            descripcion,
            responsable,
            categoria,
            nombreCategoria,
            alto,
            medio,
            bajo,
            actividad,
            comun,
            estado: estado || rubricaFind.estado || 'ACTIVO',
            fecha_modificacion: fechaModificacion
        }, { where: { id: rubricaFind.id } });
        const rubricaActualizada = await Rubricas.findByPk(rubricaFind.id);
        return sendSuccess(res, 200, rubricaActualizada, 'Rubrica actualizada correctamente');
    } catch (error) {
        return sendError(res, 500, 'Error al actualizar la rubrica', error.message);
    }
}

export const obtenerRubricas = async (req, res) => {
    try {
        const correo = req.user.email;
        const scope = String(req.query.scope || '').toLowerCase();
        const cursoId = req.query.cursoId ? String(req.query.cursoId).trim() : null;

        if (scope === 'all') {
            if (req.user.rol !== ROLES.ADMINISTRADOR) {
                return sendError(
                    res,
                    403,
                    'No autorizado: solo Administrador puede listar todas las rubricas (scope=all)',
                );
            }

            const rubricas = await Rubricas.findAll();
            return sendSuccess(res, 200, rubricas, 'Rubricas obtenidas correctamente');
        }

        // Modo seleccion de curso: rubricas del curso + rubricas comunes por actividad.
        if (cursoId) {
            const curso = await Cursos.findOne({
                where: {
                    ID_Curso: {
                        [Op.eq]: cursoId
                    }
                },
                attributes: ['ID_Curso', 'Actividad']
            });

            if (!curso) {
                return sendSuccess(res, 200, [], 'No existe el curso consultado');
            }

            const rubricas = await Rubricas.findAll({
                where: {
                    [Op.or]: [
                        {
                            categoria: {
                                [Op.eq]: curso.ID_Curso
                            }
                        },
                        {
                            comun: {
                                [Op.eq]: true
                            },
                            actividad: {
                                [Op.eq]: String(curso.Actividad)
                            }
                        }
                    ]
                }
            });

            return sendSuccess(res, 200, rubricas, 'Rubricas obtenidas correctamente para el curso');
        }

        const asignacionesDocente = await Asignaciones.findAll({
            where: {
                docente: correo,
                estado: {
                    [Op.eq]: 'ACTIVO'
                },
                lider:{
                    [Op.eq]: 'Si'
                }

            }
        });
        if (asignacionesDocente.length > 0) {
            const actividades = [
                ...new Set(
                    asignacionesDocente.map((asignacion) => asignacion.actividad)
                )
            ];

            const rubricas = await Rubricas.findAll({
                where: {
                    actividad: {
                        [Op.in]: actividades.map((actividad) => String(actividad))
                    }
                }
            });
            return sendSuccess(res, 200, rubricas, 'Rubricas obtenidas correctamente');
        }

        const idCursos = await Cursos.findAll({
            where: {
                Docente: correo,
                Estado_del_curso: {
                    [Op.eq]: 'ACTIVO'
                },
                Tipo: {
                    [Op.eq]: 1
                }
            }
        });
        const rubricas = await Rubricas.findAll({
            where: {
                categoria: {
                    [Op.in]: idCursos.map((curso) => curso.ID_Curso)
                }
            }
        });
        return sendSuccess(res, 200, rubricas, 'Rubricas obtenidas correctamente');


      
    } catch (error) {
        return sendError(res, 500, 'Error al obtener las rubricas', error.message);
    }
}