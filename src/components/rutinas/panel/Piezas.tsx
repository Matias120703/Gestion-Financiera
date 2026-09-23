'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTextos } from '@/i18n/cliente';

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
function useVistaSinTeclado(): { arriba: number; alto: number } | null {
  const [vista, setVista] = useState<{ arriba: number; alto: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
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
  }, []);
  return vista;
}

/**
 * LAS PIEZAS DE LAS PANTALLAS DE RUTINAS (098): la hoja que sube desde
 * abajo, la pregunta de «¿Seguro?», los avisos y las pestañas.
 *
 * La hoja sigue la regla de globals.css: z-[60] (por encima de la barra de
 * abajo), `max-h-[88vh]` con su propio scroll y la zona segura del iPhone.
 * Sin el max-h, un formulario largo (las diez medidas) quedaba cortado.
 * Con el teclado abierto se achica al pedazo de pantalla que queda a la
 * vista (ver useVistaSinTeclado): así lo que va fijo abajo no queda tapado.
 */
export function Hoja({
  titulo, onCerrar, bloqueada = false, children,
}: {
  titulo: string;
  onCerrar: () => void;
  /** Mientras se guarda no se cierra: un toque de más afuera no corta el pedido a la mitad. */
  bloqueada?: boolean;
  children: React.ReactNode;
}) {
  const t = useTextos();
  const vista = useVistaSinTeclado();

  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => { if (e.key === 'Escape' && !bloqueada) onCerrar(); };
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, [onCerrar, bloqueada]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-noche/45 backdrop-blur-[2px] sm:items-center sm:px-4"
      style={vista ? { top: vista.arriba, height: vista.alto, bottom: 'auto' } : undefined}
      onClick={() => { if (!bloqueada) onCerrar(); }}
      role="presentation"
    >
      <div
        role="dialog" aria-modal="true" aria-label={titulo}
        className="zona-segura-abajo max-h-[88vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie p-5 aparecer sm:rounded-3xl"
        style={vista ? { maxHeight: Math.round(vista.alto * 0.94) } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="pt-2 text-[19px] font-bold leading-snug tracking-tight">{titulo}</h2>
          <button
            type="button" onClick={onCerrar} disabled={bloqueada} aria-label={t.comun.cerrar}
            className="icono-toque -mr-2 shrink-0 text-[18px] text-tinta/45 hover:bg-arena disabled:opacity-40"
          >
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

/**
 * «¿Terminar la rutina?», «¿Borrar este control?». Lo que no se deshace
 * con otro toque pregunta antes, con el «no» a mano y del mismo tamaño.
 */
export function Confirmar({
  titulo, detalle, si, onSi, onNo, ocupado = false, peligro = false, error = '',
}: {
  titulo: string;
  detalle?: React.ReactNode;
  si: string;
  onSi: () => void;
  onNo: () => void;
  ocupado?: boolean;
  /** Borrar: el botón va en rojo. */
  peligro?: boolean;
  error?: string;
}) {
  const t = useTextos();
  return (
    <Hoja titulo={titulo} onCerrar={onNo} bloqueada={ocupado}>
      {detalle && <div className="text-[14px] leading-relaxed text-tinta/70">{detalle}</div>}
      <MensajeError texto={error} />
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <button type="button" className="boton-suave min-h-[48px]" onClick={onNo} disabled={ocupado}>
          {t.comun.cancelar}
        </button>
        <button
          type="button" onClick={onSi} disabled={ocupado}
          className={`${peligro ? 'boton-peligro' : 'boton-principal'} min-h-[48px]`}
        >
          {ocupado ? t.comun.guardando : si}
        </button>
      </div>
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

export function MensajeListo({ texto, children }: { texto: string; children?: React.ReactNode }) {
  if (!texto) return null;
  return (
    <div role="status" className="rounded-xl bg-verde-claro px-4 py-3 text-[13.5px] font-semibold text-verde-fuerte aparecer">
      <p>✓ {texto}</p>
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

/**
 * Pestañas que viven en la dirección (?ver=): se puede volver con «atrás»,
 * y un aviso de «Para atender» puede abrir la carpeta justo en Progreso.
 * `replace` para que cambiar de pestaña no llene el historial.
 */
export function Pestanas({
  opciones, actual,
}: {
  opciones: { valor: string; texto: string; href: string }[];
  actual: string;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-2xl border border-borde/70 bg-superficie p-1">
      {opciones.map((o) => (
        <Link
          key={o.valor} href={o.href} replace scroll={false}
          role="tab" aria-selected={actual === o.valor}
          className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-2 text-center text-[14px] font-bold transition ${
            actual === o.valor ? 'bg-verde-claro text-verde-fuerte' : 'text-tinta/55 hover:text-tinta'
          }`}
        >
          {o.texto}
        </Link>
      ))}
    </div>
  );
}
