import Link from 'next/link';

/**
 * El marco de las páginas legales.
 *
 * Deliberadamente sobrio y legible: un texto legal que nadie puede leer no
 * protege a nadie. Ancho de lectura corto, tipografía grande y títulos que
 * dicen de qué habla cada parte.
 */
export function PaginaLegal({
  titulo, actualizado, children,
}: {
  titulo: string;
  actualizado: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-white">
      <header className="zona-segura-arriba border-b border-borde">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-verde text-base font-black text-white">o</span>
            <span className="text-[17px] font-bold tracking-tight">orden</span>
          </Link>
          <Link href="/" className="boton-texto">Volver</Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight lg:text-[38px]">{titulo}</h1>
        <p className="mt-2 text-[13.5px] font-semibold text-tinta/45">
          Última actualización: {actualizado}
        </p>

        <div className="mt-8 space-y-7">{children}</div>

        <div className="mt-12 border-t border-borde pt-6">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] font-semibold text-tinta/50">
            <Link href="/privacidad" className="hover:text-tinta">Privacidad</Link>
            <Link href="/terminos" className="hover:text-tinta">Términos</Link>
            <Link href="/" className="hover:text-tinta">Inicio</Link>
          </nav>
        </div>
      </article>
    </main>
  );
}

export function Apartado({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[19px] font-bold tracking-tight lg:text-[21px]">{titulo}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-tinta/70">{children}</div>
    </section>
  );
}

export function Lista({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-tinta/30" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
