/**
 * EL SINGULAR DE LA UNIDAD DE UN LOTE (fase 0 de ganadería, 24/09).
 *
 * La unidad la escribe cada uno («cabezas», «animales», «hectáreas») y los
 * textos dicen «Gs 92.475 por cabeza». Sacarle la última «s» sirve para
 * «cabezas», pero a «animales» lo dejaba en «por animale». Sin librería:
 * alcanza con las terminaciones que aparecen en una unidad.
 */

/** «animales» → «animal», «unidades» → «unidad», «bueyes» → «buey», «cabezas» → «cabeza». */
export function singularEs(unidad: string): string {
  const u = unidad.trim();
  if (/[lrndjy]es$/i.test(u)) return u.slice(0, -2);
  return u.replace(/s$/i, '');
}

/** «animais» → «animal», «bezerrões» → «bezerrão», «cabeças» → «cabeça». */
export function singularPt(unidad: string): string {
  const u = unidad.trim();
  if (/ões$/i.test(u)) return `${u.slice(0, -3)}ão`;
  if (/ais$/i.test(u)) return `${u.slice(0, -3)}al`;
  if (/éis$/i.test(u)) return `${u.slice(0, -3)}el`;
  if (/ns$/i.test(u)) return `${u.slice(0, -2)}m`;
  return u.replace(/s$/i, '');
}
