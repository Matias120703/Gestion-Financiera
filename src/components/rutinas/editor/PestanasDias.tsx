'use client';

import { useEffect, useRef } from 'react';
import { useTextos } from '@/i18n/cliente';
import type { DiaEditor } from './modelo';

/**
 * LOS DÍAS, EN PESTAÑAS GRANDES (098).
 *
 * Una fila que se desliza de costado, con el nombre de cada día y cuántos
 * ejercicios tiene, y «+ Día» al final. La pestaña elegida se trae a la
 * vista: con cinco días en un celular, la quinta queda fuera de la pantalla.
 */
export function PestanasDias({
  dias, activo, onElegir, onAgregar, puedeAgregar,
}: {
  dias: DiaEditor[];
  activo: number;
  onElegir: (i: number) => void;
  onAgregar: () => void;
  puedeAgregar: boolean;
}) {
  const t = useTextos();
  const d = t.rutinasEditor.dias;
  const fila = useRef<HTMLDivElement>(null);
  const elegida = useRef<HTMLButtonElement>(null);

  // Solo de costado, y a mano: `scrollIntoView` también movía la página
  // entera hasta las pestañas apenas se abría el editor.
  useEffect(() => {
    const f = fila.current;
    const b = elegida.current;
    if (!f || !b) return;
    const rf = f.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (rb.left < rf.left) f.scrollLeft -= rf.left - rb.left + 16;
    else if (rb.right > rf.right) f.scrollLeft += rb.right - rf.right + 16;
  }, [activo, dias.length]);

  return (
    <div
      ref={fila} role="tablist" aria-label={d.titulo}
      className="scroll-limpio -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
    >
      {dias.map((dia, i) => {
        const esta = i === activo;
        return (
          <button
            key={dia.clave} ref={esta ? elegida : undefined}
            type="button" role="tab" aria-selected={esta} onClick={() => onElegir(i)}
            className={`min-h-[52px] max-w-[12rem] shrink-0 rounded-2xl px-4 py-2 text-left transition active:scale-[.98] ${
              esta ? 'bg-verde text-sobre-verde' : 'border border-borde bg-superficie text-tinta/70'
            }`}
          >
            <span className="block truncate text-[14.5px] font-bold leading-tight">{dia.nombre.trim() || d.porDefecto(i)}</span>
            <span className={`block text-[11.5px] font-semibold ${esta ? 'text-sobre-verde/75' : 'text-tinta/45'}`}>
              {d.ejercicios(dia.ejercicios.length)}
            </span>
          </button>
        );
      })}
      {puedeAgregar && (
        <button
          type="button" onClick={onAgregar}
          className="min-h-[52px] shrink-0 rounded-2xl border border-dashed border-verde/60 px-4 text-[14px] font-bold text-verde-fuerte transition hover:bg-verde-claro active:scale-[.98]"
        >
          {d.agregar}
        </button>
      )}
    </div>
  );
}
