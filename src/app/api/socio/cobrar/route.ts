import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisar } from '@/lib/avisos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «PEDIR MI COBRO».
 *
 * El socio trajo un cliente, el cliente pagó, y la comisión quedó esperando.
 * Esta ruta es la que convierte esa espera en una tarea: marca el pedido en
 * la base (066) y le manda un push a la administración en el momento.
 *
 * QUIÉN PUEDE Y POR CUÁNTO
 *
 * Nada de eso se decide acá. La función `solicitar_cobro()` resuelve el
 * socio de `auth.uid()` —así que nadie puede pedir el cobro de otro— y ella
 * misma frena si no tiene nada pendiente, si su código está pausado o si
 * todavía no dijo a dónde transferirle. Acá solo se pasa la sesión y se
 * avisa.
 *
 * EL PEDIDO VALE AUNQUE EL AVISO FALLE
 *
 * El push va adentro de un try que no rompe nada: si no hay dispositivos
 * registrados o falla el envío, el pedido YA quedó anotado en la base y se
 * ve en el panel de administración. Al revés sería mucho peor — decirle al
 * socio que no se pudo pedir cuando en realidad ya estaba pedido.
 */
export async function POST() {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('solicitar_cobro');
  if (error) {
    // El mensaje viene escrito para una persona desde la función: «Todavía no
    // tenés nada por cobrar», «completá dónde te transferimos».
    return NextResponse.json(
      { error: error.message || 'No se pudo pedir el cobro.' },
      { status: 400 },
    );
  }

  const r = data as {
    ok: boolean; socio: string; socio_id: string;
    comisiones: number; total: number; nuevas: number;
    ya_estaba: boolean; pedido_el: string | null; donde: string;
  };

  let avisados = 0;

  // Solo si hay algo nuevo. Tocar el botón de nuevo no vuelve a sonar el
  // teléfono de nadie: eso lo garantiza `nuevas = 0` desde la base.
  if (!r.ya_estaba) {
    try {
      const servicio = clienteDeServicio();
      const { data: admins } = await servicio.rpc('usuarios_de_la_administracion');
      const ids: string[] = Array.isArray(admins) ? admins : [];

      const monto = `Gs. ${Number(r.total).toLocaleString('es-PY', { maximumFractionDigits: 0 })}`;
      const cuantas = r.comisiones === 1 ? '1 comisión' : `${r.comisiones} comisiones`;

      const entregas = await Promise.all(ids.map((id) => avisar(id, {
        titulo: `${r.socio} pidió su cobro`,
        cuerpo: `${monto} · ${cuantas}. Transferir a ${r.donde}.`,
        url: '/admin',
        // Un tag por socio: si pide dos veces en el día, la segunda
        // reemplaza a la primera en la pantalla en vez de apilarse.
        tag: `cobro-${r.socio_id}`,
      })));

      avisados = entregas.reduce((s, n) => s + n, 0);
    } catch {
      // El pedido ya está anotado. El aviso es el extra, no el trámite.
    }
  }

  return NextResponse.json({
    ok: true,
    ya_estaba: r.ya_estaba,
    total: r.total,
    comisiones: r.comisiones,
    pedido_el: r.pedido_el,
    avisados,
  });
}
