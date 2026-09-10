'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale } from '@/i18n/cliente';
import { dinero, fechaLegible } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { enlaceWhatsApp } from '@/lib/telefono';
import { Indicador, Vacio } from '@/components/Piezas';
import { SelectorCliente, asegurarCliente, type ClienteElegido } from '@/components/SelectorCliente';
import type { DeudorFiado, LineaFiado, ResumenFiado } from '@/lib/tipos';

const METODOS = [
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'tarjeta', texto: 'Tarjeta' },
  { valor: 'otro', texto: 'Otro' },
];

const NADIE: ClienteElegido = { id: null, nombre: '', telefono: '' };

/**
 * «hace 12 días».
 *
 * Un número suelto no dice si es mucho o poco. «Me debe 800.000» y «me debe
 * 800.000 desde hace cuatro meses» son dos situaciones distintas, y la
 * segunda es la que hay que ir a cobrar.
 */
function hace(dias: number | null): string {
  if (dias == null) return '';
  if (dias <= 0) return 'desde hoy';
  if (dias === 1) return 'desde ayer';
  return `hace ${dias} días`;
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
  empresaId, moneda, zona, negocio, esPersonal, resumen,
}: {
  empresaId: string;
  moneda: string;
  zona: string;
  negocio: string;
  esPersonal: boolean;
  resumen: ResumenFiado;
}) {
  const router = useRouter();
  const locale = useLocale();
  const plata = (n: number) => dinero(n, moneda, true, locale);

  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  const masViejo = resumen.clientes.reduce<DeudorFiado | null>(
    (m, d) => ((d.dias ?? -1) > (m?.dias ?? -1) ? d : m), null);

  const quienes = esPersonal
    ? (resumen.cuantos === 1 ? '1 persona' : `${resumen.cuantos} personas`)
    : (resumen.cuantos === 1 ? '1 cliente' : `${resumen.cuantos} clientes`);

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
          titulo="Te deben"
          valor={plata(resumen.total)}
          detalle={resumen.cuantos > 0 ? quienes : 'nadie te debe nada'}
        />
        <Indicador
          titulo="Lo más viejo"
          valor={masViejo ? hace(masViejo.dias) : '—'}
          detalle={masViejo ? masViejo.nombre : 'sin deudas pendientes'}
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
        />
      ) : (
        <button type="button" className="boton-principal w-full py-3" onClick={() => setNuevo(true)}>
          {esPersonal ? 'Anotar que alguien te debe' : 'Anotar un fiado'}
        </button>
      )}

      <div className="tarjeta overflow-hidden">
        {resumen.clientes.length === 0 ? (
          <Vacio
            titulo="Nadie te debe nada"
            detalle={esPersonal
              ? 'Cuando le prestes plata a alguien, anotalo acá y no te olvidás.'
              : 'Cuando vendas algo «Fiado», aparece acá solo. También lo podés anotar a mano.'}
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
              />
            ))}
          </ul>
        )}
      </div>

      <p className="text-[12.5px] leading-relaxed text-tinta/45">
        {esPersonal
          ? 'Lo que te devuelven no cuenta como ingreso: es tu propia plata que vuelve.'
          : 'Una venta fiada cuenta como venta el día que se lleva la mercadería. Cobrarla acá baja lo que te deben, pero no la suma otra vez: si lo hiciera, tu ganancia contaría la misma venta dos veces.'}
      </p>
    </div>
  );
}

/** Anotar a mano que alguien te debe. */
function FormularioNuevo({
  empresaId, esPersonal, plata, onCerrar, onListo,
}: {
  empresaId: string;
  esPersonal: boolean;
  plata: (n: number) => string;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const [elegido, setElegido] = useState<ClienteElegido>(NADIE);
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
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
      if (!clienteId) throw new Error('Escribí a quién.');

      const { error: err } = await clienteNavegador().rpc('anotar_fiado', {
        p_empresa: empresaId,
        p_cliente: clienteId,
        p_monto: n,
        p_concepto: concepto.trim(),
      });
      if (err) throw err;
      onListo(`Anotado: ${elegido.nombre.trim()} te debe ${plata(n)} más.`);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo anotar.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="tarjeta space-y-3 p-4 aparecer">
      <p className="titulo-seccion">{esPersonal ? 'Alguien te debe' : 'Anotar un fiado'}</p>

      <SelectorCliente
        empresaId={empresaId}
        valor={elegido}
        alElegir={setElegido}
        etiqueta="¿Quién te debe?"
        pedirTelefono
        obligatorio
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="etiqueta">Cuánto</span>
          <input
            type="number" min={0} step="any" inputMode="decimal"
            className="campo tabular-nums" placeholder="500000"
            value={monto} onChange={(e) => setMonto(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="etiqueta">Por qué <span className="font-normal text-tinta/40">· opcional</span></span>
          <input
            className="campo" maxLength={200}
            placeholder={esPersonal ? 'Le presté' : 'Mercadería'}
            value={concepto} onChange={(e) => setConcepto(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      <div className="flex gap-2">
        <button type="button" className="boton-texto px-4" onClick={onCerrar}>Cancelar</button>
        <button className="boton-principal flex-1 py-2.5 disabled:opacity-40" disabled={!puede}>
          {guardando ? 'Guardando…' : 'Anotar'}
        </button>
      </div>
    </form>
  );
}

/** Una persona que te debe, con lo necesario para cobrarle. */
function FilaDeudor({
  d, empresaId, zona, negocio, esPersonal, plata, locale, abierto, onAbrir, onListo,
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
}) {
  // Se propone todo lo que debe: es lo que se cobra casi siempre, y si pagó
  // una parte se corrige un número en vez de escribirlo de cero.
  const [monto, setMonto] = useState(String(d.saldo));
  const [metodo, setMetodo] = useState('efectivo');
  const [libro, setLibro] = useState<LineaFiado[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const n = Number(monto);
  const puede = n > 0 && n <= d.saldo && !guardando;
  const viejo = (d.dias ?? 0) > 30;

  const primero = d.nombre.trim().split(/\s+/)[0] || d.nombre;
  const mensaje = esPersonal
    ? `Hola ${primero}! Te recuerdo lo que quedó pendiente: ${plata(d.saldo)}. Cuando puedas, avisame. ¡Gracias!`
    : `Hola ${primero}! Te escribo de ${negocio}. Quedó pendiente ${plata(d.saldo)}. Cuando puedas, avisame. ¡Gracias!`;
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
      setError(mensajeDeError(e, 'No se pudo leer el detalle.'));
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
      });
      if (err) throw err;
      onListo(n >= d.saldo
        ? `${d.nombre} te pagó todo.`
        : `Cobraste ${plata(n)} a ${d.nombre}. Todavía te debe ${plata(d.saldo - n)}.`);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo cobrar.'));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(l: LineaFiado) {
    const pregunta = l.tipo === 'fio'
      ? `¿Borrar lo anotado (${plata(Number(l.monto))})?`
      : `¿Borrar este pago de ${plata(Number(l.monto))}? Vuelve a deberlo.`;
    if (!window.confirm(pregunta)) return;
    setError('');
    try {
      const { error: err } = await clienteNavegador().rpc('borrar_linea_fiado', { p_linea: l.id });
      if (err) throw err;
      onListo('Borrado.');
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo borrar.'));
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
            {hace(d.dias)}{d.telefono ? ` · ${d.telefono}` : ''}
          </p>
        </div>
        <p className="shrink-0 text-[16px] font-bold tabular-nums">{plata(d.saldo)}</p>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-borde bg-arena/40 px-4 py-4 aparecer">
          <form onSubmit={cobrar} className="flex flex-wrap items-end gap-2">
            <label className="block min-w-[9rem] flex-1">
              <span className="etiqueta">Te pagó</span>
              <input
                type="number" min={0} step="any" inputMode="decimal"
                className="campo tabular-nums"
                value={monto} onChange={(e) => setMonto(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="etiqueta">Cómo</span>
              <select className="campo" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {METODOS.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
              </select>
            </label>
            <button className="boton-principal px-5 py-2.5 disabled:opacity-40" disabled={!puede}>
              {guardando ? 'Cobrando…' : 'Cobrar'}
            </button>
          </form>

          {n > d.saldo && (
            <p className="text-[12.5px] font-medium text-rojo">
              Te debe {plata(d.saldo)}. No se le puede cobrar más que eso.
            </p>
          )}

          {whatsapp && (
            <a
              href={whatsapp} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-verde/40 px-3.5 py-2 text-[13.5px] font-semibold text-verde-fuerte hover:bg-verde-claro"
            >
              Recordarle por WhatsApp
            </a>
          )}

          {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

          <div>
            <p className="etiqueta">Detalle</p>
            {cargando && <p className="text-[12.5px] text-tinta/45">Cargando…</p>}
            {libro && libro.length === 0 && <p className="text-[12.5px] text-tinta/45">Sin movimientos.</p>}
            {libro && libro.length > 0 && (
              <ul className="mt-1 space-y-1.5">
                {libro.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-tinta/65">
                      {fechaLegible(l.fecha, false, locale)} · {l.concepto || (l.tipo === 'fio' ? 'Fiado' : 'Pago')}
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
                          aria-label="Borrar esta línea"
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
