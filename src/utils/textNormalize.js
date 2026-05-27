/**
 * Normaliza texto multilínea para guardar en BD y renderizar en PDF/correo.
 * El carácter Ð (U+00D0) suele aparecer cuando queda un \r (CR) sin convertir
 * antes de generar PDF con fuentes estándar (Helvetica / WinAnsi).
 */
export function normalizeMultilineText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00D0/gi, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeMultilineTextForPdf(value) {
  const normalized = normalizeMultilineText(value);
  if (!normalized) return '';
  return normalized
    .split('\n')
    .map((line) => line.replace(/[^\S]+/g, ' ').trim())
    .join('\n');
}
