import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { PeriodoCobro, Precio } from './tipos';

/**
 * Precios de la suscripción.
 *
 * LA MONEDA DEL PRECIO NO ES LA MONEDA DEL NEGOCIO. Son dos cosas distintas
 * que antes se confundían: alguien puede llevar su negocio en dólares y
 * pagarnos en guaraníes. `empresas.moneda` es en qué carga sus ventas; esto
 * es en qué nos paga.
 *
 * Los importes viven en la tabla `precios`, no acá: cambiar un precio no
 * puede requerir un despliegue.
 */

export const PLANES_PAGOS = ['basico', 'pro', 'negocio'] as const;
export type PlanPago = (typeof PLANES_PAGOS)[number];

/**
 * LA SUSCRIPCIÓN SE COBRA SIEMPRE EN GUARANÍES (decisión de Matías, 23/09).
 *
 * Bancard le permite una sola moneda por comercio, y eligió guaraníes. Hasta
 * acá se podía elegir guaraníes o dólares en la pantalla de planes y en la
 * portada (`?moneda=USD`); ese selector se sacó. Quien tiene una tarjeta de
 * otro país paga en guaraníes y su banco hace la conversión.
 *
 * Las filas en dólares de la tabla `precios` NO se borran: son la
 * referencia chica («≈ US$ 19») que va al lado del precio en guaraníes para
 * quien piensa en dólares —un sojero, un brasileño—. Se muestran, no se
 * cobran. Los precios no cambiaron.
 *
 * La comisión del socio (102-104) se calcula sobre la lista en la moneda del
 * cobro, que por esto es guaraníes salvo que la suscripción diga otra.
 */
export const MONEDA_DE_LA_SUSCRIPCION = 'PYG' as const;

/** La moneda de la referencia chica al lado del precio. No se cobra en ella. */
export const MONEDA_DE_REFERENCIA = 'USD' as const;

/**
 * En qué moneda se cobra: siempre guaraníes.
 *
 * Antes dependía del idioma y de un `?moneda=` elegido a mano. Se deja la
 * función —y no una constante suelta en cada pantalla— para que el día que
 * haya una segunda pasarela con otra moneda el cambio sea en un solo lugar.
 */
export function monedaDeCobro(): typeof MONEDA_DE_LA_SUSCRIPCION {
  return MONEDA_DE_LA_SUSCRIPCION;
}

/**
 * Las monedas que tienen fila en la tabla `precios`.
 *
 * YA NO SON «las monedas en las que se puede cobrar»: se cobra solo en
 * guaraníes (ver arriba), y ninguna pantalla ofrece elegir. Se deja porque
 * nombra las dos monedas que la tabla conoce —PYG la que se cobra, USD la
 * de referencia—, por si algo más lo necesita. No lo uses para armar un
 * selector de moneda de cobro.
 */
export const MONEDAS_DE_COBRO = [MONEDA_DE_LA_SUSCRIPCION, MONEDA_DE_REFERENCIA] as const;

/**
 * Los precios de UN público.
 *
 * El tipo importa: a alguien que lleva sus finanzas personales no se le
 * ofrece el plan de un local con vendedores, y no paga lo mismo por el
 * mismo plan. Ver migración 017.
 */
export async function traerPrecios(moneda: string, tipo?: string): Promise<Precio[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('lista_precios', {
    p_moneda: moneda,
    p_tipo: tipo ?? null,
  });
  const lista = exigir(respuesta, 'precios') as Precio[];
  return Array.isArray(lista) ? lista : [];
}

/**
 * Los precios en dólares, SOLO PARA LA REFERENCIA CHICA.
 *
 * A diferencia de `traerPrecios`, si la lectura falla devuelve una lista
 * vacía y no rompe la pantalla: sin la referencia, el precio en guaraníes se
 * sigue viendo y se sigue pudiendo pagar. Perder una ayuda no puede costar
 * la pantalla donde se cobra.
 */
export async function traerReferencia(tipo?: string): Promise<Precio[]> {
  try {
    const { data, error } = await clienteServidor().rpc('lista_precios', {
      p_moneda: MONEDA_DE_REFERENCIA,
      p_tipo: tipo ?? null,
    });
    if (error || !Array.isArray(data)) return [];
    return data as Precio[];
  } catch {
    return [];
  }
}

export function precioDe(
  precios: Precio[], plan: PlanPago, periodo: PeriodoCobro,
): Precio | null {
  return precios.find((p) => p.plan === plan && p.periodo === periodo) ?? null;
}

/**
 * Cuánto se ahorra pagando por año, en meses equivalentes.
 *
 * Se calcula y no se escribe a mano: si mañana cambian los precios en la
 * tabla, el cartel de "dos meses gratis" tiene que seguir diciendo la verdad
 * o deja de ser una oferta y pasa a ser una mentira.
 */
export function mesesDeRegalo(mensual: Precio | null, anual: Precio | null): number {
  if (!mensual || !anual || mensual.importe <= 0) return 0;
  const equivalente = anual.importe / mensual.importe;
  return Math.max(0, Math.round(12 - equivalente));
}

/** Qué incluye cada plan, para la tabla comparativa. Se arma con los límites reales. */
export interface FilaDePlan {
  plan: 'gratis' | PlanPago;
  capturas: number;
  miembros: number;
  adjuntos: boolean;
  excel: boolean;
}

/**
 * Espejo de `limites_plan()` de la migración 009.
 *
 * IMPORTANTE: esto es solo para pintar la tabla de precios. Quien decide qué
 * se puede hacer es PostgreSQL. Si alguien edita este archivo no gana ni una
 * captura: la función `consumir_credito_ia()` la rechaza igual.
 */
export const LIMITES_VISIBLES: Record<'gratis' | PlanPago, FilaDePlan> = {
  gratis:  { plan: 'gratis',  capturas: 20,   miembros: 1,  adjuntos: false, excel: false },
  // Un negocio de una sola persona: todo lo demás igual que Pro (077).
  basico:  { plan: 'basico',  capturas: 300,  miembros: 1,  adjuntos: true,  excel: true },
  pro:     { plan: 'pro',     capturas: 600,  miembros: 3,  adjuntos: true,  excel: true },
  negocio: { plan: 'negocio', capturas: 3000, miembros: 15, adjuntos: true,  excel: true },
};

/**
 * Los días de prueba viven en `constantes.ts` y no acá.
 *
 * Este archivo importa el cliente de Supabase del servidor, así que todo lo
 * que exporte queda fuera del alcance de un componente de navegador. La
 * pantalla de registro es uno, y al importarlo desde acá el build se cayó
 * entero. Se re-exporta para que quien ya lo pedía a este módulo siga
 * andando.
 */
export { DIAS_DE_PRUEBA, textoPrueba } from './constantes';
