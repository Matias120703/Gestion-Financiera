import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { checkoutPagopar, checkoutStripe, pasarelaActiva, type PedidoDeCobro } from '@/lib/pagos';
import type { Precio } from '@/lib/tipos';

export const runtime = 'nodejs';

/**
 * Arranca el pago y devuelve a dónde mandar a la persona.
 *
 * EL PRECIO NO LLEGA DEL NAVEGADOR. Del cliente vienen plan, periodo y
 * moneda —tres opciones cerradas— y el importe se busca en la tabla
 * `precios`. Si el monto viajara en el pedido, cualquiera con la consola
 * abierta pagaría un guaraní por el plan Negocio.
 *
 * Esta ruta NO activa nada. Activar el plan es tarea del webhook, que es el
 * único que sabe si la plata entró de verdad.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });

  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Pedido ilegible.' }, { status: 400 });
  }

  const plan = cuerpo?.plan;
  const periodo = cuerpo?.periodo === 'anual' ? 'anual' : 'mensual';
  const moneda = String(cuerpo?.moneda ?? 'USD').toUpperCase();

  if (plan !== 'pro' && plan !== 'negocio') {
    return NextResponse.json({ error: 'Plan desconocido.' }, { status: 400 });
  }

  // Qué empresa. Tiene que ser una en la que la persona administre: un
  // vendedor no contrata el plan del negocio de otro.
  const empresaId = String(cuerpo?.empresa_id ?? '') || await empresaPreferida(supabase, user.id);
  if (!empresaId) {
    return NextResponse.json({ error: 'No encontramos tu negocio.' }, { status: 400 });
  }

  const { data: esAdmin, error: errorAdmin } = await supabase.rpc('es_admin', { p_empresa: empresaId });
  if (errorAdmin || !esAdmin) {
    return NextResponse.json(
      { error: 'Solo el propietario o un administrador puede contratar el plan.' },
      { status: 403 },
    );
  }

  // El precio, de la base.
  const { data: precios, error: errorPrecios } = await supabase.rpc('lista_precios', { p_moneda: moneda });
  if (errorPrecios) {
    return NextResponse.json({ error: 'No pudimos leer los precios.' }, { status: 503 });
  }

  const precio = (Array.isArray(precios) ? precios : [] as Precio[])
    .find((p: Precio) => p.plan === plan && p.periodo === periodo);

  if (!precio) {
    return NextResponse.json(
      { error: `Todavía no cobramos ese plan en ${moneda}.` },
      { status: 400 },
    );
  }

  const pedido: PedidoDeCobro = {
    empresaId,
    email: user.email ?? '',
    plan,
    periodo,
    moneda,
    importe: Number(precio.importe),
    referenciaExterna: precio.referencia_externa ?? null,
  };

  const pasarela = pasarelaActiva();

  try {
    if (pasarela === 'stripe') {
      return NextResponse.json({ url: await checkoutStripe(pedido) });
    }
    if (pasarela === 'pagopar') {
      return NextResponse.json({ url: await checkoutPagopar(pedido) });
    }
  } catch (e: any) {
    if (e?.message === 'SIN_IMPLEMENTAR') {
      return NextResponse.json({ error: 'Esa forma de pago todavía no está terminada.' }, { status: 501 });
    }
    console.error('[checkout]', e?.message ?? e);
    return NextResponse.json({ error: 'No pudimos abrir el pago. Probá de nuevo.' }, { status: 502 });
  }

  // Sin pasarela configurada. No es un error del sistema: es que todavía no
  // se decidió con qué se cobra. La pantalla lo muestra tal cual.
  return NextResponse.json({ error: 'No hay una forma de pago activa.' }, { status: 501 });
}

async function empresaPreferida(supabase: ReturnType<typeof clienteServidor>, userId: string) {
  const { data } = await supabase
    .from('miembros')
    .select('empresa_id, rol')
    .eq('user_id', userId)
    .in('rol', ['propietario', 'admin'])
    .order('created_at', { ascending: true })
    .limit(1);

  return data?.[0]?.empresa_id ?? '';
}
