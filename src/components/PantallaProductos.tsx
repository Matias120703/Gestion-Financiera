'use client';

import { useMemo, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, decimalesDe, numero, porcentaje } from '@/lib/formato';
import type { Producto } from '@/lib/tipos';
import { Vacio, Indicador } from '@/components/Piezas';
import { mensajeDeError, verificarAfectados } from '@/lib/errores';

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

interface Borrador {
  id?: string;
  nombre: string;
  categoria: string;
  costo: number;
  precio: number;
  stock: number;
  stock_minimo: number;
  controla_stock: boolean;
  activo: boolean;
}

const VACIO: Borrador = {
  nombre: '', categoria: 'General', costo: 0, precio: 0,
  stock: 0, stock_minimo: 0, controla_stock: true, activo: true,
};

export function PantallaProductos({
  empresaId, moneda, productos, puedeGestionar,
}: {
  empresaId: string;
  moneda: string;
  productos: Producto[];
  /** Solo propietario y admin. La base lo vuelve a verificar con RLS. */
  puedeGestionar: boolean;
}) {
  const t = useTextos();
  const router = useRouter();
  const dec = decimalesDe(moneda);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [error, setError] = useState('');

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => p.nombre.toLowerCase().includes(q) || (p.categoria ?? '').toLowerCase().includes(q));
  }, [productos, busqueda]);

  const activos = productos.filter((p) => p.activo);
  const valorInventario = activos.reduce((s, p) => s + Number(p.stock) * Number(p.costo ?? 0), 0);
  const valorVenta = activos.reduce((s, p) => s + Number(p.stock) * Number(p.precio), 0);
  const criticos = activos.filter((p) => p.controla_stock && Number(p.stock) <= Number(p.stock_minimo));
  // El costo llega en null cuando quien mira no puede verlo: la base no lo manda.
  const verCostos = productos.every((p) => p.costo !== null) && puedeGestionar;
  const unidadesEnStock = activos.reduce((s, p) => s + (p.controla_stock ? Number(p.stock) : 0), 0);

  async function alternarActivo(p: Producto) {
    setError('');
    try {
      const supabase = clienteNavegador();
      // Pausar en vez de borrar: preserva el historial de ventas.
      // Pedimos las filas de vuelta para detectar el caso en que RLS
      // filtra la fila y el update no falla pero tampoco hace nada.
      const { data, error } = await supabase
        .from('productos').update({ activo: !p.activo }).eq('id', p.id).select('id');
      if (error) throw error;
      verificarAfectados(data, 'No se guardó: solo un administrador puede pausar productos.');
      router.refresh();
    } catch (e: any) {
      setError(mensajeDeError(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo={t.productos.activos} valor={numero(activos.length)} detalle={`${productos.length - activos.length} pausados`} />
        {verCostos ? (
          <>
            <Indicador titulo={t.productos.invertido} valor={dinero(valorInventario, moneda)} detalle="a precio de costo" />
            <Indicador titulo={t.productos.siVendesTodo} valor={dinero(valorVenta, moneda)} detalle={`ganarías ${dinero(valorVenta - valorInventario, moneda)}`} tono="bueno" />
          </>
        ) : (
          <>
            <Indicador titulo={t.productos.unidades} valor={numero(unidadesEnStock)} detalle="disponibles" />
            <Indicador titulo={t.productos.valorVenta} valor={dinero(valorVenta, moneda)} detalle="si se vende todo" />
          </>
        )}
        <Indicador titulo={t.productos.porReponer} valor={numero(criticos.length)} detalle="llegaron al mínimo" tono={criticos.length ? 'malo' : 'neutro'} />
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta/30" {...trazo}>
            <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
          </svg>
          <input className="campo pl-10" placeholder={t.productos.buscar} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        {puedeGestionar && (
          <button className="boton-principal shrink-0" onClick={() => setEditando({ ...VACIO })}>+ Producto</button>
        )}
      </div>

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      {!puedeGestionar && (
        <p className="rounded-xl bg-arena px-4 py-3 text-[13px] leading-relaxed text-tinta/60">
          Podés consultar el catálogo y vender. Los costos de compra y los márgenes no se
          muestran, y cambiar precios o stock queda para los administradores del negocio.
        </p>
      )}

      <div className="tarjeta overflow-hidden">
        {visibles.length === 0 ? (
          <Vacio
            titulo={productos.length === 0 ? 'Todavía no hay productos' : 'Nada coincide'}
            detalle={productos.length === 0
              ? 'Cargá lo que vendés con su costo y su precio. Sin costo no hay margen real.'
              : 'Probá con otra palabra.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[640px]">
              <thead>
                <tr>
                  <th>{t.productos.colProducto}</th>
                  {verCostos && <th className="num">{t.productos.colCosto}</th>}
                  <th className="num">{t.productos.colPrecio}</th>
                  {verCostos && <th className="num">{t.productos.colMargen}</th>}
                  <th className="num">{t.productos.colStock}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const margen = Number(p.precio) > 0 ? ((Number(p.precio) - Number(p.costo ?? 0)) / Number(p.precio)) * 100 : 0;
                  const critico = p.controla_stock && Number(p.stock) <= Number(p.stock_minimo);
                  return (
                    <tr key={p.id} className={p.activo ? '' : 'opacity-45'}>
                      <td>
                        <span className="block font-semibold">{p.nombre}</span>
                        <span className="block text-[12px] text-tinta/45">
                          {p.categoria}{!p.activo && ' · pausado'}
                        </span>
                      </td>
                      {verCostos && (
                        <td className="num tabular-nums text-tinta/60">
                          {p.controla_stock ? dinero(Number(p.costo ?? 0), moneda, false) : <span className="text-tinta/30">—</span>}
                        </td>
                      )}
                      <td className="num font-semibold tabular-nums">{dinero(Number(p.precio), moneda, false)}</td>
                      {verCostos && (
                        <td className={`num font-semibold tabular-nums ${!p.controla_stock ? 'text-tinta/30' : margen >= 25 ? 'text-verde-fuerte' : margen > 0 ? 'text-ambar' : 'text-rojo'}`}>
                          {p.controla_stock ? porcentaje(margen, 0) : '—'}
                        </td>
                      )}
                      <td className="num">
                        {p.controla_stock ? (
                          <span className={`tabular-nums font-semibold ${critico ? 'text-rojo' : ''}`}>{numero(Number(p.stock))}</span>
                        ) : (
                          <span className="text-tinta/30">—</span>
                        )}
                      </td>
                      <td className="w-[92px]">
                        <div className="flex justify-end gap-1">
                          {puedeGestionar && (
                          <button
                            onClick={() => setEditando({
                              id: p.id, nombre: p.nombre, categoria: p.categoria,
                              costo: Number(p.costo ?? 0), precio: Number(p.precio),
                              stock: Number(p.stock), stock_minimo: Number(p.stock_minimo),
                              controla_stock: p.controla_stock, activo: p.activo,
                            })}
                            aria-label={t.productos.editar}
                            className="icono-toque text-tinta/35 hover:bg-arena hover:text-tinta"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}><path d="M4 20h16M6 16.5 16.5 6a2.1 2.1 0 0 1 3 3L9 19.5l-4 1z" /></svg>
                          </button>
                          )}
                          {puedeGestionar && (
                            <button
                              onClick={() => alternarActivo(p)}
                              aria-label={p.activo ? 'Pausar' : 'Reactivar'}
                              className="icono-toque text-tinta/35 hover:bg-rojo-claro hover:text-rojo"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
                                {p.activo ? <path d="M9.5 8.5v7M14.5 8.5v7" /> : <path d="M8 5.5 18 12 8 18.5z" />}
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && (
        <DialogoProducto
          empresaId={empresaId} moneda={moneda} dec={dec} borrador={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function DialogoProducto({
  empresaId, moneda, dec, borrador, onCerrar, onGuardado,
}: {
  empresaId: string; moneda: string; dec: number; borrador: Borrador;
  onCerrar: () => void; onGuardado: () => void;
}) {
  const t = useTextos();
  const [b, setB] = useState<Borrador>(borrador);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const margen = b.precio > 0 ? ((b.precio - b.costo) / b.precio) * 100 : 0;

  function set<K extends keyof Borrador>(k: K, v: Borrador[K], extra: Partial<Borrador> = {}) {
    setB((prev) => ({ ...prev, [k]: v, ...extra }));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!b.nombre.trim()) { setError(t.productos.poneNombre); return; }
    setGuardando(true);
    try {
      const supabase = clienteNavegador();
      const fila = {
        empresa_id: empresaId,
        nombre: b.nombre.trim(),
        categoria: b.categoria.trim() || 'General',
        costo: b.costo, precio: b.precio,
        stock: b.stock, stock_minimo: b.stock_minimo,
        controla_stock: b.controla_stock, activo: b.activo,
      };
      const { data, error } = b.id
        ? await supabase.from('productos').update(fila).eq('id', b.id).select('id')
        : await supabase.from('productos').insert(fila).select('id');
      if (error) throw error;
      verificarAfectados(data, 'No se guardó: solo un administrador puede modificar productos.');
      onGuardado();
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      setError(/duplicate key|unique/i.test(msg)
        ? 'Ya tenés un producto con ese nombre.'
        : mensajeDeError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-tinta/45 backdrop-blur-[2px] sm:items-center sm:px-4" onClick={onCerrar}>
      <form
        onSubmit={guardar}
        className="zona-segura-abajo max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[19px] font-bold tracking-tight">{b.id ? 'Editar producto' : 'Nuevo producto'}</h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="etiqueta">{t.productos.nombre}</span>
            <input className="campo" autoFocus maxLength={120} value={b.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </label>

          <label className="block">
            <span className="etiqueta">{t.productos.categoria}</span>
            <input className="campo" list="cat-prod" maxLength={40} value={b.categoria} onChange={(e) => set('categoria', e.target.value)} />
            <datalist id="cat-prod">
              {['Perfumes', 'Tecnología', 'Hogar', 'Ropa', 'Accesorios', 'General'].map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>

          {/* El control de stock va ANTES del precio a propósito: es la
              pregunta que decide todo lo demás. Un producto que se compra
              para revender tiene costo y margen; un servicio —un corte, una
              sesión— no tiene «costo de compra», y pedirlo ahí sería inventar
              un número. Lo que le queda al negocio en un servicio se calcula
              en Equipo y reparto (comisión, alquiler, sueldo), no acá. */}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-borde p-3">
            <input type="checkbox" className="h-4 w-4 accent-[#17795a]" checked={b.controla_stock}
              onChange={(e) => set('controla_stock', e.target.checked, e.target.checked ? {} : { costo: 0 })} />
            <span>
              <span className="block text-[14px] font-semibold">{t.productos.controlarStock}</span>
              <span className="block text-[12.5px] text-tinta/50">{t.productos.controlarStockDetalle}</span>
            </span>
          </label>

          {b.controla_stock ? (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="etiqueta">{t.productos.teCuesta}</span>
                  <input type="number" inputMode="decimal" min={0} step={dec === 0 ? 1 : 0.01} className="campo tabular-nums"
                    value={b.costo || ''} placeholder="0" onChange={(e) => set('costo', Math.max(0, Number(e.target.value) || 0))} />
                </label>
                <label className="block">
                  <span className="etiqueta">{t.productos.loVendesA}</span>
                  <input type="number" inputMode="decimal" min={0} step={dec === 0 ? 1 : 0.01} className="campo tabular-nums"
                    value={b.precio || ''} placeholder="0" onChange={(e) => set('precio', Math.max(0, Number(e.target.value) || 0))} />
                </label>
              </div>

              <div className="rounded-xl bg-arena p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold text-tinta/60">{t.productos.ganasPorUnidad}</span>
                  <span className={`text-[16px] font-bold tabular-nums ${b.precio - b.costo >= 0 ? 'text-verde-fuerte' : 'text-rojo'}`}>
                    {dinero(b.precio - b.costo, moneda)}
                  </span>
                </div>
                <p className="mt-0.5 text-right text-[12px] font-semibold text-tinta/45">margen {porcentaje(margen, 0)}</p>
              </div>
            </>
          ) : (
            <>
              <label className="block">
                <span className="etiqueta">{t.productos.colPrecio}</span>
                <input type="number" inputMode="decimal" min={0} step={dec === 0 ? 1 : 0.01} className="campo tabular-nums"
                  value={b.precio || ''} placeholder="0" onChange={(e) => set('precio', Math.max(0, Number(e.target.value) || 0))} />
              </label>
              <p className="text-[12.5px] leading-relaxed text-tinta/50">{t.productos.sinCostoServicio}</p>
            </>
          )}

          {b.controla_stock && (
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="etiqueta">{t.productos.stockActual}</span>
                <input type="number" inputMode="decimal" step="any" className="campo tabular-nums" value={b.stock}
                  onChange={(e) => set('stock', Number(e.target.value) || 0)} />
              </label>
              <label className="block">
                <span className="etiqueta">{t.productos.avisarCuandoQuede}</span>
                <input type="number" inputMode="decimal" min={0} step="any" className="campo tabular-nums" value={b.stock_minimo}
                  onChange={(e) => set('stock_minimo', Math.max(0, Number(e.target.value) || 0))} />
              </label>
            </div>
          )}
        </div>

        {error && <p className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button type="button" className="boton-suave py-3" onClick={onCerrar}>{t.comun.cancelar}</button>
          <button type="submit" className="boton-principal py-3" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
