import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerProductos } from '@/lib/datos';
import { traerRanking } from '@/lib/agregados';
import { hoyISO, sumarDias } from '@/lib/fechas';
import { PantallaVenta } from '@/components/PantallaVenta';

export const dynamic = 'force-dynamic';

/**
 * Solo comercio.
 *
 * Una cuenta personal no vende ni lleva productos, así que esta pantalla no
 * existe para ella. Redirige en vez de mostrar un cartel de «no disponible»:
 * si nunca se ofreció el camino, llegar acá es una URL escrita a mano o un
 * enlace viejo, y lo útil es dejar a la persona donde sí hay algo.
 */
export default async function PaginaVender() {
  const ctx = await contextoObligatorio();
  if (ctx.empresa.tipo_cuenta === 'personal') redirect('/panel');


  // Lo que más vendiste en los últimos 30 días manda el orden de la grilla:
  // los productos que usás todo el día quedan arriba, sin buscarlos.
  const hoy = hoyISO(ctx.zonaHoraria);
  const [productos, ranking] = await Promise.all([
    traerProductos(ctx.empresa.id),
    traerRanking(ctx.empresa.id, sumarDias(hoy, -29), hoy),
  ]);

  const frecuentes = ranking
    .map((f) => f.producto_id)
    .filter((id): id is string => Boolean(id));

  return (
    <PantallaVenta
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      productos={productos}
      frecuentes={frecuentes}
    />
  );
}
