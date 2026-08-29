'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTextos } from '@/i18n/cliente';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, numero, fechaLarga } from '@/lib/formato';
import type { Movimiento, Rol, TipoMovimiento } from '@/lib/tipos';
import { Vacio } from '@/components/Piezas';
import { puedeAnular } from '@/lib/permisos';
import { mensajeDeError } from '@/lib/errores';
import { Adjuntos } from './Adjuntos';
import { DialogoAnular } from '@/components/DialogoAnular';
import type { Cursor } from '@/lib/agregados';

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const FILTROS: { valor: 'todos' | TipoMovimiento; texto: string }[] = [
  { valor: 'todos', texto: 'Todo' },
  { valor: 'venta', texto: 'Ventas' },
  { valor: 'gasto', texto: 'Gastos' },
  { valor: 'ingreso', texto: 'Otros ingresos' },
];

export function ListaMovimientos({
  movimientos: inicial, cursorInicial, total, desde, hasta,
  moneda, rol, userId, hoy, cargarPagina, empresaId, guardaComprobantes = false,
}: {
  empresaId: string;
  /** Del plan: si el plan no guarda comprobantes, no se ofrece agregarlos. */
  guardaComprobantes?: boolean;
  /** Primera página, renderizada en el servidor. */
  movimientos: Movimiento[];
  cursorInicial: Cursor | null;
  /** Cuántos movimientos hay en total en el periodo (viene de un count agregado). */
  total: number;
  desde: string;
  hasta: string;
  moneda: string;
  rol: Rol;
  userId: string;
  hoy: string;
  cargarPagina: (
    desde: string, hasta: string, cursor: Cursor | null,
    filtros: { tipo?: TipoMovimiento | null; incluirAnuladas?: boolean; busqueda?: string | null },
  ) => Promise<{ movimientos: Movimiento[]; siguiente: Cursor | null }>;
}) {
  const t = useTextos();
  const router = useRouter();
  const [filtro, setFiltro] = useState<'todos' | TipoMovimiento>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [verAnuladas, setVerAnuladas] = useState(true);
  const [aAnular, setAAnular] = useState<Movimiento | null>(null);

  // El historial se pagina contra el servidor: nunca se descarga el periodo
  // entero. Los filtros también viajan al servidor, así no filtramos sobre
  // una porción y damos la impresión de que no hay más resultados.
  const [movimientos, setMovimientos] = useState<Movimiento[]>(inicial);
  const [cursor, setCursor] = useState<Cursor | null>(cursorInicial);
  const [cargando, startTransition] = useTransition();
  const primeraVez = useRef(true);

  // Cuando cambian los filtros, volvemos a pedir la página 1 al servidor.
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }
    const t = setTimeout(() => {
      startTransition(async () => {
        setError('');
        try {
          const r = await cargarPagina(desde, hasta, null, {
            tipo: filtro === 'todos' ? null : filtro,
            incluirAnuladas: verAnuladas,
            busqueda: busqueda.trim() || null,
          });
          setMovimientos(r.movimientos);
          setCursor(r.siguiente);
        } catch {
          // No tocamos la lista ni el cursor: si dejáramos la lista vacía
          // parecería que no hay movimientos, y lo que pasó es que no pudimos
          // leerlos.
          setError('No pudimos cargar el historial. Puede ser la conexión. Probá de nuevo.');
        }
      });
    }, 300);
    return () => clearTimeout(t);
  }, [filtro, busqueda, verAnuladas, desde, hasta, cargarPagina]);

  // Si el servidor vuelve a renderizar (por ejemplo después de anular),
  // arrancamos de nuevo desde la primera página.
  useEffect(() => {
    setMovimientos(inicial);
    setCursor(cursorInicial);
  }, [inicial, cursorInicial]);

  function verMas() {
    if (!cursor || cargando) return;
    startTransition(async () => {
      setError('');
      try {
        const r = await cargarPagina(desde, hasta, cursor, {
          tipo: filtro === 'todos' ? null : filtro,
          incluirAnuladas: verAnuladas,
          busqueda: busqueda.trim() || null,
        });
        setMovimientos((prev) => [...prev, ...r.movimientos]);
        setCursor(r.siguiente);
      } catch {
        // Importante: NO ponemos el cursor en null. Un error no significa
        // "se terminó el historial"; el botón sigue disponible para reintentar.
        setError('No pudimos traer más movimientos. Probá de nuevo.');
      }
    });
  }

  const porDia = useMemo(() => {
    const mapa = new Map<string, Movimiento[]>();
    for (const m of movimientos) {
      const lista = mapa.get(m.fecha) ?? [];
      lista.push(m);
      mapa.set(m.fecha, lista);
    }
    return Array.from(mapa.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [movimientos]);

  async function anular(id: string, motivo: string) {
    setError('');
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta/30" {...trazo}>
            <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
          </svg>
          <input className="campo pl-10" placeholder={t.pantallas.buscarMovimiento}
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div className="scroll-limpio flex gap-2 overflow-x-auto">
          {FILTROS.map((f) => (
            <button
              key={f.valor} type="button" onClick={() => setFiltro(f.valor)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
                filtro === f.valor ? 'border-verde bg-verde text-white' : 'border-borde bg-white text-tinta/60'
              }`}
            >
              {f.texto}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-tinta/55">
        <input
          type="checkbox" className="h-3.5 w-3.5 accent-[#17795a]"
          checked={verAnuladas} onChange={(e) => setVerAnuladas(e.target.checked)}
        />
        Mostrar las anuladas (no suman en ningún total)
      </label>

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      {porDia.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo={t.pantallas.sinMovimientos} detalle={t.pantallas.sinMovimientosDetalle} />
        </div>
      ) : (
        <div className="space-y-4">
          {porDia.map(([fecha, lista]) => {
            const totalDia = lista
              .filter((m) => m.estado !== 'anulado')
              .reduce((s, m) => s + (m.tipo === 'gasto' ? -Number(m.monto) : Number(m.monto)), 0);
            return (
              <div key={fecha} className="tarjeta overflow-hidden">
                <div className="flex items-baseline justify-between gap-3 border-b border-borde px-4 py-2.5">
                  <h3 className="text-[13.5px] font-bold capitalize">{fechaLarga(fecha)}</h3>
                  <span className={`text-[13px] font-bold tabular-nums ${totalDia >= 0 ? 'text-verde-fuerte' : 'text-rojo'}`}>
                    {totalDia >= 0 ? '+' : '−'} {dinero(Math.abs(totalDia), moneda, false)}
                  </span>
                </div>

                <ul className="divide-y divide-borde/70">
                  {lista.map((m) => {
                    const expandido = abierto === m.id;
                    const items = m.movimiento_items ?? [];
                    const ganancia = Number(m.monto) - Number(m.costo_total);
                    const anulado = m.estado === 'anulado';
                    const sePuedeAnular = puedeAnular({ rol, userId }, m, hoy);
                    return (
                      <li key={m.id} className={anulado ? 'bg-arena/60' : ''}>
                        <div className="flex items-center gap-3 px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setAbierto(expandido ? null : m.id)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                              anulado ? 'bg-borde text-tinta/35'
                                : m.tipo === 'gasto' ? 'bg-rojo-claro text-rojo' : 'bg-verde-claro text-verde-fuerte'
                            }`}>
                              <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
                                {m.tipo === 'gasto' ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M12 19V5M6 11l6-6 6 6" />}
                              </svg>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-[14px] font-semibold ${anulado ? 'text-tinta/40 line-through' : ''}`}>
                                {m.descripcion || 'Sin descripción'}
                              </span>
                              <span className="block truncate text-[12px] text-tinta/45">
                                {anulado && <span className="font-bold text-rojo">{t.pantallas.anulada} · </span>}
                                {m.categoria} · {m.metodo_pago}
                                {m.contraparte ? ` · ${m.contraparte}` : ''}
                                {items.length > 0 ? ` · ${items.length} producto${items.length === 1 ? '' : 's'}` : ''}
                                {Number(m.descuento) > 0 ? ` · desc. ${dinero(Number(m.descuento), moneda, false)}` : ''}
                                {m.origen !== 'manual' ? ' · IA' : ''}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className={`block text-[14.5px] font-bold tabular-nums ${
                                anulado ? 'text-tinta/35 line-through' : m.tipo === 'gasto' ? 'text-rojo' : 'text-verde-fuerte'
                              }`}>
                                {m.tipo === 'gasto' ? '−' : '+'} {dinero(Number(m.monto), moneda, false)}
                              </span>
                              {!anulado && m.tipo === 'venta' && Number(m.costo_total) > 0 && (
                                <span className="block text-[11.5px] font-semibold text-tinta/40">
                                  queda {dinero(ganancia, moneda, false)}
                                </span>
                              )}
                            </span>
                          </button>

                          {sePuedeAnular && (
                            <button
                              type="button" onClick={() => setAAnular(m)}
                              aria-label={t.pantallas.anular} title="Anular este movimiento"
                              className="icono-toque shrink-0 text-tinta/25 transition hover:bg-rojo-claro hover:text-rojo"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
                                <circle cx="12" cy="12" r="8.5" /><path d="m6.5 6.5 11 11" />
                              </svg>
                            </button>
                          )}
                        </div>

                        {expandido && (
                          <div className="border-t border-borde/70 bg-arena/60 px-4 py-3 aparecer">
                            {items.length > 0 ? (
                              <table className="w-full text-[13px]">
                                <thead>
                                  <tr className="text-[11px] font-bold uppercase tracking-wider text-tinta/40">
                                    <th className="pb-1.5 text-left">{t.productos.colProducto}</th>
                                    <th className="pb-1.5 text-right">{t.pantallas.colCant}</th>
                                    <th className="pb-1.5 text-right">{t.pantallas.colPUnit}</th>
                                    <th className="pb-1.5 text-right">{t.venta.total}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((i) => (
                                    <tr key={i.id}>
                                      <td className="py-1 font-semibold">{i.nombre}</td>
                                      <td className="py-1 text-right tabular-nums">{numero(Number(i.cantidad))}</td>
                                      <td className="py-1 text-right tabular-nums">{dinero(Number(i.precio_unitario), moneda, false)}</td>
                                      <td className="py-1 text-right font-semibold tabular-nums">
                                        {dinero(Number(i.cantidad) * Number(i.precio_unitario), moneda, false)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-[13px] text-tinta/50">{t.pantallas.sinDetalleProductos}</p>
                            )}
                            {Number(m.descuento) > 0 && (
                              <div className="mt-2 flex justify-between border-t border-borde pt-2 text-[13px]">
                                <span className="text-tinta/55">
                                  Subtotal {dinero(Number(m.subtotal), moneda, false)} · descuento {dinero(Number(m.descuento), moneda, false)}
                                </span>
                                <span className="font-bold tabular-nums">{dinero(Number(m.monto), moneda, false)}</span>
                              </div>
                            )}
                            {anulado && (
                              <p className="mt-3 rounded-lg bg-rojo-claro px-3 py-2 text-[12.5px] font-medium text-rojo">
                                Anulada{m.anulado_at ? ` el ${m.anulado_at.slice(0, 10).split('-').reverse().join('/')}` : ''}
                                {m.motivo_anulacion ? ` · ${m.motivo_anulacion}` : ''}.
                                {m.tipo === 'venta' && ' El stock fue devuelto.'}
                              </p>
                            )}
                            {m.notas && (
                              <p className="mt-3 border-t border-borde pt-2.5 text-[12.5px] italic text-tinta/55">
                                &laquo;{m.notas}&raquo;
                              </p>
                            )}

                            {/* Los comprobantes se piden recién acá, cuando
                                alguien despliega la fila. Traerlos para las
                                cien filas de la página sería gastar red para
                                mostrar dos miniaturas. */}
                            <div className="mt-3 border-t border-borde pt-3">
                              <Adjuntos
                                empresaId={empresaId}
                                movimientoId={m.id}
                                puedeAgregar={guardaComprobantes && !anulado}
                              />
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {(cursor || cargando) && (
        <div className="pt-1 text-center">
          <button type="button" className="boton-suave" onClick={verMas} disabled={cargando}>
            {cargando ? 'Cargando…' : 'Ver más movimientos'}
          </button>
        </div>
      )}

      {!error && !cursor && movimientos.length > 0 && total > movimientos.length && (
        <p className="text-center text-[12.5px] text-tinta/45">
          {numero(movimientos.length)} de {numero(total)} movimientos del periodo.
        </p>
      )}

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
