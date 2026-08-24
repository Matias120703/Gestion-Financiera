import { contextoObligatorio } from '@/lib/sesion';
import { rangoDesdeParams } from '@/lib/datos';
import { traerResumen, traerPaginaMovimientos, contarMovimientos, TAMANO_PAGINA } from '@/lib/agregados';
import { cargarPagina } from './acciones';
import { SelectorRango } from '@/components/SelectorRango';
import { Indicador } from '@/components/Piezas';
import { permisosDe } from '@/lib/permisos';
import { ListaMovimientos } from '@/components/ListaMovimientos';
import { dineroCorto, numero } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';

export const dynamic = 'force-dynamic';

export default async function PaginaMovimientos({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await contextoObligatorio();
  const rango = rangoDesdeParams(searchParams);
  // Los totales salen agregados de la base; la lista es solo la primera página.
  const [r, pagina, total] = await Promise.all([
    traerResumen(ctx.empresa.id, rango.desde, rango.hasta),
    traerPaginaMovimientos(ctx.empresa.id, rango.desde, rango.hasta, { tamano: TAMANO_PAGINA }),
    contarMovimientos(ctx.empresa.id, rango.desde, rango.hasta),
  ]);
  const m = ctx.empresa.moneda;
  const verRent = permisosDe(ctx.miembro.rol).verRentabilidad && r.conCostos;

  return (
    <div className="space-y-5">
      <SelectorRango clave={rango.clave} desde={rango.desde} hasta={rango.hasta} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Movimientos válidos" valor={numero(total - r.movimientosAnulados)} detalle={rango.etiqueta.toLowerCase()} />
        <Indicador titulo="Entró" valor={dineroCorto(r.ingresosTotales, m)} tono="bueno" />
        <Indicador titulo="Salió" valor={dineroCorto(r.gastos, m)} tono="malo" />
        {verRent ? (
          <Indicador titulo="Ganancia neta" valor={dineroCorto(r.gananciaNeta, m)} tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'} />
        ) : (
          <Indicador titulo="Unidades" valor={numero(r.unidadesVendidas)} detalle="entregadas" />
        )}
      </div>

      {r.movimientosAnulados > 0 && (
        <p className="rounded-xl bg-arena px-4 py-3 text-[13px] text-tinta/60">
          Hay {r.movimientosAnulados} movimiento{r.movimientosAnulados === 1 ? '' : 's'} anulado{r.movimientosAnulados === 1 ? '' : 's'} en
          este periodo por {dineroCorto(r.montoMovimientosAnulados, m)}
          {r.ventasAnuladas > 0 && r.ventasAnuladas !== r.movimientosAnulados
            && ` (${r.ventasAnuladas} de ellos son ventas)`}.
          Aparecen tachados y no suman en ningún total.
        </p>
      )}

      <ListaMovimientos
        movimientos={pagina.movimientos}
        cursorInicial={pagina.siguiente}
        total={total}
        desde={rango.desde}
        hasta={rango.hasta}
        moneda={m}
        empresaId={ctx.empresa.id}
        guardaComprobantes={ctx.limites?.adjuntos ?? false}
        rol={ctx.miembro.rol}
        userId={ctx.userId}
        hoy={hoyISO()}
        cargarPagina={cargarPagina}
      />
    </div>
  );
}
