import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { Billetera, CuentaParaElegir } from './tipos';

/** La billetera de la cuenta: cada banco con su saldo, y el total (074). */
export async function traerBilletera(empresaId: string): Promise<Billetera> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('billetera', { p_empresa: empresaId });
  const datos = exigir(respuesta, 'la billetera') as Billetera | null;
  return {
    cuentas: Array.isArray(datos?.cuentas) ? datos!.cuentas : [],
    total: Number(datos?.total ?? 0),
  };
}

/**
 * Las cuentas, solo para llenar un selector (075).
 *
 * No usa `billetera()` porque eso calcula el saldo de cada una, y para
 * elegir «de qué cuenta salió» alcanzan el nombre y el tipo. Si falla —o si
 * quien mira no administra la cuenta— devuelve la lista vacía y las
 * pantallas siguen andando con el reparto por forma de pago de la 074.
 */
export async function traerCuentasParaElegir(empresaId: string): Promise<CuentaParaElegir[]> {
  try {
    const supabase = clienteServidor();
    const { data } = await supabase.rpc('cuentas_para_elegir', { p_empresa: empresaId });
    return Array.isArray(data) ? (data as CuentaParaElegir[]) : [];
  } catch {
    return [];
  }
}
