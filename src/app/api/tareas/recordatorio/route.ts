import { NextResponse } from 'next/server';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisar, cronAutorizado } from '@/lib/avisos';
import { diccionario } from '@/i18n/diccionarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * EL RECORDATORIO DE LA NOCHE.
 *
 * Corre cada hora y le escribe únicamente a quien cumple TRES condiciones a
 * la vez:
 *
 *   1. en su zona horaria ya es la hora que eligió (20:00 por defecto);
 *   2. hoy no cargó nada;
 *   3. tiene una racha viva que perder (dos días o más).
 *
 * La tercera es la que separa un recordatorio de un spam. A quien todavía no
 * tiene el hábito, un aviso no se lo crea: lo único que hace es enseñarle a
 * ignorar nuestras notificaciones. A quien lleva nueve días seguidos, en
 * cambio, le estamos avisando de algo que de verdad no quiere perder.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const supabase = clienteDeServicio();

  const { data: candidatas, error } = await supabase.rpc('empresas_sin_cargar_hoy', {
    p_racha_minima: 2,
  });

  if (error) {
    console.error('[recordatorio] candidatas', error.message);
    return NextResponse.json({ error: 'No se pudo leer.' }, { status: 503 });
  }

  const lista = (Array.isArray(candidatas) ? candidatas : []) as {
    empresa_id: string; nombre: string; zona: string; racha: number;
  }[];

  let enviados = 0;
  let salteados = 0;

  for (const empresa of lista) {
    // ¿Ya es de noche allá? Se compara en la zona del negocio, no en la del
    // servidor: para el mismo instante, en Asunción son las 20 y en Berlín
    // la una de la mañana.
    const horaLocal = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: empresa.zona || 'America/Asuncion',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()));

    const { data: gente } = await supabase
      .from('miembros')
      .select('user_id, rol')
      .eq('empresa_id', empresa.empresa_id)
      .in('rol', ['propietario', 'admin']);

    for (const miembro of gente ?? []) {
      const { data: pref } = await supabase
        .from('preferencias')
        .select('idioma, aviso_cierre, hora_cierre')
        .eq('user_id', miembro.user_id)
        .maybeSingle();

      const quiere = pref?.aviso_cierre ?? true;
      const hora = pref?.hora_cierre ?? 20;
      const idioma = pref?.idioma ?? 'es';

      if (!quiere || horaLocal !== hora) { salteados += 1; continue; }

      // Idempotencia: una vez por persona, empresa y día. Si el cron se
      // dispara dos veces en la misma hora, el segundo no manda nada.
      const hoy = new Intl.DateTimeFormat('en-CA', {
        timeZone: empresa.zona || 'America/Asuncion',
      }).format(new Date());

      const { data: reservado } = await supabase.rpc('reservar_envio', {
        p_tipo: 'recordatorio',
        p_clave: `recordatorio:${empresa.empresa_id}:${miembro.user_id}:${hoy}`,
        p_user: miembro.user_id,
        p_empresa: empresa.empresa_id,
        p_canal: 'push',
      });

      if (!reservado) { salteados += 1; continue; }

      const t = diccionario(idioma);
      const llegaron = await avisar(miembro.user_id, {
        titulo: empresa.nombre,
        cuerpo: t.racha.enRiesgo(empresa.racha),
        url: '/cierre',
        tag: `cierre-${empresa.empresa_id}`,
        idioma,
      });

      enviados += llegaron;
    }
  }

  return NextResponse.json({ candidatas: lista.length, enviados, salteados });
}
