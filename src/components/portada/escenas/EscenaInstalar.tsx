'use client';

import Link from 'next/link';
import { SeccionEscena } from '@/components/portada/escenas/base';
import { instalarEs, instalarPt, type TextosInstalar } from '@/i18n/textos/escenas/instalar';
import { GuiaInstalarIlustrada } from './EscenaInstalar.guia';

export { GuiaInstalarIlustrada };

/**
 * LA ESCENA «INSTALAR» DE LA PORTADA (02/10/2026): «Cómo poner Orden en tu
 * pantalla de inicio». Un teléfono dibujado —iPhone con Safari o Android
 * con Chrome, a elección— que muestra paso a paso cómo se agrega Orden, con
 * el botón verdadero resaltado en cada paso; al lado, el texto del paso y
 * los botones para avanzar. Nada avanza solo: el visitante lleva el ritmo.
 *
 * La guía entera vive en EscenaInstalar.guia.tsx (`GuiaInstalarIlustrada`)
 * y es la misma que se ve en /instalar: acá solo se le pone el título de la
 * sección y, al pie, el enlace para pasarle la guía a alguien. Los dibujos
 * están en EscenaInstalar.pantallas.tsx y los íconos en
 * EscenaInstalar.iconos.tsx.
 *
 * Va `centrado` y no con el teléfono en una columna del molde: la guía trae
 * su propia grilla de dos columnas desde `lg` (teléfono a la izquierda,
 * pestañas y paso a la derecha), y así a 375 px el orden de lectura es el
 * que importa —pestañas, teléfono, paso, botones— sin repetir nada.
 */
export function EscenaInstalar({ idioma }: { idioma: 'es' | 'pt' }): JSX.Element {
  const x: TextosInstalar = idioma === 'pt' ? instalarPt : instalarEs;
  return (
    <SeccionEscena
      id="instalar"
      fondo="arena"
      lado="centrado"
      etiqueta={x.etiqueta}
      titulo={x.titulo}
      tituloId="titulo-instalar"
      apoyo={x.apoyo}
      figura={<GuiaInstalarIlustrada idioma={idioma} />}
      aparte={(
        <p className="text-center text-[14px] leading-relaxed text-tinta/50">
          {x.pasarGuia}{' '}
          <Link href="/instalar" className="font-semibold text-verde-fuerte hover:underline">
            {x.guiaPropia}
          </Link>
          {x.paraMandar}
        </p>
      )}
    />
  );
}
