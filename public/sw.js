/* eslint-disable no-restricted-globals */
/**
 * Service worker de Orden.
 *
 * Hace tres cosas, y ninguna más:
 *
 *   1. QUE LA APP ABRA SIN SEÑAL. No para que funcione entera —los datos
 *      viven en el servidor y no se pueden inventar— sino para que, cuando
 *      no hay internet, se vea una pantalla que lo explica en vez del dinosaurio
 *      del navegador. Quien vende en la calle pierde señal todo el tiempo.
 *
 *   2. QUE LOS ARCHIVOS ESTÁTICOS NO SE BAJEN DOS VECES. Los de /_next/static/
 *      llevan un hash en el nombre: si cambia el contenido, cambia la URL. Por
 *      eso se pueden guardar para siempre sin miedo a servir algo viejo.
 *
 *   3. AVISOS PUSH. Recibirlos y abrir la pantalla correcta al tocarlos.
 *
 * Lo que NO hace, a propósito: cachear respuestas de datos. Un total de ventas
 * viejo mostrado como si fuera el de hoy es peor que no mostrar nada.
 */

// Subir esta versión invalida todo lo guardado. Se hace cuando cambia la
// estrategia, no en cada despliegue: los estáticos ya se invalidan solos.
const VERSION = 'orden-v1';
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

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_CASCARA)
      // addAll falla entero si un solo archivo falla. Los pedimos de a uno
      // para que un icono que todavía no existe no deje al service worker
      // sin instalar y a la app sin nada de esto.
      .then((cache) => Promise.all(CASCARA.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c)),
      ))
      .then(() => self.clients.claim()),
  );
});

function esEstatico(url) {
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
    evento.respondWith(
      fetch(pedido).catch(() =>
        caches.match(SIN_CONEXION).then((r) => r || new Response(
          '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>'
          + '<body style="font-family:system-ui;padding:2rem">Sin conexión.</body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
        ))),
    );
  }
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
