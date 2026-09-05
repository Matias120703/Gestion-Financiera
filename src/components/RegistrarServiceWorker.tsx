'use client';

import { useEffect, useState } from 'react';

/**
 * Registra el service worker y avisa cuando se cae la conexión.
 *
 * El registro va después de que la página terminó de cargar: hacerlo antes
 * le compite el ancho de banda a lo que la persona vino a ver, y en una red
 * mala eso se nota.
 *
 * La franja de "sin conexión" existe porque la app se usa en la calle. Sin
 * ella, un guardado que no salió parece un guardado que salió.
 */
export function RegistrarServiceWorker({ sinConexion }: { sinConexion: string }) {
  const [desconectado, setDesconectado] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    /*
     * QUE UNA VERSIÓN NUEVA LLEGUE AL CELULAR.
     *
     * Antes esto registraba el service worker una vez y nunca más preguntaba
     * si había algo nuevo. En una computadora no se nota —se recarga la
     * página y listo— pero una app INSTALADA casi nunca navega: se abre,
     * restaura la pantalla donde estaba, y sigue con el código viejo en
     * memoria. Puede quedarse semanas así sin que nadie entienda por qué.
     *
     * Pasó justamente con el logo: en la computadora salía el nuevo y en el
     * celular seguía el viejo.
     *
     * Son dos piezas:
     *
     *   · al volver a la app se le pide al navegador que compruebe si hay un
     *     service worker nuevo — volver a la app es el momento en que a nadie
     *     le molesta que algo se actualice;
     *   · y cuando uno nuevo toma el control, se recarga UNA vez, porque el
     *     service worker nuevo no cambia por sí solo el código que la pestaña
     *     ya tiene cargado.
     */
    let registro: ServiceWorkerRegistration | null = null;

    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').then((r) => { registro = r; }).catch(() => {
        // Sin service worker la app anda igual: se pierden el modo sin
        // conexión y los avisos, nada más. No vale la pena molestar con
        // un error por esto.
      });
    };

    // Si YA había un service worker al cargar, un cambio de control después
    // significa que llegó una versión nueva. Si no lo había, el cambio es la
    // primera instalación y recargar ahí sería recargarle la página a alguien
    // que recién entra, sin ningún motivo.
    const habiaUnoAntes = !!navigator.serviceWorker.controller;
    let recargando = false;

    const alCambiarDeControlador = () => {
      if (!habiaUnoAntes || recargando) return;
      recargando = true;
      window.location.reload();
    };

    const alVolverALaApp = () => {
      if (document.visibilityState === 'visible') registro?.update().catch(() => {});
    };

    navigator.serviceWorker.addEventListener('controllerchange', alCambiarDeControlador);
    document.addEventListener('visibilitychange', alVolverALaApp);

    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });

    return () => {
      window.removeEventListener('load', registrar);
      navigator.serviceWorker.removeEventListener('controllerchange', alCambiarDeControlador);
      document.removeEventListener('visibilitychange', alVolverALaApp);
    };
  }, []);

  useEffect(() => {
    const alPerder = () => setDesconectado(true);
    const alVolver = () => setDesconectado(false);

    setDesconectado(!navigator.onLine);
    window.addEventListener('offline', alPerder);
    window.addEventListener('online', alVolver);
    return () => {
      window.removeEventListener('offline', alPerder);
      window.removeEventListener('online', alVolver);
    };
  }, []);

  if (!desconectado) return null;

  return (
    <div
      role="status"
      className="zona-segura-abajo fixed inset-x-0 bottom-0 z-[70] bg-ambar px-4 py-2 text-center text-[13px] font-bold text-white"
    >
      {sinConexion}
    </div>
  );
}
