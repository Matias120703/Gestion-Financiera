/**
 * LO QUE NO SE GUARDÓ, GUARDADO EN EL CELULAR (098).
 *
 * El editor no autoguarda en la base: si lo hiciera, el cliente vería en su
 * link una rutina a medio editar. Pero un trainer arma rutinas en el
 * gimnasio, con una señal que va y viene, y un corte a mitad de camino no
 * se puede llevar veinte ejercicios. Así que mientras edita, cada cambio
 * queda en el `localStorage` de ese celular, y al volver se le ofrece
 * «Recuperar lo que no guardaste».
 *
 * Es solo una ayuda: puede no haber almacenamiento (navegación privada, el
 * navegador de adentro de una app, sin espacio) y entonces no pasa nada.
 * Por eso todo va con try/catch y lo que se lee se revisa campo por campo:
 * un dato roto o de una versión vieja del editor se ignora, no rompe.
 */
import { LARGOS } from '@/lib/rutina-texto';
import { nuevaClave, type DiaEditor, type EjercicioEditor, type RutinaEditor } from './modelo';

const PREFIJO = 'orden:rutina-editor:';

export interface BorradorLocal {
  /** Cuándo se escribió (ISO). */
  guardado: string;
  /** La versión de la rutina sobre la que se editó (null si era nueva). */
  version: number | null;
  datos: RutinaEditor;
  /**
   * La rutina como estaba en la base cuando se empezó a editar (la de
   * `version`). Si al volver alguien la guardó en el medio, comparar contra
   * esta es lo que dice qué tocó el trainer y qué no: lo que no tocó se
   * toma de la versión nueva (ver `mezclar` en modelo.ts) y no se pisa.
   * Null si era nueva, o si el borrador es de antes de guardarla.
   */
  base: RutinaEditor | null;
}

/**
 * La clave de cada rutina: por negocio (un celular compartido entre dos
 * cuentas no mezcla), y la nueva por cliente o como plantilla.
 */
export function claveBorrador(empresaId: string, rutinaId: string | null, clienteId: string | null): string {
  if (rutinaId) return `${PREFIJO}${empresaId}:${rutinaId}`;
  return `${PREFIJO}${empresaId}:nueva:${clienteId ?? 'plantilla'}`;
}

export function leerBorradorLocal(clave: string): BorradorLocal | null {
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return null;
    const x = JSON.parse(crudo) as { guardado?: unknown; version?: unknown; datos?: unknown; base?: unknown };
    const datos = rutinaDe(x?.datos);
    if (!datos || typeof x.guardado !== 'string') return null;
    const version = typeof x.version === 'number' ? x.version : null;
    // Sin versión no hay con qué comparar: la base solo sirve junto a ella.
    const base = version !== null && x.base ? rutinaDe(x.base) : null;
    return { guardado: x.guardado, version, datos, base };
  } catch {
    return null;
  }
}

export function guardarBorradorLocal(
  clave: string, datos: RutinaEditor, version: number | null, base: RutinaEditor | null = null,
): void {
  try {
    const b: BorradorLocal = { guardado: new Date().toISOString(), version, datos, base: version !== null ? base : null };
    window.localStorage.setItem(clave, JSON.stringify(b));
  } catch {
    // Sin almacenamiento: el editor sigue igual, solo que sin red de seguridad.
  }
}

export function borrarBorradorLocal(clave: string): void {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    // Nada que borrar si no hay almacenamiento.
  }
}

// ─────────────────────────── revisar lo leído ───────────────────────────

const texto = (v: unknown, tope: number) => (typeof v === 'string' ? v.slice(0, tope) : '');
const entero = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
const idDe = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function ejercicioDe(x: unknown): EjercicioEditor | null {
  if (!x || typeof x !== 'object') return null;
  const e = x as Record<string, unknown>;
  const nombre = texto(e.nombre, LARGOS.ejercicio);
  const ejercicio_id = idDe(e.ejercicio_id);
  if (!nombre.trim() && !ejercicio_id) return null;
  const id = idDe(e.id);
  return {
    clave: idDe(e.clave) ?? nuevaClave(),
    ...(id ? { id } : {}),
    ...(ejercicio_id ? { ejercicio_id } : {}),
    nombre,
    series: entero(e.series, 1, 20),
    // Largos de más no se recortan acá: el editor los muestra y frena al guardar.
    reps: texto(e.reps, 60),
    carga: texto(e.carga, 60),
    descanso_seg: entero(e.descanso_seg, 0, 900),
    nota: texto(e.nota, LARGOS.nota),
    junto_al_anterior: e.junto_al_anterior === true,
  };
}

function diaDe(x: unknown): DiaEditor | null {
  if (!x || typeof x !== 'object') return null;
  const d = x as Record<string, unknown>;
  if (!Array.isArray(d.ejercicios)) return null;
  const id = idDe(d.id);
  return {
    clave: idDe(d.clave) ?? nuevaClave(),
    ...(id ? { id } : {}),
    nombre: texto(d.nombre, LARGOS.nombreDia),
    notas: texto(d.notas, LARGOS.notasDia),
    ejercicios: d.ejercicios.map(ejercicioDe).filter((e): e is EjercicioEditor => e !== null)
      .map((e, i) => (i === 0 && e.junto_al_anterior ? { ...e, junto_al_anterior: false } : e)),
  };
}

function rutinaDe(x: unknown): RutinaEditor | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (!Array.isArray(r.dias)) return null;
  const dias = r.dias.map(diaDe).filter((d): d is DiaEditor => d !== null).slice(0, 10);
  if (!dias.length) return null;
  return {
    nombre: texto(r.nombre, LARGOS.nombreRutina),
    notas: texto(r.notas, LARGOS.notasRutina),
    semanas: entero(r.semanas, 1, 52),
    dias,
  };
}
