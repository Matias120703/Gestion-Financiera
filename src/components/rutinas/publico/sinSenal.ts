'use client';

import { nombreCacheRutina, recursoGuardable } from '@/lib/rutina-sin-senal';
import { avisarCambioDeCopia } from './clips';
import { rutaDeRutina } from './enlace';
import { borrarTildes } from './tildes';

/**
 * LA RUTINA DEL ALUMNO SIN SEÑAL, DEL LADO DE LA PÁGINA.
 *
 * Quien guarda y sirve la copia es el service worker (public/sw.js). La
 * página solo le pide «guardame» después de cargar: el service worker se
 * registra después de `load` (RegistrarServiceWorker), así que en la primera
 * visita ni el HTML ni sus archivos pasaron por él, y sin este pedido abrir
 * el link una vez con señal no dejaba nada guardado.
 *
 * Todo con try/catch y con un tope de espera: en un navegador sin service
 * worker ni Cache API (el de algunas apps, una ventana privada) la página
 * queda exactamente como antes, solo que sin copia.
 */

export interface ResultadoGuardado {
  ok: boolean;
  /** Cuándo se guardó la página (la hora del celular), si quedó guardada. */
  guardadaEl: string | null;
}

const NADA: ResultadoGuardado = { ok: false, guardadaEl: null };

/** Cuánto se espera a que el service worker esté listo, y a que conteste. */
const ESPERA_REGISTRO_MS = 10_000;
const ESPERA_RESPUESTA_MS = 15_000;

function conTope<T>(promesa: Promise<T>, ms: number, siNo: T): Promise<T> {
  return new Promise<T>((listo) => {
    const reloj = setTimeout(() => listo(siNo), ms);
    promesa.then(
      (v) => { clearTimeout(reloj); listo(v); },
      () => { clearTimeout(reloj); listo(siNo); },
    );
  });
}

function limpiarResultado(v: unknown): ResultadoGuardado {
  if (!v || typeof v !== 'object') return NADA;
  const o = v as Record<string, unknown>;
  return { ok: o.ok === true, guardadaEl: typeof o.guardadaEl === 'string' ? o.guardadaEl : null };
}

/**
 * Le pide al service worker que guarde la página de este link y los
 * archivos que usó. `forzarHtml`: pedir la página de nuevo aunque ya haya
 * copia (la que se ve es vieja). `fresca`: borrar de la copia los archivos
 * de versiones anteriores.
 */
export async function pedirGuardado(
  token: string,
  { forzarHtml, fresca }: { forzarHtml: boolean; fresca: boolean },
): Promise<ResultadoGuardado> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return NADA;
    const registro = await conTope<ServiceWorkerRegistration | null>(
      navigator.serviceWorker.ready, ESPERA_REGISTRO_MS, null,
    );
    const trabajador = registro?.active;
    if (!trabajador) return NADA;

    const recursos = performance.getEntriesByType('resource')
      .map((e) => e.name)
      .filter((h) => recursoGuardable(h, location.origin));

    const canal = new MessageChannel();
    const respuesta = new Promise<ResultadoGuardado>((listo) => {
      canal.port1.onmessage = (e) => listo(limpiarResultado(e.data));
    });
    trabajador.postMessage(
      { tipo: 'guardar-rutina', ruta: rutaDeRutina(token), recursos, forzarHtml, fresca },
      [canal.port2],
    );
    const resultado = await conTope(respuesta, ESPERA_RESPUESTA_MS, NADA);
    canal.port1.close();
    return resultado;
  } catch {
    return NADA;
  }
}

/**
 * Borra de este celular la copia del link (la página y los videos) y lo
 * tildado. La usan el botón «Borrar la copia de este celular» y la página
 * cuando la base dice que el link ya no anda.
 */
export async function borrarCopia(token: string): Promise<boolean> {
  borrarTildes(token);
  let listo = true;
  try {
    if (typeof caches !== 'undefined') {
      await caches.delete(nombreCacheRutina(token));
    }
  } catch {
    listo = false;
  }
  avisarCambioDeCopia(token);
  return listo;
}

/** Cuántos bytes le quedan libres al sitio en este celular, o null si no se sabe. */
export async function lugarLibre(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || typeof e.quota !== 'number') return null;
    return Math.max(0, e.quota - (e.usage ?? 0));
  } catch {
    return null;
  }
}

/**
 * Le pide al navegador que no borre lo guardado cuando le falta lugar. Chrome
 * lo concede solo (según el uso); Safari no lo promete. Nunca pregunta nada
 * que el alumno tenga que entender: si no se concede, se guarda igual.
 */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) === true;
  } catch {
    return false;
  }
}

/**
 * Un iPhone o iPad en el navegador, no desde el ícono de inicio. En iPhone,
 * lo guardado por una pestaña se borra a los 7 días sin entrar; desde el
 * ícono de inicio, no (pregunta 11 de Matías).
 */
export function esIphoneEnSafari(): boolean {
  try {
    const ua = navigator.userAgent || '';
    const esIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const desdeElInicio = (navigator as Navigator & { standalone?: boolean }).standalone === true
      || window.matchMedia?.('(display-mode: standalone)').matches === true;
    return esIos && !desdeElInicio;
  } catch {
    return false;
  }
}
