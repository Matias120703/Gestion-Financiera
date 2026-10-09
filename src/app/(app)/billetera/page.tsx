import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { fichaDe, fichaDeLaCuenta } from '@/lib/rubros';
import { traerBilletera, traerPatrimonio } from '@/lib/billetera';
import { PantallaBilletera } from '@/components/PantallaBilletera';

export const dynamic = 'force-dynamic';

/**
 * BILLETERA · cuánto hay en cada banco, en el efectivo y en las billeteras.
 *
 * Solo para el dueño y los administradores: la base igual lo exige
 * (`billetera()`, 074), pero a un vendedor ni se le ofrece la pantalla.
 *
 * Y LO QUE TIENE Y NO ES PLATA (132): un auto, un terreno. Va acá adentro,
 * debajo de las cuentas, porque esta pantalla ya es solo de quien administra,
 * ya está tapada en la personal Gratis y ya respeta al negocio vencido. Si
 * `patrimonio()` no se puede leer (este código llegó antes que la migración),
 * `traerPatrimonio` devuelve null y la Billetera abre como siempre, sin eso.
 */
export default async function PaginaBilletera() {
  const ctx = await contextoObligatorio();
  // (110, 28/09/2026) la tarjeta la pone CandadoSeccion en el layout; así no
  // se leen ni viajan datos del Pro. Para un negocio es siempre false.
  if (ctx.gratisPersonal) return null;
  if (!ctx.esAdmin || !fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta).secciones['/billetera']) {
    redirect('/panel');
  }

  const [billetera, patrimonio] = await Promise.all([
    traerBilletera(ctx.empresa.id),
    traerPatrimonio(ctx.empresa.id),
  ]);
  // La mercadería cuenta en «Tengo en total» solo para quien tiene Productos
  // (un comercio, o quien prendió «También vendo productos»).
  const conMercaderia = fichaDeLaCuenta(ctx.empresa).secciones['/productos'];

  return (
    <PantallaBilletera
      empresaId={ctx.empresa.id} moneda={ctx.empresa.moneda} billetera={billetera}
      patrimonio={patrimonio} conMercaderia={conMercaderia}
    />
  );
}
