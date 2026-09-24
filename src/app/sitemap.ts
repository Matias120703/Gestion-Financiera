import type { MetadataRoute } from 'next';

/**
 * EL MAPA PARA LOS BUSCADORES (`/sitemap.xml`)
 *
 * Solo las páginas que alguien puede ver sin cuenta y que tiene sentido
 * encontrar en Google: la portada, crear cuenta, entrar, la guía para
 * instalar y los dos textos legales. Todo lo de adentro (panel, gastos,
 * billetera…) pide sesión y está cerrado en `public/robots.txt`.
 *
 * Las reservas de cada local (`/r/<slug>`) y las rutinas de cada cliente
 * (`/rutina/<token>`) no van: son de cada negocio y de cada persona, no de
 * Orden, y la rutina lleva datos de salud.
 *
 * Una sola URL por página, sin versiones por idioma: la misma dirección sirve
 * español o portugués según la cookie o el navegador de quien entra, así que
 * no hay una «/pt» que anunciar.
 *
 * Ojo: el middleware tiene que dejar pasar `/sitemap.xml` sin sesión; si no,
 * al robot de Google le contesta con el login.
 */

/**
 * La dirección pública del sitio, la misma que usa `metadataBase` en el
 * layout: primero la que se configura a mano (`NEXT_PUBLIC_SITIO`, la de
 * `sitio()` en lib/pagos.ts); si no está, la de producción que Vercel pone
 * sola; y en la computadora, localhost.
 */
function urlPublica(): string {
  const aMano = process.env.NEXT_PUBLIC_SITIO;
  if (aMano) return aMano.replace(/\/+$/, '');
  const deVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (deVercel) return `https://${deVercel.replace(/\/+$/, '')}`;
  return 'http://localhost:3000';
}

// La última vez que cambió de verdad cada página. Se actualiza a mano cuando
// se reescribe una: poner `new Date()` le diría a Google que todo cambió en
// cada despliegue, y deja de creerle a la fecha.
const PORTADA = new Date('2026-09-24');
const LEGALES = new Date('2026-09-24');
const INSTALAR = new Date('2026-09-21');
const INGRESAR = new Date('2026-09-17');

export default function sitemap(): MetadataRoute.Sitemap {
  const base = urlPublica();
  return [
    { url: `${base}/`, lastModified: PORTADA, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/crear`, lastModified: PORTADA, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/instalar`, lastModified: INSTALAR, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/ingresar`, lastModified: INGRESAR, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${base}/terminos`, lastModified: LEGALES, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacidad`, lastModified: LEGALES, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
