export const ESTADOS_INFORME_INSCRIPCION = ['CONFIRMADO', 'ACTIVO', 'INCAPACITADO'];

export const ESTADOS_INFORME_INSCRIPCION_SQL = "('CONFIRMADO', 'ACTIVO', 'INCAPACITADO')";

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
  return Number(mesNum) <= 7 ? 'ene_jul' : 'ago_dic';
}

export function getPeriodoMonths(periodo, mesActual) {
  if (periodo === 'ene_jul') return { mesInicio: 5, mesFin: 7 };
  if (periodo === 'ago_dic') return { mesInicio: 10, mesFin: 12 };
  const def = getPeriodoDefault(mesActual);
  return def === 'ene_jul' ? { mesInicio: 5, mesFin: 7 } : { mesInicio: 10, mesFin: 12 };
}

export function resolvePeriodoFiltro({ periodo, anio } = {}) {
  const { anio: anioBogota, mesNum } = anioMesBogota();
  const periodoNorm =
    periodo === 'ene_jul' || periodo === 'ago_dic' ? periodo : getPeriodoDefault(mesNum);
  const { mesInicio, mesFin } = getPeriodoMonths(periodoNorm, mesNum);
  const anioRef = /^\d{4}$/.test(String(anio || '').trim()) ? Number(anio) : anioBogota;
  return { periodo: periodoNorm, anio: anioRef, mesInicio, mesFin };
}

/**
 * Un registro por participante+curso: el mes más reciente del periodo en que tuvo
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
