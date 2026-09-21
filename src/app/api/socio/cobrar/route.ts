import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisar } from '@/lib/avisos';
import { textos } from '@/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «COBRAR»: EL SOCIO RETIRA DE SU SALDO.
 *
 * El socio trajo clientes, las comisiones le suman a un saldo, y acá elige
 * cuánto retirar (070). La ruta anota el pedido en la base y le manda un push
 * a la administración en el momento: «Fulano quiere retirar Gs. 500.000».
 *
 * QUIÉN PUEDE Y POR CUÁNTO
 *
 * Nada de eso se decide acá. `solicitar_retiro()` resuelve el socio de
 * `auth.uid()` —nadie puede retirar por otro— y ella misma frena el monto
 * por debajo del mínimo, por encima del saldo, un segundo pedido mientras
 * hay uno pendiente, un código pausado y la falta de datos bancarios.
 *
 * EL PEDIDO VALE AUNQUE EL AVISO FALLE
 *
 * El push va adentro de un try que no rompe nada: si no hay dispositivos
 * registrados o falla el envío, el pedido YA quedó anotado en la base y se
 * ve en el panel de administración. Al revés sería mucho peor — decirle al
 * socio que no se pudo pedir cuando en realidad ya estaba pedido.
 */
export async function POST(request: Request) {
  const s = (await textos()).servidor;
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: s.necesitasSesion }, { status: 401 });
  }

  let monto = 0;
  try {
    const cuerpo = await request.json();
    monto = Number(cuerpo?.monto);
  } catch {
    return NextResponse.json({ error: s.pedidoIlegible }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('solicitar_retiro', {
    p_monto: Number.isFinite(monto) ? monto : 0,
  });
  if (error) {
    // El mensaje viene escrito para una persona desde la función: «el mínimo
    // para retirar es…», «tu saldo es…». La pantalla lo pasa por el traductor.
    return NextResponse.json({ error: error.message || (await textos()).recomendar.noSePidioCobro }, { status: 400 });
  }

  const r = data as {
    ok: boolean; retiro_id: string; socio: string; socio_id: string;
    monto: number; saldo: number; banco: string; titular: string; documento: string; donde: string;
  };

  let avisados = 0;

  try {
    const servicio = clienteDeServicio();
    const { data: admins } = await servicio.rpc('usuarios_de_la_administracion');
    const ids: string[] = Array.isArray(admins) ? admins : [];

    // La administración es en español a propósito (ver PanelAdmin).
    const gs = (n: number) => `Gs. ${Number(n).toLocaleString('es-PY', { maximumFractionDigits: 0 })}`;
    const destino = [r.banco, r.donde, r.titular, r.documento ? `CI ${r.documento}` : '']
      .filter((x) => x && x.trim()).join(' · ');

    const entregas = await Promise.all(ids.map((id) => avisar(id, {
      titulo: `${r.socio} quiere retirar ${gs(r.monto)}`,
      cuerpo: `Transferir a ${destino}. Prometido en 24 a 48 h hábiles.`,
      url: '/admin',
      // Un tag por retiro: si el mismo pedido se avisa dos veces, reemplaza.
      tag: `retiro-${r.retiro_id}`,
    })));

    avisados = entregas.reduce((suma, n) => suma + n, 0);
  } catch {
    // El pedido ya está anotado. El aviso es el extra, no el trámite.
  }

  return NextResponse.json({
    ok: true,
    monto: r.monto,
    saldo: r.saldo,
    avisados,
  });
}
