export const normalizeRubricaTipo = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

export const getNivelTextoByValor = (rubrica, valor) => {
  if (!rubrica) return '';
  const normalized = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  if (normalized.includes('ALTO')) return rubrica.alto || '';
  if (normalized.includes('MEDIO')) return rubrica.medio || '';
  if (normalized.includes('BASICO') || normalized.includes('BAJO')) return rubrica.bajo || '';
  return '';
};
