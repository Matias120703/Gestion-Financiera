import type { Metadata, Viewport } from 'next';
import { Archivo, Inter } from 'next/font/google';
import './globals.css';
import { idiomaActual, textos } from '@/i18n';
import { ProveedorIdioma } from '@/i18n/cliente';
import { RegistrarServiceWorker } from '@/components/RegistrarServiceWorker';
import { CapturarRef } from '@/components/CapturarRef';
import { SeguirTema } from '@/components/SeguirTema';
import { GUION_TEMA } from '@/lib/tema';

// Las dos letras de Orden, servidas desde el mismo dominio (next/font las
// descarga al compilar): la de leer y la de los números grandes. El ancho de
// Archivo es variable, y es lo que la deja angosta como la de Wise.
const fuenteTexto = Inter({ subsets: ['latin'], variable: '--fuente-texto', display: 'swap' });
const fuenteTitulo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--fuente-titulo', display: 'swap' });

/**
 * La dirección pública del sitio. Sin ella, Next arma la de la foto del
 * enlace (`/opengraph-image`) con localhost, y WhatsApp no la puede bajar.
 * Primero la que se configura a mano (`NEXT_PUBLIC_SITIO`, la misma de
 * `sitio()` en lib/pagos.ts); si no está, la de producción que Vercel pone
 * sola; en la computadora, localhost. `sitemap.ts` hace la misma cuenta.
 */
function urlPublica(): string {
  const aMano = process.env.NEXT_PUBLIC_SITIO;
  if (aMano) return aMano.replace(/\/+$/, '');
  const deVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (deVercel) return `https://${deVercel.replace(/\/+$/, '')}`;
  return 'http://localhost:3000';
}

/**
 * Lo que leen Google y la vista previa de un enlace cuando una página no
 * dice nada propio. Nombra los rubros: antes decía «ventas y gastos» y un
 * profe, un trainer o un productor no se reconocía. Vive acá y no en el
 * diccionario porque solo lo usan estas etiquetas; está en los dos idiomas.
 */
const COMPARTIR = {
  es: {
    descripcion: 'Orden te dice cuánto te quedó de verdad y se adapta a lo que hacés: comercio, servicios con agenda, clases, personal trainer, agricultura, ganadería o tus finanzas personales. Cargás hablando, con una foto o escribiendo.',
    locale: 'es_PY',
    otro: 'pt_BR',
  },
  pt: {
    descripcion: 'O Orden mostra quanto sobrou de verdade e se adapta ao que você faz: comércio, serviços com agenda, aulas, personal trainer, lavoura, pecuária ou suas finanças pessoais. Você lança falando, com uma foto ou escrevendo.',
    locale: 'pt_BR',
    otro: 'es_PY',
  },
} as const;

/**
 * El título y la descripción, en el idioma de quien abre la página.
 *
 * La foto del enlace NO se declara acá: la pone sola `app/opengraph-image.tsx`
 * para todas las páginas, y le gana a cualquier `openGraph` de una página
 * que no traiga `images` propias (la portada define el suyo y la conserva).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await textos();
  const c = COMPARTIR[await idiomaActual()];
  return {
    metadataBase: new URL(urlPublica()),
    title: t.pantallas.metaTitulo,
    description: c.descripcion,
    openGraph: {
      type: 'website',
      siteName: 'Orden',
      title: t.pantallas.metaTitulo,
      description: c.descripcion,
      locale: c.locale,
      alternateLocale: [c.otro],
    },
    // La tarjeta grande: la foto a lo ancho, como en WhatsApp.
    twitter: { card: 'summary_large_image' },
    manifest: '/manifest.webmanifest',
    applicationName: 'Orden',
    appleWebApp: { capable: true, title: 'Orden', statusBarStyle: 'black-translucent' },
    icons: { icon: '/iconos/icono.svg', apple: '/iconos/icono.svg' },
  };
}

export const viewport: Viewport = {
  themeColor: '#121212',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // El idioma se resuelve una sola vez, acá: de la cookie o del navegador.
  // De acá salen el `lang` del <html> —que usan los lectores de pantalla y el
  // corrector del teclado— y el contexto que leen los componentes cliente.
  const idioma = await idiomaActual();
  const t = await textos();

  return (
    // suppressHydrationWarning: los guiones del tema y de la intro le ponen
    // una clase al <html> antes de que cargue React, a propósito (ver
    // lib/tema.ts e Intro.tsx). Sin esto, en desarrollo avisa que no coincide.
    <html lang={idioma} className={`${fuenteTexto.variable} ${fuenteTitulo.variable}`} suppressHydrationWarning>
      <head>
        {/* El tema se aplica antes de pintar nada. Ver src/lib/tema.ts: si
            esto fuera un efecto de React, cada apertura de la app arrancaría
            en blanco y se pondría oscura un instante después. */}
        <script dangerouslySetInnerHTML={{ __html: GUION_TEMA }} />
      </head>
      <body>
        <ProveedorIdioma idioma={idioma}>
          <CapturarRef />
          <SeguirTema />
          {children}
          <RegistrarServiceWorker sinConexion={t.sinConexion.titulo} />
        </ProveedorIdioma>
      </body>
    </html>
  );
}
