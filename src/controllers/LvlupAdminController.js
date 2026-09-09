import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import { isLvlupAdmin } from '../utils/lvlupMaestro.js';
import { anioMesBogota } from '../utils/inscripcionesPeriodo.js';

const emptyToNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

function requireAdmin(req, res) {
  if (!isLvlupAdmin(req)) {
    sendError(res, 403, 'Solo administradores pueden gestionar LVL UP');
    return false;
  }
  return true;
}

export const listarMaestrosAdminLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const soloActivos = String(req.query.soloActivos || '').toLowerCase() === 'true';
    const rows = await sequelize.query(
      `SELECT id, documento, nombre, correo, celular, sede, areas_academicas AS areasAcademicas,
              escuelas, disponibilidad, nivel_1 AS nivel1, dx_nivel_2 AS dxNivel2, activo
       FROM maestros_academicos
       WHERE (:soloActivos = 0 OR activo = 1)
       ORDER BY activo DESC, nombre ASC`,
      {
        replacements: { soloActivos: soloActivos ? 1 : 0 },
        type: QueryTypes.SELECT,
      },
    );
    return sendSuccess(res, 200, { maestros: rows }, 'Maestros obtenidos');
  } catch (error) {
    return sendError(res, 500, 'Error al listar maestros', error.message);
  }
};

export const crearMaestroLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const documento = emptyToNull(body.documento);
    const nombre = emptyToNull(body.nombre);
    const correo = emptyToNull(body.correo);
    if (!documento || !nombre || !correo) {
      return sendError(res, 400, 'Documento, nombre y correo son obligatorios');
    }
    const [result] = await sequelize.query(
      `INSERT INTO maestros_academicos
        (documento, nombre, correo, celular, sede, areas_academicas, escuelas, disponibilidad,
         nivel_1, dx_nivel_2, activo)
       VALUES
        (:documento, :nombre, :correo, :celular, :sede, :areas, :escuelas, :disponibilidad,
         :nivel1, :dxNivel2, 1)`,
      {
        replacements: {
          documento,
          nombre,
          correo,
          celular: emptyToNull(body.celular),
          sede: emptyToNull(body.sede),
          areas: emptyToNull(body.areasAcademicas),
          escuelas: emptyToNull(body.escuelas),
          disponibilidad: emptyToNull(body.disponibilidad),
          nivel1: body.nivel1 === false || body.nivel1 === 0 || body.nivel1 === '0' ? 0 : 1,
          dxNivel2: String(body.dxNivel2 || 'No') === 'Si' ? 'Si' : 'No',
        },
        type: QueryTypes.INSERT,
      },
    );
    const id = result;
    return sendSuccess(res, 201, { id }, 'Maestro creado');
  } catch (error) {
    return sendError(res, 500, 'Error al crear maestro', error.message);
  }
};

export const actualizarMaestroLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return sendError(res, 400, 'id inválido');
    const body = req.body || {};
    const sets = [];
    const repl = { id };
    const map = {
      documento: 'documento',
      nombre: 'nombre',
      correo: 'correo',
      celular: 'celular',
      sede: 'sede',
      areasAcademicas: 'areas_academicas',
      escuelas: 'escuelas',
      disponibilidad: 'disponibilidad',
    };
    for (const [key, col] of Object.entries(map)) {
      if (body[key] !== undefined) {
        sets.push(`${col} = :${key}`);
        repl[key] = emptyToNull(body[key]);
      }
    }
    if (body.nivel1 !== undefined) {
      sets.push('nivel_1 = :nivel1');
      repl.nivel1 = body.nivel1 === false || body.nivel1 === 0 || body.nivel1 === '0' ? 0 : 1;
    }
    if (body.dxNivel2 !== undefined) {
      sets.push('dx_nivel_2 = :dxNivel2');
      repl.dxNivel2 = String(body.dxNivel2) === 'Si' ? 'Si' : 'No';
    }
    if (body.activo !== undefined) {
      sets.push('activo = :activo');
      repl.activo = body.activo ? 1 : 0;
    }
    if (!sets.length) return sendError(res, 400, 'Sin campos para actualizar');
    await sequelize.query(`UPDATE maestros_academicos SET ${sets.join(', ')} WHERE id = :id`, {
      replacements: repl,
      type: QueryTypes.UPDATE,
    });
    return sendSuccess(res, 200, { id }, 'Maestro actualizado');
  } catch (error) {
    return sendError(res, 500, 'Error al actualizar maestro', error.message);
  }
};

export const listarGruposAdminLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const anio = Number(req.query.anio);
    const mes = Number(req.query.mes);
    const clauses = ['1=1'];
    const repl = {};
    if (Number.isFinite(anio) && anio > 2000) {
      clauses.push('g.anio = :anio');
      repl.anio = anio;
    }
    if (Number.isFinite(mes) && mes >= 1 && mes <= 12) {
      clauses.push('g.mes = :mes');
      repl.mes = mes;
    }
    const rows = await sequelize.query(
      `SELECT g.id, g.codigo, g.nombre, g.sede, g.id_curso AS idCurso, g.id_asignatura AS idAsignatura,
              a.Asignatura AS nombreAsignatura, g.anio, g.mes, g.estado,
              (SELECT COUNT(*) FROM inscripciones_1 i
                WHERE i.Tipo = 4 AND i.grupo_lvlup_id = g.id) AS inscritos
       FROM grupos_lvlup g
       LEFT JOIN asignaturas a ON a.IDAsignatura = g.id_asignatura
       WHERE ${clauses.join(' AND ')}
       ORDER BY g.anio DESC, g.mes DESC, g.nombre ASC`,
      { replacements: repl, type: QueryTypes.SELECT },
    );
    return sendSuccess(res, 200, { grupos: rows }, 'Grupos obtenidos');
  } catch (error) {
    return sendError(res, 500, 'Error al listar grupos', error.message);
  }
};

export const crearGrupoLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const sede = emptyToNull(body.sede);
    const idCurso = emptyToNull(body.idCurso);
    const idAsignatura = Number(body.idAsignatura);
    const { anio: anioBogota, mes: mesBogota } = anioMesBogota();
    const anio = Number(body.anio) || anioBogota;
    const mes = Number(body.mes) || Number(mesBogota);
    if (!sede || !idCurso || !Number.isInteger(idAsignatura) || idAsignatura < 1) {
      return sendError(res, 400, 'Sede, curso y asignatura son obligatorios');
    }
    const [result] = await sequelize.query(
      `INSERT INTO grupos_lvlup
        (codigo, nombre, sede, id_curso, id_asignatura, anio, mes, estado)
       VALUES
        (:codigo, :nombre, :sede, :idCurso, :idAsignatura, :anio, :mes, 'ACTIVO')`,
      {
        replacements: {
          codigo: emptyToNull(body.codigo),
          nombre: emptyToNull(body.nombre) || `${sede} ${idCurso} ${anio}-${String(mes).padStart(2, '0')}`,
          sede,
          idCurso,
          idAsignatura,
          anio,
          mes,
        },
        type: QueryTypes.INSERT,
      },
    );
    return sendSuccess(res, 201, { id: result }, 'Grupo creado');
  } catch (error) {
    return sendError(res, 500, 'Error al crear grupo', error.message);
  }
};

export const actualizarGrupoLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return sendError(res, 400, 'id inválido');
    const body = req.body || {};
    const sets = [];
    const repl = { id };
    if (body.codigo !== undefined) {
      sets.push('codigo = :codigo');
      repl.codigo = emptyToNull(body.codigo);
    }
    if (body.nombre !== undefined) {
      sets.push('nombre = :nombre');
      repl.nombre = emptyToNull(body.nombre);
    }
    if (body.sede !== undefined) {
      sets.push('sede = :sede');
      repl.sede = emptyToNull(body.sede);
    }
    if (body.idCurso !== undefined) {
      sets.push('id_curso = :idCurso');
      repl.idCurso = emptyToNull(body.idCurso);
    }
    if (body.idAsignatura !== undefined) {
      sets.push('id_asignatura = :idAsignatura');
      repl.idAsignatura = Number(body.idAsignatura);
    }
    if (body.anio !== undefined) {
      sets.push('anio = :anio');
      repl.anio = Number(body.anio);
    }
    if (body.mes !== undefined) {
      sets.push('mes = :mes');
      repl.mes = Number(body.mes);
    }
    if (body.estado !== undefined) {
      sets.push('estado = :estado');
      repl.estado = String(body.estado) === 'CERRADO' ? 'CERRADO' : 'ACTIVO';
    }
    if (!sets.length) return sendError(res, 400, 'Sin campos para actualizar');
    await sequelize.query(`UPDATE grupos_lvlup SET ${sets.join(', ')} WHERE id = :id`, {
      replacements: repl,
      type: QueryTypes.UPDATE,
    });
    return sendSuccess(res, 200, { id }, 'Grupo actualizado');
  } catch (error) {
    return sendError(res, 500, 'Error al actualizar grupo', error.message);
  }
};

export const eliminarGrupoLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return sendError(res, 400, 'id inválido');

    const [asig] = await sequelize.query(
      `SELECT COUNT(*) AS n FROM asignacion_lvlup WHERE grupo_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (Number(asig?.n) > 0) {
      return sendError(
        res,
        409,
        'No se puede eliminar: hay asignaciones ligadas. Finalice o reasigne primero.',
      );
    }

    const [insc] = await sequelize.query(
      `SELECT COUNT(*) AS n FROM inscripciones_1 WHERE Tipo = 4 AND grupo_lvlup_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (Number(insc?.n) > 0) {
      return sendError(
        res,
        409,
        'No se puede eliminar: hay inscripciones ligadas al grupo. Desvincúlelas primero.',
      );
    }

    await sequelize.query(`DELETE FROM grupos_lvlup WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.DELETE,
    });
    return sendSuccess(res, 200, { id }, 'Grupo eliminado');
  } catch (error) {
    return sendError(res, 500, 'Error al eliminar grupo', error.message);
  }
};

/** Participantes LVL UP (Tipo=4) del año indicado — para asignaciones Individual. */
export const buscarParticipantesAdminLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { anio: anioBogota } = anioMesBogota();
    const anio = Number(req.query.anio) || anioBogota;
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;

    const rows = await sequelize.query(
      `SELECT
          MAX(CONVERT(TRIM(i.validador_participante) USING utf8mb4)) AS documento,
          COALESCE(
            NULLIF(TRIM(MAX(p.Nombre_Completo)), ''),
            MAX(CONVERT(TRIM(i.validador_participante) USING utf8mb4))
          ) AS nombre,
          SUBSTRING_INDEX(
            GROUP_CONCAT(
              CONCAT_WS(
                '||',
                CONVERT(TRIM(IFNULL(i.Sede, '')) USING utf8mb4),
                CONVERT(TRIM(IFNULL(i.IDCurso, '')) USING utf8mb4),
                CONVERT(
                  IF(
                    i.asignatura REGEXP '^[0-9]+$',
                    CAST(i.asignatura AS UNSIGNED),
                    ''
                  ) USING utf8mb4
                ),
                CONVERT(TRIM(IFNULL(i.\`Sesión\`, '')) USING utf8mb4)
              )
              ORDER BY CAST(i.\`año\` AS UNSIGNED) DESC, CAST(i.Mes AS UNSIGNED) DESC
              SEPARATOR '##'
            ),
            '##',
            1
          ) AS prefijo
       FROM inscripciones_1 i
       LEFT JOIN participantes p
         ON CONVERT(TRIM(p.IDParticipante) USING utf8mb4)
          = CONVERT(TRIM(i.validador_participante) USING utf8mb4)
       WHERE i.Tipo = 4
         AND CAST(i.\`año\` AS UNSIGNED) = :anio
         AND NULLIF(TRIM(i.validador_participante), '') IS NOT NULL
         AND TRIM(i.Estado) IN ('CONFIRMADO', 'ACTIVO', 'INCAPACITADO')
         AND (
           :q = ''
           OR CONVERT(i.validador_participante USING utf8mb4) LIKE :like
           OR CONVERT(IFNULL(p.Nombre_Completo, '') USING utf8mb4) LIKE :like
         )
       GROUP BY CONVERT(TRIM(i.validador_participante) USING utf8mb4)
       ORDER BY nombre ASC
       LIMIT 50`,
      { replacements: { anio, q, like }, type: QueryTypes.SELECT },
    );

    const participantes = rows.map((r) => {
      const parts = String(r.prefijo || '').split('||');
      let sede = parts[0] || null;
      const idCurso = parts[1] || null;
      const idAsignaturaRaw = parts[2] || '';
      const sesionInscrita = parts[3] || null;
      const idAsignatura = idAsignaturaRaw !== '' ? Number(idAsignaturaRaw) : null;
      const cursoSede = {
        '2351': 'MEDELLÍN',
        '2352': 'RETIRO',
        '2353': 'MEDELLÍN',
        '2354': 'RETIRO',
      };
      if (!sede && idCurso && cursoSede[idCurso]) sede = cursoSede[idCurso];
      else if (sede) {
        const folded = String(sede)
          .trim()
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (folded.includes('RETIRO')) sede = 'RETIRO';
        else if (folded.includes('MEDELL')) sede = 'MEDELLÍN';
      }
      return {
        documento: String(r.documento),
        nombre: String(r.nombre || r.documento),
        sede: sede || null,
        idCurso: idCurso || null,
        idAsignatura: Number.isFinite(idAsignatura) && idAsignatura > 0 ? idAsignatura : null,
        sesionInscrita: sesionInscrita || null,
      };
    });

    return sendSuccess(res, 200, { participantes }, 'Participantes LVL UP');
  } catch (error) {
    return sendError(res, 500, 'Error al buscar participantes', error.message);
  }
};

function defaultHorasPaquete(sesion, tipoPaquete) {
  const individual = sesion === 'Individual';
  const horasDiagnostico = individual ? 1 : 2;
  const horasInformeFinal = individual ? 1 : 2;
  let horasAsignadas = null;
  if (tipoPaquete === '8H') horasAsignadas = 8;
  else if (tipoPaquete === '16H') horasAsignadas = 16;
  return { horasAsignadas, horasDiagnostico, horasInformeFinal };
}

export const listarAsignacionesAdminLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const estado = String(req.query.estado || '').trim().toUpperCase();
    const maestroId = Number(req.query.maestroId);
    const clauses = ['1=1'];
    const repl = {};
    if (estado && ['ACTIVO', 'PAUSADO', 'FINALIZADO'].includes(estado)) {
      clauses.push('al.estado = :estado');
      repl.estado = estado;
    }
    if (Number.isInteger(maestroId) && maestroId > 0) {
      clauses.push('al.maestro_id = :maestroId');
      repl.maestroId = maestroId;
    }
    const rows = await sequelize.query(
      `SELECT al.id, al.maestro_id AS maestroId, m.nombre AS maestroNombre,
              al.sede, al.id_curso AS idCurso, al.id_asignatura AS idAsignatura,
              asig.Asignatura AS nombreAsignatura, al.sesion, al.grupo_id AS grupoId,
              gl.nombre AS grupoNombre, al.validador_participante AS participante,
              al.anio, al.mes, al.tipo_paquete AS tipoPaquete, al.horas_asignadas AS horasAsignadas,
              al.horas_diagnostico AS horasDiagnostico, al.horas_informe_final AS horasInformeFinal,
              al.fecha_inicio_paquete AS fechaInicio, al.fecha_fin_paquete AS fechaFin,
              al.estado, al.observaciones
       FROM asignacion_lvlup al
       LEFT JOIN maestros_academicos m ON m.id = al.maestro_id
       LEFT JOIN asignaturas asig ON asig.IDAsignatura = al.id_asignatura
       LEFT JOIN grupos_lvlup gl ON gl.id = al.grupo_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY al.id DESC
       LIMIT 500`,
      { replacements: repl, type: QueryTypes.SELECT },
    );
    return sendSuccess(res, 200, { asignaciones: rows }, 'Asignaciones obtenidas');
  } catch (error) {
    return sendError(res, 500, 'Error al listar asignaciones', error.message);
  }
};

export const crearAsignacionLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const maestroId = Number(body.maestroId);
    const sede = emptyToNull(body.sede);
    const idCurso = emptyToNull(body.idCurso);
    const idAsignatura = Number(body.idAsignatura);
    const sesion = String(body.sesion || '').trim();
    const tipoPaquete = String(body.tipoPaquete || '8H').trim().toUpperCase();
    const { anio: anioBogota, mes: mesBogota } = anioMesBogota();
    const anio = Number(body.anio) || anioBogota;
    const mes = Number(body.mes) || Number(mesBogota);

    if (!Number.isInteger(maestroId) || maestroId < 1) return sendError(res, 400, 'maestroId inválido');
    if (!sede || !idCurso || !Number.isInteger(idAsignatura)) {
      return sendError(res, 400, 'Sede, curso y asignatura son obligatorios');
    }
    if (!['Grupal', 'Individual'].includes(sesion)) {
      return sendError(res, 400, 'Sesión debe ser Grupal o Individual');
    }
    if (!['8H', '16H', '3M'].includes(tipoPaquete)) {
      return sendError(res, 400, 'tipoPaquete inválido');
    }

    let grupoId = body.grupoId != null && body.grupoId !== '' ? Number(body.grupoId) : null;
    let participante = emptyToNull(body.participante);
    if (sesion === 'Grupal') {
      if (!Number.isInteger(grupoId) || grupoId < 1) return sendError(res, 400, 'grupoId obligatorio en sesión Grupal');
      participante = null;
    } else {
      if (!participante) return sendError(res, 400, 'participante obligatorio en sesión Individual');
      grupoId = null;
    }

    const defaults = defaultHorasPaquete(sesion, tipoPaquete);
    const horasAsignadas =
      body.horasAsignadas != null && body.horasAsignadas !== ''
        ? Number(body.horasAsignadas)
        : defaults.horasAsignadas;
    const horasDiagnostico =
      body.horasDiagnostico != null && body.horasDiagnostico !== ''
        ? Number(body.horasDiagnostico)
        : defaults.horasDiagnostico;
    const horasInformeFinal =
      body.horasInformeFinal != null && body.horasInformeFinal !== ''
        ? Number(body.horasInformeFinal)
        : defaults.horasInformeFinal;

    const [result] = await sequelize.query(
      `INSERT INTO asignacion_lvlup
        (maestro_id, sede, id_curso, id_asignatura, sesion, grupo_id, validador_participante,
         anio, mes, tipo_paquete, horas_asignadas, horas_diagnostico, horas_informe_final,
         fecha_inicio_paquete, fecha_fin_paquete, estado, observaciones)
       VALUES
        (:maestroId, :sede, :idCurso, :idAsignatura, :sesion, :grupoId, :participante,
         :anio, :mes, :tipoPaquete, :horasAsignadas, :horasDiagnostico, :horasInformeFinal,
         :fechaInicio, :fechaFin, 'ACTIVO', :observaciones)`,
      {
        replacements: {
          maestroId,
          sede,
          idCurso,
          idAsignatura,
          sesion,
          grupoId,
          participante,
          anio,
          mes,
          tipoPaquete,
          horasAsignadas,
          horasDiagnostico,
          horasInformeFinal,
          fechaInicio: emptyToNull(body.fechaInicio),
          fechaFin: emptyToNull(body.fechaFin),
          observaciones: emptyToNull(body.observaciones),
        },
        type: QueryTypes.INSERT,
      },
    );
    return sendSuccess(res, 201, { id: result }, 'Asignación creada');
  } catch (error) {
    return sendError(res, 500, 'Error al crear asignación', error.message);
  }
};

export const actualizarAsignacionLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return sendError(res, 400, 'id inválido');
    const body = req.body || {};
    const sets = [];
    const repl = { id };

    if (body.maestroId !== undefined) {
      const maestroId = Number(body.maestroId);
      if (!Number.isInteger(maestroId) || maestroId < 1) return sendError(res, 400, 'maestroId inválido');
      sets.push('maestro_id = :maestroId');
      repl.maestroId = maestroId;
    }
    if (body.sede !== undefined) {
      sets.push('sede = :sede');
      repl.sede = emptyToNull(body.sede);
    }
    if (body.idCurso !== undefined) {
      sets.push('id_curso = :idCurso');
      repl.idCurso = emptyToNull(body.idCurso);
    }
    if (body.idAsignatura !== undefined) {
      sets.push('id_asignatura = :idAsignatura');
      repl.idAsignatura = Number(body.idAsignatura);
    }
    if (body.sesion !== undefined) {
      const sesion = String(body.sesion || '').trim();
      if (!['Grupal', 'Individual'].includes(sesion)) {
        return sendError(res, 400, 'Sesión debe ser Grupal o Individual');
      }
      sets.push('sesion = :sesion');
      repl.sesion = sesion;
      if (sesion === 'Grupal') {
        const grupoId = Number(body.grupoId);
        if (!Number.isInteger(grupoId) || grupoId < 1) {
          return sendError(res, 400, 'grupoId obligatorio en sesión Grupal');
        }
        sets.push('grupo_id = :grupoId');
        sets.push('validador_participante = NULL');
        repl.grupoId = grupoId;
      } else {
        const participante = emptyToNull(body.participante);
        if (!participante) return sendError(res, 400, 'participante obligatorio en sesión Individual');
        sets.push('grupo_id = NULL');
        sets.push('validador_participante = :participante');
        repl.participante = participante;
      }
    } else {
      if (body.grupoId !== undefined) {
        sets.push('grupo_id = :grupoId');
        repl.grupoId =
          body.grupoId === '' || body.grupoId == null ? null : Number(body.grupoId);
      }
      if (body.participante !== undefined) {
        sets.push('validador_participante = :participante');
        repl.participante = emptyToNull(body.participante);
      }
    }
    if (body.anio !== undefined) {
      sets.push('anio = :anio');
      repl.anio = Number(body.anio);
    }
    if (body.mes !== undefined) {
      sets.push('mes = :mes');
      repl.mes = Number(body.mes);
    }
    if (body.estado !== undefined) {
      const est = String(body.estado).toUpperCase();
      if (!['ACTIVO', 'PAUSADO', 'FINALIZADO'].includes(est)) {
        return sendError(res, 400, 'estado inválido');
      }
      sets.push('estado = :estado');
      repl.estado = est;
    }
    if (body.observaciones !== undefined) {
      sets.push('observaciones = :observaciones');
      repl.observaciones = emptyToNull(body.observaciones);
    }
    if (body.tipoPaquete !== undefined) {
      const tipoPaquete = String(body.tipoPaquete).toUpperCase();
      if (!['8H', '16H', '3M'].includes(tipoPaquete)) {
        return sendError(res, 400, 'tipoPaquete inválido');
      }
      sets.push('tipo_paquete = :tipoPaquete');
      repl.tipoPaquete = tipoPaquete;
    }
    if (body.horasAsignadas !== undefined) {
      sets.push('horas_asignadas = :horasAsignadas');
      repl.horasAsignadas =
        body.horasAsignadas === '' || body.horasAsignadas == null ? null : Number(body.horasAsignadas);
    }
    if (body.horasDiagnostico !== undefined) {
      sets.push('horas_diagnostico = :horasDiagnostico');
      repl.horasDiagnostico = Number(body.horasDiagnostico) || 0;
    }
    if (body.horasInformeFinal !== undefined) {
      sets.push('horas_informe_final = :horasInformeFinal');
      repl.horasInformeFinal = Number(body.horasInformeFinal) || 0;
    }
    if (!sets.length) return sendError(res, 400, 'Sin campos para actualizar');
    await sequelize.query(`UPDATE asignacion_lvlup SET ${sets.join(', ')} WHERE id = :id`, {
      replacements: repl,
      type: QueryTypes.UPDATE,
    });
    return sendSuccess(res, 200, { id }, 'Asignación actualizada');
  } catch (error) {
    return sendError(res, 500, 'Error al actualizar asignación', error.message);
  }
};

export const eliminarAsignacionLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return sendError(res, 400, 'id inválido');

    const [asist] = await sequelize.query(
      `SELECT COUNT(*) AS n FROM asistencia_lvlup WHERE asignacion_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (Number(asist?.n) > 0) {
      return sendError(
        res,
        409,
        'No se puede eliminar: hay asistencias registradas. Finalice la asignación en su lugar.',
      );
    }

    const [ses] = await sequelize.query(
      `SELECT COUNT(*) AS n FROM sesion_lvlup WHERE asignacion_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (Number(ses?.n) > 0) {
      await sequelize.query(`DELETE FROM sesion_lvlup WHERE asignacion_id = :id`, {
        replacements: { id },
        type: QueryTypes.DELETE,
      });
    }

    await sequelize.query(`DELETE FROM asignacion_lvlup WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.DELETE,
    });
    return sendSuccess(res, 200, { id }, 'Asignación eliminada');
  } catch (error) {
    return sendError(res, 500, 'Error al eliminar asignación', error.message);
  }
};

export const eliminarMaestroLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return sendError(res, 400, 'id inválido');

    const [asig] = await sequelize.query(
      `SELECT COUNT(*) AS n FROM asignacion_lvlup WHERE maestro_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (Number(asig?.n) > 0) {
      return sendError(
        res,
        409,
        'No se puede eliminar: tiene asignaciones. Desactívelo o reasigne primero.',
      );
    }

    await sequelize.query(`DELETE FROM maestros_academicos WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.DELETE,
    });
    return sendSuccess(res, 200, { id }, 'Maestro eliminado');
  } catch (error) {
    return sendError(res, 500, 'Error al eliminar maestro', error.message);
  }
};

export const catalogosAdminLvlup = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const asignaturas = await sequelize.query(
      `SELECT IDAsignatura AS id, Asignatura AS nombre
       FROM asignaturas
       ORDER BY Asignatura ASC`,
      { type: QueryTypes.SELECT },
    );
    const cursosDb = await sequelize.query(
      `SELECT TRIM(ID_Curso) AS id, Nombre_del_curso AS nombre, TRIM(Sede) AS sede, Tipo AS tipo
       FROM cursos_2025
       WHERE TRIM(ID_Curso) IN ('2351','2352','2353','2354')
          OR Tipo = 4
       ORDER BY ID_Curso ASC`,
      { type: QueryTypes.SELECT },
    );

    /** Catálogo canónico: 4 cursos LVL UP (nivel 1/2 × sede). Completa si faltan en cursos_2025. */
    const CANONICOS = [
      { id: '2351', nombre: 'LEVEL UP LEARNING 1 · MEDELLÍN', sede: 'MEDELLÍN', nivel: 1 },
      { id: '2352', nombre: 'LEVEL UP LEARNING 1 · RETIRO', sede: 'RETIRO', nivel: 1 },
      { id: '2353', nombre: 'LEVEL UP LEARNING 2 · MEDELLÍN', sede: 'MEDELLÍN', nivel: 2 },
      { id: '2354', nombre: 'LEVEL UP LEARNING 2 · RETIRO', sede: 'RETIRO', nivel: 2 },
    ];
    const byId = new Map(cursosDb.map((c) => [String(c.id).trim(), c]));
    const cursos = CANONICOS.map((c) => {
      const found = byId.get(c.id);
      return {
        id: c.id,
        nombre: found?.nombre || c.nombre,
        sede: found?.sede || c.sede,
        tipo: 4,
        nivel: c.nivel,
      };
    });

    return sendSuccess(res, 200, { asignaturas, cursos }, 'Catálogos LVL UP');
  } catch (error) {
    return sendError(res, 500, 'Error al cargar catálogos', error.message);
  }
};
