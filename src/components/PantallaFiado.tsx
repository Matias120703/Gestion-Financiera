'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale, useTextos } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import type { Textos } from '@/i18n/diccionarios';
import { dinero, fechaLegible } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { enlaceWhatsApp } from '@/lib/telefono';
import { Indicador, Vacio } from '@/components/Piezas';
import { SelectorCliente, asegurarCliente, type ClienteElegido } from '@/components/SelectorCliente';
import type { CuentaParaElegir, DeudorFiado, LineaFiado, ResumenFiado } from '@/lib/tipos';

/** Cómo se cobra un fiado. Se guarda el código; se lee con `metodoVisible`. */
const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

const NADIE: ClienteElegido = { id: null, nombre: '', telefono: '' };

/**
 * «hace 12 días».
 *
 * Un número suelto no dice si es mucho o poco. «Me debe 800.000» y «me debe
 * 800.000 desde hace cuatro meses» son dos situaciones distintas, y la
 * segunda es la que hay que ir a cobrar.
 */
function hace(t: Textos, dias: number | null): string {
  if (dias == null) return '';
  if (dias <= 0) return t.fiado.desdeHoy;
  if (dias === 1) return t.fiado.desdeAyer;
  return t.fiado.haceDias(dias);
}

/**
 * FIADO · LO QUE TE DEBEN
 *
 * Se ordena por monto, de más a menos: quien entra acá viene a saber a quién
 * tiene que ir a cobrarle primero. La antigüedad va al lado de cada uno, y en
 * rojo cuando pasa del mes.
 *
 * COBRAR NO SUMA OTRA VEZ
 *
 * La venta fiada ya se contó el día que salió la mercadería. Cobrarla solo
 * baja lo que te deben; si además sumara como ingreso, la ganancia contaría
 * la misma venta dos veces (ver migración 056). La pantalla lo dice abajo,
 * porque es exactamente lo que alguien esperaría que pase y no pasa.
 */
export function PantallaFiado({
  empresaId, moneda, zona, negocio, esPersonal, resumen, cuentas = [],
}: {
  empresaId: string;
  moneda: string;
  zona: string;
  negocio: string;
  esPersonal: boolean;
  resumen: ResumenFiado;
  /** Las cuentas de la billetera, para decir de cuál salió lo prestado (084). */
  cuentas?: CuentaParaElegir[];
}) {
  const router = useRouter();
  const t = useTextos();
  const locale = useLocale();
  const plata = (n: number) => dinero(n, moneda, true, locale);

  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  const masViejo = resumen.clientes.reduce<DeudorFiado | null>(
    (m, d) => ((d.dias ?? -1) > (m?.dias ?? -1) ? d : m), null);

  const quienes = esPersonal ? t.fiado.personas(resumen.cuantos) : t.fiado.clientes(resumen.cuantos);

  function listo(mensaje: string) {
    setAviso(mensaje);
    setNuevo(false);
    setAbierto(null);
    router.refresh();
    setTimeout(() => setAviso(''), 4500);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Indicador
          destacado
          titulo={t.fiado.teDeben}
          valor={plata(resumen.total)}
          detalle={resumen.cuantos > 0 ? quienes : t.fiado.nadieTeDebeNada}
        />
        <Indicador
          titulo={t.fiado.loMasViejo}
          valor={masViejo ? hace(t, masViejo.dias) : '—'}
          detalle={masViejo ? masViejo.nombre : t.fiado.sinDeudasPendientes}
        />
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-claro px-4 py-3 text-[13.5px] font-semibold text-verde-fuerte aparecer">
          ✓ {aviso}
        </p>
      )}

      {nuevo ? (
        <FormularioNuevo
          empresaId={empresaId}
          esPersonal={esPersonal}
          plata={plata}
          onCerrar={() => setNuevo(false)}
          onListo={listo}
          cuentas={cuentas}
        />
      ) : (
        <button type="button" className="boton-principal w-full py-3" onClick={() => setNuevo(true)}>
          {esPersonal ? t.fiado.anotarQueTeDeben : t.fiado.anotarFiado}
        </button>
      )}

      <div className="tarjeta overflow-hidden">
        {resumen.clientes.length === 0 ? (
          <Vacio
            titulo={t.fiado.nadieTeDebeTitulo}
            detalle={esPersonal ? t.fiado.vacioPersonal : t.fiado.vacioNegocio}
          />
        ) : (
          <ul className="divide-y divide-borde">
            {resumen.clientes.map((d) => (
              <FilaDeudor
                key={d.cliente_id}
                d={d}
                empresaId={empresaId}
                zona={zona}
                negocio={negocio}
                esPersonal={esPersonal}
                plata={plata}
                locale={locale}
                abierto={abierto === d.cliente_id}
                onAbrir={() => setAbierto(abierto === d.cliente_id ? null : d.cliente_id)}
                onListo={listo}
                cuentas={cuentas}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="text-[12.5px] leading-relaxed text-tinta/45">
        {esPersonal
          ? t.fiado.notaPersonal
          : t.fiado.notaNegocio}
      </p>
    </div>
  );
}

/** Anotar a mano que alguien te debe. */
function FormularioNuevo({
  empresaId, esPersonal, plata, onCerrar, onListo, cuentas,
}: {
  empresaId: string;
  esPersonal: boolean;
  plata: (n: number) => string;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
  cuentas: CuentaParaElegir[];
}) {
  const t = useTextos();
  const [elegido, setElegido] = useState<ClienteElegido>(NADIE);
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  /**
   * De qué cuenta salió la plata (084). Vacío = no salió de ninguna, que es
   * lo que pasa cuando fiás una venta: entregaste mercadería, no plata.
   * Arranca vacío a propósito: mover el saldo de alguien sin que lo haya
   * pedido es peor que no moverlo.
   */
  const [cuentaId, setCuentaId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const n = Number(monto);
  const puede = elegido.nombre.trim().length > 0 && n > 0 && !guardando;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!puede) return;
    setGuardando(true);
    setError('');
    try {
      // La ficha se crea recién acá: una por cada nombre a medio escribir
      // llenaría la lista de «J», «Ju», «Jua».
      const clienteId = await asegurarCliente(empresaId, elegido);
      if (!clienteId) throw new Error(t.fiado.escribiAQuien);

      const { error: err } = await clienteNavegador().rpc('anotar_fiado', {
        p_empresa: empresaId,
        p_cliente: clienteId,
        p_monto: n,
        p_concepto: concepto.trim(),
        p_cuenta: cuentaId || null,
      });
      if (err) throw err;
      onListo(t.fiado.anotado(elegido.nombre.trim(), plata(n)));
    } catch (e: any) {
      setError(mensajeDeError(e, t.fiado.noSePudoAnotar));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="tarjeta space-y-3 p-4 aparecer">
      <p className="titulo-seccion">{esPersonal ? t.fiado.alguienTeDebe : t.fiado.anotarFiado}</p>

      <SelectorCliente
        empresaId={empresaId}
        valor={elegido}
        alElegir={setElegido}
        etiqueta={t.fiado.quienTeDebe}
        pedirTelefono
        obligatorio
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="etiqueta">{t.fiado.cuanto}</span>
          <input
            type="number" min={0} step="any" inputMode="decimal"
            className="campo tabular-nums" placeholder="500000"
            value={monto} onChange={(e) => setMonto(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="etiqueta">{t.fiado.porQue} <span className="font-normal text-tinta/40">{t.fiado.opcional}</span></span>
          <input
            className="campo" maxLength={200}
            placeholder={esPersonal ? t.fiado.lePreste : t.fiado.mercaderia}
            value={concepto} onChange={(e) => setConcepto(e.target.value)}
          />
        </label>
      </div>

      {/* De dónde salió la plata (084). Fiar una venta y prestar plata se
          anotaban igual, y son dos cosas distintas: en la venta entregás
          mercadería y de tus cuentas no sale nada; en el préstamo sale plata
          de verdad y el saldo tiene que bajar. */}
      {cuentas.length > 0 && (
        <div>
          <span className="etiqueta">{t.fiado.salioDeTuBilletera}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button" onClick={() => setCuentaId('')}
              className={cuentaId === '' ? 'chip-encendido' : 'chip-apagado'}
            >
              {t.fiado.noSalioPlata}
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
          <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">
            {cuentaId === '' ? t.fiado.noSalioPlataDetalle : t.fiado.salioDetalle}
          </p>
        </div>
      )}

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      <div className="flex gap-2">
        <button type="button" className="boton-texto px-4" onClick={onCerrar}>{t.comun.cancelar}</button>
        <button className="boton-principal flex-1 py-2.5 disabled:opacity-40" disabled={!puede}>
          {guardando ? t.comun.guardando : t.fiado.anotar}
        </button>
      </div>
    </form>
  );
}

/** Una persona que te debe, con lo necesario para cobrarle. */
function FilaDeudor({
  d, empresaId, zona, negocio, esPersonal, plata, locale, abierto, onAbrir, onListo, cuentas,
}: {
  d: DeudorFiado;
  empresaId: string;
  zona: string;
  negocio: string;
  esPersonal: boolean;
  plata: (n: number) => string;
  locale: string;
  abierto: boolean;
  onAbrir: () => void;
  onListo: (mensaje: string) => void;
  /** Para decir en qué cuenta entró la plata que te pagaron (084). */
  cuentas: CuentaParaElegir[];
}) {
  // Se propone todo lo que debe: es lo que se cobra casi siempre, y si pagó
  // una parte se corrige un número en vez de escribirlo de cero.
  const t = useTextos();
  const [monto, setMonto] = useState(String(d.saldo));
  const [metodo, setMetodo] = useState('efectivo');
  /**
   * En qué cuenta entró (084). Vacío = no se toca ningún saldo, que es lo
   * correcto si te pagaron en efectivo y no llevás caja en Orden.
   *
   * Sube el saldo como AJUSTE y no como ingreso: la 056 sacó a propósito el
   * ingreso que creaba el cobro porque inflaba la ganancia —la venta fiada
   * ya se contó el día de la venta—. Un préstamo que vuelve tampoco es
   * ganancia. El ajuste mueve la plata sin tocar ese número.
   */
  const [cuentaCobro, setCuentaCobro] = useState('');
  const [libro, setLibro] = useState<LineaFiado[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const n = Number(monto);
  const puede = n > 0 && n <= d.saldo && !guardando;
  const viejo = (d.dias ?? 0) > 30;

  const primero = d.nombre.trim().split(/\s+/)[0] || d.nombre;
  const mensaje = esPersonal
    ? t.fiado.mensajePersonal(primero, plata(d.saldo))
    : t.fiado.mensajeNegocio(primero, negocio, plata(d.saldo));
  const whatsapp = d.telefono ? enlaceWhatsApp(d.telefono, zona, mensaje) : '';

  async function verLibro() {
    if (libro || cargando) return;
    setCargando(true);
    try {
      const { data, error: err } = await clienteNavegador().rpc('libro_fiado', {
        p_cliente: d.cliente_id, p_limite: 100,
      });
      if (err) throw err;
      setLibro(Array.isArray(data) ? (data as LineaFiado[]) : []);
    } catch (e: any) {
      setError(mensajeDeError(e, t.fiado.noSeLeyoDetalle));
    } finally {
      setCargando(false);
    }
  }

  async function cobrar(e: React.FormEvent) {
    e.preventDefault();
    if (!puede) return;
    setGuardando(true);
    setError('');
    try {
      const { error: err } = await clienteNavegador().rpc('cobrar_fiado', {
        p_empresa: empresaId, p_cliente: d.cliente_id, p_monto: n, p_metodo: metodo,
        p_cuenta: cuentaCobro || null,
      });
      if (err) throw err;
      onListo(n >= d.saldo
        ? t.fiado.pagoTodo(d.nombre)
        : t.fiado.cobrasteParte(plata(n), d.nombre, plata(d.saldo - n)));
    } catch (e: any) {
      setError(mensajeDeError(e, t.fiado.noSePudoCobrar));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(l: LineaFiado) {
    const pregunta = l.tipo === 'fio'
      ? t.fiado.borrarFiado(plata(Number(l.monto)))
      : t.fiado.borrarPago(plata(Number(l.monto)));
    if (!window.confirm(pregunta)) return;
    setError('');
    try {
      const { error: err } = await clienteNavegador().rpc('borrar_linea_fiado', { p_linea: l.id });
      if (err) throw err;
      onListo(t.fiado.borrado);
    } catch (e: any) {
      setError(mensajeDeError(e, t.fiado.noSePudoBorrar));
    }
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => { onAbrir(); if (!abierto) verLibro(); }}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-arena/60"
      >
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{d.nombre}</p>
          <p className={`text-[12.5px] ${viejo ? 'font-semibold text-rojo' : 'text-tinta/45'}`}>
            {hace(t, d.dias)}{d.telefono ? ` · ${d.telefono}` : ''}
          </p>
        </div>
        <p className="shrink-0 text-[16px] font-bold tabular-nums">{plata(d.saldo)}</p>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-borde bg-arena/40 px-4 py-4 aparecer">
          <form onSubmit={cobrar} className="flex flex-wrap items-end gap-2">
            <label className="block min-w-[9rem] flex-1">
              <span className="etiqueta">{t.fiado.tePago}</span>
              <input
                type="number" min={0} step="any" inputMode="decimal"
                className="campo tabular-nums"
                value={monto} onChange={(e) => setMonto(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="etiqueta">{t.fiado.como}</span>
              <select className="campo" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {METODOS.map((m) => <option key={m} value={m}>{metodoVisible(t, m)}</option>)}
              </select>
            </label>
            {cuentas.length > 0 && (
              <label className="block">
                <span className="etiqueta">{t.fiado.enQueCuentaEntro}</span>
                <select
                  className="campo" value={cuentaCobro}
                  onChange={(e) => setCuentaCobro(e.target.value)}
                >
                  <option value="">{t.fiado.noEntroEnNinguna}</option>
                  {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </label>
            )}
            <button className="boton-principal px-5 py-2.5 disabled:opacity-40" disabled={!puede}>
              {guardando ? t.fiado.cobrando : t.fiado.cobrar}
            </button>
          </form>

          {n > d.saldo && (
            <p className="text-[12.5px] font-medium text-rojo">
              {t.fiado.noMasQueEso(plata(d.saldo))}
            </p>
          )}

          {whatsapp && (
            <a
              href={whatsapp} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-verde/40 px-3.5 py-2 text-[13.5px] font-semibold text-verde-fuerte hover:bg-verde-claro"
            >
              {t.fiado.recordarlePorWhatsApp}
            </a>
          )}

          {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

          <div>
            <p className="etiqueta">{t.fiado.detalle}</p>
            {cargando && <p className="text-[12.5px] text-tinta/45">{t.comun.cargando}</p>}
            {libro && libro.length === 0 && <p className="text-[12.5px] text-tinta/45">{t.fiado.sinMovimientos}</p>}
            {libro && libro.length > 0 && (
              <ul className="mt-1 space-y-1.5">
                {libro.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-tinta/65">
                      {fechaLegible(l.fecha, false, locale)} · {l.concepto || (l.tipo === 'fio' ? t.fiado.lineaFiado : t.fiado.lineaPago)}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className={`font-semibold tabular-nums ${l.tipo === 'cobro' ? 'text-verde-fuerte' : 'text-tinta'}`}>
                        {l.tipo === 'cobro' ? '−' : '+'} {plata(Number(l.monto))}
                      </span>
                      {/* Lo que vino de una venta no se borra acá: se anula la
                          venta, que es la que además devuelve el stock. */}
                      {!l.venta_id && (
                        <button
                          type="button" onClick={() => borrar(l)}
                          className="rounded-md px-1 text-tinta/35 hover:bg-rojo-claro hover:text-rojo"
                          aria-label={t.fiado.borrarLinea}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
