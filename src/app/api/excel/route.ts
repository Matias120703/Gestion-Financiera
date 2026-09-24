import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { traerProductos } from '@/lib/datos';
import {
  traerResumen, traerRanking, traerGastosPorCategoria, traerIngresosPorCategoria,
  traerSerieDiaria, traerAhorroDelPeriodo,
  recorrerTodosLosMovimientos, contarMovimientos,
} from '@/lib/agregados';
import {
  construirLibro, enLaMonedaDeLaVista, nombreArchivo, nombreDeCampana, resumenEnLaMoneda,
  type DatosReporte, type FilaLiquidacion,
} from '@/lib/reporte';
import { varianteDeReporte, type VarianteReporte } from '@/lib/reportes/variante';
import { rangoPrevio } from '@/lib/reportes/rango';
import { conversorDe, type Conversor, type DatosBaseLibro } from '@/lib/reportes/comun';
import { diaDeCobro } from '@/components/reportes/comunes/ciclo';
import { conJerga } from '@/i18n/jergas';
import { vistaDeEmpresa } from '@/lib/sesion';
import { fichaDe } from '@/lib/rubros';
import { traerLote, traerLotes } from '@/lib/lotes';
import type { Empresa, Lote, Producto } from '@/lib/tipos';
import { esErrorDeLectura } from '@/lib/lectura';
import { idiomaActual, textos } from '@/i18n';
import { categoriaVisible, metodoVisible } from '@/i18n/nombres';
import { traerFiadoDelPeriodo, traerVentasPorVendedor } from '@/lib/agregados';
import { traerResumenFiado } from '@/lib/fiado';
import { traerBilletera } from '@/lib/billetera';
import { hoyISO } from '@/lib/fechas';
import { enLaVistaComercio, libroComercio, type LecturasComercio } from '@/lib/reportes/excel-comercio';
import { traerReporteAlumnos, traerProgresoClientes } from '@/lib/agregados';
import { exigir } from '@/lib/lectura';
import { conProgreso, enLaVistaAlumnos, libroAlumnos, mapearPorCobrar } from '@/lib/reportes/excel-alumnos';
import { enLaVistaCampo, libroCampo, type LeidoCampo } from '@/lib/reportes/excel-campo';
import { enLaVistaPersonal, libroPersonal } from '@/lib/reportes/excel-personal';
import { leerExtrasPersonal } from '@/components/reportes/ReportePersonal';
import { traerReporteTurnos } from '@/lib/agregados';
import { traerLiquidacion, traerResumenReparto } from '@/lib/reparto';
import {
  DESDE_SIEMPRE, enLaVistaServicios, libroServicios, type PagoAlEquipo,
} from '@/lib/reportes/excel-servicios';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  const s = (await textos()).servidor;
  if (!user) return NextResponse.json({ error: s.necesitasSesion }, { status: 401 });

  const url = new URL(request.url);
  const empresaId = url.searchParams.get('empresa') ?? '';
  const desde = url.searchParams.get('desde') ?? '';
  const hasta = url.searchParams.get('hasta') ?? '';

  const esFecha = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f);
  if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) {
    return NextResponse.json({ error: s.rangoInvalido }, { status: 400 });
  }

  // RLS: si no es miembro de la empresa, esta consulta vuelve vacía.
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id, nombre, moneda, tipo_cuenta, rubro, moneda_vista, cotizacion, cotizacion_at')
    .eq('id', empresaId)
    .maybeSingle();
  if (!empresa) return NextResponse.json({ error: s.sinAccesoEmpresa }, { status: 403 });

  // El Excel trae costos, márgenes y ganancias: es un reporte de administración.
  // Lo confirmamos contra la base, no contra lo que diga el navegador.
  const { data: esAdmin } = await supabase.rpc('es_admin', { p_empresa: empresa.id });
  if (!esAdmin) {
    return NextResponse.json(
      { error: s.excelSoloAdmin },
      { status: 403 },
    );
  }

  // Cuenta vencida: nada, ni el Excel. Se confirma contra la base y no
  // contra el layout, porque esta ruta se puede llamar directo.
  const { data: puedeCargar } = await supabase.rpc('puede_cargar', { p_empresa: empresa.id });
  if (!puedeCargar) {
    return NextResponse.json(
      { error: s.excelVencida },
      { status: 403 },
    );
  }

  // ---- Qué libro le toca (23/09) ----
  // La misma decisión que la pantalla (`varianteDeReporte`), y el mismo
  // período de comparación: el de ciclo para quien cobra un sueldo, que la
  // ruta reconoce por las fechas (ver `rangoPrevio`).
  const ficha = fichaDe(empresa.rubro, empresa.tipo_cuenta);
  const variante = varianteDeReporte(ficha, empresa.tipo_cuenta);
  const dia = variante === 'personal' ? await diaDeCobro(empresa.id) : null;
  const previo = rangoPrevio({ desde, hasta }, dia);

  try {
    // ---- Los números: agregados en PostgreSQL sobre TODO el periodo ----
    // Cada una de estas llamadas devuelve pocas filas, así que ningún tope
    // de la Data API puede recortarlas.
    // El desglose de ingresos y el ahorro solo los usa la planilla de una
    // cuenta personal. Se piden igual en las dos: son dos llamadas baratas, y
    // ramificar acá para ahorrárselas dejaría la ruta con dos caminos que
    // mantener por una diferencia de milisegundos.
    const [resumen, resumenPrevio, ranking, categorias, ingresos, serie, ahorro, productos, total] = await Promise.all([
      traerResumen(empresa.id, desde, hasta),
      traerResumen(empresa.id, previo.desde, previo.hasta),
      traerRanking(empresa.id, desde, hasta),
      traerGastosPorCategoria(empresa.id, desde, hasta),
      traerIngresosPorCategoria(empresa.id, desde, hasta),
      traerSerieDiaria(empresa.id, desde, hasta),
      traerAhorroDelPeriodo(empresa.id, desde, hasta),
      traerProductos(empresa.id),
      contarMovimientos(empresa.id, desde, hasta),
    ]);

    // ---- El detalle: página por página, desde el servidor ----
    // El navegador nunca ve estas páginas; recibe únicamente el .xlsx armado.
    const movimientos = await recorrerTodosLosMovimientos(empresa.id, desde, hasta);

    // Última red de seguridad: el recorrido tiene que traer exactamente lo que
    // dice el conteo. Si no coincide, algo se perdió y no entregamos el archivo.
    if (movimientos.length !== total) {
      console.error('[excel] detalle incompleto', { total, traidos: movimientos.length });
      return NextResponse.json(
        { error: s.excelIncompleto },
        { status: 500 },
      );
    }

    // ---- Las campañas, en un negocio de ciclo largo (100) ----
    // Si cualquiera de estas lecturas falla, el catch de abajo corta todo:
    // una hoja de campañas a medias parece completa y no lo es.
    const campo = variante === 'campo'
      ? await datosDelCampo(supabase, empresa.id, desde, hasta)
      : null;

    // En la moneda que se está mirando, con el mismo cambio que las pantallas
    // (051). Bajar el archivo no puede mostrar otros números que los que se
    // estaban viendo.
    const vista = vistaDeEmpresa(empresa as unknown as Empresa);
    const conversor = conversorDe(vista);

    // En el idioma de quien lo baja, con las palabras de su oficio. Las
    // categorías y las formas de pago se guardan en español: se traducen
    // acá, como en las pantallas, y el libro las recibe ya listas.
    const idioma = await idiomaActual();
    const t = conJerga(await textos(), ficha.jerga, idioma);
    const conNombreVisible = <C extends { nombre: string }>(c: C) => ({ ...c, nombre: categoriaVisible(t, c.nombre) });

    const deHoy = enLaMonedaDeLaVista({
      empresa: {
        nombre: empresa.nombre, moneda: empresa.moneda,
        tipo_cuenta: empresa.tipo_cuenta, rubro: empresa.rubro,
      },
      desde,
      hasta,
      resumen,
      ranking,
      categorias: categorias.map(conNombreVisible),
      ingresos: ingresos.map(conNombreVisible),
      ahorro,
      serie,
      movimientos: movimientos.map((m) => ({
        ...m, categoria: categoriaVisible(t, m.categoria), metodo_pago: metodoVisible(t, m.metodo_pago),
      })),
      productosBd: productos as Producto[],
      ...(campo ?? {}),
      idioma,
    }, vista);

    // Lo que le llega a cualquier libro por rubro, ya convertido y traducido.
    const base: DatosBaseLibro = {
      empresa: deHoy.empresa,
      desde,
      hasta,
      idioma,
      jerga: ficha.jerga,
      resumen: deHoy.resumen,
      resumenPrevio: resumenEnLaMoneda(resumenPrevio, conversor),
      previo,
      categorias: deHoy.categorias,
      serie: deHoy.serie,
      movimientos: deHoy.movimientos,
    };

    const libro = await libroDeLaVariante(variante, base, {
      supabase, empresaId: empresa.id, conversor, leido: deHoy,
    });

    const buffer = await libro.xlsx.writeBuffer();
    const nombre = nombreArchivo(empresa.nombre, desde, hasta,
      vista.moneda !== vista.propia ? vista.moneda : undefined, idioma);

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="reporte.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    // Si falló CUALQUIER agregado o CUALQUIER página del detalle, no se
    // devuelve ningún archivo. Un Excel con la mitad de los movimientos
    // parece completo y no lo es: es peor que no tener Excel.
    console.error('[excel]', e?.message ?? e);
    return NextResponse.json(
      {
        error: esErrorDeLectura(e)
          ? s.excelSinDatos
          : s.excelNoSeGenero,
      },
      { status: 500 },
    );
  }
}

type Cliente = ReturnType<typeof clienteServidor>;

/**
 * EL DESPACHO DEL EXCEL: UN LIBRO POR VARIANTE (23/09).
 *
 * Cada libro es una función pura de `src/lib/reportes/excel-<variante>.ts`
 * que recibe `DatosBaseLibro` (lo que se leyó arriba, ya convertido a la
 * moneda de la vista y traducido) más sus propios «extras». De los extras,
 * lo que la ruta YA leyó para el libro de hoy está en `x.leido` (también
 * convertido): el ranking y los productos (comercio, servicios), los
 * ingresos por categoría y el ahorro (personal), las campañas, las
 * liquidaciones y la campaña de cada movimiento (campo). Eso no se vuelve a
 * leer. Lo nuevo se lee acá, en la rama de esa variante, y se convierte con
 * su `enLaVista…` y `x.conversor`:
 *
 *   case 'alumnos': {
 *     const extras = await leerAlumnos(x.supabase, x.empresaId, base.desde, base.hasta);
 *     return libroAlumnos({ ...base, ...enLaVistaAlumnos(extras, x.conversor) });
 *   }
 *   case 'comercio': {
 *     const extras = await leerComercio(x.supabase, x.empresaId, base.desde, base.hasta);
 *     return libroComercio({
 *       ...base, ranking: x.leido.ranking, productos: x.leido.productosBd,
 *       ...enLaVistaComercio(extras, x.conversor),
 *     });
 *   }
 *
 * Si CUALQUIER lectura de una rama falla, el catch de la ruta corta todo:
 * un libro con una hoja a medias parece completo y no lo es.
 *
 * Las cinco variantes ya tienen su libro: el viejo (`construirLibro`) queda
 * en `reporte.ts` solo como tipo del libro y para sus pruebas.
 */
async function libroDeLaVariante(
  variante: VarianteReporte,
  base: DatosBaseLibro,
  x: {
    supabase: Cliente;
    empresaId: string;
    conversor: Conversor;
    /** Todo lo que la ruta leyó para el libro de hoy, ya en la moneda de la vista. */
    leido: DatosReporte;
  },
): Promise<ReturnType<typeof construirLibro>> {
  switch (variante) {
    case 'comercio': {
      // Lo nuevo del comercio: el fiado (foto y período), el saldo de cada
      // cuenta (foto) y las ventas por vendedor. Todo de administración, que
      // es la única que llega hasta acá. Si una falla, falla el archivo.
      const [fiado, fiadoPeriodo, billetera, vendedores] = await Promise.all([
        traerResumenFiado(x.empresaId),
        traerFiadoDelPeriodo(x.empresaId, base.desde, base.hasta),
        traerBilletera(x.empresaId),
        traerVentasPorVendedor(x.empresaId, base.desde, base.hasta),
      ]);
      const lecturas: LecturasComercio = {
        fiado, fiadoPeriodo, vendedores,
        cuentas: billetera.cuentas.map((k) => ({ nombre: k.nombre, saldo: Number(k.saldo) })),
      };
      return libroComercio({
        ...base,
        ranking: x.leido.ranking,
        productos: x.leido.productosBd,
        hoy: hoyISO(),
        ...enLaVistaComercio(lecturas, x.conversor),
      });
    }
    case 'alumnos': {
      // Lo del profe y el trainer: el período de sus alumnos (106), lo que
      // le deben a hoy (094) y, si toma medidas, el progreso de sus clientes.
      // Las mismas lecturas que la pantalla (ReporteAlumnos).
      const ficha = fichaDe(base.empresa.rubro, base.empresa.tipo_cuenta ?? 'emprendedor');
      const [alumnos, porCobrar, progreso] = await Promise.all([
        traerReporteAlumnos(x.empresaId, base.desde, base.hasta),
        x.supabase.rpc('por_cobrar_alumnos', { p_empresa: x.empresaId })
          .then((res) => mapearPorCobrar(exigir(res, 'por cobrar de los alumnos'))),
        conProgreso(ficha) ? traerProgresoClientes(x.empresaId, base.desde, base.hasta) : Promise.resolve(null),
      ]);
      return libroAlumnos({ ...base, ...enLaVistaAlumnos({ alumnos, porCobrar, progreso }, x.conversor) });
    }
    case 'campo': {
      // Las campañas, las liquidaciones del período y la campaña de cada
      // movimiento ya las leyó la ruta (`datosDelCampo`, ya convertidas). Lo
      // nuevo: los tickets de cosecha del período y lo que se debe hoy atado
      // a cada campaña, con la categoría en el idioma de quien baja.
      const t = conJerga(await textos(), base.jerga, (base.idioma ?? 'es') as Parameters<typeof conJerga>[2]);
      const leido = await leerCampo(x.supabase, x.empresaId, base.desde, base.hasta);
      const traducido: LeidoCampo = {
        ...leido,
        deudas: leido.deudas.map((d) => ({ ...d, categoria: d.categoria ? categoriaVisible(t, d.categoria) : '' })),
      };
      return libroCampo({
        ...base,
        campanas: x.leido.campanas ?? [],
        liquidaciones: x.leido.liquidaciones ?? [],
        campanaDeMovimiento: x.leido.campanaDeMovimiento ?? {},
        ...enLaVistaCampo(traducido, x.conversor),
      });
    }
    case 'personal': {
      // Lo mismo que lee la pantalla (`leerExtrasPersonal`): presupuesto,
      // fijos, fondos con su meta, deudas con los pagos del período y lo que
      // te deben. Las categorías del plan y de los fijos, en el idioma de
      // quien baja, para encontrarse con las de gasto (que ya vienen así).
      // De dónde vino y el ahorro del período ya los leyó la ruta.
      const t = await textos();
      const extras = await leerExtrasPersonal(
        x.empresaId, base.desde, base.hasta, base.previo,
        base.empresa.conversion?.propia ?? base.empresa.moneda,
        { nombre: (c) => categoriaVisible(t, c) },
      );
      return libroPersonal({
        ...base,
        ingresos: x.leido.ingresos,
        ahorro: x.leido.ahorro,
        ...enLaVistaPersonal(extras, x.conversor),
      });
    }
    case 'servicios': {
      // Lo mismo que lee la pantalla (ReporteServicios): el desglose del
      // local, la liquidación del período y la acumulada (de ahí sale «falta
      // pagar»), los turnos (106). Y lo que solo lleva el archivo: cada pago
      // al equipo, con su marca de comisión (106), y quién hizo cada corte,
      // para la columna Profesional de Movimientos. Las dos tablas son de
      // administración (035, 033), que es la única que llega hasta acá.
      const [reparto, liquidacion, liquidacionAcumulada, turnos, pagosBd, atribuciones] = await Promise.all([
        traerResumenReparto(x.empresaId, base.desde, base.hasta),
        traerLiquidacion(x.empresaId, base.desde, base.hasta),
        traerLiquidacion(x.empresaId, DESDE_SIEMPRE, base.hasta),
        traerReporteTurnos(x.empresaId, base.desde, base.hasta),
        todasLasFilas<{
          id: string; fecha: string; monto: number; profesional_id: string;
          movimiento_id: string | null; de_comision: boolean; notas: string | null;
        }>((a, b) => x.supabase
          .from('turnos_pago').select('id, fecha, monto, profesional_id, movimiento_id, de_comision, notas')
          .eq('empresa_id', x.empresaId).gte('fecha', base.desde).lte('fecha', base.hasta)
          .order('id').range(a, b)),
        todasLasFilas<{ id: string; movimiento_id: string; profesional_id: string }>((a, b) => x.supabase
          .from('turnos_atribucion').select('id, movimiento_id, profesional_id')
          .eq('empresa_id', x.empresaId).gte('fecha', base.desde).lte('fecha', base.hasta)
          .not('movimiento_id', 'is', null)
          .order('id').range(a, b)),
      ]);
      const nombres = new Map([...liquidacionAcumulada, ...liquidacion].map((l) => [l.id, l.nombre]));
      const profesionalDeMovimiento: Record<string, string> = {};
      for (const at of atribuciones) profesionalDeMovimiento[at.movimiento_id] = nombres.get(at.profesional_id) ?? '';
      for (const p of pagosBd) if (p.movimiento_id) profesionalDeMovimiento[p.movimiento_id] = nombres.get(p.profesional_id) ?? '';
      const pagos: PagoAlEquipo[] = pagosBd.map((p) => ({
        fecha: p.fecha, profesional: nombres.get(p.profesional_id) ?? '', monto: Number(p.monto),
        de_comision: !!p.de_comision, notas: p.notas ?? '', movimiento_id: p.movimiento_id,
      }));
      return libroServicios({
        ...base,
        ranking: x.leido.ranking,
        productos: x.leido.productosBd,
        ...enLaVistaServicios(
          { reparto, liquidacion, liquidacionAcumulada, pagos, turnos, profesionalDeMovimiento }, x.conversor,
        ),
      });
    }
  }
}

/**
 * Todas las filas de una consulta directa, página por página.
 *
 * La Data API recorta cada respuesta a su tope de filas sin avisar
 * (`db-max-rows`). Se avanza por lo que de verdad llegó y se corta recién
 * con una página vacía: así no importa cuál sea ese tope.
 */
async function todasLasFilas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const filas: T[] = [];
  const TAMANO = 1000;
  for (;;) {
    const { data, error } = await pagina(filas.length, filas.length + TAMANO - 1);
    if (error) throw error;
    if (!data || data.length === 0) return filas;
    filas.push(...data);
  }
}

/**
 * LO DEL CAMPO PARA EL EXCEL (100).
 *
 * · Las campañas que estuvieron abiertas en algún momento del período, con
 *   los números de toda la campaña (`listar_lotes`, los mismos del panel).
 * · Las liquidaciones del período, de `resumen_lote`: es la única lectura
 *   que trae descuentos, compensado y pagado con grano (la tabla no deja
 *   pedirlos por columnas). Solo se abren las campañas que tuvieron una.
 * · De qué campaña es cada movimiento del período, para la columna nueva
 *   de Movimientos. `pagina_movimientos` no trae `lote_id`; la columna sí
 *   se puede leer directo (044), y la policy de la 047 deja ver todo a
 *   administración, que es la única que baja el Excel.
 */
async function datosDelCampo(supabase: Cliente, empresaId: string, desde: string, hasta: string): Promise<{
  campanas: Lote[];
  liquidaciones: FilaLiquidacion[];
  campanaDeMovimiento: Record<string, string>;
}> {
  const [lotes, movsConLote, liqsDelPeriodo] = await Promise.all([
    traerLotes(empresaId, true),
    todasLasFilas<{ id: string; lote_id: string }>((a, b) => supabase
      .from('movimientos').select('id, lote_id')
      .eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta)
      .not('lote_id', 'is', null)
      .order('id').range(a, b)),
    todasLasFilas<{ id: string; lote_id: string }>((a, b) => supabase
      .from('liquidaciones').select('id, lote_id')
      .eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta)
      .order('id').range(a, b)),
  ]);

  const nombres = new Map(lotes.map((l) => [l.id, nombreDeCampana(l)]));

  // Abierta antes de que termine el período y no cerrada antes de que empiece.
  const campanas = lotes.filter((l) => l.abierto_el <= hasta && (!l.cerrado_el || l.cerrado_el >= desde));

  const campanaDeMovimiento: Record<string, string> = {};
  for (const m of movsConLote) campanaDeMovimiento[m.id] = nombres.get(m.lote_id) ?? '';

  const lotesConLiquidacion = Array.from(new Set(liqsDelPeriodo.map((q) => q.lote_id)));
  const detalles = await Promise.all(lotesConLiquidacion.map((id) => traerLote(empresaId, id)));
  const liquidaciones: FilaLiquidacion[] = detalles.flatMap((d) => (d.liquidaciones ?? [])
    .filter((q) => q.fecha >= desde && q.fecha <= hasta)
    .map((q) => ({ ...q, campana: nombres.get(d.id) ?? nombreDeCampana(d) })));

  return { campanas, liquidaciones, campanaDeMovimiento };
}

/**
 * LO QUE EL LIBRO DEL CAMPO LEE APARTE (23/09).
 *
 * · Los tickets de cosecha del período, de TODAS las campañas, en una sola
 *   consulta (antes solo estaban dentro de `resumen_lote`, una llamada por
 *   campaña). La policy de la 100 deja leerlos a los miembros.
 * · Lo que se debe hoy atado a una campaña: las mismas deudas que suma
 *   `numeros_de_lote` en «a cosecha» y lista `resumen_lote` (activas, con
 *   saldo). Foto de hoy, no del período: cerrar la campaña no salda la deuda.
 * · El nombre de cada campaña, de la tabla, para las dos: una deuda puede
 *   ser de una campaña cerrada hace un año, que no está entre las del período.
 *
 * Página por página (`todasLasFilas`): si una lectura falla, falla el archivo.
 */
async function leerCampo(supabase: Cliente, empresaId: string, desde: string, hasta: string): Promise<LeidoCampo> {
  const [lotes, cosechas, deudas] = await Promise.all([
    todasLasFilas<{ id: string; nombre: string; campana: string | null }>((a, b) => supabase
      .from('lotes').select('id, nombre, campana')
      .eq('empresa_id', empresaId)
      .order('id').range(a, b)),
    todasLasFilas<{
      id: string; lote_id: string; fecha: string; ticket: string; destino: string;
      kg_brutos: number | null; kg_netos: number; humedad: number | null;
    }>((a, b) => supabase
      .from('cosechas').select('id, lote_id, fecha, ticket, destino, kg_brutos, kg_netos, humedad')
      .eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta)
      .order('id').range(a, b)),
    todasLasFilas<{
      id: string; lote_id: string; nombre: string; acreedor: string; categoria: string | null;
      saldo: number; vence_el: string | null;
    }>((a, b) => supabase
      .from('deudas').select('id, lote_id, nombre, acreedor, categoria, saldo, vence_el')
      .eq('empresa_id', empresaId).eq('activa', true).gt('saldo', 0)
      .not('lote_id', 'is', null)
      .order('id').range(a, b)),
  ]);
  const nombres = new Map(lotes.map((l) => [l.id, nombreDeCampana(l)]));
  return {
    cosechas: cosechas.map((c) => ({
      ...c,
      campana: nombres.get(c.lote_id) ?? '',
      kg_netos: Number(c.kg_netos),
      kg_brutos: c.kg_brutos === null ? null : Number(c.kg_brutos),
      humedad: c.humedad === null ? null : Number(c.humedad),
    })),
    deudas: deudas.map((d) => ({
      ...d,
      campana: nombres.get(d.lote_id) ?? '',
      categoria: d.categoria ?? '',
      saldo: Number(d.saldo),
    })),
  };
}
