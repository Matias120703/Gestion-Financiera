'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/** Dónde se guarda que la persona ya cerró la franja de este paso a Gratis. */
const CLAVE = 'orden:franja-gratis';

/**
 * La franja del día que la cuenta personal pasa al plan Gratis (110,
 * 28/09/2026).
 *
 * Antes la franja de la prueba se iba y la app cambiaba sin decir nada. Esta
 * lo explica: qué quedó guardado y dónde se ve el plan. Es neutra y no roja:
 * no es un error ni una deuda. Se puede cerrar, y se va sola a los 7 días
 * (lo decide AvisoCuenta), así que no es la franja permanente que convierte
 * el producto en un cartel.
 *
 * `clave` es la fecha en que terminó el plan: cerrada una vez, no vuelve;
 * si la persona paga y vuelve a pasar a Gratis otro día, es otro aviso.
 *
 * Lo cerrado vive en el navegador de quien la ve, nada más. Sin storage (una
 * ventana privada estricta) se muestra: mejor un aviso de más que uno de menos.
 */
export function FranjaGratis({
  clave, titulo, detalle, accion, cerrar,
}: {
  clave: string;
  titulo: string;
  detalle: string;
  accion: string;
  /** El nombre del botón ×, para quien no lo ve. */
  cerrar: string;
}) {
  // null hasta leer el navegador: así no aparece y desaparece al cargar.
  const [mostrar, setMostrar] = useState<boolean | null>(null);

  useEffect(() => {
    let cerrada = false;
    try {
      cerrada = window.localStorage.getItem(CLAVE) === clave;
    } catch {
      // Sin storage se muestra.
    }
    setMostrar(!cerrada);
  }, [clave]);

  function esconder() {
    try {
      window.localStorage.setItem(CLAVE, clave);
    } catch {
      // Sin storage se esconde igual, solo por esta vez.
    }
    setMostrar(false);
  }

  if (!mostrar) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borde bg-superficie px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold text-tinta">{titulo}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tinta/65">{detalle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Link href="/plan" className="boton-principal px-4 py-2 text-[13.5px]">
          {accion}
        </Link>
        <button
          type="button"
          onClick={esconder}
          aria-label={cerrar}
          className="grid h-10 w-10 place-items-center rounded-full text-tinta/45 transition hover:bg-arena hover:text-tinta"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true"
               fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
