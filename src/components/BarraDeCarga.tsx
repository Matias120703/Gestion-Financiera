'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * LA SEÑAL DE QUE ALGO ESTÁ PASANDO AL CAMBIAR DE PANTALLA.
 *
 * Antes esto lo hacía `app/(app)/loading.tsx`: un esqueleto gris que React
 * mostraba mientras el servidor armaba la pantalla. Hubo que sacarlo. Con
 * Next 15 esa barrera de espera no se resuelve nunca —la pantalla se queda
 * en el esqueleto para siempre— y no llegamos a entender por qué. Lo que sí
 * está comprobado es que sin ese archivo todo anda, y que el problema no es
 * el idioma, ni las cookies, ni que el esqueleto sea del navegador o del
 * servidor: se probaron las cuatro cosas por separado.
 *
 * Así que la señal se da desde el navegador, sin barrera de espera de por
 * medio: una barra fina arriba de todo que aparece al tocar un enlace y se
 * va cuando la pantalla nueva llegó.
 *
 * CÓMO SABE QUE ARRANCÓ UNA NAVEGACIÓN
 *
 * El App Router no avisa cuándo empieza a navegar. Pero sí se puede escuchar
 * el toque: si el enlace es nuestro y lleva a otra ruta, la navegación
 * empezó. Se escucha en fase de captura para enterarse aunque el enlace
 * cancele el evento más adelante.
 *
 * Y termina cuando `usePathname` cambia, que es exactamente el momento en
 * que la pantalla nueva ya está pintada.
 *
 * POR QUÉ SE TOCA EL DOM A MANO Y NO SE USA ESTADO DE REACT
 *
 * Porque con estado NO SE VE. Está medido: la barra aparecía recién medio
 * segundo después del toque, que es justo el rato en que hace falta. El
 * motivo es que navegar, en el App Router, es una transición de React, y un
 * cambio de estado hecho dentro de ese mismo evento se va con ella: React lo
 * considera postergable y lo pinta cuando puede. Una clase puesta a mano se
 * ve en el cuadro siguiente, siempre.
 *
 * POR QUÉ LA BARRA NO LLEGA AL FINAL SOLA
 *
 * Crece rápido hasta el 90% y ahí se queda. Nadie sabe cuánto va a tardar el
 * servidor, y una barra que llega al 100% y sigue esperando miente. El
 * último tramo se completa recién cuando la pantalla llegó de verdad.
 */
export function BarraDeCarga() {
  const ruta = usePathname();
  const barra = useRef<HTMLDivElement>(null);
  const rutaPrevia = useRef(ruta);
  const cerrando = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const alTocar = (e: MouseEvent) => {
      // Ctrl/cmd/shift o botón del medio: eso abre en otra pestaña y esta
      // pantalla no cambia.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const destino = (e.target as HTMLElement | null)?.closest?.('a');
      if (!destino) return;
      if (destino.target && destino.target !== '_self') return;
      if (destino.hasAttribute('download')) return;

      const href = destino.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // A la misma pantalla no se navega: la barra quedaría esperando algo
      // que no va a pasar.
      if (url.pathname === window.location.pathname) return;

      const el = barra.current;
      if (!el) return;
      if (cerrando.current) { clearTimeout(cerrando.current); cerrando.current = null; }
      el.classList.remove('barra-carga-lista');
      // Reiniciar la animación para el caso de dos toques seguidos: sin esto
      // el segundo arranca donde quedó el primero.
      el.classList.remove('barra-carga-activa');
      void el.offsetWidth;
      el.classList.add('barra-carga-activa');
    };

    document.addEventListener('click', alTocar, true);
    return () => document.removeEventListener('click', alTocar, true);
  }, []);

  useEffect(() => {
    if (ruta === rutaPrevia.current) return;
    rutaPrevia.current = ruta;

    const el = barra.current;
    if (!el || !el.classList.contains('barra-carga-activa')) return;

    el.classList.add('barra-carga-lista');
    cerrando.current = setTimeout(() => {
      el.classList.remove('barra-carga-activa', 'barra-carga-lista');
      cerrando.current = null;
      // Lo que tarda la animación de cierre en globals.css.
    }, 320);
  }, [ruta]);

  useEffect(() => () => {
    if (cerrando.current) clearTimeout(cerrando.current);
  }, []);

  return <div ref={barra} className="barra-carga" aria-hidden="true" />;
}
