import { clienteServidor } from './supabase/servidor';
import { exigir, exigirLista } from './lectura';
import { resolverRango, hoyISO, type ClaveRango, type Rango } from './fechas';
import type { Movimiento, Producto, Reto } from './tipos';

const CLAVES: ClaveRango[] = ['hoy', 'ayer', 'semana', 'semana_pasada', 'mes', 'mes_pasado', 'anio', 'siempre', 'personalizado'];

/**
 * Lee ?rango=&desde=&hasta= de la URL y lo convierte en un rango concreto.
 *
 * `zona` es la del NEGOCIO, no la del servidor. Sin ella, «hoy» sería el día
 * en Asunción para todo el mundo y un negocio en otra franja vería el rango
 * corrido: es el mismo error que la migración 032 sacó de la base.
 */
export function rangoDesdeParams(
  params: Record<string, string | string[] | undefined>,
  zona?: string,
): Rango {
  const hoy = hoyISO(zona);
  const bruto = typeof params.rango === 'string' ? params.rango : 'hoy';
  const clave: ClaveRango = (CLAVES as string[]).includes(bruto) ? (bruto as ClaveRango) : 'hoy';
  const desde = typeof params.desde === 'string' ? params.desde : undefined;
  const hasta = typeof params.hasta === 'string' ? params.hasta : undefined;
  const valida = (f?: string) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : undefined);

  if (clave === 'personalizado') {
    const d = valida(desde) ?? hoy;
    const h = valida(hasta) ?? hoy;
    return resolverRango('personalizado', hoy, { desde: d <= h ? d : h, hasta: h >= d ? h : d });
  }
  return resolverRango(clave, hoy);
}

/**
 * HELPER ACOTADO, SOLO SERVIDOR. No lo usa ninguna pantalla.
 *
 * Trae el periodo completo de una sola vez (la RPC falla si supera 20.000).
 * Sirve para procesos de servidor que necesitan todo junto y saben que el
 * volumen es chico.
 *
 * Para la aplicación el camino correcto es otro:
 *   · números   → `agregados.ts` (resumen, ranking, serie, gastos, cobros);
 *   · historial → `traerPaginaMovimientos()`.
 *
 * El motivo es que entre PostgreSQL y el navegador está la Data API, que
 * recorta a `db-max-rows` sin avisar. Un total sumado sobre una respuesta
 * recortada está mal y parece bien.
 *
 * @deprecated para uso en pantallas. Usá agregados.ts.
 */
export async function traerMovimientos(empresaId: string, desde: string, hasta: string): Promise<Movimiento[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('listar_movimientos', {
    p_empresa: empresaId,
    p_desde: desde,
    p_hasta: hasta,
  });
  return exigirLista<Movimiento>(respuesta, 'movimientos del periodo');
}

/** Mismo criterio: el costo llega solo si la persona puede verlo. */
export async function traerProductos(empresaId: string, soloActivos = true): Promise<Producto[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('listar_productos', {
    p_empresa: empresaId,
    p_incluir_pausados: !soloActivos,
  });
  // Un catálogo vacío es un dato válido; no poder leerlo, no.
  return exigirLista<Producto>(respuesta, 'catálogo de productos');
}

export async function traerRetoActivo(empresaId: string): Promise<Reto | null> {
  const supabase = clienteServidor();
  const { data, error } = await supabase
    .from('retos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Acá `data: null` SÍ es un dato: quiere decir que no hay reto activo.
  // Por eso solo miramos el error, y no usamos exigir().
  if (error) {
    console.error('[lectura:reto activo]', error.message);
    throw new (await import('./lectura')).ErrorDeLectura('reto activo', error.message);
  }
  return (data as Reto) ?? null;
}
