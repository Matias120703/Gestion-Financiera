'use client';

import { useTextos } from '@/i18n/cliente';
import { cargaSinUnidad, resumenEjercicio, type EjercicioEditor } from './modelo';

/**
 * UN EJERCICIO DEL DÍA, COMPACTO (098).
 *
 * Arriba el número y el nombre; abajo «4 × 8-10 · 40 kg · 1:30» y los
 * botones ↑ ↓, que reemplazan el arrastrar (en el celular falla). Tocar el
 * nombre o el resumen abre la hoja para retocarlo: lo natural es tocar la
 * carga para cambiarla, y antes ese renglón no respondía (y el nombre solo,
 * sin nota, medía menos de 44 px). «⋯» abre lo que se usa menos: la
 * superserie, duplicar y quitar.
 *
 * Una carga que es solo un número lleva al lado «¿kg o lb?»: nunca se le
 * agrega una unidad sola, pero tampoco se deja pasar callado.
 */
export function TarjetaEjercicio({
  ejercicio: e, etiqueta, enGrupo, primero, ultimo, abierta,
  onEditar, onSubir, onBajar, onOpciones, onJunto, onDuplicar, onQuitar, puedeDuplicar,
}: {
  ejercicio: EjercicioEditor;
  /** «1», «2a», «2b». */
  etiqueta: string;
  /** Es parte de una superserie (el primero o uno que va junto). */
  enGrupo: boolean;
  primero: boolean;
  ultimo: boolean;
  /** Las opciones de «⋯» a la vista. */
  abierta: boolean;
  onEditar: () => void;
  onSubir: () => void;
  onBajar: () => void;
  onOpciones: () => void;
  onJunto: () => void;
  onDuplicar: () => void;
  onQuitar: () => void;
  puedeDuplicar: boolean;
}) {
  const t = useTextos();
  const x = t.rutinasEditor.tarjeta;
  const resumen = resumenEjercicio(e, t.rutinasComun.texto.series);
  const flecha = 'icono-toque text-[17px] text-tinta/55 hover:bg-arena disabled:opacity-25';

  return (
    // La superserie se ve con una franja verde a la izquierda de los que van juntos.
    <li
      className={`rounded-2xl border border-borde/70 bg-superficie ${enGrupo ? 'border-l-4 border-l-verde/60' : ''}`}
    >
      <button
        type="button" onClick={onEditar} aria-label={x.editar(e.nombre)}
        className="flex min-h-[44px] w-full items-start gap-2.5 px-3.5 pt-3 text-left"
      >
        <span className="mt-0.5 min-w-[1.75rem] shrink-0 rounded-lg bg-arena px-1.5 py-0.5 text-center text-[12.5px] font-bold tabular-nums text-tinta/60">
          {etiqueta}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[15px] font-bold leading-snug">{e.nombre}</span>
          {e.nota.trim() && (
            <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-tinta/50">{e.nota}</span>
          )}
        </span>
      </button>

      <div className="flex items-center gap-1 pb-1 pr-1.5">
        {/* El mismo toque que el nombre, para quien apunta a la carga. Fuera
            del orden del tabulador: con el teclado ya está el del nombre. */}
        <button
          type="button" onClick={onEditar} tabIndex={-1}
          className="flex min-h-[44px] min-w-0 flex-1 flex-wrap items-center gap-y-1 pl-3.5 text-left text-[13.5px] font-semibold tabular-nums text-tinta/70"
        >
          {resumen || <span className="font-normal text-tinta/35">—</span>}
          {cargaSinUnidad(e.carga) && (
            <span className="pastilla ml-1.5 bg-ambar-claro px-2 py-0.5 text-[11px] text-ambar">{x.sinUnidad}</span>
          )}
        </button>
        <button type="button" onClick={onSubir} disabled={primero} aria-label={x.subir} className={flecha}>↑</button>
        <button type="button" onClick={onBajar} disabled={ultimo} aria-label={x.bajar} className={flecha}>↓</button>
        <button
          type="button" onClick={onOpciones} aria-label={x.mas} aria-expanded={abierta}
          className={`icono-toque text-[18px] hover:bg-arena ${abierta ? 'bg-arena text-tinta' : 'text-tinta/55'}`}
        >
          ⋯
        </button>
      </div>

      {abierta && (
        <div className="flex flex-wrap gap-2 border-t border-borde/60 px-3 py-2.5">
          {!primero && (
            <button
              type="button" onClick={onJunto} aria-pressed={e.junto_al_anterior}
              className={`${e.junto_al_anterior ? 'chip-encendido' : 'chip-apagado'} px-3.5 text-[13px]`}
            >
              {e.junto_al_anterior ? x.separar : x.junto}
            </button>
          )}
          {puedeDuplicar && (
            <button type="button" onClick={onDuplicar} className="chip-apagado px-3.5 text-[13px]">{x.duplicar}</button>
          )}
          <button
            type="button" onClick={onQuitar}
            className="chip border-rojo/30 bg-superficie px-3.5 text-[13px] text-rojo"
          >
            {x.quitar}
          </button>
        </div>
      )}
    </li>
  );
}
