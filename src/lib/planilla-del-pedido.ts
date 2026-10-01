import type { User } from '@supabase/supabase-js';
import { clienteServidor } from '@/lib/supabase/servidor';
import { TOPES_PLANILLA, type LibroPlanilla } from '@/lib/planilla';
import { leerXlsx, type OpcionesXlsx } from '@/lib/planilla-xlsx';
import { bajarDeGoogle, exportDeSheets } from '@/lib/enlace-sheets';

/**
 * LA PLANILLA QUE LLEGA EN UN PEDIDO (114, compartida desde la 122). SOLO EN
 * EL SERVIDOR.
 *
 * Lo mismo para las dos rutas que leen un Excel: la rutina del trainer
 * (/api/rutinas/importar) y la lista de productos (/api/productos/planilla).
 * Cada ruta dice quién puede (`permiso`) y cómo se lee (`opciones`: los
 * topes y lo oculto); lo demás es esto, igual para las dos:
 *
 *   · solo con sesión (`auth.getUser()`, que valida el token con Supabase);
 *   · un cuerpo de más de 4 MB ni se lee (Vercel corta en 4,5 MB; el
 *     navegador ya lo frenó antes);
 *   · un .xlsx/.xlsm por FormData (`empresa`, `archivo`) o un link de Google
 *     Sheets por JSON (`empresa`, `enlace`);
 *   · la empresa: un UUID, y que el permiso de la ruta diga que sí (la RLS de
 *     `empresas` y `miembros` contesta vacío si no es de la cuenta);
 *   · Google: la dirección se arma de cero con el id de la planilla, y las
 *     redirecciones solo van a Google (src/lib/enlace-sheets.ts: SSRF);
 *   · se lee con exceljs (planilla-xlsx.ts: la zip bomba no llega a abrirse).
 *
 * NO GUARDA NADA: ni el archivo, ni lo que trae, ni el contenido en los logs
 * (D3.12); a lo sumo el código del error. Lo que se hace con el libro lo
 * decide la pantalla, que lo muestra antes de guardar.
 */

export type ClienteServidor = ReturnType<typeof clienteServidor>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PedidoDePlanilla {
  /** ¿Esta persona puede subir una planilla a esta cuenta? */
  permiso: (supabase: ClienteServidor, empresa: string, usuario: User) => Promise<boolean>;
  /** Cómo se lee el .xlsx (sin nada, como la rutina). */
  opciones?: OpcionesXlsx;
  /** Para el log del error: «[importar]», «[productos]». */
  etiqueta: string;
}

export async function planillaDelPedido(
  request: Request,
  { permiso, opciones = {}, etiqueta }: PedidoDePlanilla,
): Promise<{ libro: LibroPlanilla } | { error: string; status: number }> {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'sin_sesion', status: 401 };

  const tope = opciones.topes?.bytes ?? TOPES_PLANILLA.bytes;
  // Un cuerpo de más ni se lee (el FormData suma unos bytes al archivo).
  const largo = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(largo) && largo > tope + 64 * 1024) return { error: 'muy_grande', status: 413 };

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
    return { error: 'error', status: 400 };
  }

  if (!UUID.test(empresa)) return { error: 'sin_acceso', status: 403 };
  if (!(await permiso(supabase, empresa, user))) return { error: 'sin_acceso', status: 403 };

  let bytes: Uint8Array;
  if (archivo) {
    if (archivo.size > tope) return { error: 'muy_grande', status: 413 };
    bytes = new Uint8Array(await archivo.arrayBuffer());
  } else if (enlace.trim()) {
    const destino = exportDeSheets(enlace);
    if ('error' in destino) return { error: destino.error, status: 400 };
    const bajado = await bajarDeGoogle(destino.url);
    if (!(bajado instanceof Uint8Array)) {
      console.error(etiqueta, bajado.error);
      const status = bajado.error === 'google_no_responde' ? 502 : bajado.error === 'muy_grande' ? 413 : 422;
      return { error: bajado.error, status };
    }
    bytes = bajado;
  } else {
    return { error: 'error', status: 400 };
  }

  const libro = await leerXlsx(bytes, opciones);
  if ('error' in libro) {
    console.error(etiqueta, libro.error);
    return { error: libro.error, status: libro.error === 'muy_grande' ? 413 : 422 };
  }
  return { libro };
}
