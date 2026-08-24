'use server';

import { contextoObligatorio } from '@/lib/sesion';
import { traerPaginaMovimientos, type Cursor, type FiltrosHistorial } from '@/lib/agregados';
import type { Movimiento } from '@/lib/tipos';

/**
 * Trae una página del historial desde el servidor.
 *
 * El navegador nunca pide "todos los movimientos": pide de a 100. La empresa
 * la resuelve la sesión del servidor, no el parámetro, así que no se puede
 * pedir el historial de otra empresa cambiando un id en la petición.
 */
export async function cargarPagina(
  desde: string,
  hasta: string,
  cursor: Cursor | null,
  filtros: FiltrosHistorial,
): Promise<{ movimientos: Movimiento[]; siguiente: Cursor | null }> {
  const ctx = await contextoObligatorio();

  const esFecha = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f);
  if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) {
    throw new Error('El rango de fechas no es válido.');
  }

  // Si la lectura falla, el error sube hasta el componente, que muestra un
  // aviso. Devolver una lista vacía diría "no hay más movimientos", que es
  // justo lo contrario de lo que pasó.

  return traerPaginaMovimientos(ctx.empresa.id, desde, hasta, {
    cursor,
    tipo: filtros.tipo ?? null,
    incluirAnuladas: filtros.incluirAnuladas ?? true,
    busqueda: filtros.busqueda ?? null,
  });
}
