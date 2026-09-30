import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { tieneSeccion } from '@/lib/rubros';
import { TOPES_PLANILLA } from '@/lib/planilla';
import { leerXlsx } from '@/lib/planilla-xlsx';
import { bajarDeGoogle, exportDeSheets } from '@/lib/enlace-sheets';

/**
 * LEER UNA PLANILLA DEL TRAINER (114): POST /api/rutinas/importar.
 *
 * «Subir planilla» del editor de rutinas manda acá un .xlsx/.xlsm (FormData
 * con `empresa` y `archivo`) o un link de Google Sheets (JSON con `empresa`
 * y `enlace`). Se lee en el SERVIDOR porque exceljs pesa ~0,9 MB y no puede
 * ir al celular; el CSV lo lee el navegador y no pasa por acá.
 *
 * Devuelve `{ libro }` (las celdas como texto: src/lib/planilla.ts) o
 * `{ error: <código> }`, y la pantalla arma la rutina y la muestra para
 * revisar. ESTA RUTA NO GUARDA NADA: ni el archivo, ni la rutina, ni el
 * contenido en los logs (D3.12); a lo sumo el código del error.
 *
 *   · Solo con sesión, y solo para una cuenta de la que es miembro (la RLS
 *     de `empresas` lo decide) con la sección de rutinas (rubro entrenamiento).
 *   · Hasta 4 MB (Vercel corta en 4,5 MB; el navegador ya lo frenó antes).
 *   · Google: la dirección se arma de cero con el id de la planilla, y las
 *     redirecciones solo van a Google (src/lib/enlace-sheets.ts: SSRF).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const CABECERAS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
const responder = (cuerpo: object, status = 200) => NextResponse.json(cuerpo, { status, headers: CABECERAS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return responder({ error: 'sin_sesion' }, 401);

  // Un cuerpo de más ni se lee (el FormData suma unos bytes al archivo).
  const largo = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(largo) && largo > TOPES_PLANILLA.bytes + 64 * 1024) return responder({ error: 'muy_grande' }, 413);

  let empresa = '';
  let archivo: Blob | null = null;
  let enlace = '';
  try {
    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const datos = await request.formData();
      empresa = String(datos.get('empresa') ?? '');
      const a = datos.get('archivo');
      archivo = a && typeof a !== 'string' ? a : null;
    } else {
      const datos = (await request.json()) as { empresa?: unknown; enlace?: unknown } | null;
      empresa = String(datos?.empresa ?? '');
      enlace = String(datos?.enlace ?? '').slice(0, 2000);
    }
  } catch {
    return responder({ error: 'error' }, 400);
  }

  // RLS: si no es miembro de la cuenta, la consulta vuelve vacía.
  if (!UUID.test(empresa)) return responder({ error: 'sin_acceso' }, 403);
  const { data: cuenta } = await supabase.from('empresas').select('id, rubro, tipo_cuenta').eq('id', empresa).maybeSingle();
  if (!cuenta || !tieneSeccion(cuenta.rubro, cuenta.tipo_cuenta, '/rutinas')) return responder({ error: 'sin_acceso' }, 403);

  let bytes: Uint8Array;
  if (archivo) {
    if (archivo.size > TOPES_PLANILLA.bytes) return responder({ error: 'muy_grande' }, 413);
    bytes = new Uint8Array(await archivo.arrayBuffer());
  } else if (enlace.trim()) {
    const destino = exportDeSheets(enlace);
    if ('error' in destino) return responder({ error: destino.error }, 400);
    const bajado = await bajarDeGoogle(destino.url);
    if (!(bajado instanceof Uint8Array)) {
      console.error('[importar]', bajado.error);
      const status = bajado.error === 'google_no_responde' ? 502 : bajado.error === 'muy_grande' ? 413 : 422;
      return responder({ error: bajado.error }, status);
    }
    bytes = bajado;
  } else {
    return responder({ error: 'error' }, 400);
  }

  const libro = await leerXlsx(bytes);
  if ('error' in libro) {
    console.error('[importar]', libro.error);
    return responder({ error: libro.error }, libro.error === 'muy_grande' ? 413 : 422);
  }
  return responder({ libro });
}
