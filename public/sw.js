/* eslint-disable no-restricted-globals */
/**
 * Service worker de Orden.
 *
 * Hace tres cosas, y ninguna más:
 *
 *   1. QUE LA APP ABRA SIN SEÑAL. No para que funcione entera —los datos
 *      viven en el servidor y no se pueden inventar— sino para que, cuando no
 *      hay internet, se vea una pantalla que lo explica en vez del dinosaurio
 *      del navegador. Quien vende en la calle pierde señal todo el tiempo.
 *
 *   2. QUE LOS ARCHIVOS ESTÁTICOS NO SE BAJEN DOS VECES.
 *
 *   3. AVISOS PUSH. Recibirlos y abrir la pantalla correcta al tocarlos.
 *
 * Lo que NO hace, a propósito: cachear respuestas de datos. Un total de
 * ventas viejo mostrado como si fuera el de hoy es peor que no mostrar nada.
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
];

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
        claves.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c)),
      ))
      .then(() => self.clients.claim()),
  );
});

function esEstatico(url) {
  if (EN_DESARROLLO) return false;
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

  const guardada = await caches.match(SIN_CONEXION);
  if (guardada) return guardada;

  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>'
    + '<body style="font-family:system-ui;padding:2rem">Sin conexión.</body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
  );
}

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
    badge: '/iconos/icono-192.png',
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
