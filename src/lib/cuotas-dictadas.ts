import type { CuotasDictadas, Plan } from './tipos';
import { armarPlan, esFecha, sumarPeriodo } from './cuotas';

/**
 * DE LO DICTADO AL PLAN QUE SE VE EN «¿CUÁNDO TE PAGA?» (127)
 *
 * Vive aparte de `captura.ts` a propósito: esto lo usan las pantallas de
 * revisión, que corren en el navegador, y `captura.ts` lleva el prompt
 * entero. Importar un valor de ahí lo mandaría al teléfono de cada persona.
 *
 * Sin nada dictado, null: la revisión arranca en «Sin fecha». Si dijo
 * cuántas pero no cuándo, la primera va a un período de hoy (lo mismo que
 * propone la pantalla a mano). Sin monto todavía tampoco hay plan: no hay
 * qué repartir, y la persona lo arma cuando escriba el número.
 */
export function planDeLoDictado(
  cuotas: CuotasDictadas | null | undefined, total: number, hoy: string, decimales = 0,
): Plan | null {
  if (!cuotas || !(total > 0) || !esFecha(hoy)) return null;
  const primera = cuotas.primera && esFecha(cuotas.primera) ? cuotas.primera : sumarPeriodo(hoy, cuotas.cada, 1);
  return armarPlan({ total, cuotas: cuotas.cantidad, cada: cuotas.cada, primera, decimales });
}
