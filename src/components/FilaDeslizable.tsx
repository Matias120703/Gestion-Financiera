'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTextos } from '@/i18n/cliente';

/**
 * UNA FILA QUE SE DESLIZA DE COSTADO, Y QUE SE PUEDE USAR CON MOUSE (01/10).
 *
 * Matías: «desde la computadora quiero ver los días de la rutina; en el
 * celular deslizo con el dedo, pero con la computadora no puedo: no veo que
 * hay viernes, sábado, domingo».
 *
 * Era verdad en casi todas las filas de costado de la app. Usaban
 * `.scroll-limpio`, que esconde la barra: con el dedo da igual, pero con un
 * mouse común no había barra para arrastrar, la ruedita bajaba la página en
 * vez de mover la fila y no había flechas. Solo andaba Shift + ruedita, que
 * nadie conoce. Lo de la derecha no se alcanzaba.
 *
 * EN EL CELULAR, IGUAL QUE ANTES: se desliza con el dedo, sin barra, con la
 * misma sangría y el mismo encaje. Todo lo de abajo es «con mouse», y eso se
 * decide con `@media (hover: hover) and (pointer: fine)` (la variante
 * `mouse:` de tailwind.config.ts), no con el ancho: un celular acostado sigue
 * deslizando con el dedo y una computadora con la ventana angosta igual tiene
 * de dónde agarrar.
 *
 * DOS FORMAS, SEGÚN LO QUE MUESTRA LA FILA (`enCompu`):
 *
 *   · 'envolver': con mouse la fila se acomoda en varias líneas y se ve todo
 *     de una vez. Es lo que va cuando hay que ver todas las opciones para
 *     elegir: los días de la rutina, los filtros, el rango de fechas.
 *   · 'flechas': la fila sigue en una línea y aparecen dos flechas, solo del
 *     lado donde hay más, con un degradé en ese borde. Es para lo que tiene
 *     que quedar en una línea por diseño: el carrusel de cuentas, la tira fija
 *     de días del alumno, la barra de cobro con su alto calculado, las fechas
 *     de la reserva.
 *
 * Y EN LAS DOS:
 *
 *   · La ruedita mueve la fila de costado mientras haya para dónde, y al
 *     llegar a la punta la suelta: la página sigue bajando y nunca queda
 *     enganchada. Un trackpad que ya manda el movimiento de costado no se
 *     toca. Escucha nativa con `{ passive: false }`: el `onWheel` de React es
 *     pasivo y no deja frenar la página.
 *   · El elegido (`aria-selected`, `aria-pressed` o `aria-current`) se trae a
 *     la vista al abrir y cada vez que cambia `activo`, moviendo SOLO la fila.
 *     Nunca `scrollIntoView`: también movía la página entera hasta la fila
 *     apenas se abría el editor de rutinas.
 *   · Con `teclado="pestanas"`, ←/→/Inicio/Fin pasan de una pestaña a la otra
 *     y la eligen, como pide el patrón de pestañas de WAI-ARIA. Cada pestaña
 *     lleva `tabIndex` 0 si está elegida y −1 si no: Tab entra a la elegida y
 *     el siguiente Tab sale de la fila.
 *
 * El degradé es una máscara (`.fila-desliza` en globals.css), no un color
 * pintado: sirve igual sobre la página, una tarjeta, la barra oscura de
 * cobro y la tira fija del alumno, en claro y en oscuro.
 */

type Sangria = 'pagina' | 'hoja' | 'caja' | 'ninguna';

/**
 * La fila sale hasta el borde (de la pantalla, de la hoja o de la caja) y
 * sus botones arrancan alineados con lo demás. El margen negativo va en la
 * caja de afuera y el relleno en la fila: así la caja mide lo mismo que la
 * fila y las flechas quedan en sus bordes, no encima del primer botón.
 */
const SANGRIA: Record<Sangria, { caja: string; fila: string }> = {
  pagina: { caja: '-mx-4 lg:mx-0', fila: 'px-4 lg:px-0' },
  hoja: { caja: '-mx-5', fila: 'px-5' },
  caja: { caja: '-mx-3', fila: 'px-3' },
  ninguna: { caja: '', fila: '' },
};

const ELEGIDO = '[aria-selected="true"], [aria-pressed="true"], [aria-current]:not([aria-current="false"])';

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function sinMovimiento(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function FilaDeslizable({
  children, enCompu, sangria = 'ninguna', className = '', claseCaja = '',
  rol, etiqueta, etiquetadaPor, activo, centrar = false, rueda = true, tono = 'claro', teclado, id: idPropio,
}: {
  children: React.ReactNode;
  /** Con mouse: en varias líneas, o en una línea con flechas. */
  enCompu: 'envolver' | 'flechas';
  sangria?: Sangria;
  /** Lo propio del desplazable: separación, relleno de abajo, encaje (`snap-x`)… */
  className?: string;
  /** Lo de la caja de afuera: los márgenes (`mt-2`). */
  claseCaja?: string;
  rol?: 'tablist' | 'group';
  /** aria-label de la fila. */
  etiqueta?: string;
  /** aria-labelledby de la fila (el id de un título que ya está a la vista). */
  etiquetadaPor?: string;
  /** Cuando cambia, el elegido se trae a la vista. */
  activo?: string | number | null;
  /** Centrar el elegido en vez de solo dejarlo a la vista (la tira del alumno). */
  centrar?: boolean;
  /** Ruedita del mouse de costado. Apagada en una fila alta (la billetera): al bajar la página quedaría enganchada. */
  rueda?: boolean;
  /** 'noche' para la barra oscura de cobro. */
  tono?: 'claro' | 'noche';
  /** ←/→/Inicio/Fin entre los [role="tab"]. */
  teclado?: 'pestanas';
  id?: string;
}) {
  const t = useTextos();
  const idAuto = useId();
  const id = idPropio ?? `fila-${idAuto.replace(/[^\w-]/g, '')}`;
  const fila = useRef<HTMLDivElement>(null);
  const primera = useRef(true);
  const [izq, setIzq] = useState(false);
  const [der, setDer] = useState(false);
  const conFlechas = enCompu === 'flechas';

  // ¿Queda algo escondido a cada lado? Se publica como data-izq / data-der:
  // de eso cuelgan el degradé y las flechas.
  const medir = useCallback(() => {
    const f = fila.current;
    if (!f) return;
    const max = f.scrollWidth - f.clientWidth;
    setIzq(max > 1 && f.scrollLeft > 1);
    setDer(max > 1 && f.scrollLeft < max - 1);
  }, []);

  useEffect(() => {
    const f = fila.current;
    if (!f) return;
    // Medir es leer tres números, y React no vuelve a dibujar si no cambian:
    // no hace falta esperar al cuadro siguiente (el navegador ya manda un
    // `scroll` por cuadro como mucho).
    medir();
    f.addEventListener('scroll', medir, { passive: true });
    // Cambia el ancho (la ventana, la hoja que se abre), cambian los botones
    // (aparece «+ Día», cambia un nombre) o llegan las letras: se vuelve a medir.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(f);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(medir) : null;
    mo?.observe(f, { childList: true, subtree: true, characterData: true });
    let vivo = true;
    document.fonts?.ready.then(() => { if (vivo) medir(); }).catch(() => {});
    return () => {
      vivo = false;
      f.removeEventListener('scroll', medir);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [medir]);

  // La ruedita: de costado mientras se pueda, y en la punta la suelta.
  useEffect(() => {
    const f = fila.current;
    if (!f || !rueda) return;
    const alRodar = (e: WheelEvent) => {
      // Shift + rueda ya lo hace el navegador; Ctrl + rueda es el zoom; un
      // trackpad que manda movimiento de costado se maneja solo.
      if (e.ctrlKey || e.shiftKey || e.deltaX !== 0) return;
      const max = f.scrollWidth - f.clientWidth;
      if (max <= 1) return;
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;
      else if (e.deltaMode === 2) d *= f.clientWidth;
      if (d === 0) return;
      if (d < 0 && f.scrollLeft <= 0) return;
      if (d > 0 && f.scrollLeft >= max - 1) return;
      e.preventDefault();
      f.scrollLeft += d;
    };
    f.addEventListener('wheel', alRodar, { passive: false });
    return () => f.removeEventListener('wheel', alRodar);
  }, [rueda]);

  // El elegido, a la vista. Solo de costado y a mano (ver arriba).
  useEffect(() => {
    const f = fila.current;
    if (!f) return;
    const suave = !primera.current && !sinMovimiento();
    primera.current = false;
    const max = f.scrollWidth - f.clientWidth;
    if (max <= 1) return;
    const b = f.querySelector<HTMLElement>(ELEGIDO);
    if (!b) return;
    const rf = f.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const desde = rb.left - rf.left + f.scrollLeft;
    // Con flechas, que no quede debajo de una (40 px más su margen).
    const aire = conFlechas ? 52 : 16;
    let destino: number | null = null;
    if (centrar) destino = desde - (f.clientWidth - rb.width) / 2;
    else if (rb.left < rf.left + aire) destino = desde - aire;
    else if (rb.right > rf.right - aire) destino = desde + rb.width - f.clientWidth + aire;
    if (destino === null) return;
    f.scrollTo({ left: Math.max(0, Math.min(max, destino)), behavior: suave ? 'smooth' : 'auto' });
  }, [activo, centrar, conFlechas]);

  function mover(sentido: -1 | 1) {
    const f = fila.current;
    if (!f) return;
    f.scrollBy({ left: sentido * Math.max(120, f.clientWidth * 0.8), behavior: sinMovimiento() ? 'auto' : 'smooth' });
  }

  function alTeclado(e: React.KeyboardEvent<HTMLDivElement>) {
    const f = fila.current;
    const actual = (e.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    if (!f || !actual || !f.contains(actual)) return;
    const pestanas = Array.from(f.querySelectorAll<HTMLElement>('[role="tab"]')).filter((p) => !p.hasAttribute('disabled'));
    const n = pestanas.length;
    const i = pestanas.indexOf(actual);
    if (n < 2 || i < 0) return;
    let j: number;
    switch (e.key) {
      case 'ArrowRight': j = (i + 1) % n; break;
      case 'ArrowLeft': j = (i - 1 + n) % n; break;
      case 'Home': j = 0; break;
      case 'End': j = n - 1; break;
      default: return;
    }
    e.preventDefault();
    const siguiente = pestanas[j];
    // Sin mover la página: la fila la trae a la vista cuando cambia `activo`.
    siguiente.focus({ preventScroll: true });
    siguiente.click();
  }

  const s = SANGRIA[sangria];
  // Con flechas, el botón que recibe el foco con Tab no queda debajo de una
  // flecha. Si la fila ya trae su propio relleno de encaje, manda el suyo.
  const aireFoco = conFlechas && !/(^|\s)(\S+:)?scroll-px-/.test(className) ? 'mouse:scroll-px-12' : '';
  const envolver = enCompu === 'envolver' ? 'mouse:flex-wrap mouse:overflow-visible' : '';
  const flecha = tono === 'noche'
    ? 'border-white/15 bg-noche/90 text-white/80 hover:text-white'
    : 'border-borde bg-superficie text-tinta/70 hover:text-tinta';

  return (
    <div className={`relative ${s.caja} ${claseCaja}`}>
      <div
        ref={fila} id={id}
        role={rol} aria-label={etiqueta} aria-labelledby={etiquetadaPor}
        onKeyDown={teclado === 'pestanas' ? alTeclado : undefined}
        data-izq={izq ? '' : undefined}
        data-der={der ? '' : undefined}
        className={`fila-desliza scroll-limpio flex overflow-x-auto ${s.fila} ${envolver} ${aireFoco} ${className}`}
      >
        {children}
      </div>
      {conFlechas && izq && (
        <button
          type="button" tabIndex={-1} aria-label={t.comun.verAnteriores} aria-controls={id}
          onClick={() => mover(-1)}
          className={`fila-flecha absolute left-1 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border shadow-[0_4px_14px_-4px_rgb(0_0_0/.28)] transition active:scale-95 mouse:grid ${flecha}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden {...trazo}><path d="m14.5 6-6 6 6 6" /></svg>
        </button>
      )}
      {conFlechas && der && (
        <button
          type="button" tabIndex={-1} aria-label={t.comun.verMas} aria-controls={id}
          onClick={() => mover(1)}
          className={`fila-flecha absolute right-1 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border shadow-[0_4px_14px_-4px_rgb(0_0_0/.28)] transition active:scale-95 mouse:grid ${flecha}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden {...trazo}><path d="m9.5 6 6 6-6 6" /></svg>
        </button>
      )}
    </div>
  );
}
