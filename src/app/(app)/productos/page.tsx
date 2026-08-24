import { contextoObligatorio } from '@/lib/sesion';
import { traerProductos } from '@/lib/datos';
import { PantallaProductos } from '@/components/PantallaProductos';

export const dynamic = 'force-dynamic';

export default async function PaginaProductos() {
  const ctx = await contextoObligatorio();
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
