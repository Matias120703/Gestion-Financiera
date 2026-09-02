import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { ResumenPersonal, CategoriaDeCuenta } from './tipos';

/**
 * Lecturas de la cuenta personal.
 *
 * Igual que el resto: si falla, lanza. Mostrar «te quedan 0» porque no se
 * pudo leer sería peor que no mostrar nada — alguien podría dejar de gastar
 * creyendo que se quedó sin plata, o gastar creyendo que le sobra.
 */
export async function traerResumenPersonal(empresaId: string): Promise<ResumenPersonal> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('resumen_personal', { p_empresa: empresaId });
  return exigir(respuesta, 'resumen personal') as ResumenPersonal;
}

/**
 * Las categorías que se le ofrecen a una persona para armar su plan.
 *
 * Salen de la base, de la MISMA función que usa la captura para clasificar, y
 * ya vienen con las categorías propias de la cuenta mezcladas. Si acá se
 * escribiera una lista a mano, el plan y lo que la IA clasifica se separarían
 * el día que alguien cree una categoría suya — y el gasto caería en un
 * casillero que el plan no conoce.
 */
export async function traerCategoriasPersonales(
  empresaId: string,
  clase: 'gasto' | 'ingreso' = 'gasto',
): Promise<CategoriaDeCuenta[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('categorias_de_empresa', {
    p_empresa: empresaId,
    p_clase: clase,
  });
  const lista = exigir(respuesta, 'categorías') as any[];
  return Array.isArray(lista)
    ? lista.map((c) => ({
        nombre: String(c?.nombre ?? c),
        pistas: c?.pistas ? String(c.pistas) : '',
        propia: c?.propia === true,
      }))
    : [];
}
