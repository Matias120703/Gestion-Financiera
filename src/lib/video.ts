'use client';

/**
 * LOS VIDEOS PROPIOS DEL TRAINER EN SU NAVEGADOR (113): achicar, subir,
 * quitar y limpiar.
 *
 * ACHICAR EN EL CELULAR
 *
 * Un iPhone graba 40-130 MB por minuto, y en HEVC, que muchos Android no
 * reproducen. Antes de subir, el video se vuelve a codificar en el celular
 * del trainer con WebCodecs (vía `mediabunny`): MP4 H.264, el lado largo a
 * 960 px como mucho y ~1 Mbps. 60 s quedan en ~8 MB. Si igual pasa los
 * 15 MB, una segunda pasada más liviana. Las reglas están en video-reglas.ts.
 *
 * `mediabunny` se carga con `import()` ADENTRO de las funciones, nunca
 * arriba: así solo lo baja quien abre la biblioteca y toca «Subir mi
 * video». El alumno, que abre su rutina con pocos datos, nunca lo baja
 * (pruebas/videos-reglas.test.js lo vigila).
 *
 * SUBIR SIN PASAR POR VERCEL
 *
 * Vercel corta los pedidos en ~4,5 MB: el video va del navegador DIRECTO a
 * Storage. El orden es reservar → subir → confirmar:
 *
 *   1. `reservar_video` controla el plan, el tope de 100 y los topes de
 *      duración y peso, y devuelve la ruta (la arma la base);
 *   2. Storage solo acepta esa ruta (policy videos_subir);
 *   3. `poner_video_ejercicio` confirma con el tamaño REAL de Storage y lo
 *      pone en el ejercicio, todo junto.
 *
 * Si algo falla en el medio, el archivo se borra y la reserva se suelta
 * enseguida. Lo que quede (una pestaña que se cerró) lo barre la limpieza
 * de la noche (/api/tareas/limpiar-videos).
 *
 * La subida (paso 2) va con XMLHttpRequest (subida-storage.ts), no con
 * `storage.upload()`: dice cuánto va, se corta sola si se queda quieta y se
 * puede cancelar. Si falla, el video preparado queda en la pantalla para
 * reintentar sin volver a prepararlo.
 */
import { clienteNavegador } from './supabase/cliente';
import { subirAStorage, type ResultadoSubidaArchivo } from './subida-storage';
import {
  AUDIO_BITRATE, BITRATE, BITRATE_SEGUNDA, CACHE_VIDEO_SEG, SIN_AVANCE_SUBIDA_MS, TOPE_BYTES, TOPE_SEGUNDOS,
  TOPE_SEGUNDOS_CON_REDONDEO, decidirVideo, medidasDestino, queHacerConElSonido, type CodigoErrorVideo,
} from './video-reglas';
import type { VideoPropio } from './tipos-rutinas';

const BUCKET = 'videos';
/** Cuánto vive la dirección para que el trainer mire su propio video. */
const SEGUNDOS_FIRMA = 60 * 10;

type Mediabunny = typeof import('mediabunny');
type EntradaMb = InstanceType<Mediabunny['Input']>;
type PistaVideoMb = NonNullable<Awaited<ReturnType<EntradaMb['getPrimaryVideoTrack']>>>;

export interface VideoPreparado {
  blob: Blob;
  segundos: number;
  bytes: number;
  /** El celular no pudo guardar el sonido: el video quedó mudo (se avisa). */
  sinSonido: boolean;
}

/** `segundos` viaja con `muy_largo`: la pantalla dice cuánto dura antes de ofrecer recortarlo. */
export type ErrorVideo = { error: CodigoErrorVideo; segundos?: number };

async function cargarMediabunny(): Promise<Mediabunny | null> {
  try {
    return await import('mediabunny');
  } catch {
    // El pedazo de código no bajó: casi siempre, sin señal.
    return null;
  }
}

function abrir(mb: Mediabunny, blob: Blob): EntradaMb {
  return new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
}

/** Mientras se convierte, la pantalla no se apaga (si el navegador deja). */
async function mantenerPantalla(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request(tipo: 'screen'): Promise<{ release(): Promise<void> }> };
    };
    const candado = nav.wakeLock ? await nav.wakeLock.request('screen') : null;
    return () => { candado?.release().catch(() => null); };
  } catch {
    return () => {};
  }
}

async function puedeConvertir(mb: Mediabunny, pista: PistaVideoMb, ancho: number, alto: number): Promise<boolean> {
  if (typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === 'undefined') return false;
  try {
    if (!(await pista.canDecode())) return false;
    const destino = medidasDestino(ancho, alto);
    const proporcion = ancho > 0 && alto > 0 ? ancho / alto : 1;
    const width = 'width' in destino ? destino.width : Math.round(destino.height * proporcion);
    const height = 'height' in destino ? destino.height : Math.round(destino.width / proporcion);
    return await mb.canEncodeVideo('avc', { width, height, quality: new mb.Quality({ bitrate: BITRATE }) });
  } catch {
    return false;
  }
}

type Convertido = { blob: Blob; sinSonido: boolean } | { invalida: true };

async function convertir(
  mb: Mediabunny,
  archivo: Blob,
  { ancho, alto, bitrate, recortar, sonido, alAvanzar }: {
    ancho: number; alto: number; bitrate: number; recortar: boolean;
    sonido: ReturnType<typeof queHacerConElSonido>; alAvanzar?: (pct: number) => void;
  },
): Promise<Convertido> {
  const input = abrir(mb, archivo);
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  try {
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: {
        ...medidasDestino(ancho, alto),
        codec: 'avc',
        quality: new mb.Quality({ bitrate }),
        frameRate: 30,
        keyFrameInterval: 2,
        forceTranscode: true,
      },
      // El AAC del celular se copia tal cual (también con el recorte): pedir
      // otra calidad o un canal obligaba a recodificarlo, y sin codificador
      // AAC el video quedaba mudo (video-reglas.ts, queHacerConElSonido).
      audio: sonido === 'descartar'
        ? { discard: true }
        : sonido === 'copiar'
          ? { codec: 'aac' }
          : { codec: 'aac', quality: new mb.Quality({ bitrate: AUDIO_BITRATE }), numberOfChannels: 1 },
      trim: recortar ? { start: 0, end: TOPE_SEGUNDOS } : undefined,
      showWarnings: false,
    });
    const sinVideo = conversion.discardedTracks.some((d) => d.track.isVideoTrack());
    if (!conversion.isValid || sinVideo) return { invalida: true };
    // Mudo solo si el celular no pudo con el sonido; no si se pidió sin sonido.
    const sinSonido = conversion.discardedTracks.some((d) => d.track.isAudioTrack() && d.reason !== 'discarded_by_user');
    conversion.onProgress = (p) => alAvanzar?.(Math.min(100, Math.max(0, Math.round(p * 100))));
    await conversion.execute();
    if (!target.buffer) return { invalida: true };
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), sinSonido };
  } finally {
    input.dispose();
  }
}

async function duracionDe(mb: Mediabunny, blob: Blob): Promise<number | null> {
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: [mb.MP4] });
  try {
    const d = await input.computeDuration();
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/**
 * Lee un video y lo deja listo para subir: MP4 H.264, liviano, de hasta 60 s.
 *
 * Si dura más de 60 s y `recortar` no vino en true, devuelve
 * `{ error: 'muy_largo', segundos }` SIN tocar nada: la pantalla pregunta
 * si se usan los primeros 60 s, y recién ahí se vuelve a llamar con
 * `recortar: true`. Nunca se recorta sin preguntar.
 */
export async function prepararVideo(
  archivo: File,
  { recortar = false, alAvanzar }: { recortar?: boolean; alAvanzar?: (pct: number) => void } = {},
): Promise<VideoPreparado | ErrorVideo> {
  const mb = await cargarMediabunny();
  if (!mb) return { error: 'subida_fallo' };

  // 1. Leer: ¿es un video?, ¿cuánto dura?, ¿ya es un MP4 H.264?
  let segundos: number;
  let ancho: number;
  let alto: number;
  let esMp4Avc: boolean;
  let convierte: boolean;
  let codecAudio: string | null;
  const input = abrir(mb, archivo);
  try {
    if (!(await input.canRead())) return { error: 'no_es_video' };
    const pista = await input.getPrimaryVideoTrack();
    if (!pista) return { error: 'no_es_video' };
    const [duracion, formato, codec, w, h, audio] = await Promise.all([
      input.computeDuration(), input.getFormat(), pista.getCodec(),
      pista.getDisplayWidth(), pista.getDisplayHeight(), input.getPrimaryAudioTrack(),
    ]);
    codecAudio = audio ? await audio.getCodec() : null;
    segundos = duracion;
    ancho = w;
    alto = h;
    esMp4Avc = formato === mb.MP4 && codec === 'avc' && (!audio || codecAudio === 'aac');
    convierte = await puedeConvertir(mb, pista, w, h);
  } catch {
    return { error: 'no_se_pudo_leer' };
  } finally {
    input.dispose();
  }

  // 2. Decidir.
  const decision = decidirVideo({ segundos, bytes: archivo.size, puedeConvertir: convierte, esMp4Avc });
  if ('error' in decision) return { error: decision.error, segundos };
  if (decision.recortar && !recortar) return { error: 'muy_largo', segundos };
  if (decision.accion === 'tal_cual') {
    // Ya es un MP4 H.264 (esMp4Avc), pero el archivo del selector puede venir
    // sin tipo o como video/3gpp: se sube como video/mp4, que es lo único que
    // acepta el bucket (con un File, la opción contentType no cuenta).
    const blob = archivo.type === 'video/mp4' ? archivo : new Blob([archivo], { type: 'video/mp4' });
    return { blob, segundos, bytes: archivo.size, sinSonido: false };
  }

  // 3. Convertir, con la pantalla prendida. Si el celular la bloquea o se
  //    cambia de app, el codificador se corta: se avisa con eso.
  const sonido = queHacerConElSonido(codecAudio);
  let seOculto = false;
  const alCambiarVisibilidad = () => { if (document.visibilityState === 'hidden') seOculto = true; };
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  const soltarPantalla = await mantenerPantalla();
  try {
    let hecho = await convertir(mb, archivo, { ancho, alto, bitrate: BITRATE, recortar: decision.recortar, sonido, alAvanzar });
    if ('invalida' in hecho) return { error: 'celular_no_convierte' };
    if (hecho.blob.size > TOPE_BYTES) {
      alAvanzar?.(0);
      hecho = await convertir(mb, archivo, { ancho, alto, bitrate: BITRATE_SEGUNDA, recortar: decision.recortar, sonido, alAvanzar });
      if ('invalida' in hecho) return { error: 'celular_no_convierte' };
      if (hecho.blob.size > TOPE_BYTES) return { error: 'muy_pesado' };
    }
    const medida = await duracionDe(mb, hecho.blob);
    let final = medida ?? (decision.recortar ? Math.min(segundos, TOPE_SEGUNDOS) : segundos);
    // Recortado a 60: el redondeo del contenedor no puede dejarlo afuera del tope.
    if (decision.recortar) final = Math.min(final, TOPE_SEGUNDOS_CON_REDONDEO);
    return { blob: hecho.blob, segundos: final, bytes: hecho.blob.size, sinSonido: hecho.sinSonido };
  } catch {
    return { error: seOculto ? 'pantalla_cerrada' : 'celular_no_convierte' };
  } finally {
    soltarPantalla();
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  }
}

/** Una reserva que quedó sin soltar (sin señal): se suelta antes de reintentar. */
export interface ReservaPendiente { id: string; ruta: string }

/** Un error de la base (su mensaje se traduce en la pantalla) o uno propio. */
export type ResultadoSubida =
  | { ok: true; video: VideoPropio }
  | { ok: false; codigo: CodigoErrorVideo; pendiente?: ReservaPendiente }
  | { ok: false; errorBase: unknown };

/**
 * Si algo falló después de reservar: el archivo afuera y la reserva suelta.
 * Devuelve false si no se pudo (sin señal): la reserva ocupa un lugar de los
 * 100 hasta que se suelte (`soltarReserva` al reintentar, o sola a las 3 h).
 */
async function descartar(empresaId: string, id: string, ruta: string): Promise<boolean> {
  const supabase = clienteNavegador();
  try {
    const { error: errorBorrar } = await supabase.storage.from(BUCKET).remove([ruta]);
    if (errorBorrar) return false;
    const { error } = await supabase.rpc('soltar_videos', { p_empresa: empresaId, p_ids: [id] });
    return !error;
  } catch {
    return false;
  }
}

/** Suelta una reserva que quedó pendiente de una subida que falló. Nunca tira. */
export async function soltarReserva(empresaId: string, reserva: ReservaPendiente): Promise<boolean> {
  return descartar(empresaId, reserva.id, reserva.ruta);
}

/** El archivo a Storage con avance, tope por falta de avance y «Cancelar» (subida-storage.ts). */
async function subirArchivo(
  ruta: string, blob: Blob, { alAvanzar, senal }: { alAvanzar?: (pct: number) => void; senal?: AbortSignal },
): Promise<ResultadoSubidaArchivo> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let token: string | undefined;
  try {
    token = (await clienteNavegador().auth.getSession()).data.session?.access_token;
  } catch {
    token = undefined;
  }
  if (!base || !clave || !token) return 'fallo';
  return subirAStorage({
    base, clave, token, bucket: BUCKET, ruta, archivo: blob, tipo: 'video/mp4',
    cacheSeg: CACHE_VIDEO_SEG, sinAvanceMs: SIN_AVANCE_SUBIDA_MS, alAvanzar, senal,
  });
}

/**
 * Reservar → subir → confirmar. `alAvanzar`: el porcentaje de la subida.
 * `senal`: «Cancelar». Si la subida falla, se corta o se cancela, la reserva
 * se suelta y el video preparado sigue en la pantalla para reintentar sin
 * volver a prepararlo (una reserva nueva por intento).
 */
export async function subirVideoDeEjercicio({
  empresaId, ejercicioId, blob, segundos, alAvanzar, senal,
}: {
  empresaId: string;
  ejercicioId: string;
  blob: Blob;
  segundos: number;
  alAvanzar?: (pct: number) => void;
  senal?: AbortSignal;
}): Promise<ResultadoSubida> {
  const supabase = clienteNavegador();

  const { data: reserva, error: errorReserva } = await supabase.rpc('reservar_video', {
    p_empresa: empresaId, p_segundos: segundos, p_bytes: blob.size,
  });
  if (errorReserva) return { ok: false, errorBase: errorReserva };
  const { id, ruta } = (reserva ?? {}) as { id?: string; ruta?: string };
  if (!id || !ruta) return { ok: false, codigo: 'subida_fallo' };

  const subida = await subirArchivo(ruta, blob, { alAvanzar, senal });
  if (subida !== 'ok') {
    const soltada = await descartar(empresaId, id, ruta);
    const codigo: CodigoErrorVideo = subida === 'cancelada' ? 'subida_cancelada' : subida === 'quieta' ? 'subida_quieta' : 'subida_fallo';
    return soltada ? { ok: false, codigo } : { ok: false, codigo, pendiente: { id, ruta } };
  }

  const { data, error: errorPoner } = await supabase.rpc('poner_video_ejercicio', {
    p_empresa: empresaId, p_ejercicio: ejercicioId, p_video: id,
  });
  if (errorPoner) {
    await descartar(empresaId, id, ruta);
    return { ok: false, errorBase: errorPoner };
  }

  // El video que tenía antes (si lo cambió) ya se puede borrar.
  await limpiarVideosPendientes(empresaId);

  const video = (data as { video?: VideoPropio | null } | null)?.video;
  return video ? { ok: true, video } : { ok: false, codigo: 'subida_fallo' };
}

export async function quitarVideoDeEjercicio({
  empresaId, ejercicioId,
}: {
  empresaId: string;
  ejercicioId: string;
}): Promise<{ ok: true } | { ok: false; errorBase: unknown }> {
  const supabase = clienteNavegador();
  const { error } = await supabase.rpc('poner_video_ejercicio', {
    p_empresa: empresaId, p_ejercicio: ejercicioId, p_video: null,
  });
  if (error) return { ok: false, errorBase: error };
  await limpiarVideosPendientes(empresaId);
  return { ok: true };
}

/**
 * Borra los archivos de los videos soltados (cambiados, quitados, de un
 * ejercicio borrado o unido) y de las reservas vencidas, y suelta sus filas.
 * Nunca tira: si algo falla, lo termina la limpieza de la noche.
 */
export async function limpiarVideosPendientes(empresaId: string): Promise<void> {
  try {
    const supabase = clienteNavegador();
    const { data, error } = await supabase.rpc('videos_por_soltar', { p_empresa: empresaId });
    if (error || !Array.isArray(data) || data.length === 0) return;
    const lista = (data as { id?: unknown; ruta?: unknown }[])
      .filter((x): x is { id: string; ruta: string } => typeof x.id === 'string' && typeof x.ruta === 'string');
    if (lista.length === 0) return;
    const { error: errorBorrar } = await supabase.storage.from(BUCKET).remove(lista.map((x) => x.ruta));
    if (errorBorrar) return;
    await supabase.rpc('soltar_videos', { p_empresa: empresaId, p_ids: lista.map((x) => x.id) });
  } catch {
    // Best-effort, a propósito.
  }
}

/** Dirección de 10 minutos para que el trainer mire su propio video. */
export async function urlParaVerVideo(ruta: string): Promise<string | null> {
  try {
    const { data, error } = await clienteNavegador().storage.from(BUCKET).createSignedUrl(ruta, SEGUNDOS_FIRMA);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
