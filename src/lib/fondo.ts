'use client';

import { useEffect } from 'react';

/**
 * MIENTRAS HAY ALGO ADELANTE, SE MUEVE SOLO ESO.
 *
 * Sin esto, deslizar adentro del menú arrastra también la página de atrás, y
 * en el iPhone arrastra algo peor: la pantalla entera. Los cuadros y la barra
 * de abajo se van juntos, como si fueran una sola cosa, y al soltar la barra
 * queda levantada con una franja vacía debajo.
 *
 * LO QUE YA SE PROBÓ Y NO SIRVIÓ, PARA NO VOLVER AHÍ
 *
 *   1. Fijar el body (`position: fixed` + `top`). Es la receta de siempre, y
 *      levantaba la barra: el body sale del flujo y lo que estaba pegado
 *      abajo queda colgado.
 *   2. Cortar el gesto solo cuando el dedo NO está sobre algo desplazable.
 *      Casi: pero si los cuadros ya estaban en su borde y el dedo seguía
 *      empujando, el gesto se dejaba pasar, iOS lo encadenaba a la pantalla y
 *      rebotaba todo junto.
 *
 * LO QUE HACE AHORA
 *
 *   · `overflow: hidden` en el body, NO en la raíz: frena la rueda del
 *     mouse sin achicar la pantalla del iPhone instalado.
 *   · `overscroll-behavior: none` en html y body: le quita a la pantalla el
 *     rebote elástico, que es lo que movía cuadros y barra como un bloque.
 *   · Y el gesto se deja pasar SOLO si lo que está bajo el dedo todavía se
 *     puede desplazar EN ESA DIRECCIÓN. Arriba de todo y tirando para abajo,
 *     o abajo de todo y tirando para arriba, se corta: ahí es exactamente
 *     donde iOS pasaba el movimiento a la pantalla.
 *
 * Nada de esto cambia la posición de ningún elemento. La barra no se entera
 * de que el menú está abierto, que es justamente lo que tiene que pasar.
 */
export function useBloquearFondo(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;

    const raiz = document.documentElement;
    const body = document.body;
    const antes = {
      bodyOverflow: body.style.overflow,
      raizRebote: raiz.style.overscrollBehavior,
      bodyRebote: body.style.overscrollBehavior,
    };

    // A la raíz NO se le pone `overflow: hidden`: en la app instalada del
    // iPhone eso achica la pantalla, y quedaba una franja negra debajo de
    // todo. Al body sí, que no cambia el tamaño de nada.
    body.style.overflow = 'hidden';
    raiz.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';

    let inicioY = 0;
    const alTocar = (e: TouchEvent) => {
      inicioY = e.touches[0]?.clientY ?? 0;
    };

    const frenar = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? inicioY;
      // El dedo baja → el contenido quiere ir hacia arriba (scrollTop baja).
      const dedoBaja = y > inicioY;

      let el = e.target as HTMLElement | null;
      while (el && el !== body && el !== raiz) {
        const estilo = getComputedStyle(el);
        const desplazable = /(auto|scroll)/.test(estilo.overflowY)
          && el.scrollHeight > el.clientHeight + 1;

        if (desplazable) {
          const enElTope = el.scrollTop <= 0;
          const enElFondo = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          // Todavía hay para dónde ir: el gesto es de este elemento.
          if ((dedoBaja && !enElTope) || (!dedoBaja && !enElFondo)) return;
          // Está contra el borde: si pasara, iOS se lo daría a la pantalla.
          break;
        }
        el = el.parentElement;
      }

      // `cancelable` es falso cuando el navegador ya arrancó el gesto: llamarlo
      // igual solo llena la consola de avisos.
      if (e.cancelable) e.preventDefault();
    };

    document.addEventListener('touchstart', alTocar, { passive: true });
    document.addEventListener('touchmove', frenar, { passive: false });

    return () => {
      body.style.overflow = antes.bodyOverflow;
      raiz.style.overscrollBehavior = antes.raizRebote;
      body.style.overscrollBehavior = antes.bodyRebote;
      document.removeEventListener('touchstart', alTocar);
      document.removeEventListener('touchmove', frenar);
    };
  }, [activo]);
}
