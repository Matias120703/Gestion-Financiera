'use client';

import { useEffect, useRef, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { mensajeDeError } from '@/lib/errores';
import { duracionTexto, formatoMb, RECORTAR_SI_PASA, type CodigoErrorVideo } from '@/lib/video-reglas';
import {
  prepararVideo, quitarVideoDeEjercicio, soltarReserva, subirVideoDeEjercicio, urlParaVerVideo,
  type ReservaPendiente, type VideoPreparado,
} from '@/lib/video';
import type { CupoVideos, EjercicioBiblioteca, VideoPropio } from '@/lib/tipos-rutinas';
import { Confirmar, MensajeError, MensajeListo } from './panel/Piezas';

type Paso =
  | { tipo: 'quieto' }
  | { tipo: 'leyendo' }
  | { tipo: 'largo'; archivo: File; segundos: number }
  | { tipo: 'preparando'; pct: number }
  | { tipo: 'subiendo'; mb: string; pct: number };

/** Un video ya preparado cuya subida falló: se reintenta sin volver a prepararlo. */
interface Reintento { listo: VideoPreparado }

/**
 * «TU VIDEO» (113): el trainer sube un video suyo haciendo el ejercicio.
 *
 * Va en la hoja del ejercicio de la biblioteca, entre «Cómo se hace» y el
 * link. Lo ven sus clientes en su link y, una vez mirado, también sin señal.
 *
 * Los pasos se muestran uno por uno porque en un celular tardan: leer,
 * (si dura más de 60 s, preguntar si se usan los primeros 60), preparar
 * (achicarlo en el celular, con el porcentaje y «no cierres esta pantalla»),
 * subir (con el porcentaje y «Cancelar la subida») y listo. Mientras tanto
 * la hoja no se cierra (`onOcupado`).
 *
 * Si la subida falla, se queda quieta (señal colgada: se corta sola a los
 * 30 s sin avance) o se cancela, el video preparado se guarda acá y aparece
 * «Reintentar la subida»: el trainer en el gimnasio con poca señal no vuelve
 * a elegir el archivo ni a esperar la preparación entera.
 *
 * Con la cuenta llena (100 de 100), subir y cambiar se apagan: reemplazar
 * también reserva un lugar nuevo, y el viejo se libera recién cuando se
 * borra su archivo.
 */
export function VideoDelEjercicio({
  empresaId, ejercicio, cupo, onCambio, onOcupado,
}: {
  empresaId: string;
  ejercicio: EjercicioBiblioteca;
  /** «N de 100». Null si no se pudo leer: no se apaga nada, la base igual controla. */
  cupo: CupoVideos | null;
  /** Se subió o se quitó: refrescar lo de alrededor (la lista y el cupo). */
  onCambio: () => void;
  /** Mientras trabaja, la hoja de arriba no se tiene que cerrar. */
  onOcupado?: (ocupado: boolean) => void;
}) {
  const t = useTextos();
  const p = t.rutinasPanel.biblioteca.propio;
  const entrada = useRef<HTMLInputElement>(null);

  const [video, setVideo] = useState<VideoPropio | null>(ejercicio.video ?? null);
  const [paso, setPaso] = useState<Paso>({ tipo: 'quieto' });
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [sinSonido, setSinSonido] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [cargandoUrl, setCargandoUrl] = useState(false);
  const [preguntaQuitar, setPreguntaQuitar] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [reintento, setReintento] = useState<Reintento | null>(null);
  const [cancelada, setCancelada] = useState(false);
  // Reservas que no se pudieron soltar (sin señal): se sueltan antes del próximo intento.
  const pendientes = useRef<ReservaPendiente[]>([]);
  const control = useRef<AbortController | null>(null);

  // Al cerrar la hoja: se corta una subida en curso y se sueltan las reservas que quedaron.
  useEffect(() => () => {
    control.current?.abort();
    for (const r of pendientes.current) void soltarReserva(empresaId, r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lo que llega de la página manda (después de refrescar).
  const idDeAfuera = ejercicio.video?.id ?? null;
  useEffect(() => {
    setVideo(ejercicio.video ?? null);
    setUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDeAfuera]);

  const trabajando = paso.tipo !== 'quieto' && paso.tipo !== 'largo';
  const ocupado = trabajando || quitando || preguntaQuitar;
  useEffect(() => { onOcupado?.(ocupado); }, [ocupado, onOcupado]);

  const lleno = !!cupo && cupo.tope > 0 && cupo.usados >= cupo.tope;

  function textoError(codigo: CodigoErrorVideo): string {
    return p.errores[codigo];
  }

  function elegir() {
    setError('');
    setAviso('');
    entrada.current?.click();
  }

  /** Suelta (si hay señal) las reservas que quedaron de intentos anteriores. */
  async function soltarPendientes() {
    const antes = pendientes.current;
    pendientes.current = [];
    for (const r of antes) {
      if (!(await soltarReserva(empresaId, r))) pendientes.current.push(r);
    }
  }

  async function procesar(archivo: File, recortar: boolean) {
    setError('');
    setAviso('');
    setSinSonido(false);
    setReintento(null);
    setCancelada(false);
    setPaso({ tipo: 'leyendo' });
    const listo = await prepararVideo(archivo, {
      recortar,
      alAvanzar: (pct) => setPaso({ tipo: 'preparando', pct }),
    });
    if ('error' in listo) {
      if (listo.error === 'muy_largo' && RECORTAR_SI_PASA && typeof listo.segundos === 'number') {
        setPaso({ tipo: 'largo', archivo, segundos: listo.segundos });
        return;
      }
      setPaso({ tipo: 'quieto' });
      setError(textoError(listo.error));
      return;
    }
    await subir(listo);
  }

  /** Sube un video ya preparado. Si falla, queda para «Reintentar la subida». */
  async function subir(listo: VideoPreparado) {
    setError('');
    setAviso('');
    setReintento(null);
    setCancelada(false);
    const mb = formatoMb(listo.bytes);
    setPaso({ tipo: 'subiendo', mb, pct: 0 });
    await soltarPendientes();
    const ctrl = new AbortController();
    control.current = ctrl;
    const r = await subirVideoDeEjercicio({
      empresaId, ejercicioId: ejercicio.id, blob: listo.blob, segundos: listo.segundos,
      alAvanzar: (pct) => { if (!ctrl.signal.aborted) setPaso({ tipo: 'subiendo', mb, pct }); },
      senal: ctrl.signal,
    });
    if (control.current === ctrl) control.current = null;
    setPaso({ tipo: 'quieto' });
    if (!r.ok) {
      if ('codigo' in r) {
        if (r.pendiente) pendientes.current.push(r.pendiente);
        if (r.codigo === 'subida_fallo' || r.codigo === 'subida_quieta' || r.codigo === 'subida_cancelada') {
          setReintento({ listo });
        }
        if (r.codigo === 'subida_cancelada') setCancelada(true);
        else setError(textoError(r.codigo));
      } else {
        setError(mensajeDeError(r.errorBase, t.errores.generico));
      }
      return;
    }
    setVideo(r.video);
    setUrl(null);
    setSinSonido(listo.sinSonido);
    setAviso(p.listo);
    onCambio();
  }

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0] ?? null;
    // Para poder elegir el mismo archivo otra vez.
    e.target.value = '';
    if (archivo) void procesar(archivo, false);
  }

  async function ver() {
    if (!video) return;
    if (url) { setUrl(null); return; }
    setError('');
    setCargandoUrl(true);
    const firmada = await urlParaVerVideo(video.ruta);
    setCargandoUrl(false);
    if (firmada) setUrl(firmada);
    else setError(t.errores.generico);
  }

  async function quitar() {
    setQuitando(true);
    setError('');
    const r = await quitarVideoDeEjercicio({ empresaId, ejercicioId: ejercicio.id });
    setQuitando(false);
    setPreguntaQuitar(false);
    if (!r.ok) {
      setError(mensajeDeError(r.errorBase, t.errores.generico));
      return;
    }
    setVideo(null);
    setUrl(null);
    setSinSonido(false);
    setAviso(p.quitado);
    onCambio();
  }

  return (
    <div className="rounded-2xl border border-borde px-3.5 py-3">
      <span className="etiqueta">{p.titulo}</span>

      {paso.tipo === 'largo' ? (
        <div className="space-y-2.5">
          <p className="text-[13.5px] leading-relaxed text-tinta/75">{p.muyLargo(duracionTexto(paso.segundos))}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={elegir} className="boton-suave min-h-[44px]">{p.elegirOtro}</button>
            <button type="button" onClick={() => void procesar(paso.archivo, true)} className="boton-principal min-h-[44px]">
              {p.usarPrimeros}
            </button>
          </div>
        </div>
      ) : trabajando ? (
        <div role="status" className="space-y-1.5">
          <p className="text-[14px] font-semibold tabular-nums">
            {paso.tipo === 'leyendo' ? p.leyendo
              : paso.tipo === 'preparando' ? p.preparando(paso.pct)
                : paso.tipo === 'subiendo' ? p.subiendo(paso.mb, paso.pct) : ''}
          </p>
          {(paso.tipo === 'preparando' || paso.tipo === 'subiendo') && (
            <div className="h-2 overflow-hidden rounded-full bg-arena" aria-hidden>
              <div className="h-full rounded-full bg-verde transition-[width]" style={{ width: `${paso.pct}%` }} />
            </div>
          )}
          <p className="text-[12.5px] leading-snug text-tinta/55">{p.noCierres}</p>
          {paso.tipo === 'subiendo' && (
            <button type="button" onClick={() => control.current?.abort()} className="boton-suave min-h-[44px] w-full">
              {p.cancelarSubida}
            </button>
          )}
        </div>
      ) : reintento ? (
        <div className="space-y-2.5">
          {cancelada && <p className="text-[13px] leading-relaxed text-tinta/70">{p.errores.subida_cancelada}</p>}
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={elegir} className="boton-suave min-h-[44px]">{p.elegirOtro}</button>
            <button type="button" onClick={() => void subir(reintento.listo)} className="boton-principal min-h-[44px]">
              {p.reintentar}
            </button>
          </div>
        </div>
      ) : video ? (
        <div className="space-y-2.5">
          <button
            type="button" onClick={ver} disabled={cargandoUrl} aria-expanded={!!url}
            className="boton-suave min-h-[44px] w-full"
          >
            <span aria-hidden>▶</span>
            <span>{p.ver}</span>
            <span className="font-normal text-tinta/55">{p.datos(duracionTexto(video.seg), formatoMb(video.bytes))}</span>
          </button>
          {url && (
            <video
              controls playsInline preload="metadata" src={url}
              className="max-h-[50vh] w-full rounded-xl bg-arena"
            />
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={elegir} disabled={lleno} className="boton-suave min-h-[44px]">{p.cambiar}</button>
            <button
              type="button" onClick={() => { setError(''); setAviso(''); setPreguntaQuitar(true); }}
              className="boton-suave min-h-[44px]"
            >
              {p.quitar}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[12.5px] leading-snug text-tinta/55">{p.ayuda}</p>
          <button type="button" onClick={elegir} disabled={lleno} className="boton-principal min-h-[44px] w-full">
            {p.subir}
          </button>
        </div>
      )}

      {lleno && !trabajando && paso.tipo !== 'largo' && cupo && (
        <p className="mt-2 text-[12.5px] leading-snug text-tinta/55">
          {cupo.topePlan !== undefined && cupo.topePlan > cupo.tope ? p.cupoLlenoPrueba(cupo.tope, cupo.topePlan) : p.cupoLleno(cupo.tope)}
        </p>
      )}

      <MensajeError texto={error} />
      {aviso && (
        <div className="mt-3">
          <MensajeListo texto={aviso}>
            {sinSonido ? <p className="font-medium">{p.sinSonido}</p> : null}
          </MensajeListo>
        </div>
      )}

      <input ref={entrada} type="file" accept="video/*" hidden onChange={alElegir} />

      {preguntaQuitar && (
        <Confirmar
          titulo={p.quitarPregunta(ejercicio.nombre)} detalle={p.quitarDetalle}
          si={p.siQuitar} peligro ocupado={quitando}
          onSi={() => void quitar()} onNo={() => setPreguntaQuitar(false)}
        />
      )}
    </div>
  );
}
