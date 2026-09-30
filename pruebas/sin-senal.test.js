/**
 * La rutina del alumno sin señal (Parte 2 del trainer, sin migración).
 *
 * El alumno abre su link una vez con señal y, desde ahí, lo ve también sin
 * señal (con los videos que guardó). Lo hacen tres piezas:
 *
 *   · public/sw.js: guarda la página de /rutina/<token> según la marca que
 *     trae (`<meta name="orden-rutina">`), la sirve sin señal o cuando la red
 *     tarda, y guarda lo que la página le pide en la primera visita;
 *   · src/lib/rutina-sin-senal.ts: las reglas puras (qué marca lleva la
 *     página, cuándo es una copia vieja, qué archivo se guarda, qué video
 *     sobra);
 *   · la página (RutinaDelCliente, publico/sinSenal.ts, GuardarVideos.tsx).
 *
 * El service worker se prueba ENTERO en una caja (`vm`), con `caches`,
 * `fetch` y `self` falsos: si tuviera un error de sintaxis, cargarlo ya
 * falla (un sw.js roto deja a TODOS sin service worker). Y como sw.js no
 * puede importar la lib, se comprueba que los dos digan lo mismo.
 *
 * Lee `.compilado/` (lo arma `probar:calculos` con tsconfig.calculos.json).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a.length > 90 ? a.slice(0, 87) + '...' : a}`);
}
function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

const raiz = path.join(__dirname, '..');
// CRLF normalizado: en un worktree de Windows los fuentes llegan con \r\n.
const leer = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
/** El código sin comentarios: lo que dicen los comentarios no cuenta. */
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));

const S = require('../.compilado/rutina-sin-senal.js');

// Una promesa del service worker que nunca termina dejaría a Node sin nada
// que hacer, y Node sale con 0 sin terminar las comprobaciones: la guardia lo
// convierte en un fallo.
const guardia = setTimeout(() => {
  console.log('\n>>> LA PRUEBA DE LA RUTINA SIN SEÑAL SE COLGÓ (una promesa del service worker nunca terminó)');
  process.exit(1);
}, 60_000);

const ORIGEN = 'https://orden.test';
const T1 = '0f8fad5b-d9cb-469f-a165-70867728950e';
const T2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const T3 = '16fd2706-8baf-433b-82eb-8c7fada847da';
const ID1 = '11111111-2222-4333-8444-555555555555';
const ID2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DIA = 24 * 60 * 60 * 1000;

// ─────────────────────────── la caja del service worker ───────────────────────────

/** Una Cache API en memoria, con lo que usa sw.js (y `cacheName` en `caches.match`). */
function crearCaches(origen) {
  const almacen = new Map();
  const claveDe = (pedido) => new URL(typeof pedido === 'string' ? pedido : pedido.url, origen).href;
  const sinBusqueda = (href) => { const u = new URL(href); u.search = ''; u.hash = ''; return u.href; };
  const armar = (e) => new Response(e.cuerpo.length ? e.cuerpo : null, { status: e.status, headers: e.headers });

  class CacheFalsa {
    constructor(mapa) { this.mapa = mapa; }
    async match(pedido, opciones = {}) {
      const k = claveDe(pedido);
      for (const [url, e] of this.mapa) {
        if (url === k || (opciones.ignoreSearch && sinBusqueda(url) === sinBusqueda(k))) return armar(e);
      }
      return undefined;
    }
    async put(pedido, respuesta) {
      const cuerpo = Buffer.from(await respuesta.arrayBuffer());
      this.mapa.set(claveDe(pedido), { status: respuesta.status, headers: [...respuesta.headers.entries()], cuerpo });
    }
    async add(url) {
      const r = await caja.red.fetch(url);
      if (!r.ok) throw new TypeError('add falló');
      await this.put(url, r);
    }
    async keys() { return [...this.mapa.keys()].map((u) => new Request(u)); }
    async delete(pedido) { return this.mapa.delete(claveDe(pedido)); }
  }
  let caja = null;
  return {
    almacen,
    atar(c) { caja = c; },
    api: {
      async open(n) { if (!almacen.has(n)) almacen.set(n, new Map()); return new CacheFalsa(almacen.get(n)); },
      async has(n) { return almacen.has(n); },
      async delete(n) { return almacen.delete(n); },
      async keys() { return [...almacen.keys()]; },
      async match(pedido, opciones = {}) {
        const nombres = opciones.cacheName !== undefined
          ? (almacen.has(opciones.cacheName) ? [opciones.cacheName] : [])
          : [...almacen.keys()];
        for (const n of nombres) {
          const r = await new CacheFalsa(almacen.get(n)).match(pedido, opciones);
          if (r) return r;
        }
        return undefined;
      },
    },
  };
}

/** La red: cada pedido queda anotado; `responder(url)` decide (tirar = sin red). */
function crearRed() {
  const red = { pedidos: [], responder: null };
  red.fetch = async (entrada) => {
    const url = typeof entrada === 'string' ? new URL(entrada, ORIGEN).href : entrada.url;
    red.pedidos.push(url);
    if (!red.responder) throw new TypeError('Failed to fetch');
    return red.responder(url, entrada);
  };
  red.cuantas = (fragmento) => red.pedidos.filter((u) => u.includes(fragmento)).length;
  return red;
}

const textoSw = leer('public/sw.js');

/** Carga sw.js en una caja nueva. `espera`: ESPERA_RED_MS corto para no esperar 5 s (null = el real). */
function cargarSw({ origen = ORIGEN, espera = 80 } = {}) {
  let fuente = textoSw;
  if (espera !== null) {
    fuente = textoSw.replace('const ESPERA_RED_MS = 5000;', `const ESPERA_RED_MS = ${espera};`);
    if (fuente === textoSw) throw new Error('No se encontró ESPERA_RED_MS = 5000 en sw.js');
  }
  const manejadores = {};
  const red = crearRed();
  const cs = crearCaches(origen);
  const navegador = { onLine: true };
  const ctx = {
    console, URL, Request, Response, Headers, setTimeout, clearTimeout,
    fetch: red.fetch,
    caches: cs.api,
    location: new URL(origen + '/sw.js'),
    navigator: navegador,
    registration: { showNotification: async () => {} },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (tipo, fn) => { manejadores[tipo] = fn; },
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  new vm.Script(fuente, { filename: 'sw.js' }).runInContext(ctx);
  const caja = { ctx, manejadores, red, caches: cs.api, almacen: cs.almacen, navegador, origen };
  cs.atar(caja);
  return caja;
}

/** Lo que el service worker agrega con waitUntil, también lo que agrega después. */
function crearEsperas() {
  const esperas = [];
  return {
    waitUntil(p) { esperas.push(Promise.resolve(p)); },
    async todas() {
      let n = -1;
      while (n !== esperas.length) { n = esperas.length; await Promise.all(esperas); }
    },
  };
}

/** Una navegación como la hace el navegador (`mode: navigate`). */
async function navegar(caja, ruta, { cabeceras = {} } = {}) {
  const pedido = { url: new URL(ruta, caja.origen).href, method: 'GET', mode: 'navigate', headers: new Headers(cabeceras) };
  const esperas = crearEsperas();
  let respuesta = null;
  caja.manejadores.fetch({ request: pedido, respondWith(p) { respuesta = Promise.resolve(p); }, waitUntil: esperas.waitUntil });
  const r = respuesta ? await respuesta : undefined;
  return { respuesta: r, texto: r ? await r.clone().text() : null, fondo: esperas.todas };
}

/** Un mensaje de la página, con su puerto. */
async function mensaje(caja, datos) {
  const esperas = crearEsperas();
  let contestar;
  const contestado = new Promise((listo) => { contestar = listo; });
  caja.manejadores.message({ data: datos, ports: [{ postMessage: (v) => contestar(v) }], waitUntil: esperas.waitUntil });
  const respuesta = await contestado;
  await esperas.todas();
  return JSON.parse(JSON.stringify(respuesta));
}

const pagina = (estado, cuerpo = '') => '<!DOCTYPE html><html><head><meta charSet="utf-8"/></head><body>'
  + `<div hidden>${estado ? `<meta name="orden-rutina" content="${estado}"/>` : ''}</div>`
  + `<main>${cuerpo}</main><script src="/_next/static/chunks/app-0123456789abcdef.js" async=""></script></body></html>`;
const html = (texto, status = 200) => new Response(texto, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const js = () => new Response('console.log(1)', { status: 200, headers: { 'Content-Type': 'application/javascript' } });
const cacheDe = (token) => `orden-rutina:${token}`;
const claveHtml = (token) => `${ORIGEN}/rutina/${token}`;

/** Pone algo en la caja a mano (una copia vieja, un video, un archivo). */
async function poner(caja, nombre, url, cuerpo, cabeceras = {}) {
  const cache = await caja.caches.open(nombre);
  await cache.put(url, new Response(cuerpo, { status: 200, headers: cabeceras }));
}
const guardadaHace = (ms) => ({ 'Content-Type': 'text/html; charset=utf-8', 'x-orden-guardada': new Date(Date.now() - ms).toISOString() });
async function textoGuardado(caja, token) {
  const r = await caja.caches.match(claveHtml(token), { cacheName: cacheDe(token) });
  return r ? r.text() : null;
}
async function fechaGuardada(caja, token) {
  const r = await caja.caches.match(claveHtml(token), { cacheName: cacheDe(token) });
  return r ? r.headers.get('x-orden-guardada') : null;
}
async function clavesDe(caja, nombre) {
  if (!(await caja.caches.has(nombre))) return null;
  return (await (await caja.caches.open(nombre)).keys()).map((p) => p.url.replace(ORIGEN, ''));
}

(async () => {
  // ═══════════════════════════════════════════════════════════
  grupo('1 · Las reglas puras (rutina-sin-senal.ts)');
  // ═══════════════════════════════════════════════════════════
  const ej = (clip) => ({ id: 'r', orden: 1, nombre: 'x', series: 3, reps: '10', carga: '', descanso_seg: null,
    nota: '', junto: false, video: null, como: '', clip });
  const conRutina = (dias, extra = {}) => ({ existe: true, negocio: 'N', nombre: 'Ana', renovar: false, actualizada: null,
    rutina: { nombre: 'R', notas: '', desde: null, dias }, ...extra });
  ok('la marca de cada página',
    [S.estadoParaGuardar(null), S.estadoParaGuardar({ existe: false }),
      S.estadoParaGuardar(conRutina([{ orden: 1, nombre: 'A', notas: '', ejercicios: [ej(null)] }], { renovar: true, rutina: null })),
      S.estadoParaGuardar({ ...conRutina([]), rutina: null }), S.estadoParaGuardar(conRutina([])),
      S.estadoParaGuardar(conRutina([{ orden: 1, nombre: 'A', notas: '', ejercicios: [ej(null)] }]))],
    ['error', 'inactiva', 'renovar', 'preparando', 'preparando', 'activa']);
  const ahora = Date.parse('2026-09-30T15:00:00.000Z');
  ok('una página de hace 1 minuto no es copia; una de hace 3, sí',
    [S.esCopiaVieja(new Date(ahora - 60_000).toISOString(), ahora), S.esCopiaVieja(new Date(ahora - 180_000).toISOString(), ahora)],
    [false, true]);
  ok('una fecha rota no es copia (no se molesta por nada)', [S.esCopiaVieja('x', ahora), S.esCopiaVieja('', ahora)], [false, false]);
  ok('el margen se puede cambiar', S.esCopiaVieja(new Date(ahora - 60_000).toISOString(), ahora, 30_000), true);
  ok('una hora del servidor adelantada no es copia', S.esCopiaVieja(new Date(ahora + 600_000).toISOString(), ahora), false);
  const guardable = (h) => S.recursoGuardable(h, ORIGEN);
  ok('qué archivos se guardan con la copia',
    [guardable(`${ORIGEN}/_next/static/chunks/main-app-5eb0d9c55a395822.js`),
      guardable('/_next/static/css/ae3695c5dbf6f4eb.css'),
      guardable(`${ORIGEN}/_next/static/media/c214ffb7f5362987-s.p.woff2`),
      guardable(`${ORIGEN}/_next/static/chunks/app/layout.js`),
      guardable(`${ORIGEN}/_next/static/webpack/0123456789abcdef0.webpack.hot-update.json`),
      guardable(`${ORIGEN}/iconos/icono-192.png`),
      guardable('https://otro.test/_next/static/chunks/main-app-5eb0d9c55a395822.js'),
      guardable(`${ORIGEN}/api/rutina/x`),
      guardable(`${ORIGEN}/rutina/${T1}/videos`),
      guardable('https://abc.supabase.co/storage/v1/object/sign/videos/x.mp4')],
    [true, true, true, false, false, true, false, false, false, false]);
  const k = (id) => `${ORIGEN}/__clip/${id}`;
  ok('qué videos sobran: los que ya no están en la rutina',
    S.quePodar([k(ID1), k(ID2), claveHtml(T1), `${ORIGEN}/_next/static/chunks/a-0123456789abcdef.js`], [ID1]), [k(ID2)]);
  ok('sin rutina vigente sobran todos, y nada que no sea un video', S.quePodar([k(ID1), claveHtml(T1)], []), [k(ID1)]);
  ok('los ids guardados', [...S.idsGuardados([k(ID1), `/__clip/${ID2}`, claveHtml(T1)])], [ID1, ID2]);
  const c1 = { id: ID1, bytes: 1000, seg: 10 };
  const c2 = { id: ID2, bytes: 2500, seg: 20 };
  ok('cuánto falta guardar', [S.bytesPendientes([c1, c2], new Set([ID1])), S.bytesPendientes([c1, c2], new Set()),
    S.bytesPendientes([c1], new Set([ID1]))], [{ cuantos: 1, bytes: 2500 }, { cuantos: 2, bytes: 3500 }, { cuantos: 0, bytes: 0 }]);
  ok('las preguntas abiertas viven en una constante', [S.GUARDAR_AL_MIRAR, S.DIAS_COPIA, S.ESPERA_RED_MS], [true, 60, 5000]);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · El service worker en una caja');
  // ═══════════════════════════════════════════════════════════
  let caja;
  try {
    caja = cargarSw();
    ok('sw.js se carga sin errores', true, true);
  } catch (e) {
    ok('sw.js se carga sin errores', String(e), true);
    throw e;
  }
  ok('escucha lo de siempre y los pedidos de la página',
    ['install', 'activate', 'fetch', 'message', 'push', 'notificationclick'].filter((t) => typeof caja.manejadores[t] !== 'function'), []);

  // Las pantallas con sesión nunca se guardan.
  caja.red.responder = () => html(pagina(null, 'panel'));
  for (const ruta of ['/panel', '/rutinas', '/rutinas/x', `/rutinas/${T1}`, '/rutina/no-es-un-uuid', `/rutina/${T1}/videos`]) {
    const n = await navegar(caja, ruta);
    await n.fondo();
  }
  ok('/panel, /rutinas y cualquier otra: ninguna caché nueva', await caja.caches.keys(), []);
  const api = await navegar(caja, `/api/tareas/x`);
  ok('/api/ ni se toca (lo contesta el navegador)', api.respuesta === undefined, true);

  // La primera vez con señal: se guarda, sin la query.
  caja.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('activa', 'RUTINA-1')) : js());
  let n = await navegar(caja, `/rutina/${T1}?fbclid=abc`);
  await n.fondo();
  ok('con señal, la red', n.texto.includes('RUTINA-1'), true);
  ok('y queda la copia bajo /rutina/<token>, sin la query', await clavesDe(caja, cacheDe(T1)), [`/rutina/${T1}`]);
  const fecha1 = await fechaGuardada(caja, T1);
  ok('con la fecha en que se guardó', Number.isFinite(Date.parse(fecha1)) && Date.now() - Date.parse(fecha1) < 5000, true);

  // Sin señal.
  caja.navegador.onLine = false;
  caja.red.responder = null;
  n = await navegar(caja, `/rutina/${T1}`);
  ok('sin señal y con copia: la copia', n.texto.includes('RUTINA-1'), true);
  const antes = await caja.caches.keys();
  n = await navegar(caja, `/rutina/${T2}`);
  await n.fondo();
  ok('sin señal y sin copia: «sin conexión»', [n.respuesta.status, n.texto.includes('Sin conexión')], [503, true]);
  ok('y no queda una caché vacía de ese link', await caja.caches.keys(), antes);
  await poner(caja, 'orden-v4-cascara', `${ORIGEN}/sin-conexion`, 'PANTALLA-SIN-CONEXION', { 'Content-Type': 'text/html' });
  n = await navegar(caja, `/rutina/${T2}`);
  ok('la de sin conexión guardada, si está', n.texto, 'PANTALLA-SIN-CONEXION');
  caja.navegador.onLine = true;

  // La red colgada: la copia a los ESPERA_RED_MS, y la red la actualiza de fondo.
  let soltar;
  caja.red.responder = (url) => (url.includes('/rutina/')
    ? new Promise((listo) => { soltar = () => listo(html(pagina('activa', 'RUTINA-2'))); })
    : js());
  const t0 = Date.now();
  n = await navegar(caja, `/rutina/${T1}`);
  const tardo = Date.now() - t0;
  ok('red colgada con copia: la copia, a los ESPERA_RED_MS', [n.texto.includes('RUTINA-1'), tardo >= 60 && tardo < 2000], [true, true]);
  ok('mientras tanto la copia no cambió', (await textoGuardado(caja, T1)).includes('RUTINA-1'), true);
  soltar();
  await n.fondo();
  ok('cuando la red llega, la copia se actualiza', (await textoGuardado(caja, T1)).includes('RUTINA-2'), true);

  // Con señal buena y copia: la red gana.
  caja.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('activa', 'RUTINA-3')) : js());
  n = await navegar(caja, `/rutina/${T1}`);
  await n.fondo();
  ok('con copia y red rápida: la red, y la copia al día', [n.texto.includes('RUTINA-3'), (await textoGuardado(caja, T1)).includes('RUTINA-3')],
    [true, true]);

  // Lo que NO toca la copia: un error de la base, una página sin marca, un 500.
  await poner(caja, cacheDe(T1), `${ORIGEN}/__clip/${ID1}`, 'VIDEO', { 'Content-Type': 'video/mp4', 'x-orden-guardada': new Date().toISOString() });
  const fechaAntes = await fechaGuardada(caja, T1);
  for (const [nombre, respuesta] of [
    ['marca error', () => html(pagina('error', 'ERROR'))],
    ['sin marca', () => html(pagina(null, 'SIN-MARCA'))],
    ['una marca desconocida', () => html(pagina('rara', 'RARA'))],
    ['un 500', () => html(pagina('activa', 'CAIDO'), 500)],
    ['algo que no es HTML', () => new Response('{"x":1}', { status: 200, headers: { 'Content-Type': 'application/json' } })],
  ]) {
    caja.red.responder = (url) => (url.includes('/rutina/') ? respuesta() : js());
    n = await navegar(caja, `/rutina/${T1}`);
    await n.fondo();
    ok(`${nombre}: se sirve la copia y no cambia`,
      [n.texto.includes('RUTINA-3'), (await textoGuardado(caja, T1)).includes('RUTINA-3'), await fechaGuardada(caja, T1) === fechaAntes,
        (await clavesDe(caja, cacheDe(T1))).includes(`/__clip/${ID1}`)],
      [true, true, true, true]);
  }
  caja.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('error', 'ERROR-SIN-COPIA')) : js());
  n = await navegar(caja, `/rutina/${T3}`);
  await n.fondo();
  ok('un error sin copia: se muestra el error (con su «probar de nuevo») y no se guarda nada',
    [n.texto.includes('ERROR-SIN-COPIA'), await caja.caches.has(cacheDe(T3))], [true, false]);

  // renovar y preparando: se guardan, sin los videos.
  caja.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('renovar', 'RENOVAR')) : js());
  n = await navegar(caja, `/rutina/${T1}`);
  await n.fondo();
  ok('renovar: se guarda y se borran los videos', [(await textoGuardado(caja, T1)).includes('RENOVAR'), await clavesDe(caja, cacheDe(T1))],
    [true, [`/rutina/${T1}`]]);
  await poner(caja, cacheDe(T1), `${ORIGEN}/__clip/${ID2}`, 'VIDEO', { 'Content-Type': 'video/mp4', 'x-orden-guardada': new Date().toISOString() });
  caja.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('preparando', 'PREPARANDO')) : js());
  n = await navegar(caja, `/rutina/${T1}`);
  await n.fondo();
  ok('preparando: también', [(await textoGuardado(caja, T1)).includes('PREPARANDO'), await clavesDe(caja, cacheDe(T1))],
    [true, [`/rutina/${T1}`]]);

  // inactiva: se borra todo, videos incluidos, y se ve «ya no está activo».
  await poner(caja, cacheDe(T1), `${ORIGEN}/__clip/${ID1}`, 'VIDEO', { 'Content-Type': 'video/mp4', 'x-orden-guardada': new Date().toISOString() });
  caja.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('inactiva', 'INACTIVO')) : js());
  n = await navegar(caja, `/rutina/${T1}`);
  await n.fondo();
  ok('inactiva: se ve lo que dice la red y se borra la caché del link entera',
    [n.texto.includes('INACTIVO'), await caja.caches.has(cacheDe(T1))], [true, false]);
  caja.navegador.onLine = false;
  caja.red.responder = null;
  n = await navegar(caja, `/rutina/${T1}`);
  ok('y sin señal ya no abre la copia', n.texto.includes('RUTINA'), false);
  caja.navegador.onLine = true;

  // Los pedidos del enrutador de Next no son la página.
  caja.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('activa', 'RSC')) : js());
  const antesRsc = caja.red.pedidos.length;
  n = await navegar(caja, `/rutina/${T2}`, { cabeceras: { RSC: '1' } });
  await n.fondo();
  const n2 = await navegar(caja, `/rutina/${T2}?_rsc=abc12`);
  await n2.fondo();
  ok('con la cabecera RSC o ?_rsc= no los toma la rama de la rutina',
    [await caja.caches.has(cacheDe(T2)), caja.red.pedidos.length - antesRsc], [false, 2]);

  // Mayúsculas: el token tal cual vino.
  const MAYUS = T2.toUpperCase();
  n = await navegar(caja, `/rutina/${MAYUS}`);
  await n.fondo();
  ok('un token en mayúsculas se guarda tal cual vino', [await caja.caches.has(cacheDe(MAYUS)), await caja.caches.has(cacheDe(T2))],
    [true, false]);
  await caja.caches.delete(cacheDe(MAYUS));

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Al activarse: las versiones viejas y las copias de 60 días');
  // ═══════════════════════════════════════════════════════════
  const cajaA = cargarSw();
  await poner(cajaA, 'orden-v3-estaticos', `${ORIGEN}/_next/static/chunks/a-0123456789abcdef.js`, 'x');
  await poner(cajaA, 'orden-v4-cascara', `${ORIGEN}/sin-conexion`, 'x');
  await poner(cajaA, cacheDe(T1), claveHtml(T1), pagina('activa'), guardadaHace(DIA));
  await poner(cajaA, cacheDe(T1), `${ORIGEN}/__clip/${ID1}`, 'VIDEO', { 'x-orden-guardada': new Date(Date.now() - 70 * DIA).toISOString() });
  await poner(cajaA, cacheDe(T2), claveHtml(T2), pagina('activa'), guardadaHace(61 * DIA));
  await poner(cajaA, cacheDe(T3), `${ORIGEN}/_next/static/chunks/a-0123456789abcdef.js`, 'x');
  const cajaA59 = cacheDe('59dias00-0000-4000-8000-000000000000');
  await poner(cajaA, cajaA59, `${ORIGEN}/__clip/${ID2}`, 'VIDEO', { 'x-orden-guardada': new Date(Date.now() - 59 * DIA).toISOString() });
  let esperasA = crearEsperas();
  cajaA.manejadores.activate({ waitUntil: esperasA.waitUntil });
  await esperasA.todas();
  ok('queda la cáscara de esta versión y las copias abiertas hace menos de 60 días',
    await cajaA.caches.keys(), ['orden-v4-cascara', cacheDe(T1), cajaA59]);
  ok('la fecha es la más nueva de lo guardado (un video viejo no la borra)', await clavesDe(cajaA, cacheDe(T1)),
    [`/rutina/${T1}`, `/__clip/${ID1}`]);

  // Y al abrir un link, como mucho una vez por hora, sin tocar el que se abre.
  const cajaL = cargarSw();
  await poner(cajaL, cacheDe(T1), claveHtml(T1), pagina('activa', 'VIEJA'), guardadaHace(90 * DIA));
  await poner(cajaL, cacheDe(T2), claveHtml(T2), pagina('activa'), guardadaHace(61 * DIA));
  cajaL.navegador.onLine = false;
  n = await navegar(cajaL, `/rutina/${T1}`);
  await n.fondo();
  ok('al abrir un link se barren las copias viejas de otros', [await cajaL.caches.has(cacheDe(T2)), n.texto.includes('VIEJA')],
    [false, true]);
  await poner(cajaL, cacheDe(T3), claveHtml(T3), pagina('activa'), guardadaHace(61 * DIA));
  n = await navegar(cajaL, `/rutina/${T1}`);
  await n.fondo();
  ok('y no de nuevo antes de una hora', await cajaL.caches.has(cacheDe(T3)), true);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Lo que pide la página: «guardame»');
  // ═══════════════════════════════════════════════════════════
  const cajaM = cargarSw();
  cajaM.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('activa', 'PRIMERA')) : js());
  const NADA = { ok: false, guardadaEl: null };
  ok('una ruta que no es de una rutina: nada', await mensaje(cajaM, { tipo: 'guardar-rutina', ruta: '/panel', recursos: [] }), NADA);
  ok('de otro sitio: nada',
    await mensaje(cajaM, { tipo: 'guardar-rutina', ruta: `https://otro.test/rutina/${T1}`, recursos: [] }), NADA);
  ok('sin ruta: nada', await mensaje(cajaM, { tipo: 'guardar-rutina' }), NADA);
  ok('y no se pidió ni se guardó nada', [cajaM.red.pedidos.length, await cajaM.caches.keys()], [0, []]);

  const B = '/_next/static/chunks/b-0123456789abcdef.js';
  const r1 = await mensaje(cajaM, {
    tipo: 'guardar-rutina', ruta: `/rutina/${T1}`, forzarHtml: false, fresca: true,
    recursos: ['/api/x', 'https://otro.test/_next/static/chunks/c-0123456789abcdef.js', `${ORIGEN}${B}`,
      `${ORIGEN}/_next/static/chunks/app/layout.js`, 'no es una url ::', `${ORIGEN}/iconos/icono-192.png`],
  });
  ok('la primera visita (sin copia): responde ok con la fecha', [r1.ok, Number.isFinite(Date.parse(r1.guardadaEl))], [true, true]);
  ok('pidió la página una vez', cajaM.red.cuantas(`/rutina/${T1}`), 1);
  ok('guardó la página, los archivos con hash, el ícono y los que nombra la página; nada más',
    (await clavesDe(cajaM, cacheDe(T1))).sort(),
    [B, '/_next/static/chunks/app-0123456789abcdef.js', '/iconos/icono-192.png', `/rutina/${T1}`].sort());
  ok('ni /api/ ni otro sitio se pidieron', [cajaM.red.cuantas('/api/x'), cajaM.red.cuantas('otro.test'), cajaM.red.cuantas('layout.js')],
    [0, 0, 0]);

  const r2 = await mensaje(cajaM, { tipo: 'guardar-rutina', ruta: `/rutina/${T1}`, forzarHtml: false, fresca: false, recursos: [B] });
  ok('con la copia ya guardada y sin forzar: no pide la página de nuevo', [r2.ok, cajaM.red.cuantas(`/rutina/${T1}`)], [true, 1]);
  await poner(cajaM, 'orden-v4-estaticos', `${ORIGEN}/_next/static/chunks/d-0123456789abcdef.js`, 'D');
  const pedidosAntes = cajaM.red.pedidos.length;
  await mensaje(cajaM, { tipo: 'guardar-rutina', ruta: `/rutina/${T1}`, recursos: ['/_next/static/chunks/d-0123456789abcdef.js'] });
  ok('lo que ya está guardado en otra caché se copia sin pedirlo',
    [(await clavesDe(cajaM, cacheDe(T1))).includes('/_next/static/chunks/d-0123456789abcdef.js'),
      cajaM.red.pedidos.slice(pedidosAntes).filter((u) => u.includes('d-0123')).length], [true, 0]);

  cajaM.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('activa', 'FORZADA')) : js());
  const r3 = await mensaje(cajaM, { tipo: 'guardar-rutina', ruta: `/rutina/${T1}`, forzarHtml: true, fresca: false, recursos: [] });
  ok('con forzarHtml: la pide de nuevo y la guarda', [r3.ok, cajaM.red.cuantas(`/rutina/${T1}`),
    (await textoGuardado(cajaM, T1)).includes('FORZADA')], [true, 2, true]);

  // fresca: se van los archivos de versiones viejas; la página y los videos, nunca.
  await poner(cajaM, cacheDe(T1), `${ORIGEN}/_next/static/chunks/vieja-fedcba9876543210.js`, 'V');
  await poner(cajaM, cacheDe(T1), `${ORIGEN}/__clip/${ID1}`, 'VIDEO', { 'Content-Type': 'video/mp4', 'x-orden-guardada': new Date().toISOString() });
  await mensaje(cajaM, { tipo: 'guardar-rutina', ruta: `/rutina/${T1}`, forzarHtml: false, fresca: true, recursos: [B] });
  ok('fresca: se borra lo viejo y quedan la página, los videos y lo que se usa',
    (await clavesDe(cajaM, cacheDe(T1))).sort(),
    [B, '/_next/static/chunks/app-0123456789abcdef.js', `/__clip/${ID1}`, `/rutina/${T1}`].sort());

  // Un link apagado: nada, y no queda caché.
  cajaM.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('inactiva')) : js());
  ok('un link inactivo: nada, sin guardar archivos',
    [await mensaje(cajaM, { tipo: 'guardar-rutina', ruta: `/rutina/${T2}`, recursos: [B] }), await cajaM.caches.has(cacheDe(T2))],
    [NADA, false]);
  cajaM.red.responder = null;
  ok('sin red y sin copia: nada, y no queda caché vacía',
    [await mensaje(cajaM, { tipo: 'guardar-rutina', ruta: `/rutina/${T3}`, recursos: [B] }), await cajaM.caches.has(cacheDe(T3))],
    [NADA, false]);

  // Una navegación guardando: el pedido la espera y no pide la página dos veces.
  const cajaE = cargarSw();
  const colgados = [];
  const soltarE = () => colgados.splice(0).forEach((listo) => listo(html(pagina('activa', 'EN-CURSO'))));
  cajaE.red.responder = (url) => (url.includes('/rutina/') ? new Promise((listo) => { colgados.push(listo); }) : js());
  const navE = navegar(cajaE, `/rutina/${T1}`);
  await dormir(10);
  let contestoAntes = false;
  const msgE = mensaje(cajaE, { tipo: 'guardar-rutina', ruta: `/rutina/${T1}`, forzarHtml: false, fresca: true, recursos: [B] })
    .then((v) => { contestoAntes = true; return v; });
  await dormir(30);
  ok('mientras la navegación guarda, el pedido espera', contestoAntes, false);
  soltarE();
  await dormir(10);
  soltarE();
  const [rNav, rMsg] = await Promise.all([navE, msgE]);
  await rNav.fondo();
  ok('después contesta ok, sin volver a pedir la página',
    [rMsg.ok, rNav.texto.includes('EN-CURSO'), cajaE.red.cuantas(`/rutina/${T1}`)], [true, true, 1]);
  ok('otros mensajes no le importan', (() => {
    let llamo = false;
    cajaE.manejadores.message({ data: { tipo: 'otra-cosa' }, ports: [{ postMessage: () => { llamo = true; } }], waitUntil() {} });
    cajaE.manejadores.message({ data: null, ports: [], waitUntil() {} });
    return llamo;
  })(), false);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · En localhost (npm run build && npm start)');
  // ═══════════════════════════════════════════════════════════
  const cajaLocal = cargarSw({ origen: 'http://localhost:3000' });
  const est = (c, ruta) => c.ctx.esEstatico(new URL(ruta, c.origen));
  ok('en localhost: un archivo con hash sí; uno de next dev, un ícono o el de la recarga en caliente, no',
    [est(cajaLocal, '/_next/static/chunks/main-app-5eb0d9c55a395822.js'), est(cajaLocal, '/_next/static/chunks/app/layout.js'),
      est(cajaLocal, '/iconos/icono-192.png'), est(cajaLocal, '/_next/static/webpack/0123456789abcdef0.webpack.hot-update.json')],
    [true, false, false, false]);
  ok('en producción, como siempre', [est(caja, '/_next/static/chunks/app/layout.js'), est(caja, '/iconos/icono-192.png'),
    est(caja, '/rutina/x')], [true, true, false]);
  cajaLocal.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('activa', 'LOCAL')) : js());
  n = await navegar(cajaLocal, `/rutina/${T1}`);
  await n.fondo();
  ok('y la página del alumno se guarda también en localhost', await cajaLocal.caches.has(cacheDe(T1)), true);
  // Revisión (30/09): en localhost la copia nunca tapa a `next dev` (que tarda
  // en recompilar y no pone hash): solo se muestra si la red no contesta nada.
  let soltarLocal;
  cajaLocal.red.responder = (url) => (url.includes('/rutina/')
    ? new Promise((listo) => { soltarLocal = () => listo(html(pagina('activa', 'LOCAL-2'))); })
    : js());
  let resueltaLocal = false;
  const pendienteLocal = navegar(cajaLocal, `/rutina/${T1}`).then((x) => { resueltaLocal = true; return x; });
  await new Promise((listo) => setTimeout(listo, 250)); // más que ESPERA_RED_MS de la caja (80 ms)
  ok('en localhost, una red lenta NO se tapa con la copia vieja: se espera la red', resueltaLocal, false);
  soltarLocal();
  n = await pendienteLocal;
  await n.fondo();
  ok('y se muestra lo nuevo', n.texto.includes('LOCAL-2'), true);
  cajaLocal.red.responder = (url) => (url.includes('/rutina/') ? html(pagina('error', 'ERROR-LOCAL'), 500) : js());
  n = await navegar(cajaLocal, `/rutina/${T1}`);
  await n.fondo();
  ok('en localhost, una página con error se muestra tal cual (no la copia)', n.texto.includes('ERROR-LOCAL'), true);
  cajaLocal.red.responder = null;
  n = await navegar(cajaLocal, `/rutina/${T1}`);
  await n.fondo();
  ok('en localhost, sin red del todo: la copia (así se prueba con npm start)', n.texto.includes('LOCAL-2'), true);
  const esperasI = crearEsperas();
  cajaLocal.manejadores.install({ waitUntil: esperasI.waitUntil });
  await esperasI.todas();
  ok('la instalación en localhost sigue sin guardar la cáscara', await cajaLocal.caches.has('orden-v4-cascara'), false);

  // La regla de los archivos es la misma en sw.js y en la lib.
  const muestras = ['/_next/static/chunks/main-app-5eb0d9c55a395822.js', '/_next/static/chunks/app/layout.js',
    '/_next/static/webpack/0123456789abcdef0.webpack.hot-update.json', '/iconos/icono-192.png', '/api/x',
    '/_next/static/media/c214ffb7f5362987-s.p.woff2', '/rutina/x', 'https://otro.test/_next/static/chunks/main-app-5eb0d9c55a395822.js'];
  ok('esRecursoGuardable (sw.js) = recursoGuardable (lib)',
    muestras.filter((m) => caja.ctx.esRecursoGuardable(new URL(m, ORIGEN)) !== S.recursoGuardable(m, ORIGEN)), []);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Paridad entre sw.js, la lib y enlace.ts');
  // ═══════════════════════════════════════════════════════════
  const real = cargarSw({ espera: null });
  const enSw = (expr) => vm.runInContext(expr, real.ctx);
  const enlace = leer('src/components/rutinas/publico/enlace.ts');
  const esToken = /const ES_TOKEN = \/(.+)\/([a-z]*);/.exec(enlace);
  const rutaRutina = enSw('RUTA_RUTINA');
  const grupoUuid = /\((.+)\)/.exec(rutaRutina.source)[1];
  ok('el uuid de sw.js = ES_TOKEN de enlace.ts = PATRON_TOKEN_RUTINA',
    [grupoUuid === esToken[1].replace(/^\^|\$$/g, ''), esToken[1] === S.PATRON_TOKEN_RUTINA, `^${grupoUuid}$` === S.PATRON_TOKEN_RUTINA],
    [true, true, true]);
  ok('los dos sin distinguir mayúsculas', [rutaRutina.flags, esToken[2]], ['i', 'i']);
  ok('la ruta es exactamente /rutina/<uuid> (con barra final opcional)',
    [`/rutina/${T1}`, `/rutina/${T1}/`, `/rutina/${T1}/videos`, `/rutinas/${T1}`, `/x/rutina/${T1}`].map((p) => rutaRutina.test(p)),
    [true, true, false, false, false]);
  ok('los estados de la marca = EstadoCopia', [...enSw('ESTADOS_RUTINA')], [...S.ESTADOS_COPIA]);
  const tipoEstado = /export type EstadoCopia = ([^;]+);/.exec(leer('src/lib/rutina-sin-senal.ts'))[1];
  ok('y el tipo dice los mismos', (tipoEstado.match(/'([a-z]+)'/g) || []).map((x) => x.slice(1, -1)), [...S.ESTADOS_COPIA]);
  ok('ESPERA_RED_MS y DIAS_COPIA iguales', [enSw('ESPERA_RED_MS'), enSw('DIAS_COPIA')], [S.ESPERA_RED_MS, S.DIAS_COPIA]);
  ok("'orden-rutina:' y la clave de los videos iguales", [enSw('PREFIJO_RUTINA'), enSw('CLAVE_CLIP')],
    [S.PREFIJO_CACHE_RUTINA, S.claveClip('')]);
  ok('la marca que lee sw.js es la que escribe Next (metadata.other)',
    [enSw('MARCA_RUTINA').exec('<meta name="orden-rutina" content="activa"/>')?.[1],
      enSw('MARCA_RUTINA').exec('"name":"orden-rutina","content":"activa"')], ['activa', null]);
  ok('la versión no cambió (no cambia lo que se guarda en las cachés versionadas)', enSw('VERSION'), 'orden-v4');
  ok('todo en un archivo: sin importScripts', /importScripts/.test(sinComentarios(textoSw)), false);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Lo que se comprueba leyendo el código');
  // ═══════════════════════════════════════════════════════════
  const paginaRutina = sinComentarios(leer('src/app/rutina/[token]/page.tsx'));
  ok('la página: una consulta por apertura, la marca en la metadata y la hora del servidor',
    [/import \{ cache \} from 'react'/.test(paginaRutina), /const traer = cache\(/.test(paginaRutina),
      /other: \{ 'orden-rutina': estadoParaGuardar\(datos\) \}/.test(paginaRutina), /generada=\{new Date\(\)\.toISOString\(\)\}/.test(paginaRutina),
      /dynamic = 'force-dynamic'/.test(paginaRutina)],
    [true, true, true, true, true]);
  const cliente = sinComentarios(leer('src/components/rutinas/RutinaDelCliente.tsx'));
  ok('RutinaDelCliente: escucha la señal, pide guardar, borra la copia y ofrece guardar los videos',
    [/addEventListener\('online'/.test(cliente), /pedirGuardado\(/.test(cliente), /borrarCopia\(/.test(cliente),
      /esCopiaVieja\(generada/.test(cliente), /podarClips\(/.test(cliente), /<GuardarVideos /.test(cliente),
      /r\.copiaGuardada\(/.test(cliente), /r\.borrarCopia/.test(cliente)],
    [true, true, true, true, true, true, true, true]);
  const sinConexion = leer('src/app/sin-conexion/page.tsx');
  ok('/sin-conexion vuelve a pedir la misma dirección, no /panel',
    [/href="\/panel"/.test(sinConexion), /href=""/.test(sinConexion), /dynamic = 'force-static'/.test(sinConexion)], [false, true, true]);

  const todos = (dir) => fs.readdirSync(path.join(raiz, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? todos(`${dir}/${d.name}`) : /\.(ts|tsx|js|mjs)$/.test(d.name) ? [`${dir}/${d.name}`] : []);
  const publicos = todos('src/components/rutinas/publico');
  const codigo = Object.fromEntries([...publicos, 'src/components/rutinas/RutinaDelCliente.tsx'].map((f) => [f, leer(f)]));
  const componentes = ['src/components/rutinas/publico/GuardarVideos.tsx', 'src/components/rutinas/publico/TarjetaEjercicio.tsx',
    'src/components/rutinas/publico/VideoPropio.tsx', 'src/components/rutinas/RutinaDelCliente.tsx'];
  ok('los archivos nuevos existen', ['src/components/rutinas/publico/GuardarVideos.tsx', 'src/components/rutinas/publico/sinSenal.ts']
    .filter((f) => !fs.existsSync(path.join(raiz, f))), []);
  const textoSuelto = componentes.filter((a) => /(?<![=-])>\s*[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}[^<{}()=;]*(<\/|\{)/.test(sinComentarios(codigo[a])));
  ok('ningún texto suelto en la página del alumno', textoSuelto, []);
  ok('ni bg-white opaco, bg-black o clases dark:', componentes.filter((a) => /\bbg-white(?!\/)|\bbg-black\b|\bdark:/.test(codigo[a])), []);
  ok("'use client' y useTextos", componentes.filter((a) => !codigo[a].startsWith("'use client'") || !codigo[a].includes('useTextos()')), []);
  const cachesSinTry = publicos.filter((a) => {
    const lineas = sinComentarios(codigo[a]).split('\n');
    return lineas.some((l, i) => /\b(localStorage|caches)\./.test(l) && !lineas.slice(Math.max(0, i - 3), i).some((x) => /try \{/.test(x)));
  });
  ok('todo acceso a caches y localStorage de publico/ va con try/catch', cachesSinTry, []);
  ok('sinSenal.ts: con tope de espera y sin romper sin service worker',
    [/serviceWorker' in navigator/.test(codigo['src/components/rutinas/publico/sinSenal.ts']),
      /ESPERA_REGISTRO_MS = 10_000/.test(codigo['src/components/rutinas/publico/sinSenal.ts']),
      /ESPERA_RESPUESTA_MS = 15_000/.test(codigo['src/components/rutinas/publico/sinSenal.ts']),
      /tipo: 'guardar-rutina'/.test(codigo['src/components/rutinas/publico/sinSenal.ts'])],
    [true, true, true, true]);
  ok('los videos se guardan solos solo si GUARDAR_AL_MIRAR, y el botón siempre',
    [/guardar: boolean = GUARDAR_AL_MIRAR/.test(codigo['src/components/rutinas/publico/clips.ts']),
      /bajarYGuardar\(token, faltan\[i\], undefined, ctrl\.signal, true\)/.test(codigo['src/components/rutinas/publico/GuardarVideos.tsx'])],
    [true, true]);
  ok('el botón pide persistencia y mira el lugar antes de bajar',
    [/pedirPersistencia\(\)/.test(codigo['src/components/rutinas/publico/GuardarVideos.tsx']),
      /lugarLibre\(\)/.test(codigo['src/components/rutinas/publico/GuardarVideos.tsx'])], [true, true]);
  ok('borrarTildes existe y usa la misma clave', /export function borrarTildes[\s\S]{0,120}localStorage\.removeItem\(clave\(token\)\)/
    .test(codigo['src/components/rutinas/publico/tildes.ts']), true);
  ok('el link de YouTube avisa que necesita señal', /r\.linkNecesitaSenal/.test(codigo['src/components/rutinas/publico/TarjetaEjercicio.tsx']),
    true);

  const publica = leer('src/i18n/textos/rutina-publica.ts');
  ok('los textos nuevos, en los dos idiomas',
    ['copiaGuardada', 'guardadaEnEsteCelular', 'consejoIphone', 'linkNecesitaSenal', 'guardarVideos', 'guardandoVideos',
      'videosGuardados', 'parar', 'sinLugar', 'borrarCopia', 'copiaBorrada']
      .filter((c) => (publica.match(new RegExp(`\\b${c}: `, 'g')) || []).length !== 2), []);
  ok('en.ts no suma claves de la rutina', /copiaGuardada|guardadaEnEsteCelular/.test(leer('src/i18n/textos/en.ts')), false);
  // Revisión (30/09): el ícono de inicio del iPhone tiene su propio almacenamiento
  // (no hereda la copia de Safari): el consejo dice que hay que abrirla desde ahí con señal.
  ok('el consejo del iPhone dice que hay que abrirla una vez desde el ícono, con señal (es y pt)',
    [publica.includes('abrila una vez desde ese ícono, con señal'), publica.includes('abra uma vez por esse ícone, com sinal')], [true, true]);
  const legal = leer('src/i18n/textos/legal.ts');
  ok('la privacidad dice que el celular guarda una copia, y que se borra',
    [legal.includes('copia de su rutina'), legal.includes('cópia do treino'), legal.includes('la puede borrar cuando quiera'),
      legal.includes('pode apagá-la quando quiser')], [true, true, true, true]);
  ok('sin loading.tsx bajo (app)', fs.existsSync(path.join(raiz, 'src/app/(app)/loading.tsx')), false);

  clearTimeout(guardia);
  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE LA RUTINA SIN SEÑAL FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE LA RUTINA SIN SEÑAL PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
