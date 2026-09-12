'use client';

import { useEffect, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, decimalesDe, numero } from '@/lib/formato';
import { mensajeDeError, verificarAfectados } from '@/lib/errores';
import { useTextos } from '@/i18n/cliente';
import { OpcionesTipo } from '@/components/OpcionesTipo';
import type { CapturaInterpretada, Producto, ProductoDictado, TipoCaptura, TipoCuenta } from '@/lib/tipos';

const VACIO: ProductoDictado = {
  accion: 'crear', producto_id: null, nombre: '', es_servicio: false,
  precio: null, costo: null, cantidad: null, categoria: 'General',
};

const ACCIONES: { clave: ProductoDictado['accion']; texto: string }[] = [
  { clave: 'crear', texto: 'Agregar' },
  { clave: 'precio', texto: 'Cambiar precio' },
  { clave: 'stock', texto: 'Sumar stock' },
];

/**
 * «AGREGÁ EL SHAMPOO: ME CUESTA 20 MIL Y LO VENDO A 35»
 *
 * Algo del catálogo por voz: uno nuevo, un precio nuevo, o stock que entró.
 * Guarda igual que la pantalla de Productos —directo en la tabla, y la base
 * solo se lo deja hacer al dueño o a un administrador—, y si no se guardó
 * por eso lo dice, en vez de fallar callado.
 *
 * Sumar stock SUMA: «entraron 10» sobre 4 deja 14. Se muestra antes de
 * guardar, porque escribir 10 donde había 4 sería perder los que ya estaban.
 */
export function RevisionProducto({
  borrador, moneda, empresaId, tipoCuenta, onCambio, onCancelar, onListo,
}: {
  borrador: CapturaInterpretada;
  moneda: string;
  empresaId: string;
  tipoCuenta: TipoCuenta;
  onCambio: (c: CapturaInterpretada) => void;
  onCancelar: () => void;
  /** Guardado. Quien la abrió cierra y refresca. */
  onListo: () => void;
}) {
  const t = useTextos();
  const dec = decimalesDe(moneda);
  const plata = (n: number) => dinero(n, moneda);
  const p = borrador.producto ?? VACIO;
  const [catalogo, setCatalogo] = useState<Producto[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // El catálogo, para elegir a cuál cambiarle el precio o el stock. Solo se
  // pide si hace falta: agregar algo nuevo no lo necesita.
  useEffect(() => {
    if (p.accion === 'crear' || catalogo !== null) return;
    let vivo = true;
    (async () => {
      try {
        const { data } = await clienteNavegador().rpc('listar_productos', {
          p_empresa: empresaId, p_incluir_pausados: false,
        });
        if (vivo) setCatalogo(Array.isArray(data) ? (data as Producto[]) : []);
      } catch {
        if (vivo) setCatalogo([]);
      }
    })();
    return () => { vivo = false; };
  }, [p.accion, catalogo, empresaId]);

  function set(cambio: Partial<ProductoDictado>) {
    onCambio({ ...borrador, producto: { ...p, ...cambio } });
  }

  const cifra = (v: string): number | null => (v === '' ? null : Math.max(0, Number(v) || 0));

  const elegido = catalogo?.find((x) => x.id === p.producto_id) ?? null;
  // Al sumar stock solo se ofrece lo que lleva stock: un corte no se «repone».
  const opciones = (catalogo ?? []).filter((x) => p.accion !== 'stock' || x.controla_stock);

  const puede = !guardando && (
    p.accion === 'crear' ? p.nombre.trim() !== ''
      : p.accion === 'precio' ? elegido !== null && (p.precio ?? 0) > 0
        : elegido !== null && (p.cantidad ?? 0) > 0);

  async function guardar() {
    if (!puede) return;
    setGuardando(true);
    setError('');
    try {
      const sb = clienteNavegador();
      let res: { data: unknown; error: unknown } | null = null;
      if (p.accion === 'crear') {
        res = await sb.from('productos').insert({
          empresa_id: empresaId,
          nombre: p.nombre.trim(),
          categoria: p.categoria.trim() || 'General',
          precio: p.precio ?? 0,
          // Un servicio no tiene costo de compra ni stock: pedirlos sería
          // inventar un número (ver PantallaProductos).
          costo: p.es_servicio ? 0 : (p.costo ?? 0),
          stock: p.es_servicio ? 0 : (p.cantidad ?? 0),
          stock_minimo: 0,
          controla_stock: !p.es_servicio,
          activo: true,
        }).select('id');
      } else if (p.accion === 'precio' && elegido) {
        res = await sb.from('productos').update({
          precio: p.precio ?? 0,
          ...(p.costo !== null && elegido.controla_stock ? { costo: p.costo } : {}),
        }).eq('id', elegido.id).select('id');
      } else if (elegido) {
        res = await sb.from('productos')
          .update({ stock: Number(elegido.stock) + (p.cantidad ?? 0) })
          .eq('id', elegido.id).select('id');
      }
      if (res?.error) throw res.error;
      verificarAfectados(res?.data as any, 'No se guardó: solo el dueño o un administrador puede tocar el catálogo.');
      onListo();
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      setError(/duplicate key|unique/i.test(msg)
        ? 'Ya tenés algo con ese nombre en el catálogo.'
        : mensajeDeError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  const titulo = p.accion === 'crear' ? (p.es_servicio ? 'Servicio nuevo' : 'Producto nuevo')
    : p.accion === 'precio' ? 'Precio nuevo' : 'Entró stock';

  const segmento = (activo: boolean) =>
    `rounded-lg px-2 py-2 text-center text-[13px] font-semibold transition ${
      activo ? 'bg-superficie text-tinta shadow-sm' : 'text-tinta/50 hover:text-tinta'}`;

  return (
    <div className="max-h-[78vh] overflow-y-auto scroll-limpio">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold tracking-tight">{t.captura.revisar}</h2>
          <p className="mt-0.5 text-[13.5px] text-tinta/55">{t.captura.podesCorregir}</p>
        </div>
        <span className="pastilla shrink-0 bg-arena text-tinta/65">{titulo}</span>
      </div>

      {borrador.transcripcion && (
        <p className="mb-4 rounded-xl bg-arena px-3.5 py-2.5 text-[13px] italic leading-relaxed text-tinta/60">
          &laquo;{borrador.transcripcion}&raquo;
        </p>
      )}
      {borrador.aviso && (
        <p className="mb-4 rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">{borrador.aviso}</p>
      )}

      <div className="space-y-3">
        <div>
          <label className="etiqueta">{t.captura.campoTipo}</label>
          <select
            className="campo" value={borrador.tipo}
            onChange={(e) => onCambio({ ...borrador, tipo: e.target.value as TipoCaptura })}
          >
            <OpcionesTipo tipoCuenta={tipoCuenta} />
          </select>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-arena p-1">
          {ACCIONES.map((a) => (
            <button key={a.clave} type="button" className={segmento(p.accion === a.clave)}
              onClick={() => set({ accion: a.clave })}>
              {a.texto}
            </button>
          ))}
        </div>

        {p.accion === 'crear' ? (
          <>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-arena p-1">
              <button type="button" className={segmento(p.es_servicio)} onClick={() => set({ es_servicio: true })}>
                Servicio
              </button>
              <button type="button" className={segmento(!p.es_servicio)} onClick={() => set({ es_servicio: false })}>
                Producto
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block">
                <span className="etiqueta">Nombre</span>
                <input className="campo" maxLength={120} value={p.nombre} onChange={(e) => set({ nombre: e.target.value })} />
              </label>
              <label className="block">
                <span className="etiqueta">Lo vendés a</span>
                <input type="number" inputMode="decimal" min={0} step={dec === 0 ? 1 : 0.01} className="campo tabular-nums"
                  placeholder="0" value={p.precio ?? ''} onChange={(e) => set({ precio: cifra(e.target.value) })} />
              </label>
              <label className="block">
                <span className="etiqueta">Categoría</span>
                <input className="campo" maxLength={40} value={p.categoria} onChange={(e) => set({ categoria: e.target.value })} />
              </label>
              {!p.es_servicio && (
                <>
                  <label className="block">
                    <span className="etiqueta">Te cuesta</span>
                    <input type="number" inputMode="decimal" min={0} step={dec === 0 ? 1 : 0.01} className="campo tabular-nums"
                      placeholder="0" value={p.costo ?? ''} onChange={(e) => set({ costo: cifra(e.target.value) })} />
                  </label>
                  <label className="block">
                    <span className="etiqueta">Cuántos tenés</span>
                    <input type="number" inputMode="decimal" min={0} step="any" className="campo tabular-nums"
                      placeholder="0" value={p.cantidad ?? ''} onChange={(e) => set({ cantidad: cifra(e.target.value) })} />
                  </label>
                </>
              )}
            </div>
            {!p.es_servicio && (p.precio ?? 0) > 0 && (p.costo ?? 0) > 0 && (
              <p className="rounded-xl bg-arena px-3 py-2 text-[13px] text-tinta/60">
                Ganás {plata((p.precio ?? 0) - (p.costo ?? 0))} por unidad.
              </p>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="etiqueta">{p.accion === 'precio' ? '¿A cuál?' : '¿De cuál entró?'}</label>
              {catalogo === null ? (
                <p className="py-2 text-[13px] text-tinta/45">{t.comun.cargando}</p>
              ) : opciones.length === 0 ? (
                <p className="rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
                  {p.accion === 'stock' ? 'No tenés productos que lleven stock.' : 'Tu catálogo está vacío.'}
                </p>
              ) : (
                <select className="campo" value={p.producto_id ?? ''} onChange={(e) => set({ producto_id: e.target.value || null })}>
                  <option value="">{t.captura.elegiUna}</option>
                  {opciones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              )}
            </div>
            {p.accion === 'precio' ? (
              <label className="block">
                <span className="etiqueta">Precio nuevo</span>
                <input type="number" inputMode="decimal" min={0} step={dec === 0 ? 1 : 0.01} className="campo tabular-nums"
                  placeholder="0" value={p.precio ?? ''} onChange={(e) => set({ precio: cifra(e.target.value) })} />
                {elegido && (
                  <span className="mt-1 block text-[12.5px] text-tinta/50">Hoy está a {plata(Number(elegido.precio))}.</span>
                )}
              </label>
            ) : (
              <label className="block">
                <span className="etiqueta">Cuántos entraron</span>
                <input type="number" inputMode="decimal" min={0} step="any" className="campo tabular-nums"
                  placeholder="0" value={p.cantidad ?? ''} onChange={(e) => set({ cantidad: cifra(e.target.value) })} />
                {elegido && (p.cantidad ?? 0) > 0 && (
                  <span className="mt-1 block text-[12.5px] font-semibold text-verde-fuerte">
                    Tenés {numero(Number(elegido.stock))} → vas a tener {numero(Number(elegido.stock) + (p.cantidad ?? 0))}.
                  </span>
                )}
              </label>
            )}
          </>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      <div className="mt-5 grid grid-cols-2 gap-2.5 pb-1">
        <button className="boton-suave py-3" onClick={onCancelar} disabled={guardando}>{t.captura.atras}</button>
        <button className="boton-principal py-3" onClick={guardar} disabled={!puede}>
          {guardando ? t.comun.guardando : t.comun.guardar}
        </button>
      </div>
    </div>
  );
}
