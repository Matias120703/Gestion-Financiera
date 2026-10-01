'use client';

import { useTextos } from '@/i18n/cliente';
import { FilaDeslizable } from '@/components/FilaDeslizable';
import type { DiaEditor } from './modelo';

/**
 * LOS DÍAS, EN PESTAÑAS GRANDES (098).
 *
 * El nombre de cada día y cuántos ejercicios tiene, y «+ Día» al final. En
 * el celular, una fila que se desliza de costado, con la elegida traída a la
 * vista: con cinco días, la quinta queda fuera de la pantalla. Con mouse, en
 * varias líneas (01/10): «en la computadora no veo que hay viernes, sábado,
 * domingo». Lo hace FilaDeslizable.
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

  return (
    <FilaDeslizable
      enCompu="envolver" sangria="pagina" rol="tablist" etiqueta={d.titulo} teclado="pestanas"
      // También con la cantidad: al subir una planilla la elegida sigue
      // siendo la primera, pero la fila es otra.
      activo={`${activo}/${dias.length}`}
      className="gap-2 pb-1"
    >
      {dias.map((dia, i) => {
        const esta = i === activo;
        return (
          <button
            key={dia.clave}
            type="button" role="tab" aria-selected={esta} tabIndex={esta ? 0 : -1} onClick={() => onElegir(i)}
            // Con mouse van en varias líneas: hay lugar para el nombre entero
            // («Miércoles · Espalda y bíceps» se cortaba en «Miércoles · Espalda …»).
            className={`min-h-[52px] max-w-[12rem] mouse:max-w-[18rem] shrink-0 rounded-2xl px-4 py-2 text-left transition active:scale-[.98] ${
              esta ? 'bg-verde text-sobre-verde' : 'border border-borde bg-superficie text-tinta/70 hover:border-verde/50'
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
    </FilaDeslizable>
  );
}
