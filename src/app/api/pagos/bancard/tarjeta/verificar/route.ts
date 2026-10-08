import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clienteServidor } from '@/lib/supabase/servidor';
import { accesoBancard, dependencias, empresaDelPedido } from '@/lib/bancard-servidor';
import { verificarTarjeta } from '@/lib/bancard-flujo';
import { leerLoQueDijoElFormulario } from '@/lib/bancard-formulario';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import { textos } from '@/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * ¿QUEDÓ GUARDADA LA TARJETA? Lo contesta Bancard, no el formulario.
 *
 * Después de que el iframe de catastro termina (diga lo que diga:
 * «add_new_card_success» o «add_new_card_fail»), y también al volver por el
 * `return_url` (/plan/tarjeta/[tarjeta]), se le pide a Bancard la lista de
 * tarjetas del pagador (manual, «users_cards»; marca «Recibir tarjetas del
 * usuario»). Si la tarjeta está, queda activa con su marca y sus últimos
 * cuatro números, y es la del débito.
 *
 * `{ tarjeta }` tiene que ser de la cuenta de quien pregunta: lo comprueba
 * `verificarTarjeta` contra la base.
 *
 * `{ formulario }` (opcional) es lo que avisó el iframe o lo que trajo la
 * dirección de vuelta: `{ mensaje, detalle }`. Viene del navegador, así que
 * NO DECIDE NADA: se limpia acá de nuevo, queda anotado en `bancard_eventos`
 * (tipo `catastro_formulario`) y, si la tarjeta no quedó, se devuelve limpio
 * para que la pantalla le muestre a la persona qué contestó Bancard. Antes se
 * tiraba, y de un catastro rechazado solo se sabía «no se pudo» (07/10/2026).
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

  const tarjeta = cuerpo.tarjeta;
  if (!(typeof tarjeta === 'number' && Number.isSafeInteger(tarjeta) && tarjeta > 0)) {
    return NextResponse.json({ error: t.bancard.servidor.pedidoInvalido }, { status: 400 });
  }
  // Solo textos, recortados y sin etiquetas; null si no vino nada legible.
  const formulario = leerLoQueDijoElFormulario(cuerpo.formulario);

  const empresa = await empresaDelPedido(supabase, user.id, cuerpo.empresa, (await cookies()).get(COOKIE_EMPRESA)?.value);
  if (!empresa) return NextResponse.json({ error: t.bancard.servidor.sinEmpresa }, { status: 400 });

  const acceso = await accesoBancard(supabase, empresa);
  const d = acceso.disponible ? dependencias() : null;
  if (!d) return NextResponse.json({ error: t.bancard.noDisponible }, { status: 403 });

  const r = await verificarTarjeta(d, { tarjeta, empresa, formulario });
  if (r.guardada) {
    return NextResponse.json(
      { guardada: true, tarjeta: r.tarjeta, marca: r.marca, ultimos4: r.ultimos4, ya: r.ya },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (r.motivo === 'ajena' || r.motivo === 'desconocida') {
    return NextResponse.json({ error: t.bancard.resultado.noExiste }, { status: 404 });
  }
  // 'no_esta' (Bancard no la tiene), 'sin_confirmar' (el formulario dijo que
  // la guardó y Bancard todavía no la lista: la pantalla dice que se vuelve a
  // mirar sola), 'bancard' (no contestó), su estado… Con lo que dijo el
  // formulario, para que la pantalla lo muestre.
  return NextResponse.json({ guardada: false, motivo: r.motivo, formulario }, { headers: { 'Cache-Control': 'no-store' } });
}
