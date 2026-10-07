import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clienteServidor } from '@/lib/supabase/servidor';
import {
  accesoBancard, dependencias, empresaDelPedido, httpDeErrorDeBase, leerPedidoDePago,
} from '@/lib/bancard-servidor';
import { iniciarPago } from '@/lib/bancard-flujo';
import { mensajeDeError } from '@/lib/errores';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import { textos } from '@/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * ARRANCA UN PAGO CON EL FORMULARIO DE BANCARD (tarjeta, QR y lo que
 * Bancard ofrezca adentro).
 *
 * Del navegador llega solo QUÉ se paga: `{ tipo, plan, periodo, personas }`.
 * NUNCA un importe: lo calcula la base (`precio_de_la_cuenta`) y lo congela
 * en la operación. Las personas del Premium se validan acá (número entero
 * en rango, `leerPedidoDePago`) y otra vez en la base (que el plan las
 * lleve, que no sean menos que el equipo de hoy).
 *
 * Contesta el `processId` con el que el navegador abre el formulario. Esta
 * ruta NO activa nada: el plan lo activa la confirmación de Bancard (o la
 * consulta) adentro de `bancard_confirmar`.
 */
export async function POST(request: Request) {
  const t = await textos();
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.servidor.necesitasSesion }, { status: 401 });

  let cuerpo: Record<string, unknown>;
  try {
    const leido = await request.json();
    cuerpo = leido && typeof leido === 'object' ? leido : {};
  } catch {
    return NextResponse.json({ error: t.servidor.pedidoIlegible }, { status: 400 });
  }

  const pedido = leerPedidoDePago(cuerpo);
  if (!pedido) return NextResponse.json({ error: t.bancard.servidor.pedidoInvalido }, { status: 400 });

  const empresa = await empresaDelPedido(supabase, user.id, cuerpo.empresa, (await cookies()).get(COOKIE_EMPRESA)?.value);
  if (!empresa) return NextResponse.json({ error: t.bancard.servidor.sinEmpresa }, { status: 400 });

  const acceso = await accesoBancard(supabase, empresa);
  const d = acceso.disponible ? dependencias() : null;
  if (!d) return NextResponse.json({ error: t.bancard.noDisponible }, { status: 403 });

  const r = await iniciarPago(d, { empresa, usuario: user.id, ...pedido });
  switch (r.estado) {
    case 'listo':
      return NextResponse.json(
        { operacion: r.operacion, processId: r.processId, entorno: r.entorno, importe: r.importe, desglose: r.desglose },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    case 'ya_pagada':
      return NextResponse.json({ yaPagada: r.operacion }, { headers: { 'Cache-Control': 'no-store' } });
    case 'en_curso':
      return NextResponse.json({ error: t.bancard.hoja.enCurso, operacion: r.operacion }, { status: 409 });
    case 'error_base':
      return NextResponse.json(
        { error: mensajeDeError({ message: r.mensaje, code: r.codigo }, t.bancard.hoja.noSeAbrio) },
        { status: httpDeErrorDeBase(r.codigo) },
      );
    default:
      return NextResponse.json({ error: t.bancard.hoja.noSeAbrio }, { status: 502 });
  }
}
