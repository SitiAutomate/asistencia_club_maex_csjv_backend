import { QueryTypes } from 'sequelize';
import { horasContratadasPaquete } from './lvlupConstants.js';

export function horasContratadasAsignacion(asignacion) {
  const asignadas = Number(asignacion?.horas_asignadas);
  if (Number.isFinite(asignadas) && asignadas > 0) return asignadas;
  return horasContratadasPaquete(asignacion?.tipo_paquete);
}

/**
 * Tope de horas por tipo (diagnóstico / informe final).
 * Viene de la asignación en BD: horas_diagnostico / horas_informe_final.
 */
export function maxHorasTipoRegistro(asignacion, tipoRegistro) {
  const tipo = String(tipoRegistro || '').toUpperCase();
  if (tipo === 'DIAGNOSTICO') {
    const n = Number(asignacion?.horas_diagnostico);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  if (tipo === 'INFORME_FINAL') {
    const n = Number(asignacion?.horas_informe_final);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return null;
}

const EMPTY_CONSUMO = Object.freeze({
  total: 0,
  regular: 0,
  diagnostico: 0,
  informe: 0,
  horasDiaTipo: 0,
});

function parseConsumoRow(row) {
  return {
    total: Number(row?.total || 0),
    regular: Number(row?.regular || 0),
    diagnostico: Number(row?.diagnostico || 0),
    informe: Number(row?.informe || 0),
    horasDiaTipo: Number(row?.horasDiaTipo || 0),
  };
}

/** Consumo agregado de todos los participantes de una asignación (1–2 queries en lugar de N). */
export async function queryConsumoHorasBatch(
  sequelize,
  asignacionId,
  { fecha = null, tipoRegistro = null, transaction } = {},
) {
  const rows = await sequelize.query(
    `SELECT TRIM(validador_participante) AS documento,
            COALESCE(SUM(horas_asistidas), 0) AS total,
            COALESCE(SUM(CASE WHEN tipo_registro = 'REGULAR' THEN horas_asistidas ELSE 0 END), 0) AS regular,
            COALESCE(SUM(CASE WHEN tipo_registro = 'DIAGNOSTICO' THEN horas_asistidas ELSE 0 END), 0) AS diagnostico,
            COALESCE(SUM(CASE WHEN tipo_registro = 'INFORME_FINAL' THEN horas_asistidas ELSE 0 END), 0) AS informe
     FROM asistencia_lvlup
     WHERE asignacion_id = :asignacionId
     GROUP BY TRIM(validador_participante)`,
    {
      replacements: { asignacionId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  const map = new Map();
  for (const row of rows) {
    map.set(String(row.documento).trim(), parseConsumoRow(row));
  }

  if (fecha && tipoRegistro) {
    const diaRows = await sequelize.query(
      `SELECT TRIM(validador_participante) AS documento,
              COALESCE(SUM(horas_asistidas), 0) AS horas
       FROM asistencia_lvlup
       WHERE asignacion_id = :asignacionId
         AND fecha = :fecha
         AND tipo_registro = :tipoRegistro
       GROUP BY TRIM(validador_participante)`,
      {
        replacements: { asignacionId, fecha, tipoRegistro },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    for (const row of diaRows) {
      const key = String(row.documento).trim();
      const base = map.get(key) || { ...EMPTY_CONSUMO };
      base.horasDiaTipo = Number(row.horas || 0);
      map.set(key, base);
    }
  }

  return map;
}

export async function queryConsumoHorasParticipante(
  sequelize,
  asignacionId,
  documento,
  { fecha = null, tipoRegistro = null, transaction } = {},
) {
  const [row] = await sequelize.query(
    `SELECT
       COALESCE(SUM(horas_asistidas), 0) AS total,
       COALESCE(SUM(CASE WHEN tipo_registro = 'REGULAR' THEN horas_asistidas ELSE 0 END), 0) AS regular,
       COALESCE(SUM(CASE WHEN tipo_registro = 'DIAGNOSTICO' THEN horas_asistidas ELSE 0 END), 0) AS diagnostico,
       COALESCE(SUM(CASE WHEN tipo_registro = 'INFORME_FINAL' THEN horas_asistidas ELSE 0 END), 0) AS informe
     FROM asistencia_lvlup
     WHERE asignacion_id = :asignacionId
       AND TRIM(validador_participante) = TRIM(:documento)`,
    {
      replacements: { asignacionId, documento },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  let horasDiaTipo = 0;
  if (fecha && tipoRegistro) {
    const [dia] = await sequelize.query(
      `SELECT COALESCE(SUM(horas_asistidas), 0) AS horas
       FROM asistencia_lvlup
       WHERE asignacion_id = :asignacionId
         AND TRIM(validador_participante) = TRIM(:documento)
         AND fecha = :fecha
         AND tipo_registro = :tipoRegistro`,
      {
        replacements: { asignacionId, documento, fecha, tipoRegistro },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    horasDiaTipo = Number(dia?.horas || 0);
  }

  return {
    total: Number(row?.total || 0),
    regular: Number(row?.regular || 0),
    diagnostico: Number(row?.diagnostico || 0),
    informe: Number(row?.informe || 0),
    horasDiaTipo,
  };
}

export function buildResumenSaldo(asignacion, consumo) {
  const horasContratadas = horasContratadasAsignacion(asignacion);
  const maxDiagnostico = maxHorasTipoRegistro(asignacion, 'DIAGNOSTICO');
  const maxInforme = maxHorasTipoRegistro(asignacion, 'INFORME_FINAL');

  return {
    horas_usadas: consumo.total,
    horas_contratadas: horasContratadas,
    saldo_regular:
      horasContratadas != null ? Math.max(0, horasContratadas - consumo.regular) : null,
    horas_diagnostico_usadas: consumo.diagnostico,
    horas_diagnostico_max: maxDiagnostico,
    saldo_diagnostico: Math.max(0, maxDiagnostico - consumo.diagnostico),
    horas_informe_usadas: consumo.informe,
    horas_informe_max: maxInforme,
    saldo_informe: Math.max(0, maxInforme - consumo.informe),
    paquete_3m: asignacion.tipo_paquete === '3M',
    fecha_fin_paquete: asignacion.fecha_fin_paquete || null,
  };
}

export function validarRegistroHorasConConsumo(
  asignacion,
  documento,
  horas,
  tipoRegistro,
  fecha,
  consumo,
) {
  const horasNum = Number(horas);
  if (!Number.isFinite(horasNum) || horasNum <= 0) {
    return 'Debes indicar horas mayores a 0';
  }

  if (asignacion.tipo_paquete === '3M' && asignacion.fecha_fin_paquete) {
    const fin = String(asignacion.fecha_fin_paquete).slice(0, 10);
    if (fecha > fin) {
      return `El paquete 3M venció el ${fin}`;
    }
  }

  const prevDia = consumo.horasDiaTipo;
  const tipo = String(tipoRegistro || 'REGULAR').toUpperCase();

  if (tipo === 'REGULAR') {
    const contratadas = horasContratadasAsignacion(asignacion);
    if (contratadas != null) {
      const usadasRegular = consumo.regular - prevDia + horasNum;
      if (usadasRegular > contratadas) {
        return `Saldo insuficiente: quedan ${Math.max(0, contratadas - (consumo.regular - prevDia))}h regulares`;
      }
    }
    return null;
  }

  const maxTipo = maxHorasTipoRegistro(asignacion, tipo);
  const usadasTipo =
    (tipo === 'DIAGNOSTICO' ? consumo.diagnostico : consumo.informe) - prevDia + horasNum;
  if (usadasTipo > maxTipo) {
    const label = tipo === 'DIAGNOSTICO' ? 'diagnóstico' : 'informe final';
    const prev = tipo === 'DIAGNOSTICO' ? consumo.diagnostico : consumo.informe;
    return `Tope de ${label} (${maxTipo}h): quedan ${Math.max(0, maxTipo - (prev - prevDia))}h`;
  }

  return null;
}

export async function validarRegistroHoras(
  sequelize,
  asignacion,
  documento,
  horas,
  tipoRegistro,
  fecha,
  transaction,
) {
  const consumo = await queryConsumoHorasParticipante(sequelize, asignacion.id, documento, {
    fecha,
    tipoRegistro,
    transaction,
  });
  return validarRegistroHorasConConsumo(
    asignacion,
    documento,
    horas,
    tipoRegistro,
    fecha,
    consumo,
  );
}

/** Valida varios participantes con un solo batch de consumo (sesión grupal). */
export async function validarRegistrosHoras(
  sequelize,
  asignacion,
  marcas,
  horasSesion,
  tipoRegistro,
  fecha,
  { participantesMap, transaction } = {},
) {
  const consumoMap = await queryConsumoHorasBatch(sequelize, asignacion.id, {
    fecha,
    tipoRegistro,
    transaction,
  });

  for (const marca of marcas) {
    const doc = String(marca.documento || marca.validadorParticipante || '').trim();
    const consumo = consumoMap.get(doc) || { ...EMPTY_CONSUMO };
    const errorHoras = validarRegistroHorasConConsumo(
      asignacion,
      doc,
      horasSesion,
      tipoRegistro,
      fecha,
      consumo,
    );
    if (errorHoras) {
      const alumno = participantesMap?.get(doc);
      const nombre = alumno?.nombre || doc;
      return { documento: doc, nombre, error: errorHoras };
    }
  }

  return null;
}
