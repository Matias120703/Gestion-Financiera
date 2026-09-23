import { contextoObligatorio } from '@/lib/sesion';
import { textos } from '@/i18n';
import { categoriaDelRubro } from '@/i18n/textos/gastos-campana';
import { rangoDesdeParams } from '@/lib/datos';
import { traerResumen, traerGastosPorCategoria, traerPaginaMovimientos } from '@/lib/agregados';
import { PantallaGastos } from '@/components/PantallaGastos';
import { SelectorRango } from '@/components/SelectorRango';
import { Indicador } from '@/components/Piezas';
import { dineroCorto, dinero, numero } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { traerCuentasParaElegir } from '@/lib/billetera';
import { fichaDe } from '@/lib/rubros';
import { traerLotes } from '@/lib/lotes';
import { traerCategoriasPersonales } from '@/lib/personal';
import type { CampanaParaElegir } from '@/components/ListaMovimientos';
import type { Empresa } from '@/lib/tipos';

/**
 * El dólar de hoy como lo dice la persona (guaraníes por dólar), sacado de
 * «Ver en otra moneda» (051) cuando la vista es justo la otra moneda.
 *
 * `cotizacion` es cuánto vale 1 de la moneda de la vista en la propia: un
 * negocio en guaraníes que mira en dólares guarda 6.000; uno en dólares que
 * mira en guaraníes guarda 1/6.000 (por eso la 100 le dio diez decimales).
 * Para cualquier otra pareja se usa tal cual: es el cambio directo.
 */
function dolarDeLaVista(empresa: Empresa): number | null {
  const cot = Number(empresa.cotizacion);
  const otra = empresa.moneda === 'PYG' ? 'USD' : 'PYG';
  if (!empresa.moneda_vista || empresa.moneda_vista !== otra || !Number.isFinite(cot) || cot <= 0) return null;
  if (empresa.moneda === 'USD' && otra === 'PYG') return Math.round(1 / cot);
  return cot;
}

export const dynamic = 'force-dynamic';

export default async function PaginaGastos({
  searchParams: busqueda,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await busqueda;
  const ctx = await contextoObligatorio();
  const t = await textos();
  const rango = rangoDesdeParams(searchParams, ctx.zonaHoraria);
  // Un negocio con lotes (ganadería, agricultura) dice de qué campaña es
  // cada gasto, y en qué moneda lo pagó (100). Solo las abiertas: a una
  // cerrada se le suma algo desde el historial.
  const conCampanas = fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta).secciones['/lotes'];
  const loteParam = typeof searchParams.lote === 'string' ? searchParams.lote : null;
  // Los totales salen agregados; la lista es solo la primera página.
  const [r, categorias, paginaGastos, paginaIngresos, cuentas, lotes, delRubro] = await Promise.all([
    traerResumen(ctx.empresa.id, rango.desde, rango.hasta),
    traerGastosPorCategoria(ctx.empresa.id, rango.desde, rango.hasta),
    traerPaginaMovimientos(ctx.empresa.id, rango.desde, rango.hasta, { tipo: 'gasto', tamano: 50 }),
    traerPaginaMovimientos(ctx.empresa.id, rango.desde, rango.hasta, { tipo: 'ingreso', tamano: 50 }),
    // Para elegir de qué cuenta salió (075). Un vendedor no administra la
    // billetera, así que para él la lista viene vacía y no se pregunta nada.
    ctx.esAdmin ? traerCuentasParaElegir(ctx.empresa.id) : Promise.resolve([]),
    conCampanas ? traerLotes(ctx.empresa.id, false) : Promise.resolve([]),
    // Las del rubro, las mismas con que clasifica la captura (101): al
    // sojero no se le ofrece «Mercadería».
    conCampanas ? traerCategoriasPersonales(ctx.empresa.id, 'gasto') : Promise.resolve([]),
  ]);
  // Solo lo que el chip necesita: los números de cada campaña no viajan.
  const campanas = lotes.map((l): CampanaParaElegir => ({
    id: l.id, nombre: l.nombre, cultivo: l.cultivo ?? '', campana: l.campana ?? '',
    hectareas: l.hectareas ?? null, abierto_el: l.abierto_el, estado: l.estado,
  }));

  const gastos = [...paginaGastos.movimientos, ...paginaIngresos.movimientos]
    .sort((a, b) => (a.fecha === b.fecha ? (a.created_at < b.created_at ? 1 : -1) : a.fecha < b.fecha ? 1 : -1));
  const hayMas = Boolean(paginaGastos.siguiente || paginaIngresos.siguiente);
  const m = ctx.empresa.moneda;

  /**
   * Desde la 047 un vendedor solo recibe sus propios gastos.
   *
   * Eso arregla la fuga, pero deja el cartel mintiendo de otra manera: el
   * número que dice «Gastos del periodo» pasó a ser «los gastos que cargué
   * yo», y quien lo lea va a creer que el negocio gastó eso. Un número
   * correcto con el título equivocado sigue siendo un dato falso.
   */
  const esAdmin = ctx.miembro.rol === 'propietario' || ctx.miembro.rol === 'admin';
  const tituloGastos = esAdmin ? t.pantallas.gastosDelPeriodo : t.gastos.misGastos;
  const tituloIngresos = esAdmin ? t.panel.otrosIngresos : t.gastos.misOtrosIngresos;

  return (
    <div className="space-y-5">
      <SelectorRango clave={rango.clave} desde={rango.desde} hasta={rango.hasta} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo={tituloGastos} valor={dineroCorto(r.gastos, m)} detalle={dinero(r.gastos, m)} tono="malo" />
        <Indicador titulo={tituloIngresos} valor={dineroCorto(r.otrosIngresos, m)} detalle={dinero(r.otrosIngresos, m)} />
        <Indicador
          titulo={t.pantallas.movimientosAnulados}
          valor={numero(r.movimientosAnulados)}
          detalle={t.gastos.noSumanEnTotales}
        />
        <Indicador
          titulo={t.pantallas.categoriaMasPesada}
          valor={categorias[0] ? categoriaDelRubro(t, categorias[0].nombre) : '—'}
          detalle={categorias[0] ? dinero(categorias[0].monto, m) : t.gastos.sinGastosCorto}
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
        hoy={hoyISO(ctx.zonaHoraria)}
        cuentas={cuentas}
        conCampanas={conCampanas}
        campanas={campanas}
        loteInicial={loteParam}
        categoriasRubro={delRubro.map((c) => c.nombre)}
        dolarDeHoy={conCampanas ? dolarDeLaVista(ctx.empresa) : null}
      />
    </div>
  );
}
