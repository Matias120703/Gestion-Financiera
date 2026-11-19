import { NextResponse } from 'next/server';

/*
 * COTIZACIÓN PARA LA APP DE ORDEN (19/11/2026).
 *
 * La app guarda plata en varias monedas (guaraníes, dólares, reales…) y para
 * sumarlo todo necesita la cotización del día. Matías eligió la de Cambios
 * Yrendague: su portada pública (permitida en su robots.txt) trae la tabla de
 * la Casa Matriz. Se lee cada 30 minutos como mucho y se devuelve limpia.
 * Si un día cambian la página y no se puede leer, la app sigue con la última
 * que guardó (y la persona la puede poner a mano).
 */

const FUENTE = 'https://www.yrendague.com.py/';
const CADA_SEGUNDOS = 1800;

type Par = { compra: number; venta: number };

/** «6.100» → 6100 · «3,450» → 3.45 (punto = miles, coma = decimales). */
function numero(s: unknown): number {
  const n = Number(String(s ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function leerYrendague(): Promise<Record<string, Par>> {
  const r = await fetch(FUENTE, { headers: { 'user-agent': 'Mozilla/5.0 (Orden)' }, next: { revalidate: CADA_SEGUNDOS } });
  if (!r.ok) throw new Error(`Yrendague respondió ${r.status}`);
  const html = await r.text();
  // La primera tabla es la de la Casa Matriz: [{ code: 'USD', buy: '6.100', sell: '6.220' }, …]
  const m = html.match(/"currencies":(\[[^\]]*\])/);
  if (!m) throw new Error('No encontré la tabla de cotizaciones');
  const filas = JSON.parse(m[1]) as { code?: string; buy?: string; sell?: string }[];
  const monedas: Record<string, Par> = {};
  for (const f of filas) {
    const code = String(f.code ?? '').toUpperCase();
    const par = { compra: numero(f.buy), venta: numero(f.sell) };
    if (/^[A-Z]{3}$/.test(code) && par.compra && par.venta) monedas[code] = par;
  }
  if (!monedas.USD) throw new Error('La tabla no trae el dólar');
  return monedas;
}

export async function GET() {
  try {
    const monedas = await leerYrendague();
    const res = NextResponse.json({ fuente: 'Cambios Yrendague', actualizado: new Date().toISOString(), monedas });
    res.headers.set('Cache-Control', `public, s-maxage=${CADA_SEGUNDOS}, stale-while-revalidate=86400`);
    res.headers.set('Access-Control-Allow-Origin', '*');
    return res;
  } catch (e) {
    console.error('orden-cotizacion', e);
    const res = NextResponse.json({ error: 'No pude leer la cotización ahora' }, { status: 502 });
    res.headers.set('Access-Control-Allow-Origin', '*');
    return res;
  }
}
