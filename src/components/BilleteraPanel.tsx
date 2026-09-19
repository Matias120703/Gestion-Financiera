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
 * Tres formas en tres semanas, y la tercera es la que pidió Matías mirando
 * el panel terminado: el total arriba, más chico que antes, y las cuentas
 * como tarjetas que se deslizan de derecha a izquierda —«me aparece el
 * Banco Atlas, cuánto tengo, y voy deslizando para ver cada uno»—.
 *
 * El motivo es de espacio, no de gusto: abajo del panel personal ahora
 * están los gastos, el ahorro, las deudas y la racha. Con seis cuentas en
 * una lista vertical, la billetera sola ocupaba la pantalla entera y todo
 * lo demás quedaba abajo del pliegue. Deslizando, seis cuentas ocupan lo
 * mismo que una.
 *
 * Tocar una tarjeta lleva a la billetera, donde se ajusta o se transfiere.
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
    <section aria-label={b.tuPlata}>
      {/* El total, sin tarjeta propia: la tarjeta ahora es cada cuenta. */}
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-tinta/55">{b.tuPlata}</p>
          <p className="mt-1 truncate font-titulo text-[30px] font-extrabold leading-none tabular-nums tracking-tight">
            {plata(billetera.total)}
          </p>
        </div>
        <BotonOjo oculto={oculto} alCambiar={alternar} clase="shrink-0 bg-arena text-tinta/70 hover:text-tinta" />
      </div>

      {/* Se desliza de costado. El `-mx-4 px-4` hace que la primera tarjeta
          arranque alineada con el resto del panel y la última pueda salirse
          por el borde: así se ve que hay más y se invita a deslizar. */}
      <div className="scroll-limpio -mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {cuentas.map((c) => (
          <Link
            key={c.id}
            href="/billetera"
            className="tarjeta w-[168px] shrink-0 snap-start p-4 transition hover:border-verde/50 active:bg-arena"
          >
            <IconoCuenta cuenta={c} />
            <p className="mt-3 truncate text-[14.5px] font-semibold">{c.nombre}</p>
            <p className="text-[12px] text-tinta/50">{b.tipos[c.tipo]}</p>
            <p className="mt-2 truncate text-[17px] font-bold tabular-nums tracking-tight">
              {plata(Number(c.saldo))}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
