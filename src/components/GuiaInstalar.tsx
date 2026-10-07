'use client';

import { useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { Rico } from '@/components/Rico';
import { GuiaInstalarIlustrada } from '@/components/portada/escenas/EscenaInstalar';
import {
  IconoAbrir, IconoAgregar, IconoCompartir, IconoListo, IconoMenu,
} from '@/components/portada/escenas/EscenaInstalar.iconos';

// Los íconos se mudaron a la escena (ver el porqué en EscenaInstalar.iconos.tsx);
// desde acá se siguen pudiendo importar como siempre.
export { IconoAbrir, IconoAgregar, IconoCompartir, IconoListo, IconoMenu };

/**
 * CÓMO AGREGAR ORDEN A LA PANTALLA DE INICIO.
 *
 * Nace de un problema concreto: en iPhone, los avisos (push) solo funcionan
 * si Orden está agregada a la pantalla de inicio — es una restricción de
 * Apple, no de Orden. Y nadie sabe hacerlo si nunca se lo mostraron: el botón
 * de «Activar avisos» le fallaba en silencio a cualquiera que no supiera este
 * paso previo.
 *
 * Tiene dos caras y un solo texto (`t.instalarGuia`), así no hay dos guías
 * que se desactualicen por separado:
 *
 *   · `compacta`: la lista de texto con sus íconos, para los lugares chicos
 *     adentro de la app (Ajustes, arriba del botón de avisos, y la hoja de
 *     avisos), en el momento exacto en que hace falta.
 *   · sin `compacta`: la guía ilustrada de la portada (02/10/2026), con el
 *     teléfono dibujado paso a paso, en una columna. Es la de /instalar, la
 *     página propia y compartible para mandarle el enlace a alguien por
 *     WhatsApp sin explicarle nada.
 *
 * LOS ÍCONOS SON DIBUJADOS, NO CAPTURAS DE PANTALLA
 *
 * No hay forma de sacarle una foto real a cada iPhone o Android que exista.
 * Los íconos (y los teléfonos de la guía ilustrada) son dibujos genéricos:
 * los mismos trazos que Apple y Google usan hoy para «compartir» y
 * «agregar» — se reconocen igual, y no se desactualizan si alguna marca les
 * retoca el diseño un pixel.
 */
export function GuiaInstalar({ compacta = false }: { compacta?: boolean }) {
  return compacta ? <ListaCompacta /> : <GuiaInstalarIlustrada angosta />;
}

/** La lista de texto de siempre: pestañas de 44 px y los cuatro pasos con su ícono. */
function ListaCompacta() {
  const [pestania, setPestania] = useState<'iphone' | 'android'>('iphone');
  const g = useTextos().instalarGuia;

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

      <ol className="mt-4 space-y-4">
        {pestania === 'iphone' ? (
          <>
            <Paso numero={1} icono={<IconoCompartir />}><Rico texto={g.iphone1} negrita="text-tinta" /></Paso>
            <Paso numero={2} icono={<IconoAgregar />}><Rico texto={g.iphone2} negrita="text-tinta" /></Paso>
            <Paso numero={3} icono={<IconoListo />}><Rico texto={g.iphone3} negrita="text-tinta" /></Paso>
            <Paso numero={4} icono={<IconoAbrir />}><Rico texto={g.iphone4} negrita="text-tinta" /></Paso>
          </>
        ) : (
          <>
            <Paso numero={1} icono={<IconoMenu />}><Rico texto={g.android1} negrita="text-tinta" /></Paso>
            <Paso numero={2} icono={<IconoAgregar />}><Rico texto={g.android2} negrita="text-tinta" /></Paso>
            <Paso numero={3} icono={<IconoListo />}><Rico texto={g.android3} negrita="text-tinta" /></Paso>
            <Paso numero={4} icono={<IconoAbrir />}><Rico texto={g.android4} negrita="text-tinta" /></Paso>
          </>
        )}
      </ol>
    </div>
  );
}

/** 44 px de alto: se toca con el dedo, adentro de la app. */
function Pestania({ activa, onClick, children }: {
  activa: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`min-h-[44px] rounded-lg px-4 text-[13px] font-semibold transition ${
        activa ? 'bg-verde text-sobre-verde' : 'bg-arena text-tinta/55 hover:bg-borde/40'
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
