'use client';

/**
 * LAS HOJAS DE UNA PLANILLA, COMO CHIPS (114, compartido desde la 122).
 *
 * Lo comparten la rutina del trainer y la lista de productos: las hojas que
 * se usan van con ✓; las que se pueden usar son botones (`onHoja`) para
 * sumarlas o sacarlas; las que no tienen nada que usar quedan grises, con su
 * motivo (`noUsada`). La última hoja que queda no se saca: sin ninguna no hay
 * nada que mostrar.
 */
export interface HojaParaChip {
  nombre: string;
  usada: boolean;
  /** Tiene algo que usar: se puede sumar o sacar. */
  activable: boolean;
}

export function ChipsDeHojas({
  hojas, etiqueta, noUsada, onHoja,
}: {
  hojas: HojaParaChip[];
  /** Para el lector de pantalla: «Hojas de la planilla». */
  etiqueta: string;
  /** Lo que dice una hoja sin nada que usar: «Medidas: sin ejercicios, no se usa». */
  noUsada: (nombre: string) => string;
  /** Sumar o sacar esa hoja (por su nombre). Sin esto, las hojas solo se muestran. */
  onHoja?: (nombre: string, usar: boolean) => void;
}) {
  const chip = (encendido: boolean) => `${encendido ? 'chip-encendido' : 'chip-apagado'} px-3.5 text-[13px]`;
  const usadasActivables = hojas.filter((h) => h.usada && h.activable).length;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={etiqueta}>
      {hojas.map((h, k) => (h.activable && onHoja ? (
        <li key={k}>
          <button
            type="button" aria-pressed={h.usada}
            disabled={h.usada && usadasActivables <= 1}
            onClick={() => onHoja(h.nombre, !h.usada)}
            className={`${chip(h.usada)} min-h-[40px] max-w-full`}
          >
            <span className="truncate">{h.usada ? `✓ ${h.nombre}` : h.nombre}</span>
          </button>
        </li>
      ) : (
        <li key={k} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${h.usada ? 'bg-verde-claro text-verde-fuerte' : 'bg-arena text-tinta/50'}`}>
          {h.usada || h.activable ? h.nombre : noUsada(h.nombre)}
        </li>
      )))}
    </ul>
  );
}
