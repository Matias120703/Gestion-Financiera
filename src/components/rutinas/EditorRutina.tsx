'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { useLocale, useTextos } from '@/i18n/cliente';
import { LARGOS, type RutinaLeidaConNotas } from '@/lib/rutina-texto';
import type {
  EjercicioBiblioteca, EjercicioLeido, EnlaceRutina, EstadoRutina, RespuestaGuardarRutina, RutinaCompleta,
} from '@/lib/tipos-rutinas';
import { Confirmar } from './panel/Piezas';
import { primerNombre } from './panel/utiles';
import {
  TOPES, agregarDia, agregarEjercicios, alternarJunto, cambiarDia, cantidadDeEjercicios, conNombre,
  desdeLeido, desdeRutina, duplicarDia, duplicarEjercicio, firma, mezclar, moverDia, moverEjercicio, nuevaClave,
  paraGuardar, quitarDia, quitarEjercicio, reemplazarEjercicio, rutinaVacia, sinIds, validar,
  type DiaEditor, type Problema, type RutinaEditor,
} from './editor/modelo';
import {
  borrarBorradorLocal, claveBorrador, guardarBorradorLocal, leerBorradorLocal, type BorradorLocal,
} from './editor/borradorLocal';
import { PestanasDias } from './editor/PestanasDias';
import { PanelDia } from './editor/PanelDia';
import { HojaEjercicio, type DatosHoja } from './editor/HojaEjercicio';
import { PegarTexto, type ModoPegar } from './editor/PegarTexto';
import { HojaGuardada } from './editor/HojaGuardada';

/** La persona de la rutina, como la trae la página (`rutinas_del_cliente`). */
export interface ClienteDelEditor {
  id: string;
  nombre: string;
  telefono: string;
  /** «Salud y lesiones»: para el aviso en ámbar. Nunca va a la rutina. */
  notas: string | null;
  enlace: EnlaceRutina | null;
}

type HojaAbierta =
  // `vuelta` cambia con cada «Guardar y otro»: la hoja se arma de nuevo, vacía.
  | { tipo: 'nuevo'; dia: number; vuelta: number; agregado?: string }
  | { tipo: 'editar'; dia: number; indice: number; problema?: string }
  | { tipo: 'pegar' }
  | { tipo: 'borrarDia'; dia: number }
  | { tipo: 'salir' }
  | { tipo: 'guardada'; respuesta: RespuestaGuardarRutina; nueva: boolean };

const SEMANAS = [4, 6, 8, 12] as const;

/**
 * EL EDITOR DE RUTINAS (098): /rutinas/[id], pensado para el celular.
 *
 * Es el mismo para una plantilla, la próxima rutina de alguien y la que ya
 * ve en su link. La meta es un día de seis ejercicios en menos de dos
 * minutos, y por eso la forma principal de cargar es el renglón rápido al
 * pie de cada día («Press banca 4x10 40kg 90s» + Enter). La hoja de cada
 * ejercicio queda para retocar, y «Pegar texto» para la rutina que el
 * trainer ya tiene escrita en otro lado.
 *
 * GUARDAR ES UN BOTÓN, NO UN RELOJ
 *
 * No hay autoguardado en la base: si lo hubiera, el cliente vería una rutina
 * a medio editar. Todo va en una sola llamada a `guardar_rutina`, con la
 * versión que se abrió: si en el medio alguien la cambió (otro trainer, o
 * una carga subida desde la agenda), la base la frena en vez de pisarla, y
 * se ofrece recargar. Mientras tanto, lo que se va cambiando queda en el
 * celular (ver editor/borradorLocal.ts), y cerrar la pestaña con cambios
 * pregunta antes.
 *
 * LO QUE NUNCA VIAJA
 *
 * «Salud y lesiones» se muestra arriba, en ámbar, para tenerla presente al
 * elegir ejercicios, pero no es parte de la rutina: no se copia a ningún
 * campo. Si una lesión importa para un ejercicio, el trainer la escribe en
 * su nota, sabiendo que esa nota la ve el cliente.
 *
 * LAS COPIAS LLEGAN COMO SU PRÓXIMA
 *
 * Usar una plantilla, copiar la de otro cliente o partir de una anterior
 * las copia la base como la próxima rutina de esa persona (`copiar_rutina`
 * con `p_borrador`, 099) y se abren acá (`copiada`): el cliente no ve nada
 * hasta «Activar la próxima» en su carpeta, con las notas de la original
 * ya revisadas. Guardar tampoco saca del editor: una plantilla o una
 * próxima se arman guardando de a un día.
 */
export function EditorRutina({
  empresaId, zona, rutina, estado, cliente, actual, biblioteca, copiada = null, diaInicial = 0,
}: {
  empresaId: string;
  zona: string;
  /** La rutina que se edita, o null si es nueva. */
  rutina: RutinaCompleta | null;
  /** El estado que tiene, o con el que va a nacer si es nueva. */
  estado: EstadoRutina;
  cliente: ClienteDelEditor | null;
  /** Al armar la próxima: la que tiene ahora, para partir de ella. */
  actual: RutinaCompleta | null;
  biblioteca: EjercicioBiblioteca[];
  /** Recién copiada de una plantilla, de otro cliente o de una anterior: nació como su próxima. */
  copiada?: { conNotas: boolean } | null;
  /** El día que se abre (después de guardar una nueva, el mismo en el que se estaba). */
  diaInicial?: number;
}) {
  const t = useTextos();
  const e = t.rutinasEditor;
  const locale = useLocale();
  const router = useRouter();

  const nombreDia = useCallback((i: number) => e.dias.porDefecto(i), [e]);

  // A una copia entre personas la base le pone «Rutina» cuando el nombre
  // queda vacío al sacarle el de la otra persona («Treino da Ana» → nada).
  // En una cuenta en portugués ese nombre llegaría al link del cliente en el
  // idioma equivocado: se abre con el nombre vacío y a la vista para que el
  // trainer le ponga uno (si no, al guardar toma el del idioma de la
  // pantalla, «Treino»). En español «Rutina» ya es el nombre por defecto.
  const nombreDeRespaldo = !!copiada && !!rutina && rutina.nombre === 'Rutina' && e.datos.nombrePorDefecto !== 'Rutina';

  // Lo que vino de la base (`base`) y lo que se está editando (`datos`):
  // hay cambios sin guardar cuando no son iguales. El nombre de respaldo se
  // vacía en los dos: si solo se vaciara en `datos`, la copia abriría con
  // un «sin guardar» falso (y la flecha preguntaría «¿Salir sin guardar?»)
  // sin que el trainer hubiera tocado nada.
  const [inicio] = useState<RutinaEditor>(() => {
    const r = rutina ? desdeRutina(rutina) : rutinaVacia(e.dias.porDefecto(0));
    return nombreDeRespaldo ? { ...r, nombre: '' } : r;
  });
  const [base, setBase] = useState<RutinaEditor>(inicio);
  const [datos, setDatos] = useState<RutinaEditor>(inicio);
  const [rutinaId, setRutinaId] = useState<string | null>(rutina?.id ?? null);
  const [version, setVersion] = useState<number | null>(rutina?.version ?? null);
  // La versión de la base que ya se cargó en el editor: al refrescar
  // después de guardar llega la nueva, con los ids de lo recién creado.
  const [cargada, setCargada] = useState(rutina ? `${rutina.id}:${rutina.version}` : '');
  // Fuera de rango no pasa nada: al mostrarlo se acomoda al último día.
  const [diaActivo, setDiaActivo] = useState(() => Math.max(0, Math.floor(diaInicial) || 0));
  const [hoja, setHoja] = useState<HojaAbierta | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // «Guardada», después de guardar una plantilla o una próxima que ya existía:
  // el editor se queda abierto, y esto dice que anduvo.
  const [guardadaAca, setGuardadaAca] = useState(false);
  const [choque, setChoque] = useState(false);
  const [recuperable, setRecuperable] = useState<BorradorLocal | null>(null);
  // Nombre, indicaciones y semanas: a la vista al armar una nueva (o si hay
  // que ponerle nombre a una copia), plegados al editar.
  const [verDatos, setVerDatos] = useState(!rutina || nombreDeRespaldo);
  const [otraSemana, setOtraSemana] = useState(
    rutina?.semanas && !(SEMANAS as readonly number[]).includes(rutina.semanas) ? String(rutina.semanas) : '',
  );

  const clienteId = cliente?.id ?? rutina?.cliente_id ?? null;
  // El nombre de pila: los avisos le hablan de «Ana», no de «Ana Ruiz».
  const nombreCliente = cliente?.nombre ?? rutina?.cliente_nombre ?? '';
  const pila = primerNombre(nombreCliente) || nombreCliente;
  const destino = clienteId ? `/rutinas/cliente/${clienteId}` : '/rutinas?ver=plantillas';
  const claveLocal = claveBorrador(empresaId, rutina?.id ?? null, rutina ? null : clienteId);
  const estadoActual: EstadoRutina = rutina?.estado ?? estado;

  const firmaDatos = useMemo(() => firma(datos), [datos]);
  const firmaBase = useMemo(() => firma(base), [base]);
  const sucio = firmaDatos !== firmaBase;
  // Guardar queda a mano aunque no haya cambios mientras la copia siga sin
  // nombre: un toque la guarda con el del idioma de la pantalla («Treino»).
  const puedeGuardar = !guardando && (sucio || !rutinaId || nombreDeRespaldo);
  const dia = datos.dias[Math.min(diaActivo, datos.dias.length - 1)];
  const indiceDia = Math.min(diaActivo, datos.dias.length - 1);

  // Lo último, para lo que corre fuera del render (salir de la página).
  const ultimo = useRef({ datos, sucio, version, claveLocal, base });
  ultimo.current = { datos, sucio, version, claveLocal, base };
  /** Se tocó algo en esta visita: recién ahí se escribe en el celular. */
  const tocado = useRef(false);
  /** Se guardó o se descartó a propósito: no hay nada que rescatar al salir. */
  const cerrado = useRef(false);

  const cambiar = useCallback((fn: (r: RutinaEditor) => RutinaEditor) => {
    tocado.current = true;
    cerrado.current = false;
    setDatos(fn);
    setGuardadaAca(false);
    // Un choque de versión no se arregla editando: ese aviso se queda.
    if (!choque) setError('');
  }, [choque]);

  // ---------------------------------------------------------------- lo que quedó en el celular

  // Al abrir: si quedó algo sin guardar de la otra vez, se ofrece. Si es
  // igual a lo que está guardado, ya no sirve y se borra.
  useEffect(() => {
    const b = leerBorradorLocal(claveLocal);
    if (!b) return;
    if (firma(b.datos) === firmaBase) borrarBorradorLocal(claveLocal);
    else setRecuperable(b);
    // Solo al abrir: después, lo del celular lo escribe este mismo editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada cambio, al celular (un poco después, para no escribir en cada letra),
  // junto con la versión de la base sobre la que se edita: si al volver
  // alguien la cambió, esa es la que dice qué tocó el trainer y qué no.
  useEffect(() => {
    if (!tocado.current || cerrado.current) return;
    const espera = window.setTimeout(() => {
      if (sucio) guardarBorradorLocal(claveLocal, datos, version, base);
      else borrarBorradorLocal(claveLocal);
    }, 400);
    return () => window.clearTimeout(espera);
  }, [datos, sucio, claveLocal, version, base]);

  // Y lo último antes de irse: cerrar la pestaña, o cambiar de sección con
  // la barra de abajo antes de que pase la espera de arriba.
  useEffect(() => {
    const volcar = () => {
      const u = ultimo.current;
      if (tocado.current && !cerrado.current && u.sucio) guardarBorradorLocal(u.claveLocal, u.datos, u.version, u.base);
    };
    window.addEventListener('pagehide', volcar);
    return () => {
      window.removeEventListener('pagehide', volcar);
      volcar();
    };
  }, []);

  // Cerrar la pestaña o recargar con cambios sin guardar pregunta antes.
  // Sin cambios no molesta.
  useEffect(() => {
    if (!sucio || guardando) return;
    const avisar = (ev: BeforeUnloadEvent) => {
      if (cerrado.current) return;
      ev.preventDefault();
      ev.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sucio, guardando]);

  // Llegó otra versión de la base (el refresco de después de guardar): se
  // carga, salvo que ya haya cambios encima, que no se pisan.
  useEffect(() => {
    if (!rutina) return;
    const llegada = `${rutina.id}:${rutina.version}`;
    if (llegada === cargada) return;
    setCargada(llegada);
    if (ultimo.current.sucio) return;
    const nueva = desdeRutina(rutina);
    setBase(nueva);
    setDatos(nueva);
    setVersion(rutina.version);
    setRutinaId(rutina.id);
    setDiaActivo((i) => Math.min(i, nueva.dias.length - 1));
  }, [rutina, cargada]);

  // ¿Lo del celular se editó sobre una versión que ya no es la última? Pasa
  // después de un choque («Recargar»), o si otro guardó mientras tanto.
  const recuperableViejo = !!rutina && !!recuperable && recuperable.version !== null
    && version !== null && recuperable.version !== version;

  /**
   * Recuperar lo del celular. Si en el medio alguien guardó otra versión
   * (una carga subida desde la agenda, otro trainer), no se la pisa entera:
   * lo que el trainer no tocó sale de la versión nueva (`mezclar`). Así el
   * «Recargar» del choque de versión no termina deshaciendo lo que el
   * control de versión tenía que cuidar.
   */
  function recuperar() {
    if (!recuperable) return;
    tocado.current = true;
    cerrado.current = false;
    const recuperados = recuperableViejo && recuperable.base
      ? mezclar(recuperable.base, recuperable.datos, base)
      : recuperable.datos;
    setDatos(recuperados);
    setOtraSemana(
      recuperados.semanas && !(SEMANAS as readonly number[]).includes(recuperados.semanas)
        ? String(recuperados.semanas) : '',
    );
    setDiaActivo(0);
    setRecuperable(null);
  }

  function descartarRecuperable() {
    borrarBorradorLocal(claveLocal);
    setRecuperable(null);
  }

  // ---------------------------------------------------------------- días y ejercicios

  const agregarUnDia = () => {
    if (datos.dias.length >= TOPES.dias) return;
    const nuevo = datos.dias.length;
    cambiar((r) => agregarDia(r, e.dias.porDefecto(r.dias.length)));
    setDiaActivo(nuevo);
  };

  function borrarDia(i: number) {
    cambiar((r) => quitarDia(r, i));
    setDiaActivo((a) => Math.max(0, Math.min(a >= i ? a - 1 : a, datos.dias.length - 2)));
    setHoja(null);
  }

  function agregarDesdeRenglon(i: number, leido: EjercicioLeido) {
    cambiar((r) => agregarEjercicios(r, i, [desdeLeido(leido, biblioteca)]));
  }

  function guardarDeLaHoja(h: HojaAbierta, d: DatosHoja, otro: boolean) {
    const { nombre, ...resto } = d;
    if (h.tipo === 'nuevo') {
      const ej = conNombre({ clave: nuevaClave(), ...resto, nombre: '' }, nombre, biblioteca);
      cambiar((r) => agregarEjercicios(r, h.dia, [ej]));
      const lleno = (datos.dias[h.dia]?.ejercicios.length ?? 0) + 1 >= TOPES.ejerciciosPorDia;
      setHoja(otro && !lleno ? { tipo: 'nuevo', dia: h.dia, vuelta: h.vuelta + 1, agregado: ej.nombre } : null);
    } else if (h.tipo === 'editar') {
      const viejo = datos.dias[h.dia]?.ejercicios[h.indice];
      if (!viejo) { setHoja(null); return; }
      // El nombre se compara con el que tenía: si es el mismo ejercicio, se
      // queda el de la biblioteca (el editor nunca renombra).
      cambiar((r) => reemplazarEjercicio(r, h.dia, h.indice, conNombre({ ...viejo, ...resto }, nombre, biblioteca)));
      setHoja(null);
    }
  }

  /**
   * Usar lo pegado: los días con algo adentro, cada ejercicio buscado en la
   * biblioteca. Un día sin nombre queda vacío y se ve (y se guarda) con el
   * de su lugar: «Día A», «Día B».
   */
  function usarPegado(leida: RutinaLeidaConNotas, modo: ModoPegar) {
    const dias: DiaEditor[] = leida.dias
      .filter((d) => d.ejercicios.length > 0 || d.notas.trim())
      .map((d) => ({
        clave: nuevaClave(),
        nombre: d.nombre.trim().slice(0, LARGOS.nombreDia),
        notas: d.notas.trim().slice(0, LARGOS.notasDia),
        ejercicios: d.ejercicios.slice(0, TOPES.ejerciciosPorDia).map((x, j) => {
          const ej = desdeLeido(x, biblioteca);
          return j === 0 ? { ...ej, junto_al_anterior: false } : ej;
        }),
      }));
    if (!dias.length) return;
    const antes = datos.dias.length;
    const notasLeidas = leida.notas.trim().slice(0, LARGOS.notasRutina);
    const nombreLeido = (leida.nombre ?? '').trim().slice(0, LARGOS.nombreRutina);
    cambiar((r) => ({
      ...r,
      nombre: r.nombre.trim() ? r.nombre : nombreLeido,
      // Reemplazar se lleva también las indicaciones, si el texto traía;
      // agregar no pisa las que ya había.
      notas: modo === 'reemplazar' ? notasLeidas || r.notas : r.notas.trim() ? r.notas : notasLeidas,
      dias: modo === 'reemplazar' ? dias : [...r.dias, ...dias].slice(0, TOPES.dias),
    }));
    setDiaActivo(modo === 'reemplazar' ? 0 : Math.min(antes, TOPES.dias - 1));
    setHoja(null);
  }

  function partirDeLaActual() {
    if (!actual) return;
    const copia = sinIds(desdeRutina(actual));
    cambiar(() => copia);
    setOtraSemana(copia.semanas && !(SEMANAS as readonly number[]).includes(copia.semanas) ? String(copia.semanas) : '');
    setDiaActivo(0);
  }

  function elegirSemanas(n: number | null) {
    setOtraSemana('');
    cambiar((r) => ({ ...r, semanas: n }));
  }

  function escribirSemanas(texto: string) {
    const limpio = texto.replace(/\D/g, '').slice(0, 2);
    setOtraSemana(limpio);
    const n = parseInt(limpio, 10);
    cambiar((r) => ({ ...r, semanas: Number.isFinite(n) && n >= 1 && n <= TOPES.semanas ? n : null }));
  }

  // ---------------------------------------------------------------- guardar

  function textoDeProblema(p: Problema): string {
    const nombreDe = (i: number) => datos.dias[i]?.nombre.trim() || nombreDia(i);
    switch (p.tipo) {
      case 'sinEjercicios': return e.problemas.sinEjercicios;
      case 'muchosDias': return e.problemas.muchosDias;
      case 'muchosEjercicios': return e.problemas.muchosEjercicios(nombreDe(p.dia));
      case 'sinNombre': return e.problemas.sinNombre(nombreDe(p.dia));
      case 'cargaLarga': return e.problemas.cargaLarga(datos.dias[p.dia]?.ejercicios[p.ejercicio]?.nombre ?? '');
      case 'repsLargas': return e.problemas.repsLargas(datos.dias[p.dia]?.ejercicios[p.ejercicio]?.nombre ?? '');
    }
  }

  async function guardar() {
    if (guardando) return;
    const problema = validar(datos);
    if (problema) {
      setError(textoDeProblema(problema));
      setChoque(false);
      // Se abre justo donde está lo que hay que arreglar.
      if ('dia' in problema) setDiaActivo(problema.dia);
      if ('ejercicio' in problema) {
        setHoja({ tipo: 'editar', dia: problema.dia, indice: problema.ejercicio, problema: textoDeProblema(problema) });
      }
      return;
    }

    setGuardando(true);
    setError('');
    setChoque(false);
    const eraNueva = !rutinaId;
    try {
      const { data, error: fallo } = await clienteNavegador().rpc('guardar_rutina', {
        p_empresa: empresaId,
        p_datos: paraGuardar(datos, {
          rutina: estadoActual === 'plantilla' ? e.datos.plantillaPorDefecto : e.datos.nombrePorDefecto,
          dia: nombreDia,
        }),
        p_id: rutinaId,
        // Una nueva nace del cliente (vigente, o la próxima si ya tiene una) o
        // como plantilla; una que ya existe no cambia de dueño.
        p_cliente: rutinaId ? null : clienteId,
        // La versión que se abrió: si alguien la cambió en el medio, la base
        // frena en vez de pisar.
        p_version: rutinaId ? version : null,
      });
      if (fallo) throw fallo;
      const r = data as RespuestaGuardarRutina | null;
      if (!r?.id) {
        setError(t.errores.generico);
        return;
      }

      // Guardada: lo del celular ya no hace falta.
      cerrado.current = true;
      borrarBorradorLocal(claveLocal);
      setRecuperable(null);
      setBase(datos);
      setVersion(r.version);
      setRutinaId(r.id);

      if (r.estado === 'vigente' && cliente) {
        // La ve el cliente: es el momento de avisarle. La dirección pasa a
        // ser la de la rutina guardada (recargar no crea otra), y la que ya
        // existía se vuelve a pedir para traer los ids de lo nuevo.
        if (eraNueva) window.history.replaceState(null, '', `/rutinas/${r.id}`);
        else router.refresh();
        setHoja({ tipo: 'guardada', respuesta: r, nueva: eraNueva });
      } else if (eraNueva) {
        // Una plantilla o una próxima nueva: se sigue editando, ya con su
        // dirección (`replace`: «atrás» no vuelve a «nueva», que crearía
        // otra) y en el mismo día. Salir es la flecha de arriba.
        router.replace(`/rutinas/${r.id}?dia=${indiceDia}`);
      } else {
        // Una que ya existía: guardar no saca del editor. Armando una de
        // cinco días se guarda después de cada uno; antes cada «Guardar»
        // llevaba a la lista y había que volver a buscarla. Se vuelve a
        // pedir para traer los ids de lo nuevo (ver el efecto de arriba).
        router.refresh();
        setGuardadaAca(true);
      }
    } catch (err) {
      const crudo = String((err as { message?: unknown })?.message ?? '');
      setChoque(/Alguien cambió esta rutina/i.test(crudo));
      setError(mensajeDeError(err, t.errores.generico));
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Recargar después de un choque: lo cambiado queda en el celular, con la
   * versión sobre la que se editó, y se ofrece al volver (mezclado con la
   * que guardó el otro, ver recuperar()).
   */
  function recargar() {
    const u = ultimo.current;
    if (u.sucio) guardarBorradorLocal(u.claveLocal, u.datos, u.version, u.base);
    cerrado.current = true;
    window.location.reload();
  }

  function seguirEditando() {
    const h = hoja;
    setHoja(null);
    // La nueva todavía es «nueva» para esta pantalla: se abre la guardada,
    // en el mismo día.
    if (h?.tipo === 'guardada' && h.nueva) router.replace(`/rutinas/${h.respuesta.id}?dia=${indiceDia}`);
  }

  function salirSinGuardar() {
    cerrado.current = true;
    borrarBorradorLocal(claveLocal);
    setHoja(null);
    router.push(destino);
  }

  // ---------------------------------------------------------------- pantalla

  const estadoVisible = rutina ? e.barra.estados[rutina.estado] : e.barra.nueva[estado];
  const lesiones = (cliente?.notas ?? rutina?.cliente_notas ?? '').trim();
  const loVe = pila ? e.datos.loVe(pila) : e.datos.loVeElCliente;
  const chip = (encendido: boolean) => `${encendido ? 'chip-encendido' : 'chip-apagado'} px-3.5 text-[13.5px]`;
  const hayEjercicios = cantidadDeEjercicios(datos) > 0;
  const fechaRecuperable = recuperable
    ? new Date(recuperable.guardado).toLocaleString(locale, {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
    : '';

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-6">
      {/* ---- la barra de arriba: volver, qué es, guardar. Sigue a la vista al bajar. ---- */}
      <div className="sticky top-[calc(60px+env(safe-area-inset-top))] z-20 -mx-1">
        <div className="flex items-center gap-1.5 rounded-2xl border border-borde/70 bg-superficie px-1.5 py-1.5 shadow-[0_10px_28px_-18px_rgba(0,0,0,.45)]">
          <Link
            href={destino} aria-label={e.barra.volver}
            onClick={(ev) => { if (sucio) { ev.preventDefault(); setHoja({ tipo: 'salir' }); } }}
            className="icono-toque shrink-0 text-[20px] text-tinta/60 hover:bg-arena"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-bold leading-tight">{datos.nombre.trim() || e.barra.sinTitulo}</p>
            {/* «sin guardar» va aparte y no se corta: a 375 px «Rutina vigente
                de Valentina» ya llena el renglón, y lo que se perdía era
                justo el aviso, en la rutina que el cliente ve. */}
            <p className="flex min-w-0 items-baseline text-[12px] text-tinta/55">
              <span className="min-w-0 truncate">{estadoVisible}{pila ? ` ${e.barra.de(pila)}` : ''}</span>
              {sucio && <span className="shrink-0 whitespace-pre font-semibold text-ambar"> · {e.barra.sinGuardar}</span>}
            </p>
          </div>
          <button
            type="button" onClick={guardar} disabled={!puedeGuardar}
            className="boton-principal min-h-[44px] shrink-0 px-5"
          >
            {guardando ? e.barra.guardando : e.barra.guardar}
          </button>
        </div>
        {error && (
          <div role="alert" className="mt-2 rounded-xl bg-rojo-claro px-3.5 py-2.5 text-[13px] font-medium text-rojo shadow-[0_10px_28px_-18px_rgba(0,0,0,.45)]">
            <p>{error}</p>
            {choque && (
              <>
                <p className="mt-1 text-[12.5px] font-normal text-tinta/70">{e.problemas.choqueAyuda}</p>
                <button type="button" onClick={recargar} className="boton-principal mt-2 min-h-[44px]">
                  {e.problemas.recargar}
                </button>
              </>
            )}
          </div>
        )}
        {guardadaAca && !sucio && !error && (
          <div role="status" className="mt-2 flex flex-wrap items-center justify-between gap-x-3 rounded-xl bg-verde-claro px-3.5 py-1 text-[13px] font-semibold text-verde-fuerte shadow-[0_10px_28px_-18px_rgba(0,0,0,.45)] aparecer">
            <span className="py-2">✓ {e.barra.guardada}</span>
            <Link href={destino} className="inline-flex min-h-[44px] items-center underline underline-offset-2">
              {clienteId ? e.guardada.volver : e.barra.volverAPlantillas}
            </Link>
          </div>
        )}
      </div>

      {/* ---- recién copiada: es su próxima, y el cliente todavía no la ve ---- */}
      {copiada && rutina && (
        <div className="rounded-2xl border border-verde/35 bg-verde-claro/50 px-4 py-3 text-[13px] leading-relaxed text-tinta/75" role="status">
          <p className="font-semibold text-tinta">{e.copia.titulo}</p>
          <p className="mt-0.5">{pila ? e.copia.detalle(pila) : e.copia.detalleSinNombre}</p>
          {copiada.conNotas && <p className="mt-1 font-medium text-ambar">{e.copia.conNotas}</p>}
          {nombreDeRespaldo && <p className="mt-1 font-medium text-ambar">{e.copia.sinNombre}</p>}
        </div>
      )}

      {/* ---- lo que quedó sin guardar de la otra vez ---- */}
      {recuperable && (
        <div className="tarjeta p-4" role="status">
          <p className="text-[15px] font-bold">{e.recuperar.titulo}</p>
          <p className="mt-0.5 text-[13px] text-tinta/60">{e.recuperar.cuando(fechaRecuperable)}</p>
          {recuperableViejo && (
            <p className="mt-2 rounded-xl bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">
              {recuperable.base ? e.recuperar.cambioDespuesSeJunta : e.recuperar.cambioDespues}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={recuperar} className="boton-principal min-h-[44px]">{e.recuperar.boton}</button>
            <button type="button" onClick={descartarRecuperable} className="boton-suave min-h-[44px]">{e.recuperar.descartar}</button>
          </div>
        </div>
      )}

      {/* ---- «Salud y lesiones»: a la vista, nunca en la rutina ---- */}
      {lesiones && (
        <div className="rounded-2xl bg-ambar-claro px-4 py-3">
          <p className="text-[13px] font-bold text-ambar">⚠ {e.avisos.salud(pila)}</p>
          <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-tinta/85">{lesiones}</p>
          <p className="mt-1.5 text-[12px] leading-snug text-tinta/60">{e.avisos.saludNoSeCopia(pila)}</p>
        </div>
      )}

      {/* ---- quién la ve ---- */}
      <div className="rounded-2xl border border-borde/70 bg-superficie px-4 py-3 text-[13px] leading-relaxed text-tinta/70">
        {estadoActual === 'vigente' && rutina ? (
          <>
            <p className="font-semibold text-tinta">{e.avisos.vigente(pila)}</p>
            <Link
              href={destino} className="boton-texto -mb-2 inline-flex min-h-[44px] items-center text-[13px]"
              onClick={(ev) => { if (sucio) { ev.preventDefault(); setHoja({ tipo: 'salir' }); } }}
            >
              {e.avisos.irALaCarpeta}
            </Link>
          </>
        ) : estadoActual === 'vigente' ? (
          <p>{e.avisos.nuevaVigente(pila)}</p>
        ) : estadoActual === 'borrador' ? (
          <p>{e.avisos.borrador(pila)}</p>
        ) : (
          <p>{e.avisos.plantilla}</p>
        )}
        {!rutina && <p className="mt-1 text-[12px] text-tinta/50">{e.avisos.seGuardaEnElCelular}</p>}
      </div>

      {/* ---- armar la próxima partiendo de la actual ---- */}
      {!rutinaId && actual && !hayEjercicios && (
        <div className="tarjeta p-4">
          <p className="text-[14.5px] font-bold">{e.partir.titulo(actual.nombre)}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-tinta/60">{e.partir.detalle}</p>
          <button type="button" onClick={partirDeLaActual} className="boton-suave mt-3 min-h-[44px]">{e.partir.boton}</button>
        </div>
      )}

      {/* ---- nombre, indicaciones, semanas ----
          En una que ya existe van plegados: casi siempre se entra a cambiar
          ejercicios, y en el celular estos tres campos empujaban los días
          una pantalla y media más abajo. */}
      {!verDatos ? (
        <button
          type="button" onClick={() => setVerDatos(true)} aria-expanded={false}
          className="tarjeta flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold">{e.datos.titulo}</span>
            <span className="mt-0.5 block truncate text-[12.5px] text-tinta/55">
              {e.datos.resumen(datos.semanas, datos.notas.trim() !== '')}
            </span>
          </span>
          <span className="shrink-0 text-[13.5px] font-semibold text-verde-fuerte">{e.datos.cambiar}</span>
        </button>
      ) : (
        <section className="tarjeta space-y-4 p-4">
          <div>
            <label htmlFor="rutina-nombre" className="etiqueta">{e.datos.nombre}</label>
            <input
              id="rutina-nombre" className="campo font-semibold" value={datos.nombre} maxLength={LARGOS.nombreRutina}
              placeholder={e.datos.nombreEjemplo} autoComplete="off" autoCapitalize="sentences"
              onChange={(ev) => { const v = ev.target.value; cambiar((r) => ({ ...r, nombre: v })); }}
            />
            <p className="mt-1 text-[12px] font-medium text-ambar">{loVe}</p>
          </div>

          <div>
            <label htmlFor="rutina-notas" className="etiqueta">{e.datos.notas}</label>
            <textarea
              id="rutina-notas" className="campo min-h-[72px] resize-y" rows={2}
              value={datos.notas} maxLength={LARGOS.notasRutina} placeholder={e.datos.notasEjemplo}
              onChange={(ev) => { const v = ev.target.value; cambiar((r) => ({ ...r, notas: v })); }}
            />
            <p className="mt-1 text-[12px] font-medium text-ambar">{loVe}</p>
          </div>

          <div>
            <p className="etiqueta" id="rutina-semanas">{e.datos.semanas}</p>
            <div className="scroll-limpio -mx-4 flex items-center gap-2 overflow-x-auto px-4" role="group" aria-labelledby="rutina-semanas">
              <button type="button" onClick={() => elegirSemanas(null)} className={chip(datos.semanas === null && !otraSemana)}>
                {e.datos.semanasNo}
              </button>
              {SEMANAS.map((n) => (
                <button key={n} type="button" onClick={() => elegirSemanas(n)} className={chip(datos.semanas === n && !otraSemana)}>
                  {e.datos.semanasN(n)}
                </button>
              ))}
              <input
                className={`campo w-[4.5rem] shrink-0 text-center tabular-nums ${otraSemana ? 'border-verde' : ''}`}
                value={otraSemana} inputMode="numeric" pattern="[0-9]*" maxLength={2}
                placeholder={e.datos.semanasOtra} aria-label={`${e.datos.semanas} · ${e.datos.semanasOtra}`}
                onChange={(ev) => escribirSemanas(ev.target.value)}
              />
              {otraSemana && <span className="shrink-0 text-[13px] text-tinta/55">{e.datos.semanasUnidad(parseInt(otraSemana, 10) || 0)}</span>}
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">{e.datos.semanasAyuda}</p>
          </div>
        </section>
      )}

      {/* ---- los días ---- */}
      <PestanasDias
        dias={datos.dias} activo={indiceDia} onElegir={setDiaActivo}
        onAgregar={agregarUnDia} puedeAgregar={datos.dias.length < TOPES.dias}
      />

      {dia && (
        <PanelDia
          key={dia.clave}
          dia={dia} indice={indiceDia} total={datos.dias.length}
          puedeDuplicar={datos.dias.length < TOPES.dias}
          loVe={loVe}
          onCambiar={(c) => cambiar((r) => cambiarDia(r, indiceDia, c))}
          onMover={(delta) => {
            const destinoDia = indiceDia + delta;
            if (destinoDia < 0 || destinoDia >= datos.dias.length) return;
            cambiar((r) => moverDia(r, indiceDia, delta));
            setDiaActivo(destinoDia);
          }}
          onDuplicar={() => {
            if (datos.dias.length >= TOPES.dias) return;
            cambiar((r) => duplicarDia(r, indiceDia, e.dias.copia(r.dias[indiceDia]?.nombre.trim() || nombreDia(indiceDia))));
            setDiaActivo(indiceDia + 1);
          }}
          onBorrar={() => {
            if (dia.ejercicios.length > 0) setHoja({ tipo: 'borrarDia', dia: indiceDia });
            else borrarDia(indiceDia);
          }}
          onEditar={(j) => setHoja({ tipo: 'editar', dia: indiceDia, indice: j })}
          onMoverEjercicio={(j, delta) => cambiar((r) => moverEjercicio(r, indiceDia, j, delta))}
          onJunto={(j) => cambiar((r) => alternarJunto(r, indiceDia, j))}
          onDuplicarEjercicio={(j) => cambiar((r) => duplicarEjercicio(r, indiceDia, j))}
          onQuitarEjercicio={(j) => cambiar((r) => quitarEjercicio(r, indiceDia, j))}
          onRenglon={(leido) => agregarDesdeRenglon(indiceDia, leido)}
          onNuevo={() => setHoja({ tipo: 'nuevo', dia: indiceDia, vuelta: 0 })}
          onPegar={() => setHoja({ tipo: 'pegar' })}
        />
      )}

      {/* ---- guardar, también abajo: es donde termina el recorrido ---- */}
      <button
        type="button" onClick={guardar} disabled={!puedeGuardar}
        className="boton-principal min-h-[52px] w-full text-[15px]"
      >
        {guardando ? e.barra.guardando : e.barra.guardar}
      </button>

      {/* ---------------------------------------------------------------- hojas */}

      {hoja?.tipo === 'nuevo' && (
        <HojaEjercicio
          key={`nuevo-${hoja.vuelta}`}
          inicial={null}
          puedeJunto={(datos.dias[hoja.dia]?.ejercicios.length ?? 0) > 0}
          biblioteca={biblioteca}
          agregado={hoja.agregado}
          onGuardar={(d, otro) => guardarDeLaHoja(hoja, d, otro)}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === 'editar' && datos.dias[hoja.dia]?.ejercicios[hoja.indice] && (
        <HojaEjercicio
          key={`editar-${datos.dias[hoja.dia].ejercicios[hoja.indice].clave}`}
          inicial={datos.dias[hoja.dia].ejercicios[hoja.indice]}
          puedeJunto={hoja.indice > 0}
          biblioteca={biblioteca}
          problema={hoja.problema}
          onGuardar={(d) => guardarDeLaHoja(hoja, d, false)}
          onQuitar={() => { cambiar((r) => quitarEjercicio(r, hoja.dia, hoja.indice)); setHoja(null); }}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === 'pegar' && (
        <PegarTexto
          diasActuales={datos.dias.length}
          hayEjercicios={hayEjercicios}
          biblioteca={biblioteca}
          onUsar={usarPegado}
          onCerrar={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === 'borrarDia' && datos.dias[hoja.dia] && (
        <Confirmar
          titulo={e.dias.borrarPregunta(datos.dias[hoja.dia].nombre.trim() || nombreDia(hoja.dia))}
          detalle={e.dias.borrarDetalle(datos.dias[hoja.dia].ejercicios.length)}
          si={e.dias.siBorrar} peligro
          onSi={() => borrarDia(hoja.dia)}
          onNo={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === 'salir' && (
        <Confirmar
          titulo={e.salir.pregunta} detalle={e.salir.detalle} si={e.salir.si} peligro
          onSi={salirSinGuardar}
          onNo={() => setHoja(null)}
        />
      )}

      {hoja?.tipo === 'guardada' && cliente && (
        <HojaGuardada
          empresaId={empresaId} zona={zona} cliente={cliente}
          token={hoja.respuesta.token}
          // El link no se prende solo: si estaba apagado, la hoja ofrece prenderlo.
          activo={cliente.enlace ? cliente.enlace.activo : true}
          nueva={hoja.nueva}
          listaParaSeguir={hoja.nueva || cargada === `${hoja.respuesta.id}:${hoja.respuesta.version}`}
          onVolver={() => { setHoja(null); router.replace(destino); }}
          onSeguir={seguirEditando}
        />
      )}
    </div>
  );
}
