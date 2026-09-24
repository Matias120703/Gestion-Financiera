import Link from 'next/link';
import { categoriaVisible, metodoVisible } from '@/i18n/nombres';
import { traerProductos } from '@/lib/datos';
import {
  traerRanking, traerGastosPorCategoria, traerCobrosPorMetodo, traerFiadoDelPeriodo, traerVentasPorVendedor,
  traerPaginaMovimientos,
} from '@/lib/agregados';
import { traerResumenFiado } from '@/lib/fiado';
import { traerBilletera } from '@/lib/billetera';
import { dinero, dineroCorto, porcentaje, numero, dineroQuizas, porcentajeQuizas, fechaLegible } from '@/lib/formato';
import { palabra } from '@/lib/rubros';
import { Indicador, Vacio, Seccion, Barra } from '@/components/Piezas';
import { IndicadorVariacion } from '@/components/reportes/comunes/IndicadorVariacion';
import { GraficoPorDia } from '@/components/reportes/comunes/GraficoPorDia';
import type { PropsReporte } from '@/components/reportes/comunes/tipos';
import {
  aReponer, comprasDeMercaderia, deudoresPorAntiguedad, gastosDelComercio, hayVariosVendedores, quietosEnElEstante, valorAlCosto,
  vendidosSinCosto,
} from '@/lib/reportes/comercio';

/** Cuántas pastillas o filas se muestran antes de «y N más»: en un celular, más no se lee. */
const TOPE = 12;

/**
 * EL REPORTE DEL COMERCIO (23/09, contrato 2.1).
 *
 * El de siempre (vendido, ganancia, ranking, cómo te pagaron, gastos) con lo
 * que el dueño de un almacén se pregunta a fin de mes y no encontraba:
 *
 *   · la ganancia con la compra de mercadería contada una sola vez
 *     (decisión 2: si las ventas traen costo, la compra va aparte, en
 *     «Compraste mercadería», y no resta otra vez), con la flecha contra el
 *     período anterior;
 *   · qué productos se vendieron sin costo, que es donde el margen miente;
 *   · el fiado, que figura como cobrado y todavía no entró;
 *   · lo que te deben, qué reponer, qué está quieto, dónde está la plata y
 *     quién vendió.
 *
 * Las cuentas chicas (reponer, quietos, sin costo, gastos sin mercadería)
 * son las mismas funciones que arma el Excel (`excel-comercio.ts`): la
 * pantalla y el archivo dicen lo mismo porque es el mismo código. Lo que es
 * foto de hoy (stock, fiado, cuentas) se dice.
 *
 * La página solo deja entrar a administración; igual, costo y ganancia
 * se esconden si quien mira no los puede ver (047).
 */
export async function ReporteComercio({
  empresaId, rubro, tipoCuenta, rango, resumen: r, resumenPrevio: rp, moneda: m, t, idioma, locale, permisos,
}: PropsReporte) {
  const verRent = permisos.verRentabilidad && r.conCostos;

  // Lo de administración (fiado del período, vendedores) solo se pide si se
  // puede ver: a un vendedor la base se lo niega y la página entera caería.
  // La billetera es contexto, como en el panel: si falla, la tarjeta no sale.
  // Cada compra de mercadería, solo cuando va aparte: ahí un gasto mal puesto
  // en «Mercadería» deja de restar y la ganancia sale inflada, así que se
  // lista con su descripción para que se note. La búsqueda «mercad» ya filtra
  // en la base (categoría Mercadería o Mercadoria); `comprasDeMercaderia`
  // deja solo las de esa categoría. Si falla, no hay lista (el total queda).
  const conCompras = verRent && r.mercaderiaAparte && r.comprasMercaderia > 0;
  const [ranking, categorias, metodos, productos, fiado, fiadoPeriodo, vendedores, billetera, compras] = await Promise.all([
    traerRanking(empresaId, rango.desde, rango.hasta),
    traerGastosPorCategoria(empresaId, rango.desde, rango.hasta),
    traerCobrosPorMetodo(empresaId, rango.desde, rango.hasta),
    traerProductos(empresaId),
    verRent ? traerResumenFiado(empresaId) : Promise.resolve(null),
    verRent ? traerFiadoDelPeriodo(empresaId, rango.desde, rango.hasta) : Promise.resolve(null),
    verRent ? traerVentasPorVendedor(empresaId, rango.desde, rango.hasta) : Promise.resolve([]),
    verRent ? traerBilletera(empresaId).catch(() => null) : Promise.resolve(null),
    conCompras
      ? traerPaginaMovimientos(empresaId, rango.desde, rango.hasta, {
        tipo: 'gasto', incluirAnuladas: false, busqueda: 'mercad', tamano: 100,
      }).then((p) => comprasDeMercaderia(p.movimientos)).catch(() => null)
      : Promise.resolve(null),
  ]);

  const rc = t.reportesComercio;
  const vendido = palabra(rubro, tipoCuenta, 'ventas', t.panel.vendido, idioma);
  const corto = (n: number) => dineroCorto(n, m, locale);
  const aparte = r.mercaderiaAparte;
  const { lista: gastos, mercaderia } = gastosDelComercio(categorias, r);
  // «y N más» sale de la cuenta de la base, no del largo de la página leída.
  const comprasOcultas = compras ? Math.max(0, (mercaderia?.operaciones ?? compras.length) - Math.min(compras.length, TOPE)) : 0;
  const sinCosto = vendidosSinCosto(ranking);
  const sinCostoIds = new Set(sinCosto.map((p) => p.producto_id ?? p.nombre));
  const reponer = aReponer(productos);
  const quietos = quietosEnElEstante(productos, ranking);
  const parada = valorAlCosto(quietos);
  const deudores = fiado ? deudoresPorAntiguedad(fiado) : [];
  const hayFiado = deudores.length > 0 || (fiadoPeriodo?.clientes.length ?? 0) > 0;
  const cuentas = billetera?.cuentas ?? [];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <IndicadorVariacion
          titulo={vendido} valor={corto(r.ventas)} actual={r.ventas} anterior={rp.ventas} formato={corto} t={t}
          detalle={t.pantallas.ventasN(numero(r.cantidadVentas))} destacado={!verRent}
        />
        {verRent ? (
          <>
            <Indicador titulo={t.panel.gananciaBruta} valor={corto(r.gananciaBruta)} detalle={t.pantallas.margenCorto(porcentaje(r.margenBruto, 0))} />
            <IndicadorVariacion
              titulo={t.panel.gastos} valor={corto(r.gastos)} actual={r.gastos} anterior={rp.gastos} formato={corto} t={t}
              subirEsBueno={false} tono="malo" detalle={aparte ? rc.gastosSinMercaderia : undefined}
            />
            <IndicadorVariacion
              titulo={t.panel.gananciaNeta} valor={corto(r.gananciaNeta)} t={t} formato={corto} destacado
              actual={r.gananciaNeta} anterior={rp.conCostos ? rp.gananciaNeta : null}
              tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'}
            />
          </>
        ) : (
          <>
            <Indicador titulo={t.panel.unidades} valor={numero(r.unidadesVendidas)} detalle={t.pantallas.entregadas} />
            <Indicador titulo={t.panel.ticketPromedio} valor={corto(r.ticketPromedio)} detalle={t.pantallas.porVenta} />
          </>
        )}
      </div>

      {/* La compra de mercadería: aparte (no resta) o dentro de los gastos, y se dice cuál. */}
      {verRent && r.comprasMercaderia > 0 && (
        <div className="tarjeta p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-[13px] font-semibold text-tinta/55">{rc.mercaderia.titulo}</p>
            <p className="text-[20px] font-titulo font-extrabold tabular-nums">{dinero(r.comprasMercaderia, m)}</p>
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta/60">
            {aparte ? rc.mercaderia.aparte : rc.mercaderia.resta}
          </p>
          {compras && compras.length > 0 && (
            <>
              <ul className="mt-3 divide-y divide-tinta/10 border-t border-tinta/10">
                {compras.slice(0, TOPE).map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{c.descripcion?.trim() || rc.mercaderia.sinDescripcion}</span>
                      <span className="block text-[12px] text-tinta/45">{fechaLegible(c.fecha, false, locale)}</span>
                    </span>
                    <span className="shrink-0 text-[13.5px] font-bold tabular-nums">{dinero(Number(c.monto), m, false)}</span>
                  </li>
                ))}
              </ul>
              {comprasOcultas > 0 && <p className="mt-1 text-[12.5px] text-tinta/45">{rc.fiado.masN(comprasOcultas)}</p>}
              <p className="mt-2 text-[12.5px] leading-relaxed text-tinta/55">{rc.mercaderia.revisar}</p>
              <Link href="/movimientos" className="boton-texto inline-flex min-h-[44px] items-center">{rc.mercaderia.verMovimientos}</Link>
            </>
          )}
        </div>
      )}

      <GraficoPorDia
        empresaId={empresaId} desde={rango.desde} hasta={rango.hasta}
        moneda={m} t={t} locale={locale} etiquetaVentas={vendido}
      />

      <Seccion titulo={t.pantallas.rankingCompleto}>
        {verRent && sinCosto.length > 0 && (
          <div className="mx-4 mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-ambar-claro px-3 py-2">
            <p className="text-[13px] font-semibold leading-snug text-ambar">{rc.sinCosto(sinCosto.length)}</p>
            <Link href="/productos" className="boton-texto inline-flex min-h-[44px] items-center">{rc.cargarCostos}</Link>
          </div>
        )}
        {ranking.length === 0 ? (
          <Vacio titulo={t.pantallas.sinVentasPeriodo} detalle={t.pantallas.sinVentasPeriodoDetalle} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[680px]">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>{t.productos.colProducto}</th>
                  <th className="num">{t.pantallas.colUnidadesLargo}</th>
                  <th className="num">{t.panel.colVendido}</th>
                  {verRent && <th className="num">{t.productos.colCosto}</th>}
                  {verRent && <th className="num">{t.panel.colGanancia}</th>}
                  {verRent && <th className="num">{t.productos.colMargen}</th>}
                </tr>
              </thead>
              <tbody>
                {ranking.map((p, i) => {
                  const marcado = verRent && sinCostoIds.has(p.producto_id ?? p.nombre);
                  return (
                    <tr key={p.producto_id ?? p.nombre}>
                      <td className={`font-bold ${i < 3 ? 'text-verde-fuerte' : 'text-tinta/30'}`}>{i + 1}</td>
                      <td>
                        <span className="block font-semibold">{p.nombre}</span>
                        <span className="mt-1 block max-w-[140px]"><Barra porcentaje={p.participacion} /></span>
                      </td>
                      <td className="num font-semibold tabular-nums">{numero(p.unidades)}</td>
                      <td className="num tabular-nums">{dinero(p.ingresos, m, false)}</td>
                      {verRent && (
                        <td className="num tabular-nums text-tinta/50">
                          {marcado
                            ? <span className="pastilla bg-ambar-claro text-ambar">{rc.sinCostoCorto}</span>
                            : dineroQuizas(p.costo, m, false)}
                        </td>
                      )}
                      {verRent && (
                        <td className={`num font-bold tabular-nums ${
                          p.ganancia === null ? 'text-tinta/30' : p.ganancia >= 0 ? 'text-verde-fuerte' : 'text-rojo'
                        }`}>
                          {dineroQuizas(p.ganancia, m, false)}
                        </td>
                      )}
                      {verRent && (
                        <td className={`num tabular-nums ${marcado ? 'font-bold text-ambar' : 'text-tinta/60'}`}>
                          {porcentajeQuizas(p.margen, 0)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Cómo te pagaron. El fiado figura como venta pero la plata no entró: se dice. */}
        <Seccion titulo={t.pantallas.comoTePagaron}>
          {metodos.length === 0 ? (
            <Vacio titulo={t.pantallas.sinCobros} detalle={t.pantallas.sinCobrosDetalle} />
          ) : (
            <div className="space-y-3.5 px-4 pb-4 pt-3">
              {metodos.map(({ metodo, monto, participacion: p }) => {
                // El fiado se guarda como 'credito' (PantallaVenta, captura,
                // FormaDeCobro) y acá se lo llama por su nombre de mostrador.
                const esFiado = metodo === 'credito';
                const nombre = esFiado ? t.venta.metodoFiadoCorto : metodoVisible(t, metodo);
                return (
                  <div key={metodo}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className={`text-[14px] font-semibold ${esFiado ? 'text-ambar' : ''}`}>
                        {esFiado ? rc.todaviaNoEntro(nombre) : nombre}
                      </span>
                      <span className="text-[13.5px] font-bold tabular-nums">{dinero(monto, m, false)}</span>
                    </div>
                    <Barra porcentaje={p} tono={esFiado ? 'ambar' : 'verde'} />
                    <p className="mt-1 text-[11.5px] font-semibold text-tinta/40">{porcentaje(p, 0)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Seccion>

        {/* Gastos por categoría, sin la mercadería cuando va aparte: así suman lo mismo que «Gastos». */}
        {verRent && (
          <Seccion titulo={t.pantallas.gastosPorCategoria}>
            {gastos.length === 0 ? (
              <Vacio titulo={t.pantallas.sinGastos} detalle={t.pantallas.sinGastosDetalle} />
            ) : (
              <div className="overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr><th>{t.productos.categoria}</th><th className="num">{t.venta.total}</th><th className="num">{t.pantallas.colMov}</th><th className="num">%</th></tr>
                  </thead>
                  <tbody>
                    {gastos.map((c) => (
                      <tr key={c.nombre}>
                        <td className="font-semibold">{categoriaVisible(t, c.nombre)}</td>
                        <td className="num font-semibold tabular-nums text-rojo">{dinero(c.monto, m, false)}</td>
                        <td className="num tabular-nums text-tinta/50">{c.operaciones}</td>
                        <td className="num tabular-nums text-tinta/60">{porcentaje(c.participacion, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Lo que te deben: foto de hoy, de la deuda más vieja a la más nueva, y lo del período. */}
        {verRent && fiado && hayFiado && (
          <Seccion
            titulo={rc.fiado.titulo}
            accion={<Link href="/fiado" className="boton-texto inline-flex min-h-[44px] items-center">{rc.fiado.verTodo}</Link>}
          >
            <div className="px-4 pb-4 pt-1">
              {deudores.length === 0 ? (
                <p className="text-[13.5px] text-tinta/55">{rc.fiado.nadie}</p>
              ) : (
                <>
                  <p className="text-[22px] font-titulo font-extrabold tabular-nums text-rojo">{dinero(fiado.total, m)}</p>
                  <p className="mt-0.5 text-[12.5px] text-tinta/50">{rc.fiado.clientes(deudores.length)} · {rc.fiado.hoy}</p>
                  <ul className="mt-3 divide-y divide-borde">
                    {deudores.slice(0, TOPE).map((d) => (
                      <li key={d.cliente_id} className="flex items-baseline justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold">{d.nombre}</span>
                          {d.dias !== null && <span className="block text-[12px] text-tinta/45">{rc.fiado.hace(d.dias)}</span>}
                        </span>
                        <span className="text-[13.5px] font-bold tabular-nums">{dinero(d.saldo, m, false)}</span>
                      </li>
                    ))}
                  </ul>
                  {deudores.length > TOPE && (
                    <p className="mt-1 text-[12.5px] text-tinta/45">{rc.fiado.masN(deudores.length - TOPE)}</p>
                  )}
                </>
              )}
              {fiadoPeriodo && (fiadoPeriodo.otorgado > 0 || fiadoPeriodo.cobrado > 0) && (
                <div className="mt-3 rounded-xl bg-arena px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-tinta/50">{rc.fiado.enElPeriodo}</p>
                  <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px]">
                    <span>{rc.fiado.fiaste} <b className="tabular-nums">{dinero(fiadoPeriodo.otorgado, m)}</b></span>
                    <span>{rc.fiado.tePagaron} <b className="tabular-nums text-verde-fuerte">{dinero(fiadoPeriodo.cobrado, m)}</b></span>
                  </div>
                </div>
              )}
            </div>
          </Seccion>
        )}

        {/* Dónde está la plata: el saldo de hoy de cada cuenta (074). */}
        {cuentas.length > 0 && billetera && (
          <Seccion
            titulo={rc.cuentas.titulo}
            accion={<Link href="/billetera" className="boton-texto inline-flex min-h-[44px] items-center">{rc.cuentas.verBilletera}</Link>}
          >
            <div className="px-4 pb-4 pt-1">
              <p className="text-[12.5px] text-tinta/50">{rc.cuentas.detalle}</p>
              <ul className="mt-2 divide-y divide-borde">
                {cuentas.map((k) => (
                  <li key={k.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-[14px] font-semibold">{k.nombre}</span>
                    <span className={`text-[13.5px] font-bold tabular-nums ${k.saldo < 0 ? 'text-rojo' : ''}`}>{dinero(k.saldo, m, false)}</span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-3 py-2">
                  <span className="text-[14px] font-bold">{rc.cuentas.total}</span>
                  <span className="text-[14px] font-extrabold tabular-nums">{dinero(billetera.total, m)}</span>
                </li>
              </ul>
            </div>
          </Seccion>
        )}
      </div>

      {/* A reponer: la misma regla que el panel. */}
      {reponer.length > 0 && (
        <Seccion titulo={rc.reponer.titulo(reponer.length)}>
          <div className="px-4 pb-4 pt-1">
            <p className="mb-3 text-[13.5px] leading-relaxed text-tinta/55">{rc.reponer.detalle}</p>
            <ul className="divide-y divide-borde">
              {reponer.slice(0, TOPE).map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-[14px] font-semibold">{p.nombre}</span>
                  <span className={`shrink-0 text-[12.5px] tabular-nums ${Number(p.stock) <= 0 ? 'font-bold text-rojo' : 'text-tinta/55'}`}>
                    {rc.reponer.quedan(numero(Number(p.stock)), numero(Number(p.stock_minimo)))}
                  </span>
                </li>
              ))}
            </ul>
            {reponer.length > TOPE && <p className="mt-1 text-[12.5px] text-tinta/45">{rc.fiado.masN(reponer.length - TOPE)}</p>}
          </div>
        </Seccion>
      )}

      {/* Quieto en el estante: solo lo que tiene stock de verdad y no se vendió. */}
      {quietos.length > 0 && (
        <Seccion titulo={rc.quietos.titulo(quietos.length)}>
          <div className="px-4 pb-4 pt-1">
            {verRent && (
              <p className="mb-3 text-[13.5px] leading-relaxed text-tinta/55">
                {rc.quietos.plataParada(dinero(parada.total, m))}
                {parada.sinCosto > 0 && <> {rc.quietos.sinCosto(parada.sinCosto)}</>}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {quietos.slice(0, 24).map((p) => (
                <span key={p.id} className="pastilla bg-arena text-tinta/60">
                  {p.nombre} · {t.pantallas.unidadesCorto(numero(Number(p.stock)))}
                </span>
              ))}
              {quietos.length > 24 && <span className="pastilla bg-arena text-tinta/40">{t.pantallas.masN(quietos.length - 24)}</span>}
            </div>
          </div>
        </Seccion>
      )}

      {/* Quién vendió: solo con dos o más personas cargando ventas. */}
      {verRent && hayVariosVendedores(vendedores) && (
        <Seccion titulo={rc.vendedores.titulo}>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>{rc.vendedores.colVendedor}</th>
                  <th className="num">{t.panel.colVendido}</th>
                  <th className="num">{rc.vendedores.colVentas}</th>
                  <th className="num hidden sm:table-cell">{rc.vendedores.colTicket}</th>
                  <th className="num">{rc.vendedores.colAnuladas}</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((v) => (
                  <tr key={v.user_id ?? 'sin-autor'}>
                    <td className="font-semibold">{v.nombre ?? <span className="text-tinta/45">{rc.vendedores.sinNombre}</span>}</td>
                    <td className="num font-semibold tabular-nums">{dinero(v.vendido, m, false)}</td>
                    <td className="num tabular-nums">{numero(v.cantidad)}</td>
                    <td className="num hidden tabular-nums text-tinta/60 sm:table-cell">{dineroQuizas(v.ticket_promedio, m, false)}</td>
                    <td className={`num tabular-nums ${v.anuladas > 0 ? 'font-bold text-rojo' : 'text-tinta/40'}`}>{numero(v.anuladas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}
    </>
  );
}
