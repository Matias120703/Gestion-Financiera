'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useIdioma, useTextos } from '@/i18n/cliente';
import type { EjercicioBiblioteca } from '@/lib/tipos-rutinas';
import {
  LARGOS, UNIDADES_CARGA, conUnidad, formatoDescanso, leerDescanso, normalizarCarga, normalizarReps, unidadDe,
} from '@/lib/rutina-texto';
import { buscarBase, claveEjercicio, sugerir } from '@/lib/ejercicios-base';
import { Hoja, MensajeError } from '../panel/Piezas';
import { enterPasaAlSiguiente, esEnterDeCampo } from '../panel/teclado';
import { TOPES, esDeLaBiblioteca, type EjercicioEditor } from './modelo';

/** Lo que devuelve la hoja: un ejercicio sin clave ni ids (los pone el editor). */
export interface DatosHoja {
  nombre: string;
  series: number | null;
  reps: string;
  carga: string;
  descanso_seg: number | null;
  nota: string;
  junto_al_anterior: boolean;
}

/** Los atajos de descanso, en segundos. */
const DESCANSOS = [30, 60, 90, 120, 180] as const;

/**
 * LA HOJA DE UN EJERCICIO (098): para agregar con detalle o retocar.
 *
 * El nombre se autocompleta con la biblioteca del negocio (los más usados
 * primero) y con la lista base en el idioma de la pantalla: se escribe
 * «sent» y aparece «Sentadilla con barra» aunque nunca se haya cargado. Si
 * el nombre no está en la biblioteca, se avisa que se suma: así la lista
 * no se llena de «Sentadila» sin que nadie lo note.
 *
 * La carga es texto libre («placa 7», «banda roja») con botones de unidad
 * que la escriben en el texto (`conUnidad`). Nunca se agrega una unidad
 * sola: si el trainer escribe «25» y no toca nada, queda «25».
 *
 * «Guardar y otro» agrega y deja la hoja lista para el siguiente, sin
 * cerrarla: cargar un día entero son seis toques de «Guardar y otro».
 *
 * NO ES UN FORMULARIO, A PROPÓSITO
 *
 * En el iPhone la tecla «siguiente» del teclado es un Enter, y un Enter
 * adentro de un <form> lo envía: el trainer escribía «Sentadilla», tocaba
 * «siguiente» para ir a las series y la hoja se cerraba con el ejercicio a
 * medio cargar. Acá el Enter pasa al campo que sigue (nombre → series →
 * repeticiones → carga → descanso → nota) y lo único que agrega es tocar
 * «Agregar», «Guardar y otro» o «Listo». En el nombre, con sugerencias a la
 * vista, el Enter elige la primera: «sent» + Enter es «Sentadilla con
 * barra», no un «sent» nuevo en la biblioteca.
 */
export function HojaEjercicio({
  inicial, puedeJunto, biblioteca, agregado, problema, onGuardar, onQuitar, onCerrar,
}: {
  /** El ejercicio que se edita, o null para uno nuevo. */
  inicial: EjercicioEditor | null;
  /** Hay un ejercicio antes: puede ir en superserie con él. */
  puedeJunto: boolean;
  biblioteca: readonly EjercicioBiblioteca[];
  /** El último que se agregó con «Guardar y otro», para confirmarlo arriba. */
  agregado?: string;
  /** Lo que frenó el guardado de la rutina en este ejercicio (una carga larga, por ejemplo). */
  problema?: string;
  onGuardar: (datos: DatosHoja, otro: boolean) => void;
  onQuitar?: () => void;
  onCerrar: () => void;
}) {
  const t = useTextos();
  const h = t.rutinasEditor.hoja;
  const idioma = useIdioma();
  const id = useId();
  const campoNombre = useRef<HTMLInputElement>(null);
  const campoSeries = useRef<HTMLInputElement>(null);
  const campoCarga = useRef<HTMLInputElement>(null);

  const nuevo = inicial === null;
  const descansoInicial = inicial?.descanso_seg ?? null;
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [series, setSeries] = useState(inicial?.series ? String(inicial.series) : '');
  const [reps, setReps] = useState(inicial?.reps ?? '');
  const [carga, setCarga] = useState(inicial?.carga ?? '');
  const [descanso, setDescanso] = useState<number | null>(descansoInicial);
  // Un descanso que no es de los atajos se ve en el campo libre, escrito.
  const [descansoLibre, setDescansoLibre] = useState(
    descansoInicial !== null && !(DESCANSOS as readonly number[]).includes(descansoInicial) ? formatoDescanso(descansoInicial) : '',
  );
  const [nota, setNota] = useState(inicial?.nota ?? '');
  const [junto, setJunto] = useState(inicial?.junto_al_anterior ?? false);
  const [enfocado, setEnfocado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState(problema ?? '');

  // Las sugerencias: los activos de la biblioteca primero, después la lista base.
  const propios = useMemo(() => biblioteca.filter((b) => b.activo).map((b) => b.nombre), [biblioteca]);
  const sugerencias = useMemo(() => {
    if (!enfocado) return [];
    const k = claveEjercicio(nombre);
    return sugerir(nombre, idioma, propios, 7).filter((s) => claveEjercicio(s.nombre) !== k).slice(0, 6);
  }, [enfocado, nombre, idioma, propios]);
  // El que ya estaba en la rutina es de la biblioteca aunque la lista no haya llegado.
  const elDeAntes = !!inicial?.ejercicio_id && claveEjercicio(inicial.nombre) === claveEjercicio(nombre);
  const esNuevoEnLaLista = !enfocado && nombre.trim() !== '' && !elDeAntes && !esDeLaBiblioteca(nombre, biblioteca);
  // Un nombre que ya se conoce entero (de la biblioteca o de la lista base):
  // el Enter lo respeta en vez de cambiarlo por la primera sugerencia.
  const nombreConocido = elDeAntes || esDeLaBiblioteca(nombre, biblioteca) || !!buscarBase(nombre);

  /** Enter en el nombre: con sugerencias a la vista elige la primera; después, a las series. */
  function enterEnNombre(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (!esEnterDeCampo(ev)) return;
    ev.preventDefault();
    if (sugerencias.length > 0 && !nombreConocido) setNombre(sugerencias[0].nombre);
    setEnfocado(false);
    campoSeries.current?.focus();
  }

  const unidad = unidadDe(carga);
  const libreLeido = descansoLibre.trim() ? leerDescanso(descansoLibre, 's') : null;
  const libreMalo = descansoLibre.trim() !== '' && libreLeido === null;

  function cambiarSeries(delta: -1 | 1) {
    const n = parseInt(series, 10);
    if (!Number.isFinite(n)) {
      // Desde vacío, «+» arranca en 3: lo más común en un gimnasio.
      if (delta > 0) setSeries('3');
      return;
    }
    const nuevoValor = n + delta;
    setSeries(nuevoValor < 1 ? '' : String(Math.min(TOPES.series, nuevoValor)));
  }

  function tocarUnidad(u: (typeof UNIDADES_CARGA)[number]) {
    setAviso('');
    if (u !== 'corporal' && !/\d/.test(carga)) {
      setAviso(h.cargaPrimeroNumero);
      campoCarga.current?.focus();
      return;
    }
    const nueva = conUnidad(carga, u);
    if (nueva.length <= LARGOS.carga) setCarga(nueva);
  }

  function elegirDescanso(seg: number | null) {
    setDescanso(seg);
    setDescansoLibre('');
  }

  function escribirDescanso(texto: string) {
    setDescansoLibre(texto);
    setDescanso(texto.trim() ? leerDescanso(texto, 's') : null);
  }

  /** La forma prolija («45s» → «45 s»), salvo que así no entre en el tope de la base. */
  const prolijo = (texto: string, normal: string, tope: number) => (normal.length <= tope ? normal : texto.trim());

  function guardar(otro: boolean) {
    setError('');
    if (!nombre.trim()) {
      setError(h.faltaNombre);
      campoNombre.current?.focus();
      return;
    }
    if (libreMalo) {
      setError(h.descansoNoEntendi);
      return;
    }
    const n = parseInt(series, 10);
    onGuardar({
      nombre: nombre.replace(/\s+/g, ' ').trim().slice(0, LARGOS.ejercicio),
      series: Number.isFinite(n) && n >= 1 ? Math.min(TOPES.series, n) : null,
      reps: prolijo(reps, normalizarReps(reps), LARGOS.reps),
      carga: prolijo(carga, normalizarCarga(carga), LARGOS.carga),
      descanso_seg: descanso,
      nota: nota.trim().slice(0, LARGOS.nota),
      junto_al_anterior: puedeJunto && junto,
    }, otro);
  }

  const chip = (encendido: boolean) => `${encendido ? 'chip-encendido' : 'chip-apagado'} px-3.5 text-[13.5px]`;

  return (
    <Hoja titulo={nuevo ? h.nuevo : h.editar} onCerrar={onCerrar}>
      {agregado && (
        <p role="status" className="mb-3 rounded-xl bg-verde-claro px-3 py-2 text-[13px] font-semibold text-verde-fuerte aparecer">
          ✓ {h.agregado(agregado)}
        </p>
      )}

      {/* Un Enter en cualquier campo pasa al siguiente (ver arriba). */}
      <div className="space-y-4" onKeyDown={enterPasaAlSiguiente}>
        {/* ---- nombre, con autocompletar ---- */}
        <div className="relative">
          <label htmlFor={`${id}-nombre`} className="etiqueta">{h.nombre}</label>
          <input
            ref={campoNombre} id={`${id}-nombre`} className="campo"
            value={nombre} maxLength={LARGOS.ejercicio} placeholder={h.nombreEjemplo}
            autoFocus={nuevo} autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false}
            enterKeyHint="next" role="combobox" aria-expanded={sugerencias.length > 0} aria-controls={`${id}-sugerencias`}
            onChange={(ev) => setNombre(ev.target.value)}
            onKeyDown={enterEnNombre}
            onFocus={() => setEnfocado(true)}
            // Con demora: tocar una sugerencia primero saca el foco del campo.
            onBlur={() => window.setTimeout(() => setEnfocado(false), 150)}
          />
          {sugerencias.length > 0 && (
            <ul
              id={`${id}-sugerencias`} role="listbox"
              className="mt-1.5 overflow-hidden rounded-xl border border-borde bg-superficie"
            >
              {sugerencias.map((s) => (
                <li key={`${s.propio ? 'p' : 'b'}:${s.nombre}`} role="option" aria-selected={false}>
                  <button
                    type="button"
                    // Que el campo no pierda el foco antes de elegir.
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => { setNombre(s.nombre); setEnfocado(false); campoSeries.current?.focus(); }}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 border-b border-borde/60 px-3.5 py-2 text-left text-[14.5px] last:border-b-0 hover:bg-arena"
                  >
                    <span className="min-w-0 truncate font-semibold">{s.nombre}</span>
                    <span className="shrink-0 text-[11.5px] text-tinta/45">
                      {s.propio ? h.deTuLista : s.grupo ? t.rutinasComun.grupos[s.grupo] : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {esNuevoEnLaLista && <p className="mt-1.5 text-[12px] text-tinta/50">{h.nuevoEnTuLista}</p>}
        </div>

        {/* ---- series y repeticiones ---- */}
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <div>
            <label htmlFor={`${id}-series`} className="etiqueta">{h.series}</label>
            <div className="flex items-center gap-1">
              <button
                type="button" onClick={() => cambiarSeries(-1)} aria-label={h.menos}
                className="icono-toque border border-borde text-[20px] text-tinta/70 hover:bg-arena"
              >
                −
              </button>
              <input
                ref={campoSeries} id={`${id}-series`} className="campo w-14 px-2 text-center tabular-nums"
                value={series} inputMode="numeric" pattern="[0-9]*" maxLength={2} enterKeyHint="next"
                onChange={(ev) => setSeries(ev.target.value.replace(/\D/g, ''))}
              />
              <button
                type="button" onClick={() => cambiarSeries(1)} aria-label={h.mas}
                className="icono-toque border border-borde text-[20px] text-tinta/70 hover:bg-arena"
              >
                +
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-reps`} className="etiqueta">{h.reps}</label>
            <input
              id={`${id}-reps`} className="campo" value={reps} maxLength={LARGOS.reps}
              placeholder={h.repsEjemplo} autoComplete="off" enterKeyHint="next"
              onChange={(ev) => setReps(ev.target.value)}
            />
          </div>
        </div>
        <div className="scroll-limpio -mx-5 -mt-2 flex gap-2 overflow-x-auto px-5">
          {h.atajosReps.map((a) => (
            <button key={a} type="button" onClick={() => setReps(a)} className={chip(reps.trim() === a)}>{a}</button>
          ))}
        </div>

        {/* ---- carga ---- */}
        <div>
          <label htmlFor={`${id}-carga`} className="etiqueta">{h.carga}</label>
          <input
            ref={campoCarga} id={`${id}-carga`} className="campo" value={carga} maxLength={LARGOS.carga}
            placeholder={h.cargaEjemplo} autoComplete="off" enterKeyHint="next"
            onChange={(ev) => { setCarga(ev.target.value); setAviso(''); }}
          />
          <div className="scroll-limpio -mx-5 mt-2 flex gap-2 overflow-x-auto px-5" role="group" aria-label={h.carga}>
            {UNIDADES_CARGA.map((u) => (
              <button key={u} type="button" onClick={() => tocarUnidad(u)} aria-pressed={unidad === u} className={chip(unidad === u)}>
                {t.rutinasComun.unidadesCarga[u]}
              </button>
            ))}
          </div>
          <p className={`mt-1.5 text-[12px] ${aviso ? 'font-medium text-ambar' : 'text-tinta/45'}`}>{aviso || h.cargaAyuda}</p>
        </div>

        {/* ---- descanso ---- */}
        <div>
          <p className="etiqueta" id={`${id}-descanso`}>{h.descanso}</p>
          <div className="scroll-limpio -mx-5 flex gap-2 overflow-x-auto px-5" role="group" aria-labelledby={`${id}-descanso`}>
            <button type="button" onClick={() => elegirDescanso(null)} className={chip(descanso === null && !descansoLibre.trim())}>
              {h.sinDescanso}
            </button>
            {DESCANSOS.map((s) => (
              <button key={s} type="button" onClick={() => elegirDescanso(s)} className={chip(descanso === s && !descansoLibre.trim())}>
                {s < 120 ? h.segundos(s) : h.minutos(s / 60)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={`${id}-libre`} className="shrink-0 text-[13px] font-semibold text-tinta/60">{h.descansoOtro}</label>
            <input
              id={`${id}-libre`} className="campo w-32" value={descansoLibre} maxLength={12}
              placeholder={h.descansoEjemplo} inputMode="text" autoComplete="off" enterKeyHint="next"
              onChange={(ev) => escribirDescanso(ev.target.value)}
            />
            {libreLeido !== null && (
              <span className="text-[13px] font-semibold tabular-nums text-verde-fuerte">{h.descansoEs(formatoDescanso(libreLeido))}</span>
            )}
          </div>
          {libreMalo && <p className="mt-1.5 text-[12px] font-medium text-rojo">{h.descansoNoEntendi}</p>}
        </div>

        {/* ---- nota ---- */}
        <div>
          <label htmlFor={`${id}-nota`} className="etiqueta">{h.nota}</label>
          <textarea
            id={`${id}-nota`} className="campo min-h-[72px] resize-y" rows={2}
            value={nota} maxLength={LARGOS.nota} placeholder={h.notaEjemplo}
            onChange={(ev) => setNota(ev.target.value)}
          />
          <p className="mt-1 text-[12px] font-medium text-ambar">{h.notaAyuda}</p>
        </div>

        {/* ---- superserie ---- */}
        {puedeJunto && (
          <button
            type="button" onClick={() => setJunto((v) => !v)} aria-pressed={junto}
            className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border border-borde px-3.5 py-2.5 text-left"
          >
            <span>
              <span className="block text-[14px] font-semibold">{h.junto}</span>
              <span className="block text-[12px] text-tinta/50">{h.juntoAyuda}</span>
            </span>
            <span
              aria-hidden
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${junto ? 'bg-verde' : 'bg-borde'}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-superficie shadow transition-all ${junto ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
          </button>
        )}

        <MensajeError texto={error} />

        {/* Fijos al pie de la hoja. Con el teclado abierto la hoja se achica
            a lo que queda a la vista (Hoja, en panel/Piezas.tsx), así que
            quedan justo arriba del teclado y no debajo. */}
        <div className="sticky bottom-0 -mx-5 flex items-center gap-2.5 border-t border-borde/70 bg-superficie px-5 pb-4 pt-3">
          {nuevo ? (
            <>
              <button type="button" onClick={() => guardar(true)} className="boton-suave min-h-[48px] flex-1">
                {h.guardarYOtro}
              </button>
              <button type="button" onClick={() => guardar(false)} className="boton-principal min-h-[48px] flex-1">{h.agregar}</button>
            </>
          ) : (
            <>
              {onQuitar && (
                <button type="button" onClick={onQuitar} className="min-h-[48px] px-2 text-[13.5px] font-semibold text-rojo">
                  {h.quitar}
                </button>
              )}
              <button type="button" onClick={() => guardar(false)} className="boton-principal ml-auto min-h-[48px] flex-1">{h.listo}</button>
            </>
          )}
        </div>
      </div>
    </Hoja>
  );
}
