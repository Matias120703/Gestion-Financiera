/**
 * Traduce los errores de PostgreSQL/Supabase a algo que una persona entienda.
 *
 * Los mensajes de nuestras funciones ya vienen en español y son claros, así que
 * esos pasan tal cual. Lo que traducimos son los errores técnicos que aparecen
 * cuando alguien intenta algo que la base no permite.
 */

interface ErrorSupabase {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

const REGLAS: { patron: RegExp; mensaje: string }[] = [
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
    patron: /failed to fetch|network|timeout|ECONN/i,
    mensaje: 'No hay conexión. Probá de nuevo cuando vuelva internet.',
  },
];

export function mensajeDeError(error: unknown, respaldo = 'No se pudo completar la operación.'): string {
  if (!error) return respaldo;

  const e = error as ErrorSupabase;
  const crudo = (typeof error === 'string' ? error : e.message ?? '').trim();
  if (!crudo) return respaldo;

  // LAS REGLAS VAN PRIMERO, y el orden importa.
  //
  // Antes se preguntaba antes si el mensaje era nuestro, y eso dejaba pasar
  // enteros los errores técnicos que arrancan con mayúscula y no traen
  // ninguna de las siete palabras de abajo: la persona leía «JWT expired» o
  // «TypeError: Failed to fetch». Son los dos casos más comunes de todos —la
  // sesión vencida y el celular sin señal— y eran justo los que se colaban.
  //
  // Invertirlo es seguro porque los patrones son cadenas técnicas en inglés
  // que no aparecen en ningún mensaje nuestro: hay una prueba que los
  // contrasta contra los 442 que levantan las migraciones.
  for (const { patron, mensaje } of REGLAS) {
    if (patron.test(crudo) || patron.test(e.details ?? '') || patron.test(e.code ?? '')) {
      return mensaje;
    }
  }

  // Nuestras propias excepciones ya vienen redactadas para el usuario.
  // Las reconocemos porque arrancan en mayúscula y no traen jerga de Postgres.
  const esNuestro = /^[A-ZÁÉÍÓÚÑ¡¿]/.test(crudo)
    && !/relation|column|function|constraint|violates|denied|syntax/i.test(crudo);
  if (esNuestro) return crudo;

  return respaldo;
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
