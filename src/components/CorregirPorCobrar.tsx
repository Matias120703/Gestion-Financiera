'use client';

import { useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { decimalesDe, dinero } from '@/lib/formato';
import { useLocale, useTextos } from '@/i18n/cliente';
import { CampoMonto } from '@/components/CampoMonto';
import type { PorCobrarAlumnos } from '@/lib/tipos';

type Fila = PorCobrarAlumnos['lista'][number];

/**
 * CORREGIR LO QUE FALTA COBRAR (116).
 *
 * Matías: «si erré, sin querer puse de más o de menos y acepté, donde dice
 * Por cobrar tengo que tener la opción de editar cuánto». Anotó Gs.
 * 8.775.000 donde era mucho menos, y la única salida que encontró fue
 * eliminar al alumno —y la deuda se quedó igual—.
 *
 * Es una hoja con dos cosas, en este orden:
 *
 *   · el monto, que es lo que casi siempre está mal. Se escribe con los
 *     puntos de miles mientras se teclea, como todo monto de Orden
 *     (CampoMonto), y con los decimales de la moneda;
 *   · y, abajo y aparte, «No lo voy a cobrar», para lo anotado por error o
 *     lo que ya no se va a pedir. Antes de hacerlo dice qué pasa: sin clases
 *     se borra con su agenda; con clases queda cerrado en su ficha. Lo
 *     decide la base (`anular_por_cobrar`); la pantalla solo lo anticipa con
 *     lo que la base le dijo (`tuvo_clases`).
 *
 * Lo cobrado no se corrige acá: la plata ya entró. Si hace falta, se anula el
 * cobro en el Historial y vuelve a quedar por cobrar (el mensaje de la base
 * lo dice).
 */
export function CorregirPorCobrar({
  fila, moneda, alCerrar, alListo,
}: {
  fila: Fila;
  moneda: string;
  alCerrar: () => void;
  /** Ya se guardó: quien la abrió vuelve a leer. */
  alListo: () => Promise<void> | void;
}) {
  const t = useTextos();
  const i = t.inscribir;
  const locale = useLocale();
  const plata = (n: number) => dinero(n, moneda, true, locale);

  const [monto, setMonto] = useState(Number(fila.monto) || 0);
  const [sacando, setSacando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const cambio = monto > 0 && monto !== Number(fila.monto);

  async function correr(fn: () => PromiseLike<{ error: unknown }>) {
    setOcupado(true);
    setError('');
    try {
      const { error: e } = await fn();
      if (e) throw e;
      await alListo();
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      setOcupado(false);
    }
  }

  const guardar = () => correr(() => clienteNavegador().rpc('cambiar_precio_paquete', {
    p_paquete: fila.paquete, p_precio: monto,
  }));

  const noCobrar = () => correr(() => clienteNavegador().rpc('anular_por_cobrar', {
    p_paquete: fila.paquete,
  }));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-noche/45 backdrop-blur-[2px] sm:items-center sm:px-4"
      onClick={() => !ocupado && alCerrar()}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="corregir-por-cobrar"
        className="zona-segura-abajo max-h-[88vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie p-5 aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="corregir-por-cobrar" className="truncate text-[19px] font-bold tracking-tight">{fila.alumno}</h2>
        <p className="truncate text-[13px] text-tinta/55">
          {fila.materia ? `${fila.materia} · ${fila.nombre}` : fila.nombre}
        </p>

        {sacando ? (
          // Sacarlo es lo único de acá que no se arregla con otro «Guardar»:
          // se pregunta, y se dice qué va a pasar.
          <div className="mt-4 space-y-2.5 rounded-xl bg-rojo-claro px-3.5 py-3 aparecer">
            <p className="text-[14px] font-bold text-rojo">{i.noCobrarPregunta(fila.alumno, plata(Number(fila.monto)))}</p>
            <p className="text-[13px] leading-snug text-tinta/70">
              {fila.tuvo_clases ? i.noCobrarConClases : i.noCobrarSinClases}
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <label className="etiqueta" htmlFor="monto-por-cobrar">{i.montoCorrecto}</label>
            <CampoMonto
              id="monto-por-cobrar" className="campo" decimales={decimalesDe(moneda)} placeholder="0"
              valor={monto} alCambiar={setMonto} autoFocus disabled={ocupado}
            />
            <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{i.montoAyuda}</p>
          </div>
        )}

        {error && <p className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

        {sacando ? (
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button type="button" className="boton-suave py-3" onClick={() => { setSacando(false); setError(''); }} disabled={ocupado}>
              {t.clientes.no}
            </button>
            <button type="button" className="boton-peligro py-3" onClick={noCobrar} disabled={ocupado}>
              {ocupado ? t.comun.guardando : i.siSacar}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button type="button" className="boton-suave py-3" onClick={alCerrar} disabled={ocupado}>
                {t.comun.cancelar}
              </button>
              <button type="button" className="boton-principal py-3" onClick={guardar} disabled={ocupado || !cambio}>
                {ocupado ? t.comun.guardando : t.comun.guardar}
              </button>
            </div>
            {/* Abajo y separado: es lo menos frecuente, y lo único que saca
                la inscripción de la lista. */}
            <div className="mt-4 border-t border-borde pt-4">
              <button
                type="button" disabled={ocupado}
                onClick={() => { setSacando(true); setError(''); }}
                className="boton min-h-[44px] border border-rojo/30 px-4 py-2 text-[13px] text-rojo hover:bg-rojo-claro"
              >
                {i.noCobrar}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
