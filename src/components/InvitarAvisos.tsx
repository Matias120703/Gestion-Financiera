'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTextos } from '@/i18n/cliente';
import { usePush, esIphoneSinInstalar } from '@/lib/push-cliente';
import { useBloquearFondo } from '@/lib/fondo';
import { GuiaInstalar } from '@/components/GuiaInstalar';
import {
  CLAVE_INVITACION, HISTORIAL_VACIO, anotarInvitacion, debeInvitar, ejemplosDeInvitacion,
  leerHistorialInvitacion, noVolverAInvitar, type CasoInvitacion, type HistorialInvitacion,
} from '@/lib/invitar-avisos';

/**
 * «ACTIVÁ LOS AVISOS», AL ENTRAR AL PANEL (23/09).
 *
 * Matías: «cuando una persona crea su cuenta, al ingresar, le tiene que
 * aparecer la opción de activar notificaciones». Hasta hoy el botón vivía en
 * Ajustes › Avisos, y ahí no lo encuentra nadie que no lo esté buscando: la
 * cuenta nacía con los avisos prendidos en la base (010) y un teléfono que
 * nunca los iba a recibir.
 *
 * Por qué es una hoja que aparece sola y no un botón más en el panel: el
 * permiso se pide una vez, y un botón fijo en la pantalla que más se mira
 * es ruido para siempre para quien ya dijo que sí o que no. La hoja aparece,
 * se contesta y se va. Cuándo vuelve a aparecer lo decide
 * `debeInvitar` (lib/invitar-avisos.ts): tres veces como mucho, a tres días
 * una de otra.
 *
 * El permiso del teléfono no se puede pedir solo: el navegador exige que la
 * pregunta salga de un toque. Por eso el botón grande llama a `activar()`
 * directamente, sin nada en el medio que rompa ese gesto.
 *
 * Qué ejemplos dice depende de `caso`, que arma el panel: cada lista nombra
 * SOLO los avisos que hoy le llegan de verdad a esa persona. `enPrueba` suma
 * el del fin de la prueba, que a una cuenta que ya pagó no le va a llegar.
 */

/**
 * Se recuerda en memoria además de en el navegador: sin localStorage es lo
 * único que queda, y con él evita que volver al panel en la misma sesión la
 * vuelva a sacar mientras se decide.
 */
let yaEnEstaSesion = false;

type Paso = 'ofrecer' | 'no-se-activaron' | 'listo' | 'bloqueado';

export function InvitarAvisos({ caso, enPrueba }: { caso: CasoInvitacion; enPrueba: boolean }) {
  const t = useTextos();
  const tx = t.invitarAvisos;
  const { estado, trabajando, activar } = usePush();
  const [visible, setVisible] = useState(false);
  const [modo, setModo] = useState<'pedir' | 'instalar'>('pedir');
  const [paso, setPaso] = useState<Paso>('ofrecer');
  // Lo que se leyó al decidir, para anotar encima el «no vuelve nunca».
  const historial = useRef<HistorialInvitacion | null>(null);

  useBloquearFondo(visible);

  /**
   * CUÁNDO APARECE.
   *
   * Recién cuando el navegador contestó (`estado` deja de ser 'cargando'),
   * y con un respiro: si sale junto con el panel, tapa los números que la
   * persona vino a mirar antes de que los vea. La primera vez en la sesión
   * además espera a que termine la entrada con el logo (Intro.tsx, ~1,8 s).
   *
   * Nunca encima de otra hoja: si en ese momento hay un menú o un diálogo
   * abierto, espera a que se cierre y vuelve a mirar.
   */
  useEffect(() => {
    if (estado === 'cargando') return;

    const guardado = leerGuardado();
    if (!debeInvitar({ estado, historial: guardado, ahora: Date.now(), yaEnEstaSesion })) return;

    const conIntro = !document.documentElement.classList.contains('intro-vista');
    let reloj: ReturnType<typeof setTimeout>;

    const intentar = () => {
      if (hayOtraHojaAbierta()) { reloj = setTimeout(intentar, 1500); return; }
      yaEnEstaSesion = true;
      const anotado = anotarInvitacion(guardado ?? HISTORIAL_VACIO, Date.now());
      historial.current = anotado;
      guardar(anotado);
      setModo(estado === 'iphone-sin-instalar' || esIphoneSinInstalar() ? 'instalar' : 'pedir');
      setPaso('ofrecer');
      setVisible(true);
    };

    reloj = setTimeout(intentar, conIntro ? 2300 : 1500);
    return () => clearTimeout(reloj);
  }, [estado]);

  // «Listo» se lee y se va solo: no hay nada más que decidir.
  useEffect(() => {
    if (paso !== 'listo') return;
    const reloj = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(reloj);
  }, [paso]);

  // Escape cierra, como «Ahora no».
  useEffect(() => {
    if (!visible) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape' && !trabajando) setVisible(false); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [visible, trabajando]);

  async function alActivar() {
    const final = await activar();
    if (final === 'encendido') { setPaso('listo'); return; }
    if (final === 'bloqueado') {
      // Bloqueado desde acá: no se vuelve a ofrecer. Desbloquearlo es cosa
      // de la configuración del teléfono, y la hoja no puede hacer nada más.
      const anotado = noVolverAInvitar(historial.current ?? HISTORIAL_VACIO);
      historial.current = anotado;
      guardar(anotado);
      setPaso('bloqueado');
      return;
    }
    if (final === 'sin-configurar') { setVisible(false); return; }
    // Cerró la pregunta sin contestar, o falló el alta: se puede reintentar.
    setPaso('no-se-activaron');
  }

  function cerrar() {
    if (trabajando) return;
    setVisible(false);
  }

  if (!visible) return null;

  const ejemplos = ejemplosDeInvitacion(tx, caso, enPrueba);

  return (
    <div
      data-invitar-avisos=""
      className="fixed inset-0 z-[60] flex items-end justify-center bg-noche/45 backdrop-blur-[2px] sm:items-center sm:px-4"
      onClick={cerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invitar-avisos-titulo"
        className="zona-segura-abajo max-h-[88vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie p-5 aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-verde-claro text-verde-fuerte">
            <IconoCampana />
          </span>
          <button
            type="button" onClick={cerrar} aria-label={t.comun.cerrar}
            className="icono-toque -mr-2 -mt-1 text-tinta/45 hover:bg-arena"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <h2 id="invitar-avisos-titulo" className="mt-3 text-[21px] font-bold tracking-tight">{tx.titulo}</h2>

        {paso === 'listo' ? (
          <p role="status" className="mt-4 flex items-center gap-2.5 rounded-2xl bg-verde-claro px-4 py-3.5 text-[14.5px] font-semibold text-verde-fuerte">
            <IconoTilde />
            {tx.listo}
          </p>
        ) : paso === 'bloqueado' ? (
          <div className="mt-3">
            <p className="text-[15px] font-semibold">{tx.bloqueadoTitulo}</p>
            <p className="mt-2 rounded-xl bg-arena px-3.5 py-3 text-[14px] leading-relaxed text-tinta/75">
              {textoDesbloquear(tx)}
            </p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-tinta/55">{tx.bloqueadoDespues}</p>
            <button type="button" onClick={cerrar} className="boton-suave mt-5 min-h-[48px] w-full text-[15px]">
              {tx.entendido}
            </button>
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-[14px] leading-relaxed text-tinta/60">{tx.intro}</p>
            <ul className="mt-3 space-y-2.5">
              {ejemplos.map((e) => (
                <li key={e} className="flex items-start gap-2.5 text-[14px] leading-snug">
                  <span className="mt-0.5 shrink-0 text-verde-fuerte"><IconoTilde /></span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>

            {modo === 'instalar' ? (
              <div className="mt-4 rounded-2xl bg-arena p-4">
                <p className="text-[14.5px] font-semibold">{tx.iphoneTitulo}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta/65">{tx.iphone}</p>
                <div className="mt-4">
                  <GuiaInstalar compacta />
                </div>
                <p className="mt-3 text-[12px] text-tinta/45">
                  <Link href="/instalar" target="_blank" className="font-semibold text-verde-fuerte hover:underline">
                    {t.ajustes.guiaEnSuPagina}
                  </Link>
                  {' '}{t.ajustes.paraMandarla}
                </p>
              </div>
            ) : (
              <>
                {paso === 'no-se-activaron' && (
                  <p role="status" className="mt-4 rounded-xl bg-arena px-3.5 py-3 text-[13.5px] leading-relaxed text-tinta/70">
                    {tx.noSeActivaron}
                  </p>
                )}
                <button
                  type="button" onClick={() => { void alActivar(); }} disabled={trabajando}
                  className="boton-principal mt-5 min-h-[48px] w-full text-[15px]"
                >
                  {trabajando ? tx.activando : tx.activar}
                </button>
              </>
            )}

            <button
              type="button" onClick={cerrar} disabled={trabajando}
              className={`${modo === 'instalar' ? 'mt-4' : 'mt-1.5'} flex min-h-[44px] w-full items-center justify-center rounded-full text-[14px] font-semibold text-tinta/55 transition hover:bg-arena disabled:opacity-50`}
            >
              {tx.ahoraNo}
            </button>
            <p className="mt-1 text-center text-[12px] text-tinta/40">{tx.seApagan}</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Cómo desbloquearlos, solo en el teléfono que la persona tiene en la mano.
 * Las tres recetas juntas son un párrafo que nadie lee.
 */
function textoDesbloquear(tx: { bloqueadoAndroid: string; bloqueadoIphone: string; bloqueadoCompu: string }): string {
  if (typeof navigator === 'undefined') return tx.bloqueadoCompu;
  if (/Android/i.test(navigator.userAgent)) return tx.bloqueadoAndroid;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return tx.bloqueadoIphone;
  return tx.bloqueadoCompu;
}

/**
 * ¿Hay otra hoja adelante? Toda hoja o diálogo usa `z-[60]` (ver la regla
 * en globals.css), y el menú y la captura bloquean el fondo con
 * `useBloquearFondo`, que deja el body en `overflow: hidden`.
 */
function hayOtraHojaAbierta(): boolean {
  if (document.body.style.overflow === 'hidden') return true;
  return document.querySelector('[class*="z-[60]"]:not([data-invitar-avisos])') !== null;
}

/**
 * Null si el navegador no deja leer: modo privado, datos bloqueados. Todo
 * acceso va con try/catch porque ahí `localStorage` directamente lanza.
 */
function leerGuardado(): HistorialInvitacion | null {
  try {
    return leerHistorialInvitacion(window.localStorage.getItem(CLAVE_INVITACION));
  } catch {
    return null;
  }
}

function guardar(h: HistorialInvitacion) {
  try {
    window.localStorage.setItem(CLAVE_INVITACION, JSON.stringify(h));
  } catch {
    // Sin dónde guardar, queda `yaEnEstaSesion`: una vez por sesión.
  }
}

function IconoCampana() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IconoTilde() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
