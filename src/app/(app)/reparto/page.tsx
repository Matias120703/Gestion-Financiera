import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { rangoDesdeParams, traerProductos } from '@/lib/datos';
import {
  traerProfesionales, traerResumenReparto, traerLiquidacion, traerMisServicios,
  traerPreciosPropios, soloServicios,
} from '@/lib/reparto';
import { fichaDe } from '@/lib/rubros';
import { PantallaReparto } from '@/components/PantallaReparto';
import { MisServiciosPantalla } from '@/components/PantallaReparto';
import { clienteServidor } from '@/lib/supabase/servidor';
import type { Miembro, Producto } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/**
 * EQUIPO Y REPARTO · el primer módulo de un rubro.
 *
 * En una peluquería la plata del corte casi nunca es toda del local ni toda
 * del profesional. Esta pantalla contesta las dos preguntas que de eso se
 * derivan: cuánto le queda al dueño y de dónde salió, y cuánto le toca a cada
 * uno el viernes.
 *
 * DOS PANTALLAS EN UNA, Y NO POR COMODIDAD
 *
 * Un vendedor que además es profesional ve LO SUYO: sus servicios y su parte.
 * No ve el margen del local ni lo que producen sus compañeros — y eso no lo
 * decide este archivo, lo decide la base: `resumen_reparto` y `liquidacion`
 * exigen es_admin, y `mis_servicios` ni siquiera devuelve la columna del
 * local. Acá se elige qué pedir; si alguien pidiera lo otro, se lo negarían.
 */
export default async function PaginaReparto({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await contextoObligatorio();

  // El módulo existe donde hay gente cobrando por su trabajo. En los demás
  // rubros la ruta no está, igual que Cierre no está para una ganadería.
  const ficha = fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta);
  if (ficha.sinSecciones.includes('/reparto')) redirect('/panel');

  const rango = rangoDesdeParams(searchParams, ctx.zonaHoraria);

  if (!ctx.esAdmin) {
    const mio = await traerMisServicios(ctx.empresa.id, rango.desde, rango.hasta);
    return (
      <MisServiciosPantalla
        datos={mio}
        moneda={ctx.empresa.moneda}
        desde={rango.desde}
        hasta={rango.hasta}
      />
    );
  }

  // Los miembros con cuenta, para poder atar un profesional a su usuario. La
  // consulta la filtra RLS: solo vuelven los de esta empresa.
  const supabase = clienteServidor();

  const [profesionales, resumen, liquidacion, productos, precios, gente] = await Promise.all([
    traerProfesionales(ctx.empresa.id),
    traerResumenReparto(ctx.empresa.id, rango.desde, rango.hasta),
    traerLiquidacion(ctx.empresa.id, rango.desde, rango.hasta),
    traerProductos(ctx.empresa.id),
    traerPreciosPropios(ctx.empresa.id),
    supabase.from('miembros').select('user_id, nombre, rol').eq('empresa_id', ctx.empresa.id),
  ]);

  return (
    <PantallaReparto
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      profesionales={profesionales}
      resumen={resumen}
      liquidacion={liquidacion}
      servicios={soloServicios(productos as Producto[])}
      precios={precios}
      equipo={(gente.data ?? []) as Pick<Miembro, 'user_id' | 'nombre' | 'rol'>[]}
      desde={rango.desde}
      hasta={rango.hasta}
    />
  );
}
