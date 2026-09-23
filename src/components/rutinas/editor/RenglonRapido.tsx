'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { leerRenglon } from '@/lib/rutina-texto';
import type { EjercicioLeido } from '@/lib/tipos-rutinas';
import { cargaSinUnidad, resumenEjercicio } from './modelo';

/**
 * EL RENGLÓN RÁPIDO (098): la forma principal de cargar una rutina.
 *
 * Una hoja con seis campos lleva unos veinte segundos por ejercicio; seis
 * ejercicios ya se comen la meta de dos minutos por día. Acá se escribe
 * «Press banca 4x10 40kg 90s», Enter, y queda la tarjeta. El campo no
 * pierde el foco, así el teclado del celular sigue abierto para el que
 * sigue. La hoja queda para retocar.
 *
 * Mientras se escribe, abajo se ve cómo va a quedar: si el lector entendió
 * «40» sin unidad, se avisa antes de agregar (la carga nunca se completa
 * sola: un «25» pensado en libras y leído como kilos lastima).
 */
export function RenglonRapido({
  onAgregar, lleno,
}: {
  onAgregar: (leido: EjercicioLeido) => void;
  /** El día llegó a 30 ejercicios. */
  lleno: boolean;
}) {
  const t = useTextos();
  const r = t.rutinasEditor.renglon;
  const id = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');

  const leido = useMemo(() => (valor.trim() ? leerRenglon(valor) : null), [valor]);
  const vista = leido
    ? [leido.nombre, resumenEjercicio({ clave: '', ...leido }, t.rutinasComun.texto.series)].filter(Boolean).join(' · ')
    : '';

  function agregar() {
    if (lleno || !valor.trim()) return;
    const l = leerRenglon(valor);
    if (!l) {
      setError(r.noEntendi);
      return;
    }
    onAgregar(l);
    setValor('');
    setError('');
    campo.current?.focus();
  }

  if (lleno) return <p className="mt-3 rounded-xl bg-arena px-3 py-2.5 text-[13px] text-tinta/60">{t.rutinasEditor.dias.lleno}</p>;

  return (
    <form
      className="mt-3"
      onSubmit={(ev) => { ev.preventDefault(); agregar(); }}
    >
      <label htmlFor={id} className="etiqueta">{r.etiqueta}</label>
      <div className="flex gap-2">
        <input
          ref={campo} id={id} className="campo min-w-0"
          value={valor} maxLength={200}
          placeholder={r.ejemplo}
          enterKeyHint="enter" autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false}
          onChange={(ev) => { setValor(ev.target.value); if (error) setError(''); }}
          // Enter agrega aunque el teclado no «envíe» el formulario (hay
          // teclados de Android que no lo hacen); mientras se compone una
          // palabra con el corrector, Enter es del teclado.
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && !ev.nativeEvent.isComposing) {
              ev.preventDefault();
              agregar();
            }
          }}
        />
        <button type="submit" disabled={!valor.trim()} className="boton-principal min-h-[44px] shrink-0 px-4">
          {r.agregar}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-rojo">{error}</p>
      ) : leido ? (
        <div className="mt-1.5 text-[12.5px] leading-snug" aria-live="polite">
          <p className="text-tinta/60">
            <span className="font-semibold text-verde-fuerte">{r.vista}</span> {vista}
            {leido.nota && <span className="text-tinta/45"> · {leido.nota}</span>}
          </p>
          {cargaSinUnidad(leido.carga) && <p className="mt-1 font-medium text-ambar">{r.sinUnidad}</p>}
        </div>
      ) : (
        <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">{r.ayuda}</p>
      )}
    </form>
  );
}
