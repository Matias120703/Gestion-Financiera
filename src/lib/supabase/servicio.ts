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
