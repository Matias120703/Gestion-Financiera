'use client';

import { useMemo, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';
import { claveEjercicio, GRUPOS_EJERCICIO } from '@/lib/ejercicios-base';
import { LARGOS } from '@/lib/rutina-texto';
import { Vacio } from '@/components/Piezas';
import type { EjercicioBiblioteca, GrupoEjercicio } from '@/lib/tipos-rutinas';
import { Confirmar, Hoja, MensajeError, MensajeListo } from './panel/Piezas';
import { useAccion } from './panel/useAccion';

/** Lo mismo que el check de `ejercicios.video_url`. */
const VIDEO = /^https:\/\/\S+$/;
const LARGO_VIDEO = 300;
const LARGO_INDICACIONES = 500;

/**
 * LA BIBLIOTECA DE EJERCICIOS (098), pestaña Ejercicios de /rutinas.
 *
 * Se arma sola: cada ejercicio que se escribe en una rutina queda acá. Lo
 * que el trainer hace en esta pestaña es completarla («cómo se hace» y un
 * video, que el cliente ve en su link) y arreglarla.
 *
 * ARREGLAR UN DUPLICADO ES UNIR
 *
 * «Sentadila» y «Sentadilla» terminan siendo dos ejercicios. Renombrar el
 * mal escrito al nombre del bueno no puede chocar con un error: los junta
 * (la base pasa las rutinas y el historial de cargas al que queda). Como
 * eso cambia rutinas de muchos clientes, antes se pregunta diciendo en
 * cuántas, y es del dueño o de un administrador. Se detecta con la misma
 * clave que usa la base (sin tildes, mayúsculas ni espacios de más).
 *
 * Apagar es la forma de sacar uno que se usa: deja de sugerirse al armar,
 * pero las rutinas que ya lo tienen no cambian. Borrar de verdad, solo el
 * que no está en ninguna rutina.
 */
export function BibliotecaEjercicios({
  empresaId, esAdmin, ejercicios,
}: {
  empresaId: string;
  esAdmin: boolean;
  ejercicios: EjercicioBiblioteca[];
}) {
  const t = useTextos();
  const b = t.rutinasPanel.biblioteca;
  const [busca, setBusca] = useState('');
  const [abierto, setAbierto] = useState<EjercicioBiblioteca | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState('');

  const texto = claveEjercicio(busca);
  // Los apagados al final: son los que ya no se usan para armar.
  const visibles = useMemo(() => {
    const lista = texto ? ejercicios.filter((e) => claveEjercicio(e.nombre).includes(texto)) : ejercicios;
    return [...lista].sort((a, b2) => Number(b2.activo) - Number(a.activo));
  }, [ejercicios, texto]);

  return (
    <div className="space-y-4">
      <p className="text-[13.5px] leading-relaxed text-tinta/60">{b.explicacion}</p>

      <div className="flex gap-2">
        <input
          className="campo flex-1" placeholder={b.buscar} value={busca} aria-label={b.buscar}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button type="button" onClick={() => { setAviso(''); setAbierto('nuevo'); }} className="boton-principal min-h-[44px] shrink-0 px-4">
          {b.nuevo}
        </button>
      </div>

      <MensajeListo texto={aviso} />

      <div className="tarjeta overflow-hidden">
        {ejercicios.length === 0 ? (
          <Vacio titulo={b.ninguno} detalle={b.ningunoDetalle} />
        ) : visibles.length === 0 ? (
          <Vacio titulo={b.nadaCoincide} detalle={b.nadaCoincideDetalle(busca.trim())} />
        ) : (
          <ul className="divide-y divide-borde">
            {visibles.map((e) => (
              <li key={e.id}>
                <button
                  type="button" onClick={() => { setAviso(''); setAbierto(e); }}
                  className={`flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-arena/60 ${e.activo ? '' : 'opacity-60'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">{e.nombre}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-tinta/55">
                      {[
                        e.grupo ? t.rutinasComun.grupos[e.grupo] : '',
                        b.usos(e.usos),
                        e.video_url ? b.conVideo : '',
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {!e.activo && <span className="pastilla shrink-0 bg-arena text-tinta/55">{b.apagado}</span>}
                  <span aria-hidden className="shrink-0 text-[18px] text-tinta/30">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {abierto && (
        <HojaEjercicio
          empresaId={empresaId}
          esAdmin={esAdmin}
          ejercicio={abierto === 'nuevo' ? null : abierto}
          todos={ejercicios}
          onCerrar={() => setAbierto(null)}
          onListo={(mensaje) => { setAbierto(null); setAviso(mensaje); }}
        />
      )}
    </div>
  );
}

function HojaEjercicio({
  empresaId, esAdmin, ejercicio, todos, onCerrar, onListo,
}: {
  empresaId: string;
  esAdmin: boolean;
  /** Null: uno nuevo. */
  ejercicio: EjercicioBiblioteca | null;
  todos: EjercicioBiblioteca[];
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const t = useTextos();
  const b = t.rutinasPanel.biblioteca;
  const { ocupado, error, setError, correr } = useAccion();

  const [nombre, setNombre] = useState(ejercicio?.nombre ?? '');
  const [grupo, setGrupo] = useState<GrupoEjercicio | null>(ejercicio?.grupo ?? null);
  const [indicaciones, setIndicaciones] = useState(ejercicio?.indicaciones ?? '');
  const [video, setVideo] = useState(ejercicio?.video_url ?? '');
  const [activo, setActivo] = useState(ejercicio?.activo ?? true);
  const [errorNombre, setErrorNombre] = useState('');
  const [errorVideo, setErrorVideo] = useState('');
  const [uniendo, setUniendo] = useState<EjercicioBiblioteca | null>(null);
  const [borrando, setBorrando] = useState(false);

  const limpio = nombre.trim().replace(/\s+/g, ' ');
  /** Otro ejercicio de la lista que la base tomaría por el mismo. */
  const otro = limpio
    ? todos.find((e) => e.id !== ejercicio?.id && claveEjercicio(e.nombre) === claveEjercicio(limpio)) ?? null
    : null;
  const renombrado = !!ejercicio && limpio !== ejercicio.nombre;

  async function guardar() {
    const r = await correr(() => clienteNavegador().rpc('guardar_ejercicio', {
      p_empresa: empresaId,
      p_nombre: limpio,
      p_grupo: grupo,
      p_indicaciones: indicaciones.trim(),
      p_video: video.trim() || null,
      p_activo: activo,
      p_id: ejercicio?.id ?? null,
    }));
    if (!r.ok) return;
    const d = r.data as { id: string; unido: boolean } | null;
    if (d?.unido && uniendo) onListo(b.unidos(uniendo.nombre));
    else if (!ejercicio) onListo(b.creado(limpio));
    else onListo(b.guardado);
  }

  function alGuardar() {
    setError('');
    setErrorNombre('');
    setErrorVideo('');
    let mal = false;
    if (!limpio) { setErrorNombre(b.faltaNombre); mal = true; }
    const v = video.trim();
    if (v && (!VIDEO.test(v) || v.length > LARGO_VIDEO)) { setErrorVideo(b.videoMalo); mal = true; }
    if (mal) return;

    if (otro) {
      // Nuevo con un nombre que ya está: no hay nada que unir, ya existe.
      if (!ejercicio) { setErrorNombre(b.yaExiste); return; }
      // Renombrar al nombre de otro es unirlos: del dueño o un admin.
      if (!esAdmin) { setErrorNombre(b.unirEsDelDueno); return; }
      setUniendo(otro);
      return;
    }
    void guardar();
  }

  async function borrar() {
    if (!ejercicio) return;
    const r = await correr(() => clienteNavegador().rpc('borrar_ejercicio', { p_empresa: empresaId, p_id: ejercicio.id }));
    if (r.ok) onListo(b.borrado);
  }

  if (uniendo && ejercicio) {
    return (
      <Confirmar
        titulo={b.unirPregunta}
        detalle={b.unirDetalle(ejercicio.nombre, uniendo.nombre, ejercicio.usos)}
        si={b.siUnir} ocupado={ocupado} error={error}
        onSi={guardar} onNo={() => setUniendo(null)}
      />
    );
  }

  if (borrando && ejercicio) {
    return (
      <Confirmar
        titulo={b.borrarPregunta(ejercicio.nombre)} detalle={b.borrarDetalle}
        si={b.siBorrar} peligro ocupado={ocupado} error={error}
        onSi={borrar} onNo={() => setBorrando(false)}
      />
    );
  }

  return (
    <Hoja titulo={ejercicio ? ejercicio.nombre : b.nuevoTitulo} onCerrar={onCerrar} bloqueada={ocupado}>
      <div className="space-y-4">
        <label className="block">
          <span className="etiqueta">{b.nombre}</span>
          <input
            className="campo" value={nombre} maxLength={LARGOS.ejercicio} autoFocus={!ejercicio}
            onChange={(e) => { setNombre(e.target.value); setErrorNombre(''); }}
            aria-invalid={!!errorNombre}
          />
          {errorNombre && <span role="alert" className="mt-1 block text-[12.5px] font-medium text-rojo">{errorNombre}</span>}
          {!errorNombre && renombrado && ejercicio.usos > 0 && !otro && (
            <span className="mt-1 block text-[12.5px] text-tinta/55">{b.renombraTodas(ejercicio.usos)}</span>
          )}
        </label>

        <div>
          <span className="etiqueta">{b.grupo}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setGrupo(null)} className={grupo === null ? 'chip-encendido' : 'chip-apagado'}>
              {b.sinGrupo}
            </button>
            {GRUPOS_EJERCICIO.map((g) => (
              <button key={g} type="button" onClick={() => setGrupo(g)} className={grupo === g ? 'chip-encendido' : 'chip-apagado'}>
                {t.rutinasComun.grupos[g]}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="etiqueta">{b.comoSeHace} <span className="font-normal text-tinta/45">{b.opcional}</span></span>
          <textarea
            className="campo min-h-[96px] resize-y" value={indicaciones} maxLength={LARGO_INDICACIONES}
            placeholder={b.comoSeHaceEjemplo} onChange={(e) => setIndicaciones(e.target.value)}
          />
          <span className="mt-1 block text-[12.5px] text-tinta/55">{b.comoSeHaceAyuda}</span>
        </label>

        <label className="block">
          <span className="etiqueta">{b.video} <span className="font-normal text-tinta/45">{b.opcional}</span></span>
          <input
            className="campo" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="https://" value={video} maxLength={LARGO_VIDEO}
            onChange={(e) => { setVideo(e.target.value); setErrorVideo(''); }}
            aria-invalid={!!errorVideo}
          />
          {errorVideo
            ? <span role="alert" className="mt-1 block text-[12.5px] font-medium text-rojo">{errorVideo}</span>
            : <span className="mt-1 block text-[12.5px] text-tinta/55">{b.videoAyuda}</span>}
        </label>

        {/* Apagar no borra: se deja de sugerir, y las rutinas que lo usan siguen igual. */}
        {ejercicio && (
          <div className="rounded-2xl bg-arena px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-semibold">{activo ? b.prendido : b.apagado}</span>
              <button
                type="button" onClick={() => setActivo(!activo)} role="switch" aria-checked={activo}
                className={`${activo ? 'chip-apagado' : 'chip-encendido'} min-w-[96px]`}
              >
                {activo ? b.apagar : b.prender}
              </button>
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-tinta/55">{b.apagarAyuda}</p>
          </div>
        )}

        <MensajeError texto={error} />

        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onCerrar} disabled={ocupado} className="boton-suave min-h-[48px]">{t.comun.cancelar}</button>
          <button type="button" onClick={alGuardar} disabled={ocupado} className="boton-principal min-h-[48px]">
            {ocupado ? t.comun.guardando : t.comun.guardar}
          </button>
        </div>

        {ejercicio && esAdmin && ejercicio.usos === 0 && (
          <button
            type="button" onClick={() => { setError(''); setBorrando(true); }} disabled={ocupado}
            className="inline-flex min-h-[44px] w-full items-center justify-center text-[13.5px] font-semibold text-tinta/45 hover:text-rojo"
          >
            {b.borrar}
          </button>
        )}
      </div>
    </Hoja>
  );
}
