'use client';

import { useState } from 'react';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/**
 * CÓMO AGREGAR ORDEN A LA PANTALLA DE INICIO.
 *
 * Nace de un problema concreto: en iPhone, los avisos (push) solo funcionan
 * si Orden está agregada a la pantalla de inicio — es una restricción de
 * Apple, no de Orden. Y nadie sabe hacerlo si nunca se lo mostraron: el botón
 * de «Activar avisos» le fallaba en silencio a cualquiera que no supiera este
 * paso previo.
 *
 * Se usa en DOS lugares con el mismo componente, para no mantener la guía
 * dos veces: adentro de Ajustes (arriba del botón de avisos, en el momento
 * exacto en que hace falta) y en una página propia y compartible (`/instalar`),
 * para poder mandarle el enlace a alguien por WhatsApp sin explicarle nada.
 *
 * LOS ÍCONOS SON DIBUJADOS, NO CAPTURAS DE PANTALLA
 *
 * No hay forma de sacarle una foto real a cada iPhone o Android que exista.
 * Los íconos de acá son los mismos que Apple y Google usan hoy para
 * «compartir» y «agregar» — se reconocen igual, y no se desactualizan si
 * alguna marca les retoca el diseño un pixel.
 */
export function GuiaInstalar({ compacta = false }: { compacta?: boolean }) {
  const [pestania, setPestania] = useState<'iphone' | 'android'>('iphone');

  return (
    <div>
      <div className="flex gap-1.5">
        <Pestania activa={pestania === 'iphone'} onClick={() => setPestania('iphone')}>
          iPhone
        </Pestania>
        <Pestania activa={pestania === 'android'} onClick={() => setPestania('android')}>
          Android
        </Pestania>
      </div>

      <ol className={`mt-4 space-y-4 ${compacta ? '' : 'sm:space-y-5'}`}>
        {pestania === 'iphone' ? (
          <>
            <Paso numero={1} icono={<IconoCompartir />}>
              Abrí Orden en <strong className="text-tinta">Safari</strong> y tocá el ícono de{' '}
              <strong className="text-tinta">Compartir</strong> (el cuadrado con la flecha hacia arriba)
              en la barra de Safari. Si no lo ves, tocá primero los{' '}
              <strong className="text-tinta">tres puntos «···»</strong> y ahí aparece.
            </Paso>
            <Paso numero={2} icono={<IconoAgregar />}>
              Deslizá la lista de opciones y tocá{' '}
              <strong className="text-tinta">«Agregar a inicio»</strong>.
            </Paso>
            <Paso numero={3} icono={<IconoListo />}>
              Tocá <strong className="text-tinta">«Agregar»</strong> arriba a la derecha. Va a
              aparecer un ícono nuevo de Orden en tu pantalla.
            </Paso>
            <Paso numero={4} icono={<IconoAbrir />}>
              <strong className="text-tinta">Abrí Orden desde ese ícono nuevo</strong>, no desde
              Safari. Recién ahí funcionan los avisos — es la parte que
              más se salta.
            </Paso>
          </>
        ) : (
          <>
            <Paso numero={1} icono={<IconoMenu />}>
              Abrí Orden en <strong className="text-tinta">Chrome</strong> y tocá los{' '}
              <strong className="text-tinta">tres puntos</strong> arriba a la derecha.
            </Paso>
            <Paso numero={2} icono={<IconoAgregar />}>
              Tocá <strong className="text-tinta">«Instalar aplicación»</strong> o{' '}
              <strong className="text-tinta">«Agregar a pantalla de inicio»</strong>
              {' '}—el nombre cambia un poco según la versión de Chrome—.
            </Paso>
            <Paso numero={3} icono={<IconoListo />}>
              Confirmá, y listo: queda un ícono de Orden entre tus aplicaciones.
            </Paso>
            <Paso numero={4} icono={<IconoAbrir />}>
              En Android no hace falta este paso para que lleguen los avisos —ya
              funcionan desde el navegador—, pero instalada se abre más rápido
              y ocupa toda la pantalla, sin la barra de Chrome arriba.
            </Paso>
          </>
        )}
      </ol>
    </div>
  );
}

function Pestania({ activa, onClick, children }: {
  activa: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
        activa ? 'bg-verde text-white' : 'bg-arena text-tinta/55 hover:bg-borde/40'
      }`}
    >
      {children}
    </button>
  );
}

function Paso({ numero, icono, children }: {
  numero: number; icono: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-verde-claro text-verde-fuerte">
        {icono}
      </span>
      <span className="pt-1.5 text-[14px] leading-relaxed text-tinta/70">
        <span className="mr-1.5 text-[12px] font-bold text-tinta/35">{numero}.</span>
        {children}
      </span>
    </li>
  );
}

/** El ícono de «Compartir» de iOS: un cuadrado con una flecha saliendo hacia arriba. */
function IconoCompartir() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...trazo}>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M6 11h-.5A1.5 1.5 0 0 0 4 12.5v6A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H18" />
    </svg>
  );
}

/** El «+» dentro de un cuadrado: agregar a la pantalla. */
function IconoAgregar() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...trazo}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

/** Un tilde: el paso quedó hecho. */
function IconoListo() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...trazo}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 12.3 2.6 2.6L16.5 9" />
    </svg>
  );
}

/** El ícono de Orden en un teléfono, para «abrilo desde acá». */
function IconoAbrir() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...trazo}>
      <rect x="6" y="3" width="12" height="18" rx="2.5" />
      <circle cx="12" cy="9" r="2.3" />
      <path d="M9.5 17h5" />
    </svg>
  );
}

/** Los tres puntos verticales del menú de Chrome en Android. */
function IconoMenu() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...trazo}>
      <circle cx="12" cy="6" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="12" cy="18" r="1.3" />
    </svg>
  );
}
