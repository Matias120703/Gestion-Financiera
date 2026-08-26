import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { Deuda, ResumenDeudas } from './tipos';

/**
 * Lecturas de deudas.
 *
 * Igual que el resto: si falla, lanza. Mostrar «debés 0» porque no se pudo
 * leer sería peor que no mostrar nada — alguien podría creer que ya terminó
 * de pagar.
 */

export async function traerDeudas(empresaId: string, incluirSaldadas = false): Promise<Deuda[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('listar_deudas', {
    p_empresa: empresaId,
    p_incluir_saldadas: incluirSaldadas,
  });
  const lista = exigir(respuesta, 'deudas') as Deuda[];
  return Array.isArray(lista) ? lista : [];
}

export async function traerResumenDeudas(empresaId: string): Promise<ResumenDeudas> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('resumen_deudas', { p_empresa: empresaId });
  return exigir(respuesta, 'resumen de deudas') as ResumenDeudas;
}

