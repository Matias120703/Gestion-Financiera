'use client';

import { useEffect } from 'react';

/**
 * MIENTRAS HAY ALGO ADELANTE, EL FONDO NO SE MUEVE.
 *
 * Sin esto, deslizar adentro de una hoja abierta arrastra también la página de
 * atrás: se cierra el menú, o uno vuelve y el panel quedó en otro lado sin
 * haberlo tocado. Se siente como que la pantalla se resbala.
 *
 * POR QUÉ NO SE FIJA EL BODY, QUE ES LO QUE TODO EL MUNDO HACE
 *
 * Se hizo así primero —`position: fixed` con el desplazamiento compensado en
 * `top`— y en el celular la barra de abajo se levantaba, dejando una franja
 * vacía debajo. Es lo que pasa cuando el body sale del flujo: la altura de la
 * página deja de ser la de la pantalla y lo que estaba pegado abajo queda
 * colgado en el aire.
 *
 * Así que acá no se mueve nada de lugar. Son dos cosas, y hacen falta las dos:
 *
 *   · `overflow: hidden` frena la rueda del mouse y la barra de desplazamiento
 *     en la computadora;
 *   · el iPhone ignora eso y sigue arrastrando la página con el dedo, así que
 *     además se corta el gesto: se cancela todo `touchmove` que no venga de
 *     adentro de algo que de verdad se pueda desplazar.
 *
 * Esa comprobación de «algo que se pueda desplazar» es la que deja vivo el
 * scroll de la propia hoja. Sin ella, el menú tampoco se podría deslizar.
 */
export function useBloquearFondo(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;

    const raiz = document.documentElement;
    const body = document.body;
    const antes = { raiz: raiz.style.overflow, body: body.style.overflow };

    raiz.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    const frenar = (e: TouchEvent) => {
      let el = e.target as HTMLElement | null;
      while (el && el !== body) {
        const estilo = getComputedStyle(el);
        const desliza = /(auto|scroll)/.test(estilo.overflowY)
          && el.scrollHeight > el.clientHeight + 1;
        if (desliza) return;
        el = el.parentElement;
      }
      // `cancelable` es falso cuando el navegador ya arrancó el gesto: si se
      // llamara igual, la consola se llena de avisos y no sirve de nada.
      if (e.cancelable) e.preventDefault();
    };

    document.addEventListener('touchmove', frenar, { passive: false });

    return () => {
      raiz.style.overflow = antes.raiz;
      body.style.overflow = antes.body;
      document.removeEventListener('touchmove', frenar);
    };
  }, [activo]);
}
