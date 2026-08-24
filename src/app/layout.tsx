import type { Metadata, Viewport } from 'next';
import './globals.css';
import { idiomaActual, textos } from '@/i18n';
import { ProveedorIdioma } from '@/i18n/cliente';
import { RegistrarServiceWorker } from '@/components/RegistrarServiceWorker';

export const metadata: Metadata = {
  title: 'Orden · Gestión financiera',
  description: 'Registrá ventas y gastos en segundos. Mirá tu ganancia real todos los días.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Orden',
  appleWebApp: { capable: true, title: 'Orden', statusBarStyle: 'black-translucent' },
  icons: { icon: '/iconos/icono.svg', apple: '/iconos/icono.svg' },
};

export const viewport: Viewport = {
  themeColor: '#0d1b16',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // El idioma se resuelve una sola vez, acá: de la cookie o del navegador.
  // De acá salen el `lang` del <html> —que usan los lectores de pantalla y el
  // corrector del teclado— y el contexto que leen los componentes cliente.
  const idioma = idiomaActual();
  const t = textos();

  return (
    <html lang={idioma}>
      <body>
        <ProveedorIdioma idioma={idioma}>
          {children}
          <RegistrarServiceWorker sinConexion={t.sinConexion.titulo} />
        </ProveedorIdioma>
      </body>
    </html>
  );
}
