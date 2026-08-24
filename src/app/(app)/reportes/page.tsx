import { contextoObligatorio } from '@/lib/sesion';
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
            <h2 className="text-[16px] font-bold tracking-tight">Descargar el Excel del periodo</h2>
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
            <Indicador titulo="Vendido" valor={dineroCorto(r.ventas, m)} detalle={`${numero(r.cantidadVentas)} ventas`} />
            <Indicador titulo="Ganancia bruta" valor={dineroCorto(r.gananciaBruta, m)} detalle={`margen ${porcentaje(r.margenBruto, 0)}`} />
            <Indicador titulo="Gastos" valor={dineroCorto(r.gastos, m)} tono="malo" />
            <Indicador titulo="Ganancia neta" valor={dineroCorto(r.gananciaNeta, m)} tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'} destacado />
          </>
        ) : (
          <>
            <Indicador titulo="Vendido" valor={dineroCorto(r.ventas, m)} detalle={`${numero(r.cantidadVentas)} ventas`} destacado />
            <Indicador titulo="Unidades" valor={numero(r.unidadesVendidas)} detalle="entregadas" />
            <Indicador titulo="Ticket promedio" valor={dineroCorto(r.ticketPromedio, m)} detalle="por venta" />
            <Indicador titulo="Descuentos" valor={dineroCorto(r.descuentos, m)} detalle="que diste" />
          </>
        )}
      </div>

      <Seccion titulo="Ranking completo de productos">
        {ranking.length === 0 ? (
          <Vacio titulo="Sin ventas en este periodo" detalle="Cambiá el rango o registrá tu primera venta." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[680px]">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Producto</th>
                  <th className="num">Unidades</th>
                  <th className="num">Vendido</th>
                  {verRent && <th className="num">Costo</th>}
                  {verRent && <th className="num">Ganancia</th>}
                  {verRent && <th className="num">Margen</th>}
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
        <Seccion titulo="Cómo te pagaron">
          {metodos.length === 0 ? (
            <Vacio titulo="Sin cobros" detalle="Cuando registres ventas vas a ver acá cómo te pagan." />
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
        <Seccion titulo="Gastos por categoría">
          {categorias.length === 0 ? (
            <Vacio titulo="Sin gastos" detalle="Registrar gastos es lo que vuelve real a la ganancia neta." />
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr><th>Categoría</th><th className="num">Total</th><th className="num">Mov.</th><th className="num">%</th></tr>
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
