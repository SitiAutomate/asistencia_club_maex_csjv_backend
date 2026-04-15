/** Fecha calendario en zona horaria Colombia (YYYY-MM-DD). */
export function fechaHoyColombia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/** Convierte un Date/ISO a YYYY-MM-DD en America/Bogota. */
export function ymdColombiaDesdeDate(input) {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
}

/**
 * @param {{ enviado?: boolean | null, fechaEnvio?: string | Date | null }} evaluacion
 * @returns {boolean} true si ya hubo envío hoy (calendario Colombia).
 */
export function informeYaEnviadoHoyColombia(evaluacion) {
  if (!evaluacion?.enviado || !evaluacion?.fechaEnvio) return false;
  const hoy = fechaHoyColombia();
  const envio = ymdColombiaDesdeDate(evaluacion.fechaEnvio);
  return Boolean(envio && envio === hoy);
}

export function normalizarFechaEnv(s) {
  if (s == null) return null;
  let t = String(s).trim().replace(/^\uFEFF/, '');
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

/**
 * @param {{ habilitado: boolean, desde: string | null, hasta: string | null }} config
 * @returns {{ ok: true } | { ok: false, code: 'disabled' | 'before_window' | 'after_window' }}
 */
export function evaluateInformeEnvioWindow(config) {
  if (!config.habilitado) {
    return { ok: false, code: 'disabled' };
  }
  const today = fechaHoyColombia();
  if (config.desde && today < config.desde) {
    return { ok: false, code: 'before_window' };
  }
  if (config.hasta && today > config.hasta) {
    return { ok: false, code: 'after_window' };
  }
  return { ok: true };
}
