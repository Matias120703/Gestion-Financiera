/**
 * CLARO, OSCURO O COMO EL TELÉFONO.
 *
 * Tres opciones y no un interruptor de dos, porque «como el sistema» es lo
 * que hace que la app se ponga oscura sola a la noche sin que nadie toque
 * nada. Es el que viene puesto.
 *
 * Se guarda en el navegador y no en la base: es de ESTE aparato. La misma
 * persona puede querer la app clara en la computadora del local y oscura en
 * el celular, y guardarlo en su cuenta le impondría una sola respuesta a los
 * dos. Además así se aplica antes de que la pantalla se dibuje, sin esperar a
 * ninguna consulta — el parpadeo blanco al abrir es exactamente lo que
 * arruina un modo oscuro.
 */
export type Tema = 'claro' | 'oscuro' | 'sistema';

export const CLAVE_TEMA = 'orden:tema';

export function esTema(v: unknown): v is Tema {
  return v === 'claro' || v === 'oscuro' || v === 'sistema';
}

export function leerTema(): Tema {
  try {
    const v = localStorage.getItem(CLAVE_TEMA);
    return esTema(v) ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}

/** Pone (o saca) la clase que da vuelta la paleta entera. */
export function aplicarTema(tema: Tema): void {
  const oscuro = tema === 'oscuro'
    || (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('oscuro', oscuro);
}

export function guardarTema(tema: Tema): void {
  try { localStorage.setItem(CLAVE_TEMA, tema); } catch { /* modo privado */ }
  aplicarTema(tema);
}

/**
 * Lo que corre ANTES de que se pinte la primera pantalla.
 *
 * Va como texto porque se inyecta en el HTML: si esto fuera un efecto de
 * React, la app se dibujaría clara y se pondría oscura un instante después.
 * Ese fogonazo blanco es lo único que no se puede permitir.
 */
export const GUION_TEMA = `(function(){try{
var t=localStorage.getItem('${CLAVE_TEMA}');
var o=t==='oscuro'||((!t||t==='sistema')&&window.matchMedia('(prefers-color-scheme: dark)').matches);
if(o)document.documentElement.classList.add('oscuro');
}catch(e){}})();`;
