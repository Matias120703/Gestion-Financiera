'use client';

import { useDeferredValue, useId, useMemo, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { leerRutina, type RutinaLeidaConNotas } from '@/lib/rutina-texto';
import type { EjercicioBiblioteca } from '@/lib/tipos-rutinas';
import { Hoja } from '../panel/Piezas';
import { etiquetasDelDia } from '../panel/utiles';
import { TOPES, nombresNuevos, resumenEjercicio } from './modelo';

export type ModoPegar = 'reemplazar' | 'agregar';

/**
 * «PEGAR TEXTO» (098): la rutina que el trainer ya tiene escrita.
 *
 * Un trainer no arranca de cero: la tiene en Notas, en un Excel o en un
 * chat. Se pega entera y, antes de usarla, se ve lo que se entendió —los
 * días con sus ejercicios— y, aparte y en ámbar, los renglones que NO se
 * entendieron, tal cual: el lector (`leerRutina`) nunca inventa, y lo que
 * no pudo leer no se pierde en silencio.
 *
 * También dice cuántos ejercicios nuevos se van a sumar a la biblioteca:
 * un renglón mal leído que se usa queda en la lista para siempre, y es
 * mejor verlo antes.
 */
export function PegarTexto({
  diasActuales, hayEjercicios, biblioteca, onUsar, onCerrar,
}: {
  /** Cuántos días tiene la rutina ahora (para no pasar de 10 al agregar). */
  diasActuales: number;
  /** Si la rutina ya tiene algo: entonces se elige entre reemplazar y agregar. */
  hayEjercicios: boolean;
  biblioteca: readonly EjercicioBiblioteca[];
  onUsar: (leida: RutinaLeidaConNotas, modo: ModoPegar) => void;
  onCerrar: () => void;
}) {
  const t = useTextos();
  const p = t.rutinasEditor.pegar;
  const id = useId();
  const [texto, setTexto] = useState('');
  // Leer una rutina larga en cada letra traba el teclado de un celular
  // lento: la vista previa va un paso atrás de lo que se escribe.
  const diferido = useDeferredValue(texto);
  const leida = useMemo(() => (diferido.trim() ? leerRutina(diferido) : null), [diferido]);

  const ejercicios = leida ? leida.dias.reduce((s, d) => s + d.ejercicios.length, 0) : 0;
  const nuevos = useMemo(
    () => (leida ? nombresNuevos(leida.dias.flatMap((d) => d.ejercicios.map((e) => e.nombre)), biblioteca) : []),
    [leida, biblioteca],
  );
  const nombreDia = (nombre: string, i: number) => nombre.trim() || t.rutinasEditor.dias.porDefecto(i);
  const diaLleno = leida?.dias.findIndex((d) => d.ejercicios.length > TOPES.ejerciciosPorDia) ?? -1;
  const diasAl = (modo: ModoPegar) => (leida ? leida.dias.length + (modo === 'agregar' ? diasActuales : 0) : 0);
  const problema = !leida || ejercicios === 0
    ? ''
    : diaLleno >= 0
      ? p.demasiadosEjercicios(nombreDia(leida.dias[diaLleno].nombre, diaLleno))
      : diasAl('reemplazar') > TOPES.dias
        ? p.demasiadosDias(diasAl('reemplazar'))
        : '';
  const listo = !!leida && ejercicios > 0 && !problema;
  const puedeAgregar = hayEjercicios && listo && diasAl('agregar') <= TOPES.dias;
  // Reemplazar entra y agregar no: se dice por qué ese botón no anda.
  const avisoAgregar = hayEjercicios && listo && !puedeAgregar ? p.demasiadosDias(diasAl('agregar')) : '';

  return (
    <Hoja titulo={p.titulo} onCerrar={onCerrar}>
      <p className="text-[13.5px] leading-relaxed text-tinta/65">{p.explicacion}</p>

      <label htmlFor={id} className="etiqueta mt-4">{p.campo}</label>
      {/* Con los 16px de .campo: con menos, el iPhone hace zoom al tocarlo
          (globals.css). Más renglones a la vista, no letra más chica. */}
      <textarea
        id={id} className="campo min-h-[160px] resize-y font-mono leading-snug" rows={8}
        value={texto} placeholder={p.ejemplo} autoFocus spellCheck={false} autoCorrect="off"
        onChange={(ev) => setTexto(ev.target.value)}
      />

      {leida && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <p className={`text-[14px] font-bold ${ejercicios ? 'text-verde-fuerte' : 'text-tinta/55'}`}>
            {ejercicios ? p.entendi(leida.dias.length, ejercicios) : p.nada}
          </p>

          {leida.nombre?.trim() && (
            <p className="text-[13px] text-tinta/60">
              {p.nombre} <span className="font-bold text-tinta">«{leida.nombre.trim()}»</span>
            </p>
          )}

          {leida.notas.trim() && (
            <div className="rounded-xl bg-arena px-3 py-2.5">
              <p className="text-[12px] font-semibold text-tinta/55">{p.notas}</p>
              <p className="mt-0.5 whitespace-pre-line text-[13px] text-tinta/80">{leida.notas}</p>
            </div>
          )}

          {ejercicios > 0 && (
            <ul className="space-y-2.5">
              {leida.dias.map((d, i) => {
                const etiquetas = etiquetasDelDia(d.ejercicios);
                return (
                  <li key={i} className="rounded-xl border border-borde/70 px-3 py-2.5">
                    <p className="text-[14px] font-bold">{nombreDia(d.nombre, i)}</p>
                    {d.notas.trim() && <p className="mt-0.5 whitespace-pre-line text-[12.5px] italic text-tinta/55">{d.notas}</p>}
                    <ol className="mt-1.5 space-y-1">
                      {d.ejercicios.map((e, j) => {
                        const resumen = resumenEjercicio({ clave: '', ...e }, t.rutinasComun.texto.series);
                        return (
                          <li key={j} className="flex gap-2 text-[13px] leading-snug">
                            <span className="w-7 shrink-0 text-right font-semibold tabular-nums text-tinta/40">{etiquetas[j]}</span>
                            <span className="min-w-0">
                              <span className="font-semibold">{e.nombre}</span>
                              {resumen && <span className="text-tinta/60"> · {resumen}</span>}
                              {e.nota && <span className="block text-[12px] text-tinta/45">{e.nota}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </li>
                );
              })}
            </ul>
          )}

          {leida.noEntendidas.length > 0 && (
            <div className="rounded-xl bg-ambar-claro px-3 py-2.5">
              <p className="text-[12.5px] font-bold text-ambar">{p.noEntendi}</p>
              <ul className="mt-1 space-y-0.5">
                {leida.noEntendidas.map((l, i) => (
                  <li key={i} className="break-words font-mono text-[12.5px] text-tinta/75">{l}</li>
                ))}
              </ul>
            </div>
          )}

          {nuevos.length > 0 && <p className="text-[12.5px] text-tinta/55">{p.nuevos(nuevos.length)}</p>}
          {problema && <p role="alert" className="text-[13px] font-medium text-rojo">{problema}</p>}
          {avisoAgregar && <p className="text-[12.5px] text-tinta/55">{avisoAgregar}</p>}
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 mt-4 flex flex-col gap-2 border-t border-borde/70 bg-superficie px-5 pb-4 pt-3 sm:flex-row">
        {hayEjercicios ? (
          <>
            <button
              type="button" disabled={!puedeAgregar} onClick={() => leida && onUsar(leida, 'agregar')}
              className="boton-suave min-h-[48px] flex-1"
            >
              {p.agregar}
            </button>
            <button
              type="button" disabled={!listo} onClick={() => leida && onUsar(leida, 'reemplazar')}
              className="boton-principal min-h-[48px] flex-1"
            >
              {p.reemplazar}
            </button>
          </>
        ) : (
          <button
            type="button" disabled={!listo} onClick={() => leida && onUsar(leida, 'reemplazar')}
            className="boton-principal min-h-[48px] w-full"
          >
            {p.usar}
          </button>
        )}
      </div>
    </Hoja>
  );
}
