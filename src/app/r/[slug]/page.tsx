import { notFound } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';
import { ReservaPublica } from '@/components/ReservaPublica';
import type { AgendaPublica } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/**
 * LA PÁGINA PÚBLICA DE RESERVAS
 *
 * Lo primero de Orden que toca alguien sin cuenta. Vive fuera del grupo
 * `(app)` a propósito: sin menú, sin barra superior, sin sesión. Quien entra
 * por el link de Instagram no está usando Orden — está reservando un turno
 * con su peluquero, y no tiene por qué enterarse de que hay un sistema
 * detrás.
 *
 * Todo lo que se lee acá sale de `agenda_publica`, que devuelve el mínimo:
 * el negocio, quiénes atienden y qué servicios se pueden reservar. Ni los
 * costos, ni los productos con stock, ni el id de la empresa salen de ahí.
 */
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const datos = await traer(params.slug);
  if (!datos?.existe) return { title: 'Reservar un turno' };
  return {
    title: `Reservar con ${datos.negocio}`,
    description: datos.mensaje || `Elegí día y horario con ${datos.negocio}.`,
  };
}

async function traer(slug: string): Promise<AgendaPublica | null> {
  const supabase = clienteServidor();
  const { data } = await supabase.rpc('agenda_publica', { p_slug: slug });
  return (data ?? null) as AgendaPublica | null;
}

export default async function PaginaReservar({ params }: { params: { slug: string } }) {
  const datos = await traer(params.slug);

  // Un link apagado y uno que no existe dan la misma pantalla. Distinguirlos
  // le diría a cualquiera qué negocios usan Orden y cuáles cerraron.
  if (!datos?.existe) notFound();

  return <ReservaPublica slug={params.slug} datos={datos} />;
}
