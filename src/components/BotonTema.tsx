'use client';

import { useEffect, useState } from 'react';
import { guardarTema, leerTema, type Tema } from '@/lib/tema';
import { useTextos } from '@/i18n/cliente';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/**
 * SOL Y LUNA, EN LA PORTADA.
 *
 * Dos íconos y no tres: acá no va «como el teléfono». Quien toca uno de estos
 * está eligiendo a propósito, y la opción de seguir al sistema —que es la que
 * viene puesta— está en Ajustes, adentro, donde se configuran las cosas.
 *
 * La barra de arriba de la portada es oscura siempre, así que los colores de
 * este botón están escritos sobre oscuro y no salen de la paleta del tema.
 *
 * QUÉ CAMBIA Y QUÉ NO
 *
 * La franja del titular queda oscura en los dos temas: es la tapa, y de ahí
 * para abajo la portada se ve como se ve Orden por dentro. Así que tocar el
 * sol cambia todo lo que sigue —precios, textos, tarjetas— y la aplicación
 * entera cuando entre. Se decidió así y no al revés: una portada que se pone
 * blanca entera pierde lo único que la hace parecer un producto y no un
 * formulario.
 */
export function BotonTema() {
  const [tema, setTema] = useState<Tema>('sistema');
  const t = useTextos();

  // Después del montaje: en el servidor no hay localStorage, y pintar el
  // botón marcado al revés y corregirlo después es peor que no marcarlo.
  useEffect(() => { setTema(leerTema()); }, []);

  const elegir = (nuevo: Tema) => { setTema(nuevo); guardarTema(nuevo); };

  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-white/15 bg-white/5 p-0.5 backdrop-blur">
      <Icono
        activo={tema === 'claro'}
        onClick={() => elegir('claro')}
        etiqueta={t.comun.coloresClaros}
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      </Icono>
      <Icono
        activo={tema === 'oscuro'}
        onClick={() => elegir('oscuro')}
        etiqueta={t.comun.coloresOscuros}
      >
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      </Icono>
    </div>
  );
}

function Icono({ activo, onClick, etiqueta, children }: {
  activo: boolean;
  onClick: () => void;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      aria-pressed={activo}
      title={etiqueta}
      className={`grid h-8 w-8 place-items-center rounded-[10px] transition ${
        activo ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/80'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" {...trazo}>{children}</svg>
    </button>
  );
}
