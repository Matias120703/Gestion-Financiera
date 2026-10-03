/**
 * LOS CINCO ÍCONOS DE LA GUÍA DE INSTALAR (compartir, agregar, listo, abrir
 * y el menú de tres puntos). Son dibujos, no capturas: los mismos trazos que
 * Apple y Google usan hoy para «compartir» y «agregar», que se reconocen
 * igual y no se desactualizan si alguna marca les retoca un pixel. Nada de
 * logos de Apple, Safari, Chrome ni Google.
 *
 * Viven acá y no en components/GuiaInstalar.tsx porque los usan los dos
 * lados —la lista compacta de Ajustes y los teléfonos dibujados de la
 * escena— y GuiaInstalar.tsx importa la guía ilustrada: si los íconos
 * quedaran allá, los dos archivos se importarían entre sí. GuiaInstalar.tsx
 * los vuelve a exportar, así quien los pedía de ahí los sigue encontrando.
 *
 * `className` por defecto es el tamaño de la lista (18 px); los teléfonos
 * los piden más chicos.
 */

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

const TAMANO = 'h-[18px] w-[18px]';

/** El ícono de «Compartir» de iOS: un cuadrado con una flecha saliendo hacia arriba. */
export function IconoCompartir({ className = TAMANO }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...trazo}>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M6 11h-.5A1.5 1.5 0 0 0 4 12.5v6A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H18" />
    </svg>
  );
}

/** El «+» dentro de un cuadrado: agregar a la pantalla. */
export function IconoAgregar({ className = TAMANO }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...trazo}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

/** Un tilde: el paso quedó hecho. */
export function IconoListo({ className = TAMANO }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...trazo}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 12.3 2.6 2.6L16.5 9" />
    </svg>
  );
}

/** El ícono de Orden en un teléfono, para «abrilo desde acá». */
export function IconoAbrir({ className = TAMANO }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...trazo}>
      <rect x="6" y="3" width="12" height="18" rx="2.5" />
      <circle cx="12" cy="9" r="2.3" />
      <path d="M9.5 17h5" />
    </svg>
  );
}

/** Los tres puntos verticales del menú de Chrome en Android. */
export function IconoMenu({ className = TAMANO }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...trazo}>
      <circle cx="12" cy="6" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="12" cy="18" r="1.3" />
    </svg>
  );
}
