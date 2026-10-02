/** Constantes que se usan tanto en el navegador como en el servidor. */
export const COOKIE_EMPRESA = 'orden_empresa';
export const ZONA_HORARIA = 'America/Asuncion';

/**
 * Cuántos días dura la prueba gratis, según el tipo de cuenta.
 *
 * Espejo de `dias_de_prueba()`: 20 un negocio y 8 una cuenta personal desde
 * la migración 123 (02/10/2026; antes 8 y 5, de la 049). Igual que
 * `LIMITES_VISIBLES`, esto NO decide nada: la fecha de vencimiento la
 * escribe PostgreSQL al crear la cuenta. Esto es solo para que la portada y
 * los Términos digan el mismo número.
 *
 * Y ese "mismo número" es el punto. Antes estaba escrito a mano en trece
 * lugares —incluidos los Términos del servicio, que es un documento legal—,
 * así que cambiar la duración obligaba a acordarse de trece ediciones. La
 * que se olvidara iba a prometerle a alguien una prueba que no iba a tener.
 *
 * `pruebas/calculos.test.js` lee la migración y compara: si este archivo y
 * la base dejan de coincidir, falla.
 */
export const DIAS_DE_PRUEBA = {
  emprendedor: 20,
  personal: 8,
} as const;

/** El texto tal como se lee en pantalla: «20 días». */
export function textoPrueba(tipo: keyof typeof DIAS_DE_PRUEBA): string {
  return `${DIAS_DE_PRUEBA[tipo]} días`;
}

/**
 * Cuántas personas entran en el precio base del Premium, contando al dueño.
 *
 * NO ESTÁ EN LA BASE: sale de cómo se cobra. El Pro son el dueño y 2 más
 * (`LIMITES_VISIBLES.pro.miembros` = 3), cada persona de más cuesta lo que
 * dice `precio_por_vendedor()` (050), y el Premium de lista vale justo un Pro
 * más una persona. O sea: el precio del Premium trae 4 personas —el dueño y
 * 3 más—, y de ahí para arriba cada una se suma aparte, hasta el tope del
 * plan (`LIMITES_VISIBLES.negocio.miembros`).
 *
 * Es la misma cuenta que hace la administración al activar un Premium
 * («Cuántos vendedores le habilitás», PanelAdmin) y la que decía la 017
 * («250.000 es el primer escalón»). Vive acá, y no en `precios.ts`, para que
 * la puedan leer también los componentes de navegador.
 *
 * `pruebas/precios-prueba.test.js` la ata a los precios de la base: si el
 * Premium deja de valer un Pro más una persona, falla y hay que revisar este
 * número y los textos que lo dicen (la portada, /plan y los Términos).
 */
export const PERSONAS_INCLUIDAS_PREMIUM = 4;
