import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { DeudorFiado, ResumenFiado } from './tipos';

/**
 * Lo que te deben, todo junto (054).
 *
 * SOLO PARA EL SERVIDOR. Importa el cliente de Supabase del servidor, y un
 * componente de navegador que lo importara rompería el build entero — ya
 * pasó con los días de prueba. Las pantallas reciben esto ya leído.
 *
 * Si la lectura falla, lanza: mostrar «nadie te debe nada» porque no se
 * pudo leer sería inventar un dato, y justo uno sobre plata.
 */
export async function traerResumenFiado(empresaId: string): Promise<ResumenFiado> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('resumen_fiado', { p_empresa: empresaId });
  const d = exigir(respuesta, 'lo que te deben') as any;

  const clientes: DeudorFiado[] = (Array.isArray(d?.clientes) ? d.clientes : []).map((c: any) => ({
    cliente_id: String(c.cliente_id),
    nombre: String(c.nombre ?? ''),
    telefono: String(c.telefono ?? ''),
    saldo: Number(c.saldo ?? 0),
    desde: c.desde ?? null,
    dias: c.dias == null ? null : Number(c.dias),
  }));

  return {
    total: Number(d?.total ?? 0),
    cuantos: Number(d?.cuantos ?? 0),
    clientes,
  };
}
