import { Op, fn, col, where as sqlWhere, QueryTypes } from 'sequelize';
import Asistencia from '../database/models/AsistenciaModel.js';
import { sequelize } from '../database/sequelize.js';
import { anioMesBogota } from './inscripcionesPeriodo.js';
import {
  eliminarNovedadRutaSegura,
  getHoyBogota,
  registrarNovedadRutaSegura,
} from './rutaSegura.js';

const esAsistio = (reporte) => String(reporte || '').trim() === 'Asistió';
const esAusencia = (reporte) => {
  const r = String(reporte || '').trim();
  return r === 'Faltó' || r === 'Excusa';
};

async function obtenerReportesHoy(documento) {
  const hoy = getHoyBogota();
  return Asistencia.findAll({
    where: {
      documento: String(documento || '').trim(),
      [Op.and]: [sqlWhere(fn('DATE', col('fecha')), hoy)],
    },
    attributes: ['documento', 'idcurso', 'reporte', 'comentarios'],
  });
}

async function contarCursosInscritosActivos(documento) {
  const { anio, mes } = anioMesBogota();
  const [row] = await sequelize.query(
    `SELECT COUNT(DISTINCT TRIM(IDCurso)) AS c
     FROM inscripciones_1
     WHERE Tipo = 1
       AND TRIM(validador_participante) = :documento
       AND año = :anio
       AND Mes = :mes
       AND TRIM(Estado) IN ('CONFIRMADO', 'ACTIVO', 'INCAPACITADO')`,
    {
      replacements: { documento: String(documento || '').trim(), anio, mes },
      type: QueryTypes.SELECT,
    },
  );
  return Number(row?.c ?? 0);
}

/**
 * Sincroniza Ruta Segura según TODOS los reportes del participante en el día.
 * - Si asistió a al menos un curso → quita la novedad (no ausente en transporte).
 * - Si faltó a todos los cursos ya reportados y ya hay reporte de todos sus cursos inscritos
 *   (o solo tiene un curso) → registra ausencia.
 * - Si aún faltan reportes de otros cursos → no toca Ruta Segura (evita contradicciones).
 */
export async function sincronizarRutaSeguraSegunAsistenciaDelDia({
  sede,
  documento,
  tieneRutaExtra,
}) {
  if (!documento || !sede) {
    return { ok: false, skipped: true, reason: 'datos_incompletos' };
  }

  const reportes = await obtenerReportesHoy(documento);
  if (!reportes.length) {
    return { ok: false, skipped: true, reason: 'sin_reportes' };
  }

  if (reportes.some((r) => esAsistio(r.reporte))) {
    return eliminarNovedadRutaSegura({ sede, document: documento });
  }

  if (!tieneRutaExtra) {
    return { ok: true, skipped: true, reason: 'sin_ruta_extra' };
  }

  const reportesAusencia = reportes.filter((r) => esAusencia(r.reporte));
  if (reportesAusencia.length !== reportes.length) {
    return { ok: true, skipped: true, reason: 'reportes_inconclusos' };
  }

  const cursosReportados = new Set(
    reportes.map((r) => String(r.idcurso || '').trim()).filter(Boolean),
  );
  const cursosInscritos = await contarCursosInscritosActivos(documento);
  const umbralCursos = Math.max(1, cursosInscritos);

  if (cursosReportados.size < umbralCursos) {
    return { ok: true, skipped: true, reason: 'faltan_reportes_otros_cursos' };
  }

  const excusa = reportesAusencia.find((r) => String(r.reporte || '').trim() === 'Excusa');
  const note = excusa
    ? String(excusa.comentarios || '').trim() || 'Excusa'
    : 'Faltó';

  return registrarNovedadRutaSegura({ sede, document: documento, note });
}
