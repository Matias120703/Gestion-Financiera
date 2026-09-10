import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { ClienteLista } from './tipos';

/**
 * Los clientes del negocio, con cuándo vinieron y cuánto dejaron (053).
 *
 * SOLO PARA EL SERVIDOR, por la misma razón que `lib/fiado.ts`.
 *
 * Se trae la lista entera —hasta 500— y se filtra en el navegador. Un
 * negocio chico no tiene tantos clientes como para que eso pese, y buscar
 * sin esperar a la red es lo que hace que el buscador se sienta instantáneo
 * en un mostrador con alguien esperando.
 */
export async function traerClientes(empresaId: string): Promise<ClienteLista[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('lista_clientes', {
    p_empresa: empresaId, p_texto: '', p_limite: 500,
  });
  const lista = exigir(respuesta, 'clientes') as any[];

  return (Array.isArray(lista) ? lista : []).map((c: any) => ({
    id: String(c.id),
    nombre: String(c.nombre ?? ''),
    telefono: String(c.telefono ?? ''),
    notas: String(c.notas ?? ''),
    created_at: String(c.created_at ?? ''),
    visitas: Number(c.visitas ?? 0),
    ultima_visita: c.ultima_visita ?? null,
    gastado: Number(c.gastado ?? 0),
    proximo_turno: c.proximo_turno ?? null,
  }));
}
