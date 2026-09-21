'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { dinero, fechaLegible } from '@/lib/formato';
import { useLocale, useTextos } from '@/i18n/cliente';
import type { Billetera, MovimientoSinCuenta } from '@/lib/tipos';

/**
 * LA PLATA QUE SE CARGÓ Y NO ESTÁ EN NINGUNA CUENTA (083).
 *
 * Cada forma de pago vive en UNA cuenta: transferencia en el banco, efectivo
 * en la caja. Lo que se carga con una forma de pago que ninguna cuenta
 * reclama se guardaba igual y **desaparecía del saldo sin decir nada**. En
 * la base real había Gs. 13.000.000 así.
 *
 * Esta tarjeta existe para que eso deje de ser invisible. No adivina dónde
 * va cada movimiento —mandarlo a una cuenta cualquiera para que el total
 * cierre sería cambiar un número que miente por otro que miente distinto—:
 * lo muestra con su forma de pago, que es el dato que le permite a la
 * persona acordarse de dónde salió, y le da el botón para ubicarlo.
 *
 * Solo aparece cuando hay algo que arreglar. Una billetera sana no la ve.
 */
export function PlataSinCuenta({ empresaId, moneda, billetera }: {
  empresaId: string;
  moneda: string;
  billetera: Billetera;
}) {
  const t = useTextos();
  const b = t.billetera;
  const locale = useLocale();
  const router = useRouter();

  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<MovimientoSinCuenta[] | 'cargando' | 'error'>('cargando');
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');

  const { cantidad } = billetera.sinCuenta;
  const cuentas = billetera.cuentas;

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    (async () => {
      try {
        const { data, error: e } = await clienteNavegador()
          .rpc('movimientos_sin_cuenta', { p_empresa: empresaId });
        if (!vivo) return;
        setLista(e || data == null ? 'error' : (data as MovimientoSinCuenta[]));
      } catch {
        if (vivo) setLista('error');
      }
    })();
    return () => { vivo = false; };
  }, [abierto, empresaId]);

  async function asignar(cuentaId: string, movimientoId: string | null) {
    setTrabajando(movimientoId ?? 'todos');
    setError('');
    try {
      const { error: e } = await clienteNavegador().rpc('asignar_cuenta_a_sueltos', {
        p_empresa: empresaId, p_cuenta: cuentaId, p_movimiento: movimientoId,
      });
      if (e) throw e;
      router.refresh();
      setLista((previa) => (Array.isArray(previa) && movimientoId
        ? previa.filter((m) => m.id !== movimientoId)
        : []));
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
    } finally {
      setTrabajando('');
    }
  }

  // Sin cuentas creadas todavía no hay nada que reprochar: la billetera ya
  // invita a cargarlas, y todo lo cargado va a esperar ahí.
  if (cantidad === 0 || cuentas.length === 0) return null;

  return (
    <section className="tarjeta overflow-hidden border-ambar/35">
      <div className="bg-ambar-claro/50 px-5 py-4">
        <p className="text-[14.5px] font-bold text-ambar">{b.sinCuentaTitulo(cantidad)}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-tinta/65">
          {b.sinCuentaDetalle(dinero(Math.abs(billetera.sinCuenta.neto), moneda, true, locale))}
        </p>
        {billetera.sinCuenta.desde && (
          <p className="mt-1 text-[12.5px] text-tinta/50">
            {b.sinCuentaDesde(fechaLegible(billetera.sinCuenta.desde, true, locale))}
          </p>
        )}
        <button type="button" onClick={() => setAbierto((v) => !v)} className="boton-texto mt-2.5">
          {abierto ? t.comun.cerrar : b.sinCuentaVer}
        </button>
      </div>

      {abierto && (
        <div className="px-5 py-4">
          {error && <p className="mb-3 text-[13px] font-medium text-rojo">{error}</p>}

          {lista === 'cargando' && <p className="text-[13px] text-tinta/40">{t.comun.cargando}</p>}
          {lista === 'error' && <p className="text-[13px] text-ambar">{t.errores.generico}</p>}

          {Array.isArray(lista) && lista.length === 0 && (
            <p className="text-[13px] text-tinta/50">{b.sinCuentaListo}</p>
          )}

          {Array.isArray(lista) && lista.length > 0 && (
            <>
              <ul className="divide-y divide-borde">
                {lista.map((m) => (
                  <li key={m.id} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold">{m.descripcion}</span>
                        <span className="block text-[12px] text-tinta/50">
                          {fechaLegible(m.fecha, true, locale)} · {t.metodos[m.metodo_pago] ?? m.metodo_pago}
                        </span>
                      </span>
                      <span className={`shrink-0 text-[14px] font-bold tabular-nums ${
                        m.tipo === 'gasto' ? 'text-rojo' : 'text-verde-fuerte'
                      }`}>
                        {m.tipo === 'gasto' ? '−' : '+'}{dinero(Number(m.monto), moneda, true, locale)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {cuentas.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={trabajando !== ''}
                          onClick={() => asignar(c.id, m.id)}
                          className="chip-apagado disabled:opacity-50"
                        >
                          {c.nombre}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Todo junto: lo normal es que sea una sola cuenta la que se
                  olvidó de reclamar su forma de pago, así que una por una
                  sería castigarlo por un error que no cometió. */}
              <div className="mt-4 border-t border-borde pt-3">
                <p className="text-[12.5px] font-semibold text-tinta/60">{b.sinCuentaTodos}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {cuentas.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={trabajando !== ''}
                      onClick={() => asignar(c.id, null)}
                      className="chip-apagado disabled:opacity-50"
                    >
                      {c.nombre}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
