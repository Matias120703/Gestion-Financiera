/**
 * SUBIR UN ARCHIVO A SUPABASE STORAGE DESDE EL NAVEGADOR, con el avance, un
 * tope por falta de avance y la opción de cancelar (113, revisión del 30/09).
 *
 * Por qué no `supabase.storage.from(…).upload()`: no se puede cortar (no
 * acepta un AbortSignal), no dice cuánto va, y con una señal que se queda
 * colgada (no cortada del todo) la pantalla quedaba en «Subiendo…» para
 * siempre, sin forma de salir más que recargando. Acá va el MISMO pedido que
 * arma storage-js (POST /storage/v1/object/<bucket>/<ruta> con el token del
 * usuario, la clave pública y un FormData con `cacheControl` y el archivo),
 * pero con XMLHttpRequest, que sí avisa el avance de la subida:
 *
 *   · `alAvanzar(pct)` con cada pedazo que sale;
 *   · si pasan `sinAvanceMs` sin que salga nada, se corta: `'quieta'`;
 *   · `senal` (AbortController) la corta cuando el trainer toca «Cancelar».
 *
 * El tipo del archivo va SIEMPRE como `tipo` (por ejemplo video/mp4): en el
 * FormData manda el tipo del Blob, no la opción `contentType`, y un archivo
 * del selector puede venir sin tipo o como video/3gpp. El bucket acepta solo
 * video/mp4: se rechazaba con la señal perfecta.
 *
 * Genérico a propósito (módulos por problema): hoy sube los videos del
 * trainer; sirve para cualquier archivo. No importa nada: se compila suelto
 * para las pruebas (pruebas/videos-reglas.test.js le pasa un XHR de mentira).
 */

export type ResultadoSubidaArchivo = 'ok' | 'fallo' | 'quieta' | 'cancelada';

export interface PedidoSubida {
  /** La dirección del proyecto (NEXT_PUBLIC_SUPABASE_URL), sin barra final. */
  base: string;
  /** La clave pública del proyecto (va en `apikey`). */
  clave: string;
  /** El token de la sesión del usuario: las policies de Storage deciden con él. */
  token: string;
  bucket: string;
  ruta: string;
  archivo: Blob;
  /** El Content-Type con el que se guarda (el del Blob que se manda). */
  tipo: string;
  /** Cuánto lo guarda el navegador que lo baje (Cache-Control), en segundos. */
  cacheSeg: number;
  /** Sin avance durante este tiempo, se corta. */
  sinAvanceMs: number;
  alAvanzar?: (pct: number) => void;
  senal?: AbortSignal;
  /** Para las pruebas: de dónde sale el XMLHttpRequest. */
  crearXhr?: () => XMLHttpRequest;
}

/** El cuerpo de la subida: el archivo con el tipo que se pide, siempre. */
export function cuerpoDeSubida(archivo: Blob, tipo: string, cacheSeg: number): FormData {
  const cuerpo = new FormData();
  cuerpo.append('cacheControl', String(cacheSeg));
  cuerpo.append('', archivo.type === tipo ? archivo : new Blob([archivo], { type: tipo }));
  return cuerpo;
}

/** La dirección de la subida. Cada parte de la ruta, codificada. */
export function direccionDeSubida(base: string, bucket: string, ruta: string): string {
  const limpia = ruta.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${base.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${limpia}`;
}

export function subirAStorage(p: PedidoSubida): Promise<ResultadoSubidaArchivo> {
  if (p.senal?.aborted) return Promise.resolve('cancelada');
  return new Promise<ResultadoSubidaArchivo>((resolver) => {
    let xhr: XMLHttpRequest;
    try {
      xhr = p.crearXhr ? p.crearXhr() : new XMLHttpRequest();
    } catch {
      resolver('fallo');
      return;
    }
    let terminado = false;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const alCancelar = () => { terminar('cancelada'); cortar(); };
    const terminar = (r: ResultadoSubidaArchivo) => {
      if (terminado) return;
      terminado = true;
      if (reloj !== undefined) clearTimeout(reloj);
      p.senal?.removeEventListener('abort', alCancelar);
      resolver(r);
    };
    const cortar = () => { try { xhr.abort(); } catch { /* ya estaba cortada */ } };
    // Cada avance reinicia el reloj: se corta solo si NO sale nada en `sinAvanceMs`.
    const vigilar = () => {
      if (reloj !== undefined) clearTimeout(reloj);
      reloj = setTimeout(() => { terminar('quieta'); cortar(); }, p.sinAvanceMs);
    };

    try {
      xhr.open('POST', direccionDeSubida(p.base, p.bucket, p.ruta));
      xhr.setRequestHeader('Authorization', `Bearer ${p.token}`);
      xhr.setRequestHeader('apikey', p.clave);
      // Un video no se pisa: se sube otro (la ruta la dio la base, nueva).
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (e: ProgressEvent) => {
        vigilar();
        if (e.lengthComputable && e.total > 0) p.alAvanzar?.(Math.min(100, Math.max(0, Math.round((e.loaded / e.total) * 100))));
      };
      xhr.onload = () => terminar(xhr.status >= 200 && xhr.status < 300 ? 'ok' : 'fallo');
      xhr.onerror = () => terminar('fallo');
      xhr.onabort = () => terminar('cancelada');
      p.senal?.addEventListener('abort', alCancelar);
      vigilar();
      xhr.send(cuerpoDeSubida(p.archivo, p.tipo, p.cacheSeg));
    } catch {
      terminar('fallo');
    }
  });
}
