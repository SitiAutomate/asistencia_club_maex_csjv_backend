/** Días reconocidos en el texto entre paréntesis del nombre del curso. */
const DIA_PATTERNS = [
  { key: 'lunes', re: /\bLUNES\b/i },
  { key: 'martes', re: /\bMARTES\b/i },
  { key: 'miercoles', re: /\bMI[ÉE]RCOLES\b/i },
  { key: 'jueves', re: /\bJUEVES\b/i },
  { key: 'viernes', re: /\bVIERNES\b/i },
  { key: 'sabado', re: /\bS[ÁA]BADO\b/i },
];

/**
 * Extrae el contenido del último paréntesis en el nombre del curso.
 * @param {string} nombre
 */
export function extraerParentesisNombre(nombre) {
  const s = String(nombre || '');
  const match = s.match(/\(([^()]*)\)\s*$/);
  return match ? match[1].trim() : '';
}

/**
 * Detecta días de la semana en el texto (p. ej. "LUNES", "LUNES Y MIÉRCOLES").
 * @param {string} nombre
 * @returns {{ lunes: string|null, martes: string|null, miercoles: string|null, jueves: string|null, viernes: string|null, sabado: string|null }}
 */
export function parseDiasDesdeNombre(nombre) {
  const inner = extraerParentesisNombre(nombre);
  const chunks = inner
    ? inner.split(/[,/]|(?:\s+y\s+)/i).map((c) => c.trim()).filter(Boolean)
    : [];
  const text = chunks.length ? chunks.join(' ') : inner;

  const out = {
    lunes: null,
    martes: null,
    miercoles: null,
    jueves: null,
    viernes: null,
    sabado: null,
  };

  for (const { key, re } of DIA_PATTERNS) {
    if (re.test(text)) out[key] = 'X';
  }

  return out;
}
