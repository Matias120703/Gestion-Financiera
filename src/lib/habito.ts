import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { CierreDelDia, Racha } from './tipos';

/**
 * Lecturas del hábito: cierre del día y racha.
 *
 * Igual que en `agregados.ts`, acá no hay valores de respaldo. Si la lectura
 * falla, se lanza y la pantalla muestra `error.tsx`. Un cierre que dice
 * "vendiste 0" porque no se pudo leer sería peor que no mostrar nada: la
 * persona podría creer que perdió el día.
 */

export async function traerCierre(empresaId: string, fecha?: string): Promise<CierreDelDia> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('cierre_del_dia', {
    p_empresa: empresaId,
    p_fecha: fecha ?? null,
  });
  return exigir(respuesta, 'cierre del día') as CierreDelDia;
}

export async function traerRacha(empresaId: string): Promise<Racha> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('racha_empresa', { p_empresa: empresaId });
  return exigir(respuesta, 'racha') as Racha;
}

/**
 * Cuánto cambió un número respecto de otro, en porcentaje.
 *
 * Devuelve null cuando la referencia es cero: "creciste infinito por ciento"
 * no le dice nada a nadie. La pantalla muestra otra cosa en ese caso.
 */
export function comparar(actual: number, referencia: number): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(referencia)) return null;
  if (referencia === 0) return null;
  return ((actual - referencia) / Math.abs(referencia)) * 100;
}
