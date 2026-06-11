import { env } from '../config/env.js';

export const ESTADOS_INFORME_INSCRIPCION = ['CONFIRMADO', 'ACTIVO', 'INCAPACITADO'];

export const ESTADOS_INFORME_INSCRIPCION_SQL = "('CONFIRMADO', 'ACTIVO', 'INCAPACITADO')";

const NOMBRES_MES = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function nombreMesInformes(mes) {
  const n = Number(mes);
  return NOMBRES_MES[n] || `Mes ${n}`;
}

export function anioMesBogota() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value ?? new Date().getFullYear());
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  return { anio: y, mes: m, mesNum: Number(m) };
}

export function getPeriodoDefault(mesNum) {
  const mesPeriodo2 = env.informesPeriodo.periodo2Mes;
  return Number(mesNum) >= mesPeriodo2 ? 'ago_dic' : 'ene_jul';
}

export function getPeriodoMonths(periodo, mesActual) {
  const mesPeriodo1 = env.informesPeriodo.periodo1Mes;
  const mesPeriodo2 = env.informesPeriodo.periodo2Mes;
  if (periodo === 'ene_jul') return { mesInicio: mesPeriodo1, mesFin: mesPeriodo1 };
  if (periodo === 'ago_dic') return { mesInicio: mesPeriodo2, mesFin: mesPeriodo2 };
  const def = getPeriodoDefault(mesActual);
  return getPeriodoMonths(def, mesActual);
}

export function resolvePeriodoFiltro({ periodo, anio } = {}) {
  const { anio: anioBogota, mesNum } = anioMesBogota();
  const periodoNorm =
    periodo === 'ene_jul' || periodo === 'ago_dic' ? periodo : getPeriodoDefault(mesNum);
  const { mesInicio, mesFin } = getPeriodoMonths(periodoNorm, mesNum);
  const anioRef = /^\d{4}$/.test(String(anio || '').trim()) ? Number(anio) : anioBogota;
  return { periodo: periodoNorm, anio: anioRef, mesInicio, mesFin };
}

export function getPeriodosInformesConfig() {
  const { mesNum } = anioMesBogota();
  const mesPeriodo1 = env.informesPeriodo.periodo1Mes;
  const mesPeriodo2 = env.informesPeriodo.periodo2Mes;
  const etiqueta1 = env.informesPeriodo.periodo1Etiqueta || nombreMesInformes(mesPeriodo1);
  const etiqueta2 = env.informesPeriodo.periodo2Etiqueta || nombreMesInformes(mesPeriodo2);

  return {
    periodos: [
      {
        id: 'ene_jul',
        mes: mesPeriodo1,
        mesInicio: mesPeriodo1,
        mesFin: mesPeriodo1,
        etiqueta: etiqueta1,
      },
      {
        id: 'ago_dic',
        mes: mesPeriodo2,
        mesInicio: mesPeriodo2,
        mesFin: mesPeriodo2,
        etiqueta: etiqueta2,
      },
    ],
    periodoActual: getPeriodoDefault(mesNum),
  };
}

/**
 * Un registro por participante+curso: el mes del periodo en que tuvo
 * estado CONFIRMADO, ACTIVO o INCAPACITADO (aunque en meses posteriores esté RETIRADO).
 */
export function inscripcionesValidasPeriodoSubquery() {
  return `(
    SELECT li.validador_participante, li.IDCurso, li.Tipo, li.año, li.Mes, li.Estado,
           li.validador_responsable, li.Transporte, li.Sede
    FROM inscripciones_1 li
    INNER JOIN (
      SELECT
        TRIM(validador_participante) AS validador_participante,
        TRIM(IDCurso) AS IDCurso,
        MAX(CAST(Mes AS UNSIGNED)) AS max_mes
      FROM inscripciones_1
      WHERE Tipo = 1
        AND año = :anio
        AND CAST(Mes AS UNSIGNED) BETWEEN :mesInicio AND :mesFin
        AND TRIM(Estado) IN ${ESTADOS_INFORME_INSCRIPCION_SQL}
      GROUP BY TRIM(validador_participante), TRIM(IDCurso)
    ) lm
      ON TRIM(li.validador_participante) = lm.validador_participante
      AND TRIM(li.IDCurso) = lm.IDCurso
      AND CAST(li.Mes AS UNSIGNED) = lm.max_mes
    WHERE li.Tipo = 1
      AND li.año = :anio
      AND CAST(li.Mes AS UNSIGNED) BETWEEN :mesInicio AND :mesFin
      AND TRIM(li.Estado) IN ${ESTADOS_INFORME_INSCRIPCION_SQL}
  )`;
}
