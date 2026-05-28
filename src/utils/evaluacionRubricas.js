export const normalizeRubricaTipo = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const TIPOS_DESTACADOS = new Set(['FISICO', 'TECNICO', 'TACTICO']);
const TIPOS_ACTITUDINALES = new Set(['ACTITUDINAL', 'PSICOLOGICO', 'CULTURAL']);

export const isRubricaTipoDestacado = (tipo) => TIPOS_DESTACADOS.has(normalizeRubricaTipo(tipo));

export const isRubricaTipoActitudinal = (tipo) => TIPOS_ACTITUDINALES.has(normalizeRubricaTipo(tipo));

export const splitRubricasParaInforme = (items) => {
  const destacados = [];
  const actitudinales = [];
  for (const item of items || []) {
    const tipo = normalizeRubricaTipo(item?.tipo);
    if (TIPOS_DESTACADOS.has(tipo)) {
      destacados.push(item);
    } else if (TIPOS_ACTITUDINALES.has(tipo)) {
      actitudinales.push(item);
    }
  }
  return { destacados, actitudinales };
};

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
