'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { fechaLegible, simboloDe } from '@/lib/formato';
import { avisoDolar, cambioDesde } from '@/lib/agricultura';
import { useTextos, useLocale } from '@/i18n/cliente';
import { Rico } from '@/components/Rico';

const MONEDAS = ['USD', 'BRL', 'ARS', 'EUR', 'PYG'] as const;

/**
 * La pareja de siempre en Paraguay: el negocio en guaraníes que mira en
 * dólares, o el sojero que lleva todo en dólares y quiere ver guaraníes.
 * En las dos direcciones se pregunta lo mismo, «¿a cuánto está el dólar?»,
 * porque es lo único que la gente sabe de memoria.
 */
function esParDolar(propia: string, vista: string): boolean {
  return (propia === 'PYG' && vista === 'USD') || (propia === 'USD' && vista === 'PYG');
}

/**
 * Lo que la persona ve escrito en la casilla a partir de lo guardado. La
 * cotización guardada es cuánto vale 1 de la vista en la propia (051): para
 * un negocio en dólares que mira en guaraníes es 1/6.000, y nadie reconoce
 * «0,0001666666667». Se muestra el dólar.
 */
function valorVisible(propia: string, vista: string, cotizacion: number | null): string {
  if (cotizacion == null || !(Number(cotizacion) > 0)) return '';
  const c = Number(cotizacion);
  if (!esParDolar(propia, vista) || propia === 'PYG') return String(c);
  return String(Math.round((1 / c) * 100) / 100);
}

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
 *
 * EL DÓLAR EN LAS DOS DIRECCIONES (100)
 *
 * Antes la casilla decía «1 Gs. = cuántos US$» a un negocio en dólares:
 * había que escribir 0,000166 y nadie lo hacía bien. Ahora, para la pareja
 * guaraní/dólar, se pregunta siempre «¿A cuánto está el dólar?», se escribe
 * 6.000 y la pantalla guarda lo que corresponde: 6.000 si el negocio va en
 * guaraníes, 1/6.000 con diez decimales si va en dólares (la columna se
 * agrandó en la 100 justo para eso: con seis decimales se perdía un 0,2 %).
 * El dólar avisa fuera de 5.000–9.000 y no deja guardar fuera de
 * 3.000–20.000: un cero de más multiplica todo por diez. Reales, pesos y
 * euros siguen con la pregunta de siempre.
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
  const pm = t.panelCampo.moneda;
  const locale = useLocale();
  const router = useRouter();
  const [moneda, setMoneda] = useState(monedaVista ?? '');
  const [cambio, setCambio] = useState(monedaVista ? valorVisible(monedaPropia, monedaVista, cotizacion) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const opciones = MONEDAS.filter((m) => m !== monedaPropia);
  const activa = Boolean(monedaVista);
  const porDolar = Boolean(moneda) && esParDolar(monedaPropia, moneda);
  const escrito = Number(cambio.replace(',', '.'));
  // El aviso se ve mientras escribe; el bloqueo, al guardar (a medio
  // escribir «60» no es un error todavía).
  const dolarRaro = porDolar && cambio.trim() !== '' && Number.isFinite(escrito) && avisoDolar(escrito) === 'aviso';

  function elegirMoneda(m: string) {
    setMoneda(m);
    setError('');
    // Cambiar de moneda cambia lo que significa la casilla: se vacía, salvo
    // que vuelva a la que ya estaba guardada.
    setCambio(m && m === monedaVista ? valorVisible(monedaPropia, m, cotizacion) : '');
  }

  async function guardar(apagar = false) {
    setError(''); setMensaje('');
    const n = escrito;
    let cotizacionAGuardar = n;
    if (!apagar) {
      if (!moneda) { setError(a.elegiMoneda); return; }
      if (!Number.isFinite(n) || n <= 0) {
        setError(a.poneElCambio);
        return;
      }
      if (porDolar) {
        if (avisoDolar(n) === 'bloqueo') { setError(pm.dolarImposible); return; }
        // Lo que vale 1 de la vista en la propia: 6.000, o 1/6.000.
        cotizacionAGuardar = cambioDesde(monedaPropia, moneda, n);
      }
    }
    setGuardando(true);
    try {
      const { error: e } = await clienteNavegador().rpc('guardar_vista_moneda', {
        p_empresa: empresaId,
        p_moneda: apagar ? null : moneda,
        p_cotizacion: apagar ? null : cotizacionAGuardar,
      });
      if (e) throw e;
      if (apagar) { setMoneda(''); setCambio(''); }
      setMensaje(apagar
        ? a.volvisteA(simboloDe(monedaPropia))
        : porDolar ? pm.guardado(n.toLocaleString(locale)) : a.guardadoPunto);
      router.refresh();
      setTimeout(() => setMensaje(''), 3000);
    } catch (e: any) {
      setError(mensajeDeError(e, t.gastos.noSePudoGuardar));
    } finally {
      setGuardando(false);
    }
  }

  // Lo guardado, dicho como se piensa: «al cambio 6.000» también para el
  // negocio en dólares, no «al cambio 0,000167».
  const cambioGuardado = monedaVista
    ? (esParDolar(monedaPropia, monedaVista)
      ? Number(valorVisible(monedaPropia, monedaVista, cotizacion)).toLocaleString(locale)
      : Number(cotizacion).toLocaleString(locale))
    : '';

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-tinta/60">
        <Rico texto={a.monedaExplicacion(simboloDe(monedaPropia))} negrita="text-tinta" />
      </p>

      {activa && (
        <p className="rounded-xl bg-verde-claro/50 px-3 py-2.5 text-[13px] leading-relaxed text-tinta/75">
          <Rico texto={a.estasViendoEn(simboloDe(monedaVista!), cambioGuardado)} negrita="text-tinta" />
          {cotizacionAt && <> · {a.cargadoEl(fechaLegible(cotizacionAt.slice(0, 10), true, locale))}</>}
        </p>
      )}

      {/* Una columna en el celular: «¿A cuánto está el dólar?» no entra en
          media pantalla sin partirse y desalinear las dos casillas. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiqueta">{a.verEn}</span>
          <select
            className="campo" disabled={!puedeEditar || guardando}
            value={moneda} onChange={(e) => elegirMoneda(e.target.value)}
          >
            <option value="">{a.miMoneda(simboloDe(monedaPropia))}</option>
            {opciones.map((m) => (
              <option key={m} value={m}>{simboloDe(m)}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="etiqueta">
            {porDolar
              ? pm.cuantoElDolar
              : moneda ? a.cuantosPor(simboloDe(moneda), simboloDe(monedaPropia)) : a.aCuantoEsta}
          </span>
          <input
            type="number" min={0} step="any" inputMode="decimal"
            className="campo tabular-nums" disabled={!puedeEditar || guardando || !moneda}
            placeholder="7300"
            value={cambio} onChange={(e) => { setCambio(e.target.value); setError(''); }}
          />
        </label>
      </div>

      {porDolar && (
        <p className="text-[12.5px] leading-relaxed text-tinta/50">
          {pm.cuantoElDolarDetalle(simboloDe(monedaPropia), simboloDe(moneda))}
        </p>
      )}
      {dolarRaro && (
        <p className="rounded-xl bg-ambar-claro px-3 py-2.5 text-[13px] font-medium text-ambar">{pm.dolarRaro}</p>
      )}

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
      {mensaje && <p className="rounded-xl bg-verde-claro px-3 py-2.5 text-[13px] font-semibold text-verde-fuerte">✓ {mensaje}</p>}

      {puedeEditar && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button" onClick={() => guardar(false)}
            disabled={guardando || !moneda}
            className="boton-principal min-h-[44px] flex-1 py-2.5 disabled:opacity-40"
          >
            {guardando ? t.comun.guardando : a.verEnEstaMoneda}
          </button>
          {activa && (
            <button
              type="button" onClick={() => guardar(true)}
              disabled={guardando}
              className="boton-texto min-h-[44px] px-4 text-tinta/55"
            >
              {a.volverA(simboloDe(monedaPropia))}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
