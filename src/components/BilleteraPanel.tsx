'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { dinero } from '@/lib/formato';
import { useOcultarMontos } from '@/lib/ocultar-montos';
import { useLocale, useTextos } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import { BotonOjo, FONDOS } from '@/components/PantallaBilletera';
import type { Billetera } from '@/lib/tipos';

/**
 * TU PLATA, ARRIBA DE TODO EN EL PANEL.
 *
 * Matías, después de probar la billetera: «en el panel, cuando la persona
 * entra a Orden, debería tener sus tarjetas así como está en billetera; y
 * cuando quiera ver cuánto tiene en cada banco, solo arrastra al costado. Y
 * arriba del todo, el total».
 *
 * Arriba va el total con el ojito. Abajo, una tarjeta por banco en una fila
 * que se desliza de costado y frena en cada tarjeta, como en las apps de
 * banco. Los puntitos dicen en cuál estás y cuántas hay. Tocar una tarjeta
 * lleva a la billetera, donde se ajusta o se transfiere.
 *
 * Sin cuentas cargadas no se muestra un cero: se invita a cargarlas.
 */
export function BilleteraPanel({ billetera, moneda }: { billetera: Billetera; moneda: string }) {
  const t = useTextos();
  const b = t.billetera;
  const locale = useLocale();
  const [oculto, alternar] = useOcultarMontos();
  const [actual, setActual] = useState(0);
  const fila = useRef<HTMLDivElement>(null);
  const cuentas = billetera.cuentas;

  const plata = (n: number) => (oculto ? '••••••' : dinero(n, moneda, true, locale));

  // Cuál tarjeta está a la vista: la que tiene el borde izquierdo más cerca
  // del borde de la fila.
  const alDeslizar = () => {
    const el = fila.current;
    if (!el) return;
    const tarjetas = Array.from(el.children) as HTMLElement[];
    let mejor = 0;
    let distancia = Infinity;
    tarjetas.forEach((tarjeta, i) => {
      const d = Math.abs(tarjeta.offsetLeft - el.offsetLeft - el.scrollLeft);
      if (d < distancia) { distancia = d; mejor = i; }
    });
    setActual(mejor);
  };

  const irA = (i: number) => {
    const el = fila.current;
    const tarjeta = el?.children[i] as HTMLElement | undefined;
    if (el && tarjeta) el.scrollTo({ left: tarjeta.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };

  if (cuentas.length === 0) {
    return (
      <Link
        href="/billetera"
        className="relative flex items-center gap-3 overflow-hidden rounded-3xl bg-noche px-5 py-4 text-white"
      >
        <div
          className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full opacity-30 blur-2xl"
          style={{ background: 'radial-gradient(circle, #3ddc9a, transparent 65%)' }}
        />
        <span className="relative min-w-0 flex-1">
          <span className="block text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/55">{b.tuPlata}</span>
          <span className="mt-1 block text-[15px] font-semibold text-menta">{b.cargaTusCuentas}</span>
        </span>
      </Link>
    );
  }

  return (
    <section className="space-y-3" aria-label={b.tuPlata}>
      {/* ---- el total ---- */}
      <div className="relative overflow-hidden rounded-3xl bg-noche px-5 py-4 text-white shadow-tarjeta">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-40 blur-2xl"
          style={{ background: 'radial-gradient(circle, #3ddc9a, transparent 65%)' }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/55">{b.tuPlata}</p>
            <p className="mt-1.5 truncate text-[30px] font-bold leading-none tabular-nums tracking-tight">
              {plata(billetera.total)}
            </p>
            <p className="mt-2 text-[12.5px] text-white/55">
              {b.enNCuentas(cuentas.length)}
              {' · '}
              <Link href="/billetera" className="font-semibold text-menta hover:underline">{b.verTodo}</Link>
            </p>
          </div>
          <BotonOjo oculto={oculto} alCambiar={alternar} clase="shrink-0 bg-white/10 text-white hover:bg-white/15" />
        </div>
      </div>

      {/* ---- una tarjeta por banco, para deslizar de costado ---- */}
      <div
        ref={fila}
        onScroll={alDeslizar}
        className="scroll-limpio -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 lg:mx-0 lg:scroll-px-0 lg:px-0"
      >
        {cuentas.map((c, i) => (
          <Link
            key={c.id}
            href="/billetera"
            className="relative flex w-[78%] max-w-[320px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-3xl p-4 text-white shadow-tarjeta transition active:scale-[0.98] sm:w-[300px]"
            style={{ background: FONDOS[i % FONDOS.length], minHeight: 150 }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[13px] font-bold uppercase tracking-[0.12em]">{c.nombre}</p>
              <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] font-semibold">
                {b.tipos[c.tipo]}
              </span>
            </div>
            <div>
              <p className="mt-6 text-[26px] font-bold leading-none tabular-nums tracking-tight">{plata(Number(c.saldo))}</p>
              <p className="mt-2 truncate text-[11.5px] text-white/70">
                {c.metodos.length > 0
                  ? b.recibe(c.metodos.map((m) => metodoVisible(t, m)).join(', '))
                  : b.noRecibeNada}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {cuentas.length > 1 && (
        <div className="flex items-center justify-center gap-1.5" aria-label={b.deslizaParaVer}>
          {cuentas.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => irA(i)}
              aria-label={c.nombre}
              className={`h-1.5 rounded-full transition-all ${i === actual ? 'w-5 bg-verde' : 'w-1.5 bg-tinta/20'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
