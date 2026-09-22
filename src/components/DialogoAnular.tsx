'use client';

import { useState } from 'react';
import { useTextos, useLocale } from '@/i18n/cliente';
import { type Moneda, dinero, fechaLegible } from '@/lib/formato';
import type { Movimiento } from '@/lib/tipos';

/**
 * Anular no borra: deja el movimiento en el historial marcado como anulado,
 * devuelve el stock si era una venta, y guarda quién y por qué.
 */
export function DialogoAnular({
  movimiento, moneda, onCerrar, onConfirmar,
}: {
  movimiento: Movimiento;
  moneda: Moneda;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const t = useTextos();
  const locale = useLocale();
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
      setError(e?.message ?? t.gastos.noSePudoAnular);
      setTrabajando(false);
    }
  }

  const sugerencias = esVenta ? t.movimientos.motivosVenta : t.movimientos.motivosOtro;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-noche/45 backdrop-blur-[2px] sm:items-center sm:px-4"
      onClick={() => !trabajando && onCerrar()}
    >
      <div
        className="zona-segura-abajo max-h-[88vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie p-5 aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[19px] font-bold tracking-tight">
          {t.movimientos.anularPregunta(movimiento.tipo)}
        </h2>

        <div className="mt-3 rounded-xl bg-arena p-3.5">
          <p className="text-[14px] font-semibold">{movimiento.descripcion || t.gastos.sinDescripcion}</p>
          <p className="mt-0.5 text-[13px] text-tinta/55">
            {fechaLegible(movimiento.fecha, true, locale)} · {dinero(Number(movimiento.monto), moneda)}
          </p>
        </div>

        <ul className="mt-3.5 space-y-1.5 text-[13.5px] leading-relaxed text-tinta/65">
          <li>{t.pantallas.anularQueda}</li>
          <li>{t.pantallas.anularDejaSumar}</li>
          {esVenta && unidades > 0 && (
            <li>{t.pantallas.anularVuelven} <strong className="text-tinta">{t.movimientos.unidades(unidades)}</strong> {t.movimientos.alStock}</li>
          )}
          <li>{t.pantallas.anularQuienFue}</li>
        </ul>

        <div className="mt-4">
          <label className="etiqueta" htmlFor="motivo-anulacion">{t.pantallas.motivo}<span className="font-normal text-tinta/35"> {t.movimientos.opcional}</span></label>
          <input
            // Sin autoFocus: el motivo es opcional, y el teclado que subía solo
            // tapaba las sugerencias y los botones de anular.
            id="motivo-anulacion" className="campo" maxLength={200}
            placeholder={t.pantallas.motivoEjemplo} value={motivo}
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
          <button className="boton-suave py-3" onClick={onCerrar} disabled={trabajando}>{t.pantallas.noDejarla}</button>
          <button className="boton-peligro py-3" onClick={confirmar} disabled={trabajando}>
            {trabajando ? t.movimientos.anulando : t.movimientos.siAnular}
          </button>
        </div>
      </div>
    </div>
  );
}
