'use client';

import Link from 'next/link';
import { dinero } from '@/lib/formato';
import { useOcultarMontos } from '@/lib/ocultar-montos';
import { useLocale, useTextos } from '@/i18n/cliente';
import { BotonOjo } from '@/components/PantallaBilletera';
import type { Billetera } from '@/lib/tipos';

/**
 * TU PLATA, ARRIBA DEL PANEL.
 *
 * Lo primero que se mira al abrir: cuánto hay, sumando todas las cuentas,
 * con el ojito para taparlo. Tocar la tira lleva a la billetera. Sin cuentas
 * cargadas, invita a cargarlas en vez de mostrar un cero que no dice nada.
 */
export function TiraBilletera({ billetera, moneda }: { billetera: Billetera; moneda: string }) {
  const t = useTextos();
  const b = t.billetera;
  const locale = useLocale();
  const [oculto, alternar] = useOcultarMontos();
  const sinCuentas = billetera.cuentas.length === 0;

  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-noche px-4 py-3 text-white">
      <div
        className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full opacity-30 blur-2xl"
        style={{ background: 'radial-gradient(circle, #3ddc9a, transparent 65%)' }}
      />
      <Link href="/billetera" className="relative min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{b.tuPlata}</span>
        {sinCuentas ? (
          <span className="mt-0.5 block text-[14px] font-semibold text-menta">{b.cargaTusCuentas}</span>
        ) : (
          <span className="mt-0.5 block truncate text-[20px] font-bold tabular-nums tracking-tight">
            {oculto ? '••••••' : dinero(billetera.total, moneda, true, locale)}
            <span className="ml-2 text-[12px] font-medium text-white/50">{b.enNCuentas(billetera.cuentas.length)}</span>
          </span>
        )}
      </Link>
      {!sinCuentas && (
        <BotonOjo oculto={oculto} alCambiar={alternar} clase="relative bg-white/10 text-white hover:bg-white/15" />
      )}
      <Link href="/billetera" aria-label={b.verBilletera} className="relative text-white/50">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>
    </div>
  );
}
