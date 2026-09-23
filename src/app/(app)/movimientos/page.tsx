import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { textos } from '@/i18n';
import { rangoDesdeParams } from '@/lib/datos';
import { traerResumen, traerPaginaMovimientos, contarMovimientos, TAMANO_PAGINA } from '@/lib/agregados';
import { cargarPagina } from './acciones';
import { SelectorRango } from '@/components/SelectorRango';
import { Indicador } from '@/components/Piezas';
import { permisosDe } from '@/lib/permisos';
import { ListaMovimientos, type CampanaParaElegir } from '@/components/ListaMovimientos';
import { traerLotes } from '@/lib/lotes';
import { fichaDe } from '@/lib/rubros';
import { dineroCorto, numero } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';

export const dynamic = 'force-dynamic';

export default async function PaginaMovimientos({
  searchParams: busqueda,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await busqueda;
  const ctx = await contextoObligatorio();
  // El historial completo del negocio es la vista del dueño. Un vendedor
  // igual queda con su propio recibo de cada venta —se lo confirma el
  // sistema al cargarla— pero no con el archivo entero de la empresa.
  if (!ctx.esAdmin) redirect('/panel');
  const t = await textos();
  const rango = rangoDesdeParams(searchParams, ctx.zonaHoraria);
  // Un negocio con lotes (ganadería, agricultura) dice desde acá de qué
  // campaña es cada movimiento (100). Todas, cerradas incluidas: un gasto
  // viejo tiene que poder nombrar la suya aunque ya no sea un chip.
  const conCampanas = fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta).secciones['/lotes'];
  // Los totales salen agregados de la base; la lista es solo la primera página.
  const [r, pagina, total, lotes] = await Promise.all([
    traerResumen(ctx.empresa.id, rango.desde, rango.hasta),
    traerPaginaMovimientos(ctx.empresa.id, rango.desde, rango.hasta, { tamano: TAMANO_PAGINA }),
    contarMovimientos(ctx.empresa.id, rango.desde, rango.hasta),
    conCampanas ? traerLotes(ctx.empresa.id, true) : Promise.resolve([]),
  ]);
  /**
   * Se mira en la moneda de la vista (051): acá solo se informa, no se carga
   * nada. Las pantallas donde se ESCRIBE un importe siguen recibiendo
   * `ctx.empresa.moneda` a secas — un formulario en dólares que guardara el
   * número tal cual estaría guardando dólares como guaraníes.
   */
  const m = ctx.vista;
  const verRent = permisosDe(ctx.miembro.rol).verRentabilidad && r.conCostos;

  return (
    <div className="space-y-5">
      <SelectorRango clave={rango.clave} desde={rango.desde} hasta={rango.hasta} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo={t.pantallas.movimientosValidos} valor={numero(total - r.movimientosAnulados)} detalle={rango.etiqueta.toLowerCase()} />
        <Indicador titulo={t.pantallas.entro} valor={dineroCorto(r.ingresosTotales, m)} tono="bueno" />
        <Indicador titulo={t.pantallas.salio} valor={dineroCorto(r.gastos, m)} tono="malo" />
        {verRent ? (
          <Indicador titulo={t.panel.gananciaNeta} valor={dineroCorto(r.gananciaNeta, m)} tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'} />
        ) : (
          <Indicador titulo={t.panel.unidades} valor={numero(r.unidadesVendidas)} detalle={t.movimientos.entregadas} />
        )}
      </div>

      {r.movimientosAnulados > 0 && (
        <p className="rounded-xl bg-arena px-4 py-3 text-[13px] text-tinta/60">
          {t.movimientos.hayAnulados(r.movimientosAnulados, dineroCorto(r.montoMovimientosAnulados, m), r.ventasAnuladas)}
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
        hoy={hoyISO(ctx.zonaHoraria)}
        cargarPagina={cargarPagina}
        conCampanas={conCampanas}
        // Solo lo que el chip necesita: los números de cada campaña no viajan.
        campanas={lotes.map((l): CampanaParaElegir => ({
          id: l.id, nombre: l.nombre, cultivo: l.cultivo ?? '', campana: l.campana ?? '',
          hectareas: l.hectareas ?? null, abierto_el: l.abierto_el, estado: l.estado,
        }))}
      />
    </div>
  );
}
