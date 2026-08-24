'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';
import { mensajeDeError } from '@/lib/errores';

/**
 * El gesto de cerrar el día.
 *
 * No guarda ningún total: guarda que esta persona MIRÓ el cierre de esta
 * fecha. Los números se recalculan siempre, así que si mañana se anula una
 * venta de hoy, el cierre de hoy lo refleja. Una foto congelada mentiría.
 *
 * Es por persona y no por negocio: que el dueño haya mirado el cierre no
 * significa que el vendedor lo vio.
 */
export function BotonCerrarDia({
  empresaId, fecha, yaCerrado,
}: {
  empresaId: string;
  fecha: string;
  yaCerrado: boolean;
}) {
  const t = useTextos();
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState('');

  if (yaCerrado) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl bg-verde-claro px-4 py-3 text-[14px] font-bold text-verde-fuerte">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
             strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 13 4 4L19 7" />
        </svg>
        {t.cierre.cerrado}
      </div>
    );
  }

  async function cerrar() {
    setCerrando(true);
    setError('');
    try {
      const supabase = clienteNavegador();
      const { error: e } = await supabase.rpc('marcar_cierre', {
        p_empresa: empresaId,
        p_fecha: fecha,
      });
      if (e) throw e;
      router.refresh();
    } catch (e: any) {
      setError(mensajeDeError(e, t.errores.generico));
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={cerrar} disabled={cerrando} className="boton-principal w-full">
        {cerrando ? t.comun.guardando : t.cierre.marcar}
      </button>
      {error && (
        <p className="mt-2 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">{error}</p>
      )}
    </div>
  );
}
