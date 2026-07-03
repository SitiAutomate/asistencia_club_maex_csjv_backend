import { QueryTypes } from 'sequelize';
import { horasContratadasPaquete } from './lvlupConstants.js';

export function horasContratadasAsignacion(asignacion) {
  const asignadas = Number(asignacion?.horas_asignadas);
  if (Number.isFinite(asignadas) && asignadas > 0) return asignadas;
  return horasContratadasPaquete(asignacion?.tipo_paquete);
}

/** Tope de horas por tipo de registro (diagnóstico / informe final). */
export function maxHorasTipoRegistro(asignacion, tipoRegistro) {
  const sesion = String(asignacion?.sesion || '').trim();
  const tipo = String(tipoRegistro || '').toUpperCase();
  if (tipo === 'DIAGNOSTICO') {
    return sesion === 'Grupal' ? 2 : 1;
  }
  if (tipo === 'INFORME_FINAL') {
    return sesion === 'Grupal' ? 2 : 1;
  }
  return null;
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

export async function validarRegistroHoras(
  sequelize,
  asignacion,
  documento,
  horas,
  tipoRegistro,
  fecha,
  transaction,
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

  const consumo = await queryConsumoHorasParticipante(sequelize, asignacion.id, documento, {
    fecha,
    tipoRegistro,
    transaction,
  });

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
