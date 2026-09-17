'use client';

import Link from 'next/link';
import { dinero } from '@/lib/formato';
import { useOcultarMontos } from '@/lib/ocultar-montos';
import { useLocale, useTextos } from '@/i18n/cliente';
import { BotonOjo, IconoCuenta } from '@/components/PantallaBilletera';
import type { Billetera } from '@/lib/tipos';

/**
 * TU PLATA, ARRIBA DE TODO EN EL PANEL.
 *
 * Primero fueron tarjetas de colores, una por banco, para deslizar. Después
 * Matías mostró la app de Wise y eligió su estilo: UNA tarjeta con el total
 * grande arriba y, adentro, la lista de cuentas —icono, nombre y monto—,
 * una fila por cuenta. Se lee de un vistazo sin tener que deslizar nada.
 *
 * Tocar una fila lleva a la billetera, donde se ajusta o se transfiere.
 * Sin cuentas cargadas no se muestra un cero: se invita a cargarlas.
 */
export function BilleteraPanel({ billetera, moneda }: { billetera: Billetera; moneda: string }) {
  const t = useTextos();
  const b = t.billetera;
  const locale = useLocale();
  const [oculto, alternar] = useOcultarMontos();
  const cuentas = billetera.cuentas;

  const plata = (n: number) => (oculto ? '••••••' : dinero(n, moneda, true, locale));

  if (cuentas.length === 0) {
    return (
      <Link href="/billetera" className="tarjeta flex items-center justify-between gap-3 px-5 py-4">
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-tinta/55">{b.tuPlata}</span>
          <span className="mt-0.5 block text-[15px] font-semibold text-verde-fuerte">{b.cargaTusCuentas}</span>
        </span>
      </Link>
    );
  }

  return (
    <section className="tarjeta overflow-hidden" aria-label={b.tuPlata}>
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-tinta/55">{b.tuPlata}</p>
          <p className="mt-1.5 truncate font-titulo text-[38px] font-extrabold leading-none tabular-nums tracking-tight">
            {plata(billetera.total)}
          </p>
          <p className="mt-2 text-[12.5px] text-tinta/50">{b.enNCuentas(cuentas.length)}</p>
        </div>
        <BotonOjo oculto={oculto} alCambiar={alternar} clase="shrink-0 bg-arena text-tinta/70 hover:text-tinta" />
      </div>

      <ul className="px-2 pb-2">
        {cuentas.map((c) => (
          <li key={c.id}>
            <Link
              href="/billetera"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-arena active:bg-arena"
            >
              <IconoCuenta cuenta={c} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{c.nombre}</span>
                <span className="block text-[12.5px] text-tinta/50">{b.tipos[c.tipo]}</span>
              </span>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums">{plata(Number(c.saldo))}</span>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-tinta/30" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
