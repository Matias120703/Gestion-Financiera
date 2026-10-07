import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clienteServidor } from '@/lib/supabase/servidor';
import { accesoBancard, baseDeServicio, empresaDelPedido, httpDeErrorDeBase } from '@/lib/bancard-servidor';
import { programarBajaDePersonas } from '@/lib/bancard-flujo';
import { mensajeDeError } from '@/lib/errores';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import { textos } from '@/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * «BAJAR DESDE LA PRÓXIMA RENOVACIÓN» Y SU «DESHACER» (revisión 07/10/2026).
 *
 * Hasta acá la pantalla llamaba `bancard_bajar_personas` con la sesión, y la
 * base solo miraba que la persona administrara la cuenta: con Bancard
 * apagado, una llamada directa le bajaba el tope del equipo en el acto a un
 * Premium pago por más personas. Ahora esa función es solo del servidor,
 * como todas las que escriben, y se entra por acá, con el mismo molde que el
 * resto de `/api/pagos/bancard/*`:
 *
 *   1. sesión (401);
 *   2. la cuenta del pedido y `accesoBancard` con el cliente DEL USUARIO;
 *   3. recién ahí el cliente de servicio, que solo llama la función con
 *      `p_usuario` (la base vuelve a comprobar que administra la cuenta).
 *
 * Del navegador llega `{ empresa, personas }`: un número programa la baja,
 * `null` la deshace. Nunca un importe: no se cobra nada.
 *
 * PROGRAMAR una baja exige que la cuenta vea Bancard (403 si no). DESHACERLA
 * se permite siempre a quien administra la cuenta: si después de programarla
 * se le deshabilita Bancard (o se apaga para todos), tiene que poder sacarse
 * de encima un tope que ya no puede cambiar de otra forma. Por eso esta ruta
 * no pasa por `dependencias()`, que no existe sin Bancard configurado: no le
 * habla a Bancard, solo a la base.
 */
export async function POST(request: Request) {
  const t = await textos();
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.servidor.necesitasSesion }, { status: 401 });

  let cuerpo: Record<string, unknown>;
  try {
    const leido = await request.json();
    cuerpo = leido && typeof leido === 'object' && !Array.isArray(leido) ? leido : {};
  } catch {
    return NextResponse.json({ error: t.servidor.pedidoIlegible }, { status: 400 });
  }

  // Tiene que venir escrito: un cuerpo sin `personas` no deshace nada por descuido.
  const personas = cuerpo.personas;
  const valida = personas === null
    || (typeof personas === 'number' && Number.isInteger(personas) && personas >= 1 && personas <= 200);
  if (!('personas' in cuerpo) || !valida) {
    return NextResponse.json({ error: t.bancard.servidor.pedidoInvalido }, { status: 400 });
  }

  const empresa = await empresaDelPedido(supabase, user.id, cuerpo.empresa, (await cookies()).get(COOKIE_EMPRESA)?.value);
  if (!empresa) return NextResponse.json({ error: t.bancard.servidor.sinEmpresa }, { status: 400 });

  // La regla (programar exige ver Bancard; deshacer no) vive en un solo
  // lugar, `programarBajaDePersonas`, que es el que se prueba.
  const acceso = await accesoBancard(supabase, empresa);
  const r = await programarBajaDePersonas(baseDeServicio(), {
    empresa, usuario: user.id, personas: personas as number | null, veBancard: acceso.disponible,
  });
  switch (r.estado) {
    case 'listo':
      return NextResponse.json({ ok: true, proxima: r.proxima }, { headers: { 'Cache-Control': 'no-store' } });
    case 'no_disponible':
      return NextResponse.json({ error: t.bancard.noDisponible }, { status: 403 });
    default:
      return NextResponse.json(
        { error: mensajeDeError({ message: r.mensaje, code: r.codigo }, t.bancard.equipo.noSePudo) },
        { status: httpDeErrorDeBase(r.codigo) },
      );
  }
}
