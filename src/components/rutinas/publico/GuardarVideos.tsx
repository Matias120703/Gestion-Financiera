'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { bytesPendientes } from '@/lib/rutina-sin-senal';
import { formatoMb } from '@/lib/video-reglas';
import type { ClipPublico } from '@/lib/tipos-rutinas';
import { EVENTO_COPIA, bajarYGuardar, clipsGuardados, motivoDeClip } from './clips';
import { lugarLibre, pedirPersistencia } from './sinSenal';

type Aviso = 'sinLugar' | 'senal' | 'otro';

/**
 * «GUARDAR LOS VIDEOS PARA VERLOS SIN SEÑAL» (pregunta 7 de Matías).
 *
 * Los videos del entrenador se guardan solos cuando el alumno los mira con
 * señal. Este botón guarda los que faltan de una vez, antes de ir a un
 * gimnasio sin señal, diciendo cuánto pesan: 60-250 MB de sus datos nunca
 * se gastan sin que lo decida. Se bajan de a uno, con «Parar».
 *
 * Qué está guardado se mira después de montar (el servidor no lo sabe), y
 * se vuelve a mirar cuando algo cambia lo guardado (EVENTO_COPIA): un video
 * que se miró, la copia borrada.
 */
export function GuardarVideos({ token, clips }: { token: string; clips: ClipPublico[] }) {
  const r = useTextos().rutinaPublica;
  const [guardados, setGuardados] = useState<Set<string> | null>(null);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const control = useRef<AbortController | null>(null);

  const mirar = useCallback(async () => {
    setGuardados(await clipsGuardados(token));
  }, [token]);

  useEffect(() => {
    void mirar();
    function alCambiar(e: Event) {
      if ((e as CustomEvent).detail === token) void mirar();
    }
    window.addEventListener(EVENTO_COPIA, alCambiar);
    return () => window.removeEventListener(EVENTO_COPIA, alCambiar);
  }, [token, mirar]);

  // Al irse: cortar la bajada que esté en curso.
  useEffect(() => () => control.current?.abort(), []);

  if (clips.length === 0 || guardados === null) return null;

  const { cuantos, bytes } = bytesPendientes(clips, guardados);

  async function guardarTodos() {
    if (progreso || !guardados) return;
    setAviso(null);
    const faltan = clips.filter((c) => !guardados.has(c.id));
    if (faltan.length === 0) return;

    await pedirPersistencia();
    const libre = await lugarLibre();
    if (libre !== null && libre < bytes) {
      setAviso('sinLugar');
      return;
    }

    const ctrl = new AbortController();
    control.current = ctrl;
    setProgreso({ hechos: 0, total: faltan.length });
    let fallo: Aviso | null = null;
    try {
      for (let i = 0; i < faltan.length; i++) {
        await bajarYGuardar(token, faltan[i], undefined, ctrl.signal, true);
        setProgreso({ hechos: i + 1, total: faltan.length });
      }
    } catch (e) {
      const motivo = motivoDeClip(e);
      // Una bajada que se quedó quieta (una raya de señal) es un problema de señal.
      if (motivo !== 'cancelado') fallo = motivo === 'sin_senal' || motivo === 'quieta' ? 'senal' : 'otro';
    } finally {
      if (control.current === ctrl) control.current = null;
    }
    const ahora = await clipsGuardados(token);
    setGuardados(ahora);
    setProgreso(null);
    // Se bajaron pero no quedaron: el celular no tuvo lugar para guardarlos.
    if (!fallo && !ctrl.signal.aborted && bytesPendientes(clips, ahora).cuantos > 0) fallo = 'sinLugar';
    setAviso(fallo);
  }

  if (cuantos === 0) {
    return (
      <p className="mt-5 text-center text-[13.5px] font-semibold text-verde-fuerte">
        <span aria-hidden>✓ </span>
        {r.videosGuardados(clips.length)}
      </p>
    );
  }

  return (
    <div className="mt-5">
      {progreso ? (
        <div className="flex items-center gap-2">
          <p role="status" className="min-w-0 flex-1 text-[15px] font-semibold tabular-nums">
            {r.guardandoVideos(progreso.hechos, progreso.total)}
          </p>
          <button
            type="button"
            onClick={() => control.current?.abort()}
            className="boton-suave min-h-[44px] shrink-0 px-4 text-[15px]"
          >
            {r.parar}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void guardarTodos()}
          className="boton-suave min-h-[48px] w-full text-[15px]"
        >
          <span aria-hidden>↓</span>
          {r.guardarVideos(cuantos, formatoMb(bytes))}
        </button>
      )}
      {aviso && (
        <p role="alert" className="mt-1.5 text-center text-[14px] font-medium text-rojo">
          {aviso === 'sinLugar' ? r.sinLugar : aviso === 'senal' ? r.errorTexto : r.videoNoCargo}
        </p>
      )}
    </div>
  );
}
