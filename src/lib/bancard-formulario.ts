/**
 * LO QUE DICE EL FORMULARIO DE BANCARD AL TERMINAR, YA LIMPIO.
 *
 * El iframe de Bancard (pago, catastro, 3D Secure) le avisa a la página cómo
 * terminó. La librería oficial (`bancard-checkout` 4.0.0) le pasa ese aviso
 * tal cual llegó (`event.data`) al `responseHandler` del comercio, y tiene
 * esta forma: `{ message, details, return_url }`. Si el comercio no puso
 * `responseHandler`, la misma librería navega al `return_url` agregándole
 * `?status=<message>&description=<details>`: por eso el manual los llama
 * `status` y `description` («add_new_card_success» / «add_new_card_fail» en
 * el catastro). Acá se aceptan las dos formas.
 *
 * ESTO NO DECIDE NADA. Que una tarjeta quedó guardada lo dice Bancard cuando
 * se le pide la lista (`verificarTarjeta`), y que un pago entró, su
 * confirmación firmada. Lo que dice el formulario pasa por el navegador de la
 * persona y puede llegar cambiado: sirve para dejar constancia
 * (`bancard_eventos`, tipo `catastro_formulario`) y para mostrarle a la
 * persona qué le contestó Bancard cuando la tarjeta no quedó. Sin esto, un
 * catastro rechazado adentro del iframe no dejaba ningún rastro (07/10/2026:
 * cinco intentos en pruebas y solo se veía «No se pudo guardar la tarjeta.»).
 *
 * Por eso se limpia SIEMPRE con la misma función, en el navegador y de nuevo
 * en el servidor: solo textos, sin etiquetas, recortados, y sin nada que
 * parezca el número de una tarjeta. Se muestra como texto, nunca como HTML.
 *
 * Puro, sin imports: lo usan los componentes del navegador, la ruta y el
 * flujo, y lo compilan las pruebas.
 */

export interface DichoPorElFormulario {
  /** El estado: `add_new_card_success`, `add_new_card_fail`, `payment_success`… */
  mensaje: string;
  /** La descripción que mandó Bancard, si mandó alguna. */
  detalle: string;
}

/** Lo que dice el formulario de catastro cuando Bancard registró la tarjeta. */
export const CATASTRO_CON_EXITO = 'add_new_card_success';

/** Cuánto se guarda y se muestra, como mucho, de cada texto. */
const LARGO_MAXIMO = 200;

/** Un texto de Bancard, listo para mostrar y para anotar. Lo que no es texto queda vacío. */
function limpiar(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  return valor
    // Un tope antes de trabajar: del navegador puede llegar cualquier largo.
    .slice(0, 2000)
    // Sin etiquetas: se muestra como texto, y un «<br>» suelto no dice nada.
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    // Sin caracteres de control (un nulo, además, la base no lo guarda).
    .replace(/\p{Cc}+/gu, ' ')
    // Nada que parezca el número de una tarjeta, aunque Bancard no lo manda.
    .replace(/\d(?:[ -]?\d){11,18}/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LARGO_MAXIMO);
}

/**
 * Lee lo que avisó el formulario, venga como lo manda la librería
 * (`message` / `details`), como lo nombra el manual y llega en la dirección
 * de vuelta (`status` / `description`), o ya leído por Orden (`mensaje` /
 * `detalle`: lo que el navegador le manda al servidor). También si llega
 * como texto JSON. Null si no hay nada que sea texto.
 */
export function leerLoQueDijoElFormulario(valor: unknown): DichoPorElFormulario | null {
  let dato: unknown = valor;
  if (typeof dato === 'string') {
    if (dato.length > 4000) return null;
    try { dato = JSON.parse(dato); } catch { return null; }
  }
  if (typeof dato !== 'object' || dato === null || Array.isArray(dato)) return null;

  const d = dato as Record<string, unknown>;
  const mensaje = limpiar(d.message) || limpiar(d.status) || limpiar(d.mensaje);
  const detalle = limpiar(d.details) || limpiar(d.description) || limpiar(d.detalle);
  return mensaje || detalle ? { mensaje, detalle } : null;
}

/** Lo que se le muestra a la persona de eso: la descripción y, si no vino, el estado. */
export function textoDeLoQueDijo(dicho: DichoPorElFormulario | null | undefined): string {
  return dicho ? dicho.detalle || dicho.mensaje : '';
}
