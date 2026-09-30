/**
 * LA RUTINA DEL ALUMNO EN SU CELULAR (113): reglas puras, sin navegador.
 *
 * Los videos propios del trainer se guardan en el celular del alumno la
 * primera vez que los mira con señal, en la Cache API, en una caché por
 * link (`orden-rutina:<token>`) que el service worker no borra al cambiar
 * de versión (public/sw.js, `activate`). Se reproducen desde un `blob:`: no
 * dependen de que la dirección firmada siga viva ni de las respuestas 206
 * que pide Safari, y es la misma copia que sirve sin señal.
 *
 * LA RUTINA SIN SEÑAL. En esa misma caché, el service worker guarda la
 * página del link (el HTML y los archivos con hash que usa) cada vez que se
 * abre con señal, y la sirve cuando no la hay o cuando la red tarda más de
 * ESPERA_RED_MS. Qué se guarda lo dice la propia página con una marca
 * (`<meta name="orden-rutina" content="…">`, ver `estadoParaGuardar`): un
 * error momentáneo de la base nunca pisa ni borra una copia buena, y un
 * link apagado se borra la próxima vez que se abre con señal.
 *
 * public/sw.js no puede importar este archivo (no pasa por el compilador):
 * repite ESPERA_RED_MS, DIAS_COPIA, el patrón del token, los estados y la
 * regla de los recursos, y pruebas/sin-senal.test.js comprueba que digan lo
 * mismo que acá.
 *
 * Esto lo usan la página del alumno (publico/clips.ts, publico/sinSenal.ts,
 * VideoPropio.tsx, GuardarVideos.tsx, TarjetaEjercicio.tsx, RutinaDelCliente)
 * y lo prueban pruebas/videos-reglas.test.js y pruebas/sin-senal.test.js.
 */
import type { ClipPublico, RutinaPublica } from './tipos-rutinas';

/** El prefijo de la caché de cada link. El service worker lo respeta en `activate`. */
export const PREFIJO_CACHE_RUTINA = 'orden-rutina:';

/**
 * Cuánto espera el service worker a la red antes de mostrar la copia (si
 * hay una). Con señal, la rutina llega al día; en el sótano del gimnasio,
 * abre igual. Paridad con public/sw.js.
 */
export const ESPERA_RED_MS = 5000;

/**
 * Pregunta 8 de Matías: cuánto dura la copia de un link que no se vuelve a
 * abrir con señal. Se cuenta desde la última vez que se guardó algo (la
 * página o un video). Paridad con public/sw.js.
 */
export const DIAS_COPIA = 60;

/**
 * El token del link: un uuid. El `source` de ES_TOKEN de
 * src/components/rutinas/publico/enlace.ts, y el mismo que usa public/sw.js
 * para reconocer la página del alumno (hay una prueba de paridad).
 */
export const PATRON_TOKEN_RUTINA = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

/**
 * Pregunta 7 de Matías: ¿un video se guarda en el celular al mirarlo una vez
 * con señal? Por defecto sí (y además está el botón «Guardar los videos»).
 * En false, mirarlo lo baja y lo reproduce sin guardarlo: solo se guardan
 * con el botón. Nunca se bajan todos solos.
 */
export const GUARDAR_AL_MIRAR = true;

/**
 * Lo que la página le dice al service worker sobre sí misma (la marca):
 *   · activa, preparando, renovar → se guarda (con preparando y renovar,
 *     sin videos: no hay rutina que los muestre);
 *   · inactiva → se borra todo lo guardado de ese link;
 *   · error → no se toca nada (la base no contestó: la copia buena queda).
 */
export type EstadoCopia = 'activa' | 'preparando' | 'renovar' | 'inactiva' | 'error';

/** Los estados, en el orden de public/sw.js (ESTADOS_RUTINA). */
export const ESTADOS_COPIA: readonly EstadoCopia[] = ['activa', 'preparando', 'renovar', 'inactiva', 'error'];

/**
 * Pregunta 1 de Matías: si un ejercicio tiene el video del trainer y
 * también un link de YouTube, ¿qué ve el alumno? Por defecto, solo el
 * propio (un solo botón claro, y anda sin señal); el link, cuando no hay
 * propio.
 */
export const VIDEO_PROPIO_TAPA_EL_LINK = true;

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ES_LINK = /^https:\/\/\S+$/i;

export function nombreCacheRutina(token: string): string {
  return PREFIJO_CACHE_RUTINA + token;
}

/** La clave de un video adentro de la caché del link: nunca la dirección firmada, que cambia. */
export function claveClip(id: string): string {
  return '/__clip/' + id;
}

/** Un `clip` que llegó de la base (o de una copia vieja): se toma solo si tiene la forma justa. */
export function clipLimpio(v: unknown): ClipPublico | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const id = typeof o.id === 'string' && ES_UUID.test(o.id) ? o.id : null;
  const bytes = typeof o.bytes === 'number' && Number.isFinite(o.bytes) && o.bytes > 0 ? o.bytes : null;
  const seg = typeof o.seg === 'number' && Number.isFinite(o.seg) && o.seg > 0 ? o.seg : null;
  if (!id || bytes === null || seg === null) return null;
  return { id, bytes, seg };
}

/** Los videos propios de la rutina vigente, sin repetir, en el orden en que aparecen. */
export function clipsDeLaRutina(datos: RutinaPublica | null): ClipPublico[] {
  if (!datos || !datos.existe || datos.renovar || !datos.rutina || !Array.isArray(datos.rutina.dias)) return [];
  const vistos = new Set<string>();
  const lista: ClipPublico[] = [];
  for (const dia of datos.rutina.dias) {
    for (const e of Array.isArray(dia?.ejercicios) ? dia.ejercicios : []) {
      const c = e.clip;
      if (!c || vistos.has(c.id)) continue;
      vistos.add(c.id);
      lista.push(c);
    }
  }
  return lista;
}

/**
 * Qué botón de video lleva un ejercicio en la página del alumno. El link se
 * vuelve a mirar acá (solo https) porque se toca desde una página pública.
 * Con VIDEO_PROPIO_TAPA_EL_LINK en false, el link gana cuando hay los dos.
 */
export function queVideoMostrar(e: { clip: ClipPublico | null; video: string | null }): 'clip' | 'link' | null {
  const hayLink = typeof e.video === 'string' && ES_LINK.test(e.video);
  if (e.clip && (VIDEO_PROPIO_TAPA_EL_LINK || !hayLink)) return 'clip';
  if (hayLink) return 'link';
  return null;
}

// ─────────────────────────── la página sin señal ───────────────────────────

/**
 * La marca que lleva la página (`metadata.other['orden-rutina']`). null es
 * que el servidor no pudo preguntarle a la base: la copia que haya no se toca.
 */
export function estadoParaGuardar(datos: RutinaPublica | null): EstadoCopia {
  if (!datos) return 'error';
  if (!datos.existe) return 'inactiva';
  if (datos.renovar) return 'renovar';
  if (!datos.rutina || !Array.isArray(datos.rutina.dias) || datos.rutina.dias.length === 0) return 'preparando';
  return 'activa';
}

/**
 * ¿La página que se ve es una copia guardada? Se sabe por la hora en que la
 * armó el servidor (`generada`): una recién pedida tiene segundos. Con más
 * de `margenMs`, es la copia que sirvió el service worker. Una fecha rota no
 * es una copia (no se molesta al alumno por nada).
 */
export function esCopiaVieja(generada: string, ahora: number, margenMs = 120_000): boolean {
  const t = Date.parse(generada);
  if (!Number.isFinite(t) || !Number.isFinite(ahora)) return false;
  return ahora - t > margenMs;
}

/**
 * Un archivo con hash de Next (16 cifras hexadecimales en el nombre): el
 * nombre cambia si cambia el contenido, así que guardarlo es seguro. Los de
 * `/_next/static/webpack/` son del modo desarrollo (recarga en caliente).
 */
function conHash(ruta: string): boolean {
  return ruta.startsWith('/_next/static/') && !ruta.startsWith('/_next/static/webpack/') && /[0-9a-f]{16}/i.test(ruta);
}

/**
 * Si un archivo que usó la página se guarda con la copia: del mismo sitio, y
 * con hash o un ícono. Nunca `/api/`, ni datos, ni otro sitio (Supabase, los
 * videos firmados). La misma regla que `esRecursoGuardable` de public/sw.js.
 */
export function recursoGuardable(href: string, origen: string): boolean {
  let u: URL;
  try {
    u = new URL(href, origen);
  } catch {
    return false;
  }
  if (u.origin !== origen) return false;
  return conHash(u.pathname) || u.pathname.startsWith('/iconos/');
}

/** El id de un video guardado a partir de su clave (`…/__clip/<id>`), o null si no es un video. */
function idDeClave(clave: string): string | null {
  const marca = claveClip('');
  const i = clave.indexOf(marca);
  if (i < 0) return null;
  const id = clave.slice(i + marca.length).split(/[?#]/)[0];
  return id || null;
}

/**
 * Los videos guardados que ya no están en la rutina vigente (el trainer los
 * cambió o los quitó): sus claves, para borrarlas. Lo que no es un video no
 * se toca.
 */
export function quePodar(clavesGuardadas: string[], idsVigentes: string[]): string[] {
  const vigentes = new Set(idsVigentes);
  return clavesGuardadas.filter((clave) => {
    const id = idDeClave(clave);
    return id !== null && !vigentes.has(id);
  });
}

/** Los ids de los videos guardados, a partir de las claves de la caché del link. */
export function idsGuardados(clavesGuardadas: string[]): Set<string> {
  const ids = new Set<string>();
  for (const clave of clavesGuardadas) {
    const id = idDeClave(clave);
    if (id) ids.add(id);
  }
  return ids;
}

/** Cuántos videos de la rutina faltan guardar, y cuánto pesan entre todos. */
export function bytesPendientes(clips: ClipPublico[], guardados: Set<string>): { cuantos: number; bytes: number } {
  let cuantos = 0;
  let bytes = 0;
  for (const c of clips) {
    if (guardados.has(c.id)) continue;
    cuantos++;
    bytes += Number.isFinite(c.bytes) && c.bytes > 0 ? c.bytes : 0;
  }
  return { cuantos, bytes };
}
