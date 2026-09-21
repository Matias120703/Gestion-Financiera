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

/** El título y la descripción, en el idioma de quien abre la página. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await textos();
  return {
    title: t.pantallas.metaTitulo,
    description: t.pantallas.metaDescripcion,
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
