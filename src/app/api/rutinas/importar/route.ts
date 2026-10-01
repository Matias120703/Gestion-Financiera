import { NextResponse } from 'next/server';
import { tieneSeccion } from '@/lib/rubros';
import { planillaDelPedido } from '@/lib/planilla-del-pedido';

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
 * Lo de leer el pedido (sesión, 4 MB, FormData o link, Google, exceljs) es
 * `planillaDelPedido`, el mismo de la lista de productos (122). Acá queda lo
 * propio: solo para una cuenta de la que es miembro (la RLS de `empresas`
 * lo decide) con la sección de rutinas (rubro entrenamiento), y la planilla
 * leída como siempre (500 filas, sin lo oculto).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const CABECERAS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
const responder = (cuerpo: object, status = 200) => NextResponse.json(cuerpo, { status, headers: CABECERAS });

export async function POST(request: Request) {
  const leido = await planillaDelPedido(request, {
    etiqueta: '[importar]',
    // RLS: si no es miembro de la cuenta, la consulta vuelve vacía.
    permiso: async (supabase, empresa) => {
      const { data: cuenta } = await supabase.from('empresas').select('id, rubro, tipo_cuenta').eq('id', empresa).maybeSingle();
      return !!cuenta && tieneSeccion(cuenta.rubro, cuenta.tipo_cuenta, '/rutinas');
    },
  });
  if ('error' in leido) return responder({ error: leido.error }, leido.status);
  return responder({ libro: leido.libro });
}
