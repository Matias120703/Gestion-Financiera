import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteDeServicio } from '@/lib/supabase/servicio';

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
 *      fotos quedarían ocupando lugar —y costando plata— para siempre.
 *
 * El orden es a propósito: primero se averigua qué archivos hay, después se
 * borran los datos, y al final los archivos. Si se hiciera al revés, un fallo
 * a mitad de camino dejaría filas apuntando a fotos que ya no existen.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });
  }

  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Pedido ilegible.' }, { status: 400 });
  }

  // La confirmación se comprueba también acá y no solo en la pantalla: esta
  // ruta se puede llamar desde cualquier lado.
  if (String(cuerpo?.confirmacion ?? '').trim().toUpperCase() !== PALABRA) {
    return NextResponse.json(
      { error: `Para borrar la cuenta hay que escribir ${PALABRA}.` },
      { status: 400 },
    );
  }

  const servicio = clienteDeServicio();

  try {
    // 1. Qué archivos van a quedar sin dueño.
    const { data: rutas, error: errorRutas } = await servicio.rpc('archivos_a_borrar', {
      p_user: user.id,
    });
    if (errorRutas) throw new Error(errorRutas.message);

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
      archivos: lista.length,
    });
  } catch (e: any) {
    console.error('[borrar-cuenta]', e?.message ?? e);
    return NextResponse.json(
      { error: 'No se pudo completar el borrado. Escribinos y lo resolvemos.' },
      { status: 500 },
    );
  }
}
