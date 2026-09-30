/**
 * LA DIRECCIÓN PÚBLICA DE ORDEN
 *
 * La que se les anuncia a los buscadores (`app/sitemap.ts` y la línea
 * `Sitemap:` de `public/robots.txt`) y la base con la que Next arma la foto
 * de un enlace compartido (`metadataBase` en `app/layout.tsx`). Es una sola:
 * orden.com.py, sin www.
 *
 * Fija y no de una variable, a propósito. Antes salía de NEXT_PUBLIC_SITIO
 * o de la URL que pone Vercel: una variable vieja o un despliegue de prueba
 * le anunciaban a Google la dirección de vercel.app, y WhatsApp bajaba la
 * foto de un sitio que no es el de todos los días.
 *
 * Los enlaces de vuelta del pago y de los correos siguen saliendo de
 * `sitio()` (lib/pagos.ts), que sí depende de dónde corre: en la computadora
 * tienen que volver a localhost.
 */
export const SITIO_PUBLICO = 'https://orden.com.py';
