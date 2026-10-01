import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerProductos } from '@/lib/datos';
import { PantallaProductos } from '@/components/PantallaProductos';
import { catalogoSoloConStock, catalogoVisible, fichaDeLaCuenta } from '@/lib/rubros';

export const dynamic = 'force-dynamic';

/**
 * Solo donde la ficha tiene «/productos».
 *
 * Una cuenta personal no vende ni lleva productos, así que esta pantalla no
 * existe para ella; el campo tampoco tiene catálogo (fase 0), y el profe y el
 * trainer lo tienen solo si prendieron «También vendo productos» (121).
 * Redirige en vez de mostrar un cartel de «no disponible»: si nunca se
 * ofreció el camino, llegar acá es una URL escrita a mano o un enlace viejo,
 * y lo útil es dejar a la persona donde sí hay algo.
 *
 * Antes solo frenaba a la personal: la URL a mano abría el catálogo en
 * cualquier rubro. Ahora pregunta lo mismo que el menú, la ficha.
 */
export default async function PaginaProductos() {
  const ctx = await contextoObligatorio();
  const ficha = fichaDeLaCuenta(ctx.empresa);
  if (!ficha.secciones['/productos']) redirect('/panel');

  // El profe y el trainer ven solo sus productos con stock (121): ni el
  // servicio interno «Clase» que crea la base al inscribir, ni servicios.
  const soloProductos = catalogoSoloConStock(ficha);
  const productos = catalogoVisible(ficha, await traerProductos(ctx.empresa.id, false));

  /**
   * Pestañas de Servicios y Productos.
   *
   * En «Servicios y oficios» siempre: es donde las dos cosas conviven y
   * donde la mezcla confundía. En los demás rubros, solo si de verdad
   * tienen de las dos: un almacén que únicamente vende productos no tiene
   * por qué ver una pestaña de servicios vacía. Donde el catálogo es solo
   * de productos, nunca.
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
      // Y su formulario no pregunta «¿Servicio o producto?»: un servicio
      // cargado acá desaparecería de la lista al guardarlo.
      soloProductos={soloProductos}
      // El aviso de la duración en la agenda es de la barbería, que reserva
      // servicios del catálogo. La agenda del profe no reserva productos.
      tieneAgenda={ficha.secciones['/agenda'] && !ficha.agendaDeAlumnos}
    />
  );
}
