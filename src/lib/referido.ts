/**
 * EL CÓDIGO DE QUIEN TE TRAJO.
 *
 * Un socio comparte un enlace —orden.com.py/?ref=ABCD1234— y quien entra por
 * ahí no se registra en el acto: mira la portada, se va, vuelve al otro día,
 * y recién ahí crea la cuenta. Si el código viviera solo en la dirección, se
 * perdería en el primer clic, y con él la comisión de alguien.
 *
 * Así que se guarda apenas se pisa el sitio y se usa cuando la cuenta ya
 * existe. Vence a los 30 días por lo mismo que lo hace la base: el código es
 * para traer gente nueva, no para reclamar a alguien que anda dando vueltas
 * desde hace medio año.
 *
 * Nada de esto es la regla de verdad. La regla está en PostgreSQL
 * (`usar_codigo_referido`, migración 061), que comprueba todo de nuevo:
 * que el código exista, que la cuenta sea nueva, que no haya pagado todavía y
 * que nadie se traiga a sí mismo. Esto es solo el recordatorio.
 */
export const CLAVE_REF = 'orden:ref';

const DIAS = 30;

/** Solo letras y números, en mayúsculas: es como se generan los códigos. */
export function limpiarCodigo(valor: string | null | undefined): string {
  return (valor ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
}

export function guardarRef(valor: string | null | undefined, forzar = false): void {
  const codigo = limpiarCodigo(valor);
  if (codigo.length !== 8) return;
  try {
    // El primero que llega gana: si alguien ya venía con un código guardado,
    // un enlace nuevo no le pisa al que de verdad lo trajo. Salvo que lo
    // escriba a mano en el registro, que es una decisión de la persona y no
    // un enlace que se cruzó.
    if (!forzar && leerRef()) return;
    localStorage.setItem(CLAVE_REF, JSON.stringify({ codigo, desde: Date.now() }));
  } catch {
    // Navegador sin almacenamiento —modo privado, permisos—: se pierde el
    // código y la cuenta se crea igual. Nunca al revés.
  }
}

export function leerRef(): string | null {
  try {
    const crudo = localStorage.getItem(CLAVE_REF);
    if (!crudo) return null;
    const { codigo, desde } = JSON.parse(crudo) as { codigo?: string; desde?: number };
    if (!codigo || !desde) return null;
    if (Date.now() - desde > DIAS * 24 * 60 * 60 * 1000) { limpiarRef(); return null; }
    return limpiarCodigo(codigo) || null;
  } catch {
    return null;
  }
}

export function limpiarRef(): void {
  try { localStorage.removeItem(CLAVE_REF); } catch { /* ver guardarRef */ }
}

type ConRpc = {
  rpc: (nombre: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
  auth?: {
    getUser: () => PromiseLike<{ data: { user: { user_metadata?: Record<string, unknown> | null } | null } }>;
    updateUser: (datos: { data: Record<string, unknown> }) => PromiseLike<unknown>;
  };
};

/**
 * EL CÓDIGO NO PUEDE VIVIR SOLO EN UN NAVEGADOR.
 *
 * El 2026-09-17 Matías avisó que quien entra con su enlace no quedaba
 * anotado, y la base no tenía ni el referido ni un rechazo: el código nunca
 * llegó. Guardarlo en `localStorage` alcanza mientras todo pase en la misma
 * pestaña, y justo en este camino no pasa:
 *
 *   · el enlace se abre DENTRO de WhatsApp y la cuenta se crea después en
 *     Safari o Chrome, que no comparten el almacenamiento;
 *   · o el correo de confirmación se toca desde la app de Gmail, que abre su
 *     propio navegador y cae en /empezar sin nada guardado.
 *
 * Por eso ahora se busca en tres lugares, en orden: lo guardado en este
 * navegador, el `?ref=` de la dirección que se está abriendo, y —el que
 * sobrevive a todo— el que quedó anotado en la cuenta al registrarse (ver
 * `/crear`, que lo manda en el `signUp`).
 *
 * Que el código viaje en la cuenta no habilita nada: `usar_codigo_referido`
 * vuelve a comprobar en PostgreSQL que exista, esté activo, que la cuenta sea
 * nueva, que no haya pagado y que nadie se traiga a sí mismo. Es lo mismo que
 * podría escribir a mano en el registro.
 */
export async function codigoDeInvitacion(cliente: ConRpc): Promise<string | null> {
  const guardado = leerRef();
  if (guardado) return guardado;

  if (typeof window !== 'undefined') {
    const deLaDireccion = limpiarCodigo(new URLSearchParams(window.location.search).get('ref'));
    if (deLaDireccion.length === 8) return deLaDireccion;
  }

  try {
    const respuesta = await cliente.auth?.getUser();
    const enLaCuenta = limpiarCodigo(respuesta?.data?.user?.user_metadata?.ref as string | undefined);
    if (enLaCuenta.length === 8) return enLaCuenta;
  } catch {
    // Sin sesión o sin red: se sigue sin código, como antes.
  }

  return null;
}

/**
 * Usa el código guardado, si hay uno, en la cuenta recién creada.
 *
 * NUNCA rompe el registro. Si el código venció, ya lo usó otro o la base lo
 * rechaza por lo que sea, la persona no se entera: acaba de crear su cuenta y
 * lo último que necesita es un error rojo sobre un programa de comisiones que
 * ni sabe que existe.
 *
 * PERO EL RECHAZO SE GUARDA (068). Acá decía que «si el referido no aparece,
 * no entró por su enlace», y era falso: el 2026-09-16 alguien entró con el
 * enlace de un socio pausado, pagó, y no quedó ni rastro de que había venido
 * por él. Además supabase-js no tira cuando la base dice que no: devuelve
 * `{ error }`, así que el `catch` de antes nunca se enteraba de nada. Ahora
 * el rechazo queda anotado y la administración lo ve en la ficha de la
 * cuenta, con un botón para anotarlo cuando se resuelva.
 *
 * Se borra del navegador aunque haya fallado: el código vale para una cuenta,
 * no para todas las que esa persona cree de acá en adelante.
 */
export async function aplicarRef(cliente: ConRpc, empresaId: string): Promise<void> {
  const codigo = await codigoDeInvitacion(cliente);
  if (!codigo) return;
  limpiarRef();
  // También se borra de la cuenta: el código vale para la primera empresa,
  // no para todas las que esa persona cree de acá en adelante.
  try { await cliente.auth?.updateUser({ data: { ref: null } }); } catch { /* ver abajo */ }
  try {
    const { error } = await cliente.rpc('usar_codigo_referido', { p_empresa: empresaId, p_codigo: codigo });
    if (!error) return;
    const motivo = (error as { message?: string })?.message ?? '';
    await cliente.rpc('guardar_codigo_rechazado', { p_empresa: empresaId, p_codigo: codigo, p_motivo: motivo });
  } catch {
    // Ver el comentario de arriba: esto no puede frenar un registro.
  }
}

/** El enlace que comparte el socio. */
export function enlaceDeSocio(codigo: string, origen?: string): string {
  const base = origen || (typeof window !== 'undefined' ? window.location.origin : 'https://orden.com.py');
  return `${base}/?ref=${limpiarCodigo(codigo)}`;
}
