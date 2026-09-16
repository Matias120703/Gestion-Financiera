'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTextos } from '@/i18n/cliente';
import { categoriaVisible } from '@/i18n/nombres';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, decimalesDe, numero, porcentaje } from '@/lib/formato';
import type { Producto } from '@/lib/tipos';
import { Vacio, Indicador } from '@/components/Piezas';
import { mensajeDeError, verificarAfectados } from '@/lib/errores';

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

type Tipo = 'servicios' | 'productos';

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

/**
 * Qué es cada cosa. Un producto se compra para revender: tiene costo, margen
 * y stock. Un servicio —un corte, una sesión— no tiene nada de eso.
 *
 * En la base sigue siendo el mismo campo de siempre (`controla_stock`), y no
 * es casualidad: es exactamente la pregunta que separa una cosa de la otra.
 * Lo que cambió es cómo se pregunta en la pantalla.
 */
const esProducto = (p: { controla_stock: boolean }) => p.controla_stock;

/**
 * SERVICIOS Y PRODUCTOS
 *
 * Esto estaba en el cuaderno del dueño, tal cual: «Dividir Servicios y
 * Productos». Antes era una sola tabla y la diferencia estaba escondida en un
 * tilde del formulario. En una barbería la sección se llamaba «Servicios»,
 * pero el botón de nuevo arrancaba como producto: quien entraba a cargar el
 * shampoo que vende no sabía si estaba en el lugar correcto, y quien cargaba
 * un corte tenía que acordarse de destildar el stock.
 *
 * Ahora son dos pestañas, y cada una crea lo suyo. Sin pestañas —un almacén
 * que solo vende productos— la pantalla queda igual que siempre: una pestaña
 * de «Servicios» vacía ahí sería ruido.
 */
export function PantallaProductos({
  empresaId, moneda, productos, puedeGestionar,
  conPestanas = false, pestanaInicial = 'productos', tieneAgenda = false,
}: {
  empresaId: string;
  moneda: string;
  productos: Producto[];
  /** Solo propietario y admin. La base lo vuelve a verificar con RLS. */
  puedeGestionar: boolean;
  conPestanas?: boolean;
  pestanaInicial?: Tipo;
  /** Para decir dónde se le da duración a un servicio y se vuelve reservable. */
  tieneAgenda?: boolean;
}) {
  const t = useTextos();
  const router = useRouter();
  const dec = decimalesDe(moneda);
  const [busqueda, setBusqueda] = useState('');
  const [pestana, setPestana] = useState<Tipo>(pestanaInicial);
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const enServicios = conPestanas && pestana === 'servicios';

  const deLaPestana = useMemo(() => {
    if (!conPestanas) return productos;
    return productos.filter((p) => (pestana === 'productos' ? esProducto(p) : !esProducto(p)));
  }, [productos, conPestanas, pestana]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return deLaPestana;
    return deLaPestana.filter((p) => p.nombre.toLowerCase().includes(q) || (p.categoria ?? '').toLowerCase().includes(q));
  }, [deLaPestana, busqueda]);

  // Los números de stock son de productos: un corte no se «repone» ni vale
  // nada en el depósito. Dan lo mismo que antes, porque un servicio siempre
  // tuvo el stock en cero.
  const productosActivos = productos.filter((p) => p.activo && esProducto(p));
  const valorInventario = productosActivos.reduce((s, p) => s + Number(p.stock) * Number(p.costo ?? 0), 0);
  const valorVenta = productosActivos.reduce((s, p) => s + Number(p.stock) * Number(p.precio), 0);
  const criticos = productosActivos.filter((p) => Number(p.stock) <= Number(p.stock_minimo));
  // El costo llega en null cuando quien mira no puede verlo: la base no lo manda.
  const verCostos = productos.every((p) => p.costo !== null) && puedeGestionar;
  const unidadesEnStock = productosActivos.reduce((s, p) => s + Number(p.stock), 0);

  const activosDeLaPestana = deLaPestana.filter((p) => p.activo);
  const precioPromedio = activosDeLaPestana.length
    ? activosDeLaPestana.reduce((s, p) => s + Number(p.precio), 0) / activosDeLaPestana.length
    : 0;
  const cuantos = (tipo: Tipo) =>
    productos.filter((p) => p.activo && (tipo === 'productos' ? esProducto(p) : !esProducto(p))).length;

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
      verificarAfectados(data, t.productos.soloAdminPausa);
      router.refresh();
    } catch (e: any) {
      setError(mensajeDeError(e));
    }
  }

  return (
    <div className="space-y-5">
      {conPestanas && (
        <div className="flex gap-1 rounded-xl bg-arena p-1" role="tablist">
          {(['servicios', 'productos'] as Tipo[]).map((tp) => (
            <button
              key={tp}
              type="button"
              role="tab"
              aria-selected={pestana === tp}
              onClick={() => { setPestana(tp); setBusqueda(''); }}
              className={`flex-1 rounded-lg px-3 py-2 text-[14px] font-bold transition ${
                pestana === tp ? 'bg-superficie text-tinta shadow-sm' : 'text-tinta/50 hover:text-tinta'
              }`}
            >
              {tp === 'servicios' ? t.productos.servicios : t.productos.productos}
              <span className="ml-1.5 text-[12px] font-semibold text-tinta/40">{cuantos(tp)}</span>
            </button>
          ))}
        </div>
      )}

      {enServicios ? (
        <div className="grid grid-cols-2 gap-3">
          <Indicador
            titulo={t.productos.serviciosActivos}
            valor={numero(activosDeLaPestana.length)}
            detalle={t.productos.pausados(deLaPestana.length - activosDeLaPestana.length)}
          />
          <Indicador titulo={t.productos.precioPromedio} valor={dinero(precioPromedio, moneda)} detalle={t.productos.deLoQueOfreces} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador
            titulo={t.productos.activos}
            valor={numero(activosDeLaPestana.length)}
            detalle={t.productos.pausados(deLaPestana.length - activosDeLaPestana.length)}
          />
          {verCostos ? (
            <>
              <Indicador titulo={t.productos.invertido} valor={dinero(valorInventario, moneda)} detalle={t.productos.aPrecioDeCosto} />
              <Indicador titulo={t.productos.siVendesTodo} valor={dinero(valorVenta, moneda)} detalle={t.productos.ganarias(dinero(valorVenta - valorInventario, moneda))} tono="bueno" />
            </>
          ) : (
            <>
              <Indicador titulo={t.productos.unidades} valor={numero(unidadesEnStock)} detalle={t.productos.disponibles} />
              <Indicador titulo={t.productos.valorVenta} valor={dinero(valorVenta, moneda)} detalle={t.productos.siSeVendeTodo} />
            </>
          )}
          <Indicador titulo={t.productos.porReponer} valor={numero(criticos.length)} detalle={t.productos.llegaronAlMinimo} tono={criticos.length ? 'malo' : 'neutro'} />
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta/30" {...trazo}>
            <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
          </svg>
          <input className="campo pl-10" placeholder={t.productos.buscar} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        {puedeGestionar && (
          // Cada pestaña crea lo suyo. Antes el botón arrancaba siempre como
          // producto, también en la sección que se llamaba «Servicios».
          <button
            className="boton-principal shrink-0"
            onClick={() => setEditando({ ...VACIO, controla_stock: !enServicios })}
          >
            {enServicios ? t.productos.nuevoServicio : t.productos.nuevoProducto}
          </button>
        )}
      </div>

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
      {aviso && (
        <p className="rounded-xl bg-verde-claro px-4 py-3 text-[13.5px] font-semibold leading-snug text-verde-fuerte aparecer">
          ✓ {aviso}
        </p>
      )}

      {!puedeGestionar && (
        <p className="rounded-xl bg-arena px-4 py-3 text-[13px] leading-relaxed text-tinta/60">
          {t.productos.soloConsulta}
        </p>
      )}

      {enServicios && tieneAgenda && puedeGestionar && (
        <p className="rounded-xl bg-arena px-4 py-3 text-[13px] leading-relaxed text-tinta/60">
          {t.productos.duracionEnAgenda}{' '}
          <Link href="/agenda" className="font-semibold text-verde-fuerte underline">{t.nav.agenda}</Link>.
        </p>
      )}

      <div className="tarjeta overflow-hidden">
        {visibles.length === 0 ? (
          enServicios ? (
            <Vacio
              titulo={deLaPestana.length === 0 ? t.productos.sinServicios : t.productos.nadaCoincide}
              detalle={deLaPestana.length === 0 ? t.productos.sinServiciosDetalle : t.productos.otraPalabra}
            />
          ) : (
            <Vacio
              titulo={deLaPestana.length === 0 ? t.productos.sinProductos : t.productos.nadaCoincide}
              detalle={deLaPestana.length === 0 ? t.productos.sinProductosDetalle : t.productos.otraPalabra}
            />
          )
        ) : (
          <div className="overflow-x-auto">
            {/* En servicios no van costo, margen ni stock: para un corte son
                columnas llenas de guiones, y un guion repetido veinte veces
                deja de leerse como «no aplica» y se lee como «falta algo». */}
            <table className={`tabla ${enServicios ? 'min-w-[360px]' : 'min-w-[640px]'}`}>
              <thead>
                <tr>
                  <th>{enServicios ? t.productos.colServicio : t.productos.colProducto}</th>
                  {verCostos && !enServicios && <th className="num">{t.productos.colCosto}</th>}
                  <th className="num">{t.productos.colPrecio}</th>
                  {verCostos && !enServicios && <th className="num">{t.productos.colMargen}</th>}
                  {!enServicios && <th className="num">{t.productos.colStock}</th>}
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
                          {categoriaVisible(t, p.categoria)}{!p.activo && ` · ${t.productos.pausado}`}
                        </span>
                      </td>
                      {verCostos && !enServicios && (
                        <td className="num tabular-nums text-tinta/60">
                          {p.controla_stock ? dinero(Number(p.costo ?? 0), moneda, false) : <span className="text-tinta/30">—</span>}
                        </td>
                      )}
                      <td className="num font-semibold tabular-nums">{dinero(Number(p.precio), moneda, false)}</td>
                      {verCostos && !enServicios && (
                        <td className={`num font-semibold tabular-nums ${!p.controla_stock ? 'text-tinta/30' : margen >= 25 ? 'text-verde-fuerte' : margen > 0 ? 'text-ambar' : 'text-rojo'}`}>
                          {p.controla_stock ? porcentaje(margen, 0) : '—'}
                        </td>
                      )}
                      {!enServicios && (
                        <td className="num">
                          {p.controla_stock ? (
                            <span className={`tabular-nums font-semibold ${critico ? 'text-rojo' : ''}`}>{numero(Number(p.stock))}</span>
                          ) : (
                            <span className="text-tinta/30">—</span>
                          )}
                        </td>
                      )}
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
                              aria-label={p.activo ? t.productos.pausar : t.productos.reactivar}
                              // Las dos rayitas solas no se entendían: quien
                              // buscaba cómo sacar algo no las encontraba.
                              title={p.activo ? t.productos.pausarDetalle : t.productos.volverAVender}
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
          onGuardado={(mensaje) => {
            setEditando(null);
            router.refresh();
            // Lo que pasó al eliminar, sobre todo cuando en vez de borrarse
            // quedó pausado.
            if (mensaje) {
              setAviso(mensaje);
              setTimeout(() => setAviso(''), 6000);
            }
          }}
        />
      )}
    </div>
  );
}

function DialogoProducto({
  empresaId, moneda, dec, borrador, onCerrar, onGuardado,
}: {
  empresaId: string; moneda: string; dec: number; borrador: Borrador;
  onCerrar: () => void;
  /** Con mensaje cuando hay algo que decir después de cerrar. */
  onGuardado: (mensaje?: string) => void;
}) {
  const t = useTextos();
  const [b, setB] = useState<Borrador>(borrador);
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState('');

  /**
   * Eliminar del catálogo (058). Lo decide la base: lo que nunca se usó se
   * borra; lo que ya se vendió o tiene turnos se pausa, porque borrarlo
   * soltaría esas ventas y esos turnos de lo que fueron. Si pasa lo segundo
   * se dice, para que no parezca que el botón no hizo lo que decía.
   */
  async function eliminar() {
    if (!borrador.id || eliminando) return;
    setEliminando(true);
    setError('');
    try {
      const { data, error } = await clienteNavegador()
        .rpc('eliminar_producto', { p_producto: borrador.id });
      if (error) throw error;
      onGuardado(data === 'pausado'
        ? t.productos.quedoPausado(borrador.nombre)
        : t.productos.seElimino(borrador.nombre));
    } catch (e: any) {
      setError(mensajeDeError(e, t.productos.noSePudoEliminar));
      setConfirmar(false);
    } finally {
      setEliminando(false);
    }
  }

  const margen = b.precio > 0 ? ((b.precio - b.costo) / b.precio) * 100 : 0;
  const esProd = b.controla_stock;
  // Las categorías de un catálogo son de la persona: se sugieren en su idioma
  // y se guardan como las escriba.
  const sugeridas = esProd ? t.productos.sugeridasProducto : t.productos.sugeridasServicio;

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
      verificarAfectados(data, t.productos.soloAdminModifica(esProd));
      onGuardado();
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      setError(/duplicate key|unique/i.test(msg)
        ? t.productos.yaExiste(esProd)
        : mensajeDeError(e, t.gastos.noSePudoGuardar));
    } finally {
      setGuardando(false);
    }
  }

  const opcion = (activa: boolean) =>
    `rounded-lg px-3 py-2 text-left transition ${activa ? 'bg-superficie text-tinta shadow-sm' : 'text-tinta/50 hover:text-tinta'}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-noche/45 backdrop-blur-[2px] sm:items-center sm:px-4" onClick={onCerrar}>
      <form
        onSubmit={guardar}
        className="zona-segura-abajo max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie p-5 aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[19px] font-bold tracking-tight">
          {b.id
            ? (esProd ? t.productos.editarProducto : t.productos.editarServicio)
            : (esProd ? t.productos.nuevoProductoTitulo : t.productos.nuevoServicioTitulo)}
        </h2>

        <div className="mt-4 space-y-3">
          {/* Qué es va PRIMERO: es la pregunta que decide todo lo demás. Un
              producto se compra para revender, así que tiene costo, margen y
              stock; un servicio —un corte, una sesión— no tiene «costo de
              compra», y pedirlo ahí sería inventar un número. Lo que le queda
              al negocio en un servicio se calcula en Equipo y reparto.

              Antes era un tilde de «Controlar stock» más abajo, que había que
              saber interpretar. Ahora se pregunta con las palabras de todos
              los días, y viene marcado según la pestaña desde donde se abrió. */}
          <div>
            <span className="etiqueta">{t.productos.queEs}</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-arena p-1">
              <button type="button" className={opcion(!b.controla_stock)}
                onClick={() => set('controla_stock', false, { costo: 0 })}>
                <span className="block text-[14px] font-bold">{t.productos.colServicio}</span>
                <span className="block text-[11.5px] font-medium opacity-70">{t.productos.servicioEjemplo}</span>
              </button>
              <button type="button" className={opcion(b.controla_stock)}
                onClick={() => set('controla_stock', true)}>
                <span className="block text-[14px] font-bold">{t.productos.colProducto}</span>
                <span className="block text-[11.5px] font-medium opacity-70">{t.productos.productoEjemplo}</span>
              </button>
            </div>
          </div>

          <label className="block">
            <span className="etiqueta">{t.productos.nombre}</span>
            <input className="campo" autoFocus maxLength={120} value={b.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </label>

          <label className="block">
            <span className="etiqueta">{t.productos.categoria}</span>
            <input className="campo" list="cat-prod" maxLength={40} value={b.categoria} onChange={(e) => set('categoria', e.target.value)} />
            <datalist id="cat-prod">
              {sugeridas.map((c) => <option key={c} value={c} />)}
            </datalist>
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
                <p className="mt-0.5 text-right text-[12px] font-semibold text-tinta/45">{t.productos.margen(porcentaje(margen, 0))}</p>
              </div>

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
        </div>

        {error && <p className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button type="button" className="boton-suave py-3" onClick={onCerrar}>{t.comun.cancelar}</button>
          <button type="submit" className="boton-principal py-3" disabled={guardando}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </button>
        </div>

        {/* Solo al editar: lo que todavía no existe no se elimina. */}
        {borrador.id && (
          confirmar ? (
            <div className="mt-4 space-y-2.5 rounded-xl bg-rojo-claro px-3.5 py-3 aparecer">
              <p className="text-[13.5px] font-bold text-rojo">{t.productos.eliminarPregunta(borrador.nombre)}</p>
              <p className="text-[12.5px] leading-snug text-tinta/65">
                {borrador.controla_stock ? t.productos.eliminarDetalleProducto : t.productos.eliminarDetalleServicio}
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" className="boton-suave py-2.5" onClick={() => setConfirmar(false)}>{t.productos.no}</button>
                <button
                  type="button" onClick={eliminar} disabled={eliminando}
                  className="rounded-xl bg-rojo py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
                >
                  {eliminando ? t.productos.eliminando : t.productos.siEliminar}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button" onClick={() => setConfirmar(true)}
              className="mt-3 w-full rounded-xl py-2.5 text-[13.5px] font-semibold text-rojo/80 hover:bg-rojo-claro hover:text-rojo"
            >
              {esProd ? t.productos.eliminarProducto : t.productos.eliminarServicio}
            </button>
          )
        )}
      </form>
    </div>
  );
}
