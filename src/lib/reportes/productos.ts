import type { ProductosDelPeriodo } from '../tipos';

/**
 * LO VENDIDO DEL CATÁLOGO, PARA EL PROFE Y EL TRAINER (121).
 *
 * «¿Qué pasa si un profesor de tenis vende raquetas, pelotas…? ¿Cómo va a
 * saber su ganancia de eso?». La base lo separa (`productos_del_periodo`,
 * dentro de `panel_profe` y `reporte_alumnos`); acá vive cómo se entiende
 * esa respuesta, una sola vez, para que el panel, el reporte y el Excel lean
 * lo mismo.
 *
 * Puro: sin Next ni Supabase. Entra en las pruebas de cálculo por el comodín
 * de src/lib/reportes.
 */

/** Sin productos: la cuenta que no vende nada, o la base sin la 121. */
export const SIN_PRODUCTOS: ProductosDelPeriodo = {
  vendido: 0, unidades: 0, operaciones: 0, costo: 0, ganancia: 0, margen: null, lista: [],
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** Null sigue siendo null: «no lo podés ver» no es un cero. */
const quizas = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

/**
 * La respuesta de la base en números. Si no llegó (la base sin la 121), es
 * `SIN_PRODUCTOS`: el panel y el reporte salen como antes.
 */
export function mapearProductos(j: any): ProductosDelPeriodo {
  if (!j || typeof j !== 'object') return SIN_PRODUCTOS;
  return {
    vendido: num(j.vendido),
    unidades: num(j.unidades),
    operaciones: num(j.operaciones),
    costo: quizas(j.costo),
    ganancia: quizas(j.ganancia),
    margen: quizas(j.margen),
    lista: (Array.isArray(j.lista) ? j.lista : []).map((f: any) => ({
      producto_id: f?.producto_id ?? null,
      nombre: String(f?.nombre ?? ''),
      unidades: num(f?.unidades),
      vendido: num(f?.vendido),
      costo: quizas(f?.costo),
      ganancia: quizas(f?.ganancia),
    })),
  };
}

/**
 * Lo cobrado de las clases. Si la base no lo mandó (sin la 121), se calcula
 * como todo lo cobrado menos lo vendido del catálogo, que es lo mismo que
 * hace la base.
 */
export function deClases(cobradoClases: unknown, cobrado: number, productos: ProductosDelPeriodo): number {
  if (cobradoClases !== null && cobradoClases !== undefined && Number.isFinite(Number(cobradoClases))) {
    return Number(cobradoClases);
  }
  return cobrado - productos.vendido;
}

/**
 * ¿Se muestra lo de los productos? Con el interruptor prendido siempre (aunque
 * todavía no haya vendido nada: es donde se le dice cómo empezar), y con él
 * apagado solo si en el período hubo ventas del catálogo: apagarlo no borra
 * lo que ya vendió, y esconderlo haría que «Cobrado» no cierre.
 */
export function mostrarProductos(vendeProductos: boolean, productos: ProductosDelPeriodo): boolean {
  return vendeProductos || productos.vendido > 0 || productos.operaciones > 0;
}

/** ¿Se puede decir cuánto ganó? Solo con el costo a la vista (administración). */
export function conGanancia(productos: ProductosDelPeriodo): productos is ProductosDelPeriodo & { costo: number; ganancia: number } {
  return productos.costo !== null && productos.ganancia !== null;
}
