import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieEntrante = { name: string; value: string; options?: CookieOptions };

/** Cliente de Supabase para Server Components, Server Actions y Route Handlers. */
export function clienteServidor() {
  const almacen = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(lista: CookieEntrante[]) {
          try {
            lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
          } catch {
            // En Server Components no se pueden escribir cookies; el middleware ya refresca la sesión.
          }
        },
      },
    },
  );
}
