import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerLotes, traerMovimientosSinLote } from '@/lib/lotes';
import { traerCuentasParaElegir } from '@/lib/billetera';
import { fichaDe } from '@/lib/rubros';
import { hoyISO, sumarDias } from '@/lib/fechas';
import { PantallaLotes } from '@/components/PantallaLotes';

export const dynamic = 'force-dynamic';

/**
 * LOTES · la vista del ciclo, para los negocios donde el día no significa
 * nada. Para el agricultor, CAMPAÑAS (100).
 *
 * Un ganadero compra cuarenta novillos en marzo y los vende en octubre. Entre
 * medio, el panel le muestra siete meses de pura pérdida y un día de ganancia
 * enorme, y ninguna de las dos cosas es verdad. Acá se ve la misma plata
 * ordenada por ciclo en vez de por día.
 *
 * No es una pantalla más de carga de plata: los gastos y las ventas se
 * siguen cargando donde siempre, y el historial dice de qué campaña es cada
 * uno. Lo que sí se carga acá es lo que solo existe dentro de una campaña:
 * los kilos de cada camión y el papel de la cooperativa.
 */
export default async function PaginaLotes({
  searchParams: busqueda,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await busqueda;
  const ctx = await contextoObligatorio();

  // Un almacén no tiene ciclos largos: vende hoy lo que compró ayer.
  const ficha = fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta);
  if (!ficha.secciones['/lotes']) redirect('/panel');

  const hoy = hoyISO(ctx.zonaHoraria);

  const [lotes, sueltos, cuentas] = await Promise.all([
    // Los cerrados también: el agricultor compara esta zafra con la
    // anterior, y esa comparación es media razón de que exista esto.
    traerLotes(ctx.empresa.id, true),
    // Dos meses hacia atrás. Más que eso es una lista que no se lee, y lo
    // viejo se sigue pudiendo asignar desde el historial.
    traerMovimientosSinLote(ctx.empresa.id, sumarDias(hoy, -60), hoy),
    // Las cuentas, para decir a cuál entró el neto de una liquidación. La
    // carga solo administración: a los demás no se les piden.
    ctx.esAdmin ? traerCuentasParaElegir(ctx.empresa.id) : Promise.resolve([]),
  ]);

  return (
    <PantallaLotes
      empresaId={ctx.empresa.id}
      // Los montos se ESCRIBEN y se muestran grandes en la moneda de los
      // datos; la vista (051) solo agrega la otra en gris al lado.
      moneda={ctx.empresa.moneda}
      vista={ctx.vista}
      esAdmin={ctx.esAdmin}
      userId={ctx.userId}
      agricola={ficha.jerga === 'agricultura'}
      hoy={hoy}
      lotes={lotes}
      sueltos={sueltos}
      cuentas={cuentas}
      // «/lotes?nueva=1»: el botón «Abrir una campaña» del panel llega con
      // el formulario ya abierto, sin tener que tocarlo dos veces.
      abrirNueva={searchParams.nueva === '1'}
    />
  );
}
