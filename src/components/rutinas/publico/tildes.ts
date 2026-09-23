/**
 * LOS TILDES DEL CLIENTE (098): qué ejercicios ya hizo hoy, guardado en su
 * celular.
 *
 * En la fase 1 el link no escribe nada en la base: lo que el cliente marca
 * queda en el navegador de ese teléfono, y al otro día arranca vacío. Por
 * eso los tildes van con la fecha del CELULAR (es donde está parado el
 * cliente) y se guardan por id de renglón y no por posición: la 098
 * conserva ese id al guardar, así que si el trainer reordena los
 * ejercicios, cada tilde sigue en el suyo.
 *
 * Una sola clave por link (`orden:rutina:<token>`): dos personas que usan el
 * mismo teléfono (madre e hijo) no se mezclan, y como se pisa cada día, no
 * se acumulan claves viejas.
 *
 * Además de los de hoy se recuerda el último tilde de un día ANTERIOR: es
 * lo que dice en qué día de la rutina abrir la próxima vez (ver
 * `diaParaAbrir`).
 *
 * Todo con try/catch: en una ventana privada, con los datos del sitio
 * bloqueados o en el navegador de alguna app, localStorage puede no estar
 * o tirar error. Ahí los tildes duran lo que dura la pestaña, y la rutina
 * se ve igual.
 */

/** Un tilde: qué renglón, en qué día de la rutina (su número) y qué día del calendario. */
export interface Marca {
  id: string;
  dia: number;
  fecha: string;
}

export interface Tildes {
  /** El día del celular al que corresponden `hechos` y `ultimo`. */
  fecha: string;
  /** Los ids de los renglones hechos ese día. */
  hechos: string[];
  /** El último tildado HOY que sigue tildado; null si hoy no hay ninguno. */
  ultimo: Marca | null;
  /** El último tildado de un día anterior. */
  previo: Marca | null;
}

const clave = (token: string) => `orden:rutina:${token}`;

/** Hoy, en el celular: '2026-09-22'. */
export function hoyDelCelular(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function marca(x: unknown): Marca | null {
  if (!x || typeof x !== 'object') return null;
  const m = x as Record<string, unknown>;
  if (typeof m.id !== 'string' || typeof m.fecha !== 'string') return null;
  return { id: m.id, dia: Number(m.dia) || 0, fecha: m.fecha };
}

/**
 * Lo guardado para este link, visto desde `hoy`. Si lo guardado es de otro
 * día, los hechos arrancan vacíos y su último tilde pasa a ser el previo.
 */
export function leerTildes(token: string, hoy: string): Tildes {
  const vacio: Tildes = { fecha: hoy, hechos: [], ultimo: null, previo: null };
  try {
    const crudo = localStorage.getItem(clave(token));
    if (!crudo) return vacio;
    const g = JSON.parse(crudo);
    if (!g || typeof g !== 'object') return vacio;
    const ultimo = marca(g.ultimo);
    const previo = marca(g.previo);
    if (g.fecha !== hoy) return { fecha: hoy, hechos: [], ultimo: null, previo: ultimo ?? previo };
    const hechos = Array.isArray(g.hechos)
      // Un día tiene como mucho 30 ejercicios y una rutina 10 días.
      ? g.hechos.filter((x: unknown): x is string => typeof x === 'string').slice(0, 300)
      : [];
    return { fecha: hoy, hechos, ultimo: hechos.length ? ultimo : null, previo };
  } catch {
    return vacio;
  }
}

function guardarTildes(token: string, tildes: Tildes): void {
  try {
    localStorage.setItem(clave(token), JSON.stringify(tildes));
  } catch {
    // Modo privado o sin lugar: el tilde queda en pantalla hasta que se cierre.
  }
}

/** Tilda o destilda un renglón hoy. Devuelve lo nuevo, ya guardado. */
export function alternarTilde(
  token: string, actual: Tildes, ejercicioId: string, numeroDia: number, hoy: string,
): Tildes {
  // Si la pestaña quedó abierta desde ayer, lo de ayer pasa a ser el previo.
  const base: Tildes = actual.fecha === hoy
    ? actual
    : { fecha: hoy, hechos: [], ultimo: null, previo: actual.ultimo ?? actual.previo };
  let nuevo: Tildes;
  if (base.hechos.includes(ejercicioId)) {
    const hechos = base.hechos.filter((id) => id !== ejercicioId);
    // Destildar el último vuelve al anterior de hoy; destildar todo deja
    // solo el previo, así un tilde por error no cambia el día de mañana.
    const ultimo = !hechos.length
      ? null
      : base.ultimo && base.ultimo.id !== ejercicioId
        ? base.ultimo
        : { id: hechos[hechos.length - 1], dia: base.ultimo?.dia ?? numeroDia, fecha: hoy };
    nuevo = { ...base, hechos, ultimo };
  } else {
    nuevo = { ...base, hechos: [...base.hechos, ejercicioId], ultimo: { id: ejercicioId, dia: numeroDia, fecha: hoy } };
  }
  guardarTildes(token, nuevo);
  return nuevo;
}

/**
 * En qué día de la rutina abrir (su posición en `dias`).
 *
 * El siguiente al último que se tildó en este celular, o el primero si
 * nunca tildó nada. Con una excepción: si hoy ya tildó algo, se abre en ese
 * mismo día, porque el cliente está en plena sesión (se le bloqueó el
 * teléfono, volvió a abrir el link) y saltar al siguiente le escondería lo
 * que le falta.
 *
 * El día se busca por el ejercicio tildado y no por su número: si el
 * trainer reordenó los días, el ejercicio sigue estando en el suyo. Si ese
 * ejercicio ya no está, se prueba con el número de día; si tampoco, el primero.
 */
export function diaParaAbrir(
  dias: { orden: number; ejercicios: { id: string }[] }[],
  tildes: Tildes,
): number {
  const hoy = tildes.ultimo;
  const m = hoy ?? tildes.previo;
  if (!m || dias.length === 0) return 0;
  let i = dias.findIndex((d) => d.ejercicios.some((e) => e.id === m.id));
  if (i < 0) i = dias.findIndex((d) => d.orden === m.dia);
  if (i < 0) return 0;
  return hoy ? i : (i + 1) % dias.length;
}
