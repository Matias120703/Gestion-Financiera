import { contextoObligatorio } from '@/lib/sesion';
import { textos } from '@/i18n';
import { rangoDesdeParams, traerProductos } from '@/lib/datos';
import {
  traerResumen, traerRanking, traerGastosPorCategoria, traerCobrosPorMetodo,
} from '@/lib/agregados';
import { dinero, dineroCorto, porcentaje, numero, fechaLegible, dineroQuizas, porcentajeQuizas } from '@/lib/formato';
import { SelectorRango } from '@/components/SelectorRango';
import { Indicador, Vacio, Seccion, Barra } from '@/components/Piezas';
import { BotonExcel } from '@/components/BotonExcel';
import { permisosDe } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

export default async function PaginaReportes({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await contextoObligatorio();
  const t = textos();
  const rango = rangoDesdeParams(searchParams);
  // Todo agregado en la base: cinco llamadas que devuelven pocas filas cada una.
  const [r, ranking, categorias, metodos, productos] = await Promise.all([
    traerResumen(ctx.empresa.id, rango.desde, rango.hasta),
    traerRanking(ctx.empresa.id, rango.desde, rango.hasta),
    traerGastosPorCategoria(ctx.empresa.id, rango.desde, rango.hasta),
    traerCobrosPorMetodo(ctx.empresa.id, rango.desde, rango.hasta),
    traerProductos(ctx.empresa.id),
  ]);

  const m = ctx.empresa.moneda;
  const vendidos = new Set(ranking.map((p) => p.producto_id).filter(Boolean) as string[]);
  const quietos = productos.filter((p) => !vendidos.has(p.id));
  const plataParada = quietos.reduce((s, p) => s + Number(p.stock) * Number(p.costo ?? 0), 0);

  const permisos = permisosDe(ctx.miembro.rol);
  const verRent = permisos.verRentabilidad && r.conCostos;

  return (
    <div className="space-y-5">
      <SelectorRango clave={rango.clave} desde={rango.desde} hasta={rango.hasta} />

      {permisos.descargarExcel ? (
        <div className="tarjeta flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[16px] font-bold tracking-tight">{t.pantallas.descargarExcel}</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-tinta/55">
              {rango.desde === rango.hasta ? fechaLegible(rango.desde) : `${fechaLegible(rango.desde)} — ${fechaLegible(rango.hasta)}`}
              {' · '}5 hojas: resumen, productos, movimientos, gastos y día por día.
            </p>
          </div>
          <BotonExcel empresaId={ctx.empresa.id} desde={rango.desde} hasta={rango.hasta} />
        </div>
      ) : (
        <p className="rounded-xl bg-arena px-4 py-3 text-[13px] leading-relaxed text-tinta/60">
          Acá ves el resumen operativo del periodo. El Excel financiero incluye costos y
          márgenes, así que lo descarga el propietario o un administrador.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {verRent ? (
          <>
            <Indicador titulo={t.panel.vendido} valor={dineroCorto(r.ventas, m)} detalle={`${numero(r.cantidadVentas)} ventas`} />
            <Indicador titulo={t.panel.gananciaBruta} valor={dineroCorto(r.gananciaBruta, m)} detalle={`margen ${porcentaje(r.margenBruto, 0)}`} />
            <Indicador titulo={t.panel.gastos} valor={dineroCorto(r.gastos, m)} tono="malo" />
            <Indicador titulo={t.panel.gananciaNeta} valor={dineroCorto(r.gananciaNeta, m)} tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'} destacado />
          </>
        ) : (
          <>
            <Indicador titulo={t.panel.vendido} valor={dineroCorto(r.ventas, m)} detalle={`${numero(r.cantidadVentas)} ventas`} destacado />
            <Indicador titulo={t.panel.unidades} valor={numero(r.unidadesVendidas)} detalle="entregadas" />
            <Indicador titulo={t.panel.ticketPromedio} valor={dineroCorto(r.ticketPromedio, m)} detalle="por venta" />
            <Indicador titulo={t.pantallas.descuentos} valor={dineroCorto(r.descuentos, m)} detalle="que diste" />
          </>
        )}
      </div>

      <Seccion titulo={t.pantallas.rankingCompleto}>
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
                {ranking.map((p, i) => (
                  <tr key={p.producto_id ?? p.nombre}>
                    <td className={`font-bold ${i < 3 ? 'text-verde-fuerte' : 'text-tinta/30'}`}>{i + 1}</td>
                    <td>
                      <span className="block font-semibold">{p.nombre}</span>
                      <span className="mt-1 block max-w-[140px]"><Barra porcentaje={p.participacion} /></span>
                    </td>
                    <td className="num font-semibold tabular-nums">{numero(p.unidades)}</td>
                    <td className="num tabular-nums">{dinero(p.ingresos, m, false)}</td>
                    {verRent && <td className="num tabular-nums text-tinta/50">{dineroQuizas(p.costo, m, false)}</td>}
                    {verRent && (
                      <td className={`num font-bold tabular-nums ${
                        p.ganancia === null ? 'text-tinta/30' : p.ganancia >= 0 ? 'text-verde-fuerte' : 'text-rojo'
                      }`}>
                        {dineroQuizas(p.ganancia, m, false)}
                      </td>
                    )}
                    {verRent && <td className="num tabular-nums text-tinta/60">{porcentajeQuizas(p.margen, 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo={t.pantallas.comoTePagaron}>
          {metodos.length === 0 ? (
            <Vacio titulo={t.pantallas.sinCobros} detalle={t.pantallas.sinCobrosDetalle} />
          ) : (
            <div className="space-y-3.5 px-4 pb-4 pt-3">
              {metodos.map(({ metodo, monto, participacion: p }) => {
                return (
                  <div key={metodo}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-[14px] font-semibold capitalize">{metodo}</span>
                      <span className="text-[13.5px] font-bold tabular-nums">{dinero(monto, m, false)}</span>
                    </div>
                    <Barra porcentaje={p} />
                    <p className="mt-1 text-[11.5px] font-semibold text-tinta/40">{porcentaje(p, 0)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Seccion>

        {verRent && (
        <Seccion titulo={t.pantallas.gastosPorCategoria}>
          {categorias.length === 0 ? (
            <Vacio titulo={t.pantallas.sinGastos} detalle={t.pantallas.sinGastosDetalle} />
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr><th>{t.productos.categoria}</th><th className="num">{t.venta.total}</th><th className="num">{t.pantallas.colMov}</th><th className="num">%</th></tr>
                </thead>
                <tbody>
                  {categorias.map((c) => (
                    <tr key={c.nombre}>
                      <td className="font-semibold">{c.nombre}</td>
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

      {quietos.length > 0 && (
        <Seccion titulo={`Sin vender · ${quietos.length} producto${quietos.length === 1 ? '' : 's'} en este periodo`}>
          <div className="px-4 pb-4 pt-2">
            <p className="mb-3 text-[13.5px] leading-relaxed text-tinta/55">
              {verRent
                ? `Tenés ${dinero(plataParada, m)} inmovilizados en productos que no se movieron en este periodo.`
                : 'Estos productos no se movieron en este periodo. Puede ser una oportunidad de empuje.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {quietos.slice(0, 24).map((p) => (
                <span key={p.id} className="pastilla bg-arena text-tinta/60">
                  {p.nombre} · {numero(Number(p.stock))} u.
                </span>
              ))}
              {quietos.length > 24 && <span className="pastilla bg-arena text-tinta/40">+{quietos.length - 24} más</span>}
            </div>
          </div>
        </Seccion>
      )}
    </div>
  );
}
