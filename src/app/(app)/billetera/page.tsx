import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { fichaDe } from '@/lib/rubros';
import { traerBilletera } from '@/lib/billetera';
import { PantallaBilletera } from '@/components/PantallaBilletera';

export const dynamic = 'force-dynamic';

/**
 * BILLETERA · cuánto hay en cada banco, en el efectivo y en las billeteras.
 *
 * Solo para el dueño y los administradores: la base igual lo exige
 * (`billetera()`, 074), pero a un vendedor ni se le ofrece la pantalla.
 */
export default async function PaginaBilletera() {
  const ctx = await contextoObligatorio();
  if (!ctx.esAdmin || !fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta).secciones['/billetera']) {
    redirect('/panel');
  }

  const billetera = await traerBilletera(ctx.empresa.id);

  return <PantallaBilletera empresaId={ctx.empresa.id} moneda={ctx.empresa.moneda} billetera={billetera} />;
}
