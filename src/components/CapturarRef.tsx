'use client';

import { useEffect } from 'react';
import { guardarRef } from '@/lib/referido';

/**
 * Se queda con el código del enlace de quien recomendó Orden.
 *
 * Va en el layout de raíz y no en la portada: el socio puede compartir
 * cualquier dirección —la portada, la pantalla de precios, la de crear
 * cuenta— y el código tiene que sobrevivir igual.
 *
 * No dibuja nada ni avisa nada. Que la persona vea «entraste por el enlace de
 * Fulano» antes siquiera de saber qué es Orden no le suma nada; y la comisión
 * es un asunto entre Orden y el socio, no algo que el cliente nuevo tenga que
 * cargar encima.
 */
export function CapturarRef() {
  useEffect(() => {
    const codigo = new URLSearchParams(window.location.search).get('ref');
    if (codigo) guardarRef(codigo);
  }, []);

  return null;
}
