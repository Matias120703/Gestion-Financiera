/**
 * LA VITRINA DE LA PORTADA, SIN PANTALLA (24/09).
 *
 * Todo lo que decide `ElegiTuRubro` y se puede probar sin un navegador: qué
 * rubros hay en la fila de chips, qué planes se muestran para cada uno, con
 * qué precio, a dónde lleva el botón de la prueba y cómo se mueve el teclado
 * entre los chips.
 *
 * NO IMPORTA NADA. Ni React, ni Next, ni `@/lib/rubros`: la prueba
 * (`pruebas/vitrina.test.js`) lo compila suelto y lo corre con node. Por eso
 * los planes de cada rubro NO se leen de acá adentro: llegan por las props
 * (`planesPorRubro`, que la página arma con `fichaDe(rubro).planes`), y lo de
 * abajo es solo el respaldo si esa lista no llega. La prueba compara las dos
 * cosas contra `fichaDe()` para que no se separen.
 */

/** Los siete chips, en el orden en que se muestran. */
export type ClaveVitrina = 'comercio' | 'servicios' | 'clases' | 'entrenamiento' | 'agricultura' | 'ganaderia' | 'personal';

/** Los planes pagos: los mismos de `PlanDeRubro` en rubros.ts. */
export type PlanVitrina = 'basico' | 'pro' | 'negocio';

/** Una fila de `lista_precios`, ya con el importe como número. */
export interface PrecioVitrina {
  plan: PlanVitrina;
  periodo: 'mensual' | 'anual';
  importe: number;
  tipo: 'emprendedor' | 'personal';
}

export const CLAVES_VITRINA: readonly ClaveVitrina[] = [
  'comercio', 'servicios', 'clases', 'entrenamiento', 'agricultura', 'ganaderia', 'personal',
];

export function esClaveVitrina(v: unknown): v is ClaveVitrina {
  return typeof v === 'string' && (CLAVES_VITRINA as readonly string[]).includes(v);
}

/**
 * Con qué rubro arranca la vitrina: comercio en español y el campo en
 * portugués. Los brasileños de Paraguay son sobre todo productores: que
 * entren y vean su lavoura sin tocar nada.
 */
export function claveInicial(idioma: string): ClaveVitrina {
  return idioma === 'pt' ? 'agricultura' : 'comercio';
}

/** La cuenta personal no es un rubro: es otro tipo de cuenta. */
export function tipoDeCuenta(clave: ClaveVitrina): 'emprendedor' | 'personal' {
  return clave === 'personal' ? 'personal' : 'emprendedor';
}

/** El rubro que se guarda al crear la cuenta (el de `LISTA_RUBROS`); null en la personal. */
export function rubroDeClave(clave: ClaveVitrina): string | null {
  return clave === 'personal' ? null : clave;
}

/**
 * A dónde lleva «Probar N días gratis»: al alta, con el tipo de cuenta y el
 * rubro ya elegidos. `/crear` acepta `?rubro=` si es uno de la lista.
 */
export function enlaceDePrueba(clave: ClaveVitrina): string {
  const rubro = rubroDeClave(clave);
  return rubro ? `/crear?para=negocio&rubro=${rubro}` : '/crear?para=personal';
}

/**
 * Respaldo de `planes_de_rubro()` (102) por si la página no manda la lista.
 * La prueba lo compara con `fichaDe(rubro).planes`: si se separan, falla.
 */
export const PLANES_POR_DEFECTO: Record<ClaveVitrina, readonly PlanVitrina[]> = {
  comercio: ['basico', 'pro', 'negocio'],
  servicios: ['basico', 'pro', 'negocio'],
  clases: ['basico'],
  entrenamiento: ['basico'],
  agricultura: ['basico', 'pro'],
  ganaderia: ['basico', 'pro'],
  personal: ['pro'],
};

/**
 * Arma `planesPorRubro` desde las fichas, para la página:
 * `planesPorRubroDe(fichaDe)`. Recibe la función en vez de importarla para
 * que este archivo siga sin dependencias.
 */
export function planesPorRubroDe(
  fichaDe: (rubro: string | null, tipo: 'emprendedor' | 'personal') => { planes: readonly PlanVitrina[] },
): Record<ClaveVitrina, PlanVitrina[]> {
  const salida = {} as Record<ClaveVitrina, PlanVitrina[]>;
  for (const clave of CLAVES_VITRINA) {
    salida[clave] = [...fichaDe(rubroDeClave(clave), tipoDeCuenta(clave)).planes];
  }
  return salida;
}

/**
 * En qué plan arranca la prueba: Pro si el rubro lo ofrece; si no, el más
 * alto de su lista. Espejo de `plan_de_prueba()` (102).
 */
export function planDePrueba(planes: readonly PlanVitrina[]): PlanVitrina | null {
  if (planes.includes('pro')) return 'pro';
  return planes.length > 0 ? planes[planes.length - 1] : null;
}

/**
 * Cuántos meses se regalan pagando el año. Espejo de `mesesDeRegalo()` de
 * precios.ts (que no se puede importar acá: arrastra Supabase). Se calcula
 * para que el cartel siga diciendo la verdad si cambian los precios.
 */
export function mesesDeRegalo(mensual: number | null, anual: number | null): number {
  if (mensual === null || anual === null || !(mensual > 0)) return 0;
  return Math.max(0, Math.round(12 - anual / mensual));
}

/** Lo que necesita la tarjeta de un plan, ya decidido. */
export interface TarjetaPlan {
  plan: PlanVitrina;
  /** Guaraníes por mes; null si la lectura de precios falló. */
  mensual: number | null;
  anual: number | null;
  /** La referencia «≈ US$»: solo si hay precio en guaraníes al lado. */
  referenciaUSD: number | null;
  mesesDeRegalo: number;
  /** Premium es precio «desde»: se suma por vendedor. */
  desde: boolean;
  /** Gs. por vendedor extra, solo en Premium. */
  porVendedor: number | null;
  /** El plan con el que arranca la prueba de este rubro. */
  conEsteProbas: boolean;
}

function buscar(lista: readonly PrecioVitrina[], tipo: string, plan: string, periodo: string): number | null {
  const fila = lista.find((x) => x.tipo === tipo && x.plan === plan && x.periodo === periodo);
  const n = fila ? Number(fila.importe) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * LOS PLANES QUE VE ESTE RUBRO, Y SOLO ESOS.
 *
 * Antes la portada le mostraba Básico, Pro y Premium a cualquiera: un profe
 * podía enamorarse de Premium, probar y al pagar descubrir que ese plan no
 * existe para él. Ahora salen de `planesPorRubro` (la ficha del rubro), en su
 * orden, de menor a mayor.
 */
export function planesDeLaVitrina(
  clave: ClaveVitrina,
  datos: {
    planesPorRubro?: Partial<Record<ClaveVitrina, readonly PlanVitrina[]>> | null;
    preciosPYG: readonly PrecioVitrina[];
    referenciaUSD: readonly PrecioVitrina[];
    precioPorVendedor: number | null;
  },
): TarjetaPlan[] {
  const recibidos = datos.planesPorRubro?.[clave];
  const planes = recibidos && recibidos.length > 0 ? recibidos : PLANES_POR_DEFECTO[clave];
  const tipo = tipoDeCuenta(clave);
  const prueba = planDePrueba(planes);
  return planes.map((plan) => {
    const mensual = buscar(datos.preciosPYG, tipo, plan, 'mensual');
    const anual = buscar(datos.preciosPYG, tipo, plan, 'anual');
    const usd = buscar(datos.referenciaUSD, tipo, plan, 'mensual');
    const esPremium = plan === 'negocio';
    return {
      plan,
      mensual,
      anual,
      referenciaUSD: mensual !== null ? usd : null,
      mesesDeRegalo: mesesDeRegalo(mensual, anual),
      desde: esPremium,
      porVendedor: esPremium && datos.precioPorVendedor !== null && datos.precioPorVendedor > 0
        ? datos.precioPorVendedor : null,
      conEsteProbas: plan === prueba,
    };
  });
}

/** Días de prueba de este chip: los del negocio o los de la cuenta personal. */
export function diasDePrueba(clave: ClaveVitrina, dias: { negocio: number; personal: number }): number {
  return clave === 'personal' ? dias.personal : dias.negocio;
}

/** Días seguidos de carga que dan el descuento del primer mes (078). */
export function rachaDelDescuento(clave: ClaveVitrina, promo: { negocio: number; personal: number }): number {
  return clave === 'personal' ? promo.personal : promo.negocio;
}

/**
 * El teclado en la fila de chips, como un grupo de radio: las flechas mueven
 * y eligen (dan la vuelta), Inicio y Fin van a las puntas. Cualquier otra
 * tecla devuelve null y no se toca nada.
 */
export function claveConTecla(actual: ClaveVitrina, tecla: string): ClaveVitrina | null {
  const i = CLAVES_VITRINA.indexOf(actual);
  const n = CLAVES_VITRINA.length;
  switch (tecla) {
    case 'ArrowRight':
    case 'ArrowDown':
      return CLAVES_VITRINA[(i + 1) % n];
    case 'ArrowLeft':
    case 'ArrowUp':
      return CLAVES_VITRINA[(i - 1 + n) % n];
    case 'Home':
      return CLAVES_VITRINA[0];
    case 'End':
      return CLAVES_VITRINA[n - 1];
    default:
      return null;
  }
}
