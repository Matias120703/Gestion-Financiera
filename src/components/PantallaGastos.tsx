'use client';

import { useState } from 'react';
import { useTextos, useLocale } from '@/i18n/cliente';
import { categoriaVisible, metodoVisible } from '@/i18n/nombres';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { CampoMonto } from '@/components/CampoMonto';
import { dinero, decimalesDe, fechaLegible } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { useZona } from '@/lib/zona';
import type { CuentaParaElegir, Movimiento, Rol } from '@/lib/tipos';
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

/** Las formas de pago, en el orden de los chips. Se guarda el código; lo que se lee sale de `metodoVisible`. */
const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'credito', 'otro'];

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function PantallaGastos({
  empresaId, moneda, movimientos, categoriasUsadas, rol, userId, hoy, hayMas = false, cuentas = [],
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
  /** Las cuentas de la billetera, para elegir una a mano (075). */
  cuentas?: CuentaParaElegir[];
}) {
  const t = useTextos();
  const locale = useLocale();
  const zona = useZona();
  const router = useRouter();
  const dec = decimalesDe(moneda);

  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState<number>(0);
  const [categoria, setCategoria] = useState('Mercadería');
  const [fecha, setFecha] = useState(hoyISO(zona));
  const [metodo, setMetodo] = useState('efectivo');
  /** Vacío = la que reciba esa forma de pago, como hasta ahora (074). */
  const [cuentaId, setCuentaId] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [aAnular, setAAnular] = useState<Movimiento | null>(null);
  const [masOpciones, setMasOpciones] = useState(false);

  const rapidas = tipo === 'gasto' ? RAPIDAS_GASTO : RAPIDAS_INGRESO;

  /**
   * A dónde va a parar la plata si se deja «automática» (083).
   *
   * Es la misma regla que aplica el trigger de la base: la cuenta que
   * reclama esa forma de pago. Si no hay ninguna, el movimiento se guarda
   * igual pero queda FUERA de la billetera, y eso hay que decirlo antes de
   * guardar y no descubrirlo tres semanas después mirando un total que no
   * cierra.
   */
  const destino = cuentas.find((c) => (c.metodos ?? []).includes(metodo)) ?? null;

  const categorias = Array.from(new Set([...categoriasUsadas, ...SUGERIDAS])).filter(Boolean);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (monto <= 0) { setError(t.gastos.montoMayorACero); return; }
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
        // Vacío deja que el disparador la deduzca de la forma de pago (074).
        cuenta_id: cuentaId || null,
        origen: 'manual',
      });
      if (error) throw error;
      setExito(t.gastos.registrado(tipo === 'gasto', dinero(monto, moneda)));
      setDescripcion(''); setMonto(0); setNotas('');
      setMasOpciones(false);
      router.refresh();
      setTimeout(() => setExito(''), 3400);
    } catch (e: any) {
      setError(mensajeDeError(e, t.gastos.noSePudoGuardar));
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
    if (error) throw new Error(mensajeDeError(error, t.gastos.noSePudoAnular));
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
          {(['gasto', 'ingreso'] as const).map((clase) => (
            <button
              key={clase} type="button" onClick={() => { setTipo(clase); setCategoria(clase === 'gasto' ? 'Mercadería' : 'Otros ingresos'); }}
              className={`rounded-lg py-2 text-[13.5px] font-bold transition ${
                tipo === clase ? 'bg-superficie shadow-sm ' + (clase === 'gasto' ? 'text-rojo' : 'text-verde-fuerte') : 'text-tinta/50'
              }`}
            >
              {clase === 'gasto' ? t.gastos.salioPlata : t.gastos.entroPlata}
            </button>
          ))}
        </div>

        {/* Tres toques: monto, categoría, guardar. Todo lo demás tiene un
            valor por defecto razonable y está plegado. */}
        <form onSubmit={guardar} className="mt-4 space-y-3">
          <label className="block">
            <span className="etiqueta">{t.pantallas.cuanto}</span>
            {/* Con separadores mientras se teclea: en guaraníes, «1500000»
                y «150000» se distinguen contando ceros. Ver CampoMonto.tsx. */}
            <CampoMonto
              className="campo text-[26px] font-titulo font-extrabold" autoFocus
              valor={monto} decimales={dec} placeholder="0"
              alCambiar={(n) => setMonto(Math.max(0, n))}
            />
            {monto > 0 && <span className="mt-1 block text-[13px] font-semibold text-tinta/50">{dinero(monto, moneda)}</span>}
          </label>

          <div>
            <span className="etiqueta">{t.pantallas.enQue}</span>
            <div className="flex flex-wrap gap-2">
              {rapidas.map((c) => (
                <button
                  key={c} type="button" onClick={() => setCategoria(c)}
                  className={categoria === c ? 'chip-encendido' : 'chip-apagado'}
                >
                  {categoriaVisible(t, c)}
                </button>
              ))}
            </div>
            {!rapidas.includes(categoria) && (
              <input
                className="campo mt-2" list="categorias-gasto" maxLength={40}
                placeholder={t.pantallas.otraCategoria}
                value={categoria} onChange={(e) => setCategoria(e.target.value)}
              />
            )}
            <datalist id="categorias-gasto">
              {categorias.map((c) => <option key={c} value={c} label={categoriaVisible(t, c)} />)}
            </datalist>
          </div>

          <button
            type="button" onClick={() => setMasOpciones((v) => !v)}
            className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-1 text-[13.5px] font-semibold text-tinta/50"
          >
            {masOpciones ? t.gastos.menosDetalles : t.gastos.masDetalles}
            <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${masOpciones ? 'rotate-180' : ''}`} {...trazo}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {/*
            LOS DETALLES, COMO UNA SECCIÓN Y NO COMO CAMPOS SUELTOS.

            Matías, mirándolo en el iPhone: «cuando abro para poner en qué,
            qué fecha y demás, se desestructura todo; es muy feo». Era eso:
            los chips de forma de pago se cortaban contra el borde, la aclaración
            del detalle quedaba pegada a la etiqueta, y la fecha y la nota
            compartían dos columnas de 160 px. Ahora todo esto vive dentro de
            un bloque con borde propio, cada cosa en su renglón, y las dos
            columnas recién aparecen cuando hay ancho para ellas.
          */}
          {masOpciones && (
            <div className="space-y-3.5 rounded-2xl border border-borde/70 bg-arena/40 p-3.5 aparecer">
              <label className="block">
                <span className="etiqueta mb-0.5">{t.pantallas.detalle}</span>
                <span className="mb-1.5 block text-[12px] leading-snug text-tinta/45">
                  {t.gastos.siNoPonesNada(categoriaVisible(t, categoria || 'General'))}
                </span>
                <input
                  className="campo" maxLength={120}
                  placeholder={tipo === 'gasto' ? t.gastos.ejemploGasto : t.gastos.ejemploIngreso}
                  value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                />
              </label>

              <div>
                <span className="etiqueta">{t.pantallas.formaDePago}</span>
                <div className="flex flex-wrap gap-2">
                  {METODOS.map((v) => (
                    <button
                      key={v} type="button" onClick={() => setMetodo(v)}
                      className={metodo === v ? 'chip-encendido' : 'chip-apagado'}
                    >
                      {metodoVisible(t, v)}
                    </button>
                  ))}
                </div>
              </div>

              {/*
                DE QUÉ CUENTA SALIÓ (075).

                Con una sola cuenta no se pregunta: la forma de pago ya la
                encuentra sola. Con dos bancos sí, porque «transferencia» no
                dice a cuál de los dos. «Automática» deja el reparto de la 074.
              */}
              {cuentas.length > 0 && (
                <div>
                  <span className="etiqueta">{tipo === 'gasto' ? t.gastos.deQueCuenta : t.gastos.aQueCuenta}</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button" onClick={() => setCuentaId('')}
                      className={cuentaId === '' ? 'chip-encendido' : 'chip-apagado'}
                    >
                      {t.gastos.automatica}
                    </button>
                    {cuentas.map((c) => (
                      <button
                        key={c.id} type="button" onClick={() => setCuentaId(c.id)}
                        className={cuentaId === c.id ? 'chip-encendido' : 'chip-apagado'}
                      >
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                  {cuentaId === '' && (
                    destino
                      ? (
                        <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">
                          {t.gastos.iraA(destino.nombre)}
                        </p>
                      )
                      : (
                        <p className="mt-1.5 text-[12px] leading-snug font-medium text-ambar">
                          {t.gastos.noVaANinguna}
                        </p>
                      )
                  )}
                </div>
              )}

              <div className="grid gap-3.5 sm:grid-cols-2">
                <label className="block">
                  <span className="etiqueta">{t.venta.fecha}</span>
                  <input type="date" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </label>
                <label className="block">
                  <span className="etiqueta">{t.pantallas.nota}</span>
                  <input className="campo" maxLength={200} placeholder={t.venta.opcional} value={notas} onChange={(e) => setNotas(e.target.value)} />
                </label>
              </div>
            </div>
          )}

          {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

          <button className="boton-principal min-h-[52px] w-full text-[16px]" disabled={guardando || monto <= 0}>
            {guardando ? t.comun.guardando : monto > 0 ? t.gastos.guardarMonto(dinero(monto, moneda)) : t.comun.guardar}
          </button>
        </form>
      </div>

      {/* ------------------------------ listado ------------------------------ */}
      <Seccion titulo={hayMas ? t.gastos.ultimosDelPeriodo : t.gastos.delPeriodo}>
        {movimientos.length === 0 ? (
          <Vacio titulo={t.pantallas.nadaPorAca} detalle={t.pantallas.nadaPorAcaDetalle} />
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
                      {mv.descripcion || t.gastos.sinDescripcion}
                    </p>
                    <p className="truncate text-[12px] text-tinta/45">
                      {anulado && <span className="font-bold text-rojo">{t.pantallas.anulado} · </span>}
                      {fechaLegible(mv.fecha, false, locale)} · {categoriaVisible(t, mv.categoria)} · {metodoVisible(t, mv.metodo_pago)}
                      {mv.origen !== 'manual' && ` · ${t.gastos.porVoz}`}
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
                      aria-label={t.pantallas.anularMovimiento} title={t.pantallas.anular}
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
            {t.gastos.seMuestranRecientes}{' '}
            {t.gastos.paraVerElResto} <a href="/movimientos" className="boton-texto">{t.gastos.historialCompleto}</a>.
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
