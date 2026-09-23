'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTextos, useLocale, useIdioma } from '@/i18n/cliente';
import type { Textos } from '@/i18n/diccionarios';
import { metodoVisible } from '@/i18n/nombres';
import { categoriaDelRubro } from '@/i18n/textos/gastos-campana';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { type Moneda, dinero, numero, fechaLarga, vistaDe } from '@/lib/formato';
import type { Lote, Movimiento, Rol, TipoMovimiento } from '@/lib/tipos';
import { cultivoVisible } from '@/components/campanas/utiles';
import { Vacio } from '@/components/Piezas';
import { puedeAnular } from '@/lib/permisos';
import { mensajeDeError } from '@/lib/errores';
import { Adjuntos } from './Adjuntos';
import { DialogoAnular } from '@/components/DialogoAnular';
import type { Cursor } from '@/lib/agregados';

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const FILTROS: { valor: 'todos' | TipoMovimiento; texto: 'filtroTodo' | 'filtroVentas' | 'filtroGastos' | 'filtroIngresos' }[] = [
  { valor: 'todos', texto: 'filtroTodo' },
  { valor: 'venta', texto: 'filtroVentas' },
  { valor: 'gasto', texto: 'filtroGastos' },
  { valor: 'ingreso', texto: 'filtroIngresos' },
];

/* ============================================================================
 * LA CAMPAÑA DE CADA MOVIMIENTO (100)
 *
 * Lo que sigue lo usan el historial y la lista de Gastos por igual, y por
 * eso vive acá y se exporta.
 *
 * `pagina_movimientos` (047) no devuelve a qué campaña pertenece cada
 * movimiento, ni si nació dentro de una liquidación o de un reparto. En vez
 * de redefinir esa función —que alimenta el historial de todos los rubros—
 * se piden esas columnas aparte, solo para los ids que ya están en pantalla
 * y solo en los negocios que tienen lotes. La 044 y la 100 dieron `grant
 * select` justo de esas columnas, y la política de la 047 ya decide qué
 * filas ve cada uno.
 * ========================================================================== */

/**
 * Lo mínimo de una campaña para ofrecerla en un chip. Sin los números: no
 * hacen falta y pesan. Lo arma cada página del servidor (una función de
 * este archivo no se puede llamar desde allá: es un módulo del navegador).
 */
export type CampanaParaElegir = Pick<Lote, 'id' | 'nombre' | 'cultivo' | 'campana' | 'hectareas' | 'abierto_el' | 'estado'>;

/**
 * «Norte · Soja»: con dos campañas del mismo lote abiertas, el cultivo es
 * lo que las separa. El cultivo se guarda en español («Maíz») y se dice en
 * el idioma de quien mira («Milho») con `cultivoVisible`, la misma de la
 * tarjeta de la campaña.
 */
export function etiquetaCampana(c: CampanaParaElegir, idioma: string): string {
  const cultivo = c.cultivo ? cultivoVisible(c.cultivo, idioma) : '';
  return cultivo ? `${c.nombre} · ${cultivo}` : c.nombre;
}

export interface VinculoDeCampana {
  lote_id: string | null;
  liquidacion_id: string | null;
  reparto_id: string | null;
  monto_original: number | null;
  moneda_original: string | null;
  cambio: number | null;
}

/** Una parte de un gasto repartido entre campañas. */
export interface ParteDeReparto {
  id: string;
  estado: string;
  lote_id: string | null;
  monto: number;
  fecha: string;
  creado_por: string | null;
}

const COLUMNAS_VINCULO = 'id, lote_id, liquidacion_id, reparto_id, monto_original, moneda_original, cambio';

/**
 * Los vínculos de campaña de los movimientos que están en pantalla.
 *
 * Mientras no llegan, `conocido(id)` da false y la pantalla NO ofrece anular
 * ese movimiento: un gasto que nació dentro de una liquidación anulado suelto
 * deja el papel del silo sin cuadrar, y eso no se arregla después. Un botón
 * que aparece medio segundo tarde es mucho mejor que eso.
 */
export function useVinculosDeCampana(ids: string[], activo: boolean) {
  const [vinculos, setVinculos] = useState<Record<string, VinculoDeCampana>>({});
  const [repartos, setRepartos] = useState<Record<string, ParteDeReparto[]>>({});
  const [vuelta, setVuelta] = useState(0);
  const clave = activo ? ids.join(',') : '';

  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    (async () => {
      const supabase = clienteNavegador();
      const lista = clave.split(',');
      const nuevos: Record<string, VinculoDeCampana> = {};
      // De a cien: una lista de ids muy larga no entra en la dirección del pedido.
      for (let i = 0; i < lista.length; i += 100) {
        const { data, error } = await supabase
          .from('movimientos').select(COLUMNAS_VINCULO).in('id', lista.slice(i, i + 100));
        if (error || !vivo) return;
        for (const f of (data ?? []) as any[]) {
          nuevos[f.id] = {
            lote_id: f.lote_id ?? null,
            liquidacion_id: f.liquidacion_id ?? null,
            reparto_id: f.reparto_id ?? null,
            monto_original: f.monto_original === null || f.monto_original === undefined ? null : Number(f.monto_original),
            moneda_original: f.moneda_original ?? null,
            cambio: f.cambio === null || f.cambio === undefined ? null : Number(f.cambio),
          };
        }
      }
      const idsReparto = Array.from(new Set(Object.values(nuevos).map((v) => v.reparto_id).filter((x): x is string => Boolean(x))));
      const partes: Record<string, ParteDeReparto[]> = {};
      for (let i = 0; i < idsReparto.length; i += 100) {
        const { data, error } = await supabase
          .from('movimientos').select('id, estado, lote_id, monto, fecha, creado_por, reparto_id')
          .in('reparto_id', idsReparto.slice(i, i + 100));
        if (error || !vivo) return;
        for (const f of (data ?? []) as any[]) {
          (partes[f.reparto_id] ??= []).push({
            id: f.id, estado: f.estado, lote_id: f.lote_id ?? null, monto: Number(f.monto),
            fecha: f.fecha, creado_por: f.creado_por ?? null,
          });
        }
      }
      if (!vivo) return;
      setVinculos((prev) => ({ ...prev, ...nuevos }));
      setRepartos((prev) => ({ ...prev, ...partes }));
    })();
    return () => { vivo = false; };
  }, [clave, vuelta]);

  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  const conocido = useCallback((id: string) => !activo || id in vinculos, [activo, vinculos]);
  return { vinculos, repartos, recargar, conocido };
}

/** «Combustible» de «2/3 · Combustible»: la descripción sin el número de parte. */
export function sinNumeroDeParte(descripcion: string): string {
  return descripcion.replace(/^\d+\/\d+ · /, '');
}

/**
 * Anula todas las partes activas de un reparto, una por una, con el mismo
 * camino de siempre (`anular_movimiento`). Si una falla, las anteriores ya
 * quedaron anuladas: se dice cuántas, y volver a intentar anula las que
 * faltan (las ya anuladas no se vuelven a mandar).
 */
export async function anularPartes(partes: ParteDeReparto[], motivo: string, t: Textos): Promise<number> {
  const activas = partes.filter((p) => p.estado === 'activo');
  const supabase = clienteNavegador();
  let hechas = 0;
  for (const p of activas) {
    const { error } = await supabase.rpc('anular_movimiento', { p_movimiento: p.id, p_motivo: motivo || null });
    if (error) {
      if (hechas === 0) throw new Error(mensajeDeError(error, t.gastos.noSePudoAnular));
      throw new Error(t.gastosCampana.historial.anuladasAMedias(hechas, activas.length));
    }
    hechas += 1;
  }
  return hechas;
}

/** El dólar como lo dice la persona («6.000») a partir del cambio guardado. */
export function dolarDeCambio(propia: string, original: string, cambio: number): number {
  if (propia === 'USD' && original === 'PYG' && cambio > 0) return Math.round((1 / cambio) * 100) / 100;
  return cambio;
}

/**
 * Elegir la campaña de un movimiento que ya está cargado: una hoja desde
 * abajo en el celular, con un chip por campaña abierta. Un toque y listo.
 */
export function HojaCampana({
  titulo, actual, campanas, nombreActual, onElegir, onCerrar,
}: {
  titulo: string;
  actual: string | null;
  campanas: CampanaParaElegir[];
  /** El nombre de la campaña actual, aunque esté cerrada y no sea un chip. */
  nombreActual: string | null;
  onElegir: (lote: string | null) => Promise<void>;
  onCerrar: () => void;
}) {
  const t = useTextos();
  const idioma = useIdioma();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');

  async function elegir(lote: string | null) {
    if (trabajando) return;
    setTrabajando(true);
    setError('');
    try {
      await onElegir(lote);
    } catch (e: any) {
      setError(e?.message || t.gastosCampana.historial.noSePudo);
      setTrabajando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-noche/45 backdrop-blur-[2px] sm:items-center sm:px-4"
      onClick={() => !trabajando && onCerrar()}
    >
      <div
        className="zona-segura-abajo max-h-[88vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie p-5 aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-borde sm:hidden" />
        <h2 className="text-[18px] font-bold tracking-tight">{t.gastosCampana.historial.asignar}</h2>
        <p className="mt-1 truncate text-[13.5px] text-tinta/55">{titulo}</p>
        <p className="mt-2 text-[12.5px] font-semibold text-tinta/45">
          {nombreActual ? t.gastosCampana.historial.deLote(nombreActual) : t.gastosCampana.historial.sinLote}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {campanas.map((c) => (
            <button
              key={c.id} type="button" disabled={trabajando} onClick={() => elegir(c.id)}
              aria-pressed={actual === c.id}
              className={`${actual === c.id ? 'chip-encendido' : 'chip-apagado'} min-h-[44px]`}
            >
              {etiquetaCampana(c, idioma)}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

        <div className={`mt-5 grid gap-2.5 ${actual ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button type="button" className="boton-suave min-h-[48px]" onClick={onCerrar} disabled={trabajando}>
            {t.comun.cerrar}
          </button>
          {actual && (
            <button
              type="button" disabled={trabajando} onClick={() => elegir(null)}
              className="boton min-h-[48px] border border-borde bg-superficie text-rojo hover:bg-rojo-claro"
            >
              {t.gastosCampana.historial.sacar}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ListaMovimientos({
  movimientos: inicial, cursorInicial, total, desde, hasta,
  moneda, rol, userId, hoy, cargarPagina, empresaId, guardaComprobantes = false,
  campanas = [], conCampanas = false,
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
  moneda: Moneda;
  rol: Rol;
  userId: string;
  hoy: string;
  cargarPagina: (
    desde: string, hasta: string, cursor: Cursor | null,
    filtros: { tipo?: TipoMovimiento | null; incluirAnuladas?: boolean; busqueda?: string | null },
  ) => Promise<{ movimientos: Movimiento[]; siguiente: Cursor | null }>;
  /**
   * Todas las campañas del negocio, abiertas y cerradas (100): las cerradas
   * para poder nombrar la de un movimiento viejo; los chips, solo abiertas.
   */
  campanas?: CampanaParaElegir[];
  /** Si el negocio tiene lotes (`ficha.secciones['/lotes']`). */
  conCampanas?: boolean;
}) {
  const t = useTextos();
  const locale = useLocale();
  const idioma = useIdioma();
  const router = useRouter();
  const [filtro, setFiltro] = useState<'todos' | TipoMovimiento>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [verAnuladas, setVerAnuladas] = useState(true);
  const [aAnular, setAAnular] = useState<Movimiento | null>(null);
  const [aAnularJuntas, setAAnularJuntas] = useState<{ movimiento: Movimiento; partes: ParteDeReparto[] } | null>(null);
  const [aElegir, setAElegir] = useState<Movimiento | null>(null);

  // El historial se pagina contra el servidor: nunca se descarga el periodo
  // entero. Los filtros también viajan al servidor, así no filtramos sobre
  // una porción y damos la impresión de que no hay más resultados.
  const [movimientos, setMovimientos] = useState<Movimiento[]>(inicial);
  const [cursor, setCursor] = useState<Cursor | null>(cursorInicial);
  const [cargando, startTransition] = useTransition();
  const primeraVez = useRef(true);

  const ids = useMemo(() => movimientos.map((m) => m.id), [movimientos]);
  const { vinculos, repartos, recargar, conocido } = useVinculosDeCampana(ids, conCampanas);
  const abiertas = useMemo(() => campanas.filter((c) => c.estado === 'abierto'), [campanas]);
  const nombreDe = useMemo(() => {
    const mapa = new Map(campanas.map((c) => [c.id, etiquetaCampana(c, idioma)]));
    return (id: string | null | undefined) => (id ? mapa.get(id) ?? null : null);
  }, [campanas, idioma]);
  const propia = vistaDe(moneda).propia;

  // Cuando cambian los filtros, volvemos a pedir la página 1 al servidor.
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }
    const espera = setTimeout(() => {
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
          setError(t.movimientos.noSeCargoHistorial);
        }
      });
    }, 300);
    return () => clearTimeout(espera);
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
        setError(t.movimientos.noSeTrajoMas);
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

  function avisar(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(''), 3400);
  }

  async function anular(id: string, motivo: string) {
    setError('');
    const supabase = clienteNavegador();
    const { error } = await supabase.rpc('anular_movimiento', {
      p_movimiento: id,
      p_motivo: motivo || null,
    });
    if (error) throw new Error(mensajeDeError(error, t.gastos.noSePudoAnular));
    setAAnular(null);
    recargar();
    router.refresh();
  }

  /** Las N partes de un gasto repartido, juntas: anular una sola dejaría el gasto a medias. */
  async function anularJuntas(partes: ParteDeReparto[], motivo: string) {
    setError('');
    try {
      const hechas = await anularPartes(partes, motivo, t);
      setAAnularJuntas(null);
      avisar(t.gastosCampana.historial.anuladasJuntas(hechas));
    } finally {
      // Aunque falle a medias, lo que ya se anuló tiene que verse.
      recargar();
      router.refresh();
    }
  }

  async function asignar(m: Movimiento, lote: string | null) {
    const supabase = clienteNavegador();
    const { error } = await supabase.rpc('asignar_a_lote', { p_movimiento: m.id, p_lote: lote });
    if (error) throw new Error(mensajeDeError(error, t.gastosCampana.historial.noSePudo));
    setAElegir(null);
    const nombre = nombreDe(lote);
    avisar(lote && nombre ? t.gastosCampana.historial.asignado(nombre) : t.gastosCampana.historial.sacado);
    recargar();
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
                filtro === f.valor ? 'border-verde bg-verde text-sobre-verde' : 'border-borde bg-superficie text-tinta/60'
              }`}
            >
              {t.movimientos[f.texto]}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-tinta/55">
        <input
          type="checkbox" className="h-3.5 w-3.5 accent-[#22a55a]"
          checked={verAnuladas} onChange={(e) => setVerAnuladas(e.target.checked)}
        />
        {t.movimientos.mostrarAnuladas}
      </label>

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
      {aviso && (
        <p role="status" aria-live="polite" className="rounded-xl bg-verde-claro px-3 py-2.5 text-[13px] font-semibold text-verde-fuerte">
          {aviso}
        </p>
      )}

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
                  <h3 className="text-[13.5px] font-bold capitalize">{fechaLarga(fecha, locale)}</h3>
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
                    const v = vinculos[m.id];
                    // Nació dentro de una liquidación: se maneja desde la
                    // campaña, entera. Suelto no se anula ni se mueve.
                    const deLiquidacion = Boolean(v?.liquidacion_id);
                    const partes = v?.reparto_id ? repartos[v.reparto_id] ?? [] : [];
                    const repartido = partes.length > 1;
                    const partesActivas = partes.filter((p) => p.estado === 'activo');
                    const sePuedeAnular = puedeAnular({ rol, userId }, m, hoy) && conocido(m.id) && !deLiquidacion;
                    const nombreLote = nombreDe(v?.lote_id);
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
                                {m.descripcion || t.gastos.sinDescripcion}
                              </span>
                              <span className="block truncate text-[12px] text-tinta/45">
                                {anulado && <span className="font-bold text-rojo">{t.pantallas.anulada} · </span>}
                                {categoriaDelRubro(t, m.categoria)} · {metodoVisible(t, m.metodo_pago)}
                                {m.contraparte ? ` · ${m.contraparte}` : ''}
                                {items.length > 0 ? ` · ${t.movimientos.productos(items.length)}` : ''}
                                {Number(m.descuento) > 0 ? ` · ${t.movimientos.descuentoCorto(dinero(Number(m.descuento), moneda, false))}` : ''}
                                {m.origen !== 'manual' ? ` · ${t.movimientos.porIA}` : ''}
                                {nombreLote ? ` · ${nombreLote}` : ''}
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
                                  {t.movimientos.queda(dinero(ganancia, moneda, false))}
                                </span>
                              )}
                            </span>
                          </button>

                          {sePuedeAnular && (
                            <button
                              type="button"
                              onClick={() => (repartido
                                ? setAAnularJuntas({ movimiento: m, partes })
                                : setAAnular(m))}
                              aria-label={t.pantallas.anular} title={t.movimientos.anularEste}
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
                                  {t.movimientos.subtotalYDescuento(dinero(Number(m.subtotal), moneda, false), dinero(Number(m.descuento), moneda, false))}
                                </span>
                                <span className="font-bold tabular-nums">{dinero(Number(m.monto), moneda, false)}</span>
                              </div>
                            )}
                            {anulado && (
                              <p className="mt-3 rounded-lg bg-rojo-claro px-3 py-2 text-[12.5px] font-medium text-rojo">
                                {t.movimientos.anuladaEl(m.anulado_at ? m.anulado_at.slice(0, 10).split('-').reverse().join('/') : null)}
                                {m.motivo_anulacion ? ` · ${m.motivo_anulacion}` : ''}.
                                {m.tipo === 'venta' && ` ${t.movimientos.stockDevuelto}`}
                              </p>
                            )}
                            {m.notas && (
                              <p className="mt-3 border-t border-borde pt-2.5 text-[12.5px] italic text-tinta/55">
                                &laquo;{m.notas}&raquo;
                              </p>
                            )}

                            {/* LA CAMPAÑA (100). De qué campaña es, lo que
                                se pagó en la otra moneda, y las dos cosas
                                que no se tocan sueltas: lo que nació en una
                                liquidación y las partes de un reparto. */}
                            {conCampanas && v && (
                              <div className="mt-3 space-y-2.5 border-t border-borde pt-3">
                                {v.monto_original !== null && v.moneda_original && v.cambio !== null && (
                                  <p className="text-[12.5px] text-tinta/55">
                                    {t.gastosCampana.moneda.original(
                                      dinero(v.monto_original, v.moneda_original),
                                      numero(dolarDeCambio(propia, v.moneda_original, v.cambio), locale),
                                    )}
                                  </p>
                                )}

                                {deLiquidacion ? (
                                  <div className="rounded-lg bg-ambar-claro px-3 py-2 text-[12.5px] text-ambar">
                                    <p className="font-bold">
                                      {t.gastosCampana.historial.parteDeLiquidacion(m.fecha.slice(8, 10) + '/' + m.fecha.slice(5, 7))}
                                      {nombreLote ? ` · ${nombreLote}` : ''}
                                    </p>
                                    <p className="mt-0.5 leading-snug">{t.gastosCampana.historial.parteDeLiquidacionDetalle}</p>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[13px] font-semibold text-tinta/65">
                                      {nombreLote ? t.gastosCampana.historial.deLote(nombreLote) : t.gastosCampana.historial.sinLote}
                                    </span>
                                    {!anulado && (abiertas.length > 0 || v.lote_id) && (
                                      <button
                                        type="button" onClick={() => setAElegir(m)}
                                        className="boton-suave min-h-[44px] px-4 text-[13.5px]"
                                      >
                                        {t.gastosCampana.historial.accion}
                                      </button>
                                    )}
                                  </div>
                                )}

                                {repartido && (
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[12.5px] font-semibold text-tinta/55">
                                      {t.gastosCampana.historial.repartido(partes.length)}
                                    </span>
                                    {sePuedeAnular && partesActivas.length > 0 && (
                                      <button
                                        type="button" onClick={() => setAAnularJuntas({ movimiento: m, partes })}
                                        className="boton min-h-[44px] border border-borde bg-superficie px-4 text-[13.5px] text-rojo hover:bg-rojo-claro"
                                      >
                                        {t.gastosCampana.historial.anularJuntas(partesActivas.length)}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
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
            {cargando ? t.comun.cargando : t.movimientos.verMas}
          </button>
        </div>
      )}

      {!error && !cursor && movimientos.length > 0 && total > movimientos.length && (
        <p className="text-center text-[12.5px] text-tinta/45">
          {t.movimientos.deTotal(numero(movimientos.length), numero(total))}
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

      {/* El mismo diálogo de siempre, con el gasto entero: la descripción sin
          «1/3 ·» y la suma de las partes que siguen activas. */}
      {aAnularJuntas && (
        <DialogoAnular
          movimiento={{
            ...aAnularJuntas.movimiento,
            descripcion: `${sinNumeroDeParte(aAnularJuntas.movimiento.descripcion)} · ${t.gastosCampana.historial.repartido(aAnularJuntas.partes.length)}`,
            monto: aAnularJuntas.partes.filter((p) => p.estado === 'activo').reduce((s, p) => s + p.monto, 0),
          }}
          moneda={moneda}
          onCerrar={() => setAAnularJuntas(null)}
          onConfirmar={(motivo) => anularJuntas(aAnularJuntas.partes, motivo)}
        />
      )}

      {aElegir && (
        <HojaCampana
          titulo={aElegir.descripcion || t.gastos.sinDescripcion}
          actual={vinculos[aElegir.id]?.lote_id ?? null}
          nombreActual={nombreDe(vinculos[aElegir.id]?.lote_id)}
          campanas={abiertas}
          onElegir={(lote) => asignar(aElegir, lote)}
          onCerrar={() => setAElegir(null)}
        />
      )}
    </div>
  );
}
