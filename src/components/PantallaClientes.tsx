'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale } from '@/i18n/cliente';
import { dinero } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { enlaceWhatsApp } from '@/lib/telefono';
import { Indicador, Vacio } from '@/components/Piezas';
import type { ClienteLista, TurnoCliente } from '@/lib/tipos';

const ESTADOS: Record<string, string> = {
  pendiente: 'Reservado',
  confirmada: 'Confirmado',
  atendida: 'Atendido',
  cancelada: 'Cancelado',
  no_vino: 'No vino',
};

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function haceTanto(iso: string | null): string {
  const d = diasDesde(iso);
  if (d == null) return '';
  if (d === 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 60) return `hace ${d} días`;
  return `hace ${Math.round(d / 30)} meses`;
}

/**
 * CLIENTES · A QUIÉN LE VENDÉS
 *
 * Se llena solo: cada reserva con teléfono y cada venta fiada dejan la ficha
 * del cliente, y quien lo atendió no tuvo que hacer nada aparte (053, 055).
 * También se puede agregar a mano.
 *
 * BUSCAR SIN ESPERAR
 *
 * La lista viene entera y se filtra acá. En un mostrador con alguien
 * esperando, cada letra que tarda en responder es una razón para abandonar
 * el buscador y volver a la libreta.
 *
 * El número se busca como número: «0981 234» encuentra a quien se anotó
 * como «0981234567». La gente escribe los teléfonos de cualquier manera.
 */
export function PantallaClientes({
  empresaId, moneda, zona, negocio, clientes, saldos, tieneAgenda, puedeEliminar,
}: {
  empresaId: string;
  moneda: string;
  zona: string;
  negocio: string;
  clientes: ClienteLista[];
  saldos: Record<string, number>;
  tieneAgenda: boolean;
  /** Dueño y administradores. Un vendedor carga clientes pero no los saca. */
  puedeEliminar: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const plata = (n: number) => dinero(n, moneda, true, locale);

  const [busca, setBusca] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  const visibles = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    const digitos = texto.replace(/\D/g, '');
    if (!texto) return clientes;
    return clientes.filter((c) =>
      c.nombre.toLowerCase().includes(texto)
      || (digitos.length > 0 && c.telefono.replace(/\D/g, '').includes(digitos)));
  }, [busca, clientes]);

  const totalDeben = Object.values(saldos).reduce((s, n) => s + n, 0);
  const cuantosDeben = Object.values(saldos).filter((n) => n > 0).length;

  function listo(mensaje: string) {
    setAviso(mensaje);
    setNuevo(false);
    router.refresh();
    setTimeout(() => setAviso(''), 4000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Indicador
          destacado
          titulo="Clientes"
          valor={String(clientes.length)}
          detalle={clientes.length === 1 ? 'cargado' : 'cargados'}
        />
        <Link href="/fiado" className="block">
          <Indicador
            titulo="Te deben"
            valor={plata(totalDeben)}
            detalle={cuantosDeben === 0 ? 'nadie te debe' : `${cuantosDeben} ${cuantosDeben === 1 ? 'cliente' : 'clientes'} · ver fiado`}
          />
        </Link>
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-claro px-4 py-3 text-[13.5px] font-semibold text-verde-fuerte aparecer">
          ✓ {aviso}
        </p>
      )}

      <div className="flex gap-2">
        <input
          className="campo flex-1"
          placeholder="Buscar por nombre o teléfono"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {!nuevo && (
          <button type="button" className="boton-principal shrink-0 px-4" onClick={() => setNuevo(true)}>
            Agregar
          </button>
        )}
      </div>

      {nuevo && (
        <FormularioCliente
          empresaId={empresaId}
          titulo="Cliente nuevo"
          onCerrar={() => setNuevo(false)}
          onListo={listo}
        />
      )}

      <div className="tarjeta overflow-hidden">
        {clientes.length === 0 ? (
          <Vacio
            titulo="Todavía no hay clientes"
            detalle={tieneAgenda
              ? 'Cada vez que alguien reserve un turno con su teléfono, queda cargado acá solo.'
              : 'Cuando vendas algo fiado, el cliente queda cargado acá solo. También lo podés agregar a mano.'}
          />
        ) : visibles.length === 0 ? (
          <Vacio titulo="Nadie coincide" detalle={`No hay ningún cliente con «${busca.trim()}».`} />
        ) : (
          <ul className="divide-y divide-borde">
            {visibles.map((c) => (
              <FilaCliente
                key={c.id}
                c={c}
                debe={saldos[c.id] ?? 0}
                empresaId={empresaId}
                zona={zona}
                negocio={negocio}
                plata={plata}
                locale={locale}
                tieneAgenda={tieneAgenda}
                puedeEliminar={puedeEliminar}
                abierto={abierto === c.id}
                onAbrir={() => setAbierto(abierto === c.id ? null : c.id)}
                onListo={listo}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Crear o editar un cliente. Con `c`, edita. */
function FormularioCliente({
  empresaId, c, titulo, onCerrar, onListo,
  puedeEliminar = false, debe = 0, plata, proximo = '',
}: {
  empresaId: string;
  c?: ClienteLista;
  titulo: string;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
  /** Solo dueño y administradores. La base lo vuelve a verificar (058). */
  puedeEliminar?: boolean;
  /** Lo que debe. A quien debe no se lo elimina: se lo manda a Fiado. */
  debe?: number;
  plata?: (n: number) => string;
  /** Su próximo turno ya escrito, para avisar que no se cancela. */
  proximo?: string;
}) {
  const [nombre, setNombre] = useState(c?.nombre ?? '');
  const [telefono, setTelefono] = useState(c?.telefono ?? '');
  const [notas, setNotas] = useState(c?.notas ?? '');
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState('');

  const puede = nombre.trim().length > 0 && !guardando;

  /**
   * Eliminar no es igual en todos los casos, y lo decide la base (058): sin
   * nada atado se borra; con ventas o turnos se archiva, para que lo que ya
   * pasó siga diciendo a quién. Para quien toca el botón es lo mismo: deja
   * de estar en la lista.
   */
  async function eliminar() {
    if (!c || eliminando) return;
    setEliminando(true);
    setError('');
    try {
      const { error: err } = await clienteNavegador().rpc('eliminar_cliente', { p_cliente: c.id });
      if (err) throw err;
      onListo(`${c.nombre} ya no está en tu lista.`);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo eliminar.'));
      setConfirmar(false);
    } finally {
      setEliminando(false);
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!puede) return;
    setGuardando(true);
    setError('');
    try {
      const { error: err } = await clienteNavegador().rpc('guardar_cliente', {
        p_empresa: empresaId,
        p_nombre: nombre.trim(),
        p_telefono: telefono.trim(),
        p_notas: notas.trim(),
        ...(c ? { p_id: c.id } : {}),
      });
      if (err) throw err;
      onListo(c ? 'Guardado.' : `${nombre.trim()} quedó cargado.`);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="tarjeta space-y-3 p-4 aparecer">
      <p className="titulo-seccion">{titulo}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="etiqueta">Nombre</span>
          <input className="campo" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiqueta">Teléfono</span>
          <input
            className="campo" inputMode="tel" maxLength={40} placeholder="0981 234 567"
            value={telefono} onChange={(e) => setTelefono(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="etiqueta">Notas <span className="font-normal text-tinta/40">· opcional</span></span>
        <input
          className="campo" maxLength={1000} placeholder="Prefiere los martes, es alérgica a…"
          value={notas} onChange={(e) => setNotas(e.target.value)}
        />
      </label>
      {!c && (
        <p className="text-[12px] leading-snug text-tinta/45">
          Si ese teléfono ya es de otro cliente, no se duplica: se actualiza el que ya estaba.
        </p>
      )}
      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="boton-texto px-4" onClick={onCerrar}>Cancelar</button>
        <button className="boton-principal flex-1 py-2.5 disabled:opacity-40" disabled={!puede}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {/* Eliminar va abajo y separado: es lo menos frecuente, y lo único de
          acá que no se arregla con otro «Guardar». */}
      {c && puedeEliminar && (
        confirmar ? (
          <div className="space-y-2.5 rounded-xl bg-rojo-claro px-3.5 py-3 aparecer">
            <p className="text-[13.5px] font-bold text-rojo">¿Eliminar a {c.nombre}?</p>
            <p className="text-[12.5px] leading-snug text-tinta/65">
              Deja de aparecer en tu lista y al elegir cliente. Lo que ya pasó con {c.nombre} queda
              en tu historial.{proximo && ` Su turno del ${proximo} no se cancela.`}
            </p>
            <div className="flex gap-2">
              <button type="button" className="boton-texto px-4" onClick={() => setConfirmar(false)}>No</button>
              <button
                type="button" onClick={eliminar} disabled={eliminando}
                className="flex-1 rounded-xl bg-rojo px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
              >
                {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        ) : debe > 0 ? (
          // A quien te debe no se lo elimina: el libro de fiado cuelga de su
          // ficha. La base lo frena igual (058); acá se dice qué hacer antes.
          <p className="border-t border-borde pt-3 text-[12.5px] leading-snug text-tinta/50">
            Para eliminar a {c.nombre}, primero cobrale o borrá su deuda de {plata ? plata(debe) : debe} en{' '}
            <Link href="/fiado" className="font-semibold text-verde-fuerte underline">Fiado</Link>.
          </p>
        ) : (
          <div className="border-t border-borde pt-3">
            <button
              type="button" onClick={() => setConfirmar(true)}
              className="text-[13px] font-semibold text-rojo/80 hover:text-rojo"
            >
              Eliminar cliente
            </button>
          </div>
        )
      )}
    </form>
  );
}

function FilaCliente({
  c, debe, empresaId, zona, negocio, plata, locale, tieneAgenda, puedeEliminar, abierto, onAbrir, onListo,
}: {
  c: ClienteLista;
  debe: number;
  empresaId: string;
  zona: string;
  negocio: string;
  plata: (n: number) => string;
  locale: string;
  tieneAgenda: boolean;
  puedeEliminar: boolean;
  abierto: boolean;
  onAbrir: () => void;
  onListo: (mensaje: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [turnos, setTurnos] = useState<TurnoCliente[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const primero = c.nombre.trim().split(/\s+/)[0] || c.nombre;
  const whatsapp = c.telefono
    ? enlaceWhatsApp(c.telefono, zona, `Hola ${primero}! Te escribo de ${negocio}.`)
    : '';

  async function verTurnos() {
    if (!tieneAgenda || turnos || cargando) return;
    setCargando(true);
    try {
      const { data, error: err } = await clienteNavegador().rpc('historial_cliente', {
        p_cliente: c.id, p_limite: 20,
      });
      if (err) throw err;
      setTurnos(Array.isArray(data) ? (data as TurnoCliente[]) : []);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo leer el historial.'));
    } finally {
      setCargando(false);
    }
  }

  const detalle = [
    c.telefono,
    tieneAgenda && c.visitas > 0
      ? `${c.visitas} ${c.visitas === 1 ? 'visita' : 'visitas'} · la última ${haceTanto(c.ultima_visita)}`
      : '',
  ].filter(Boolean).join(' · ');

  const proximo = c.proximo_turno
    ? new Date(c.proximo_turno).toLocaleString(locale, {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: zona,
      })
    : '';

  return (
    <li>
      <button
        type="button"
        onClick={() => { onAbrir(); if (!abierto) verTurnos(); }}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-arena/60"
      >
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{c.nombre}</p>
          {detalle && <p className="truncate text-[12.5px] text-tinta/45">{detalle}</p>}
        </div>
        {debe > 0 && (
          <span className="shrink-0 rounded-full bg-rojo-claro px-2.5 py-1 text-[12px] font-bold tabular-nums text-rojo">
            debe {plata(debe)}
          </span>
        )}
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-borde bg-arena/40 px-4 py-4 aparecer">
          {editando ? (
            <FormularioCliente
              empresaId={empresaId}
              c={c}
              titulo="Editar cliente"
              onCerrar={() => setEditando(false)}
              onListo={(m) => { setEditando(false); onListo(m); }}
              puedeEliminar={puedeEliminar}
              debe={debe}
              plata={plata}
              proximo={proximo}
            />
          ) : (
            <>
              {c.notas && <p className="text-[13.5px] leading-relaxed text-tinta/70">{c.notas}</p>}

              {tieneAgenda && (
                <div className="grid grid-cols-2 gap-2 text-[13px]">
                  <div className="rounded-xl bg-superficie px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/45">Dejó en total</p>
                    <p className="mt-0.5 font-bold tabular-nums">{plata(c.gastado)}</p>
                  </div>
                  <div className="rounded-xl bg-superficie px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/45">Próximo turno</p>
                    <p className="mt-0.5 font-bold">{proximo || 'ninguno'}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {whatsapp && (
                  <a
                    href={whatsapp} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center rounded-xl border border-verde/40 px-3.5 py-2 text-[13.5px] font-semibold text-verde-fuerte hover:bg-verde-claro"
                  >
                    WhatsApp
                  </a>
                )}
                {debe > 0 && (
                  <Link
                    href="/fiado"
                    className="inline-flex items-center rounded-xl border border-borde bg-superficie px-3.5 py-2 text-[13.5px] font-semibold text-tinta/70 hover:bg-arena"
                  >
                    Cobrarle {plata(debe)}
                  </Link>
                )}
                <button
                  type="button" onClick={() => setEditando(true)}
                  className="inline-flex items-center rounded-xl border border-borde bg-superficie px-3.5 py-2 text-[13.5px] font-semibold text-tinta/70 hover:bg-arena"
                >
                  Editar
                </button>
              </div>

              {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

              {tieneAgenda && (
                <div>
                  <p className="etiqueta">Turnos</p>
                  {cargando && <p className="text-[12.5px] text-tinta/45">Cargando…</p>}
                  {turnos && turnos.length === 0 && <p className="text-[12.5px] text-tinta/45">Todavía no tiene turnos.</p>}
                  {turnos && turnos.length > 0 && (
                    <ul className="mt-1 space-y-1.5">
                      {turnos.map((tu) => (
                        <li key={tu.id} className="flex items-center justify-between gap-3 text-[13px]">
                          <span className="min-w-0 truncate text-tinta/65">
                            {new Date(tu.inicia).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: zona })}
                            {tu.servicio ? ` · ${tu.servicio}` : ''}
                            {tu.profesional ? ` · ${tu.profesional}` : ''}
                          </span>
                          <span className="shrink-0 text-tinta/55">
                            {ESTADOS[tu.estado] ?? tu.estado}
                            {Number(tu.monto) > 0 ? ` · ${plata(Number(tu.monto))}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
