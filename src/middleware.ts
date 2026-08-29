import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieEntrante = { name: string; value: string; options?: CookieOptions };

// /sin-conexion tiene que ser pública y estática: la sirve el service worker
// justo cuando no se puede llegar al servidor. Si pasara por acá, sin red no
// habría a quién preguntarle si hay sesión.
// La portada y los legales tienen que verse SIN cuenta: son justamente lo
// que lee alguien antes de decidir si se registra. Si pasaran por el control
// de sesión, el link que le mandás a un cliente lo tiraría a un login.
const PUBLICAS = [
  '/ingresar', '/auth', '/sin-conexion', '/privacidad', '/terminos',
  // Quien se olvidó la contraseña no tiene sesión, por definición. Si estas
  // dos no fueran públicas, el enlace del correo lo rebotaría al login y el
  // circuito no cerraría nunca.
  '/recuperar', '/clave-nueva',
];

export async function middleware(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista: CookieEntrante[]) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const ruta = request.nextUrl.pathname;

  // La portada se compara EXACTA y no con startsWith: '/' es prefijo de
  // absolutamente todo, así que meterla en la lista abriría la aplicación
  // entera. La propia página manda al panel a quien ya tiene sesión.
  const esPublica = ruta === '/' || PUBLICAS.some((p) => ruta.startsWith(p));

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/ingresar';
    url.searchParams.set('volver', ruta);
    return NextResponse.redirect(url);
  }

  if (user && ruta === '/ingresar') {
    const url = request.nextUrl.clone();
    url.pathname = '/panel';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return respuesta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|iconos|manifest.webmanifest|sw.js|sin-conexion|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
