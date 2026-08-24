'use client';

/**
 * Idioma en el navegador.
 *
 * El servidor ya sabe qué idioma corresponde, así que en vez de volver a
 * calcularlo acá lo baja por el layout y lo pone en un contexto. Un solo
 * lugar decide, y no hay parpadeo de un idioma al otro al hidratar.
 */
import { createContext, useCallback, useContext, useMemo } from 'react';
import { diccionario, type Textos } from './diccionarios';
import {
  COOKIE_IDIOMA, FICHA, IDIOMA_POR_DEFECTO, type Idioma,
} from './idiomas';

const Contexto = createContext<Idioma>(IDIOMA_POR_DEFECTO);

export function ProveedorIdioma({
  idioma, children,
}: {
  idioma: Idioma;
  children: React.ReactNode;
}) {
  return <Contexto.Provider value={idioma}>{children}</Contexto.Provider>;
}

export function useIdioma(): Idioma {
  return useContext(Contexto);
}

export function useTextos(): Textos {
  const idioma = useContext(Contexto);
  return useMemo(() => diccionario(idioma), [idioma]);
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
