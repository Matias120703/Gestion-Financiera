import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerProductos } from '@/lib/datos';
import { traerRanking } from '@/lib/agregados';
import { hoyISO, sumarDias } from '@/lib/fechas';
import { fichaDe } from '@/lib/rubros';
import { traerLotes } from '@/lib/lotes';
import { PantallaVenta } from '@/components/PantallaVenta';
import type { CampanaParaElegir } from '@/components/ListaMovimientos';

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

  // Un negocio con lotes cuelga la venta de una campaña (100): la feria de
  // la huerta, el camión de mandioca. Solo las abiertas.
  const ficha = fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta);
  const conCampanas = ficha.secciones['/lotes'];

  // Lo que más vendiste en los últimos 30 días manda el orden de la grilla:
  // los productos que usás todo el día quedan arriba, sin buscarlos.
  const hoy = hoyISO(ctx.zonaHoraria);
  const [productos, ranking, lotes] = await Promise.all([
    traerProductos(ctx.empresa.id),
    traerRanking(ctx.empresa.id, sumarDias(hoy, -29), hoy),
    conCampanas ? traerLotes(ctx.empresa.id, false) : Promise.resolve([]),
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
      // Solo lo que el chip necesita: los números de cada campaña no viajan.
      campanas={lotes.map((l): CampanaParaElegir => ({
        id: l.id, nombre: l.nombre, cultivo: l.cultivo ?? '', campana: l.campana ?? '',
        hectareas: l.hectareas ?? null, abierto_el: l.abierto_el, estado: l.estado,
      }))}
      esAgricultura={ficha.jerga === 'agricultura'}
      conCatalogo={ficha.secciones['/productos']}
    />
  );
}
