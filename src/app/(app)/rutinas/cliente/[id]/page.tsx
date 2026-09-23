import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { tieneSeccion } from '@/lib/rubros';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigir } from '@/lib/lectura';
import { hoyISO } from '@/lib/fechas';
import { CarpetaCliente } from '@/components/rutinas/CarpetaCliente';
import { UUID } from '@/components/rutinas/panel/utiles';
import type {
  CarpetaCliente as DatosCarpeta, ProgresoCliente as DatosProgreso,
} from '@/lib/tipos-rutinas';

export const dynamic = 'force-dynamic';

/**
 * LA CARPETA DE UN CLIENTE (098): su rutina, sus rutinas anteriores, su
 * link y (para el dueño o un admin) sus medidas y cómo progresó.
 *
 * El progreso se pide solo con la pestaña abierta y solo si quien mira lo
 * puede ver: a un miembro que no es admin la base se lo negaría, y la
 * pestaña ni aparece. «Salud y lesiones» sí la ve todo el equipo (ver
 * ESTADO de la fase 1): un trainer que trabaja para otro tiene que saber de
 * la rodilla operada antes de entrenar a esa persona.
 *
 * Un id roto o de otra cuenta vuelve a la lista, sin error: es lo que pasa
 * al tocar un link viejo de un cliente que se archivó.
 */
export default async function PaginaCarpetaCliente({
  params, searchParams: busqueda,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, searchParams] = await Promise.all([params, busqueda]);
  const ctx = await contextoObligatorio();
  if (!tieneSeccion(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, '/rutinas')) redirect('/panel');
  if (!UUID.test(id)) redirect('/rutinas');

  const ver = searchParams.ver === 'progreso' && ctx.esAdmin ? 'progreso' : 'rutina';

  const supabase = clienteServidor();
  const [respuesta, respuestaProgreso] = await Promise.all([
    supabase.rpc('rutinas_del_cliente', { p_empresa: ctx.empresa.id, p_cliente: id }),
    ver === 'progreso'
      ? supabase.rpc('progreso_de', { p_empresa: ctx.empresa.id, p_cliente: id })
      : Promise.resolve(null),
  ]);

  // «Ese cliente no es de esta cuenta.» (P0002): no es una falla de lectura.
  if ((respuesta.error as { code?: string } | null)?.code === 'P0002') redirect('/rutinas');

  const carpeta = exigir(respuesta, 'carpeta del cliente') as DatosCarpeta;
  const progreso = respuestaProgreso ? (exigir(respuestaProgreso, 'progreso del cliente') as DatosProgreso) : null;

  return (
    <CarpetaCliente
      empresaId={ctx.empresa.id}
      zona={ctx.zonaHoraria}
      hoy={hoyISO(ctx.zonaHoraria)}
      esAdmin={ctx.esAdmin}
      ver={ver}
      carpeta={{
        ...carpeta,
        anteriores: Array.isArray(carpeta.anteriores) ? carpeta.anteriores : [],
      }}
      progreso={progreso && {
        ...progreso,
        mediciones: Array.isArray(progreso.mediciones) ? progreso.mediciones : [],
        cargas: Array.isArray(progreso.cargas) ? progreso.cargas : [],
      }}
      // «Anotar control» desde «Para atender»: la hoja ya abierta.
      anotar={ver === 'progreso' && searchParams.anotar === '1'}
    />
  );
}
