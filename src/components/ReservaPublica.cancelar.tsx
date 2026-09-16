'use client';

import { useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { fechaLarga } from '@/lib/formato';
import type { ReservaPorToken } from '@/lib/tipos';
import { useTextos, useLocale } from '@/i18n/cliente';

/** Ver y cancelar un turno con el enlace. Sin cuenta: el token es la llave. */
export function CancelarTurno({ token, reserva }: { token: string; reserva: ReservaPorToken }) {
  const r = useTextos().reservaPublica;
  const locale = useLocale();
  const [estado, setEstado] = useState(reserva.estado ?? '');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  async function cancelar() {
    setCargando(true);
    setError('');
    try {
      const { error: fallo } = await clienteNavegador().rpc('cancelar_reserva', { p_token: token });
      if (fallo) throw fallo;
      setEstado('cancelada');
    } catch (e: any) {
      // Ver el comentario de ReservaPublica.tsx: el que lee esto es el cliente
      // del local, no alguien que tenga cuenta en Orden.
      setError(mensajeDeError(e, r.noSePudoCancelar));
    } finally {
      setCargando(false);
      setConfirmando(false);
    }
  }

  if (!reserva.existe) {
    return (
      <Marco>
        <h1 className="text-[19px] font-bold tracking-tight">{r.noEncontramos}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-tinta/60">
          {r.enlaceIncompleto}
        </p>
      </Marco>
    );
  }

  const hora = new Date(reserva.inicia!).toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const cancelada = estado === 'cancelada';
  const cerrada = estado === 'atendida' || estado === 'no_vino';

  return (
    <Marco>
      <p className="text-[12px] font-bold uppercase tracking-wider text-tinta/40">{reserva.negocio}</p>
      <h1 className="mt-1 text-[22px] font-bold tracking-tight">
        {cancelada ? r.turnoCancelado : r.tuTurno}
      </h1>

      <div className={`mt-4 rounded-2xl border p-4 ${
        cancelada ? 'border-borde bg-arena' : 'border-verde/30 bg-verde-claro'
      }`}>
        <p className={`text-[16px] font-semibold ${cancelada ? 'text-tinta/45 line-through' : 'text-verde-fuerte'}`}>
          {r.fechaYHoraSimple(fechaLarga(reserva.inicia!.slice(0, 10), locale), hora)}
        </p>
        <p className={`mt-1 text-[14px] ${cancelada ? 'text-tinta/40' : 'text-tinta/70'}`}>
          {r.servicioCon(reserva.servicio ?? '', reserva.con ?? '')}
        </p>
        <p className="mt-1 text-[13px] text-tinta/45">{r.aNombreDe(reserva.cliente ?? '')}</p>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
          {error}
        </p>
      )}

      {cancelada ? (
        <p className="mt-4 text-[14px] leading-relaxed text-tinta/60">
          {r.lugarLibre}
        </p>
      ) : cerrada ? (
        <p className="mt-4 text-[14px] leading-relaxed text-tinta/60">
          {r.yaPaso}
        </p>
      ) : confirmando ? (
        <div className="mt-5 space-y-2">
          <p className="text-[14px] font-medium">{r.seguroNoVenis}</p>
          <div className="flex gap-2">
            <button
              type="button" className="boton-suave flex-1 py-2.5"
              onClick={() => setConfirmando(false)} disabled={cargando}
            >
              {r.mantener}
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl bg-rojo py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
              onClick={cancelar} disabled={cargando}
            >
              {cargando ? r.cancelando : r.siCancelar}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button" className="boton-suave mt-5 w-full py-2.5"
            onClick={() => setConfirmando(true)}
          >
            {r.noVoyAPoder}
          </button>
          <p className="mt-2 text-center text-[12.5px] leading-snug text-tinta/45">
            {r.avisarATiempo}
          </p>
        </>
      )}
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  const r = useTextos().reservaPublica;
  return (
    <div className="min-h-screen bg-arena">
      <div className="mx-auto max-w-md px-4 pb-16 pt-10">
        <div className="rounded-2xl border border-borde bg-superficie p-5">{children}</div>
        <p className="mt-8 text-center text-[11.5px] text-tinta/35">{r.turnosConOrden}</p>
      </div>
    </div>
  );
}
