/**
 * TRAER UNA PLANILLA DE GOOGLE SHEETS POR SU LINK (114).
 *
 * El trainer pega el link de su planilla (compartida como «Cualquier persona
 * con el enlace») y el servidor baja el .xlsx que exporta Google. Es un
 * pedido que el SERVIDOR hace a una dirección que manda el navegador: el
 * riesgo es que lo usen para pedir otra cosa (SSRF). Por eso:
 *
 *   · la dirección que se pide se ARMA DE CERO con el id de la planilla,
 *     nunca se pide la que mandaron: siempre https://docs.google.com/…;
 *   · solo se acepta el host exacto `docs.google.com` (no
 *     «docs.google.com.evil.com», ni un usuario@, ni un «?u=» con el link
 *     adentro), y el id solo admite letras, números, «_» y «-»;
 *   · las redirecciones se siguen a mano, como mucho 3, y solo a
 *     `docs.google.com` o `*.googleusercontent.com` por https (así contestó
 *     Google el 30/09/2026 para una planilla pública: 307 a
 *     googleusercontent). Una redirección a otro lado no se sigue;
 *   · 10 segundos en total, y el cuerpo se corta al pasar los 4 MB mientras
 *     se lee (no se espera al final);
 *   · lo que vuelve tiene que ser un zip («PK»): una página de login de
 *     Google (la planilla no está compartida) no es una planilla.
 *
 * `hacerFetch` se inyecta para probar todas las respuestas sin red.
 */
import { TOPES_PLANILLA } from './planilla';

export type ErrorEnlace =
  | 'enlace_invalido' | 'no_es_sheets' | 'archivo_en_drive' | 'no_compartida'
  | 'no_existe' | 'google_no_responde' | 'muy_grande';

const HOST = 'docs.google.com';
const RE_PLANILLA = /^\/spreadsheets\/(?:u\/\d{1,2}\/)?d\/([A-Za-z0-9_-]{20,100})(?:\/|$)/;
const RE_PUBLICADA = /^\/spreadsheets\/(?:u\/\d{1,2}\/)?d\/e\/(2PACX-[A-Za-z0-9_-]{10,200})\/(?:pubhtml|pub)(?:\/|$)/;
const RE_OTRO_DOCUMENTO = /^\/(?:document|presentation|forms|drawings)\//;

/**
 * Lo que pegó el trainer → la dirección del export .xlsx, armada de cero,
 * o por qué no sirve. Acepta el link sin «https://», con espacios alrededor
 * (WhatsApp), con «/u/1/», con «#gid=…» o con «?usp=…».
 */
export function exportDeSheets(pegado: string): { url: string } | { error: ErrorEnlace } {
  let s = String(pegado ?? '').trim();
  if (!s) return { error: 'enlace_invalido' };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { error: 'enlace_invalido' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'enlace_invalido' };
  if (u.username || u.password || u.port) return { error: 'enlace_invalido' };
  const host = u.hostname.toLowerCase();
  if (host === 'drive.google.com') {
    return /^\/(?:file\/d\/|open)/.test(u.pathname) ? { error: 'archivo_en_drive' } : { error: 'enlace_invalido' };
  }
  if (host !== HOST) return { error: 'enlace_invalido' };
  const pub = RE_PUBLICADA.exec(u.pathname);
  if (pub) return { url: `https://${HOST}/spreadsheets/d/e/${pub[1]}/pub?output=xlsx` };
  const id = RE_PLANILLA.exec(u.pathname);
  if (id && id[1] !== 'e') return { url: `https://${HOST}/spreadsheets/d/${id[1]}/export?format=xlsx` };
  if (RE_OTRO_DOCUMENTO.test(u.pathname)) return { error: 'no_es_sheets' };
  return { error: 'enlace_invalido' };
}

/** ¿Se puede seguir esta redirección? Solo https a Google Docs o a su almacenamiento. */
function redireccionPermitida(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  return u.protocol === 'https:' && !u.username && !u.password && !u.port
    && (host === HOST || host.endsWith('.googleusercontent.com'));
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Lee el cuerpo cortando apenas pasa el tope. */
async function leerConTope(r: Response, tope: number): Promise<Uint8Array | 'muy_grande'> {
  const largo = Number(r.headers.get('content-length') ?? '');
  if (Number.isFinite(largo) && largo > tope) return 'muy_grande';
  if (!r.body) {
    const b = new Uint8Array(await r.arrayBuffer());
    return b.length > tope ? 'muy_grande' : b;
  }
  const lector = r.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > tope) {
      try { await lector.cancel(); } catch { /* ya cortado */ }
      return 'muy_grande';
    }
    partes.push(value);
  }
  const todo = new Uint8Array(total);
  let p = 0;
  for (const x of partes) { todo.set(x, p); p += x.length; }
  return todo;
}

/**
 * Baja el .xlsx de la dirección que armó `exportDeSheets`. Devuelve los
 * bytes o por qué no se pudo: 404 → no existe; 401/403, una página HTML o
 * una redirección al login → no está compartida; 429/5xx, más de 3
 * redirecciones o más de 10 s → Google no responde.
 */
export async function bajarDeGoogle(url: string, hacerFetch: Fetch = fetch): Promise<Uint8Array | { error: ErrorEnlace }> {
  let actual: URL;
  try {
    actual = new URL(url);
  } catch {
    return { error: 'enlace_invalido' };
  }
  if (actual.hostname.toLowerCase() !== HOST || actual.protocol !== 'https:') return { error: 'enlace_invalido' };

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 10_000);
  try {
    for (let saltos = 0; ; saltos++) {
      const r = await hacerFetch(actual.toString(), {
        redirect: 'manual', signal: control.signal, credentials: 'omit', cache: 'no-store',
      });
      if (r.status >= 300 && r.status < 400) {
        const destino = r.headers.get('location');
        if (!destino) return { error: 'google_no_responde' };
        let siguiente: URL;
        try {
          siguiente = new URL(destino, actual);
        } catch {
          return { error: 'no_compartida' };
        }
        // Al login de Google, a otro host o a http: no se sigue.
        if (!redireccionPermitida(siguiente)) return { error: 'no_compartida' };
        if (saltos >= 3) return { error: 'google_no_responde' };
        actual = siguiente;
        continue;
      }
      if (r.status === 404 || r.status === 410) return { error: 'no_existe' };
      if (r.status === 429 || r.status >= 500) return { error: 'google_no_responde' };
      if (r.status !== 200) return { error: 'no_compartida' };
      if (/text\/html/i.test(r.headers.get('content-type') ?? '')) return { error: 'no_compartida' };
      const cuerpo = await leerConTope(r, TOPES_PLANILLA.bytes);
      if (cuerpo === 'muy_grande') return { error: 'muy_grande' };
      if (cuerpo.length < 4 || cuerpo[0] !== 0x50 || cuerpo[1] !== 0x4b) return { error: 'no_compartida' };
      return cuerpo;
    }
  } catch {
    return { error: 'google_no_responde' };
  } finally {
    clearTimeout(reloj);
  }
}
