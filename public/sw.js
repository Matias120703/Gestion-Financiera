/* eslint-disable no-restricted-globals */
/**
 * Service worker de Orden.
 *
 * Hace cuatro cosas, y ninguna más:
 *
 *   1. QUE LA APP ABRA SIN SEÑAL. No para que funcione entera —los datos
 *      viven en el servidor y no se pueden inventar— sino para que, cuando no
 *      hay internet, se vea una pantalla que lo explica en vez del dinosaurio
 *      del navegador. Quien vende en la calle pierde señal todo el tiempo.
 *
 *   2. QUE LOS ARCHIVOS ESTÁTICOS NO SE BAJEN DOS VECES.
 *
 *   3. QUE EL ALUMNO VEA SU RUTINA SIN SEÑAL. La página de su link
 *      (/rutina/<token>, sin sesión) se guarda cada vez que la abre con señal
 *      y se muestra cuando no hay, con la fecha en que se guardó. Ver
 *      `navegarRutina` más abajo.
 *
 *   4. AVISOS PUSH. Recibirlos y abrir la pantalla correcta al tocarlos.
 *
 * Lo que NO hace, a propósito: cachear respuestas de datos. Un total de
 * ventas viejo mostrado como si fuera el de hoy es peor que no mostrar nada.
 * La ÚNICA excepción es la rutina del alumno (3): es de una persona que
 * entrena en un sótano sin señal, se muestra con la fecha de la copia, y
 * ninguna pantalla con sesión (/panel, /rutinas, /api) se guarda nunca.
 *
 * Todo va en este archivo, sin `importScripts`: un archivo aparte pasaría por
 * el middleware y al alumno, que no tiene sesión, le devolvería el login.
 */

// Subir esta versión invalida todo lo guardado. Se hace cuando cambia la
// estrategia, no en cada despliegue.
//
//   v4 · Cambió el logo. Los iconos se guardan «primero la caché» y su nombre
//        NO lleva hash —`icono-192.png` se llama siempre igual— así que un
//        celular que ya los tenía guardados se quedaba con los viejos para
//        siempre. Subir la versión es la única forma de empujar un cambio de
//        ícono a los teléfonos que ya instalaron la app. Tenerlo presente el
//        día que se vuelva a tocar el logo.
//   v3 · En desarrollo no se cachea NADA. La v2 guardaba los archivos de
//        `npm run dev`, que no llevan hash en el nombre, y servía código
//        viejo para siempre. Ver EN_DESARROLLO más abajo.
//   v2 · La navegación reintenta una vez antes de mostrar «sin conexión».
const VERSION = 'orden-v4';
const CACHE_ESTATICOS = `${VERSION}-estaticos`;
const CACHE_CASCARA = `${VERSION}-cascara`;

const SIN_CONEXION = '/sin-conexion';

const CASCARA = [
  SIN_CONEXION,
  '/manifest.webmanifest',
  '/iconos/icono.svg',
  '/iconos/icono-192.png',
  '/iconos/icono-512.png',
  '/iconos/insignia-96.png',
];

/*
 * LA RUTINA DEL ALUMNO SIN SEÑAL.
 *
 * Cada link tiene su caché, `orden-rutina:<token>`, fuera de la versión: la
 * página (el HTML), los archivos con hash que usa y los videos del
 * entrenador que el alumno guardó (`/__clip/<id>`). Al subir VERSION no se
 * borran: se borran cuando el link se apaga, cuando el alumno lo pide o
 * cuando nadie la abre con señal en DIAS_COPIA días.
 *
 * Estas constantes repiten las de src/lib/rutina-sin-senal.ts (este archivo
 * no pasa por el compilador). pruebas/sin-senal.test.js comprueba que digan
 * lo mismo.
 */
const PREFIJO_RUTINA = 'orden-rutina:';
// El mismo patrón que ES_TOKEN (src/components/rutinas/publico/enlace.ts:11). Hay una prueba de paridad.
const RUTA_RUTINA = /^\/rutina\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const ESTADOS_RUTINA = ['activa', 'preparando', 'renovar', 'inactiva', 'error'];
const MARCA_RUTINA = /<meta\s+name="orden-rutina"\s+content="([a-z]+)"/;
const ESPERA_RED_MS = 5000;   // paridad con src/lib/rutina-sin-senal.ts
const DIAS_COPIA = 60;        // paridad con src/lib/rutina-sin-senal.ts
const CLAVE_CLIP = '/__clip/';
/** Cuántos archivos guarda como mucho un pedido de la página. */
const TOPE_RECURSOS = 200;
/** Cada cuánto se barre, como mucho, lo guardado de links que nadie abre. */
const LIMPIEZA_CADA_MS = 60 * 60 * 1000;

/**
 * En desarrollo NO se guarda nada en caché.
 *
 * El motivo es concreto y costó encontrarlo. La estrategia de estáticos es
 * «primero lo guardado», y eso solo es seguro cuando el nombre del archivo
 * cambia al cambiar el contenido. En una compilación de producción, Next les
 * pone un hash —`layout-a3f9c1.js`— y funciona perfecto.
 *
 * En `npm run dev` NO hay hash: el archivo se llama `layout.js` siempre. Así
 * que el service worker guardaba la primera versión y **seguía sirviéndola
 * para siempre**. Se cambiaba el código, el servidor compilaba bien, y el
 * navegador mostraba lo viejo, sin un solo error que lo delatara.
 *
 * Pasó exactamente eso al agregar Deudas al menú: el código estaba, el bundle
 * estaba, y la pantalla seguía mostrando el menú anterior.
 *
 * En localhost la caché no aporta nada: el servidor está a un milisegundo.
 *
 * Con dos excepciones, para poder probar la rutina sin señal con
 * `npm run build && npm start`: los archivos que SÍ llevan hash (16 cifras
 * hexadecimales; los de `next dev` no las tienen) y la página del alumno
 * (/rutina/<uuid>). Ver `conHash` y `navegarRutina`.
 */
const EN_DESARROLLO = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('install', (evento) => {
  // `skipWaiting` va siempre, con caché o sin ella: es lo que hace que una
  // versión nueva reemplace a la vieja sin esperar a que se cierren todas
  // las pestañas.
  const preparar = EN_DESARROLLO
    ? Promise.resolve()
    : caches.open(CACHE_CASCARA)
      // `addAll` falla entero si un solo archivo falla. Se piden de a uno
      // para que un icono que todavía no existe no deje al service worker
      // sin instalar y a la app sin nada de esto.
      .then((cache) => Promise.all(CASCARA.map((url) => cache.add(url).catch(() => null))));

  evento.waitUntil(preparar.then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        // Se borra todo lo que no sea de esta versión. Al pasar de v2 a v3,
        // esto es lo que limpia los archivos viejos que estaban tapando los
        // cambios en desarrollo.
        //
        // Menos las copias del alumno (113): la rutina y los videos que su
        // celular guardó para verlos sin señal viven en `orden-rutina:<token>`
        // (PREFIJO_RUTINA), fuera de la versión, para que una actualización
        // no se los borre.
        claves.filter((c) => !c.startsWith(VERSION) && !c.startsWith('orden-rutina:')).map((c) => caches.delete(c)),
      ))
      // Las copias de links que nadie abre con señal hace DIAS_COPIA días.
      .then(() => limpiarCopiasViejas().catch(() => null))
      .then(() => self.clients.claim()),
  );
});

/**
 * Un archivo con hash de Next: 16 cifras hexadecimales en el nombre, que
 * cambian si cambia el contenido. Los de `/_next/static/webpack/` son de la
 * recarga en caliente de `next dev`.
 */
function conHash(pathname) {
  return pathname.startsWith('/_next/static/')
    && !pathname.startsWith('/_next/static/webpack/')
    && /[0-9a-f]{16}/i.test(pathname);
}

function esEstatico(url) {
  // En localhost, solo lo que tiene hash (`npm run build && npm start`): en
  // `next dev` los archivos no lo llevan y guardarlos sería volver al
  // problema de la v3. Así la rutina sin señal se puede probar en local.
  if (EN_DESARROLLO) return conHash(url.pathname);
  return url.pathname.startsWith('/_next/static/')
      || url.pathname.startsWith('/iconos/');
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;

  // Solo GET. Un POST guardado en caché y repetido después sería cargar la
  // misma venta dos veces.
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // Los datos nunca se cachean.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // La página del alumno: EXACTAMENTE /rutina/<uuid>. Ni /rutinas, ni
  // /rutina/<uuid>/videos, ni los pedidos del enrutador de Next (RSC), que
  // no son la página entera. Corre también en localhost (ver esEstatico),
  // donde la copia solo se muestra si la red no contesta nada (navegarRutina).
  const token = pedido.mode === 'navigate' ? tokenDeRutina(url) : null;
  if (token && !pedido.headers.get('RSC') && !url.searchParams.has('_rsc')) {
    evento.respondWith(navegarRutina(evento, pedido, token));
    return;
  }

  // Estáticos con hash: de la caché si está, y si no se busca y se guarda.
  if (esEstatico(url)) {
    evento.respondWith(
      caches.match(pedido).then((guardado) => guardado || fetch(pedido).then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE_ESTATICOS).then((cache) => cache.put(pedido, copia));
        }
        return respuesta;
      })),
    );
    return;
  }

  // Navegación: siempre se intenta la red primero, porque los números tienen
  // que estar frescos. Si no hay red, la pantalla de sin conexión.
  if (pedido.mode === 'navigate') {
    evento.respondWith(navegar(pedido));
  }
});

/**
 * Una navegación, con UN reintento antes de rendirse.
 *
 * El reintento no es un adorno. Sin él, CUALQUIER fallo puntual mostraba la
 * pantalla de «sin conexión» aunque la persona estuviera perfectamente
 * conectada: un servidor que tarda un segundo de más, una celda de datos que
 * parpadea al caminar, un despliegue justo en ese momento. Y como es una
 * pantalla de error, lo que se veía era «no hay internet» estando online, que
 * es de las cosas que más rápido hacen desconfiar de una app.
 *
 * La secuencia:
 *   1. se intenta la red;
 *   2. si falla y el navegador dice que NO hay conexión → pantalla de sin
 *      conexión, sin perder tiempo reintentando algo que no puede andar;
 *   3. si falla pero el navegador dice que SÍ hay conexión → se reintenta una
 *      vez, porque casi siempre fue un tropiezo;
 *   4. si el reintento también falla, recién ahí la pantalla.
 */
async function navegar(pedido) {
  const respuesta = await pedirConReintento(pedido);
  return respuesta || paginaSinConexion();
}

/** La parte de red de `navegar`: la respuesta, o null si los dos intentos fallaron. */
async function pedirConReintento(pedido) {
  try {
    return await fetch(pedido);
  } catch {
    if (self.navigator.onLine) {
      try {
        return await fetch(pedido);
      } catch {
        // Los dos intentos fallaron: ahora sí es un problema de verdad.
      }
    }
  }
  return null;
}

async function paginaSinConexion() {
  const guardada = await caches.match(SIN_CONEXION);
  if (guardada) return guardada;

  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>'
    + '<body style="font-family:system-ui;padding:2rem">Sin conexión.</body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
  );
}

// ------------------------------------------------ la rutina sin señal

/** El token de /rutina/<token>, tal cual vino (sin cambiarle mayúsculas), o null. */
function tokenDeRutina(url) {
  const m = RUTA_RUTINA.exec(url.pathname);
  return m ? m[1] : null;
}

/** Dónde se guarda la página de un link: sin `?fbclid=…` ni barra final. */
function claveHtml(token) {
  return self.location.origin + '/rutina/' + token;
}

function nombreCache(token) {
  return PREFIJO_RUTINA + token;
}

/** La copia de la página de un link, sin crear la caché si no existe. */
function copiaDe(token) {
  return caches.match(claveHtml(token), { cacheName: nombreCache(token), ignoreSearch: true, ignoreVary: true });
}

/** Lo que se guarda con la copia: del mismo sitio, con hash o un ícono (= recursoGuardable de la lib). */
function esRecursoGuardable(url) {
  return url.origin === self.location.origin
    && (conHash(url.pathname) || url.pathname.startsWith('/iconos/'));
}

/** La marca de la página (`<meta name="orden-rutina">`). Sin marca, o una desconocida: error. */
function estadoDeTexto(texto) {
  const m = MARCA_RUTINA.exec(texto);
  return m && ESTADOS_RUTINA.includes(m[1]) ? m[1] : 'error';
}

function esHtml(respuesta) {
  return (respuesta.headers.get('Content-Type') || '').includes('text/html');
}

/** Lo que dice una respuesta de la red, sin gastarla (lee una copia). */
async function estadoDeRespuesta(respuesta) {
  if (!respuesta.ok || !esHtml(respuesta)) return 'error';
  return estadoDeTexto(await respuesta.clone().text());
}

async function borrarClips(cache) {
  const claves = await cache.keys();
  await Promise.all(claves.filter((p) => p.url.includes(CLAVE_CLIP)).map((p) => cache.delete(p)));
}

/**
 * Guarda (o borra) la copia según la marca de la página que contestó la red.
 *
 *   · activa → se guarda.
 *   · preparando, renovar → se guarda, sin los videos: no hay rutina que
 *     los muestre (y el alumno no gasta lugar en lo que no puede ver).
 *   · inactiva → se borra TODO lo del link, videos incluidos: un link
 *     apagado o cambiado no deja nada en el celular.
 *   · error, sin marca, un 5xx o algo que no es HTML → no se toca nada: un
 *     corte de un minuto de la base no puede pisar ni borrar la copia buena.
 *
 * Devuelve el estado que leyó.
 */
async function guardarSegunMarca(token, respuesta) {
  if (!respuesta || !respuesta.ok || !esHtml(respuesta)) return 'error';
  const texto = await respuesta.text();
  const estado = estadoDeTexto(texto);
  if (estado === 'error') return estado;
  if (estado === 'inactiva') {
    await caches.delete(nombreCache(token));
    return estado;
  }
  const cache = await caches.open(nombreCache(token));
  if (estado === 'renovar' || estado === 'preparando') await borrarClips(cache);
  await cache.put(claveHtml(token), new Response(texto, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'x-orden-guardada': new Date().toISOString() },
  }));
  return estado;
}

/**
 * Borra la caché del link solo si quedó vacía. Nunca una que tenga algo:
 * por ejemplo los videos que el alumno guardó antes de que existiera la
 * copia de la página.
 */
async function borrarSiVacia(token) {
  if (!(await caches.has(nombreCache(token)))) return;
  const cache = await caches.open(nombreCache(token));
  if ((await cache.keys()).length === 0) await caches.delete(nombreCache(token));
}

/** El guardado que dejó cada navegación, mientras corre: el pedido de la página lo espera. */
const enCurso = new Map();
let ultimaLimpieza = 0;

/**
 * La página del alumno: PRIMERO LA RED, con la copia de respaldo.
 *
 *   · Sin copia: como cualquier navegación (reintento y «sin conexión»). Lo
 *     que conteste la red se guarda de fondo según su marca.
 *   · Con copia y sin señal: la copia, al instante.
 *   · Con copia y con señal: la red, si contesta bien en ESPERA_RED_MS. Si
 *     tarda, falla o contesta un error (la base no respondió), la copia; la
 *     red termina de fondo y, si trae algo bueno, la actualiza para la
 *     próxima vez. La página se da cuenta de que es una copia por la hora
 *     en que se armó, y lo avisa (RutinaDelCliente).
 *   · En localhost, con copia y con señal: lo que conteste la red, siempre;
 *     la copia solo si la red no contesta nada (EN_DESARROLLO).
 */
async function navegarRutina(evento, pedido, token) {
  if (Date.now() - ultimaLimpieza > LIMPIEZA_CADA_MS) {
    ultimaLimpieza = Date.now();
    evento.waitUntil(limpiarCopiasViejas(token).catch(() => null));
  }

  const copia = await copiaDe(token).catch(() => undefined);
  const red = pedirConReintento(pedido);
  const guardado = red
    .then((r) => (r ? guardarSegunMarca(token, r.clone()) : null))
    .catch(() => null)
    .finally(() => { if (enCurso.get(token) === guardado) enCurso.delete(token); });
  enCurso.set(token, guardado);
  evento.waitUntil(guardado);

  if (!copia) {
    const r = await red;
    if (!r) await borrarSiVacia(token).catch(() => null);
    return r || paginaSinConexion();
  }
  if (self.navigator.onLine === false) return copia;

  // En localhost la copia se sirve SOLO si la red falla del todo (o sin
  // señal, arriba). Nunca por una red lenta ni por una página con error:
  // `next dev` tarda en recompilar y sus archivos no llevan hash, así que la
  // copia vieja con el JS nuevo mostraba lo anterior sin ningún error (el
  // problema de la v3). Con `npm start`, cortar la red sigue mostrando la copia.
  if (EN_DESARROLLO) {
    const r = await red;
    return r || copia;
  }

  // La red gana solo con una página buena, leída entera antes de la espera.
  // Una redirección (la barra final) se sigue: no es una página.
  const buena = red
    .then(async (r) => {
      if (!r) return null;
      if (r.type === 'opaqueredirect') return r;
      return (await estadoDeRespuesta(r)) === 'error' ? null : r;
    })
    .catch(() => null);
  const ganador = await Promise.race([
    buena,
    new Promise((listo) => { setTimeout(() => listo('tarde'), ESPERA_RED_MS); }),
  ]);
  if (ganador === 'tarde' || !ganador) return copia;
  return ganador;
}

/**
 * Borra las copias de los links que nadie abrió con señal en DIAS_COPIA
 * días: la fecha es la más nueva de `x-orden-guardada` entre lo guardado
 * (la página o un video). Una caché sin ninguna fecha también se va (quedó
 * a medias). `excepto`: el link que se está abriendo ahora, que se guarda
 * de nuevo en ese mismo momento.
 */
async function limpiarCopiasViejas(excepto) {
  const limite = Date.now() - DIAS_COPIA * 24 * 60 * 60 * 1000;
  const nombres = await caches.keys();
  for (const nombre of nombres) {
    if (!nombre.startsWith(PREFIJO_RUTINA)) continue;
    if (excepto && nombre === nombreCache(excepto)) continue;
    const cache = await caches.open(nombre);
    let masNueva = 0;
    for (const pedido of await cache.keys()) {
      const guardada = await cache.match(pedido);
      const t = guardada ? Date.parse(guardada.headers.get('x-orden-guardada') || '') : NaN;
      if (Number.isFinite(t) && t > masNueva) masNueva = t;
    }
    if (!masNueva || masNueva < limite) await caches.delete(nombre);
  }
}

/** Los archivos con hash que nombra el HTML guardado (los de la versión que se guardó). */
function recursosDelHtml(texto) {
  const hrefs = [];
  const patron = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
  let m;
  while ((m = patron.exec(texto)) && hrefs.length < TOPE_RECURSOS) hrefs.push(m[1].replace(/&amp;/g, '&'));
  return hrefs;
}

/**
 * Lo que pide la página del alumno (publico/sinSenal.ts): «guardame».
 *
 * Hace falta porque el service worker se registra DESPUÉS de que la página
 * cargó (RegistrarServiceWorker): en la primera visita ni el HTML ni sus
 * archivos pasaron por acá, y sin este pedido abrirla una vez con señal no
 * dejaba nada guardado.
 *
 *   1. Solo /rutina/<uuid> de este mismo sitio.
 *   2. Si una navegación está guardando la página, se la espera. Si se pide
 *      (`forzarHtml`) o todavía no hay copia, se pide la página y se guarda
 *      según su marca. Así una visita que ya pasó por acá no la pide dos veces.
 *   3. Sin copia (link inactivo, sin red): nada más.
 *   4. Los archivos que usó la página y los que nombra la copia: primero de
 *      lo ya guardado, si no de la red.
 *   5. `fresca`: se borran los archivos de versiones viejas (nunca la página
 *      ni los videos).
 */
async function guardarRutinaPedida(datos) {
  const NADA = { ok: false, guardadaEl: null };
  let url;
  try {
    url = new URL(String(datos.ruta), self.location.origin);
  } catch {
    return NADA;
  }
  if (url.origin !== self.location.origin) return NADA;
  const token = tokenDeRutina(url);
  if (!token) return NADA;

  const previo = enCurso.get(token);
  if (previo) await previo;

  let html = await copiaDe(token);
  if (datos.forzarHtml || !html) {
    const r = await fetch(claveHtml(token), { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    if (r) await guardarSegunMarca(token, r).catch(() => null);
    html = await copiaDe(token);
  }
  if (!html) {
    await borrarSiVacia(token);
    return NADA;
  }

  const cache = await caches.open(nombreCache(token));
  const texto = await html.clone().text();
  const pedidos = [
    ...(Array.isArray(datos.recursos) ? datos.recursos.slice(0, TOPE_RECURSOS) : []),
    ...recursosDelHtml(texto),
  ];
  const lista = [];
  for (const crudo of pedidos) {
    let u;
    try {
      u = new URL(String(crudo), self.location.origin);
    } catch {
      continue;
    }
    if (!esRecursoGuardable(u) || lista.includes(u.href)) continue;
    lista.push(u.href);
    try {
      let respuesta = await caches.match(u.href);
      if (!respuesta) respuesta = await fetch(u.href);
      if (respuesta && respuesta.ok) await cache.put(u.href, respuesta);
    } catch {
      // Uno que no se pudo guardar no frena a los demás.
    }
  }

  if (datos.fresca) {
    const propia = claveHtml(token);
    for (const pedido of await cache.keys()) {
      const clave = pedido.url;
      if (clave === propia || clave.includes(CLAVE_CLIP) || lista.includes(clave)) continue;
      await cache.delete(pedido);
    }
  }

  return { ok: true, guardadaEl: html.headers.get('x-orden-guardada') };
}

self.addEventListener('message', (evento) => {
  const datos = evento.data;
  if (!datos || typeof datos !== 'object' || datos.tipo !== 'guardar-rutina') return;
  const puerto = evento.ports && evento.ports[0];
  const trabajo = guardarRutinaPedida(datos)
    .catch(() => ({ ok: false, guardadaEl: null }))
    .then((resultado) => { if (puerto) puerto.postMessage(resultado); });
  evento.waitUntil(trabajo);
});

// ---------------------------------------------------------------- avisos

self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { cuerpo: evento.data ? evento.data.text() : '' };
  }

  const titulo = datos.titulo || 'Orden';
  const opciones = {
    body: datos.cuerpo || '',
    icon: '/iconos/icono-192.png',
    // La insignia de la barra de estado: Android usa solo la transparencia.
    // Con el ícono a color salía un cuadrado blanco lleno; esta es el anillo
    // en blanco sobre nada. Nombre nuevo, así que no hace falta subir VERSION.
    badge: '/iconos/insignia-96.png',
    lang: datos.idioma || 'es',
    // Con el mismo tag, un aviso nuevo reemplaza al anterior en vez de
    // apilarse. Nadie quiere ver cuatro recordatorios del mismo día.
    tag: datos.tag || 'orden-general',
    renotify: Boolean(datos.tag),
    data: { url: datos.url || '/cierre' },
  };

  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || '/panel';

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      // Si la app ya está abierta, se la trae al frente y se navega ahí
      // mismo. Abrir una pestaña nueva cada vez llenaría el celular.
      for (const ventana of ventanas) {
        if ('focus' in ventana) {
          ventana.navigate(destino).catch(() => null);
          return ventana.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
