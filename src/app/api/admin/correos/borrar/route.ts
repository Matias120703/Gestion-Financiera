import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { borrarCorreo } from '@/lib/borrar-correo-servidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * BORRAR UN CORREO QUE QUEDÓ SIN CUENTA (/admin, 129, 07/10/2026).
 *
 * Matías: «quise ingresar con un correo y me dice que ya existe. Y la verdad
 * que no existe, porque no está en mi panel.» Es un usuario sin ningún
 * negocio: el de una cuenta que se borró antes de este cambio, alguien a
 * quien sacaron de un equipo, un registro que no terminó. El panel ahora los
 * muestra («Correos sin cuenta») y esta ruta los borra, de a uno.
 *
 * QUIÉN PUEDE: solo la administración de Orden (sesión, antes de leer el
 * pedido y antes de la clave de servicio; la base lo repite con `p_actor`).
 *
 * LA CONFIRMACIÓN es el correo entero escrito a mano. La compara la base
 * contra el correo de ESE usuario, pegado al borrado, junto con que siga sin
 * ningún negocio: si en el medio entró a uno, no se borra.
 *
 * Un correo suelto no tiene archivos ni tarjeta (los dos son del negocio):
 * acá no hay depósito ni Bancard. Si falla, sigue en la lista y se reintenta.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: esSuper } = await supabase.rpc('es_superadmin');
  if (esSuper !== true) return NextResponse.json({ ok: false }, { status: 403 });

  let cuerpo: Record<string, unknown> = {};
  try {
    const leido = await request.json();
    cuerpo = leido && typeof leido === 'object' ? leido : {};
  } catch {
    return NextResponse.json({ ok: false, error: 'Pedido ilegible.' }, { status: 400 });
  }
  const usuario = typeof cuerpo.usuario === 'string' ? cuerpo.usuario : '';
  const confirmacion = typeof cuerpo.confirmacion === 'string' ? cuerpo.confirmacion.trim().slice(0, 320) : '';
  if (!/^[0-9a-f-]{36}$/i.test(usuario)) {
    return NextResponse.json({ ok: false, error: 'Ese correo no existe.' }, { status: 400 });
  }
  if (!confirmacion) {
    return NextResponse.json({ ok: false, error: 'Para borrar hay que escribir el correo exacto.' }, { status: 400 });
  }

  let servicio: ReturnType<typeof clienteDeServicio>;
  try {
    servicio = clienteDeServicio();
  } catch {
    return NextResponse.json({ ok: false, error: 'Falta configurar el servidor.' }, { status: 500 });
  }

  const r = await borrarCorreo(servicio, { actor: user.id, usuario, confirmacion, origen: 'suelto' });

  if (r.estado === 'borrado') return NextResponse.json({ ok: true, estado: 'borrado', correo: r.correo });
  // Apretar dos veces no es un error: ya no está, que es lo que se quería.
  if (r.estado === 'ya_no_estaba') return NextResponse.json({ ok: true, estado: 'ya_no_estaba', correo: '' });
  if (r.estado === 'se_queda') {
    if (r.motivo === 'confirmacion') {
      return NextResponse.json({ ok: false, motivo: r.motivo, error: 'Para borrar hay que escribir el correo exacto.' }, { status: 400 });
    }
    const error = r.motivo === 'otro_negocio'
      ? 'Ya no está suelto: entró a un negocio. No se borró.'
      : r.motivo === 'socio'
        ? 'Recomienda Orden: no se borra desde acá.'
        : 'Ese correo administra Orden: no se borra.';
    return NextResponse.json({ ok: false, motivo: r.motivo, error }, { status: 409 });
  }
  return NextResponse.json({ ok: false, error: 'No se pudo borrar ese correo. Probá de nuevo.' }, { status: 500 });
}
