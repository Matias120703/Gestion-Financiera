import type { Metadata } from 'next';
import Link from 'next/link';
import { Marca } from '@/components/Marca';
import { GuiaInstalar } from '@/components/GuiaInstalar';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Cómo instalar Orden · Orden',
  description: 'Agregá Orden a tu pantalla de inicio para que te lleguen los avisos.',
};

/**
 * LA GUÍA DE INSTALACIÓN, SOLA Y COMPARTIBLE.
 *
 * Existe para un solo momento: alguien escribe «no me llegan los avisos» y
 * hay que mandarle algo, ya, sin explicarle nada por chat. Este enlace es esa
 * respuesta. Por eso vive en su propia dirección pública —no adentro de
 * Ajustes, donde solo la ve quien ya inició sesión— y no pide nada para
 * abrirse.
 *
 * El componente (`GuiaInstalar`) es el mismo que se ve adentro de la app: se
 * escribe una vez y no hay dos guías que se puedan desactualizar por separado.
 */
export default function PaginaInstalar() {
  return (
    <main className="min-h-screen bg-superficie">
      <header className="zona-segura-arriba border-b border-borde">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Marca clase="h-9 w-9" />
            <span className="text-[17px] font-bold tracking-tight">Orden</span>
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight lg:text-[32px]">
          Cómo agregar Orden a tu pantalla de inicio
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-tinta/65">
          Son cuatro pasos, y en iPhone hace falta hacerlo para que te lleguen los avisos
          —es una regla del teléfono, no de Orden—. En Android no es obligatorio, pero la app
          se abre más rápido y sin la barra del navegador arriba.
        </p>

        <div className="mt-8 tarjeta p-5">
          <GuiaInstalar />
        </div>

        <p className="mt-6 text-center text-[13px] text-tinta/45">
          <Link href="/" className="font-semibold text-verde-fuerte hover:underline">
            Volver a Orden →
          </Link>
        </p>
      </article>
    </main>
  );
}
