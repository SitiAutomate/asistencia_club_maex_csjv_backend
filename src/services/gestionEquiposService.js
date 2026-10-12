import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';

let tablesCache = { checkedAt: 0, ok: false };

async function equiposTablesReady() {
  const now = Date.now();
  if (now - tablesCache.checkedAt < 60_000) return tablesCache.ok;
  try {
    const rows = await sequelize.query(
      `SELECT TABLE_NAME AS name
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('equipos', 'equipo_deportistas')`,
      { type: QueryTypes.SELECT },
    );
    const names = new Set(rows.map((r) => String(r.name || '').toLowerCase()));
    tablesCache = { checkedAt: now, ok: names.has('equipos') && names.has('equipo_deportistas') };
  } catch {
    tablesCache = { checkedAt: now, ok: false };
  }
  return tablesCache.ok;
}

/** Resumen rápido desde OBSERVACION JSON (no sustituye tablas). */
export function parseResumenEquiposDesdeObs(obs) {
  const raw = String(obs ?? '').trim();
  if (!raw || raw[0] !== '{') return null;
  try {
    const data = JSON.parse(raw);
    const modo = String(data?.modo || '').toLowerCase();
    const esEquipos =
      modo.includes('equipos') ||
      Array.isArray(data?.equipos) ||
      Number(data?.total_equipos) > 0;
    if (!esEquipos) return null;
    const lista = Array.isArray(data.equipos)
      ? data.equipos.map((e) => (typeof e === 'string' ? e : e?.nombre || e?.nombre_equipo || '')).filter(Boolean)
      : [];
    return {
      evento: data.evento || null,
      modo: data.modo || null,
      totalEquipos: Number(data.total_equipos) || lista.length || 0,
      equiposCortos: lista,
      fuente: 'observacion',
    };
  } catch {
    return null;
  }
}

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return row[k];
  }
  return null;
}

function mapEquipoRow(row) {
  return {
    id: Number(row.IDEquipo ?? row.idEquipo ?? row.id) || null,
    idInscripcion: Number(row.IDInscripcion ?? row.idInscripcion) || null,
    idCurso: pick(row, 'IDCurso', 'idCurso') || null,
    nombre: pick(row, 'nombre_equipo', 'nombreEquipo', 'nombre') || 'Equipo',
    categoria: pick(row, 'categoria') || null,
    disciplina: pick(row, 'disciplina') || null,
    rama: pick(row, 'rama') || null,
    entrenador: {
      nombre: pick(row, 'entrenador_nombre', 'entrenadorNombre') || null,
      documento: pick(row, 'entrenador_documento', 'entrenadorDocumento') || null,
      celular: pick(row, 'entrenador_celular', 'entrenadorCelular') || null,
    },
    asistente: {
      nombre: pick(row, 'asistente_nombre', 'asistenteNombre') || null,
      documento: pick(row, 'asistente_documento', 'asistenteDocumento') || null,
      celular: pick(row, 'asistente_celular', 'asistenteCelular') || null,
    },
    deportistas: [],
  };
}

function mapDeportistaRow(row) {
  return {
    id: Number(row.IDDeportista ?? row.idDeportista ?? row.id) || null,
    orden: Number(row.orden ?? 0) || 0,
    nombreCompleto: pick(row, 'nombre_completo', 'nombreCompleto', 'nombre') || '—',
    documento: pick(row, 'documento') || null,
    fechaNacimiento: pick(row, 'fecha_nacimiento', 'fechaNacimiento') || null,
  };
}

/**
 * Carga equipos + deportistas de una inscripción.
 * Si las tablas no existen o están vacías, usa el resumen de OBSERVACION.
 */
export async function cargarEquiposInscripcion({ idInscripcion, observacion, modalidad } = {}) {
  const id = Number(idInscripcion);
  const resumenObs = parseResumenEquiposDesdeObs(observacion);
  const modalidadEquipos = String(modalidad || '').trim().toLowerCase() === 'equipos';

  if (!Number.isInteger(id) || id < 1) {
    return {
      esEquipos: modalidadEquipos || Boolean(resumenObs),
      resumen: resumenObs,
      equipos: [],
      fuente: resumenObs ? 'observacion' : null,
    };
  }

  const ready = await equiposTablesReady();
  if (ready) {
    try {
      const equipoRows = await sequelize.query(
        `SELECT *
         FROM equipos
         WHERE IDInscripcion = :id
         ORDER BY IDEquipo ASC`,
        { replacements: { id }, type: QueryTypes.SELECT },
      );

      if (equipoRows.length) {
        const equipos = equipoRows.map(mapEquipoRow);
        const ids = equipos.map((e) => e.id).filter(Boolean);
        if (ids.length) {
          const deps = await sequelize.query(
            `SELECT *
             FROM equipo_deportistas
             WHERE IDEquipo IN (:ids)
             ORDER BY IDEquipo ASC, orden ASC, IDDeportista ASC`,
            { replacements: { ids }, type: QueryTypes.SELECT },
          );
          const byEquipo = new Map();
          for (const d of deps) {
            const eqId = Number(d.IDEquipo ?? d.idEquipo);
            if (!byEquipo.has(eqId)) byEquipo.set(eqId, []);
            byEquipo.get(eqId).push(mapDeportistaRow(d));
          }
          for (const eq of equipos) {
            eq.deportistas = byEquipo.get(eq.id) || [];
          }
        }
        return {
          esEquipos: true,
          resumen: resumenObs,
          equipos,
          fuente: 'tablas',
        };
      }
    } catch {
      // Si el esquema difiere, cae al resumen.
    }
  }

  // Fallback: armar “equipos” livianos desde OBSERVACION para la UI.
  if (resumenObs) {
    const equipos = (resumenObs.equiposCortos || []).map((nombre, idx) => ({
      id: null,
      idInscripcion: id,
      idCurso: null,
      nombre,
      categoria: null,
      disciplina: null,
      rama: null,
      entrenador: { nombre: null, documento: null, celular: null },
      asistente: { nombre: null, documento: null, celular: null },
      deportistas: [],
      resumenSolo: true,
    }));
    return {
      esEquipos: true,
      resumen: resumenObs,
      equipos,
      fuente: 'observacion',
    };
  }

  return {
    esEquipos: modalidadEquipos,
    resumen: null,
    equipos: [],
    fuente: null,
  };
}

/** Para listados: marca y conteo sin JOIN pesado. */
export function resumenEquiposListRow({ modalidad, observacion } = {}) {
  const resumen = parseResumenEquiposDesdeObs(observacion);
  const esEquipos =
    String(modalidad || '').trim().toLowerCase() === 'equipos' || Boolean(resumen);
  if (!esEquipos) {
    return { esEquipos: false, totalEquipos: 0, eventoEquipos: null };
  }
  return {
    esEquipos: true,
    totalEquipos: resumen?.totalEquipos || 0,
    eventoEquipos: resumen?.evento || null,
  };
}

/**
 * Filas planas para Excel: una fila por deportista (o por equipo si no hay miembros).
 * @param {Array<{ id, esEquipos, modalidad, observaciones, organizacion, club, documentoResponsable, nombreResponsable, documentoParticipante, nombreParticipante, idCurso, nombreCurso, eventoEquipos }>} inscripciones
 */
export async function construirFilasExportEquipos(inscripciones = []) {
  const list = (inscripciones || []).filter(
    (r) =>
      r?.esEquipos ||
      String(r?.modalidad || '').trim().toLowerCase() === 'equipos' ||
      Boolean(parseResumenEquiposDesdeObs(r?.observaciones)),
  );
  if (!list.length) return [];

  const equiposByInsc = new Map();
  const depsByEquipo = new Map();
  const ready = await equiposTablesReady();

  if (ready) {
    try {
      const ids = [...new Set(list.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0))];
      if (ids.length) {
        const equipoRows = await sequelize.query(
          `SELECT *
           FROM equipos
           WHERE IDInscripcion IN (:ids)
           ORDER BY IDInscripcion ASC, IDEquipo ASC`,
          { replacements: { ids }, type: QueryTypes.SELECT },
        );
        const mappedEquipos = equipoRows.map(mapEquipoRow);
        for (const eq of mappedEquipos) {
          if (!equiposByInsc.has(eq.idInscripcion)) equiposByInsc.set(eq.idInscripcion, []);
          equiposByInsc.get(eq.idInscripcion).push(eq);
        }
        const eqIds = mappedEquipos.map((e) => e.id).filter(Boolean);
        if (eqIds.length) {
          const deps = await sequelize.query(
            `SELECT *
             FROM equipo_deportistas
             WHERE IDEquipo IN (:eqIds)
             ORDER BY IDEquipo ASC, orden ASC, IDDeportista ASC`,
            { replacements: { eqIds }, type: QueryTypes.SELECT },
          );
          for (const d of deps) {
            const eqId = Number(d.IDEquipo ?? d.idEquipo);
            if (!depsByEquipo.has(eqId)) depsByEquipo.set(eqId, []);
            depsByEquipo.get(eqId).push(mapDeportistaRow(d));
          }
        }
      }
    } catch {
      // fallback a observación
    }
  }

  const out = [];
  for (const insc of list) {
    const base = {
      idInscripcion: insc.id,
      documentoResponsable: insc.documentoResponsable || insc.documentoParticipante || '',
      nombreResponsable: insc.nombreResponsable || insc.nombreParticipante || '',
      organizacion: insc.organizacion || insc.club || '',
      evento: insc.eventoEquipos || parseResumenEquiposDesdeObs(insc.observaciones)?.evento || '',
      idCurso: insc.idCurso || '',
      nombreCurso: insc.nombreCurso || '',
    };

    const equipos = equiposByInsc.get(Number(insc.id)) || [];
    if (equipos.length) {
      for (const eq of equipos) {
        const deps = depsByEquipo.get(eq.id) || [];
        const equipoBase = {
          ...base,
          idEquipo: eq.id,
          nombreEquipo: eq.nombre || '',
          disciplina: eq.disciplina || '',
          rama: eq.rama || '',
          categoria: eq.categoria || '',
          entrenador: eq.entrenador?.nombre || '',
          entrenadorDocumento: eq.entrenador?.documento || '',
          asistente: eq.asistente?.nombre || '',
          asistenteDocumento: eq.asistente?.documento || '',
        };
        if (deps.length) {
          for (const d of deps) {
            out.push({
              ...equipoBase,
              orden: d.orden || '',
              deportista: d.nombreCompleto || '',
              documentoDeportista: d.documento || '',
              fechaNacimiento: d.fechaNacimiento || '',
            });
          }
        } else {
          out.push({
            ...equipoBase,
            orden: '',
            deportista: '',
            documentoDeportista: '',
            fechaNacimiento: '',
          });
        }
      }
      continue;
    }

    const resumen = parseResumenEquiposDesdeObs(insc.observaciones);
    const nombres = resumen?.equiposCortos || [];
    if (!nombres.length) {
      out.push({
        ...base,
        idEquipo: '',
        nombreEquipo: '',
        disciplina: '',
        rama: '',
        categoria: '',
        entrenador: '',
        entrenadorDocumento: '',
        asistente: '',
        asistenteDocumento: '',
        orden: '',
        deportista: '',
        documentoDeportista: '',
        fechaNacimiento: '',
      });
      continue;
    }
    for (const nombre of nombres) {
      out.push({
        ...base,
        evento: base.evento || resumen?.evento || '',
        idEquipo: '',
        nombreEquipo: nombre,
        disciplina: '',
        rama: '',
        categoria: '',
        entrenador: '',
        entrenadorDocumento: '',
        asistente: '',
        asistenteDocumento: '',
        orden: '',
        deportista: '',
        documentoDeportista: '',
        fechaNacimiento: '',
      });
    }
  }

  return out;
}
