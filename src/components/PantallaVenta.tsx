'use client';

import { useMemo, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { categoriaVisible, metodoVisible } from '@/i18n/nombres';
import type { Textos } from '@/i18n/diccionarios';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { SelectorCliente, asegurarCliente, type ClienteElegido } from '@/components/SelectorCliente';
import { dinero, decimalesDe, numero } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { useZona } from '@/lib/zona';
import type { Producto } from '@/lib/tipos';
import { Vacio } from '@/components/Piezas';
import { CampoMonto } from '@/components/CampoMonto';
import { mensajeDeError } from '@/lib/errores';
import { ElegirCuenta, cuentaDelCobro, cuentasDelMetodo, useCuentasParaElegir } from '@/components/FormaDeCobro';
import { tonoDeCuenta } from '@/lib/colores-cuenta';
import type { CuentaParaElegir } from '@/lib/tipos';

/**
 * PANTALLA DE VENTA
 *
 * Se usa con el cliente enfrente, el celular en una mano y la otra ocupada.
 * Todo acá está pensado para eso:
 *
 *   · Cobrar es UN toque. No hay modal ni confirmación intermedia: tocás el
 *     producto y tocás Cobrar. Si te equivocaste, se anula desde el historial
 *     (queda auditado y devuelve el stock).
 *   · El botón Cobrar está separado del área que abre el detalle, para que un
 *     toque distraído no cobre sin querer.
 *   · El método de cobro son chips visibles, no un `select` (que en iPhone
 *     abre una rueda y cuesta tres interacciones).
 *   · Los productos se ordenan por lo que más vendés, no alfabéticamente.
 */

interface LineaCarrito {
  clave: string;
  producto_id: string | null;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  /**
   * Solo para mostrar el margen estimado en pantalla, y para mandarlo cuando
   * es un producto suelto. Para productos del catálogo la base usa su propio
   * costo y descarta cualquier valor que llegue desde acá.
   */
  costo_unitario: number;
  stock: number | null;
}

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/**
 * Efectivo primero: es lo más frecuente y queda preseleccionado.
 *
 * Se arma con el diccionario: el código que se guarda es siempre el mismo,
 * lo que cambia con el idioma es cómo se lee en el botón.
 */
function metodosDe(t: Textos): { valor: string; corto: string; largo: string }[] {
  return [
    { valor: 'efectivo', corto: metodoVisible(t, 'efectivo'), largo: metodoVisible(t, 'efectivo') },
    { valor: 'transferencia', corto: t.venta.metodoTransferCorto, largo: metodoVisible(t, 'transferencia') },
    { valor: 'tarjeta', corto: metodoVisible(t, 'tarjeta'), largo: metodoVisible(t, 'tarjeta') },
    { valor: 'credito', corto: t.venta.metodoFiadoCorto, largo: t.venta.metodoFiadoLargo },
    { valor: 'otro', corto: metodoVisible(t, 'otro'), largo: metodoVisible(t, 'otro') },
  ];
}

export function PantallaVenta({
  empresaId, moneda, productos, frecuentes = [],
}: {
  empresaId: string;
  moneda: string;
  productos: Producto[];
  /** Ids ordenados por lo más vendido en los últimos 30 días. */
  frecuentes?: string[];
}) {
  const t = useTextos();
  const METODOS = metodosDe(t);
  const zona = useZona();
  const router = useRouter();
  const dec = decimalesDe(moneda);

  // Si la base no mandó los costos, quien está vendiendo no puede verlos:
  // no mostramos ninguna estimación de ganancia.
  const verCostos = productos.every((p) => p.costo !== null);

  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  /**
   * A qué cuenta entró (096). Con dos bancos, «transferencia» no dice a
   * cuál: se elige, y arranca en el de siempre. Null = el de esa forma de
   * pago. Queda elegida para la venta siguiente: el que cobra tres
   * transferencias seguidas al Continental no tiene que tocarlo tres veces.
   */
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);
  const cuentas = useCuentasParaElegir(empresaId);
  const cuentasPosibles = cuentasDelMetodo(cuentas, metodo);
  const cuentaMarcada = cuentaDelCobro(cuentas, metodo, cuentaElegida);
  // Otra forma de pago, otra cuenta: la tocada antes puede no servir.
  function elegirMetodo(m: string) { setMetodo(m); setCuentaElegida(null); }
  /**
   * A quién se le vende (052-055).
   *
   * Era un texto suelto que solo se guardaba en `contraparte`: servía para
   * acordarse y para nada más. Ahora, si es un cliente cargado, la venta
   * queda atada a su ficha y el fiado se le puede cobrar.
   */
  const [elegido, setElegido] = useState<ClienteElegido>({ id: null, nombre: '', telefono: '' });
  const [fecha, setFecha] = useState(hoyISO(zona));
  const [cliente, setCliente] = useState('');
  const [descuento, setDescuento] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [avisoStock, setAvisoStock] = useState('');
  const [libreAbierto, setLibreAbierto] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  const categorias = useMemo(() => {
    const set = new Set(productos.map((p) => p.categoria || 'General'));
    return Array.from(set).sort();
  }, [productos]);
  const [categoria, setCategoria] = useState<string>('todas');

  /** Posición de cada producto en el ranking de los últimos 30 días. */
  const posicion = useMemo(() => {
    const m = new Map<string, number>();
    frecuentes.forEach((id, i) => m.set(id, i));
    return m;
  }, [frecuentes]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtrados = productos.filter((p) => {
      if (categoria !== 'todas' && (p.categoria || 'General') !== categoria) return false;
      if (!q) return true;
      return p.nombre.toLowerCase().includes(q) || (p.categoria ?? '').toLowerCase().includes(q);
    });

    // Lo que más vendés, arriba. Los que nunca se vendieron van después en
    // orden alfabético, para que igual sean fáciles de encontrar.
    return filtrados.sort((a, b) => {
      const pa = posicion.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const pb = posicion.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  }, [productos, busqueda, categoria, posicion]);

  const subtotal = carrito.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
  const costoTotal = carrito.reduce((s, l) => s + l.cantidad * l.costo_unitario, 0);
  const descuentoAplicado = Math.min(Math.max(0, descuento), subtotal);
  const total = subtotal - descuentoAplicado;
  const ganancia = total - costoTotal;
  const unidades = carrito.reduce((s, l) => s + l.cantidad, 0);

  function agregar(p: Producto) {
    setExito('');
    setCarrito((prev) => {
      const i = prev.findIndex((l) => l.producto_id === p.id);
      if (i >= 0) {
        const copia = [...prev];
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 };
        return copia;
      }
      return [
        ...prev,
        {
          clave: p.id,
          producto_id: p.id,
          nombre: p.nombre,
          cantidad: 1,
          precio_unitario: Number(p.precio) || 0,
          costo_unitario: Number(p.costo ?? 0) || 0,
          stock: p.controla_stock ? Number(p.stock) : null,
        },
      ];
    });
  }

  function agregarLibre(nombre: string, precio: number, costo: number) {
    setCarrito((prev) => [
      ...prev,
      {
        clave: `libre-${Date.now()}`,
        producto_id: null,
        nombre: nombre || t.venta.ventaSuelta,
        cantidad: 1,
        precio_unitario: precio,
        costo_unitario: costo,
        stock: null,
      },
    ]);
    setLibreAbierto(false);
  }

  function cambiar(clave: string, cambio: Partial<LineaCarrito>) {
    setCarrito((prev) => prev.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
  }

  function quitar(clave: string) {
    setCarrito((prev) => prev.filter((l) => l.clave !== clave));
  }

  function limpiar() {
    setCarrito([]);
    setDescuento(0);
    setCliente('');
    setError('');
  }

  /** Un toque y la venta queda registrada. Sin confirmación intermedia. */
  async function cobrar() {
    if (carrito.length === 0 || guardando || total <= 0) return;
    setGuardando(true);
    setError('');
    const montoCobrado = total;
    const negativos = carrito.filter((l) => l.stock !== null && l.cantidad > l.stock);

    try {
      const supabase = clienteNavegador();

      // Fiar sin decir a quién deja una deuda que nadie puede cobrar. La
      // base lo rechaza; esto lo dice antes, en la pantalla, para que no
      // llegue como un error del servidor después de armar todo el carrito.
      if (metodo === 'credito' && elegido.nombre.trim().length === 0) {
        setError(t.venta.fiarSinNombre);
        setGuardando(false);
        return;
      }

      // Se crea recién acá, y no mientras se escribe: una ficha por cada
      // nombre a medio escribir llenaría la lista de «J», «Ju», «Jua».
      const clienteId = await asegurarCliente(empresaId, elegido);

      const { error } = await supabase.rpc('registrar_venta', {
        p_empresa: empresaId,
        p_items: carrito.map((l) => ({
          producto_id: l.producto_id,
          nombre: l.nombre,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          // El costo solo viaja para productos sueltos. Para los del catálogo
          // lo pone la base de datos: es la única forma de que la ganancia sea real.
          ...(l.producto_id ? {} : { costo_unitario: l.costo_unitario }),
        })),
        p_fecha: fecha,
        p_descripcion: '',
        p_metodo_pago: metodo,
        p_contraparte: elegido.nombre,
        p_cliente: clienteId,
        p_notas: '',
        p_origen: 'manual',
        p_descuento: descuentoAplicado,
        p_cuenta: cuentaMarcada,
      });
      if (error) throw error;

      setExito(t.venta.ventaRegistrada(dinero(montoCobrado, moneda)));
      setAvisoStock(
        negativos.length > 0
          ? t.venta.stockNegativo(negativos.map((l) => l.nombre).join(', '))
          : '',
      );
      limpiar();
      setDetalleAbierto(false);
      router.refresh();
      setTimeout(() => { setExito(''); setAvisoStock(''); }, 3400);
    } catch (e: any) {
      setError(mensajeDeError(e, t.venta.noSeRegistro));
    } finally {
      setGuardando(false);
    }
  }

  const sinCatalogo = productos.length === 0;

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:space-y-0">
      {/* ---------------------- confirmación de venta ----------------------
          Fija arriba y bien visible: después de tocar Cobrar no puede quedar
          ninguna duda de si el toque funcionó. */}
      {exito && (
        <div className="fixed inset-x-0 top-[60px] z-50 px-3 lg:top-24" role="status" aria-live="polite">
          <div className="destello mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-verde px-4 py-3.5 text-sobre-verde shadow-[0_12px_34px_-8px_rgba(40,180,100,.75)]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </span>
            <div className="min-w-0">
              <p className="text-[15.5px] font-bold leading-tight">{exito}</p>
              {avisoStock && <p className="mt-0.5 text-[12.5px] leading-snug text-white/85">{t.venta.ojo} {avisoStock}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------- catálogo ------------------------------- */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta/30" {...trazo}>
              <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
            </svg>
            <input
              className="campo pl-10" placeholder={t.venta.buscarProducto}
              value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <button type="button" className="boton-suave min-h-[48px] shrink-0 px-4" onClick={() => setLibreAbierto(true)}>
            {t.venta.suelto}
          </button>
        </div>

        {categorias.length > 1 && (
          <div className="scroll-limpio -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            {['todas', ...categorias].map((c) => (
              <button
                key={c} type="button" onClick={() => setCategoria(c)}
                className={categoria === c ? 'chip-encendido' : 'chip-apagado'}
              >
                {c === 'todas' ? t.venta.todas : categoriaVisible(t, c)}
              </button>
            ))}
          </div>
        )}

        {sinCatalogo ? (
          <div className="tarjeta">
            <Vacio
              titulo={t.venta.sinProductos}
              detalle={t.venta.sinProductosDetalle}
            />
            <div className="px-6 pb-6 text-center">
              <Link href="/productos" className="boton-principal">{t.venta.cargarProductos}</Link>
            </div>
          </div>
        ) : visibles.length === 0 ? (
          <div className="tarjeta"><Vacio titulo={t.venta.nadaCoincide} detalle={t.venta.nadaCoincideDetalle} /></div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {visibles.map((p, i) => {
              const agotado = p.controla_stock && Number(p.stock) <= 0;
              const enCarrito = carrito.find((l) => l.producto_id === p.id);
              const esFrecuente = !busqueda && categoria === 'todas' && posicion.has(p.id) && i < 4;
              return (
                <button
                  key={p.id} type="button" onClick={() => agregar(p)}
                  className={`tarjeta relative flex min-h-[96px] flex-col justify-between p-3 text-left transition active:scale-[.98] ${
                    enCarrito ? 'border-verde ring-1 ring-verde/30' : ''
                  } ${agotado ? 'opacity-55' : 'hover:border-verde hover:bg-verde-claro/30'}`}
                >
                  {enCarrito && (
                    <span className="absolute -right-1.5 -top-1.5 grid h-6 min-w-[24px] place-items-center rounded-full bg-verde px-1.5 text-[12px] font-bold text-sobre-verde">
                      {numero(enCarrito.cantidad)}
                    </span>
                  )}
                  <span className="line-clamp-2 text-[14px] font-bold leading-snug">
                    {esFrecuente && <span className="mr-1 text-verde-fuerte" aria-label={t.venta.masVendido}>★</span>}
                    {p.nombre}
                  </span>
                  <span className="mt-2 block">
                    <span className="block text-[15px] font-bold tabular-nums text-verde-fuerte">
                      {dinero(Number(p.precio), moneda)}
                    </span>
                    {p.controla_stock && (
                      <span className={`mt-0.5 block text-[11.5px] font-semibold ${
                        agotado ? 'text-rojo' : Number(p.stock) <= Number(p.stock_minimo) ? 'text-ambar' : 'text-tinta/40'
                      }`}>
                        {agotado ? t.venta.sinStock : t.venta.enStock(numero(Number(p.stock)))}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Aire para que la barra de cobro no tape el último producto. */}
        {carrito.length > 0 && <div className="h-36 lg:hidden" aria-hidden />}
      </div>

      {/* --------------------------- carrito de escritorio --------------------------- */}
      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <Carrito
            carrito={carrito} moneda={moneda} dec={dec} total={total} subtotal={subtotal}
            ganancia={ganancia} verCostos={verCostos} descuento={descuento} metodo={metodo} fecha={fecha}
            empresaId={empresaId} elegido={elegido} setElegido={setElegido}
            guardando={guardando} error={error}
            onCambiar={cambiar} onQuitar={quitar} onLimpiar={limpiar} onCobrar={cobrar}
            setDescuento={setDescuento} setMetodo={elegirMetodo} setFecha={setFecha}
            cuentas={cuentas} cuentaElegida={cuentaElegida} setCuentaElegida={setCuentaElegida}
          />
        </div>
      </aside>

      {/* --------------------------- barra de cobro (celular) --------------------------- */}
      {carrito.length > 0 && (
        <div className="zona-segura-abajo fixed inset-x-0 bottom-[68px] z-40 lg:hidden">
          <div className="subir mx-3 overflow-hidden rounded-2xl bg-noche shadow-[0_14px_38px_-10px_rgba(13,27,22,.75)]">
            {/* Método de cobro: visible siempre, un toque para cambiarlo. */}
            <div className="scroll-limpio flex gap-2 overflow-x-auto px-3 pb-1 pt-3">
              {METODOS.map((m) => (
                <button
                  key={m.valor} type="button" onClick={() => elegirMetodo(m.valor)}
                  className={`inline-flex min-h-[40px] shrink-0 items-center rounded-xl px-3.5 text-[13.5px] font-bold transition active:scale-[.97] ${
                    metodo === m.valor ? 'bg-verde text-sobre-verde' : 'bg-white/10 text-white/60'
                  }`}
                >
                  {m.corto}
                </button>
              ))}
            </div>

            {/* A qué banco entró (096): a la vista, como la forma de pago,
                porque cobrar sigue siendo un toque y no hay otro momento
                para decirlo. Solo si hay más de una cuenta posible. */}
            {cuentasPosibles.length > 1 && (
              <div className="scroll-limpio flex gap-2 overflow-x-auto px-3 pt-2" role="group" aria-label={t.cobro.enQueCuenta}>
                {cuentasPosibles.map((c) => (
                  <button
                    key={c.id} type="button" onClick={() => setCuentaElegida(c.id)} aria-pressed={cuentaMarcada === c.id}
                    className={`inline-flex min-h-[36px] max-w-[60vw] shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition active:scale-[.97] ${
                      cuentaMarcada === c.id ? 'bg-verde text-sobre-verde' : 'bg-white/10 text-white/60'
                    }`}
                  >
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/60" style={{ backgroundColor: tonoDeCuenta(c) }} />
                    <span className="truncate">{c.nombre}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-stretch gap-2 p-3">
              {/* Zona de detalle, separada del botón para no cobrar sin querer. */}
              <button
                type="button" onClick={() => setDetalleAbierto(true)}
                className="flex min-w-0 flex-1 flex-col justify-center rounded-xl px-3 py-1.5 text-left transition active:bg-white/10"
              >
                <span className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-white/45">
                  {t.venta.productosEnCarrito(unidades, numero(unidades))}
                  <svg viewBox="0 0 24 24" className="h-3 w-3" {...trazo}><path d="m6 15 6-6 6 6" /></svg>
                </span>
                <span className="truncate text-[23px] font-titulo font-extrabold leading-tight tabular-nums text-white">
                  {dinero(total, moneda)}
                </span>
              </button>

              <button
                type="button" onClick={cobrar} disabled={guardando || total <= 0}
                className="min-h-[58px] shrink-0 rounded-xl bg-verde px-6 text-[16.5px] font-bold text-sobre-verde transition active:scale-[.97] disabled:opacity-50"
              >
                {guardando ? '…' : t.venta.cobrar}
              </button>
            </div>

            {error && (
              <p className="border-t border-white/10 px-4 py-2.5 text-[13px] font-medium text-white">{error}</p>
            )}
          </div>
        </div>
      )}

      {detalleAbierto && (
        <div className="fixed inset-0 z-[60] flex items-end bg-noche/45 backdrop-blur-[2px] lg:hidden" onClick={() => setDetalleAbierto(false)}>
          <div className="zona-segura-abajo max-h-[88vh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie p-4 aparecer" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-borde" />
            <Carrito
              carrito={carrito} moneda={moneda} dec={dec} total={total} subtotal={subtotal}
              ganancia={ganancia} verCostos={verCostos} descuento={descuento} metodo={metodo} fecha={fecha}
            empresaId={empresaId} elegido={elegido} setElegido={setElegido}
              guardando={guardando} error={error} sinMarco
              onCambiar={cambiar} onQuitar={quitar} onLimpiar={limpiar} onCobrar={cobrar}
              setDescuento={setDescuento} setMetodo={elegirMetodo} setFecha={setFecha}
              cuentas={cuentas} cuentaElegida={cuentaElegida} setCuentaElegida={setCuentaElegida}
            />
          </div>
        </div>
      )}

      {/* --------------------------- producto suelto --------------------------- */}
      {libreAbierto && (
        <DialogoLibre moneda={moneda} dec={dec} verCostos={verCostos}
          onCerrar={() => setLibreAbierto(false)} onAgregar={agregarLibre} />
      )}
    </div>
  );
}

function Carrito(props: {
  carrito: LineaCarrito[];
  moneda: string; dec: number; total: number; subtotal: number; ganancia: number; verCostos: boolean;
  descuento: number; metodo: string; fecha: string;
  empresaId: string; elegido: ClienteElegido;
  guardando: boolean; error: string; sinMarco?: boolean;
  onCambiar: (clave: string, c: Partial<LineaCarrito>) => void;
  onQuitar: (clave: string) => void;
  onLimpiar: () => void;
  onCobrar: () => void;
  setDescuento: (n: number) => void;
  setMetodo: (s: string) => void;
  setFecha: (s: string) => void;
  setElegido: (c: ClienteElegido) => void;
  cuentas: CuentaParaElegir[];
  cuentaElegida: string | null;
  setCuentaElegida: (c: string) => void;
}) {
  const t = useTextos();
  const METODOS = metodosDe(t);
  const {
    carrito, moneda, dec, total, subtotal, ganancia, verCostos, descuento, metodo, fecha,
    empresaId, elegido, setElegido,
    guardando, error, sinMarco, onCambiar, onQuitar, onLimpiar, onCobrar,
    setDescuento, setMetodo, setFecha, cuentas, cuentaElegida, setCuentaElegida,
  } = props;

  const [masOpciones, setMasOpciones] = useState(false);

  return (
    <div className={sinMarco ? '' : 'tarjeta overflow-hidden'}>
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-[15px] font-bold tracking-tight">{t.venta.estaVenta}</h2>
        {carrito.length > 0 && (
          <button type="button" onClick={onLimpiar} className="min-h-[40px] px-2 text-[13px] font-semibold text-tinta/40 hover:text-rojo">
            {t.venta.vaciar}
          </button>
        )}
      </div>

      {carrito.length === 0 ? (
        <Vacio titulo={t.venta.carritoVacio} detalle={t.venta.carritoVacioDetalle} />
      ) : (
        <>
          <div className="max-h-[42vh] space-y-2 overflow-y-auto scroll-limpio px-4 lg:max-h-[38vh]">
            {carrito.map((l) => {
              const excede = l.stock !== null && l.cantidad > l.stock;
              return (
                <div key={l.clave} className="rounded-xl border border-borde p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[14px] font-bold leading-snug">{l.nombre}</span>
                    <button
                      type="button" onClick={() => onQuitar(l.clave)} aria-label={t.venta.quitarProducto(l.nombre)}
                      className="icono-toque -mr-2 -mt-2 shrink-0 text-tinta/30 hover:bg-rojo-claro hover:text-rojo"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center rounded-xl border border-borde">
                      <button
                        type="button" aria-label={t.venta.restarUno}
                        className="grid h-11 w-11 place-items-center rounded-l-xl text-[20px] text-tinta/50 active:bg-arena"
                        onClick={() => onCambiar(l.clave, { cantidad: Math.max(1, l.cantidad - 1) })}
                      >−</button>
                      <input
                        type="number" inputMode="numeric" min={1} step="any"
                        aria-label={t.venta.cantidadDe(l.nombre)}
                        className="w-12 border-0 bg-transparent p-0 text-center text-[16px] font-bold tabular-nums outline-none"
                        value={l.cantidad}
                        onChange={(e) => onCambiar(l.clave, { cantidad: Math.max(0.01, Number(e.target.value) || 1) })}
                      />
                      <button
                        type="button" aria-label={t.venta.sumarUno}
                        className="grid h-11 w-11 place-items-center rounded-r-xl text-[20px] text-tinta/50 active:bg-arena"
                        onClick={() => onCambiar(l.clave, { cantidad: l.cantidad + 1 })}
                      >+</button>
                    </div>
                    <span className="text-tinta/30">×</span>
                    <CampoMonto
                      decimales={dec}
                      aria-label={t.venta.precioDe(l.nombre)}
                      className="campo flex-1 py-2 text-right font-semibold"
                      valor={l.precio_unitario}
                      alCambiar={(n) => onCambiar(l.clave, { precio_unitario: n })}
                    />
                  </div>

                  <div className="mt-1.5 flex items-center justify-between">
                    <span className={`text-[11.5px] font-semibold ${excede ? 'text-rojo' : 'text-tinta/40'}`}>
                      {excede ? t.venta.soloQuedan(numero(l.stock!)) : l.stock !== null ? t.venta.enStock(numero(l.stock)) : t.venta.sinControlStock}
                    </span>
                    <span className="text-[13.5px] font-bold tabular-nums">
                      {dinero(l.cantidad * l.precio_unitario, moneda)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3 border-t border-borde px-4 py-3.5">
            <div>
              <span className="etiqueta">{t.venta.comoTePagan}</span>
              <div className="scroll-limpio flex gap-2 overflow-x-auto">
                {METODOS.map((m) => (
                  <button
                    key={m.valor} type="button" onClick={() => setMetodo(m.valor)}
                    className={metodo === m.valor ? 'chip-encendido' : 'chip-apagado'}
                  >
                    {m.largo}
                  </button>
                ))}
              </div>
            </div>

            <ElegirCuenta cuentas={cuentas} metodo={metodo} elegida={cuentaElegida} alElegir={setCuentaElegida} />

            <label className="block">
              <span className="etiqueta">{t.venta.descuento}</span>
              <CampoMonto
                decimales={dec}
                className="campo"
                placeholder="0"
                valor={descuento} alCambiar={setDescuento}
              />
            </label>

            <button
              type="button" onClick={() => setMasOpciones((v) => !v)}
              className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-1 text-[13.5px] font-semibold text-tinta/50"
            >
              {masOpciones ? t.venta.menosOpciones : t.venta.clienteYFecha}
              <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${masOpciones ? 'rotate-180' : ''}`} {...trazo}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {masOpciones && (
              <div className="grid grid-cols-2 gap-2.5 aparecer">
                <SelectorCliente
                  empresaId={empresaId}
                  valor={elegido}
                  alElegir={setElegido}
                  etiqueta={t.venta.cliente}
                  pedirTelefono={metodo === 'credito'}
                  obligatorio={metodo === 'credito'}
                />
                <label className="block">
                  <span className="etiqueta">{t.venta.fecha}</span>
                  <input type="date" className="campo py-2.5" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </label>
              </div>
            )}

            <div className="space-y-1.5 rounded-xl bg-arena p-3">
              <div className="flex justify-between text-[13px] text-tinta/60">
                <span>{t.venta.subtotal}</span><span className="tabular-nums">{dinero(subtotal, moneda)}</span>
              </div>
              {descuento > 0 && (
                <div className="flex justify-between text-[13px] text-rojo">
                  <span>{t.venta.descuento}</span><span className="tabular-nums">− {dinero(Math.min(descuento, subtotal), moneda)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-borde pt-1.5">
                <span className="text-[14px] font-bold">{t.venta.total}</span>
                <span className="text-[20px] font-titulo font-extrabold tabular-nums">{dinero(total, moneda)}</span>
              </div>
              {verCostos && (
                <div className="flex justify-between text-[12.5px] font-semibold text-verde-fuerte">
                  <span>{t.venta.teQueda}</span><span className="tabular-nums">{dinero(ganancia, moneda)}</span>
                </div>
              )}
            </div>

            {descuento > subtotal && (
              <p className="rounded-xl bg-ambar-claro px-3 py-2.5 text-[13px] font-medium text-ambar">
                {t.venta.descuentoMayor}
              </p>
            )}
            {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

            <button
              className="boton-principal min-h-[52px] w-full text-[16px]"
              onClick={onCobrar}
              disabled={guardando || total <= 0 || descuento > subtotal}
            >
              {guardando ? t.venta.registrando : t.venta.cobrarMonto(dinero(total, moneda))}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Producto suelto: lo mínimo para poder cobrar.
 *
 * Precio es lo único obligatorio. El nombre tiene un valor por defecto y el
 * costo queda detrás de un enlace, porque en medio de una venta casi nunca se
 * conoce y no hace falta para registrarla.
 */
function DialogoLibre({
  moneda, dec, verCostos, onCerrar, onAgregar,
}: {
  moneda: string; dec: number; verCostos: boolean;
  onCerrar: () => void;
  onAgregar: (nombre: string, precio: number, costo: number) => void;
}) {
  const t = useTextos();
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState(0);
  const [costo, setCosto] = useState(0);
  const [conCosto, setConCosto] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-noche/45 backdrop-blur-[2px] sm:items-center sm:px-4" onClick={onCerrar}>
      <form
        className="zona-segura-abajo max-h-[88vh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie p-5 aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (precio > 0) onAgregar(nombre.trim(), precio, conCosto ? costo : 0); }}
      >
        <h2 className="text-[18px] font-bold tracking-tight">{t.venta.ventaSuelta}</h2>
        <p className="mt-1 text-[13.5px] text-tinta/55">{t.venta.ventaSueltaDetalle}</p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="etiqueta">{t.venta.precio}</span>
            <CampoMonto
              decimales={dec}
              className="campo text-[22px] font-titulo font-extrabold" autoFocus
              placeholder="0"
              valor={precio} alCambiar={setPrecio}
            />
          </label>

          <label className="block">
            <span className="etiqueta">{t.venta.queEs} <span className="font-normal text-tinta/35">{t.venta.opcionalEntreParentesis}</span></span>
            <input
              className="campo" placeholder={t.venta.queEsEjemplo} maxLength={120}
              value={nombre} onChange={(e) => setNombre(e.target.value)}
            />
          </label>

          {verCostos && !conCosto && (
            <button
              type="button" onClick={() => setConCosto(true)}
              className="min-h-[44px] w-full rounded-xl px-1 text-left text-[13.5px] font-semibold text-tinta/50"
            >
              {t.venta.agregarCosto}
            </button>
          )}

          {verCostos && conCosto && (
            <label className="block aparecer">
              <span className="etiqueta">{t.venta.teCosto}</span>
              <CampoMonto
                decimales={dec}
                className="campo" placeholder="0"
                valor={costo} alCambiar={setCosto}
              />
              <span className="mt-1 block text-[12.5px] font-semibold text-verde-fuerte">
                {t.venta.ganasPorUnidad(dinero(Math.max(0, precio - costo), moneda))}
              </span>
            </label>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button type="button" className="boton-suave min-h-[48px]" onClick={onCerrar}>{t.comun.cancelar}</button>
          <button type="submit" className="boton-principal min-h-[48px]" disabled={precio <= 0}>{t.venta.agregar}</button>
        </div>
      </form>
    </div>
  );
}
