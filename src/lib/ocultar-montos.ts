'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * EL OJITO: TAPAR LOS MONTOS.
 *
 * Del cuaderno de Matías, la tarjeta del banco con un ojo tachado al lado del
 * saldo. Sirve para lo que sirve en cualquier app de banco: mostrar el
 * celular en la fila del súper sin mostrar cuánto tenés.
 *
 * Es de ESTE aparato (localStorage) y no de la cuenta: la misma persona
 * puede querer los montos tapados en el celular y a la vista en la
 * computadora de su casa.
 *
 * Todos los ojos de la pantalla se mueven juntos: tocar el de la billetera
 * tapa también la tira del panel, por un evento del navegador.
 */
const CLAVE = 'orden-ocultar-montos';
const EVENTO = 'orden:ocultar-montos';

function leer(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

export function useOcultarMontos(): [boolean, () => void] {
  // Arranca a la vista y se lee después del montaje: en el servidor no hay
  // localStorage, y pintar distinto rompería la hidratación.
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    setOculto(leer());
    const alCambiar = () => setOculto(leer());
    window.addEventListener(EVENTO, alCambiar);
    window.addEventListener('storage', alCambiar);
    return () => {
      window.removeEventListener(EVENTO, alCambiar);
      window.removeEventListener('storage', alCambiar);
    };
  }, []);

  const alternar = useCallback(() => {
    const siguiente = !leer();
    try {
      localStorage.setItem(CLAVE, siguiente ? '1' : '0');
    } catch {
      // Sin almacenamiento, al menos cambia en esta pantalla.
    }
    setOculto(siguiente);
    window.dispatchEvent(new Event(EVENTO));
  }, []);

  return [oculto, alternar];
}
