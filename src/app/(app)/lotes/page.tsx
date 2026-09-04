import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerLotes, traerMovimientosSinLote } from '@/lib/lotes';
import { fichaDe } from '@/lib/rubros';
import { hoyISO, sumarDias } from '@/lib/fechas';
import { PantallaLotes } from '@/components/PantallaLotes';

export const dynamic = 'force-dynamic';

/**
 * LOTES · la vista del ciclo, para los negocios donde el día no significa
 * nada.
 *
 * Un ganadero compra cuarenta novillos en marzo y los vende en octubre. Entre
 * medio, el panel le muestra siete meses de pura pérdida y un día de ganancia
 * enorme, y ninguna de las dos cosas es verdad. Acá se ve la misma plata
 * ordenada por ciclo en vez de por día.
 *
 * No es una pantalla más de carga: los gastos y las ventas se siguen cargando
 * donde siempre. Esto los agrupa.
 */
export default async function PaginaLotes() {
  const ctx = await contextoObligatorio();

  // Un almacén no tiene ciclos largos: vende hoy lo que compró ayer.
  const ficha = fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta);
  if (ficha.sinSecciones.includes('/lotes')) redirect('/panel');

  const hoy = hoyISO(ctx.zonaHoraria);

  const [lotes, sueltos] = await Promise.all([
    // Los cerrados también: el ganadero compara la zafra de este año con la
    // del anterior, y esa comparación es media razón de que exista esto.
    traerLotes(ctx.empresa.id, true),
    // Dos meses hacia atrás. Más que eso es una lista que no se lee, y lo
    // viejo se sigue pudiendo asignar desde el historial.
    traerMovimientosSinLote(ctx.empresa.id, sumarDias(hoy, -60), hoy),
  ]);

  return (
    <PantallaLotes
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      esAdmin={ctx.esAdmin}
      hoy={hoy}
      lotes={lotes}
      sueltos={sueltos}
    />
  );
}
