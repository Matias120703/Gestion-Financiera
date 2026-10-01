import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerProductos } from '@/lib/datos';
import { traerRanking } from '@/lib/agregados';
import { hoyISO, sumarDias } from '@/lib/fechas';
import { catalogoVisible, fichaDeLaCuenta } from '@/lib/rubros';
import { traerLotes } from '@/lib/lotes';
import { PantallaVenta } from '@/components/PantallaVenta';
import type { CampanaParaElegir } from '@/components/ListaMovimientos';

export const dynamic = 'force-dynamic';

/**
 * Solo donde la ficha tiene «/vender».
 *
 * Una cuenta personal no vende ni lleva productos, así que esta pantalla no
 * existe para ella; tampoco para el profe y el trainer, salvo que hayan
 * prendido «También vendo productos» (121). Redirige en vez de mostrar un
 * cartel de «no disponible»: si nunca se ofreció el camino, llegar acá es
 * una URL escrita a mano o un enlace viejo, y lo útil es dejar a la persona
 * donde sí hay algo.
 *
 * Antes solo frenaba a la personal: un profe que escribía /vender a mano
 * entraba a cobrar. Ahora pregunta lo mismo que el menú, la ficha.
 */
export default async function PaginaVender() {
  const ctx = await contextoObligatorio();
  const ficha = fichaDeLaCuenta(ctx.empresa);
  if (!ficha.secciones['/vender']) redirect('/panel');

  // Un negocio con lotes cuelga la venta de una campaña (100): la feria de
  // la huerta, el camión de mandioca. Solo las abiertas.
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
      // El profe y el trainer, solo sus productos con stock (121): el
      // servicio interno «Clase» a Gs. 0 no es algo que venda.
      productos={catalogoVisible(ficha, productos)}
      frecuentes={frecuentes}
      // Solo lo que el chip necesita: los números de cada campaña no viajan.
      campanas={lotes.map((l): CampanaParaElegir => ({
        id: l.id, nombre: l.nombre, cultivo: l.cultivo ?? '', campana: l.campana ?? '',
        hectareas: l.hectareas ?? null, abierto_el: l.abierto_el, estado: l.estado,
      }))}
      esAgricultura={ficha.jerga === 'agricultura'}
      conCatalogo={ficha.secciones['/productos']}
      // El profe y el trainer que venden productos (121): sin fiado, que
      // sigue afuera de su ficha (091), y sin «producto suelto», que no
      // tiene costo ni stock y caería en lo cobrado de las clases. Lo que se
      // vende sale del catálogo, que es lo que sabe cuánto ganó.
      conFiado={ficha.secciones['/fiado']}
      conSuelto={!ficha.agendaDeAlumnos}
    />
  );
}
