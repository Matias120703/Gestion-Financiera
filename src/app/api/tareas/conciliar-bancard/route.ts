import { NextResponse } from 'next/server';
import { cronAutorizado } from '@/lib/avisos';
import { dependencias } from '@/lib/bancard-servidor';
import { correrConciliacion } from '@/lib/bancard-flujo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * LO QUE QUEDÓ A MEDIAS CON BANCARD, cada 10 minutos (pg_cron
 * `orden-conciliar-bancard`, migración 126, vía `disparar_tarea`).
 *
 * Las operaciones sin resolver de más de 10 minutos se le consultan a
 * Bancard: si se pagaron, se activa el plan (la confirmación pudo no llegar);
 * si pasaron su vida sin pago, se manda la reversa y se cierran (manual: «Si
 * el pago todavía no ha sido realizado, el comercio puede optar por realizar
 * un rollback»).
 *
 * Contesta solo cantidades: nada de nadie.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ ok: false }, { status: 401 });

  const d = dependencias();
  if (!d) return NextResponse.json({ ok: true, omitida: 'Bancard no está configurado' });

  const resumen = await correrConciliacion(d, { hastaMs: Date.now() + 50_000 });
  return NextResponse.json({ ok: true, entorno: d.entorno, ...resumen });
}
