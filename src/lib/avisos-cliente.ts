/**
 * AVISOS QUE DISPARA UNA PANTALLA.
 *
 * Las notificaciones push solo se pueden mandar desde el servidor (la clave
 * VAPID privada no sale de ahí). Cuando lo que pasó ocurre en el navegador
 * —se creó una cuenta, se activó un plan— la pantalla le avisa al servidor
 * con estas dos funciones, y el servidor decide si corresponde y a quién.
 *
 * NUNCA FALLAN
 *
 * Lo importante ya pasó en la base: la cuenta existe, el plan está activo.
 * Si el aviso no sale, no se le muestra ningún error a nadie. `keepalive`
 * deja que el pedido termine aunque la pantalla navegue a otra página en el
 * mismo instante, que es justo lo que hace el registro al terminar.
 */
function disparar(ruta: string, empresaId: string): void {
  try {
    fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa: empresaId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Sin red o sin fetch: el aviso es el extra, no el trámite.
  }
}

/** A la administración, y al socio si la cuenta vino con su enlace. */
export function avisarCuentaNueva(empresaId: string): void {
  disparar('/api/avisos/cuenta-nueva', empresaId);
}

/** Al dueño de la cuenta, y al socio si ese cobro le generó la comisión. */
export function avisarActivacion(empresaId: string): void {
  disparar('/api/admin/aviso-activacion', empresaId);
}
