/**
 * LAS PALABRAS DE CADA OFICIO, SOBRE EL DICCIONARIO (097).
 *
 * Un rubro que usa el motor de otro no copia sus pantallas: habla con sus
 * palabras. El trainer ve la agenda del profe, pero donde el profe lee
 * «Inscribir a un alumno» él lee «Agendar a un cliente».
 *
 * Se resuelve pisando el diccionario con un diccionario parcial, con la
 * misma `fusionar()` que se pensó para los idiomas a medio traducir. Así
 * ninguna pantalla pregunta «¿es trainer?»: todas piden su texto como
 * siempre y les llega la palabra del oficio.
 *
 * No importa nada del servidor: lo usan el hook del navegador y las páginas
 * del servidor por igual.
 */
import type { Textos } from './diccionarios';
import { fusionar, type Parcial } from './fusionar';
import type { Idioma } from './idiomas';
import type { Jerga } from '../lib/rubros';
import { entrenamientoEs, entrenamientoPt } from './textos/entrenamiento';
import { agriculturaEs, agriculturaPt } from './textos/agricultura';

const JERGAS: Record<Jerga, Record<Idioma, Parcial<Textos>>> = {
  entrenamiento: { es: entrenamientoEs, pt: entrenamientoPt },
  // El agricultor usa los lotes del ganadero, pero dice «campaña» y
  // «a cosecha» (100).
  agricultura: { es: agriculturaEs, pt: agriculturaPt },
};

/** El diccionario con las palabras del oficio encima. Sin jerga, el mismo. */
export function conJerga(t: Textos, jerga: Jerga | null | undefined, idioma: Idioma): Textos {
  if (!jerga) return t;
  return fusionar(t, JERGAS[jerga][idioma]);
}
