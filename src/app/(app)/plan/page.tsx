import { contextoObligatorio } from '@/lib/sesion';
import { textos } from '@/i18n';
import { FICHA } from '@/i18n/idiomas';
import { dinero } from '@/lib/formato';
import {
  LIMITES_VISIBLES, MONEDAS_DE_COBRO, mesesDeRegalo, monedaDeCobro, precioDe, traerPrecios,
  type PlanPago,
} from '@/lib/precios';
import type { PeriodoCobro } from '@/lib/tipos';
import { SelectorCobro } from '@/components/SelectorCobro';
import { BotonPagar } from '@/components/BotonPagar';

export const dynamic = 'force-dynamic';

/**
 * PLANES Y PRECIOS
 *
 * Dos decisiones que se ven en pantalla y conviene entender:
 *
 *   · SE MUESTRA LO QUE SE PIERDE, NO LO QUE SE BLOQUEA. Al vencer la
 *     prueba no se le quitan los datos a nadie: se le quita la magia. Por eso
 *     el plan gratis lista "todo tu historial, siempre" en primer lugar. Que
 *     nadie tenga miedo de quedarse afuera de sus propios números.
 *
 *   · EL PRECIO SE ELIGE EN SU MONEDA. Guaraníes para quien lee en español,
 *     dólares para el resto, y se puede cambiar a mano. Ver un precio en una
 *     moneda ajena obliga a hacer una cuenta mental antes de decidir, y esa
 *     cuenta es donde se pierde la venta.
 */
export default async function PaginaPlan({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await contextoObligatorio();
  const t = textos();
  const locale = FICHA[ctx.idioma].locale;

  const moneda = monedaDeCobro(ctx.idioma, typeof searchParams.moneda === 'string' ? searchParams.moneda : null);
  const periodo: PeriodoCobro = searchParams.periodo === 'anual' ? 'anual' : 'mensual';

  const precios = await traerPrecios(moneda);
  const sus = ctx.suscripcion;
  const uso = ctx.capturasIA;

  const regalo = mesesDeRegalo(precioDe(precios, 'pro', 'mensual'), precioDe(precios, 'pro', 'anual'));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight">{t.plan.titulo}</h1>
      </header>

      {/* ---------------- Dónde está parada la persona ---------------- */}
      {sus.en_prueba && (
        <div className="tarjeta border-verde/40 bg-verde-claro/50 p-4">
          <p className="text-[15px] font-bold text-verde-fuerte">{t.plan.enPrueba}</p>
          <p className="mt-1 text-[14px] font-semibold">{t.plan.diasDePrueba(sus.dias_restantes)}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-tinta/60">{t.plan.pruebaVence}</p>
        </div>
      )}

      {!sus.en_prueba && ctx.planEfectivo === 'gratis' && sus.ya_uso_prueba && (
        <div className="tarjeta border-ambar/40 bg-ambar-claro/50 p-4">
          <p className="text-[15px] font-bold text-ambar">{t.plan.vencida}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-tinta/60">{t.plan.vencidaDetalle}</p>
        </div>
      )}

      {/* Uso de IA del mes. Solo tiene sentido mostrarlo si hay un tope
          alcanzable: en un plan con 3000 capturas nadie mira este número. */}
      {uso.tope > 0 && uso.tope <= 100 && (
        <div className="tarjeta p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] font-semibold text-tinta/60">
              {t.plan.capturasUsadas(uso.usados, uso.tope)}
            </span>
            <span className="text-[13px] font-bold tabular-nums">
              {Math.max(0, uso.tope - uso.usados)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-arena">
            <div
              className={`h-full rounded-full ${uso.usados >= uso.tope ? 'bg-rojo' : 'bg-verde'}`}
              style={{ width: `${Math.min(100, (uso.usados / uso.tope) * 100)}%` }}
            />
          </div>
          {uso.usados >= uso.tope && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-tinta/55">
              {t.plan.capturasAgotadasDetalle}
            </p>
          )}
        </div>
      )}

      <SelectorCobro
        moneda={moneda}
        periodo={periodo}
        monedas={[...MONEDAS_DE_COBRO]}
        etiquetaMensual={t.plan.mensual}
        etiquetaAnual={t.plan.anual}
        etiquetaAhorro={regalo > 0 ? t.plan.ahorroAnual : ''}
      />

      {/* ---------------- Los tres planes ---------------- */}
      <div className="grid gap-4 md:grid-cols-3">
        <Tarjeta
          nombre={t.plan.gratis}
          precio={dinero(0, moneda, true, locale)}
          porPeriodo=""
          actual={ctx.planEfectivo === 'gratis'}
          etiquetaActual={t.plan.actual}
          incluye={t.plan.incluye}
          puntos={[
            t.plan.historialCompleto,
            t.plan.soloManual,
            t.plan.capturasMes(LIMITES_VISIBLES.gratis.capturas),
            t.plan.personas(LIMITES_VISIBLES.gratis.miembros),
          ]}
        />

        {(['pro', 'negocio'] as PlanPago[]).map((plan) => {
          const precio = precioDe(precios, plan, periodo);
          const limites = LIMITES_VISIBLES[plan];
          const esActual = ctx.planEfectivo === plan;

          return (
            <Tarjeta
              key={plan}
              nombre={plan === 'pro' ? t.plan.pro : t.plan.negocio}
              destacado={plan === 'pro'}
              precio={precio ? dinero(Number(precio.importe), moneda, true, locale) : t.comun.sinDato}
              porPeriodo={periodo === 'anual' ? `/ ${t.plan.porAnio}` : `/ ${t.plan.porMes}`}
              actual={esActual}
              etiquetaActual={t.plan.actual}
              incluye={t.plan.incluye}
              puntos={[
                t.plan.capturasLibres,
                t.plan.personas(limites.miembros),
                t.plan.conAdjuntos,
                t.plan.conExcel,
              ]}
              pie={
                esActual ? null : (
                  <BotonPagar
                    plan={plan}
                    periodo={periodo}
                    moneda={moneda}
                    etiqueta={t.plan.elegir}
                    sinPasarela={t.plan.pagoNoDisponible}
                  />
                )
              }
            />
          );
        })}
      </div>

      <p className="text-center text-[12.5px] font-semibold text-tinta/40">
        {t.plan.sinTarjeta} · {t.plan.cancelarCuando}
      </p>
    </div>
  );
}

function Tarjeta({
  nombre, precio, porPeriodo, puntos, incluye, actual, etiquetaActual, destacado = false, pie = null,
}: {
  nombre: string;
  precio: string;
  porPeriodo: string;
  puntos: string[];
  incluye: string;
  actual: boolean;
  etiquetaActual: string;
  destacado?: boolean;
  pie?: React.ReactNode;
}) {
  return (
    <div className={`tarjeta flex flex-col p-5 ${destacado ? 'border-verde/50 ring-1 ring-verde/20' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold tracking-tight">{nombre}</h2>
        {actual && (
          <span className="pastilla bg-verde-claro text-verde-fuerte">{etiquetaActual}</span>
        )}
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[24px] font-bold tracking-tight tabular-nums">{precio}</span>
        {porPeriodo && <span className="text-[13px] font-semibold text-tinta/45">{porPeriodo}</span>}
      </p>

      <p className="mt-4 titulo-seccion">{incluye}</p>
      <ul className="mt-2 flex-1 space-y-2">
        {puntos.map((punto) => (
          <li key={punto} className="flex items-start gap-2 text-[13.5px] leading-snug text-tinta/70">
            <svg viewBox="0 0 24 24" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-verde"
                 fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 13 4 4L19 7" />
            </svg>
            {punto}
          </li>
        ))}
      </ul>

      {pie && <div className="mt-5">{pie}</div>}
    </div>
  );
}
