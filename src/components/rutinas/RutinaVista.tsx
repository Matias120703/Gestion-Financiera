'use client';

import { useEffect, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { formatoDescanso } from '@/lib/rutina-texto';
import type { DiaDeRutina } from '@/lib/tipos-rutinas';
import { etiquetasDelDia, seriesPorReps } from './panel/utiles';

/**
 * UNA RUTINA EN LECTURA (098): la carpeta del cliente, las anteriores y
 * cualquier pantalla que la quiera mostrar sin editarla.
 *
 * Un día por vez, con pestañas grandes: así la mira un trainer con el
 * celular en una mano, entre serie y serie. Cada ejercicio con su número
 * («1», «2a», «2b»): una superserie comparte el número y se marca con una
 * línea al costado, como en la planilla de cualquier gimnasio.
 *
 * Muestra solo lo que está en la rutina, que es lo que ve el cliente. «Salud
 * y lesiones» nunca pasa por acá: va aparte, en ámbar, en la carpeta.
 */
export function RutinaVista({
  dias, notas = '',
}: {
  dias: DiaDeRutina[];
  /** Las indicaciones generales de la rutina (las ve el cliente). */
  notas?: string;
}) {
  const t = useTextos();
  const v = t.rutinasPanel.vista;
  const txt = t.rutinasComun.texto;

  const ordenados = [...dias].sort((a, b) => a.orden - b.orden);
  const [elegido, setElegido] = useState(0);
  // Si la rutina cambió y tiene menos días, no quedar parado en uno que no existe.
  useEffect(() => { if (elegido >= ordenados.length) setElegido(0); }, [elegido, ordenados.length]);

  const dia = ordenados[Math.min(elegido, Math.max(0, ordenados.length - 1))];
  const notasGenerales = notas.trim();

  return (
    <div>
      {notasGenerales && (
        <div className="mb-3 rounded-2xl bg-arena px-3.5 py-3">
          <p className="text-[12px] font-semibold text-tinta/55">{t.rutinasPanel.carpeta.indicaciones}</p>
          <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-tinta/80">{notasGenerales}</p>
        </div>
      )}

      {ordenados.length === 0 && <p className="py-2 text-[13.5px] text-tinta/50">{v.sinDias}</p>}

      {/* Pestañas: con un solo día no hace falta elegir. Se deslizan de
          costado si son muchas, sin achicar la zona para tocar. */}
      {ordenados.length > 1 && (
        <div role="tablist" className="scroll-limpio -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {ordenados.map((d, i) => (
            <button
              key={d.id} type="button" role="tab" aria-selected={i === elegido}
              onClick={() => setElegido(i)}
              className={`${i === elegido ? 'chip-encendido' : 'chip-apagado'} max-w-[220px]`}
            >
              <span className="min-w-0 truncate">{d.nombre}</span>
            </button>
          ))}
        </div>
      )}

      {dia && (
        <div className="mt-2" role="tabpanel">
          {ordenados.length === 1 && <p className="text-[14px] font-bold">{dia.nombre}</p>}
          {dia.notas.trim() && (
            <p className="mt-1 whitespace-pre-line text-[13px] italic leading-relaxed text-tinta/60">{dia.notas.trim()}</p>
          )}
          {dia.ejercicios.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-tinta/50">{v.sinEjercicios}</p>
          ) : (
            <ListaEjercicios dia={dia} txt={txt} superserie={v.superserie} verComoSeHace={t.rutinasComun.acciones.verComoSeHace} />
          )}
        </div>
      )}
    </div>
  );
}

function ListaEjercicios({
  dia, txt, superserie, verComoSeHace,
}: {
  dia: DiaDeRutina;
  txt: { series: string; descanso: string };
  superserie: string;
  verComoSeHace: string;
}) {
  const ejercicios = [...dia.ejercicios].sort((a, b) => a.orden - b.orden);
  const etiquetas = etiquetasDelDia(ejercicios);

  return (
    <ol className="mt-2 space-y-2">
      {ejercicios.map((e, i) => {
        const enGrupo = /[a-z]$/.test(etiquetas[i]);
        const abreGrupo = etiquetas[i].endsWith('a');
        const partes = [
          seriesPorReps(e.series, e.reps, txt.series),
          e.carga.trim(),
          e.descanso_seg !== null ? `${txt.descanso} ${formatoDescanso(e.descanso_seg)}` : '',
        ].filter(Boolean);
        return (
          <li
            key={e.id}
            className={`rounded-2xl bg-arena/70 px-3.5 py-3 ${enGrupo ? 'border-l-4 border-verde/60' : ''}`}
          >
            {abreGrupo && <p className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-verde-fuerte">{superserie}</p>}
            <div className="flex items-baseline gap-2.5">
              <span className="w-7 shrink-0 text-[13px] font-bold tabular-nums text-tinta/45">{etiquetas[i]}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[15px] font-bold leading-snug">{e.nombre}</p>
                {partes.length > 0 && (
                  <p className="mt-0.5 text-[13.5px] tabular-nums text-tinta/75">{partes.join(' · ')}</p>
                )}
                {e.nota.trim() && (
                  <p className="mt-1 whitespace-pre-line text-[12.5px] italic leading-snug text-tinta/55">{e.nota.trim()}</p>
                )}
                {e.video_url && (
                  <a
                    href={e.video_url} target="_blank" rel="noopener noreferrer"
                    className="boton-texto mt-1 inline-flex min-h-[44px] items-center text-[13px]"
                  >
                    {verComoSeHace} ↗
                  </a>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
