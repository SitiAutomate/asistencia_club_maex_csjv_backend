import { QueryTypes } from 'sequelize';
import { sequelize } from '../database/sequelize.js';
import { logger } from '../config/logger.js';

const safeJson = (value) => {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const normVal = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 19);
  const s = String(v).trim();
  return s === '' ? null : s;
};

/**
 * Compara dos objetos planos y devuelve lista de cambios { campo, antes, despues }.
 */
export function buildCambios(antes, despues, { ignoreKeys = ['id'] } = {}) {
  const a = antes && typeof antes === 'object' ? antes : {};
  const d = despues && typeof despues === 'object' ? despues : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(d)]);
  const cambios = [];
  for (const key of keys) {
    if (ignoreKeys.includes(key)) continue;
    if (key === 'cambios' || key === 'camposExtraAntes' || key === 'camposExtraDespues') continue;
    const av = normVal(a[key]);
    const dv = normVal(d[key]);
    if (av !== dv) {
      cambios.push({ campo: key, antes: a[key] ?? null, despues: d[key] ?? null });
    }
  }
  return cambios;
}

/** Resumen corto tipo "estado: ACTIVO → RETIRADO · sede: …" */
export function resumenFromCambios(prefijo, cambios, maxLen = 480) {
  if (!cambios?.length) return String(prefijo || '').slice(0, maxLen);
  const parts = cambios.slice(0, 8).map((c) => {
    const from = c.antes == null || c.antes === '' ? '∅' : String(c.antes);
    const to = c.despues == null || c.despues === '' ? '∅' : String(c.despues);
    return `${c.campo}: ${from} → ${to}`;
  });
  const extra = cambios.length > 8 ? ` (+${cambios.length - 8} más)` : '';
  return `${prefijo}: ${parts.join(' · ')}${extra}`.slice(0, maxLen);
}

/**
 * Registra un evento de auditoría administrativa.
 * Si recibe `cambios`, los incluye dentro de `despues` para la UI.
 * No lanza: si la tabla no existe o falla, solo loguea.
 */
export async function registrarAuditoria({
  req,
  accion,
  modulo,
  entidad = null,
  entidadId = null,
  resumen = null,
  antes = undefined,
  despues = undefined,
  cambios = undefined,
}) {
  try {
    const user = req?.user || {};
    const ip =
      req?.headers?.['x-forwarded-for']?.toString?.().split(',')[0]?.trim() ||
      req?.ip ||
      null;
    const ua = String(req?.headers?.['user-agent'] || '').slice(0, 255) || null;

    let despuesPayload = despues;
    if (cambios != null || (antes != null && despues != null && !despues?.cambios)) {
      const computed = cambios ?? buildCambios(antes, despues);
      if (despuesPayload && typeof despuesPayload === 'object' && !Array.isArray(despuesPayload)) {
        despuesPayload = { ...despuesPayload, cambios: computed };
      } else if (despuesPayload == null && computed.length) {
        despuesPayload = { cambios: computed };
      }
    }

    await sequelize.query(
      `INSERT INTO auditoria_admin
        (usuario_id, email, rol, accion, modulo, entidad, entidad_id, resumen, antes_json, despues_json, ip, user_agent)
       VALUES
        (:usuarioId, :email, :rol, :accion, :modulo, :entidad, :entidadId, :resumen, :antes, :despues, :ip, :ua)`,
      {
        replacements: {
          usuarioId: user.id != null ? Number(user.id) : null,
          email: user.email || null,
          rol: user.rol || null,
          accion: String(accion || '').slice(0, 32),
          modulo: String(modulo || '').slice(0, 64),
          entidad: entidad != null ? String(entidad).slice(0, 64) : null,
          entidadId: entidadId != null ? String(entidadId).slice(0, 64) : null,
          resumen: resumen != null ? String(resumen).slice(0, 500) : null,
          antes: safeJson(antes),
          despues: safeJson(despuesPayload),
          ip: ip ? String(ip).slice(0, 64) : null,
          ua,
        },
        type: QueryTypes.INSERT,
      },
    );
  } catch (err) {
    logger.warn(`auditoria_admin no registrada: ${err.message}`);
  }
}
