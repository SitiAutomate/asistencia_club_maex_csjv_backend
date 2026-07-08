import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import { fechaHoyColombiaYmd } from '../utils/fechaColombia.js';
import { resolveMaestroFromRequest, isLvlupAdmin, listMaestrosAcademicosActivos, findMaestroAcademicoById } from '../utils/lvlupMaestro.js';
import { LVLUP_TIPOS_REGISTRO } from '../utils/lvlupConstants.js';
import {
  buildResumenSaldo,
  horasContratadasAsignacion,
  queryConsumoHorasParticipante,
  validarRegistroHoras,
} from '../utils/lvlupHoras.js';

const ESTADOS_SQL = "('CONFIRMADO', 'ACTIVO')";

function horaActualColombia() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

async function getAsignacionActiva(asignacionId, { maestroId, isAdmin }) {
  const sqlAdmin = `SELECT al.*,
            asig.Asignatura AS nombre_asignatura,
            gl.nombre AS grupo_nombre,
            m.nombre AS maestro_nombre
     FROM asignacion_lvlup al
     LEFT JOIN asignaturas asig ON asig.IDAsignatura = al.id_asignatura
     LEFT JOIN grupos_lvlup gl ON gl.id = al.grupo_id
     LEFT JOIN maestros_academicos m ON m.id = al.maestro_id
     WHERE al.id = :id AND al.estado = 'ACTIVO'
     LIMIT 1`;

  const sqlMaestro = `SELECT al.*,
            asig.Asignatura AS nombre_asignatura,
            gl.nombre AS grupo_nombre,
            m.nombre AS maestro_nombre
     FROM asignacion_lvlup al
     LEFT JOIN asignaturas asig ON asig.IDAsignatura = al.id_asignatura
     LEFT JOIN grupos_lvlup gl ON gl.id = al.grupo_id
     LEFT JOIN maestros_academicos m ON m.id = al.maestro_id
     WHERE al.id = :id AND al.maestro_id = :maestroId AND al.estado = 'ACTIVO'
     LIMIT 1`;

  const rows = await sequelize.query(isAdmin ? sqlAdmin : sqlMaestro, {
    replacements: isAdmin ? { id: asignacionId } : { id: asignacionId, maestroId },
    type: QueryTypes.SELECT,
  });
  return rows[0] || null;
}

export const listarMaestrosLvlup = async (req, res) => {
  try {
    if (!isLvlupAdmin(req)) {
      return sendError(res, 403, 'Solo administradores pueden listar maestros');
    }
    const maestros = await listMaestrosAcademicosActivos();
    return sendSuccess(res, 200, { maestros });
  } catch (error) {
    return sendError(res, 500, 'Error al listar maestros', error.message);
  }
};

export const listarAsignacionesLvlup = async (req, res) => {
  try {
    const admin = isLvlupAdmin(req);
    const maestro = await resolveMaestroFromRequest(req);

    if (!maestro && !admin) {
      return sendError(res, 403, 'No tienes perfil de maestro LVL UP activo');
    }

    const replacements = {};
    let whereMaestro = '';
    const maestroFiltro = admin && req.query.maestroId ? Number(req.query.maestroId) : null;

    if (maestro && !admin) {
      whereMaestro = 'AND al.maestro_id = :maestroId';
      replacements.maestroId = maestro.id;
    } else if (maestroFiltro && Number.isInteger(maestroFiltro) && maestroFiltro > 0) {
      whereMaestro = 'AND al.maestro_id = :maestroIdFiltro';
      replacements.maestroIdFiltro = maestroFiltro;
    }

    const rows = await sequelize.query(
      `SELECT al.id AS asignacion_id,
              al.maestro_id,
              m.nombre AS maestro_nombre,
              al.sede,
              al.id_curso,
              al.id_asignatura,
              asig.Asignatura AS nombre_asignatura,
              al.sesion,
              al.grupo_id,
              gl.nombre AS grupo_nombre,
              al.validador_participante,
              al.tipo_paquete,
              al.horas_asignadas,
              al.horas_diagnostico,
              al.horas_informe_final,
              al.fecha_inicio_paquete,
              al.fecha_fin_paquete,
              al.anio,
              al.mes,
              CASE
                WHEN TRIM(al.id_curso) IN ('2351','2352') THEN 1
                WHEN TRIM(al.id_curso) IN ('2353','2354') THEN 2
                ELSE NULL
              END AS nivel
       FROM asignacion_lvlup al
       LEFT JOIN maestros_academicos m ON m.id = al.maestro_id
       LEFT JOIN asignaturas asig ON asig.IDAsignatura = al.id_asignatura
       LEFT JOIN grupos_lvlup gl ON gl.id = al.grupo_id
       WHERE al.estado = 'ACTIVO'
         ${whereMaestro}
       ORDER BY m.nombre ASC, asig.Asignatura ASC, al.sesion ASC, gl.nombre ASC`,
      { replacements, type: QueryTypes.SELECT },
    );

    return sendSuccess(res, 200, {
      asignaciones: rows,
      maestro: maestro || null,
      modoAdmin: admin,
    });
  } catch (error) {
    return sendError(res, 500, 'Error al listar asignaciones LVL UP', error.message);
  }
};

async function queryParticipantesAsignacion(asignacion) {
  return sequelize.query(
    `SELECT i.validador_participante AS documento,
            p.Nombre_Completo AS nombre,
            TRIM(i.Estado) AS estado_inscripcion
     FROM asignacion_lvlup al
     INNER JOIN inscripciones_1 i
       ON i.Tipo = 4
      AND TRIM(i.IDCurso) = TRIM(al.id_curso) COLLATE utf8mb4_general_ci
      AND CAST(i.asignatura AS UNSIGNED) = al.id_asignatura
      AND TRIM(i.Sede) = TRIM(al.sede) COLLATE utf8mb4_general_ci
      AND TRIM(i.Estado) IN ${ESTADOS_SQL}
      AND (
            (al.sesion = 'Individual'
             AND TRIM(i.validador_participante) = TRIM(al.validador_participante) COLLATE utf8mb4_general_ci)
         OR (al.sesion = 'Grupal' AND i.grupo_lvlup_id = al.grupo_id)
          )
     LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(i.validador_participante)
     WHERE al.id = :asignacionId
     ORDER BY p.Nombre_Completo ASC`,
    {
      replacements: { asignacionId: asignacion.id },
      type: QueryTypes.SELECT,
    },
  );
}

async function participantesConSaldo(asignacion) {
  const participantes = await queryParticipantesAsignacion(asignacion);
  const enriched = [];
  for (const p of participantes) {
    const consumo = await queryConsumoHorasParticipante(sequelize, asignacion.id, p.documento);
    enriched.push({
      ...p,
      saldo: buildResumenSaldo(asignacion, consumo),
    });
  }
  return enriched;
}

async function resolveAsignacionRequest(req, asignacionId) {
  const admin = isLvlupAdmin(req);
  const maestro = await resolveMaestroFromRequest(req);
  if (!admin && !maestro) {
    return { error: { status: 403, message: 'No tienes perfil de maestro LVL UP activo' } };
  }
  const asignacion = await getAsignacionActiva(asignacionId, {
    maestroId: maestro?.id,
    isAdmin: admin,
  });
  if (!asignacion) {
    return { error: { status: 404, message: 'Asignación no encontrada' } };
  }
  const maestroEfectivo =
    maestro || (await findMaestroAcademicoById(asignacion.maestro_id));
  if (!maestroEfectivo) {
    return { error: { status: 400, message: 'Maestro de la asignación no encontrado' } };
  }
  return { asignacion, maestro: maestroEfectivo, admin };
}

export const listarParticipantesLvlup = async (req, res) => {
  try {
    const asignacionId = Number(req.params.id);
    if (!Number.isInteger(asignacionId) || asignacionId < 1) {
      return sendError(res, 400, 'Id de asignación inválido');
    }

    const ctx = await resolveAsignacionRequest(req, asignacionId);
    if (ctx.error) return sendError(res, ctx.error.status, ctx.error.message);

    const participantes = await participantesConSaldo(ctx.asignacion);
    return sendSuccess(res, 200, { asignacion: ctx.asignacion, participantes });
  } catch (error) {
    return sendError(res, 500, 'Error al listar participantes', error.message);
  }
};

export const obtenerSaldoLvlup = async (req, res) => {
  try {
    const asignacionId = Number(req.params.id);
    const ctx = await resolveAsignacionRequest(req, asignacionId);
    if (ctx.error) return sendError(res, ctx.error.status, ctx.error.message);

    const { asignacion } = ctx;
    const participanteFiltro = req.query.participante
      ? String(req.query.participante).trim()
      : null;

    const rows = await sequelize.query(
      `SELECT a.validador_participante AS documento,
              COALESCE(SUM(a.horas_asistidas), 0) AS horas_usadas
       FROM asistencia_lvlup a
       WHERE a.asignacion_id = :asignacionId
         AND (:participante IS NULL OR TRIM(a.validador_participante) = TRIM(:participante))
       GROUP BY a.validador_participante`,
      {
        replacements: { asignacionId, participante: participanteFiltro },
        type: QueryTypes.SELECT,
      },
    );

    const horasContratadas = horasContratadasAsignacion(asignacion);
    const saldos = rows.map((r) => ({
      documento: r.documento,
      horas_usadas: Number(r.horas_usadas),
      horas_contratadas: horasContratadas,
      saldo:
        horasContratadas != null
          ? horasContratadas - Number(r.horas_usadas)
          : null,
    }));

    return sendSuccess(res, 200, {
      asignacion_id: asignacionId,
      tipo_paquete: asignacion.tipo_paquete,
      fecha_fin_paquete: asignacion.fecha_fin_paquete,
      saldos,
    });
  } catch (error) {
    return sendError(res, 500, 'Error al calcular saldo', error.message);
  }
};

export const listarHistorialLvlup = async (req, res) => {
  try {
    const admin = isLvlupAdmin(req);
    const maestro = await resolveMaestroFromRequest(req);

    if (!maestro && !admin) {
      return sendError(res, 403, 'No tienes perfil de maestro LVL UP activo');
    }

    const hoy = fechaHoyColombiaYmd();
    const fechaFin = req.query.fechaFin ? String(req.query.fechaFin).trim().slice(0, 10) : hoy;
    let fechaInicio = req.query.fechaInicio
      ? String(req.query.fechaInicio).trim().slice(0, 10)
      : null;
    if (!fechaInicio) {
      const [y, m, d] = hoy.split('-').map(Number);
      const desde = new Date(y, m - 1 - 3, d);
      fechaInicio = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}-${String(desde.getDate()).padStart(2, '0')}`;
    }

    const replacements = { fechaInicio, fechaFin };
    const filtros = ['a.fecha >= :fechaInicio', 'a.fecha <= :fechaFin'];

    const maestroFiltro = admin && req.query.maestroId ? Number(req.query.maestroId) : null;
    const asignacionFiltro = req.query.asignacionId ? Number(req.query.asignacionId) : null;

    if (maestro && !admin) {
      filtros.push('a.maestro_id = :maestroId');
      replacements.maestroId = maestro.id;
    } else if (maestroFiltro && Number.isInteger(maestroFiltro) && maestroFiltro > 0) {
      filtros.push('a.maestro_id = :maestroIdFiltro');
      replacements.maestroIdFiltro = maestroFiltro;
    }

    if (asignacionFiltro && Number.isInteger(asignacionFiltro) && asignacionFiltro > 0) {
      filtros.push('a.asignacion_id = :asignacionId');
      replacements.asignacionId = asignacionFiltro;
    }

    const registros = await sequelize.query(
      `SELECT a.id,
              a.fecha,
              a.hora,
              a.nombre,
              a.documento,
              a.sesion,
              a.tipo_registro,
              a.horas_asistidas,
              a.asistio,
              a.comentarios,
              a.registrado_por,
              a.asignacion_id,
              al.sede,
              asig.Asignatura AS nombre_asignatura,
              m.nombre AS maestro_nombre,
              gl.nombre AS grupo_nombre
       FROM asistencia_lvlup a
       INNER JOIN asignacion_lvlup al ON al.id = a.asignacion_id
       LEFT JOIN asignaturas asig ON asig.IDAsignatura = al.id_asignatura
       LEFT JOIN maestros_academicos m ON m.id = a.maestro_id
       LEFT JOIN grupos_lvlup gl ON gl.id = a.grupo_id
       WHERE ${filtros.join(' AND ')}
       ORDER BY a.fecha DESC, a.hora DESC, a.nombre ASC
       LIMIT 3000`,
      { replacements, type: QueryTypes.SELECT },
    );

    return sendSuccess(res, 200, {
      registros,
      fechaInicio,
      fechaFin,
      total: registros.length,
    });
  } catch (error) {
    return sendError(res, 500, 'Error al listar historial LVL UP', error.message);
  }
};

export const listarAsistenciaLvlup = async (req, res) => {
  try {
    const asignacionId = Number(req.params.id);
    const ctx = await resolveAsignacionRequest(req, asignacionId);
    if (ctx.error) return sendError(res, ctx.error.status, ctx.error.message);

    const fechaInicio = req.query.fechaInicio
      ? String(req.query.fechaInicio).trim()
      : fechaHoyColombiaYmd();
    const fechaFin = req.query.fechaFin
      ? String(req.query.fechaFin).trim()
      : fechaInicio;

    const registros = await sequelize.query(
      `SELECT a.*, s.horas_sesion
       FROM asistencia_lvlup a
       LEFT JOIN sesion_lvlup s ON s.id = a.sesion_lvlup_id
       WHERE a.asignacion_id = :asignacionId
         AND a.fecha >= :fechaInicio
         AND a.fecha <= :fechaFin
       ORDER BY a.fecha DESC, a.hora DESC, a.nombre ASC`,
      {
        replacements: { asignacionId, fechaInicio, fechaFin },
        type: QueryTypes.SELECT,
      },
    );

    return sendSuccess(res, 200, { registros, fechaInicio, fechaFin });
  } catch (error) {
    return sendError(res, 500, 'Error al listar asistencia', error.message);
  }
};

export const registrarAsistenciaIndividualLvlup = async (req, res) => {
  try {
    const asignacionId = Number(req.body.asignacionId);
    const horas = Number(req.body.horas);
    const tipoRegistro = String(req.body.tipoRegistro || 'REGULAR').toUpperCase();
    const fecha = req.body.fecha ? String(req.body.fecha).slice(0, 10) : fechaHoyColombiaYmd();
    const comentarios = req.body.comentarios ? String(req.body.comentarios).trim() : null;

    if (!Number.isInteger(asignacionId) || asignacionId < 1) {
      return sendError(res, 400, 'asignacionId inválido');
    }
    if (!Number.isFinite(horas) || horas <= 0) {
      return sendError(res, 400, 'Debes indicar horas mayores a 0');
    }
    if (!LVLUP_TIPOS_REGISTRO.includes(tipoRegistro)) {
      return sendError(res, 400, 'tipoRegistro inválido');
    }

    const ctx = await resolveAsignacionRequest(req, asignacionId);
    if (ctx.error) return sendError(res, ctx.error.status, ctx.error.message);
    const { asignacion, maestro } = ctx;

    if (asignacion.sesion !== 'Individual') {
      return sendError(res, 400, 'Esta asignación es grupal; use el flujo de sesión grupal');
    }

    const participantes = await queryParticipantesAsignacion(asignacion);
    if (!participantes.length) {
      return sendError(res, 400, 'No hay participante activo en esta asignación');
    }
    const alumno = participantes[0];

    const errorHoras = await validarRegistroHoras(
      sequelize,
      asignacion,
      alumno.documento,
      horas,
      tipoRegistro,
      fecha,
    );
    if (errorHoras) return sendError(res, 400, errorHoras);

    const hora = horaActualColombia();
    const registradoPor = String(req.user.email || '').trim();

    await sequelize.query(
      `INSERT INTO asistencia_lvlup (
         asignacion_id, sesion_lvlup_id, maestro_id, grupo_id,
         validador_participante, documento, nombre, sede, id_curso, id_asignatura,
         sesion, fecha, hora, asistio, horas_asistidas, tipo_registro, comentarios, registrado_por
       ) VALUES (
         :asignacionId, NULL, :maestroId, NULL,
         :documento, :documento, :nombre, :sede, :idCurso, :idAsignatura,
         'Individual', :fecha, :hora, 1, :horas, :tipoRegistro, :comentarios, :registradoPor
       )
       ON DUPLICATE KEY UPDATE
         horas_asistidas = VALUES(horas_asistidas),
         asistio = 1,
         hora = VALUES(hora),
         comentarios = VALUES(comentarios),
         registrado_por = VALUES(registrado_por)`,
      {
        replacements: {
          asignacionId,
          maestroId: maestro.id,
          documento: alumno.documento,
          nombre: alumno.nombre || alumno.documento,
          sede: asignacion.sede,
          idCurso: asignacion.id_curso,
          idAsignatura: asignacion.id_asignatura,
          fecha,
          hora,
          horas,
          tipoRegistro,
          comentarios,
          registradoPor,
        },
        type: QueryTypes.INSERT,
      },
    );

    return sendSuccess(
      res,
      200,
      { asignacionId, documento: alumno.documento, horas, fecha, tipoRegistro },
      'Asistencia individual registrada',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al registrar asistencia individual', error.message);
  }
};

export const registrarAsistenciaGrupalLvlup = async (req, res) => {
  try {
    const asignacionId = Number(req.body.asignacionId);
    const horasSesion = Number(req.body.horasSesion);
    const tipoRegistro = String(req.body.tipoRegistro || 'REGULAR').toUpperCase();
    const fecha = req.body.fecha ? String(req.body.fecha).slice(0, 10) : fechaHoyColombiaYmd();
    const comentarios = req.body.comentarios ? String(req.body.comentarios).trim() : null;
    const marcas = Array.isArray(req.body.asistencia) ? req.body.asistencia : [];

    if (!Number.isInteger(asignacionId) || asignacionId < 1) {
      return sendError(res, 400, 'asignacionId inválido');
    }
    if (!Number.isFinite(horasSesion) || horasSesion <= 0) {
      return sendError(res, 400, 'Debes indicar horas de sesión mayores a 0');
    }
    if (!LVLUP_TIPOS_REGISTRO.includes(tipoRegistro)) {
      return sendError(res, 400, 'tipoRegistro inválido');
    }
    if (!marcas.length) {
      return sendError(res, 400, 'Debes enviar la lista de asistencia del grupo');
    }

    const ctx = await resolveAsignacionRequest(req, asignacionId);
    if (ctx.error) return sendError(res, ctx.error.status, ctx.error.message);
    const { asignacion, maestro } = ctx;

    if (asignacion.sesion !== 'Grupal') {
      return sendError(res, 400, 'Esta asignación es individual');
    }

    const participantes = await queryParticipantesAsignacion(asignacion);
    const participantesMap = new Map(
      participantes.map((p) => [String(p.documento).trim(), p]),
    );

    for (const marca of marcas) {
      const doc = String(marca.documento || marca.validadorParticipante || '').trim();
      if (!participantesMap.has(doc)) {
        return sendError(res, 400, `Participante no pertenece al grupo: ${doc}`);
      }
    }

    const hora = horaActualColombia();
    const registradoPor = String(req.user.email || '').trim();

    for (const marca of marcas) {
      const doc = String(marca.documento || marca.validadorParticipante || '').trim();
      const errorHoras = await validarRegistroHoras(
        sequelize,
        asignacion,
        doc,
        horasSesion,
        tipoRegistro,
        fecha,
      );
      if (errorHoras) {
        const alumno = participantesMap.get(doc);
        const nombre = alumno?.nombre || doc;
        return sendError(res, 400, `${nombre}: ${errorHoras}`);
      }
    }

    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `INSERT INTO sesion_lvlup (
           asignacion_id, maestro_id, grupo_id, fecha, hora, horas_sesion,
           tipo_registro, comentarios, registrado_por
         ) VALUES (
           :asignacionId, :maestroId, :grupoId, :fecha, :hora, :horasSesion,
           :tipoRegistro, :comentarios, :registradoPor
         )
         ON DUPLICATE KEY UPDATE
           horas_sesion = VALUES(horas_sesion),
           hora = VALUES(hora),
           comentarios = VALUES(comentarios),
           registrado_por = VALUES(registrado_por)`,
        {
          replacements: {
            asignacionId,
            maestroId: maestro.id,
            grupoId: asignacion.grupo_id,
            fecha,
            hora,
            horasSesion,
            tipoRegistro,
            comentarios,
            registradoPor,
          },
          type: QueryTypes.INSERT,
          transaction,
        },
      );

      const [sesionRow] = await sequelize.query(
        `SELECT id FROM sesion_lvlup
         WHERE asignacion_id = :asignacionId AND fecha = :fecha AND tipo_registro = :tipoRegistro
         LIMIT 1`,
        {
          replacements: { asignacionId, fecha, tipoRegistro },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      const sesionId = sesionRow?.id;
      if (!sesionId) throw new Error('No se pudo crear la sesión grupal');

      for (const marca of marcas) {
        const doc = String(marca.documento || marca.validadorParticipante || '').trim();
        const asistio = marca.asistio === true || marca.asistio === 1 || marca.asistio === '1';
        const alumno = participantesMap.get(doc);
        const horasAsistidas = horasSesion;
        const comentariosAlumno = marca.comentarios
          ? String(marca.comentarios).trim() || null
          : comentarios;

        await sequelize.query(
          `INSERT INTO asistencia_lvlup (
             asignacion_id, sesion_lvlup_id, maestro_id, grupo_id,
             validador_participante, documento, nombre, sede, id_curso, id_asignatura,
             sesion, fecha, hora, asistio, horas_asistidas, tipo_registro, comentarios, registrado_por
           ) VALUES (
             :asignacionId, :sesionId, :maestroId, :grupoId,
             :documento, :documento, :nombre, :sede, :idCurso, :idAsignatura,
             'Grupal', :fecha, :hora, :asistio, :horasAsistidas, :tipoRegistro, :comentarios, :registradoPor
           )
           ON DUPLICATE KEY UPDATE
             sesion_lvlup_id = VALUES(sesion_lvlup_id),
             asistio = VALUES(asistio),
             horas_asistidas = VALUES(horas_asistidas),
             hora = VALUES(hora),
             comentarios = VALUES(comentarios),
             registrado_por = VALUES(registrado_por)`,
          {
            replacements: {
              asignacionId,
              sesionId,
              maestroId: maestro.id,
              grupoId: asignacion.grupo_id,
              documento: doc,
              nombre: alumno.nombre || doc,
              sede: asignacion.sede,
              idCurso: asignacion.id_curso,
              idAsignatura: asignacion.id_asignatura,
              fecha,
              hora,
              asistio: asistio ? 1 : 0,
              horasAsistidas,
              tipoRegistro,
              comentarios: comentariosAlumno,
              registradoPor,
            },
            type: QueryTypes.INSERT,
            transaction,
          },
        );
      }
    });

    return sendSuccess(
      res,
      200,
      { asignacionId, horasSesion, fecha, tipoRegistro, total: marcas.length },
      'Sesión grupal registrada',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al registrar sesión grupal', error.message);
  }
};
