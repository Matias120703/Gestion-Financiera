import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clienteServidor } from '@/lib/supabase/servidor';
import { accesoBancard, dependencias, empresaDelPedido, httpDeErrorDeBase } from '@/lib/bancard-servidor';
import { iniciarCatastro, quitarTarjeta } from '@/lib/bancard-flujo';
import { mensajeDeError } from '@/lib/errores';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import { textos } from '@/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Bancard pide el teléfono como texto de hasta 255; acá con lo que entra en un celular. */
const LARGO_TELEFONO = 30;

async function sesionYCuenta(cuerpo: Record<string, unknown>) {
  const t = await textos();
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: t.servidor.necesitasSesion }, { status: 401 }) };

  const empresa = await empresaDelPedido(supabase, user.id, cuerpo.empresa, (await cookies()).get(COOKIE_EMPRESA)?.value);
  if (!empresa) return { error: NextResponse.json({ error: t.bancard.servidor.sinEmpresa }, { status: 400 }) };

  const acceso = await accesoBancard(supabase, empresa);
  const d = acceso.disponible ? dependencias() : null;
  if (!d) return { error: NextResponse.json({ error: t.bancard.noDisponible }, { status: 403 }) };

  return { t, user, empresa, d };
}

async function leerCuerpo(request: Request): Promise<Record<string, unknown> | null> {
  const texto = await request.text().catch(() => '');
  if (!texto.trim()) return {};
  try {
    const leido = JSON.parse(texto);
    return leido && typeof leido === 'object' && !Array.isArray(leido) ? leido : null;
  } catch {
    return null;
  }
}

/**
 * «GUARDAR MI TARJETA»: pedirle a Bancard el formulario de catastro
 * (manual, «Cards_new»; marca «Solicitud de catastro»).
 *
 * Del navegador llegan `{ acepto: true, telefono? }`. Sin `acepto` no hay
 * catastro: es el consentimiento del cobro recurrente, y el texto exacto que
 * la persona aceptó (en su idioma) se guarda en la base con quién y cuándo.
 * Si la cuenta no tiene teléfono (Bancard lo exige), contesta 422 con
 * `falta: 'telefono'` y la pantalla lo pide.
 *
 * Contesta el `processId` con el que el navegador abre el formulario. Nada
 * queda guardado hasta que Bancard lista la tarjeta (`/tarjeta/verificar`).
 */
export async function POST(request: Request) {
  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return NextResponse.json({ error: (await textos()).servidor.pedidoIlegible }, { status: 400 });

  const s = await sesionYCuenta(cuerpo);
  if ('error' in s) return s.error;
  const { t, user, empresa, d } = s;

  if (cuerpo.acepto !== true) return NextResponse.json({ error: t.bancard.servidor.pedidoInvalido }, { status: 400 });
  const telefono = typeof cuerpo.telefono === 'string' ? cuerpo.telefono.trim().slice(0, LARGO_TELEFONO) : '';

  const r = await iniciarCatastro(d, {
    empresa,
    usuario: user.id,
    telefono: telefono || null,
    consentimiento: t.bancard.tarjeta.autorizo,
  });
  switch (r.estado) {
    case 'listo':
      return NextResponse.json({ tarjeta: r.tarjeta, processId: r.processId, entorno: r.entorno }, { headers: { 'Cache-Control': 'no-store' } });
    case 'falta_telefono':
      return NextResponse.json({ falta: 'telefono', error: mensajeDeError({ message: r.mensaje, code: '22023' }, r.mensaje) }, { status: 422 });
    case 'error_base':
      return NextResponse.json(
        { error: mensajeDeError({ message: r.mensaje, code: r.codigo }, t.bancard.tarjeta.noSeGuardo) },
        { status: httpDeErrorDeBase(r.codigo) },
      );
    default:
      return NextResponse.json({ error: t.bancard.tarjeta.noSeGuardo }, { status: 502 });
  }
}

/**
 * «QUITAR»: la tarjeta guardada deja de cobrarse EN EL ACTO (lo escribe la
 * base antes de hablar con Bancard) y se borra en Bancard (manual, «Eliminar
 * tarjeta»; marca «Eliminar tarjeta del usuario»). Si Bancard no contesta,
 * `pendienteEnBancard`: la conciliación termina el borrado; a la persona ya
 * no se le cobra más.
 */
export async function DELETE(request: Request) {
  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return NextResponse.json({ error: (await textos()).servidor.pedidoIlegible }, { status: 400 });

  const s = await sesionYCuenta(cuerpo);
  if ('error' in s) return s.error;
  const { t, user, empresa, d } = s;

  const r = await quitarTarjeta(d, { empresa, usuario: user.id });
  if (r.ok) {
    return NextResponse.json({ ok: true, pendienteEnBancard: r.pendienteEnBancard }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (r.motivo === 'sin_tarjeta') return NextResponse.json({ error: t.bancard.tarjeta.noSeQuito }, { status: 404 });
  return NextResponse.json({ error: mensajeDeError({ message: r.mensaje ?? '', code: '' }, t.bancard.tarjeta.noSeQuito) }, { status: 503 });
}
