import { NextResponse } from 'next/server';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisar, cronAutorizado } from '@/lib/avisos';
import { diccionario } from '@/i18n/diccionarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * «MAÑANA TENÉS CINCO TURNOS».
 *
 * El aviso de la tarde para quien lleva agenda. No es un resumen bonito: es
 * el disparador de la única cosa que baja los plantones, que es escribirle al
 * cliente el día anterior.
 *
 * POR QUÉ AVISA AL LOCAL Y NO AL CLIENTE
 *
 * Porque al cliente no se le puede. Nunca se registró en Orden, así que no
 * hay a dónde mandarle un push; mandarle un mensaje de verdad necesita un
 * proveedor, verificación y plata por mensaje. Lo que sí existe hoy es que el
 * local abra la agenda y toque un botón por cliente, y para eso primero hay
 * que acordarse. Esto es acordarse.
 *
 * Por eso el cuerpo dice cuántos faltan avisar y no solo cuántos hay: un
 * número sin nada para hacer es una notificación que se aprende a ignorar.
 *
 * SOBRE LA HORA
 *
 * Con un solo disparo diario no se le puede acertar a la hora local de todos
 * —es el mismo problema que ya documenta `esLaHora` en la tarea de la noche—
 * así que no se compara ninguna hora: se manda en la corrida del día. El
 * horario del cron en `vercel.json` está elegido para que caiga a la tarde en
 * América, que es donde están las cuentas. La tabla `envios` garantiza uno
 * por persona y por día en cualquier caso.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const supabase = clienteDeServicio();

  const { data, error } = await supabase.rpc('turnos_de_manana');

  if (error) {
    console.error('[turnos-manana] lectura', error.message);
    return NextResponse.json({ error: 'No se pudo leer.' }, { status: 503 });
  }

  const lista = (Array.isArray(data) ? data : []) as {
    empresa_id: string; nombre: string; zona: string; fecha: string;
    turnos: number; sin_avisar: number;
  }[];

  let enviados = 0;
  let salteados = 0;

  for (const negocio of lista) {
    // Solo a quien puede hacer algo con el dato. Un vendedor puede avisarle
    // al cliente, así que también entra: la agenda no es información
    // reservada como sí lo son la ganancia o los márgenes.
    const { data: gente } = await supabase
      .from('miembros')
      .select('user_id')
      .eq('empresa_id', negocio.empresa_id);

    for (const miembro of gente ?? []) {
      const { data: pref } = await supabase
        .from('preferencias')
        .select('idioma, aviso_turnos')
        .eq('user_id', miembro.user_id)
        .maybeSingle();

      if (!(pref?.aviso_turnos ?? true)) { salteados += 1; continue; }

      // Uno por persona, empresa y día de agenda. Si el cron se dispara dos
      // veces, el segundo no manda nada.
      const { data: reservado } = await supabase.rpc('reservar_envio', {
        p_tipo: 'turnos_manana',
        p_clave: `turnos:${negocio.empresa_id}:${miembro.user_id}:${negocio.fecha}`,
        p_user: miembro.user_id,
        p_empresa: negocio.empresa_id,
        p_canal: 'push',
      });

      if (!reservado) { salteados += 1; continue; }

      const idioma = pref?.idioma ?? 'es';
      const t = diccionario(idioma);

      const llegaron = await avisar(miembro.user_id, {
        titulo: negocio.nombre,
        cuerpo: t.agenda.mananaTenes(Number(negocio.turnos), Number(negocio.sin_avisar)),
        url: `/agenda?dia=${negocio.fecha}`,
        tag: `turnos-${negocio.empresa_id}`,
        idioma,
      });

      enviados += llegaron;
    }
  }

  return NextResponse.json({ negocios: lista.length, enviados, salteados });
}
