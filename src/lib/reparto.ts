import { clienteServidor } from './supabase/servidor';
import { exigir, exigirLista } from './lectura';
import type {
  Profesional, FilaLiquidacion, ResumenReparto, MisServicios, Producto,
} from './tipos';

/**
 * Lecturas del módulo de reparto.
 *
 * Igual que el resto del sistema: si falla, lanza. Mostrar «le debés 0» a
 * alguien porque una consulta no se pudo leer sería peor que no mostrar nada
 * — el dueño podría cerrar la semana creyendo que no le debe nada a nadie.
 */

/** El equipo de la cuenta. Lo lee cualquier miembro: los nombres no son secretos. */
export async function traerProfesionales(empresaId: string): Promise<Profesional[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase
    .from('turnos_profesional')
    .select('id, nombre, user_id, reparto, porcentaje, activo')
    .eq('empresa_id', empresaId)
    .order('activo', { ascending: false })
    .order('nombre');
  return exigirLista<Profesional>(respuesta, 'el equipo');
}

/** Los precios propios de cada profesional, para saber cuál difiere del catálogo. */
export async function traerPreciosPropios(
  empresaId: string,
): Promise<{ profesional_id: string; producto_id: string; precio: number }[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase
    .from('turnos_precio')
    .select('profesional_id, producto_id, precio')
    .eq('empresa_id', empresaId);
  return exigirLista(respuesta, 'los precios del equipo');
}

/**
 * El desglose del propietario: de dónde salió cada peso que le quedó.
 *
 * Los tres primeros renglones suman exactamente la ganancia bruta que ya
 * calcula el panel. Que cierre no es un detalle estético: un desglose que no
 * coincide con el total obliga a elegir a cuál de los dos creerle.
 */
export async function traerResumenReparto(
  empresaId: string, desde: string, hasta: string,
): Promise<ResumenReparto> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('resumen_reparto', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return exigir(respuesta, 'el reparto del período') as ResumenReparto;
}

/** Por persona: cuánto produjo, cuánto le toca, cuánto ya cobró y cuánto falta. */
export async function traerLiquidacion(
  empresaId: string, desde: string, hasta: string,
): Promise<FilaLiquidacion[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('liquidacion', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  const lista = exigir(respuesta, 'la liquidación');
  return Array.isArray(lista) ? (lista as FilaLiquidacion[]) : [];
}

/**
 * Lo que ve un profesional de lo suyo.
 *
 * Nunca trae `parte_local`, y no por omisión de la pantalla: la función de la
 * base no la devuelve. Esconder una columna con un `if` en el navegador es
 * esconderla de la vista, no del que sabe abrir la consola.
 */
export async function traerMisServicios(
  empresaId: string, desde: string, hasta: string,
): Promise<MisServicios> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('mis_servicios', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return exigir(respuesta, 'tus servicios') as MisServicios;
}

/** Los servicios cobrables: productos que no descuentan stock. */
export function soloServicios(productos: Producto[]): Producto[] {
  return productos.filter((p) => !p.controla_stock && p.activo);
}
