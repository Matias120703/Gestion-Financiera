import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { dependencias } from '@/lib/bancard-servidor';
import { resolverOperacion } from '@/lib/bancard-flujo';
import { textos } from '@/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const VIVAS = ['creada', 'en_3ds', 'incierta'];

/**
 * ¿QUÉ PASÓ CON MI PAGO? (la pantalla de resultado y la de vuelta).
 *
 * Se lee con la sesión de quien pregunta: `bancard_operacion_ver` decide en
 * la base si ese pago es de una cuenta que administra (si no, «no existe»,
 * igual que si no existiera) y devuelve SOLO lo que el manual deja mostrar:
 * fecha y hora, número de pedido, importe y la descripción de Bancard.
 *
 * Lo que diga el formulario («payment_success») no se cree. Si la operación
 * sigue sin resolver después de unos segundos, se le pregunta a Bancard
 * (`resolverOperacion`, sin dar por abandonado nada) y se vuelve a leer. Y
 * una vez, aunque la confirmación ya haya llegado, también: esa consulta es
 * la que marca «Recibimos pedido de confirmación del comercio» en la lista
 * de tests del portal.
 */
export async function GET(request: Request) {
  const t = await textos();
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.servidor.necesitasSesion }, { status: 401 });

  const op = new URL(request.url).searchParams.get('op') ?? '';
  if (!/^[0-9]{1,15}$/.test(op)) return NextResponse.json({ error: t.bancard.resultado.noExiste }, { status: 400 });
  const operacion = Number(op);

  const leer = () => supabase.rpc('bancard_operacion_ver', { p_operacion: operacion });
  let { data, error } = await leer();
  if (error || !data) {
    // «No es tuyo» y «no existe» contestan lo mismo (P0002).
    const status = !error || error.code === 'P0002' ? 404 : 503;
    return NextResponse.json({ error: t.bancard.resultado.noExiste }, { status });
  }

  const d = dependencias();
  const vista = data as { estado?: string; entorno?: string; fecha?: string };
  if (d && vista.entorno === d.entorno) {
    let consultar = false;
    if (VIVAS.includes(String(vista.estado))) {
      const edad = Date.now() - Date.parse(String(vista.fecha ?? ''));
      consultar = !Number.isFinite(edad) || edad > 5_000;
    } else if (vista.estado === 'pagada') {
      const interna = await d.bd.rpc('bancard_operacion_interna', { p_operacion: operacion });
      const consultas = Number((interna.data as { consultas?: number } | null)?.consultas ?? 1);
      consultar = !interna.error && consultas === 0;
    }
    if (consultar) {
      // Una consulta a Bancard cada 10 segundos como mucho: la pantalla
      // sondea cada 2 (revisión 03/10).
      await resolverOperacion(d, operacion, { esperaMs: 8_000, noRepetirAntesDeS: 10 });
      ({ data, error } = await leer());
      if (error || !data) return NextResponse.json({ error: t.bancard.resultado.noExiste }, { status: 503 });
    }
  }

  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
