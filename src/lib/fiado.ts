import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { DeudorFiado, GrupoFiado, ProximaCuota, ResumenFiado } from './tipos';

const GRUPOS: GrupoFiado[] = ['atrasada', 'hoy', 'proxima', 'sin_fecha'];

/** La cuota pendiente más próxima, tal como la manda la base (127); null si no hay. */
function leerProxima(p: any): ProximaCuota | null {
  if (!p || !p.cuota_id) return null;
  return {
    cuota_id: String(p.cuota_id),
    fio_id: String(p.fio_id ?? ''),
    numero: Number(p.numero ?? 1),
    de: Number(p.de ?? 1),
    vence_el: String(p.vence_el ?? ''),
    dias: Number(p.dias ?? 0),
    pendiente: Number(p.pendiente ?? 0),
    avisado_el: p.avisado_el ?? null,
  };
}

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
    // Fechas de cobro (127). Si la base todavía no las manda, todo queda
    // como «sin fecha»: la pantalla de siempre, sin inventar ninguna cuota.
    sin_fecha: Number(c.sin_fecha ?? c.saldo ?? 0),
    con_fecha: Number(c.con_fecha ?? 0),
    atrasadas: Number(c.atrasadas ?? 0),
    monto_atrasado: Number(c.monto_atrasado ?? 0),
    proxima: leerProxima(c.proxima),
    grupo: GRUPOS.includes(c.grupo) ? (c.grupo as GrupoFiado) : 'sin_fecha',
  }));

  return {
    total: Number(d?.total ?? 0),
    cuantos: Number(d?.cuantos ?? 0),
    clientes,
    atrasadas: Number(d?.atrasadas ?? 0),
    monto_atrasado: Number(d?.monto_atrasado ?? 0),
    vencen_hoy: Number(d?.vencen_hoy ?? 0),
    monto_hoy: Number(d?.monto_hoy ?? 0),
    vencen_semana: Number(d?.vencen_semana ?? 0),
    monto_semana: Number(d?.monto_semana ?? 0),
    proximo_vencimiento: d?.proximo_vencimiento ?? null,
    con_fecha_cuantos: Number(d?.con_fecha_cuantos ?? 0),
  };
}
