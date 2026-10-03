'use client';

import { useEffect, useId, useState } from 'react';
import { Rico } from '@/components/Rico';
import {
  Anuncio, FiguraCelular, MarcoTelefono, Pestanias, useAlVerse,
} from '@/components/portada/escenas/base';
import { useIdioma, useTextos } from '@/i18n/cliente';
import { instalarEs, instalarPt, type TextosInstalar } from '@/i18n/textos/escenas/instalar';
import { vitrinaEs, vitrinaPt } from '@/i18n/textos/vitrina';
import { IconoAbrir, IconoAgregar, IconoCompartir, IconoListo, IconoMenu } from './EscenaInstalar.iconos';
import { CSS_ESCENA_INSTALAR, PantallaPaso, TOTAL_PASOS, type Sistema } from './EscenaInstalar.pantallas';

/**
 * LA GUÍA DE INSTALAR, ILUSTRADA (02/10/2026): las pestañas iPhone /
 * Android, el teléfono dibujado con la pantalla de cada paso, el texto del
 * paso, «Anterior» / «Siguiente» y los cuatro puntos. Es lo que de verdad
 * se construye: la sección de la portada (EscenaInstalar.tsx) la envuelve
 * con su título, y `GuiaInstalar` (sin `compacta`) la muestra en /instalar
 * con `angosta`, en una sola columna. Ajustes y la hoja de avisos siguen
 * con la lista compacta de texto.
 *
 * Acá NADA avanza solo: el teléfono muestra un paso y espera. Lo que se
 * mueve es la entrada de cada paso cuando el visitante lo pide —el dedo
 * toca el control anterior, la hoja o el menú entra, el control verdadero
 * late tres veces— y, al verse por primera vez, el teléfono que aparece y
 * el control del paso 1 y «Siguiente» que laten. Con «reducir movimiento»
 * los pasos cambian en seco y aparecen armados. El HTML del servidor es el
 * paso 1 de iPhone, completo y quieto; después de hidratar, si el teléfono
 * del visitante es un Android, se elige esa pestaña sola.
 *
 * Lo que dice cada paso se lee de `t.instalarGuia`, igual que la lista
 * compacta: una sola fuente para las dos guías. El teléfono es un
 * `role="img"` con el resumen del paso; los controles reales (pestañas,
 * botones, puntos) están afuera. El teléfono entero también avanza, con un
 * botón invisible por encima que no entra en el tabulador: es solo para el
 * dedo o el puntero.
 */

/** El ícono de cada paso, el mismo de la lista compacta. */
const ICONOS_PASO: Record<Sistema, JSX.Element[]> = {
  iphone: [<IconoCompartir key="1" />, <IconoAgregar key="2" />, <IconoListo key="3" />, <IconoAbrir key="4" />],
  android: [<IconoMenu key="1" />, <IconoAgregar key="2" />, <IconoListo key="3" />, <IconoAbrir key="4" />],
};

const PASOS = Array.from({ length: TOTAL_PASOS }, (_, i) => i + 1);

export function GuiaInstalarIlustrada({ angosta = false, idioma }: {
  /** Siempre en una columna, como a 375 px (la página /instalar). */
  angosta?: boolean;
  /** Si no se pasa, el idioma del contexto (el de la app). */
  idioma?: 'es' | 'pt';
}): JSX.Element {
  const idiomaContexto = useIdioma();
  const idiomaEfectivo = idioma ?? idiomaContexto;
  const x: TextosInstalar = idiomaEfectivo === 'pt' ? instalarPt : instalarEs;
  const v = idiomaEfectivo === 'pt' ? vitrinaPt : vitrinaEs;
  const t = useTextos();
  const g = t.instalarGuia;

  const { ref, visto, reducido } = useAlVerse<HTMLDivElement>();
  const anima = visto && !reducido;

  const [sistema, setSistema] = useState<Sistema>('iphone');
  const [paso, setPaso] = useState(1);
  /** Sube cada vez que se vuelve al paso 1: la `key` cambia y el paso 1 vuelve a entrar. */
  const [pasada, setPasada] = useState(0);
  const [desdeAnterior, setDesdeAnterior] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const idTexto = useId();

  // El servidor pinta iPhone; en un Android, después de hidratar, se elige
  // esa pestaña sola (el visitante puede cambiarla igual).
  useEffect(() => {
    if (/Android/i.test(navigator.userAgent)) setSistema('android');
  }, []);

  const irA = (n: number, desdeElAnterior: boolean) => {
    setDesdeAnterior(desdeElAnterior);
    setPaso(n);
    setAnuncio(x.pasoDe(n, TOTAL_PASOS));
  };
  const siguiente = () => {
    if (paso >= TOTAL_PASOS) {
      setPasada((p) => p + 1);
      irA(1, false);
      return;
    }
    irA(paso + 1, true);
  };
  const anterior = () => {
    if (paso > 1) irA(paso - 1, false);
  };
  const cambiarSistema = (s: Sistema) => {
    setSistema(s);
    setPasada((p) => p + 1);
    setDesdeAnterior(false);
    setPaso(1);
    setAnuncio(`${x[s]} · ${x.pasoDe(1, TOTAL_PASOS)}`);
  };

  const textoPaso = g[`${sistema}${paso}` as keyof typeof g];
  const ultimo = paso === TOTAL_PASOS;

  // A 375 px (y con `angosta`) todo va en una columna, en este orden:
  // pestañas y pastilla, el teléfono, el paso con sus botones. Desde `lg`
  // el teléfono va a la izquierda ocupando las dos filas, y a la derecha
  // las pestañas (al pie de la primera fila) y el paso (al tope de la
  // segunda): el grupo queda centrado contra el teléfono.
  const grilla = angosta ? '' : 'lg:grid-cols-[minmax(0,360px)_minmax(0,500px)] lg:justify-center lg:gap-x-14';
  const celda = (lg: string) => (angosta ? '' : lg);

  return (
    <div ref={ref} className={`grid gap-6 ${grilla}`}>
      <style>{CSS_ESCENA_INSTALAR}</style>

      {/* ---- las pestañas y la pastilla ---- */}
      <div className={celda('lg:col-start-2 lg:row-start-1 lg:self-end')}>
        <Pestanias
          etiqueta={x.sistemas}
          columnas={2}
          valor={sistema}
          onCambio={cambiarSistema}
          // Dos mitades en el celular; en una columna ancha (/instalar, escritorio) no más de 320 px.
          className="sm:max-w-[320px]"
          opciones={[
            { clave: 'iphone', texto: x.iphone },
            { clave: 'android', texto: x.android },
          ]}
        />
        {/* La regla de Apple, solo en iPhone; en Android el renglón queda vacío con su alto. */}
        <div className="mt-3 min-h-[32px]">
          <span
            className={`inline-flex min-h-[32px] items-center rounded-full bg-ambar-claro px-3 text-[12px] font-semibold text-ambar ${
              sistema === 'iphone' ? '' : 'invisible'}`}
          >
            {x.avisoIphone}
          </span>
        </div>
      </div>

      {/* ---- el teléfono ---- */}
      <div className={celda('lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:self-center')}>
        <FiguraCelular leyenda={v.datosDeEjemplo}>
          <div className={`relative ${anima ? 'motion-safe:animate-[aparecer_.45s_cubic-bezier(.2,.7,.2,1)_both]' : ''}`}>
            <MarcoTelefono sistema={sistema} resumen={x.resumen[sistema][paso - 1]}>
              <div key={`${sistema}-${paso}-${pasada}`} className="absolute inset-0">
                <PantallaPaso
                  c={{ sistema, paso, anima, desdeAnterior }}
                  d={{
                    x, v,
                    titular: t.portada.titular,
                    titularResaltado: t.portada.titularResaltado,
                    titularCierre: t.portada.titularCierre,
                  }}
                />
              </div>
            </MarcoTelefono>
            {/* El teléfono entero avanza: solo para el dedo o el puntero, no entra en el tabulador. */}
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={siguiente}
              className="absolute inset-0 mx-auto w-full max-w-[248px] cursor-pointer rounded-[2.4rem]"
            />
          </div>
        </FiguraCelular>
      </div>

      {/* ---- el paso, los botones y los puntos ---- */}
      <div className={celda('lg:col-start-2 lg:row-start-2 lg:self-start')}>
        <p className="titulo-seccion">{x.pasoDe(paso, TOTAL_PASOS)}</p>
        {/* Caja con el alto del paso más largo: cambiar de paso no mueve nada. */}
        <div
          key={`texto-${sistema}-${paso}`}
          className={`mt-2 flex items-start gap-3.5 ${anima ? 'motion-safe:animate-[aparecer_.3s_ease-out_both]' : ''}`}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-verde-claro text-verde-fuerte">
            {ICONOS_PASO[sistema][paso - 1]}
          </span>
          <p id={idTexto} className="min-h-[122px] pt-1.5 text-[15px] leading-relaxed text-tinta/70 lg:min-h-[112px] lg:text-[17px]">
            <Rico texto={textoPaso} negrita="text-tinta" />
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={anterior}
            disabled={paso === 1}
            className="boton-suave min-h-[48px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {x.anterior}
          </button>
          <span className="relative">
            {/* El halo late tres veces al verse la guía, y queda quieto. */}
            {anima && <span aria-hidden className="portada-pulso absolute -inset-1 rounded-full bg-verde/25" />}
            <button
              type="button"
              onClick={siguiente}
              aria-describedby={idTexto}
              className="boton-principal relative min-h-[48px] w-full"
            >
              {ultimo ? x.empezarDeNuevo : x.siguiente}
            </button>
          </span>
        </div>

        <nav aria-label={x.pasos} className="mt-2 flex justify-center gap-1">
          {PASOS.map((n) => (
            <button
              key={n}
              type="button"
              aria-label={x.irAlPaso(n)}
              aria-current={n === paso ? 'step' : undefined}
              onClick={() => { if (n !== paso) irA(n, n === paso + 1); }}
              className="grid h-11 w-11 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-fuerte"
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold transition ${
                  n === paso ? 'bg-verde text-sobre-verde' : 'bg-borde text-tinta/60'}`}
              >
                {n}
              </span>
            </button>
          ))}
        </nav>

        <Anuncio texto={anuncio} />
      </div>
    </div>
  );
}
