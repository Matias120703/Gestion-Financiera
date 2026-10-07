'use client';

import { useTextos } from '@/i18n/cliente';
import { fechaCorta, type OpcionCobro } from '@/lib/cuotas';

/**
 * LAS OPCIONES DE «¿DE QUÉ?» AL COBRAR (127)
 *
 * Una por deuda con cuotas —«TV 32" · Cuota 2 de 3 · 150.000»—, lo sin
 * fecha y todo. Las usan la ficha de Fiado y la revisión por voz: escritas
 * en un solo lugar para que el mismo cliente no lea dos listas distintas
 * según por dónde entró a cobrar.
 *
 * Son solo los `<option>`: el `<select>` y lo que pasa al elegir es de cada
 * pantalla (Fiado propone el monto; la voz respeta el que se dictó).
 */
export function OpcionesDeQue({
  opciones, plata, hoy,
}: {
  opciones: OpcionCobro[];
  plata: (n: number) => string;
  /** Hoy en la zona del negocio: una fecha de otro año lleva el año. */
  hoy: string;
}) {
  const t = useTextos();
  return (
    <>
      {opciones.map((o) => (
        <option key={o.clave} value={o.clave}>
          {o.tipo === 'todo' ? `${t.fiado.todo} · ${plata(o.propuesto)}`
            : o.tipo === 'sin_fecha' ? `${t.fiado.loSinFecha} · ${plata(o.propuesto)}`
              : [
                o.concepto || t.fiado.lineaFiado,
                // Con una sola cuota, «cuota 1 de 1» sobra: se dice la fecha.
                o.cuota && o.cuota.de > 1 ? t.fiado.cuotaN(o.cuota.numero, o.cuota.de) : fechaCorta(o.cuota?.vence_el ?? '', hoy),
                plata(o.cuota?.pendiente ?? o.propuesto),
              ].join(' · ')}
        </option>
      ))}
    </>
  );
}
