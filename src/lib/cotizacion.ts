/**
 * ============================================================
 * LA COTIZACIÓN, DEL LADO DE LA PANTALLA
 * ============================================================
 *
 * Lo que se cobra lo dice la base, en un solo lugar: `precio_de_la_cuenta`
 * (migración 124), que la pantalla pide con `cotizar_plan`. Este archivo es
 * su ESPEJO, y existe para una sola cosa: que al tocar − y + en «¿Cuántas
 * personas van a usar la cuenta?» el precio cambie al instante, sin ir y
 * volver al servidor por cada toque.
 *
 * `recalcular` no sabe ningún precio: usa las piezas que devolvió la base
 * (la lista, el precio por persona, los meses que se cobran, el porcentaje
 * del descuento). Si mañana cambia un precio, cambia solo.
 *
 * LO QUE SE COBRA NO SALE DE ACÁ. Al iniciar el pago el servidor vuelve a
 * cotizar en la base y congela ese importe en la operación; lo de la pantalla
 * es para mostrar. `pruebas/bancard-base.test.js` compara este espejo con la
 * base para las 12 cantidades de personas, los dos períodos y los tres casos
 * de descuento: si se separan, falla.
 *
 * Sin dependencias a propósito: lo compilan las pruebas con tsc suelto y lo
 * puede importar un componente de navegador.
 */

/** La respuesta de `cotizar_plan` / `precio_de_la_cuenta` (124). */
export interface Cotizacion {
  plan: string;
  periodo: 'mensual' | 'anual';
  tipo_cuenta: string;
  moneda: 'PYG';
  /** El precio de lista del plan en ese período, sin personas extra. */
  lista: number;
  /** El de un mes: sobre él se calcula el descuento. */
  lista_mensual: number;
  /** 1 al pagar el mes, 11 al pagar el año. */
  meses_cobrados: number;
  /** 1 o 12. */
  meses_de_servicio: number;
  /** Solo el Premium de un negocio; si no, null. */
  personas: number | null;
  personas_incluidas: number | null;
  personas_extra: number;
  personas_min: number | null;
  personas_max: number | null;
  /** Cuántas personas tiene hoy el equipo. */
  miembros: number;
  /** Lo que cuesta cada persona de más, por mes. */
  precio_por_persona: number | null;
  /** personas_extra × precio_por_persona × meses_cobrados. */
  extras: number;
  subtotal: number;
  /** 'prueba' = el del primer pago; 'constancia' = el de las renovaciones. */
  descuento_fase: 'prueba' | 'constancia' | null;
  descuento_porcentaje: number;
  /** Sobre qué se aplica el porcentaje: un mes de lista con sus personas. */
  descuento_base: number;
  descuento: number;
  /** Lo que se cobra, en guaraníes enteros. */
  total: number;
  /** «≈ US$»: se muestra, no se cobra. Null si falta un precio en dólares. */
  referencia_usd: number | null;
  usd_lista: number | null;
  usd_lista_mensual: number | null;
  usd_por_persona: number | null;
  primer_pago: boolean;
  /** Hasta cuándo queda activo el plan si se paga ahora. */
  vence_hasta: string;
}

/**
 * La respuesta de `cotizar_cambio` (130): SUBIR de plan con días pagos.
 *
 * Se paga hoy la diferencia de lista entre los dos planes por los días que
 * faltan, sin descuento, y la fecha de vencimiento no cambia. Acá no hay
 * espejo: cada cantidad de personas se le pide a la base (son pocos toques,
 * y la cuenta de los días no se repite en la pantalla). Como siempre, lo que
 * se cobra lo vuelve a calcular el servidor al crear la operación.
 */
export interface CotizacionDeCambio {
  /** El plan que la cuenta tiene hoy, y al que sube. */
  plan_antes: string;
  plan: string;
  /** El período de la CUENTA: el cambio se calcula sobre el que ya tiene. */
  periodo: 'mensual' | 'anual';
  /** Solo si sube al Premium; si no, null. */
  personas: number | null;
  personas_min: number | null;
  personas_max: number | null;
  personas_incluidas: number | null;
  precio_por_persona: number | null;
  miembros: number;
  /** De lista, sin descuento: lo que cuesta un período de cada plan. */
  precio_antes: number;
  precio: number;
  diferencia: number;
  /** Los que faltan para el vencimiento; de esos, los de la prueba no se cobran. */
  dias_restantes: number;
  dias_gratis: number;
  dias_pagos: number;
  /** Los que entran en la cuenta (nunca más que un período entero recién pagado). */
  dias_cobrados: number;
  /** 30 o 365. */
  dias_del_periodo: number;
  /** Lo que se paga hoy, en guaraníes enteros. */
  importe: number;
  total: number;
  moneda: 'PYG';
  /** La fecha de vencimiento, que NO cambia. */
  vence_hasta: string;
  /** Lo que cuesta el plan nuevo por período: de lista, y con el descuento que la cuenta tiene hoy. */
  renovacion: number;
  renovacion_hoy: number;
  descuento_fase: 'prueba' | 'constancia' | null;
  descuento_porcentaje: number;
}

/** El redondeo de `redondeo_de_cobro` (124): al guaraní. */
function alGuarani(n: number): number {
  return Math.round(n);
}

/** Dólares a centavos enteros, para no arrastrar decimales de coma flotante. */
function centavos(n: number): number {
  return Math.round(n * 100);
}

/**
 * La misma cotización con otra cantidad de personas. Si el plan no lleva
 * cantidad de personas (todo lo que no es el Premium de un negocio) la
 * devuelve igual. La cantidad se acomoda al rango permitido.
 */
export function recalcular(base: Cotizacion, personas: number): Cotizacion {
  if (base.personas_incluidas === null || base.personas_min === null || base.personas_max === null) {
    return base;
  }

  const pedidas = Number.isFinite(personas) ? Math.trunc(personas) : base.personas_min;
  const cantidad = Math.min(base.personas_max, Math.max(base.personas_min, pedidas));
  const extra = Math.max(0, cantidad - base.personas_incluidas);
  const porPersona = base.precio_por_persona ?? 0;

  const extras = alGuarani(extra * porPersona * base.meses_cobrados);
  const subtotal = base.lista + extras;

  // LAS DOS REGLAS DEL DESCUENTO, igual que en la base: sobre UN mes (también
  // al pagar el año) y con las personas extra adentro.
  const descuentoBase = base.lista_mensual + extra * porPersona;
  const pct = base.descuento_fase === null ? 0 : base.descuento_porcentaje;
  const descuento = base.descuento_fase === null
    ? 0
    : Math.min(alGuarani((descuentoBase * pct) / 100), subtotal);

  let referencia: number | null = null;
  if (base.usd_lista !== null && base.usd_lista_mensual !== null
      && (extra === 0 || base.usd_por_persona !== null)) {
    const porPersonaUsd = centavos(base.usd_por_persona ?? 0);
    const bruto = centavos(base.usd_lista) + extra * porPersonaUsd * base.meses_cobrados;
    const rebaja = Math.round(((centavos(base.usd_lista_mensual) + extra * porPersonaUsd) * pct) / 100);
    referencia = (bruto - rebaja) / 100;
  }

  return {
    ...base,
    personas: cantidad,
    personas_extra: extra,
    extras,
    subtotal,
    descuento_base: descuentoBase,
    descuento,
    total: subtotal - descuento,
    referencia_usd: referencia,
  };
}
