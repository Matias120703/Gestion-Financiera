/**
 * Los seis diccionarios ya fusionados.
 *
 * Este archivo NO importa nada del servidor a propósito: lo usan tanto las
 * páginas de servidor como los componentes del navegador. Si acá entrara
 * `next/headers`, cualquier componente cliente que pidiera un texto se
 * llevaría medio Next.js puesto y fallaría al compilar.
 */
import { fusionar } from './fusionar';
import { es, type Textos } from './textos/es';
import { en } from './textos/en';
import { pt } from './textos/pt';
import { de } from './textos/de';
import { fr } from './textos/fr';
import { it } from './textos/it';
import { IDIOMA_POR_DEFECTO, esIdioma, type Idioma } from './idiomas';

export type { Textos };

/**
 * Español e inglés son completos y van tal cual. Los otros se apoyan en
 * inglés, no en español: si alguien eligió alemán, es más probable que lea
 * inglés que castellano.
 */
export const DICCIONARIOS: Record<Idioma, Textos> = {
  es,
  en,
  pt: fusionar(en, pt),
  de: fusionar(en, de),
  fr: fusionar(en, fr),
  it: fusionar(en, it),
};

export function diccionario(idioma: Idioma | string | null | undefined): Textos {
  return DICCIONARIOS[esIdioma(idioma) ? idioma : IDIOMA_POR_DEFECTO];
}
