/**
 * Traduce los errores de PostgreSQL/Supabase a algo que una persona entienda.
 *
 * Los mensajes de nuestras funciones ya vienen en español y son claros, así que
 * esos pasan tal cual. Lo que traducimos son los errores técnicos que aparecen
 * cuando alguien intenta algo que la base no permite.
 */

/**
 * EL IDIOMA DE LOS MENSAJES.
 *
 * Lo que sale de acá lo lee la persona, y los mensajes de la base están en
 * español. El proveedor de idioma del navegador instala un traductor
 * (lib/mensajes-base.ts) y todo lo que devuelve `mensajeDeError` pasa por
 * él. Sin traductor —en español, en las pruebas, en el servidor— los
 * mensajes salen tal cual.
 *
 * Es un valor del módulo y no un parámetro porque `mensajeDeError` se llama
 * en más de cien lugares, y en el navegador hay una sola persona con un
 * solo idioma. En el servidor no se instala nunca: ahí sí se mezclarían los
 * pedidos de distintas personas.
 */
let traductor: ((texto: string) => string) | null = null;

export function usarTraductorDeErrores(fn: ((texto: string) => string) | null): void {
  traductor = fn;
}

const traducir = (texto: string) => (traductor ? traductor(texto) : texto);

interface ErrorSupabase {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

// Se exporta solo para que la prueba la pueda contrastar contra todos
// nuestros mensajes. Ver pruebas/errores.test.js.
export const REGLAS: { patron: RegExp; mensaje: string }[] = [
  {
    patron: /row-level security|permission denied|insufficient privilege|policy/i,
    mensaje: 'No tenés permiso para hacer esto. Si creés que deberías, pedile a un administrador.',
  },
  {
    patron: /movimientos_total_coherente|movimientos_descuento_valido/i,
    mensaje: 'Los números de esa operación no cierran. Volvé a cargarla desde la app.',
  },
  {
    patron: /movimientos_solo_venta_descuenta/i,
    mensaje: 'Un gasto o un ingreso no puede llevar descuento ni costo de mercadería.',
  },
  {
    patron: /movimientos_anulacion_auditada/i,
    mensaje: 'Una anulación tiene que registrar quién y cuándo. Usá el botón de anular.',
  },
  {
    patron: /movimientos_fecha_razonable/i,
    mensaje: 'Esa fecha no es válida.',
  },
  {
    // Las medidas del cuerpo (098): cada rango —el peso entre 20 y 300, la
    // cintura entre 40 y 200…— lo controla un check de `mediciones`, y todos
    // se llaman `mediciones_…`. Frenan dedazos («8,5» en vez de «85»), así
    // que el mensaje no diagnostica nada: pide mirar el número de nuevo.
    //
    // Solo los check, no cualquier cosa que nombre la tabla: el choque de
    // dos controles el mismo día (`mediciones_un_control_por_dia`) es un
    // índice único y tiene su propio mensaje en la función.
    patron: /violates check constraint "?mediciones_/i,
    mensaje: 'Ese valor está fuera de rango. Revisalo.',
  },
  {
    patron: /duplicate key|unique constraint|productos_empresa_id_nombre_key/i,
    mensaje: 'Ya existe algo con ese nombre.',
  },
  {
    patron: /violates foreign key|foreign key constraint/i,
    mensaje: 'Eso hace referencia a algo que ya no existe. Recargá la página.',
  },
  {
    patron: /JWT|not authenticated|invalid claim/i,
    mensaje: 'Tu sesión venció. Volvé a entrar.',
  },
  {
    // Cada navegador avisa «sin red» a su manera, y hay que reconocerlas
    // todas: Chrome dice «Failed to fetch», Firefox «NetworkError…», Node
    // «fetch failed», y Safari —el de todos los iPhone— «Load failed».
    //
    // Esa última faltaba. Y como arranca con mayúscula, `esNuestro` la
    // tomaba por un mensaje nuestro y la mostraba cruda: «TypeError: Load
    // failed» en la pantalla de alguien que solo había perdido la señal un
    // segundo. Pasó en producción, en Deudas y en Presupuesto.
    //
    // El mensaje no promete que no se guardó: un corte puede pasar antes o
    // después de que el pedido llegue. Dice lo que pasó y qué hacer. Y no
    // dice «no hay conexión», porque casi siempre la hay: lo que se cortó
    // fue ese pedido.
    patron: /failed to fetch|fetch failed|load failed|network|timeout|timed out|ECONN|internet connection|connection was lost|could not connect|hostname could not be found|aborted|abort ?error/i,
    mensaje: 'Se cortó la conexión. Revisá tu internet y probá de nuevo.',
  },
];

export function mensajeDeError(error: unknown, respaldo = 'No se pudo completar la operación.'): string {
  if (!error) return traducir(respaldo);

  const e = error as ErrorSupabase;
  const crudo = (typeof error === 'string' ? error : e.message ?? '').trim();
  if (!crudo) return traducir(respaldo);

  // LAS REGLAS VAN PRIMERO, y el orden importa.
  //
  // Antes se preguntaba antes si el mensaje era nuestro, y eso dejaba pasar
  // enteros los errores técnicos que arrancan con mayúscula y no traen
  // ninguna de las siete palabras de abajo: la persona leía «JWT expired» o
  // «TypeError: Failed to fetch». Son los dos casos más comunes de todos —la
  // sesión vencida y el celular sin señal— y eran justo los que se colaban.
  //
  // Invertirlo es seguro porque los patrones son cadenas técnicas en inglés
  // que no aparecen en ningún mensaje nuestro.
  //
  // Este comentario decía que una prueba lo comprobaba contra los mensajes
  // de las migraciones, y esa prueba no existía. Apareció al ampliar la
  // regla de conexión, que es justo cuando hacía falta. Ahora existe:
  // errores.test.js recorre todos los mensajes de la base y todos los que
  // lanzan las pantallas, y falla si alguna regla tapa uno.
  for (const { patron, mensaje } of REGLAS) {
    if (patron.test(crudo) || patron.test(e.details ?? '') || patron.test(e.code ?? '')) {
      return traducir(mensaje);
    }
  }

  // Nuestras propias excepciones ya vienen redactadas para el usuario.
  // Las reconocemos porque arrancan en mayúscula y no traen jerga de Postgres.
  //
  // Pero el nombre de un error de JavaScript también arranca con mayúscula
  // —«TypeError: …», «AbortError: …»—, así que sin la segunda condición
  // cualquier falla técnica del navegador pasaba por mensaje nuestro.
  // Nuestros mensajes nunca empiezan con el nombre de una clase de error.
  const esNuestro = /^[A-ZÁÉÍÓÚÑ¡¿]/.test(crudo)
    && !/^[A-Z][a-zA-Z]*Error\b/.test(crudo)
    && !/relation|column|function|constraint|violates|denied|syntax/i.test(crudo);
  if (esNuestro) return traducir(crudo);

  return traducir(respaldo);
}

/**
 * Cuando una policy filtra con USING, Supabase no devuelve error: devuelve
 * cero filas. Sin esto, la interfaz diría "guardado" sin haber guardado nada.
 */
export const SIN_PERMISO_SILENCIOSO =
  'No se guardó: no tenés permiso para cambiar esto.';

export function verificarAfectados(
  filas: unknown[] | null,
  mensaje = SIN_PERMISO_SILENCIOSO,
): void {
  if (!filas || filas.length === 0) throw new Error(mensaje);
}
