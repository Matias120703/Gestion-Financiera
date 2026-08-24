import { textos } from '@/i18n';

/**
 * La pantalla que muestra el service worker cuando no hay red.
 *
 * Tiene que ser estática: el service worker la guarda en la instalación, y
 * una página que necesita el servidor para renderizarse no sirve justamente
 * cuando no se puede llegar al servidor. Por eso no lee sesión ni datos.
 */
export const dynamic = 'force-static';

export default function PaginaSinConexion() {
  const t = textos();

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-arena">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-tinta/40"
               fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
            <path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 3.5-2.3M19 13a10 10 0 0 0-6-2.9M1.5 9a15 15 0 0 1 4-2.7M22.5 9a15 15 0 0 0-9.5-3.4" />
            <circle cx="12" cy="20" r="1" />
          </svg>
        </div>

        <h1 className="mt-4 text-[19px] font-bold tracking-tight">{t.sinConexion.titulo}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-tinta/55">{t.sinConexion.detalle}</p>

        {/* Un <a> y no un Link: si el enrutador de Next no llegó a cargarse,
            una navegación normal del navegador es lo único que funciona. */}
        <a href="/panel" className="boton-principal mt-6 inline-flex">{t.comun.reintentar}</a>
      </div>
    </main>
  );
}
