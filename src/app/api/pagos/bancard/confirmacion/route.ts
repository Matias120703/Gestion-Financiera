import { NextResponse } from 'next/server';
import { dependencias } from '@/lib/bancard-servidor';
import { recibirConfirmacion, recibirSinConfigurar } from '@/lib/bancard-flujo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Bancard manda un JSON chico. Más que esto no es una confirmación. */
const TOPE_DEL_CUERPO = 64 * 1024;

/**
 * LA URL DE CONFIRMACIÓN DE BANCARD: https://orden.com.py/api/pagos/bancard/confirmacion
 * (se carga en el portal → Perfil de aplicación, una por ambiente).
 *
 * ES PÚBLICA A PROPÓSITO (está en PUBLICAS de src/middleware.ts): la llaman
 * los servidores de Bancard, sin cookie ni sesión. Lo que la protege no es el
 * middleware sino:
 *   · el token md5 de cada confirmación, que solo arma quien tiene la clave
 *     privada (comparado en tiempo constante);
 *   · que la operación exista en Orden, sea de este entorno y tenga el MISMO
 *     importe y moneda que se congelaron al crearla (lo compara la base);
 *   · y, si el token no coincide, la palabra de Bancard consultado con
 *     nuestra clave.
 *
 * Contesta siempre `{"status":"success"}` con 200 o `{"status":"error"}` con
 * 400/503, en menos de 30 segundos (el manual: si no, la confirmación queda
 * «inválida» en la traza). Sin redirecciones y sin tocar cookies.
 */
export async function POST(request: Request) {
  const crudo = await leerConTope(request);
  if (crudo === null) {
    return NextResponse.json({ status: 'error' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const d = dependencias();
  const r = d ? await recibirConfirmacion(d, crudo) : recibirSinConfigurar(crudo);
  return NextResponse.json(r.cuerpo, { status: r.http, headers: { 'Cache-Control': 'no-store' } });
}

/** El cuerpo como texto, cortando si pasa del tope. Null si pasó. */
async function leerConTope(request: Request): Promise<string | null> {
  const declarado = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declarado) && declarado > TOPE_DEL_CUERPO) return null;
  if (!request.body) return '';

  const lector = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > TOPE_DEL_CUERPO) {
        await lector.cancel().catch(() => undefined);
        return null;
      }
      partes.push(value);
    }
  } catch {
    return null;
  }
  const junto = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { junto.set(p, i); i += p.byteLength; }
  return new TextDecoder('utf-8').decode(junto);
}
