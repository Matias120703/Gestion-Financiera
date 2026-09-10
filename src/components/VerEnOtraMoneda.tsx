'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { fechaLegible, simboloDe } from '@/lib/formato';

const MONEDAS = ['USD', 'BRL', 'ARS', 'EUR', 'PYG'] as const;

/**
 * VER LOS NÚMEROS EN OTRA MONEDA
 *
 * No cambia la moneda del negocio: la de arriba, la que dice en qué cargás,
 * sigue siendo la misma y todo lo guardado sigue estando en ella. Esto es un
 * par de anteojos.
 *
 * LA COTIZACIÓN LA ESCRIBE EL NEGOCIO, Y ES A PROPÓSITO
 *
 * No hay «el» cambio: está el del banco, el de la casa de cambio de la
 * esquina y el que le hizo su proveedor. Traerlo de una API sería inventar
 * una precisión que no tenemos y, peor, cambiaría los números de ayer sin
 * que nadie toque nada.
 *
 * Por eso también se muestra CUÁNDO se cargó. Un cambio de hace tres meses
 * presentado como número de hoy es otra forma de mentir, y el único que
 * puede decidir si todavía sirve es el que lo puso.
 */
export function VerEnOtraMoneda({
  empresaId, monedaPropia, monedaVista, cotizacion, cotizacionAt, puedeEditar,
}: {
  empresaId: string;
  monedaPropia: string;
  monedaVista: string | null;
  cotizacion: number | null;
  cotizacionAt: string | null;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [moneda, setMoneda] = useState(monedaVista ?? '');
  const [cambio, setCambio] = useState(cotizacion != null ? String(cotizacion) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const opciones = MONEDAS.filter((m) => m !== monedaPropia);
  const activa = Boolean(monedaVista);

  async function guardar(apagar = false) {
    setError(''); setMensaje('');
    const n = Number(cambio.replace(',', '.'));
    if (!apagar) {
      if (!moneda) { setError('Elegí en qué moneda querés ver tus números.'); return; }
      if (!Number.isFinite(n) || n <= 0) {
        setError('Poné a cuánto está el cambio. Sin eso no se puede convertir nada.');
        return;
      }
    }
    setGuardando(true);
    try {
      const { error: e } = await clienteNavegador().rpc('guardar_vista_moneda', {
        p_empresa: empresaId,
        p_moneda: apagar ? null : moneda,
        p_cotizacion: apagar ? null : n,
      });
      if (e) throw e;
      if (apagar) { setMoneda(''); setCambio(''); }
      setMensaje(apagar ? `Volviste a ver en ${simboloDe(monedaPropia)}` : 'Guardado.');
      router.refresh();
      setTimeout(() => setMensaje(''), 3000);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-tinta/60">
        Tus datos siguen guardados en <strong className="text-tinta">{simboloDe(monedaPropia)}</strong>.
        Esto solo cambia cómo los ves en el panel, el cierre, los movimientos y los reportes.
        {' '}<strong className="text-tinta">Donde cargás plata seguís escribiendo
        en {simboloDe(monedaPropia)}</strong>, para que no se guarde un número en una moneda
        y se lea en otra.
      </p>

      {activa && (
        <p className="rounded-xl bg-verde-claro/50 px-3 py-2.5 text-[13px] leading-relaxed text-tinta/75">
          Ahora estás viendo en <strong className="text-tinta">{simboloDe(monedaVista!)}</strong>,
          al cambio <strong className="text-tinta">{Number(cotizacion).toLocaleString('es-PY')}</strong>
          {cotizacionAt && <> · cargado el {fechaLegible(cotizacionAt.slice(0, 10))}</>}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="etiqueta">Ver en</span>
          <select
            className="campo" disabled={!puedeEditar || guardando}
            value={moneda} onChange={(e) => setMoneda(e.target.value)}
          >
            <option value="">{simboloDe(monedaPropia)} (mi moneda)</option>
            {opciones.map((m) => (
              <option key={m} value={m}>{simboloDe(m)}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="etiqueta">
            {moneda ? `1 ${simboloDe(moneda)} = cuántos ${simboloDe(monedaPropia)}` : 'A cuánto está'}
          </span>
          <input
            type="number" min={0} step="any" inputMode="decimal"
            className="campo tabular-nums" disabled={!puedeEditar || guardando || !moneda}
            placeholder="7300"
            value={cambio} onChange={(e) => setCambio(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
      {mensaje && <p className="rounded-xl bg-verde-claro px-3 py-2.5 text-[13px] font-semibold text-verde-fuerte">✓ {mensaje}</p>}

      {puedeEditar && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button" onClick={() => guardar(false)}
            disabled={guardando || !moneda}
            className="boton-principal flex-1 py-2.5 disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Ver en esta moneda'}
          </button>
          {activa && (
            <button
              type="button" onClick={() => guardar(true)}
              disabled={guardando}
              className="boton-texto px-4 text-tinta/55"
            >
              Volver a {simboloDe(monedaPropia)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
