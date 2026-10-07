import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { abiertoATodos, dependencias, estadoDeConfiguracion } from '@/lib/bancard-servidor';
import { probarConexion } from '@/lib/bancard-flujo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * «PROBAR CONEXIÓN» (/admin → Bancard). Solo la administración de Orden.
 *
 * Le pregunta a Bancard por un pedido que no existe: si contesta «no existe»,
 * Orden llega y las claves sirven. Devuelve si las variables están cargadas
 * (nunca su valor), el entorno y si está abierto a todos.
 */
export async function POST() {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: esSuper } = await supabase.rpc('es_superadmin');
  if (esSuper !== true) return NextResponse.json({ ok: false }, { status: 403 });

  const estado = estadoDeConfiguracion();
  const d = dependencias();
  if (!estado.configurado || !d) {
    return NextResponse.json({
      ok: false, configurado: false, motivo: estado.configurado ? 'sin_entorno' : estado.motivo, abierto: abiertoATodos(),
    });
  }

  const r = await probarConexion(d);
  return NextResponse.json({
    ok: r.resultado === 'bien', configurado: true, entorno: d.entorno, abierto: abiertoATodos(),
    resultado: r.resultado, http: r.http, clave: r.clave,
  });
}
