'use client';

import { GUARDAR_AL_MIRAR, claveClip, idsGuardados, nombreCacheRutina, quePodar } from '@/lib/rutina-sin-senal';
import { bajarConAvance, crearFirmas, errorDeBajada } from '@/lib/bajar-video';
import type { ClipPublico } from '@/lib/tipos-rutinas';
import { rutaDeRutina } from './enlace';

/**
 * LOS VIDEOS PROPIOS EN EL CELULAR DEL ALUMNO (113).
 *
 * El video se baja ENTERO la primera vez que lo mira, se guarda en la caché
 * de su link (`orden-rutina:<token>`, clave `/__clip/<id>`) y se reproduce
 * desde un `blob:`. Así no depende de que la dirección firmada siga viva,
 * ni de las respuestas parciales (206) que pide Safari para un <video>, y
 * la próxima vez anda sin señal.
 *
 * Las direcciones firmadas (3 horas) las da /rutina/<token>/videos, y se
 * recuerdan en memoria 150 minutos: con margen antes de que venzan. Un video
 * que no está en lo recordado (recién subido) hace pedir la lista otra vez.
 *
 * La bajada se corta sola si pasan SIN_AVANCE_BAJADA_MS sin que llegue nada
 * (`quieta`), y el alumno la puede parar (lib/bajar-video.ts).
 *
 * Todo acceso a `caches` va con try/catch: un navegador sin Cache API, una
 * ventana privada o un celular lleno siguen viendo el video, solo que sin
 * guardarlo.
 */
const RECORDAR_FIRMAS_MS = 150 * 60 * 1000;
/** Una bajada que no recibe nada en este tiempo se corta (una raya de señal). */
const SIN_AVANCE_BAJADA_MS = 20_000;

async function pedirFirmas(token: string): Promise<Record<string, string>> {
  const r = await fetch(`${rutaDeRutina(token)}/videos`, { cache: 'no-store' });
  if (!r.ok) throw new Error('no_disponible');
  const d = (await r.json()) as { clips?: unknown };
  const clips: Record<string, string> = {};
  if (d && d.clips && typeof d.clips === 'object' && !Array.isArray(d.clips)) {
    for (const [id, url] of Object.entries(d.clips as Record<string, unknown>)) {
      if (typeof url === 'string' && url.startsWith('https://')) clips[id] = url;
    }
  }
  return clips;
}

const firmas = crearFirmas(pedirFirmas, { recordarMs: RECORDAR_FIRMAS_MS });

export type ErrorDeClip = 'sin_senal' | 'no_disponible' | 'quieta';

/**
 * Lo guardado de un link cambió (se guardó un video, se podaron, se borró
 * la copia): los botones de los videos y «Guardar los videos» se vuelven a
 * fijar. El detalle es el token.
 */
export const EVENTO_COPIA = 'orden-rutina-copia';

export function avisarCambioDeCopia(token: string): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_COPIA, { detail: token }));
  } catch {
    // Sin window (servidor) no hay a quién avisar.
  }
}

function sinSenal(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** El motivo de un error de `bajarYGuardar`: si no es uno nuestro, «no disponible». */
export function motivoDeClip(e: unknown): ErrorDeClip | 'cancelado' {
  if (errorDeBajada(e) === 'parada') return 'cancelado';
  const m = e instanceof Error ? e.message : '';
  return m === 'sin_senal' || m === 'quieta' ? m : 'no_disponible';
}

export async function urlsFirmadas(token: string): Promise<Record<string, string>> {
  return firmas.todas(token);
}

/** La caché del link, solo si ya existe: mirar no la crea vacía. */
async function cacheSiExiste(token: string): Promise<Cache | null> {
  try {
    const nombre = nombreCacheRutina(token);
    const hay = typeof caches !== 'undefined' && (await caches.has(nombre));
    return hay ? await caches.open(nombre) : null;
  } catch {
    return null;
  }
}

/** El video guardado en este celular, o null. */
export async function clipGuardado(token: string, id: string): Promise<Blob | null> {
  try {
    const cache = await cacheSiExiste(token);
    const r = cache ? await cache.match(claveClip(id)) : undefined;
    return r ? await r.blob() : null;
  } catch {
    return null;
  }
}

/** ¿Está guardado? Sin leer el archivo entero. */
export async function estaGuardado(token: string, id: string): Promise<boolean> {
  try {
    const cache = await cacheSiExiste(token);
    return !!(cache && (await cache.match(claveClip(id))));
  } catch {
    return false;
  }
}

/** Los ids de los videos de este link guardados en el celular. */
export async function clipsGuardados(token: string): Promise<Set<string>> {
  try {
    const cache = await cacheSiExiste(token);
    if (!cache) return new Set();
    return idsGuardados((await cache.keys()).map((p) => p.url));
  } catch {
    return new Set();
  }
}

/**
 * Borra del celular los videos que ya no están en la rutina vigente (el
 * trainer los cambió o los quitó). Solo con la rutina recién traída de la
 * base: nunca con la de una copia.
 */
export async function podarClips(token: string, idsVigentes: string[]): Promise<void> {
  let borrados = 0;
  try {
    const cache = await cacheSiExiste(token);
    if (!cache) return;
    for (const clave of quePodar((await cache.keys()).map((p) => p.url), idsVigentes)) {
      if (await cache.delete(clave)) borrados++;
    }
  } catch {
    // Lo que no se pudo borrar se borra la próxima vez, o a los 60 días.
  }
  if (borrados > 0) avisarCambioDeCopia(token);
}

/**
 * Baja el video entero (con el porcentaje) y lo guarda en el celular.
 * Si no se puede guardar (sin lugar, sin Cache API), igual lo devuelve para
 * mirarlo ahora. Tira `sin_senal` o `no_disponible`.
 *
 * `guardar`: al mirarlo, lo que diga GUARDAR_AL_MIRAR (pregunta 7); el botón
 * «Guardar los videos» pasa true.
 */
export async function bajarYGuardar(
  token: string,
  clip: ClipPublico,
  alAvanzar?: (pct: number) => void,
  senal?: AbortSignal,
  guardar: boolean = GUARDAR_AL_MIRAR,
): Promise<Blob> {
  if (sinSenal()) throw new Error('sin_senal');

  let url: string | undefined;
  try {
    // Si no está en lo recordado (recién subido), se pide la lista otra vez.
    url = await firmas.de(token, clip.id);
  } catch {
    throw new Error(sinSenal() ? 'sin_senal' : 'no_disponible');
  }
  if (!url) throw new Error('no_disponible');

  let blob: Blob;
  try {
    blob = await bajarConAvance(url, {
      total: clip.bytes, tipo: 'video/mp4', sinAvanceMs: SIN_AVANCE_BAJADA_MS, alAvanzar, senal,
    });
  } catch (e) {
    const motivo = errorDeBajada(e);
    if (motivo === 'parada') throw e;
    // Una firma vencida o un video que ya no está: la próxima vez se piden de nuevo.
    if (motivo === 'http') firmas.olvidar(token);
    if (motivo === 'quieta') throw new Error('quieta');
    throw new Error(motivo === 'red' && sinSenal() ? 'sin_senal' : 'no_disponible');
  }

  if (!guardar) return blob;
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(nombreCacheRutina(token));
      await cache.put(new Request(claveClip(clip.id)), new Response(blob, {
        headers: { 'Content-Type': 'video/mp4', 'x-orden-guardada': new Date().toISOString() },
      }));
      avisarCambioDeCopia(token);
    }
  } catch {
    // Sin lugar o sin Cache API: se mira igual, solo que no queda guardado.
  }
  return blob;
}
