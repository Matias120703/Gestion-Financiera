'use client';

import Link from 'next/link';
import { dinero } from '@/lib/formato';
import { useOcultarMontos } from '@/lib/ocultar-montos';
import { useLocale, useTextos } from '@/i18n/cliente';
import { BotonOjo } from '@/components/PantallaBilletera';
import { TarjetaCuenta } from '@/components/TarjetaCuenta';
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
          por el borde: así se ve que hay más y se invita a deslizar. El
          `scroll-px-4` es lo que hace que, al encajar, la tarjeta respete ese
          margen: sin él, el encaje la pegaba al borde de la pantalla.

          Un carrusel que se desliza de costado recorta también arriba y abajo.
          Por eso el `pb-6 -mb-4` (la sombra de la tarjeta baja unos 22px y
          sin ese aire se cortaba en seco) y el `pt-1` con los 4px a los
          costados en pantalla grande: son para que el recuadro de foco del
          teclado se vea entero. */}
      <div className="scroll-limpio -mx-4 -mb-4 mt-2 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-6 pt-1 lg:-mx-1 lg:scroll-px-1 lg:px-1">
        {cuentas.map((c) => (
          <Link
            key={c.id}
            href="/billetera"
            className="w-[236px] shrink-0 snap-start rounded-[18px] transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-fuerte"
          >
            {/* Una tarjeta de banco de verdad, pintada entera del color de
                la cuenta (094). Antes era una tarjeta blanca con una franja
                de color arriba: se distinguía, pero no resaltaba. */}
            <TarjetaCuenta cuenta={c} tipo={b.tipos[c.tipo]} saldo={plata(Number(c.saldo))} />
          </Link>
        ))}
      </div>
    </section>
  );
}
