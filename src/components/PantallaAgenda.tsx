'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, fechaLegible } from '@/lib/formato';
import { useTextos, useLocale } from '@/i18n/cliente';
import { Seccion, Vacio } from '@/components/Piezas';
import type {
  Profesional, TurnoDelDia, HorarioSemanal, ServicioAgenda, LinkPublico, Producto,
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
  empresaId, moneda, link, turnos, profesionales, horarios, servicios, catalogo, esAdmin, hoy, origen,
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

  async function correr(marca: string, fn: () => Promise<{ error: unknown } | void>) {
    setTrabajando(marca);
    setError('');
    try {
      const r = await fn();
      const fallo = r && typeof r === 'object' && 'error' in r ? r.error : null;
      if (fallo) throw fallo;
      router.refresh();
    } catch (e: unknown) {
      setError(e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message) : t.comun.error);
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

      {/* ---------- los turnos de hoy ---------- */}
      <Seccion titulo={`${t.agenda.turnosDe} ${fechaLegible(hoy, false, locale)}`}>
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
