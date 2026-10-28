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

/** Mes actual y los dos siguientes (dic → ene/feb del año siguiente). */
export function periodosInscripcionPermitidos() {
  const { anio, mesNum } = anioMesBogota();
  const out = [];
  let a = anio;
  let m = mesNum;
  for (let i = 0; i < 3; i += 1) {
    out.push({ anio: a, mes: String(m).padStart(2, '0'), mesNum: m });
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return out;
}

export function isPeriodoInscripcionPermitido(anio, mes) {
  const a = Number(anio);
  const m = String(mes || '').padStart(2, '0');
  if (!Number.isFinite(a) || !m) return false;
  return periodosInscripcionPermitidos().some((p) => p.anio === a && p.mes === m);
}

export function getPeriodoDefault(mesNum) {
  // Desde el mes inicial del 2.º corte (oct) se considera periodo ago_dic.
  const mesPeriodo2Inicio = env.informesPeriodo.periodo2MesInicio ?? env.informesPeriodo.periodo2Mes;
  return Number(mesNum) >= mesPeriodo2Inicio ? 'ago_dic' : 'ene_jul';
}

export function getPeriodoMonths(periodo, mesActual) {
  const p1Inicio = env.informesPeriodo.periodo1MesInicio;
  const p1Fin = env.informesPeriodo.periodo1MesFin;
  const p2Inicio = env.informesPeriodo.periodo2MesInicio;
  const p2Fin = env.informesPeriodo.periodo2MesFin;
  if (periodo === 'ene_jul') return { mesInicio: p1Inicio, mesFin: p1Fin };
  if (periodo === 'ago_dic') return { mesInicio: p2Inicio, mesFin: p2Fin };
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

function etiquetaRangoMeses(inicio, fin) {
  if (inicio === fin) return nombreMesInformes(inicio);
  return `${nombreMesInformes(inicio)} - ${nombreMesInformes(fin)}`;
}

export function getPeriodosInformesConfig() {
  const { mesNum } = anioMesBogota();
  const p1Inicio = env.informesPeriodo.periodo1MesInicio;
  const p1Fin = env.informesPeriodo.periodo1MesFin;
  const p2Inicio = env.informesPeriodo.periodo2MesInicio;
  const p2Fin = env.informesPeriodo.periodo2MesFin;
  const etiqueta1 = env.informesPeriodo.periodo1Etiqueta || etiquetaRangoMeses(p1Inicio, p1Fin);
  const etiqueta2 = env.informesPeriodo.periodo2Etiqueta || etiquetaRangoMeses(p2Inicio, p2Fin);

  return {
    periodos: [
      {
        id: 'ene_jul',
        mes: p1Fin,
        mesInicio: p1Inicio,
        mesFin: p1Fin,
        etiqueta: etiqueta1,
      },
      {
        id: 'ago_dic',
        mes: p2Fin,
        mesInicio: p2Inicio,
        mesFin: p2Fin,
        etiqueta: etiqueta2,
      },
    ],
    periodoActual: getPeriodoDefault(mesNum),
  };
}

/**
 * Un registro por participante+curso: el mes más reciente del rango del periodo
 * en que tuvo estado CONFIRMADO, ACTIVO o INCAPACITADO (p. ej. activo en oct
 * y retirado en nov → cuenta con la fila de octubre).
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
