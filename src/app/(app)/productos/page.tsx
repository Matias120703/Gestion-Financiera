import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerProductos } from '@/lib/datos';
import { PantallaProductos } from '@/components/PantallaProductos';

export const dynamic = 'force-dynamic';

/**
 * Solo comercio.
 *
 * Una cuenta personal no vende ni lleva productos, así que esta pantalla no
 * existe para ella. Redirige en vez de mostrar un cartel de «no disponible»:
 * si nunca se ofreció el camino, llegar acá es una URL escrita a mano o un
 * enlace viejo, y lo útil es dejar a la persona donde sí hay algo.
 */
export default async function PaginaProductos() {
  const ctx = await contextoObligatorio();
  if (ctx.empresa.tipo_cuenta === 'personal') redirect('/panel');

  const productos = await traerProductos(ctx.empresa.id, false);

  return (
    <PantallaProductos
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      productos={productos}
      puedeGestionar={ctx.esAdmin}
    />
  );
}
