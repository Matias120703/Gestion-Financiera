'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { dinero, fechaLarga, fechaLegible } from '@/lib/formato';
import { sumarDias } from '@/lib/fechas';
import { enlaceWhatsApp } from '@/lib/telefono';
import { useTextos, useLocale } from '@/i18n/cliente';
import { Seccion, Vacio } from '@/components/Piezas';
import { CalendarioAgenda, SelectorVista, type VistaAgenda } from '@/components/CalendarioAgenda';
import { SelectorCliente, type ClienteElegido } from '@/components/SelectorCliente';
import { CLAVE_TURNO_DICTADO, EVENTO_TURNO_DICTADO, type TurnoRespuesta } from '@/lib/turno-voz';
import type {
  Profesional, TurnoDelDia, HorarioSemanal, ServicioAgenda, LinkPublico, Producto, HuecoLibre,
  Excepcion,
} from '@/lib/tipos';

/**
 * AGENDA · el link, los turnos del día y el horario de cada uno.
 *
 * El orden no es casual. El link va primero porque es lo que el dueño vino a
 * buscar la primera vez —quiere copiarlo y pegarlo en Instagram— y los turnos
 * del día porque es lo que mira todas las mañanas. El horario va último: se
 * carga una vez y no se toca en meses.
 */

export function PantallaAgenda({
  empresaId, moneda, link, turnos, profesionales, horarios, servicios, catalogo, esAdmin, dia, hoy,
  excepciones, negocio, zona, origen, deAlumnos = false, miNombre = '', miUsuario = null,
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
  /** Feriados, vacaciones y horarios especiales, de hoy en adelante. */
  excepciones: Excepcion[];
  /** El nombre del negocio, para el mensaje que se le manda al cliente. */
  negocio: string;
  /** La zona de la cuenta: de ahí sale el prefijo del país del teléfono. */
  zona: string;
  /**
   * La agenda de un profe y no la de un local (089): sin link público y
   * sin pedir que se arme un equipo.
   */
  deAlumnos?: boolean;
  /** Quien mira, para cargarlo como el que da las clases. */
  miNombre?: string;
  miUsuario?: string | null;
  origen: string;
}) {
  const t = useTextos();
  const locale = useLocale();
  const router = useRouter();
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');
  // Qué turno se está moviendo. Uno solo a la vez: dos formularios de
  // horario abiertos compitiendo por el mismo hueco es pedir un choque.
  const [moviendo, setMoviendo] = useState<string | null>(null);
  // Cómo se mira la agenda: el día, o un calendario de semana, mes o fechas (072).
  const [vista, setVista] = useState<VistaAgenda>('dia');

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
      // Los mensajes de nuestras funciones ya vienen escritos para leerse y
      // pasan tal cual. Lo que traduce esto es la jerga que sale cuando falla
      // algo que no previmos: una policy, la sesión vencida, la red. Sin esta
      // línea, al que atiende el local le llegaba «new row violates row-level
      // security policy for table turnos_reserva», y con eso no desinstala la
      // pantalla: desinstala la app.
      setError(mensajeDeError(e, t.errores.generico));
      return false;
    } finally {
      setTrabajando('');
    }
  }

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

  /**
   * El enlace de WhatsApp de un turno, o '' si el teléfono no alcanza para
   * armarlo. El mensaje incluye el enlace para cancelar: recordarle sin
   * darle cómo avisar convierte al que no puede venir en un plantón, en
   * vez de en un hueco libre para otro.
   */
  const enlaceDe = (r: TurnoDelDia) => enlaceWhatsApp(r.telefono, zona, t.agenda.mensajeRecordatorio({
    cliente: r.cliente,
    negocio,
    fecha: fechaLarga(dia, locale),
    hora: hora(r.inicia),
    servicio: r.servicio,
    enlace: origen ? `${origen}/turno/${r.token}` : '',
  }));

  /**
   * WhatsApp se abre PRIMERO y la marca se guarda después. Al revés, entre
   * el await y el open el navegador ya perdió el gesto del dedo y trata la
   * ventana como un pop-up: la bloquea, y el mensaje no se manda nunca.
   */
  function avisarPorWhatsApp(r: TurnoDelDia) {
    const enlace = enlaceDe(r);
    if (!enlace) return;
    window.open(enlace, '_blank', 'noopener,noreferrer');
    correr('avisar', async () => sb().rpc('marcar_avisado', { p_reserva: r.id }));
  }

  // Cuántos de este día tienen teléfono utilizable y siguen sin aviso.
  const sinAvisar = turnos.filter((r) =>
    !r.avisado && (r.estado === 'pendiente' || r.estado === 'confirmada') && enlaceDe(r)).length;

  // UN PROFE NO ARMA UN EQUIPO (089).
  //
  // Sin nadie cargado, la agenda de la barbería manda a «Equipo y reparto»
  // a sumar gente. Para un profe esa sección no existe: sería un callejón
  // sin salida. Él es el único que da las clases, así que se lo carga a
  // él, con un toque y sin comisión (`local`: todo queda para el negocio).
  //
  // Es un botón y no algo que pase solo al abrir la pantalla a propósito:
  // Next precarga las páginas al pasar por un link, y una pantalla que
  // escribe en la base con solo mirarla termina escribiendo cuando nadie
  // lo pidió.
  if (deAlumnos && profesionales.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {error && (
          <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
            {error}
          </p>
        )}
        <div className="tarjeta p-5">
          <p className="text-[16px] font-bold tracking-tight">{t.agenda.empezarTitulo}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-tinta/60">{t.agenda.empezarDetalle}</p>
          {esAdmin && (
            <button
              type="button" disabled={ocupado}
              className="boton-principal mt-4 w-full py-2.5 disabled:opacity-50"
              onClick={() => correr('empezar', async () => sb().rpc('guardar_profesional', {
                p_empresa: empresaId, p_nombre: miNombre, p_reparto: 'local',
                p_porcentaje: null, p_user: miUsuario, p_id: null,
              }))}
            >
              {ocupado ? t.comun.guardando : t.agenda.empezarBoton}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {error && (
        <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
          {error}
        </p>
      )}

      {/* Un profe no tiene link público: los horarios los arma él (089). */}
      {esAdmin && !deAlumnos && (
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
        titulo={vista === 'dia' ? `${t.agenda.turnosDe} ${fechaLarga(dia, locale)}` : t.agenda.calendario}
        accion={vista === 'dia'
          ? <NavegadorDia dia={dia} hoy={hoy} alIr={(d) => router.push(`/agenda?dia=${d}`)} />
          : undefined}
      >
        {/* El calendario es una forma de MIRAR: tocar un día vuelve a la
            vista del día, donde se anota, se mueve y se atiende. */}
        <SelectorVista vista={vista} alCambiar={setVista} />

        {vista !== 'dia' ? (
          <CalendarioAgenda
            empresaId={empresaId}
            vista={vista}
            dia={dia}
            hoy={hoy}
            alElegirDia={(d) => { setVista('dia'); router.push(`/agenda?dia=${d}`); }}
          />
        ) : (<>
        <NuevoTurno
          empresaId={empresaId}
          dia={dia}
          hoy={hoy}
          zona={zona}
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
            // Elegido de la lista: queda atado aunque no tenga teléfono (057).
            p_cliente: d.cliente,
          }))}
        />

        {sinAvisar > 0 && (
          <p className="px-4 pb-2 text-[12.5px] text-tinta/50">{t.agenda.sinAvisar(sinAvisar)}</p>
        )}

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
                    <span className="pastilla bg-verde text-sobre-verde">{t.agenda.atendido}</span>
                  )}
                  {r.estado === 'no_vino' && (
                    <span className="pastilla bg-rojo-claro text-rojo">{t.agenda.noVino}</span>
                  )}
                  {(r.estado === 'pendiente' || r.estado === 'confirmada') && enlaceDe(r) && (
                    <button
                      type="button" disabled={ocupado}
                      onClick={() => avisarPorWhatsApp(r)}
                      className={r.avisado
                        ? 'rounded-lg px-2 py-1 text-[12px] font-semibold text-tinta/45 hover:text-verde-fuerte'
                        : 'rounded-lg border border-verde bg-verde-claro px-2.5 py-1 text-[12px] font-bold text-verde-fuerte'}
                    >
                      {r.avisado ? t.agenda.yaAvisado : t.agenda.avisar}
                    </button>
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
                      onClick={() => setMoviendo(moviendo === r.id ? null : r.id)}
                    >
                      {t.agenda.mover}
                    </button>
                    {/* Avisó que no venía: se cancela y el hueco queda para otro.
                        Distinto de «no vino», que le queda pegado al cliente. */}
                    <button
                      type="button" className="boton-suave px-3 py-1.5 text-[13px]"
                      disabled={ocupado}
                      onClick={() => {
                        if (confirm(t.agenda.confirmarCancelar(r.cliente))) {
                          correr('cancelar', async () => sb().rpc('cancelar_turno', { p_reserva: r.id }));
                        }
                      }}
                    >
                      {t.comun.cancelar}
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

                {moviendo === r.id && (
                  <MoverTurno
                    empresaId={empresaId}
                    turno={r}
                    dia={dia}
                    hoy={hoy}
                    profesionales={profesionales.filter((p) => p.activo)}
                    ocupado={ocupado}
                    alCerrar={() => setMoviendo(null)}
                    alMover={(prof, inicia) => correr('mover', async () => sb().rpc('mover_turno', {
                      p_reserva: r.id,
                      p_profesional: prof,
                      p_inicia: inicia,
                    }))}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        </>)}
      </Seccion>

      {/* ---------- qué se puede reservar ----------
          Nada de esto es para un profe (090): qué se reserva, el horario de
          atención y los feriados existen para el link público, donde un
          desconocido mira qué hay libre. Al profe el alumno le escribe por
          WhatsApp, y él mira su calendario y anota. */}
      {esAdmin && !deAlumnos && (
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
      {!deAlumnos && <Horarios
        profesionales={profesionales.filter((p) => p.activo)}
        horarios={horarios}
        ocupado={ocupado}
        alAgregar={(prof, dia, desde, hasta) =>
          correr('horario', async () => sb().rpc('guardar_horario', {
            p_empresa: empresaId, p_profesional: prof, p_dia: dia, p_desde: desde, p_hasta: hasta,
          }))}
        alQuitar={(id) => correr('horario', async () =>
          sb().rpc('borrar_horario', { p_empresa: empresaId, p_id: id }))}
      />}

      {/* ---------- feriados, vacaciones y horarios especiales ---------- */}
      {!deAlumnos && <DiasEspeciales
        excepciones={excepciones}
        profesionales={profesionales.filter((p) => p.activo)}
        esAdmin={esAdmin}
        hoy={hoy}
        ocupado={ocupado}
        alCerrar={(d, h, prof, mot) => correr('especial', async () => sb().rpc('cerrar_dias', {
          p_empresa: empresaId,
          p_desde: d,
          p_hasta: h,
          p_profesional: prof || null,
          p_motivo: mot,
        }))}
        alAbrir={(d, h, prof) => correr('especial', async () => sb().rpc('abrir_dias', {
          p_empresa: empresaId,
          p_desde: d,
          p_hasta: h,
          p_profesional: prof || null,
        }))}
        alHorarioEspecial={(f, prof, d, h, mot) => correr('especial', async () =>
          sb().rpc('guardar_excepcion', {
            p_empresa: empresaId,
            p_fecha: f,
            p_cerrado: false,
            p_profesional: prof || null,
            p_desde: d,
            p_hasta: h,
            p_motivo: mot,
          }))}
      />}
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
// LOS HORARIOS QUE QUEDAN LIBRES
//
// Lo usan las dos cosas que ponen un turno en la agenda: anotarlo y moverlo.
// Es el mismo cálculo que ve el link público, así que las tres puertas no se
// pueden contradecir nunca.
//
// Los horarios se ELIGEN, no se escriben. Un campo de hora suelto deja anotar
// a las tres de la mañana o encima de otro turno, y el que después queda mal
// parado es el local.
// ════════════════════════════════════════════════════════════
/** La hora de un instante en la zona del negocio, como la dice la gente: "15:00". */
function horaEnZona(iso: string, zona?: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, ...(zona ? { timeZone: zona } : {}),
  });
}

function HorariosLibres({
  empresaId, profesional, producto, fecha, elegido, ocupado, alElegir, pedido = '', zona,
}: {
  empresaId: string;
  profesional: string;
  producto: string;
  fecha: string;
  elegido: string;
  ocupado: boolean;
  alElegir: (inicia: string) => void;
  /** La hora dictada, "15:00". Si está libre, se marca sola. */
  pedido?: string;
  /** La zona del negocio: «a las tres» es a las tres de ahí. */
  zona?: string;
}) {
  const t = useTextos();
  const locale = useLocale();
  const [huecos, setHuecos] = useState<HuecoLibre[] | null>(null);

  useEffect(() => {
    if (!profesional || !producto || !fecha) { setHuecos(null); return; }
    let vigente = true;
    setHuecos(null);
    (async () => {
      const { data } = await clienteNavegador().rpc('huecos_local', {
        p_empresa: empresaId,
        p_profesional: profesional,
        p_producto: producto,
        p_fecha: fecha,
      });
      if (!vigente) return;
      const lista = Array.isArray(data) ? (data as HuecoLibre[]) : [];
      setHuecos(lista);
      // Lo dictado se marca solo si está libre. Si no, se dice y la persona
      // elige: nunca se corre a un horario que no pidió.
      const justo = pedido ? lista.find((h) => horaEnZona(h.inicia, zona) === pedido) : undefined;
      if (justo) alElegir(justo.inicia);
    })();
    return () => { vigente = false; };
    // alElegir queda afuera a propósito: en «Mover» llega como una función
    // nueva en cada render, y con ella acá los horarios se pedirían sin parar.
  }, [empresaId, profesional, producto, fecha, pedido, zona]);

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

  if (!profesional || !producto || !fecha) return null;

  const sinLugar = pedido !== '' && (huecos?.length ?? 0) > 0
    && !(huecos ?? []).some((h) => horaEnZona(h.inicia, zona) === pedido);

  return (
    <div className="mt-3">
      <span className="etiqueta">{t.agenda.horariosLibres}</span>
      {sinLugar && (
        <p className="mb-2 rounded-xl bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">
          {t.agenda.dictadoSinLugar(pedido)}
        </p>
      )}
      {huecos === null ? (
        <p className="py-3 text-center text-[13px] text-tinta/45">{t.comun.cargando}</p>
      ) : huecos.length === 0 ? (
        <p className="rounded-xl bg-superficie px-3 py-3 text-center text-[13px] leading-relaxed text-tinta/55">
          {t.agenda.sinHuecos}
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {huecos.map((h) => (
            <button
              key={h.inicia} type="button" disabled={ocupado}
              onClick={() => alElegir(h.inicia)}
              className={elegido === h.inicia
                ? 'rounded-lg border border-verde bg-verde py-2 text-center text-[13.5px] font-semibold tabular-nums text-sobre-verde'
                : 'rounded-lg border border-borde bg-superficie py-2 text-center text-[13.5px] font-semibold tabular-nums transition hover:border-verde/50'}
            >
              {hora(h.inicia)}
            </button>
          ))}
        </div>
      )}
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
// ════════════════════════════════════════════════════════════
function NuevoTurno({
  empresaId, dia, hoy, zona, profesionales, servicios, catalogo, ocupado, alReservar,
}: {
  empresaId: string;
  dia: string;
  hoy: string;
  /** La zona del negocio, para leer la hora dictada como la hora de ahí. */
  zona: string;
  profesionales: Profesional[];
  servicios: ServicioAgenda[];
  catalogo: Producto[];
  ocupado: boolean;
  alReservar: (d: {
    profesional: string; producto: string; inicia: string; nombre: string; telefono: string;
    cliente: string | null;
  }) => Promise<boolean>;
}) {
  const t = useTextos();

  // Solo lo que está marcado para reservarse. Si un servicio no se agenda, la
  // base no le calcula huecos y el formulario quedaría mudo sin decir por qué.
  const agendables = catalogo.filter((p) =>
    servicios.some((s) => s.producto_id === p.id && s.reservable));

  const [abierto, setAbierto] = useState(false);
  const [profesional, setProfesional] = useState(profesionales.length === 1 ? profesionales[0].id : '');
  const [producto, setProducto] = useState(agendables.length === 1 ? agendables[0].id : '');
  const [fecha, setFecha] = useState(dia);
  const [elegido, setElegido] = useState('');
  // A quién (057). Se elige de la lista o se escribe uno nuevo: el buscador
  // ahorra volver a escribir nombre y teléfono de alguien que ya vino.
  const [cliente, setCliente] = useState<ClienteElegido>({ id: null, nombre: '', telefono: '' });

  // ── Dictar el turno (turnos por voz, del cuaderno del dueño) ──
  // La hora dictada, "15:00": se marca sola en la grilla si está libre.
  const [pedido, setPedido] = useState('');
  // Lo que se entendió, a la vista: si algo salió mal, se ve de dónde vino.
  const [dictado, setDictado] = useState<{ texto: string; aviso: string | null } | null>(null);
  // Si se cambia de día en la agenda, el formulario acompaña: lo más probable
  // es que quien lo abra ahí quiera anotar para ese día. Si ya estaba en ese
  // día —porque lo trajo un turno dictado—, no se toca: borraría la hora que
  // se acaba de marcar.
  useEffect(() => {
    if (fecha !== dia) { setFecha(dia); setElegido(''); }
  }, [dia]);

  // Lo que se dictó en el micrófono de siempre (la captura) llega acá, y el
  // formulario se abre con todo puesto. Al montar, por si la captura trajo a
  // la persona hasta la agenda; y con el aviso, por si ya estaba en ella.
  useEffect(() => {
    function levantar() {
      let crudo: string | null = null;
      try {
        crudo = sessionStorage.getItem(CLAVE_TURNO_DICTADO);
        sessionStorage.removeItem(CLAVE_TURNO_DICTADO);
      } catch {
        return;
      }
      if (!crudo) return;
      try {
        const d = JSON.parse(crudo) as TurnoRespuesta;
        setAbierto(true);
        aplicarDictado(d);
      } catch {
        // Algo ilegible en el almacenamiento: se ignora, y se anota a mano.
      }
    }
    levantar();
    window.addEventListener(EVENTO_TURNO_DICTADO, levantar);
    return () => window.removeEventListener(EVENTO_TURNO_DICTADO, levantar);
  }, []);

  /**
   * Lo dictado completa el formulario de siempre y nada más: no reserva. Lo
   * que no se entendió queda como estaba, para elegirlo a mano, y el turno se
   * confirma con el mismo botón que uno cargado a mano — pasando por los
   * mismos horarios libres, así que no se puede pisar con otro.
   */
  function aplicarDictado(d: TurnoRespuesta) {
    if (d.profesional_id) setProfesional(d.profesional_id);
    if (d.servicio_id) setProducto(d.servicio_id);
    if (d.fecha) setFecha(d.fecha);
    setElegido('');
    setPedido(d.hora ?? '');
    setCliente(d.cliente
      ? { id: d.cliente.id, nombre: d.cliente.nombre, telefono: d.cliente.telefono }
      : { id: null, nombre: d.cliente_nombre ?? '', telefono: d.cliente_telefono ?? '' });
    setDictado({ texto: d.transcripcion ?? '', aviso: d.aviso });
  }

  function cerrar() {
    setAbierto(false);
    setElegido('');
    setPedido('');
    setDictado(null);
  }

  // Sin nadie en el equipo no hay agenda posible, y la sección de horarios que
  // está más abajo ya explica qué hacer. Acá sobraría un botón que no lleva a
  // ningún lado.
  if (profesionales.length === 0) return null;

  // Para dictar un turno no hay un botón acá: se usa el micrófono de siempre,
  // el mismo de las ventas, y trae hasta este formulario lo que entendió.
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
        <button type="button" className="boton-texto mt-2 text-[13px]" onClick={cerrar}>
          {t.comun.cancelar}
        </button>
      </div>
    );
  }

  const listoParaAnotar = elegido !== '' && cliente.nombre.trim() !== '' && !ocupado;

  async function anotar() {
    const hecho = await alReservar({
      profesional, producto, inicia: elegido,
      nombre: cliente.nombre.trim(), telefono: cliente.telefono.trim(), cliente: cliente.id,
    });
    if (!hecho) return;
    cerrar();
    setCliente({ id: null, nombre: '', telefono: '' });
  }

  return (
    <div className="mx-4 mb-3 rounded-xl border border-borde bg-arena/40 p-3">
      <p className="mb-3 text-[12.5px] leading-relaxed text-tinta/55">{t.agenda.anotarDetalle}</p>

      {/* Lo que llegó dictado, a la vista: si algo salió mal, se ve de dónde vino. */}
      {dictado && (
        <div className="mb-3 space-y-1.5">
          {dictado.texto && (
            <p className="rounded-xl bg-superficie px-3 py-2 text-[12.5px] italic leading-relaxed text-tinta/60">
              «{dictado.texto}»
            </p>
          )}
          {dictado.aviso && (
            <p className="rounded-xl bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">{dictado.aviso}</p>
          )}
          {pedido && !profesional && (
            <p className="text-[12.5px] font-medium text-tinta/60">{t.agenda.dictadoElegiQuien(pedido)}</p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="etiqueta" htmlFor="turno-prof">{t.agenda.conQuien}</label>
          <select id="turno-prof" className="campo" value={profesional} disabled={ocupado}
            onChange={(e) => { setProfesional(e.target.value); setElegido(''); }}>
            <option value="">{t.agenda.elegir}</option>
            {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="turno-serv">{t.agenda.queServicio}</label>
          <select id="turno-serv" className="campo" value={producto} disabled={ocupado}
            onChange={(e) => { setProducto(e.target.value); setElegido(''); }}>
            <option value="">{t.agenda.elegir}</option>
            {agendables.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="turno-fecha">{t.agenda.queDia}</label>
          <input id="turno-fecha" type="date" className="campo" value={fecha} min={hoy} disabled={ocupado}
            onChange={(e) => { setFecha(e.target.value); setElegido(''); }} />
        </div>
      </div>

      <HorariosLibres
        empresaId={empresaId} profesional={profesional} producto={producto} fecha={fecha}
        elegido={elegido} ocupado={ocupado} alElegir={setElegido}
        pedido={pedido} zona={zona}
      />

      {elegido && (
        <div className="mt-3">
          {/* El teléfono se pide siempre que el cliente sea nuevo: con él
              llegan el recordatorio y el enlace para cancelar. Si ya estaba
              cargado, se usa el suyo. */}
          <SelectorCliente
            empresaId={empresaId}
            valor={cliente}
            alElegir={setCliente}
            etiqueta={t.agenda.nombreCliente}
            placeholder={t.agenda.nombreQuienViene}
            ayudaTelefono={t.agenda.telefonoRecordatorio}
            pedirTelefono
            obligatorio
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="boton-principal px-4 py-2 text-[13.5px]"
          disabled={!listoParaAnotar} onClick={anotar}>
          {t.agenda.confirmarTurno}
        </button>
        <button type="button" className="boton-texto text-[13px]" disabled={ocupado}
          onClick={cerrar}>
          {t.comun.cancelar}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MOVER UN TURNO
//
// «Me surgió algo, ¿me lo pasás al jueves?» y «Pedro se enfermó, te atiende
// Juan» son la mitad de los cambios de una peluquería. Sin esto, lo único a
// mano era marcar «no vino» —que es una acusación, no un cambio de hora— y
// el hueco quedaba ocupado por un turno que nadie iba a usar.
//
// El servicio no se cambia acá a propósito: de su duración sale la grilla de
// horarios, así que cambiarlo sería mover y reservar otra cosa al mismo
// tiempo. Para eso se cancela y se anota de nuevo.
// ════════════════════════════════════════════════════════════
function MoverTurno({
  empresaId, turno, dia, hoy, profesionales, ocupado, alCerrar, alMover,
}: {
  empresaId: string;
  turno: TurnoDelDia;
  dia: string;
  hoy: string;
  profesionales: Profesional[];
  ocupado: boolean;
  alCerrar: () => void;
  alMover: (profesional: string, inicia: string) => Promise<boolean>;
}) {
  const t = useTextos();
  const [profesional, setProfesional] = useState(turno.profesional_id);
  const [fecha, setFecha] = useState(dia);
  const [elegido, setElegido] = useState('');

  async function mover() {
    const hecho = await alMover(profesional, elegido);
    if (hecho) alCerrar();
  }

  return (
    <div className="mt-2 rounded-xl border border-borde bg-arena/40 p-3">
      <p className="mb-3 text-[12.5px] leading-relaxed text-tinta/55">{t.agenda.moverDetalle}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor={`mover-prof-${turno.id}`}>{t.agenda.conQuien}</label>
          <select id={`mover-prof-${turno.id}`} className="campo" value={profesional} disabled={ocupado}
            onChange={(e) => { setProfesional(e.target.value); setElegido(''); }}>
            {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor={`mover-fecha-${turno.id}`}>{t.agenda.queDia}</label>
          <input id={`mover-fecha-${turno.id}`} type="date" className="campo" value={fecha} min={hoy}
            disabled={ocupado} onChange={(e) => { setFecha(e.target.value); setElegido(''); }} />
        </div>
      </div>

      <HorariosLibres
        empresaId={empresaId} profesional={profesional} producto={turno.producto_id} fecha={fecha}
        elegido={elegido} ocupado={ocupado} alElegir={setElegido}
      />

      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="boton-principal px-4 py-2 text-[13.5px]"
          disabled={elegido === '' || ocupado} onClick={mover}>
          {t.agenda.confirmarMover}
        </button>
        <button type="button" className="boton-texto text-[13px]" disabled={ocupado} onClick={alCerrar}>
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
            className="shrink-0 rounded-lg bg-verde px-3 py-1.5 text-[12.5px] font-semibold text-sobre-verde"
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
                        <b className="font-semibold">{t.agenda.diasSemana[h.dia_semana]}</b>{' '}
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
                      {t.agenda.diasSemana.map((d, i) => <option key={i} value={i}>{d}</option>)}
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

// ════════════════════════════════════════════════════════════
// FERIADOS Y DÍAS LIBRES
//
// El horario semanal dice cómo es una semana normal. Esto dice cuáles no lo
// son: el feriado, las vacaciones de alguien, el sábado que se abre medio
// día. Sin esta pantalla la tabla existía desde la 036 y no la podía tocar
// nadie, así que el link público seguía ofreciendo turnos los días que el
// local cerraba — que es la peor forma de fallar: el cliente llega igual.
//
// Los días cerrados seguidos se muestran juntos («del 10 al 24») aunque
// abajo sean una fila por día. Una lista de catorce renglones idénticos no
// se lee, y lo que la persona cargó fue una vacación, no catorce feriados.
// ════════════════════════════════════════════════════════════
type GrupoDeDias = {
  desde: string;
  hasta: string;
  dias: number;
  excepcion: Excepcion;
};

function agruparDias(lista: Excepcion[]): GrupoDeDias[] {
  const orden = [...lista].sort((a, b) =>
    `${a.profesional_id ?? ''}|${a.fecha}`.localeCompare(`${b.profesional_id ?? ''}|${b.fecha}`));

  const grupos: GrupoDeDias[] = [];
  for (const e of orden) {
    const ultimo = grupos[grupos.length - 1];
    const sigue = ultimo
      && e.cerrado && ultimo.excepcion.cerrado
      && ultimo.excepcion.profesional_id === e.profesional_id
      && ultimo.excepcion.motivo === e.motivo
      && sumarDias(ultimo.hasta, 1) === e.fecha;

    if (sigue) {
      ultimo.hasta = e.fecha;
      ultimo.dias += 1;
    } else {
      grupos.push({ desde: e.fecha, hasta: e.fecha, dias: 1, excepcion: e });
    }
  }
  return grupos.sort((a, b) => a.desde.localeCompare(b.desde));
}

function DiasEspeciales({
  excepciones, profesionales, esAdmin, hoy, ocupado, alCerrar, alAbrir, alHorarioEspecial,
}: {
  excepciones: Excepcion[];
  profesionales: Profesional[];
  esAdmin: boolean;
  hoy: string;
  ocupado: boolean;
  alCerrar: (desde: string, hasta: string, profesional: string, motivo: string) => Promise<boolean>;
  alAbrir: (desde: string, hasta: string, profesional: string) => void;
  alHorarioEspecial: (
    fecha: string, profesional: string, desde: string, hasta: string, motivo: string,
  ) => Promise<boolean>;
}) {
  const t = useTextos();
  const locale = useLocale();
  const [abierto, setAbierto] = useState(false);
  const [cerrado, setCerrado] = useState(true);
  // Vacío es el local entero. Un vendedor no lo puede elegir: la base
  // rechaza el feriado del local si no sos el dueño, y acá ni se ofrece.
  const [quien, setQuien] = useState(esAdmin ? '' : (profesionales[0]?.id ?? ''));
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [horaDesde, setHoraDesde] = useState('09:00');
  const [horaHasta, setHoraHasta] = useState('12:00');
  const [motivo, setMotivo] = useState('');

  const grupos = agruparDias(excepciones);
  const nombreDe = (id: string | null) =>
    id === null ? t.agenda.todoElLocal : (profesionales.find((p) => p.id === id)?.nombre ?? '—');

  async function guardar() {
    const hecho = cerrado
      ? await alCerrar(desde, hasta < desde ? desde : hasta, quien, motivo)
      : await alHorarioEspecial(desde, quien, horaDesde, horaHasta, motivo);
    if (!hecho) return;
    setAbierto(false);
    setMotivo('');
  }

  return (
    <Seccion
      titulo={t.agenda.diasEspeciales}
      accion={
        <button type="button" className="boton-texto text-[12.5px]" disabled={ocupado}
          onClick={() => setAbierto((v) => !v)}>
          {abierto ? t.comun.cancelar : t.agenda.agregarDiaEspecial}
        </button>
      }
    >
      <p className="px-4 pb-3 text-[12.5px] leading-relaxed text-tinta/50">
        {t.agenda.diasEspecialesDetalle}
      </p>

      {abierto && (
        <div className="mx-4 mb-3 rounded-xl border border-borde bg-arena/40 p-3">
          <div className="mb-3 flex gap-2">
            <button type="button" disabled={ocupado} onClick={() => setCerrado(true)}
              className={cerrado
                ? 'rounded-lg border border-verde bg-verde px-3 py-1.5 text-[13px] font-semibold text-sobre-verde'
                : 'rounded-lg border border-borde bg-superficie px-3 py-1.5 text-[13px] font-semibold'}>
              {t.agenda.cerradoTodoElDia}
            </button>
            <button type="button" disabled={ocupado} onClick={() => setCerrado(false)}
              className={!cerrado
                ? 'rounded-lg border border-verde bg-verde px-3 py-1.5 text-[13px] font-semibold text-sobre-verde'
                : 'rounded-lg border border-borde bg-superficie px-3 py-1.5 text-[13px] font-semibold'}>
              {t.agenda.abroEnOtroHorario}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="etiqueta" htmlFor="esp-quien">{t.agenda.quienCierra}</label>
              <select id="esp-quien" className="campo" value={quien} disabled={ocupado}
                onChange={(e) => setQuien(e.target.value)}>
                {esAdmin && <option value="">{t.agenda.todoElLocal}</option>}
                {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="etiqueta" htmlFor="esp-desde">
                {cerrado ? t.agenda.primerDia : t.agenda.queDia}
              </label>
              <input id="esp-desde" type="date" className="campo" value={desde} min={hoy} disabled={ocupado}
                onChange={(e) => {
                  setDesde(e.target.value);
                  if (hasta < e.target.value) setHasta(e.target.value);
                }} />
            </div>
            {cerrado ? (
              <div>
                <label className="etiqueta" htmlFor="esp-hasta">{t.agenda.ultimoDia}</label>
                <input id="esp-hasta" type="date" className="campo" value={hasta} min={desde}
                  disabled={ocupado} onChange={(e) => setHasta(e.target.value)} />
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="etiqueta" htmlFor="esp-h1">{t.agenda.desde}</label>
                  <input id="esp-h1" type="time" className="campo" value={horaDesde} disabled={ocupado}
                    onChange={(e) => setHoraDesde(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="etiqueta" htmlFor="esp-h2">{t.agenda.hasta}</label>
                  <input id="esp-h2" type="time" className="campo" value={horaHasta} disabled={ocupado}
                    onChange={(e) => setHoraHasta(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="mt-3">
            <label className="etiqueta" htmlFor="esp-motivo">{t.agenda.motivo}</label>
            <input id="esp-motivo" className="campo" maxLength={100} value={motivo} disabled={ocupado}
              placeholder={t.agenda.motivoEjemplo}
              onChange={(e) => setMotivo(e.target.value)} />
          </div>

          <p className="mt-3 rounded-xl bg-superficie px-3 py-2.5 text-[12px] leading-relaxed text-tinta/55">
            {t.agenda.avisoTurnosYaTomados}
          </p>

          <button type="button" className="boton-principal mt-3 px-4 py-2 text-[13.5px]"
            disabled={ocupado} onClick={guardar}>
            {t.comun.guardar}
          </button>
        </div>
      )}

      {grupos.length === 0 ? (
        <div className="px-4 pb-4">
          <Vacio titulo={t.agenda.sinDiasEspeciales} detalle={t.agenda.sinDiasEspecialesDetalle} />
        </div>
      ) : (
        <ul className="divide-y divide-borde border-t border-borde">
          {grupos.map((g) => (
            <li key={g.excepcion.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">
                  {g.dias === 1
                    ? fechaLarga(g.desde, locale)
                    : t.agenda.rangoDeDias(fechaLegible(g.desde, false, locale), fechaLegible(g.hasta, false, locale))}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-tinta/50">
                  {nombreDe(g.excepcion.profesional_id)}
                  {' · '}
                  {g.excepcion.cerrado
                    ? t.agenda.cerradoTodoElDia
                    : t.agenda.abreDe(g.excepcion.desde ?? '', g.excepcion.hasta ?? '')}
                  {g.excepcion.motivo && ` · ${g.excepcion.motivo}`}
                </span>
              </span>
              <button
                type="button" className="boton-texto shrink-0 text-[13px]" disabled={ocupado}
                onClick={() => alAbrir(g.desde, g.hasta, g.excepcion.profesional_id ?? '')}
              >
                {t.agenda.volverAAbrir}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}

