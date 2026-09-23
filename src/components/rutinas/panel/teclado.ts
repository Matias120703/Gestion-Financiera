/**
 * «SIGUIENTE» EN EL TECLADO DEL CELULAR (098).
 *
 * `enterKeyHint="next"` solo cambia lo que dice la tecla: en el iPhone
 * «siguiente» manda un Enter común, y un Enter adentro de un formulario lo
 * envía. Así, quien escribía el nombre del ejercicio y tocaba «siguiente»
 * para ir a las series veía la hoja cerrarse con el ejercicio a medio
 * cargar. Con esto el Enter de un campo de una línea pasa al campo que
 * sigue, en el orden de la pantalla, y guardar queda solo en los botones.
 *
 * Un Enter mientras se compone una palabra (el teclado japonés, el
 * autocorrector de algunos Android) no cuenta: es parte de escribir.
 */
import type { KeyboardEvent } from 'react';

/** Los campos donde se escribe: ni casillas, ni botones, ni lo apagado. */
const CAMPOS = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=button]):not([type=submit]):not([disabled]), textarea:not([disabled]), select:not([disabled])';

/** Un Enter de verdad en un campo de una línea (en un textarea, Enter es un renglón nuevo). */
export function esEnterDeCampo(ev: KeyboardEvent<HTMLElement>): boolean {
  if (ev.key !== 'Enter' || ev.nativeEvent.isComposing || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return false;
  const el = ev.target as HTMLElement;
  if (!(el instanceof HTMLInputElement)) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(el.type);
}

/**
 * Pasa el foco al campo que sigue dentro de `caja`. En el último, cierra
 * el teclado (saca el foco) en vez de enviar nada.
 */
export function alSiguienteCampo(desde: HTMLElement, caja: HTMLElement | null): void {
  const campos = Array.from((caja ?? document.body).querySelectorAll<HTMLElement>(CAMPOS));
  const i = campos.indexOf(desde);
  const siguiente = i >= 0 ? campos[i + 1] : undefined;
  if (siguiente) siguiente.focus();
  else desde.blur();
}

/**
 * Para el `onKeyDown` de un contenedor: todo Enter de un campo de una línea
 * pasa al siguiente. Si un campo ya lo resolvió (por ejemplo, eligiendo una
 * sugerencia), marca `preventDefault` y esto no hace nada.
 */
export function enterPasaAlSiguiente(ev: KeyboardEvent<HTMLElement>): void {
  if (ev.defaultPrevented || !esEnterDeCampo(ev)) return;
  ev.preventDefault();
  alSiguienteCampo(ev.target as HTMLElement, ev.currentTarget);
}
