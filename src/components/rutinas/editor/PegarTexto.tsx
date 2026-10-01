'use client';

import { useDeferredValue, useId, useMemo, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import type { RutinaLeidaConNotas } from '@/lib/rutina-texto';
import { darVueltaSeriesYReps, pegadoComoPlanilla } from '@/lib/rutina-planilla';
import type { EjercicioBiblioteca } from '@/lib/tipos-rutinas';
import { Hoja } from '../panel/Piezas';
import { ExtrasPlanilla } from './ExtrasPlanilla';
import { PieLeida, VistaLeida, type ModoPegar } from './VistaLeida';

export type { ModoPegar } from './VistaLeida';

/**
 * «PEGAR TEXTO» (098): la rutina que el trainer ya tiene escrita.
 *
 * Un trainer no arranca de cero: la tiene en Notas, en un Excel o en un
 * chat. Se pega entera y, antes de usarla, se ve lo que se entendió (la
 * revisión es `VistaLeida`, la misma de «Subir planilla»).
 *
 * Lo pegado de una planilla (dos renglones o más con tabulador) pasa por el
 * convertidor de planillas (`pegadoComoPlanilla`, 114): así los días lado a
 * lado no se pierden y «Alumno: Juan» no se vuelve un ejercicio. Y trae lo
 * mismo que «Subir planilla» arriba de la revisión (`ExtrasPlanilla`): el
 * selector de semana si la planilla trae varias («Semana 1 | Semana 2»), y
 * el aviso de los datos que no se usaron. Sin eso, las otras semanas y los
 * datos de la persona desaparecían sin que el trainer lo viera. Un texto sin
 * tabuladores se lee como siempre.
 *
 * `textoInicial`: «Editar como texto» desde «Subir planilla» abre esta hoja
 * con la planilla ya escrita como texto.
 */
export function PegarTexto({
  diasActuales, hayEjercicios, biblioteca, onUsar, onCerrar, textoInicial = '',
}: {
  /** Cuántos días tiene la rutina ahora (para no pasar de 10 al agregar). */
  diasActuales: number;
  /** Si la rutina ya tiene algo: entonces se elige entre reemplazar y agregar. */
  hayEjercicios: boolean;
  biblioteca: readonly EjercicioBiblioteca[];
  onUsar: (leida: RutinaLeidaConNotas, modo: ModoPegar, extra: { semanas: number | null }) => void;
  onCerrar: () => void;
  textoInicial?: string;
}) {
  const t = useTextos();
  const p = t.rutinasEditor.pegar;
  const id = useId();
  const [texto, setTexto] = useState(textoInicial);
  const [semana, setSemana] = useState(1);
  // «Dar vuelta» tocado en estos ejercicios, para ESTE texto (si cambia, no valen más).
  const [vueltas, setVueltas] = useState<{ texto: string; lista: { dia: number; indice: number }[] }>({ texto: '', lista: [] });
  // Leer una rutina larga en cada letra traba el teclado de un celular
  // lento: la vista previa va un paso atrás de lo que se escribe.
  const diferido = useDeferredValue(texto);
  const resultado = useMemo(() => (diferido.trim() ? pegadoComoPlanilla(diferido, { semana }) : null), [diferido, semana]);
  const leida = useMemo(() => {
    if (!resultado) return null;
    const lista = vueltas.texto === diferido ? vueltas.lista : [];
    return lista.reduce((l, v) => darVueltaSeriesYReps(l, v.dia, v.indice), resultado.leida);
  }, [resultado, vueltas, diferido]);

  return (
    <Hoja
      titulo={p.titulo} onCerrar={onCerrar} tamano="grande"
      pie={(
        <PieLeida
          leida={leida} diasActuales={diasActuales} hayEjercicios={hayEjercicios}
          onUsar={(l, modo) => onUsar(l, modo, { semanas: resultado?.duracionSemanas ?? null })}
        />
      )}
    >
      <p className="text-[13.5px] leading-relaxed text-tinta/65">{p.explicacion}</p>

      <label htmlFor={id} className="etiqueta mt-4">{p.campo}</label>
      {/* Con los 16px de .campo: con menos, el iPhone hace zoom al tocarlo
          (globals.css). Más renglones a la vista, no letra más chica. */}
      <textarea
        id={id} className="campo min-h-[160px] resize-y font-mono leading-snug" rows={8}
        value={texto} placeholder={p.ejemplo} autoFocus spellCheck={false} autoCorrect="off"
        onChange={(ev) => setTexto(ev.target.value)}
      />

      <VistaLeida
        leida={leida} biblioteca={biblioteca} diasActuales={diasActuales} hayEjercicios={hayEjercicios}
        extra={resultado && leida ? (
          <ExtrasPlanilla
            resultado={resultado} leida={leida}
            onSemana={(n) => { setSemana(n); setVueltas({ texto: '', lista: [] }); }}
            onDarVuelta={(dia, indice) => setVueltas((v) => ({
              texto: diferido, lista: [...(v.texto === diferido ? v.lista : []), { dia, indice }],
            }))}
          />
        ) : undefined}
      />
    </Hoja>
  );
}
