/**
 * PLANILLAS (114): una planilla como filas de celdas de texto, venga de
 * donde venga.
 *
 * Es genérico a propósito (módulos por problema, no por oficio): hoy lo usa
 * el trainer para subir su rutina de Excel o Google Sheets, y mañana lo
 * puede usar cualquier otra importación. Acá no hay nada de rutinas.
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
 */
export interface CeldaPlanilla {
  texto: string;
  link?: string;
  negrita?: boolean;
  fecha?: boolean;
  formula?: boolean;
}

export interface HojaPlanilla {
  nombre: string;
  filas: (CeldaPlanilla | null)[][];
  /** Tenía más filas que el tope y se leyeron las primeras. */
  recortada?: boolean;
}

export interface LibroPlanilla {
  hojas: HojaPlanilla[];
}

export type ErrorPlanilla = 'muy_grande' | 'xls_viejo' | 'ods' | 'numbers' | 'no_es_planilla';

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
export function revisarZip(bytes: Uint8Array): { ok: true } | { error: ErrorPlanilla } {
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
    if (total > TOPES_PLANILLA.descomprimido) return { error: 'no_es_planilla' };
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
function conTopes(nombre: string, filas: (CeldaPlanilla | null)[][]): HojaPlanilla {
  const recortada = filas.length > TOPES_PLANILLA.filas;
  const hoja: HojaPlanilla = {
    nombre,
    filas: filas.slice(0, TOPES_PLANILLA.filas).map((f) => f.slice(0, TOPES_PLANILLA.columnas)),
  };
  if (recortada) hoja.recortada = true;
  return hoja;
}

const celda = (t: string): CeldaPlanilla | null => (t.trim() ? { texto: t } : null);

/**
 * Un CSV como lo bajan Excel y Google Sheets:
 *   · con o sin BOM; en UTF-8 o, si no lo es, en Windows-1252 (el «CSV» de
 *     Excel en español: «Día» y «Última» salen bien);
 *   · separado por «;» (Excel en español y portugués), «,» (Google Sheets) o
 *     tabulador: el que más aparece en el primer renglón con datos;
 *   · con comillas («"Última al fallo; con ayudante"», y «""» adentro);
 *   · con CRLF o LF.
 * Una sola hoja, sin nombre: el nombre del archivo suele traer el del alumno.
 */
export function libroDesdeCsv(bytes: Uint8Array): LibroPlanilla {
  let datos = bytes;
  if (datos.length >= 3 && datos[0] === 0xef && datos[1] === 0xbb && datos[2] === 0xbf) datos = datos.subarray(3);
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(datos);
  } catch {
    texto = new TextDecoder('windows-1252').decode(datos);
  }
  texto = texto.replace(/^﻿/, '');

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
      if (filas.length > TOPES_PLANILLA.filas) break;
      continue;
    }
    actual += c;
  }
  if (actual !== '' || fila.length) {
    fila.push(actual);
    filas.push(fila.map(celda));
  }
  return { hojas: [conTopes('', filas)] };
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
