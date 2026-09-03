'use client';

import { useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { fechaLarga } from '@/lib/formato';
import type { ReservaPorToken } from '@/lib/tipos';

/** Ver y cancelar un turno con el enlace. Sin cuenta: el token es la llave. */
export function CancelarTurno({ token, reserva }: { token: string; reserva: ReservaPorToken }) {
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
      setError(e?.message ?? 'No se pudo cancelar. Probá de nuevo.');
    } finally {
      setCargando(false);
      setConfirmando(false);
    }
  }

  if (!reserva.existe) {
    return (
      <Marco>
        <h1 className="text-[19px] font-bold tracking-tight">No encontramos este turno</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-tinta/60">
          Puede que el enlace esté incompleto. Fijate de copiarlo entero, o escribile al local.
        </p>
      </Marco>
    );
  }

  const hora = new Date(reserva.inicia!).toLocaleTimeString('es-PY', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const cancelada = estado === 'cancelada';
  const cerrada = estado === 'atendida' || estado === 'no_vino';

  return (
    <Marco>
      <p className="text-[12px] font-bold uppercase tracking-wider text-tinta/40">{reserva.negocio}</p>
      <h1 className="mt-1 text-[22px] font-bold tracking-tight">
        {cancelada ? 'Turno cancelado' : 'Tu turno'}
      </h1>

      <div className={`mt-4 rounded-2xl border p-4 ${
        cancelada ? 'border-borde bg-arena' : 'border-verde/30 bg-verde-claro'
      }`}>
        <p className={`text-[16px] font-semibold ${cancelada ? 'text-tinta/45 line-through' : 'text-verde-fuerte'}`}>
          {fechaLarga(reserva.inicia!.slice(0, 10), 'es-PY')} a las {hora}
        </p>
        <p className={`mt-1 text-[14px] ${cancelada ? 'text-tinta/40' : 'text-tinta/70'}`}>
          {reserva.servicio} con {reserva.con}
        </p>
        <p className="mt-1 text-[13px] text-tinta/45">A nombre de {reserva.cliente}</p>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
          {error}
        </p>
      )}

      {cancelada ? (
        <p className="mt-4 text-[14px] leading-relaxed text-tinta/60">
          Listo, el lugar quedó libre para otra persona. Si querés volver a reservar, entrá por el
          link del local.
        </p>
      ) : cerrada ? (
        <p className="mt-4 text-[14px] leading-relaxed text-tinta/60">
          Este turno ya pasó.
        </p>
      ) : confirmando ? (
        <div className="mt-5 space-y-2">
          <p className="text-[14px] font-medium">¿Seguro que no vas a venir?</p>
          <div className="flex gap-2">
            <button
              type="button" className="boton-suave flex-1 py-2.5"
              onClick={() => setConfirmando(false)} disabled={cargando}
            >
              Mantener el turno
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl bg-rojo py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
              onClick={cancelar} disabled={cargando}
            >
              {cargando ? 'Cancelando…' : 'Sí, cancelar'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button" className="boton-suave mt-5 w-full py-2.5"
            onClick={() => setConfirmando(true)}
          >
            No voy a poder venir
          </button>
          <p className="mt-2 text-center text-[12.5px] leading-snug text-tinta/45">
            Avisar a tiempo le deja el lugar a otra persona.
          </p>
        </>
      )}
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-arena">
      <div className="mx-auto max-w-md px-4 pb-16 pt-10">
        <div className="rounded-2xl border border-borde bg-white p-5">{children}</div>
        <p className="mt-8 text-center text-[11.5px] text-tinta/35">Turnos con Orden</p>
      </div>
    </div>
  );
}
