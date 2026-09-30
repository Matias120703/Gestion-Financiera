'use client';

import { useEffect, useRef, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { duracionTexto, formatoMb } from '@/lib/video-reglas';
import type { ClipPublico } from '@/lib/tipos-rutinas';
import { EVENTO_COPIA, bajarYGuardar, clipGuardado, estaGuardado, motivoDeClip } from './clips';

/**
 * EL VIDEO DEL ENTRENADOR, EN LA PÁGINA DEL ALUMNO (113).
 *
 * Un botón a lo ancho con la duración y el peso: el alumno decide gastar
 * sus datos, nada se baja solo. Al tocarlo, si ya está en el celular se ve
 * al instante (también sin señal); si no, se baja entero con el porcentaje,
 * queda guardado y se ve. Se reproduce desde un `blob:` (publico/clips.ts).
 *
 * «Guardado en este celular» se mira después de montar, nunca en el primer
 * dibujo: el servidor no sabe qué guardó cada celular.
 *
 * Mientras baja hay un «Parar», y si no llega nada en 20 s (una raya de
 * señal) la bajada se corta sola y lo dice: antes quedaba en «Bajando 43 %»
 * sin forma de salir más que recargando.
 */
export function VideoPropio({ token, clip }: { token: string; clip: ClipPublico }) {
  const t = useTextos();
  const r = t.rutinaPublica;
  const [guardado, setGuardado] = useState(false);
  const [bajando, setBajando] = useState<number | null>(null);
  const [error, setError] = useState<'senal' | 'quieta' | 'otro' | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const control = useRef<AbortController | null>(null);
  const urlActual = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const mirar = () => void estaGuardado(token, clip.id).then((si) => { if (vivo) setGuardado(si); });
    mirar();
    // «Guardar los videos» o «Borrar la copia» cambiaron lo guardado.
    function alCambiar(e: Event) {
      if ((e as CustomEvent).detail === token) mirar();
    }
    window.addEventListener(EVENTO_COPIA, alCambiar);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_COPIA, alCambiar);
    };
  }, [token, clip.id]);

  // Al irse: cortar la bajada y soltar el blob.
  useEffect(() => () => {
    control.current?.abort();
    if (urlActual.current) URL.revokeObjectURL(urlActual.current);
  }, []);

  function mostrar(blob: Blob) {
    if (urlActual.current) URL.revokeObjectURL(urlActual.current);
    const nueva = URL.createObjectURL(blob);
    urlActual.current = nueva;
    setUrl(nueva);
  }

  function cerrar() {
    if (urlActual.current) URL.revokeObjectURL(urlActual.current);
    urlActual.current = null;
    setUrl(null);
  }

  async function ver() {
    if (bajando !== null) return;
    setError(null);
    const copia = await clipGuardado(token, clip.id);
    if (copia) {
      mostrar(copia);
      return;
    }
    const ctrl = new AbortController();
    control.current = ctrl;
    setBajando(0);
    try {
      const blob = await bajarYGuardar(token, clip, (pct) => setBajando(pct), ctrl.signal);
      mostrar(blob);
      setGuardado(await estaGuardado(token, clip.id));
    } catch (e) {
      const motivo = motivoDeClip(e);
      if (motivo !== 'cancelado') setError(motivo === 'sin_senal' ? 'senal' : motivo === 'quieta' ? 'quieta' : 'otro');
    } finally {
      if (control.current === ctrl) control.current = null;
      setBajando(null);
    }
  }

  if (url) {
    return (
      <div className="mt-3 space-y-2">
        <video
          controls playsInline autoPlay src={url}
          className="max-h-[70vh] w-full rounded-2xl bg-arena"
        />
        <button type="button" onClick={cerrar} className="boton-suave min-h-[44px] w-full text-[15px]">
          {r.videoCerrar}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button" onClick={() => void ver()} disabled={bajando !== null}
        className="boton-suave min-h-[48px] w-full flex-wrap text-[15px]"
      >
        <span aria-hidden>▶</span>
        {bajando !== null ? (
          <span className="tabular-nums">{r.videoBajando(bajando)}</span>
        ) : (
          <>
            <span>{r.videoVer}</span>
            <span className="font-normal tabular-nums text-tinta/55">
              {r.videoDatos(duracionTexto(clip.seg), formatoMb(clip.bytes))}
            </span>
          </>
        )}
      </button>
      {bajando !== null && (
        <button type="button" onClick={() => control.current?.abort()} className="boton-texto mt-1 min-h-[44px] w-full text-[14px]">
          {r.parar}
        </button>
      )}
      {guardado && bajando === null && (
        <p className="mt-1.5 text-center text-[13px] font-semibold text-verde-fuerte">
          <span aria-hidden>✓ </span>
          {r.videoGuardado}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-center text-[14px] font-medium text-rojo">
          {error === 'senal' ? r.videoNecesitaSenal : error === 'quieta' ? r.videoSeQuedo : r.videoNoCargo}
        </p>
      )}
    </div>
  );
}
