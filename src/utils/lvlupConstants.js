export const LVLUP_CURSOS_NIVEL_1 = ['2351', '2352'];
export const LVLUP_CURSOS_NIVEL_2 = ['2353', '2354'];

export const LVLUP_ESTADOS_INSCRIPCION = ['CONFIRMADO', 'ACTIVO'];

export const LVLUP_TIPOS_REGISTRO = ['REGULAR', 'DIAGNOSTICO', 'INFORME_FINAL'];

export function horasContratadasPaquete(tipoPaquete) {
  if (tipoPaquete === '8H') return 8;
  if (tipoPaquete === '16H') return 16;
  return null;
}

export function nivelDesdeCurso(idCurso) {
  const id = String(idCurso || '').trim();
  if (LVLUP_CURSOS_NIVEL_1.includes(id)) return 1;
  if (LVLUP_CURSOS_NIVEL_2.includes(id)) return 2;
  return null;
}
