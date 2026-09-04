import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { Lote, LoteDetalle, MovimientoSuelto } from './tipos';

/**
 * Lecturas de los lotes.
 *
 * Ninguna de estas funciones suma nada: los totales salen calculados de
 * PostgreSQL sobre los mismos movimientos que alimentan el panel. Si acá se
 * sumara del lado del navegador, un lote con dos años de gastos tendría que
 * traerse entero para mostrar un número.
 */

/** Los lotes con cómo vienen. Por defecto, solo los que están en curso. */
export async function traerLotes(empresaId: string, incluirCerrados = false): Promise<Lote[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('listar_lotes', {
    p_empresa: empresaId,
    p_incluir_cerrados: incluirCerrados,
  });
  const lista = exigir(respuesta, 'los lotes');
  return Array.isArray(lista) ? (lista as Lote[]) : [];
}

/** Un lote con todos sus movimientos adentro. */
export async function traerLote(empresaId: string, loteId: string): Promise<LoteDetalle> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('resumen_lote', {
    p_empresa: empresaId,
    p_lote: loteId,
  });
  return exigir(respuesta, 'el lote') as LoteDetalle;
}

/**
 * Gastos e ingresos que todavía no son de ningún lote.
 *
 * Para el que ya venía cargando antes de abrir el lote, que va a ser el caso
 * de todos la primera vez.
 */
export async function traerMovimientosSinLote(
  empresaId: string,
  desde: string,
  hasta: string,
): Promise<MovimientoSuelto[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('movimientos_sin_lote', {
    p_empresa: empresaId,
    p_desde: desde,
    p_hasta: hasta,
  });
  const lista = exigir(respuesta, 'los movimientos sin lote');
  return Array.isArray(lista) ? (lista as MovimientoSuelto[]) : [];
}
