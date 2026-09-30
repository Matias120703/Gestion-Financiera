import { NextResponse } from 'next/server';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { cronAutorizado } from '@/lib/avisos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * LA LIMPIEZA DE LOS VIDEOS PROPIOS (113). Corre una vez por día, a las
 * 03:40 de Paraguay (pg_cron `orden-limpiar-videos`, 06:40 UTC).
 *
 * Storage no tiene claves foráneas: un video que se cambió, se quitó o era
 * de un ejercicio borrado sigue pagando lugar hasta que alguien borra su
 * archivo. El navegador del trainer lo borra enseguida
 * (limpiarVideosPendientes); esto barre lo que quedó —una pestaña que se
 * cerró a mitad de camino, una reserva que nunca se confirmó— y los
 * archivos que no tienen fila.
 *
 * Primero los archivos, después las filas: `videos_limpiados` solo borra
 * una fila cuyo archivo ya no está. Nunca toca un video puesto en un
 * ejercicio. Los errores se registran sin rutas.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const supabase = clienteDeServicio();

  const { data, error } = await supabase.rpc('videos_para_limpiar');
  if (error) {
    console.error('[limpiar-videos]', error.message);
    return NextResponse.json({ error: 'No se pudo leer.' }, { status: 503 });
  }

  const rutas = (Array.isArray(data) ? data : []).filter((r): r is string => typeof r === 'string' && r.length > 0);

  let archivos = 0;
  const tratadas: string[] = [];
  // De a 100: Storage no acepta borrados enormes de una sola vez.
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100);
    const { data: borrados, error: errorBorrar } = await supabase.storage.from('videos').remove(lote);
    if (errorBorrar) {
      console.error('[limpiar-videos]', errorBorrar.message);
      continue;
    }
    archivos += Array.isArray(borrados) ? borrados.length : 0;
    tratadas.push(...lote);
  }

  let filas = 0;
  if (tratadas.length > 0) {
    const { data: n, error: errorFilas } = await supabase.rpc('videos_limpiados', { p_rutas: tratadas });
    if (errorFilas) console.error('[limpiar-videos]', errorFilas.message);
    else filas = Number(n) || 0;
  }

  return NextResponse.json({ archivos, filas });
}
