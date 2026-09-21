import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieEntrante = { name: string; value: string; options?: CookieOptions };

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * Los métodos de cookies son async a propósito. Desde Next 15, `cookies()`
 * devuelve una promesa; esta función podría volverse async también, pero eso
 * obligaría a poner await en sus setenta y pico de llamadas, y cada una de
 * esas es una oportunidad de olvidarse. `@supabase/ssr` acepta que getAll y
 * setAll sean async y los espera cuando de verdad va a leer la sesión, así
 * que la espera queda acá adentro y las llamadas no cambian.
 */
export function clienteServidor() {
  const almacen = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return (await almacen).getAll();
        },
        async setAll(lista: CookieEntrante[]) {
          try {
            const tienda = await almacen;
            lista.forEach(({ name, value, options }) => tienda.set(name, value, options));
          } catch {
            // En Server Components no se pueden escribir cookies; el middleware ya refresca la sesión.
          }
        },
      },
    },
  );
}
