import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisarPlanActivo } from '@/lib/aviso-plan-activo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SE ACTIVÓ UN PLAN: SE AVISA AL CLIENTE, Y AL SOCIO SI GANÓ SU COMISIÓN.
 *
 * La llama el panel de administración justo después de `cambiar_plan_cuenta`.
 * El plan ya quedó activo en la base; esto es solo el aviso. Lo que se dice y
 * a quién vive en `lib/aviso-plan-activo.ts`, que comparte con el pago por
 * Bancard (02/10): mismas claves de `envios`, así nadie recibe dos veces el
 * mismo aviso.
 *
 * Solo la administración puede pedirlo (se pregunta a la base con la sesión
 * de quien llama), y cada aviso sale una sola vez: el de plan por período, y
 * el de comisión por comisión.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: esAdmin } = await supabase.rpc('es_superadmin');
  if (esAdmin !== true) return NextResponse.json({ ok: false }, { status: 403 });

  let empresaId = '';
  try {
    empresaId = String((await request.json())?.empresa ?? '');
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) return NextResponse.json({ ok: false }, { status: 400 });

  const avisados = await avisarPlanActivo(clienteDeServicio(), empresaId);
  return NextResponse.json({ ok: true, avisados });
}
