import { esTokenDeRutina, rutaDeRutina } from '@/components/rutinas/publico/enlace';
import { FICHA, IDIOMA_UNICO, diccionario, esIdioma, idiomaActual } from '@/i18n';

export const dynamic = 'force-dynamic';

/**
 * EL MANIFEST DE LA RUTINA DEL CLIENTE (098).
 *
 * Lo primero que le dice el trainer al cliente es «guardala en el inicio».
 * Con el manifest de Orden (el del layout raíz), Android guardaba un ícono
 * que decía «Orden» y abría /panel, o sea el login: el cliente no volvía a
 * ver su rutina. Este lo reemplaza solo en /rutina/<token>: se llama «Mi
 * rutina», arranca en ese link y no sale de él (`scope`).
 *
 * El `id` es el link: dos personas que comparten un teléfono (madre e hijo)
 * pueden guardar cada una la suya sin que el celular crea que es la misma app.
 *
 * No le pregunta nada a la base: no dice nada que quien lo pide no sepa
 * (su propio link), y un link apagado ya muestra lo suyo al abrirse. Un
 * token que no es un uuid no tiene manifest.
 *
 * El idioma llega en la dirección (`?idioma=pt`) porque el navegador pide el
 * manifest sin cookies: sin eso, quien eligió portugués a mano guardaría un
 * ícono en español.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!esTokenDeRutina(token)) return new Response(null, { status: 404 });

  const pedido = new URL(request.url).searchParams.get('idioma');
  const idioma = IDIOMA_UNICO ?? (esIdioma(pedido) ? pedido : await idiomaActual());
  const r = diccionario(idioma).rutinaPublica;
  const ruta = rutaDeRutina(token);

  const manifest = {
    id: ruta,
    name: r.nombreApp,
    short_name: r.nombreApp,
    description: r.metaDescripcion,
    // Sin barra final: el scope es un prefijo, y con barra el propio link
    // quedaría afuera y se abriría con la barra del navegador.
    start_url: ruta,
    scope: ruta,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#121212',
    theme_color: '#121212',
    lang: FICHA[idioma].locale,
    // Los íconos de Orden: los mismos archivos del manifest general, que ya
    // están guardados en el celular y no pasan por el middleware.
    icons: [
      { src: '/iconos/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // Lleva el token: que no lo guarde ningún intermediario ni lo indexe nadie.
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
