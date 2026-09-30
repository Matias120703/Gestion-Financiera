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
  LARGOS, datosEnTexto, esTituloDeDia, leerRutina, normalizarCarga, tipoDeColumna, unidadDe,
  type Columna, type RutinaLeidaConNotas,
} from './rutina-texto';
import { libroDesdeTexto, type CeldaPlanilla, type LibroPlanilla } from './planilla';
import { buscarBase, claveEjercicio } from './ejercicios-base';

/** La semana que se usa sola (pregunta 12 de Matías): la primera. */
export const SEMANA_POR_DEFECTO = 1;

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
  /** Las hojas que se leyeron, y si se usaron (una sin ejercicios no se usa). */
  hojas: { nombre: string; usada: boolean }[];
  avisos: AvisoPlanilla[];
}

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

/**
 * Parte la hoja en bloques lado a lado: por una fila de días («DÍA 1 | DÍA
 * 2»), por una matriz de ejercicios por días, por «Ejercicio» repetido en un
 * encabezado, o por columnas vacías. Si no hay bloques, la hoja entera es
 * una pieza.
 */
function partirEnBloques(filas: Filas): Pieza[] {
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
    // Un renglón suelto fuera de los días («Descanso: 60-90 s entre series»
    // escrito en la columna del «#») es de toda la rutina: se lee aparte, al
    // final, en vez de perderse.
    const sueltas: Filas = [];
    const debajo = filas.slice(r + 1).map((f) => {
      const k = f.findIndex((c) => txt(c));
      if (unica(f) && (numeracion.has(k) || k < pos[0])) { sueltas.push(f); return f.map(() => null); }
      return f.map((c, j) => (numeracion.has(j) ? null : c));
    });
    pos.forEach((p, i) => {
      const fin = i + 1 < pos.length ? pos[i + 1] - 1 : w - 1;
      piezas.push({ titulo: txt(filas[r][p]), filas: columnasDe(debajo, p, fin) });
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

/**
 * La planilla entera → una rutina para revisar. `opciones.semana`: cuál de
 * las semanas usar (desde 1; si no, la primera).
 */
export function planillaARutina(libro: LibroPlanilla, opciones: { semana?: number } = {}): ResultadoPlanilla {
  const hojasLibro = (libro?.hojas ?? []).filter((h) => h && Array.isArray(h.filas));
  let semanas: ResultadoPlanilla['semanas'] = null;
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

  interface HojaLeida { nombre: string; piezas: PiezaLeida[]; enc: Encabezado; recortada: boolean; usada: boolean }
  const leidas: HojaLeida[] = [];
  for (const h of aLeer) {
    // Una copia: se van vaciando celdas (el encabezado de la hoja).
    let filas: Filas = h.filas.map((f) => (Array.isArray(f) ? f.map((c) => (c && typeof c.texto === 'string' ? { ...c } : null)) : []));

    // El encabezado de la hoja (Alumno, Objetivo, Duración…), arriba del primer encabezado de ejercicios.
    const encs = encabezados(filas);
    const primero = encs.length ? (encs[0].arriba ?? encs[0].fila) : filas.length;
    const enc = sacarEncabezado(filas, primero, encs.length === 0);

    // Semanas apiladas: «SEMANA 1» sola en su fila.
    const marcas = filas.map((f, r) => (marcaDeSemana(f) ? r : -1)).filter((r) => r >= 0);
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

    const piezas = partirEnBloques(filas).map(leerPieza);
    const usada = piezas.some((p) => ejerciciosDe(p.leida) > 0);
    leidas.push({ nombre: h.nombre ?? '', piezas, enc, recortada: !!h.recortada, usada });
  }

  // Todo junto, solo de las hojas que se usan.
  let nombre: string | null = null;
  const notas: string[] = [];
  const dias: RutinaLeidaConNotas['dias'] = [];
  const noEntendidas: string[] = [];
  const fechas: string[] = [];
  const etiquetas: string[] = [];
  let duracionSemanas: number | null = null;
  let cargaConUnidadEnEncabezado = false;
  for (const h of leidas) {
    if (!h.usada) continue;
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
        dias.push({ ...d, nombre: Array.from(nombreDia).slice(0, LARGOS.nombreDia).join('').trim() });
      }
    }
  }
  const notasLimpias = sinRepetir(notas.map((n) => n.trim()).filter(Boolean));
  const leida: RutinaLeidaConNotas = {
    nombre,
    notas: notasLimpias.join('\n'),
    dias: dias.filter((d) => d.ejercicios.length > 0 || d.notas.trim()),
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
  if (leidas.some((h) => h.recortada)) avisos.push({ codigo: 'filas_recortadas' });
  const videos = videosDeLaRutina(leida);
  if (videos.length) avisos.push({ codigo: 'videos', cuantos: videos.length });

  return {
    leida,
    semanas,
    duracionSemanas,
    hojas: leidas.map((h) => ({ nombre: h.nombre, usada: h.usada })),
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
export function pegadoComoPlanilla(texto: string, opciones: { semana?: number } = {}): ResultadoPlanilla {
  const conTab = (texto ?? '').split(/\r?\n/).filter((l) => l.includes('\t')).length;
  if (conTab >= 2) return planillaARutina(libroDesdeTexto(texto), opciones);
  return { leida: leerRutina(texto), semanas: null, duracionSemanas: null, hojas: [], avisos: [] };
}

/** Lo que se entendió de lo pegado (la semana 1, si trae varias). */
export function leerTextoPegado(texto: string): RutinaLeidaConNotas {
  return pegadoComoPlanilla(texto).leida;
}
