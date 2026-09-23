import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { traerProductos } from '@/lib/datos';
import {
  traerResumen, traerRanking, traerGastosPorCategoria, traerIngresosPorCategoria,
  traerSerieDiaria, traerAhorroDelPeriodo,
  recorrerTodosLosMovimientos, contarMovimientos,
} from '@/lib/agregados';
import {
  construirLibro, enLaMonedaDeLaVista, nombreArchivo, nombreDeCampana, type FilaLiquidacion,
} from '@/lib/reporte';
import { vistaDeEmpresa } from '@/lib/sesion';
import { fichaDe } from '@/lib/rubros';
import { traerLote, traerLotes } from '@/lib/lotes';
import type { Empresa, Lote, Producto } from '@/lib/tipos';
import { esErrorDeLectura } from '@/lib/lectura';
import { idiomaActual, textos } from '@/i18n';
import { categoriaVisible, metodoVisible } from '@/i18n/nombres';

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

  try {
    // ---- Los números: agregados en PostgreSQL sobre TODO el periodo ----
    // Cada una de estas llamadas devuelve pocas filas, así que ningún tope
    // de la Data API puede recortarlas.
    // El desglose de ingresos y el ahorro solo los usa la planilla de una
    // cuenta personal. Se piden igual en las dos: son dos llamadas baratas, y
    // ramificar acá para ahorrárselas dejaría la ruta con dos caminos que
    // mantener por una diferencia de milisegundos.
    const [resumen, ranking, categorias, ingresos, serie, ahorro, productos, total] = await Promise.all([
      traerResumen(empresa.id, desde, hasta),
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
    const campo = fichaDe(empresa.rubro, empresa.tipo_cuenta).ciclosLargos
      ? await datosDelCampo(supabase, empresa.id, desde, hasta)
      : null;

    // En la moneda que se está mirando, con el mismo cambio que las pantallas
    // (051). Bajar el archivo no puede mostrar otros números que los que se
    // estaban viendo.
    const vista = vistaDeEmpresa(empresa as unknown as Empresa);

    // En el idioma de quien lo baja. Las categorías y las formas de pago se
    // guardan en español: se traducen acá, como en las pantallas, y el libro
    // las recibe ya listas.
    const idioma = await idiomaActual();
    const t = await textos();
    const conNombreVisible = <C extends { nombre: string }>(c: C) => ({ ...c, nombre: categoriaVisible(t, c.nombre) });

    const libro = construirLibro(enLaMonedaDeLaVista({
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
    }, vista));

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
