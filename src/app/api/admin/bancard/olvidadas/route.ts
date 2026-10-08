import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { dependencias } from '@/lib/bancard-servidor';
import { borrarOlvidada, buscarOlvidadas } from '@/lib/bancard-flujo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Los números de pagador son enteros positivos; el tope es solo para no aceptar cualquier cosa. */
const MAYOR_PAGADOR = 99_999_999;

const SIN_CACHE = { 'Cache-Control': 'no-store' };

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= MAYOR_PAGADOR ? v : null;
}

async function leerCuerpo(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const leido = await request.json();
    return leido && typeof leido === 'object' && !Array.isArray(leido) ? leido as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * «TARJETAS OLVIDADAS EN BANCARD» (/admin → Bancard). Solo la administración
 * de Orden.
 *
 * Bancard no deja guardar dos veces la misma tarjeta, y cuando se borra una
 * cuenta su tarjeta queda guardada allá a nombre de un pagador que Orden ya
 * no conoce (07/10/2026: la tarjeta de prueba quedó así y no se pudo seguir
 * probando; a un cliente que borra su cuenta y vuelve le pasaría lo mismo).
 *
 * POST busca: `{ desde, hasta }` son números de pagador. Le pregunta a
 * Bancard por cada uno, en fila, hasta 40 por pedido y con 40 segundos de
 * reloj; si no alcanza, la respuesta trae `siguiente`. De cada tarjeta
 * devuelve el pagador, el número que le puso Orden, la marca, los últimos
 * cuatro y qué sabe Orden de ella. Nada más de la tarjeta sale de acá.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: esSuper } = await supabase.rpc('es_superadmin');
  if (esSuper !== true) return NextResponse.json({ ok: false }, { status: 403 });

  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return NextResponse.json({ ok: false, error: 'Pedido ilegible.' }, { status: 400 });
  const desde = entero(cuerpo.desde);
  const hasta = entero(cuerpo.hasta);
  if (desde === null || hasta === null || desde > hasta) {
    return NextResponse.json({ ok: false, error: 'Ese rango no es válido.' }, { status: 400 });
  }

  const d = dependencias();
  if (!d) return NextResponse.json({ ok: false, error: 'Bancard no está configurado en este servidor.' }, { status: 503 });

  const r = await buscarOlvidadas(d, { desde, hasta }, { hastaMs: Date.now() + 40_000 });
  return NextResponse.json({ ok: true, entorno: d.entorno, ...r }, { headers: SIN_CACHE });
}

/**
 * DELETE borra UNA: `{ userId, cardId }`, y no se lee nada más del pedido.
 * Que se pueda borrar no lo dice la pantalla: `borrarOlvidada` vuelve a
 * pedirle la lista a Bancard y a mirar la base en este momento, y si Orden
 * tiene esa tarjeta en uso (o a medio guardar) contesta 409 sin haberle
 * pedido ningún borrado a Bancard.
 */
export async function DELETE(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: esSuper } = await supabase.rpc('es_superadmin');
  if (esSuper !== true) return NextResponse.json({ ok: false }, { status: 403 });

  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return NextResponse.json({ ok: false, error: 'Pedido ilegible.' }, { status: 400 });
  const userId = entero(cuerpo.userId);
  const cardId = entero(cuerpo.cardId);
  if (userId === null || cardId === null) {
    return NextResponse.json({ ok: false, error: 'Esa tarjeta no es válida.' }, { status: 400 });
  }

  const d = dependencias();
  if (!d) return NextResponse.json({ ok: false, error: 'Bancard no está configurado en este servidor.' }, { status: 503 });

  const r = await borrarOlvidada(d, { userId, cardId, actor: user.id });
  if (r.ok) return NextResponse.json({ ok: true, resultado: r.resultado }, { headers: SIN_CACHE });
  if (r.motivo === 'bancard') {
    return NextResponse.json({ ok: false, motivo: r.motivo, clave: r.clave ?? '' }, { status: 502, headers: SIN_CACHE });
  }
  return NextResponse.json({ ok: false, motivo: r.motivo }, { status: r.motivo === 'base' ? 503 : 409, headers: SIN_CACHE });
}
