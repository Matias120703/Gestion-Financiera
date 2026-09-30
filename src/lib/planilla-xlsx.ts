/**
 * UN .XLSX COMO `LibroPlanilla` (114). SOLO EN EL SERVIDOR.
 *
 * exceljs pesa ~0,9 MB: no puede ir al celular del trainer (y menos al del
 * alumno). Lo llama únicamente la ruta /api/rutinas/importar; hay una prueba
 * que vigila que ningún componente ni la página del alumno lo importen.
 *
 * Antes de abrir el archivo se mira su firma y el directorio del zip
 * (planilla.ts): un Excel viejo o con contraseña, un LibreOffice, un Numbers
 * o un zip que se infla a más de 40 MB no llegan a exceljs. Y como el
 * directorio puede mentir, antes de exceljs se descomprime de verdad,
 * contando, y se corta a los 40 MB (`entraDescomprimido`).
 *
 * Lo que se rehace al leer cada celda, porque Excel lo cambió sin avisar:
 *   · una fecha que el trainer no escribió como fecha: «8-10» tipeado en
 *     Excel en español queda guardado como 8 de octubre. Se vuelve a
 *     escribir en el orden del formato de la celda («8-10») y la celda se
 *     marca `fecha`, para avisarlo en la revisión (no se puede adivinar sin
 *     avisar: en un Excel en inglés el mismo «8-10» es el 10 de agosto);
 *   · una hora: «1:30» con formato h:mm es para Excel una hora y media, y
 *     para el trainer un minuto y medio de descanso. Vuelve como «1:30»;
 *   · un número con decimales, con coma («12,5», como lo vio el trainer), y
 *     un porcentaje como «75%».
 *
 * Las hojas ocultas (la lista de un desplegable, cálculos) y las columnas y
 * filas ocultas no se leen. Las celdas combinadas: la parte horizontal queda
 * vacía y la vertical repite el valor hacia abajo en la misma columna (así
 * «Peito» combinado en tres filas es el grupo de las tres). Las imágenes, las
 * validaciones y el formato condicional ni se cargan.
 *
 * El archivo no se guarda en ningún lado y su contenido no se escribe en
 * los logs (D3.12).
 */
import ExcelJS from 'exceljs';
// El mismo JSZip con el que exceljs abre el archivo (es su dependencia; va
// declarado en package.json para no depender de dónde lo instala npm).
import JSZip from 'jszip';
import {
  TOPES_PLANILLA, firmaDeArchivo, revisarZip,
  type CeldaPlanilla, type ErrorPlanilla, type HojaPlanilla, type LibroPlanilla,
} from './planilla';

/** El flujo de una entrada del zip, pedazo a pedazo (JSZip lo tiene; sus tipos no lo nombran). */
interface FlujoDeEntrada {
  on(evento: 'data', f: (pedazo: Uint8Array) => void): FlujoDeEntrada;
  on(evento: 'end', f: () => void): FlujoDeEntrada;
  on(evento: 'error', f: (e: unknown) => void): FlujoDeEntrada;
  pause(): FlujoDeEntrada;
  resume(): FlujoDeEntrada;
}

/**
 * ¿El zip, descomprimido DE VERDAD, entra en el tope? `revisarZip` suma lo
 * que el zip DICE de sí mismo, y un archivo armado a mano puede mentir: decir
 * 1 KB y llevar adentro 2 GB de ceros. exceljs descomprime entera cada
 * entrada (también las que no usa) y JSZip recién compara el tamaño real con
 * el declarado al terminar, con todo ya en memoria: la función se quedaba
 * sin memoria. Acá se descomprime cada entrada con el mismo JSZip, pedazo a
 * pedazo (16 KB comprimidos por vez), sin guardar nada, y se corta apenas el
 * total real pasa el tope.
 */
async function entraDescomprimido(bytes: Uint8Array, tope: number): Promise<boolean> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return false;
  }
  let total = 0;
  for (const entrada of Object.values(zip.files)) {
    if (entrada.dir) continue;
    const bien = await new Promise<boolean>((resolver) => {
      let listo = false;
      const terminar = (v: boolean) => { if (!listo) { listo = true; resolver(v); } };
      let flujo: FlujoDeEntrada;
      try {
        flujo = (entrada as unknown as { internalStream(tipo: 'uint8array'): FlujoDeEntrada }).internalStream('uint8array');
      } catch {
        terminar(false);
        return;
      }
      flujo.on('data', (pedazo) => {
        if (listo) return;
        total += pedazo.length;
        if (total > tope) { flujo.pause(); terminar(false); }
      });
      flujo.on('error', () => terminar(false));
      flujo.on('end', () => terminar(true));
      flujo.resume();
    });
    if (!bien) return false;
  }
  return true;
}

const IGNORAR = [
  'dataValidations', 'conditionalFormatting', 'drawing', 'picture', 'extLst', 'pageSetup', 'headerFooter',
  'printOptions', 'pageMargins', 'rowBreaks', 'autoFilter', 'tableParts', 'sheetProtection',
];

/** ¿El formato es solo de hora (h:mm, mm:ss) y no de fecha? */
function formatoDeHora(numFmt: string | undefined): boolean {
  const f = String(numFmt || '').toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
  return /h|s/.test(f) && !/d|y/.test(f.replace(/\bm+\b/g, ''));
}

function esHora(d: Date, numFmt: string | undefined): boolean {
  return formatoDeHora(numFmt) || (d.getUTCFullYear() === 1899 && d.getUTCMonth() === 11 && d.getUTCDate() === 30);
}

/**
 * Una fecha u hora que Excel inventó, escrita como la tipeó el trainer: en
 * el orden del formato de la celda, y sin el año si el formato no lo
 * muestra. «8 de octubre» con formato d-mmm → «8-10»; 1:30 h con formato
 * h:mm → «1:30».
 */
export function fechaComoTexto(d: Date, numFmt: string | undefined): string {
  const f = String(numFmt || '').toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
  if (esHora(d, numFmt)) {
    const h = d.getUTCHours(), m = d.getUTCMinutes(), s = d.getUTCSeconds();
    // «1:30» tipeado es h:mm para Excel, pero un trainer escribe m:ss: vuelve «1:30».
    if (h === 0 && s) return `${m}:${String(s).padStart(2, '0')}`;
    return `${h}:${String(m).padStart(2, '0')}`;
  }
  const dia = d.getUTCDate(), mes = d.getUTCMonth() + 1;
  const iD = f.search(/d/), iM = f.search(/m/);
  const sep = /\//.test(f) ? '/' : '-';
  const partes = iM >= 0 && iD >= 0 && iM < iD ? [mes, dia] : [dia, mes];
  const conAnio = /y/.test(f) ? [d.getUTCFullYear() % 100] : [];
  return [...partes, ...conAnio].join(sep);
}

/** 12.5 → «12,5»: la coma decimal, como la ve el trainer en su Excel. */
function numeroComoTexto(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(+n.toFixed(10)).replace('.', ',');
}

function textoEnriquecido(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && Array.isArray((v as { richText?: unknown }).richText)) {
    return ((v as { richText: { text?: unknown }[] }).richText).map((p) => String(p.text ?? '')).join('');
  }
  return v === null || v === undefined ? '' : String(v);
}

const RE_HIPERVINCULO = /^\s*=?\s*HYPERLINK\(\s*"([^"]+)"\s*(?:[,;]\s*"([^"]*)"\s*)?\)\s*$/i;

/** El valor de una celda como texto (y su link o su marca de fecha), o null si está vacía. */
function valorComoCelda(v: unknown, numFmt: string | undefined): Omit<CeldaPlanilla, 'negrita'> | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const texto = fechaComoTexto(v, numFmt);
    return esHora(v, numFmt) ? { texto } : { texto, fecha: true };
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    if (/%/.test(numFmt || '')) return { texto: `${numeroComoTexto(+(v * 100).toFixed(2))}%` };
    return { texto: numeroComoTexto(v) };
  }
  if (typeof v === 'string') return v.trim() ? { texto: v } : null;
  if (typeof v === 'boolean') return v ? { texto: '✓' } : null;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('richText' in o) {
      const texto = textoEnriquecido(o);
      return texto.trim() ? { texto } : null;
    }
    if ('hyperlink' in o) {
      const texto = textoEnriquecido(o.text) || String(o.hyperlink ?? '');
      const link = typeof o.hyperlink === 'string' ? o.hyperlink.trim() : '';
      if (!texto.trim() && !link) return null;
      return link ? { texto, link } : { texto };
    }
    if ('formula' in o || 'sharedFormula' in o) {
      const formula = String(o.formula ?? '');
      const hv = RE_HIPERVINCULO.exec(formula);
      const resultado = valorComoCelda(o.result, numFmt);
      if (hv) {
        const texto = resultado?.texto || hv[2] || hv[1];
        return { texto, link: hv[1].trim() };
      }
      return resultado;
    }
    // { error: '#N/A' } y compañía: nada.
    return null;
  }
  return null;
}

function celdaDe(c: ExcelJS.Cell): CeldaPlanilla | null {
  // Combinadas: la de arriba a la izquierda manda. La parte horizontal queda
  // vacía; la vertical repite el valor hacia abajo en la misma columna.
  let fuente = c;
  if (c.isMerged && c.master && c.master.address !== c.address) {
    if (c.master.col !== c.col) return null;
    fuente = c.master;
  }
  const leida = valorComoCelda(fuente.value, fuente.numFmt);
  if (!leida) return null;
  const negrita = !!fuente.font?.bold;
  return negrita ? { ...leida, negrita } : leida;
}

/**
 * Lee un .xlsx o .xlsm. Devuelve las hojas visibles (hasta 20), con hasta
 * 500 filas (`recortada` si había más) y 40 columnas visibles cada una.
 */
export async function leerXlsx(bytes: Uint8Array): Promise<LibroPlanilla | { error: ErrorPlanilla }> {
  if (bytes.length > TOPES_PLANILLA.bytes) return { error: 'muy_grande' };
  const firma = firmaDeArchivo(bytes);
  if (firma === 'xls_viejo') return { error: 'xls_viejo' };
  if (firma !== 'zip') return { error: 'no_es_planilla' };
  const zip = revisarZip(bytes);
  if ('error' in zip) return zip;
  // Lo que dice el zip ya entra; ahora lo que ocupa de verdad (zip bomba que miente).
  if (!(await entraDescomprimido(bytes, TOPES_PLANILLA.descomprimido))) return { error: 'no_es_planilla' };

  const wb = new ExcelJS.Workbook();
  try {
    // Los tipos de exceljs declaran su propio `Buffer`; en Node es el de siempre.
    const datos = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as unknown as Parameters<typeof wb.xlsx.load>[0];
    await wb.xlsx.load(datos, { ignoreNodes: IGNORAR });
  } catch {
    return { error: 'no_es_planilla' };
  }

  const hojas: HojaPlanilla[] = [];
  for (const ws of wb.worksheets) {
    if (hojas.length >= TOPES_PLANILLA.hojas) break;
    if (!ws || ws.state !== 'visible') continue;

    let recortada = false;
    let ultimaFila = 0;
    let ultimaColumna = 0;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const tieneAlgo = Array.isArray(row.values) && row.values.some((x) => x !== null && x !== undefined && x !== '');
      if (!tieneAlgo) return;
      if (n > TOPES_PLANILLA.filas) { recortada = true; return; }
      ultimaFila = Math.max(ultimaFila, n);
      ultimaColumna = Math.max(ultimaColumna, row.cellCount);
    });

    // Las columnas visibles, hasta 40.
    const columnas: number[] = [];
    for (let k = 1; k <= ultimaColumna && columnas.length < TOPES_PLANILLA.columnas; k++) {
      if (!ws.getColumn(k).hidden) columnas.push(k);
    }

    const filas: (CeldaPlanilla | null)[][] = [];
    for (let n = 1; n <= ultimaFila; n++) {
      const row = ws.getRow(n);
      if (row.hidden) continue;
      filas.push(columnas.map((k) => celdaDe(row.getCell(k))));
    }
    // Sin filas vacías al final.
    while (filas.length && filas[filas.length - 1].every((c) => !c)) filas.pop();

    const hoja: HojaPlanilla = { nombre: ws.name ?? '', filas };
    if (recortada) hoja.recortada = true;
    hojas.push(hoja);
  }
  return { hojas };
}
