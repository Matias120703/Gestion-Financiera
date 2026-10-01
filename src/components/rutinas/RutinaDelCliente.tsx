'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';
import { rutinaComoTexto } from '@/lib/rutina-texto';
import { clipsDeLaRutina, esCopiaVieja } from '@/lib/rutina-sin-senal';
import type { ClipPublico, RutinaPublica } from '@/lib/tipos-rutinas';
import { TarjetaEjercicio, type EjercicioPublico } from './publico/TarjetaEjercicio';
import { GuardarVideos } from './publico/GuardarVideos';
import { alternarTilde, diaParaAbrir, hoyDelCelular, leerTildes, type Tildes } from './publico/tildes';
import { limpiarRutinaPublica } from './publico/datos';
import { esTokenDeRutina } from './publico/enlace';
import { podarClips } from './publico/clips';
import { borrarCopia, esIphoneEnSafari, pedirGuardado } from './publico/sinSenal';

type ConRutina = Extract<RutinaPublica, { existe: true }>;
type Rutina = NonNullable<ConRutina['rutina']>;
type Dia = Rutina['dias'][number];

/** Lo que lleva una pestaña en segundo plano antes de volver a pedir la rutina. */
const MEDIA_HORA = 30 * 60 * 1000;

/**
 * Con señal, cuánto se espera a que la base conteste antes de avisar que lo
 * que se ve es la copia guardada: así no parpadea el aviso cuando la base
 * contesta enseguida (una copia que el service worker sirvió porque la red
 * tardó, o un celular con la hora corrida).
 */
const ESPERA_AVISO_COPIA_MS = 3000;

/** Lo que queda en el pie sobre la copia de este celular. */
type EstadoCopiaLocal = { guardada: boolean; consejoIphone: boolean; borrada: boolean };

/**
 * LA RUTINA DEL CLIENTE · lo que abre desde WhatsApp (098).
 *
 * Sin cuenta, sin menú y pensado para el gimnasio: un día por pantalla, con
 * pestañas grandes que quedan fijas arriba al bajar, tarjetas que se leen a
 * un brazo de distancia y un «Hecho» por ejercicio que queda solo en su
 * celular (ver publico/tildes.ts).
 *
 * `datos` null quiere decir que el servidor no pudo preguntarle a la base.
 * No es lo mismo que un link inactivo: decirle «pedile uno nuevo a tu
 * entrenador» por un corte de un minuto lo haría escribirle por nada.
 *
 * SIEMPRE AL DÍA
 *
 * El link es «siempre al día» solo si la pestaña se vuelve a pedir: muchos
 * la dejan abierta de una semana a la otra. Al volver a primer plano después
 * de media hora se pide la rutina de nuevo. No con `router.refresh()`: si
 * ese pedido falla —el sótano del gimnasio, sin señal—, Next lo convierte en
 * una navegación entera, el service worker contesta «sin conexión» y el
 * cliente pierde la rutina que tenía en pantalla justo cuando la necesita.
 * Se le pregunta a la base desde acá con la misma función pública (abierta a
 * `anon`, como la usa la página), y si no contesta, queda lo que ya se veía.
 * La respuesta pasa por el mismo filtro que la del servidor (publico/datos.ts).
 *
 * SIN SEÑAL
 *
 * El service worker guarda esta página cada vez que se abre con señal, y la
 * muestra cuando no hay o cuando la red tarda (public/sw.js). La página se
 * da cuenta de que es una copia por `generada`, la hora en que la armó el
 * servidor: si tiene más de 2 minutos, intenta traer la rutina de la base;
 * si no puede, avisa «Sin señal: es tu rutina guardada el dd/mm a las
 * hh:mm», y al volver la señal (`online`) la trae sola. Con la rutina al
 * día le pide al service worker que guarde la página de nuevo.
 *
 * En la primera visita el service worker todavía no controlaba la página:
 * por eso, al abrir con señal, la página le pide que la guarde
 * (publico/sinSenal.ts). Si la base dice que el link ya no anda, se borra
 * la copia de este celular y lo tildado; el alumno también la puede borrar
 * a mano, al pie.
 */
export function RutinaDelCliente({
  token, datos: inicial, generada,
}: {
  token: string;
  datos: RutinaPublica | null;
  /** Cuándo armó el servidor esta página (ISO). En una copia guardada, es viejo. */
  generada: string;
}) {
  const r = useTextos().rutinaPublica;
  const [datos, setDatos] = useState(inicial);
  const [reintentando, setReintentando] = useState(false);
  const ultimaCarga = useRef(Date.now());

  // ¿Lo que se ve es la copia guardada? `enCopia` dibuja el aviso; la ref es
  // la misma verdad para los que escuchan eventos.
  const [enCopia, setEnCopia] = useState(false);
  const enCopiaRef = useRef(false);
  const [copia, setCopia] = useState<EstadoCopiaLocal>({ guardada: false, consejoIphone: false, borrada: false });

  const guardarEnElCelular = useCallback(async (forzarHtml: boolean) => {
    const resultado = await pedirGuardado(token, { forzarHtml, fresca: true });
    if (resultado.ok) setCopia({ guardada: true, consejoIphone: esIphoneEnSafari(), borrada: false });
  }, [token]);

  /**
   * Lo que se hace con una rutina recién traída de la base: si el link ya no
   * anda, borrar la copia y los tildes; si anda, soltar los videos que ya no
   * están en la rutina. Nunca con los datos de una copia.
   */
  const alTraerDeLaBase = useCallback((limpio: RutinaPublica) => {
    if (!limpio.existe) {
      void borrarCopia(token);
      setCopia({ guardada: false, consejoIphone: false, borrada: false });
      return;
    }
    void podarClips(token, clipsDeLaRutina(limpio).map((c) => c.id));
  }, [token]);

  const recargar = useCallback(async (): Promise<boolean> => {
    // Un token que no es un uuid ni se pregunta: la base lo rechazaría, y
    // la pantalla ya dice lo mismo que dice para uno que no existe.
    if (!esTokenDeRutina(token)) return false;
    try {
      const { data, error } = await clienteNavegador().rpc('rutina_por_token', { p_token: token });
      if (error) return false;
      const limpio = limpiarRutinaPublica(data);
      if (!limpio) return false;
      ultimaCarga.current = Date.now();
      setDatos(limpio);
      alTraerDeLaBase(limpio);
      // Ya no es una copia: se ve lo de la base. Y la copia del celular se
      // pone al día (la página que guardó puede ser de antes del cambio).
      enCopiaRef.current = false;
      setEnCopia(false);
      if (limpio.existe) void guardarEnElCelular(true);
      return true;
    } catch {
      return false;
    }
  }, [token, alTraerDeLaBase, guardarEnElCelular]);

  // Al abrir: ¿es una copia? (después de montar: el servidor no lo sabe).
  useEffect(() => {
    let vivo = true;
    if (esCopiaVieja(generada, Date.now())) {
      enCopiaRef.current = true;
      if (navigator.onLine === false) {
        setEnCopia(true);
      } else {
        const aviso = setTimeout(() => { if (vivo && enCopiaRef.current) setEnCopia(true); }, ESPERA_AVISO_COPIA_MS);
        void recargar().then((bien) => {
          clearTimeout(aviso);
          if (vivo && !bien) setEnCopia(true);
        });
      }
    } else if (inicial?.existe) {
      // Recién traída con señal: que quede guardada, y sin videos de más.
      void guardarEnElCelular(false);
      alTraerDeLaBase(inicial);
    } else if (inicial && !inicial.existe) {
      alTraerDeLaBase(inicial);
    }
    return () => { vivo = false; };
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Volvió la señal mientras se veía la copia: se trae la rutina sola.
  useEffect(() => {
    function alVolverLaSenal() {
      if (enCopiaRef.current) void recargar();
    }
    window.addEventListener('online', alVolverLaSenal);
    return () => window.removeEventListener('online', alVolverLaSenal);
  }, [recargar]);

  useEffect(() => {
    function alVolver() {
      if (document.visibilityState !== 'visible') return;
      // Una copia se intenta poner al día cada vez que vuelve a la pestaña.
      if (!enCopiaRef.current && Date.now() - ultimaCarga.current < MEDIA_HORA) return;
      // Sin señal ni se intenta: queda lo que se ve, y se prueba la próxima vez.
      if (navigator.onLine === false) return;
      void recargar();
    }
    document.addEventListener('visibilitychange', alVolver);
    // Safari a veces devuelve la página desde su caché sin avisar que se
    // volvió visible.
    window.addEventListener('pageshow', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('pageshow', alVolver);
    };
  }, [recargar]);

  const clips = useMemo(() => clipsDeLaRutina(datos), [datos]);

  async function borrarDeEsteCelular() {
    await borrarCopia(token);
    setCopia({ guardada: false, consejoIphone: false, borrada: true });
  }

  const aviso = enCopia ? <AvisoCopia generada={generada} /> : null;
  const pie = (
    <PieCopia estado={copia} onBorrar={() => void borrarDeEsteCelular()} />
  );

  if (datos === null) {
    return (
      <Marco>
        <h1 className="text-[20px] font-bold tracking-tight">{r.errorTitulo}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">{r.errorTexto}</p>
        <button
          type="button"
          className="boton-principal mt-5 min-h-[48px] w-full text-[15px]"
          disabled={reintentando}
          onClick={async () => {
            setReintentando(true);
            await recargar();
            setReintentando(false);
          }}
        >
          {reintentando ? r.cargando : r.reintentar}
        </button>
      </Marco>
    );
  }

  // Apagado, cambiado, inexistente, de un cliente archivado o de un negocio
  // que ya no es de entrenamiento: la base contesta lo mismo para todos, y
  // acá se ven igual.
  if (!datos.existe) {
    return (
      <Marco>
        <h1 className="text-[20px] font-bold tracking-tight">{r.inactivoTitulo}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">{r.inactivoTexto}</p>
      </Marco>
    );
  }

  if (datos.renovar) {
    return (
      <Marco arriba={aviso} abajo={pie}>
        <Saludo negocio={datos.negocio} nombre={datos.nombre} />
        <p className="mt-4 text-[16px] leading-relaxed text-tinta/70">{r.renovar}</p>
      </Marco>
    );
  }

  // Una rutina vigente siempre tiene al menos un día (la base lo exige); sin
  // días se trata como que todavía no está lista.
  if (!datos.rutina || datos.rutina.dias.length === 0) {
    return (
      <Marco arriba={aviso} abajo={pie}>
        <Saludo negocio={datos.negocio} nombre={datos.nombre} />
        <p className="mt-4 text-[16px] font-semibold leading-relaxed">{r.preparando}</p>
        <p className="mt-1 text-[15px] leading-relaxed text-tinta/60">{r.preparandoTexto}</p>
      </Marco>
    );
  }

  return (
    <VistaRutina
      token={token}
      negocio={datos.negocio}
      nombre={datos.nombre}
      actualizada={datos.actualizada}
      rutina={datos.rutina}
      clips={clips}
      aviso={aviso}
      pie={pie}
    />
  );
}

// ─────────────────────────── la copia de este celular ───────────────────────────

/**
 * «Sin señal: es tu rutina guardada el 22/09 a las 18:40». La fecha y la
 * hora son las del celular (la copia se armó en el servidor, en UTC); este
 * aviso solo se dibuja después de montar, así que no hay diferencia con la
 * pintada del servidor. Armadas a mano, como `diaMes` más abajo.
 */
function AvisoCopia({ generada }: { generada: string }) {
  const r = useTextos().rutinaPublica;
  const f = new Date(generada);
  if (Number.isNaN(f.getTime())) return null;
  const dos = (n: number) => String(n).padStart(2, '0');
  const fecha = `${dos(f.getDate())}/${dos(f.getMonth() + 1)}`;
  const hora = `${dos(f.getHours())}:${dos(f.getMinutes())}`;
  return (
    <p role="status" className="rounded-2xl bg-ambar-claro px-4 py-3 text-[14.5px] font-semibold leading-snug">
      {r.copiaGuardada(fecha, hora)}
    </p>
  );
}

/**
 * El pie sobre la copia: si quedó guardada (y el consejo del iPhone), y el
 * botón para borrarla de este celular (un celular compartido).
 */
function PieCopia({ estado, onBorrar }: { estado: EstadoCopiaLocal; onBorrar: () => void }) {
  const r = useTextos().rutinaPublica;
  return (
    <div className="space-y-2 text-center">
      {estado.guardada && (
        <p className="text-[13px] font-semibold leading-relaxed text-verde-fuerte">
          <span aria-hidden>✓ </span>
          {r.guardadaEnEsteCelular}
        </p>
      )}
      {estado.guardada && estado.consejoIphone && (
        <p className="text-[13px] leading-relaxed text-tinta/55">{r.consejoIphone}</p>
      )}
      {estado.borrada ? (
        <p role="status" className="text-[13px] font-semibold text-tinta/60">{r.copiaBorrada}</p>
      ) : (
        <button
          type="button"
          onClick={onBorrar}
          className="boton-texto min-h-[44px] text-[13px] text-tinta/55"
        >
          {r.borrarCopia}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────── la rutina ───────────────────────────

function VistaRutina({
  token, negocio, nombre, actualizada, rutina, clips, aviso, pie,
}: {
  token: string;
  negocio: string;
  nombre: string;
  actualizada: string | null;
  rutina: Rutina;
  /** Los videos propios de la rutina, para «Guardar los videos». */
  clips: ClipPublico[];
  /** «Sin señal: es tu rutina guardada…», si lo que se ve es la copia. */
  aviso: React.ReactNode;
  /** Lo de la copia de este celular, al pie. */
  pie: React.ReactNode;
}) {
  const r = useTextos().rutinaPublica;

  const dias = useMemo(
    () => [...rutina.dias]
      .sort((a, b) => a.orden - b.orden)
      .map((d) => ({ ...d, ejercicios: [...d.ejercicios].sort((a, b) => a.orden - b.orden) })),
    [rutina.dias],
  );

  // null hasta leer el celular: el servidor no sabe qué se tildó, y la
  // primera pintada tiene que ser igual a la suya.
  const [tildes, setTildes] = useState<Tildes | null>(null);
  const [elegido, setElegido] = useState(0);
  const actual = Math.min(elegido, dias.length - 1);
  const dia = dias[actual];

  // Al abrir: lo tildado en este celular, y el día que le toca.
  useEffect(() => {
    const leidos = leerTildes(token, hoyDelCelular());
    setTildes(leidos);
    setElegido(diaParaAbrir(dias, leidos));
    // Solo al abrir: si la rutina se vuelve a pedir, el cliente sigue en el
    // día que estaba mirando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Una pestaña que quedó abierta de ayer arranca el día sin tildes.
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState !== 'visible') return;
      const hoy = hoyDelCelular();
      setTildes((antes) => (antes && antes.fecha !== hoy ? leerTildes(token, hoy) : antes));
    }
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [token]);

  function alternar(e: EjercicioPublico) {
    const hoy = hoyDelCelular();
    const base = tildes ?? leerTildes(token, hoy);
    setTildes(alternarTilde(token, base, e.id, dia.orden, hoy));
  }

  const hechos = useMemo(() => new Set(tildes?.hechos ?? []), [tildes]);
  const completo = (d: Dia) => d.ejercicios.length > 0 && d.ejercicios.every((e) => hechos.has(e.id));
  const hechosDelDia = dia.ejercicios.filter((e) => hechos.has(e.id)).length;

  // Al cambiar de día, si ya bajó, se vuelve al principio del día (las
  // pestañas quedan fijas arriba) y la pestaña elegida se centra en la tira.
  const ancla = useRef<HTMLDivElement>(null);
  const tira = useRef<HTMLDivElement>(null);
  function elegir(i: number) {
    setElegido(i);
    const a = ancla.current;
    if (!a) return;
    const y = a.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > y) window.scrollTo({ top: y });
  }
  useEffect(() => {
    const cont = tira.current;
    const boton = cont?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!cont || !boton) return;
    cont.scrollTo({ left: boton.offsetLeft - (cont.clientWidth - boton.offsetWidth) / 2, behavior: 'smooth' });
  }, [actual]);

  // Las fechas: «desde» es un día (sin hora) y se lee igual en todos lados;
  // «actualizada» es un momento, y el día depende de la zona. El servidor
  // no sabe la del celular: pinta en UTC y, ya en el celular, se corrige a
  // la local (si no, a la noche podía decir el día siguiente).
  //
  // «15/09» armado a mano y no con Intl: los dos idiomas ponen el día
  // primero, e Intl con es-PY escribe «15/9» en Chrome aunque se le pida el
  // mes con dos cifras.
  const [enElCelular, setEnElCelular] = useState(false);
  useEffect(() => setEnElCelular(true), []);
  const diaMes = (iso: string, utc: boolean) => {
    const f = new Date(iso);
    if (Number.isNaN(f.getTime())) return '';
    const d = utc ? f.getUTCDate() : f.getDate();
    const m = (utc ? f.getUTCMonth() : f.getMonth()) + 1;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  };
  const desde = rutina.desde ? diaMes(rutina.desde, true) : '';
  const cambio = actualizada ? diaMes(actualizada, !enElCelular) : '';
  // Si se armó y se actualizó el mismo día, decirlo dos veces es ruido.
  const fechas = r.fechas(desde || null, cambio && cambio !== desde ? cambio : null);

  return (
    <div className="min-h-screen bg-arena">
      <main className="zona-segura-abajo mx-auto max-w-md px-4 pb-16">
        <header className="zona-segura-arriba">
          {aviso && <div className="pt-4">{aviso}</div>}
          <div className={aviso ? 'pt-5' : 'pt-8'}>
            <p className="break-words text-[12px] font-bold uppercase tracking-wider text-tinta/45">{negocio}</p>
            <h1 className="mt-1 break-words font-titulo text-[28px] font-extrabold leading-tight tracking-tight">
              {r.hola(nombre)}
            </h1>
            <p className="mt-3 break-words text-[18px] font-bold leading-snug">{rutina.nombre}</p>
            {fechas && <p className="mt-1 text-[13.5px] text-tinta/55">{fechas}</p>}
          </div>
        </header>

        {rutina.notas.trim() && (
          <section className="tarjeta mt-5 p-4">
            <h2 className="text-[13px] font-semibold text-tinta/55">{r.indicaciones}</h2>
            <p className="mt-1.5 whitespace-pre-line break-words text-[16px] leading-relaxed">{rutina.notas}</p>
          </section>
        )}

        <GuardarVideos token={token} clips={clips} />

        <div ref={ancla} className="mt-5" />
        {dias.length > 1 && (
          <nav className="zona-segura-arriba sticky top-0 z-30 -mx-4 border-b border-borde/70 bg-arena/95 px-4 backdrop-blur">
            <div
              ref={tira}
              role="tablist"
              aria-label={r.diasDeLaRutina}
              className="scroll-limpio relative flex gap-2 overflow-x-auto py-2.5"
            >
              {dias.map((d, i) => (
                <button
                  key={d.orden}
                  type="button"
                  role="tab"
                  id={`dia-${d.orden}`}
                  aria-selected={i === actual}
                  aria-controls="dia-elegido"
                  onClick={() => elegir(i)}
                  className={`${i === actual ? 'chip-encendido' : 'chip-apagado'} min-h-[48px] max-w-[75vw] gap-1.5 text-[15px]`}
                >
                  <span className="truncate">{d.nombre}</span>
                  {completo(d) && <span aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          </nav>
        )}

        <section
          id="dia-elegido"
          key={dia.orden}
          role={dias.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={dias.length > 1 ? `dia-${dia.orden}` : undefined}
          className="aparecer pt-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="min-w-0 break-words font-titulo text-[22px] font-extrabold tracking-tight">{dia.nombre}</h2>
            {hechosDelDia > 0 && (
              <p className="text-[14px] font-semibold tabular-nums text-verde-fuerte">
                {r.hechosHoy(hechosDelDia, dia.ejercicios.length)}
              </p>
            )}
          </div>

          {dia.notas.trim() && (
            <div className="mt-3 rounded-2xl border border-borde bg-superficie p-4">
              <p className="text-[13px] font-semibold text-tinta/55">{r.paraEsteDia}</p>
              <p className="mt-1 whitespace-pre-line break-words text-[16px] leading-relaxed">{dia.notas}</p>
            </div>
          )}

          {/* Un día sin ejercicios pero con su nota («Martes – MMA: Técnica /
              sparring», de la semana tipo de una planilla) es así a propósito:
              la nota alcanza, sin «todavía no tiene ejercicios». */}
          {dia.ejercicios.length === 0 ? (
            !dia.notas.trim() && <p className="mt-4 text-[15px] text-tinta/55">{r.sinEjercicios}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {agrupar(dia.ejercicios).map((g) =>
                g.length === 1 ? (
                  <TarjetaEjercicio
                    key={g[0].ejercicio.id}
                    token={token}
                    ejercicio={g[0].ejercicio}
                    etiqueta={g[0].etiqueta}
                    hecho={hechos.has(g[0].ejercicio.id)}
                    alAlternar={() => alternar(g[0].ejercicio)}
                  />
                ) : (
                  // La superserie: una línea al costado que los agrupa y la
                  // indicación arriba, para que no descanse entre uno y otro.
                  <div key={g[0].ejercicio.id} className="relative pl-4">
                    <span aria-hidden className="absolute bottom-2 left-0 top-2 w-1 rounded-full bg-verde" />
                    <p className="mb-2 text-[14px] font-bold text-verde-fuerte">{r.hacelosSeguidos}</p>
                    <div className="space-y-3">
                      {g.map(({ ejercicio, etiqueta }) => (
                        <TarjetaEjercicio
                          key={ejercicio.id}
                          token={token}
                          ejercicio={ejercicio}
                          etiqueta={etiqueta}
                          hecho={hechos.has(ejercicio.id)}
                          alAlternar={() => alternar(ejercicio)}
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

          {completo(dia) && (
            <p className="mt-4 rounded-2xl bg-verde-claro px-4 py-3 text-center text-[15px] font-semibold text-verde-fuerte">
              {r.listoPorHoy}
            </p>
          )}
        </section>

        <div className="mt-8 space-y-3">
          <CopiarComoTexto rutina={rutina} />
          <p className="text-center text-[13px] leading-relaxed text-tinta/50">{r.tildesSoloAca}</p>
          <p className="text-center text-[13px] leading-relaxed text-tinta/50">{r.siempreAlDia}</p>
          {pie}
        </div>

        <p className="mt-10 text-center text-[11.5px] text-tinta/35">{r.pie}</p>
      </main>
    </div>
  );
}

/**
 * Los ejercicios de un día en grupos: uno suelto, o una superserie (los que
 * van «junto al anterior»). La numeración es la del texto para WhatsApp
 * (`rutinaComoTexto`): «1», «2a», «2b», «3».
 */
function agrupar(ejercicios: EjercicioPublico[]): { ejercicio: EjercicioPublico; etiqueta: string }[][] {
  const grupos: EjercicioPublico[][] = [];
  for (const e of ejercicios) {
    const ultimo = grupos[grupos.length - 1];
    if (e.junto && ultimo) ultimo.push(e);
    else grupos.push([e]);
  }
  return grupos.map((g, n) => g.map((ejercicio, k) => ({
    ejercicio,
    etiqueta: g.length > 1 ? `${n + 1}${String.fromCharCode(97 + Math.min(k, 25))}` : `${n + 1}`,
  })));
}

// ─────────────────────────── copiar como texto ───────────────────────────

/**
 * Para el cliente que prefiere tenerla en sus notas o reenviársela. Es el
 * mismo texto que arma el trainer para WhatsApp. Va por el portapapeles; si
 * el navegador de la app no lo deja (pasa en algunos navegadores internos),
 * se muestra el texto para copiarlo a mano.
 */
function CopiarComoTexto({ rutina }: { rutina: Rutina }) {
  const t = useTextos();
  const r = t.rutinaPublica;
  const c = t.rutinasComun;
  const [copiado, setCopiado] = useState(false);
  const [aMano, setAMano] = useState<string | null>(null);

  async function copiar() {
    const texto = rutinaComoTexto(rutina, c.texto);
    let listo = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
        listo = true;
      }
    } catch {
      listo = false;
    }
    if (!listo) listo = copiarALaAntigua(texto);
    if (listo) {
      setAMano(null);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } else {
      setAMano(texto);
    }
  }

  return (
    <div>
      <button type="button" onClick={copiar} className="boton-suave min-h-[48px] w-full text-[15px]">
        {copiado ? `✓ ${c.acciones.copiado}` : c.acciones.copiarTexto}
      </button>
      {aMano !== null && (
        <div className="mt-3">
          <p className="text-[13.5px] text-tinta/60">{r.noSePudoCopiar}</p>
          <textarea readOnly value={aMano} rows={10} className="campo mt-2 font-mono" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  );
}

/** El camino viejo: un textarea escondido y `execCommand`. Anda en navegadores internos donde el nuevo no. */
function copiarALaAntigua(texto: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

// ─────────────────────────── piezas ───────────────────────────

function Saludo({ negocio, nombre }: { negocio: string; nombre: string }) {
  const r = useTextos().rutinaPublica;
  return (
    <>
      <p className="break-words text-[12px] font-bold uppercase tracking-wider text-tinta/45">{negocio}</p>
      <h1 className="mt-1 break-words font-titulo text-[24px] font-extrabold tracking-tight">{r.hola(nombre)}</h1>
    </>
  );
}

/**
 * El marco de los estados sin rutina, como el de /turno. `arriba`: el aviso
 * de la copia guardada; `abajo`: lo de la copia de este celular.
 */
function Marco({ children, arriba, abajo }: { children: React.ReactNode; arriba?: React.ReactNode; abajo?: React.ReactNode }) {
  const r = useTextos().rutinaPublica;
  return (
    <div className="min-h-screen bg-arena">
      <div className="zona-segura-arriba mx-auto max-w-md px-4 pb-16">
        <div className={arriba ? 'pt-4' : 'pt-10'}>
          {arriba && <div className="mb-4">{arriba}</div>}
          <div className="tarjeta p-5">{children}</div>
          {abajo && <div className="mt-6">{abajo}</div>}
          <p className="mt-8 text-center text-[11.5px] text-tinta/35">{r.pie}</p>
        </div>
      </div>
    </div>
  );
}
