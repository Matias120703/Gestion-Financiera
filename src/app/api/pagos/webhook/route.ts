import { NextResponse } from 'next/server';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { desdeMenorUnidad, pasarelaActiva, verificarFirmaStripe } from '@/lib/pagos';

export const runtime = 'nodejs';
// El cuerpo se lee crudo: la firma se calcula sobre los bytes exactos que
// mandó la pasarela. Si Next lo parseara y lo volviera a serializar, un
// espacio de diferencia rompería la verificación.
export const dynamic = 'force-dynamic';

/**
 * EL ÚNICO LUGAR QUE ACTIVA UN PLAN.
 *
 * Volver de la pasarela a /plan?pago=listo no prueba nada: esa URL se puede
 * escribir a mano. Lo que prueba que la plata entró es este webhook, y solo
 * después de verificar la firma.
 *
 * Usa la clave de servicio, que saltea RLS. Por eso lo primero que hace es
 * validar la firma y lo segundo es no confiar en ningún campo que no venga
 * del proveedor.
 */
export async function POST(request: Request) {
  const pasarela = pasarelaActiva();
  if (pasarela === 'ninguna') {
    return NextResponse.json({ error: 'Sin pasarela activa.' }, { status: 501 });
  }

  const crudo = await request.text();

  if (pasarela === 'stripe') {
    const secreto = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secreto) {
      console.error('[webhook] falta STRIPE_WEBHOOK_SECRET');
      return NextResponse.json({ error: 'Sin configurar.' }, { status: 500 });
    }

    if (!verificarFirmaStripe(crudo, request.headers.get('stripe-signature'), secreto)) {
      // 400 y no 401: para Stripe significa "no lo reintentes", que es lo
      // correcto si la firma no valida.
      return NextResponse.json({ error: 'Firma inválida.' }, { status: 400 });
    }

    let evento: any;
    try {
      evento = JSON.parse(crudo);
    } catch {
      return NextResponse.json({ error: 'Cuerpo ilegible.' }, { status: 400 });
    }

    try {
      await aplicarEventoStripe(evento);
    } catch (e: any) {
      console.error('[webhook:stripe]', evento?.type, e?.message ?? e);
      // 500 para que Stripe reintente: puede haber sido una caída pasajera
      // de la base, y perder un pago cobrado es lo peor que puede pasar acá.
      return NextResponse.json({ error: 'No se pudo aplicar.' }, { status: 500 });
    }

    return NextResponse.json({ recibido: true });
  }

  // Pagopar: la verificación de su token va acá cuando estén las claves.
  // Hasta entonces no se acepta nada, para que no exista una puerta abierta
  // esperando a que alguien la encuentre.
  return NextResponse.json({ error: 'Pasarela sin implementar.' }, { status: 501 });
}

/**
 * Traduce un evento de Stripe a una llamada a `aplicar_suscripcion()`.
 *
 * Se escuchan solo los eventos que cambian el estado de verdad. Los demás se
 * ignoran en silencio y se responde 200: si devolviéramos error, Stripe los
 * reintentaría para siempre.
 */
async function aplicarEventoStripe(evento: any) {
  const tipo: string = evento?.type ?? '';
  const objeto = evento?.data?.object ?? {};

  const interesan = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_failed',
  ];
  if (!interesan.includes(tipo)) return;

  const empresaId: string | undefined =
    objeto?.metadata?.empresa_id
    ?? objeto?.subscription_details?.metadata?.empresa_id
    ?? objeto?.client_reference_id;

  if (!empresaId) {
    console.error('[webhook:stripe] evento sin empresa_id', tipo);
    return;
  }

  const supabase = clienteDeServicio();

  // Baja o impago: cae a gratis. Los datos quedan intactos; lo único que se
  // pierde es lo que el plan pagado habilitaba.
  if (tipo === 'customer.subscription.deleted') {
    await llamar(supabase, {
      empresa: empresaId, plan: 'gratis', estado: 'cancelada',
      inicio: null, fin: fechaDe(objeto?.current_period_end),
      customer: objeto?.customer, suscripcion: objeto?.id,
    });
    return;
  }

  if (tipo === 'invoice.payment_failed') {
    // `morosa` y no `vencida`: Stripe va a reintentar el cobro. Marcarla
    // vencida ahora le sacaría el plan a alguien cuya tarjeta rebotó una vez
    // y va a pagar en dos días.
    await llamar(supabase, {
      empresa: empresaId, plan: objeto?.metadata?.plan ?? 'pro', estado: 'morosa',
      inicio: null, fin: fechaDe(objeto?.lines?.data?.[0]?.period?.end),
      customer: objeto?.customer, suscripcion: objeto?.subscription,
    });
    return;
  }

  const plan = objeto?.metadata?.plan === 'negocio' ? 'negocio' : 'pro';
  const cancelaAlVencer = Boolean(objeto?.cancel_at_period_end);
  const estadoStripe: string = objeto?.status ?? 'active';

  const estado =
    cancelaAlVencer ? 'cancelada'
    : estadoStripe === 'trialing' ? 'prueba'
    : estadoStripe === 'past_due' || estadoStripe === 'unpaid' ? 'morosa'
    : estadoStripe === 'canceled' ? 'cancelada'
    : 'activa';

  const item = objeto?.items?.data?.[0];
  const moneda = (item?.price?.currency ?? objeto?.currency ?? '').toUpperCase() || null;
  const bruto = item?.price?.unit_amount;

  await llamar(supabase, {
    empresa: empresaId,
    plan,
    estado,
    inicio: fechaDe(objeto?.current_period_start),
    fin: fechaDe(objeto?.current_period_end),
    customer: objeto?.customer,
    suscripcion: objeto?.id ?? objeto?.subscription,
    periodo: item?.price?.recurring?.interval === 'year' ? 'anual' : 'mensual',
    moneda,
    importe: typeof bruto === 'number' && moneda ? desdeMenorUnidad(bruto, moneda) : null,
  });
}

function fechaDe(segundos: unknown): string | null {
  return typeof segundos === 'number' ? new Date(segundos * 1000).toISOString() : null;
}

async function llamar(
  supabase: ReturnType<typeof clienteDeServicio>,
  d: {
    empresa: string; plan: string; estado: string;
    inicio: string | null; fin: string | null;
    customer?: string; suscripcion?: string;
    periodo?: string; moneda?: string | null; importe?: number | null;
  },
) {
  const { error } = await supabase.rpc('aplicar_suscripcion', {
    p_empresa: d.empresa,
    p_plan: d.plan,
    p_estado: d.estado,
    p_periodo_inicio: d.inicio,
    p_periodo_fin: d.fin,
    p_proveedor: 'stripe',
    p_customer_id: d.customer ?? null,
    p_subscription_id: d.suscripcion ?? null,
    p_periodo: d.periodo ?? 'mensual',
    p_moneda: d.moneda ?? null,
    p_importe: d.importe ?? null,
  });

  if (error) throw new Error(error.message);
}
