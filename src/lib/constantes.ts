/** Constantes que se usan tanto en el navegador como en el servidor. */
export const COOKIE_EMPRESA = 'orden_empresa';
export const ZONA_HORARIA = 'America/Asuncion';

/**
 * Cuántos días dura la prueba gratis, según el tipo de cuenta.
 *
 * Espejo de `dias_de_prueba()` de la migración 049. Igual que
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
  emprendedor: 8,
  personal: 5,
} as const;

/** El texto tal como se lee en pantalla: «8 días». */
export function textoPrueba(tipo: keyof typeof DIAS_DE_PRUEBA): string {
  return `${DIAS_DE_PRUEBA[tipo]} días`;
}
