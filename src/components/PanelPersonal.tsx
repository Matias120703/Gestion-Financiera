import Link from 'next/link';
import { dinero, dineroCorto, fechaLegible } from '@/lib/formato';
import { Seccion, Vacio } from '@/components/Piezas';
import type { ResumenPersonal, ResumenDeudas } from '@/lib/tipos';
import type { Textos as Diccionario } from '@/i18n';

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
 * Este panel contesta cuatro preguntas, en este orden:
 *
 *   1. ¿Cuánto me queda y para cuántos días?
 *   2. ¿De dónde vino lo que entró?
 *   3. ¿Cuánto tengo guardado?
 *   4. ¿Cuánto debo?
 */
export function PanelPersonal({
  resumen, deudas, moneda, locale, t,
}: {
  resumen: ResumenPersonal;
  deudas: ResumenDeudas | null;
  moneda: string;
  locale: string;
  t: Diccionario;
}) {
  const plata = (n: number) => dinero(n, moneda, true, locale);
  const corto = (n: number) => dineroCorto(n, moneda, locale, t.formato);
  const enRojo = resumen.disponible < 0;

  const mayorEntrada = resumen.de_donde_vino[0] ?? null;
  const totalEntradas = resumen.de_donde_vino.reduce((s, e) => s + Number(e.monto), 0);

  return (
    <div className="space-y-4">
      {/* ---------- 1. Lo único que de verdad importa ---------- */}
      <section className="tarjeta p-5">
        {resumen.cobro_pendiente ? (
          <>
            <p className="titulo-seccion text-ambar">{t.organizacion.cobroPendiente}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-tinta/65">
              {t.organizacion.cobroPendienteDetalle}
            </p>
          </>
        ) : (
          <>
            <p className="titulo-seccion">{t.organizacion.teQuedan}</p>
            <p className={`mt-1 text-[40px] font-bold leading-none tracking-tight ${
              enRojo ? 'text-rojo' : 'text-verde-fuerte'
            }`}>
              {plata(resumen.disponible)}
            </p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-tinta/60">
              {t.organizacion.paraDias(resumen.dias_restantes)}
              {', '}
              {resumen.ingresos_fijos.length > 0
                ? t.organizacion.hastaEl(fechaLegible(resumen.hasta, false, locale))
                : t.organizacion.hastaFinDeMes(fechaLegible(resumen.hasta, false, locale))}
              .
            </p>
            {enRojo ? (
              <p className="mt-3 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">
                {t.organizacion.enRojo}
              </p>
            ) : (
              <p className="mt-3 inline-block rounded-lg bg-arena px-2.5 py-1 text-[13px] font-semibold text-tinta/70">
                {t.organizacion.porDia(plata(resumen.por_dia))}
              </p>
            )}
          </>
        )}
      </section>

      {/* ---------- Los cuatro números de contexto ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cuadro titulo={t.organizacion.entro} valor={corto(resumen.entro)} tono="bueno" />
        <Cuadro titulo={t.organizacion.salio} valor={corto(resumen.salio)} tono="malo" />
        <Cuadro
          titulo={t.panelPersonal.guardado}
          valor={corto(resumen.ahorro_total)}
          detalle={resumen.ahorrado_en_el_ciclo > 0
            ? t.panelPersonal.esteMes(corto(resumen.ahorrado_en_el_ciclo))
            : undefined}
        />
        <Cuadro
          titulo={t.nav.deudas}
          valor={corto(deudas?.total_debido ?? 0)}
          tono={(deudas?.total_debido ?? 0) > 0 ? 'malo' : undefined}
          detalle={deudas?.proximo_vencimiento
            ? t.panelPersonal.venceEl(fechaLegible(deudas.proximo_vencimiento, false, locale))
            : undefined}
        />
      </div>

      {/* ---------- 2. De dónde vino ---------- */}
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
                    <span className="truncate text-[14.5px] font-semibold">{e.categoria}</span>
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
              mayorEntrada.categoria,
            )}
          </p>
        )}
      </Seccion>

      {/* ---------- 3. Lo guardado ---------- */}
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

function Cuadro({
  titulo, valor, detalle, tono,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  tono?: 'bueno' | 'malo';
}) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : '';
  return (
    <div className="tarjeta p-3.5">
      <p className="titulo-seccion truncate">{titulo}</p>
      <p className={`mt-1 text-[19px] font-bold tracking-tight ${color}`}>{valor}</p>
      {detalle && <p className="mt-0.5 truncate text-[12px] text-tinta/45">{detalle}</p>}
    </div>
  );
}
