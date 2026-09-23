/**
 * EL EDITOR DE RUTINAS POR DENTRO (098): la rutina mientras se edita.
 *
 * Todo lo que el editor hace con la rutina —mover, duplicar, quitar, armar
 * lo que se manda a `guardar_rutina`— está acá, sin React: son cuentas
 * sobre datos, y juntas se leen mejor que repartidas entre botones.
 *
 * LOS IDS SE CUIDAN
 *
 * `guardar_rutina` conserva el id de cada día y de cada ejercicio que llega
 * con uno: los tildes que el cliente hizo en su celular están guardados por
 * id, y el historial de cargas necesita saber que «el mismo renglón» pasó de
 * 40 a 50. Por eso lo que vino de la base guarda su `id` hasta el final, y
 * lo nuevo (o duplicado, o pegado) no lleva ninguno: la base lo crea.
 *
 * Cada día y cada ejercicio tiene además una `clave` local para React, que
 * existe aunque todavía no tenga id.
 *
 * LA CARGA NO SE TOCA
 *
 * Nada de acá le agrega una unidad a la carga. «40» es «40»: en muchos
 * gimnasios de la región las mancuernas vienen en libras, y un «25» leído
 * como kilos puede lastimar a alguien. La unidad la escribe el trainer (o
 * los botones de la hoja, que la escriben con `conUnidad`).
 */
import type {
  EjercicioBiblioteca, EjercicioLeido, RutinaCompleta, RutinaParaGuardar,
} from '@/lib/tipos-rutinas';
import { LARGOS, formatoDescanso, normalizarCarga, unidadDe } from '@/lib/rutina-texto';
import { claveEjercicio } from '@/lib/ejercicios-base';
import { seriesPorReps } from '../panel/utiles';

export interface EjercicioEditor {
  /** Para React: estable aunque todavía no tenga id. */
  clave: string;
  /** El renglón de `rutina_ejercicios`, si ya existe. Se manda siempre. */
  id?: string;
  /** El ejercicio de la biblioteca, si se sabe cuál es. Sin él se manda el nombre. */
  ejercicio_id?: string;
  nombre: string;
  series: number | null;
  reps: string;
  carga: string;
  descanso_seg: number | null;
  nota: string;
  junto_al_anterior: boolean;
}

export interface DiaEditor {
  clave: string;
  id?: string;
  nombre: string;
  notas: string;
  ejercicios: EjercicioEditor[];
}

export interface RutinaEditor {
  nombre: string;
  notas: string;
  semanas: number | null;
  dias: DiaEditor[];
}

/** Los topes de la base (098), para frenar antes de mandar. */
export const TOPES = { dias: 10, ejerciciosPorDia: 30, series: 20, descanso: 900, semanas: 52 } as const;

let contador = 0;

/** Una clave local nueva. Sin `crypto.randomUUID`: un iPhone con iOS viejo no lo tiene. */
export function nuevaClave(): string {
  contador += 1;
  return `n${Date.now().toString(36)}${contador.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────── de la base al editor ───────────────────────────

export function desdeRutina(r: RutinaCompleta): RutinaEditor {
  return {
    nombre: r.nombre ?? '',
    notas: r.notas ?? '',
    semanas: r.semanas ?? null,
    dias: [...(r.dias ?? [])].sort((a, b) => a.orden - b.orden).map((d) => ({
      clave: d.id,
      id: d.id,
      nombre: d.nombre ?? '',
      notas: d.notas ?? '',
      ejercicios: [...(d.ejercicios ?? [])].sort((a, b) => a.orden - b.orden).map((e, i) => ({
        clave: e.id,
        id: e.id,
        ejercicio_id: e.ejercicio_id,
        nombre: e.nombre ?? '',
        series: e.series ?? null,
        reps: e.reps ?? '',
        carga: e.carga ?? '',
        descanso_seg: e.descanso_seg ?? null,
        nota: e.nota ?? '',
        junto_al_anterior: i > 0 && !!e.junto_al_anterior,
      })),
    })),
  };
}

export function diaVacio(nombre: string): DiaEditor {
  return { clave: nuevaClave(), nombre, notas: '', ejercicios: [] };
}

export function rutinaVacia(nombreDia: string): RutinaEditor {
  return { nombre: '', notas: '', semanas: null, dias: [diaVacio(nombreDia)] };
}

/**
 * La misma rutina sin ningún id: «partir de la actual» para armar la
 * próxima. Todo es nuevo para la base; el ejercicio de la biblioteca sí se
 * conserva, porque es del mismo negocio.
 */
export function sinIds(r: RutinaEditor): RutinaEditor {
  return {
    ...r,
    dias: r.dias.map((d) => ({
      clave: nuevaClave(),
      nombre: d.nombre,
      notas: d.notas,
      ejercicios: d.ejercicios.map((e) => copiaDeEjercicio(e)),
    })),
  };
}

function copiaDeEjercicio(e: EjercicioEditor): EjercicioEditor {
  const { id: _id, clave: _clave, ...resto } = e;
  return { ...resto, clave: nuevaClave() };
}

// ─────────────────────────── ¿cambió algo? ───────────────────────────

/**
 * Un texto que es igual para dos rutinas iguales, campo por campo y en un
 * orden fijo. `JSON.stringify` del objeto entero no sirve: el mismo
 * ejercicio armado por dos caminos puede tener las claves en otro orden y
 * parecer cambiado sin que nadie lo tocara.
 */
export function firma(r: RutinaEditor): string {
  return JSON.stringify([
    r.nombre, r.notas, r.semanas ?? null,
    r.dias.map((d) => [
      d.id ?? null, d.nombre, d.notas,
      d.ejercicios.map((e) => [
        e.id ?? null, e.ejercicio_id ?? null, e.nombre, e.series ?? null, e.reps, e.carga,
        e.descanso_seg ?? null, e.nota, !!e.junto_al_anterior,
      ]),
    ]),
  ]);
}

// ─────────────────────────── lo del celular, sobre una versión más nueva ───────────────────────────

const firmaEjercicio = (e: EjercicioEditor) => JSON.stringify([
  e.ejercicio_id ?? null, e.nombre, e.series ?? null, e.reps, e.carga, e.descanso_seg ?? null, e.nota, !!e.junto_al_anterior,
]);
const firmaDia = (d: DiaEditor) => JSON.stringify([d.nombre, d.notas, d.ejercicios.map((e) => [e.id ?? null, firmaEjercicio(e)])]);
const mismoEjercicio = (a: EjercicioEditor, b: EjercicioEditor) =>
  (a.ejercicio_id ?? null) === (b.ejercicio_id ?? null) && a.nombre === b.nombre;

/** Lo que el trainer no cambió (su valor es el de la base vieja) se toma de la nueva. */
function elegir<T>(vieja: T, mia: T, nueva: T): T {
  return mia === vieja ? nueva : mia;
}

function mezclarEjercicio(v: EjercicioEditor, m: EjercicioEditor, n: EjercicioEditor): EjercicioEditor {
  // El ejercicio de la biblioteca y su nombre van juntos: o los dos del
  // trainer, o los dos de la versión nueva (una unión desde la biblioteca).
  const cual = mismoEjercicio(m, v) ? n : m;
  const { ejercicio_id: _fuera, ...resto } = m;
  return {
    ...resto,
    nombre: cual.nombre,
    ...(cual.ejercicio_id ? { ejercicio_id: cual.ejercicio_id } : {}),
    series: elegir(v.series, m.series, n.series),
    reps: elegir(v.reps, m.reps, n.reps),
    carga: elegir(v.carga, m.carga, n.carga),
    descanso_seg: elegir(v.descanso_seg, m.descanso_seg, n.descanso_seg),
    nota: elegir(v.nota, m.nota, n.nota),
    junto_al_anterior: elegir(!!v.junto_al_anterior, !!m.junto_al_anterior, !!n.junto_al_anterior),
  };
}

function mezclarDia(v: DiaEditor, m: DiaEditor, n: DiaEditor): DiaEditor {
  const viejos = new Map(v.ejercicios.filter((e) => e.id).map((e) => [e.id as string, e]));
  const nuevos = new Map(n.ejercicios.filter((e) => e.id).map((e) => [e.id as string, e]));
  const vistos = new Set<string>();
  const ejercicios: EjercicioEditor[] = [];
  for (const e of m.ejercicios) {
    if (!e.id) { ejercicios.push(e); continue; }
    vistos.add(e.id);
    const ev = viejos.get(e.id);
    const en = nuevos.get(e.id);
    if (!en) {
      // El otro lo quitó: si el trainer no lo tocó, queda quitado; si lo
      // cambió, vuelve como un renglón nuevo (su id ya no existe).
      if (!ev || firmaEjercicio(ev) !== firmaEjercicio(e)) ejercicios.push(copiaDeEjercicio(e));
      continue;
    }
    ejercicios.push(ev ? mezclarEjercicio(ev, e, en) : e);
  }
  // Lo que agregó el otro en este día, al final.
  for (const en of n.ejercicios) {
    if (en.id && !vistos.has(en.id) && !viejos.has(en.id)) ejercicios.push(en);
  }
  return {
    ...m,
    nombre: elegir(v.nombre, m.nombre, n.nombre),
    notas: elegir(v.notas, m.notas, n.notas),
    ejercicios: acomodar(ejercicios),
  };
}

/**
 * Lo que quedó en el celular (`mia`), encima de una versión que otro guardó
 * después (`nueva`), sabiendo de qué versión se partió (`vieja`).
 *
 * Es el camino del choque de versión: «Recargar» deja lo editado en el
 * celular y trae la última; «Recuperar» la tenía que pisar entera, y con
 * ella la carga que alguien subió desde la agenda (42,5 → 40, y en el
 * progreso «bajó»). Ahora, campo por campo y renglón por renglón (por id):
 *   · lo que el trainer no tocó sale de la versión nueva;
 *   · lo que tocó, queda como lo dejó (si los dos cambiaron lo mismo, gana
 *     el que está guardando, que lo tiene a la vista);
 *   · lo que el otro agregó se suma al final; lo que quitó, se va, salvo que
 *     el trainer lo haya cambiado (entonces vuelve como nuevo);
 *   · el orden de los días y de los ejercicios es el del trainer.
 */
export function mezclar(vieja: RutinaEditor, mia: RutinaEditor, nueva: RutinaEditor): RutinaEditor {
  const viejos = new Map(vieja.dias.filter((d) => d.id).map((d) => [d.id as string, d]));
  const nuevos = new Map(nueva.dias.filter((d) => d.id).map((d) => [d.id as string, d]));
  const vistos = new Set<string>();
  const dias: DiaEditor[] = [];
  for (const d of mia.dias) {
    if (!d.id) { dias.push(d); continue; }
    vistos.add(d.id);
    const dv = viejos.get(d.id);
    const dn = nuevos.get(d.id);
    if (!dn) {
      if (!dv || firmaDia(dv) !== firmaDia(d)) {
        dias.push({ clave: nuevaClave(), nombre: d.nombre, notas: d.notas, ejercicios: d.ejercicios.map((e) => copiaDeEjercicio(e)) });
      }
      continue;
    }
    dias.push(dv ? mezclarDia(dv, d, dn) : d);
  }
  for (const dn of nueva.dias) {
    if (dn.id && !vistos.has(dn.id) && !viejos.has(dn.id)) dias.push(dn);
  }
  return {
    nombre: elegir(vieja.nombre, mia.nombre, nueva.nombre),
    notas: elegir(vieja.notas, mia.notas, nueva.notas),
    semanas: elegir(vieja.semanas ?? null, mia.semanas ?? null, nueva.semanas ?? null),
    // Nunca sin días: si todo se fue, queda lo del trainer tal cual.
    dias: (dias.length ? dias : mia.dias).slice(0, TOPES.dias),
  };
}

export function cantidadDeEjercicios(r: RutinaEditor): number {
  return r.dias.reduce((s, d) => s + d.ejercicios.length, 0);
}

// ─────────────────────────── nombres de ejercicio ───────────────────────────

/**
 * Le pone el nombre a un ejercicio, eligiendo el de la biblioteca si ya
 * existe uno igual (sin mirar mayúsculas, tildes ni espacios: la misma
 * clave que usa la base).
 *
 * El editor nunca renombra un ejercicio de la biblioteca: si el nombre
 * nuevo es el mismo ejercicio, queda el de siempre; si es otro, se elige
 * ese o se manda el nombre para que la base lo cree. Un apagado no se toma
 * por id: por nombre, la base lo vuelve a prender.
 */
export function conNombre(
  e: EjercicioEditor,
  nombre: string,
  biblioteca: readonly EjercicioBiblioteca[],
): EjercicioEditor {
  const limpio = nombre.replace(/\s+/g, ' ').trim().slice(0, LARGOS.ejercicio);
  const clave = claveEjercicio(limpio);
  if (e.ejercicio_id && claveEjercicio(e.nombre) === clave) return e;
  const propio = biblioteca.find((b) => b.activo && claveEjercicio(b.nombre) === clave);
  if (propio) return { ...e, nombre: propio.nombre, ejercicio_id: propio.id };
  const { ejercicio_id: _fuera, ...sinBiblioteca } = e;
  return { ...sinBiblioteca, nombre: limpio };
}

/** ¿Este nombre ya está en la biblioteca del negocio? */
export function esDeLaBiblioteca(nombre: string, biblioteca: readonly EjercicioBiblioteca[]): boolean {
  const clave = claveEjercicio(nombre);
  return !!clave && biblioteca.some((b) => claveEjercicio(b.nombre) === clave);
}

/** Un ejercicio leído (renglón rápido, texto pegado) como tarjeta del editor. */
export function desdeLeido(
  leido: EjercicioLeido,
  biblioteca: readonly EjercicioBiblioteca[],
): EjercicioEditor {
  const base: EjercicioEditor = {
    clave: nuevaClave(),
    nombre: '',
    series: leido.series !== null && leido.series >= 1 && leido.series <= TOPES.series ? leido.series : null,
    reps: (leido.reps ?? '').slice(0, 60),
    // Tal cual la leyó rutina-texto.ts: con la forma prolija y sin unidad inventada.
    carga: leido.carga ?? '',
    descanso_seg: leido.descanso_seg !== null && leido.descanso_seg >= 0 && leido.descanso_seg <= TOPES.descanso
      ? leido.descanso_seg : null,
    nota: (leido.nota ?? '').slice(0, LARGOS.nota),
    junto_al_anterior: !!leido.junto_al_anterior,
  };
  return conNombre(base, leido.nombre, biblioteca);
}

// ─────────────────────────── la carga ───────────────────────────

/**
 * Una carga que es solo un número («40», «20-25»): no dice si son kilos,
 * libras o placas. No se completa sola; la pantalla lo marca para que el
 * trainer toque la unidad.
 */
export function cargaSinUnidad(carga: string): boolean {
  const s = normalizarCarga(carga);
  return !!s && unidadDe(s) === null && /^\d+(?:[.,]\d+)?(?:\s*[-/]\s*\d+(?:[.,]\d+)?)*$/.test(s);
}

/** «4 × 8-10 · 40 kg · 1:30»: lo que dice la tarjeta debajo del nombre. */
export function resumenEjercicio(e: EjercicioEditor, palabraSeries: string): string {
  return [
    seriesPorReps(e.series, e.reps, palabraSeries),
    e.carga.trim(),
    formatoDescanso(e.descanso_seg),
  ].filter(Boolean).join(' · ');
}

// ─────────────────────────── cambios a la rutina ───────────────────────────

/** El primero de un día no puede ir «junto al anterior»: no hay anterior. */
function acomodar(ejercicios: EjercicioEditor[]): EjercicioEditor[] {
  if (ejercicios.length && ejercicios[0].junto_al_anterior) {
    return [{ ...ejercicios[0], junto_al_anterior: false }, ...ejercicios.slice(1)];
  }
  return ejercicios;
}

function conDia(r: RutinaEditor, i: number, cambio: (d: DiaEditor) => DiaEditor): RutinaEditor {
  return { ...r, dias: r.dias.map((d, k) => (k === i ? cambio(d) : d)) };
}

export function cambiarDia(r: RutinaEditor, i: number, cambio: Partial<Pick<DiaEditor, 'nombre' | 'notas'>>): RutinaEditor {
  return conDia(r, i, (d) => ({ ...d, ...cambio }));
}

export function agregarDia(r: RutinaEditor, nombre: string): RutinaEditor {
  if (r.dias.length >= TOPES.dias) return r;
  return { ...r, dias: [...r.dias, diaVacio(nombre)] };
}

/** La copia va al lado del original, sin ids: para la base es un día nuevo. */
export function duplicarDia(r: RutinaEditor, i: number, nombre: string): RutinaEditor {
  if (r.dias.length >= TOPES.dias || !r.dias[i]) return r;
  const d = r.dias[i];
  const copia: DiaEditor = {
    clave: nuevaClave(),
    nombre: nombre.slice(0, LARGOS.nombreDia),
    notas: d.notas,
    ejercicios: d.ejercicios.map((e) => copiaDeEjercicio(e)),
  };
  return { ...r, dias: [...r.dias.slice(0, i + 1), copia, ...r.dias.slice(i + 1)] };
}

export function quitarDia(r: RutinaEditor, i: number): RutinaEditor {
  if (r.dias.length <= 1) return r;
  return { ...r, dias: r.dias.filter((_, k) => k !== i) };
}

export function moverDia(r: RutinaEditor, i: number, delta: -1 | 1): RutinaEditor {
  const j = i + delta;
  if (j < 0 || j >= r.dias.length) return r;
  const dias = [...r.dias];
  [dias[i], dias[j]] = [dias[j], dias[i]];
  return { ...r, dias };
}

/** Suma ejercicios al final de un día (o después de `despuesDe`), sin pasarse del tope. */
export function agregarEjercicios(
  r: RutinaEditor, dia: number, nuevos: EjercicioEditor[], despuesDe?: number,
): RutinaEditor {
  return conDia(r, dia, (d) => {
    const lugar = Math.max(0, TOPES.ejerciciosPorDia - d.ejercicios.length);
    const entran = nuevos.slice(0, lugar);
    const donde = despuesDe === undefined ? d.ejercicios.length : despuesDe + 1;
    return {
      ...d,
      ejercicios: acomodar([...d.ejercicios.slice(0, donde), ...entran, ...d.ejercicios.slice(donde)]),
    };
  });
}

export function reemplazarEjercicio(r: RutinaEditor, dia: number, j: number, e: EjercicioEditor): RutinaEditor {
  return conDia(r, dia, (d) => ({
    ...d,
    ejercicios: acomodar(d.ejercicios.map((x, k) => (k === j ? e : x))),
  }));
}

/**
 * Quitar uno no desarma la superserie del que sigue: si se va el «2a», el
 * «2b» pasa a encabezar el grupo en vez de pegarse al ejercicio de arriba.
 */
export function quitarEjercicio(r: RutinaEditor, dia: number, j: number): RutinaEditor {
  return conDia(r, dia, (d) => {
    const ejercicios = [...d.ejercicios];
    const [quitado] = ejercicios.splice(j, 1);
    if (quitado && ejercicios[j]?.junto_al_anterior) {
      ejercicios[j] = { ...ejercicios[j], junto_al_anterior: quitado.junto_al_anterior };
    }
    return { ...d, ejercicios: acomodar(ejercicios) };
  });
}

/** ↑ ↓: con botones y no arrastrando, que en el celular falla. */
export function moverEjercicio(r: RutinaEditor, dia: number, j: number, delta: -1 | 1): RutinaEditor {
  return conDia(r, dia, (d) => {
    const k = j + delta;
    if (k < 0 || k >= d.ejercicios.length) return d;
    const ejercicios = [...d.ejercicios];
    [ejercicios[j], ejercicios[k]] = [ejercicios[k], ejercicios[j]];
    return { ...d, ejercicios: acomodar(ejercicios) };
  });
}

/** La copia va justo abajo, suelta (no en superserie con el original). */
export function duplicarEjercicio(r: RutinaEditor, dia: number, j: number): RutinaEditor {
  const d = r.dias[dia];
  if (!d?.ejercicios[j] || d.ejercicios.length >= TOPES.ejerciciosPorDia) return r;
  const copia = { ...copiaDeEjercicio(d.ejercicios[j]), junto_al_anterior: false };
  return agregarEjercicios(r, dia, [copia], j);
}

export function alternarJunto(r: RutinaEditor, dia: number, j: number): RutinaEditor {
  if (j === 0) return r;
  return conDia(r, dia, (d) => ({
    ...d,
    ejercicios: d.ejercicios.map((e, k) => (k === j ? { ...e, junto_al_anterior: !e.junto_al_anterior } : e)),
  }));
}

// ─────────────────────────── guardar ───────────────────────────

export type Problema =
  | { tipo: 'sinEjercicios' }
  | { tipo: 'muchosDias' }
  | { tipo: 'muchosEjercicios'; dia: number }
  | { tipo: 'sinNombre'; dia: number; ejercicio: number }
  | { tipo: 'cargaLarga'; dia: number; ejercicio: number }
  | { tipo: 'repsLargas'; dia: number; ejercicio: number };

/**
 * Lo que la base rechazaría, dicho antes de mandar y con el día donde está.
 * Una carga o unas repeticiones largas no se recortan: «25 lb por lado»
 * cortado a la mitad puede decir otra cosa.
 */
export function validar(r: RutinaEditor): Problema | null {
  if (r.dias.length > TOPES.dias) return { tipo: 'muchosDias' };
  if (cantidadDeEjercicios(r) === 0) return { tipo: 'sinEjercicios' };
  for (let i = 0; i < r.dias.length; i++) {
    const d = r.dias[i];
    if (d.ejercicios.length > TOPES.ejerciciosPorDia) return { tipo: 'muchosEjercicios', dia: i };
    for (let j = 0; j < d.ejercicios.length; j++) {
      const e = d.ejercicios[j];
      if (!e.ejercicio_id && !e.nombre.trim()) return { tipo: 'sinNombre', dia: i, ejercicio: j };
      if (e.carga.trim().length > LARGOS.carga) return { tipo: 'cargaLarga', dia: i, ejercicio: j };
      if (e.reps.trim().length > LARGOS.reps) return { tipo: 'repsLargas', dia: i, ejercicio: j };
    }
  }
  return null;
}

/**
 * Lo que se manda en `p_datos`. Cada día y cada ejercicio con su id si lo
 * tiene (se conservan), el ejercicio de la biblioteca por id o por nombre, y
 * un nombre para el día que quedó vacío (la base pide de 1 a 40 letras).
 */
export function paraGuardar(
  r: RutinaEditor,
  nombres: { rutina: string; dia: (i: number) => string },
): RutinaParaGuardar {
  return {
    nombre: (r.nombre.trim() || nombres.rutina).slice(0, LARGOS.nombreRutina),
    notas: r.notas.trim().slice(0, LARGOS.notasRutina),
    semanas: r.semanas !== null && r.semanas >= 1 && r.semanas <= TOPES.semanas ? r.semanas : null,
    dias: r.dias.map((d, i) => ({
      ...(d.id ? { id: d.id } : {}),
      nombre: (d.nombre.trim() || nombres.dia(i)).slice(0, LARGOS.nombreDia),
      notas: d.notas.trim().slice(0, LARGOS.notasDia),
      ejercicios: d.ejercicios.map((e, j) => ({
        ...(e.id ? { id: e.id } : {}),
        ...(e.ejercicio_id ? { ejercicio_id: e.ejercicio_id } : { nombre: e.nombre.trim() }),
        series: e.series,
        reps: e.reps.trim(),
        carga: e.carga.trim(),
        descanso_seg: e.descanso_seg,
        nota: e.nota.trim().slice(0, LARGOS.nota),
        junto_al_anterior: j > 0 && e.junto_al_anterior,
      })),
    })),
  };
}

/** Los nombres de ejercicio de una lista que todavía no están en la biblioteca (sin repetir). */
export function nombresNuevos(nombres: readonly string[], biblioteca: readonly EjercicioBiblioteca[]): string[] {
  const propias = new Set(biblioteca.map((b) => claveEjercicio(b.nombre)));
  const vistas = new Set<string>();
  const nuevos: string[] = [];
  for (const n of nombres) {
    const k = claveEjercicio(n);
    if (!k || propias.has(k) || vistas.has(k)) continue;
    vistas.add(k);
    nuevos.push(n);
  }
  return nuevos;
}
