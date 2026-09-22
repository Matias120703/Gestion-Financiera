/**
 * Los diccionarios que se ofrecen: español y portugués.
 *
 * Este archivo NO importa nada del servidor a propósito: lo usan tanto las
 * páginas de servidor como los componentes del navegador. Si acá entrara
 * `next/headers`, cualquier componente cliente que pidiera un texto se
 * llevaría medio Next.js puesto y fallaría al compilar.
 */
import { es, type Textos } from './textos/es';
import { pt } from './textos/pt';
import { IDIOMA_POR_DEFECTO, esIdioma, type Idioma, IDIOMA_UNICO } from './idiomas';

export type { Textos };

/**
 * Los dos completos, sin fusión de por medio.
 *
 * `fusionar()` sigue existiendo para el día que se agregue un idioma nuevo
 * y convenga arrancarlo apoyado en inglés mientras se completa. Hoy no hace
 * falta: los dos que hay están al 100%.
 */
export const DICCIONARIOS: Record<Idioma, Textos> = { es, pt };

export function diccionario(idioma: Idioma | string | null | undefined): Textos {
  return DICCIONARIOS[idiomaEfectivo(idioma)];
}

/**
 * El idioma que de verdad se usa. Con un idioma único manda ese, aunque en
 * las preferencias de alguien haya quedado guardado 'en' de cuando se podía
 * elegir. Si no, los avisos de la noche le llegarían en inglés a quien ve la
 * app en español.
 */
export function idiomaEfectivo(idioma: Idioma | string | null | undefined): Idioma {
  if (IDIOMA_UNICO) return IDIOMA_UNICO;
  return esIdioma(idioma) ? idioma : IDIOMA_POR_DEFECTO;
}
