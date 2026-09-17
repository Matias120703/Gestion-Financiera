import { NextResponse } from 'next/server';
import { cronAutorizado } from '@/lib/avisos';
import { correrAvisosDiarios } from '@/lib/avisos-diarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** La corrida de la tarde: «todavía no cargaste nada hoy», solo a quien no cargó. Ver lib/avisos-diarios.ts. */
export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const { estado, cuerpo } = await correrAvisosDiarios('tarde');
  return NextResponse.json(cuerpo, { status: estado });
}
