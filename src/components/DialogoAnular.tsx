'use client';

import { useState } from 'react';
import { dinero, fechaLegible } from '@/lib/formato';
import type { Movimiento } from '@/lib/tipos';

const MOTIVOS_VENTA = ['El cliente devolvió', 'Me equivoqué al cargar', 'Se cargó dos veces', 'No se concretó'];
const MOTIVOS_OTRO = ['Me equivoqué al cargar', 'Se cargó dos veces', 'No correspondía'];

/**
 * Anular no borra: deja el movimiento en el historial marcado como anulado,
 * devuelve el stock si era una venta, y guarda quién y por qué.
 */
export function DialogoAnular({
  movimiento, moneda, onCerrar, onConfirmar,
}: {
  movimiento: Movimiento;
  moneda: string;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');

  const esVenta = movimiento.tipo === 'venta';
  const unidades = (movimiento.movimiento_items ?? [])
    .filter((i) => i.afecto_stock)
    .reduce((s, i) => s + Number(i.cantidad), 0);

  async function confirmar() {
    setTrabajando(true);
    setError('');
    try {
      await onConfirmar(motivo.trim());
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo anular.');
      setTrabajando(false);
    }
  }

  const sugerencias = esVenta ? MOTIVOS_VENTA : MOTIVOS_OTRO;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/45 backdrop-blur-[2px] sm:items-center sm:px-4"
      onClick={() => !trabajando && onCerrar()}
    >
      <div
        className="zona-segura-abajo w-full max-w-md rounded-t-3xl bg-white p-5 aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[19px] font-bold tracking-tight">
          ¿Anular {esVenta ? 'esta venta' : movimiento.tipo === 'gasto' ? 'este gasto' : 'este ingreso'}?
        </h2>

        <div className="mt-3 rounded-xl bg-arena p-3.5">
          <p className="text-[14px] font-semibold">{movimiento.descripcion || 'Sin descripción'}</p>
          <p className="mt-0.5 text-[13px] text-tinta/55">
            {fechaLegible(movimiento.fecha)} · {dinero(Number(movimiento.monto), moneda)}
          </p>
        </div>

        <ul className="mt-3.5 space-y-1.5 text-[13.5px] leading-relaxed text-tinta/65">
          <li>· Queda en el historial marcada como anulada, no se borra.</li>
          <li>· Deja de sumar en el panel, los reportes, el reto y el Excel.</li>
          {esVenta && unidades > 0 && (
            <li>· Vuelven <strong className="text-tinta">{unidades} unidad{unidades === 1 ? '' : 'es'}</strong> al stock.</li>
          )}
          <li>· Queda registrado que la anulaste vos.</li>
        </ul>

        <div className="mt-4">
          <label className="etiqueta" htmlFor="motivo-anulacion">Motivo <span className="font-normal text-tinta/35">(opcional)</span></label>
          <input
            id="motivo-anulacion" className="campo" maxLength={200} autoFocus
            placeholder="Para acordarte después" value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sugerencias.map((s) => (
              <button
                key={s} type="button" onClick={() => setMotivo(s)}
                className="rounded-full border border-borde px-2.5 py-1 text-[12px] font-semibold text-tinta/55 hover:border-verde hover:text-verde-fuerte"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button className="boton-suave py-3" onClick={onCerrar} disabled={trabajando}>No, dejarla</button>
          <button className="boton-peligro py-3" onClick={confirmar} disabled={trabajando}>
            {trabajando ? 'Anulando…' : 'Sí, anular'}
          </button>
        </div>
      </div>
    </div>
  );
}
