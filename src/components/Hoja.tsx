'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTextos } from '@/i18n/cliente';
import { useBloquearFondo } from '@/lib/fondo';

/**
 * LA VENTANA DE ORDEN, UNA SOLA (01/10).
 *
 * Matías: «los cuadros, cuando abro algo, salen muy entrecortados; en
 * Registrar un pago la parte de abajo corta el botón; y eso va con todos».
 * Era verdad, y era la misma causa en todas: cada pantalla armaba su propio
 * velo y su propio panel, y todas copiaban los mismos cuatro errores.
 *
 *   1. El relleno de abajo era 0. `.zona-segura-abajo` estaba fuera de las
 *      capas de Tailwind y en el CSS final quedaba DESPUÉS de `.p-5`: el
 *      `padding-bottom` pasaba a ser `env(safe-area-inset-bottom)`, que en la
 *      computadora y en Android vale 0. El botón quedaba pegado al borde y
 *      mordido por la esquina redondeada (medido: 20 px arriba, 0 abajo).
 *   2. Los botones iban adentro de lo que se desplaza: en un formulario largo
 *      había que bajar hasta el fondo para encontrarlos.
 *   3. El título y la ✕ también: al bajar se iban.
 *   4. La altura era `88vh`, que en el celular es la pantalla con la barra del
 *      navegador ESCONDIDA: con la barra a la vista, la hoja medía más que lo
 *      que se ve.
 *
 * ACÁ, UNA VEZ Y BIEN:
 *
 *   · Cabecera fija (título, subtítulo y ✕), cuerpo con su propio scroll y
 *     pie fijo con los botones, siempre a la vista y con aire abajo
 *     (`max(1.25rem, zona segura)`).
 *   · En el celular sube desde abajo, a lo ancho, con las esquinas de arriba
 *     redondeadas. En la computadora va centrada, con 24 px de margen a los
 *     cuatro lados y un ancho que depende de lo que lleva (`tamano`).
 *   · La altura máxima es lo que se ve de verdad (`dvh`, y el `vh` de
 *     respaldo), y con el teclado abierto se achica a lo que queda a la vista.
 *   · Escape y un toque en el velo cierran, salvo mientras guarda
 *     (`bloqueada`). El velo cierra solo si el toque EMPEZÓ y terminó en él:
 *     arrastrar una selección de un campo hacia afuera ya no la cierra.
 *   · El fondo no se mueve, el foco entra al abrir, Tab no se escapa y al
 *     cerrar vuelve al botón que la abrió.
 *   · Si aparece un error (`role="alert"`) fuera de la vista, el cuerpo se
 *     desplaza solo hasta mostrarlo (`useAlertaALaVista`).
 *   · El velo oscurece de verdad en los dos temas (`--velo` en globals.css)
 *     y el panel lleva el borde de la tarjeta: en oscuro, sin eso, la
 *     ventana se confundía con las tarjetas de atrás.
 *   · Se dibuja en el `body` (portal): ningún `backdrop-blur` ni `transform`
 *     de afuera la encierra. Una hoja que se abre sobre otra queda encima
 *     (su z-index suma uno por cada hoja de abajo) y solo la de arriba
 *     escucha Escape y el velo.
 *
 * Una pantalla nueva NO arma su propio `fixed inset-0`: usa esta (lo cuida
 * una prueba en pruebas/calculos.test.js).
 */

export type TamanoHoja = 'chico' | 'medio' | 'grande';

const ANCHO: Record<TamanoHoja, string> = {
  chico: 'max-w-sm',
  medio: 'max-w-lg',
  grande: 'max-w-2xl',
};

/** Las hojas abiertas, de abajo hacia arriba. Solo la última atiende Escape y el velo. */
const pila: number[] = [];
let siguienteId = 1;

function marcarPila() {
  // La franja de «sin conexión» se muda arriba mientras haya una hoja: abajo
  // tapaba justo los botones del pie (globals.css, `.franja-sin-conexion`).
  document.documentElement.classList.toggle('hay-hoja', pila.length > 0);
}

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const CAMPOS = 'input, textarea, select, [contenteditable="true"]';

/** Tab y Shift+Tab dan la vuelta adentro del panel: no se escapan a la página de atrás. */
function encerrarTab(e: KeyboardEvent, p: HTMLElement) {
  const enfocables = Array.from(p.querySelectorAll<HTMLElement>(ENFOCABLES))
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (enfocables.length === 0) { e.preventDefault(); p.focus(); return; }
  const primero = enfocables[0];
  const ultimo = enfocables[enfocables.length - 1];
  const actual = document.activeElement;
  if (!p.contains(actual)) { e.preventDefault(); primero.focus(); return; }
  if (e.shiftKey && (actual === primero || actual === p)) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && actual === ultimo) { e.preventDefault(); primero.focus(); }
}

/**
 * EL FOCO DE LAS VENTANAS QUE NO SON UNA `Hoja` (01/10): el menú «Más» y la
 * captura con IA. Lo mismo que hace la Hoja: al abrir el foco entra al
 * panel, Tab no se escapa a la página de atrás y al cerrar vuelve al botón
 * que la abrió.
 *
 * `volverA` es para cuando ese botón se esconde mientras está abierta (el
 * «Más» de la barra, que desaparece con el menú): el foco no se puede leer
 * al abrir, porque ya cayó al body.
 */
export function useFocoDeDialogo(
  panel: React.RefObject<HTMLElement | null>,
  abierto: boolean,
  volverA?: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!abierto) return;
    const activo = document.activeElement;
    const previo = volverA?.current ?? (activo instanceof HTMLElement && activo !== document.body ? activo : null);
    const p = panel.current;
    if (p && !p.contains(document.activeElement)) p.focus({ preventScroll: true });
    const alTeclado = (e: KeyboardEvent) => {
      // Una Hoja abierta encima maneja su propio Tab.
      if (e.key !== 'Tab' || !panel.current || pila.length > 0) return;
      encerrarTab(e, panel.current);
    };
    document.addEventListener('keydown', alTeclado);
    return () => {
      document.removeEventListener('keydown', alTeclado);
      if (previo && previo.isConnected && !previo.matches(CAMPOS)) previo.focus({ preventScroll: true });
    };
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * EL ERROR, A LA VISTA (01/10).
 *
 * Con los botones en el pie fijo, el error de guardar sigue siendo lo último
 * del cuerpo, que se desplaza aparte: con el cuerpo arriba (o el teclado
 * abierto, que achica la ventana) quedaba abajo, fuera de la vista. La
 * persona tocaba Guardar, el botón volvía a su texto y no aparecía nada.
 *
 * Cuando aparece (o cambia) un `role="alert"` adentro de `contenedor` fuera
 * de lo que se ve, se desplaza SOLO ese contenedor lo justo para mostrarlo
 * con aire (nunca `scrollIntoView`, que también mueve la página de atrás).
 * Si está arriba (la ficha del Panel de Orden lo pinta ahí), sube. Si la
 * persona está escribiendo, el campo donde escribe no se va de la vista: un
 * aviso que aparece al tipear no le saca el renglón de abajo de los dedos.
 * Lo usan la Hoja (su cuerpo) y la tarjeta de la captura, que tiene su pie
 * pegado abajo (`.pie-captura`): ahí lo visible termina donde empieza el pie.
 */
export function useAlertaALaVista(contenedor: React.RefObject<HTMLElement | null>, activo = true) {
  useEffect(() => {
    const c = contenedor.current;
    if (!activo || !c || typeof MutationObserver === 'undefined') return;
    let ultimaTecla = 0;
    const alEscribir = () => { ultimaTecla = Date.now(); };
    c.addEventListener('input', alEscribir, true);

    const alertaDe = (n: Node | null): HTMLElement | null => {
      const el = n instanceof Element ? n : n?.parentElement ?? null;
      if (!el) return null;
      const a = el.closest<HTMLElement>('[role="alert"]') ?? el.querySelector<HTMLElement>('[role="alert"]');
      return a && c.contains(a) && a.offsetParent !== null ? a : null;
    };

    const obs = new MutationObserver((cambios) => {
      const halladas: HTMLElement[] = [];
      for (const m of cambios) {
        const nodos = m.type === 'characterData' ? [m.target] : Array.from(m.addedNodes);
        for (const n of nodos) {
          const a = alertaDe(n);
          if (a && !halladas.includes(a)) halladas.push(a);
        }
      }
      if (halladas.length === 0) return;
      // La de más arriba: es la primera que hay que leer.
      halladas.sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const r = halladas[0].getBoundingClientRect();
      const caja = c.getBoundingClientRect();
      const pie = c.querySelector<HTMLElement>('.pie-captura');
      const AIRE = 16;
      const arriba = caja.top + AIRE;
      const abajo = (pie ? Math.min(caja.bottom, pie.getBoundingClientRect().top) : caja.bottom) - AIRE;
      let delta = 0;
      if (r.top < arriba) delta = r.top - arriba;
      else if (r.bottom > abajo) delta = Math.min(r.bottom - abajo, r.top - arriba);
      // Escribiendo: el campo enfocado se queda a la vista.
      const foco = document.activeElement;
      if (delta > 0 && Date.now() - ultimaTecla < 700 && foco instanceof HTMLElement && c.contains(foco) && foco.matches(CAMPOS)) {
        delta = Math.min(delta, foco.getBoundingClientRect().top - arriba);
      }
      if (Math.abs(delta) < 1) return;
      const quieto = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      c.scrollTo({ top: c.scrollTop + delta, behavior: quieto ? 'auto' : 'smooth' });
    });
    obs.observe(c, { childList: true, subtree: true, characterData: true });
    return () => {
      obs.disconnect();
      c.removeEventListener('input', alEscribir, true);
    };
  }, [activo]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * La parte de la pantalla que el teclado deja a la vista, cuando la tapa.
 *
 * En el iPhone (y en Chrome de Android desde la 108) abrir el teclado no
 * achica la página: la tapa. Una hoja `fixed` pegada abajo queda debajo del
 * teclado, y con ella los botones «Guardar y otro» o «Guardar». Con esto la
 * hoja se acomoda al pedazo que se ve (`visualViewport`), y lo de abajo
 * queda justo arriba del teclado. Sin teclado, o en un navegador sin
 * `visualViewport`, devuelve null y la hoja ocupa la pantalla como siempre.
 */
export function useVistaSinTeclado(activo = true): { arriba: number; alto: number } | null {
  const [vista, setVista] = useState<{ arriba: number; alto: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    // Cerrada (la captura, que vive montada en todas las pantallas) no escucha.
    if (!vv || !activo) { setVista(null); return; }
    const medir = () => {
      // Menos de 100 px de diferencia es la barra del navegador que se
      // esconde al bajar, no un teclado.
      const tapado = window.innerHeight - vv.height;
      setVista(tapado > 100 ? { arriba: vv.offsetTop, alto: vv.height } : null);
    };
    medir();
    vv.addEventListener('resize', medir);
    vv.addEventListener('scroll', medir);
    return () => {
      vv.removeEventListener('resize', medir);
      vv.removeEventListener('scroll', medir);
    };
  }, [activo]);
  return vista;
}

export function Hoja({
  titulo, subtitulo, onCerrar, bloqueada = false, tamano = 'medio', pie, fijoArriba,
  formulario, sinCerrar = false, cerrarConVelo = true, focoInicial, etiqueta, children,
}: {
  /** Va en el h2 de la cabecera fija; la hoja se anuncia con él. */
  titulo: React.ReactNode;
  /** Una línea gris debajo del título («Tarjeta · Saldo Gs. 1.000.000»). */
  subtitulo?: React.ReactNode;
  onCerrar: () => void;
  /** Mientras se guarda no se cierra: ni la ✕, ni Escape, ni el velo. */
  bloqueada?: boolean;
  /** chico 384 px (preguntas) · medio 512 px (formularios, por defecto) · grande 672 px (lo largo). */
  tamano?: TamanoHoja;
  /** Los botones. Van SIEMPRE fijos abajo, fuera de lo que se desplaza. */
  pie?: React.ReactNode;
  /** Lo que se queda quieto bajo el título mientras el cuerpo se desplaza (un buscador, las pestañas de días). */
  fijoArriba?: React.ReactNode;
  /** Cuerpo y pie dentro de un <form>: Enter envía y el botón del pie puede ser type="submit". */
  formulario?: { onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; noValidate?: boolean };
  /** Sin ✕: una decisión que no se puede dejar a medias. */
  sinCerrar?: boolean;
  /** Por defecto un toque afuera cierra. */
  cerrarConVelo?: boolean;
  /** Dónde entra el foco al abrir. Si no: el primer autoFocus, y si no hay, la hoja misma. */
  focoInicial?: React.RefObject<HTMLElement | null>;
  /** Nombre para lectores de pantalla cuando el título no es texto. */
  etiqueta?: string;
  children: React.ReactNode;
}) {
  const t = useTextos();
  const vista = useVistaSinTeclado();
  const idTitulo = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const previo = useRef<HTMLElement | null>(null);
  const empezoEnVelo = useRef(false);
  const [id] = useState(() => siguienteId++);
  const [montada, setMontada] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [desplazada, setDesplazada] = useState(false);

  // Lo último que se lee en los manejadores, sin volver a suscribirlos.
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  const trabada = useRef(bloqueada);
  trabada.current = bloqueada;

  useBloquearFondo(true);
  // El error de guardar, a la vista aunque el cuerpo esté desplazado.
  useAlertaALaVista(cuerpo, montada);

  // Al abrir: entra a la pila y recuerda quién la abrió. El portal se dibuja
  // recién ahora: en el servidor no hay `document.body`.
  useEffect(() => {
    previo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pila.push(id);
    setNivel(pila.length - 1);
    marcarPila();
    setMontada(true);
    return () => {
      const i = pila.indexOf(id);
      if (i >= 0) pila.splice(i, 1);
      marcarPila();
      // El foco vuelve al botón que la abrió. A un campo no: en el celular
      // volvería a abrir el teclado sin que nadie lo pidiera.
      const antes = previo.current;
      if (antes && antes.isConnected && !antes.matches(CAMPOS)) {
        antes.focus({ preventScroll: true });
      }
    };
  }, [id]);

  // El foco adentro: lo que pidió la pantalla, o el autoFocus que React ya
  // puso, o la hoja misma (así Tab arranca adentro y no en la página de atrás).
  useEffect(() => {
    if (!montada || !panel.current) return;
    const p = panel.current;
    if (focoInicial?.current) { focoInicial.current.focus({ preventScroll: true }); return; }
    if (p.contains(document.activeElement)) return;
    p.focus({ preventScroll: true });
  }, [montada]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape y Tab, solo la de arriba.
  useEffect(() => {
    if (!montada) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (pila[pila.length - 1] !== id || !panel.current) return;
      if (e.key === 'Escape') {
        if (!trabada.current && !sinCerrar) { e.preventDefault(); cerrar.current(); }
        return;
      }
      if (e.key !== 'Tab') return;
      encerrarTab(e, panel.current);
    };
    document.addEventListener('keydown', alTeclado);
    return () => document.removeEventListener('keydown', alTeclado);
  }, [montada, id, sinCerrar]);

  if (!montada) return null;

  const conCerrar = !sinCerrar;
  const sinPie = pie === undefined || pie === null || pie === false;

  const contenido = (
    <>
      <div
        ref={cuerpo}
        onScroll={(e) => setDesplazada(e.currentTarget.scrollTop > 2)}
        className={`min-h-0 overflow-y-auto overscroll-contain barra-fina px-5 pt-1 ${
          sinPie ? 'pb-[max(1.25rem,env(safe-area-inset-bottom))]' : 'pb-5'
        }`}
      >
        {children}
      </div>
      {!sinPie && (
        <div className="shrink-0 border-t border-borde/70 bg-superficie px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {pie}
        </div>
      )}
    </>
  );

  return createPortal(
    <div
      className="hoja-velo fixed inset-0 z-[60] flex items-end justify-center backdrop-blur-[2px] sm:items-center sm:p-6"
      style={{
        zIndex: 60 + nivel,
        ...(vista ? { top: vista.arriba, height: vista.alto, bottom: 'auto' } : null),
      }}
      role="presentation"
      onPointerDown={(e) => { empezoEnVelo.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        // En el árbol de React la hoja sigue adentro de quien la abrió (el
        // portal no cambia eso): sin esto, un toque adentro llegaría también
        // a un onClick de una tarjeta o de una fila de atrás.
        e.stopPropagation();
        const enElVelo = empezoEnVelo.current && e.target === e.currentTarget;
        empezoEnVelo.current = false;
        if (!enElVelo || !cerrarConVelo || trabada.current || sinCerrar) return;
        if (pila[pila.length - 1] !== id) return;
        cerrar.current();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={etiqueta ? undefined : idTitulo}
        aria-label={etiqueta}
        tabIndex={-1}
        className={`hoja-panel flex w-full ${ANCHO[tamano]} flex-col overflow-hidden rounded-t-3xl border border-borde/70 bg-superficie shadow-tarjeta outline-none sm:rounded-3xl`}
      >
        <div className={`shrink-0 border-b px-5 pb-3 pt-2.5 transition-colors sm:pt-4 ${desplazada ? 'border-borde/70' : 'border-transparent'}`}>
          <div aria-hidden className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-tinta/15 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pt-1.5">
              <h2 id={idTitulo} className="text-[19px] font-bold leading-snug tracking-tight">{titulo}</h2>
              {subtitulo && <div className="mt-0.5 text-[13px] leading-snug text-tinta/55">{subtitulo}</div>}
            </div>
            {conCerrar && (
              <button
                type="button" onClick={() => cerrar.current()} disabled={bloqueada} aria-label={t.comun.cerrar}
                className="icono-toque -mr-2 shrink-0 text-[18px] text-tinta/45 hover:bg-arena disabled:opacity-40"
              >
                ✕
              </button>
            )}
          </div>
          {fijoArriba && <div className="mt-3">{fijoArriba}</div>}
        </div>
        {formulario ? (
          <form
            className="flex min-h-0 flex-col"
            noValidate={formulario.noValidate}
            onSubmit={(e) => {
              // Una hoja abierta sobre otra vive adentro de ella en el árbol de
              // React: sin esto, su envío llegaría también al <form> de abajo.
              e.stopPropagation();
              formulario.onSubmit(e);
            }}
          >
            {contenido}
          </form>
        ) : contenido}
      </div>
    </div>,
    document.body,
  );
}

/** Los botones del pie: uno a lo ancho, o dos del mismo tamaño. */
export function PieHoja({ children, columnas = 1 }: { children: React.ReactNode; columnas?: 1 | 2 }) {
  return <div className={columnas === 2 ? 'grid grid-cols-2 gap-2.5' : 'grid gap-2.5'}>{children}</div>;
}

/**
 * «¿Terminar la rutina?», «¿Borrar este control?». Lo que no se deshace
 * con otro toque pregunta antes, con el «no» a mano y del mismo tamaño.
 */
export function Confirmar({
  titulo, detalle, si, no, onSi, onNo, ocupado = false, peligro = false, error = '',
}: {
  titulo: string;
  detalle?: React.ReactNode;
  si: string;
  /** El «no»; por defecto «Cancelar». */
  no?: string;
  onSi: () => void;
  onNo: () => void;
  ocupado?: boolean;
  /** Borrar: el botón va en rojo. */
  peligro?: boolean;
  error?: string;
}) {
  const t = useTextos();
  return (
    <Hoja
      titulo={titulo} onCerrar={onNo} bloqueada={ocupado} tamano="chico"
      pie={(
        <PieHoja columnas={2}>
          <button type="button" className="boton-suave min-h-[48px]" onClick={onNo} disabled={ocupado}>
            {no ?? t.comun.cancelar}
          </button>
          <button
            type="button" onClick={onSi} disabled={ocupado}
            className={`${peligro ? 'boton-peligro' : 'boton-principal'} min-h-[48px]`}
          >
            {ocupado ? t.comun.guardando : si}
          </button>
        </PieHoja>
      )}
    >
      {detalle && <div className="text-[14px] leading-relaxed text-tinta/70">{detalle}</div>}
      <MensajeError texto={error} />
    </Hoja>
  );
}

export function MensajeError({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <p role="alert" className="mt-3 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
      {texto}
    </p>
  );
}
