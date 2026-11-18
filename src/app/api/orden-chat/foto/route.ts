import OpenAI from 'openai';
import { NextResponse, type NextRequest } from 'next/server';

/*
 * «FOTO» DE LA APP DE ORDEN (18/11/2026).
 *
 * La app saca una foto de un ticket o factura y la manda acá (JPEG en base64)
 * con la lista de categorías de la persona. OpenAI lee el total, el comercio,
 * la fecha y elige la categoría; vuelve solo eso y el celular arma la tarjeta
 * «Guardar / Cambiar». No se guarda la foto.
 */

const MODELO = process.env.MODELO_FOTO || 'gpt-4.1-mini';
const MAX_BYTES = 4_000_000; // Vercel corta en ~4,5 MB

const INSTRUCCION = `Leés fotos de tickets, facturas y comprobantes de Paraguay (montos en guaraníes, Gs.; el punto separa miles: "125.000" son ciento veinticinco mil).
Devolvé:
- legible: false si la foto no es un ticket/factura/comprobante o no se puede leer el total.
- monto: el TOTAL a pagar en guaraníes, número entero sin puntos (no el IVA, no el subtotal, no el vuelto). Si está en dólares u otra moneda, legible false.
- comercio: nombre corto del negocio ("Stock", "Petrobras", "Farmacenter"), o "" si no aparece.
- categoria: una de la lista de categorías que te paso, la más parecida (súper → la de súper o comida, combustible → nafta o auto, farmacia → salud). Si ninguna encaja, "Otros".
- fecha: AAAA-MM-DD si se lee en el ticket, si no "".
- tipo: "gasto" casi siempre; "ingreso" solo si es un comprobante de que la persona RECIBIÓ plata (transferencia recibida).`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['legible', 'tipo', 'monto', 'comercio', 'categoria', 'fecha'],
  properties: {
    legible: { type: 'boolean' },
    tipo: { type: 'string', enum: ['gasto', 'ingreso'] },
    monto: { type: 'integer' },
    comercio: { type: 'string' },
    categoria: { type: 'string' },
    fecha: { type: 'string' },
  },
} as const;

const cliente = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function cors(res: NextResponse) {
  // La app del celular no usa CORS; esto es para probarla en el navegador.
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Headers', 'content-type, x-orden-clave');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return res;
}

function error(estado: number, mensaje: string) {
  return cors(NextResponse.json({ error: mensaje }, { status: estado }));
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  const clave = process.env.ORDEN_APP_CLAVE;
  if (clave && request.headers.get('x-orden-clave') !== clave) return error(401, 'No autorizado');
  if (!cliente) return error(503, 'Foto todavía no está configurado');

  const cuerpo = await request.text();
  if (cuerpo.length > MAX_BYTES) return error(413, 'La foto es muy pesada. Probá de nuevo.');

  let imagen: string;
  let categorias: string[];
  let hoy: string;
  try {
    const x = JSON.parse(cuerpo) as { imagen?: unknown; categorias?: unknown; hoy?: unknown };
    if (typeof x.imagen !== 'string' || x.imagen.length < 100) throw new Error();
    imagen = x.imagen.replace(/^data:image\/\w+;base64,/, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(imagen.slice(0, 200))) throw new Error();
    categorias = Array.isArray(x.categorias) ? x.categorias.filter((c): c is string => typeof c === 'string').slice(0, 60).map((c) => c.slice(0, 40)) : [];
    hoy = typeof x.hoy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.hoy) ? x.hoy : new Date().toISOString().slice(0, 10);
  } catch {
    return error(400, 'No llegó la foto');
  }

  try {
    const r = await cliente.chat.completions.create({
      model: MODELO,
      max_completion_tokens: 300,
      response_format: { type: 'json_schema', json_schema: { name: 'ticket', strict: true, schema: ESQUEMA } },
      messages: [
        { role: 'system', content: INSTRUCCION },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Hoy es ${hoy}. Categorías: ${categorias.join(', ') || 'Otros'}.` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imagen}`, detail: 'high' } },
          ],
        },
      ],
    });
    const msg = r.choices[0]?.message;
    if (!msg?.content) return error(502, 'No pude leer la foto. Probá de nuevo.');
    const d = JSON.parse(msg.content) as { legible: boolean; tipo: 'gasto' | 'ingreso'; monto: number; comercio: string; categoria: string; fecha: string };
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) && d.fecha <= hoy ? d.fecha : '';
    return cors(NextResponse.json({ ...d, legible: d.legible && d.monto > 0, monto: Math.max(0, Math.round(d.monto)), fecha }));
  } catch (e) {
    if (e instanceof OpenAI.RateLimitError) return error(429, 'Orden está con mucha gente. Probá en un ratito.');
    if (e instanceof OpenAI.BadRequestError) {
      console.error('orden-foto 400', e.message);
      return error(400, 'No pude abrir la foto. Probá con otra.');
    }
    console.error('orden-foto', e);
    return error(502, 'No pude leer la foto. Probá de nuevo.');
  }
}
