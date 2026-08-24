'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, decimalesDe, fechaLegible } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import type { Movimiento, Rol } from '@/lib/tipos';
import { Vacio, Seccion } from '@/components/Piezas';
import { puedeAnular } from '@/lib/permisos';
import { mensajeDeError } from '@/lib/errores';
import { DialogoAnular } from '@/components/DialogoAnular';

/**
 * Las seis que más se usan van como chips: un toque y listo. El resto sigue
 * disponible escribiendo en el campo, que tiene autocompletado.
 */
const RAPIDAS_GASTO = ['Mercadería', 'Transporte', 'Comida', 'Servicios', 'Publicidad', 'Otros'];
const RAPIDAS_INGRESO = ['Aporte', 'Préstamo', 'Devolución', 'Otros'];
const SUGERIDAS = ['Mercadería', 'Transporte', 'Comida', 'Publicidad', 'Servicios', 'Alquiler', 'Sueldos', 'Impuestos', 'Otros'];

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function PantallaGastos({
  empresaId, moneda, movimientos, categoriasUsadas, rol, userId, hoy, hayMas = false,
}: {
  empresaId: string;
  moneda: string;
  /** Solo la primera página. Los totales del periodo vienen agregados de la base. */
  movimientos: Movimiento[];
  categoriasUsadas: string[];
  rol: Rol;
  userId: string;
  hoy: string;
  hayMas?: boolean;
}) {
  const router = useRouter();
  const dec = decimalesDe(moneda);

  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState<number>(0);
  const [categoria, setCategoria] = useState('Mercadería');
  const [fecha, setFecha] = useState(hoyISO());
  const [metodo, setMetodo] = useState('efectivo');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [aAnular, setAAnular] = useState<Movimiento | null>(null);
  const [masOpciones, setMasOpciones] = useState(false);

  const rapidas = tipo === 'gasto' ? RAPIDAS_GASTO : RAPIDAS_INGRESO;

  const categorias = Array.from(new Set([...categoriasUsadas, ...SUGERIDAS])).filter(Boolean);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (monto <= 0) { setError('Poné un monto mayor a cero.'); return; }
    // La descripción es opcional: si no la escribís, queda la categoría.
    // Escribir texto con el teclado en medio del día es lo que más frena.

    setGuardando(true);
    try {
      const supabase = clienteNavegador();
      const { error } = await supabase.from('movimientos').insert({
        empresa_id: empresaId,
        tipo,
        fecha,
        descripcion: descripcion.trim() || categoria.trim() || 'General',
        categoria: categoria.trim() || 'General',
        // Un gasto o ingreso no lleva descuento: subtotal y monto son lo mismo.
        subtotal: monto,
        descuento: 0,
        monto,
        costo_total: 0,
        metodo_pago: metodo,
        contraparte: '',
        notas: notas.trim(),
        origen: 'manual',
      });
      if (error) throw error;
      setExito(`${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} registrado · ${dinero(monto, moneda)}`);
      setDescripcion(''); setMonto(0); setNotas('');
      setMasOpciones(false);
      router.refresh();
      setTimeout(() => setExito(''), 3400);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id: string, motivo: string) {
    const supabase = clienteNavegador();
    const { error } = await supabase.rpc('anular_movimiento', {
      p_movimiento: id,
      p_motivo: motivo || null,
    });
    if (error) throw new Error(mensajeDeError(error, 'No se pudo anular.'));
    setAAnular(null);
    router.refresh();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      {exito && (
        <div className="fixed inset-x-0 top-[60px] z-50 px-3 lg:top-24" role="status" aria-live="polite">
          <div className={`destello mx-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3.5 text-white shadow-[0_12px_34px_-8px_rgba(13,27,22,.5)] ${
            tipo === 'gasto' ? 'bg-rojo' : 'bg-verde'
          }`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </span>
            <p className="text-[15.5px] font-bold leading-tight">{exito}</p>
          </div>
        </div>
      )}
      {/* ------------------------------ formulario ------------------------------ */}
      <div className="tarjeta h-fit p-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-arena p-1">
          {(['gasto', 'ingreso'] as const).map((t) => (
            <button
              key={t} type="button" onClick={() => { setTipo(t); setCategoria(t === 'gasto' ? 'Mercadería' : 'Otros ingresos'); }}
              className={`rounded-lg py-2 text-[13.5px] font-bold transition ${
                tipo === t ? 'bg-white shadow-sm ' + (t === 'gasto' ? 'text-rojo' : 'text-verde-fuerte') : 'text-tinta/50'
              }`}
            >
              {t === 'gasto' ? 'Salió plata' : 'Entró plata'}
            </button>
          ))}
        </div>

        {/* Tres toques: monto, categoría, guardar. Todo lo demás tiene un
            valor por defecto razonable y está plegado. */}
        <form onSubmit={guardar} className="mt-4 space-y-3">
          <label className="block">
            <span className="etiqueta">¿Cuánto?</span>
            <input
              type="number" inputMode="decimal" min={0} step={dec === 0 ? 1 : 0.01}
              className="campo text-[26px] font-bold tabular-nums" autoFocus
              value={monto || ''} placeholder="0"
              onChange={(e) => setMonto(Math.max(0, Number(e.target.value) || 0))}
            />
            {monto > 0 && <span className="mt-1 block text-[13px] font-semibold text-tinta/50">{dinero(monto, moneda)}</span>}
          </label>

          <div>
            <span className="etiqueta">¿En qué?</span>
            <div className="flex flex-wrap gap-2">
              {rapidas.map((c) => (
                <button
                  key={c} type="button" onClick={() => setCategoria(c)}
                  className={categoria === c ? 'chip-encendido' : 'chip-apagado'}
                >
                  {c}
                </button>
              ))}
            </div>
            {!rapidas.includes(categoria) && (
              <input
                className="campo mt-2" list="categorias-gasto" maxLength={40}
                placeholder="Otra categoría"
                value={categoria} onChange={(e) => setCategoria(e.target.value)}
              />
            )}
            <datalist id="categorias-gasto">
              {categorias.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          <button
            type="button" onClick={() => setMasOpciones((v) => !v)}
            className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-1 text-[13.5px] font-semibold text-tinta/50"
          >
            {masOpciones ? 'Menos detalles' : 'Agregar detalle, fecha o forma de pago'}
            <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${masOpciones ? 'rotate-180' : ''}`} {...trazo}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {masOpciones && (
            <div className="space-y-3 aparecer">
              <label className="block">
                <span className="etiqueta">Detalle <span className="font-normal text-tinta/35">(si no ponés nada, queda &laquo;{categoria || 'General'}&raquo;)</span></span>
                <input
                  className="campo" maxLength={120}
                  placeholder={tipo === 'gasto' ? 'Ej. Combustible para el reparto' : 'Ej. Aporte de socio'}
                  value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                />
              </label>

              <div>
                <span className="etiqueta">Forma de pago</span>
                <div className="scroll-limpio flex gap-2 overflow-x-auto">
                  {[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta'], ['credito', 'Crédito'], ['otro', 'Otro']].map(([v, etiqueta]) => (
                    <button
                      key={v} type="button" onClick={() => setMetodo(v)}
                      className={metodo === v ? 'chip-encendido' : 'chip-apagado'}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="etiqueta">Fecha</span>
                  <input type="date" className="campo py-2.5" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </label>
                <label className="block">
                  <span className="etiqueta">Nota</span>
                  <input className="campo py-2.5" maxLength={200} placeholder="Opcional" value={notas} onChange={(e) => setNotas(e.target.value)} />
                </label>
              </div>
            </div>
          )}

          {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

          <button className="boton-principal min-h-[52px] w-full text-[16px]" disabled={guardando || monto <= 0}>
            {guardando ? 'Guardando…' : monto > 0 ? `Guardar ${dinero(monto, moneda)}` : 'Guardar'}
          </button>
        </form>
      </div>

      {/* ------------------------------ listado ------------------------------ */}
      <Seccion titulo={hayMas ? 'Últimos movimientos del periodo' : 'Movimientos del periodo'}>
        {movimientos.length === 0 ? (
          <Vacio titulo="Nada por acá" detalle="Los gastos que cargues en este periodo van a aparecer en esta lista." />
        ) : (
          <ul className="divide-y divide-borde">
            {movimientos.map((mv) => {
              const anulado = mv.estado === 'anulado';
              return (
                <li key={mv.id} className={`flex items-center gap-3 px-4 py-3 ${anulado ? 'bg-arena/60' : ''}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    anulado ? 'bg-borde text-tinta/35'
                      : mv.tipo === 'gasto' ? 'bg-rojo-claro text-rojo' : 'bg-verde-claro text-verde-fuerte'
                  }`}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
                      {mv.tipo === 'gasto' ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M12 19V5M6 11l6-6 6 6" />}
                    </svg>
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[14px] font-semibold ${anulado ? 'text-tinta/40 line-through' : ''}`}>
                      {mv.descripcion || 'Sin descripción'}
                    </p>
                    <p className="truncate text-[12px] text-tinta/45">
                      {anulado && <span className="font-bold text-rojo">ANULADO · </span>}
                      {fechaLegible(mv.fecha, false)} · {mv.categoria} · {mv.metodo_pago}
                      {mv.origen !== 'manual' && ' · por voz'}
                    </p>
                  </div>

                  <span className={`shrink-0 text-[14.5px] font-bold tabular-nums ${
                    anulado ? 'text-tinta/35 line-through' : mv.tipo === 'gasto' ? 'text-rojo' : 'text-verde-fuerte'
                  }`}>
                    {mv.tipo === 'gasto' ? '−' : '+'} {dinero(Number(mv.monto), moneda, false)}
                  </span>

                  {puedeAnular({ rol, userId }, mv, hoy) && (
                    <button
                      type="button" onClick={() => setAAnular(mv)}
                      aria-label="Anular movimiento" title="Anular"
                      className="icono-toque shrink-0 text-tinta/25 transition hover:bg-rojo-claro hover:text-rojo"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
                        <circle cx="12" cy="12" r="8.5" /><path d="m6.5 6.5 11 11" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {hayMas && (
          <p className="border-t border-borde px-4 py-3 text-[12.5px] text-tinta/50">
            Se muestran los más recientes. Los totales de arriba sí incluyen todo el periodo.
            Para ver el resto, entrá al <a href="/movimientos" className="boton-texto">historial completo</a>.
          </p>
        )}
      </Seccion>

      {aAnular && (
        <DialogoAnular
          movimiento={aAnular}
          moneda={moneda}
          onCerrar={() => setAAnular(null)}
          onConfirmar={(motivo) => anular(aAnular.id, motivo)}
        />
      )}
    </div>
  );
}
