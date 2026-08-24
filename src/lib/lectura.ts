/**
 * ============================================================
 * LEER SIN MENTIR
 * ============================================================
 *
 * LA REGLA
 *
 *   Ausencia de datos ≠ error al obtener los datos.
 *
 * Un negocio que no vendió nada hoy tiene ventas = 0. Eso es un dato y hay que
 * mostrarlo. Pero si la consulta falló —se cortó internet, venció el token,
 * PostgreSQL devolvió un error— entonces NO sabemos cuánto se vendió, y
 * mostrar 0 sería inventar un número financiero para representar una falla.
 *
 * Antes, cada función de lectura devolvía un valor de respaldo cuando fallaba:
 * `RESUMEN_VACIO`, `[]`, `0`. Con eso, un error de red se veía en pantalla
 * exactamente igual que un día sin ventas. Para una aplicación de plata eso es
 * inaceptable: la persona podría creer que no vendió nada, o que se le
 * borraron los movimientos.
 *
 * Ahora la capa de datos LANZA. Las pantallas son Server Components, así que
 * Next muestra `error.tsx`: un mensaje claro y un botón de reintentar. Un cero
 * en pantalla vuelve a significar lo único que debería significar: cero.
 *
 * Este archivo no importa nada de Next ni de Supabase justamente para que se
 * pueda probar solo, sin levantar la aplicación.
 */

/** Falla al leer datos. Nunca se convierte en un valor financiero. */
export class ErrorDeLectura extends Error {
  readonly contexto: string;
  readonly causa?: string;

  constructor(contexto: string, causa?: string) {
    super(`No se pudieron cargar los datos (${contexto})${causa ? `: ${causa}` : ''}`);
    this.name = 'ErrorDeLectura';
    this.contexto = contexto;
    this.causa = causa;
  }
}

export function esErrorDeLectura(e: unknown): e is ErrorDeLectura {
  return e instanceof ErrorDeLectura || (e as { name?: string })?.name === 'ErrorDeLectura';
}

/** Lo que devuelve supabase-js: o hay dato, o hay error. */
export interface RespuestaSupabase<T> {
  data: T | null | undefined;
  error: { message: string } | null;
}

/**
 * Devuelve el dato o lanza. Nunca inventa un respaldo.
 *
 * Ojo con la diferencia que importa:
 *   · `data: []`  → la consulta anduvo y no hay nada. Es un dato válido.
 *   · `data: 0`   → ídem.
 *   · `error: {}` → no sabemos nada. Lanza.
 *   · `data: null` sin error → tampoco sabemos nada. Lanza.
 */
export function exigir<T>(respuesta: RespuestaSupabase<T>, contexto: string): T {
  if (respuesta.error) {
    // El detalle técnico queda en el servidor; a la persona le llega un
    // mensaje entendible desde error.tsx.
    console.error(`[lectura:${contexto}]`, respuesta.error.message);
    throw new ErrorDeLectura(contexto, respuesta.error.message);
  }
  if (respuesta.data === null || respuesta.data === undefined) {
    console.error(`[lectura:${contexto}] la consulta no devolvió nada`);
    throw new ErrorDeLectura(contexto, 'la consulta no devolvió ningún resultado');
  }
  return respuesta.data;
}

/** Igual que `exigir`, pero además valida que sea un array. */
export function exigirLista<T>(respuesta: RespuestaSupabase<T[]>, contexto: string): T[] {
  const datos = exigir(respuesta, contexto);
  if (!Array.isArray(datos)) {
    console.error(`[lectura:${contexto}] se esperaba una lista y llegó`, typeof datos);
    throw new ErrorDeLectura(contexto, 'la respuesta no tiene el formato esperado');
  }
  return datos;
}

export interface Pagina<T, C> {
  items: T[];
  siguiente: C | null;
}

/**
 * Recorre todas las páginas de algo. Si UNA falla, propaga el error y no
 * devuelve nada: media lista es peor que ninguna, porque parece completa.
 *
 * Se usa para el Excel, donde el detalle tiene que salir entero o no salir.
 * Recibe la función de traer por parámetro para poder probarla sin base.
 */
export async function recorrerPaginas<T, C>(
  traer: (cursor: C | null) => Promise<Pagina<T, C>>,
  opciones: { tope?: number; maxPaginas?: number; contexto?: string } = {},
): Promise<T[]> {
  const tope = opciones.tope ?? 200_000;
  const maxPaginas = opciones.maxPaginas ?? 1000;
  const contexto = opciones.contexto ?? 'páginas';

  const todos: T[] = [];
  let cursor: C | null = null;
  let vueltas = 0;

  for (;;) {
    // Sin try/catch a propósito: si `traer` lanza, la excepción sube tal cual.
    const pagina = await traer(cursor);
    todos.push(...pagina.items);

    vueltas += 1;
    cursor = pagina.siguiente;

    // El tope se controla ANTES de cortar. Si se revisara después del
    // `break`, una última página podría pasarse y la función terminaría bien:
    // con tope 8, páginas de [1..5] y [6..9] devolvería 9 registros.
    //
    //   total < tope                    → seguimos
    //   total = tope y no hay más       → válido, devolvemos
    //   total = tope pero hay otra hoja → falla: no entra todo
    //   total > tope                    → falla
    if (todos.length > tope) {
      throw new ErrorDeLectura(contexto, `se superó el máximo de ${tope} registros`);
    }
    if (todos.length === tope && cursor) {
      throw new ErrorDeLectura(contexto, `se superó el máximo de ${tope} registros`);
    }

    if (!cursor) break;

    if (vueltas >= maxPaginas) {
      // Si el cursor dejara de avanzar entraríamos en un bucle infinito.
      // Preferimos fallar antes que devolver una lista incompleta.
      throw new ErrorDeLectura(contexto, `se superó el máximo de ${maxPaginas} páginas`);
    }
  }

  return todos;
}
