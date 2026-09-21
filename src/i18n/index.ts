/**
 * Punto de entrada de los idiomas, lado servidor.
 *
 *   · En una página de servidor:  `const t = await textos();`
 *   · En un componente cliente:   `const t = useTextos();` (ver cliente.tsx)
 *
 * Este archivo usa `next/headers`, así que solo se puede importar desde el
 * servidor. Los componentes del navegador entran por `cliente.tsx`.
 *
 * POR QUÉ HAY QUE ESPERARLO
 *
 * Desde Next 15, leer la cookie y las cabeceras del pedido es asíncrono. No
 * hay forma de saber el idioma sin leerlas, así que `textos()` tuvo que
 * volverse async y con él todas sus llamadas. Es incómodo y es la verdad:
 * el idioma depende de quién está mirando, y eso solo se sabe cuando llega
 * el pedido.
 *
 * Lo único que NO se puede esperar es `loading.tsx`: una pantalla de espera
 * no puede, ella misma, esperar. Ahí el texto entra por el cliente.
 */
import { cookies, headers } from 'next/headers';
import { diccionario, type Textos } from './diccionarios';
import {
  COOKIE_IDIOMA, IDIOMA_POR_DEFECTO, IDIOMA_UNICO, esIdioma, idiomaDeCabecera, type Idioma,
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
export async function idiomaActual(): Promise<Idioma> {
  // Con un idioma único no se pregunta nada: ni la cookie de alguien que
  // eligió inglés cuando se podía, ni el navegador de un visitante de
  // afuera. Si no, media app quedaría en un idioma a medio traducir.
  if (IDIOMA_UNICO) return IDIOMA_UNICO;

  const elegido = (await cookies()).get(COOKIE_IDIOMA)?.value;
  if (esIdioma(elegido)) return elegido;

  const delNavegador = idiomaDeCabecera((await headers()).get('accept-language'));
  return delNavegador ?? IDIOMA_POR_DEFECTO;
}

/** Atajo para las páginas del servidor. */
export async function textos(): Promise<Textos> {
  return diccionario(await idiomaActual());
}
