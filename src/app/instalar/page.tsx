import type { Metadata } from 'next';
import Link from 'next/link';
import { Marca } from '@/components/Marca';
import { GuiaInstalar } from '@/components/GuiaInstalar';
import { textos } from '@/i18n';

/**
 * Dinámica y no estática desde que Orden habla dos idiomas: una página
 * estática se arma una sola vez, sin cookie ni navegador, y saldría en
 * español para todos. Sigue sin pedir sesión: eso no depende de esto.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const p = (await textos()).instalarPagina;
  return { title: p.metaTitulo, description: p.metaDescripcion };
}

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
export default async function PaginaInstalar() {
  const p = (await textos()).instalarPagina;
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
        <h1 className="text-[26px] font-titulo font-extrabold leading-tight tracking-tight lg:text-[32px]">
          {p.titulo}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-tinta/65">
          {p.bajada}
        </p>

        <div className="mt-8 tarjeta p-5">
          <GuiaInstalar />
        </div>

        <p className="mt-6 text-center text-[13px] text-tinta/45">
          <Link href="/" className="font-semibold text-verde-fuerte hover:underline">
            {p.volver}
          </Link>
        </p>
      </article>
    </main>
  );
}
