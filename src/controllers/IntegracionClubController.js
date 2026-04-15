import { QueryTypes } from 'sequelize';
import { env } from '../config/env.js';
import { sequelize } from '../database/sequelize.js';

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

function tokenValido(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = String(match?.[1] || '').trim();
  const expected = String(env.integracionClub.bearerIns || '').trim();
  return Boolean(expected) && token === expected;
}

export const listarExtraclasesMesActual = async (req, res) => {
  try {
    if (!tokenValido(req)) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado',
      });
    }

    const sedeRaw = String(req.params.sedeNombre || '').trim().toUpperCase();
    const sede = MAP_SEDE[sedeRaw];
    if (!sede) {
      return res.status(400).json({
        success: false,
        message: 'Sede inválida. Use RETIRO o MEDELLÍN',
      });
    }

    const { anio, mes } = mesActualBogota();
    const rows = await sequelize.query(
      `SELECT
         TRIM(i.validador_participante) AS documento,
         TRIM(i.IDCurso) AS id,
         LPAD(TRIM(i.Mes), 2, '0') AS numMes,
         TRIM(i.Sede) AS sede,
         TRIM(i.Estado) AS estado,
         TRIM(c.Nombre_Corto_Curso) AS curso,
         TRIM(c.Nombre_del_curso) AS nombreCurso,
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
         NULL AS poliza
       FROM inscripciones_1 i
       LEFT JOIN cursos_2025 c ON TRIM(c.ID_Curso) = TRIM(i.IDCurso)
       LEFT JOIN participantes p ON TRIM(p.IDParticipante) = TRIM(i.validador_participante)
       LEFT JOIN responsables r ON TRIM(r.IDResponsable) = TRIM(i.validador_responsable)
       LEFT JOIN padres pa ON TRIM(pa.\`Doc. Alumno\`) = TRIM(i.validador_participante)
       WHERE i.Tipo = 1
         AND i.año = :anio
         AND LPAD(TRIM(i.Mes), 2, '0') = :mes
         AND TRIM(i.Sede) = :sede
         AND TRIM(i.Estado) IN ('CONFIRMADO', 'INCAPACITADO', 'RETIRADO')
       ORDER BY c.Nombre_del_curso ASC, p.Nombre_Completo ASC`,
      {
        replacements: { anio, mes, sede },
        type: QueryTypes.SELECT,
      },
    );

    const data = rows.map((item) => ({
      ...item,
      mes: MESES[item.numMes] || item.numMes,
    }));
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'No se pudo construir la respuesta de extraclases',
      error: error.message,
    });
  }
};
