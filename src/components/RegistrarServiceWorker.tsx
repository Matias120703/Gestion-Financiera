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

    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Sin service worker la app anda igual: se pierden el modo sin
        // conexión y los avisos, nada más. No vale la pena molestar con
        // un error por esto.
      });
    };

    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });

    return () => window.removeEventListener('load', registrar);
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
