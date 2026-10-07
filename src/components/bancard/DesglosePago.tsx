'use client';

import { useTextos } from '@/i18n/cliente';
import { precio } from '@/lib/formato';
import type { Cotizacion } from '@/lib/cotizacion';

/**
 * LO QUE SE COBRA, LÍNEA POR LÍNEA.
 *
 *   Premium                              Gs. 250.000
 *   2 personas más × Gs. 60.000          Gs. 120.000
 *   Descuento de tu primer pago (−18 %) − Gs.  66.600
 *   Total                                Gs. 303.400   ≈ US$ 51
 *
 * Y, cuando hay personas de más, la cuenta entera como la dijo Matías:
 * «Premium Gs. 250.000 + 2 personas más × Gs. 60.000 = Gs. 370.000».
 *
 * Los números son los de la base (`cotizar_plan`), recalculados al instante
 * con `recalcular()` al tocar − y +. Lo que se cobra lo vuelve a calcular el
 * servidor al abrir el pago: esto es para mostrar.
 */
export function DesglosePago({ cot, nombrePlan, locale }: { cot: Cotizacion; nombrePlan: string; locale: string }) {
  const t = useTextos();
  const d = t.bancard.desglose;
  const h = t.bancard.hoja;
  const gs = (n: number) => precio(n, 'PYG', locale);
  const anual = cot.periodo === 'anual';
  const pct = Math.round(Number(cot.descuento_porcentaje) * 100) / 100;

  return (
    <div className="rounded-2xl border border-borde p-4">
      <dl className="space-y-2 text-[13.5px]">
        <Linea etiqueta={d.plan(nombrePlan, anual)} valor={gs(cot.lista)} />
        {cot.personas_extra > 0 && cot.precio_por_persona !== null && (
          <Linea etiqueta={d.personasMas(cot.personas_extra, gs(cot.precio_por_persona), anual)} valor={gs(cot.extras)} />
        )}
        {cot.descuento > 0 && (
          <Linea
            etiqueta={cot.descuento_fase === 'constancia' ? d.descuentoConstancia(pct) : d.descuentoPrimerPago(pct)}
            valor={`− ${gs(cot.descuento)}`}
            verde
          />
        )}
      </dl>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-borde pt-3">
        <span className="text-[14px] font-bold">{d.total}</span>
        <span className="text-right">
          <span className="text-[22px] font-titulo font-extrabold tabular-nums">{gs(cot.total)}</span>
          {cot.referencia_usd !== null && (
            <span className="ml-2 text-[12.5px] font-semibold tabular-nums text-tinta/45">
              {h.referencia(precio(Number(cot.referencia_usd), 'USD', locale))}
            </span>
          )}
        </span>
      </div>
      {cot.personas_extra > 0 && cot.precio_por_persona !== null && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-tinta/60">
          {h.frase(nombrePlan, gs(cot.lista), cot.personas_extra, gs(cot.precio_por_persona), gs(cot.subtotal), anual)}
        </p>
      )}
      {anual && <p className="mt-1.5 text-[12.5px] leading-relaxed text-tinta/60">{h.planAnual}</p>}
    </div>
  );
}

function Linea({ etiqueta, valor, verde = false }: { etiqueta: string; valor: string; verde?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={verde ? 'text-verde-fuerte' : 'text-tinta/70'}>{etiqueta}</dt>
      <dd className={`shrink-0 font-semibold tabular-nums ${verde ? 'text-verde-fuerte' : ''}`}>{valor}</dd>
    </div>
  );
}
