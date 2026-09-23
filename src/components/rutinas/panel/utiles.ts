/**
 * CUENTAS CHICAS DE LAS PANTALLAS DE RUTINAS (098).
 *
 * Lo que repiten la lista, la carpeta y el progreso: fechas cortas, números
 * con signo, las etiquetas 2a/2b de una superserie y el portapapeles. Sin
 * React ni directiva de cliente: también lo importan las páginas (el UUID).
 */

/** Un id que llega por la dirección puede venir roto: la base no lo aceptaría. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** «Ana Ruiz» → «Ana». Los mensajes al cliente van con el nombre de pila. */
export function primerNombre(nombre: string | null | undefined): string {
  return (nombre ?? '').trim().split(/\s+/)[0] ?? '';
}

/** «05/09» o «05/09/25». */
function diaMes(d: number, m: number, a?: number): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return a === undefined ? `${dos(d)}/${dos(m)}` : `${dos(d)}/${dos(m)}/${dos(a % 100)}`;
}

/**
 * «15/09», como lo dice un trainer. Con el año («15/09/25») solo si no es el
 * de `hoy`: una rutina de hace un año sin el año parece de este.
 *
 * Se arma a mano y no con Intl: en español, ICU da «5/9» aunque se le pidan
 * dos dígitos, y en portugués «05/09». Los dos idiomas de Orden escriben
 * día/mes, así que el `locale` hoy no cambia nada; queda en la firma para el
 * día que haya un idioma que lo escriba al revés.
 *
 * No pasa por la zona del teléfono: la fecha ya es del negocio
 * ('YYYY-MM-DD'), y convertirla la correría un día.
 */
export function fechaCorta(iso: string | null | undefined, locale: string, hoy?: string): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return iso;
  const conAnio = !!hoy && hoy.slice(0, 4) !== iso.slice(0, 4);
  return diaMes(d, m, conAnio ? a : undefined);
}

/**
 * Un momento (updated_at) como fecha corta EN LA ZONA DEL NEGOCIO: lo que
 * se guardó a las 22:00 en Asunción ya es mañana en UTC.
 */
export function fechaDeMomento(momento: string | null | undefined, locale: string, zona: string): string {
  if (!momento) return '';
  const f = new Date(momento);
  if (Number.isNaN(f.getTime())) return '';
  // Los números del día y el mes en la zona del negocio; el formato, a mano
  // (ver fechaCorta). Una zona que el navegador no conoce cae en UTC.
  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'numeric', timeZone: zona }).formatToParts(f);
  } catch {
    partes = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }).formatToParts(f);
  }
  const d = Number(partes.find((p) => p.type === 'day')?.value);
  const m = Number(partes.find((p) => p.type === 'month')?.value);
  return d && m ? diaMes(d, m) : '';
}

/** «78,4» (con la coma del idioma), sin separador de miles: son medidas, no plata. */
export function cifra(n: number, locale: string, decimales = 1): string {
  return n.toLocaleString(locale, { maximumFractionDigits: decimales, useGrouping: false });
}

/**
 * La diferencia con su signo: «+1,5», «−4,5», «0». El menos es el signo de
 * verdad (−) y no un guion, que en letra chica se pierde.
 */
export function conSigno(n: number, locale: string, decimales = 1): string {
  if (n > 0) return `+${cifra(n, locale, decimales)}`;
  if (n < 0) return `−${cifra(Math.abs(n), locale, decimales)}`;
  return cifra(0, locale, decimales);
}

/**
 * El número de cada ejercicio de un día: «1», «2a», «2b», «3». Una
 * superserie comparte el número y se distingue por la letra, como en la
 * planilla de cualquier gimnasio (y como lo escribe `rutinaComoTexto`).
 */
export function etiquetasDelDia(ejercicios: readonly { junto_al_anterior?: boolean }[]): string[] {
  const juntos = ejercicios.map((e, i) => i > 0 && !!e.junto_al_anterior);
  const grupos: number[] = [];
  let g = 0;
  for (let i = 0; i < ejercicios.length; i++) {
    if (!juntos[i]) g++;
    grupos.push(g);
  }
  const tamano = (n: number) => grupos.filter((x) => x === n).length;
  let letra = 0;
  return ejercicios.map((_, i) => {
    letra = juntos[i] ? letra + 1 : 0;
    return tamano(grupos[i]) > 1 ? `${grupos[i]}${String.fromCharCode(97 + Math.min(letra, 25))}` : `${grupos[i]}`;
  });
}

/** «4 × 8-10», «4 series» o «45 s»: lo que se hace, como lo escribió el trainer. */
export function seriesPorReps(series: number | null, reps: string, palabraSeries: string): string {
  const r = (reps ?? '').trim();
  if (series !== null && series !== undefined && r) return `${series} × ${r}`;
  if (series !== null && series !== undefined) return `${series} ${palabraSeries}`;
  return r;
}

/**
 * El número de una carga y su unidad: «40 kg» → 40 kg, «placa 7» → 7
 * placa, «40» → 40 sin unidad. Null si no hay número («banda roja»).
 */
export function numeroDeCarga(carga: string | null | undefined): { n: number; unidad: string } | null {
  const s = (carga ?? '').toLowerCase();
  const m = /(\d+(?:[.,]\d+)?)/.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const unidad = /\d\s*kg\b/.test(s) ? 'kg' : /\d\s*lb\b/.test(s) ? 'lb' : /placa/.test(s) ? 'placa' : '';
  return { n, unidad };
}

/**
 * ¿La carga subió? Solo si las dos tienen número y la MISMA unidad: de
 * «40 kg» a «25 lb» no se sabe (25 lb son menos), y de «banda roja» a
 * «banda verde» tampoco. En la duda no se festeja nada en el resumen.
 */
export function cargaSubio(antes: string | null | undefined, despues: string | null | undefined): boolean {
  const a = numeroDeCarga(antes), d = numeroDeCarga(despues);
  return !!a && !!d && a.unidad === d.unidad && d.n > a.n;
}

/** El link que abre el cliente: `https://…/rutina/<token>`. */
export function linkDeRutina(origen: string, token: string): string {
  return `${origen.replace(/\/+$/, '')}/rutina/${token}`;
}

/**
 * Copia al portapapeles. Si el navegador no deja (un navegador viejo, o el
 * de adentro de alguna app), prueba el camino antiguo antes de rendirse:
 * la pantalla avisa si no se pudo, y nunca dice «copiado» sin haberlo hecho.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Sigue con el camino antiguo.
  }
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
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
