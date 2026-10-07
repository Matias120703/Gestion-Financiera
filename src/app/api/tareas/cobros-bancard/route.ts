import { NextResponse } from 'next/server';
import { cronAutorizado } from '@/lib/avisos';
import { dependencias } from '@/lib/bancard-servidor';
import { correrCobros } from '@/lib/bancard-flujo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Un cobro con token puede tardar hasta 40 s; la corrida reserva lo que falta. */
export const maxDuration = 60;

/**
 * EL COBRO AUTOMÁTICO CON LA TARJETA GUARDADA, cada hora de 9 a 18 de
 * Paraguay (pg_cron `orden-cobros-bancard`, migración 126, vía
 * `disparar_tarea`).
 *
 * Bancard no hace suscripciones: Orden guarda la tarjeta y programa el
 * cobro. La base entrega de a uno el cobro que toca (`bancard_tomar_cobro`:
 * el día anterior al vencimiento, y si se rechaza, los reintentos +1 y +4;
 * un intento por día; nunca dos corridas sobre la misma cuenta) y acá se
 * cobra con el token. Antes, mira en vivo las tarjetas que vencen antes del
 * próximo cobro y avisa «cambiala».
 *
 * Varias corridas por día a propósito: cada una cobra pocas cuentas (hablar
 * con Bancard tarda) y a nadie se le cobra dos veces el mismo día.
 *
 * Contesta solo cantidades: nada de nadie.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ ok: false }, { status: 401 });

  const d = dependencias();
  if (!d) return NextResponse.json({ ok: true, omitida: 'Bancard no está configurado' });

  const resumen = await correrCobros(d, { hastaMs: Date.now() + 58_000 });
  return NextResponse.json({ ok: true, entorno: d.entorno, ...resumen });
}
