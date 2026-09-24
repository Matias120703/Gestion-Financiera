import { esCategoriaMercaderia, esValido, type FilaCategoria, type FilaProducto, type Resumen } from '../calculos';
import type { Movimiento, Producto, ResumenFiado, VentasDeVendedor } from '../tipos';

/**
 * LAS CUENTAS DEL REPORTE DEL COMERCIO QUE COMPARTEN LA PANTALLA Y EL EXCEL
 * (23/09, contrato 2.1).
 *
 * Qué reponer, qué está quieto, el inventario valuado, qué productos se
 * vendieron sin costo y la lista de gastos sin la mercadería. Las usan
 * `ReporteComercio.tsx` y `excel-comercio.ts`: la pantalla y el archivo no
 * pueden decir dos cosas distintas porque es la misma función. Los números de
 * plata del período vienen de la base; acá no se recalcula ninguno.
 *
 * Va aparte del libro para que la pantalla no cargue exceljs. Función pura:
 * se compila suelta y se prueba en pruebas/excel-comercio.test.js.
 */

/**
 * «A reponer»: lo que lleva stock y está en el mínimo o por debajo. La misma
 * regla que el panel (`panel/page.tsx`, `bajoStock`), así los dos avisan de
 * los mismos productos. Primero lo que más falta.
 */
export function aReponer(productos: Producto[]): Producto[] {
  return productos
    .filter((p) => p.controla_stock && Number(p.stock) <= Number(p.stock_minimo))
    .sort((a, b) => (Number(a.stock) - Number(a.stock_minimo)) - (Number(b.stock) - Number(b.stock_minimo))
      || a.nombre.localeCompare(b.nombre));
}

/**
 * «Quieto en el estante»: tiene stock de verdad (`controla_stock` y más de
 * cero) y no se vendió en el período. Un servicio no se queda en el estante
 * y un producto sin stock no tiene plata parada.
 */
export function quietosEnElEstante(productos: Producto[], ranking: FilaProducto[]): Producto[] {
  const vendidos = new Set(ranking.map((p) => p.producto_id).filter(Boolean) as string[]);
  return productos.filter((p) => p.controla_stock && Number(p.stock) > 0 && !vendidos.has(p.id));
}

/** ¿Tiene costo cargado? Un costo en cero es «no lo cargó», no «me lo regalaron». */
export function conCosto(p: Producto): boolean {
  return p.costo !== null && p.costo !== undefined && Number(p.costo) > 0;
}

/**
 * Stock × costo de una lista de productos. Lo que no tiene costo no suma y
 * se cuenta aparte: sumarlo en cero haría parecer que vale menos de lo que
 * vale, sin avisar.
 */
export function valorAlCosto(productos: Producto[]): { total: number; sinCosto: number } {
  let total = 0;
  let sinCosto = 0;
  for (const p of productos) {
    if (conCosto(p)) total += Number(p.stock) * Number(p.costo);
    else sinCosto += 1;
  }
  return { total, sinCosto };
}

/** El inventario de HOY: lo que lleva stock y tiene más de cero, de mayor a menor valor. */
export function inventarioConStock(productos: Producto[]): Producto[] {
  const valor = (p: Producto) => (conCosto(p) ? Number(p.stock) * Number(p.costo) : -1);
  return productos
    .filter((p) => p.controla_stock && Number(p.stock) > 0)
    .sort((a, b) => valor(b) - valor(a) || a.nombre.localeCompare(b.nombre));
}

/**
 * Los productos del ranking que se vendieron sin costo: su margen sale del
 * 100 % y no es verdad (decisión 2). Un costo en null no cuenta: es que
 * quien mira no lo puede ver, no que falte.
 */
export function vendidosSinCosto(ranking: FilaProducto[]): FilaProducto[] {
  return ranking.filter((p) => p.costo !== null && p.costo === 0 && p.ingresos > 0);
}

/**
 * LOS GASTOS POR CATEGORÍA DEL COMERCIO (decisión 2).
 *
 * `gastos_por_categoria` trae la Mercadería siempre (106). Cuando en el
 * período hubo costo cargado (`mercaderiaAparte`), esa compra no es gasto:
 * sale de la lista y va aparte, y los porcentajes se recalculan sobre lo que
 * queda, así la lista suma lo mismo que «Gastos» arriba. Sin costo cargado,
 * la Mercadería es un gasto más y se queda en la lista.
 */
export function gastosDelComercio(categorias: FilaCategoria[], resumen: Pick<Resumen, 'mercaderiaAparte'>): {
  lista: FilaCategoria[];
  mercaderia: { monto: number; operaciones: number } | null;
} {
  const merc = categorias.filter((c) => esCategoriaMercaderia(c.nombre));
  const mercaderia = merc.length
    ? { monto: merc.reduce((s, c) => s + c.monto, 0), operaciones: merc.reduce((s, c) => s + c.operaciones, 0) }
    : null;
  if (!resumen.mercaderiaAparte) return { lista: categorias, mercaderia };
  const resto = categorias.filter((c) => !esCategoriaMercaderia(c.nombre));
  const total = resto.reduce((s, c) => s + c.monto, 0);
  return {
    lista: resto.map((c) => ({ ...c, participacion: total > 0 ? (c.monto / total) * 100 : 0 })),
    mercaderia,
  };
}

/**
 * CADA COMPRA DE MERCADERÍA DEL PERÍODO, de la más nueva a la más vieja.
 *
 * Con la decisión 2, un gasto que quedó en «Mercadería» sin serlo (la luz o el
 * alquiler cargados sin tocar la categoría) deja de restar de la ganancia
 * cuando hay costo cargado, y la ganancia sale inflada sin que nada lo avise.
 * Listar cada compra con su descripción, en la pantalla y en el Excel, deja
 * ver la que está mal puesta. Solo gastos válidos: lo anulado no suma arriba.
 */
export function comprasDeMercaderia(movimientos: Movimiento[]): Movimiento[] {
  return movimientos
    .filter((m) => m.tipo === 'gasto' && esValido(m) && esCategoriaMercaderia(m.categoria))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

/** Lo que te deben, de la deuda más vieja a la más nueva: a quién llamar primero. */
export function deudoresPorAntiguedad(fiado: ResumenFiado): ResumenFiado['clientes'] {
  return [...fiado.clientes]
    .filter((c) => c.saldo > 0)
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1) || b.saldo - a.saldo);
}

/** Con dos o más personas cargando ventas, la hoja dice algo; con una sola, no. */
export function hayVariosVendedores(vendedores: VentasDeVendedor[]): boolean {
  return vendedores.length >= 2;
}
