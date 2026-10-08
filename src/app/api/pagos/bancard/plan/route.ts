import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clienteServidor } from '@/lib/supabase/servidor';
import { accesoBancard, baseDeServicio, dependencias, empresaDelPedido, httpDeErrorDeBase } from '@/lib/bancard-servidor';
import { programarCambioDePlan } from '@/lib/bancard-flujo';
import { mensajeDeError } from '@/lib/errores';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import { textos } from '@/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * «BAJAR AL BÁSICO DESDE LA RENOVACIÓN» Y SU «DESHACER» (07/10/2026).
 *
 * Bajar de plan no se paga: se programa para la próxima renovación, y hasta
 * ese día la cuenta sigue con el plan que ya pagó (no se devuelve nada). La
 * regla, el control del equipo y el renglón del registro viven en la base
 * (`bancard_programar_plan`, migración 130), que es solo del servidor. Se
 * entra por acá, con el molde de `/api/pagos/bancard/personas`:
 *
 *   1. sesión (401);
 *   2. la cuenta del pedido y `accesoBancard` con el cliente DEL USUARIO;
 *   3. recién ahí el cliente de servicio, que solo llama la función con
 *      `p_usuario` (la base vuelve a comprobar que administra la cuenta).
 *
 * Del navegador llega `{ empresa, plan }`: 'basico' o 'pro' programa la
 * baja, `null` la deshace. Nunca un importe ni una fecha: no se cobra nada,
 * y cuánto va a ser la renovación lo contesta la base.
 *
 * PROGRAMAR exige que la cuenta vea Bancard (403 si no). DESHACER se permite
 * siempre a quien administra la cuenta: por eso la base se arma con
 * `baseDeServicio()`, que anda con Bancard apagado.
 *
 * Bancard se usa para UNA sola cosa, y solo si está: soltar un formulario
 * de pago que la persona abrió y dejó, que si no la tiene media hora con
 * «Hay un pago en curso» (ver `programarCambioDePlan`). Qué operación es, se
 * lee con la sesión de quien lo pide (`bancard_estado`).
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

  // Tiene que venir escrito: un cuerpo sin `plan` no deshace nada por descuido.
  // El Premium nunca es el destino de una baja.
  const plan = cuerpo.plan;
  if (!('plan' in cuerpo) || !(plan === null || plan === 'basico' || plan === 'pro')) {
    return NextResponse.json({ error: t.bancard.servidor.pedidoInvalido }, { status: 400 });
  }

  const empresa = await empresaDelPedido(supabase, user.id, cuerpo.empresa, (await cookies()).get(COOKIE_EMPRESA)?.value);
  if (!empresa) return NextResponse.json({ error: t.bancard.servidor.sinEmpresa }, { status: 400 });

  // La regla (programar exige ver Bancard; deshacer no) vive en un solo
  // lugar, `programarCambioDePlan`, que es el que se prueba.
  const acceso = await accesoBancard(supabase, empresa);
  const bd = baseDeServicio();
  const d = acceso.disponible ? dependencias() : null;
  const r = await programarCambioDePlan(
    bd,
    { empresa, usuario: user.id, plan, veBancard: acceso.disponible },
    d ? {
      d,
      viva: async () => {
        const { data } = await supabase.rpc('bancard_estado', { p_empresa: empresa, p_entorno: d.entorno });
        const n = Number((data as { viva?: { operacion?: unknown } | null } | null)?.viva?.operacion);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
      },
    } : null,
  );
  switch (r.estado) {
    case 'listo':
      return NextResponse.json(
        { ok: true, planProximo: r.planProximo, plan: r.plan, vence: r.vence, importe: r.importe },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    case 'no_disponible':
      return NextResponse.json({ error: t.bancard.noDisponible }, { status: 403 });
    default:
      return NextResponse.json(
        { error: mensajeDeError({ message: r.mensaje, code: r.codigo }, t.bancard.cambio.noSePudo) },
        { status: httpDeErrorDeBase(r.codigo) },
      );
  }
}
