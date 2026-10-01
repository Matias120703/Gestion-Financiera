/**
 * EL CÓDIGO DE UN PRODUCTO, PARA COMPARAR (122, 01/10/2026).
 *
 * Un código de solo cifras no cambia por los ceros de adelante: el Excel con
 * formato «000000» muestra 000123, el sistema de caja exporta 000123 y otra
 * planilla lo guardó como 123; el lector de barras escanea 0012345678905 (el
 * UPC de un importado) y el producto se guardó 12345678905. Los demás
 * códigos (con letras: «BEB-001», «X-1») se comparan tal cual.
 *
 * La MISMA regla vive en la base: `codigo_sin_ceros()` (migración 122), con
 * la que `importar_productos` y `cotejar_productos` emparejan; y
 * pruebas/productos-planilla.test.js pasa los mismos códigos por las dos.
 *
 * No importa nada: lo usan Vender (en el celular) y el lector de la planilla.
 */
export function codigoSinCeros(codigo: string): string {
  const c = (codigo ?? '').trim();
  if (!/^[0-9]+$/.test(c)) return c;
  return c.replace(/^0+/, '') || '0';
}
