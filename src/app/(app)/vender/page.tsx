import { contextoObligatorio } from '@/lib/sesion';
import { traerProductos } from '@/lib/datos';
import { traerRanking } from '@/lib/agregados';
import { hoyISO, sumarDias } from '@/lib/fechas';
import { PantallaVenta } from '@/components/PantallaVenta';

export const dynamic = 'force-dynamic';

export default async function PaginaVender() {
  const ctx = await contextoObligatorio();

  // Lo que más vendiste en los últimos 30 días manda el orden de la grilla:
  // los productos que usás todo el día quedan arriba, sin buscarlos.
  const hoy = hoyISO();
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
