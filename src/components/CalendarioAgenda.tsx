'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { diffDias, finDeMes, inicioDeSemana, sumarDias } from '@/lib/fechas';
import {
  cantidadDelDia, describirDia, fueraDelDia, resumirCalendario, tieneHorario,
  type DiaCalendario, type EstadoDia,
} from '@/lib/calendario-agenda';
import { useLocale, useTextos } from '@/i18n/cliente';

export type VistaAgenda = 'dia' | 'semana' | 'mes' | 'rango';

/**
 * LA AGENDA COMO CALENDARIO (072), QUE SE ENTIENDE DE UN VISTAZO (119).
 *
 * Del cuaderno de Matías: «añadir calendario para ver la agenda, como una
 * opción para ver: una semana, un mes o el rango que quieran, si tienen
 * disponible o no». Y el 01/10: «quiero ver el mes y decir: acá tengo casi
 * lleno, acá tengo libre».
 *
 * CÓMO SE PINTA CADA DÍA (todo el cuadrito, fondo y borde)
 *
 *   · Con horario cargado: verde libre, ámbar casi lleno, rojo lleno, y
 *     «Cerrado» (punteado, apagado) solo el feriado, las vacaciones o el día
 *     que no trabaja. Antes el único color fuerte era una rayita de 4 px y,
 *     en oscuro, «libre» era el mismo gris de la tarjeta.
 *   · Sin horario: «Cerrado» solo un feriado o unas vacaciones. No hay con
 *     qué medir el lugar, así que el verde sube con la cantidad (más clases,
 *     más verde), sin «Libre» ni «Lleno», y abajo se ofrece cargar el horario.
 *
 * Lo que cae fuera del horario de su profesional no cuenta en el lugar
 * (una clase a la mañana no llena la tarde): la casilla lo marca con un
 * punto ámbar.
 *
 * Cada día dice cuántos tiene, también los que ya pasaron (más apagados,
 * pero legibles). Tocar un día abre la lista de ese día ahí mismo
 * (PantallaAgenda, la hoja del día): mirar el calendario no saca de él.
 *
 * Los números los calcula la base con la misma regla de horarios que ofrece
 * los huecos (feriados, días especiales, cada profesional): un calendario que
 * diga «libre» un feriado sería peor que no tener calendario.
 */
export function CalendarioAgenda({
  empresaId, vista, dia, hoy, elegido, deAlumnos = false, version = 0, conHorarioInicial, alElegirDia, alActualizarElegido,
  alCargarHorario,
}: {
  empresaId: string;
  vista: Exclude<VistaAgenda, 'dia'>;
  /** El día de referencia: la semana o el mes que lo contiene. */
  dia: string;
  hoy: string;
  /** El día que se está mirando (la hoja abierta), resaltado. */
  elegido?: string | null;
  /** La agenda de un profe o un trainer: cuenta clases (o sesiones), no turnos. */
  deAlumnos?: boolean;
  /** Sube con cada cambio en la agenda (anotar, mover, marcar): se vuelve a pedir. */
  version?: number;
  /**
   * Si la cuenta tiene horario, según lo que ya trajo el servidor (los
   * horarios de la pantalla): la primera vez se dibuja la leyenda que va, sin
   * esperar al calendario. Lo que diga la base después manda.
   */
  conHorarioInicial?: boolean;
  alElegirDia: (fecha: string, info: DiaCalendario, conHorario: boolean) => void;
  /**
   * Lo nuevo del día elegido, cada vez que llega el calendario (después de
   * anotar, mover o cancelar): la hoja abierta dice lo mismo que el día de
   * atrás, y no el estado de cuando se tocó.
   */
  alActualizarElegido?: (info: DiaCalendario, conHorario: boolean) => void;
  /** Lleva a donde se carga el horario. Sin esto, no se ofrece. */
  alCargarHorario?: () => void;
}) {
  const t = useTextos();
  const a = t.agenda;
  const locale = useLocale();
  const palabra = deAlumnos ? a.palabraClase : a.palabraTurno;
  // «sesiones» u «horários» no entran en la casilla de un celular: ahí va el
  // número solo, en todos los días por igual (la frase entera, en el aria-label).
  const palabraLarga = palabra(2).length > 6;

  // Dónde está parado: se mueve con las flechas sin cambiar el día elegido.
  const [ancla, setAncla] = useState(dia);
  const [rangoDesde, setRangoDesde] = useState(dia);
  const [rangoHasta, setRangoHasta] = useState(sumarDias(dia, 13));
  // Lo traído, con el rango al que pertenece: al volver a pedir el mismo rango
  // (después de anotar o mover) se sigue viendo lo de antes, sin parpadeo.
  const [datos, setDatos] = useState<{ clave: string; dias: DiaCalendario[] } | null>(null);
  // Si la cuenta tiene horario, según lo último que llegó. Mientras se pide
  // otro período manda esto: sin él, un profe sin horario veía un instante la
  // leyenda «Libre · Casi lleno · Lleno · Cerrado» y todo saltaba al llegar.
  const [conHorarioVisto, setConHorarioVisto] = useState<boolean | null>(conHorarioInicial ?? null);
  const [error, setError] = useState('');

  useEffect(() => { setAncla(dia); }, [dia, vista]);

  // El rango que se pide y el que se dibuja. El mes se completa hasta el
  // lunes anterior y el domingo siguiente: una grilla con huecos al principio
  // hace pensar que esos días no existen.
  const { desde, hasta, titulo } = useMemo(() => {
    if (vista === 'semana') {
      const lunes = inicioDeSemana(ancla);
      const domingo = sumarDias(lunes, 6);
      return { desde: lunes, hasta: domingo, titulo: `${corta(lunes, locale)} – ${corta(domingo, locale)}` };
    }
    if (vista === 'mes') {
      const primero = `${ancla.slice(0, 7)}-01`;
      const ultimo = finDeMes(ancla);
      const nombre = new Date(`${primero}T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return {
        desde: inicioDeSemana(primero),
        hasta: sumarDias(inicioDeSemana(ultimo), 6),
        titulo: nombre.charAt(0).toUpperCase() + nombre.slice(1),
      };
    }
    return { desde: rangoDesde, hasta: rangoHasta, titulo: `${corta(rangoDesde, locale)} – ${corta(rangoHasta, locale)}` };
  }, [vista, ancla, rangoDesde, rangoHasta, locale]);

  const rangoValido = diffDias(desde, hasta) >= 0 && diffDias(desde, hasta) <= 92;
  const clave = `${empresaId}|${desde}|${hasta}`;

  useEffect(() => {
    if (!rangoValido) { setDatos({ clave, dias: [] }); setError(a.rangoLargo); return; }
    let vivo = true;
    setError('');
    clienteNavegador()
      .rpc('agenda_calendario', { p_empresa: empresaId, p_desde: desde, p_hasta: hasta })
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) { setError(mensajeDeError(e, t.errores.generico)); setDatos({ clave, dias: [] }); return; }
        const lista = Array.isArray(data) ? (data as DiaCalendario[]) : [];
        setDatos({ clave, dias: lista });
        if (lista.length > 0) setConHorarioVisto(tieneHorario(lista));
      });
    return () => { vivo = false; };
  }, [empresaId, desde, hasta, clave, rangoValido, version, a.rangoLargo, t.errores.generico]);

  // Solo lo del rango que se está mirando: el de otro rango, mientras llega
  // el nuevo, es el esqueleto.
  const dias = datos && datos.clave === clave ? datos.dias : null;

  // La hoja del día elegido se entera de lo nuevo de ese día (sin volver a
  // avisar si no cambió nada: `dias` es el mismo hasta que llega otro pedido).
  const avisar = useRef(alActualizarElegido);
  useEffect(() => { avisar.current = alActualizarElegido; });
  useEffect(() => {
    if (!elegido || !dias || dias.length === 0) return;
    const d = dias.find((x) => x.fecha === elegido);
    if (d) avisar.current?.(d, tieneHorario(dias));
  }, [dias, elegido]);

  const mover = (paso: number) => {
    if (vista === 'semana') setAncla(sumarDias(ancla, paso * 7));
    if (vista === 'mes') {
      const [anio, mes] = ancla.split('-').map(Number);
      const d = new Date(Date.UTC(anio, mes - 1 + paso, 1));
      setAncla(d.toISOString().slice(0, 10));
    }
  };

  // Lunes a domingo con tres letras: «LUN MAR MIÉ…» o «SEG TER QUA…». Con una
  // sola letra se repetían «M M» y «S S», y no se sabía cuál era cuál.
  const cabecera = useMemo(() => Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })
      .replace('.', '').slice(0, 3)), [locale]);

  const mesDeAncla = ancla.slice(0, 7);
  const semana = vista === 'semana';
  const flecha = 'rounded-lg border border-borde px-2.5 py-1 text-[15px] font-bold leading-none text-tinta/50 transition hover:border-verde/40 hover:text-verde-fuerte';

  // Con lo que llegó de este período; mientras llega, lo último que se supo
  // (o lo que dijo el servidor). null: todavía no se sabe, y no se dibuja
  // ninguna leyenda.
  const conHorario: boolean | null = dias && dias.length > 0 ? tieneHorario(dias) : conHorarioVisto;
  const medido = conHorario === true;
  const r = resumirCalendario(dias ?? [], { vista, desde, hasta, ancla, hoy, deAlumnos });
  const cantidadTotal = `${r.total} ${palabra(r.total)}`;
  const nombreMes = new Date(`${mesDeAncla}-01T12:00:00Z`).toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' });
  const resumen = !medido
    ? a.resumenSinHorario(cantidadTotal, r.alcance, nombreMes)
    : r.yaPaso ? cantidadTotal : a.resumenCalendario(cantidadTotal, r.conLugar);

  const hayFuera = medido && (dias ?? []).some((d) => d.estado === 'sin_horario' || fueraDelDia(d, true) > 0);
  const hayCerrado = (dias ?? []).some((d) => d.estado === 'cerrado');

  // «Elegir fechas» puede empezar un miércoles: la grilla deja vacíos los
  // días de antes, para que cada uno caiga debajo de su nombre.
  const vaciosAntes = vista === 'rango' ? (new Date(`${desde}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const cuantosEsqueleto = vista === 'semana' ? 7 : rangoValido ? Math.min(diffDias(desde, hasta) + 1, 42) : 7;

  return (
    <div className="px-4 pb-4">
      {vista === 'rango' ? (
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="etiqueta">{a.desde}</span>
            <input type="date" className="campo mt-1 py-2" value={rangoDesde}
              onChange={(e) => e.target.value && setRangoDesde(e.target.value)} />
          </label>
          <label className="block">
            <span className="etiqueta">{a.hasta}</span>
            <input type="date" className="campo mt-1 py-2" value={rangoHasta} min={rangoDesde}
              onChange={(e) => e.target.value && setRangoHasta(e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={flecha} aria-label={a.anterior} onClick={() => mover(-1)}>‹</button>
          <p className="text-[15px] font-bold tracking-tight">{titulo}</p>
          <button type="button" className={flecha} aria-label={a.siguiente} onClick={() => mover(1)}>›</button>
        </div>
      )}

      {dias === null ? (
        // Mientras llega, una línea gris del mismo alto: la grilla no salta.
        <p aria-hidden className="mt-2 flex justify-center text-[13px] font-semibold">
          <span className="w-36 animate-pulse rounded-md bg-tinta/[0.06]">&nbsp;</span>
        </p>
      ) : dias.length > 0 && (
        <p className="mt-2 text-center text-[13px] font-semibold text-tinta/65">{resumen}</p>
      )}

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {cabecera.map((c, i) => (
          <span key={i} className="pb-1 text-center text-[10.5px] font-bold uppercase tracking-wide text-tinta/45">{c}</span>
        ))}

        {Array.from({ length: dias === null ? 0 : vaciosAntes }, (_, i) => <span key={`v${i}`} aria-hidden />)}

        {dias === null
          ? Array.from({ length: cuantosEsqueleto }, (_, i) => (
            <span key={i} className={`${semana ? 'min-h-[88px]' : 'aspect-square sm:aspect-auto sm:h-16'} animate-pulse rounded-xl bg-tinta/[0.06]`} />
          ))
          : dias.map((d) => {
            const n = cantidadDelDia(d, deAlumnos);
            const pasado = d.fecha < hoy;
            const fueraDelMes = vista === 'mes' && d.fecha.slice(0, 7) !== mesDeAncla;
            const fueraDeHorario = medido && d.estado === 'sin_horario';
            // Un día que sí se mide, con algo fuera del horario: su color y el punto.
            const conAlgoFuera = fueraDelDia(d, medido) > 0;
            const cerrado = d.estado === 'cerrado';
            const aspecto = cerrado ? COLOR.cerrado
              : !medido ? escalaPorCantidad(n)
              : fueraDeHorario ? NEUTRO
              : COLOR[d.estado as Exclude<EstadoDia, 'sin_horario' | 'cerrado'>];
            const textoEstado = cerrado ? a.estadoCalendario.cerrado
              : fueraDeHorario ? a.fueraDeHorario
              : medido ? a.estadoCalendario[d.estado] : '';
            return (
              <button
                key={d.fecha}
                type="button"
                onClick={() => alElegirDia(d.fecha, d, medido)}
                aria-label={`${larga(d.fecha, locale)} · ${describirDia(d, deAlumnos, medido, a)}`}
                className={`relative flex flex-col items-center justify-between rounded-xl border px-0.5 pb-1.5 pt-1 transition active:scale-95 ${
                  // El mes en el celular, en cuadritos; en la compu, más bajos
                  // (un cuadrado de 100 px dejaba el mes y la leyenda fuera de
                  // la pantalla) y con la palabra y el estado, como la semana.
                  semana ? 'min-h-[88px]' : 'aspect-square min-h-[40px] sm:aspect-auto sm:h-16'
                } ${aspecto} ${
                  elegido === d.fecha ? 'ring-2 ring-tinta/40 ring-offset-1 ring-offset-superficie' : ''
                } ${fueraDelMes ? 'opacity-40' : pasado ? 'opacity-70' : ''}`}
              >
                {/* En el mes del celular, el número del día va más chico y
                    más suave que la cantidad: dos números iguales, uno arriba
                    del otro («12 / 2»), no se sabía cuál era cuál. */}
                <span className={`leading-tight tabular-nums ${
                  semana ? 'text-[12.5px] font-bold' : 'text-[11px] font-semibold sm:text-[12.5px] sm:font-bold'
                } ${
                  d.fecha === hoy ? 'rounded-full bg-verde px-1.5 text-sobre-verde'
                    : cerrado ? 'text-tinta/55'
                    : semana ? 'text-tinta/80' : 'text-tinta/70 sm:text-tinta/80'
                }`}>
                  {Number(d.fecha.slice(8, 10))}
                </span>

                {/* La cantidad, grande, también en los días que ya pasaron. Va
                    con su palabra si entra en la casilla («clases» sí,
                    «sesiones» solo en pantallas anchas; en el mes, solo en la
                    compu); la frase entera va en el aria-label del botón. */}
                <span className={`flex items-center leading-none ${semana ? 'flex-col' : 'flex-col sm:flex-row sm:items-baseline sm:gap-1'}`}>
                  {n > 0 ? (
                    <span className={`font-bold tabular-nums ${semana ? 'text-[17px]' : 'text-[15px] sm:text-[16px]'} ${cerrado ? 'text-tinta/55' : 'text-tinta'}`}>
                      {n}
                    </span>
                  ) : cerrado ? (
                    <span className="text-[12px] text-tinta/40">—</span>
                  ) : null}
                  {n > 0 && (
                    <span className={`text-[9.5px] font-semibold text-tinta/60 ${
                      semana ? `mt-0.5 ${palabraLarga ? 'hidden sm:block' : ''}` : 'hidden sm:inline sm:text-[10px]'
                    }`}>
                      {palabra(n)}
                    </span>
                  )}
                </span>

                <span className="hidden text-[10px] font-semibold leading-none text-tinta/55 sm:block">{textoEstado}</span>
                {/* En el mes del celular, la cantidad queda al medio. */}
                {!semana && <span aria-hidden className="sm:hidden" />}

                {(fueraDeHorario || conAlgoFuera) && (
                  <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ambar" />
                )}
              </button>
            );
          })}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-rojo-claro px-3 py-2 text-[12.5px] font-medium text-rojo">{error}</p>
      )}

      {/* LA LEYENDA, con el mismo cuadrito que cada día. Si todavía no se
          sabe si hay horario (sin conHorarioInicial, la primera vez), solo su
          lugar: ninguna leyenda que después cambie por otra. */}
      {conHorario === null ? (
        <div aria-hidden className="mt-3 text-[11.5px] font-medium">&nbsp;</div>
      ) : conHorario ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 text-[11.5px] font-medium text-tinta/65">
          {(['libre', 'casi', 'lleno', 'cerrado'] as const).map((e) => (
            <span key={e} className="flex items-center gap-1.5">
              <span aria-hidden className={`h-3.5 w-3.5 rounded-[5px] border ${COLOR[e]}`} />
              {a.estadoCalendario[e]}
            </span>
          ))}
          {hayFuera && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className={`relative h-3.5 w-3.5 rounded-[5px] border ${NEUTRO}`}>
                <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-ambar" />
              </span>
              {a.fueraDeHorario}
            </span>
          )}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 text-[11.5px] font-medium text-tinta/65">
            <span className="flex items-center gap-1.5">
              {a.escalaMenos}
              {[0, 1, 2, 4].map((k) => (
                <span key={k} aria-hidden className={`h-3.5 w-3.5 rounded-[5px] border ${escalaPorCantidad(k)}`} />
              ))}
              {a.escalaMas(palabra(2))}
            </span>
            {hayCerrado && (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className={`h-3.5 w-3.5 rounded-[5px] border ${COLOR.cerrado}`} />
                {a.estadoCalendario.cerrado}
              </span>
            )}
          </div>
          {alCargarHorario && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-verde/30 bg-verde/[0.07] px-3 py-2.5">
              <p className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-tinta/75">{a.cargaTuHorario}</p>
              <button type="button" onClick={alCargarHorario} className="boton-suave shrink-0 px-3 py-1.5 text-[12.5px]">
                {a.cargarHorario}
              </button>
            </div>
          )}
        </>
      )}
      <p className="mt-2 text-center text-[12px] text-tinta/50">{deAlumnos ? a.tocaUnDiaProfe : a.tocaUnDia}</p>
    </div>
  );
}

/**
 * Los tonos de cada estado, solo con los colores del tema (globals.css): se
 * ven en claro y en oscuro sin una clase `dark:`. Fondo suave y borde más
 * firme, para que el día entero diga cómo está.
 */
const COLOR: Record<'libre' | 'casi' | 'lleno' | 'cerrado', string> = {
  libre: 'bg-verde/15 border-verde/50',
  casi: 'bg-ambar/[0.22] border-ambar/60',
  // Lleno, más intenso que casi: con el mismo tono suave, en oscuro el ámbar
  // y el rojo quedaban dos marrones parecidos (medido en el banco, 01/10).
  lleno: 'bg-rojo/30 border-rojo/70',
  cerrado: 'bg-tinta/[0.04] border-dashed border-tinta/25',
};

/** Un día sin color: sin nada, o con turnos fuera del horario (con un punto ámbar). */
const NEUTRO = 'bg-superficie border-borde';

/** Sin horario: más clases, más verde. Un día vacío queda neutro. */
function escalaPorCantidad(n: number): string {
  if (n <= 0) return NEUTRO;
  if (n === 1) return 'bg-verde/10 border-verde/35';
  if (n <= 3) return 'bg-verde/20 border-verde/50';
  return 'bg-verde/30 border-verde/65';
}

function corta(iso: string, locale: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function larga(iso: string, locale: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** El selector «Día · Semana · Mes · Elegir fechas». */
export function SelectorVista({ vista, alCambiar }: { vista: VistaAgenda; alCambiar: (v: VistaAgenda) => void }) {
  const a = useTextos().agenda;
  const opciones: { valor: VistaAgenda; texto: string }[] = [
    { valor: 'dia', texto: a.vistaDia },
    { valor: 'semana', texto: a.vistaSemana },
    { valor: 'mes', texto: a.vistaMes },
    { valor: 'rango', texto: a.vistaRango },
  ];
  return (
    <div className="mx-4 mb-3 grid grid-cols-4 gap-1 rounded-2xl bg-arena p-1" role="tablist">
      {opciones.map((o) => (
        <button
          key={o.valor} type="button" role="tab" aria-selected={vista === o.valor}
          onClick={() => alCambiar(o.valor)}
          className={`rounded-xl px-1 py-2 text-[12.5px] font-bold transition ${
            vista === o.valor ? 'bg-superficie text-verde-fuerte shadow-tarjeta' : 'text-tinta/50'
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}
