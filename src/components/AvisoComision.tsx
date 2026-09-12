'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero } from '@/lib/formato';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

export type Novedad = { hay: boolean; cuantos?: number; total?: number; negocio?: string };

/**
 * «FULANO PAGÓ SU PRIMER MES. TE TOCAN 95.000.»
 *
 * Es la pieza más barata del programa de socios y la que más rinde. Sin
 * esto, alguien manda su enlace, no ve pasar nada, y no lo manda nunca más;
 * con esto, manda tres más esa semana.
 *
 * Va en el panel, que es donde entra todo el mundo, y aparece UNA vez: se
 * marca visto al cerrarlo, y lo que se avisa es solo lo nuevo desde la última
 * vez que miró. Un aviso que repite lo mismo se aprende a ignorar en dos días,
 * y entonces el próximo —el que sí importaba— tampoco se ve.
 *
 * La plata va en guaraníes y no en la moneda del negocio: es lo que Orden le
 * va a transferir, no algo que él vendió.
 */
export function AvisoComision({ novedad }: { novedad: Novedad }) {
  const [visible, setVisible] = useState(novedad.hay);

  if (!visible) return null;

  const cuantos = Number(novedad.cuantos ?? 1);
  const total = Number(novedad.total ?? 0);

  function listo() {
    setVisible(false);
    clienteNavegador().rpc('marcar_comisiones_vistas');
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-verde/30 bg-verde-claro/40 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-verde text-white">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...trazo}>
          <path d="M12 7.5v9M14.8 9.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.7.8-2.7 2 0 2.8 5.6 1.4 5.6 4.2 0 1.2-1.2 2-2.9 2-1.4 0-2.4-.5-2.9-1.4" />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold leading-snug">
          {cuantos === 1
            ? `${novedad.negocio} pagó su primer mes`
            : `${cuantos} de los que trajiste pagaron su primer mes`}
        </p>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-tinta/65">
          Te tocan <strong className="text-tinta">{dinero(total, 'PYG')}</strong>. Te los
          transferimos en estos días.
        </p>
        <div className="mt-2.5 flex items-center gap-3">
          <Link href="/recomendar" className="text-[13px] font-semibold text-verde-fuerte hover:underline">
            Ver mis referidos →
          </Link>
          <button
            type="button" onClick={listo}
            className="text-[13px] font-semibold text-tinta/45 hover:text-tinta/70"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
