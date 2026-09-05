import { NextResponse } from 'next/server';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisar } from '@/lib/avisos';
import { diccionario } from '@/i18n/diccionarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «ENTRÓ UNA RESERVA POR EL LINK».
 *
 * La dispara el navegador del cliente apenas termina de reservar, y le manda
 * un push al local en el momento. Sin esto, el dueño se entera cuando se le
 * ocurre entrar a la agenda — o nunca, si la reserva era para hoy, porque la
 * tarea de la tarde solo mira las de mañana.
 *
 * POR QUÉ ES PÚBLICA Y POR QUÉ IGUAL NO SE PUEDE ABUSAR
 *
 * Quien reserva no tiene cuenta en Orden, así que esta ruta no puede pedir
 * sesión. Lo que pide es el TOKEN de la reserva, y la base solo contesta si
 * además es RECIENTE (ver `aviso_de_reserva`, migración 046). Sumado a que el
 * envío se marca en `envios`, las tres cosas juntas cierran las tres formas
 * de abusarla: mandarle avisos a un local ajeno, repetir el mismo cien veces,
 * y usar el enlace de cancelar —que el cliente guarda para siempre— para
 * hacer sonar el teléfono del barbero cuando se le antoje.
 *
 * NUNCA FALLA HACIA AFUERA
 *
 * Contesta 200 aunque no haya mandado nada. Del otro lado hay una persona
 * mirando «tu turno quedó reservado», y un error acá no cambia que su turno
 * está tomado: hacérselo ver sería asustarla por algo que no es suyo.
 */
export async function POST(request: Request) {
  let token = '';
  try {
    const cuerpo = await request.json();
    token = String(cuerpo?.token ?? '');
  } catch {
    return NextResponse.json({ avisados: 0 });
  }

  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ avisados: 0 });

  const supabase = clienteDeServicio();

  const { data, error } = await supabase.rpc('aviso_de_reserva', { p_token: token });
  if (error || !data) return NextResponse.json({ avisados: 0 });

  const r = data as {
    reserva: string; empresa_id: string; negocio: string; cliente: string;
    servicio: string; profesional: string; hora: string; fecha: string;
    es_hoy: boolean; es_manana: boolean;
  };

  // Uno por reserva y para siempre. Es lo que hace que repetir el pedido —a
  // propósito o porque el navegador reintentó— no vuelva a sonar.
  const { data: reservado } = await supabase.rpc('reservar_envio', {
    p_tipo: 'reserva_nueva',
    p_clave: `reserva:${r.reserva}`,
    p_user: null,
    p_empresa: r.empresa_id,
    p_canal: 'push',
  });
  if (!reservado) return NextResponse.json({ avisados: 0 });

  // A todo el equipo: el que atiende el mostrador necesita saberlo tanto como
  // el dueño. La agenda no es información reservada como la ganancia.
  const { data: gente } = await supabase
    .from('miembros')
    .select('user_id')
    .eq('empresa_id', r.empresa_id);

  let avisados = 0;

  for (const miembro of gente ?? []) {
    const { data: pref } = await supabase
      .from('preferencias')
      .select('idioma, aviso_turnos')
      .eq('user_id', miembro.user_id)
      .maybeSingle();

    if (!(pref?.aviso_turnos ?? true)) continue;

    const idioma = pref?.idioma ?? 'es';
    const t = diccionario(idioma);

    avisados += await avisar(miembro.user_id, {
      titulo: r.negocio,
      cuerpo: t.agenda.nuevaReserva({
        cliente: r.cliente,
        servicio: r.servicio,
        hora: r.hora,
        cuando: r.es_hoy ? t.comun.hoy : r.es_manana ? t.agenda.manana : r.fecha,
      }),
      url: `/agenda?dia=${r.fecha}`,
      tag: `reserva-${r.reserva}`,
      idioma,
    });
  }

  return NextResponse.json({ avisados });
}
