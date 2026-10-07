'use client';

import { useState } from 'react';
import { Marca } from '@/components/Marca';
import { Entra, Tilde } from '@/components/portada/pantallas/Celular';
import {
  Anuncio, Contador, ControlEscena, FiguraCelular, SeccionEscena, useAlVerse, useSecuencia,
} from '@/components/portada/escenas/base';
import { useLocale, useTextos } from '@/i18n/cliente';
import { nocheEs, nochePt, type TextosNoche } from '@/i18n/textos/escenas/noche';
import { vitrinaEs, vitrinaPt } from '@/i18n/textos/vitrina';
import { dinero, dineroCorto, porcentaje } from '@/lib/formato';

/**
 * LA ESCENA DE LA NOCHE (02/10/2026): «Diez segundos y sabés cómo te fue».
 *
 * La pantalla REAL de /cierre, a tamaño real y sin marco de teléfono, de la
 * barbería de la vitrina: los tres números (Entró, Salió, Ganancia Neta), la
 * comparación contra el mismo día de la semana pasada, lo que más dejó, la
 * racha y el botón «Cerrar el día». Es el «momento cartel» de la portada:
 * la única franja oscura entre la vitrina y el pie, con el título a 44 px.
 *
 * Va sin marco a propósito: así «Cerrar el día» es un botón de verdad y no
 * decorado de un `role="img"`, y los importes son texto real para el lector
 * de pantalla. Sin gráfico: el cierre real no tiene, y el movimiento sale
 * de otro lado: los números que suben, las filas que entran una por una y
 * la tarjeta que se enciende.
 *
 * Los rótulos (Entró, Salió, Ganancia Neta, «contra el mismo día…», la
 * racha, «Cerrar el día», «Día cerrado») se leen de `t.cierre` y `t.racha`:
 * la escena dice exactamente lo que dice la app, en los dos idiomas. Lo
 * propio de la escena (título, datos de ejemplo, resumen) vive en
 * i18n/textos/escenas/noche.ts.
 *
 * Cómo se mueve: el HTML del servidor es el cuadro final, completo y quieto
 * (también con «reducir movimiento»). Al verse por primera vez corre UNA
 * entrada de 2,6 s —cinco cuadros, ver DURACIONES— y queda esperando al
 * dedo. Lo que cambia de cuadro no se desmonta: queda en su lugar con
 * opacidad 0, así el panel mide siempre lo mismo y la página no salta.
 */

/**
 * Los cinco cuadros de la entrada, en ms (el último es el final):
 *   0 · 0,0 s  se enciende el resplandor y entra el encabezado
 *   1 · 0,4 s  entran las tres filas en cero; Entró sube (900 ms), Salió
 *              a los 0,7 s (600 ms) y Ganancia Neta a 1,0 s (1.000 ms)
 *   2 · 0,7 s  marca cuándo se encienden las pastillas Entró y Salió (a 1,3 s,
 *              cuando sus números terminan de subir)
 *   3 · 2,0 s  Ganancia Neta «se aprieta», la tarjeta se enciende; entran
 *              la comparación, lo que más dejó y la racha (la llama cae)
 *   4 · 2,6 s  entra «Cerrar el día» y su halo late tres veces
 */
const DURACIONES: (number | null)[] = [400, 300, 1300, 600, 0];
const CUADRO_FINAL = DURACIONES.length - 1;

/** El resplandor de la marca detrás del panel (los mismos valores de la primera pantalla). */
const RESPLANDOR = 'radial-gradient(closest-side, rgba(40,180,100,.55), rgba(40,180,100,0))';

const TRAZO = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/** La llama de la racha: el mismo trazo de components/Racha.tsx (que no la exporta). */
const LLAMA = (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden {...TRAZO}>
    <path d="M12 22c3.9 0 6.5-2.5 6.5-6 0-4.3-4-6.4-4.6-10.5-1.6 1.3-2.4 3-2.4 4.6 0 .7-.6 1.1-1.1.7C9.4 9.9 9 8.7 9 7.4 7.2 9 5.5 11.2 5.5 14c0 3.6 2.6 6 6.5 6Z" />
  </svg>
);

/**
 * Lo que esta escena mueve y la base no tiene: la franja «Día cerrado» que
 * cruza en el lugar del botón, y el destello del resplandor al cerrar.
 * Mismas reglas que las clases `portada-*`: solo `transform` y `opacity`,
 * animan solo sin «reducir movimiento», y el estado natural es el final
 * (la franja a la vista; el destello, invisible).
 */
const CSS = `
.escena-noche-brillo { opacity: 0; }
@keyframes escena-noche-cerrado { from { opacity: 0; transform: scale(.97); } }
@keyframes escena-noche-brillo { 0% { opacity: 0; } 35% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: no-preference) {
  .escena-noche-cerrado { animation: escena-noche-cerrado .35s ease-out both; }
  .escena-noche-brillo { animation: escena-noche-brillo 1s ease-out forwards; }
}
`;

export function EscenaNoche({ idioma }: { idioma: 'es' | 'pt' }): JSX.Element {
  const x: TextosNoche = idioma === 'pt' ? nochePt : nocheEs;
  const v = idioma === 'pt' ? vitrinaPt : vitrinaEs;
  const t = useTextos();
  const locale = useLocale();

  const { ref, visto, reducido } = useAlVerse<HTMLElement>();
  const s = useSecuencia(DURACIONES, { arranca: visto && !reducido, inicial: CUADRO_FINAL, reducido });
  // Cerrar el día es estado local: no guarda nada, solo cambia el cuadro.
  const [cerrado, setCerrado] = useState(false);
  const [anuncio, setAnuncio] = useState('');

  // En el cuadro final (servidor, sin JavaScript, reducir movimiento) no hay
  // ninguna clase de animación: el panel está completo y quieto.
  const anima = s.estado !== 'final';
  /** ¿Ya llegó el cuadro n? En el cuadro final, todo llegó. */
  const desde = (n: number) => s.cuadro >= n;
  const plata = (n: number) => dinero(n, 'PYG', true, locale);

  const cerrar = () => {
    setCerrado(true);
    setAnuncio(x.cerrado);
  };
  const repetir = () => {
    setCerrado(false);
    setAnuncio('');
    s.repetir();
  };

  const titulo = (
    <span className="text-[32px] sm:text-[34px] lg:text-[44px]">
      {conResaltado(x.titulo, x.tituloResaltado)}
    </span>
  );

  // Las tres pastillas-compás: se encienden cuando su número termina de subir
  // (Entró 0,4 + 0,9 · Salió 0,7 + 0,6 · Ganancia Neta a los 2,0 s).
  const pastillas = (
    <ul aria-label={x.compas} className="flex flex-wrap gap-2">
      {[
        { texto: t.cierre.entro, listo: desde(2), retraso: 600 },
        { texto: t.cierre.salio, listo: desde(2), retraso: 600 },
        { texto: t.cierre.quedo, listo: desde(3), retraso: 0 },
      ].map((p) => (
        <li
          key={p.texto}
          className="relative inline-flex min-h-[32px] items-center rounded-full border border-white/15 px-3 text-[12px] font-semibold text-white/50"
        >
          {p.texto}
          {p.listo && (
            <span
              aria-hidden
              className={`absolute -inset-px inline-flex items-center justify-center rounded-full bg-menta text-noche ${anima ? 'portada-enciende' : ''}`}
              style={{ animationDelay: `${p.retraso}ms` }}
            >
              {p.texto}
            </span>
          )}
        </li>
      ))}
    </ul>
  );

  const figura = (
    <FiguraCelular leyenda={v.datosDeEjemplo} sobreNoche>
      <style>{CSS}</style>
      {/* Para el que escucha de corrido: la pantalla en una frase, antes de los renglones. */}
      <p className="sr-only">{x.resumen}</p>

      <div className="relative mx-auto w-full max-w-[400px]">
        {/* El resplandor: tenue de base, se enciende con el primer cuadro y destella al cerrar. */}
        <span aria-hidden className="pointer-events-none absolute -inset-x-10 -inset-y-12 rounded-full opacity-30" style={{ background: RESPLANDOR }} />
        <span
          key={`resplandor-${s.pasada}`}
          aria-hidden
          className={`pointer-events-none absolute -inset-x-10 -inset-y-12 rounded-full opacity-80 ${anima ? 'portada-enciende' : ''}`}
          style={{ background: RESPLANDOR }}
        />
        {cerrado && (
          <span aria-hidden className="escena-noche-brillo pointer-events-none absolute -inset-x-10 -inset-y-12 rounded-full" style={{ background: RESPLANDOR }} />
        )}

        {/* El panel: la pantalla de /cierre tal cual, sobre el fondo de la app (arena). */}
        <div className="relative rounded-[2rem] border border-white/10 bg-arena p-4 text-tinta">
          {/* La tarjeta que se enciende: anillo y sombra verdes cuando Ganancia Neta termina de subir. */}
          {desde(3) && (
            <span
              aria-hidden
              className={`pointer-events-none absolute -inset-px rounded-[2rem] ring-2 ring-verde/60 shadow-[0_0_50px_-8px_rgba(72,220,130,.55)] ${anima ? 'portada-enciende' : ''}`}
            />
          )}

          {/* Encabezado: la cabecera de la app y el de /cierre. */}
          <Pieza listo={desde(0)} anima={anima}>
            <div className="flex items-center gap-2">
              <Marca clase="h-5 w-5 shrink-0" />
              <span className="truncate text-[12.5px] font-bold tracking-tight">{x.negocio}</span>
            </div>
            <p className="titulo-seccion mt-3">{t.cierre.titulo}</p>
            <p className="mt-0.5 font-titulo text-[19px] font-extrabold leading-tight tracking-tight">{x.fecha}</p>
            <p className="mt-1 text-[13px] font-semibold text-tinta/45">{t.cierre.subtitulo}</p>
          </Pieza>

          {/* Los tres números, con las clases de la Fila real del cierre.
              Los tres contadores arrancan juntos en el cuadro 1 (cuando las
              filas entran) y se escalonan con `retraso`: un contador que
              todavía no está activo muestra el valor final, y una fila que
              entrara con Gs. 250.000 para saltar a cero y volver a subir
              sería un parpadeo. Así cada fila entra en cero y sube cuando le
              toca: Entró a los 0,4 s, Salió a los 0,7 s, Ganancia Neta a 1,0 s. */}
          <div className="tarjeta mt-3 divide-y divide-borde">
            <Pieza listo={desde(1)} anima={anima} paso={0}>
              <Fila etiqueta={t.cierre.entro}>
                <Contador
                  hasta={x.entro} ms={900} activo={anima && desde(1)} formato={plata}
                  className="text-[17px] font-bold text-verde-fuerte"
                />
              </Fila>
            </Pieza>
            <Pieza listo={desde(1)} anima={anima} paso={1}>
              <Fila etiqueta={t.cierre.salio}>
                <Contador
                  hasta={x.salio} ms={600} retraso={300} activo={anima && desde(1)} formato={plata}
                  className="text-[17px] font-bold text-rojo"
                />
              </Fila>
            </Pieza>
            <Pieza listo={desde(1)} anima={anima} paso={2}>
              <Fila etiqueta={t.cierre.quedo} destacado>
                {/* Al llegar, el número «se aprieta»: la clase se suma sin remontar, así el contador no vuelve a cero. */}
                <span className={`inline-block ${anima && desde(3) ? 'portada-pop' : ''}`}>
                  <Contador
                    hasta={x.ganancia} ms={1000} retraso={600} activo={anima && desde(1)} formato={plata}
                    className="font-titulo text-[22px] font-extrabold text-verde-fuerte"
                  />
                </span>
              </Fila>
            </Pieza>
          </div>

          {/* Contra qué se compara: las dos frases de la app, con «contra». */}
          <Pieza listo={desde(3)} anima={anima} paso={0} className="mt-2.5">
            <div className="tarjeta space-y-2.5 p-4">
              <Comparacion frase={t.cierre.masQue(porcentaje(x.vsSemana, 0, locale))} texto={t.cierre.vsSemanaPasada} />
              <Comparacion frase={t.cierre.masQue(porcentaje(x.vsPromedio, 0, locale))} texto={t.cierre.vsPromedio} />
            </div>
          </Pieza>

          {/* Lo que más dejó hoy. */}
          <Pieza listo={desde(3)} anima={anima} paso={2} className="mt-2.5">
            <div className="tarjeta p-4">
              <p className="titulo-seccion">{t.cierre.estrella}</p>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="truncate text-[16px] font-bold tracking-tight">{x.estrella.nombre}</span>
                <span className="shrink-0 text-[15px] font-bold tabular-nums text-verde-fuerte">
                  {dineroCorto(x.estrella.importe, 'PYG', locale, t.formato)}
                </span>
              </div>
            </div>
          </Pieza>

          {/* La racha, como TarjetaRacha: la llama cae en su cuadrado después de que entra la tarjeta. */}
          <Pieza listo={desde(3)} anima={anima} paso={4} className="mt-2.5">
            <div className="tarjeta flex items-center gap-3.5 p-4">
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-verde-claro text-verde-fuerte ${anima ? 'portada-cae' : ''}`}
                style={{ animationDelay: '480ms' }}
              >
                {LLAMA}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold tracking-tight">{t.racha.dias(x.racha.dias)}</p>
                <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-tinta/50">{t.racha.mejor(x.racha.mejor)}</p>
              </div>
            </div>
          </Pieza>

          {/* «Cerrar el día» y, en el mismo hueco de 48 px, la franja «Día cerrado» de la app. */}
          <div className="relative mt-3 h-12">
            {cerrado ? (
              <div className="escena-noche-cerrado absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-verde-claro text-[14px] font-bold text-verde-fuerte">
                <Tilde className="h-[18px] w-[18px]" />
                {t.cierre.cerrado}
              </div>
            ) : (
              <div className={`absolute inset-0 ${desde(4) ? (anima ? 'portada-sube' : '') : 'invisible'}`}>
                {/* El halo detrás del botón que hay que tocar: tres latidos y queda quieto. */}
                {anima && desde(4) && <span aria-hidden className="portada-pulso absolute -inset-1 rounded-full bg-verde/25" />}
                <button type="button" onClick={cerrar} className="boton-principal relative min-h-[48px] w-full text-[15px]">
                  {t.cierre.marcar}
                </button>
              </div>
            )}
          </div>
          {/* El renglón ya está reservado: aparece al cerrar sin mover nada. */}
          <p className={`mt-2 min-h-[20px] text-center text-[13px] font-semibold text-tinta/40 ${cerrado ? '' : 'invisible'}`}>
            {t.cierre.volverManiana}
          </p>
        </div>
      </div>

      <p className="mt-3 text-center text-[12.5px] text-white/45">{x.tocaCerrar}</p>
    </FiguraCelular>
  );

  return (
    <SeccionEscena
      refSeccion={ref}
      fondo="noche"
      lado="figura-izquierda"
      etiqueta={x.etiqueta}
      titulo={titulo}
      tituloId="titulo-noche"
      apoyo={x.apoyo}
      cabecera={pastillas}
      figura={figura}
      controles={(
        <>
          <ControlEscena
            estado={s.estado}
            onPausar={s.pausar}
            onSeguir={s.seguir}
            onRepetir={repetir}
            textos={{ pausar: x.pausar, seguir: x.seguir, verDeNuevo: x.verDeNuevo }}
            sobreNoche
            oculto={reducido}
          />
          <Anuncio texto={anuncio} />
        </>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// AYUDANTES PRIVADOS DE LA ESCENA
// ---------------------------------------------------------------------------

/** El título con una parte en degradé menta (la parte tiene que estar adentro del título, letra por letra). */
function conResaltado(titulo: string, resaltado: string): React.ReactNode {
  const i = titulo.indexOf(resaltado);
  if (i < 0) return titulo;
  return (
    <>
      {titulo.slice(0, i)}
      <span className="bg-gradient-to-r from-menta to-menta-suave bg-clip-text text-transparent">{resaltado}</span>
      {titulo.slice(i + resaltado.length)}
    </>
  );
}

/**
 * Un bloque del panel que todavía no llegó, llegó, o llegó entrando. Nunca
 * se desmonta: cuando no llegó queda en su lugar con opacidad 0, así el
 * panel mide siempre lo mismo. Cuando llega con la escena corriendo entra
 * con `Entra` (el fundido de la vitrina); en el cuadro final está quieto.
 */
function Pieza({ listo, anima, paso = 0, className = '', children }: {
  listo: boolean;
  anima: boolean;
  paso?: number;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  if (!listo) return <div className={`opacity-0 ${className}`}>{children}</div>;
  if (!anima) return <div className={className}>{children}</div>;
  return <Entra paso={paso} className={className}>{children}</Entra>;
}

/** Una fila etiqueta–importe con las clases de la `Fila` de app/(app)/cierre/page.tsx. */
function Fila({ etiqueta, destacado = false, children }: {
  etiqueta: string;
  destacado?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3.5">
      <span className={`text-[14px] ${destacado ? 'font-bold text-tinta' : 'font-semibold text-tinta/55'}`}>{etiqueta}</span>
      {children}
    </div>
  );
}

/** «18 % más» en verde y, al lado, contra qué (como la `Comparacion` del cierre). */
function Comparacion({ frase, texto }: { frase: string; texto: string }): JSX.Element {
  return (
    <p className="text-[13.5px] leading-snug">
      <span className="font-bold text-verde-fuerte">{frase}</span>{' '}
      <span className="text-tinta/50">{texto}</span>
    </p>
  );
}
