'use client';

import { useEffect } from 'react';

/**
 * MIENTRAS HAY ALGO ADELANTE, EL FONDO NO SE MUEVE.
 *
 * Sin esto, deslizar adentro de una hoja abierta arrastra también la página de
 * atrás: se cierra el menú, o peor, uno vuelve y el panel quedó en otro lado
 * sin haberlo tocado. Se siente como que la pantalla se resbala.
 *
 * `overflow: hidden` en el body no alcanza en el iPhone —Safari lo ignora y
 * sigue arrastrando la página—. Lo que sí funciona es fijar el body y
 * compensar el desplazamiento con `top`, que es la razón de que esto sea más
 * largo de lo que parece que debería.
 *
 * Al cerrar se vuelve exactamente a donde estaba: sin el `scrollTo` final, la
 * página salta al principio y la persona pierde el lugar donde venía leyendo.
 */
export function useBloquearFondo(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;

    const y = window.scrollY;
    const body = document.body;
    const antes = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      body.style.position = antes.position;
      body.style.top = antes.top;
      body.style.width = antes.width;
      body.style.overflow = antes.overflow;
      window.scrollTo(0, y);
    };
  }, [activo]);
}
