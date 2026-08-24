'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import type { Empresa } from '@/lib/tipos';
import { useTextos } from '@/i18n/cliente';
import type { Textos } from '@/i18n/diccionarios';

export interface ItemNav { href: string; texto: string; icono: React.ReactNode }

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const Ico = {
  panel: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M3 12l9-8 9 8" /><path d="M5 10.5V20h14v-9.5" /><path d="M9.5 20v-5h5v5" />
    </svg>
  ),
  vender: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="12" cy="12" r="9" /><path d="M12 7.5v9M14.8 9.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.7.8-2.7 2 0 2.8 5.6 1.4 5.6 4.2 0 1.2-1.2 2-2.9 2-1.4 0-2.4-.5-2.9-1.4" />
    </svg>
  ),
  gastos: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M3.5 7.5h17v11a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.5 7.5 6 4h12l2.5 3.5M9 12h6" />
    </svg>
  ),
  productos: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="m4 7 8 4 8-4M12 11v10" />
    </svg>
  ),
  movimientos: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  reto: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" />
    </svg>
  ),
  reportes: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </svg>
  ),
  cierre: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" />
    </svg>
  ),
  mas: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <path d="M3.5 8.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.5 11.5h17M7 15.5h3" /><path d="M6.5 8.5V6.8A1.3 1.3 0 0 1 7.8 5.5h8.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    </svg>
  ),
  ajustes: (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" {...trazo}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
    </svg>
  ),
};

/**
 * Los ítems salen del diccionario, no de una constante: el nombre de cada
 * pantalla cambia con el idioma. La ruta y el icono no cambian nunca, así
 * que lo único que se arma en cada render es el texto.
 */
export function itemsDe(t: Textos): ItemNav[] {
  return [
    { href: '/panel',       texto: t.nav.panel,       icono: Ico.panel },
    { href: '/vender',      texto: t.nav.vender,      icono: Ico.vender },
    { href: '/gastos',      texto: t.nav.gastos,      icono: Ico.gastos },
    { href: '/cierre',      texto: t.nav.cierre,      icono: Ico.cierre },
    { href: '/productos',   texto: t.nav.productos,   icono: Ico.productos },
    { href: '/movimientos', texto: t.nav.historial,   icono: Ico.movimientos },
    { href: '/reto',        texto: t.nav.reto,        icono: Ico.reto },
    { href: '/reportes',    texto: t.nav.reportes,    icono: Ico.reportes },
    { href: '/ajustes',     texto: t.nav.ajustes,     icono: Ico.ajustes },
  ];
}

/**
 * Qué va fijo en la barra de abajo del celular.
 *
 * Son CUATRO y no las nueve, y no es por ahorrar: en un celular de 375 px,
 * nueve iconos quedan a 41 px cada uno. El mínimo para tocar sin errar con el
 * pulgar es 44, y las etiquetas no entrarían. El quinto lugar es «Más», que
 * abre TODAS las secciones —incluidas estas cuatro— en una hoja con espacio
 * de sobra. Todo queda a un toque, que es lo que importa.
 *
 * Estas cuatro son las de todos los días: mirar cómo va, vender, cargar un
 * gasto y cerrar el día. Productos, reportes y ajustes se tocan de vez en
 * cuando y casi siempre sentado.
 */
const EN_BARRA_INFERIOR = ['/panel', '/vender', '/gastos', '/cierre'];

function activo(ruta: string, href: string) {
  return ruta === href || ruta.startsWith(`${href}/`);
}

export function NavLateral({ empresa }: { empresa: Empresa }) {
  const ruta = usePathname();
  const t = useTextos();
  const ITEMS = itemsDe(t);
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-borde bg-white lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-verde text-base font-black text-white">o</span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight tracking-tight">{empresa.nombre}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-tinta/40">{empresa.moneda}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {ITEMS.map((i) => (
          <Link
            key={i.href} href={i.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold transition ${
              activo(ruta, i.href) ? 'bg-verde-claro text-verde-fuerte' : 'text-tinta/60 hover:bg-arena hover:text-tinta'
            }`}
          >
            {i.icono}
            {i.texto}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function NavInferior() {
  const ruta = usePathname();
  const t = useTextos();
  const [abierto, setAbierto] = useState(false);

  const todos = itemsDe(t);
  const fijos = todos.filter((i) => EN_BARRA_INFERIOR.includes(i.href));

  // «Más» se marca en verde cuando estás parado en una sección que no está
  // fija abajo. Si no, al entrar a Productos la barra no señalaría nada y
  // parecería que estás en ningún lado.
  const enOtraSeccion = !EN_BARRA_INFERIOR.some((href) => activo(ruta, href));

  // El menú se cierra solo al navegar. Sin esto queda tapando la pantalla
  // a la que acabás de entrar.
  useEffect(() => { setAbierto(false); }, [ruta]);

  return (
    <>
      {abierto && (
        <div
          className="fixed inset-0 z-40 bg-tinta/45 backdrop-blur-[2px] lg:hidden"
          onClick={() => setAbierto(false)}
        >
          <div
            className="zona-segura-abajo absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-[calc(72px+env(safe-area-inset-bottom))] shadow-tarjeta aparecer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-borde" />
            <p className="titulo-seccion px-1 pb-2">{t.nav.todasLasSecciones}</p>

            <div className="grid grid-cols-3 gap-1.5">
              {todos.map((i) => {
                const on = activo(ruta, i.href);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => setAbierto(false)}
                    className={`flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 text-center text-[11.5px] font-bold leading-tight transition active:scale-95 ${
                      on ? 'bg-verde-claro text-verde-fuerte' : 'bg-arena text-tinta/65'
                    }`}
                  >
                    {i.icono}
                    <span className="px-0.5">{i.texto}</span>
                  </Link>
                );
              })}

              <Link
                href="/plan"
                onClick={() => setAbierto(false)}
                className={`flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 text-center text-[11.5px] font-bold leading-tight transition active:scale-95 ${
                  activo(ruta, '/plan') ? 'bg-verde-claro text-verde-fuerte' : 'bg-arena text-tinta/65'
                }`}
              >
                {Ico.plan}
                <span className="px-0.5">{t.nav.plan}</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      <nav className="zona-segura-abajo fixed inset-x-0 bottom-0 z-50 border-t border-borde bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {fijos.map((i) => {
            const on = activo(ruta, i.href);
            return (
              <Link
                key={i.href} href={i.href}
                className={`flex flex-col items-center gap-1 px-1 py-2.5 text-center text-[10.5px] font-bold leading-tight transition ${
                  on ? 'text-verde-fuerte' : 'text-tinta/40'
                }`}
              >
                {i.icono}
                {i.texto}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-label={t.nav.todasLasSecciones}
            className={`flex flex-col items-center gap-1 px-1 py-2.5 text-center text-[10.5px] font-bold leading-tight transition ${
              abierto || enOtraSeccion ? 'text-verde-fuerte' : 'text-tinta/40'
            }`}
          >
            {Ico.mas}
            {t.nav.mas}
          </button>
        </div>
      </nav>
    </>
  );
}

export function BarraSuperior({
  empresa, empresas, nombreUsuario, rol,
}: {
  empresa: Empresa;
  empresas: { empresa: Empresa; rol: string }[];
  nombreUsuario: string;
  rol: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const t = useTextos();
  const [abierto, setAbierto] = useState(false);
  const titulo = itemsDe(t).find((i) => activo(ruta, i.href))?.texto ?? 'Orden';

  function cambiar(id: string) {
    document.cookie = `${COOKIE_EMPRESA}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setAbierto(false);
    router.refresh();
  }

  async function salir() {
    const supabase = clienteNavegador();
    await supabase.auth.signOut();
    router.push('/ingresar');
    router.refresh();
  }

  return (
    <header className="zona-segura-arriba sticky top-0 z-30 border-b border-borde bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-7">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-verde text-sm font-black text-white lg:hidden">o</span>
          <h1 className="truncate text-[17px] font-bold tracking-tight lg:text-[19px]">{titulo}</h1>
        </div>

        <div className="relative shrink-0">
          <button
            type="button" onClick={() => setAbierto((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-borde px-2.5 py-1.5 text-[13px] font-semibold hover:bg-arena"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-tinta text-[11px] font-bold text-white">
              {(nombreUsuario || 'U').charAt(0).toUpperCase()}
            </span>
            <span className="hidden max-w-[130px] truncate sm:inline">{empresa.nombre}</span>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-tinta/40" {...trazo}><path d="m6 9 6 6 6-6" /></svg>
          </button>

          {abierto && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
              <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-borde bg-white shadow-tarjeta aparecer">
                <div className="border-b border-borde px-4 py-3">
                  <p className="text-[13px] font-bold">{nombreUsuario || t.nav.miCuenta}</p>
                  {/* El código de invitación NO se muestra acá: vive en Ajustes y
                      solo lo ve quien administra. La base tampoco se lo entrega
                      a un vendedor aunque manipule el navegador. */}
                  <p className="mt-0.5 text-[12px] capitalize text-tinta/50">{rol}</p>
                </div>

                {empresas.length > 1 && (
                  <div className="border-b border-borde py-1.5">
                    <p className="px-4 py-1 text-[10.5px] font-bold uppercase tracking-wider text-tinta/40">{t.nav.cambiarEmpresa}</p>
                    {empresas.map(({ empresa: e }) => (
                      <button
                        key={e.id} onClick={() => cambiar(e.id)}
                        className={`flex w-full items-center justify-between px-4 py-2 text-left text-[13.5px] font-semibold hover:bg-arena ${
                          e.id === empresa.id ? 'text-verde-fuerte' : 'text-tinta/70'
                        }`}
                      >
                        <span className="truncate">{e.nombre}</span>
                        {e.id === empresa.id && <span className="text-[11px]">{t.nav.activa}</span>}
                      </button>
                    ))}
                  </div>
                )}

                <button onClick={salir} className="w-full px-4 py-2.5 text-left text-[13.5px] font-semibold text-rojo hover:bg-rojo-claro">
                  {t.nav.salir}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
