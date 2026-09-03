'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, fechaLarga } from '@/lib/formato';
import { sumarDias } from '@/lib/fechas';
import { useTextos, useLocale } from '@/i18n/cliente';
import { Seccion, Vacio } from '@/components/Piezas';
import type {
  Profesional, TurnoDelDia, HorarioSemanal, ServicioAgenda, LinkPublico, Producto, HuecoLibre,
} from '@/lib/tipos';

/**
 * AGENDA · el link, los turnos del día y el horario de cada uno.
 *
 * El orden no es casual. El link va primero porque es lo que el dueño vino a
 * buscar la primera vez —quiere copiarlo y pegarlo en Instagram— y los turnos
 * del día porque es lo que mira todas las mañanas. El horario va último: se
 * carga una vez y no se toca en meses.
 */

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function PantallaAgenda({
  empresaId, moneda, link, turnos, profesionales, horarios, servicios, catalogo, esAdmin, dia, hoy, origen,
}: {
  empresaId: string;
  moneda: string;
  link: LinkPublico | null;
  turnos: TurnoDelDia[];
  profesionales: Profesional[];
  horarios: HorarioSemanal[];
  servicios: ServicioAgenda[];
  catalogo: Producto[];
  esAdmin: boolean;
  /** El día que se está mirando. Sale de la URL, así que puede no ser hoy. */
  dia: string;
  /** Hoy de verdad, en la zona de la cuenta. Para el botón de volver. */
  hoy: string;
  origen: string;
}) {
  const t = useTextos();
  const locale = useLocale();
  const router = useRouter();
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');

  const plata = (n: number) => dinero(n, moneda, true, locale);
  const ocupado = trabajando !== '';
  const sb = () => clienteNavegador();

  async function correr(
    marca: string,
    fn: () => Promise<{ error: unknown } | void>,
  ): Promise<boolean> {
    setTrabajando(marca);
    setError('');
    try {
      const r = await fn();
      const fallo = r && typeof r === 'object' && 'error' in r ? r.error : null;
      if (fallo) throw fallo;
      router.refresh();
      return true;
    } catch (e: unknown) {
      setError(e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message) : t.comun.error);
      return false;
    } finally {
      setTrabajando('');
    }
  }

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {error && (
        <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
          {error}
        </p>
      )}

      {esAdmin && (
        <TarjetaLink
          link={link}
          origen={origen}
          ocupado={ocupado}
          alGuardar={(d) => correr('link', async () => sb().rpc('guardar_link_publico', {
            p_empresa: empresaId,
            p_slug: d.slug ?? null,
            p_activo: d.activo ?? null,
            p_titulo: d.titulo ?? null,
            p_mensaje: d.mensaje ?? null,
            p_direccion: d.direccion ?? null,
          }))}
        />
      )}

      {/* ---------- los turnos del día ---------- */}
      <Seccion
        titulo={`${t.agenda.turnosDe} ${fechaLarga(dia, locale)}`}
        accion={<NavegadorDia dia={dia} hoy={hoy} alIr={(d) => router.push(`/agenda?dia=${d}`)} />}
      >
        <NuevoTurno
          empresaId={empresaId}
          dia={dia}
          hoy={hoy}
          profesionales={profesionales.filter((p) => p.activo)}
          servicios={servicios}
          catalogo={catalogo}
          ocupado={ocupado}
          alReservar={(d) => correr('turno', async () => sb().rpc('reservar', {
            p_empresa: empresaId,
            p_profesional: d.profesional,
            p_producto: d.producto,
            p_inicia: d.inicia,
            p_nombre: d.nombre,
            p_telefono: d.telefono,
          }))}
        />

        {turnos.length === 0 ? (
          <div className="px-4 pb-4">
            <Vacio titulo={t.agenda.sinTurnos} detalle={t.agenda.sinTurnosDetalle} />
          </div>
        ) : (
          <ul className="divide-y divide-borde border-t border-borde">
            {turnos.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-baseline gap-2.5">
                    <span className="text-[15px] font-bold tabular-nums">{hora(r.inicia)}</span>
                    <span className="text-[14.5px] font-semibold">{r.cliente}</span>
                    {r.origen === 'publico' && (
                      <span className="pastilla bg-verde-claro text-verde-fuerte">{t.agenda.porElLink}</span>
                    )}
                  </span>
                  {r.estado === 'atendida' && (
                    <span className="pastilla bg-verde text-white">{t.agenda.atendido}</span>
                  )}
                  {r.estado === 'no_vino' && (
                    <span className="pastilla bg-rojo-claro text-rojo">{t.agenda.noVino}</span>
                  )}
                </div>

                <p className="mt-0.5 text-[12.5px] text-tinta/50">
                  {r.servicio} · {r.profesional}
                  {r.telefono && (
                    <> · <a href={`tel:${r.telefono}`} className="text-verde-fuerte">{r.telefono}</a></>
                  )}
                </p>

                {(r.estado === 'pendiente' || r.estado === 'confirmada') && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button" className="boton-principal px-3 py-1.5 text-[13px]"
                      disabled={ocupado}
                      onClick={() => correr('atender', async () =>
                        sb().rpc('atender_reserva', { p_reserva: r.id }))}
                    >
                      {t.agenda.atender}
                    </button>
                    <button
                      type="button" className="boton-suave px-3 py-1.5 text-[13px]"
                      disabled={ocupado}
                      onClick={() => {
                        if (confirm(t.agenda.confirmarNoVino(r.cliente))) {
                          correr('novino', async () => sb().rpc('marcar_no_vino', { p_reserva: r.id }));
                        }
                      }}
                    >
                      {t.agenda.noVino}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {/* ---------- qué se puede reservar ---------- */}
      {esAdmin && (
        <ServiciosReservables
          catalogo={catalogo}
          servicios={servicios}
          moneda={moneda}
          ocupado={ocupado}
          alGuardar={(producto, duracion, reservable) =>
            correr('servicio', async () => sb().rpc('guardar_servicio_agenda', {
              p_empresa: empresaId,
              p_producto: producto,
              p_duracion: duracion,
              p_reservable: reservable,
            }))}
        />
      )}

      {/* ---------- el horario de cada uno ---------- */}
      <Horarios
        profesionales={profesionales.filter((p) => p.activo)}
        horarios={horarios}
        ocupado={ocupado}
        alAgregar={(prof, dia, desde, hasta) =>
          correr('horario', async () => sb().rpc('guardar_horario', {
            p_empresa: empresaId, p_profesional: prof, p_dia: dia, p_desde: desde, p_hasta: hasta,
          }))}
        alQuitar={(id) => correr('horario', async () =>
          sb().rpc('borrar_horario', { p_empresa: empresaId, p_id: id }))}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MOVERSE DE DÍA
//
// La pregunta de todas las mañanas no es solo «¿qué tengo hoy?»: es «¿qué
// tengo mañana?». Sin esto había que escribir la fecha en la barra del
// navegador, que es lo mismo que no tenerlo.
// ════════════════════════════════════════════════════════════
function NavegadorDia({
  dia, hoy, alIr,
}: {
  dia: string;
  hoy: string;
  alIr: (dia: string) => void;
}) {
  const t = useTextos();
  const flecha = 'rounded-lg border border-borde px-2.5 py-1 text-[15px] font-bold leading-none '
    + 'text-tinta/50 transition hover:border-verde/40 hover:text-verde-fuerte';

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={flecha} aria-label={t.agenda.diaAnterior}
        onClick={() => alIr(sumarDias(dia, -1))}>‹</button>
      {dia !== hoy && (
        <button type="button" className="boton-texto text-[12.5px]" onClick={() => alIr(hoy)}>
          {t.comun.hoy}
        </button>
      )}
      <button type="button" className={flecha} aria-label={t.agenda.diaSiguiente}
        onClick={() => alIr(sumarDias(dia, 1))}>›</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ANOTAR UN TURNO DESDE EL MOSTRADOR
//
// El link público trae a los que ya lo usan. El resto —que hoy son casi
// todos— llama por teléfono o escribe por WhatsApp, y ese turno lo anota el
// que atiende. Por eso el formulario no es solo de administración: quien
// contesta el teléfono un sábado a la mañana suele ser el empleado.
//
// Los horarios no se escriben a mano, se eligen de los que la agenda tiene
// libres. Un campo de hora suelto deja anotar a las tres de la mañana o
// encima de otro turno, y el que después queda mal parado es el local.
// ════════════════════════════════════════════════════════════
function NuevoTurno({
  empresaId, dia, hoy, profesionales, servicios, catalogo, ocupado, alReservar,
}: {
  empresaId: string;
  dia: string;
  hoy: string;
  profesionales: Profesional[];
  servicios: ServicioAgenda[];
  catalogo: Producto[];
  ocupado: boolean;
  alReservar: (d: {
    profesional: string; producto: string; inicia: string; nombre: string; telefono: string;
  }) => Promise<boolean>;
}) {
  const t = useTextos();
  const locale = useLocale();

  // Solo lo que está marcado para reservarse. Si un servicio no se agenda, la
  // base no le calcula huecos y el formulario quedaría mudo sin decir por qué.
  const agendables = catalogo.filter((p) =>
    servicios.some((s) => s.producto_id === p.id && s.reservable));

  const [abierto, setAbierto] = useState(false);
  const [profesional, setProfesional] = useState(profesionales.length === 1 ? profesionales[0].id : '');
  const [producto, setProducto] = useState(agendables.length === 1 ? agendables[0].id : '');
  const [fecha, setFecha] = useState(dia);
  const [huecos, setHuecos] = useState<HuecoLibre[] | null>(null);
  const [elegido, setElegido] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');

  // Si se cambia de día en la agenda, el formulario acompaña: lo más probable
  // es que quien lo abra ahí quiera anotar para ese día.
  useEffect(() => { setFecha(dia); }, [dia]);

  // Cada vez que cambia con quién, qué o cuándo, los horarios de antes dejan
  // de valer. Se piden de nuevo y se olvida el que estaba elegido, para que no
  // quede seleccionada una hora que ya no existe.
  useEffect(() => {
    if (!abierto || !profesional || !producto || !fecha) { setHuecos(null); return; }
    let vigente = true;
    setHuecos(null);
    setElegido('');
    (async () => {
      const { data } = await clienteNavegador().rpc('huecos_local', {
        p_empresa: empresaId,
        p_profesional: profesional,
        p_producto: producto,
        p_fecha: fecha,
      });
      if (vigente) setHuecos(Array.isArray(data) ? (data as HuecoLibre[]) : []);
    })();
    return () => { vigente = false; };
  }, [abierto, profesional, producto, fecha, empresaId]);

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

  // Sin nadie en el equipo no hay agenda posible, y la sección de horarios que
  // está más abajo ya explica qué hacer. Acá sobraría un botón que no lleva a
  // ningún lado.
  if (profesionales.length === 0) return null;

  if (!abierto) {
    return (
      <div className="px-4 pb-3">
        <button type="button" className="boton-suave w-full py-2 text-[13.5px]"
          onClick={() => setAbierto(true)}>
          {t.agenda.anotarTurno}
        </button>
      </div>
    );
  }

  if (agendables.length === 0) {
    return (
      <div className="px-4 pb-4">
        <div className="rounded-xl bg-arena px-3 py-3 text-[13px] leading-relaxed text-tinta/60">
          {t.agenda.sinReservablesDetalle}
        </div>
        <button type="button" className="boton-texto mt-2 text-[13px]" onClick={() => setAbierto(false)}>
          {t.comun.cancelar}
        </button>
      </div>
    );
  }

  const listoParaAnotar = elegido !== '' && nombre.trim() !== '' && !ocupado;

  async function anotar() {
    const hecho = await alReservar({ profesional, producto, inicia: elegido, nombre, telefono });
    if (!hecho) return;
    setAbierto(false);
    setElegido('');
    setNombre('');
    setTelefono('');
    setHuecos(null);
  }

  return (
    <div className="mx-4 mb-3 rounded-xl border border-borde bg-arena/40 p-3">
      <p className="mb-3 text-[12.5px] leading-relaxed text-tinta/55">{t.agenda.anotarDetalle}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="etiqueta" htmlFor="turno-prof">{t.agenda.conQuien}</label>
          <select id="turno-prof" className="campo" value={profesional} disabled={ocupado}
            onChange={(e) => setProfesional(e.target.value)}>
            <option value="">{t.agenda.elegir}</option>
            {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="turno-serv">{t.agenda.queServicio}</label>
          <select id="turno-serv" className="campo" value={producto} disabled={ocupado}
            onChange={(e) => setProducto(e.target.value)}>
            <option value="">{t.agenda.elegir}</option>
            {agendables.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="turno-fecha">{t.agenda.queDia}</label>
          <input id="turno-fecha" type="date" className="campo" value={fecha} min={hoy} disabled={ocupado}
            onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>

      {profesional && producto && (
        <div className="mt-3">
          <span className="etiqueta">{t.agenda.horariosLibres}</span>
          {huecos === null ? (
            <p className="py-3 text-center text-[13px] text-tinta/45">{t.comun.cargando}</p>
          ) : huecos.length === 0 ? (
            <p className="rounded-xl bg-white px-3 py-3 text-center text-[13px] leading-relaxed text-tinta/55">
              {t.agenda.sinHuecos}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {huecos.map((h) => (
                <button
                  key={h.inicia} type="button" disabled={ocupado}
                  onClick={() => setElegido(h.inicia)}
                  className={elegido === h.inicia
                    ? 'rounded-lg border border-verde bg-verde py-2 text-center text-[13.5px] font-semibold tabular-nums text-white'
                    : 'rounded-lg border border-borde bg-white py-2 text-center text-[13.5px] font-semibold tabular-nums transition hover:border-verde/50'}
                >
                  {hora(h.inicia)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {elegido && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="etiqueta" htmlFor="turno-nombre">{t.agenda.nombreCliente}</label>
            <input id="turno-nombre" className="campo" maxLength={80} value={nombre} disabled={ocupado}
              onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="turno-tel">{t.agenda.telefonoCliente}</label>
            <input id="turno-tel" className="campo" inputMode="tel" maxLength={40} value={telefono}
              disabled={ocupado} onChange={(e) => setTelefono(e.target.value)} />
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="boton-principal px-4 py-2 text-[13.5px]"
          disabled={!listoParaAnotar} onClick={anotar}>
          {t.agenda.confirmarTurno}
        </button>
        <button type="button" className="boton-texto text-[13px]" disabled={ocupado}
          onClick={() => setAbierto(false)}>
          {t.comun.cancelar}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// EL LINK
//
// Lo primero que el dueño vino a buscar. Y la advertencia de que cambiarlo
// rompe lo publicado no es un «¿estás seguro?»: dice exactamente qué se
// rompe, porque una vez que el link está en cien posteos ya no hay vuelta.
// ════════════════════════════════════════════════════════════
function TarjetaLink({
  link, origen, ocupado, alGuardar,
}: {
  link: LinkPublico | null;
  origen: string;
  ocupado: boolean;
  alGuardar: (d: Partial<LinkPublico>) => void;
}) {
  const t = useTextos();
  const [editando, setEditando] = useState(false);
  const [slug, setSlug] = useState(link?.slug ?? '');
  const [mensaje, setMensaje] = useState(link?.mensaje ?? '');
  const [direccion, setDireccion] = useState(link?.direccion ?? '');
  const [copiado, setCopiado] = useState(false);

  const url = link ? `${origen}/r/${link.slug}` : '';

  if (!link) {
    return (
      <Seccion titulo={t.agenda.tuLink}>
        <div className="px-4 pb-4">
          <Vacio titulo={t.agenda.sinLink} detalle={t.agenda.sinLinkDetalle} />
          <button
            type="button" className="boton-principal w-full py-2.5"
            disabled={ocupado} onClick={() => alGuardar({})}
          >
            {t.agenda.crearLink}
          </button>
        </div>
      </Seccion>
    );
  }

  return (
    <Seccion
      titulo={t.agenda.tuLink}
      accion={
        <button type="button" className="boton-texto" onClick={() => setEditando((v) => !v)} disabled={ocupado}>
          {editando ? t.comun.cancelar : t.agenda.editarLink}
        </button>
      }
    >
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 rounded-xl border border-borde bg-arena px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{url}</span>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-verde px-3 py-1.5 text-[12.5px] font-semibold text-white"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
          >
            {copiado ? t.agenda.copiado : t.agenda.copiar}
          </button>
        </div>

        <p className="mt-2 text-[12.5px] leading-relaxed text-tinta/55">{t.agenda.linkDetalle}</p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-medium">
            <input
              type="checkbox" checked={link.activo} disabled={ocupado}
              onChange={(e) => alGuardar({ activo: e.target.checked })}
            />
            {t.agenda.linkActivo}
          </label>
          <a href={url} target="_blank" rel="noreferrer" className="boton-texto">
            {t.agenda.verComoCliente}
          </a>
        </div>

        {editando && (
          <div className="mt-4 space-y-3 border-t border-borde pt-4">
            <div>
              <label className="etiqueta" htmlFor="ag-slug">{t.agenda.direccionDelLink}</label>
              <input
                id="ag-slug" className="campo font-mono" maxLength={40}
                value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())}
              />
              <p className="mt-1.5 rounded-lg bg-ambar-claro px-3 py-2 text-[12px] leading-snug text-ambar">
                {t.agenda.cambiarLinkAviso}
              </p>
            </div>
            <div>
              <label className="etiqueta" htmlFor="ag-dir">{t.agenda.direccionLocal}</label>
              <input
                id="ag-dir" className="campo" maxLength={160}
                value={direccion} onChange={(e) => setDireccion(e.target.value)}
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="ag-msj">{t.agenda.mensaje}</label>
              <input
                id="ag-msj" className="campo" maxLength={300}
                placeholder={t.agenda.mensajeEjemplo}
                value={mensaje} onChange={(e) => setMensaje(e.target.value)}
              />
            </div>
            <button
              type="button" className="boton-principal w-full py-2.5"
              disabled={ocupado}
              onClick={() => { alGuardar({ slug, mensaje, direccion }); setEditando(false); }}
            >
              {ocupado ? t.comun.guardando : t.comun.guardar}
            </button>
          </div>
        )}
      </div>
    </Seccion>
  );
}

// ════════════════════════════════════════════════════════════
// QUÉ SE PUEDE RESERVAR
// ════════════════════════════════════════════════════════════
function ServiciosReservables({
  catalogo, servicios, moneda, ocupado, alGuardar,
}: {
  catalogo: Producto[];
  servicios: ServicioAgenda[];
  moneda: string;
  ocupado: boolean;
  alGuardar: (producto: string, duracion: number, reservable: boolean) => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  const plata = (n: number) => dinero(n, moneda, true, locale);

  if (catalogo.length === 0) {
    return (
      <Seccion titulo={t.agenda.queSeReserva}>
        <div className="px-4 pb-4">
          <Vacio titulo={t.agenda.sinServicios} detalle={t.agenda.sinServiciosDetalle} />
        </div>
      </Seccion>
    );
  }

  return (
    <Seccion titulo={t.agenda.queSeReserva}>
      <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">{t.agenda.queSeReservaDetalle}</p>
      <ul className="divide-y divide-borde border-t border-borde">
        {catalogo.map((p) => {
          const s = servicios.find((x) => x.producto_id === p.id);
          const duracion = s?.duracion_min ?? 30;
          const reservable = s?.reservable ?? false;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{p.nombre}</span>
                <span className="text-[12px] text-tinta/45">{plata(Number(p.precio))}</span>
              </span>
              <label className="flex items-center gap-1.5 text-[12.5px] text-tinta/55">
                <input
                  type="number" className="campo w-[72px] py-1.5 text-[13px]" min={5} max={480} step={5}
                  defaultValue={duracion} disabled={ocupado}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (n !== duracion && n >= 5) alGuardar(p.id, n, reservable);
                  }}
                />
                min
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium">
                <input
                  type="checkbox" checked={reservable} disabled={ocupado}
                  onChange={(e) => alGuardar(p.id, duracion, e.target.checked)}
                />
                {t.agenda.seReserva}
              </label>
            </li>
          );
        })}
      </ul>
    </Seccion>
  );
}

// ════════════════════════════════════════════════════════════
// EL HORARIO
// ════════════════════════════════════════════════════════════
function Horarios({
  profesionales, horarios, ocupado, alAgregar, alQuitar,
}: {
  profesionales: Profesional[];
  horarios: HorarioSemanal[];
  ocupado: boolean;
  alAgregar: (prof: string, dia: number, desde: string, hasta: string) => void;
  alQuitar: (id: string) => void;
}) {
  const t = useTextos();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [dia, setDia] = useState(1);
  const [desde, setDesde] = useState('08:00');
  const [hasta, setHasta] = useState('12:00');

  if (profesionales.length === 0) {
    return (
      <Seccion titulo={t.agenda.horarios}>
        <div className="px-4 pb-4">
          <Vacio titulo={t.agenda.sinEquipo} detalle={t.agenda.sinEquipoDetalle} />
        </div>
      </Seccion>
    );
  }

  return (
    <Seccion titulo={t.agenda.horarios}>
      <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">{t.agenda.horariosDetalle}</p>
      <ul className="divide-y divide-borde border-t border-borde">
        {profesionales.map((p) => {
          const suyos = horarios.filter((h) => h.profesional_id === p.id && h.activo);
          return (
            <li key={p.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14.5px] font-semibold">{p.nombre}</span>
                <button
                  type="button" className="boton-texto"
                  onClick={() => setAbierto(abierto === p.id ? null : p.id)} disabled={ocupado}
                >
                  {abierto === p.id ? t.comun.cancelar : t.agenda.agregarFranja}
                </button>
              </div>

              {suyos.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-tinta/45">{t.agenda.sinHorario}</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {suyos.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="tabular-nums text-tinta/70">
                        <b className="font-semibold">{DIAS[h.dia_semana]}</b>{' '}
                        {h.desde.slice(0, 5)} — {h.hasta.slice(0, 5)}
                      </span>
                      <button
                        type="button"
                        className="text-[12px] font-semibold text-tinta/35 hover:text-rojo"
                        onClick={() => alQuitar(h.id)} disabled={ocupado}
                      >
                        {t.comun.borrar}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {abierto === p.id && (
                <div className="mt-2.5 flex flex-wrap items-end gap-2 rounded-xl bg-arena p-3">
                  <label className="min-w-[120px] flex-1">
                    <span className="etiqueta">{t.agenda.dia}</span>
                    <select className="campo py-2 text-[13.5px]" value={dia}
                      onChange={(e) => setDia(Number(e.target.value))}>
                      {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </label>
                  <label className="w-[104px]">
                    <span className="etiqueta">{t.agenda.desde}</span>
                    <input type="time" className="campo py-2 text-[13.5px]" value={desde}
                      onChange={(e) => setDesde(e.target.value)} />
                  </label>
                  <label className="w-[104px]">
                    <span className="etiqueta">{t.agenda.hasta}</span>
                    <input type="time" className="campo py-2 text-[13.5px]" value={hasta}
                      onChange={(e) => setHasta(e.target.value)} />
                  </label>
                  <button
                    type="button" className="boton-principal px-4 py-2 text-[13px]"
                    disabled={ocupado}
                    onClick={() => { alAgregar(p.id, dia, desde, hasta); setAbierto(null); }}
                  >
                    {t.comun.guardar}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Seccion>
  );
}
