import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { dependencias } from '@/lib/bancard-servidor';
import { quitarTarjeta } from '@/lib/bancard-flujo';
import { borrarCorreo } from '@/lib/borrar-correo-servidor';
import { mensajeDeError } from '@/lib/errores';
import type { CuentaBorrada, EstadoTarjetaBorrada } from '@/lib/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Bancard puede esperar hasta unos 32 s; después vienen el depósito y un
// pedido a Auth por persona.
export const maxDuration = 60;

/**
 * BORRAR UNA CUENTA DESDE /admin, ENTERA (129, 07/10/2026).
 *
 * Matías: «si yo elimino la cuenta, me tiene que eliminar todo. Si yo vuelvo
 * a ingresar el mismo correo, tiene que crearse la nueva cuenta.»
 *
 * Antes el panel llamaba a `borrar_cuenta` desde el navegador: se iba el
 * negocio y quedaban el correo de cada persona, los comprobantes en el
 * depósito y la tarjeta guardada en Bancard. Ninguna de esas tres cosas se
 * puede hacer desde el navegador (clave de servicio), así que pasa por acá.
 *
 * QUIÉN PUEDE: solo la administración de Orden. Se comprueba con la sesión
 * ANTES de leer el pedido y antes de tocar la clave de servicio, y la base
 * lo vuelve a exigir con `p_actor` en cada función.
 *
 * QUÉ MANDA EL NAVEGADOR: la cuenta y el nombre escrito a mano. Nada más: a
 * quién se le borra el correo lo decide la base, nunca una lista que venga
 * de la pantalla.
 *
 * EL ORDEN, y por qué:
 *
 *   A. ENSAYO. La base valida todo sin borrar nada. Un nombre mal escrito
 *      no puede quitarle la tarjeta a nadie.
 *   B. TARJETA, a mejor esfuerzo. Antes de borrar: después ya no hay con
 *      qué pedírselo a Bancard.
 *   C. LA CUENTA, en una transacción. Devuelve los archivos y las personas.
 *      Hasta acá, si algo falla, la cuenta sigue entera.
 *   D. ARCHIVOS. Después de C: al revés, un fallo dejaría el negocio vivo
 *      con comprobantes rotos.
 *   E. CORREOS, de a uno, cada uno vuelto a comprobar en el momento.
 *      Último: es lo único que se puede reintentar desde el panel (lo que no
 *      se pudo borrar aparece en «Correos sin cuenta»).
 *
 * Después de C la respuesta es SIEMPRE `ok: true`: la cuenta ya se borró y
 * eso es lo que hay que decir. Lo que quedó pendiente viaja en el detalle.
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
  const empresa = typeof cuerpo.empresa === 'string' ? cuerpo.empresa : '';
  const confirmacion = typeof cuerpo.confirmacion === 'string' ? cuerpo.confirmacion.slice(0, 200) : '';
  if (!/^[0-9a-f-]{36}$/i.test(empresa)) {
    return NextResponse.json({ ok: false, error: 'Esa cuenta no existe.' }, { status: 400 });
  }

  let servicio: ReturnType<typeof clienteDeServicio>;
  try {
    servicio = clienteDeServicio();
  } catch {
    return NextResponse.json({ ok: false, error: 'Falta configurar el servidor.' }, { status: 500 });
  }

  // A. El ensayo: valida al actor, la cuenta y el nombre. No borra ni anota.
  const ensayo = await servicio.rpc('borrar_cuenta_entera', {
    p_actor: user.id, p_empresa: empresa, p_confirmacion: confirmacion, p_solo_comprobar: true,
  });
  if (ensayo.error) return noSePudo(ensayo.error, 'No se pudo borrar la cuenta. No se tocó nada.');
  const teniaTarjeta = (ensayo.data as { tarjeta?: unknown } | null)?.tarjeta === true;

  // B. La tarjeta guardada en Bancard. No frena: si Bancard no contesta, la
  //    cuenta se borra igual y se avisa.
  let tarjeta: EstadoTarjetaBorrada = 'sin_tarjeta';
  try {
    const d = dependencias();
    if (!d) {
      tarjeta = teniaTarjeta ? 'sin_configurar' : 'sin_tarjeta';
    } else {
      const r = await quitarTarjeta(d, { empresa, usuario: user.id });
      if (r.ok) tarjeta = r.pendienteEnBancard ? 'pendiente' : 'quitada';
      // Había una y no se la pudo pedir: falló la base, o es del otro
      // ambiente de Bancard (staging o producción) y desde acá no se alcanza.
      else tarjeta = teniaTarjeta ? 'fallo' : 'sin_tarjeta';
    }
  } catch {
    tarjeta = teniaTarjeta ? 'fallo' : 'sin_tarjeta';
  }

  // C. El borrado de verdad: una transacción. Si falla, se deshace entera.
  const borrado = await servicio.rpc('borrar_cuenta_entera', {
    p_actor: user.id, p_empresa: empresa, p_confirmacion: confirmacion, p_solo_comprobar: false,
  });
  const hecho = borrado.data as {
    borrada?: unknown; nombre?: unknown; movimientos?: unknown;
    personas?: unknown; archivos?: unknown; videos?: unknown;
  } | null;
  if (borrado.error || hecho?.borrada !== true) {
    const sinTarjeta = tarjeta === 'quitada' || tarjeta === 'pendiente';
    return noSePudo(
      borrado.error,
      sinTarjeta
        ? 'No se pudo borrar la cuenta. La tarjeta guardada ya se quitó; lo demás quedó como estaba. Probá de nuevo.'
        : 'No se pudo borrar la cuenta. No se tocó nada.',
      sinTarjeta ? ' La tarjeta guardada ya se quitó.' : '',
    );
  }

  const nombre = typeof hecho.nombre === 'string' ? hecho.nombre : '';
  const archivos = soloTextos(hecho.archivos);
  const videos = soloTextos(hecho.videos);
  const personas = soloPersonas(hecho.personas);

  // D. Los archivos, con las rutas que devolvió la base. Los dos depósitos a
  //    la vez. Lo que no se pueda borrar se cuenta y se avisa: los videos sin
  //    fila los barre el reloj de la madrugada; los comprobantes quedan bajo
  //    la carpeta de la cuenta (su id está en la constancia).
  let sinBorrar = 0;
  try {
    const [fotos, peliculas] = await Promise.all([
      deA100(archivos, (lote) => servicio.storage.from('comprobantes').remove(lote)),
      deA100(videos, (lote) => servicio.storage.from('videos').remove(lote)),
    ]);
    sinBorrar = fotos + peliculas;
  } catch {
    sinBorrar = archivos.length + videos.length;
  }

  // E. Los correos, en el orden que dio la base (primero el dueño). El que
  //    ya venía con motivo se queda; a los demás se los vuelve a comprobar
  //    uno por uno, justo antes de borrarlos. Uno que falla no frena al resto.
  const correos: CuentaBorrada['correos'] = [];
  for (const persona of personas) {
    if (persona.motivo) {
      correos.push({ correo: persona.correo, estado: 'se_queda', motivo: persona.motivo });
      continue;
    }
    try {
      const r = await borrarCorreo(servicio, {
        actor: user.id, usuario: persona.usuario, origen: 'cuenta', cuenta: nombre, correo: persona.correo,
      });
      correos.push({ correo: persona.correo, estado: r.estado, motivo: r.estado === 'se_queda' ? r.motivo : null });
    } catch {
      correos.push({ correo: persona.correo, estado: 'fallo', motivo: null });
    }
  }

  const respuesta: CuentaBorrada = {
    ok: true,
    nombre,
    movimientos: Number(hecho.movimientos) || 0,
    correos,
    tarjeta,
    archivos: archivos.length + videos.length,
    archivos_sin_borrar: sinBorrar,
  };
  return NextResponse.json(respuesta);
}

/**
 * La base dijo que no (o no contestó). Sus tres mensajes ya vienen escritos
 * para leerse; cualquier otra cosa se cambia por el respaldo, sin volcar el
 * error crudo.
 */
function noSePudo(error: { code?: string; message?: string } | null, respaldo: string, agregado = '') {
  const codigo = error?.code ?? '';
  if (codigo === 'P0002') {
    return NextResponse.json({ ok: false, error: `Esa cuenta no existe.${agregado}` }, { status: 404 });
  }
  if (codigo === '22023') {
    // Trae el nombre exacto que había que escribir.
    return NextResponse.json({ ok: false, error: `${mensajeDeError(error, respaldo)}${agregado}` }, { status: 400 });
  }
  if (codigo === '42501') {
    return NextResponse.json({ ok: false, error: `${mensajeDeError(error, respaldo)}${agregado}` }, { status: 403 });
  }
  console.error('[borrar-cuenta-admin]', codigo || 'sin código');
  return NextResponse.json({ ok: false, error: respaldo }, { status: 500 });
}

/** Borra de a 100 (el depósito no acepta borrados enormes) y cuenta las rutas que no pudo. */
async function deA100(
  rutas: string[],
  quitar: (lote: string[]) => PromiseLike<{ error: { message?: string } | null }>,
): Promise<number> {
  let sinBorrar = 0;
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100);
    try {
      const { error } = await quitar(lote);
      if (error) {
        sinBorrar += lote.length;
        console.error('[borrar-cuenta-admin] archivos', error.message ?? '');
      }
    } catch {
      sinBorrar += lote.length;
    }
  }
  return sinBorrar;
}

function soloTextos(lista: unknown): string[] {
  return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string' && x !== '') : [];
}

/** Las personas como las devolvió la base. Sin id no hay a quién borrar: se saltea. */
function soloPersonas(lista: unknown): { usuario: string; correo: string; motivo: string | null }[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const p = x as { usuario?: unknown; correo?: unknown; motivo?: unknown };
    if (typeof p.usuario !== 'string' || !p.usuario) return [];
    return [{
      usuario: p.usuario,
      correo: typeof p.correo === 'string' ? p.correo : '',
      motivo: typeof p.motivo === 'string' && p.motivo ? p.motivo : null,
    }];
  });
}
