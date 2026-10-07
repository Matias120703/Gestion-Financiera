import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clienteServidor } from '@/lib/supabase/servidor';
import {
  accesoBancard, dependencias, empresaDelPedido, httpDeErrorDeBase, leerPedidoDePago,
} from '@/lib/bancard-servidor';
import { cobrarConTarjeta } from '@/lib/bancard-flujo';
import { mensajeDeError } from '@/lib/errores';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import { textos } from '@/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** El cobro con token tarda: el emisor puede demorar 49 segundos (manual, códigos 46 y 47). */
export const maxDuration = 60;

/**
 * «PAGAR CON MI VISA •••• 0016»: el cobro con la tarjeta guardada, con la
 * persona delante.
 *
 * Mismo cuerpo que el pago con el formulario (`{ tipo, plan, periodo,
 * personas }`: QUÉ se paga, nunca cuánto). La base crea la operación con
 * medio 'token' —exige la tarjeta activa, no bloqueada y no rebotada— y
 * congela el importe; el servidor le pide a Bancard el alias de la tarjeta y
 * manda el `charge`. La respuesta viene en el mismo pedido y la aplica
 * `bancard_confirmar` (la confirmación que Bancard manda después por la URL
 * encuentra la operación ya pagada y no hace nada).
 *
 * Contesta cómo quedó: pagada, rechazada (con el texto de Bancard), en_3ds
 * (con el `processId` para abrir el formulario del banco), incierta (se
 * cortó: la conciliación la resuelve; no se vuelve a cobrar) o vencida
 * (Bancard no aceptó el pedido: nada se cobró).
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

  const r = await cobrarConTarjeta(d, { empresa, usuario: user.id, ...pedido }, { esperaMs: 50_000 });
  const sinCache = { headers: { 'Cache-Control': 'no-store' } };
  switch (r.estado) {
    case 'pagada':
    case 'rechazada':
    case 'incierta':
      return NextResponse.json(
        { operacion: r.operacion, estado: r.estado, descripcion: 'descripcion' in r ? r.descripcion : null, entorno: d.entorno },
        sinCache,
      );
    case 'en_3ds':
      return NextResponse.json({ operacion: r.operacion, estado: r.estado, processId: r.processId, entorno: d.entorno }, sinCache);
    case 'vencida':
      return NextResponse.json({ operacion: r.operacion, estado: r.estado, clave: r.clave, entorno: d.entorno }, sinCache);
    case 'ya_pagada':
      return NextResponse.json({ yaPagada: r.operacion }, sinCache);
    case 'en_curso':
      return NextResponse.json({ error: t.bancard.hoja.enCurso, operacion: r.operacion }, { status: 409 });
    case 'error_base':
      return NextResponse.json(
        { error: mensajeDeError({ message: r.mensaje, code: r.codigo }, t.bancard.tarjeta.noSeCobroConGuardada) },
        { status: httpDeErrorDeBase(r.codigo) },
      );
    default:
      return NextResponse.json({ error: t.bancard.tarjeta.noSeCobroConGuardada }, { status: 502 });
  }
}
