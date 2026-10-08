import { createClient } from '@supabase/supabase-js';

/**
 * Cliente con la clave de servicio: SALTA RLS ENTERA.
 *
 * Solo puede usarse desde código que corre en el servidor y que nadie de
 * afuera puede disparar sin autenticarse: los webhooks de pago (validados
 * por firma) y las tareas programadas (validadas por secreto).
 *
 * Nunca importar esto desde un componente cliente ni desde una ruta que
 * responda a un pedido común del navegador. Si esta clave llegara al
 * navegador, cualquiera podría leer y escribir los datos de cualquier
 * negocio.
 *
 * LA ÚNICA EXCEPCIÓN ESCRITA (113, 30/09/2026): la ruta pública
 * `/rutina/[token]/videos`, que la llama el celular del alumno sin sesión.
 * La usa solo para firmar las rutas que devuelve `videos_por_token` a partir
 * del token; nunca una ruta que venga del navegador. Sin sesión no hay otra
 * forma de firmar un bucket privado (la alternativa era un bucket público,
 * con los videos del trainer accesibles para siempre con la dirección).
 * Ojo: con el Smart CDN, una dirección firmada que ya se usó se sigue
 * sirviendo desde el CDN aunque venza; lo único que corta un video del todo
 * es borrar su archivo (ver la ruta).
 *
 * LA SEGUNDA EXCEPCIÓN ESCRITA (Bancard, 02/10/2026): las rutas de
 * `/api/pagos/bancard/*` con sesión (iniciar el pago, ver su estado). Antes
 * de tocar este cliente validan la sesión y `accesoBancard` con el cliente
 * DEL USUARIO, y después este cliente solo llama funciones `bancard_*` que
 * reciben `p_usuario` y vuelven a comprobar en la base que esa persona
 * administra la cuenta. Nunca lee ni escribe una tabla. (La confirmación
 * pública y las tareas entran por la regla de arriba: firma y secreto.)
 * Entra acá también `/api/pagos/bancard/personas` (07/10/2026): misma
 * sesión y mismo `accesoBancard` antes, y una sola función con `p_usuario`.
 *
 * LA TERCERA EXCEPCIÓN ESCRITA (129, 07/10/2026): `/api/admin/cuentas/borrar`
 * y `/api/admin/correos/borrar`. Antes de tocar este cliente comprueban la
 * sesión y `es_superadmin` con el cliente DEL USUARIO; después llaman
 * funciones que reciben `p_actor` y vuelven a exigir en la base que
 * administre Orden, borran archivos por las rutas que devolvió la base y
 * borran de Auth solo a quien `correo_borrable` acaba de aprobar
 * (src/lib/borrar-correo-servidor.ts). Nunca leen ni escriben una tabla.
 */
export function clienteDeServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !clave) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. '
      + 'Sin eso no se pueden aplicar pagos ni mandar los avisos.',
    );
  }

  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
