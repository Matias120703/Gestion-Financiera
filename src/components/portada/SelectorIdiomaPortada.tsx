'use client';

import { aplicarIdioma, useIdioma } from '@/i18n/cliente';
import { FICHA, IDIOMAS, IDIOMA_UNICO } from '@/i18n/idiomas';

/**
 * ES · PT, ARRIBA DE TODO EN LA PORTADA (24/09).
 *
 * Hasta hoy el idioma de la portada salía solo de la cookie o del navegador,
 * y el selector vivía adentro, en Ajustes. Un brasileño con el teléfono en
 * español —pasa mucho en Paraguay— veía la portada en español y no tenía
 * dónde tocar para cambiarla. Los agrónomos brasileños son justamente el
 * público del campo, así que el cambio va a la vista, en la barra.
 *
 * Hace lo mismo que el selector de Ajustes: escribe la cookie `orden_idioma`
 * (la que lee `idiomaActual()`) y recarga, porque el idioma también manda
 * en el `lang` del <html> que pinta el layout. Sin sesión no hay preferencia
 * en la base que guardar: al crear la cuenta, la cookie ya dice cuál eligió.
 *
 * Los nombres van en su propio idioma («Português», no «Portugués») y cada
 * botón lleva su `lang`: el lector de pantalla lo pronuncia bien.
 *
 * Los colores están escritos sobre oscuro, como el `BotonTema` de al lado:
 * la barra de la portada es oscura en los dos temas.
 */
export function SelectorIdiomaPortada({ etiqueta }: { etiqueta: string }) {
  const actual = useIdioma();

  // Con un idioma único no hay nada que elegir: mostrar el botón sería
  // prometer un idioma que no se va a ver.
  if (IDIOMA_UNICO) return null;

  return (
    <div
      role="group"
      aria-label={etiqueta}
      className="flex items-center gap-0.5 rounded-xl border border-white/15 bg-white/5 p-0.5 backdrop-blur"
    >
      {IDIOMAS.map((idioma) => {
        const activo = idioma === actual;
        return (
          <button
            key={idioma}
            type="button"
            lang={idioma}
            aria-pressed={activo}
            aria-label={FICHA[idioma].nombre}
            title={FICHA[idioma].nombre}
            onClick={() => { if (!activo) aplicarIdioma(idioma); }}
            // 36 px a la vista y 44 al dedo: el `after` agranda la zona que
            // se puede tocar sin agrandar la barra, que en 375 px va justa.
            className={`relative grid h-8 min-w-[34px] place-items-center rounded-[10px] px-1.5 text-[12px]
                        font-bold uppercase tracking-wide transition after:absolute after:-inset-1.5
                        after:content-[''] ${
              activo ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/85'
            }`}
          >
            {idioma}
          </button>
        );
      })}
    </div>
  );
}
