import Link from 'next/link';
import { type Moneda, dinero, dineroCorto, fechaLegible } from '@/lib/formato';
import { Seccion, Vacio } from '@/components/Piezas';
import type { ResumenPersonal, ResumenDeudas } from '@/lib/tipos';
import type { Textos as Diccionario } from '@/i18n';
import { categoriaVisible } from '@/i18n/nombres';

/**
 * EL PANEL DE UNA CUENTA PERSONAL
 *
 * Es una pantalla aparte y no el panel de siempre con condicionales, y eso
 * es la lección más cara que nos dejó este producto: el cierre del día se le
 * quedó meses a las cuentas personales justamente porque una sola pantalla
 * trataba de servir a todos y nadie se acordó de mirar ese caso.
 *
 * Lo que el panel de negocio muestra —ganancia bruta, margen, ranking de
 * productos, cobros por método, ticket promedio— no significa nada para
 * alguien que cobra un sueldo. Peor: le habla como si vendiera algo. Una
 * persona no tiene «ganancia neta», tiene lo que le queda hasta fin de mes.
 *
 * Arriba de este panel ya está la billetera: la plata de verdad, banco por
 * banco. Por eso acá no se repite ningún total. Tenía «Disponible» —lo que
 * queda del ciclo— e «Ingresos del período», y tres números grandes que
 * salen de cuentas distintas, uno abajo del otro, no informan: hacen dudar
 * cuál es la plata. Matías: «que se vea solo el saldo que tenemos en
 * billetera».
 *
 * El presupuesto no se perdió, se quedó donde se calcula y se edita: en
 * Organización están el disponible, cuánto por día, hasta qué fecha y el
 * aviso de que falta registrar el cobro.
 *
 * Acá queda lo que la billetera no contesta:
 *
 *   1. ¿Cuánto gasté?
 *   2. ¿Cuánto tengo guardado?
 *   3. ¿Cuánto debo?
 *   4. ¿De dónde vino lo que entró?
 */
export function PanelPersonal({
  resumen, deudas, moneda, locale, t,
}: {
  resumen: ResumenPersonal;
  deudas: ResumenDeudas | null;
  moneda: Moneda;
  locale: string;
  t: Diccionario;
}) {
  const plata = (n: number) => dinero(n, moneda, true, locale);
  const corto = (n: number) => dineroCorto(n, moneda, locale, t.formato);

  const mayorEntrada = resumen.de_donde_vino[0] ?? null;
  const totalEntradas = resumen.de_donde_vino.reduce((s, e) => s + Number(e.monto), 0);

  return (
    <div className="space-y-4">
      {/* ---------- Los números que la billetera no dice ----------
          Eran cuadros en cuadrícula, y al quedar tres, en un teléfono
          «Gs. 1,8 M» se partía en tres renglones y «próximo vencimiento»
          se cortaba. Van como la billetera de arriba —una fila por número,
          el monto entero a la derecha—, que es el estilo que eligió Matías
          y encima entra sin abreviar. */}
      <section className="tarjeta divide-y divide-borde">
        <Fila
          titulo={t.organizacion.salio}
          valor={plata(resumen.salio)}
          detalle={t.panelPersonal.enEstePeriodo}
          tono="malo"
        />
        <Fila
          titulo={t.panelPersonal.guardado}
          valor={plata(resumen.ahorro_total)}
          detalle={resumen.ahorrado_en_el_ciclo > 0
            ? t.panelPersonal.esteMes(corto(resumen.ahorrado_en_el_ciclo))
            : undefined}
        />
        <Fila
          titulo={t.nav.deudas}
          valor={plata(deudas?.total_debido ?? 0)}
          tono={(deudas?.total_debido ?? 0) > 0 ? 'malo' : undefined}
          detalle={deudas?.proximo_vencimiento
            ? t.panelPersonal.venceEl(fechaLegible(deudas.proximo_vencimiento, false, locale))
            : undefined}
        />
        {/* Lo que le deben, aparte de lo que debe: son dos cosas distintas y
            mezclarlas en un solo número confundiría cuál suma y cuál resta. */}
        {resumen.fiado_pendiente > 0 && (
          <Fila
            titulo={t.panelPersonal.teDeben}
            valor={plata(resumen.fiado_pendiente)}
            tono="bueno"
          />
        )}
      </section>

      {/* ---------- De dónde vino lo que entró ---------- */}
      <Seccion
        titulo={t.panelPersonal.deDondeVino}
        accion={
          <Link href="/organizacion" className="boton-texto">{t.panelPersonal.organizar}</Link>
        }
      >
        {resumen.de_donde_vino.length === 0 ? (
          <div className="px-4 pb-4">
            <Vacio
              titulo={t.panelPersonal.sinEntradas}
              detalle={t.panelPersonal.sinEntradasDetalle}
            />
          </div>
        ) : (
          <ul className="divide-y divide-borde border-t border-borde">
            {resumen.de_donde_vino.map((e) => {
              const parte = totalEntradas > 0 ? (Number(e.monto) / totalEntradas) * 100 : 0;
              return (
                <li key={e.categoria} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[14.5px] font-semibold">{categoriaVisible(t, e.categoria)}</span>
                    <span className="shrink-0 text-[14.5px] font-bold tabular-nums text-verde-fuerte">
                      {plata(Number(e.monto))}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-arena">
                    <div className="h-full rounded-full bg-verde" style={{ width: `${parte}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Lo que de verdad se quiere saber cuando se mira esto: cuánto de lo
            que entró NO era el sueldo. Es la diferencia entre gano bien y
            este mes zafé. */}
        {mayorEntrada && resumen.de_donde_vino.length > 1 && (
          <p className="border-t border-borde px-4 py-3 text-[13px] leading-relaxed text-tinta/55">
            {t.panelPersonal.fueraDeLoHabitual(
              plata(totalEntradas - Number(mayorEntrada.monto)),
              categoriaVisible(t, mayorEntrada.categoria),
            )}
          </p>
        )}
      </Seccion>

      {/* ---------- Lo guardado, fondo por fondo ---------- */}
      <Seccion
        titulo={t.panelPersonal.tusAhorros}
        accion={<Link href="/organizacion" className="boton-texto">{t.comun.verTodo}</Link>}
      >
        {resumen.ahorros.length === 0 ? (
          <div className="px-4 pb-4">
            <Vacio titulo={t.panelPersonal.sinAhorros} detalle={t.panelPersonal.sinAhorrosDetalle} />
          </div>
        ) : (
          <ul className="divide-y divide-borde border-t border-borde">
            {resumen.ahorros.map((a) => {
              const avance = a.meta && a.meta > 0
                ? Math.min(100, (a.saldo / a.meta) * 100)
                : null;
              return (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[14.5px] font-semibold">{a.nombre}</span>
                    <span className="shrink-0 text-[14.5px] font-bold tabular-nums">
                      {plata(a.saldo)}
                    </span>
                  </div>
                  {avance !== null && (
                    <>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-arena">
                        <div
                          className="h-full rounded-full bg-verde transition-all"
                          style={{ width: `${avance}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-tinta/55">
                        {t.panelPersonal.deLaMeta(plata(a.meta!), Math.round(avance))}
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>
    </div>
  );
}

function Fila({
  titulo, valor, detalle, tono,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  tono?: 'bueno' | 'malo';
}) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : '';
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <span className="min-w-0">
        <span className="block text-[14.5px] font-semibold">{titulo}</span>
        {detalle && <span className="mt-0.5 block truncate text-[12.5px] text-tinta/50">{detalle}</span>}
      </span>
      <span className={`shrink-0 text-[16px] font-bold tabular-nums tracking-tight ${color}`}>{valor}</span>
    </div>
  );
}
