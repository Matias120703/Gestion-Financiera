'use client';

import { useId, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { LARGOS } from '@/lib/rutina-texto';
import type { EjercicioLeido } from '@/lib/tipos-rutinas';
import { etiquetasDelDia } from '../panel/utiles';
import { TOPES, type DiaEditor } from './modelo';
import { TarjetaEjercicio } from './TarjetaEjercicio';
import { RenglonRapido } from './RenglonRapido';

/**
 * UN DÍA DE LA RUTINA (098): su nombre, la entrada en calor, los
 * ejercicios y, al pie, el renglón rápido para seguir cargando.
 *
 * Las opciones del día (moverlo, duplicarlo, borrarlo) van plegadas detrás
 * de «⋯»: se usan poco, y a la vista le quitarían lugar a lo que se usa
 * siempre, que es escribir ejercicios.
 */
export function PanelDia({
  dia, indice, total, puedeDuplicar, loVe,
  onCambiar, onMover, onDuplicar, onBorrar,
  onEditar, onMoverEjercicio, onJunto, onDuplicarEjercicio, onQuitarEjercicio,
  onRenglon, onNuevo, onPegar,
}: {
  dia: DiaEditor;
  indice: number;
  total: number;
  /** Hay lugar para un día más (hasta 10). */
  puedeDuplicar: boolean;
  /** «Lo ve Ana»: las notas del día terminan en su link. */
  loVe: string;
  onCambiar: (cambio: { nombre?: string; notas?: string }) => void;
  onMover: (delta: -1 | 1) => void;
  onDuplicar: () => void;
  onBorrar: () => void;
  onEditar: (j: number) => void;
  onMoverEjercicio: (j: number, delta: -1 | 1) => void;
  onJunto: (j: number) => void;
  onDuplicarEjercicio: (j: number) => void;
  onQuitarEjercicio: (j: number) => void;
  onRenglon: (leido: EjercicioLeido) => void;
  onNuevo: () => void;
  onPegar: () => void;
}) {
  const t = useTextos();
  const d = t.rutinasEditor.dias;
  const e = t.rutinasEditor;
  const id = useId();
  const [opciones, setOpciones] = useState(false);
  const [conNotas, setConNotas] = useState(false);
  // Las opciones de un solo ejercicio a la vista, por su clave.
  const [abierta, setAbierta] = useState<string | null>(null);

  const etiquetas = etiquetasDelDia(dia.ejercicios);
  const lleno = dia.ejercicios.length >= TOPES.ejerciciosPorDia;
  const verNotas = conNotas || dia.notas.trim() !== '';
  const opcion = 'chip-apagado px-3.5 text-[13px] disabled:opacity-40';

  return (
    <section className="tarjeta p-4" aria-labelledby={`${id}-nombre`}>
      {/* ---- el nombre del día y sus opciones ---- */}
      <label htmlFor={`${id}-nombre`} className="etiqueta">{d.nombre}</label>
      <div className="flex items-center gap-2">
        <input
          id={`${id}-nombre`} className="campo min-w-0 font-semibold"
          value={dia.nombre} maxLength={LARGOS.nombreDia}
          placeholder={d.porDefecto(indice)} autoComplete="off" autoCapitalize="sentences"
          onChange={(ev) => onCambiar({ nombre: ev.target.value })}
        />
        <button
          type="button" onClick={() => setOpciones((v) => !v)} aria-expanded={opciones} aria-label={d.opciones}
          className={`icono-toque shrink-0 text-[18px] hover:bg-arena ${opciones ? 'bg-arena text-tinta' : 'text-tinta/55'}`}
        >
          ⋯
        </button>
      </div>

      {opciones && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" disabled={indice === 0} onClick={() => onMover(-1)} className={opcion}>← {d.antes}</button>
          <button type="button" disabled={indice === total - 1} onClick={() => onMover(1)} className={opcion}>{d.despues} →</button>
          <button type="button" disabled={!puedeDuplicar} onClick={onDuplicar} className={opcion}>{d.duplicar}</button>
          <button
            type="button" disabled={total <= 1} onClick={() => { setOpciones(false); onBorrar(); }}
            className="chip border-rojo/30 bg-superficie px-3.5 text-[13px] text-rojo disabled:opacity-40"
          >
            {d.borrar}
          </button>
        </div>
      )}

      {/* ---- entrada en calor (la ve el cliente) ---- */}
      {verNotas ? (
        <div className="mt-3">
          <label htmlFor={`${id}-notas`} className="etiqueta">{d.notas}</label>
          <textarea
            id={`${id}-notas`} className="campo min-h-[64px] resize-y" rows={2}
            value={dia.notas} maxLength={LARGOS.notasDia} placeholder={d.notasEjemplo}
            autoFocus={conNotas && !dia.notas}
            onChange={(ev) => onCambiar({ notas: ev.target.value })}
          />
          <p className="mt-1 text-[12px] font-medium text-ambar">{loVe}</p>
        </div>
      ) : (
        <button type="button" onClick={() => setConNotas(true)} className="boton-texto mt-2 min-h-[44px]">
          {d.agregarNotas}
        </button>
      )}

      {/* ---- los ejercicios ---- */}
      {dia.ejercicios.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-borde px-4 py-5 text-center">
          <p className="text-[14px] font-bold">{d.vacio}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-tinta/55">{d.vacioDetalle}</p>
        </div>
      ) : (
        <ol className="mt-3 space-y-2">
          {dia.ejercicios.map((ej, j) => (
            <TarjetaEjercicio
              key={ej.clave}
              ejercicio={ej}
              etiqueta={etiquetas[j]}
              enGrupo={ej.junto_al_anterior || !!dia.ejercicios[j + 1]?.junto_al_anterior}
              primero={j === 0}
              ultimo={j === dia.ejercicios.length - 1}
              abierta={abierta === ej.clave}
              puedeDuplicar={!lleno}
              onEditar={() => onEditar(j)}
              onSubir={() => onMoverEjercicio(j, -1)}
              onBajar={() => onMoverEjercicio(j, 1)}
              onOpciones={() => setAbierta((a) => (a === ej.clave ? null : ej.clave))}
              onJunto={() => onJunto(j)}
              onDuplicar={() => onDuplicarEjercicio(j)}
              onQuitar={() => { setAbierta(null); onQuitarEjercicio(j); }}
            />
          ))}
        </ol>
      )}

      {/* ---- el renglón rápido y las otras formas de cargar ---- */}
      <RenglonRapido onAgregar={onRenglon} lleno={lleno} />
      <div className="mt-2 flex flex-wrap items-center gap-x-4">
        {!lleno && (
          <button type="button" onClick={onNuevo} className="boton-texto min-h-[44px]">{e.renglon.conDetalle}</button>
        )}
        <button type="button" onClick={onPegar} className="boton-texto min-h-[44px]">{e.renglon.pegarTexto}</button>
      </div>
    </section>
  );
}
