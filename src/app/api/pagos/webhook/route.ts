import { NextResponse } from 'next/server';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import {
  desdeMenorUnidad, estadoDeStripe, pasarelaActiva, planDeMetadatos, planParaAplicar, verificarFirmaStripe,
  type PlanPago,
} from '@/lib/pagos';

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
    //
    // La factura casi nunca trae `metadata.plan` propio; antes eso caía en
    // 'pro' y un Básico impago pasaba a Pro. Ahora se busca en los metadatos
    // de la suscripción que viajan en la factura y, si no están, se deja el
    // plan que ya tenía (ver `planParaAplicar`).
    const plan = await elegirPlan(supabase, empresaId, tipo, planDeMetadatos(objeto), 'morosa');
    if (!plan) return;
    await llamar(supabase, {
      empresa: empresaId, plan, estado: 'morosa',
      inicio: null, fin: fechaDe(objeto?.lines?.data?.[0]?.period?.end),
      customer: objeto?.customer, suscripcion: objeto?.subscription,
    });
    return;
  }

  // Solo los status que se conocen. 'incomplete', 'incomplete_expired',
  // 'paused' o una sesión sin cobro confirmado no se aplican: con el importe
  // al lado, la base los tomaría como plata que entró y activaría el plan y
  // la comisión del socio sin cobro (ver `estadoDeStripe`). Se responde 200:
  // reintentar el mismo evento no cambia lo que dice.
  const estado = estadoDeStripe(tipo, objeto);
  if (!estado) {
    console.error('[webhook:stripe] estado de Stripe que no activa nada; no se aplicó',
      { tipo, empresaId, status: objeto?.status, payment_status: objeto?.payment_status });
    return;
  }

  /**
   * EL PLAN, DE LOS METADATOS Y SIN ADIVINAR.
   *
   * Antes: `metadata.plan === 'negocio' ? 'negocio' : 'pro'`. Un Básico
   * pagado con tarjeta quedaba Pro, y cualquier metadato raro también.
   * Ahora solo vale 'basico', 'pro' o 'negocio'. Si no viene ninguno:
   * activar se frena (se registra y se responde 200, porque reintentar no
   * cambia los metadatos) y dar de baja sigue con el plan que ya tenía.
   */
  const plan = await elegirPlan(supabase, empresaId, tipo, planDeMetadatos(objeto), estado);
  if (!plan) return;

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
    // En la sesión de checkout `id` es la sesión (cs_…), no la suscripción:
    // la suscripción viene en `subscription`.
    suscripcion: tipo === 'checkout.session.completed'
      ? objeto?.subscription ?? undefined
      : objeto?.id ?? objeto?.subscription,
    periodo: item?.price?.recurring?.interval === 'year' ? 'anual' : 'mensual',
    moneda,
    importe: typeof bruto === 'number' && moneda ? desdeMenorUnidad(bruto, moneda) : null,
  });
}

/**
 * El plan con el que se aplica el evento, o `null` si no hay uno seguro.
 *
 * Solo consulta la suscripción guardada cuando hace falta: metadatos sin
 * plan válido en un evento que quita (morosa, cancelada). Un `null` deja el
 * error en el registro con la empresa y lo que llegó, para cargarlo a mano.
 */
async function elegirPlan(
  supabase: ReturnType<typeof clienteDeServicio>,
  empresaId: string, tipo: string, deMetadatos: PlanPago | null, estado: string,
): Promise<PlanPago | null> {
  let planActual: unknown = null;
  if (!deMetadatos && (estado === 'morosa' || estado === 'cancelada')) {
    const { data, error } = await supabase
      .from('suscripciones').select('plan').eq('empresa_id', empresaId).maybeSingle();
    // Si la base no contesta, que Stripe reintente: no es lo mismo que
    // «no tiene plan».
    if (error) throw new Error(error.message);
    planActual = data?.plan ?? null;
  }
  const plan = planParaAplicar(deMetadatos, estado, planActual);
  if (!plan) {
    console.error('[webhook:stripe] evento sin plan válido en los metadatos; no se aplicó',
      { tipo, empresaId, estado, planActual });
  }
  return plan;
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
