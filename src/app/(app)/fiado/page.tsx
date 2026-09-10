import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { tieneSeccion } from '@/lib/rubros';
import { traerResumenFiado } from '@/lib/fiado';
import { PantallaFiado } from '@/components/PantallaFiado';

export const dynamic = 'force-dynamic';

/**
 * FIADO · lo que te deben.
 *
 * Es el espejo de Deudas, pero NO es solo del dueño, y es a propósito: el que
 * fía es el que está en el mostrador, y es el mismo que tiene que cobrar. La
 * base se lo permite a cualquier miembro (054), así que la pantalla también.
 *
 * Los montos van en la moneda de verdad del negocio y no en la de la vista
 * (051): acá se escribe plata, no solo se mira, y un cobro escrito en dólares
 * y guardado tal cual quedaría guardado como guaraníes.
 */
export default async function PaginaFiado() {
  const ctx = await contextoObligatorio();
  if (!tieneSeccion(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, '/fiado')) redirect('/panel');

  const resumen = await traerResumenFiado(ctx.empresa.id);

  return (
    <PantallaFiado
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      zona={ctx.zonaHoraria}
      negocio={ctx.empresa.nombre}
      esPersonal={ctx.empresa.tipo_cuenta === 'personal'}
      resumen={resumen}
    />
  );
}
