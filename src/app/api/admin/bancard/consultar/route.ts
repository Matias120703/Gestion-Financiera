import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { dependencias } from '@/lib/bancard-servidor';
import { resolverOperacion } from '@/lib/bancard-flujo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * «CONSULTAR A BANCARD» (/admin → la ficha de una cuenta → sus pagos). Solo
 * la administración de Orden.
 *
 * Le pregunta a Bancard por ese pedido y aplica lo que diga (si se pagó y no
 * había llegado la confirmación, activa el plan; si se rechazó, lo anota).
 * No da nada por abandonado: eso lo hace la conciliación. Marca «Recibimos
 * pedido de confirmación del comercio» en la lista de tests.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: esSuper } = await supabase.rpc('es_superadmin');
  if (esSuper !== true) return NextResponse.json({ ok: false }, { status: 403 });

  let operacion = 0;
  try {
    operacion = Number((await request.json())?.operacion);
  } catch {
    return NextResponse.json({ ok: false, error: 'Pedido ilegible.' }, { status: 400 });
  }
  if (!Number.isSafeInteger(operacion) || operacion <= 0) {
    return NextResponse.json({ ok: false, error: 'Ese pago no existe.' }, { status: 400 });
  }

  const d = dependencias();
  if (!d) return NextResponse.json({ ok: false, error: 'Bancard no está configurado en este servidor.' }, { status: 503 });

  const estado = await resolverOperacion(d, operacion, { esperaMs: 10_000 });
  return NextResponse.json({ ok: true, estado });
}
