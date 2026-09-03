import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerProductos } from '@/lib/datos';
import { traerProfesionales, soloServicios } from '@/lib/reparto';
import {
  traerLinkPublico, traerAgendaDelDia, traerHorarios, traerServiciosAgenda, traerExcepciones,
} from '@/lib/agenda';
import { fichaDe } from '@/lib/rubros';
import { hoyISO } from '@/lib/fechas';
import { PantallaAgenda } from '@/components/PantallaAgenda';
import type { Producto } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/**
 * AGENDA · el link de reservas, los turnos del día y el horario del equipo.
 *
 * El origen se arma del encabezado de la petición y no de una variable de
 * entorno: así el link que el dueño copia es el de donde está parado, y
 * funciona igual en producción, en una vista previa o probando en el
 * teléfono. Una URL escrita a mano en la configuración es una que algún día
 * queda vieja y le hace copiar un link roto.
 */
export default async function PaginaAgenda({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await contextoObligatorio();

  const ficha = fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta);
  if (ficha.sinSecciones.includes('/reparto')) redirect('/panel');

  const cabeceras = headers();
  const host = cabeceras.get('x-forwarded-host') ?? cabeceras.get('host') ?? '';
  const protocolo = cabeceras.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origen = host ? `${protocolo}://${host}` : '';

  const hoy = hoyISO(ctx.zonaHoraria);
  const dia = typeof searchParams.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.dia)
    ? searchParams.dia
    : hoy;

  const [link, turnos, profesionales, horarios, servicios, productos, excepciones] = await Promise.all([
    ctx.esAdmin ? traerLinkPublico(ctx.empresa.id) : Promise.resolve(null),
    traerAgendaDelDia(ctx.empresa.id, dia),
    traerProfesionales(ctx.empresa.id),
    traerHorarios(ctx.empresa.id),
    traerServiciosAgenda(ctx.empresa.id),
    traerProductos(ctx.empresa.id),
    traerExcepciones(ctx.empresa.id, hoy),
  ]);

  return (
    <PantallaAgenda
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      link={link}
      turnos={turnos}
      profesionales={profesionales}
      horarios={horarios}
      servicios={servicios}
      catalogo={soloServicios(productos as Producto[])}
      esAdmin={ctx.esAdmin}
      dia={dia}
      hoy={hoy}
      excepciones={excepciones}
      negocio={ctx.empresa.nombre}
      zona={ctx.zonaHoraria}
      origen={origen}
    />
  );
}
