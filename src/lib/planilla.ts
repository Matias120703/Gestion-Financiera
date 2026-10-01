/**
 * PLANILLAS (114): una planilla como filas de celdas de texto, venga de
 * donde venga.
 *
 * Es genérico a propósito (módulos por problema, no por oficio): lo usa el
 * trainer para subir su rutina de Excel o Google Sheets, y desde la 122 el
 * negocio para subir su lista de productos (con sus topes, lo oculto y los
 * números tal cual, y el libro en corto para la respuesta). Acá no hay nada
 * de rutinas ni de productos.
 *
 * De dónde sale un `LibroPlanilla`:
 *   · un .xlsx/.xlsm: lo lee el SERVIDOR con exceljs (planilla-xlsx.ts), que
 *     pesa ~0,9 MB y no puede ir al celular;
 *   · un .csv/.tsv: lo lee el navegador con `libroDesdeCsv`, sin subirlo;
 *   · un texto pegado con tabuladores: `libroDesdeTexto`.
 *
 * Antes de abrir un archivo se mira su firma y el directorio del zip
 * (`firmaDeArchivo`, `revisarZip`): un Excel viejo o con contraseña, un
 * LibreOffice, un Numbers o una bomba de zip se frenan con un mensaje claro
 * y sin abrirlos. Todo con `Uint8Array`/`DataView` (sin `Buffer`): corre en
 * el navegador y en el servidor.
 *
 * Este archivo NO importa nada: se compila suelto para las pruebas
 * (pruebas/tsconfig.calculos.json).
 */

/**
 * Una celda, ya como texto. `link`: el de un hipervínculo. `fecha`: Excel la
 * había convertido en fecha. `formula`: es el resultado de una fórmula.
 *
 * Con `numeros` (la lista de productos, 122) la celda trae además:
 *   · `numero`: el número tal cual estaba en la celda (o el resultado de su
 *     fórmula). El texto de un número sale con coma decimal («1234,567»), y
 *     leído de nuevo como monto sería un millón: el número no pasa por ahí;
 *   · `sinCalcular`: una fórmula SIN resultado guardado (la planilla la armó
 *     un programa y nunca se abrió en Excel). Llega con el texto vacío, y la
 *     revisión puede decir por qué falta el precio;
 *   · `combinada`: es la de arriba a la izquierda de una combinación A LO
 *     ANCHO (la fila «Ferretería» combinada de A a F, centrada y con color:
 *     un subtítulo de grupo aunque no esté en negrita);
 *   · el texto de un número con formato de ceros («000000») es el que muestra
 *     Excel, con sus ceros: 123 se ve 000123, y así lo tiene el negocio.
 */
export interface CeldaPlanilla {
  texto: string;
  link?: string;
  negrita?: boolean;
  fecha?: boolean;
  formula?: boolean;
  numero?: number;
  sinCalcular?: boolean;
  combinada?: boolean;
}

export interface HojaPlanilla {
  nombre: string;
  filas: (CeldaPlanilla | null)[][];
  /** Tenía más filas que el tope y se leyeron las primeras. */
  recortada?: boolean;
  /**
   * Con `ocultas` (122): las filas (su lugar en `filas`) y las columnas que
   * estaban ocultas en el Excel. Se leen igual y quedan marcadas: el costo
   * escondido para imprimir la lista y la mitad de la lista tapada por un
   * filtro no se pierden en silencio.
   */
  filasOcultas?: number[];
  columnasOcultas?: number[];
}

export interface LibroPlanilla {
  hojas: HojaPlanilla[];
}

export type ErrorPlanilla = 'muy_grande' | 'xls_viejo' | 'ods' | 'numbers' | 'no_es_planilla';

/** Hasta dónde se lee. `filasEnTotal`: sumando todas las hojas (sin él, solo por hoja). */
export interface TopesPlanilla {
  readonly bytes: number;
  readonly hojas: number;
  readonly filas: number;
  readonly columnas: number;
  readonly descomprimido: number;
  readonly filasEnTotal?: number;
}

/**
 * Los topes (D3.11). 4 MB: Vercel corta los pedidos en 4,5 MB. 40 MB
 * descomprimidos: lo que se mira en el directorio del zip ANTES de abrirlo.
 */
export const TOPES_PLANILLA = {
  bytes: 4 * 1024 * 1024,
  hojas: 20,
  filas: 500,
  columnas: 40,
  descomprimido: 40 * 1024 * 1024,
} as const;

/**
 * LA LISTA DE PRODUCTOS (122). La del negocio de verdad tiene miles: 30.000
 * filas sumando las hojas (20.000 productos son 784 KB de .xlsx y 1,5 MB de
 * CSV, medido). Lo demás, como la rutina: el mismo archivo de 4 MB, las
 * mismas 20 hojas, 40 columnas y el mismo control de descompresión.
 */
export const TOPES_CATALOGO: TopesPlanilla = {
  ...TOPES_PLANILLA,
  filas: 30000,
  filasEnTotal: 30000,
};

/**
 * Lo más que puede pesar la respuesta de la ruta con el libro en corto
 * (`libroACompacto`). Vercel corta las respuestas en 4,5 MB; 20.000
 * productos son ~1,7 MB.
 */
export const TOPE_RESPUESTA = 4 * 1024 * 1024;

/** Las marcas de tilde que deja normalize('NFD'): U+0300 a U+036F (con fromCharCode: pegadas no se ven). */
const RE_MARCAS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/** Minúsculas y sin tildes (también la ñ y la ç: es para comparar títulos). */
export function plegar(s: string): string {
  return (s ?? '').normalize('NFD').replace(RE_MARCAS, '').toLowerCase();
}

/** El texto de una celda en un renglón: sin saltos de línea ni tabuladores adentro. */
export function textoDeCelda(c: CeldaPlanilla | null | undefined): string {
  const t = c?.texto ?? '';
  // Lo de casi todas las celdas: nada que limpiar (20.000 filas lo agradecen).
  if (!/\s\s|[\t\r\n]|^\s|\s$/.test(t)) return t;
  return t.replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Qué es un archivo por sus primeros bytes. `xls_viejo`: la firma de los
 * archivos de Office anteriores a 2007 (D0 CF 11 E0), que es también la de
 * un .xlsx con contraseña (va cifrado adentro de uno de esos).
 */
export function firmaDeArchivo(bytes: Uint8Array): 'zip' | 'xls_viejo' | 'otro' {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))) return 'zip';
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'xls_viejo';
  return 'otro';
}

const decodificarAscii = (bytes: Uint8Array, desde: number, largo: number): string => {
  let s = '';
  for (let i = desde; i < desde + largo && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

/**
 * Mira el zip SIN abrirlo: solo el directorio central, que dice qué archivos
 * trae y cuánto ocupa cada uno descomprimido.
 *   · `mimetype` de OpenDocument → `ods` (LibreOffice / OpenOffice);
 *   · `Index/Document.iwa` → `numbers` (Numbers de Apple);
 *   · más de 40 MB descomprimidos, sin `xl/workbook.xml`, o un zip roto →
 *     `no_es_planilla`.
 */
export function revisarZip(bytes: Uint8Array, tope: number = TOPES_PLANILLA.descomprimido): { ok: true } | { error: ErrorPlanilla } {
  if (firmaDeArchivo(bytes) !== 'zip') return { error: 'no_es_planilla' };
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // El fin del directorio central: está en los últimos 22 bytes, o antes si
  // el zip tiene un comentario (hasta 65 535 bytes).
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) return { error: 'no_es_planilla' };
  const entradas = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  // ZIP64 (0xFFFF / 0xFFFFFFFF): Excel no lo usa para una planilla de este tamaño.
  if (entradas === 0xffff || p === 0xffffffff || p >= bytes.length) return { error: 'no_es_planilla' };
  let total = 0;
  let libro = false;
  let tipoOds: string | null = null;
  let numbers = false;
  for (let k = 0; k < entradas; k++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) return { error: 'no_es_planilla' };
    const metodo = v.getUint16(p + 10, true);
    const comprimido = v.getUint32(p + 20, true);
    const tamano = v.getUint32(p + 24, true);
    const largoNombre = v.getUint16(p + 28, true);
    const largoExtra = v.getUint16(p + 30, true);
    const largoComentario = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = decodificarAscii(bytes, p + 46, largoNombre);
    if (tamano === 0xffffffff) return { error: 'no_es_planilla' };
    total += tamano;
    if (total > tope) return { error: 'no_es_planilla' };
    if (nombre === 'xl/workbook.xml') libro = true;
    if (nombre === 'Index/Document.iwa' || nombre.startsWith('Index/')) numbers = true;
    if (nombre === 'mimetype') {
      // En OpenDocument va primero y sin comprimir: se lee del encabezado local.
      tipoOds = '';
      if (metodo === 0 && local + 30 <= bytes.length && v.getUint32(local, true) === 0x04034b50) {
        const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
        tipoOds = decodificarAscii(bytes, inicio, Math.min(comprimido, 200));
      }
    }
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  if (tipoOds !== null && !libro) return { error: /opendocument/i.test(tipoOds) || tipoOds === '' ? 'ods' : 'no_es_planilla' };
  if (numbers && !libro) return { error: 'numbers' };
  if (!libro) return { error: 'no_es_planilla' };
  return { ok: true };
}

/** Una hoja con los topes de filas y columnas. */
function conTopes(nombre: string, filas: (CeldaPlanilla | null)[][], topes: TopesPlanilla): HojaPlanilla {
  const tope = Math.min(topes.filas, topes.filasEnTotal ?? Infinity);
  const recortada = filas.length > tope;
  const hoja: HojaPlanilla = {
    nombre,
    filas: filas.slice(0, tope).map((f) => f.slice(0, topes.columnas)),
  };
  if (recortada) hoja.recortada = true;
  return hoja;
}

const celda = (t: string): CeldaPlanilla | null => (t.trim() ? { texto: t } : null);

/** UTF-16 (`le`: el byte bajo primero) → texto. El de «big endian» se da vuelta y se lee igual. */
function desdeUtf16(bytes: Uint8Array, le: boolean): string {
  const largo = bytes.length - (bytes.length % 2);
  let datos = bytes.subarray(0, largo);
  if (!le) {
    const vuelta = new Uint8Array(largo);
    for (let i = 0; i < largo; i += 2) { vuelta[i] = datos[i + 1]; vuelta[i + 1] = datos[i]; }
    datos = vuelta;
  }
  return new TextDecoder('utf-16le').decode(datos);
}

/**
 * Los bytes de un CSV → texto (26). UTF-16 con su BOM (FF FE o FE FF: el
 * «Texto Unicode» de Excel, el «Unicode» de LibreOffice) o sin él (muchos
 * ceros en las posiciones pares o impares); si no, UTF-8 con o sin BOM; y
 * si no es UTF-8, Windows-1252. Antes el UTF-16 se leía como Windows-1252,
 * con un carácter nulo entre cada letra: «No encontré productos».
 */
function textoDeCsv(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return desdeUtf16(bytes.subarray(2), true);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return desdeUtf16(bytes.subarray(2), false);
  const muestra = Math.min(bytes.length, 4000) & ~1;
  if (muestra >= 8) {
    let pares = 0;
    let impares = 0;
    for (let i = 0; i < muestra; i++) if (bytes[i] === 0) { if (i % 2) impares++; else pares++; }
    const mitad = muestra / 2;
    if (impares >= mitad * 0.3 && pares <= mitad * 0.05) return desdeUtf16(bytes, true);
    if (pares >= mitad * 0.3 && impares <= mitad * 0.05) return desdeUtf16(bytes, false);
  }
  let datos = bytes;
  if (datos.length >= 3 && datos[0] === 0xef && datos[1] === 0xbb && datos[2] === 0xbf) datos = datos.subarray(3);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(datos);
  } catch {
    return new TextDecoder('windows-1252').decode(datos);
  }
}

/**
 * Un CSV como lo bajan Excel y Google Sheets:
 *   · con o sin BOM; en UTF-8 o, si no lo es, en Windows-1252 (el «CSV» de
 *     Excel en español: «Día» y «Última» salen bien); en UTF-16 (el «Texto
 *     Unicode» de Excel, un .txt separado por tabuladores, 122);
 *   · separado por «;» (Excel en español y portugués), «,» (Google Sheets) o
 *     tabulador: el que más aparece en el primer renglón con datos;
 *   · con comillas («"Última al fallo; con ayudante"», y «""» adentro);
 *   · con CRLF o LF.
 * Una sola hoja, sin nombre: el nombre del archivo suele traer el del alumno.
 *
 * `topes`: los de la rutina por defecto (500 filas); la lista de productos
 * pasa `TOPES_CATALOGO` (122).
 */
export function libroDesdeCsv(bytes: Uint8Array, topes: TopesPlanilla = TOPES_PLANILLA): LibroPlanilla {
  const topeFilas = Math.min(topes.filas, topes.filasEnTotal ?? Infinity);
  // Sin el BOM que quede y sin caracteres nulos (un UTF-16 mal cortado).
  const texto = textoDeCsv(bytes).replace(/^﻿/, '').replace(/\x00/g, '');

  const primera = texto.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const cuenta = (c: string) => {
    let n = 0, comillas = false;
    for (const x of primera) {
      if (x === '"') comillas = !comillas;
      else if (x === c && !comillas) n++;
    }
    return n;
  };
  const candidatos = [';', ',', '\t'].map((c) => [c, cuenta(c)] as const);
  const separador = candidatos.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

  const filas: (CeldaPlanilla | null)[][] = [];
  let fila: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { actual += '"'; i++; } else comillas = false;
      } else actual += c;
      continue;
    }
    if (c === '"' && actual.trim() === '') { comillas = true; actual = ''; continue; }
    if (c === separador) { fila.push(actual); actual = ''; continue; }
    if (c === '\r' && texto[i + 1] === '\n') continue;
    if (c === '\n' || c === '\r') {
      fila.push(actual);
      filas.push(fila.map(celda));
      fila = [];
      actual = '';
      if (filas.length > topeFilas) break;
      continue;
    }
    actual += c;
  }
  if (actual !== '' || fila.length) {
    fila.push(actual);
    filas.push(fila.map(celda));
  }
  return { hojas: [conTopes('', filas, topes)] };
}

/**
 * Una celda entre comillas, como copian Excel y Google Sheets la que tiene
 * renglones, tabuladores o comillas adentro: «"Sentadilla 4x12⏎Prensa
 * 3x12"», con «""» por cada comilla. Solo si cierra justo antes de un
 * tabulador o del fin del renglón, y si adentro hay algo que la pedía: un
 * «"Bajar lento"» escrito a mano queda como estaba.
 */
function celdaEntreComillas(t: string, i: number): { valor: string; fin: number } | null {
  let valor = '';
  let j = i + 1;
  while (j < t.length) {
    if (t[j] === '"') {
      if (t[j + 1] === '"') { valor += '"'; j += 2; continue; }
      const sig = t[j + 1];
      return (sig === undefined || sig === '\t' || sig === '\n') && /[\n\t"]/.test(valor) ? { valor, fin: j + 1 } : null;
    }
    valor += t[j];
    j++;
  }
  return null;
}

/**
 * Lo pegado en «Pegar texto»: un renglón por fila y las celdas por
 * tabulador (una celda con renglones adentro viene entre comillas). Sin tope
 * de filas: «Pegar texto» nunca lo tuvo, y lo pegado ya está en el celular.
 */
export function libroDesdeTexto(texto: string): LibroPlanilla {
  const t = (texto ?? '').replace(/\r\n?/g, '\n');
  const filas: string[][] = [];
  let fila: string[] = [];
  let i = 0;
  for (;;) {
    const q = t[i] === '"' ? celdaEntreComillas(t, i) : null;
    let fin = i;
    if (q) fin = q.fin;
    else while (fin < t.length && t[fin] !== '\t' && t[fin] !== '\n') fin++;
    fila.push(q ? q.valor : t.slice(i, fin));
    if (fin >= t.length) { filas.push(fila); break; }
    if (t[fin] === '\n') { filas.push(fila); fila = []; }
    i = fin + 1;
  }
  return { hojas: [{ nombre: '', filas: filas.map((f) => f.slice(0, TOPES_PLANILLA.columnas).map(celda)) }] };
}

// ─────────────────────────── el libro en corto (122) ───────────────────────────

/**
 * EL LIBRO EN CORTO: lo que viaja de /api/productos/planilla al navegador.
 *
 * Con las celdas como objetos, 20.000 productos eran 2,8 MB de respuesta;
 * así son ~1,7 MB (medido). Cada celda es su texto, su número (si era un
 * número: el navegador lo usa tal cual), `null` (vacía) o `false` (una
 * fórmula sin resultado guardado). Las filas pierden las celdas vacías del
 * final. `negrita`: las filas cuya primera celda con algo está en negrita
 * (un subtítulo «BEBIDAS»); `combinadas`: las que la tienen combinada a lo
 * ancho (el subtítulo «Ferretería» de A a F). Las fechas y los links llegan
 * como su texto: la lista de productos no los usa. Un número con sus ceros
 * de adelante (formato «000000») llega como el texto que muestra Excel
 * («000123»): es un código, y sin los ceros no lo encuentra el sistema de caja.
 */
export type CeldaCompacta = string | number | null | false;

export interface HojaCompacta {
  nombre: string;
  filas: CeldaCompacta[][];
  negrita?: number[];
  combinadas?: number[];
  ocultas?: number[];
  columnasOcultas?: number[];
  recortada?: true;
}

export interface LibroCompacto {
  v: 1;
  hojas: HojaCompacta[];
}

/** 12.5 → «12,5»: como lo muestra el Excel en español (igual que planilla-xlsx). */
function numeroComoTextoCorto(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(+n.toFixed(10)).replace('.', ',');
}

const bytesDe = (s: string) => new TextEncoder().encode(s).length;

/**
 * El libro → en corto. Si en corto pasa de `tope` bytes (40 columnas de
 * texto largo en 30.000 filas), se cortan las filas del final y la hoja
 * queda `recortada`: mejor leer las primeras que no poder leer ninguna.
 */
export function libroACompacto(libro: LibroPlanilla, tope: number = TOPE_RESPUESTA): LibroCompacto {
  const hojas: HojaCompacta[] = libro.hojas.map((h) => {
    const negrita: number[] = [];
    const combinadas: number[] = [];
    const filas = h.filas.map((f, r) => {
      const fila: CeldaCompacta[] = f.map((c) => {
        if (!c) return null;
        if (c.sinCalcular) return false;
        // «000123» (formato de ceros): el texto, que es lo que ve el negocio (28).
        if (typeof c.numero === 'number' && Number.isFinite(c.numero)) return /^0\d+$/.test(c.texto) ? c.texto : c.numero;
        return c.texto === '' ? null : c.texto;
      });
      while (fila.length && fila[fila.length - 1] === null) fila.pop();
      const primera = f.find((c) => c && (c.texto || c.sinCalcular));
      if (primera?.negrita) negrita.push(r);
      if (primera?.combinada) combinadas.push(r);
      return fila;
    });
    const hoja: HojaCompacta = { nombre: h.nombre, filas };
    if (negrita.length) hoja.negrita = negrita;
    if (combinadas.length) hoja.combinadas = combinadas;
    if (h.filasOcultas?.length) hoja.ocultas = h.filasOcultas;
    if (h.columnasOcultas?.length) hoja.columnasOcultas = h.columnasOcultas;
    if (h.recortada) hoja.recortada = true;
    return hoja;
  });
  const compacto: LibroCompacto = { v: 1, hojas };
  if (bytesDe(JSON.stringify(compacto)) <= tope) return compacto;

  // Pasa del tope: las filas del final afuera, hoja por hoja en orden.
  let usado = 200;
  for (const h of hojas) {
    usado += bytesDe(JSON.stringify(h.nombre)) + 64;
    let r = 0;
    for (; r < h.filas.length; r++) {
      const peso = bytesDe(JSON.stringify(h.filas[r])) + 1;
      if (usado + peso > tope * 0.9) break;
      usado += peso;
    }
    if (r < h.filas.length) {
      h.filas = h.filas.slice(0, r);
      h.recortada = true;
      if (h.negrita) h.negrita = h.negrita.filter((x) => x < r);
      if (h.combinadas) h.combinadas = h.combinadas.filter((x) => x < r);
      if (h.ocultas) h.ocultas = h.ocultas.filter((x) => x < r);
    }
  }
  return compacto;
}

/** Lo que llegó de la ruta → el libro de siempre, o null si no tiene forma de libro. */
export function compactoALibro(x: unknown): LibroPlanilla | null {
  const c = x as LibroCompacto | null;
  if (!c || c.v !== 1 || !Array.isArray(c.hojas)) return null;
  const hojas: HojaPlanilla[] = [];
  for (const h of c.hojas) {
    if (!h || !Array.isArray(h.filas)) return null;
    const negrita = new Set(Array.isArray(h.negrita) ? h.negrita : []);
    const combinadas = new Set(Array.isArray(h.combinadas) ? h.combinadas : []);
    const filas = h.filas.map((f, r) => {
      if (!Array.isArray(f)) return [];
      let marcada = !negrita.has(r);
      let combinadaMarcada = !combinadas.has(r);
      return f.map((v): CeldaPlanilla | null => {
        let celdaLeida: CeldaPlanilla | null = null;
        if (v === false) celdaLeida = { texto: '', sinCalcular: true };
        else if (typeof v === 'number' && Number.isFinite(v)) celdaLeida = { texto: numeroComoTextoCorto(v), numero: v };
        else if (typeof v === 'string' && v !== '') celdaLeida = { texto: v };
        if (celdaLeida && !marcada) { celdaLeida.negrita = true; marcada = true; }
        if (celdaLeida && !combinadaMarcada) { celdaLeida.combinada = true; combinadaMarcada = true; }
        return celdaLeida;
      });
    });
    const hoja: HojaPlanilla = { nombre: String(h.nombre ?? ''), filas };
    if (h.recortada) hoja.recortada = true;
    if (Array.isArray(h.ocultas) && h.ocultas.length) hoja.filasOcultas = h.ocultas.filter((n) => Number.isInteger(n));
    if (Array.isArray(h.columnasOcultas) && h.columnasOcultas.length) hoja.columnasOcultas = h.columnasOcultas.filter((n) => Number.isInteger(n));
    hojas.push(hoja);
  }
  return { hojas };
}
