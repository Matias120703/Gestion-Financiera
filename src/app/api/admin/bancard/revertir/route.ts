import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { dependencias } from '@/lib/bancard-servidor';
import { revertirPago } from '@/lib/bancard-flujo';
import { mensajeDeError } from '@/lib/errores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * «REVERTIR» UN PAGO APROBADO (/admin). Solo la administración de Orden (y la
 * base lo vuelve a exigir con `p_actor`).
 *
 * El mismo día del pago: le pide la reversa a Bancard (manual, «Single Buy
 * Rollback»; marca «Recibir rollback») y deshace en Orden lo que el pago
 * activó. Otro día: Bancard ya no revierte («TransactionAlreadyConfirmed»);
 * se anula por el portal de comercios y acá se marca con «Ya lo anulé por el
 * portal» (`sinBancard`). El motivo es obligatorio: queda en el registro.
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
  const operacion = Number(cuerpo.operacion);
  const motivo = typeof cuerpo.motivo === 'string' ? cuerpo.motivo.trim().slice(0, 300) : '';
  const sinBancard = cuerpo.sinBancard === true;
  if (!Number.isSafeInteger(operacion) || operacion <= 0) {
    return NextResponse.json({ ok: false, error: 'Ese pago no existe.' }, { status: 400 });
  }
  if (!motivo) return NextResponse.json({ ok: false, error: 'Escribí el motivo de la reversa.' }, { status: 400 });

  const d = dependencias();
  if (!d) return NextResponse.json({ ok: false, error: 'Bancard no está configurado en este servidor.' }, { status: 503 });

  const r = await revertirPago(d, { operacion, actor: user.id, motivo, sinBancard });
  if (r.ok) return NextResponse.json({ ok: true, bancard: r.bancard, ...r.datos });

  const error = r.motivo === 'cuponada'
    ? 'Bancard ya no deja revertirlo (la operación está cuponada). Pedí la anulación en el portal de comercios (Soporte → Anulaciones) y después marcalo acá con «Ya lo anulé por el portal».'
    : r.motivo === 'otro_entorno'
      ? 'Ese pago es del otro ambiente de Bancard (staging o producción): desde este servidor no se puede revertir.'
      : r.motivo === 'bancard'
        ? `Bancard no hizo la reversa (${r.clave ?? 'sin respuesta'}). No se tocó nada en Orden.`
        : r.motivo === 'despues_de_bancard'
          ? `Bancard ya devolvió el pago, pero Orden no pudo deshacer el plan: ${mensajeDeError(r.mensaje ?? '')} Quedó marcado para revisar.`
          : mensajeDeError(r.mensaje ?? '', 'No se pudo revertir.');
  return NextResponse.json({ ok: false, motivo: r.motivo, error }, { status: r.motivo === 'base' ? 400 : 409 });
}
