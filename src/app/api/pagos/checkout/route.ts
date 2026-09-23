import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { checkoutPagopar, checkoutStripe, esPlanPago, pasarelaActiva, type PedidoDeCobro } from '@/lib/pagos';
import type { DatosEmpresa, Precio } from '@/lib/tipos';
import { fichaDe } from '@/lib/rubros';
import { textos } from '@/i18n';
import { MONEDA_DE_LA_SUSCRIPCION } from '@/lib/precios';

export const runtime = 'nodejs';

/**
 * Arranca el pago y devuelve a dónde mandar a la persona.
 *
 * EL PRECIO NO LLEGA DEL NAVEGADOR. Del cliente vienen plan y periodo
 * —dos opciones cerradas; la moneda es siempre guaraníes— y el importe se busca en la tabla
 * `precios`. Si el monto viajara en el pedido, cualquiera con la consola
 * abierta pagaría un guaraní por el plan Negocio.
 *
 * Esta ruta NO activa nada. Activar el plan es tarea del webhook, que es el
 * único que sabe si la plata entró de verdad.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  const s = (await textos()).servidor;
  if (!user) return NextResponse.json({ error: s.necesitasSesion }, { status: 401 });

  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: s.pedidoIlegible }, { status: 400 });
  }

  const plan = cuerpo?.plan;
  const periodo = cuerpo?.periodo === 'anual' ? 'anual' : 'mensual';
  /**
   * LA MONEDA NO SE LEE DEL PEDIDO (23/09): siempre guaraníes.
   *
   * Bancard deja cobrar en una sola moneda y Matías eligió guaraníes. Antes
   * esta línea tomaba `cuerpo.moneda` y, si faltaba, dólares: un pedido
   * armado a mano con `moneda: 'USD'` (o sin moneda) cobraba en dólares, y
   * el webhook dejaba `suscripciones.moneda = 'USD'` para siempre
   * —`cambiar_plan_cuenta` no la vuelve a tocar—. Un cobro posterior de
   * 90.200 Gs por transferencia calculaba entonces la comisión del socio
   * sobre la lista en dólares: base 19 y 9,50 «guaraníes» (105). Lo que
   * mande el navegador en `moneda` se ignora; el botón ya manda PYG.
   */
  const moneda = MONEDA_DE_LA_SUSCRIPCION;

  // Los tres planes pagos. El Básico también se paga con tarjeta; si el
  // rubro no lo ofrece, lo frena la regla de abajo, no esta.
  if (!esPlanPago(plan)) {
    return NextResponse.json({ error: s.planDesconocido }, { status: 400 });
  }

  // Qué empresa. Tiene que ser una en la que la persona administre: un
  // vendedor no contrata el plan del negocio de otro.
  const empresaId = String(cuerpo?.empresa_id ?? '') || await empresaPreferida(supabase, user.id);
  if (!empresaId) {
    return NextResponse.json({ error: s.noEncontramosNegocio }, { status: 400 });
  }

  const { data: esAdmin, error: errorAdmin } = await supabase.rpc('es_admin', { p_empresa: empresaId });
  if (errorAdmin || !esAdmin) {
    return NextResponse.json(
      { error: s.soloAdminContrata },
      { status: 403 },
    );
  }

  /**
   * SOLO LOS PLANES DE SU RUBRO (102).
   *
   * La pantalla ya muestra solo esos, pero el pedido se puede armar a mano:
   * un profe no contrata Premium porque escribió `negocio` en la consola.
   * La única excepción es el plan que YA está pagando —igual que en la
   * pantalla, nunca se le quita nada a nadie—, así puede renovarlo aunque
   * su rubro hoy no lo ofrezca. Estar en prueba no cuenta como pagarlo.
   */
  const [{ data: empresa }, { data: datos }] = await Promise.all([
    supabase.from('empresas').select('rubro, tipo_cuenta').eq('id', empresaId).maybeSingle(),
    supabase.rpc('datos_empresa', { p_empresa: empresaId }),
  ]);
  if (!empresa) {
    return NextResponse.json({ error: s.noEncontramosNegocio }, { status: 400 });
  }
  const info = datos as DatosEmpresa | null;
  const yaLoPaga = info?.suscripcion?.en_prueba === false && info.plan_efectivo === plan;
  if (!fichaDe(empresa.rubro, empresa.tipo_cuenta).planes.includes(plan) && !yaLoPaga) {
    return NextResponse.json({ error: s.planNoEsDeTuRubro }, { status: 400 });
  }

  /**
   * El precio, de la base, Y DE SU TIPO DE CUENTA.
   *
   * `precios` tiene dos listas: la personal (un solo plan, el Pro de 60.000)
   * y la de emprendedor (Básico 110.000, Pro 190.000, Premium 250.000).
   * Antes se pedía solo por moneda y se tomaba la primera fila con ese plan;
   * como la lista viene ordenada por tipo, «emprendedor» salía antes que
   * «personal» y una cuenta personal que pagaba su Pro con tarjeta pagaba
   * el de 190.000. La pantalla de planes ya filtraba por tipo; el checkout
   * ahora cobra lo mismo que la pantalla muestra.
   */
  const { data: precios, error: errorPrecios } = await supabase.rpc('lista_precios', {
    p_moneda: moneda, p_tipo: empresa.tipo_cuenta,
  });
  if (errorPrecios) {
    return NextResponse.json({ error: s.noSeLeyeronPrecios }, { status: 503 });
  }

  // El filtro por tipo se repite acá: si la base devolviera de más, se
  // prefiere no encontrar precio (400) a cobrar el de la otra lista.
  const precio = (Array.isArray(precios) ? precios : [] as Precio[])
    .find((p: Precio) => p.plan === plan && p.periodo === periodo
      && p.tipo_cuenta === empresa.tipo_cuenta);

  if (!precio) {
    return NextResponse.json(
      { error: s.planSinMoneda(moneda) },
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
      return NextResponse.json({ error: s.pagoSinTerminar }, { status: 501 });
    }
    console.error('[checkout]', e?.message ?? e);
    return NextResponse.json({ error: s.noSeAbrioPago }, { status: 502 });
  }

  // Sin pasarela configurada. No es un error del sistema: es que todavía no
  // se decidió con qué se cobra. La pantalla lo muestra tal cual.
  return NextResponse.json({ error: s.sinFormaDePago }, { status: 501 });
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
