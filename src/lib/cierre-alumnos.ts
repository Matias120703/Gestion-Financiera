import { deClases, mapearProductos } from './reportes/productos';

/**
 * EL CIERRE DEL DÍA DEL PROFE QUE VENDE PRODUCTOS (128).
 *
 * Matías, 07/10: «cuando el profesor activa venta de productos, tiene que
 * tener un cierre del día también».
 *
 * La base ya calculaba bien su cierre: lo cobrado de las clases y lo vendido
 * del catálogo son todos movimientos de venta, y `cierre_del_dia` llama al
 * mismo `resumen_financiero` que usa «Te queda» de su panel. Acá vive lo
 * único que el cierre del profe lee distinto que el del comercio, una sola
 * vez, para que la pantalla y las pruebas lean lo mismo:
 *
 *   · «Salió» es TODO lo que salió ese día, como el «Gastado» de su panel,
 *     y no los gastos con la regla de la 106 a secas;
 *   · «Entró» se abre en lo de sus clases y lo de sus productos, con los
 *     números de `panel_profe` de ese mismo día.
 *
 * Puro: sin Next ni Supabase. Entra en las pruebas de cálculo.
 */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Lo que este archivo lee del `resumen` del cierre (`resumen_financiero`). */
export interface ResumenDelCierre {
  ventas: unknown;
  otros_ingresos: unknown;
  gastos: unknown;
  costo_mercaderia?: unknown;
  compras_mercaderia?: unknown;
  mercaderia_aparte?: unknown;
  pagado_a_profesionales?: unknown;
}

/**
 * La compra de mercadería que el resumen dejó APARTE (106): el día que vende
 * con costo, esa compra no está en `gastos`, porque lo vendido ya descuenta
 * lo que costó. Cero si no hubo, o si ese día sí restó como gasto.
 */
export function mercaderiaAparteDelCierre(r: ResumenDelCierre): number {
  return r.mercaderia_aparte ? num(r.compras_mercaderia) : 0;
}

/**
 * «SALIÓ», PARA EL PROFE: lo mismo que el «Gastado» de su panel.
 *
 * El comercio muestra `gastos` tal cual. El panel del profe muestra todo lo
 * que salió (`panel_profe.gastado`) y aclara con una nota que la mercadería
 * no se resta entera; si el cierre mostrara otro número, el mismo día
 * tendría dos «gastos» distintos en dos pantallas. Se reconstruye sumando
 * lo que la 106 sacó de `gastos`: la mercadería aparte y lo pagado a
 * comisión (un profe trabaja solo: es cero, pero la cuenta queda entera).
 */
export function salioDelCierre(r: ResumenDelCierre): number {
  return num(r.gastos) + mercaderiaAparteDelCierre(r) + num(r.pagado_a_profesionales);
}

/** ¿La ganancia neta ya descontó el costo de algo vendido? Cambia su detalle. */
export function conCostoDeLoVendido(r: ResumenDelCierre): boolean {
  return num(r.costo_mercaderia) > 0;
}

export interface DesgloseDelCierre {
  /** Lo cobrado de sus clases ese día (paquetes, inscripciones, sueltas). */
  clases: number;
  /** Lo vendido del catálogo ese día. */
  productos: number;
  /** Lo que dejaron esos productos. Null para quien no ve costos. */
  gananciaProductos: number | null;
  /** Lo que entró y no es ni clase ni producto: un aporte, un préstamo. */
  otros: number;
  /** Las clases que dio ese día. */
  clasesDadas: number;
}

/**
 * EL DESGLOSE DE «ENTRÓ», con el `panel_profe` de ese mismo día.
 *
 * Null si no hay con qué armarlo —la lectura falló— o si el panel es de
 * otra fecha que el cierre (el reloj del servidor y el de la cuenta pueden
 * caer en días distintos cerca de la medianoche): el cierre sale igual, con
 * sus tres números, sin desglose. Mejor menos detalle que un detalle de
 * otro día.
 */
export function desgloseDelCierre(
  panel: any,
  fechaDelPanel: string,
  fechaDelCierre: string,
): DesgloseDelCierre | null {
  if (!panel || typeof panel !== 'object' || fechaDelPanel !== fechaDelCierre) return null;
  const productos = mapearProductos(panel.productos);
  const cobrado = num(panel.cobrado);
  const clases = deClases(panel.cobrado_clases, cobrado, productos);
  const otros = cobrado - clases - productos.vendido;
  return {
    clases,
    productos: productos.vendido,
    gananciaProductos: productos.ganancia,
    // Menos de medio guaraní es el resto de una división, no plata.
    otros: otros > 0.5 ? otros : 0,
    clasesDadas: num(panel.clases_periodo),
  };
}
