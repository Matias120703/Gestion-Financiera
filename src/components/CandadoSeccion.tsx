'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTextos } from '@/i18n/cliente';
import type { Seccion } from '@/lib/rubros';

/**
 * El candado POR SECCIÓN de la cuenta personal en el plan Gratis (110,
 * 28/09/2026).
 *
 * Matías decidió que la personal, al terminar la prueba, no quede con el
 * candado total: sigue anotando gastos e ingresos a mano y ve su historial.
 * Lo del Pro —deudas, «Me deben», billetera, presupuesto y reportes— se ve en
 * el menú con la pastilla «Pro» y, al entrar, esta tarjeta dice qué hace la
 * sección y lleva a /plan. Lo que cargó ahí queda guardado.
 *
 * Va en el layout, adentro de `CandadoCuenta`, por lo mismo que aquel: tapa
 * también lo que se escribe a mano en la URL, sin depender de que cada página
 * se acuerde. Las cinco páginas además cortan antes de leer (así sus datos no
 * viajan), y la autoridad es la base: la 110 rechaza escribir lo del Pro.
 *
 * Para un negocio `cerradas` viene siempre vacía y esto no hace nada.
 */
export function CandadoSeccion({
  cerradas, children,
}: {
  cerradas: Seccion[];
  children: React.ReactNode;
}) {
  // Los dos hooks van antes de cualquier salida, como en CandadoCuenta.
  const pathname = usePathname();
  const t = useTextos();

  const s = cerradas.find((h) => pathname === h || pathname?.startsWith(h + '/'));
  if (!s) return <>{children}</>;

  const g = t.planGratis.seccion;
  const nombre: Partial<Record<Seccion, string>> = {
    '/deudas': t.nav.deudas,
    '/fiado': t.nav.meDeben,
    '/billetera': t.nav.billetera,
    '/organizacion': t.nav.organizacion,
    '/reportes': t.nav.reportes,
  };
  const clave = s.slice(1) as keyof typeof g.detalle;

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-arena bg-superficie px-6 py-16 text-center">
      <svg viewBox="0 0 24 24" className="mb-4 h-10 w-10 text-tinta/30" aria-hidden="true"
           fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      <p className="text-[11px] font-bold uppercase tracking-wider text-tinta/40">{nombre[s]}</p>
      <p className="mt-1 text-[17px] font-bold">{g.titulo}</p>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-tinta/60">{g.detalle[clave]}</p>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-tinta/50">{g.guardado}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        <Link href="/plan" className="boton-principal px-5 py-2.5 text-[14px]">
          {g.verPlan}
        </Link>
        <Link href="/gastos" className="boton-suave px-5 py-2.5 text-[14px]">
          {g.anotarGasto}
        </Link>
      </div>
    </div>
  );
}
