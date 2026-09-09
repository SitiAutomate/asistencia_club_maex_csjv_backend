import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { sendError, sendSuccess, handleError } from '../utils/responseHandler.js';
import {
  anioMesBogota,
  isPeriodoInscripcionPermitido,
  periodosInscripcionPermitidos,
} from '../utils/inscripcionesPeriodo.js';
import { registrarAuditoria, buildCambios, resumenFromCambios } from '../services/auditoriaAdminService.js';
import {
  guardarValoresCamposTipo,
  getCamposTipo,
  leerValoresCamposTipo,
  enriquecerCamposConCatalogo,
} from '../services/gestionTipoCamposService.js';
import { GESTION_MODULOS } from '../constants/gestionPermisos.js';
import { ROLES } from '../constants/roles.js';

const ESTADOS_GESTION = ['CONFIRMADO', 'ACTIVO', 'INCAPACITADO', 'RETIRADO'];

/** Curso excluido del pase mensual (misma regla operativa histórica). */
const CURSO_EXCLUIDO_PASE_MES = '20262';

/** Periodo AppSheet: MYY o MMYY (ej. sep-2026 → 926, oct-2026 → 1026). */
function codigoPeriodoInscripcion(mes, anio) {
  const m = Number(mes);
  const yy = String(anio).slice(-2);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return `${m}${yy}`;
}

/** Recorta a longitud de columna MySQL (evita "Validation error" opaco). */
const clip = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
};

function isDuplicateKeyError(error) {
  return (
    error?.name === 'SequelizeUniqueConstraintError' ||
    Number(error?.parent?.errno) === 1062 ||
    Number(error?.original?.errno) === 1062 ||
    /Duplicate entry/i.test(String(error?.parent?.sqlMessage || error?.message || ''))
  );
}

function quoteCol(name) {
  return `\`${String(name).replace(/`/g, '')}\``;
}

const INSCRIPCION_AUDIT_SELECT = `
  IDInscripcion AS id,
  Tipo AS tipo,
  Estado AS estado,
  Sede AS sede,
  Transporte AS transporte,
  Mes AS mes,
  año AS anio,
  OBSERVACION AS observaciones,
  Observacion_Facturacion AS observacionFacturacion,
  \`CAUSAL DE RETIRO\` AS causalRetiro,
  \`FECHA RETIRO EXTRACLASE\` AS fechaRetiro,
  \`FECHA RETIRO TRANSPORTE\` AS fechaRetiroTransporte,
  \`FECHA INGRESO NUEVO TRANSPORTE\` AS fechaIngresoNuevoTransporte,
  IDCurso AS idCurso,
  validador_participante AS documentoParticipante,
  validador_responsable AS documentoResponsable,
  nombreCurso AS nombreCurso
`;

async function snapshotInscripcion(id) {
  const [row] = await sequelize.query(
    `SELECT ${INSCRIPCION_AUDIT_SELECT} FROM inscripciones_1 WHERE IDInscripcion = :id LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  if (!row) return null;
  const tipo = Number(row.tipo) || 1;
  let camposExtra = [];
  if (tipo > 1) {
    try {
      camposExtra = await leerValoresCamposTipo(tipo, id);
    } catch {
      camposExtra = [];
    }
  }
  return {
    id: row.id,
    tipo: row.tipo,
    estado: row.estado,
    sede: row.sede,
    transporte: row.transporte,
    mes: row.mes,
    anio: row.anio,
    observaciones: row.observaciones,
    observacionFacturacion: row.observacionFacturacion,
    causalRetiro: row.causalRetiro,
    fechaRetiro: row.fechaRetiro,
    fechaRetiroTransporte: row.fechaRetiroTransporte,
    fechaIngresoNuevoTransporte: row.fechaIngresoNuevoTransporte,
    idCurso: row.idCurso,
    documentoParticipante: row.documentoParticipante,
    documentoResponsable: row.documentoResponsable,
    nombreCurso: row.nombreCurso,
    camposExtra: Object.fromEntries(
      (camposExtra || []).map((c) => [c.campoKey, c.value]),
    ),
  };
}

/** Causales frecuentes (se mezclan con las distintas en BD). */
const CAUSALES_BASE = [
  'Desmotivación',
  'Cambio de curso',
  'Cambio de nivel',
  'Cambio de club',
  'Inconformidad con el entrenador',
  'Viaje',
  'Problemas Económicos',
  'Cruce de programas',
  'Cartera Morosa',
  'Retiro del Colegio',
  'Adaptación al curso',
  'Incapacidad médica',
  'Sin Firmar Contrato',
  'Bullying',
  'Enfermedad que le impide continuar',
  'Motivos personales',
  'Difícil Transporte',
  'Cambio de domicilio',
];

const mesVariants = (mes) => {
  const padded = String(mes || '').padStart(2, '0');
  const bare = String(Number(padded));
  return [...new Set([padded, bare, String(mes).trim()].filter(Boolean))];
};

const parseLimit = (raw, fallback = 50, { max = 200 } = {}) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
};

const parsePage = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
};

const emptyToNull = (value) => {
  if (value === undefined) return undefined;
  const s = String(value ?? '').trim();
  return s === '' ? null : s;
};

/** Normaliza transporte a SI / NO (o null si vacío). */
const normalizeTransporte = (value) => {
  if (value === undefined) return undefined;
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'SI' || s === 'S' || s === 'YES' || s === 'Y' || s === '1' || s === 'TRUE') return 'SI';
  return 'NO';
};

const mapListRow = (row, camposLista = []) => {
  const base = {
    id: row.IDInscripcion,
    tipo: row.Tipo,
    año: row.año,
    mes: row.Mes,
    estado: row.Estado,
    sede: row.Sede,
    transporte: row.Transporte,
    fechaInscripcion: row.Fecha_Inscripcion,
    observaciones: row.OBSERVACION,
    observacionFacturacion: row.Observacion_Facturacion,
    causalRetiro: row.CausalDeRetiro,
    fechaIngresoNuevoTransporte: row.FechaIngresoNuevoTransporte,
    fechaRetiro: row.FechaRetiro,
    fechaRetiroTransporte: row.FechaRetiroTransporte,
    idCurso: row.IDCurso,
    nombreCurso: row.nombre_curso || row.nombreCurso || row.IDCurso || '',
    codigoFacturacion: row.Codigo_Facturacion || '',
    documentoParticipante: row.validador_participante,
    nombreParticipante: row.nombre_participante || '',
    fechaNacimiento: row.fecha_nacimiento || null,
    documentoResponsable: row.validador_responsable,
    nombreResponsable: row.nombre_responsable || '',
    celularResponsable: row.celular_responsable || '',
    correoResponsable: row.correo_responsable || '',
    costoCurso: row.Tarifa_Curso ?? row.tarifa_curso ?? '',
  };
  if (!camposLista.length) {
    base.camposExtra = [];
    return base;
  }
  base.camposExtra = camposLista.map((c) => ({
    campoKey: c.campo_key,
    label: c.label,
    columnaDb: c.columna_db,
    catalogo: c.catalogo || null,
    value: row[`__extra_${c.campo_key}`] ?? null,
    visibleLista: true,
  }));
  return base;
};

const mapDetailRow = (row) => ({
  ...mapListRow(row),
  fechaIngresoNuevoTransporte: row.FechaIngresoNuevoTransporte,
  fechaRetiro: row.FechaRetiro,
  fechaRetiroTransporte: row.FechaRetiroTransporte,
  costo: row.Tarifa_Curso || '',
  nombreCortoCurso: row.Nombre_Corto_Curso || '',
  actividad: row.Actividad,
  nombreActividad: row.Nombre_Actividad || '',
  nombreLinea: row.Nombre_Linea || '',
  entrenador: row.entrenador_nombre || row.Docente || '',
  docenteId: row.Docente || '',
  grupo: row.grupo || '',
  fechaNacimiento: row.fecha_nacimiento,
  participante: row.validador_participante
    ? {
        documento: row.validador_participante,
        nombreCompleto: row.nombre_participante || '',
        grupo: row.grupo || '',
        fechaNacimiento: row.fecha_nacimiento,
        idResponsable: row.participante_id_responsable || '',
      }
    : null,
  responsable: row.validador_responsable
    ? {
        documento: row.validador_responsable,
        nombreCompleto: row.nombre_responsable || '',
        nombres: row.responsable_nombres || '',
        apellidos: row.responsable_apellidos || '',
        celular: row.celular_responsable || '',
        correo: row.correo_responsable || '',
        ciudad: row.responsable_ciudad || '',
        direccion: row.responsable_direccion || '',
        tipoIdentificacion: row.responsable_tipo_id || '',
        tipoPersona: row.responsable_tipo_persona || '',
      }
    : null,
});

function buildListFilters(query, { omit = [] } = {}) {
  const skip = new Set(omit);
  const { anio: anioBogota } = anioMesBogota();
  const tipoRaw = query.tipo != null && String(query.tipo).trim() !== '' ? Number(query.tipo) : 1;
  const tipo = Number.isFinite(tipoRaw) ? tipoRaw : 1;
  const anio = /^\d{4}$/.test(String(query.anio || '').trim())
    ? Number(query.anio)
    : anioBogota;
  const mes = query.mes != null && String(query.mes).trim() !== '' ? String(query.mes).trim() : '';
  const estado = query.estado != null ? String(query.estado).trim().toUpperCase() : '';
  const sede = query.sede != null ? String(query.sede).trim() : '';
  const q = query.q != null ? String(query.q).trim() : '';
  const idCurso = query.idCurso != null ? String(query.idCurso).trim() : '';
  const actividad = query.actividad != null ? String(query.actividad).trim() : '';
  const categoria = query.categoria != null ? String(query.categoria).trim() : '';
  const excludeTipo1 = String(query.excludeTipo1 || '').toLowerCase() === 'true';
  /** YYYY-MM-DD (calendario local del usuario / Bogotá). Inclusivo en ambos extremos. */
  const parseIsoDate = (raw) => {
    const s = String(raw || '').trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  };
  let fechaDesde = parseIsoDate(query.fechaDesde ?? query.fechaInicio);
  let fechaHasta = parseIsoDate(query.fechaHasta ?? query.fechaFin);
  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
    const tmp = fechaDesde;
    fechaDesde = fechaHasta;
    fechaHasta = tmp;
  }

  const clauses = ['1=1'];
  const repl = {};

  if (excludeTipo1) {
    clauses.push('i.Tipo <> 1');
    if (Number.isFinite(tipoRaw) && query.tipo != null && String(query.tipo).trim() !== '') {
      clauses.push('i.Tipo = :tipo');
      repl.tipo = tipo;
    }
  } else {
    clauses.push('i.Tipo = :tipo');
    repl.tipo = tipo;
  }

  if (!skip.has('anio')) {
    clauses.push('CAST(i.`año` AS UNSIGNED) = :anio');
    repl.anio = anio;
  }

  if (!skip.has('mes') && mes && !excludeTipo1) {
    const variants = mesVariants(mes);
    clauses.push(`i.Mes IN (${variants.map((_, idx) => `:mes${idx}`).join(', ')})`);
    variants.forEach((v, idx) => {
      repl[`mes${idx}`] = v;
    });
  }

  if (!skip.has('estado') && estado && estado !== 'TODOS') {
    clauses.push('UPPER(TRIM(i.Estado)) = :estado');
    repl.estado = estado;
  }

  if (!skip.has('sede') && sede) {
    clauses.push('i.Sede = :sede');
    repl.sede = sede;
  }

  if (!skip.has('idCurso') && idCurso) {
    clauses.push('i.IDCurso = :idCurso');
    repl.idCurso = idCurso;
  }

  if (!skip.has('actividad') && actividad) {
    clauses.push('c.Actividad = :actividadFiltro');
    repl.actividadFiltro = Number(actividad) || actividad;
  }

  if (!skip.has('categoria') && categoria) {
    clauses.push(`(TRIM(i.categoria) = :categoriaQ OR TRIM(p.Grupo) = :categoriaQ)`);
    repl.categoriaQ = categoria;
  }

  if (!skip.has('q') && q) {
    clauses.push(
      `(i.validador_participante LIKE :searchQ OR i.validador_responsable LIKE :searchQ OR p.Nombre_Completo LIKE :searchQ OR c.Nombre_del_curso LIKE :searchQ OR c.Nombre_Corto_Curso LIKE :searchQ OR i.IDCurso LIKE :searchQ OR i.categoria LIKE :searchQ OR p.Grupo LIKE :searchQ)`,
    );
    repl.searchQ = `%${q}%`;
  }

  // Columna DATE: comparar por calendario (YYYY-MM-DD). <= hasta incluye ese día completo.
  if (!skip.has('fecha')) {
    if (fechaDesde) {
      clauses.push('i.`Fecha_Inscripción` >= :fechaDesde');
      repl.fechaDesde = fechaDesde;
    }
    if (fechaHasta) {
      clauses.push('i.`Fecha_Inscripción` <= :fechaHasta');
      repl.fechaHasta = fechaHasta;
    }
  }

  const needsCursoJoin = Boolean(repl.actividadFiltro != null || repl.searchQ);
  const needsParticipanteJoin = Boolean(repl.categoriaQ != null || repl.searchQ);

  return {
    clauses,
    repl,
    anio,
    tipo,
    mes,
    estado,
    sede,
    q,
    idCurso,
    actividad,
    categoria,
    fechaDesde,
    fechaHasta,
    needsCursoJoin,
    needsParticipanteJoin,
  };
}

function metaFromSqlJoins({ needsCursoJoin, needsParticipanteJoin }) {
  const joins = [];
  if (needsCursoJoin) {
    joins.push('LEFT JOIN cursos_2025 c ON c.ID_Curso = i.IDCurso');
  }
  if (needsParticipanteJoin) {
    joins.push('LEFT JOIN participantes p ON p.IDParticipante = i.validador_participante');
  }
  return joins.join('\n       ');
}

export const listarInscripcionesGestion = async (req, res) => {
  try {
    const exportAll = String(req.query.export || '').toLowerCase() === 'true';
    const page = exportAll ? 1 : parsePage(req.query.page);
    const limit = exportAll
      ? parseLimit(req.query.limit, 20000, { max: 50000 })
      : parseLimit(req.query.limit);
    const offset = exportAll ? 0 : (page - 1) * limit;
    const { clauses, repl, anio, tipo } = buildListFilters(req.query);
    const whereSql = clauses.join(' AND ');

    const countRows = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM inscripciones_1 i
       LEFT JOIN participantes p ON p.IDParticipante = i.validador_participante
       LEFT JOIN cursos_2025 c ON c.ID_Curso = i.IDCurso
       WHERE ${whereSql}`,
      { replacements: repl, type: QueryTypes.SELECT },
    );
    const total = Number(countRows[0]?.total || 0);

    const tipoNum = Number(tipo);
    const camposLista =
      Number.isFinite(tipoNum) && tipoNum > 1
        ? (await getCamposTipo(tipoNum)).filter((c) => Number(c.visible_lista))
        : [];
    const extraSelect =
      camposLista.length > 0
        ? `, ${camposLista
            .map(
              (c) =>
                `i.${quoteCol(c.columna_db)} AS ${quoteCol(`__extra_${c.campo_key}`)}`,
            )
            .join(', ')}`
        : '';

    const limitSql = exportAll ? `LIMIT ${limit}` : `LIMIT ${limit} OFFSET ${offset}`;

    const rows = await sequelize.query(
      `SELECT
         i.IDInscripcion,
         i.Tipo,
         i.año,
         i.Mes,
         i.Estado,
         i.Sede,
         i.Transporte,
         i.\`Fecha_Inscripción\` AS Fecha_Inscripcion,
         i.OBSERVACION,
         i.Observacion_Facturacion,
         i.\`CAUSAL DE RETIRO\` AS CausalDeRetiro,
         i.\`FECHA INGRESO NUEVO TRANSPORTE\` AS FechaIngresoNuevoTransporte,
         i.\`FECHA RETIRO EXTRACLASE\` AS FechaRetiro,
         i.\`FECHA RETIRO TRANSPORTE\` AS FechaRetiroTransporte,
         i.IDCurso,
         i.validador_participante,
         i.validador_responsable,
         i.nombreCurso,
         c.Nombre_del_curso AS nombre_curso,
         c.Codigo_Facturacion,
         c.Tarifa_Curso,
         p.Nombre_Completo AS nombre_participante,
         p.Fecha_Nacimiento AS fecha_nacimiento,
         r.Nombre_Completo AS nombre_responsable,
         r.Celular_Responsable AS celular_responsable,
         r.Correo_Responsable AS correo_responsable
         ${extraSelect}
       FROM inscripciones_1 i
       LEFT JOIN participantes p ON p.IDParticipante = i.validador_participante
       LEFT JOIN responsables r ON r.IDResponsable = i.validador_responsable
       LEFT JOIN cursos_2025 c ON c.ID_Curso = i.IDCurso
       WHERE ${whereSql}
       ORDER BY i.\`Fecha_Inscripción\` DESC, i.IDInscripcion DESC
       ${limitSql}`,
      {
        replacements: repl,
        type: QueryTypes.SELECT,
      },
    );

    const mapped = rows.map((r) => mapListRow(r, camposLista));
    const allExtras = mapped.flatMap((r) => r.camposExtra || []);
    if (allExtras.length) {
      const enriched = await enriquecerCamposConCatalogo(allExtras);
      let i = 0;
      for (const row of mapped) {
        const n = row.camposExtra?.length || 0;
        if (n) {
          row.camposExtra = enriched.slice(i, i + n);
          i += n;
        }
      }
    }

    return sendSuccess(
      res,
      200,
      {
        inscritos: mapped,
        camposLista: camposLista.map((c) => ({
          campoKey: c.campo_key,
          label: c.label,
          columnaDb: c.columna_db,
          tipoInput: c.tipo_input || 'text',
          catalogo: c.catalogo || null,
        })),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          anio,
          tipo,
        },
      },
      'Inscripciones obtenidas',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar inscripciones', error.message);
  }
};

export const obtenerInscripcionGestion = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return sendError(res, 400, 'ID de inscripción inválido');
    }

    const rows = await sequelize.query(
      `SELECT
         i.IDInscripcion,
         i.Tipo,
         i.año,
         i.Mes,
         i.Estado,
         i.Sede,
         i.Transporte,
         i.\`Fecha_Inscripción\` AS Fecha_Inscripcion,
         i.OBSERVACION,
         i.Observacion_Facturacion,
         i.\`CAUSAL DE RETIRO\` AS CausalDeRetiro,
         i.\`FECHA INGRESO NUEVO TRANSPORTE\` AS FechaIngresoNuevoTransporte,
         i.\`FECHA RETIRO EXTRACLASE\` AS FechaRetiro,
         i.\`FECHA RETIRO TRANSPORTE\` AS FechaRetiroTransporte,
         i.IDCurso,
         i.validador_participante,
         i.validador_responsable,
         i.nombreCurso,
         c.Nombre_del_curso AS nombre_curso,
         c.Nombre_Corto_Curso,
         c.Tarifa_Curso,
         c.Codigo_Facturacion,
         c.Actividad,
         c.Docente,
         c.Linea,
         l.Nombre_Linea,
         a.Nombre_Actividad,
         e.Nombre_Docente AS entrenador_nombre,
         p.Nombre_Completo AS nombre_participante,
         p.Grupo AS grupo,
         p.Fecha_Nacimiento AS fecha_nacimiento,
         p.IDResponsable AS participante_id_responsable,
         r.Nombre_Completo AS nombre_responsable,
         r.Nombres AS responsable_nombres,
         r.Apellidos AS responsable_apellidos,
         r.Celular_Responsable AS celular_responsable,
         r.Correo_Responsable AS correo_responsable,
         r.Ciudad AS responsable_ciudad,
         r.direccion AS responsable_direccion,
         r.tipo_identificacion AS responsable_tipo_id,
         r.Tipo_Persona AS responsable_tipo_persona
       FROM inscripciones_1 i
       LEFT JOIN cursos_2025 c ON c.ID_Curso = i.IDCurso
       LEFT JOIN linea l ON l.IDLinea = c.Linea
       LEFT JOIN actividades a ON a.IDActividad = c.Actividad
       LEFT JOIN entrenadores e ON (e.ID = c.Docente OR e.Correo = c.Docente)
       LEFT JOIN participantes p ON p.IDParticipante = i.validador_participante
       LEFT JOIN responsables r ON r.IDResponsable = i.validador_responsable
       WHERE i.IDInscripcion = :id
       LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );

    if (!rows[0]) {
      return sendError(res, 404, 'Inscripción no encontrada');
    }

    const detail = mapDetailRow(rows[0]);
    if (Number(detail.tipo) > 1) {
      detail.camposExtra = await leerValoresCamposTipo(detail.tipo, detail.id);
    } else {
      detail.camposExtra = [];
    }

    return sendSuccess(res, 200, { inscripcion: detail }, 'Inscripción obtenida');
  } catch (error) {
    return sendError(res, 500, 'Error al obtener inscripción', error.message);
  }
};

export const listarTiposGestion = async (_req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT IDTipo AS id, Nombre_Tipo AS nombre, ESTADO AS estado, descripcion
       FROM tipos
       ORDER BY IDTipo ASC`,
      { type: QueryTypes.SELECT },
    );
    return sendSuccess(res, 200, { tipos: rows }, 'Tipos obtenidos');
  } catch (error) {
    return sendError(res, 500, 'Error al listar tipos', error.message);
  }
};

export const listarCursosGestion = async (req, res) => {
  try {
    const tipo = Number(req.query.tipo);
    const q = String(req.query.q || '').trim();
    const sede = String(req.query.sede || '').trim();
    const estado = String(req.query.estado || '').trim();
    const actividad = String(req.query.actividad || '').trim();
    const soloActivos = String(req.query.soloActivos || 'true').toLowerCase() !== 'false';
    const clauses = ['1=1'];
    const repl = {};

    if (Number.isFinite(tipo) && tipo > 0) {
      clauses.push('c.Tipo = :tipo');
      repl.tipo = tipo;
    }
    if (soloActivos && !estado) {
      clauses.push(`c.Estado_del_curso = 'ACTIVO'`);
    }
    if (estado) {
      clauses.push('c.Estado_del_curso = :estadoCurso');
      repl.estadoCurso = estado;
    }
    if (sede) {
      clauses.push('c.Sede = :sedeCurso');
      repl.sedeCurso = sede;
    }
    if (actividad) {
      clauses.push('c.Actividad = :actividadCurso');
      repl.actividadCurso = Number(actividad);
    }
    if (q) {
      clauses.push(
        `(c.ID_Curso LIKE :q OR c.Nombre_del_curso LIKE :q OR c.Nombre_Corto_Curso LIKE :q)`,
      );
      repl.q = `%${q}%`;
    }

    const [pActual, pSiguiente] = periodosInscripcionPermitidos();
    repl.cuposAnio1 = pActual.anio;
    repl.cuposMes1 = pActual.mesNum;
    repl.cuposAnio2 = pSiguiente.anio;
    repl.cuposMes2 = pSiguiente.mesNum;

    const rows = await sequelize.query(
      `SELECT
         c.ID_Curso AS id,
         c.Nombre_del_curso AS nombre,
         c.Nombre_Corto_Curso AS nombreCorto,
         c.Tipo AS tipo,
         c.Sede AS sede,
         c.Tarifa_Curso AS tarifa,
         c.Codigo_Facturacion AS codigoFacturacion,
         c.Estado_del_curso AS estado,
         c.Actividad AS actividad,
         c.Docente AS docente,
         c.Linea AS linea,
         c.Cupos_minimos AS cuposMinimos,
         c.Cupos_maximos AS cuposMaximos,
         c.Fecha_Inicio AS fechaInicio,
         c.Fecha_Final AS fechaFinal,
         c.\`Descripción\` AS descripcion,
         c.Lunes AS lunes,
         c.Martes AS martes,
         c.\`Miércoles\` AS miercoles,
         c.Jueves AS jueves,
         c.Viernes AS viernes,
         c.\`SÁBADO\` AS sabado,
         l.Nombre_Linea AS nombreLinea,
         a.Nombre_Actividad AS nombreActividad,
         e.Nombre_Docente AS nombreDocente,
         COALESCE(cup.cuposLlenos, 0) AS cuposLlenos
       FROM cursos_2025 c
       LEFT JOIN linea l ON l.IDLinea = c.Linea
       LEFT JOIN actividades a ON a.IDActividad = c.Actividad
       LEFT JOIN entrenadores e ON (e.ID = c.Docente OR e.Correo = c.Docente)
       LEFT JOIN (
         SELECT
           TRIM(i.IDCurso) AS IDCurso,
           COUNT(DISTINCT TRIM(i.validador_participante)) AS cuposLlenos
         FROM inscripciones_1 i
         WHERE TRIM(i.Estado) IN ('CONFIRMADO', 'ACTIVO', 'INCAPACITADO')
           AND (
             (i.año = :cuposAnio1 AND CAST(i.Mes AS UNSIGNED) = :cuposMes1)
             OR (i.año = :cuposAnio2 AND CAST(i.Mes AS UNSIGNED) = :cuposMes2)
           )
         GROUP BY TRIM(i.IDCurso)
       ) cup ON cup.IDCurso = c.ID_Curso
       WHERE ${clauses.join(' AND ')}
       ORDER BY c.Nombre_del_curso ASC
       LIMIT 500`,
      { replacements: repl, type: QueryTypes.SELECT },
    );

    return sendSuccess(
      res,
      200,
      {
        cursos: rows.map((r) => ({
          ...r,
          cuposLlenos: Number(r.cuposLlenos || 0),
          cuposDisponibles:
            r.cuposMaximos != null && String(r.cuposMaximos).trim() !== ''
              ? Math.max(0, Number(r.cuposMaximos) - Number(r.cuposLlenos || 0))
              : null,
        })),
        meta: {
          periodoCupos: [
            { anio: pActual.anio, mes: pActual.mes },
            { anio: pSiguiente.anio, mes: pSiguiente.mes },
          ],
        },
      },
      'Cursos obtenidos',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar cursos', error.message);
  }
};

export const obtenerParticipanteGestion = async (req, res) => {
  try {
    const doc = String(req.params.doc || '').trim();
    if (!doc) return sendError(res, 400, 'Documento requerido');

    const rows = await sequelize.query(
      `SELECT
         p.IDParticipante AS documento,
         p.Nombre_Completo AS nombreCompleto,
         p.Primer_Nombre AS primerNombre,
         p.Segundo_Nombre AS segundoNombre,
         p.Primer_Apellido AS primerApellido,
         p.Segundo_Apellido AS segundoApellido,
         p.Tipo_documento AS tipoDocumento,
         p.Fecha_Nacimiento AS fechaNacimiento,
         p.Grupo AS grupo,
         p.IDResponsable AS idResponsable,
         p.interno_externo AS internoExterno,
         pad.\`Nombre del padre\` AS nombrePadre,
         pad.\`Celular padre\` AS celularPadre,
         pad.\`E-mail padre\` AS emailPadre,
         pad.\`Nombre de la madre\` AS nombreMadre,
         pad.\`Celular madre\` AS celularMadre,
         pad.\`E-mail madre\` AS emailMadre,
         r.Nombre_Completo AS nombreResponsable,
         r.Celular_Responsable AS celularResponsable,
         r.Correo_Responsable AS correoResponsable
       FROM participantes p
       LEFT JOIN padres pad ON pad.\`Doc. Alumno\` = p.IDParticipante
       LEFT JOIN responsables r ON r.IDResponsable = p.IDResponsable
       WHERE p.IDParticipante = :doc
       LIMIT 1`,
      { replacements: { doc }, type: QueryTypes.SELECT },
    );

    if (!rows[0]) return sendError(res, 404, 'Participante no encontrado');
    return sendSuccess(res, 200, { participante: rows[0] }, 'Participante obtenido');
  } catch (error) {
    return sendError(res, 500, 'Error al obtener participante', error.message);
  }
};

export const obtenerResponsableGestion = async (req, res) => {
  try {
    const doc = String(req.params.doc || '').trim();
    if (!doc) return sendError(res, 400, 'Documento requerido');

    const rows = await sequelize.query(
      `SELECT
         r.IDResponsable AS documento,
         r.Nombre_Completo AS nombreCompleto,
         r.Nombres AS nombres,
         r.Apellidos AS apellidos,
         r.Celular_Responsable AS celular,
         r.Correo_Responsable AS correo,
         r.Ciudad AS ciudad,
         r.direccion AS direccion,
         r.tipo_identificacion AS tipoIdentificacion,
         r.Tipo_Persona AS tipoPersona,
         c.Depto AS departamento,
         c.Nombre_Dpto AS nombreDepartamento,
         c.Nombre_Ciudad AS nombreCiudad
       FROM responsables r
       LEFT JOIN ciudades c
         ON TRIM(c.Ciudad) = TRIM(r.Ciudad)
         OR TRIM(c.Nombre_Ciudad) = TRIM(r.Ciudad)
         OR TRIM(c.Ciudad) = LPAD(TRIM(r.Ciudad), 5, '0')
       WHERE r.IDResponsable = :doc
       LIMIT 1`,
      { replacements: { doc }, type: QueryTypes.SELECT },
    );

    if (!rows[0]) return sendError(res, 404, 'Responsable no encontrado');
    return sendSuccess(res, 200, { responsable: rows[0] }, 'Responsable obtenido');
  } catch (error) {
    return sendError(res, 500, 'Error al obtener responsable', error.message);
  }
};

export const crearInscripcionGestion = async (req, res) => {
  try {
    const body = req.body || {};
    const tipo = Number(body.tipo ?? body.Tipo ?? 1);
    const idCurso = String(body.idCurso ?? body.IDCurso ?? '').trim();
    const docParticipante = String(
      body.documentoParticipante ?? body.validador_participante ?? '',
    ).trim();
    const docResponsable = String(
      body.documentoResponsable ?? body.validador_responsable ?? '',
    ).trim();
    const mesRaw = String(body.mes ?? body.Mes ?? '').trim();
    const mes = mesRaw ? String(mesRaw).padStart(2, '0') : '';
    const { anio: anioBogota } = anioMesBogota();
    const anio = Number(body.anio ?? body.año ?? anioBogota);
    const sede = emptyToNull(body.sede ?? body.Sede) ?? null;
    const transporte = normalizeTransporte(body.transporte ?? body.Transporte) ?? 'NO';
    let estado = String(body.estado ?? body.Estado ?? 'ACTIVO').trim().toUpperCase();
    if (!ESTADOS_GESTION.includes(estado)) estado = 'ACTIVO';
    const observaciones = emptyToNull(body.observaciones ?? body.OBSERVACION) ?? null;
    const observacionFacturacion =
      emptyToNull(body.observacionFacturacion ?? body.Observacion_Facturacion) ?? null;
    const fechaIngreso =
      emptyToNull(body.fechaIngresoNuevoTransporte ?? body.FechaIngresoNuevoTransporte) ?? null;
    let fechaRetiro =
      emptyToNull(body.fechaRetiro ?? body.FechaRetiro ?? body.FechaRetiroExtraclase) ?? null;
    const fechaRetiroTransporte =
      emptyToNull(body.fechaRetiroTransporte ?? body.FechaRetiroTransporte) ?? null;
    let causalRetiro = emptyToNull(body.causalRetiro ?? body.CausalDeRetiro) ?? null;

    if (estado === 'RETIRADO') {
      if (!causalRetiro) {
        return sendError(res, 400, 'La causal de retiro es obligatoria cuando el estado es RETIRADO');
      }
      if (!fechaRetiro) {
        return sendError(res, 400, 'La fecha de retiro es obligatoria cuando el estado es RETIRADO');
      }
    } else {
      causalRetiro = null;
      fechaRetiro = null;
    }

    if (!Number.isFinite(tipo) || tipo < 1) {
      return sendError(res, 400, 'Tipo inválido');
    }
    if (!idCurso || !docParticipante || !docResponsable || !mes || !Number.isFinite(anio)) {
      return sendError(
        res,
        400,
        'Faltan campos obligatorios: curso, participante, responsable, mes y año',
      );
    }

    if (!isPeriodoInscripcionPermitido(anio, mes)) {
      return sendError(
        res,
        400,
        'Solo se pueden crear inscripciones para el mes actual o el siguiente (en diciembre incluye enero del año siguiente)',
      );
    }

    const [curso] = await sequelize.query(
      `SELECT ID_Curso, Nombre_del_curso, Tipo, Estado_del_curso
       FROM cursos_2025 WHERE ID_Curso = :idCurso LIMIT 1`,
      { replacements: { idCurso }, type: QueryTypes.SELECT },
    );
    if (!curso) return sendError(res, 404, 'Curso no encontrado');
    if (String(curso.Tipo) !== String(tipo)) {
      return sendError(res, 400, `El curso no corresponde al tipo ${tipo}`);
    }

    const [participante] = await sequelize.query(
      `SELECT IDParticipante FROM participantes WHERE IDParticipante = :doc LIMIT 1`,
      { replacements: { doc: docParticipante }, type: QueryTypes.SELECT },
    );
    if (!participante) return sendError(res, 404, 'Participante no encontrado');

    const [responsable] = await sequelize.query(
      `SELECT IDResponsable FROM responsables WHERE IDResponsable = :doc LIMIT 1`,
      { replacements: { doc: docResponsable }, type: QueryTypes.SELECT },
    );
    if (!responsable) return sendError(res, 404, 'Responsable no encontrado');

    const uniqueId = `gest_${anio}_${Date.now()}`;
    const result = await sequelize.query(
      `INSERT INTO inscripciones_1
        (Tipo, validador_participante, validador_responsable, IDCurso, Transporte, Sede, Estado,
         \`Fecha_Inscripción\`, Mes, año, UniqueID, nombreCurso, OBSERVACION, Observacion_Facturacion,
         \`CAUSAL DE RETIRO\`, \`FECHA INGRESO NUEVO TRANSPORTE\`, \`FECHA RETIRO EXTRACLASE\`,
         \`FECHA RETIRO TRANSPORTE\`)
       VALUES
        (:tipo, :docParticipante, :docResponsable, :idCurso, :transporte, :sede, :estado,
         CURDATE(), :mes, :anio, :uniqueId, :nombreCurso, :observaciones, :observacionFacturacion,
         :causalRetiro, :fechaIngreso, :fechaRetiro, :fechaRetiroTransporte)`,
      {
        replacements: {
          tipo,
          docParticipante,
          docResponsable,
          idCurso,
          transporte,
          sede,
          estado,
          mes,
          anio,
          uniqueId,
          nombreCurso: curso.Nombre_del_curso || null,
          observaciones,
          observacionFacturacion,
          causalRetiro,
          fechaIngreso,
          fechaRetiro,
          fechaRetiroTransporte,
        },
        type: QueryTypes.INSERT,
      },
    );

    const insertId = Number(result?.[0] || 0);
    if (insertId && tipo > 1) {
      await guardarValoresCamposTipo(tipo, insertId, body);
    }
    const despues = insertId
      ? await snapshotInscripcion(insertId)
      : {
          id: insertId,
          tipo,
          idCurso,
          mes,
          anio,
          estado,
          documentoParticipante: docParticipante,
          documentoResponsable: docResponsable,
          sede,
          transporte,
        };
    await registrarAuditoria({
      req,
      accion: 'CREAR',
      modulo: tipo > 1 ? GESTION_MODULOS.OTROS : GESTION_MODULOS.INSCRIPCIONES,
      entidad: 'inscripcion',
      entidadId: insertId,
      resumen: `Creó inscripción #${insertId} · ${docParticipante} · curso ${idCurso} · ${mes}/${anio} · ${estado}`,
      despues,
    });
    return sendSuccess(
      res,
      201,
      { id: insertId },
      'Inscripción creada correctamente',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al crear inscripción', error.message);
  }
};

function requireSuperAdmin(req, res) {
  if (String(req.user?.rol || '').trim() !== ROLES.SUPER_ADMINISTRADOR) {
    sendError(res, 403, 'Solo SuperAdministrador puede pasar inscripciones al mes siguiente');
    return false;
  }
  return true;
}

function resolucionPaseMes() {
  const [actual, siguiente] = periodosInscripcionPermitidos();
  return {
    desde: {
      anio: actual.anio,
      mes: actual.mes,
      mesNum: actual.mesNum,
      periodo: codigoPeriodoInscripcion(actual.mesNum, actual.anio),
    },
    hacia: {
      anio: siguiente.anio,
      mes: siguiente.mes,
      /** AppSheet guarda Mes sin cero a la izq. (ej. "9", "10"). */
      mesInsert: String(siguiente.mesNum),
      mesNum: siguiente.mesNum,
      periodo: codigoPeriodoInscripcion(siguiente.mesNum, siguiente.anio),
    },
  };
}

/** WHERE compartido: candidatos a copiar (Tipo=1, activos, sin duplicado en mes destino). */
const SQL_WHERE_PASE_MES = `
  i3.Tipo = 1
  AND LPAD(TRIM(i3.Mes), 2, '0') = :mesDesde
  AND CAST(i3.\`año\` AS UNSIGNED) = :anioDesde
  AND TRIM(i3.Estado) IN ('CONFIRMADO', 'INCAPACITADO', 'ACTIVO')
  AND TRIM(i3.IDCurso) <> :cursoExcluido
  AND NULLIF(TRIM(i3.validador_participante), '') IS NOT NULL
  AND NULLIF(TRIM(i3.IDCurso), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM inscripciones_1 i4
    WHERE LPAD(TRIM(i4.Mes), 2, '0') = :mesHacia
      AND CAST(i4.\`año\` AS UNSIGNED) = :anioHacia
      AND TRIM(i4.validador_participante) = TRIM(i3.validador_participante)
      AND TRIM(i4.IDCurso) = TRIM(i3.IDCurso)
      AND TRIM(i4.Estado) IN ('RETIRADO', 'CONFIRMADO', 'ACTIVO', 'INCAPACITADO')
  )
`;

export const previsualizarPaseMesInscripciones = async (req, res) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { desde, hacia } = resolucionPaseMes();
    const repl = {
      mesDesde: desde.mes,
      anioDesde: desde.anio,
      mesHacia: hacia.mes,
      anioHacia: hacia.anio,
      cursoExcluido: CURSO_EXCLUIDO_PASE_MES,
    };

    const [countRow] = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM inscripciones_1 i3
       WHERE ${SQL_WHERE_PASE_MES}`,
      { replacements: repl, type: QueryTypes.SELECT },
    );

    return sendSuccess(
      res,
      200,
      {
        desde,
        hacia,
        cursoExcluido: CURSO_EXCLUIDO_PASE_MES,
        candidatos: Number(countRow?.total || 0),
      },
      'Previsualización pase de mes',
    );
  } catch (error) {
    return handleError(res, error, 'Error al previsualizar pase de mes');
  }
};

/**
 * Copia Tipo=1 del mes actual (Bogotá) al siguiente, sin duplicar
 * participante+curso ya presentes en el destino (incluye RETIRADO).
 */
export const ejecutarPaseMesInscripciones = async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  if (req.body?.confirm !== true) {
    return sendError(
      res,
      400,
      'Confirmación requerida: envíe { "confirm": true } tras revisar la previsualización',
    );
  }

  const { desde, hacia } = resolucionPaseMes();
  if (!desde.periodo || !hacia.periodo || !hacia.mesInsert) {
    return sendError(res, 500, 'No se pudo calcular el código de Periodo');
  }

  const t = await sequelize.transaction();
  try {
    const repl = {
      mesDesde: desde.mes,
      anioDesde: desde.anio,
      mesHacia: hacia.mes,
      mesHaciaInsert: hacia.mesInsert,
      anioHacia: hacia.anio,
      periodoHacia: hacia.periodo,
      cursoExcluido: CURSO_EXCLUIDO_PASE_MES,
    };

    const [countBefore] = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM inscripciones_1 i3
       WHERE ${SQL_WHERE_PASE_MES}`,
      { replacements: repl, type: QueryTypes.SELECT, transaction: t },
    );
    const candidatos = Number(countBefore?.total || 0);
    if (candidatos < 1) {
      await t.commit();
      return sendSuccess(
        res,
        200,
        { insertados: 0, desde, hacia },
        'No hay inscripciones pendientes por pasar',
      );
    }

    // Un solo INSERT…SELECT atómico; UUID() evita UniqueID duplicados.
    const insertResult = await sequelize.query(
      `INSERT INTO inscripciones_1 (
          Tipo,
          validador_participante,
          Verificador_participante,
          validador_responsable,
          verificador_responsable,
          IDCurso,
          Transporte,
          Sede,
          Estado,
          \`Fecha_Inscripción\`,
          Mes,
          Periodo,
          UniqueID,
          \`año\`,
          Poliza,
          OBSERVACION,
          nombreCurso
       )
       SELECT
          i3.Tipo,
          i3.validador_participante,
          i3.Verificador_participante,
          i3.validador_responsable,
          i3.verificador_responsable,
          i3.IDCurso,
          i3.Transporte,
          i3.Sede,
          i3.Estado,
          i3.\`Fecha_Inscripción\`,
          :mesHaciaInsert,
          :periodoHacia,
          UUID(),
          :anioHacia,
          i3.Poliza,
          i3.OBSERVACION,
          i3.nombreCurso
       FROM inscripciones_1 i3
       WHERE ${SQL_WHERE_PASE_MES}`,
      { replacements: repl, type: QueryTypes.INSERT, transaction: t },
    );

    // Sequelize MySQL INSERT: [insertId, affectedRows] (a veces metadata.affectedRows).
    let insertados = candidatos;
    if (Array.isArray(insertResult)) {
      const maybeRows = Number(insertResult[1]?.affectedRows ?? insertResult[1]);
      if (Number.isFinite(maybeRows) && maybeRows >= 0) insertados = maybeRows;
    }

    await registrarAuditoria({
      req,
      accion: 'CREAR',
      modulo: GESTION_MODULOS.INSCRIPCIONES,
      entidad: 'pase_mes',
      entidadId: `${desde.anio}-${desde.mes}->${hacia.anio}-${hacia.mes}`,
      resumen: `Pasó ${insertados} inscripción(es) Tipo=1 de ${desde.mes}/${desde.anio} a ${hacia.mes}/${hacia.anio} (excl. curso ${CURSO_EXCLUIDO_PASE_MES})`,
      despues: { insertados, desde, hacia, cursoExcluido: CURSO_EXCLUIDO_PASE_MES },
    });

    await t.commit();
    return sendSuccess(
      res,
      200,
      { insertados, desde, hacia },
      `Se pasaron ${insertados} inscripción(es) a ${hacia.mes}/${hacia.anio}`,
    );
  } catch (error) {
    try {
      await t.rollback();
    } catch {
      /* ignore */
    }
    return handleError(res, error, 'Error al pasar inscripciones al mes siguiente');
  }
};

export const actualizarInscripcionGestion = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return sendError(res, 400, 'ID de inscripción inválido');
    }

    const antes = await snapshotInscripcion(id);
    if (!antes) return sendError(res, 404, 'Inscripción no encontrada');

    const [existing] = await sequelize.query(
      `SELECT IDInscripcion, Tipo, Estado, \`CAUSAL DE RETIRO\` AS CausalDeRetiro,
              \`FECHA RETIRO EXTRACLASE\` AS FechaRetiro,
              \`FECHA RETIRO TRANSPORTE\` AS FechaRetiroTransporte
       FROM inscripciones_1 WHERE IDInscripcion = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!existing) return sendError(res, 404, 'Inscripción no encontrada');

    const body = req.body || {};
    const sets = [];
    const repl = { id };

    const setIf = (columnSql, key, value) => {
      if (value === undefined) return;
      sets.push(`${columnSql} = :${key}`);
      repl[key] = value;
    };

    let estadoFinal = String(existing.Estado || '')
      .trim()
      .toUpperCase();
    if (body.estado !== undefined || body.Estado !== undefined) {
      const estado = String(body.estado ?? body.Estado ?? '')
        .trim()
        .toUpperCase();
      if (!ESTADOS_GESTION.includes(estado)) {
        return sendError(res, 400, `Estado inválido. Use: ${ESTADOS_GESTION.join(', ')}`);
      }
      estadoFinal = estado;
      setIf('Estado', 'estado', estado);
    }

    const causalIncoming =
      body.causalRetiro !== undefined || body.CausalDeRetiro !== undefined
        ? emptyToNull(body.causalRetiro ?? body.CausalDeRetiro)
        : undefined;
    const fechaRetiroIncoming =
      body.fechaRetiro !== undefined ||
      body.FechaRetiro !== undefined ||
      body.FechaRetiroExtraclase !== undefined
        ? emptyToNull(body.fechaRetiro ?? body.FechaRetiro ?? body.FechaRetiroExtraclase)
        : undefined;
    const fechaRetiroTransporteIncoming =
      body.fechaRetiroTransporte !== undefined || body.FechaRetiroTransporte !== undefined
        ? emptyToNull(body.fechaRetiroTransporte ?? body.FechaRetiroTransporte)
        : undefined;

    if (estadoFinal === 'RETIRADO') {
      const causalFinal =
        causalIncoming !== undefined ? causalIncoming : emptyToNull(existing.CausalDeRetiro);
      const fechaFinal =
        fechaRetiroIncoming !== undefined
          ? fechaRetiroIncoming
          : emptyToNull(existing.FechaRetiro);
      if (!causalFinal) {
        return sendError(
          res,
          400,
          'La causal de retiro es obligatoria cuando el estado es RETIRADO',
        );
      }
      if (!fechaFinal) {
        return sendError(
          res,
          400,
          'La fecha de retiro es obligatoria cuando el estado es RETIRADO',
        );
      }
    }

    if (body.sede !== undefined || body.Sede !== undefined) {
      setIf('Sede', 'sede', emptyToNull(body.sede ?? body.Sede));
    }
    if (body.transporte !== undefined || body.Transporte !== undefined) {
      setIf('Transporte', 'transporte', normalizeTransporte(body.transporte ?? body.Transporte));
    }
    if (body.mes !== undefined || body.Mes !== undefined) {
      const mesRaw = String(body.mes ?? body.Mes ?? '').trim();
      setIf('Mes', 'mes', mesRaw ? mesRaw.padStart(2, '0') : null);
    }
    if (body.anio !== undefined || body.año !== undefined) {
      setIf('año', 'anio', Number(body.anio ?? body.año));
    }
    if (body.observaciones !== undefined || body.OBSERVACION !== undefined) {
      setIf('OBSERVACION', 'observaciones', emptyToNull(body.observaciones ?? body.OBSERVACION));
    }
    if (body.observacionFacturacion !== undefined || body.Observacion_Facturacion !== undefined) {
      setIf(
        'Observacion_Facturacion',
        'observacionFacturacion',
        emptyToNull(body.observacionFacturacion ?? body.Observacion_Facturacion),
      );
    }
    if (causalIncoming !== undefined) {
      setIf('`CAUSAL DE RETIRO`', 'causalRetiro', estadoFinal === 'RETIRADO' ? causalIncoming : null);
    } else if (estadoFinal !== 'RETIRADO' && (body.estado !== undefined || body.Estado !== undefined)) {
      setIf('`CAUSAL DE RETIRO`', 'causalRetiro', null);
    }
    if (
      body.fechaIngresoNuevoTransporte !== undefined ||
      body.FechaIngresoNuevoTransporte !== undefined
    ) {
      setIf(
        '`FECHA INGRESO NUEVO TRANSPORTE`',
        'fechaIngreso',
        emptyToNull(body.fechaIngresoNuevoTransporte ?? body.FechaIngresoNuevoTransporte),
      );
    }
    if (fechaRetiroIncoming !== undefined) {
      setIf(
        '`FECHA RETIRO EXTRACLASE`',
        'fechaRetiro',
        estadoFinal === 'RETIRADO' ? fechaRetiroIncoming : null,
      );
    } else if (estadoFinal !== 'RETIRADO' && (body.estado !== undefined || body.Estado !== undefined)) {
      setIf('`FECHA RETIRO EXTRACLASE`', 'fechaRetiro', null);
    }
    if (fechaRetiroTransporteIncoming !== undefined) {
      setIf(
        '`FECHA RETIRO TRANSPORTE`',
        'fechaRetiroTransporte',
        fechaRetiroTransporteIncoming,
      );
    }
    if (body.idCurso !== undefined || body.IDCurso !== undefined) {
      setIf('IDCurso', 'idCurso', emptyToNull(body.idCurso ?? body.IDCurso));
    }
    if (body.documentoParticipante !== undefined || body.validador_participante !== undefined) {
      setIf(
        'validador_participante',
        'docParticipante',
        emptyToNull(body.documentoParticipante ?? body.validador_participante),
      );
    }
    if (body.documentoResponsable !== undefined || body.validador_responsable !== undefined) {
      setIf(
        'validador_responsable',
        'docResponsable',
        emptyToNull(body.documentoResponsable ?? body.validador_responsable),
      );
    }

    if (sets.length === 0 && !(body.camposExtra || Number(existing.Tipo) > 1)) {
      return sendError(res, 400, 'No hay campos para actualizar');
    }

    if (sets.length > 0) {
      await sequelize.query(
        `UPDATE inscripciones_1 SET ${sets.join(', ')} WHERE IDInscripcion = :id`,
        { replacements: repl, type: QueryTypes.UPDATE },
      );
    }

    const tipoIns = Number(existing.Tipo) || 1;
    if (tipoIns > 1) {
      await guardarValoresCamposTipo(tipoIns, id, body);
    }

    const despues = await snapshotInscripcion(id);
    const flatAntes = { ...antes, ...(antes?.camposExtra || {}) };
    delete flatAntes.camposExtra;
    const flatDespues = { ...despues, ...(despues?.camposExtra || {}) };
    delete flatDespues.camposExtra;
    const cambios = buildCambios(flatAntes, flatDespues);

    await registrarAuditoria({
      req,
      accion: 'EDITAR',
      modulo: tipoIns > 1 ? GESTION_MODULOS.OTROS : GESTION_MODULOS.INSCRIPCIONES,
      entidad: 'inscripcion',
      entidadId: id,
      resumen: resumenFromCambios(`Editó inscripción #${id}`, cambios),
      antes,
      despues,
      cambios,
    });

    return sendSuccess(res, 200, { id }, 'Inscripción actualizada');
  } catch (error) {
    return sendError(res, 500, 'Error al actualizar inscripción', error.message);
  }
};

export const eliminarInscripcionGestion = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return sendError(res, 400, 'ID de inscripción inválido');
    }

    const [existing] = await sequelize.query(
      `SELECT ${INSCRIPCION_AUDIT_SELECT}
       FROM inscripciones_1 WHERE IDInscripcion = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!existing) return sendError(res, 404, 'Inscripción no encontrada');

    const antes = await snapshotInscripcion(id);
    const tipoIns = Number(existing.tipo) || 1;
    await sequelize.query(`DELETE FROM inscripciones_1 WHERE IDInscripcion = :id`, {
      replacements: { id },
      type: QueryTypes.DELETE,
    });

    await registrarAuditoria({
      req,
      accion: 'ELIMINAR',
      modulo: tipoIns > 1 ? GESTION_MODULOS.OTROS : GESTION_MODULOS.INSCRIPCIONES,
      entidad: 'inscripcion',
      entidadId: id,
      resumen: `Eliminó inscripción #${id} · ${antes?.documentoParticipante || ''} · curso ${antes?.idCurso || ''} · ${antes?.estado || ''}`,
      antes,
    });

    return sendSuccess(res, 200, { id }, 'Inscripción eliminada');
  } catch (error) {
    return sendError(res, 500, 'Error al eliminar inscripción', error.message);
  }
};

export const actualizarParticipanteGestion = async (req, res) => {
  try {
    const doc = String(req.params.doc || '').trim();
    if (!doc) return sendError(res, 400, 'Documento requerido');

    const [existing] = await sequelize.query(
      `SELECT IDParticipante FROM participantes WHERE IDParticipante = :doc LIMIT 1`,
      { replacements: { doc }, type: QueryTypes.SELECT },
    );
    if (!existing) return sendError(res, 404, 'Participante no encontrado');

    const body = req.body || {};
    const sets = [];
    const repl = { doc };

    if (body.grupo !== undefined) {
      sets.push('Grupo = :grupo');
      repl.grupo = emptyToNull(body.grupo);
    }
    if (body.tipoDocumento !== undefined) {
      sets.push('Tipo_documento = :tipoDocumento');
      repl.tipoDocumento = emptyToNull(body.tipoDocumento);
    }
    if (body.internoExterno !== undefined) {
      sets.push('interno_externo = :internoExterno');
      repl.internoExterno = emptyToNull(body.internoExterno);
    }
    const hasNameParts =
      body.primerNombre !== undefined ||
      body.segundoNombre !== undefined ||
      body.primerApellido !== undefined ||
      body.segundoApellido !== undefined;
    if (hasNameParts) {
      const pn = emptyToNull(body.primerNombre);
      const sn = emptyToNull(body.segundoNombre);
      const pa = emptyToNull(body.primerApellido);
      const sa = emptyToNull(body.segundoApellido);
      if (body.primerNombre !== undefined) {
        sets.push('Primer_Nombre = :primerNombre');
        repl.primerNombre = pn;
      }
      if (body.segundoNombre !== undefined) {
        sets.push('Segundo_Nombre = :segundoNombre');
        repl.segundoNombre = sn;
      }
      if (body.primerApellido !== undefined) {
        sets.push('Primer_Apellido = :primerApellido');
        repl.primerApellido = pa;
      }
      if (body.segundoApellido !== undefined) {
        sets.push('Segundo_Apellido = :segundoApellido');
        repl.segundoApellido = sa;
      }
      const computed = [pn, sn, pa, sa].filter(Boolean).join(' ') || null;
      sets.push('Nombre_Completo = :nombreCompleto');
      repl.nombreCompleto = emptyToNull(body.nombreCompleto) || computed;
    } else if (body.nombreCompleto !== undefined) {
      sets.push('Nombre_Completo = :nombreCompleto');
      repl.nombreCompleto = emptyToNull(body.nombreCompleto);
    }
    if (body.fechaNacimiento !== undefined) {
      sets.push('Fecha_Nacimiento = :fechaNacimiento');
      repl.fechaNacimiento = emptyToNull(body.fechaNacimiento);
    }
    if (body.idResponsable !== undefined) {
      sets.push('IDResponsable = :idResponsable');
      repl.idResponsable = emptyToNull(body.idResponsable);
    }

    if (sets.length === 0) {
      return sendError(res, 400, 'No hay campos para actualizar');
    }

    await sequelize.query(`UPDATE participantes SET ${sets.join(', ')} WHERE IDParticipante = :doc`, {
      replacements: repl,
      type: QueryTypes.UPDATE,
    });

    await registrarAuditoria({
      req,
      accion: 'EDITAR',
      modulo: GESTION_MODULOS.PARTICIPANTES,
      entidad: 'participante',
      entidadId: doc,
      resumen: `Participante ${doc} actualizado`,
      despues: { ...repl },
    });

    return sendSuccess(res, 200, { documento: doc }, 'Participante actualizado');
  } catch (error) {
    return sendError(res, 500, 'Error al actualizar participante', error.message);
  }
};

export const actualizarResponsableGestion = async (req, res) => {
  try {
    const doc = String(req.params.doc || '').trim();
    if (!doc) return sendError(res, 400, 'Documento requerido');

    const [existing] = await sequelize.query(
      `SELECT IDResponsable FROM responsables WHERE IDResponsable = :doc LIMIT 1`,
      { replacements: { doc }, type: QueryTypes.SELECT },
    );
    if (!existing) return sendError(res, 404, 'Responsable no encontrado');

    const body = req.body || {};
    const sets = [];
    const repl = { doc };

    if (body.ciudad !== undefined) {
      sets.push('Ciudad = :ciudad');
      repl.ciudad = clip(body.ciudad, 15);
    }
    if (body.direccion !== undefined) {
      sets.push('direccion = :direccion');
      repl.direccion = clip(body.direccion, 41);
    }
    if (body.nombres !== undefined) {
      sets.push('Nombres = :nombres');
      repl.nombres = clip(body.nombres, 35);
    }
    if (body.apellidos !== undefined) {
      sets.push('Apellidos = :apellidos');
      repl.apellidos = clip(body.apellidos, 35);
    }
    if (body.nombres !== undefined || body.apellidos !== undefined || body.nombreCompleto !== undefined) {
      sets.push('Nombre_Completo = :nombreCompleto');
      repl.nombreCompleto = clip(
        emptyToNull(body.nombreCompleto) ||
          [emptyToNull(body.nombres), emptyToNull(body.apellidos)].filter(Boolean).join(' ') ||
          null,
        80,
      );
    }
    if (body.tipoIdentificacion !== undefined) {
      sets.push('tipo_identificacion = :tipoIdentificacion');
      repl.tipoIdentificacion = clip(body.tipoIdentificacion, 30);
    }
    if (body.tipoPersona !== undefined) {
      sets.push('Tipo_Persona = :tipoPersona');
      repl.tipoPersona = clip(body.tipoPersona, 15);
    }
    if (body.celular !== undefined) {
      sets.push('Celular_Responsable = :celular');
      repl.celular = clip(body.celular, 15);
    }
    if (body.correo !== undefined) {
      sets.push('Correo_Responsable = :correo');
      repl.correo = clip(body.correo, 100);
    }

    if (sets.length === 0) {
      return sendError(res, 400, 'No hay campos para actualizar');
    }

    await sequelize.query(`UPDATE responsables SET ${sets.join(', ')} WHERE IDResponsable = :doc`, {
      replacements: repl,
      type: QueryTypes.UPDATE,
    });

    await registrarAuditoria({
      req,
      accion: 'EDITAR',
      modulo: GESTION_MODULOS.RESPONSABLES,
      entidad: 'responsable',
      entidadId: doc,
      resumen: `Responsable ${doc} actualizado`,
      despues: { ...repl },
    });

    return sendSuccess(res, 200, { documento: doc }, 'Responsable actualizado');
  } catch (error) {
    return sendError(res, 500, 'Error al actualizar responsable', error.message);
  }
};

export const listarCausalesGestion = async (_req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT TRIM(\`CAUSAL DE RETIRO\`) AS causal, COUNT(*) AS total
       FROM inscripciones_1
       WHERE \`CAUSAL DE RETIRO\` IS NOT NULL AND TRIM(\`CAUSAL DE RETIRO\`) <> ''
       GROUP BY TRIM(\`CAUSAL DE RETIRO\`)
       ORDER BY total DESC, causal ASC
       LIMIT 100`,
      { type: QueryTypes.SELECT },
    );
    const fromDb = rows.map((r) => String(r.causal || '').trim()).filter(Boolean);
    const merged = [...new Set([...CAUSALES_BASE, ...fromDb])].sort((a, b) =>
      a.localeCompare(b, 'es'),
    );
    return sendSuccess(res, 200, { causales: merged }, 'Causales obtenidas');
  } catch (error) {
    return sendError(res, 500, 'Error al listar causales', error.message);
  }
};

/** Años / conteos de mes y estado para filtros de gestión (respeta filtros activos). */
export const metaFiltrosGestion = async (req, res) => {
  try {
    const { anio: anioBogota } = anioMesBogota();
    const anioSel = /^\d{4}$/.test(String(req.query.anio || '').trim())
      ? Number(req.query.anio)
      : anioBogota;
    const excludeTipo1 = String(req.query.excludeTipo1 || '').toLowerCase() === 'true';

    const runFacet = async (omit, extraClauses = [], selectSql, groupOrderSql) => {
      const f = buildListFilters(req.query, { omit });
      const joins = metaFromSqlJoins(f);
      // Facetas de curso/actividad siempre necesitan join a cursos.
      const forceCurso =
        /c\.|actividades/.test(selectSql) || /c\.|actividades/.test(groupOrderSql);
      const joinSql = [
        forceCurso && !f.needsCursoJoin ? 'LEFT JOIN cursos_2025 c ON c.ID_Curso = i.IDCurso' : '',
        joins,
      ]
        .filter(Boolean)
        .join('\n       ');
      const whereSql = [...f.clauses, ...extraClauses].join(' AND ');
      return sequelize.query(
        `SELECT ${selectSql}
         FROM inscripciones_1 i
         ${joinSql}
         WHERE ${whereSql}
         ${groupOrderSql}`,
        { replacements: f.repl, type: QueryTypes.SELECT },
      );
    };

    const anios = await runFacet(
      ['anio', 'mes'],
      ['i.`año` IS NOT NULL'],
      'CAST(i.`año` AS UNSIGNED) AS anio, COUNT(*) AS total',
      'GROUP BY CAST(i.`año` AS UNSIGNED) ORDER BY anio DESC',
    );

    const meses = excludeTipo1
      ? []
      : await runFacet(
          ['mes'],
          ["i.Mes IS NOT NULL", "TRIM(i.Mes) <> ''"],
          "LPAD(TRIM(i.Mes), 2, '0') AS mes, COUNT(*) AS total",
          "GROUP BY LPAD(TRIM(i.Mes), 2, '0') ORDER BY mes ASC",
        );

    const estados = await runFacet(
      ['estado'],
      ['i.Estado IS NOT NULL', "TRIM(i.Estado) <> ''"],
      'UPPER(TRIM(i.Estado)) AS estado, COUNT(*) AS total',
      'GROUP BY UPPER(TRIM(i.Estado)) ORDER BY estado ASC',
    );

    const cursosConteo = await runFacet(
      ['idCurso'],
      ['i.IDCurso IS NOT NULL', "TRIM(i.IDCurso) <> ''"],
      `TRIM(i.IDCurso) AS id,
       COALESCE(NULLIF(c.Nombre_del_curso, ''), NULLIF(i.nombreCurso, ''), TRIM(i.IDCurso)) AS nombre,
       c.Actividad AS actividadId,
       COUNT(*) AS total`,
      `GROUP BY
         TRIM(i.IDCurso),
         COALESCE(NULLIF(c.Nombre_del_curso, ''), NULLIF(i.nombreCurso, ''), TRIM(i.IDCurso)),
         c.Actividad
       ORDER BY nombre ASC`,
    );

    const actFilters = buildListFilters(req.query, { omit: ['actividad'] });
    const actJoins = [
      'LEFT JOIN cursos_2025 c ON c.ID_Curso = i.IDCurso',
      actFilters.needsParticipanteJoin
        ? 'LEFT JOIN participantes p ON p.IDParticipante = i.validador_participante'
        : '',
      'INNER JOIN actividades a ON a.IDActividad = c.Actividad',
    ]
      .filter(Boolean)
      .join('\n       ');
    const actividadesRows = await sequelize.query(
      `SELECT
         a.IDActividad AS id,
         a.Nombre_Actividad AS nombre,
         COUNT(*) AS total
       FROM inscripciones_1 i
       ${actJoins}
       WHERE ${[...actFilters.clauses, 'c.Actividad IS NOT NULL'].join(' AND ')}
       GROUP BY a.IDActividad, a.Nombre_Actividad
       ORDER BY a.Nombre_Actividad ASC`,
      { replacements: actFilters.repl, type: QueryTypes.SELECT },
    );

    return sendSuccess(
      res,
      200,
      {
        anios: anios.map((r) => ({ anio: Number(r.anio), total: Number(r.total || 0) })),
        meses: meses.map((r) => ({ mes: r.mes, total: Number(r.total || 0) })),
        estados: estados.map((r) => ({ estado: r.estado, total: Number(r.total || 0) })),
        cursos: cursosConteo.map((r) => ({
          id: r.id,
          nombre: r.nombre,
          total: Number(r.total || 0),
          actividadId:
            r.actividadId != null && String(r.actividadId).trim() !== ''
              ? String(r.actividadId)
              : null,
        })),
        actividades: actividadesRows.map((r) => ({
          id: String(r.id),
          nombre: r.nombre,
          total: Number(r.total || 0),
        })),
        anioSeleccionado: anioSel,
      },
      'Meta de filtros obtenida',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al obtener meta de filtros', error.message);
  }
};

export const listarParticipantesGestion = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, 40);
    const offset = (page - 1) * limit;
    const clauses = ['1=1'];
    const repl = {};
    if (q) {
      clauses.push(
        `(p.IDParticipante LIKE :searchQ OR p.Nombre_Completo LIKE :searchQ OR p.Grupo LIKE :searchQ)`,
      );
      repl.searchQ = `%${q}%`;
    }
    const whereSql = clauses.join(' AND ');
    const [countRow] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM participantes p WHERE ${whereSql}`,
      { replacements: repl, type: QueryTypes.SELECT },
    );
    const rows = await sequelize.query(
      `SELECT
         p.IDParticipante AS documento,
         p.Nombre_Completo AS nombreCompleto,
         p.Grupo AS grupo,
         p.Fecha_Nacimiento AS fechaNacimiento,
         p.IDResponsable AS idResponsable,
         r.Nombre_Completo AS nombreResponsable
       FROM participantes p
       LEFT JOIN responsables r ON r.IDResponsable = p.IDResponsable
       WHERE ${whereSql}
       ORDER BY p.Nombre_Completo ASC
       LIMIT ${limit} OFFSET ${offset}`,
      { replacements: repl, type: QueryTypes.SELECT },
    );
    const total = Number(countRow?.total || 0);
    return sendSuccess(
      res,
      200,
      {
        participantes: rows,
        meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      },
      'Participantes obtenidos',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar participantes', error.message);
  }
};

export const listarResponsablesGestion = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, 40);
    const offset = (page - 1) * limit;
    const clauses = ['1=1'];
    const repl = {};
    if (q) {
      clauses.push(
        `(IDResponsable LIKE :searchQ OR Nombre_Completo LIKE :searchQ OR Correo_Responsable LIKE :searchQ OR Celular_Responsable LIKE :searchQ)`,
      );
      repl.searchQ = `%${q}%`;
    }
    const whereSql = clauses.join(' AND ');
    const [countRow] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM responsables WHERE ${whereSql}`,
      { replacements: repl, type: QueryTypes.SELECT },
    );

    let rows;
    try {
      rows = await sequelize.query(
        `SELECT
           IDResponsable AS documento,
           Nombre_Completo AS nombreCompleto,
           Nombres AS nombres,
           Apellidos AS apellidos,
           Celular_Responsable AS celular,
           Correo_Responsable AS correo,
           Ciudad AS ciudad,
           direccion AS direccion,
           tipo_identificacion AS tipoIdentificacion,
           Tipo_Persona AS tipoPersona
         FROM responsables
         WHERE ${whereSql}
         ORDER BY Nombre_Completo ASC
         LIMIT ${limit} OFFSET ${offset}`,
        { replacements: repl, type: QueryTypes.SELECT },
      );
    } catch {
      rows = await sequelize.query(
        `SELECT
           IDResponsable AS documento,
           Nombre_Completo AS nombreCompleto,
           Celular_Responsable AS celular,
           Correo_Responsable AS correo
         FROM responsables
         WHERE ${whereSql}
         ORDER BY Nombre_Completo ASC
         LIMIT ${limit} OFFSET ${offset}`,
        { replacements: repl, type: QueryTypes.SELECT },
      );
    }
    const total = Number(countRow?.total || 0);
    return sendSuccess(
      res,
      200,
      {
        responsables: rows,
        meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      },
      'Responsables obtenidos',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar responsables', error.message);
  }
};

export const crearParticipanteGestion = async (req, res) => {
  try {
    const body = req.body || {};
    const doc = String(body.documento || '').trim();
    if (!doc) return sendError(res, 400, 'Documento requerido');
    const nombreCompleto = emptyToNull(body.nombreCompleto);
    const primerNombre = emptyToNull(body.primerNombre);
    const segundoNombre = emptyToNull(body.segundoNombre);
    const primerApellido = emptyToNull(body.primerApellido);
    const segundoApellido = emptyToNull(body.segundoApellido);
    const computed =
      nombreCompleto ||
      [primerNombre, segundoNombre, primerApellido, segundoApellido].filter(Boolean).join(' ') ||
      null;

    const [yaExiste] = await sequelize.query(
      `SELECT IDParticipante AS documento FROM participantes WHERE IDParticipante = :doc LIMIT 1`,
      { replacements: { doc }, type: QueryTypes.SELECT },
    );
    if (yaExiste) {
      return sendError(res, 409, `Ya existe un participante con documento ${doc}`);
    }

    await sequelize.query(
      `INSERT INTO participantes
        (IDParticipante, Tipo_documento, IDResponsable, Primer_Nombre, Segundo_Nombre,
         Primer_Apellido, Segundo_Apellido, Nombre_Completo, Fecha_Nacimiento, interno_externo, Grupo)
       VALUES
        (:doc, :tipoDoc, :idResp, :pn, :sn, :pa, :sa, :nombre, :fn, :ie, :grupo)`,
      {
        replacements: {
          doc: clip(doc, 20),
          tipoDoc: clip(body.tipoDocumento, 40),
          idResp: clip(body.idResponsable, 20),
          pn: clip(primerNombre, 40),
          sn: clip(segundoNombre, 40),
          pa: clip(primerApellido, 40),
          sa: clip(segundoApellido, 40),
          nombre: clip(computed, 120),
          fn: emptyToNull(body.fechaNacimiento) ?? null,
          ie: clip(body.internoExterno, 20),
          grupo: clip(body.grupo, 40),
        },
        type: QueryTypes.INSERT,
      },
    );
    await registrarAuditoria({
      req,
      accion: 'CREAR',
      modulo: GESTION_MODULOS.PARTICIPANTES,
      entidad: 'participante',
      entidadId: doc,
      resumen: `Participante ${doc} creado`,
      despues: { documento: doc, nombreCompleto: computed },
    });
    return sendSuccess(res, 201, { documento: doc }, 'Participante creado');
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendError(res, 409, 'Ya existe un participante con ese documento', error.message);
    }
    return handleError(res, error, 'Error al crear participante');
  }
};

export const crearResponsableGestion = async (req, res) => {
  try {
    const body = req.body || {};
    const doc = String(body.documento || '').trim();
    if (!doc) return sendError(res, 400, 'Documento requerido');
    const nombres = emptyToNull(body.nombres);
    const apellidos = emptyToNull(body.apellidos);
    const nombreCompleto =
      emptyToNull(body.nombreCompleto) ||
      [nombres, apellidos].filter(Boolean).join(' ') ||
      null;

    const [yaExiste] = await sequelize.query(
      `SELECT IDResponsable AS documento FROM responsables WHERE IDResponsable = :doc LIMIT 1`,
      { replacements: { doc }, type: QueryTypes.SELECT },
    );
    if (yaExiste) {
      return sendError(res, 409, `Ya existe un responsable con documento ${doc}`);
    }

    await sequelize.query(
      `INSERT INTO responsables
        (IDResponsable, Nombres, Apellidos, Nombre_Completo, Correo_Responsable,
         Celular_Responsable, Tipo_Persona, Ciudad, direccion, tipo_identificacion)
       VALUES
        (:doc, :nombres, :apellidos, :nombre, :correo, :celular, :tipoPersona, :ciudad, :direccion, :tipoId)`,
      {
        replacements: {
          doc: clip(doc, 20),
          nombres: clip(nombres, 35),
          apellidos: clip(apellidos, 35),
          nombre: clip(nombreCompleto, 80),
          correo: clip(body.correo, 100),
          celular: clip(body.celular, 15),
          // Columna Tipo_Persona es varchar(15): "Persona Jurídica" no cabe
          tipoPersona: clip(body.tipoPersona, 15),
          ciudad: clip(body.ciudad, 15),
          direccion: clip(body.direccion, 41),
          tipoId: clip(body.tipoIdentificacion, 30),
        },
        type: QueryTypes.INSERT,
      },
    );
    await registrarAuditoria({
      req,
      accion: 'CREAR',
      modulo: GESTION_MODULOS.RESPONSABLES,
      entidad: 'responsable',
      entidadId: doc,
      resumen: `Responsable ${doc} creado`,
      despues: { documento: doc, nombreCompleto },
    });
    return sendSuccess(res, 201, { documento: doc }, 'Responsable creado');
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendError(res, 409, 'Ya existe un responsable con ese documento', error.message);
    }
    return handleError(res, error, 'Error al crear responsable');
  }
};

const dayValue = (v) => {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'X' || s === 'SI' || s === '1' || s === 'TRUE' ? 'X' : null;
};

export const listarActividadesCatalogo = async (_req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT IDActividad AS id, Nombre_Actividad AS nombre, ESTADO AS estado
       FROM actividades
       WHERE ESTADO = 'ACTIVO' OR ESTADO IS NULL OR ESTADO = ''
       ORDER BY Nombre_Actividad ASC`,
      { type: QueryTypes.SELECT },
    );
    return sendSuccess(res, 200, { actividades: rows }, 'Actividades obtenidas');
  } catch (error) {
    return sendError(res, 500, 'Error al listar actividades', error.message);
  }
};

export const listarDepartamentosCatalogo = async (_req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT TRIM(Depto) AS codigo, TRIM(Nombre_Dpto) AS nombre
       FROM ciudades
       WHERE Depto IS NOT NULL AND TRIM(Depto) <> ''
         AND Nombre_Dpto IS NOT NULL AND TRIM(Nombre_Dpto) <> ''
       GROUP BY TRIM(Depto), TRIM(Nombre_Dpto)
       ORDER BY nombre ASC`,
      { type: QueryTypes.SELECT },
    );
    return sendSuccess(
      res,
      200,
      {
        departamentos: rows.map((r) => ({
          codigo: String(r.codigo),
          nombre: String(r.nombre),
        })),
      },
      'Departamentos obtenidos',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar departamentos', error.message);
  }
};

export const listarCiudadesCatalogo = async (req, res) => {
  try {
    const depto = String(req.query.depto || '').trim();
    const clauses = ['Ciudad IS NOT NULL', "TRIM(Ciudad) <> ''"];
    const repl = {};
    if (depto) {
      clauses.push('TRIM(Depto) = :depto');
      repl.depto = depto;
    }
    const rows = await sequelize.query(
      `SELECT TRIM(Ciudad) AS codigo,
              TRIM(Nombre_Ciudad) AS nombre,
              TRIM(Depto) AS depto,
              TRIM(Nombre_Dpto) AS nombreDepto
       FROM ciudades
       WHERE ${clauses.join(' AND ')}
       ORDER BY Nombre_Ciudad ASC`,
      { replacements: repl, type: QueryTypes.SELECT },
    );
    return sendSuccess(
      res,
      200,
      {
        ciudades: rows.map((r) => ({
          codigo: String(r.codigo),
          nombre: String(r.nombre),
          depto: String(r.depto || ''),
          nombreDepto: String(r.nombreDepto || ''),
        })),
      },
      'Ciudades obtenidas',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al listar ciudades', error.message);
  }
};

export const listarLineasCatalogo = async (_req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT IDLinea AS id, Nombre_Linea AS nombre
       FROM linea
       ORDER BY Nombre_Linea ASC`,
      { type: QueryTypes.SELECT },
    );
    return sendSuccess(res, 200, { lineas: rows }, 'Líneas obtenidas');
  } catch (error) {
    return sendError(res, 500, 'Error al listar líneas', error.message);
  }
};

export const listarEntrenadoresCatalogo = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const clauses = ['1=1'];
    const repl = {};
    if (q) {
      clauses.push(`(ID LIKE :searchQ OR Nombre_Docente LIKE :searchQ OR Correo LIKE :searchQ)`);
      repl.searchQ = `%${q}%`;
    }
    const rows = await sequelize.query(
      `SELECT ID AS id, Nombre_Docente AS nombre, Correo AS correo
       FROM entrenadores
       WHERE ${clauses.join(' AND ')}
       ORDER BY Nombre_Docente ASC
       LIMIT 200`,
      { replacements: repl, type: QueryTypes.SELECT },
    );
    return sendSuccess(res, 200, { entrenadores: rows }, 'Entrenadores obtenidos');
  } catch (error) {
    return sendError(res, 500, 'Error al listar entrenadores', error.message);
  }
};

export const actualizarCursoGestion = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return sendError(res, 400, 'ID de curso requerido');
    const [existing] = await sequelize.query(
      `SELECT ID_Curso FROM cursos_2025 WHERE ID_Curso = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!existing) return sendError(res, 404, 'Curso no encontrado');

    const body = req.body || {};
    const sets = [];
    const repl = { id };
    const map = [
      ['nombre', 'Nombre_del_curso', 'nombre'],
      ['nombreCorto', 'Nombre_Corto_Curso', 'nombreCorto'],
      ['tarifa', 'Tarifa_Curso', 'tarifa'],
      ['codigoFacturacion', 'Codigo_Facturacion', 'codigoFacturacion'],
      ['sede', 'Sede', 'sede'],
      ['estado', 'Estado_del_curso', 'estado'],
      ['docente', 'Docente', 'docente'],
    ];
    for (const [bodyKey, col, replKey] of map) {
      if (body[bodyKey] !== undefined) {
        sets.push(`${col} = :${replKey}`);
        repl[replKey] = emptyToNull(body[bodyKey]);
      }
    }
    if (body.tipo !== undefined) {
      sets.push('Tipo = :tipo');
      repl.tipo = Number(body.tipo);
    }
    if (body.actividad !== undefined) {
      sets.push('Actividad = :actividad');
      repl.actividad = body.actividad === '' || body.actividad == null ? null : Number(body.actividad);
    }
    if (body.linea !== undefined) {
      sets.push('Linea = :linea');
      repl.linea = body.linea === '' || body.linea == null ? null : Number(body.linea);
    }

    const dayMap = [
      ['lunes', 'Lunes', 'lunes'],
      ['martes', 'Martes', 'martes'],
      ['miercoles', '`Miércoles`', 'miercoles'],
      ['jueves', 'Jueves', 'jueves'],
      ['viernes', 'Viernes', 'viernes'],
      ['sabado', '`SÁBADO`', 'sabado'],
    ];
    for (const [bodyKey, col, replKey] of dayMap) {
      if (body[bodyKey] !== undefined) {
        sets.push(`${col} = :${replKey}`);
        repl[replKey] = dayValue(body[bodyKey]);
      }
    }

    if (sets.length === 0) return sendError(res, 400, 'No hay campos para actualizar');

    await sequelize.query(`UPDATE cursos_2025 SET ${sets.join(', ')} WHERE ID_Curso = :id`, {
      replacements: repl,
      type: QueryTypes.UPDATE,
    });
    await registrarAuditoria({
      req,
      accion: 'EDITAR',
      modulo: GESTION_MODULOS.CURSOS,
      entidad: 'curso',
      entidadId: id,
      resumen: `Curso ${id} actualizado`,
      despues: { ...repl },
    });
    return sendSuccess(res, 200, { id }, 'Curso actualizado');
  } catch (error) {
    return sendError(res, 500, 'Error al actualizar curso', error.message);
  }
};

export const crearCursoGestion = async (req, res) => {
  try {
    const body = req.body || {};
    const id = String(body.id || body.ID_Curso || '').trim();
    const nombre = emptyToNull(body.nombre);
    if (!id || !nombre) return sendError(res, 400, 'ID y nombre del curso son obligatorios');

    await sequelize.query(
      `INSERT INTO cursos_2025
        (ID_Curso, Nombre_del_curso, Nombre_Corto_Curso, Tipo, Estado_del_curso, Sede,
         Tarifa_Curso, Codigo_Facturacion, Actividad, Docente, Linea,
         Lunes, Martes, \`Miércoles\`, Jueves, Viernes, \`SÁBADO\`)
       VALUES
        (:id, :nombre, :nombreCorto, :tipo, :estado, :sede, :tarifa, :codigo, :actividad, :docente, :linea,
         :lunes, :martes, :miercoles, :jueves, :viernes, :sabado)`,
      {
        replacements: {
          id,
          nombre,
          nombreCorto: emptyToNull(body.nombreCorto) ?? null,
          tipo: Number(body.tipo || 1),
          estado: emptyToNull(body.estado) || 'ACTIVO',
          sede: emptyToNull(body.sede) ?? null,
          tarifa: emptyToNull(body.tarifa) ?? null,
          codigo: emptyToNull(body.codigoFacturacion) ?? null,
          actividad: body.actividad != null && body.actividad !== '' ? Number(body.actividad) : null,
          docente: emptyToNull(body.docente) ?? null,
          linea: body.linea != null && body.linea !== '' ? Number(body.linea) : null,
          lunes: dayValue(body.lunes),
          martes: dayValue(body.martes),
          miercoles: dayValue(body.miercoles),
          jueves: dayValue(body.jueves),
          viernes: dayValue(body.viernes),
          sabado: dayValue(body.sabado),
        },
        type: QueryTypes.INSERT,
      },
    );
    await registrarAuditoria({
      req,
      accion: 'CREAR',
      modulo: GESTION_MODULOS.CURSOS,
      entidad: 'curso',
      entidadId: id,
      resumen: `Curso ${id} creado · ${nombre}`,
      despues: { id, nombre, tipo: Number(body.tipo || 1) },
    });
    return sendSuccess(res, 201, { id }, 'Curso creado');
  } catch (error) {
    return sendError(res, 500, 'Error al crear curso', error.message);
  }
};