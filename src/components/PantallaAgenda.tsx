'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { dinero, fechaLarga, fechaLegible } from '@/lib/formato';
import { sumarDias } from '@/lib/fechas';
import { enlaceWhatsApp } from '@/lib/telefono';
import { useTextos, useLocale } from '@/i18n/cliente';
import { Seccion, Vacio } from '@/components/Piezas';
import { Hoja, PieHoja, MensajeError } from '@/components/Hoja';
import { CalendarioAgenda, SelectorVista, type VistaAgenda } from '@/components/CalendarioAgenda';
import { describirDia, type DiaCalendario } from '@/lib/calendario-agenda';
import { SelectorCliente, type ClienteElegido } from '@/components/SelectorCliente';
import { InscribirAlumno } from '@/components/InscribirAlumno';
import { CLAVE_TURNO_DICTADO, EVENTO_TURNO_DICTADO, type TurnoRespuesta } from '@/lib/turno-voz';
import { RutinaDeLaSesion } from '@/components/rutinas/HojaRutinaSesion';
import { primerNombre } from '@/components/rutinas/panel/utiles';
import { FormaDeCobro, cuentaDelCobro, useCuentasParaElegir } from '@/components/FormaDeCobro';
import type {
  Profesional, TurnoDelDia, HorarioSemanal, ServicioAgenda, LinkPublico, Producto, HuecoLibre,
  Excepcion, CuentaParaElegir,
} from '@/lib/tipos';
import type { RutinasDeLaAgenda } from '@/lib/tipos-rutinas';

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
  excepciones, negocio, zona, origen, deAlumnos = false, notasALaVista = false,
  conRutinas = false, rutinas = {},
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
  /** Las notas de cada cliente pegadas a su sesión: las lesiones de un trainer (097). */
  notasALaVista?: boolean;
  /** El trainer (098): la rutina de cada sesión y, al agendar a alguien nuevo, «Siguiente». */
  conRutinas?: boolean;
  /** La rutina vigente del cliente de cada sesión, por id de reserva. */
  rutinas?: RutinasDeLaAgenda;
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
  // El turno que se está cobrando (117): cómo pagó y a qué cuenta entró.
  const [cobrandoTurno, setCobrandoTurno] = useState<string | null>(null);
  // Las cuentas, solo para quien administra: al resto la base no se las da.
  const cuentas = useCuentasParaElegir(empresaId, esAdmin);
  // Cómo se mira la agenda: el día, o un calendario de semana, mes o fechas (072).
  const [vista, setVista] = useState<VistaAgenda>('dia');
  // El formulario de inscribir a un alumno, en la agenda de un profe (091).
  const [inscribiendo, setInscribiendo] = useState(false);
  const [inscripto, setInscripto] = useState('');
  // El cliente nuevo que se acaba de agendar, para el «Siguiente» del trainer (098).
  const [siguiente, setSiguiente] = useState<{ id: string; nombre: string; mensaje: string } | null>(null);
  // Lo que se dictó en el micrófono, para un profe: llega a inscribir (092).
  const [dictadoProfe, setDictadoProfe] = useState<TurnoRespuesta | null>(null);
  // EL CALENDARIO QUE SE ENTIENDE (119).
  // Sube con cada cambio (anotar, marcar, mover, cancelar): el calendario y
  // la hoja del día se vuelven a pedir. `router.refresh()` solo trae lo que
  // arma el servidor, y el calendario se pide desde el navegador.
  const [version, setVersion] = useState(0);
  // El día tocado en el calendario: su lista se abre ahí mismo, en una hoja.
  // Antes el toque pasaba a la vista Día con el día ANTERIOR a la vista, sin
  // ninguna señal, hasta que contestaba el servidor: «no aparece nada».
  const [diaAbierto, setDiaAbierto] = useState<{ fecha: string; info: DiaCalendario; conHorario: boolean } | null>(null);
  // «Inscribir» desde la hoja de un día: el formulario de arriba, con ese día puesto.
  const [diaInscribir, setDiaInscribir] = useState<string | null>(null);
  const refInscribir = useRef<HTMLDivElement>(null);
  // «Cargar horario» desde el calendario: abre el formulario del horario.
  const [pedirHorario, setPedirHorario] = useState(0);
  // La vista Día nunca muestra un día por otro: mientras llega el pedido, el
  // título ya dice el día nuevo y la lista espera (sin loading.tsx).
  const [diaPedido, setDiaPedido] = useState(dia);
  const [yendo, empezarIda] = useTransition();
  const diaVisible = yendo ? diaPedido : dia;
  const cargandoDia = yendo && diaPedido !== dia;
  function irADia(d: string) {
    setDiaPedido(d);
    empezarIda(() => router.push(`/agenda?dia=${d}`));
  }
  useEffect(() => {
    if (!deAlumnos) return;
    function levantar() {
      let crudo: string | null = null;
      try {
        crudo = sessionStorage.getItem(CLAVE_TURNO_DICTADO);
        sessionStorage.removeItem(CLAVE_TURNO_DICTADO);
      } catch { return; }
      if (!crudo) return;
      try {
        setDictadoProfe(JSON.parse(crudo) as TurnoRespuesta);
        setInscribiendo(true);
      } catch { /* ilegible: se inscribe a mano */ }
    }
    levantar();
    window.addEventListener(EVENTO_TURNO_DICTADO, levantar);
    return () => window.removeEventListener(EVENTO_TURNO_DICTADO, levantar);
  }, [deAlumnos]);

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
      setVersion((v) => v + 1);
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
  const enlaceDe = (r: TurnoDelDia, diaDelTurno: string = dia) => enlaceWhatsApp(r.telefono, zona, t.agenda.mensajeRecordatorio({
    cliente: r.cliente,
    negocio,
    fecha: fechaLarga(diaDelTurno, locale),
    hora: hora(r.inicia),
    servicio: r.servicio,
    enlace: origen ? `${origen}/turno/${r.token}` : '',
  }));

  /**
   * WhatsApp se abre PRIMERO y la marca se guarda después. Al revés, entre
   * el await y el open el navegador ya perdió el gesto del dedo y trata la
   * ventana como un pop-up: la bloquea, y el mensaje no se manda nunca.
   */
  function avisarPorWhatsApp(r: TurnoDelDia, diaDelTurno: string = dia) {
    const enlace = enlaceDe(r, diaDelTurno);
    if (!enlace) return;
    window.open(enlace, '_blank', 'noopener,noreferrer');
    correr('avisar', async () => sb().rpc('marcar_avisado', { p_reserva: r.id }));
  }

  // Cuántos de este día tienen teléfono utilizable y siguen sin aviso.
  const sinAvisar = turnos.filter((r) =>
    !r.avisado && (r.estado === 'pendiente' || r.estado === 'confirmada') && enlaceDe(r)).length;

  /**
   * UNA FILA DE LA AGENDA: la hora, quién, qué y lo que se puede hacer.
   * La misma en la vista Día y en la hoja que se abre al tocar un día del
   * calendario (119): las mismas acciones, en los dos lados. `rutinas` es la
   * del día de la fila (la del servidor en la vista Día, la que trae la hoja).
   */
  const filaTurno = (r: TurnoDelDia, diaFila: string, rutinas: RutinasDeLaAgenda) => (
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
          <span className="pastilla bg-verde text-sobre-verde">{deAlumnos ? t.agenda.claseDada : t.agenda.atendido}</span>
        )}
        {r.estado === 'no_vino' && (
          <span className="pastilla bg-rojo-claro text-rojo">{deAlumnos ? t.agenda.claseNoTenida : t.agenda.noVino}</span>
        )}
        {(r.estado === 'pendiente' || r.estado === 'confirmada') && enlaceDe(r, diaFila) && (
          <button
            type="button" disabled={ocupado}
            onClick={() => avisarPorWhatsApp(r, diaFila)}
            className={r.avisado
              ? 'rounded-lg px-2 py-1 text-[12px] font-semibold text-tinta/45 hover:text-verde-fuerte'
              : 'rounded-lg border border-verde bg-verde-claro px-2.5 py-1 text-[12px] font-bold text-verde-fuerte'}
          >
            {r.avisado ? t.agenda.yaAvisado : t.agenda.avisar}
          </button>
        )}
      </div>

      {/* Un profe da sus clases solo: «Clase · su propio nombre» debajo
          de cada una no dice nada (092). Queda el teléfono, si hay. */}
      {(!deAlumnos || r.telefono || r.materia) && (
        <p className="mt-0.5 text-[12.5px] text-tinta/50">
          {!deAlumnos && <>{r.servicio} · {r.profesional}</>}
          {/* Para un profe, qué se da en esa clase (094). */}
          {deAlumnos && r.materia && <span className="font-semibold text-tinta/70">{r.materia}</span>}
          {r.telefono && (
            <>{(!deAlumnos || r.materia) && ' · '}<a href={`tel:${r.telefono}`} className="text-verde-fuerte">{r.telefono}</a></>
          )}
        </p>
      )}

      {/* Las lesiones del cliente, antes de empezar (097). Entera: «sin
          saltos» cortado por la mitad es peor que no decirlo. */}
      {notasALaVista && r.notas && (
        // El aviso en ámbar y la letra en el color de siempre: ámbar sobre
        // ámbar claro no llega al contraste mínimo en el modo claro.
        <p className="mt-1.5 flex gap-1.5 rounded-lg bg-ambar-claro px-2.5 py-1.5 text-[12.5px] font-medium leading-snug text-tinta/85">
          <span aria-hidden className="text-ambar">⚠</span>
          <span><span className="sr-only">{t.inscribir.salud}: </span>{r.notas}</span>
        </p>
      )}

      {/* La rutina de la sesión, debajo de las lesiones (098): «Ver»
          la abre para darla con el celular en la mano y subir la
          carga ahí mismo. Sin rutina vigente, no hay renglón. */}
      {conRutinas && rutinas[r.id] && (
        <RutinaDeLaSesion
          className="mt-1.5"
          empresaId={empresaId}
          rutinaId={rutinas[r.id].rutina_id}
          nombre={rutinas[r.id].nombre}
        />
      )}

      {(r.estado === 'pendiente' || r.estado === 'confirmada') && deAlumnos && r.paquete_id && (
        <div className="mt-2 flex flex-wrap gap-2">
          {/* LA CLASE YA ESTÁ COBRADA (092). Matías: «atendido y cobrar
              no se puede, porque yo ya cobré por adelantado». Marcar
              es solo decir que pasó, y descontarla del período. */}
          <button
            type="button" className="boton-principal px-3 py-1.5 text-[13px]"
            disabled={ocupado}
            onClick={() => correr('atender', async () =>
              sb().rpc('marcar_clase', { p_reserva: r.id, p_dada: true }))}
          >
            {t.agenda.marcarDada}
          </button>
          <button
            type="button" className="boton-suave px-3 py-1.5 text-[13px]"
            disabled={ocupado}
            onClick={() => setMoviendo(moviendo === r.id ? null : r.id)}
          >
            {t.agenda.mover}
          </button>
          {/* En cada falta se decide si se descuenta: es la regla que
              eligió Matías. Aceptar la pierde; cancelar se la guarda. */}
          <button
            type="button" className="boton-suave px-3 py-1.5 text-[13px]"
            disabled={ocupado}
            onClick={() => {
              const descontar = confirm(t.agenda.preguntaDescontar(r.cliente));
              correr('novino', async () =>
                sb().rpc('marcar_clase', { p_reserva: r.id, p_dada: false, p_descontar: descontar }));
            }}
          >
            {t.agenda.marcarNoTenida}
          </button>
        </div>
      )}

      {/* «ATENDIDO, COBRAR» PREGUNTA CÓMO PAGÓ (117). Antes cobraba al
          toque y siempre en efectivo, a la caja, aunque te lo hayan
          transferido. Ahora se elige cómo pagó y, con dos bancos, a
          cuál entró, y se confirma: un toque de más, y ningún cobro
          en la cuenta equivocada (como Cobrar en la ficha, 095). */}
      {cobrandoTurno === r.id && (r.estado === 'pendiente' || r.estado === 'confirmada') && (
        <CobrarTurno
          turno={r} empresaId={empresaId} cuentas={cuentas} plata={plata} ocupado={ocupado}
          alquila={profesionales.find((p) => p.id === r.profesional_id)?.reparto === 'alquiler'}
          alCancelar={() => setCobrandoTurno(null)}
          alCobrar={async (metodo, cuenta) => {
            if (await correr('atender', async () => sb().rpc('atender_reserva', metodo === null
              // Alquila la silla: no hay venta del local, no se dice cómo ni a dónde.
              ? { p_reserva: r.id }
              : { p_reserva: r.id, p_metodo: metodo, p_cuenta: cuenta },
            ))) setCobrandoTurno(null);
          }}
        />
      )}

      {(r.estado === 'pendiente' || r.estado === 'confirmada') && !(deAlumnos && r.paquete_id) && cobrandoTurno !== r.id && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button" className="boton-principal px-3 py-1.5 text-[13px]"
            disabled={ocupado}
            onClick={() => { setMoviendo(null); setCobrandoTurno(r.id); }}
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
          dia={diaFila}
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
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {error && (
        <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
          {error}
        </p>
      )}

      {/* LA AGENDA DE UN PROFE EMPIEZA POR INSCRIBIR (091).
          Matías: «el alumno le escribe por WhatsApp, el profe entra a ver si
          tiene libre tal día y tal hora, y cuando llegan a un acuerdo lo
          anota». Está arriba del calendario a propósito: se mira el
          calendario, se decide, y se inscribe sin moverse de pantalla. */}
      {deAlumnos && (inscribiendo ? (
        <div ref={refInscribir} className="scroll-mt-24">
        <InscribirAlumno
          // Desde la hoja de un día llega con ese día puesto; otro día, otro formulario.
          key={diaInscribir ?? 'nuevo'}
          empresaId={empresaId} moneda={moneda} zona={zona}
          dictado={dictadoProfe}
          diaInicial={diaInscribir ?? undefined}
          pedirSalud={notasALaVista}
          alCancelar={() => { setInscribiendo(false); setDictadoProfe(null); setDiaInscribir(null); }}
          alListo={(m, nuevo) => {
            setInscribiendo(false);
            setDiaInscribir(null);
            setVersion((v) => v + 1);
            router.refresh();
            // Alguien nuevo del trainer: el aviso se queda con «Siguiente»
            // hasta que elija qué hacer. Si no, se va solo como siempre.
            if (conRutinas && nuevo) {
              setSiguiente({ ...nuevo, mensaje: m });
              return;
            }
            setInscripto(m);
            setTimeout(() => setInscripto(''), 5000);
          }}
        />
        </div>
      ) : (
        <button
          type="button" className="boton-principal w-full py-3 text-[15px]"
          onClick={() => { setSiguiente(null); setInscribiendo(true); }}
        >
          + {t.inscribir.boton}
        </button>
      ))}
      {inscripto && (
        <p className="rounded-xl bg-verde-claro px-4 py-3 text-[13.5px] font-semibold text-verde-fuerte aparecer">✓ {inscripto}</p>
      )}

      {/* «SIGUIENTE» DESPUÉS DE AGENDAR A ALGUIEN NUEVO (098).
          El primer día un trainer hace todo junto: lo agenda, lo mide y le
          arma la rutina. Sin esto eran seis pantallas para llegar a cada cosa.
          Las medidas son del dueño o de un administrador: a los demás se les
          ofrece solo la rutina. */}
      {siguiente && (
        <div role="status" className="rounded-2xl border border-verde/30 bg-superficie px-4 py-3.5 aparecer">
          <p className="text-[13.5px] font-semibold text-verde-fuerte">✓ {siguiente.mensaje}</p>
          <p className="mt-3 text-[12px] font-bold uppercase tracking-wide text-tinta/50">{t.agenda.siguientePaso}</p>
          <p className="mt-0.5 text-[13.5px] leading-snug text-tinta/75">
            {t.agenda.siguienteDetalle(primerNombre(siguiente.nombre) || siguiente.nombre)}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {esAdmin && (
              <Link
                href={`/rutinas/cliente/${siguiente.id}?ver=progreso&anotar=1`}
                className="boton-principal min-h-[44px] text-center"
              >
                {t.agenda.medidasDeInicio}
              </Link>
            )}
            <Link
              href={`/rutinas/nueva?cliente=${siguiente.id}`}
              className={`${esAdmin ? 'boton-suave' : 'boton-principal'} min-h-[44px] text-center`}
            >
              {t.agenda.armarSuRutina}
            </Link>
          </div>
          <button
            type="button" onClick={() => setSiguiente(null)}
            className="boton-texto mt-1 inline-flex min-h-[44px] items-center text-tinta/55"
          >
            {t.agenda.despues}
          </button>
        </div>
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
        titulo={vista === 'dia'
          ? `${deAlumnos ? t.agenda.clasesDe : t.agenda.turnosDe} ${fechaLarga(diaVisible, locale)}`
          : t.agenda.calendario}
        accion={vista === 'dia'
          ? <NavegadorDia dia={diaVisible} hoy={hoy} alIr={irADia} />
          : undefined}
      >
        {/* El calendario es una forma de MIRAR: tocar un día abre su lista
            ahí mismo, en una hoja, con las mismas acciones que la vista Día
            (119). «Ver el día completo» lleva a la vista Día. */}
        <SelectorVista vista={vista} alCambiar={setVista} />

        {vista !== 'dia' ? (
          <CalendarioAgenda
            empresaId={empresaId}
            vista={vista}
            dia={dia}
            hoy={hoy}
            elegido={diaAbierto?.fecha ?? null}
            deAlumnos={deAlumnos}
            version={version}
            conHorarioInicial={horarios.some((h) => h.activo && profesionales.some((p) => p.activo && p.id === h.profesional_id))}
            alElegirDia={(d, info, conHorario) => { setError(''); setDiaAbierto({ fecha: d, info, conHorario }); }}
            alActualizarElegido={(info, conHorario) => {
              // Lo nuevo del día abierto (después de anotar, mover o cancelar):
              // la hoja no se queda con el «Libre» de cuando se tocó.
              setDiaAbierto((x) => (!x || x.fecha !== info.fecha || (x.info === info && x.conHorario === conHorario)
                ? x : { ...x, info, conHorario }));
            }}
            alCargarHorario={() => {
              // Baja al horario con el formulario ya abierto.
              setPedirHorario((n) => n + 1);
              document.getElementById('horario')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        ) : cargandoDia ? (
          // El día pedido todavía no llegó: nunca la lista de otro día.
          <EsqueletoDia />
        ) : (<>
        {/* El turno suelto necesita servicios reservables, que un profe
            no tiene: él inscribe al alumno arriba (091). */}
        {!deAlumnos && <NuevoTurno
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
        />}

        {sinAvisar > 0 && (
          <p className="px-4 pb-2 text-[12.5px] text-tinta/50">{t.agenda.sinAvisar(sinAvisar)}</p>
        )}

        {turnos.length === 0 ? (
          <div className="px-4 pb-4">
            <Vacio
              titulo={deAlumnos ? t.agenda.sinTurnosDeAlumnos : t.agenda.sinTurnos}
              detalle={deAlumnos ? t.agenda.sinTurnosProfe : t.agenda.sinTurnosDetalle}
            />
          </div>
        ) : (
          <ul className="divide-y divide-borde border-t border-borde">
            {turnos.map((r) => filaTurno(r, dia, rutinas))}
          </ul>
        )}
        </>)}
      </Seccion>

      {/* LA HOJA DEL DÍA TOCADO EN EL CALENDARIO (119). */}
      {diaAbierto && (
        <HojaDelDia
          empresaId={empresaId}
          fecha={diaAbierto.fecha}
          info={diaAbierto.info}
          conHorario={diaAbierto.conHorario}
          hoy={hoy}
          deAlumnos={deAlumnos}
          conRutinas={conRutinas}
          version={version}
          error={error}
          ocupado={ocupado}
          puedeAnotar={deAlumnos || profesionales.some((p) => p.activo)}
          fila={filaTurno}
          alCerrar={() => { setDiaAbierto(null); setMoviendo(null); setCobrandoTurno(null); }}
          alVerDia={() => {
            const d = diaAbierto.fecha;
            setDiaAbierto(null);
            setVista('dia');
            irADia(d);
          }}
          alInscribir={() => {
            // El profe inscribe arriba, en el formulario de siempre, con ese día puesto.
            const d = diaAbierto.fecha;
            setDiaAbierto(null);
            setSiguiente(null);
            setDictadoProfe(null);
            setDiaInscribir(d);
            setInscribiendo(true);
            setTimeout(() => refInscribir.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
          }}
          anotarTurno={(alCerrarForm) => (
            <NuevoTurno
              empresaId={empresaId}
              dia={diaAbierto.fecha}
              hoy={hoy}
              zona={zona}
              profesionales={profesionales.filter((p) => p.activo)}
              servicios={servicios}
              catalogo={catalogo}
              ocupado={ocupado}
              abiertoDeEntrada
              sinDictado
              alCerrar={alCerrarForm}
              alReservar={(d) => correr('turno', async () => sb().rpc('reservar', {
                p_empresa: empresaId,
                p_profesional: d.profesional,
                p_producto: d.producto,
                p_inicia: d.inicia,
                p_nombre: d.nombre,
                p_telefono: d.telefono,
                p_cliente: d.cliente,
              }))}
            />
          )}
        />
      )}

      {/* ---------- qué se puede reservar ----------
          No es para un profe (090): qué se reserva existe para el link
          público, donde un desconocido mira qué hay libre. Al profe el alumno
          le escribe por WhatsApp, y él mira su calendario y anota. Su horario
          y sus vacaciones sí (119): son opcionales y solo los lee el
          calendario, para decirle qué días le queda lugar. */}
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

      {/* ---------- el horario de cada uno ----------
          El calendario lleva acá con «Cargar horario» (119). El profe que da
          sus clases solo lo ve como «Tu horario de clases», sin elegir a
          nadie, y opcional. */}
      <div id="horario" className="scroll-mt-24">
        <Horarios
          profesionales={profesionales.filter((p) => p.activo)}
          horarios={horarios}
          ocupado={ocupado}
          unaPersona={deAlumnos && profesionales.filter((p) => p.activo).length <= 1}
          titulo={deAlumnos ? t.agenda.tuHorario : undefined}
          detalle={deAlumnos ? t.agenda.horarioOpcional : undefined}
          abrirPedido={pedirHorario}
          alAgregar={(prof, dia, desde, hasta) =>
            correr('horario', async () => {
              // El profe que todavía no inscribió a nadie no tiene fila de
              // profesional, y guardar_horario la pide: se la da la base (119).
              let quien = prof;
              if (!quien) {
                const r = await sb().rpc('mi_profesional', { p_empresa: empresaId });
                if (r.error) return { error: r.error };
                quien = String(r.data ?? '');
              }
              return sb().rpc('guardar_horario', {
                p_empresa: empresaId, p_profesional: quien, p_dia: dia, p_desde: desde, p_hasta: hasta,
              });
            })}
          alQuitar={(id) => correr('horario', async () =>
            sb().rpc('borrar_horario', { p_empresa: empresaId, p_id: id }))}
        />
      </div>

      {/* ---------- feriados, vacaciones y horarios especiales ----------
          Para el profe, «Vacaciones y días libres»: lo que en su calendario
          se ve como «Cerrado» (119). */}
      <DiasEspeciales
        excepciones={excepciones}
        profesionales={profesionales.filter((p) => p.activo)}
        esAdmin={esAdmin}
        hoy={hoy}
        ocupado={ocupado}
        unaPersona={deAlumnos && profesionales.filter((p) => p.activo).length <= 1}
        titulo={deAlumnos ? t.agenda.vacaciones : undefined}
        detalle={deAlumnos ? t.agenda.vacacionesDetalle : undefined}
        aviso={deAlumnos ? t.agenda.avisoClasesYaTomadas : undefined}
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
      />
    </div>
  );
}

/** Mientras llega el día pedido: unas filas grises, nunca la lista de otro día. */
function EsqueletoDia() {
  return (
    <ul aria-busy="true" className="divide-y divide-borde border-t border-borde">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3.5">
          <span className="h-4 w-11 animate-pulse rounded-md bg-tinta/[0.08]" />
          <span className="h-4 flex-1 animate-pulse rounded-md bg-tinta/[0.06]" />
        </li>
      ))}
    </ul>
  );
}

// ════════════════════════════════════════════════════════════
// LA HOJA DE UN DÍA (119)
//
// Matías tocaba un día con clases en el calendario y «no aparecía nada»: la
// pantalla pasaba a la vista Día con la lista del día ANTERIOR, sin ninguna
// señal, hasta que contestaba el servidor. Ahora el día se abre ahí mismo,
// sobre el calendario: la lista la trae la hoja desde el navegador (con un
// esqueleto mientras llega), con las mismas filas y acciones que la vista
// Día, y abajo «Anotar» ese día y «Ver el día completo».
// ════════════════════════════════════════════════════════════
function HojaDelDia({
  empresaId, fecha, info, conHorario, hoy, deAlumnos, conRutinas, version, error, ocupado, puedeAnotar,
  fila, alCerrar, alVerDia, alInscribir, anotarTurno,
}: {
  empresaId: string;
  fecha: string;
  /**
   * Lo que dice el calendario de ese día: cuántos, y si está libre, lleno o
   * cerrado. Se renueva cada vez que llega el calendario (alActualizarElegido).
   */
  info: DiaCalendario;
  conHorario: boolean;
  hoy: string;
  deAlumnos: boolean;
  conRutinas: boolean;
  /** Sube con cada acción: la lista se vuelve a pedir. */
  version: number;
  error: string;
  ocupado: boolean;
  puedeAnotar: boolean;
  fila: (r: TurnoDelDia, dia: string, rutinas: RutinasDeLaAgenda) => React.ReactNode;
  alCerrar: () => void;
  alVerDia: () => void;
  /** El profe: inscribir arriba, con este día puesto. */
  alInscribir: () => void;
  /** La barbería: el formulario de anotar un turno, adentro de la hoja. */
  anotarTurno: (alCerrarForm: () => void) => React.ReactNode;
}) {
  const t = useTextos();
  const a = t.agenda;
  const locale = useLocale();
  const [datos, setDatos] = useState<{ fecha: string; turnos: TurnoDelDia[]; rutinas: RutinasDeLaAgenda } | null>(null);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  const [anotando, setAnotando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setFallo(false);
    (async () => {
      const sb = clienteNavegador();
      // La rutina de cada sesión (098) es contexto: si falla, la lista sale igual.
      const pedirRutinas: Promise<unknown> = conRutinas
        ? Promise.resolve(sb.rpc('rutinas_de_la_agenda', { p_empresa: empresaId, p_fecha: fecha }))
          .then((r) => (r.error ? {} : r.data), () => ({}))
        : Promise.resolve({});
      const [lista, rut] = await Promise.all([
        sb.rpc('agenda_del_dia', { p_empresa: empresaId, p_fecha: fecha }),
        pedirRutinas,
      ]);
      if (!vivo) return;
      if (lista.error) { setFallo(true); return; }
      const mapa = rut && typeof rut === 'object' && !Array.isArray(rut) ? (rut as RutinasDeLaAgenda) : {};
      setDatos({ fecha, turnos: Array.isArray(lista.data) ? (lista.data as TurnoDelDia[]) : [], rutinas: mapa });
    })().catch(() => { if (vivo) setFallo(true); });
    return () => { vivo = false; };
  }, [empresaId, fecha, conRutinas, version, intento]);

  // Solo la lista de ESTE día: la de otro, mientras llega, es el esqueleto.
  const turnos = datos && datos.fecha === fecha ? datos.turnos : null;
  // La cantidad, de la lista ya traída (si se anotó algo, se ve al toque).
  const actual: DiaCalendario = turnos ? {
    ...info,
    turnos: turnos.length,
    franjas: new Set(turnos.map((r) => `${r.profesional_id}|${r.inicia}|${r.termina}`)).size,
  } : info;
  const titulo = fechaLarga(fecha, locale);
  const futuro = fecha >= hoy;

  return (
    <Hoja
      titulo={titulo.charAt(0).toUpperCase() + titulo.slice(1)}
      subtitulo={describirDia(actual, deAlumnos, conHorario, a)}
      onCerrar={alCerrar}
      bloqueada={ocupado}
      tamano="grande"
      pie={(
        <PieHoja columnas={futuro && puedeAnotar && !anotando ? 2 : 1}>
          {futuro && puedeAnotar && !anotando && (
            <button
              type="button" className="boton-principal min-h-[48px] px-3 text-[14px]" disabled={ocupado}
              onClick={() => (deAlumnos ? alInscribir() : setAnotando(true))}
            >
              + {deAlumnos ? a.inscribirEseDia : a.anotarEseDia}
            </button>
          )}
          <button type="button" className="boton-suave min-h-[48px] px-3 text-[14px]" disabled={ocupado} onClick={alVerDia}>
            {a.verDiaCompleto}
          </button>
        </PieHoja>
      )}
    >
      <MensajeError texto={error} />

      {anotando && !deAlumnos && (
        <div className="-mx-4 mt-2">{anotarTurno(() => setAnotando(false))}</div>
      )}

      {fallo ? (
        <div className="py-8 text-center">
          <p className="text-[14px] font-semibold text-tinta/70">{a.noSeCargoDia}</p>
          <button type="button" className="boton-suave mt-3 px-4 py-2 text-[13px]" onClick={() => setIntento((n) => n + 1)}>
            {t.comun.reintentar}
          </button>
        </div>
      ) : turnos === null ? (
        <div className="-mx-5"><EsqueletoDia /></div>
      ) : turnos.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[15px] font-bold">{deAlumnos ? a.sinTurnosDeAlumnos : a.sinTurnos}</p>
          <p className="mx-auto mt-1 max-w-xs text-[13.5px] leading-relaxed text-tinta/55">
            {info.estado === 'cerrado'
              ? (info.motivo ? `${a.estadoCalendario.cerrado} · ${info.motivo}` : a.estadoCalendario.cerrado)
              : a.sinNadaEseDia}
          </p>
        </div>
      ) : (
        <ul className="-mx-5 divide-y divide-borde border-y border-borde [&>li]:px-5">
          {turnos.map((r) => fila(r, fecha, datos?.rutinas ?? {}))}
        </ul>
      )}
    </Hoja>
  );
}

/**
 * Cobrar un turno atendido (117): cómo pagó y, con dos bancos, a cuál entró.
 * El precio es el del servicio para ese profesional (el propio, o el del
 * catálogo), el mismo que va a cobrar la base: se pide para mostrarlo en el
 * botón antes de confirmar. Si no llega, el botón dice «Atendido, cobrar».
 *
 * Si el profesional alquila la silla (01/10), la plata es de él y no entra
 * al local: la base no crea ninguna venta y la cuenta elegida se ignoraba
 * sin avisar. Ahí no se pregunta cómo pagó ni a qué cuenta (como en Reparto):
 * se dice que no entra a la caja y el botón queda en «Atendido», sin monto.
 */
function CobrarTurno({
  turno, empresaId, cuentas, plata, ocupado, alquila = false, alCancelar, alCobrar,
}: {
  turno: TurnoDelDia;
  empresaId: string;
  cuentas: CuentaParaElegir[];
  plata: (n: number) => string;
  ocupado: boolean;
  alquila?: boolean;
  alCancelar: () => void;
  /** Con alquiler de silla llega sin forma de pago ni cuenta (null, null). */
  alCobrar: (metodo: string | null, cuenta: string | null) => void;
}) {
  const t = useTextos();
  const [metodo, setMetodo] = useState('efectivo');
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [precio, setPrecio] = useState<number | null>(null);

  useEffect(() => {
    if (alquila) return;
    let vivo = true;
    (async () => {
      try {
        const { data } = await clienteNavegador().rpc('precio_de_servicio', {
          p_profesional: turno.profesional_id, p_producto: turno.producto_id,
        });
        const n = Number(data);
        if (vivo && Number.isFinite(n) && n > 0) setPrecio(n);
      } catch { /* sin el número, el botón lo dice sin monto */ }
    })();
    return () => { vivo = false; };
  }, [empresaId, turno.profesional_id, turno.producto_id, alquila]);

  return (
    <div className="mt-2 space-y-3 rounded-xl bg-arena/60 p-3 aparecer">
      {alquila ? (
        <p className="text-[13px] font-medium leading-snug text-ambar">{t.reparto.noEntraALaCaja}</p>
      ) : (
        <FormaDeCobro
          conPregunta cuentas={cuentas} metodo={metodo} elegida={cuenta} deshabilitado={ocupado}
          alElegirMetodo={(m) => { setMetodo(m); setCuenta(null); }}
          alElegirCuenta={setCuenta}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button" disabled={ocupado} className="boton-principal px-4 py-2.5 text-[13.5px]"
          onClick={() => (alquila ? alCobrar(null, null) : alCobrar(metodo, cuentaDelCobro(cuentas, metodo, cuenta)))}
        >
          {ocupado ? t.comun.guardando
            : alquila ? t.agenda.marcarAtendido
            : precio ? t.cobro.confirmar(plata(precio)) : t.agenda.atender}
        </button>
        <button type="button" onClick={alCancelar} disabled={ocupado} className="boton-suave px-4 py-2.5 text-[13px]">
          {t.comun.cancelar}
        </button>
      </div>
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
  abiertoDeEntrada = false, sinDictado = false, alCerrar,
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
  /** En la hoja de un día (119): ya abierto, para ese día. */
  abiertoDeEntrada?: boolean;
  /** El turno dictado lo levanta el de la vista Día, no una copia en la hoja. */
  sinDictado?: boolean;
  /** Al cerrar el formulario (cancelar, o después de anotar). */
  alCerrar?: () => void;
}) {
  const t = useTextos();

  // Solo lo que está marcado para reservarse. Si un servicio no se agenda, la
  // base no le calcula huecos y el formulario quedaría mudo sin decir por qué.
  const agendables = catalogo.filter((p) =>
    servicios.some((s) => s.producto_id === p.id && s.reservable));

  const [abierto, setAbierto] = useState(abiertoDeEntrada);
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
    if (sinDictado) return;
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
  }, [sinDictado]);

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
    alCerrar?.();
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
                  type="number" inputMode="numeric" className="campo w-[72px] py-1.5 text-[13px]" min={5} max={480} step={5}
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
  profesionales, horarios, ocupado, alAgregar, alQuitar, unaPersona = false, titulo, detalle, abrirPedido = 0,
}: {
  profesionales: Profesional[];
  horarios: HorarioSemanal[];
  ocupado: boolean;
  /** `prof` llega vacío si el profe todavía no tiene fila de profesional (119). */
  alAgregar: (prof: string, dia: number, desde: string, hasta: string) => void;
  alQuitar: (id: string) => void;
  /** El profe que da sus clases solo (119): su horario, sin nombre ni equipo. */
  unaPersona?: boolean;
  titulo?: string;
  detalle?: string;
  /**
   * Sube con cada «Cargar horario» del calendario (119): el formulario se
   * abre solo, sin tener que encontrar «Agregar franja». Con un equipo de
   * varios no se abre ninguno: no se sabe de quién es el horario.
   */
  abrirPedido?: number;
}) {
  const t = useTextos();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [dia, setDia] = useState(1);
  const [desde, setDesde] = useState('08:00');
  const [hasta, setHasta] = useState('12:00');
  const unico = unaPersona ? (profesionales[0]?.id || 'yo') : profesionales.length === 1 ? profesionales[0].id : null;
  useEffect(() => {
    if (abrirPedido > 0 && unico) setAbierto(unico);
  }, [abrirPedido]); // eslint-disable-line react-hooks/exhaustive-deps

  const formulario = (prof: string) => (
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
        onClick={() => { alAgregar(prof, dia, desde, hasta); setAbierto(null); }}
      >
        {t.comun.guardar}
      </button>
    </div>
  );

  // EL HORARIO DE UN PROFE (119): opcional, y solo para el calendario.
  if (unaPersona) {
    const yo = profesionales[0]?.id ?? '';
    const suyos = horarios.filter((h) => h.activo && (yo === '' || h.profesional_id === yo));
    const marca = yo || 'yo';
    return (
      <Seccion
        titulo={titulo ?? t.agenda.horarios}
        accion={(
          <button type="button" className="boton-texto text-[12.5px]" disabled={ocupado}
            onClick={() => setAbierto(abierto === marca ? null : marca)}>
            {abierto === marca ? t.comun.cancelar : t.agenda.agregarFranja}
          </button>
        )}
      >
        <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">{detalle ?? t.agenda.horariosDetalle}</p>
        <div className="border-t border-borde px-4 py-3">
          {suyos.length === 0 ? (
            <p className="text-[12.5px] text-tinta/45">{t.agenda.sinHorarioProfe}</p>
          ) : (
            <ul className="space-y-1">
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
          {abierto === marca && formulario(yo)}
        </div>
      </Seccion>
    );
  }

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
    <Seccion titulo={titulo ?? t.agenda.horarios}>
      <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">{detalle ?? t.agenda.horariosDetalle}</p>
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

              {abierto === p.id && formulario(p.id)}
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
  unaPersona = false, titulo, detalle, aviso,
}: {
  excepciones: Excepcion[];
  profesionales: Profesional[];
  esAdmin: boolean;
  hoy: string;
  ocupado: boolean;
  /** El profe que da sus clases solo (119): sus días, sin elegir quién. */
  unaPersona?: boolean;
  titulo?: string;
  detalle?: string;
  aviso?: string;
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
      titulo={titulo ?? t.agenda.diasEspeciales}
      accion={
        <button type="button" className="boton-texto text-[12.5px]" disabled={ocupado}
          onClick={() => setAbierto((v) => !v)}>
          {abierto ? t.comun.cancelar : t.agenda.agregarDiaEspecial}
        </button>
      }
    >
      <p className="px-4 pb-3 text-[12.5px] leading-relaxed text-tinta/50">
        {detalle ?? t.agenda.diasEspecialesDetalle}
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

          <div className={`grid gap-3 ${unaPersona ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {/* El profe que da sus clases solo no elige quién: son sus días (119). */}
            {!unaPersona && (
              <div>
                <label className="etiqueta" htmlFor="esp-quien">{t.agenda.quienCierra}</label>
                <select id="esp-quien" className="campo" value={quien} disabled={ocupado}
                  onChange={(e) => setQuien(e.target.value)}>
                  {esAdmin && <option value="">{t.agenda.todoElLocal}</option>}
                  {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            )}
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
            {aviso ?? t.agenda.avisoTurnosYaTomados}
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
                  {!unaPersona && <>{nombreDe(g.excepcion.profesional_id)}{' · '}</>}
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

