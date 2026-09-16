import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { traerProductos } from '@/lib/datos';
import {
  traerResumen, traerRanking, traerGastosPorCategoria, traerIngresosPorCategoria,
  traerSerieDiaria, traerAhorroDelPeriodo,
  recorrerTodosLosMovimientos, contarMovimientos,
} from '@/lib/agregados';
import { construirLibro, enLaMonedaDeLaVista, nombreArchivo } from '@/lib/reporte';
import { vistaDeEmpresa } from '@/lib/sesion';
import type { Empresa, Producto } from '@/lib/tipos';
import { esErrorDeLectura } from '@/lib/lectura';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });

  const url = new URL(request.url);
  const empresaId = url.searchParams.get('empresa') ?? '';
  const desde = url.searchParams.get('desde') ?? '';
  const hasta = url.searchParams.get('hasta') ?? '';

  const esFecha = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f);
  if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) {
    return NextResponse.json({ error: 'El rango de fechas no es válido.' }, { status: 400 });
  }

  // RLS: si no es miembro de la empresa, esta consulta vuelve vacía.
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id, nombre, moneda, tipo_cuenta, rubro, moneda_vista, cotizacion, cotizacion_at')
    .eq('id', empresaId)
    .maybeSingle();
  if (!empresa) return NextResponse.json({ error: 'No tenés acceso a esta empresa.' }, { status: 403 });

  // El Excel trae costos, márgenes y ganancias: es un reporte de administración.
  // Lo confirmamos contra la base, no contra lo que diga el navegador.
  const { data: esAdmin } = await supabase.rpc('es_admin', { p_empresa: empresa.id });
  if (!esAdmin) {
    return NextResponse.json(
      { error: 'El Excel financiero incluye costos y márgenes. Pedíselo al propietario o a un administrador.' },
      { status: 403 },
    );
  }

  // Cuenta vencida: nada, ni el Excel. Se confirma contra la base y no
  // contra el layout, porque esta ruta se puede llamar directo.
  const { data: puedeCargar } = await supabase.rpc('puede_cargar', { p_empresa: empresa.id });
  if (!puedeCargar) {
    return NextResponse.json(
      { error: 'Tu prueba terminó. Para seguir usando Orden y bajar el Excel hace falta activar tu plan.' },
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
        { error: 'No pudimos armar el detalle completo del periodo. No generamos el archivo para no darte números incompletos.' },
        { status: 500 },
      );
    }

    // En la moneda que se está mirando, con el mismo cambio que las pantallas
    // (051). Bajar el archivo no puede mostrar otros números que los que se
    // estaban viendo.
    const vista = vistaDeEmpresa(empresa as unknown as Empresa);
    const libro = construirLibro(enLaMonedaDeLaVista({
      empresa: {
        nombre: empresa.nombre, moneda: empresa.moneda,
        tipo_cuenta: empresa.tipo_cuenta, rubro: empresa.rubro,
      },
      desde,
      hasta,
      resumen,
      ranking,
      categorias,
      ingresos,
      ahorro,
      serie,
      movimientos,
      productosBd: productos as Producto[],
    }, vista));

    const buffer = await libro.xlsx.writeBuffer();
    const nombre = nombreArchivo(empresa.nombre, desde, hasta,
      vista.moneda !== vista.propia ? vista.moneda : undefined);

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
          ? 'No pudimos leer todos los datos del periodo, así que no generamos el archivo. Probá de nuevo en un momento.'
          : 'No se pudo generar el archivo.',
      },
      { status: 500 },
    );
  }
}
