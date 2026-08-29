'use client';

import { useRef, useState } from 'react';
import { DEMOS } from '@/lib/demos';
import type { Idioma } from '@/i18n/idiomas';

/**
 * LOS VIDEOS DE «CÓMO SE VE POR DENTRO»
 *
 * Quien llega a la portada está decidiendo si esto le sirve, y ninguna
 * cantidad de texto convence tanto como ver la pantalla real.
 *
 * Dos decisiones que no son de diseño sino de respeto por quien mira:
 *
 *   · `preload="none"`. El video NO se descarga hasta que lo aprietan. Sin
 *     esto, entrar a la portada desde el celular te costaría varios megas de
 *     datos de alguien que todavía no sabe qué es Orden. Antes del play se ve
 *     una imagen, que pesa cien veces menos.
 *   · Nunca arranca solo. Un video que se dispara al hacer scroll, con o sin
 *     sonido, es de las pocas cosas que hacen cerrar una página al instante.
 *
 * Si no hay ningún video cargado, este componente no dibuja nada: la portada
 * sigue de largo como si la sección no existiera.
 */
export default function Demos({ idioma }: { idioma: Idioma }) {
  if (DEMOS.length === 0) return null;

  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {DEMOS.map((demo) => {
        const texto = idioma === 'en' && demo.en ? demo.en : demo;
        return (
          <Video
            key={demo.archivo}
            archivo={demo.archivo}
            portada={demo.portada}
            titulo={texto.titulo}
            detalle={texto.detalle}
          />
        );
      })}
    </div>
  );
}

function Video({
  archivo, portada, titulo, detalle,
}: { archivo: string; portada?: string; titulo: string; detalle: string }) {
  const [arrancado, setArrancado] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  function arrancar() {
    setArrancado(true);
    ref.current?.play().catch(() => {
      // Si el navegador se niega, quedan los controles a la vista y lo
      // aprietan ellos. No hay nada que avisar.
    });
  }

  return (
    <figure className="tarjeta overflow-hidden">
      <div className="relative bg-tinta">
        <video
          ref={ref}
          className="aspect-[9/16] w-full object-contain"
          poster={portada ? `/videos/${portada}` : undefined}
          preload="none"
          playsInline
          muted
          controls={arrancado}
          onEnded={() => setArrancado(false)}
        >
          <source src={`/videos/${archivo}`} type="video/mp4" />
        </video>

        {!arrancado && (
          <button
            type="button"
            onClick={arrancar}
            aria-label={`Ver el video: ${titulo}`}
            className="absolute inset-0 grid place-items-center bg-tinta/25 transition hover:bg-tinta/10"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95 shadow-tarjeta">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 text-verde-fuerte" fill="currentColor">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
          </button>
        )}
      </div>

      <figcaption className="p-4">
        <p className="text-[15px] font-bold tracking-tight">{titulo}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta/60">{detalle}</p>
      </figcaption>
    </figure>
  );
}
