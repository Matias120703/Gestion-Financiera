/**
 * LAS REGLAS DE LOS VIDEOS PROPIOS DEL TRAINER (113), sin navegador.
 *
 * Qué se hace con un video antes de subirlo, y cómo se muestra su peso y su
 * duración. Es puro a propósito: lo prueba pruebas/videos-reglas.test.js
 * sin celular, y el que convierte de verdad (src/lib/video.ts) solo sigue
 * lo que dice esto.
 *
 * Los topes son los de la base (limite_segundos_video, limite_bytes_video):
 * si cambian allá, cambian acá.
 */

/** Tope de Matías: 60 segundos por video. */
export const TOPE_SEGUNDOS = 60;
/** El codificador redondea: la base acepta hasta 60,5. */
export const TOPE_SEGUNDOS_CON_REDONDEO = TOPE_SEGUNDOS + 0.5;
/** 15 MB: el bucket, la reserva y el tamaño real al confirmar. */
export const TOPE_BYTES = 15 * 1024 * 1024;
/** El lado largo del video que se sube, en píxeles. Nunca se agranda. */
export const LADO_LARGO = 960;
/** ~1 Mbps: 60 s quedan en ~8 MB. */
export const BITRATE = 1_000_000;
/** Si la primera pasada pasa los 15 MB, una segunda más liviana. */
export const BITRATE_SEGUNDA = 700_000;
export const AUDIO_BITRATE = 64_000;

/**
 * Pregunta 2 de Matías: si el video dura más de 60 s, ¿se ofrece usar los
 * primeros 60 s o se rechaza? Por defecto se ofrece, con un botón, y nunca
 * se recorta sin preguntar.
 */
export const RECORTAR_SI_PASA = true;

/**
 * Pregunta 3 de Matías: ¿importa el sonido (el trainer explica hablando)?
 * Por defecto se conserva si el celular puede; si no, queda mudo y se avisa.
 */
export const CON_SONIDO: 'si-se-puede' | 'nunca' = 'si-se-puede';

/**
 * Qué se hace con el sonido al convertir (revisión del 30/09).
 *
 * Los celulares graban el sonido en AAC, que es justo lo que va en el MP4:
 * se COPIA tal cual. Pedirle al conversor otra calidad o un solo canal lo
 * obligaba a recodificarlo, y un navegador sin codificador AAC (Firefox,
 * Safari viejo, Chrome sin el de la plataforma) lo tiraba: el video quedaba
 * mudo aunque el sonido se podía conservar (medido en Chrome 154 con un MP4
 * de Android y un MOV de iPhone: con la copia, 9 MB y 60 s, con sonido).
 * Solo lo que no es AAC se recodifica (liviano, mono); si el navegador no
 * puede, queda mudo y se avisa.
 */
export function queHacerConElSonido(codecOrigen: string | null): 'descartar' | 'copiar' | 'recodificar' {
  if (CON_SONIDO === 'nunca') return 'descartar';
  return codecOrigen === 'aac' ? 'copiar' : 'recodificar';
}

/**
 * Cuánto guarda el navegador el video que baja (el Cache-Control con que se
 * sube): lo mismo que dura la dirección firmada, 3 horas. Antes era un año.
 * El alumno igual lo guarda en su celular (Cache API) para verlo sin señal.
 */
export const CACHE_VIDEO_SEG = 3 * 60 * 60;

/** Una subida que no avanza en este tiempo se corta (señal colgada, no cortada del todo). */
export const SIN_AVANCE_SUBIDA_MS = 30_000;

export type CodigoErrorVideo =
  | 'no_es_video'
  | 'no_se_pudo_leer'
  | 'celular_no_convierte'
  | 'muy_pesado'
  | 'subida_fallo'
  | 'subida_quieta'
  | 'subida_cancelada'
  | 'pantalla_cerrada'
  | 'muy_largo';

export type DecisionVideo =
  | { accion: 'convertir' | 'tal_cual'; recortar: boolean }
  | { error: CodigoErrorVideo };

/** Un número par, hacia abajo, y nunca menor que 2 (H.264 pide pares). */
function par(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}

/**
 * A qué tamaño se achica: el lado largo a `LADO_LARGO` como mucho, sin
 * agrandar nunca un video chico. Se da UNA medida: la otra la deduce el
 * conversor con la proporción del video (un vertical sigue vertical).
 */
export function medidasDestino(ancho: number, alto: number): { width: number } | { height: number } {
  const w = Number.isFinite(ancho) && ancho > 0 ? ancho : LADO_LARGO;
  const h = Number.isFinite(alto) && alto > 0 ? alto : LADO_LARGO;
  if (h > w) return { height: par(Math.min(LADO_LARGO, h)) };
  return { width: par(Math.min(LADO_LARGO, w)) };
}

/**
 * Qué hacer con un video.
 *
 * Con conversor (WebCodecs), siempre se convierte: así sale MP4 H.264 que
 * cualquier celular reproduce, y liviano. Si dura más de 60 s, se recorta
 * a los primeros 60 (solo si el trainer lo acepta en la pantalla).
 *
 * Sin conversor (un celular viejo), solo entra tal cual un MP4 H.264 que ya
 * cumpla los topes.
 */
export function decidirVideo({
  segundos, bytes, puedeConvertir, esMp4Avc,
}: {
  segundos: number;
  bytes: number;
  puedeConvertir: boolean;
  esMp4Avc: boolean;
}): DecisionVideo {
  if (!Number.isFinite(segundos) || segundos <= 0) return { error: 'no_se_pudo_leer' };
  const largo = segundos > TOPE_SEGUNDOS_CON_REDONDEO;

  if (!puedeConvertir) {
    if (esMp4Avc && !largo && bytes <= TOPE_BYTES) return { accion: 'tal_cual', recortar: false };
    return { error: 'celular_no_convierte' };
  }

  if (largo) return RECORTAR_SI_PASA ? { accion: 'convertir', recortar: true } : { error: 'muy_largo' };
  return { accion: 'convertir', recortar: false };
}

/** «8,0»: los megas con un decimal y coma, como se escriben en Paraguay y en Brasil. */
export function formatoMb(bytes: number): string {
  const mb = Math.max(0, Number.isFinite(bytes) ? bytes : 0) / 1_000_000;
  return mb.toFixed(1).replace('.', ',');
}

/** «0:45», «1:12». */
export function duracionTexto(seg: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seg) ? seg : 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
