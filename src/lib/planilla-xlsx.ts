/**
 * UN .XLSX COMO `LibroPlanilla` (114). SOLO EN EL SERVIDOR.
 *
 * exceljs pesa ~0,9 MB: no puede ir al celular del trainer (y menos al del
 * alumno). Lo llama únicamente `planillaDelPedido` (planilla-del-pedido.ts),
 * desde las rutas /api/rutinas/importar y /api/productos/planilla (122); hay
 * pruebas que vigilan que ningún componente ni la página del alumno lo
 * importen.
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
 *     avisar: en un Excel en inglés el mismo «8-10» es el 10 de agosto).
 *     Una fecha con el año en el formato («dd/mm/yyyy», la de un registro o
 *     la de inicio) es una fecha de verdad: no se marca (30/09);
 *   · una hora: «1:30» con formato h:mm es para Excel una hora y media, y
 *     para el trainer un minuto y medio de descanso. Vuelve como «1:30»;
 *   · un número con decimales, con coma («12,5», como lo vio el trainer), y
 *     un porcentaje como «75%».
 *
 * Las hojas ocultas (la lista de un desplegable, cálculos) y las columnas y
 * filas ocultas no se leen. Las celdas combinadas: la parte horizontal queda
 * vacía y la vertical repite el valor hacia abajo en la misma columna (así
 * «Peito» combinado en tres filas es el grupo de las tres); con `numeros`
 * (la lista de productos), la que empieza una combinación a lo ancho queda
 * marcada `combinada` (el subtítulo de grupo centrado sobre la tabla). Las
 * imágenes, las validaciones y el formato condicional ni se cargan.
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
  type CeldaPlanilla, type ErrorPlanilla, type HojaPlanilla, type LibroPlanilla, type TopesPlanilla,
} from './planilla';

/**
 * Cómo leer (122). Sin opciones, exactamente lo de la rutina (114): sus
 * topes, sin lo oculto y las celdas como texto.
 *   · `topes`: la lista de productos pasa `TOPES_CATALOGO` (30.000 filas);
 *   · `ocultas`: leer también las filas y columnas ocultas, y marcarlas
 *     (`filasOcultas`, `columnasOcultas`). La hoja oculta sigue sin leerse:
 *     es la lista de un desplegable o una configuración, no la lista;
 *   · `numeros`: cada celda trae su número tal cual (`numero`) y la fórmula
 *     sin resultado queda marcada (`sinCalcular`); el número con formato de
 *     ceros trae el texto con sus ceros (000123), y la combinada a lo ancho,
 *     su marca (`combinada`).
 */
export interface OpcionesXlsx {
  topes?: TopesPlanilla;
  ocultas?: boolean;
  numeros?: boolean;
}

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

/**
 * ¿El formato muestra el año? «dd/mm/yyyy» es una fecha puesta a propósito
 * (la del registro, la de inicio); «8-10» que Excel convirtió queda con
 * d-mmm, sin año (30/09: antes toda fecha se avisaba como repeticiones).
 */
function formatoConAnio(numFmt: string | undefined): boolean {
  return /y/.test(String(numFmt || '').toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, ''));
}

/**
 * El valor de una celda como texto (y su link o su marca de fecha), o null si
 * está vacía. Con `numeros` (122), el número va además tal cual y la fórmula
 * sin resultado vuelve marcada, con el texto vacío.
 */
function valorComoCelda(v: unknown, numFmt: string | undefined, numeros = false): Omit<CeldaPlanilla, 'negrita'> | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const texto = fechaComoTexto(v, numFmt);
    return esHora(v, numFmt) || formatoConAnio(numFmt) ? { texto } : { texto, fecha: true };
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    if (/%/.test(numFmt || '')) return { texto: `${numeroComoTexto(+(v * 100).toFixed(2))}%` };
    if (!numeros) return { texto: numeroComoTexto(v) };
    // Con formato de ceros («000000»), como lo muestra Excel: 123 se ve
    // 000123, y así lo exporta el sistema de caja (122).
    const ceros = /^0+$/.test(String(numFmt || '')) && Number.isInteger(v) && v >= 0;
    return { texto: ceros ? String(v).padStart(String(numFmt).length, '0') : numeroComoTexto(v), numero: v };
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
      const resultado = valorComoCelda(o.result, numFmt, numeros);
      if (hv) {
        const texto = resultado?.texto || hv[2] || hv[1];
        return { texto, link: hv[1].trim() };
      }
      // Sin resultado guardado (122): la lista de productos quiere saberlo,
      // para decir «abrila en Excel y guardala» y no «20 sin precio» a secas.
      // Un resultado de error (#N/A, #DIV/0!) no es «sin calcular»: es vacía.
      if (!resultado && numeros && (o.result === undefined || o.result === null)) return { texto: '', sinCalcular: true };
      // Marcada: una hoja «Resumen» cuyos ejercicios son fórmulas que copian
      // los de la rutina no es la rutina (rutina-planilla.ts).
      return resultado ? { ...resultado, formula: true } : null;
    }
    // { error: '#N/A' } y compañía: nada.
    return null;
  }
  return null;
}

function celdaDe(c: ExcelJS.Cell, numeros: boolean, row: ExcelJS.Row): CeldaPlanilla | null {
  // Combinadas: la de arriba a la izquierda manda. La parte horizontal queda
  // vacía; la vertical repite el valor hacia abajo en la misma columna.
  let fuente = c;
  if (c.isMerged && c.master && c.master.address !== c.address) {
    if (c.master.col !== c.col) return null;
    fuente = c.master;
  }
  const leida: CeldaPlanilla | null = valorComoCelda(fuente.value, fuente.numFmt, numeros);
  if (!leida) return null;
  if (fuente.font?.bold) leida.negrita = true;
  // La de arriba a la izquierda de una combinación A LO ANCHO (la que sigue a
  // la derecha es parte de ella): la fila «Ferretería» combinada de A a F,
  // centrada y con color, es un subtítulo aunque no esté en negrita (122).
  if (numeros && c.isMerged && c.master?.address === c.address) {
    const derecha = row.getCell(Number(c.col) + 1);
    if (derecha.isMerged && derecha.master?.address === c.address) leida.combinada = true;
  }
  return leida;
}

/**
 * Lee un .xlsx o .xlsm. Devuelve las hojas visibles (hasta 20), con hasta
 * 500 filas (`recortada` si había más) y 40 columnas visibles cada una.
 * Con `opciones` (122), los topes y lo oculto de la lista de productos.
 */
export async function leerXlsx(bytes: Uint8Array, opciones: OpcionesXlsx = {}): Promise<LibroPlanilla | { error: ErrorPlanilla }> {
  const topes: TopesPlanilla = opciones.topes ?? TOPES_PLANILLA;
  const ocultas = !!opciones.ocultas;
  const numeros = !!opciones.numeros;
  if (bytes.length > topes.bytes) return { error: 'muy_grande' };
  const firma = firmaDeArchivo(bytes);
  if (firma === 'xls_viejo') return { error: 'xls_viejo' };
  if (firma !== 'zip') return { error: 'no_es_planilla' };
  const zip = revisarZip(bytes, topes.descomprimido);
  if ('error' in zip) return zip;
  // Lo que dice el zip ya entra; ahora lo que ocupa de verdad (zip bomba que miente).
  if (!(await entraDescomprimido(bytes, topes.descomprimido))) return { error: 'no_es_planilla' };

  const wb = new ExcelJS.Workbook();
  try {
    // Los tipos de exceljs declaran su propio `Buffer`; en Node es el de siempre.
    const datos = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as unknown as Parameters<typeof wb.xlsx.load>[0];
    await wb.xlsx.load(datos, { ignoreNodes: IGNORAR });
  } catch {
    return { error: 'no_es_planilla' };
  }

  const hojas: HojaPlanilla[] = [];
  // Las filas que quedan, sumando las hojas (`filasEnTotal`, 122).
  let quedan = topes.filasEnTotal ?? Infinity;
  for (const ws of wb.worksheets) {
    if (hojas.length >= topes.hojas) break;
    if (!ws || ws.state !== 'visible') continue;

    const topeFilas = Math.min(topes.filas, quedan);
    let recortada = false;
    let ultimaFila = 0;
    let ultimaColumna = 0;
    let conAlgo = 0;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      // Con algo que se ve: una fila con fórmulas sin resultado («=E7*F7»
      // copiado hasta la fila 506 de un registro vacío) no cuenta, ni para
      // el tope de filas ni para el aviso de «leímos las primeras 500».
      const tieneAlgo = Array.isArray(row.values) && row.values.some((x) => valorComoCelda(x, undefined) !== null);
      if (!tieneAlgo) return;
      if (n > topeFilas) { recortada = true; return; }
      conAlgo++;
      ultimaFila = Math.max(ultimaFila, n);
      ultimaColumna = Math.max(ultimaColumna, row.cellCount);
    });

    // Las columnas visibles (o todas, con `ocultas`), hasta 40.
    const columnas: number[] = [];
    const columnasOcultas: number[] = [];
    for (let k = 1; k <= ultimaColumna && columnas.length < topes.columnas; k++) {
      const oculta = !!ws.getColumn(k).hidden;
      if (oculta && !ocultas) continue;
      if (oculta) columnasOcultas.push(columnas.length);
      columnas.push(k);
    }

    const filas: (CeldaPlanilla | null)[][] = [];
    const filasOcultas: number[] = [];
    for (let n = 1; n <= ultimaFila; n++) {
      const row = ws.getRow(n);
      if (row.hidden) {
        if (!ocultas) continue;
        filasOcultas.push(filas.length);
      }
      filas.push(columnas.map((k) => celdaDe(row.getCell(k), numeros, row)));
    }
    // Sin filas vacías al final (una fórmula sin calcular sola tampoco cuenta).
    while (filas.length && filas[filas.length - 1].every((c) => !c || (!c.texto && !c.link))) filas.pop();

    const hoja: HojaPlanilla = { nombre: ws.name ?? '', filas };
    if (recortada) hoja.recortada = true;
    if (ocultas) {
      const quedaron = filasOcultas.filter((r) => r < filas.length);
      if (quedaron.length) hoja.filasOcultas = quedaron;
      if (columnasOcultas.length) hoja.columnasOcultas = columnasOcultas;
    }
    hojas.push(hoja);
    quedan = Math.max(0, quedan - conAlgo);
  }
  return { hojas };
}
