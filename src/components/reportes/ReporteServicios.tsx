import Link from 'next/link';
import type { PropsReporte } from './comunes/tipos';
import { IndicadorVariacion } from './comunes/IndicadorVariacion';
import { GraficoPorDia } from './comunes/GraficoPorDia';
import { Barra, Seccion, Vacio } from '@/components/Piezas';
import {
  traerCobrosPorMetodo, traerGastosPorCategoria, traerRanking, traerReporteTurnos,
} from '@/lib/agregados';
import { traerProductos } from '@/lib/datos';
import { traerResumenFiado } from '@/lib/fiado';
import { traerLiquidacion, traerResumenReparto } from '@/lib/reparto';
import { palabra } from '@/lib/rubros';
import {
  dinero, dineroCorto, dineroQuizas, fechaLegible, numero, porcentaje, porcentajeQuizas,
} from '@/lib/formato';
import { categoriaVisible, metodoVisible } from '@/i18n/nombres';
import {
  DESDE_SIEMPRE, aReponer, cuentaDelLocal, faltaPagarAlEquipo, filasDelEquipo, gastosVisibles, separarRanking,
  type FilaEquipo,
} from '@/lib/reportes/excel-servicios';
import type { ReporteTurnos } from '@/lib/tipos';

/**
 * EL REPORTE DE SERVICIOS Y OFICIOS: BARBERÍA, PELUQUERÍA, TALLER (23/09).
 *
 * Contesta lo que el dueño se pregunta a fin de mes, en este orden:
 *   1. ¿Cuánto me quedó a mí, limpio? Cobrado → quedó para el local (después
 *      de la parte del equipo) → gastos → ganancia neta, con la flecha
 *      contra el período anterior y de dónde salió lo que quedó.
 *   2. ¿Cuánto le debo a cada uno y cuánto ya le pagué? Por profesional,
 *      con «le debés» a la fecha (no solo del período) y quien alquila la
 *      silla sin una deuda que no existe (106).
 *   3. ¿Se me llenó la agenda? Turnos atendidos, no vino, cancelados y por
 *      el link.
 *   4. ¿Qué servicios salen y cuánto me dejan? Los servicios por un lado, la
 *      mercadería por otro, con el aviso de los productos sin costo.
 *   5. Cómo me pagaron, en qué se fue, quién vuelve, quién me debe, qué
 *      reponer.
 *
 * Cada bloque aparece si hay con qué llenarlo: un plomero sin equipo ni
 * agenda no ve «por profesional» ni «turnos». No hay «Quieto en el
 * estante»: un servicio no tiene stock.
 *
 * Las cuentas (el desglose, qué es mercadería, lo que falta pagar, los
 * gastos sin la mercadería aparte) son las mismas funciones que arma el
 * Excel: src/lib/reportes/excel-servicios.ts. Los dos dicen lo mismo.
 */
export async function ReporteServicios({
  empresaId, rubro, tipoCuenta, rango, resumen: r, resumenPrevio: rp, moneda: m, t, idioma, locale, permisos,
}: PropsReporte) {
  // El reparto y la liquidación son de administración (la base rechaza a
  // cualquier otro). Hoy a Reportes solo entra administración; si eso cambia,
  // el reporte no se cae: muestra lo demás.
  const verPlata = permisos.verRentabilidad;
  const [ranking, categorias, metodos, productos, turnos, reparto, liquidacion, acumulada, fiado] = await Promise.all([
    traerRanking(empresaId, rango.desde, rango.hasta),
    traerGastosPorCategoria(empresaId, rango.desde, rango.hasta),
    traerCobrosPorMetodo(empresaId, rango.desde, rango.hasta),
    traerProductos(empresaId),
    traerReporteTurnos(empresaId, rango.desde, rango.hasta),
    verPlata ? traerResumenReparto(empresaId, rango.desde, rango.hasta) : Promise.resolve(null),
    verPlata ? traerLiquidacion(empresaId, rango.desde, rango.hasta) : Promise.resolve([]),
    verPlata ? traerLiquidacion(empresaId, DESDE_SIEMPRE, rango.hasta) : Promise.resolve([]),
    verPlata ? traerResumenFiado(empresaId) : Promise.resolve({ total: 0, cuantos: 0, clientes: [] }),
  ]);

  const s = t.reportesServicios;
  const cobrado = palabra(rubro, tipoCuenta, 'ventas', t.panel.vendido, idioma);
  const corto = (n: number) => dineroCorto(n, m, locale);
  const plata = (n: number) => dinero(n, m, true, locale);
  const verRent = verPlata && r.conCostos;

  const cuenta = cuentaDelLocal(r, reparto, liquidacion);
  const { servicios, mercaderia, sinCosto } = separarRanking(ranking, productos);
  const reponer = aReponer(productos);
  const gastos = gastosVisibles(categorias, r);
  const equipo = filasDelEquipo(liquidacion, acumulada, turnos);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <IndicadorVariacion
          titulo={cobrado} valor={corto(r.ventas)} actual={r.ventas} anterior={rp.ventas} formato={corto} t={t}
          detalle={s.indicadores.cobros(numero(r.cantidadVentas, locale))} destacado={!verRent}
        />
        {verRent && (
          <>
            <IndicadorVariacion
              titulo={s.indicadores.quedo} valor={corto(r.gananciaBruta)} formato={corto} t={t}
              actual={r.gananciaBruta} anterior={rp.conCostos ? rp.gananciaBruta : null}
              detalle={s.indicadores.quedoDetalle}
            />
            <IndicadorVariacion
              titulo={s.indicadores.gastos} valor={corto(r.gastos)} actual={r.gastos} anterior={rp.gastos}
              formato={corto} t={t} subirEsBueno={false} tono="malo"
            />
            <IndicadorVariacion
              titulo={s.indicadores.neta} valor={corto(r.gananciaNeta)} formato={corto} t={t} destacado
              actual={r.gananciaNeta} anterior={rp.conCostos ? rp.gananciaNeta : null}
              tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'}
            />
          </>
        )}
      </div>

      {verRent && (gastos.comprasAparte !== null || r.pagadoAProfesionales > 0) && (
        <div className="tarjeta space-y-2 p-4 text-[13.5px] leading-relaxed text-tinta/65">
          {gastos.comprasAparte !== null && <p>{s.aparte.mercaderia(plata(gastos.comprasAparte))}</p>}
          {r.pagadoAProfesionales > 0 && <p>{s.aparte.comision(plata(r.pagadoAProfesionales))}</p>}
        </div>
      )}

      <GraficoPorDia
        empresaId={empresaId} desde={rango.desde} hasta={rango.hasta}
        moneda={m} t={t} locale={locale} etiquetaVentas={cobrado}
      />

      {verRent && cuenta && (
        <Seccion titulo={s.cuenta.titulo}>
          <dl className="px-4 pb-4 pt-2">
            <Linea etiqueta={s.cuenta.tusServicios} detalle={s.cuenta.tusServiciosDetalle} valor={plata(cuenta.misCortes)} />
            <Linea etiqueta={s.cuenta.deTuEquipo} detalle={s.cuenta.deTuEquipoDetalle} valor={plata(cuenta.deMiEquipo)} />
            <Linea etiqueta={s.cuenta.productos} detalle={s.cuenta.productosDetalle} valor={plata(cuenta.productos)} />
            <Linea etiqueta={s.cuenta.quedo} valor={plata(cuenta.quedo)} fuerte />
            <Linea etiqueta={s.cuenta.otrosIngresos} detalle={s.cuenta.otrosIngresosDetalle} valor={`+ ${plata(r.otrosIngresos)}`} />
            <Linea etiqueta={s.cuenta.gastos} valor={`− ${plata(r.gastos)}`} tono="malo" />
            <Linea etiqueta={s.cuenta.neta} valor={plata(r.gananciaNeta)} fuerte tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'} />
          </dl>
        </Seccion>
      )}

      {verRent && equipo.length > 0 && (
        <Equipo equipo={equipo} hasta={rango.hasta} m={m} t={t} locale={locale} />
      )}

      {turnos.total > 0 && <Turnos turnos={turnos} t={t} />}

      <Seccion titulo={s.servicios.titulo}>
        {servicios.length === 0 ? (
          <Vacio titulo={s.servicios.sinServicios} detalle={s.servicios.sinServiciosDetalle} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[560px]">
              <thead>
                <tr>
                  <th>{s.servicios.colServicio}</th>
                  <th className="num">{s.servicios.colVeces}</th>
                  <th className="num">{cobrado}</th>
                  {verRent && <th className="num">{s.servicios.colEquipo}</th>}
                  {verRent && <th className="num">{s.servicios.colLocal}</th>}
                  {verRent && <th className="num">{s.servicios.colPct}</th>}
                </tr>
              </thead>
              <tbody>
                {servicios.map((p) => (
                  <tr key={p.producto_id ?? p.nombre}>
                    <td>
                      <span className="block font-semibold">{p.nombre}</span>
                      <span className="mt-1 block max-w-[140px]"><Barra porcentaje={p.participacion} /></span>
                    </td>
                    <td className="num font-semibold">{numero(p.unidades, locale)}</td>
                    <td className="num">{dinero(p.ingresos, m, false, locale)}</td>
                    {verRent && <td className="num text-tinta/50">{dineroQuizas(p.costo, m, false, locale)}</td>}
                    {verRent && <td className="num font-bold text-verde-fuerte">{dineroQuizas(p.ganancia, m, false, locale)}</td>}
                    {verRent && <td className="num text-tinta/60">{porcentajeQuizas(p.margen, 0, locale)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {mercaderia.length > 0 && (
        <Seccion titulo={s.mercaderia.titulo}>
          {verRent && sinCosto > 0 && (
            <p className="mx-4 mt-2 rounded-xl bg-ambar-claro px-3 py-2 text-[13px] font-semibold text-ambar">
              {s.mercaderia.sinCosto(sinCosto)}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="tabla min-w-[560px]">
              <thead>
                <tr>
                  <th>{s.mercaderia.colProducto}</th>
                  <th className="num">{s.mercaderia.colUnidades}</th>
                  <th className="num">{cobrado}</th>
                  {verRent && <th className="num">{s.mercaderia.colCosto}</th>}
                  {verRent && <th className="num">{s.mercaderia.colGanancia}</th>}
                  {verRent && <th className="num">{s.mercaderia.colMargen}</th>}
                </tr>
              </thead>
              <tbody>
                {mercaderia.map((p) => (
                  <tr key={p.producto_id ?? p.nombre}>
                    <td>
                      <span className="block font-semibold">{p.nombre}</span>
                      {verRent && p.costo === 0 && p.ingresos > 0 && (
                        <span className="pastilla mt-1 bg-ambar-claro text-ambar">{s.mercaderia.marcaSinCosto}</span>
                      )}
                    </td>
                    <td className="num font-semibold">{numero(p.unidades, locale)}</td>
                    <td className="num">{dinero(p.ingresos, m, false, locale)}</td>
                    {verRent && <td className="num text-tinta/50">{dineroQuizas(p.costo, m, false, locale)}</td>}
                    {verRent && (
                      <td className={`num font-bold ${p.ganancia === null ? 'text-tinta/30' : p.ganancia >= 0 ? 'text-verde-fuerte' : 'text-rojo'}`}>
                        {dineroQuizas(p.ganancia, m, false, locale)}
                      </td>
                    )}
                    {verRent && <td className="num text-tinta/60">{porcentajeQuizas(p.margen, 0, locale)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo={s.cobros.titulo}>
          {metodos.length === 0 ? (
            <Vacio titulo={s.cobros.sinCobros} detalle={s.cobros.sinCobrosDetalle} />
          ) : (
            <div className="space-y-3.5 px-4 pb-4 pt-3">
              {metodos.map(({ metodo, monto, participacion }) => (
                <div key={metodo}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold">
                      {metodoVisible(t, metodo)}
                      {/* «Crédito» es el fiado (055): se cobró, pero la plata todavía no está. */}
                      {metodo === 'credito' && (
                        <span className="ml-1.5 text-[12px] font-normal text-tinta/45">({s.cobros.todaviaNoEntro})</span>
                      )}
                    </span>
                    <span className="text-[13.5px] font-bold tabular-nums">{dinero(monto, m, false, locale)}</span>
                  </div>
                  <Barra porcentaje={participacion} tono={metodo === 'credito' ? 'ambar' : 'verde'} />
                  <p className="mt-1 text-[11.5px] font-semibold text-tinta/40">{porcentaje(participacion, 0, locale)}</p>
                </div>
              ))}
            </div>
          )}
        </Seccion>

        {verRent && (
          <Seccion titulo={s.gastos.titulo}>
            {gastos.filas.length === 0 ? (
              <Vacio titulo={s.gastos.sinGastos} detalle={s.gastos.sinGastosDetalle} />
            ) : (
              <div className="overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>{s.gastos.colCategoria}</th>
                      <th className="num">{s.gastos.colTotal}</th>
                      <th className="num">{s.gastos.colMov}</th>
                      <th className="num">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.filas.map((c) => (
                      <tr key={c.nombre}>
                        <td className="font-semibold">{categoriaVisible(t, c.nombre)}</td>
                        <td className="num font-semibold text-rojo">{dinero(c.monto, m, false, locale)}</td>
                        <td className="num text-tinta/50">{c.operaciones}</td>
                        <td className="num text-tinta/60">{porcentaje(c.participacion, 0, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>
        )}
      </div>

      {turnos.clientes.length > 0 && (
        <Seccion titulo={s.clientes.titulo}>
          <ul className="divide-y divide-borde/60 px-4 pb-2">
            {turnos.clientes.slice(0, 10).map((c) => (
              <li key={c.cliente_id} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-[14px] font-semibold">{c.nombre}</span>
                <span className="shrink-0 text-right text-[12.5px] text-tinta/55">
                  <span className="font-bold text-tinta">{s.clientes.visitas(c.visitas)}</span>
                  <span className="block">{s.clientes.ultima(fechaLegible(c.ultima, false, locale))}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-4 text-[12px] text-tinta/45">{s.clientes.nota}</p>
        </Seccion>
      )}

      {verRent && fiado.total > 0 && (
        <Seccion
          titulo={s.teDeben.titulo}
          accion={<Link href="/fiado" className="flex min-h-[44px] items-center text-[13px] font-semibold text-verde-fuerte">{s.teDeben.ver}</Link>}
        >
          <p className="px-4 pt-1 text-[13.5px] text-tinta/60">{s.teDeben.resumen(plata(fiado.total), fiado.cuantos)}</p>
          <ul className="divide-y divide-borde/60 px-4 pb-3">
            {fiado.clientes.slice(0, 5).map((c) => (
              <li key={c.cliente_id} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{c.nombre}</span>
                  {c.dias !== null && <span className="block text-[12px] text-tinta/45">{s.teDeben.dias(c.dias)}</span>}
                </span>
                <span className="shrink-0 text-[14px] font-bold tabular-nums text-rojo">{dinero(c.saldo, m, false, locale)}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {reponer.length > 0 && (
        <Seccion titulo={s.aReponer.titulo(reponer.length)}>
          <div className="px-4 pb-4 pt-2">
            <p className="mb-3 text-[13.5px] leading-relaxed text-tinta/55">{s.aReponer.detalle}</p>
            <div className="flex flex-wrap gap-2">
              {reponer.slice(0, 24).map((p) => (
                <span key={p.id} className="pastilla bg-ambar-claro text-ambar">
                  {p.nombre} · {s.aReponer.stock(numero(Number(p.stock), locale), numero(Number(p.stock_minimo), locale))}
                </span>
              ))}
            </div>
          </div>
        </Seccion>
      )}

    </>
  );
}

/** Un renglón de la cuenta del local. */
function Linea({ etiqueta, detalle, valor, fuerte = false, tono = 'neutro' }: {
  etiqueta: string;
  detalle?: string;
  valor: string;
  fuerte?: boolean;
  tono?: 'neutro' | 'bueno' | 'malo';
}) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : 'text-tinta';
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${fuerte ? 'border-t border-borde/70' : ''}`}>
      <dt className="min-w-0">
        <span className={`block text-[14px] ${fuerte ? 'font-bold' : 'font-semibold'}`}>{etiqueta}</span>
        {detalle && <span className="block text-[12px] text-tinta/45">{detalle}</span>}
      </dt>
      <dd className={`shrink-0 text-[14px] tabular-nums ${fuerte ? 'font-extrabold' : 'font-semibold'} ${color}`}>{valor}</dd>
    </div>
  );
}

/** Por profesional: una tarjeta por persona, que a 375 px se lee sin correr la pantalla de costado. */
function Equipo({ equipo, hasta, m, t, locale }: {
  equipo: FilaEquipo[];
  hasta: string;
  m: PropsReporte['moneda'];
  t: PropsReporte['t'];
  locale: string;
}) {
  const s = t.reportesServicios.equipo;
  const plata = (n: number) => dinero(n, m, true, locale);
  const comoCobra = (e: FilaEquipo) => {
    const base = e.reparto === 'comision'
      ? s.comision(e.porcentaje === null ? '—' : numero(Number(e.porcentaje), locale))
      : e.reparto === 'alquiler' ? s.alquiler : e.reparto === 'sueldo' ? s.sueldo : s.local;
    return e.activo ? base : `${base} · ${s.yaNoEsta}`;
  };
  const falta = faltaPagarAlEquipo(equipo);

  return (
    <Seccion titulo={s.titulo}>
      <ul className="divide-y divide-borde/60">
        {equipo.map((e) => (
          <li key={e.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-bold">{e.nombre}</p>
                <p className="text-[12px] text-tinta/50">
                  {comoCobra(e)}
                  {e.cobro_directo > 0 && ` · ${s.cobroDirecto(plata(e.cobro_directo))}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/40">{s.colFalta}</p>
                <p className={`text-[15px] font-extrabold tabular-nums ${(e.falta ?? 0) > 0 ? 'text-rojo' : 'text-verde-fuerte'}`}>
                  {e.falta === null ? '—' : (e.falta ?? 0) > 0 ? plata(e.falta) : s.alDia}
                </p>
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] sm:grid-cols-5">
              <Dato etiqueta={s.colServicios} valor={numero(e.cortes, locale)} />
              <Dato etiqueta={s.colCobro} valor={dinero(e.cobrado, m, false, locale)} />
              <Dato etiqueta={s.colLocal} valor={dinero(e.del_local, m, false, locale)} />
              <Dato etiqueta={s.colLeToca} valor={dinero(e.le_toca, m, false, locale)} />
              <Dato etiqueta={s.colPagado} valor={dinero(e.pagado, m, false, locale)} />
            </dl>
            {e.turnos && (
              <p className="mt-1 text-[12px] text-tinta/45">{s.turnos(e.turnos.atendidas, e.turnos.no_vino)}</p>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t border-borde/70 px-4 py-3">
        {falta > 0 && <p className="text-[14px] font-bold text-rojo">{s.faltaPagar(plata(falta))}</p>}
        <p className="mt-1 text-[12px] leading-relaxed text-tinta/45">{s.nota(fechaLegible(hasta, true, locale))}</p>
      </div>
    </Seccion>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="text-tinta/45">{etiqueta}</dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}

/** Los turnos del período: cuántos vinieron, cuántos no, y por dónde entraron. */
function Turnos({ turnos, t }: { turnos: ReporteTurnos; t: PropsReporte['t'] }) {
  const s = t.reportesServicios.turnos;
  const e = turnos.por_estado;
  const cifras: [string, number, string][] = [
    [s.atendidos, e.atendida, 'text-verde-fuerte'],
    [s.noVino, e.no_vino, 'text-rojo'],
    [s.cancelados, e.cancelada, 'text-tinta/60'],
    [s.pendientes, e.pendiente + e.confirmada, 'text-tinta'],
  ];
  return (
    <Seccion titulo={s.titulo}>
      <div className="grid grid-cols-2 gap-2 px-4 pt-2 sm:grid-cols-4">
        {cifras.map(([etiqueta, n, color]) => (
          <div key={etiqueta} className="rounded-xl bg-arena px-3 py-2">
            <p className="text-[11.5px] font-semibold text-tinta/50">{etiqueta}</p>
            <p className={`text-[20px] font-extrabold tabular-nums ${color}`}>{n}</p>
          </div>
        ))}
      </div>
      {turnos.por_origen.publico > 0 && (
        <p className="px-4 pt-3 text-[13.5px] text-tinta/60">{s.porLink(turnos.por_origen.publico, turnos.total)}</p>
      )}
      {turnos.por_profesional.length > 1 && (
        <div className="overflow-x-auto pt-2">
          <table className="tabla">
            <thead>
              <tr>
                <th>{s.colPersona}</th>
                <th className="num">{s.colTurnos}</th>
                <th className="num">{s.atendidos}</th>
                <th className="num">{s.noVino}</th>
                <th className="num">{s.cancelados}</th>
              </tr>
            </thead>
            <tbody>
              {turnos.por_profesional.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold">{p.nombre}</td>
                  <td className="num">{p.total}</td>
                  <td className="num text-verde-fuerte">{p.atendidas}</td>
                  <td className="num text-rojo">{p.no_vino}</td>
                  <td className="num text-tinta/60">{p.canceladas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 pb-4 pt-2 text-[12px] text-tinta/45">{s.nota}</p>
    </Seccion>
  );
}
