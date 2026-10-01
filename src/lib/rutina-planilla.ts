/**
 * DE UNA PLANILLA A UNA RUTINA (114): el Excel o el Google Sheets del trainer.
 *
 * Muchos trainers ya tienen sus rutinas en una planilla. Este convertidor la
 * acomoda en días y ejercicios POR REGLAS, sin IA (la privacidad lo promete),
 * y todo termina en `leerRutina`, el mismo lector de «Pegar texto»: parte la
 * planilla en pedazos, escribe cada pedazo como texto con tabuladores y lo
 * lee. Así hereda todos los arreglos del lector y sus pruebas: nunca se
 * inventa nada, y la carga nunca gana una unidad.
 *
 * Lo que hace el convertidor antes de leer (PLANILLAS-EJEMPLO.md, F1-F10):
 *
 *   1. Las hojas. Una por día («Lunes - Piernas»): el nombre de la hoja es el
 *      del día si adentro no hay otro. Los nombres genéricos («Hoja1»,
 *      «Sheet1», «Planilha1», «Rutina») no dan nombre. «Semana 1», «S2»,
 *      «Week 3», «Microciclo 1» son semanas, no días. Una hoja sin ejercicios
 *      («Medidas», «Anamnese») no se usa y NADA de ella se muestra.
 *   2. El encabezado de la hoja: «Alumno: Juan», «Fecha: …», «Profesor: …»
 *      se descartan y solo se nombran las etiquetas en un aviso (D3.5);
 *      «Objetivo» y «Frecuencia» van a las indicaciones; «Duración: 4
 *      semanas» o «Validade: 8 semanas» va a las semanas del editor.
 *   3. Los días lado a lado: separados por columnas vacías, con «Ejercicio»
 *      repetido en el encabezado, o una fila «DÍA 1 | DÍA 2 | DÍA 3». Cada
 *      bloque se lee aparte y su título es el nombre del día.
 *   4. Las semanas (D3.4): en columnas («Semana 1» arriba de Series/Reps/RIR,
 *      o «S1 S2 S3»), apiladas («SEMANA 2» sola en su fila) o una hoja por
 *      semana. Se usa UNA (la 1, o la que elija el trainer): nunca se arman
 *      varias rutinas ni se juntan los días de todas.
 *   5. Una fila por serie (columna «Serie» con 1, 2, 3 y el mismo ejercicio
 *      seguido): se junta en uno, con las repeticiones y las cargas
 *      distintas unidas con «-» («12-10-8», «40-45-50»).
 *   6. Una tabla que no es de ejercicios («Fecha | Peso | Cintura»,
 *      «Pergunta | Resposta»): no se lee. Son datos del cuerpo o de salud.
 *
 * Lo que agregó la planilla de un trainer de Matías (30/09: «se carga todo
 * para un día»): un libro con la rutina y, al lado, el registro de series,
 * el progreso corporal, un resumen con fórmulas y una guía.
 *   7. Las hojas: por defecto se usa toda hoja con ejercicios de verdad,
 *      salvo lo que dice no ser la rutina (ver `hojasPorDefecto`): el
 *      registro (fecha y RIR, volumen…), el resumen (ejercicios que son
 *      fórmulas), el progreso y la guía (sin ejercicios de verdad), una
 *      lista de ejercicios al lado de la rutina y otra versión de la misma
 *      rutina («Rutina anterior»). La revisión lo dice y el trainer puede
 *      sumarlas a mano (`opciones.hojas`).
 *   8. La «Semana tipo» («Día | Actividad | Enfoque», una fila por día):
 *      la semana armada en ese orden, con los días sin bloque de ejercicios
 *      como días con su nota (`sacarSemanaTipo`, `armarSemana`).
 *   9. Los días: por títulos (también combinados y abreviados: «LUN ·
 *      Pierna»), por la columna «Día» (también combinada), por hojas, por
 *      bloques lado a lado, por una fila de días con su enfoque abajo
 *      («LUNES | MARTES» y «Pierna | Pecho»), y el calendario del mes
 *      («Semana | Lunes | …» con los ejercicios de cada día en una celda;
 *      la misma tabla con «70%» o «✓» es una progresión o una asistencia,
 *      no un calendario). «SEMANA 2 / LUNES» en un título: semanas apiladas.
 *  10. Los descansos solos («Martes: descanso», «JUEVES | DESCANSO»,
 *      «DESCANSO» en la columna de un día) y lo de abajo de todo
 *      («Calentamiento: …») van a las notas de la rutina.
 *
 * Y los avisos para la revisión: fechas que Excel había inventado, series al
 * revés («12 × 3»), cargas sin unidad con la unidad en el encabezado, datos
 * que no se usaron, filas de más, y cuántos links de video trae.
 *
 * `leerTextoPegado`: «Pegar texto» con tabuladores pasa por acá (D3.10), y
 * así deja de perder los días lado a lado y de crear el ejercicio «Alumno:».
 *
 * Este archivo NO importa nada del servidor, de React ni de exceljs: lo usan
 * el editor (en el celular) y las pruebas. El .xlsx lo lee el servidor
 * (planilla-xlsx.ts) y acá llega el `LibroPlanilla` ya armado.
 */
import type { EjercicioLeido } from './tipos-rutinas';
import {
  LARGOS, datosEnTexto, diaDeLaSemana, esDiaLibre, esTituloDeDia, leerRutina, normalizarCarga, partirTitulo,
  tipoDeColumna, unidadDe,
  type Columna, type RutinaLeidaConNotas,
} from './rutina-texto';
import { libroDesdeTexto, type CeldaPlanilla, type HojaPlanilla, type LibroPlanilla } from './planilla';
import { buscarBase, claveEjercicio } from './ejercicios-base';

/** La semana que se usa sola (pregunta 12 de Matías): la primera. */
export const SEMANA_POR_DEFECTO = 1;

/** Los días que entran en una rutina (guardar_rutina, 098: de 1 a 10). */
const MAX_DIAS = 10;
/** Los ejercicios que entran en un día (rutina_dias: de 0 a 30; TOPES.ejerciciosPorDia del editor). */
const MAX_EJERCICIOS_DIA = 30;

/**
 * Las opciones de la revisión: `semana`, cuál de las semanas usar (desde 1;
 * si no, la primera); `hojas`, lo que el trainer cambió a mano en los chips
 * de las hojas («Registro»: true la suma, «Rutina»: false la saca). Por
 * nombre, así sobrevive al cambio de semana; lo que no dice, automático.
 */
export interface OpcionesPlanilla {
  semana?: number;
  hojas?: Record<string, boolean>;
}

export type AvisoPlanilla =
  | { codigo: 'fecha_corregida'; ejercicios: string[] }
  | { codigo: 'series_raras'; ejercicios: { dia: number; indice: number; nombre: string }[] }
  | { codigo: 'cargas_sin_unidad' }
  | { codigo: 'datos_no_usados'; etiquetas: string[] }
  | { codigo: 'filas_recortadas' }
  | { codigo: 'videos'; cuantos: number };

export interface ResultadoPlanilla {
  leida: RutinaLeidaConNotas;
  /** Las semanas que trae la planilla (en columnas, apiladas o por hoja), y cuál se usó (desde 1). */
  semanas: { cuantas: number; elegida: number; nombres: string[] } | null;
  /** «Duración: 4 semanas», «Validade: 8 semanas»: para las semanas del editor. */
  duracionSemanas: number | null;
  /**
   * Las hojas que se leyeron: si se usan, y si tienen ejercicios (solo esas
   * se pueden sumar o sacar a mano). Por defecto se usa solo lo que parece
   * la rutina; un registro, un progreso, un resumen o una guía no.
   */
  hojas: HojaDelResultado[];
  avisos: AvisoPlanilla[];
}

export interface HojaDelResultado { nombre: string; usada: boolean; conEjercicios: boolean }

type Celda = CeldaPlanilla | null;
type Filas = Celda[][];

// ─────────────────────────── utilidades ───────────────────────────

/** Minúsculas y sin tildes. */
function plegar(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** El texto de una celda en un renglón: sin saltos de línea ni tabuladores adentro. */
function txt(c: Celda | undefined): string {
  return (c?.texto ?? '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const llenas = (f: Filas[number]) => f.filter((c) => txt(c) !== '');
const vacia = (f: Filas[number]) => llenas(f).length === 0;
const unica = (f: Filas[number]) => llenas(f).length === 1;
const sinRepetir = <T>(xs: T[]) => [...new Set(xs)];

// «Semana 1», «Semana 4 (descarga)», «S2», «Week 3», «Microciclo 1», «Sem. 2».
const RE_SEMANA = /^(?:semana|sem\.?|s|week|w|microciclo)\s*(\d{1,2})\b/;
// En una fila sola, «S1» es poco: tiene que decir «semana».
const RE_SEMANA_SOLA = /^(?:semana|sem\.|week|microciclo)\s*(\d{1,2})\b(.*)$/;
const RE_PALABRA_DIA = /\b(?:dias?|day|treino|entrenamiento|entreno|sesion|sessao|workout|lunes|martes|miercoles|jueves|viernes|sabado|domingo|segunda|terca|quarta|quinta|sexta)\b/;
// Nombres de hoja que no dicen nada del día.
const RE_HOJA_GENERICA = /^(?:hoja|sheet|planilha|pagina|tabla|tabela|libro|rutina|rutinas|treino|treinos|programa|plan|ficha|entrenamiento|planilla|datos|dados|feuille|foglio)?\s*\d*$/;

const esSemana = (t: string) => RE_SEMANA.test(plegar(t).trim());
/** «SEMANA 2» sola en su fila (y sin decir un día: «Semana 1 - Día 1» es un día). */
function marcaDeSemana(f: Filas[number]): string | null {
  const c = llenas(f);
  if (c.length !== 1) return null;
  const m = RE_SEMANA_SOLA.exec(plegar(txt(c[0])));
  return m && !RE_PALABRA_DIA.test(m[2]) ? txt(c[0]) : null;
}

// «SEMANA 1 / LUNES», «Semana 2 – Día 1», «SEMANA 3 / SEGUNDA»: la semana y el día en el mismo título.
const RE_SEMANA_Y_DIA = /^((?:semana|sem\.?|week|microciclo)\s*(\d{1,2}))\s*[/\-–—:|·,]\s*(\S.*)$/i;

/**
 * LA SEMANA Y EL DÍA EN EL MISMO TÍTULO (30/09, revisión): un mesociclo con
 * un bloque por día y por semana, «SEMANA 1 / LUNES» … «SEMANA 4 /
 * VIERNES». Antes cada título era un día (12 días, y la revisión no dejaba
 * usar nada) o se mezclaban las semanas. Como las semanas apiladas: se usa
 * la elegida, y el título queda con el día («LUNES», «Día 1»). Con una sola
 * semana no hace falta elegir y el título queda como está.
 */
function semanasEnTitulos(filas: Filas): { nombres: string[]; filas: (cual: number) => Filas } | null {
  const titulos: { r: number; k: number; n: number; semana: string; dia: string }[] = [];
  filas.forEach((f, r) => {
    if (!unica(f)) return;
    const k = f.findIndex((c) => txt(c));
    const m = RE_SEMANA_Y_DIA.exec(txt(f[k]));
    if (m && esTituloDeDia(m[3])) titulos.push({ r, k, n: +m[2], semana: m[1], dia: m[3].trim() });
  });
  const numeros = sinRepetir(titulos.map((t) => t.n));
  if (numeros.length < 2) return null;
  return {
    nombres: numeros.map((n) => (titulos.find((t) => t.n === n) as { semana: string }).semana),
    filas: (cual) => {
      const n = numeros[Math.min(Math.max(cual, 1), numeros.length) - 1];
      const out: Filas = filas.slice(0, titulos[0].r);
      titulos.forEach((t, i) => {
        if (t.n !== n) return;
        const hasta = i + 1 < titulos.length ? titulos[i + 1].r : filas.length;
        out.push(filas[t.r].map((c, j) => (j === t.k && c ? { ...c, texto: t.dia } : c)));
        out.push(...filas.slice(t.r + 1, hasta));
      });
      return out;
    },
  };
}

const DATOS: Columna[] = ['series', 'reps', 'carga', 'descanso'];
const tiposDe = (f: Filas[number]) => f.map((c) => tipoDeColumna(txt(c)));
/** Un encabezado de ejercicios: dice «Ejercicio» y al menos un dato. */
function esEncabezado(f: Filas[number]): boolean {
  const t = tiposDe(f);
  return t.includes('ejercicio') && t.some((x) => DATOS.includes(x));
}

/** La fila de abajo con los huecos llenados con la de arriba (encabezados de dos filas). */
function combinar(arriba: Filas[number], abajo: Filas[number]): Filas[number] {
  const ancho = Math.max(arriba.length, abajo.length);
  return Array.from({ length: ancho }, (_, k) => {
    if (txt(abajo[k])) return abajo[k];
    const a = arriba[k];
    return a && txt(a) && !esSemana(txt(a)) ? a : null;
  });
}

/** Cuántas celdas de la fila son semanas («Semana 1», «S2»). */
const semanasEn = (f: Filas[number]) => f.map((c, k) => (esSemana(txt(c)) ? k : -1)).filter((k) => k >= 0);

/**
 * Dónde empieza cada encabezado de la hoja: `fila` es la de los títulos de
 * columna; `arriba`, si hay una fila de semanas encima («Semana 1 | | |
 * Semana 2…», F5a).
 */
function encabezados(filas: Filas): { fila: number; arriba: number | null }[] {
  const out: { fila: number; arriba: number | null }[] = [];
  for (let r = 0; r < filas.length; r++) {
    if (semanasEn(filas[r]).length >= 2 && r + 1 < filas.length && esEncabezado(combinar(filas[r], filas[r + 1]))) {
      out.push({ fila: r + 1, arriba: r });
      r++;
      continue;
    }
    if (esEncabezado(filas[r])) out.push({ fila: r, arriba: null });
  }
  return out;
}

// ─────────────────────────── el encabezado de la hoja (D3.5) ───────────────────────────

const RE_ETQ_NOTAS = /^(?:objetivos?|metas?|frecuencia(?: semanal)?|frequencia(?: semanal)?|nivel|metodo|fase|enfoque|foco|modalidad|modalidade|division|divisao|tipo de (?:entrenamiento|treino|rutina))$/;
const RE_ETQ_SEMANAS = /^(?:duracion|duracao|validade|validez|vigencia|semanas|periodo|duracion del plan|duracao do treino)$/;
const RE_ETQ_PERSONAL = /^(?:alumn[oa]s?|alumno ?\/ ?a|alumno ?\(a\)|alun[oa]s?|aluno ?\(a\)|aluno ?\/ ?a|clientes?|nombre(?: y apellido| completo)?|nome(?: completo)?|apellidos?|sobrenome|fecha(?: de inicio| de nacimiento| de entrega)?|data(?: de inicio| de nascimento| de entrega)?|inicio|comienzo|fin|termino|vencimiento|profesor(?:a)?|professor(?:a)?|prof|entrenador(?:a)?|treinador(?:a)?|personal(?: trainer)?|coach|instructor(?:a)?|instrutor(?:a)?|edad|idade|peso(?: corporal| actual| atual| inicial)?|altura|estatura|imc|telefono|tel|celular|whatsapp|e-?mail|correo|lesion(?:es)?|lesao|lesoes|patologias?|restricciones|restricoes|medicamentos?|observaciones|observacoes|obs|dni|ci|cpf|rg|sexo|genero|nacimiento|nascimento|direccion|endereco)$/;

// Las que también pueden ser un dato del ejercicio («Peso: 40kg», «Obs: bajar lento»).
const RE_ETQ_AMBIGUA = /^(?:peso(?: .*)?|obs|observaciones|observacoes|carga)$/;
// «Inicio: 01/09» es una fecha de la persona; «Inicio: 10 min de bicicleta»
// es parte de la rutina (la entrada en calor) y se queda para el lector.
const RE_ETQ_INICIO_FIN = /^(?:inicio|comienzo|fin|termino)$/;
const RE_FECHA = /^(?:\d{1,2}\s*[/.-]\s*\d{1,2}(?:\s*[/.-]\s*\d{2,4})?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+de\s+\p{L}+(?:\s+de\s+\d{2,4})?)$/u;
/** ¿Es una etiqueta de fecha («Inicio», «Fin») con algo que no es una fecha? Entonces no es de la persona. */
const inicioQueNoEsFecha = (etiqueta: string, valor: string) =>
  RE_ETQ_INICIO_FIN.test(normalizarEtiqueta(etiqueta)) && !RE_FECHA.test(valor.trim()) && datosEnTexto(valor) > 0;

const normalizarEtiqueta = (s: string) => plegar(s).replace(/[^a-z() /-]/g, ' ').replace(/\s+/g, ' ').trim();

interface Encabezado { notas: string[]; semanas: number | null; etiquetas: string[] }

function semanasDe(valor: string): number | null {
  const m = /(\d{1,2})\s*(?:semanas?|sem\.?|weeks?)?\s*$/i.exec(plegar(valor).trim());
  if (!m || (!/sem|week/.test(plegar(valor)) && !/^\d{1,2}$/.test(valor.trim()))) return null;
  const n = +m[1];
  return n >= 1 && n <= 52 ? n : null;
}

/**
 * Saca los pares «Etiqueta: valor» de las filas de arriba (antes del primer
 * encabezado de ejercicios). Una etiqueta que no se conoce, en su celda
 * propia y con un valor al lado, también es un dato del encabezado y se
 * descarta: puede ser de la persona. Sin encabezado de ejercicios (una hoja
 * suelta), solo las etiquetas conocidas: «Sentadilla: 4x10» es un ejercicio.
 */
function sacarEncabezado(filas: Filas, hasta: number, conocidasNomas: boolean): Encabezado {
  const e: Encabezado = { notas: [], semanas: null, etiquetas: [] };
  const conocida = (etiqueta: string) => {
    const n = normalizarEtiqueta(etiqueta);
    return RE_ETQ_PERSONAL.test(n) || RE_ETQ_NOTAS.test(n) || RE_ETQ_SEMANAS.test(n);
  };
  // En una hoja sin encabezado de ejercicios, «Peso: 40kg» es la carga del
  // ejercicio de arriba y «Obs: bajar lento» su nota: se quedan para el lector.
  const ambigua = (etiqueta: string) =>
    conocidasNomas && RE_ETQ_AMBIGUA.test(normalizarEtiqueta(etiqueta));
  const usar = (etiqueta: string, valor: string) => {
    const n = normalizarEtiqueta(etiqueta);
    if (RE_ETQ_SEMANAS.test(n)) {
      const s = semanasDe(valor);
      if (s !== null) { if (e.semanas === null) e.semanas = s; return; }
      e.notas.push(`${etiqueta}: ${valor}`);
      return;
    }
    if (RE_ETQ_NOTAS.test(n)) { e.notas.push(`${etiqueta}: ${valor}`); return; }
    // De la persona, o una etiqueta que no se conoce: solo se nombra.
    e.etiquetas.push(etiqueta);
  };
  for (let r = 0; r < hasta && r < filas.length; r++) {
    const f = filas[r];
    for (let k = 0; k < f.length; k++) {
      const t = txt(f[k]);
      if (!t) continue;
      // «Alumno:» en su celda y el valor en la de al lado.
      const etq = /^([^:]{1,30}?)\s*:$/.exec(t);
      if (etq && /\p{L}/u.test(etq[1]) && etq[1].split(/\s+/).length <= 4) {
        const etiqueta = etq[1].trim();
        let j = k + 1;
        while (j < f.length && !txt(f[j])) j++;
        const valor = j < f.length ? txt(f[j]) : '';
        if (!valor || /:$/.test(valor) || j - k > 3) continue;
        // «DÍA 1: | PIERNAS» o «Semana 1: | Fuerza» son títulos, no datos de nadie.
        if (esTituloDeDia(etiqueta) || esSemana(etiqueta)) continue;
        // Una que no se conoce: solo con encabezado de ejercicios abajo, y si
        // no parece un ejercicio («Sentadilla: | 4x10»).
        if (!conocida(etiqueta) && (conocidasNomas || buscarBase(etiqueta) || datosEnTexto(valor) > 0)) continue;
        if (ambigua(etiqueta) || inicioQueNoEsFecha(etiqueta, valor)) continue;
        usar(etiqueta, valor);
        f[k] = null;
        f[j] = null;
        k = j;
        continue;
      }
      // «Alumno: Juan Pérez» en una sola celda: solo las etiquetas conocidas.
      const junto = /^([^:]{1,30}?)\s*:\s*(\S.*)$/.exec(t);
      if (junto && conocida(junto[1]) && !ambigua(junto[1]) && !inicioQueNoEsFecha(junto[1], junto[2])) {
        usar(junto[1].trim(), junto[2].trim());
        f[k] = null;
      }
    }
  }
  return e;
}

// ─────────────────────────── las semanas en columnas ───────────────────────────

/** Qué columnas son de cada semana en un encabezado, o null si no hay semanas en columnas. */
function semanasEnColumnas(filas: Filas, enc: { fila: number; arriba: number | null }): { nombres: string[]; tramos: number[][] } | null {
  if (enc.arriba !== null) {
    const arriba = filas[enc.arriba];
    const pos = semanasEn(arriba);
    const llenasArriba = arriba.map((c, k) => (txt(c) ? k : -1)).filter((k) => k >= 0);
    const ancho = Math.max(arriba.length, filas[enc.fila].length);
    const tramos = pos.map((p) => {
      const sig = llenasArriba.find((k) => k > p);
      const fin = sig === undefined ? ancho - 1 : sig - 1;
      return Array.from({ length: fin - p + 1 }, (_, i) => p + i);
    });
    return { nombres: pos.map((p) => txt(arriba[p])), tramos };
  }
  const tipos = tiposDe(filas[enc.fila]);
  const cols = tipos.map((t, k) => (t === 'semana' ? k : -1)).filter((k) => k >= 0);
  if (cols.length < 2) return null;
  return { nombres: cols.map((k) => txt(filas[enc.fila][k])), tramos: cols.map((k) => [k]) };
}

/** Saca de una fila las columnas de las otras semanas. Un título suelto nunca se pierde. */
function sinColumnas(f: Filas[number], fuera: Set<number>): Filas[number] {
  const nueva = f.filter((_, i) => !fuera.has(i));
  if (unica(f)) {
    const k = f.findIndex((x) => txt(x));
    if (fuera.has(k)) nueva[0] = f[k];
  }
  return nueva;
}

// ─────────────────────────── los bloques lado a lado ───────────────────────────

interface Pieza { titulo: string; filas: Filas }

const columnasDe = (filas: Filas, desde: number, hasta: number): Filas =>
  filas.map((f) => f.slice(desde, hasta + 1));

/** El título de un bloque: la última fila de una sola celda arriba de su encabezado (o arriba de todo). */
function conTitulo(filas: Filas): Pieza {
  const primeraConDatos = filas.findIndex((f) => !vacia(f) && !unica(f));
  const tope = primeraConDatos < 0 ? filas.length : primeraConDatos;
  let t = -1;
  for (let r = 0; r < tope; r++) if (unica(filas[r])) t = r;
  if (t < 0 || primeraConDatos < 0) return { titulo: '', filas };
  return { titulo: txt(llenas(filas[t])[0]), filas: filas.filter((_, r) => r !== t) };
}

function ancho(filas: Filas): number {
  return filas.reduce((m, f) => Math.max(m, f.length), 0);
}

/** ¿Un bloque que se sostiene solo? Tiene su encabezado de ejercicios o arranca con un día. */
function autonomo(filas: Filas): boolean {
  if (filas.some(esEncabezado)) return true;
  const primera = filas.find((f) => !vacia(f));
  return !!primera && unica(primera) && esTituloDeDia(txt(llenas(primera)[0]));
}

/** Una marca de «este día sí» sin datos: «x», «✓», «•». */
const RE_MARCA_DIA = /^[x✓✔•●*+]$/i;

/**
 * «EJERCICIOS | LUNES | MIÉRCOLES | VIERNES» y abajo «Sentadilla | 4x10 | |
 * 4x8»: una matriz de ejercicios por días. Cada día sale de su columna, con
 * los ejercicios que tienen algo en ella («4x10», «3x30 s» o una marca), y el
 * dato va pegado al nombre para que el lector lo lea como «Sentadilla 4x10».
 * Las otras columnas (Descanso, Notas, #) van con cada ejercicio. Las filas
 * que no son de ningún día se leen aparte, tal cual (nada se pierde).
 * Devuelve null si la hoja no es una matriz.
 */
function partirMatriz(filas: Filas): Pieza[] | null {
  const h = filas.findIndex((f) => tiposDe(f).includes('ejercicio'));
  if (h < 0) return null;
  const enc = filas[h];
  const cE = tiposDe(enc).indexOf('ejercicio');
  const dias = enc.map((c, k) => (k !== cE && txt(c) && esTituloDeDia(txt(c)) && !esSemana(txt(c)) ? k : -1)).filter((k) => k >= 0);
  if (dias.length < 2) return null;
  const otras = enc.map((c, k) => (k !== cE && !dias.includes(k) && txt(c) ? k : -1)).filter((k) => k >= 0);
  // Una columna «Series» vacía al final: así el lector reconoce el encabezado
  // aunque la matriz no tenga ninguna otra columna de datos.
  const encabezadoDia: Filas[number] = [enc[cE], ...otras.map((k) => enc[k]), { texto: 'Series' }];
  const porDia: Filas[] = dias.map(() => []);
  const resto: Filas = [];
  for (const f of filas.slice(h + 1)) {
    const nombre = txt(f[cE]);
    const conDato = dias.filter((k) => txt(f[k]));
    if (!nombre || !conDato.length) { resto.push(f); continue; }
    for (const k of conDato) {
      const v = txt(f[k]);
      porDia[dias.indexOf(k)].push([{ texto: RE_MARCA_DIA.test(v) ? nombre : `${nombre} ${v}` }, ...otras.map((j) => f[j] ?? null), null]);
    }
  }
  const piezas: Pieza[] = [];
  if (h > 0) piezas.push({ titulo: '', filas: filas.slice(0, h) });
  dias.forEach((k, i) => { if (porDia[i].length) piezas.push({ titulo: txt(enc[k]), filas: [encabezadoDia, ...porDia[i]] }); });
  if (resto.some((f) => !vacia(f))) piezas.push({ titulo: '', filas: resto });
  return piezas;
}

// Un día sin entrenar dicho solo: «DESCANSO», «Libre», «OFF», «Folga», «Descanso activo».
const RE_DESCANSO = /^(?:descanso|descansar|libre|off|folga|reposo|dia libre|dia de descanso|dia de folga)\b/;
// Un patrón de series («4x10», «3 × 12»): eso es un ejercicio, no un enfoque ni una actividad.
const RE_NXM = /\d\s*[x×]\s*\d/i;

/**
 * ¿La fila de abajo de los días dice el enfoque de cada uno? «Pierna |
 * Pecho | DESCANSO»: palabras sueltas, sin números ni datos, que no son
 * ejercicios ni días, y solo debajo de los días.
 */
function filaDeEnfoque(f: Filas[number] | undefined, pos: number[]): boolean {
  if (!f || vacia(f)) return false;
  const c = f.map((x, k) => ({ k, t: txt(x) })).filter((x) => x.t);
  if (c.length < 2 || c.some((x) => !pos.includes(x.k))) return false;
  return c.every(({ t }) => /\p{L}/u.test(t) && !/\d/.test(t) && t.split(/\s+/).length <= 4 && datosEnTexto(t) === 0
    && !buscarBase(t) && !esTituloDeDia(t));
}

// ─────────────────────────── la «Semana tipo» ───────────────────────────

/** Una fila de la semana tipo: qué día (0 el lunes), cómo lo escribió la planilla y lo demás («MMA», «Técnica / sparring»). */
interface FilaSemanaTipo { dia: number; nombre: string; resto: string[] }
interface SemanaTipo { titulo: string; filas: FilaSemanaTipo[] }

// El título suelto de arriba de la semana tipo: «Semana tipo», «Semana típica», «Mi semana», «Cronograma».
const RE_TITULO_SEMANA = /\b(?:semana|semanal|week|weekly|cronograma|calendario|agenda|distribucion|divisao|division)\b/;

/**
 * LA «SEMANA TIPO» (30/09): «Día | Actividad | Enfoque» y abajo una fila
 * por día de la semana («Lunes | Gimnasio | Piernas y core», «Martes | MMA
 * | Técnica / sparring»). No es una tabla de ejercicios: es cómo se reparte
 * la semana. Antes cada fila se leía suelta y salían días rotos («Lunes
 * Gimnasio Piernas y core» vacío, el ejercicio «Día», el ejercicio
 * «Viernes»).
 *
 * Se reconoce con su encabezado (la primera columna es «Día», ninguna es
 * «Ejercicio») y dos filas o más que empiezan con días distintos; o sin
 * encabezado, con tres filas o más así, fuera de una tabla de ejercicios y
 * sin un ejercicio ni un «4x10» en las otras celdas. Se saca de las filas
 * (con su título suelto de arriba, «Semana tipo») ANTES de partir la hoja,
 * y la arma `armarSemana` al final.
 */
function sacarSemanaTipo(filas: Filas): { filas: Filas; semana: SemanaTipo | null } {
  // Las filas de una tabla de ejercicios: debajo de su encabezado, hasta un renglón vacío.
  const enTabla: boolean[] = [];
  let dentro = false;
  filas.forEach((f, r) => {
    if (vacia(f)) dentro = false;
    else if (esEncabezado(f)) dentro = true;
    enTabla[r] = dentro;
  });
  const filaDeDia = (r: number, estricta: boolean): FilaSemanaTipo | null => {
    if (r >= filas.length || enTabla[r]) return null;
    const c = llenas(filas[r]).map(txt);
    if (c.length < 2) return null;
    const dia = diaDeLaSemana(c[0]);
    if (dia === null) return null;
    const resto = c.slice(1);
    if (resto.some((t) => RE_NXM.test(t) || esTituloDeDia(t)) || (estricta && resto.some((t) => buscarBase(t)))) return null;
    // «Martes:» en su celda: sin los dos puntos, así el día es «Martes – MMA» y no «Martes: – MMA».
    return { dia, nombre: c[0].replace(/[\s:\-–—]+$/, ''), resto };
  };
  for (let r = 0; r < filas.length; r++) {
    if (enTabla[r]) continue;
    const c = llenas(filas[r]).map(txt);
    const conEncabezado = c.length >= 2 && tipoDeColumna(c[0]) === 'dia' && diaDeLaSemana(c[0]) === null
      && !c.some((t) => tipoDeColumna(t) === 'ejercicio');
    const desde = conEncabezado ? r + 1 : r;
    const dias: FilaSemanaTipo[] = [];
    let h = desde;
    for (; h < filas.length; h++) {
      const d = filaDeDia(h, !conEncabezado);
      if (!d || dias.some((x) => x.dia === d.dia)) break;
      dias.push(d);
    }
    if (dias.length < (conEncabezado ? 2 : 3)) continue;
    let inicio = r;
    let titulo = '';
    const arriba = r > 0 ? filas[r - 1] : null;
    if (arriba && unica(arriba) && RE_TITULO_SEMANA.test(plegar(txt(llenas(arriba)[0]))) && !esTituloDeDia(txt(llenas(arriba)[0]))) {
      inicio = r - 1;
      titulo = txt(llenas(arriba)[0]).replace(/[:\s]+$/, '');
    }
    return { filas: [...filas.slice(0, inicio), ...filas.slice(h)], semana: { titulo, filas: dias } };
  }
  return { filas, semana: null };
}

/** Para comparar textos: sin tildes, sin signos, minúsculas. */
const clave = (t: string) => plegar(t).replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * La semana armada en el orden de la semana tipo.
 *
 * DECISIÓN (30/09, Matías: «si la planilla es de lunes a domingo, que esos
 * días se creen»): cada fila de la semana tipo es un día de la rutina.
 *   · El día que tiene su bloque de ejercicios («LUNES – Piernas y core»)
 *     queda con el nombre y los ejercicios de la planilla; si la fila dice
 *     algo que el título no («Gimnasio corto + tatami · Tirón: … (≈40 min) y
 *     luego MMA»), va a sus notas.
 *   · El día sin bloque («Martes | MMA | Técnica / sparring») es un día SIN
 *     ejercicios: «Martes – MMA», con «Técnica / sparring» de nota. El
 *     modelo lo admite de punta a punta: la base (rutina_dias con 0 a 30
 *     ejercicios; guardar_rutina pide de 1 a 10 días), `validar` del editor
 *     (pide un ejercicio en toda la rutina, no en cada día), `usarPegado`
 *     (se queda con los días que tienen notas) y el link del alumno, que
 *     muestra la pestaña con la caja «Para este día» (y ya no dice «Este día
 *     todavía no tiene ejercicios» si el día tiene su nota, ni lo propone
 *     como el día que le toca: `diaParaAbrir` salta los días sin ejercicios).
 *   · Los bloques sin día de la semana («Día 1», «Treino A») o de un día que
 *     la semana tipo no nombra van al final, como estaban.
 * Si ningún bloque es de un día de la semana, o pasarían de 10 días, la
 * semana tipo va a las notas de la rutina tal cual (nada se pierde).
 */
function armarSemana(dias: RutinaLeidaConNotas['dias'], st: SemanaTipo): { dias: RutinaLeidaConNotas['dias']; notas: string[] } {
  const delDia = dias.map((d) => diaDeLaSemana(d.nombre));
  const nombrados = new Set(st.filas.map((f) => f.dia));
  if (delDia.some((x) => x !== null && nombrados.has(x))) {
    const out: RutinaLeidaConNotas['dias'] = [];
    for (const f of st.filas) {
      const propios = dias.filter((_, i) => delDia[i] === f.dia);
      if (propios.length) {
        propios.forEach((d, j) => {
          const enfoque = f.resto[f.resto.length - 1] ?? '';
          const dicho = j > 0 || clave(`${d.nombre} ${d.notas}`).includes(clave(enfoque));
          out.push(dicho ? d : { ...d, notas: [d.notas, f.resto.join(' · ')].filter((x) => x.trim()).join('\n') });
        });
        continue;
      }
      const [actividad, ...otras] = f.resto;
      const [nombre, sobra] = otras.length ? partirTitulo(`${f.nombre} – ${actividad}`, LARGOS.nombreDia) : partirTitulo(f.nombre, LARGOS.nombreDia);
      const notas = otras.length ? [sobra, ...otras] : [sobra, actividad];
      out.push({ nombre, notas: notas.filter((x) => x && x.trim()).join(' · '), ejercicios: [] });
    }
    dias.forEach((d, i) => { if (delDia[i] === null || !nombrados.has(delDia[i] as number)) out.push(d); });
    if (out.length <= MAX_DIAS) return { dias: out, notas: [] };
  }
  const lineas = st.filas.map((f) => `${f.nombre}: ${f.resto.join(' – ')}`);
  return { dias, notas: [st.titulo ? `${st.titulo}:` : '', ...lineas].filter(Boolean) };
}

// ─────────────────────────── los descansos, el calendario y lo de abajo ───────────────────────────

/**
 * «Martes: descanso», «Sábado - libre» solos en su fila, entre los bloques
 * de los días: no son días de la rutina (como en «Pegar texto»), pero
 * tampoco «renglones que no entendí». Van a las notas de la rutina, tal cual.
 */
function sacarDescansos(filas: Filas): { filas: Filas; notas: string[] } {
  const notas: string[] = [];
  const quedan = filas.filter((f) => {
    if (!unica(f) || !esDiaLibre(txt(llenas(f)[0]))) return true;
    notas.push(txt(llenas(f)[0]));
    return false;
  });
  return { filas: quedan, notas };
}

// «Semana», «Semanas», «Week», «Sem.», «Semana / Día»: la esquina de un calendario.
const RE_ESQUINA_SEMANA = /^(?:semanas?|sem\.?|weeks?|microciclos?)(?:\s*[/\\x×-]\s*(?:dias?|days?))?$/;

/**
 * Los renglones de una celda del calendario: un ejercicio por renglón; y si
 * vinieron seguidos («Sentadilla 4x12 Prensa 3x12», «…4x12, Prensa…»), se
 * cortan después de cada «4x12» que sigue con una mayúscula.
 */
function lineasDeCelda(c: Celda | undefined): string[] {
  return (c?.texto ?? '')
    .replace(/(\d\s*[x×]\s*\d+(?:\s*-\s*\d+)?(?:\s*(?:s|seg|segs|min|kg|kgs|lb|lbs|reps?)\b)?)\s*[,;]?\s+(?=\p{Lu})/gu, '$1\n')
    .split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

interface Calendario {
  /** Las filas que ocupa: del título suelto de arriba (si tiene) a la última semana. */
  desde: number;
  hasta: number;
  nombres: string[];
  /** ¿Sus celdas son ejercicios («Sentadilla 4x12⏎Prensa 3x12»)? Si no, es una tabla de progresión o de asistencia. */
  deEjercicios: boolean;
  /** Los días de la semana elegida (solo si es de ejercicios). */
  piezas: (cual: number) => Pieza[];
  /** Una tabla que no es de ejercicios, como texto para las notas de la rutina («Semana 1: 70%»); vacío si son solo marcas. */
  lineas: string[];
  /** De una tabla de solo marcas (asistencia): su título, para el aviso de lo que no se usó. */
  etiquetas: string[];
}

/**
 * EL CALENDARIO DEL MES (30/09): «Semana | Lunes | Martes | …» arriba y una
 * fila por semana («Semana 1», «Semana 2»…), con todos los ejercicios del
 * día en una celda, uno por renglón. Cada día sale de su columna, con la
 * semana elegida. Devuelve null si la hoja no tiene un calendario.
 *
 * Revisión (30/09): la misma forma también es una tabla de progresión
 * («Semana 1 | 70% | 70% | 70%») o de asistencia («✓») debajo de una
 * rutina. Eso NO es el calendario: sus celdas no son ejercicios. Antes se
 * adueñaba de la hoja (se perdían días, y salía un selector de semanas que
 * no cambiaba nada). Ahora solo es calendario si la mayoría de sus celdas
 * son ejercicios; si no, la tabla va a las notas de la rutina como texto
 * (la de asistencia, solo marcas, no), y el resto de la hoja se lee como
 * siempre. En los dos casos solo se sacan SUS filas.
 */
function partirCalendario(filas: Filas): Calendario | null {
  for (let r = 0; r < filas.length; r++) {
    const f = filas[r];
    const k0 = f.findIndex((c) => txt(c));
    if (k0 < 0 || !RE_ESQUINA_SEMANA.test(plegar(txt(f[k0])).trim())) continue;
    const dias = f.map((c, k) => (k > k0 && txt(c) && esTituloDeDia(txt(c)) ? k : -1)).filter((k) => k >= 0);
    if (dias.length < 2) continue;
    const semanas: number[] = [];
    for (let s = r + 1; s < filas.length; s++) {
      if (vacia(filas[s])) { if (semanas.length) break; continue; }
      if (!esSemana(txt(filas[s][k0]))) break;
      semanas.push(s);
    }
    if (!semanas.length) continue;

    // ¿Ejercicios? Un renglón con un nombre y sus datos («Sentadilla 4x12»), o un ejercicio conocido.
    let deEjercicios = 0;
    let otras = 0;
    for (const s of semanas) {
      for (const k of dias) {
        const ls = lineasDeCelda(filas[s][k]);
        if (!ls.length) continue;
        if (ls.some((l) => /\p{L}{3,}/u.test(l) && (datosEnTexto(l) > 0 || !!buscarBase(l)))) deEjercicios++;
        else otras++;
      }
    }
    const esCalendario = deEjercicios > 0 && deEjercicios >= otras;

    // El título suelto de arriba («Progresión de intensidad»): va con la tabla.
    const arriba = r > 0 && unica(filas[r - 1]) ? txt(llenas(filas[r - 1])[0]) : '';
    const titulo = !esCalendario && arriba && datosEnTexto(arriba) === 0 && !esTituloDeDia(arriba) ? arriba.replace(/[:\s]+$/, '') : '';
    const valores = (s: number) => dias.map((k) => ({ dia: txt(f[k]), v: txt(filas[s][k]) })).filter((x) => x.v);
    const soloMarcas = semanas.every((s) => valores(s).every((x) => RE_MARCA_DIA.test(x.v)));
    const lineas = esCalendario || soloMarcas ? [] : [titulo ? `${titulo}:` : '', ...semanas.map((s) => {
      const vs = valores(s);
      if (!vs.length) return '';
      const distintos = sinRepetir(vs.map((x) => x.v));
      const cuerpo = distintos.length === 1 && vs.length === dias.length ? distintos[0] : vs.map((x) => `${x.dia} ${x.v}`).join(' · ');
      return `${txt(filas[s][k0])}: ${cuerpo}`;
    })].filter(Boolean);

    return {
      desde: titulo ? r - 1 : r,
      hasta: semanas[semanas.length - 1],
      nombres: semanas.map((s) => txt(filas[s][k0])),
      deEjercicios: esCalendario,
      lineas,
      etiquetas: !esCalendario && soloMarcas ? (titulo ? [titulo] : llenas(f).map(txt)) : [],
      piezas: (cual) => {
        const fila = filas[semanas[Math.min(Math.max(cual, 1), semanas.length) - 1]];
        const out: Pieza[] = [];
        for (const k of dias) {
          const ls = lineasDeCelda(fila[k]);
          if (ls.length) out.push({ titulo: txt(f[k]), filas: ls.map((l) => [{ texto: l }]) });
        }
        return out;
      },
    };
  }
  return null;
}

/**
 * Lo que queda abajo de todo, separado por un renglón vacío del último
 * bloque y sin ninguna tabla («Calentamiento: 5-8 min de cardio suave…»).
 * Leído junto, iba a las notas del último día; es de toda la rutina.
 */
function separarCola(filas: Filas): { cuerpo: Filas; cola: Filas } | null {
  let ultima = -1;
  filas.forEach((f, r) => { if (llenas(f).length >= 2) ultima = r; });
  if (ultima < 0) return null;
  let corte = -1;
  for (let r = ultima + 1; r < filas.length; r++) if (vacia(filas[r])) { corte = r; break; }
  if (corte < 0 || !filas.slice(corte).some((f) => !vacia(f))) return null;
  return { cuerpo: filas.slice(0, corte), cola: filas.slice(corte) };
}

// ─────────────────────────── ¿la hoja es la rutina? ───────────────────────────

// «Fecha», «Data», «Date»: la columna de la fecha de un registro.
const RE_COLUMNA_FECHA = /^(?:fechas?|datas?|dates?)\b/;
// Las columnas de lo que se hizo: «RIR», «RPE», «Volumen», «1RM est.», «Hecho»,
// y «Serie» o «Set» en singular (el número de la serie: una fila por serie).
const RE_COLUMNA_REGISTRO = /^(?:rir|rpe|volumen|volume|tonelaje|1 ?rm|e1rm|rm estimad[oa]|realizad[oa]s?|hech[oa]s?|feit[oa]s?|completad[oa]s?|(?:n |nro |numero |# )?(?:serie|set)(?: n| nro| numero)?$)/;
// Una hoja que se llama como un registro.
const RE_HOJA_REGISTRO = /\b(?:registros?|log|historial|historico|seguimiento|bitacora|diario|control)\b/;

/**
 * Un registro de entrenamientos («Fecha | Sesión | Ejercicio | Serie | Peso
 * | Reps | RIR | Volumen»): todas sus tablas de ejercicios tienen una
 * columna de fecha y además lo dicen (RIR, volumen, 1RM, «Hecho», «Serie»
 * en singular, la hoja se llama «Registro») o ya anotan el mismo ejercicio
 * en tres fechas o más. No es la rutina, aunque tenga ejercicios con
 * series. Revisión (30/09): la fecha sola no alcanza; «Fecha | Ejercicio |
 * Series | Reps» puede ser un plan con su fecha.
 */
function esRegistro(filas: Filas, nombreHoja: string): boolean {
  const columnas = (f: Filas[number]) => f.map((c) => plegar(txt(c)).replace(/[^a-z0-9# ]/g, ' ').replace(/\s+/g, ' ').trim());
  const encs = filas.map((f, r) => (esEncabezado(f) ? r : -1)).filter((r) => r >= 0);
  return encs.length > 0 && encs.every((r) => {
    const cols = columnas(filas[r]);
    const cF = cols.findIndex((t) => RE_COLUMNA_FECHA.test(t));
    if (cF < 0) return false;
    if (cols.some((t) => RE_COLUMNA_REGISTRO.test(t)) || RE_HOJA_REGISTRO.test(clave(nombreHoja))) return true;
    const cE = tiposDe(filas[r]).indexOf('ejercicio');
    const fechasDe = new Map<string, Set<string>>();
    for (let s = r + 1; s < filas.length && !esEncabezado(filas[s]); s++) {
      const e = claveEjercicio(txt(filas[s][cE]));
      const fecha = txt(filas[s][cF]);
      if (!e || !fecha) continue;
      const vistas = fechasDe.get(e) ?? new Set<string>();
      vistas.add(fecha);
      fechasDe.set(e, vistas);
    }
    return [...fechasDe.values()].some((v) => v.size >= 3);
  });
}

/**
 * Un resumen («Ejercicio | Series registradas | Peso máx.»): la mayoría de
 * los ejercicios son fórmulas que copian los de otra hoja, y lo demás
 * también se calcula. Revisión (30/09): una rutina que trae el nombre del
 * ejercicio con una fórmula (BUSCARV desde un banco) y escribe sus series o
 * repeticiones a mano sí es la rutina.
 */
function esResumen(filas: Filas): boolean {
  let tipos: Columna[] | null = null;
  let total = 0;
  let copiados = 0;
  for (const f of filas) {
    if (esEncabezado(f)) { tipos = tiposDe(f); continue; }
    if (vacia(f)) { tipos = null; continue; }
    if (!tipos) continue;
    const col = tipos.indexOf('ejercicio');
    if (!txt(f[col])) continue;
    total++;
    const aMano = tipos.some((t, k) => (t === 'series' || t === 'reps') && !!txt(f[k]) && !f[k]?.formula);
    if (f[col]?.formula && !aMano) copiados++;
  }
  return total >= 3 && copiados * 2 >= total;
}

/**
 * Parte la hoja en bloques lado a lado: por una fila de días («DÍA 1 | DÍA
 * 2»), por una matriz de ejercicios por días, por «Ejercicio» repetido en un
 * encabezado, o por columnas vacías. Si no hay bloques, la hoja entera es
 * una pieza. `notas`: adonde van los días de descanso de una fila de días
 * («JUEVES | DESCANSO»), que no son días de la rutina.
 */
function partirEnBloques(filas: Filas, notas: string[] = []): Pieza[] {
  const w = ancho(filas);
  // a) Una fila de días: cada día es una columna (o un tramo de columnas).
  //    «# | LUNES | MARTES»: la columna de la numeración («#», «Nº», «Nro»)
  //    no es un día, y los 1, 2, 3 de abajo no son de ningún día.
  const r = filas.findIndex((f) => llenas(f).length >= 2);
  const esNumeracion = (c: Celda | undefined) => tipoDeColumna(txt(c)) === 'ignorar';
  const titulosDeDia = r >= 0 ? llenas(filas[r]).filter((c) => !esNumeracion(c)) : [];
  if (r >= 0 && titulosDeDia.length >= 2 && titulosDeDia.every((c) => esTituloDeDia(txt(c))) && !esEncabezado(filas[r])) {
    const numeracion = new Set(filas[r].map((c, k) => (txt(c) && esNumeracion(c) ? k : -1)).filter((k) => k >= 0));
    const pos = filas[r].map((c, k) => (txt(c) && !numeracion.has(k) ? k : -1)).filter((k) => k >= 0);
    const piezas: Pieza[] = [];
    if (r > 0) piezas.push({ titulo: '', filas: filas.slice(0, r) });
    // La fila de abajo con el enfoque de cada día («Pierna | Pecho |
    // DESCANSO», 30/09): va al nombre («LUNES – Pierna»), y un descanso a
    // las notas de la rutina. Antes iba todo a lo no entendido.
    const enfoque = filaDeEnfoque(filas[r + 1], pos) ? filas[r + 1] : null;
    const desde = enfoque ? r + 2 : r + 1;
    // Un renglón suelto fuera de los días («Descanso: 60-90 s entre series»
    // escrito en la columna del «#») es de toda la rutina: se lee aparte, al
    // final, en vez de perderse.
    const sueltas: Filas = [];
    const debajo = filas.slice(desde).map((f) => {
      const k = f.findIndex((c) => txt(c));
      if (unica(f) && (numeracion.has(k) || k < pos[0])) { sueltas.push(f); return f.map(() => null); }
      return f.map((c, j) => (numeracion.has(j) ? null : c));
    });
    pos.forEach((p, i) => {
      const fin = i + 1 < pos.length ? pos[i + 1] - 1 : w - 1;
      const columnas = columnasDe(debajo, p, fin);
      const dia = txt(filas[r][p]);
      const foco = enfoque ? txt(enfoque[p]) : '';
      if (foco && RE_DESCANSO.test(plegar(foco)) && columnas.every(vacia)) { notas.push(`${dia}: ${foco}`); return; }
      // «DESCANSO» escrito en la columna del día (revisión 30/09), solo o con
      // una nota abajo («Caminar 30 min»): el mismo descanso, a las notas de
      // la rutina. Antes iba a «no entendí» y el día desaparecía sin rastro.
      // «Descanso 90 s» (con números) es el descanso entre series: no.
      const escritas = columnas.flatMap((f) => llenas(f).map(txt));
      if (escritas.length && escritas.length <= 3 && RE_DESCANSO.test(plegar(escritas[0])) && !/\d/.test(escritas[0])
        && !escritas.some((t) => RE_NXM.test(t)) && !columnas.some(esEncabezado)) {
        notas.push(`${foco ? `${dia} – ${foco}` : dia}: ${escritas.join(' · ')}`);
        return;
      }
      piezas.push({ titulo: foco ? `${dia} – ${foco}` : dia, filas: columnas });
    });
    if (sueltas.length) piezas.push({ titulo: '', filas: sueltas });
    return piezas;
  }
  // a2) La matriz «Ejercicio | Lunes | Miércoles | Viernes», con «4x10» en
  //     los días que toca: se da vuelta, un día por columna, y cada ejercicio
  //     va solo a los días en los que tiene algo.
  const matriz = partirMatriz(filas);
  if (matriz) return matriz;
  // b) «Ejercicio» repetido en un encabezado: el mismo formato, repetido.
  for (const f of filas) {
    if (!esEncabezado(f)) continue;
    const ej = tiposDe(f).map((t, k) => (t === 'ejercicio' ? k : -1)).filter((k) => k >= 0);
    if (ej.length < 2) continue;
    const inicio = f.findIndex((c) => txt(c));
    const corrimiento = Math.max(0, ej[0] - inicio);
    const cortes = ej.map((p, i) => (i === 0 ? 0 : Math.max(ej[i - 1] + 1, p - corrimiento)));
    return cortes.map((c, i) => conTitulo(columnasDe(filas, c, i + 1 < cortes.length ? cortes[i + 1] - 1 : w - 1)));
  }
  // c) Columnas vacías (mirando las filas de más de una celda: un título
  //    combinado a lo ancho no las tapa). Solo si los bloques se sostienen solos.
  const usada = Array.from({ length: w }, (_, k) => filas.some((f) => llenas(f).length >= 2 && txt(f[k])));
  const tramos: [number, number][] = [];
  for (let k = 0; k < w; k++) {
    if (!usada[k]) continue;
    const ini = k;
    while (k + 1 < w && usada[k + 1]) k++;
    tramos.push([ini, k]);
  }
  if (tramos.length >= 2) {
    // Los que no se sostienen solos (una columna vacía en medio de una
    // tabla) se juntan con el de la izquierda. Cada bloque arranca justo
    // después del anterior: se lleva las columnas vacías que lo separan.
    const juntos: [number, number][] = [];
    for (const t of tramos) {
      const u = juntos[juntos.length - 1];
      if (u && !autonomo(columnasDe(filas, t[0], t[1]))) u[1] = t[1];
      else juntos.push([u ? u[1] + 1 : 0, t[1]]);
    }
    if (juntos.length >= 2) {
      juntos[juntos.length - 1][1] = w - 1;
      return juntos.map(([a, b]) => conTitulo(columnasDe(filas, a, b)));
    }
  }
  return [{ titulo: '', filas }];
}

// ─────────────────────────── tablas que no son de ejercicios ───────────────────────────

// Los títulos de columna de una tabla de medidas o de salud. Hace falta al
// menos uno para que una fila sin números sea «el encabezado de otra cosa»:
// «Zancada búlgara | lento» o «Pullover | controlado» (un ejercicio con su
// nota, copiado de un Excel sin encabezado) nunca lo son.
const RE_COLUMNA_AJENA = /^(?:fechas?|datas?|mes|meses|pergunta|perguntas|pregunta|preguntas|respuestas?|respostas?|medidas?|medicion|mediciones|medicao|medicoes|peso(?: corporal| actual| atual)?|cintura|caderas?|quadril|abdomen|abdome|brazos?|bracos?|antebrazos?|antebracos?|torax|muslos?|coxas?|pantorrillas?|panturrilhas?|cuello|pescoco|grasa(?: corporal)?|gordura(?: corporal)?|(?:de )?grasa|imc|altura|estatura|pliegues?|dobras?|perimetros?|circunferencias?|evolucion|evolucao|resultados?|lesion|lesiones|lesao|lesoes|sintomas?|dolor(?:es)?|dor(?:es)?|antecedentes|medicamentos?|enfermedad(?:es)?|doencas?)$/;

/**
 * «Fecha | Peso | Cintura», «Pergunta | Resposta»: el encabezado de otra
 * cosa. Palabras sueltas, sin números, sin ninguna columna de ejercicio, sin
 * nada que se lea como un ejercicio («Remo | al fallo» sí lo es), y con al
 * menos un título de medidas o de salud (RE_COLUMNA_AJENA).
 */
function encabezadoAjeno(f: Filas[number]): boolean {
  const c = llenas(f).map(txt);
  if (c.length < 2) return false;
  const tipos = c.map(tipoDeColumna);
  if (tipos.some((t) => t === 'ejercicio' || t === 'series' || t === 'reps' || t === 'descanso')) return false;
  if (datosEnTexto(c.join(' ')) > 0) return false;
  if (!c.some((t) => RE_COLUMNA_AJENA.test(plegar(t).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()))) return false;
  return c.every((t) => /\p{L}/u.test(t) && !/\d/.test(t) && t.split(/\s+/).length <= 3 && Array.from(t).length <= 30
    && !esTituloDeDia(t) && !buscarBase(t) && datosEnTexto(t) === 0);
}

/**
 * ¿La fila se lee como un ejercicio? Un ejercicio conocido en la primera
 * celda («Prensa | 3 | 12»), o «nombre … 4x10». Una fila de medidas
 * («01/09 | 80 | 90») o de salud («¿Lesiones? | Rodilla») no.
 */
function filaDeEjercicio(f: Filas[number]): boolean {
  const c = llenas(f).map(txt);
  if (!c.length || !/\p{L}/u.test(c[0])) return false;
  return !!buscarBase(c[0]) || /\d\s*[x×]\s*\d/i.test(c.join(' '));
}

/**
 * Saca las tablas que no son de ejercicios: desde su encabezado hasta un
 * renglón vacío, un título, un encabezado de ejercicios o una fila que se lee
 * como un ejercicio con sus datos. Su contenido no se muestra en ningún lado
 * (pueden ser medidas o datos de salud): solo los títulos de sus columnas, en
 * el aviso de los datos que no se usaron, para que no se pierdan en silencio.
 *
 * Para ser «ajena», además del encabezado, la fila de abajo NO se lee como
 * un ejercicio: «Pullover | controlado» seguido de «Sentadilla | 4 | 10» es
 * parte de la rutina.
 */
function sinTablasAjenas(filas: Filas): { filas: Filas; etiquetas: string[] } {
  const out: Filas = [];
  const etiquetas: string[] = [];
  let enAjena = false;
  let hayEncabezado = false;
  const fin = (r: number) => r >= filas.length || vacia(filas[r]) || unica(filas[r]) || esEncabezado(filas[r]);
  for (let r = 0; r < filas.length; r++) {
    const f = filas[r];
    if (vacia(f)) { enAjena = false; hayEncabezado = false; out.push(f); continue; }
    if (esEncabezado(f)) { enAjena = false; hayEncabezado = true; out.push(f); continue; }
    if (enAjena) {
      if (unica(f) || (filaDeEjercicio(f) && datosEnTexto(llenas(f).slice(1).map(txt).join(' ')) > 0)) { enAjena = false; out.push(f); }
      continue;
    }
    if (!hayEncabezado && encabezadoAjeno(f) && !fin(r + 1) && !filaDeEjercicio(filas[r + 1])) {
      enAjena = true;
      etiquetas.push(...llenas(f).map(txt));
      continue;
    }
    out.push(f);
  }
  return { filas: out, etiquetas };
}

// ─────────────────────────── una fila por serie ───────────────────────────

/**
 * «Press banca | 1 | 12 | 40», «Press banca | 2 | 10 | 45»…: una fila por
 * serie. Se junta en un ejercicio si TODAS las tandas seguidas del mismo
 * ejercicio numeran sus series 1, 2, 3… y alguna tiene más de una.
 */
function juntarSeries(filas: Filas): Filas {
  const out: Filas = [];
  for (let r = 0; r < filas.length; r++) {
    const f = filas[r];
    out.push(f);
    if (!esEncabezado(f)) continue;
    const tipos = tiposDe(f);
    const cE = tipos.indexOf('ejercicio');
    const cS = tipos.indexOf('series');
    if (cE < 0 || cS < 0) continue;
    const cD = tipos.indexOf('dia');
    // Las filas de esta tabla: hasta el próximo encabezado, título o renglón vacío.
    let fin = r + 1;
    while (fin < filas.length && !vacia(filas[fin]) && !unica(filas[fin]) && !esEncabezado(filas[fin])) fin++;
    const datos = filas.slice(r + 1, fin);
    const clave = (x: Filas[number]) => `${cD >= 0 ? plegar(txt(x[cD])) : ''}|${claveEjercicio(txt(x[cE]))}`;
    const tandas: Filas[] = [];
    for (const x of datos) {
      const u = tandas[tandas.length - 1];
      if (u && clave(u[0]) === clave(x) && txt(x[cE])) u.push(x); else tandas.push([x]);
    }
    // Una tanda sin nada en «Serie» (un renglón suelto) no cuenta ni en contra.
    const numeradas = tandas.every((t) => t.every((x, i) => txt(x[cS]) === String(i + 1)) || t.every((x) => !txt(x[cS])));
    if (!numeradas || !tandas.some((t) => t.length > 1)) continue;

    const cNota = tipos.indexOf('nota');
    let encabezado = f;
    const agregarNota = cNota < 0;
    if (agregarNota) encabezado = [...f, { texto: 'Notas' }];
    out[out.length - 1] = encabezado;
    for (const t of tandas) {
      // Sin numerar (un renglón suelto en medio): queda como estaba.
      if (!txt(t[0][cS])) { out.push(...t); continue; }
      const junta: Filas[number] = encabezado.map((_, k) => t[0][k] ?? null);
      const extra: string[] = [];
      tipos.forEach((tipo, k) => {
        if (k === cE || k === cD) return;
        if (k === cS) { junta[k] = { texto: String(t.length) }; return; }
        const valores = t.map((x) => txt(x[k])).filter(Boolean);
        const distintos = sinRepetir(valores);
        if (!distintos.length) { junta[k] = null; return; }
        if (tipo === 'nota') { junta[k] = { texto: distintos.join(' · ') }; return; }
        if (distintos.length === 1) { junta[k] = { texto: distintos[0] }; return; }
        const tope = tipo === 'reps' ? LARGOS.reps : tipo === 'carga' ? LARGOS.carga : Infinity;
        const unidos = tipo === 'reps' || tipo === 'carga' || tipo === 'descanso' ? valores.join('-') : distintos.join(' / ');
        if (Array.from(unidos).length <= tope) junta[k] = { texto: unidos };
        else { junta[k] = null; extra.push(`${txt(f[k])}: ${valores.join(', ')}`); }
      });
      const k = agregarNota ? encabezado.length - 1 : cNota;
      const nota = [txt(junta[k]), ...extra].filter(Boolean).join(' · ');
      junta[k] = nota ? { texto: nota } : null;
      out.push(junta);
    }
    r = fin - 1;
  }
  return out;
}

// ─────────────────────────── una pieza como texto ───────────────────────────

interface PiezaLeida {
  titulo: string;
  leida: RutinaLeidaConNotas;
  /** Los ejercicios (como estaban en la planilla) con una fecha que Excel había inventado. */
  fechas: string[];
  /** El encabezado de la carga dice la unidad («Peso (kg)», «Kg»). */
  cargaConUnidad: boolean;
  /** Los títulos de las columnas de una tabla que no es de ejercicios (no se leyó). */
  etiquetas: string[];
}

/**
 * «DÍA 1: | PIERNAS» en dos celdas: un solo título («DÍA 1: PIERNAS»). Si
 * no, el lector veía una fila de planilla y creaba el ejercicio «DÍA 1».
 */
function unirTitulos(filas: Filas): Filas {
  return filas.map((f) => {
    const c = llenas(f);
    if (c.length < 2 || esEncabezado(f)) return f;
    const [primera, ...resto] = c.map(txt);
    if (!esTituloDeDia(primera.replace(/[:\-–—]+$/, '').trim())) return f;
    if (!resto.every((t) => /\p{L}/u.test(t) && datosEnTexto(t) === 0 && !esTituloDeDia(t))) return f;
    return [{ texto: [primera, ...resto].join(' ') }];
  });
}

/** Escribe la pieza como texto con tabuladores y la lee con `leerRutina`. */
function leerPieza(p: Pieza): PiezaLeida {
  const sinAjenas = sinTablasAjenas(unirTitulos(p.filas));
  const filas = juntarSeries(sinAjenas.filas);
  const renglones: string[] = [];
  const fechas: string[] = [];
  let tipos: Columna[] | null = null;
  let cargaConUnidad = false;
  for (const f of filas) {
    // Como el lector: el encabezado vale hasta el próximo encabezado.
    if (esEncabezado(f)) {
      const t = tiposDe(f);
      tipos = t;
      if (f.some((c, k) => t[k] === 'carga' && /\b(?:kgs?|kilos?|lbs?|libras?)\b/.test(plegar(txt(c))))) cargaConUnidad = true;
    }
    const celdas = f.map((c, k) => {
      // En la columna de video va el link de la celda, no su texto («Ver vídeo»).
      if (tipos && tipos[k] === 'video' && c?.link) return c.link.trim();
      return txt(c);
    });
    while (celdas.length && !celdas[celdas.length - 1]) celdas.pop();
    renglones.push(celdas.join('\t'));
    if (!esEncabezado(f) && f.some((c) => c?.fecha)) {
      const k = tipos ? tipos.indexOf('ejercicio') : -1;
      const nombre = k >= 0 ? txt(f[k]) : txt(f.find((c) => /\p{L}/u.test(txt(c))) ?? null);
      if (nombre) fechas.push(nombre);
    }
  }
  return { titulo: p.titulo, leida: leerRutina(renglones.join('\n')), fechas, cargaConUnidad, etiquetas: sinAjenas.etiquetas };
}

// ─────────────────────────── la planilla entera ───────────────────────────

const ejerciciosDe = (l: RutinaLeidaConNotas) => l.dias.reduce((s, d) => s + d.ejercicios.length, 0);

/** Los ejercicios con muchas series de pocas repeticiones: «12 × 3» parece estar al revés (D3.9). */
export function seriesRaras(leida: RutinaLeidaConNotas): { dia: number; indice: number; nombre: string }[] {
  const out: { dia: number; indice: number; nombre: string }[] = [];
  leida.dias.forEach((d, i) => d.ejercicios.forEach((e, j) => {
    if (e.series !== null && e.series > 8 && /^\d{1,2}$/.test(e.reps.trim()) && +e.reps <= 5) out.push({ dia: i, indice: j, nombre: e.nombre });
  }));
  return out;
}

/** «12 × 3» → «3 × 12», con un toque en la revisión. Solo si las repeticiones son un entero de 1 a 20. */
export function darVueltaSeriesYReps(leida: RutinaLeidaConNotas, dia: number, indice: number): RutinaLeidaConNotas {
  const e = leida.dias[dia]?.ejercicios[indice];
  if (!e || e.series === null || !/^\d{1,2}$/.test(e.reps.trim())) return leida;
  const reps = +e.reps.trim();
  if (reps < 1 || reps > 20) return leida;
  const nuevo: EjercicioLeido = { ...e, series: reps, reps: String(e.series) };
  return {
    ...leida,
    dias: leida.dias.map((d, i) => (i !== dia ? d : { ...d, ejercicios: d.ejercicios.map((x, j) => (j === indice ? nuevo : x)) })),
  };
}

/** Los links de video de la planilla, uno por ejercicio (el primero). Van a la biblioteca al guardar. */
export function videosDeLaRutina(leida: RutinaLeidaConNotas): { nombre: string; url: string }[] {
  const vistos = new Set<string>();
  const out: { nombre: string; url: string }[] = [];
  for (const d of leida.dias) {
    for (const e of d.ejercicios) {
      const k = claveEjercicio(e.nombre);
      if (!e.video || !k || vistos.has(k)) continue;
      vistos.add(k);
      out.push({ nombre: e.nombre, url: e.video });
    }
  }
  return out;
}

const RE_CARGA_SIN_UNIDAD = /^\d+(?:[.,]\d+)?(?:\s*[-/]\s*\d+(?:[.,]\d+)?)*$/;

type Semanas = ResultadoPlanilla['semanas'];

/** Una hoja leída entera, antes de decidir si se usa. */
interface HojaLeida {
  nombre: string;
  piezas: PiezaLeida[];
  enc: Encabezado;
  recortada: boolean;
  /** Las semanas que trae esta hoja (apiladas, en columnas o en un calendario), si el libro no traía. */
  semanas: Semanas;
  semanaTipo: SemanaTipo | null;
  /** Los días de descanso dichos solos («Martes: descanso»): van a las notas de la rutina. */
  notas: string[];
  /**
   * Cuánto parece la rutina: los ejercicios de verdad (con series, o con
   * repeticiones y un nombre conocido o un tiempo). Un registro (con fecha y
   * RIR, volumen…) o un resumen (ejercicios que son fórmulas) tiene 0, y un
   * progreso corporal o una guía, también (no traen ejercicios así).
   */
  puntaje: number;
  conEjercicios: boolean;
  /** La hoja de un día que es solo su nota («Sábado»: «Descanso activo: caminar 40 min»). */
  soloNotas: boolean;
  /** Qué días trae (ver `claveDeDia`): dos hojas con los mismos días son dos versiones de la rutina. */
  claves: string[];
  diasConEjercicios: number;
  /** Los ejercicios del día más largo. */
  maxEjercicios: number;
}

/**
 * Lee UNA hoja: su encabezado, la semana elegida, la semana tipo, los
 * descansos, los bloques de cada día y lo que queda abajo de todo.
 * `delLibro`: las semanas de una hoja por semana, si las hay.
 */
function leerHoja(h: HojaPlanilla, elegir: (cuantas: number) => number, delLibro: Semanas): HojaLeida {
  let semanas: Semanas = delLibro;
  // Una copia: se van vaciando celdas (el encabezado de la hoja).
  let filas: Filas = h.filas.map((f) => (Array.isArray(f) ? f.map((c) => (c && typeof c.texto === 'string' ? { ...c } : null)) : []));

  // El encabezado de la hoja (Alumno, Objetivo, Duración…), arriba del primer encabezado de ejercicios.
  const encs = encabezados(filas);
  const primero = encs.length ? (encs[0].arriba ?? encs[0].fila) : filas.length;
  const enc = sacarEncabezado(filas, primero, encs.length === 0);

  // La semana y el día en el mismo título («SEMANA 2 / LUNES»): la semana elegida.
  const enTitulos = semanasEnTitulos(filas);
  if (enTitulos) {
    const n = enTitulos.nombres.length;
    if (!semanas) semanas = { cuantas: n, elegida: elegir(n), nombres: enTitulos.nombres };
    filas = enTitulos.filas(semanas.cuantas === n ? semanas.elegida : elegir(n));
  }

  // Una tabla con forma de calendario que no es de ejercicios (progresión,
  // asistencia): sus filas fuera ANTES de buscar semanas, como texto a las
  // notas de la rutina (ver `partirCalendario`). Si no, sus «Semana 1»
  // vacías eran semanas apiladas: un selector que no cambiaba nada.
  const notas: string[] = [];
  let cal = partirCalendario(filas);
  while (cal && !cal.deEjercicios) {
    notas.push(...cal.lineas);
    enc.etiquetas.push(...cal.etiquetas);
    filas = [...filas.slice(0, cal.desde), [], ...filas.slice(cal.hasta + 1)];
    cal = partirCalendario(filas);
  }
  // Las filas del calendario de verdad (una semana sin llenar es «Semana 4» sola) no son semanas apiladas.
  const delCalendario = (r: number) => !!cal && r >= cal.desde && r <= cal.hasta;

  // Semanas apiladas: «SEMANA 1» sola en su fila.
  const marcas = filas.map((f, r) => (!delCalendario(r) && marcaDeSemana(f) ? r : -1)).filter((r) => r >= 0);
  if (marcas.length) {
    const nombres = marcas.map((r) => marcaDeSemana(filas[r]) as string);
    const elegida = elegir(marcas.length);
    if (!semanas && marcas.length >= 2) semanas = { cuantas: marcas.length, elegida, nombres };
    const cual = semanas && semanas.cuantas === marcas.length ? semanas.elegida : elegida;
    const desde = marcas[cual - 1] + 1;
    const hasta = cual < marcas.length ? marcas[cual] : filas.length;
    filas = [...filas.slice(0, marcas[0]), ...filas.slice(desde, hasta)];
  }

  // Semanas en columnas: se quedan las de la semana elegida.
  const encs2 = encabezados(filas);
  if (encs2.length) {
    const nuevas: Filas = filas.slice(0, encs2[0].arriba ?? encs2[0].fila);
    encs2.forEach((e, i) => {
      const desde = e.arriba ?? e.fila;
      const hasta = i + 1 < encs2.length ? (encs2[i + 1].arriba ?? encs2[i + 1].fila) : filas.length;
      const tramo = filas.slice(desde, hasta);
      const sc = semanasEnColumnas(filas, e);
      if (!sc || sc.tramos.length < 2) { nuevas.push(...tramo); return; }
      if (!semanas) semanas = { cuantas: sc.tramos.length, elegida: elegir(sc.tramos.length), nombres: sc.nombres };
      const cual = Math.min(semanas.elegida, sc.tramos.length);
      const fuera = new Set(sc.tramos.filter((_, j) => j !== cual - 1).flat());
      // Un encabezado de dos filas queda en una: la de abajo, con los huecos de la de arriba.
      const filasTramo = e.arriba !== null ? [combinar(filas[e.arriba], filas[e.fila]), ...filas.slice(e.fila + 1, hasta)] : tramo;
      nuevas.push(...filasTramo.map((f) => sinColumnas(f, fuera)));
    });
    filas = nuevas;
  }

  let semanaTipo: SemanaTipo | null = null;
  /** Parte unas filas en días: la semana tipo y los descansos, fuera ANTES de partir. */
  const partir = (parte: Filas): Pieza[] => {
    const st = sacarSemanaTipo(parte);
    if (!semanaTipo) semanaTipo = st.semana;
    const libres = sacarDescansos(st.filas);
    notas.push(...libres.notas);
    return partirEnBloques(libres.filas, notas);
  };
  let crudas: Pieza[];
  const calendario = partirCalendario(filas);
  if (calendario && calendario.deEjercicios) {
    // El calendario del mes: una fila por semana, se usa la elegida. Lo de
    // arriba y lo de abajo (un título, otra tabla) se lee como siempre.
    const n = calendario.nombres.length;
    if (!semanas && n >= 2) semanas = { cuantas: n, elegida: elegir(n), nombres: calendario.nombres };
    const antes = filas.slice(0, calendario.desde);
    const despues = filas.slice(calendario.hasta + 1);
    crudas = [
      ...(antes.some((f) => !vacia(f)) ? partir(antes) : []),
      ...calendario.piezas(semanas && semanas.cuantas === n ? semanas.elegida : elegir(n)),
      ...(despues.some((f) => !vacia(f)) ? partir(despues) : []),
    ];
  } else {
    const st = sacarSemanaTipo(filas);
    filas = st.filas;
    semanaTipo = st.semana;
    const libres = sacarDescansos(filas);
    filas = libres.filas;
    notas.push(...libres.notas);
    crudas = partirEnBloques(filas, notas);
  }
  let piezas = crudas.map(leerPieza);

  // Los días uno debajo del otro y abajo de todo, después de un renglón
  // vacío, algo que no es un día («Calentamiento: …»): de toda la rutina.
  if (crudas.length === 1) {
    const s = separarCola(crudas[0].filas);
    if (s) {
      const cuerpo = leerPieza({ titulo: crudas[0].titulo, filas: s.cuerpo });
      const cola = leerPieza({ titulo: '', filas: s.cola });
      if (cuerpo.leida.dias.length >= 2 && cola.leida.dias.length === 0 && cola.leida.nombre === null) piezas = [cuerpo, cola];
    }
  }

  // La hoja de un día que es solo un descanso con su nota («Sábado»:
  // «Descanso activo: caminar 40 min»): un día sin ejercicios con esa nota,
  // como los de la semana tipo. No el ejercicio «Descanso activo».
  const nombre = h.nombre ?? '';
  const renglones = filas.filter((f) => !vacia(f));
  const soloNotas = (diaDeLaSemana(nombre) !== null || esTituloDeDia(nombre)) && renglones.length > 0 && renglones.length <= 5
    && renglones.every(unica) && RE_DESCANSO.test(plegar(txt(llenas(renglones[0])[0])));
  if (soloNotas) {
    const nota = renglones.map((f) => txt(llenas(f)[0])).join('\n');
    piezas = [{
      titulo: '', fechas: [], cargaConUnidad: false, etiquetas: [],
      leida: { nombre: null, notas: '', dias: [{ nombre: '', notas: nota, ejercicios: [] }], noEntendidas: [] },
    }];
  }

  const conEjercicios = piezas.some((p) => ejerciciosDe(p.leida) > 0);
  // Un ejercicio de verdad: con series, o con repeticiones y un nombre que
  // se conoce o un tiempo («Esteira | 20 min»). «Fecha de inicio | 5/10/26»
  // (del progreso) o «Cada | 4-6 semanas» (de una guía) no.
  const deVerdad = (e: EjercicioLeido) => e.series !== null || (!!e.reps.trim() && (!!buscarBase(e.nombre) || RE_REPS_TIEMPO.test(e.reps.trim())));
  const puntaje = esRegistro(filas, nombre) || esResumen(filas) ? 0
    : piezas.reduce((s, p) => s + p.leida.dias.reduce((t, d) => t + d.ejercicios.filter(deVerdad).length, 0), 0);
  const conEj = piezas.flatMap((p) => p.leida.dias.filter((d) => d.ejercicios.length > 0).map((d) => ({ d, titulo: p.titulo })));
  return {
    nombre, piezas, enc, recortada: !!h.recortada, semanas: semanas !== delLibro ? semanas : null,
    semanaTipo, notas, puntaje, conEjercicios, soloNotas,
    claves: sinRepetir(conEj.map(({ d, titulo }) => claveDeDia(d.nombre.trim() || titulo)).filter(Boolean)),
    diasConEjercicios: conEj.length,
    maxEjercicios: Math.max(0, ...conEj.map(({ d }) => d.ejercicios.length)),
  };
}

// Las repeticiones que son un tiempo o una distancia: «20 min», «45-60 s», «5 km».
const RE_REPS_TIEMPO = /^\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*(?:s|seg|segs|segundos?|min|mins|minutos?|h|hs|horas?|km|m|mts|metros)\b/i;

/**
 * Qué día es, para ver si dos hojas traen los mismos días: el de la semana
 * («Lunes – Pierna» y «LUN» son el lunes), el número o la letra («DÍA 1 –
 * Pecho» y «Día 1» son el 1; «Treino A», la A), o el nombre entero. Vacío
 * si el día no tiene nombre propio (toma el de la hoja).
 */
function claveDeDia(nombre: string): string {
  if (!nombre.trim()) return '';
  const s = diaDeLaSemana(nombre);
  if (s !== null) return `s${s}`;
  const c = clave(nombre);
  const m = /^(?:dia|day|treino|entrenamiento|entreno|rutina|sesion|sessao|workout|ficha)\s*(\d{1,2}|[a-z])\b/.exec(c);
  return m ? `d${m[1]}` : c;
}

// Una hoja que dice ser una versión vieja o una copia de respaldo.
const RE_HOJA_VIEJA = /\b(?:anterior|anteriores|viej[ao]s?|antigu[ao]s?|old|backup|respaldo|copia|copy|borrador|rascunho)\b/;
// Una hoja que dice ser una lista de ejercicios, no la rutina.
const RE_HOJA_BIBLIOTECA = /\b(?:ejercicios|exercicios|exercises|biblioteca|banco|catalogo|lista|videos|base)\b/;

/**
 * ¿Qué hojas se usan, si el trainer no tocó nada? (30/09) Un libro trae la
 * rutina y, al lado, el registro de lo que se hizo, el progreso corporal, un
 * resumen con fórmulas y una guía: antes se sumaba todo a la misma rutina.
 *
 * Se usa toda hoja con algún ejercicio de verdad (el `puntaje`: un día corto,
 * los abdominales o el calentamiento en su hoja también), salvo las que
 * traen una señal de no ser la rutina (revisión 30/09):
 *   · un registro o un resumen (puntaje 0: `esRegistro`, `esResumen`); un
 *     progreso corporal o una guía no tienen ejercicios de verdad;
 *   · una lista de ejercicios al lado de la rutina («Banco de ejercicios»,
 *     «Ejercicios» con 30 o 40 filas): un solo bloque, sin días, mucho más
 *     largo que los días de la rutina (o que no entra en un día);
 *   · otra versión de la misma rutina («Rutina anterior», «Rutina (2)»,
 *     «Octubre» y «Noviembre»): si la mitad o más de sus días ya están en
 *     una hoja elegida. Se queda la que no dice ser vieja, después la de más
 *     ejercicios, y si empatan la de más a la derecha (la más nueva).
 * Además:
 *   · una hoja por día («Lunes», «Martes», «Sábado»): si se usa alguna, se
 *     usan todas las que tienen algo, también la del descanso con su nota;
 *   · la hoja que solo trae la semana tipo, si hay días en otras.
 * Sin ningún ejercicio de verdad, como antes: las que tienen algún ejercicio.
 * La revisión dice qué hojas no se usaron, y el trainer las suma con un toque.
 */
function hojasPorDefecto(leidas: HojaLeida[]): boolean[] {
  const mejor = Math.max(0, ...leidas.map((h) => h.puntaje));
  const esHojaDia = (h: HojaLeida) => diaDeLaSemana(h.nombre) !== null || esTituloDeDia(h.nombre);
  let usa: boolean[];
  if (mejor === 0) usa = leidas.map((h) => h.conEjercicios);
  else {
    const candidata = leidas.map((h) => h.puntaje > 0);
    // Una lista de ejercicios al lado de la rutina.
    const esLista = leidas.map((h, i) => {
      if (!candidata[i] || h.diasConEjercicios !== 1 || esHojaDia(h)) return false;
      const otras = leidas.filter((x, j) => j !== i && candidata[j]);
      if (!otras.length) return false;
      const diaDeOtraRutina = Math.max(0, ...otras.filter((x) => x.diasConEjercicios >= 2).map((x) => x.maxEjercicios));
      const diaDeOtra = Math.max(0, ...otras.map((x) => x.maxEjercicios));
      return h.maxEjercicios > MAX_EJERCICIOS_DIA || (diaDeOtraRutina > 0 && h.maxEjercicios > 2 * diaDeOtraRutina)
        || (RE_HOJA_BIBLIOTECA.test(clave(h.nombre)) && h.maxEjercicios > diaDeOtra);
    });
    // Otra versión de la misma rutina: la preferida primero.
    const vieja = (h: HojaLeida) => (RE_HOJA_VIEJA.test(clave(h.nombre)) ? 1 : 0);
    const orden = leidas.map((_, i) => i).filter((i) => candidata[i] && !esLista[i])
      .sort((a, b) => vieja(leidas[a]) - vieja(leidas[b]) || leidas[b].puntaje - leidas[a].puntaje || b - a);
    const vistos = new Set<string>();
    usa = leidas.map(() => false);
    for (const i of orden) {
      const c = leidas[i].claves;
      if (c.length && c.filter((k) => vistos.has(k)).length * 2 >= c.length) continue;
      usa[i] = true;
      c.forEach((k) => vistos.add(k));
    }
  }
  if (leidas.some((h, i) => usa[i] && esHojaDia(h))) {
    leidas.forEach((h, i) => { if (esHojaDia(h) && (h.conEjercicios || h.soloNotas)) usa[i] = true; });
  }
  if (usa.some(Boolean)) leidas.forEach((h, i) => { if (!h.conEjercicios && h.semanaTipo) usa[i] = true; });
  return usa;
}

/**
 * La planilla entera → una rutina para revisar. `opciones.semana`: cuál de
 * las semanas usar (desde 1; si no, la primera). `opciones.hojas`: las hojas
 * que el trainer sumó o sacó a mano (por nombre).
 */
export function planillaARutina(libro: LibroPlanilla, opciones: OpcionesPlanilla = {}): ResultadoPlanilla {
  const hojasLibro = (libro?.hojas ?? []).filter((h) => h && Array.isArray(h.filas));
  let semanas: Semanas = null;
  const elegir = (cuantas: number) => Math.min(cuantas, Math.max(1, Math.floor(opciones.semana ?? SEMANA_POR_DEFECTO) || 1));

  // Una hoja por semana: se usa una sola.
  const deSemana = hojasLibro.filter((h) => esSemana(h.nombre));
  let hojaElegida: typeof hojasLibro[number] | null = null;
  if (deSemana.length >= 2) {
    const elegida = elegir(deSemana.length);
    semanas = { cuantas: deSemana.length, elegida, nombres: deSemana.map((h) => h.nombre) };
    hojaElegida = deSemana[elegida - 1];
  }
  const aLeer = hojasLibro.filter((h) => !(deSemana.length >= 2 && esSemana(h.nombre)) || h === hojaElegida);
  const leidas = aLeer.map((h) => leerHoja(h, elegir, semanas));

  // Las hojas que se usan: las de la rutina, o las que eligió el trainer
  // (solo una hoja con ejercicios se puede sumar o sacar).
  const porDefecto = hojasPorDefecto(leidas);
  const usada = leidas.map((h, i) => {
    const elegida = opciones.hojas?.[h.nombre];
    return h.conEjercicios && typeof elegida === 'boolean' ? elegida : porDefecto[i];
  });

  // Todo junto, solo de las hojas que se usan.
  let nombre: string | null = null;
  const notas: string[] = [];
  const dias: RutinaLeidaConNotas['dias'] = [];
  const noEntendidas: string[] = [];
  const fechas: string[] = [];
  const etiquetas: string[] = [];
  let duracionSemanas: number | null = null;
  let cargaConUnidadEnEncabezado = false;
  let semanaTipo: SemanaTipo | null = null;
  leidas.forEach((h, i) => {
    if (!usada[i]) return;
    if (!semanas && h.semanas) semanas = h.semanas;
    if (!semanaTipo && h.semanaTipo) semanaTipo = h.semanaTipo;
    notas.push(...h.enc.notas);
    etiquetas.push(...h.enc.etiquetas);
    if (duracionSemanas === null) duracionSemanas = h.enc.semanas;
    const nombreHoja = h.nombre.trim();
    const hojaDaNombre = !!nombreHoja && !RE_HOJA_GENERICA.test(plegar(nombreHoja).trim()) && !esSemana(nombreHoja);
    for (const p of h.piezas) {
      const l = p.leida;
      if (nombre === null && l.nombre && l.nombre.trim()) nombre = l.nombre.trim();
      notas.push(...l.notas.split('\n'));
      noEntendidas.push(...l.noEntendidas);
      fechas.push(...p.fechas);
      etiquetas.push(...p.etiquetas);
      if (p.cargaConUnidad) cargaConUnidadEnEncabezado = true;
      for (const d of l.dias) {
        const sinNombre = !d.nombre.trim();
        const nombreDia = sinNombre ? (p.titulo || (hojaDaNombre ? nombreHoja : '')) : d.nombre;
        // Un título largo (de un bloque o de una hoja): lo que no entra va a las notas del día.
        const [cabeza, sobra] = partirTitulo(nombreDia, LARGOS.nombreDia);
        dias.push({ ...d, nombre: cabeza, notas: [sobra, d.notas].filter((x) => x.trim()).join('\n') });
      }
    }
    notas.push(...h.notas);
  });
  let conAlgo = dias.filter((d) => d.ejercicios.length > 0 || d.notas.trim());
  // La semana tipo: los días en el orden de la semana (ver `armarSemana`).
  const st = semanaTipo as SemanaTipo | null;
  if (st) {
    const armada = armarSemana(conAlgo, st);
    conAlgo = armada.dias;
    notas.push(...armada.notas);
  }
  const notasLimpias = sinRepetir(notas.map((n) => n.trim()).filter(Boolean));
  const leida: RutinaLeidaConNotas = {
    nombre,
    notas: notasLimpias.join('\n'),
    dias: conAlgo,
    noEntendidas,
  };

  // Los avisos.
  const avisos: AvisoPlanilla[] = [];
  const todos = leida.dias.flatMap((d) => d.ejercicios);
  const conFecha = sinRepetir(fechas.map((n) => {
    const k = claveEjercicio(n);
    const e = todos.find((x) => claveEjercicio(x.nombre) === k) ?? todos.find((x) => k.startsWith(`${claveEjercicio(x.nombre)} `));
    return e ? e.nombre : n;
  }));
  if (conFecha.length) avisos.push({ codigo: 'fecha_corregida', ejercicios: conFecha });
  const raras = seriesRaras(leida);
  if (raras.length) avisos.push({ codigo: 'series_raras', ejercicios: raras });
  if (cargaConUnidadEnEncabezado && todos.some((e) => RE_CARGA_SIN_UNIDAD.test(normalizarCarga(e.carga)) && unidadDe(e.carga) === null)) {
    avisos.push({ codigo: 'cargas_sin_unidad' });
  }
  const etqs = sinRepetir(etiquetas);
  if (etqs.length) avisos.push({ codigo: 'datos_no_usados', etiquetas: etqs });
  // Solo de las hojas que se usan: un registro largo que no se usa no avisa nada.
  if (leidas.some((h, i) => usada[i] && h.recortada)) avisos.push({ codigo: 'filas_recortadas' });
  const videos = videosDeLaRutina(leida);
  if (videos.length) avisos.push({ codigo: 'videos', cuantos: videos.length });

  return {
    leida,
    semanas,
    duracionSemanas,
    hojas: leidas.map((h, i) => ({ nombre: h.nombre, usada: usada[i], conEjercicios: h.conEjercicios })),
    avisos,
  };
}

/**
 * «Pegar texto» (D3.10) con todo lo que la revisión tiene que mostrar: con
 * dos renglones o más con tabulador es una planilla pegada, y pasa por el
 * convertidor (días lado a lado, datos del alumno arriba, semanas), con su
 * selector de semana y sus avisos (los datos que no se usaron nunca se
 * pierden en silencio). Si no, el lector de siempre, sin nada más.
 */
export function pegadoComoPlanilla(texto: string, opciones: OpcionesPlanilla = {}): ResultadoPlanilla {
  const conTab = (texto ?? '').split(/\r?\n/).filter((l) => l.includes('\t')).length;
  if (conTab >= 2) return planillaARutina(libroDesdeTexto(texto), opciones);
  return { leida: leerRutina(texto), semanas: null, duracionSemanas: null, hojas: [], avisos: [] };
}

/** Lo que se entendió de lo pegado (la semana 1, si trae varias). */
export function leerTextoPegado(texto: string): RutinaLeidaConNotas {
  return pegadoComoPlanilla(texto).leida;
}
