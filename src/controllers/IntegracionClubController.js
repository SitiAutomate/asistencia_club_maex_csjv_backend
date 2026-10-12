import { QueryTypes } from 'sequelize';
import { env } from '../config/env.js';
import { sequelize } from '../database/sequelize.js';
import { timingSafeEqualString } from '../utils/secureCompare.js';

const MAP_SEDE = {
  '1': 'RETIRO',
  '2': 'MEDELLÍN',
  RETIRO: 'RETIRO',
  MEDELLIN: 'MEDELLÍN',
  'MEDELLÍN': 'MEDELLÍN',
};

const MESES = {
  '01': 'ENERO',
  '02': 'FEBRERO',
  '03': 'MARZO',
  '04': 'ABRIL',
  '05': 'MAYO',
  '06': 'JUNIO',
  '07': 'JULIO',
  '08': 'AGOSTO',
  '09': 'SEPTIEMBRE',
  '10': 'OCTUBRE',
  '11': 'NOVIEMBRE',
  '12': 'DICIEMBRE',
};

const SELECT_EXTRACLASES = `
  TRIM(i.validador_participante) AS documento,
  TRIM(i.IDCurso) AS id,
  i.Tipo AS tipo,
  TRIM(t.Nombre_Tipo) AS nombreTipo,
  LPAD(TRIM(i.Mes), 2, '0') AS numMes,
  TRIM(i.Sede) AS sede,
  TRIM(i.Estado) AS estado,
  TRIM(c.Nombre_Corto_Curso) AS curso,
  TRIM(c.Nombre_del_curso) AS nombreCurso,
  c.Linea AS linea,
  TRIM(l.Nombre_Linea) AS nombreLinea,
  NULLIF(TRIM(c.Lunes), '') AS lunes,
  NULLIF(TRIM(c.Martes), '') AS martes,
  NULLIF(TRIM(c.\`Miércoles\`), '') AS miercoles,
  NULLIF(TRIM(c.Jueves), '') AS jueves,
  NULLIF(TRIM(c.Viernes), '') AS viernes,
  TRIM(p.Nombre_Completo) AS nombre,
  TRIM(c.Docente) AS entrenador,
  p.Fecha_Nacimiento AS nacimiento,
  TRIM(p.Grupo) AS grupo,
  TRIM(r.Celular_Responsable) AS celResp,
  TRIM(r.Nombre_Completo) AS responsable,
  TRIM(r.Correo_Responsable) AS emailResp,
  TRIM(pa.\`Nombre de la madre\`) AS madre,
  TRIM(pa.\`Celular madre\`) AS celMadre,
  TRIM(pa.\`E-mail madre\`) AS emailMadre,
  TRIM(pa.\`Nombre del padre\`) AS padre,
  TRIM(pa.\`Celular padre\`) AS celPadre,
  TRIM(pa.\`E-mail padre\`) AS emailPadre,
  i.\`FECHA INGRESO NUEVO TRANSPORTE\` AS fechaIngresoNuevoTransporte,
  i.\`FECHA RETIRO TRANSPORTE\` AS fechaRetiroTransporte,
  NULL AS poliza
`;

function mesActualBogota() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const anio = Number(parts.find((p) => p.type === 'year')?.value ?? new Date().getFullYear());
  const mes = parts.find((p) => p.type === 'month')?.value ?? '01';
  return { anio, mes };
}

function anioActualBogota() {
  return mesActualBogota().anio;
}

function tokenValido(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = String(match?.[1] || '').trim();
  const expected = String(env.integracionClub.bearerIns || '').trim();
  return Boolean(expected) && timingSafeEqualString(token, expected);
}

function resolverSede(req, res) {
  if (!tokenValido(req)) {
    res.status(401).json({
      success: false,
      message: 'No autorizado',
    });
    return null;
  }

  const sedeRaw = String(req.params.sedeNombre || '').trim().toUpperCase();
  const sede = MAP_SEDE[sedeRaw];
  if (!sede) {
    res.status(400).json({
      success: false,
      message: 'Sede inválida. Use RETIRO o MEDELLÍN',
    });
    return null;
  }
  return sede;
}

/**
 * Query `tipo` / `tipos`: "1", "1,5", ["1","5"].
 * Sin param o vacío → null (todos los tipos).
 * Si viene con valores inválidos → { error }.
 */
function parseTiposFiltro(query) {
  const raw = query?.tipo ?? query?.tipos ?? query?.type;
  if (raw == null) return { tipos: null };
  const chunks = Array.isArray(raw) ? raw : [raw];
  const parts = chunks
    .flatMap((v) => String(v).split(/[,;|]/))
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return { tipos: null };

  const tipos = [];
  const invalidos = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) {
      invalidos.push(p);
      continue;
    }
    if (!tipos.includes(n)) tipos.push(n);
  }
  if (invalidos.length) {
    return {
      error: `Tipo inválido: ${invalidos.join(', ')}. Use enteros positivos (ej. tipo=1 o tipo=1,5).`,
    };
  }
  return { tipos: tipos.length ? tipos : null };
}

function mapearFilas(rows) {
  return rows.map((item) => ({
    ...item,
    tipo: item.tipo != null ? Number(item.tipo) : null,
    mes: MESES[item.numMes] || item.numMes,
  }));
}

function errorRespuesta(res, mensaje, error) {
  const isDev = env.nodeEnv === 'development';
  return res.status(500).json({
    success: false,
    message: mensaje,
    ...(isDev ? { error: error.message } : {}),
  });
}

const JOINS = `
  FROM inscripciones_1 i
  LEFT JOIN cursos_2025 c ON TRIM(c.ID_Curso) = TRIM(i.IDCurso)
  LEFT JOIN linea l ON l.IDLinea = c.Linea
  LEFT JOIN tipos t ON t.IDTipo = i.Tipo
  LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(i.validador_participante)
  LEFT JOIN responsables r ON TRIM(r.IDResponsable) = TRIM(i.validador_responsable)
  LEFT JOIN padres pa ON TRIM(pa.\`Doc. Alumno\`) = TRIM(i.validador_participante)
`;

export const listarExtraclasesMesActual = async (req, res) => {
  try {
    const sede = resolverSede(req, res);
    if (!sede) return;

    const { tipos, error } = parseTiposFiltro(req.query);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const { anio, mes } = mesActualBogota();
    const tipoSql = tipos?.length ? 'AND i.Tipo IN (:tipos)' : '';
    const rows = await sequelize.query(
      `SELECT ${SELECT_EXTRACLASES}
       ${JOINS}
       WHERE i.año = :anio
         AND LPAD(TRIM(i.Mes), 2, '0') = :mes
         AND TRIM(i.Sede) = :sede
         AND TRIM(i.Estado) IN ('ACTIVO','CONFIRMADO', 'INCAPACITADO', 'RETIRADO')
         ${tipoSql}
       ORDER BY i.Tipo ASC, c.Nombre_del_curso ASC, p.Nombre_Completo ASC`,
      {
        replacements: { anio, mes, sede, ...(tipos?.length ? { tipos } : {}) },
        type: QueryTypes.SELECT,
      },
    );

    return res.status(200).json(mapearFilas(rows));
  } catch (error) {
    return errorRespuesta(res, 'No se pudo construir la respuesta de extraclases', error);
  }
};

/**
 * Transporte: año actual (sin filtro de mes), solo filas con fecha de ingreso
 * o retiro de transporte diligenciada.
 */
export const listarTransporteAnioActual = async (req, res) => {
  try {
    const sede = resolverSede(req, res);
    if (!sede) return;

    const { tipos, error } = parseTiposFiltro(req.query);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const anio = anioActualBogota();
    const tipoSql = tipos?.length ? 'AND i.Tipo IN (:tipos)' : '';
    const rows = await sequelize.query(
      `SELECT ${SELECT_EXTRACLASES}
       ${JOINS}
       WHERE i.año = :anio
         AND TRIM(i.Sede) = :sede
         AND TRIM(i.Estado) IN ('ACTIVO','CONFIRMADO', 'INCAPACITADO', 'RETIRADO')
         AND (
           NULLIF(TRIM(i.\`FECHA INGRESO NUEVO TRANSPORTE\`), '') IS NOT NULL
           OR NULLIF(TRIM(i.\`FECHA RETIRO TRANSPORTE\`), '') IS NOT NULL
         )
         ${tipoSql}
       ORDER BY i.Tipo ASC, c.Nombre_del_curso ASC, p.Nombre_Completo ASC`,
      {
        replacements: { anio, sede, ...(tipos?.length ? { tipos } : {}) },
        type: QueryTypes.SELECT,
      },
    );

    return res.status(200).json(mapearFilas(rows));
  } catch (error) {
    return errorRespuesta(res, 'No se pudo construir la respuesta de transporte', error);
  }
};
