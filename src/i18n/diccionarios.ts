/**
 * Los dos diccionarios.
 *
 * Este archivo NO importa nada del servidor a propósito: lo usan tanto las
 * páginas de servidor como los componentes del navegador. Si acá entrara
 * `next/headers`, cualquier componente cliente que pidiera un texto se
 * llevaría medio Next.js puesto y fallaría al compilar.
 */
import { es, type Textos } from './textos/es';
import { en } from './textos/en';
import { IDIOMA_POR_DEFECTO, esIdioma, type Idioma } from './idiomas';

export type { Textos };

/**
 * Los dos completos, sin fusión de por medio.
 *
 * `fusionar()` sigue existiendo para el día que se agregue un idioma nuevo
 * y convenga arrancarlo apoyado en inglés mientras se completa. Hoy no hace
 * falta: los dos que hay están al 100%.
 */
export const DICCIONARIOS: Record<Idioma, Textos> = { es, en };

export function diccionario(idioma: Idioma | string | null | undefined): Textos {
  return DICCIONARIOS[esIdioma(idioma) ? idioma : IDIOMA_POR_DEFECTO];
}
