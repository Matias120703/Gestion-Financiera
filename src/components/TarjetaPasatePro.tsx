'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTextos } from '@/i18n/cliente';

/** Dónde se guarda cuándo la persona dijo «Ahora no». */
const CLAVE = 'orden:pasate-pro';
/** Cuánto tarda en volver después de un «Ahora no». */
const VUELVE_EN = 30 * 86_400_000;

/**
 * «PASATE AL PLAN PRO», en el panel del plan Gratis personal (110,
 * 28/09/2026).
 *
 * Una sola tarjeta, tranquila y abajo de todo: arriba sería la franja
 * permanente pidiendo plata que AvisoCuenta prohíbe. Dice lo que suma el Pro
 * y lleva a /plan.
 *
 * «Ahora no» la esconde 30 días en este navegador. Sin storage (una ventana
 * privada estricta) se muestra: es una tarjeta abajo del panel, no un cartel.
 */
export function TarjetaPasatePro() {
  const t = useTextos();
  const g = t.planGratis.panel;
  // null hasta leer el navegador: así no aparece y desaparece al cargar.
  const [mostrar, setMostrar] = useState<boolean | null>(null);

  useEffect(() => {
    let reciente = false;
    try {
      const marca = Number(window.localStorage.getItem(CLAVE));
      reciente = Number.isFinite(marca) && marca > 0 && Date.now() - marca < VUELVE_EN;
    } catch {
      // Sin storage se muestra.
    }
    setMostrar(!reciente);
  }, []);

  function ahoraNo() {
    try {
      window.localStorage.setItem(CLAVE, String(Date.now()));
    } catch {
      // Sin storage se esconde igual, solo por esta vez.
    }
    setMostrar(false);
  }

  if (!mostrar) return null;

  return (
    <section className="tarjeta p-5">
      <h2 className="text-[16px] font-bold tracking-tight">{g.pasateTitulo}</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta/60">{g.pasateDetalle}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Link href="/plan" className="boton-principal px-5 py-2.5 text-[14px]">
          {g.pasateBoton}
        </Link>
        <button
          type="button" onClick={ahoraNo}
          className="px-3 py-2.5 text-[13.5px] font-semibold text-tinta/50 transition hover:text-tinta"
        >
          {g.ahoraNo}
        </button>
      </div>
    </section>
  );
}
