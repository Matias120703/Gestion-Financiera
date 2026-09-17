import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { Billetera } from './tipos';

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
