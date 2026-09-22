'use client';

/**
 * Idioma en el navegador.
 *
 * El servidor ya sabe qué idioma corresponde, así que en vez de volver a
 * calcularlo acá lo baja por el layout y lo pone en un contexto. Un solo
 * lugar decide, y no hay parpadeo de un idioma al otro al hidratar.
 */
import { createContext, useCallback, useContext, useMemo } from 'react';
import { diccionario, idiomaEfectivo, type Textos } from './diccionarios';
import { conJerga } from './jergas';
import type { Jerga } from '@/lib/rubros';
import {
  COOKIE_IDIOMA, FICHA, IDIOMA_POR_DEFECTO, IDIOMA_UNICO, type Idioma,
} from './idiomas';
import { usarTraductorDeErrores } from '@/lib/errores';
import { traducirMensajeAPortugues } from '@/lib/mensajes-base';

const Contexto = createContext<Idioma>(IDIOMA_POR_DEFECTO);
/** Las palabras del oficio de esta cuenta (097). Null: el diccionario tal cual. */
const ContextoJerga = createContext<Jerga | null>(null);

export function ProveedorIdioma({
  idioma, children,
}: {
  idioma: Idioma;
  children: React.ReactNode;
}) {
  // Los mensajes de la base llegan en español: en portugués se traducen
  // antes de mostrarse (ver lib/errores.ts). Solo en el navegador, donde
  // hay una sola persona; en el servidor quedaría compartido entre pedidos.
  if (typeof window !== 'undefined') {
    const efectivo = IDIOMA_UNICO ?? idioma;
    usarTraductorDeErrores(efectivo === 'pt' ? traducirMensajeAPortugues : null);
  }
  return <Contexto.Provider value={idioma}>{children}</Contexto.Provider>;
}

/**
 * Las palabras del oficio, para todo lo que está adentro (097).
 *
 * Va en el layout de la aplicación, donde ya se sabe de qué cuenta es: así
 * cada pantalla pide su texto como siempre y al trainer le llega «sesión»
 * donde al profe le llega «clase».
 */
export function ProveedorJerga({ jerga, children }: { jerga: Jerga | null; children: React.ReactNode }) {
  return <ContextoJerga.Provider value={jerga}>{children}</ContextoJerga.Provider>;
}

export function useIdioma(): Idioma {
  return useContext(Contexto);
}

export function useTextos(): Textos {
  const idioma = useContext(Contexto);
  const jerga = useContext(ContextoJerga);
  return useMemo(() => conJerga(diccionario(idioma), jerga, idiomaEfectivo(idioma)), [idioma, jerga]);
}

/** Locale de Intl del idioma activo: para formatear plata y fechas. */
export function useLocale(): string {
  return FICHA[useContext(Contexto)].locale;
}

/**
 * Cambia el idioma: escribe la cookie y recarga.
 *
 * Recarga entera y no `router.refresh()` porque el idioma también manda en
 * el `lang` del <html>, que lo pinta el layout raíz. Guardar la preferencia
 * en la base es aparte y puede fallar sin que el cambio deje de aplicarse:
 * la cookie es la que manda para lo que ves ahora.
 */
export function aplicarIdioma(idioma: Idioma) {
  const unAnio = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_IDIOMA}=${idioma}; path=/; max-age=${unAnio}; samesite=lax`;
  window.location.reload();
}

export function useCambiarIdioma() {
  return useCallback((idioma: Idioma) => aplicarIdioma(idioma), []);
}
