'use client';

import { useTextos } from '@/i18n/cliente';

/**
 * «¿CUÁNTAS PERSONAS VAN A USAR LA CUENTA?» (Matías, 02/10: «al momento de
 * pagar con tarjeta o QR, el propietario elige cuántos funcionarios va a
 * querer, y de acuerdo a eso aparece el precio»).
 *
 * Menos, el número grande y más. Botones de 48 px para el dedo. El menos se
 * apaga en el mínimo —el que trae el Premium, o el equipo que ya tiene si es
 * más grande— y dice por qué; el más, en el tope del plan.
 */
export function SelectorPersonas({
  valor, min, max, miembros, onCambio, fijo = false,
}: {
  valor: number;
  min: number;
  max: number;
  /** Cuántas personas tiene hoy el equipo. */
  miembros: number;
  onCambio: (n: number) => void;
  /** Renovación de un Premium con cantidad: no se elige acá. */
  fijo?: boolean;
}) {
  const t = useTextos();
  const h = t.bancard.hoja;
  const enMinimo = valor <= min;
  const enMaximo = valor >= max;

  return (
    <div className="rounded-2xl border border-borde bg-arena/40 p-4">
      <p className="text-[14px] font-bold">{h.cuantasPersonas}</p>
      <div className="mt-3 flex items-center justify-center gap-5">
        <button
          type="button"
          className="grid h-12 w-12 place-items-center rounded-full border border-borde bg-superficie text-[24px] font-bold leading-none disabled:opacity-35"
          aria-label={h.menos}
          disabled={fijo || enMinimo}
          onClick={() => onCambio(Math.max(min, valor - 1))}
        >
          −
        </button>
        <span className="min-w-[4.5rem] text-center" aria-live="polite">
          <span className="block text-[34px] font-titulo font-extrabold leading-none tabular-nums">{valor}</span>
          <span className="mt-1 block text-[12px] font-semibold text-tinta/50">{h.personas(valor)}</span>
        </span>
        <button
          type="button"
          className="grid h-12 w-12 place-items-center rounded-full border border-borde bg-superficie text-[24px] font-bold leading-none disabled:opacity-35"
          aria-label={h.mas}
          disabled={fijo || enMaximo}
          onClick={() => onCambio(Math.min(max, valor + 1))}
        >
          +
        </button>
      </div>
      {fijo ? (
        <p className="mt-3 text-center text-[12.5px] leading-relaxed text-tinta/60">{h.personasFijas(valor)}</p>
      ) : enMinimo && miembros >= min ? (
        <p className="mt-3 text-center text-[12.5px] leading-relaxed text-tinta/60">{h.yaSonEnTuEquipo(miembros)}</p>
      ) : enMaximo ? (
        <p className="mt-3 text-center text-[12.5px] leading-relaxed text-tinta/60">{h.maximo(max)}</p>
      ) : null}
    </div>
  );
}
