/**
 * BAJAR UN VIDEO EN EL CELULAR DEL ALUMNO (113, revisión del 30/09): las
 * direcciones firmadas que se recuerdan, y la bajada con avance, «Parar» y
 * un tope por falta de avance.
 *
 * Lo usa publico/clips.ts. Está acá, sin imports, para probarlo sin
 * navegador (pruebas/videos-reglas.test.js le pasa un fetch de mentira).
 *
 *   · `crearFirmas`: las direcciones de /rutina/<token>/videos se recuerdan
 *     un rato por token. Si piden un video que NO está en lo recordado (el
 *     trainer lo acaba de subir o de cambiar: «ya está, miralo»), se vuelve
 *     a pedir la lista UNA vez antes de decir que no está. Antes, ese video
 *     no cargaba hasta 150 minutos después o hasta recargar la página.
 *   · `bajarConAvance`: si pasan `sinAvanceMs` sin que llegue nada (una raya
 *     de señal: la bajada se queda en «Bajando 43 %»), se corta con
 *     `'quieta'`. `senal` es el «Parar» del alumno. Antes no había ninguna de
 *     las dos cosas y solo se salía recargando.
 */

export interface Firmas {
  /** Todas las direcciones del link (recordadas si están frescas). */
  todas(token: string): Promise<Record<string, string>>;
  /** La dirección de un video; si no está en lo recordado, se pide la lista otra vez. */
  de(token: string, id: string): Promise<string | undefined>;
  /** Olvida lo recordado (una firma vencida, un video que ya no está). */
  olvidar(token: string): void;
}

export function crearFirmas(
  pedir: (token: string) => Promise<Record<string, string>>,
  { recordarMs, ahora = () => Date.now() }: { recordarMs: number; ahora?: () => number },
): Firmas {
  const recordadas = new Map<string, { hasta: number; clips: Record<string, string> }>();
  async function traer(token: string): Promise<Record<string, string>> {
    const clips = await pedir(token);
    recordadas.set(token, { hasta: ahora() + recordarMs, clips });
    return clips;
  }
  async function todas(token: string): Promise<Record<string, string>> {
    const r = recordadas.get(token);
    return r && r.hasta > ahora() ? r.clips : traer(token);
  }
  return {
    todas,
    async de(token, id) {
      const r = recordadas.get(token);
      const deMemoria = !!r && r.hasta > ahora();
      const url = (await todas(token))[id];
      if (url || !deMemoria) return url;
      return (await traer(token))[id];
    },
    olvidar(token) { recordadas.delete(token); },
  };
}

export type ErrorBajada = 'quieta' | 'red' | 'http';

/** Un error de `bajarConAvance`: `Error(<ErrorBajada>)`, o el AbortError de «Parar». */
export function errorDeBajada(e: unknown): ErrorBajada | 'parada' {
  if (e instanceof DOMException && e.name === 'AbortError') return 'parada';
  if (e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError') return 'parada';
  const m = e instanceof Error ? e.message : '';
  return m === 'quieta' || m === 'http' ? m : 'red';
}

function parada(): Error {
  try {
    return new DOMException('Parada', 'AbortError');
  } catch {
    const e = new Error('Parada');
    e.name = 'AbortError';
    return e;
  }
}

/**
 * Baja entera una dirección, con el porcentaje (`total`: los bytes que se
 * esperan si el servidor no los dice). Tira `Error('quieta')` si no llega
 * nada en `sinAvanceMs`, `Error('http')` con una respuesta que no es 2xx,
 * `Error('red')` si se cortó, o el AbortError de `senal`.
 */
export async function bajarConAvance(
  url: string,
  { total, tipo, sinAvanceMs, alAvanzar, senal, hacerFetch = fetch }: {
    total: number;
    tipo: string;
    sinAvanceMs: number;
    alAvanzar?: (pct: number) => void;
    senal?: AbortSignal;
    hacerFetch?: typeof fetch;
  },
): Promise<Blob> {
  if (senal?.aborted) throw parada();
  const interno = new AbortController();
  let quieta = false;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const vigilar = () => {
    if (reloj !== undefined) clearTimeout(reloj);
    reloj = setTimeout(() => { quieta = true; interno.abort(); }, sinAvanceMs);
  };
  const alParar = () => interno.abort();
  senal?.addEventListener('abort', alParar);
  try {
    vigilar();
    const respuesta = await hacerFetch(url, { signal: interno.signal });
    if (!respuesta.ok) throw new Error('http');
    const esperado = Number(respuesta.headers.get('content-length')) || total;
    let blob: Blob;
    if (respuesta.body) {
      const lector = respuesta.body.getReader();
      const pedazos: BlobPart[] = [];
      let recibidos = 0;
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        if (value) {
          vigilar();
          pedazos.push(value);
          recibidos += value.byteLength;
          alAvanzar?.(Math.min(99, Math.round((recibidos / Math.max(1, esperado)) * 100)));
        }
      }
      blob = new Blob(pedazos, { type: tipo });
    } else {
      blob = new Blob([await respuesta.arrayBuffer()], { type: tipo });
    }
    alAvanzar?.(100);
    return blob;
  } catch (e) {
    if (quieta) throw new Error('quieta');
    if (senal?.aborted) throw parada();
    if (e instanceof Error && e.message === 'http') throw e;
    throw new Error('red');
  } finally {
    if (reloj !== undefined) clearTimeout(reloj);
    senal?.removeEventListener('abort', alParar);
  }
}
