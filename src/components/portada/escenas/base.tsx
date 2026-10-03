'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Marca } from '@/components/Marca';

/**
 * LAS PIEZAS COMPARTIDAS DE LAS ESCENAS DE LA PORTADA (02/10/2026).
 *
 * Lo que sigue a la vitrina son cuatro escenas (cargar, la noche, recomendar
 * e instalar), cada una un componente de cliente en esta misma carpeta. Todo
 * lo que tienen en común vive acá y en ningún otro lado: los dos ganchos
 * (cuándo se ve la escena, y el reloj de sus cuadros), el molde de la
 * sección, el contenedor del celular, el único botón que habla de la
 * animación, las pestañas, el importe que sube, el «dedo», y los dibujos
 * (avatar, globo, billete, boleta, teclado, el logo que escucha y el
 * teléfono chico de instalar). Las clases `portada-*` que mueven las cosas
 * están al final de app/globals.css.
 *
 * LA REGLA DE LOS ESTADOS, PARA TODO
 *
 * El HTML del servidor es un cuadro COMPLETO y quieto: el «cuadro inicial» de
 * cada escena. Con JavaScript y sin «reducir movimiento», cuando la escena
 * entra en pantalla por primera vez se reproduce UNA entrada corta y queda
 * esperando al dedo. Con «reducir movimiento» no hay entrada, ni dedo, ni
 * números que suben: los botones cambian de cuadro en seco. Solo se animan
 * `transform` y `opacity`, y lo que cambia de cuadro vive en cajas de alto
 * fijo: la página no salta.
 *
 * Nada de acá dibuja un gráfico: Orden no tiene anillos ni tortas, y el
 * anillo del logo que escucha es el logo, no un medidor.
 */

export type EstadoEscena = 'final' | 'corriendo' | 'pausada' | 'esperando' | 'terminada';

/** Los tres rótulos del botón de la animación (cada módulo de textos los trae). */
export type TextosControlEscena = { pausar: string; seguir: string; verDeNuevo: string };

/** Si quien mira pidió «reducir movimiento». En el servidor no hay ventana: no. */
function prefiereQuieto(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** `useLayoutEffect` en el navegador y `useEffect` en el servidor, donde el primero avisa que no hace nada. */
const useEfectoAntesDePintar = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// ---------------------------------------------------------------------------
// GANCHOS
// ---------------------------------------------------------------------------

/**
 * Marca cuándo la escena entra en pantalla, UNA vez, y si hay «reducir
 * movimiento».
 *
 * `visto` pasa a true la primera vez que al menos `umbral` del elemento está
 * a la vista y no vuelve a false nunca. Si al montar el elemento ya está a la
 * vista (la página se hidrató con la escena en pantalla, o se recargó
 * desplazada hasta ahí), se marca de inmediato sin esperar al observador.
 * Con «reducir movimiento» no se observa: `visto` queda en false y la escena
 * se queda en su cuadro inicial, que está completo.
 *
 * Es el único `IntersectionObserver` de todo `src`: animar al montar algo
 * que está abajo del pliegue es animar para nadie.
 */
export function useAlVerse<T extends HTMLElement = HTMLElement>(umbral = 0.35): {
  ref: React.RefObject<T>;
  visto: boolean;
  reducido: boolean;
} {
  const ref = useRef<T>(null);
  const [visto, setVisto] = useState(false);
  const [reducido, setReducido] = useState(false);

  useEffect(() => {
    const medio = window.matchMedia('(prefers-reduced-motion: reduce)');
    const leer = () => setReducido(medio.matches);
    leer();
    // Safari viejo solo tiene `addListener`.
    if (typeof medio.addEventListener === 'function') {
      medio.addEventListener('change', leer);
      return () => medio.removeEventListener('change', leer);
    }
    medio.addListener(leer);
    return () => medio.removeListener(leer);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefiereQuieto()) return;
    // Ya está a la vista al montar: se marca sin esperar al observador. «A la
    // vista» con la misma vara que el observador (al menos `umbral` de lo que
    // entra en la ventana), no con un borde que apenas asoma: si no, la
    // escena que arranca justo debajo del pliegue correría sin que nadie
    // la vea.
    const caja = el.getBoundingClientRect();
    const alto = window.innerHeight;
    const visible = Math.min(caja.bottom, alto) - Math.max(caja.top, 0);
    if (visible / Math.max(1, Math.min(caja.height, alto)) >= umbral) {
      setVisto(true);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setVisto(true);
      return;
    }
    const observador = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      setVisto(true);
      observador.disconnect();
    }, { threshold: umbral, rootMargin: '0px 0px -10% 0px' });
    observador.observe(el);
    return () => observador.disconnect();
  }, [umbral]);

  return { ref, visto, reducido };
}

type Paso = { cuadro: number; estado: EstadoEscena; pasada: number };

/** Lo que el reloj necesita recordar entre renders sin provocar ninguno. */
type Reloj = {
  duraciones: (number | null)[];
  inicial: number;
  reducido: boolean | undefined;
  temporizador: ReturnType<typeof setTimeout> | null;
  /** Cuánto dura el cuadro programado y desde cuándo corre: para pausar y seguir donde quedó. */
  restante: number;
  desde: number;
  /** La pestaña se escondió con el reloj andando: al volver, sigue. */
  escondido: boolean;
  arranco: boolean;
  cuadro: number;
  estado: EstadoEscena;
};

/**
 * Una secuencia de cuadros con reloj. `duraciones[i]` es cuántos ms dura el
 * cuadro i antes de pasar al i+1; `null` es «se queda esperando al dedo»
 * (estado 'esperando'); el último cuadro deja el estado 'terminada'.
 *
 * En el primer render (servidor y cliente iguales, sin error de hidratación)
 * `cuadro` es `inicial` y el estado 'final'. La primera vez que `arranca`
 * pasa a true —normalmente `visto && !reducido`— va al cuadro 0 y corre.
 * Con la pestaña escondida el reloj se pausa y sigue al volver. Con «reducir
 * movimiento» (`reducido`, o el medio del sistema si no se pasa), `irA`,
 * `repetir` y `saltar` cambian el cuadro sin reloj, y `repetir` vuelve al
 * cuadro `inicial`.
 *
 * Cada cambio de cuadro se pinta con `key={`${pasada}-${cuadro}`}` en el
 * bloque que cambia: React lo vuelve a montar y los `Entra` y las clases
 * `portada-*` corren de nuevo. Es el truco de la vitrina: sin estado de
 * animación. `pasada` sube con cada `repetir`, para que volver al cuadro 0
 * también remonte.
 */
export function useSecuencia(duraciones: (number | null)[], opciones: {
  arranca: boolean;
  inicial: number;
  reducido?: boolean;
}): {
  cuadro: number;
  estado: EstadoEscena;
  pasada: number;
  pausar(): void;
  seguir(): void;
  repetir(): void;
  irA(n: number): void;
  saltar(): void;
} {
  const [paso, setPaso] = useState<Paso>(() => ({ cuadro: opciones.inicial, estado: 'final', pasada: 0 }));
  const relojRef = useRef<Reloj | null>(null);
  if (relojRef.current === null) {
    relojRef.current = {
      duraciones, inicial: opciones.inicial, reducido: opciones.reducido, temporizador: null,
      restante: 0, desde: 0, escondido: false, arranco: false, cuadro: opciones.inicial, estado: 'final',
    };
  }
  const r = relojRef.current;
  r.duraciones = duraciones;
  r.inicial = opciones.inicial;
  r.reducido = opciones.reducido;

  const quieto = useCallback(() => r.reducido ?? prefiereQuieto(), [r]);

  const parar = useCallback(() => {
    if (r.temporizador === null) return;
    clearTimeout(r.temporizador);
    r.temporizador = null;
  }, [r]);

  /** Deja el cuadro n a la vista y, si tiene reloj, programa el paso al siguiente. */
  const correr = useCallback(function correr(n: number, ms?: number) {
    parar();
    const d = r.duraciones;
    const ultimo = d.length - 1;
    if (ultimo < 0) return;
    const cuadro = Math.max(0, Math.min(n, ultimo));
    const estado: EstadoEscena = cuadro >= ultimo ? 'terminada' : d[cuadro] === null ? 'esperando' : 'corriendo';
    r.cuadro = cuadro;
    r.estado = estado;
    r.escondido = false;
    setPaso((p) => ({ ...p, cuadro, estado }));
    if (estado !== 'corriendo') return;
    r.restante = ms ?? (d[cuadro] as number);
    r.desde = performance.now();
    r.temporizador = setTimeout(() => {
      r.temporizador = null;
      correr(cuadro + 1);
    }, r.restante);
  }, [parar, r]);

  const irA = useCallback((n: number) => {
    parar();
    const d = r.duraciones;
    const ultimo = d.length - 1;
    if (ultimo < 0) return;
    const cuadro = Math.max(0, Math.min(Math.round(n), ultimo));
    // El que toca, manda: el cuadro queda quieto ('pausada') salvo que sea uno
    // que espera al dedo o el último, que no tienen a dónde seguir.
    const estado: EstadoEscena = cuadro >= ultimo ? 'terminada' : d[cuadro] === null ? 'esperando' : 'pausada';
    r.restante = typeof d[cuadro] === 'number' ? (d[cuadro] as number) : 0;
    r.cuadro = cuadro;
    r.estado = estado;
    r.escondido = false;
    setPaso((p) => ({ ...p, cuadro, estado }));
  }, [parar, r]);

  const pausar = useCallback(() => {
    if (r.estado !== 'corriendo') return;
    if (r.temporizador !== null) {
      r.restante = Math.max(0, r.restante - (performance.now() - r.desde));
      parar();
    }
    r.escondido = false;
    r.estado = 'pausada';
    setPaso((p) => ({ ...p, estado: 'pausada' }));
  }, [parar, r]);

  const seguir = useCallback(() => {
    if (quieto()) {
      if (r.estado === 'esperando') irA(r.cuadro + 1);
      return;
    }
    if (r.estado === 'pausada') correr(r.cuadro, r.restante);
    else if (r.estado === 'esperando') correr(r.cuadro + 1);
  }, [correr, irA, quieto, r]);

  const repetir = useCallback(() => {
    parar();
    if (quieto()) {
      r.cuadro = r.inicial;
      r.estado = 'final';
      setPaso((p) => ({ cuadro: r.inicial, estado: 'final', pasada: p.pasada + 1 }));
      return;
    }
    setPaso((p) => ({ ...p, pasada: p.pasada + 1 }));
    correr(0);
  }, [correr, parar, quieto, r]);

  const saltar = useCallback(() => {
    parar();
    const ultimo = r.duraciones.length - 1;
    if (ultimo < 0) return;
    r.cuadro = ultimo;
    r.estado = 'terminada';
    setPaso((p) => ({ ...p, cuadro: ultimo, estado: 'terminada' }));
  }, [parar, r]);

  // La primera vez que `arranca` pasa a true, corre desde el cuadro 0.
  useEffect(() => {
    if (!opciones.arranca || r.arranco) return;
    r.arranco = true;
    if (quieto()) return;
    correr(0);
  }, [opciones.arranca, correr, quieto, r]);

  // Con la pestaña escondida el reloj se para; al volver sigue donde quedó.
  useEffect(() => {
    const alCambiar = () => {
      if (document.visibilityState === 'hidden') {
        if (r.temporizador === null) return;
        r.restante = Math.max(0, r.restante - (performance.now() - r.desde));
        parar();
        r.escondido = true;
      } else if (r.escondido) {
        r.escondido = false;
        if (r.estado === 'corriendo') correr(r.cuadro, r.restante);
      }
    };
    document.addEventListener('visibilitychange', alCambiar);
    return () => {
      document.removeEventListener('visibilitychange', alCambiar);
      parar();
    };
  }, [correr, parar, r]);

  return { cuadro: paso.cuadro, estado: paso.estado, pasada: paso.pasada, pausar, seguir, repetir, irA, saltar };
}

// ---------------------------------------------------------------------------
// EL MOLDE DE LA SECCIÓN
// ---------------------------------------------------------------------------

/**
 * La sección de una escena: etiqueta, título, apoyo y lo que va debajo en la
 * columna de texto; la figura con su fila de controles en la otra. A 375 px
 * es una sola columna en este orden: etiqueta, título, apoyo, `cabecera`,
 * `figura`, `controles`, `aparte`. Desde `lg` la figura va al lado que diga
 * `lado`; con `centrado`, el texto va centrado arriba y lo demás a todo el
 * ancho.
 *
 * `noche` es la franja oscura, con los dos resplandores de la primera
 * pantalla (espejados) y su cuadrícula tenue. `hoja` la hace subir sobre la
 * franja anterior, como la vitrina sube sobre la primera pantalla.
 */
export function SeccionEscena({
  id, fondo, hoja = false, lado, etiqueta, titulo, tituloId, apoyo, cabecera, figura, controles, aparte, refSeccion,
}: {
  id?: string;
  fondo: 'clara' | 'arena' | 'noche';
  hoja?: boolean;
  lado: 'figura-derecha' | 'figura-izquierda' | 'centrado';
  etiqueta: string;
  titulo: React.ReactNode;
  tituloId: string;
  /** UNA línea. */
  apoyo: string;
  cabecera?: React.ReactNode;
  figura: React.ReactNode;
  /** Fila de 48 px de alto fijo debajo de la figura (botón de acción + ControlEscena). */
  controles?: React.ReactNode;
  /** A todo el ancho, al final (details, letra chica, enlaces). */
  aparte?: React.ReactNode;
  /** El `ref` de useAlVerse. */
  refSeccion?: React.Ref<HTMLElement>;
}): JSX.Element {
  const noche = fondo === 'noche';
  const fondoClase = noche ? 'bg-noche text-white' : fondo === 'arena' ? 'bg-arena text-tinta' : 'bg-superficie text-tinta';
  const aire = noche ? 'py-20 lg:py-28' : 'py-16 lg:py-24';
  const claseHoja = hoja ? '-mt-8 rounded-t-[2rem] border-t border-borde/60 shadow-[0_-24px_60px_-34px_rgba(72,220,130,.55)]' : '';

  const texto = (
    <>
      <p className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold ${
        noche ? 'border-white/15 text-white/60' : 'border-borde text-tinta/60'}`}>
        {etiqueta}
      </p>
      <h2
        id={tituloId}
        className={`mt-4 font-titulo text-[28px] font-extrabold leading-[1.08] tracking-tight sm:text-[34px] lg:text-[40px] ${
          noche ? 'text-white' : 'text-tinta'}`}
      >
        {titulo}
      </h2>
      <p className={`mt-4 text-[15.5px] leading-relaxed ${noche ? 'text-white/65' : 'text-tinta/60'}`}>{apoyo}</p>
    </>
  );

  const filaControles = controles ? (
    <div className="mt-4 flex min-h-[48px] items-center justify-center gap-3">{controles}</div>
  ) : null;

  return (
    <section
      id={id}
      ref={refSeccion}
      aria-labelledby={tituloId}
      className={`relative scroll-mt-4 ${noche ? 'overflow-hidden' : ''} ${fondoClase} ${claseHoja} ${aire}`}
    >
      {noche && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="absolute -right-24 -top-40 h-[34rem] w-[34rem] rounded-full opacity-70 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(40,180,100,.55) 0%, rgba(40,180,100,0) 70%)' }}
          />
          <div
            className="absolute -left-32 top-24 h-[30rem] w-[30rem] rounded-full opacity-50 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(61,220,154,.30) 0%, rgba(61,220,154,0) 70%)' }}
          />
          <div
            className="absolute inset-0 opacity-[0.055]"
            style={{
              backgroundImage:
                'linear-gradient(to right, #fff 1px, transparent 1px),'
                + 'linear-gradient(to bottom, #fff 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, #000 40%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, #000 40%, transparent 100%)',
            }}
          />
        </div>
      )}

      <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
        {lado === 'centrado' ? (
          <>
            <div className="mx-auto max-w-2xl text-center">{texto}</div>
            {cabecera && <div className="mt-8">{cabecera}</div>}
            <div className="mt-8">{figura}</div>
            {filaControles}
          </>
        ) : (
          <div
            className={`grid gap-10 lg:items-center lg:gap-16 ${
              lado === 'figura-derecha'
                ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]'
                : 'lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]'}`}
          >
            <div className={lado === 'figura-izquierda' ? 'lg:order-2' : ''}>
              {texto}
              {cabecera && <div className="mt-6">{cabecera}</div>}
            </div>
            <div className={`min-w-0 ${lado === 'figura-izquierda' ? 'lg:order-1' : ''}`}>
              {figura}
              {filaControles}
            </div>
          </div>
        )}
        {aparte && <div className="mt-10">{aparte}</div>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FIGURA Y CONTROLES
// ---------------------------------------------------------------------------

/**
 * El contenedor del celular (o del panel, o de la tira): recorta el
 * resplandor para que a 375 px no desborde, y pone la leyenda «datos de
 * ejemplo». `pt-12` porque lo que flota por `encima` asoma hasta 40 px por
 * arriba del marco.
 */
export function FiguraCelular({ children, leyenda, sobreNoche = false }: {
  children: React.ReactNode;
  /** `v.datosDeEjemplo` de vitrina.ts. */
  leyenda: string;
  sobreNoche?: boolean;
}): JSX.Element {
  return (
    <figure className="overflow-x-clip px-1 pb-2 pt-12">
      {children}
      <figcaption className={`mt-3 text-center text-[12px] ${sobreNoche ? 'text-white/45' : 'text-tinta/45'}`}>
        {leyenda}
      </figcaption>
    </figure>
  );
}

const TRAZO = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/**
 * El único botón de la escena que habla de la animación. 44 px. Corriendo
 * dice «Pausar», pausada «Seguir», y esperando, terminada o en el cuadro
 * final «Ver de nuevo». Con «reducir movimiento» no hay nada que pausar: la
 * escena le pasa `oculto` y no se dibuja.
 */
export function ControlEscena({ estado, onPausar, onSeguir, onRepetir, textos, sobreNoche = false, oculto = false }: {
  estado: EstadoEscena;
  onPausar(): void;
  onSeguir(): void;
  onRepetir(): void;
  textos: TextosControlEscena;
  sobreNoche?: boolean;
  oculto?: boolean;
}): JSX.Element | null {
  if (oculto) return null;
  const [texto, accion, icono] =
    estado === 'corriendo'
      ? [textos.pausar, onPausar, <path key="p" d="M8.5 5.5v13M15.5 5.5v13" />]
      : estado === 'pausada'
        ? [textos.seguir, onSeguir, <path key="s" d="M8 5.5v13l10-6.5z" fill="currentColor" />]
        : [textos.verDeNuevo, onRepetir, <path key="r" d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4M19.5 4.5v4.5h-4.5" />];
  return (
    <button
      type="button"
      onClick={accion}
      aria-label={texto}
      className={`chip-apagado gap-2 px-3.5 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        sobreNoche
          ? 'border-white/15 bg-white/5 text-white focus-visible:outline-menta'
          : 'focus-visible:outline-verde-fuerte'}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden {...TRAZO}>{icono}</svg>
      {texto}
    </button>
  );
}

/**
 * Anuncio para el lector de pantalla, solo cuando el VISITANTE cambió algo
 * (el avance automático no se anuncia). Vacío al cargar: no se anuncia lo
 * que ya se ve.
 */
export function Anuncio({ texto }: { texto: string }): JSX.Element {
  return <p aria-live="polite" className="sr-only">{texto}</p>;
}

const COLUMNAS: Record<2 | 3 | 4, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };

/**
 * Pestañas de 44 px con teclado (flechas, Inicio, Fin), como los chips de la
 * vitrina: un grupo de radio donde solo la encendida entra en el orden del
 * tabulador. `textoCorto` se muestra por debajo de 400 px (el largo queda en
 * el `aria-label`). Con `columnas` es una grilla; sin ella, una fila que se
 * acomoda en renglones.
 */
export function Pestanias<K extends string>({
  etiqueta, opciones, valor, onCambio, sobreNoche = false, columnas, className = '',
}: {
  /** aria-label del grupo. */
  etiqueta: string;
  opciones: { clave: K; texto: string; textoCorto?: string; icono?: React.ReactNode }[];
  valor: K;
  onCambio(clave: K): void;
  sobreNoche?: boolean;
  columnas?: 2 | 3 | 4;
  className?: string;
}): JSX.Element {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  const conTecla = (desde: number, tecla: string): number | null => {
    const n = opciones.length;
    switch (tecla) {
      case 'ArrowRight':
      case 'ArrowDown':
        return (desde + 1) % n;
      case 'ArrowLeft':
      case 'ArrowUp':
        return (desde - 1 + n) % n;
      case 'Home':
        return 0;
      case 'End':
        return n - 1;
      default:
        return null;
    }
  };

  const forma = columnas ? `grid gap-2 ${COLUMNAS[columnas]}` : 'flex flex-wrap gap-2';

  return (
    <div role="radiogroup" aria-label={etiqueta} className={`${forma} ${className}`}>
      {opciones.map((o, i) => {
        const encendido = o.clave === valor;
        const clase = sobreNoche
          ? encendido ? 'chip border-menta bg-menta text-noche' : 'chip border-white/15 bg-white/5 text-white/70'
          : encendido ? 'chip-encendido shadow-[0_8px_20px_-10px_rgba(40,180,100,.8)]' : 'chip-apagado';
        return (
          <button
            key={o.clave}
            ref={(el) => { botones.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={encendido}
            aria-label={o.textoCorto ? o.texto : undefined}
            tabIndex={encendido ? 0 : -1}
            onClick={() => { if (!encendido) onCambio(o.clave); }}
            onKeyDown={(e) => {
              const a = conTecla(i, e.key);
              if (a === null) return;
              e.preventDefault();
              if (a !== i) onCambio(opciones[a].clave);
              botones.current[a]?.focus();
            }}
            className={`${clase} gap-2 px-3.5 text-[13.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              sobreNoche ? 'focus-visible:outline-menta' : 'focus-visible:outline-verde-fuerte'}`}
          >
            {o.icono && <span aria-hidden className="shrink-0">{o.icono}</span>}
            {o.textoCorto ? (
              <>
                <span className="min-[400px]:hidden">{o.textoCorto}</span>
                <span className="hidden min-[400px]:inline">{o.texto}</span>
              </>
            ) : o.texto}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MOVIMIENTO
// ---------------------------------------------------------------------------

/**
 * Un importe que sube. El servidor pinta el valor final; cuando `activo`
 * pasa a true cuenta de `desde` a `hasta` (una vez por cambio de `hasta`:
 * rodar de un valor a otro es cambiar `desde` y `hasta`). Con «reducir
 * movimiento» nunca arranca.
 *
 * Escribe `textContent` con `requestAnimationFrame` y salida cúbica, como
 * LogoVoz: sin un render de React por cuadro. Alineado a la derecha y con el
 * ancho del valor final reservado: crece hacia la izquierda y no mueve nada.
 * El valor final va además en un `sr-only`: lo que se oye es el número
 * entero, no una cuenta regresiva.
 */
export function Contador({ hasta, desde = 0, ms = 900, retraso = 0, activo, formato, className = '' }: {
  hasta: number;
  desde?: number;
  ms?: number;
  retraso?: number;
  activo: boolean;
  /** P. ej. `(n) => precio(n, 'PYG', locale)` o `(n) => dinero(n, 'PYG', true, locale)`. */
  formato: (n: number) => string;
  className?: string;
}): JSX.Element {
  const visible = useRef<HTMLSpanElement>(null);
  const formatoRef = useRef(formato);
  formatoRef.current = formato;
  const final = formato(hasta);

  useEfectoAntesDePintar(() => {
    const el = visible.current;
    if (!el) return;
    const f = formatoRef.current;
    if (!activo || prefiereQuieto()) {
      el.textContent = f(hasta);
      return;
    }
    el.textContent = f(desde);
    let cuadro = 0;
    let inicio = 0;
    const paso = (ahora: number) => {
      if (!inicio) inicio = ahora;
      const t = Math.min(1, (ahora - inicio) / Math.max(1, ms));
      const suave = 1 - Math.pow(1 - t, 3);
      el.textContent = f(Math.round(desde + (hasta - desde) * suave));
      if (t < 1) cuadro = requestAnimationFrame(paso);
      else el.textContent = f(hasta);
    };
    const espera = setTimeout(() => { cuadro = requestAnimationFrame(paso); }, retraso);
    return () => {
      clearTimeout(espera);
      cancelAnimationFrame(cuadro);
    };
  }, [activo, hasta, desde, ms, retraso]);

  return (
    <span className={`inline-block text-right tabular-nums ${className}`} style={{ minWidth: `${final.length}ch` }}>
      <span aria-hidden ref={visible}>{final}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

/**
 * El «dedo»: un círculo que late una vez sobre el botón que se toca.
 * Decorativo. `x` e `y` son el CENTRO del toque, en % o px relativos al
 * padre (que tiene que ser `relative`). Se vuelve a disparar cambiando su
 * `key`. Con «reducir movimiento» no se ve (la clase queda sin animación y
 * su estado natural es invisible).
 */
export function Toque({ x, y, retraso = 0, tamano = 28 }: {
  x: string;
  y: string;
  retraso?: number;
  tamano?: number;
}): JSX.Element {
  return (
    <span
      aria-hidden
      className="portada-toque pointer-events-none absolute rounded-full bg-verde/35 ring-2 ring-verde/50"
      style={{
        left: x, top: y, width: tamano, height: tamano,
        marginLeft: -tamano / 2, marginTop: -tamano / 2,
        animationDelay: `${retraso}ms`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// DIBUJOS (todos decorativos: SVG y CSS, sin fotos ni logos ajenos)
// ---------------------------------------------------------------------------

/** Un círculo con una inicial, y el nombre al lado si se pasa. */
export function Avatar({ inicial, nombre, tono = 'claro' }: {
  inicial: string;
  nombre?: string;
  tono?: 'claro' | 'menta';
}): JSX.Element {
  return (
    <span aria-hidden className="inline-flex items-center gap-2">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
          tono === 'menta' ? 'bg-menta text-noche' : 'bg-verde-claro text-verde-fuerte'}`}
      >
        {inicial}
      </span>
      {nombre && <span className="text-[12px] font-semibold">{nombre}</span>}
    </span>
  );
}

/**
 * Un globo de chat. `claro` es una tarjeta, `noche` es oscuro con letras
 * blancas, `whatsapp` es verde claro con el ícono de WhatsApp adelante. La
 * colita es un cuadrado girado del mismo color, del lado que diga `cola`.
 */
export function Globo({ children, cola, tono = 'claro', className = '' }: {
  children: React.ReactNode;
  cola: 'abajo' | 'izquierda' | 'derecha';
  tono?: 'claro' | 'noche' | 'whatsapp';
  className?: string;
}): JSX.Element {
  const cuerpo = tono === 'noche'
    ? 'bg-noche text-white'
    : tono === 'whatsapp'
      ? 'bg-verde-claro text-tinta'
      : 'tarjeta rounded-2xl';
  const colorCola = tono === 'noche' ? 'bg-noche' : tono === 'whatsapp' ? 'bg-verde-claro' : 'bg-superficie border-borde/70';
  const ladoCola = cola === 'abajo'
    ? `-bottom-1.5 left-5 ${tono === 'claro' ? 'border-b border-r' : ''}`
    : cola === 'izquierda'
      ? `-left-1.5 top-4 ${tono === 'claro' ? 'border-b border-l' : ''}`
      : `-right-1.5 top-4 ${tono === 'claro' ? 'border-r border-t' : ''}`;
  return (
    <span aria-hidden className={`relative block max-w-[250px] rounded-2xl p-3 text-[13px] leading-snug ${cuerpo} ${className}`}>
      {tono === 'whatsapp' && <IconoWhatsApp className="mr-1.5 inline-block h-3.5 w-3.5 align-[-2px] text-verde-fuerte" />}
      {children}
      <span className={`absolute h-3 w-3 rotate-45 rounded-[2px] ${colorCola} ${ladoCola}`} />
    </span>
  );
}

/** La cara del billete entera (96 × 48): un círculo al medio y el importe encima. */
function CaraBillete({ importe }: { importe: string }) {
  return (
    <span className="absolute inset-y-0 grid w-24 place-items-center">
      <span className="col-start-1 row-start-1 h-7 w-7 rounded-full bg-verde/15" />
      <span className="col-start-1 row-start-1 text-[11px] font-bold tabular-nums text-verde-fuerte">{importe}</span>
    </span>
  );
}

/**
 * Un billete que no imita a ninguno: un rectángulo verde claro con un
 * círculo al medio y el importe. `partido` lo corta en dos mitades por una
 * línea punteada; cada mitad es su propio nodo (clases `billete-mitad
 * billete-izquierda` / `billete-derecha`) y recibe su clase y su estilo por
 * `mitades`, para que una viaje y la otra se quede.
 */
export function Billete({ importe, partido = false, mitades }: {
  importe: string;
  partido?: boolean;
  mitades?: {
    izquierda?: { className?: string; style?: React.CSSProperties };
    derecha?: { className?: string; style?: React.CSSProperties };
  };
}): JSX.Element {
  if (!partido) {
    return (
      <span aria-hidden className="relative inline-block h-12 w-24 overflow-hidden rounded-lg border border-verde/40 bg-verde-claro">
        <CaraBillete importe={importe} />
      </span>
    );
  }
  return (
    <span aria-hidden className="relative inline-flex h-12 w-24">
      <span
        className={`billete-mitad billete-izquierda relative h-12 w-12 overflow-hidden rounded-l-lg border border-r-0 border-verde/40 bg-verde-claro ${
          mitades?.izquierda?.className ?? ''}`}
        style={mitades?.izquierda?.style}
      >
        <span className="absolute inset-y-0 left-0 w-24"><CaraBillete importe={importe} /></span>
        <span className="absolute inset-y-1 right-0 border-r border-dashed border-verde/60" />
      </span>
      <span
        className={`billete-mitad billete-derecha relative h-12 w-12 overflow-hidden rounded-r-lg border border-l-0 border-verde/40 bg-verde-claro ${
          mitades?.derecha?.className ?? ''}`}
        style={mitades?.derecha?.style}
      >
        <span className="absolute inset-y-0 right-0 w-24"><CaraBillete importe={importe} /></span>
        <span className="absolute inset-y-1 left-0 border-l border-dashed border-verde/60" />
      </span>
    </span>
  );
}

/** El borde de abajo de la boleta, en zigzag: diez dientes de 7 px. */
const ZIGZAG = (() => {
  const dientes = 10;
  const puntos = ['0 0', '100% 0'];
  for (let i = dientes; i >= 0; i--) {
    puntos.push(`${(i / dientes) * 100}% ${i % 2 === 0 ? '100%' : 'calc(100% - 7px)'}`);
  }
  return `polygon(${puntos.join(', ')})`;
})();

/**
 * Un ticket de papel, 120 × 150: cinco renglones grises de relleno y UN
 * renglón legible, «TOTAL» y el importe. Sin nombre de comercio. Es blanco
 * translúcido a propósito: SOLO se usa sobre el visor oscuro de la cámara.
 */
export function Boleta({ total, rotulo = 'TOTAL', className = '' }: {
  total: string;
  /** La palabra del renglón legible; es la misma en los dos idiomas. */
  rotulo?: string;
  className?: string;
}): JSX.Element {
  const anchos = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5'];
  return (
    <span
      aria-hidden
      className={`block h-[150px] w-[120px] bg-white/90 px-2.5 pt-4 text-noche ${className}`}
      style={{ clipPath: ZIGZAG }}
    >
      <span className="block space-y-2.5">
        {anchos.map((w) => <span key={w} className={`block h-1.5 rounded-full bg-noche/15 ${w}`} />)}
      </span>
      {/* 10,5 px y sin cortar: «TOTAL» más «Gs. 1.500.000» tienen que entrar en los 100 px de adentro. */}
      <span className="mt-4 block border-t border-dashed border-noche/25 pt-2">
        <span className="flex items-baseline justify-between gap-1 whitespace-nowrap text-[10.5px] font-bold tabular-nums">
          <span>{rotulo}</span>
          <span>{total}</span>
        </span>
      </span>
    </span>
  );
}

/** El trazo relleno de WhatsApp, el mismo de pantallas/Servicios.tsx. */
export function IconoWhatsApp({ className = 'h-4 w-4' }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Zm0 17.2a7.7 7.7 0 0 1-4-1.1l-.3-.2-2.8.8.8-2.7-.2-.3A7.7 7.7 0 1 1 12 19.7Zm4.2-5.8c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.7.9-.3.2-.5.1a6.3 6.3 0 0 1-3.1-2.7c-.2-.4.2-.4.7-1.3a.4.4 0 0 0 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.8 2 4.6 4.6 0 0 0 1 2.5 10.6 10.6 0 0 0 4.1 3.6c1.5.7 2.1.7 2.9.6a2.4 2.4 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c0-.2-.2-.2-.4-.3Z" />
    </svg>
  );
}

/** Tres filas de teclas grises sin letras, para «Escribiendo». */
export function Teclado(): JSX.Element {
  const filas = [10, 9, 7];
  return (
    <span aria-hidden className="block rounded-xl bg-tinta/[.06] p-1.5">
      {filas.map((n, f) => (
        <span key={f} className="mb-1 flex justify-center gap-1 last:mb-0">
          {f === 2 && <span className="h-7 w-[12%] rounded-[4px] bg-borde" />}
          {Array.from({ length: n }, (_, i) => <span key={i} className="h-7 w-[8.5%] rounded-[4px] bg-borde" />)}
          {f === 2 && <span className="h-7 w-[12%] rounded-[4px] bg-borde" />}
        </span>
      ))}
    </span>
  );
}

/**
 * El LOGO de Orden escuchando, en CSS: la `Marca` a 72 px, un arco menta
 * que gira (tres vueltas, no infinito) y dos ondas que se abren. Es el logo,
 * NO un medidor: sin número ni porcentaje adentro. Con `pensando` no hay
 * ondas (no está escuchando), solo el arco. No reusa LogoVoz: aquel pide
 * micrófono y corre `requestAnimationFrame` sin parar.
 */
export function LogoEscucha({ pensando = false }: { pensando?: boolean }): JSX.Element {
  return (
    <span aria-hidden className="relative mx-auto grid h-24 w-24 place-items-center">
      {!pensando && (
        <>
          <span className="portada-onda absolute inset-2 rounded-full border border-verde/40" />
          <span className="portada-onda absolute inset-2 rounded-full border border-verde/40" style={{ animationDelay: '.5s' }} />
        </>
      )}
      <span className="portada-gira absolute inset-1.5 rounded-full border-2 border-transparent border-t-menta" />
      <Marca clase="relative h-[72px] w-[72px]" />
    </span>
  );
}

/**
 * El teléfono de «Instalar»: más chico que `Celular` y con dos siluetas,
 * iPhone (isla y rayita) o Android (punto de cámara y barrita de gestos).
 * `role="img"` con el `resumen` del paso: todo lo de adentro es decorado
 * para el lector de pantalla, y ningún control que se toque va adentro.
 * La pantalla es de alto fijo: cambiar de paso no mueve la página. El
 * padre lo pone dentro de `FiguraCelular`, que recorta el resplandor.
 */
export function MarcoTelefono({ sistema, resumen, children }: {
  sistema: 'iphone' | 'android';
  resumen: string;
  children: React.ReactNode;
}): JSX.Element {
  const iphone = sistema === 'iphone';
  return (
    <div className="relative mx-auto w-full max-w-[248px]">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -inset-y-8"
        style={{ background: 'radial-gradient(closest-side, rgb(var(--verde) / .26), rgb(var(--verde) / 0))' }}
      />
      <div
        role="img"
        aria-label={resumen}
        className={`relative border border-tinta/15 bg-noche-hondo p-[7px] shadow-[0_28px_50px_-26px_rgba(10,23,18,.55)] ${
          iphone ? 'rounded-[2.4rem]' : 'rounded-[1.8rem]'}`}
      >
        <div className={`relative h-[440px] overflow-hidden bg-arena text-tinta ${iphone ? 'rounded-[2rem]' : 'rounded-[1.4rem]'}`}>
          {children}
          {iphone ? (
            <>
              <span aria-hidden className="absolute left-1/2 top-[7px] z-10 h-[20px] w-[70px] -translate-x-1/2 rounded-full bg-noche-hondo" />
              <span aria-hidden className="absolute bottom-1 left-1/2 z-10 h-[4px] w-20 -translate-x-1/2 rounded-full bg-tinta/70" />
            </>
          ) : (
            <>
              <span aria-hidden className="absolute left-1/2 top-2 z-10 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-noche-hondo" />
              <span aria-hidden className="absolute bottom-1 left-1/2 z-10 h-[3px] w-16 -translate-x-1/2 rounded-full bg-tinta/40" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
