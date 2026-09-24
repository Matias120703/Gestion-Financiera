import { clienteServidor } from '@/lib/supabase/servidor';

/**
 * EL DÍA DE COBRO DE UNA CUENTA PERSONAL, PARA EL RANGO DE LOS REPORTES.
 *
 * Solo servidor. Lo usan la pantalla de Reportes (los botones «Este ciclo»
 * y «Ciclo pasado») y la ruta del Excel (contra qué ciclo compara), así los
 * dos miden igual. No vive en src/lib/reportes porque esa carpeta se compila
 * suelta para las pruebas, sin Supabase.
 *
 * Misma regla que la base (`ciclo_personal`, 024): manda el ingreso fijo
 * principal, si no el más grande. Null si cobra el 1 o no cargó ingresos
 * fijos: su ciclo es el mes calendario, y para eso ya están «Este mes» y
 * «Mes pasado».
 *
 * Si la lectura falla no se cae nada: se mide por mes, como hasta hoy. Es
 * la forma de elegir el rango, no un número del reporte.
 */
export async function diaDeCobro(empresaId: string): Promise<number | null> {
  try {
    const { data, error } = await clienteServidor().rpc('ciclo_personal', { p_empresa: empresaId });
    if (error) return null;
    const fila = Array.isArray(data) ? data[0] : data;
    const dia = Number(fila?.dia_cobro);
    return Number.isInteger(dia) && dia > 1 && dia <= 31 ? dia : null;
  } catch {
    return null;
  }
}
