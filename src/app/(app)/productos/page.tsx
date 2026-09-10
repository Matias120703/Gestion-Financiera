import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerProductos } from '@/lib/datos';
import { PantallaProductos } from '@/components/PantallaProductos';
import { tieneSeccion } from '@/lib/rubros';

export const dynamic = 'force-dynamic';

/**
 * Solo comercio.
 *
 * Una cuenta personal no vende ni lleva productos, así que esta pantalla no
 * existe para ella. Redirige en vez de mostrar un cartel de «no disponible»:
 * si nunca se ofreció el camino, llegar acá es una URL escrita a mano o un
 * enlace viejo, y lo útil es dejar a la persona donde sí hay algo.
 */
export default async function PaginaProductos() {
  const ctx = await contextoObligatorio();
  if (ctx.empresa.tipo_cuenta === 'personal') redirect('/panel');

  const productos = await traerProductos(ctx.empresa.id, false);

  /**
   * Pestañas de Servicios y Productos.
   *
   * En «Servicios y oficios» siempre: es donde las dos cosas conviven y
   * donde la mezcla confundía. En los demás rubros, solo si de verdad
   * tienen de las dos: un almacén que únicamente vende productos no tiene
   * por qué ver una pestaña de servicios vacía.
   */
  const esServicios = ctx.empresa.rubro === 'servicios';
  const hayServicios = productos.some((p) => !p.controla_stock);
  const hayProductos = productos.some((p) => p.controla_stock);

  return (
    <PantallaProductos
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      productos={productos}
      puedeGestionar={ctx.esAdmin}
      conPestanas={esServicios || (hayServicios && hayProductos)}
      pestanaInicial={esServicios ? 'servicios' : 'productos'}
      tieneAgenda={tieneSeccion(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, '/agenda')}
    />
  );
}
