import { sendError, sendSuccess } from '../utils/responseHandler.js';
import Evaluaciones from '../database/models/EvaluacionesModel.js';
import DetalleEvaluacion from '../database/models/DetalleEvaluacionModel.js';
import Rubricas from '../database/models/RubricasModel.js';
import Usuarios from '../database/models/UsuariosModel.js';
import Cursos from '../database/models/CursosModel.js';
import Entrenadores from '../database/models/EntrenadoresModel.js';
import Inscripciones from '../database/models/InscripcionesModel.js';
import Participantes from '../database/models/ParticipantesModel.js';
import Padres from '../database/models/PadresModel.js';
import Responsable from '../database/models/ResponsableModel.js';
import { Op, fn, col, where } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { env } from '../config/env.js';
import {
  getUploadedFieldPath,
  safeRemoveInformeFile,
} from '../utils/evaluacionUploads.js';
import { generateInformePdf } from '../utils/evaluacionInformePdf.js';
import { getNivelTextoByValor, normalizeRubricaTipo } from '../utils/evaluacionRubricas.js';
import {
  isInformeFileReadable,
  resolveInformeAbsolutePath,
  sendEvaluacionInformeEmail,
} from '../utils/evaluacionEmail.js';
import {
  evaluateInformeEnvioWindow,
  fechaHoyColombia,
  informeYaEnviadoHoyColombia,
} from '../utils/informeEnvioWindow.js';

export const crearEvaluacion = async (req, res) => {
  try {
    const rubricasInput = req.body.rubricas;
    let rubricas = [];

    if (typeof rubricasInput === 'string') {
      try {
        rubricas = JSON.parse(rubricasInput);
      } catch {
        return sendError(res, 400, 'El campo rubricas debe ser un JSON valido');
      }
    } else if (Array.isArray(rubricasInput)) {
      rubricas = rubricasInput;
    }

    if (!Array.isArray(rubricas) || rubricas.length === 0) {
      return sendError(res, 400, 'Debes enviar al menos una rubrica en el campo rubricas');
    }

    const allowedValues = new Set([
      'Satisfactorio Alto',
      'Satisfactorio Medio',
      'Satisfactorio Básico',
    ]);

    const emailSesion = req.user.email;

    const rubricasNormalizadas = rubricas.map((item) => ({
      id_rubrica: Number(item.id_rubrica),
      valor: String(item.valor || '').trim(),
      responsable: emailSesion,
    }));

    if (rubricasNormalizadas.some((item) => !item.id_rubrica || !allowedValues.has(item.valor))) {
      return sendError(
        res,
        400,
        'Cada rubrica debe tener id_rubrica valido y valor permitido (Satisfactorio Alto/Medio/Básico)',
      );
    }

    const fotoPath =
      getUploadedFieldPath(req, 'foto') ||
      getUploadedFieldPath(req, 'file') ||
      getUploadedFieldPath(req, 'archivo') ||
      req.body.foto ||
      null;
    const {
      participante,
      identificacion,
      categoria,
      nombreCategoria,
      comentario,
      fechaEnvio,
      enviado,
      curso_recomendado,
    } = req.body;
    const fechaCreacion = new Date();
    const identKey = identificacion != null ? String(identificacion).trim() : '';
    const categoriaKey = categoria != null ? String(categoria).trim() : '';

    const result = await sequelize.transaction(async (transaction) => {
      const existing = await Evaluaciones.findOne({
        where: {
          identificacion: identKey,
          categoria: categoriaKey,
          [Op.and]: where(fn('DATE', col('fecha_creacion')), fn('CURDATE')),
        },
        transaction,
      });

      let evaluacion;
      let actualizada = false;

      if (existing) {
        actualizada = true;

        await DetalleEvaluacion.destroy({
          where: { id_evaluacion: existing.id },
          transaction,
        });

        const fotoFinal = fotoPath ?? existing.foto ?? null;

        await existing.update(
          {
            participante,
            identificacion: identKey,
            foto: fotoFinal,
            categoria: categoriaKey,
            fecha_creacion: fechaCreacion,
            nombreCategoria,
            comentario,
            fechaEnvio,
            enviado,
            curso_recomendado,
          },
          { transaction },
        );
        evaluacion = existing;
      } else {
        evaluacion = await Evaluaciones.create(
          {
            participante,
            identificacion: identKey,
            foto: fotoPath,
            categoria: categoriaKey,
            fecha_creacion: fechaCreacion,
            nombreCategoria,
            comentario,
            fechaEnvio,
            enviado,
            curso_recomendado,
          },
          { transaction },
        );
      }

      const detalles = rubricasNormalizadas.map((rubrica) => ({
        id_evaluacion: evaluacion.id,
        id_rubrica: rubrica.id_rubrica,
        valor: rubrica.valor,
        responsable: emailSesion,
      }));
      await DetalleEvaluacion.bulkCreate(detalles, { transaction });

      const rubricaIds = [...new Set(detalles.map((item) => item.id_rubrica))];
      const rubricasDb = await Rubricas.findAll({ where: { id: rubricaIds }, transaction });
      const rubricasMap = new Map(rubricasDb.map((item) => [item.id, item]));

      const enriquecidas = detalles.map((detalle) => {
        const rubrica = rubricasMap.get(detalle.id_rubrica);
        return {
          nombre: rubrica?.nombre || `Rubrica ${detalle.id_rubrica}`,
          tipo: rubrica?.tipo || 'SIN_TIPO',
          valor: detalle.valor,
          descripcionGeneral: rubrica?.descripcion || '',
          descripcion: getNivelTextoByValor(rubrica, detalle.valor),
        };
      });

      const destacados = enriquecidas.filter((item) =>
        ['FISICO', 'TECNICO', 'TACTICO'].includes(normalizeRubricaTipo(item.tipo)),
      );
      const actitudinales = enriquecidas.filter(
        (item) => normalizeRubricaTipo(item.tipo) === 'ACTITUDINAL',
      );

      const responsableEmail = emailSesion;
      let responsableNombre =
        (await resolveEntrenadorNombreDesdeCurso({ categoria: categoriaKey, transaction })) || '';

      if (!responsableNombre && responsableEmail) {
        const user = await Usuarios.findOne({
          where: { email: String(responsableEmail).trim() },
          transaction,
        });
        if (user?.nombre) responsableNombre = String(user.nombre).trim().toUpperCase();
      }
      if (!responsableNombre) responsableNombre = 'NO DEFINIDO';

      const fotoParaPdf = fotoPath ?? evaluacion.foto ?? null;

      const informePath = await generateInformePdf({
        participante,
        categoriaNombre: nombreCategoria,
        fechaCreacion,
        fotoPublicPath: fotoParaPdf,
        comentario,
        responsableNombre,
        desempenosDestacados: destacados,
        desempenosActitudinales: actitudinales,
      });

      const informeAnterior = evaluacion.informe;
      if (informePath && informeAnterior && informePath !== informeAnterior) {
        safeRemoveInformeFile(informeAnterior);
      }

      evaluacion.informe = informePath;
      if (actualizada) {
        evaluacion.fecha_modificacion = new Date();
      }
      await evaluacion.save({ transaction });
      return { evaluacion, detalles, actualizada };
    });

    return sendSuccess(
      res,
      200,
      {
        evaluacion: result.evaluacion,
        detalles: result.detalles,
        actualizada: result.actualizada,
        uploadDebug:
          env.nodeEnv === 'development'
            ? {
                contentType: req.headers['content-type'] || null,
                file: req.file
                  ? {
                      fieldname: req.file.fieldname,
                      originalname: req.file.originalname,
                      mimetype: req.file.mimetype,
                      path: req.file.path,
                    }
                  : null,
                files: Array.isArray(req.files)
                  ? req.files.map((file) => ({
                      fieldname: file.fieldname,
                      originalname: file.originalname,
                      mimetype: file.mimetype,
                      path: file.path,
                    }))
                  : req.files && typeof req.files === 'object'
                    ? Object.fromEntries(
                        Object.entries(req.files).map(([key, list]) => [
                          key,
                          Array.isArray(list)
                            ? list.map((file) => ({
                                fieldname: file.fieldname,
                                originalname: file.originalname,
                                mimetype: file.mimetype,
                                path: file.path,
                              }))
                            : [],
                        ]),
                      )
                    : null,
                bodyFoto: req.body?.foto ?? null,
                bodyKeys: Object.keys(req.body || {}),
              }
            : undefined,
      },
      result.actualizada
        ? 'Evaluacion actualizada correctamente'
        : 'Evaluacion creada correctamente',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al crear la evaluacion', error.message);
  }
};

export const obtenerEvaluacionParticipante = async (req, res) => {
  try {
    const identificacion =
      req.params.identificacion != null ? String(req.params.identificacion).trim() : '';

    if (!identificacion) {
      return sendError(res, 400, 'Identificacion requerida');
    }

    const evaluaciones = await Evaluaciones.findAll({
      where: { identificacion },
      order: [['fecha_creacion', 'DESC']],
      include: [
        {
          model: DetalleEvaluacion,
          as: 'detalles',
          separate: true,
          order: [['id_rubrica', 'ASC']],
          include: [{ association: 'rubrica', required: false }],
        },
      ],
    });

    return sendSuccess(
      res,
      200,
      { evaluaciones },
      evaluaciones.length
        ? 'Evaluaciones obtenidas correctamente'
        : 'No hay evaluaciones para este participante',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al obtener las evaluaciones', error.message);
  }
};

const correoDestinoValido = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const normalizarCorreo = (value) => String(value || '').trim().toLowerCase();

const correosFamiliaFromInscrito = (inscrito) => {
  const participante = inscrito?.participante || {};
  const padreInfo = participante?.padreInfo || {};
  const responsableInfo = participante?.responsableInfo || {};
  return [padreInfo?.emailPadre, padreInfo?.emailMadre, responsableInfo?.Correo_Responsable]
    .map(normalizarCorreo)
    .filter(Boolean)
    .filter(correoDestinoValido);
};

const obtenerInscritoParaCorreos = async (identificacion) => {
  const ident = String(identificacion || '').trim();
  if (!ident) return null;
  return Inscripciones.findOne({
    where: {
      validador_participante: ident,
      Tipo: 1,
    },
    order: [
      ['año', 'DESC'],
      ['Mes', 'DESC'],
    ],
    include: [
      {
        model: Participantes,
        as: 'participante',
        attributes: ['idParticipante', 'responsable'],
        required: false,
        include: [
          {
            model: Padres,
            as: 'padreInfo',
            attributes: ['emailPadre', 'emailMadre'],
            required: false,
          },
          {
            model: Responsable,
            as: 'responsableInfo',
            attributes: ['Correo_Responsable'],
            required: false,
          },
        ],
      },
    ],
  });
};

const resolveEntrenadorNombreDesdeCurso = async ({ categoria, transaction }) => {
  const categoriaKey = String(categoria || '').trim();
  if (!categoriaKey) return null;

  const curso = await Cursos.findOne({
    where: { ID_Curso: categoriaKey },
    attributes: ['Docente'],
    transaction,
  });
  const correoEntrenador = String(curso?.Docente || '').trim();
  if (!correoEntrenador) return null;

  const entrenador = await Entrenadores.findOne({
    where: { Correo: correoEntrenador },
    attributes: ['Nombre_Docente', 'Correo'],
    transaction,
  });
  const nombre = String(entrenador?.Nombre_Docente || '').trim();
  return nombre ? nombre.toUpperCase() : correoEntrenador.toUpperCase();
};

const mensajeVentanaInformeCerrada = (code) => {
  if (code === 'disabled') return 'El envío de informes por correo no está habilitado.';
  if (code === 'before_window') return 'El período de envío de informes aún no ha comenzado.';
  return 'Ya se cumplió la fecha de envío de informes por correo.';
};

const buildEnvioCorreoErrorMessage = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  const raw = String(error?.message || '').trim();
  const smtpResponse = String(error?.response || '').trim();
  const detail = raw || smtpResponse || 'No fue posible completar el envío.';

  if (code === 'EAUTH' || responseCode === 535) {
    return 'Error de autenticación SMTP (EMAIL_USER/EMAIL_PASS inválidos o no autorizados).';
  }
  if (code === 'ESOCKET' || code === 'ETIMEDOUT') {
    return 'No se pudo conectar al servidor SMTP (host/puerto/SSL o firewall).';
  }
  if (detail.includes('SendAsDenied') || responseCode === 554) {
    return 'La cuenta SMTP no tiene permiso para enviar con el remitente configurado.';
  }
  return `Fallo SMTP: ${detail}`;
};

export const getVentanaInformeEnvio = (req, res) => {
  const result = evaluateInformeEnvioWindow(env.informeEnvio);
  const fechaHoy = fechaHoyColombia();
  return sendSuccess(res, 200, {
    envioInformePermitido: result.ok,
    codigoBloqueo: result.ok ? null : result.code,
    fechaInicio: env.informeEnvio.desde,
    fechaFin: env.informeEnvio.hasta,
    /** Fecha calendario usada para la comparación (America/Bogota), para depuración en UI. */
    fechaHoy,
  });
};

export const enviarEvaluacion = async (req, res) => {
  try {
    const ventana = evaluateInformeEnvioWindow(env.informeEnvio);
    if (!ventana.ok) {
      return sendError(res, 403, mensajeVentanaInformeCerrada(ventana.code));
    }

    const id = Number(req.params.id);
    const destinatario = String(req.body?.destinatario ?? req.body?.correo ?? '').trim();

    if (!Number.isInteger(id) || id < 1) {
      return sendError(res, 400, 'Id de evaluacion invalido');
    }
    if (!destinatario) {
      return sendError(res, 400, 'Indique el correo destinatario (campo destinatario o correo)');
    }
    if (!correoDestinoValido(destinatario)) {
      return sendError(res, 400, 'Correo destinatario invalido');
    }

    if (!env.email.host || !env.email.user) {
      return sendError(
        res,
        503,
        'Envio de correo no configurado. Defina EMAIL_HOST y EMAIL_USER en el entorno.',
      );
    }

    const evaluacion = await Evaluaciones.findByPk(id);
    if (!evaluacion) {
      return sendError(res, 404, 'Evaluacion no encontrada');
    }
    if (informeYaEnviadoHoyColombia(evaluacion.get({ plain: true }))) {
      return sendError(
        res,
        403,
        'Ya se envió el informe por correo hoy. Podrás volver a enviarlo mañana.',
      );
    }
    if (!evaluacion.informe) {
      return sendError(res, 400, 'La evaluacion no tiene informe PDF para adjuntar');
    }

    const informeAbs = resolveInformeAbsolutePath(evaluacion.informe);
    if (!isInformeFileReadable(informeAbs)) {
      return sendError(res, 400, 'No se encuentra el archivo del informe en el servidor');
    }

    const participante = evaluacion.participante || 'Participante';
    const nombreCategoria =
      evaluacion.nombreCategoria || evaluacion.categoria || 'Categoria';

    const destinatarios = new Set([normalizarCorreo(destinatario)]);
    if (env.evaluacionEmail.incluirCorreosFamilia) {
      const inscrito = await obtenerInscritoParaCorreos(evaluacion.identificacion);
      const correosFamilia = correosFamiliaFromInscrito(inscrito);
      correosFamilia.forEach((correo) => destinatarios.add(correo));
    }
    const destinatariosFinales = [...destinatarios].filter(correoDestinoValido);
    if (destinatariosFinales.length === 0) {
      return sendError(res, 400, 'No hay correos válidos para enviar el informe');
    }

    await sendEvaluacionInformeEmail({
      to: destinatariosFinales,
      participante,
      nombreCategoria,
      attachmentPath: informeAbs,
    });

    const ahora = new Date();
    await evaluacion.update({
      enviado: true,
      fechaEnvio: ahora,
      fecha_modificacion: ahora,
    });
    await evaluacion.reload();

    return sendSuccess(
      res,
      200,
      {
        evaluacion: evaluacion.get({ plain: true }),
        destinatario,
        destinatarios: destinatariosFinales,
        incluyoCorreosFamilia: env.evaluacionEmail.incluirCorreosFamilia,
      },
      'Informe enviado por correo y evaluacion marcada como enviada',
    );
  } catch (error) {
    const reason = buildEnvioCorreoErrorMessage(error);
    return sendError(
      res,
      500,
      `Error al enviar el informe por correo: ${reason}`,
      reason,
    );
  }
};