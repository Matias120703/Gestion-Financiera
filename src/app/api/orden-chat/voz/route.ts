import OpenAI from 'openai';
import { NextResponse, type NextRequest } from 'next/server';

import { numerosEnCifras } from './cifras';

/*
 * «HABLAR» DE LA APP DE ORDEN (18/11/2026).
 *
 * La app graba lo que dice la persona («gasté 25 mil en almuerzo») y manda el
 * audio acá. Se pasa a texto con OpenAI y vuelve solo el texto: el celular lo
 * trata como si lo hubiera escrito. No se guarda el audio ni el texto.
 */

const MODELO = process.env.MODELO_VOZ || 'gpt-4o-mini-transcribe';
const MAX_BYTES = 6_000_000; // ~1 minuto de audio sobra

// Le da pistas de cómo se habla de plata en Paraguay, para que escriba bien
// los montos («25 mil», «2 palos») y las palabras en guaraní aprobadas.
const PISTA = 'Gastos e ingresos en guaraníes de Paraguay. Ejemplos: "gasté 25 mil en almuerzo", "me pagaron el sueldo, 4 palos", "le presté 500 mil a Juan", "cargué 100 mil de nafta", "¿me alcanza para unas zapatillas de 300 mil?". Palabras: mil, palos, guaraníes, delivery, súper, nafta, fiado, pio, mba\'e, ndeee.';

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
  if (!cliente) return error(503, 'Hablar todavía no está configurado');

  const largo = Number(request.headers.get('content-length') ?? 0);
  if (largo > MAX_BYTES) return error(413, 'El audio es muy largo. Probá con algo más corto.');

  let audio: File;
  try {
    const datos = await request.formData();
    const f = datos.get('audio');
    if (!(f instanceof File) || f.size === 0) throw new Error();
    if (f.size > MAX_BYTES) return error(413, 'El audio es muy largo. Probá con algo más corto.');
    audio = f;
  } catch {
    return error(400, 'No llegó el audio');
  }

  try {
    const r = await cliente.audio.transcriptions.create({ file: audio, model: MODELO, language: 'es', prompt: PISTA });
    const texto = numerosEnCifras(r.text.trim());
    return cors(NextResponse.json({ texto }));
  } catch (e) {
    if (e instanceof OpenAI.RateLimitError) return error(429, 'Orden está con mucha gente. Probá en un ratito.');
    if (e instanceof OpenAI.BadRequestError) {
      console.error('orden-voz 400', e.message);
      return error(400, 'No pude escuchar bien el audio. Probá de nuevo.');
    }
    console.error('orden-voz', e);
    return error(502, 'No pude escucharte. Probá de nuevo.');
  }
}
