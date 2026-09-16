'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { fechaLegible, simboloDe } from '@/lib/formato';
import { useTextos, useLocale } from '@/i18n/cliente';
import { Rico } from '@/components/Rico';

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
  const t = useTextos();
  const a = t.ajustes;
  const locale = useLocale();
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
      if (!moneda) { setError(a.elegiMoneda); return; }
      if (!Number.isFinite(n) || n <= 0) {
        setError(a.poneElCambio);
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
      setMensaje(apagar ? a.volvisteA(simboloDe(monedaPropia)) : a.guardadoPunto);
      router.refresh();
      setTimeout(() => setMensaje(''), 3000);
    } catch (e: any) {
      setError(mensajeDeError(e, t.gastos.noSePudoGuardar));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-tinta/60">
        <Rico texto={a.monedaExplicacion(simboloDe(monedaPropia))} negrita="text-tinta" />
      </p>

      {activa && (
        <p className="rounded-xl bg-verde-claro/50 px-3 py-2.5 text-[13px] leading-relaxed text-tinta/75">
          <Rico texto={a.estasViendoEn(simboloDe(monedaVista!), Number(cotizacion).toLocaleString(locale))} negrita="text-tinta" />
          {cotizacionAt && <> · {a.cargadoEl(fechaLegible(cotizacionAt.slice(0, 10), true, locale))}</>}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="etiqueta">{a.verEn}</span>
          <select
            className="campo" disabled={!puedeEditar || guardando}
            value={moneda} onChange={(e) => setMoneda(e.target.value)}
          >
            <option value="">{a.miMoneda(simboloDe(monedaPropia))}</option>
            {opciones.map((m) => (
              <option key={m} value={m}>{simboloDe(m)}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="etiqueta">
            {moneda ? a.cuantosPor(simboloDe(moneda), simboloDe(monedaPropia)) : a.aCuantoEsta}
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
            {guardando ? t.comun.guardando : a.verEnEstaMoneda}
          </button>
          {activa && (
            <button
              type="button" onClick={() => guardar(true)}
              disabled={guardando}
              className="boton-texto px-4 text-tinta/55"
            >
              {a.volverA(simboloDe(monedaPropia))}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
