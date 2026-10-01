import { NextResponse } from 'next/server';
import { fichaDeLaCuenta } from '@/lib/rubros';
import { TOPES_CATALOGO, libroACompacto } from '@/lib/planilla';
import { planillaDelPedido } from '@/lib/planilla-del-pedido';
import type { Empresa, Rol } from '@/lib/tipos';

/**
 * LEER LA LISTA DE PRODUCTOS DE UN NEGOCIO (122): POST /api/productos/planilla.
 *
 * Productos → «Subir planilla» manda acá un .xlsx/.xlsm (FormData con
 * `empresa` y `archivo`) o un link de Google Sheets (JSON con `empresa` y
 * `enlace`). Se lee en el SERVIDOR porque exceljs no puede ir al celular; el
 * CSV lo lee el navegador y no pasa por acá.
 *
 * Devuelve `{ libro }` EN CORTO (`libroACompacto`: 20.000 productos son
 * ~1,6 MB, y Vercel corta las respuestas en 4,5 MB) o `{ error: <código> }`.
 * La pantalla entiende las columnas (src/lib/catalogo-planilla.ts), lo
 * muestra para revisar y guarda directo en la base, por tandas
 * (`importar_productos`): guardar no pasa por acá ni por el tope de Vercel.
 *
 * ESTA RUTA NO GUARDA NADA: ni el archivo, ni los productos, ni el contenido
 * en los logs (D3.12); a lo sumo el código del error. Lo de leer el pedido
 * (sesión, 4 MB, FormData o link, Google, exceljs y la zip bomba) es
 * `planillaDelPedido`, el mismo de la rutina.
 *
 *   · Solo para una cuenta con Productos en su ficha (comercio, servicios; el
 *     profe y el trainer con «También vendo productos», 121)
 *     y solo para el dueño o un administrador: un vendedor no carga catálogo
 *     (la base lo vuelve a decir en importar_productos), y subir 4 MB para
 *     que después la base diga que no sería hacerle perder el tiempo.
 *   · La planilla se lee con los topes de la lista de productos (30.000
 *     filas), con lo oculto marcado (el costo que se esconde para imprimir la
 *     lista, las filas de un filtro) y con los números tal cual.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const CABECERAS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
const responder = (cuerpo: object, status = 200) => NextResponse.json(cuerpo, { status, headers: CABECERAS });

/**
 * ¿Esta cuenta tiene Productos? La ficha de la cuenta, con el interruptor
 * «También vendo productos» (121): la fila llega entera, con `vende_productos`.
 */
const conProductos = (cuenta: Empresa) => fichaDeLaCuenta(cuenta).secciones['/productos'];

export async function POST(request: Request) {
  const leido = await planillaDelPedido(request, {
    etiqueta: '[productos]',
    opciones: { topes: TOPES_CATALOGO, ocultas: true, numeros: true },
    // RLS: si no es miembro de la cuenta, la consulta vuelve vacía.
    permiso: async (supabase, empresa, usuario) => {
      const { data } = await supabase
        .from('miembros').select('rol, empresas(*)')
        .eq('empresa_id', empresa).eq('user_id', usuario.id)
        .maybeSingle();
      const fila = data as { rol: Rol; empresas: Empresa | null } | null;
      if (!fila?.empresas) return false;
      return (fila.rol === 'propietario' || fila.rol === 'admin') && conProductos(fila.empresas);
    },
  });
  if ('error' in leido) return responder({ error: leido.error }, leido.status);
  return responder({ libro: libroACompacto(leido.libro) });
}
