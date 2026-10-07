import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { dependencias } from '@/lib/bancard-servidor';
import { quitarTarjeta } from '@/lib/bancard-flujo';
import { textos } from '@/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lo que hay que escribir para confirmar. Sin esto no se borra nada. */
const PALABRA = 'BORRAR';

/**
 * BORRAR LA CUENTA. Es irreversible y no hay papelera.
 *
 * Por qué pasa por el servidor y no llama directo a la base:
 *
 *   1. Borrar de `auth.users` necesita la clave de servicio, que jamás puede
 *      estar en el navegador.
 *   2. Los ARCHIVOS de Storage no se van solos. Storage no entiende de claves
 *      foráneas: borrar la empresa se lleva las filas de `adjuntos`, pero las
 *      fotos quedarían ocupando lugar —y costando plata— para siempre. Lo
 *      mismo los videos propios del trainer (113, bucket `videos`).
 *
 * El orden es a propósito: primero se averigua qué archivos hay, después se
 * borran los datos, y al final los archivos. Si se hiciera al revés, un fallo
 * a mitad de camino dejaría filas apuntando a fotos que ya no existen.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: (await textos()).servidor.necesitasSesion }, { status: 401 });
  }

  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: (await textos()).servidor.pedidoIlegible }, { status: 400 });
  }

  // La confirmación se comprueba también acá y no solo en la pantalla: esta
  // ruta se puede llamar desde cualquier lado.
  if (String(cuerpo?.confirmacion ?? '').trim().toUpperCase() !== PALABRA) {
    return NextResponse.json(
      { error: (await textos()).servidor.borrarPide(PALABRA) },
      { status: 400 },
    );
  }

  const servicio = clienteDeServicio();

  try {
    // 1. Qué archivos van a quedar sin dueño: comprobantes y videos (113).
    const { data: rutas, error: errorRutas } = await servicio.rpc('archivos_a_borrar', {
      p_user: user.id,
    });
    if (errorRutas) throw new Error(errorRutas.message);
    // Los videos NO frenan el borrado: si la 113 todavía no está aplicada
    // (la función no existe) no hay videos, y si la consulta falla por otra
    // cosa, los archivos que queden sin fila los barre el reloj diario
    // (videos_para_limpiar: objetos del bucket sin fila, a las 3 h). Nadie
    // se queda sin poder borrar su cuenta por un video.
    const { data: rutasVideos, error: errorVideos } = await servicio.rpc('videos_a_borrar', {
      p_user: user.id,
    });
    if (errorVideos) console.error('[borrar-cuenta] videos_a_borrar', errorVideos.code ?? '', errorVideos.message);

    // 1b. La tarjeta guardada en Bancard (02/10). A mejor esfuerzo: se le pide
    //     a Bancard que la borre y el débito se apaga; si Bancard no contesta,
    //     la cuenta se borra igual (al borrarse, ya no hay a quién cobrarle:
    //     la base de Bancard la pierde con la empresa).
    await quitarTarjetasDe(user.id).catch(() => undefined);

    // 2. Los datos. Si la persona es propietaria de un negocio con más gente
    //    adentro, esto falla y no se toca nada.
    const { data: resultado, error: errorDatos } = await servicio.rpc('borrar_datos_de_usuario', {
      p_user: user.id,
    });

    if (errorDatos) {
      const esBloqueo = /gente trabajando/i.test(errorDatos.message);
      return NextResponse.json(
        { error: errorDatos.message, motivo: esBloqueo ? 'equipo_activo' : 'error' },
        { status: esBloqueo ? 409 : 500 },
      );
    }

    // 3. Los archivos. Va después a propósito: si esto falla, quedan fotos
    //    sueltas que nadie puede ver (no hay filas que las nombren) y se
    //    limpian a mano. Al revés perderíamos las rutas para siempre.
    const lista = Array.isArray(rutas) ? (rutas as string[]) : [];
    if (lista.length > 0) {
      // De a 100: Storage no acepta borrados enormes de una sola vez.
      for (let i = 0; i < lista.length; i += 100) {
        const { error } = await servicio.storage.from('comprobantes').remove(lista.slice(i, i + 100));
        if (error) console.error('[borrar-cuenta] archivos', error.message);
      }
    }
    const videos = Array.isArray(rutasVideos) ? (rutasVideos as string[]) : [];
    for (let i = 0; i < videos.length; i += 100) {
      const { error } = await servicio.storage.from('videos').remove(videos.slice(i, i + 100));
      if (error) console.error('[borrar-cuenta] videos', error.message);
    }

    // 4. La cuenta. Último paso: mientras exista, la persona podría volver a
    //    entrar y ver una app a medio borrar.
    const { error: errorAuth } = await servicio.auth.admin.deleteUser(user.id);
    if (errorAuth) throw new Error(errorAuth.message);

    // La sesión de este navegador ya no vale para nada, pero se cierra
    // igual para que la cookie no quede dando vueltas.
    await supabase.auth.signOut().catch(() => null);

    return NextResponse.json({
      borrado: true,
      empresas: resultado?.empresas_borradas ?? 0,
      archivos: lista.length + videos.length,
    });
  } catch (e: any) {
    console.error('[borrar-cuenta]', e?.message ?? e);
    return NextResponse.json(
      { error: (await textos()).servidor.borradoIncompleto },
      { status: 500 },
    );
  }
}

/** Quita en Bancard la tarjeta guardada de cada cuenta que esta persona tiene como propietaria. */
async function quitarTarjetasDe(userId: string): Promise<void> {
  const d = dependencias();
  if (!d) return;
  const { data } = await clienteDeServicio()
    .from('miembros')
    .select('empresa_id')
    .eq('user_id', userId)
    .eq('rol', 'propietario');
  for (const m of (data ?? []) as { empresa_id: string }[]) {
    try {
      await quitarTarjeta(d, { empresa: m.empresa_id, usuario: userId });
    } catch {
      // Sin tarjeta, o Bancard no contestó: no frena el borrado.
    }
  }
}
