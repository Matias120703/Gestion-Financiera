import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { avisar } from '@/lib/avisos';
import { diccionario } from '@/i18n/diccionarios';
import { esIdioma, IDIOMA_POR_DEFECTO } from '@/i18n/idiomas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «PROBAR»: UN AVISO A MI PROPIO TELÉFONO, AHORA.
 *
 * Cuando alguien dice «no me llegan las notificaciones», hay cinco cosas que
 * pueden estar fallando —el permiso del navegador, la suscripción guardada,
 * las claves VAPID, el reloj que dispara las tareas, o la frase que decide
 * que hoy no hay nada que decir— y desde afuera se ven todas iguales.
 *
 * Este botón corta la lista al medio: si el aviso de prueba llega, el
 * teléfono y las claves están bien y lo que falla es el reloj o el contenido;
 * si no llega, el problema está antes y no hay nada que esperar de la noche.
 *
 * Solo se manda a los dispositivos de quien lo pide: no recibe un parámetro
 * de a quién avisar, así que no hay forma de usarlo para escribirle a otro.
 */
export async function POST() {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: pref } = await supabase
    .from('preferencias').select('idioma').eq('user_id', user.id).maybeSingle();
  const idioma = esIdioma(pref?.idioma) ? pref!.idioma : IDIOMA_POR_DEFECTO;
  const t = diccionario(idioma).notificaciones.avisoDePrueba;

  const entregados = await avisar(user.id, {
    titulo: t.titulo,
    cuerpo: t.cuerpo,
    url: '/panel',
    tag: 'prueba',
    idioma,
  });

  // `entregados` es cuántos dispositivos lo aceptaron. Cero significa que no
  // hay ninguno registrado, o que el servidor de push lo rechazó: en los dos
  // casos, decir «listo» sería mentir.
  return NextResponse.json({ ok: entregados > 0, entregados });
}
