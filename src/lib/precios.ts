import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { PeriodoCobro, Precio } from './tipos';
import { MONEDA_DE_COBRO, type Idioma } from '@/i18n/idiomas';

/**
 * Precios de la suscripción.
 *
 * LA MONEDA DEL PRECIO NO ES LA MONEDA DEL NEGOCIO. Son dos cosas distintas
 * que antes se confundían: alguien puede llevar su negocio en guaraníes y
 * pagarnos en dólares, o al revés. `empresas.moneda` es en qué carga sus
 * ventas; esto es en qué nos paga.
 *
 * Los importes viven en la tabla `precios`, no acá: cambiar un precio no
 * puede requerir un despliegue.
 */

export const PLANES_PAGOS = ['pro', 'negocio'] as const;
export type PlanPago = (typeof PLANES_PAGOS)[number];

/** Monedas en las que sabemos cobrar hoy. */
export const MONEDAS_DE_COBRO = ['PYG', 'USD'] as const;

export function monedaDeCobro(idioma: Idioma, elegida?: string | null): string {
  if (elegida && (MONEDAS_DE_COBRO as readonly string[]).includes(elegida)) return elegida;
  return MONEDA_DE_COBRO[idioma] ?? 'USD';
}

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
  pro:     { plan: 'pro',     capturas: 600,  miembros: 3,  adjuntos: true,  excel: true },
  negocio: { plan: 'negocio', capturas: 3000, miembros: 15, adjuntos: true,  excel: true },
};
