'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale, useTextos } from '@/i18n/cliente';
import type { Textos } from '@/i18n/diccionarios';
import { dinero, dineroQueEntra } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { enlaceWhatsApp } from '@/lib/telefono';
import { hoyISO } from '@/lib/fechas';
import { Indicador, Vacio } from '@/components/Piezas';
import { PaquetesAlumno, PorCobrarAlumnos } from '@/components/PaquetesAlumno';
import { MandarRutina } from '@/components/rutinas/MandarRutina';
import { fechaCorta } from '@/components/rutinas/panel/utiles';
import type { ClienteLista, TurnoCliente } from '@/lib/tipos';
import type { EnlaceRutina } from '@/lib/tipos-rutinas';

/**
 * La rutina de un cliente del trainer, para su ficha (098). Sale de
 * `rutinas_de` y trae solo lo que se muestra acá: la rutina se mira y se
 * arma en su carpeta, no en un acordeón.
 */
export interface RutinaEnClientes {
  vigente: { nombre: string; desde: string; cambia_el: string | null } | null;
  /** Tiene una próxima rutina en preparación. */
  proxima: boolean;
  enlace: EnlaceRutina | null;
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}

function haceTanto(t: Textos, iso: string | null): string {
  const d = diasDesde(iso);
  if (d == null) return '';
  if (d === 0) return t.clientes.hoy;
  if (d === 1) return t.clientes.ayer;
  if (d < 60) return t.clientes.haceDias(d);
  return t.clientes.haceMeses(Math.round(d / 30));
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
  empresaId, moneda, zona, negocio, clientes, saldos, tieneAgenda, tienePaquetes, puedeEliminar,
  deAlumnos = false, titulo, notasALaVista = false, conRutinas = false, rutinas = null,
}: {
  empresaId: string;
  moneda: string;
  zona: string;
  negocio: string;
  clientes: ClienteLista[];
  saldos: Record<string, number>;
  tieneAgenda: boolean;
  /** Si el rubro vende en paquetes: «ocho clases por 400.000» (088). */
  tienePaquetes: boolean;
  /**
   * Los alumnos de un profe (091): lo que falta cobrar son inscripciones,
   * no fiado, y se ve acá arriba con el botón para cobrar.
   */
  deAlumnos?: boolean;
  /** «Alumnos» para un profe; si no viene, «Clientes». */
  titulo?: string;
  /** Las notas son de salud y van a la vista: el trainer (097). */
  notasALaVista?: boolean;
  /** El trainer (098): en la ficha, su rutina y la puerta a su carpeta. */
  conRutinas?: boolean;
  /**
   * La rutina de cada cliente, por id. Null si no se pudo leer: entonces la
   * ficha no dice «Sin rutina», porque no lo sabe; queda el botón a la carpeta.
   */
  rutinas?: Record<string, RutinaEnClientes> | null;
  /** Dueño y administradores. Un vendedor carga clientes pero no los saca. */
  puedeEliminar: boolean;
}) {
  const router = useRouter();
  const t = useTextos();
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
          titulo={titulo ?? t.clientes.titulo}
          valor={String(clientes.length)}
          detalle={t.clientes.cargados(clientes.length)}
        />
        {!deAlumnos && <Link href="/fiado" className="block">
          <Indicador
            titulo={t.clientes.teDeben}
            valor={dineroQueEntra(totalDeben, moneda, locale, t.formato)}
            detalle={cuantosDeben === 0 ? t.clientes.nadieTeDebe : t.clientes.debenVerFiado(cuantosDeben)}
          />
        </Link>}
      </div>

      {/* Lo que le deben a un profe: inscripciones sin cobrar (091). */}
      {deAlumnos && <PorCobrarAlumnos empresaId={empresaId} moneda={moneda} />}

      {aviso && (
        <p className="rounded-xl bg-verde-claro px-4 py-3 text-[13.5px] font-semibold text-verde-fuerte aparecer">
          ✓ {aviso}
        </p>
      )}

      <div className="flex gap-2">
        <input
          className="campo flex-1"
          placeholder={t.clientes.buscar}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {!nuevo && (
          <button type="button" className="boton-principal shrink-0 px-4" onClick={() => setNuevo(true)}>
            {t.clientes.agregar}
          </button>
        )}
      </div>

      {nuevo && (
        <FormularioCliente
          empresaId={empresaId}
          titulo={t.clientes.nuevo}
          onCerrar={() => setNuevo(false)}
          onListo={listo}
        />
      )}

      <div className="tarjeta overflow-hidden">
        {clientes.length === 0 ? (
          <Vacio
            titulo={t.clientes.sinClientes}
            detalle={tieneAgenda ? t.clientes.sinClientesAgenda : t.clientes.sinClientesFiado}
          />
        ) : visibles.length === 0 ? (
          <Vacio titulo={t.clientes.nadieCoincide} detalle={t.clientes.ningunoCon(busca.trim())} />
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
                tienePaquetes={tienePaquetes}
                deAlumnos={deAlumnos}
                notasALaVista={notasALaVista}
                conRutinas={conRutinas}
                rutina={rutinas ? (rutinas[c.id] ?? { vigente: null, proxima: false, enlace: null }) : null}
                moneda={moneda}
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
  puedeEliminar = false, conSalud = false, debe = 0, plata, proximo = '',
}: {
  empresaId: string;
  c?: ClienteLista;
  titulo: string;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
  /** Solo dueño y administradores. La base lo vuelve a verificar (058). */
  puedeEliminar?: boolean;
  /**
   * El trainer (099): eliminar a alguien con rutinas o medidas lo archiva y
   * borra sus datos de salud. Se dice antes, no después.
   */
  conSalud?: boolean;
  /** Lo que debe. A quien debe no se lo elimina: se lo manda a Fiado. */
  debe?: number;
  plata?: (n: number) => string;
  /** Su próximo turno ya escrito, para avisar que no se cancela. */
  proximo?: string;
}) {
  const t = useTextos();
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
      onListo(t.clientes.yaNoEsta(c.nombre));
    } catch (e: any) {
      setError(mensajeDeError(e, t.clientes.noSePudoEliminar));
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
      onListo(c ? t.clientes.guardado : t.clientes.quedoCargado(nombre.trim()));
    } catch (e: any) {
      setError(mensajeDeError(e, t.gastos.noSePudoGuardar));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="tarjeta space-y-3 p-4 aparecer">
      <p className="titulo-seccion">{titulo}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="etiqueta">{t.clientes.nombre}</span>
          <input className="campo" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiqueta">{t.clientes.telefono}</span>
          <input
            className="campo" inputMode="tel" maxLength={40} placeholder="0981 234 567"
            value={telefono} onChange={(e) => setTelefono(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="etiqueta">{t.clientes.notas} <span className="font-normal text-tinta/40">{t.clientes.opcional}</span></span>
        <input
          className="campo" maxLength={1000} placeholder={t.clientes.notasEjemplo}
          value={notas} onChange={(e) => setNotas(e.target.value)}
        />
      </label>
      {!c && (
        <p className="text-[12px] leading-snug text-tinta/45">
          {t.clientes.noSeDuplica}
        </p>
      )}
      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="boton-texto px-4" onClick={onCerrar}>{t.comun.cancelar}</button>
        <button className="boton-principal flex-1 py-2.5 disabled:opacity-40" disabled={!puede}>
          {guardando ? t.comun.guardando : t.comun.guardar}
        </button>
      </div>

      {/* Eliminar va abajo y separado: es lo menos frecuente, y lo único de
          acá que no se arregla con otro «Guardar». */}
      {c && puedeEliminar && (
        confirmar ? (
          <div className="space-y-2.5 rounded-xl bg-rojo-claro px-3.5 py-3 aparecer">
            <p className="text-[13.5px] font-bold text-rojo">{t.clientes.eliminarPregunta(c.nombre)}</p>
            <p className="text-[12.5px] leading-snug text-tinta/65">
              {t.clientes.eliminarDetalle(c.nombre)}{proximo && ` ${t.clientes.turnoNoSeCancela(proximo)}`}
            </p>
            {conSalud && (
              <p className="text-[12.5px] leading-snug text-tinta/65">{t.clientes.eliminarConSalud(c.nombre)}</p>
            )}
            <div className="flex gap-2">
              <button type="button" className="boton-texto px-4" onClick={() => setConfirmar(false)}>{t.clientes.no}</button>
              <button
                type="button" onClick={eliminar} disabled={eliminando}
                className="flex-1 rounded-xl bg-rojo px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
              >
                {eliminando ? t.clientes.eliminando : t.clientes.siEliminar}
              </button>
            </div>
          </div>
        ) : debe > 0 ? (
          // A quien te debe no se lo elimina: el libro de fiado cuelga de su
          // ficha. La base lo frena igual (058); acá se dice qué hacer antes.
          <p className="border-t border-borde pt-3 text-[12.5px] leading-snug text-tinta/50">
            {t.clientes.primeroCobrale(c.nombre, plata ? plata(debe) : String(debe))}{' '}
            <Link href="/fiado" className="font-semibold text-verde-fuerte underline">{t.nav.fiado}</Link>.
          </p>
        ) : (
          <div className="border-t border-borde pt-3">
            <button
              type="button" onClick={() => setConfirmar(true)}
              className="text-[13px] font-semibold text-rojo/80 hover:text-rojo"
            >
              {t.clientes.eliminarCliente}
            </button>
          </div>
        )
      )}
    </form>
  );
}

/**
 * La línea de la rutina en la ficha de un cliente del trainer (098):
 * «Fuerza base · desde el 15/09 · cambiarla el 13/10», o «Sin rutina».
 * El progreso (medidas) es del dueño o de un administrador: a los demás, el
 * botón no lo promete.
 */
function FichaRutina({
  c, rutina, empresaId, zona, locale, conProgreso,
}: {
  c: ClienteLista;
  rutina: RutinaEnClientes | null;
  empresaId: string;
  zona: string;
  locale: string;
  conProgreso: boolean;
}) {
  const t = useTextos();
  const l = t.rutinasPanel.lista;
  const hoy = hoyISO(zona);
  const vigente = rutina?.vigente ?? null;

  const detalle = vigente ? [
    l.desde(fechaCorta(vigente.desde, locale, hoy)),
    vigente.cambia_el
      ? (vigente.cambia_el <= hoy ? l.tocabaCambiarla : l.cambiarlaEl)(fechaCorta(vigente.cambia_el, locale, hoy))
      : '',
    rutina?.proxima ? l.proximaEnPreparacion : '',
  ].filter(Boolean).join(' · ') : '';

  return (
    <div className="rounded-xl bg-superficie px-3 py-2.5">
      {rutina && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/45">{t.clientes.rutina}</p>
          {vigente ? (
            <>
              <p className="mt-0.5 truncate text-[14px] font-bold">{vigente.nombre}</p>
              <p className="text-[12px] text-tinta/50">{detalle}</p>
            </>
          ) : (
            <p className="mt-0.5 text-[14px] font-semibold text-tinta/60">
              {l.sinRutina}{rutina.proxima ? ` · ${l.proximaEnPreparacion}` : ''}
            </p>
          )}
        </>
      )}
      <div className={`flex flex-wrap items-start gap-2 ${rutina ? 'mt-2' : ''}`}>
        <Link
          href={`/rutinas/cliente/${c.id}`}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-borde bg-superficie px-3.5 text-[13.5px] font-semibold text-tinta/75 hover:bg-arena"
        >
          {conProgreso ? t.clientes.rutinaYProgreso : t.clientes.suRutina}
        </Link>
        {vigente && (
          <MandarRutina
            variante="chica"
            empresaId={empresaId} clienteId={c.id} nombre={c.nombre} telefono={c.telefono} zona={zona}
            token={rutina?.enlace?.token ?? null}
            activo={rutina?.enlace ? rutina.enlace.activo : undefined}
          />
        )}
      </div>
    </div>
  );
}

function FilaCliente({
  c, debe, empresaId, zona, negocio, plata, locale, tieneAgenda, tienePaquetes, deAlumnos, notasALaVista,
  conRutinas, rutina, moneda, puedeEliminar, abierto, onAbrir, onListo,
}: {
  c: ClienteLista;
  debe: number;
  empresaId: string;
  zona: string;
  negocio: string;
  plata: (n: number) => string;
  locale: string;
  tieneAgenda: boolean;
  tienePaquetes: boolean;
  deAlumnos: boolean;
  notasALaVista: boolean;
  conRutinas: boolean;
  /** Null: no se pudo leer (no se afirma «Sin rutina»). */
  rutina: RutinaEnClientes | null;
  moneda: string;
  puedeEliminar: boolean;
  abierto: boolean;
  onAbrir: () => void;
  onListo: (mensaje: string) => void;
}) {
  const t = useTextos();
  const [editando, setEditando] = useState(false);
  const [turnos, setTurnos] = useState<TurnoCliente[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const primero = c.nombre.trim().split(/\s+/)[0] || c.nombre;
  const whatsapp = c.telefono
    ? enlaceWhatsApp(c.telefono, zona, t.clientes.saludo(primero, negocio))
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
      setError(mensajeDeError(e, t.clientes.noSeLeyoHistorial));
    } finally {
      setCargando(false);
    }
  }

  const detalle = [
    c.telefono,
    tieneAgenda && c.visitas > 0
      ? t.clientes.visitas(c.visitas, haceTanto(t, c.ultima_visita))
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
            {t.clientes.debe(plata(debe))}
          </span>
        )}
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-borde bg-arena/40 px-4 py-4 aparecer">
          {editando ? (
            <FormularioCliente
              empresaId={empresaId}
              c={c}
              titulo={t.clientes.editar}
              onCerrar={() => setEditando(false)}
              onListo={(m) => { setEditando(false); onListo(m); }}
              puedeEliminar={puedeEliminar}
              conSalud={conRutinas}
              debe={debe}
              plata={plata}
              proximo={proximo}
            />
          ) : (
            <>
              {/* Para un trainer las notas son lesiones (097): se leen como un
                  aviso, con su nombre, y no como un comentario suelto. */}
              {c.notas && (notasALaVista ? (
                <div className="rounded-xl bg-ambar-claro px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/60"><span aria-hidden className="text-ambar">⚠ </span>{t.clientes.notas}</p>
                  <p className="mt-0.5 text-[13.5px] font-medium leading-relaxed text-tinta/85">{c.notas}</p>
                </div>
              ) : (
                <p className="text-[13.5px] leading-relaxed text-tinta/70">{c.notas}</p>
              ))}

              {tieneAgenda && (
                <div className="grid grid-cols-2 gap-2 text-[13px]">
                  <div className="rounded-xl bg-superficie px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/45">{t.clientes.dejoEnTotal}</p>
                    <p className="mt-0.5 font-bold tabular-nums">{plata(c.gastado)}</p>
                  </div>
                  <div className="rounded-xl bg-superficie px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/45">{t.clientes.proximoTurno}</p>
                    <p className="mt-0.5 font-bold">{proximo || t.clientes.ninguno}</p>
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
                    {t.clientes.cobrarle(plata(debe))}
                  </Link>
                )}
                <button
                  type="button" onClick={() => setEditando(true)}
                  className="inline-flex items-center rounded-xl border border-borde bg-superficie px-3.5 py-2 text-[13.5px] font-semibold text-tinta/70 hover:bg-arena"
                >
                  {t.clientes.editarBoton}
                </button>
              </div>

              {/* SU RUTINA, PARA EL TRAINER (098). Una línea y dos botones: la
                  rutina se arma y se mira en su carpeta, y el acordeón no crece
                  más. El link, por WhatsApp, solo si hay una vigente que mandar. */}
              {conRutinas && (
                <FichaRutina
                  c={c} rutina={rutina} empresaId={empresaId} zona={zona} locale={locale}
                  conProgreso={puedeEliminar}
                />
              )}

              {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

              {/* Los paquetes van antes que los turnos: «¿cuántas clases le
                  quedan?» es lo primero que un profe quiere saber de un alumno. */}
              {tienePaquetes && (
                <PaquetesAlumno
                  empresaId={empresaId} clienteId={c.id} moneda={moneda} zona={zona}
                  esAdmin={puedeEliminar} deAlumnos={deAlumnos}
                />
              )}

              {tieneAgenda && (
                <div>
                  <p className="etiqueta">{t.clientes.turnos}</p>
                  {cargando && <p className="text-[12.5px] text-tinta/45">{t.comun.cargando}</p>}
                  {turnos && turnos.length === 0 && <p className="text-[12.5px] text-tinta/45">{t.clientes.sinTurnos}</p>}
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
                            {t.clientes.estados[tu.estado] ?? tu.estado}
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
