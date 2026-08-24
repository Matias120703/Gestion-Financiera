/**
 * Punto de entrada de los idiomas, lado servidor.
 *
 *   · En una página de servidor:  `const t = textos();`
 *   · En un componente cliente:   `const t = useTextos();` (ver cliente.tsx)
 *
 * Este archivo usa `next/headers`, así que solo se puede importar desde el
 * servidor. Los componentes del navegador entran por `cliente.tsx`.
 */
import { cookies, headers } from 'next/headers';
import { diccionario, type Textos } from './diccionarios';
import {
  COOKIE_IDIOMA, IDIOMA_POR_DEFECTO, esIdioma, idiomaDeCabecera, type Idioma,
} from './idiomas';

export type { Textos };
export * from './idiomas';
export { DICCIONARIOS, diccionario } from './diccionarios';

/**
 * Qué idioma le corresponde a quien está mirando.
 *
 * Orden de prioridad, del más explícito al menos:
 *   1. la cookie, que es lo que la persona eligió a mano;
 *   2. lo que pide su navegador;
 *   3. español.
 *
 * La preferencia guardada en la base se copia a la cookie al entrar
 * (ver `sesion.ts`), así no hay que consultarla en cada página.
 */
export function idiomaActual(): Idioma {
  const elegido = cookies().get(COOKIE_IDIOMA)?.value;
  if (esIdioma(elegido)) return elegido;

  const delNavegador = idiomaDeCabecera(headers().get('accept-language'));
  return delNavegador ?? IDIOMA_POR_DEFECTO;
}

/** Atajo para las páginas del servidor. */
export function textos(): Textos {
  return diccionario(idiomaActual());
}
