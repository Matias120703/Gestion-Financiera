'use client';

import { useEffect } from 'react';
import { aplicarTema, leerTema } from '@/lib/tema';

/**
 * Mantiene la app a tono con el teléfono mientras está abierta.
 *
 * El guion del layout aplica el tema al abrir, y con eso alcanzaría si nadie
 * cambiara nunca de idea. Pero «como el teléfono» significa que a las siete de
 * la tarde, cuando el sistema se pone oscuro solo, la app tiene que
 * acompañarlo — y una app instalada puede estar abierta desde la mañana sin
 * recargarse una sola vez.
 *
 * Solo escucha cuando la preferencia es «como el teléfono». Si eligió claro u
 * oscuro a mano, esa decisión gana sobre el sistema: para eso la eligió.
 */
export function SeguirTema() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => { if (leerTema() === 'sistema') aplicarTema('sistema'); };
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

  return null;
}
