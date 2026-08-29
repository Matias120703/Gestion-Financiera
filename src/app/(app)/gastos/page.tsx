import { contextoObligatorio } from '@/lib/sesion';
import { textos } from '@/i18n';
import { rangoDesdeParams } from '@/lib/datos';
import { traerResumen, traerGastosPorCategoria, traerPaginaMovimientos } from '@/lib/agregados';
import { PantallaGastos } from '@/components/PantallaGastos';
import { SelectorRango } from '@/components/SelectorRango';
import { Indicador } from '@/components/Piezas';
import { dineroCorto, dinero, numero } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';

export const dynamic = 'force-dynamic';

export default async function PaginaGastos({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await contextoObligatorio();
  const t = textos();
  const rango = rangoDesdeParams(searchParams);
  // Los totales salen agregados; la lista es solo la primera página.
  const [r, categorias, paginaGastos, paginaIngresos] = await Promise.all([
    traerResumen(ctx.empresa.id, rango.desde, rango.hasta),
    traerGastosPorCategoria(ctx.empresa.id, rango.desde, rango.hasta),
    traerPaginaMovimientos(ctx.empresa.id, rango.desde, rango.hasta, { tipo: 'gasto', tamano: 50 }),
    traerPaginaMovimientos(ctx.empresa.id, rango.desde, rango.hasta, { tipo: 'ingreso', tamano: 50 }),
  ]);

  const gastos = [...paginaGastos.movimientos, ...paginaIngresos.movimientos]
    .sort((a, b) => (a.fecha === b.fecha ? (a.created_at < b.created_at ? 1 : -1) : a.fecha < b.fecha ? 1 : -1));
  const hayMas = Boolean(paginaGastos.siguiente || paginaIngresos.siguiente);
  const m = ctx.empresa.moneda;

  return (
    <div className="space-y-5">
      <SelectorRango clave={rango.clave} desde={rango.desde} hasta={rango.hasta} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo={t.pantallas.gastosDelPeriodo} valor={dineroCorto(r.gastos, m)} detalle={dinero(r.gastos, m)} tono="malo" />
        <Indicador titulo={t.panel.otrosIngresos} valor={dineroCorto(r.otrosIngresos, m)} detalle={dinero(r.otrosIngresos, m)} />
        <Indicador
          titulo={t.pantallas.movimientosAnulados}
          valor={numero(r.movimientosAnulados)}
          detalle="no suman en los totales"
        />
        <Indicador
          titulo={t.pantallas.categoriaMasPesada}
          valor={categorias[0]?.nombre ?? '—'}
          detalle={categorias[0] ? dinero(categorias[0].monto, m) : 'sin gastos'}
        />
      </div>

      <PantallaGastos
        empresaId={ctx.empresa.id}
        moneda={m}
        movimientos={gastos}
        hayMas={hayMas}
        categoriasUsadas={categorias.map((c) => c.nombre)}
        rol={ctx.miembro.rol}
        userId={ctx.userId}
        hoy={hoyISO()}
      />
    </div>
  );
}
