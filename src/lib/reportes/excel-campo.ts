import ExcelJS from 'exceljs';
import {
  encabezado, filaEncabezadoTabla, formatoMoneda, textoPeriodo, tablaDeCategorias, quizas, sumaQuizas,
  bordeFino, VERDE, VERDE_SUAVE, TINTA, ROJO, GRIS,
  type FilaLiquidacion,
} from '../reporte';
import { textosExcel, type TextosExcel } from '../reporte-textos';
import { esValido, type Resumen } from '../calculos';
import { fechaLegible, simboloDe } from '../formato';
import { cultivoPorNombre, CULTIVOS } from '../agricultura';
import type { FichaRubro, Jerga } from '../rubros';
import type { Lote } from '../tipos';
import type { Conversor, DatosBaseLibro, HojaDelLibro } from './comun';
import { textosCampo, type TextosCampo } from './textos-campo';

/**
 * EL EXCEL DEL CAMPO: AGRICULTURA Y GANADERÍA (23/09).
 *
 * Para quien vive de campañas la unidad no es el mes: es la campaña (o el
 * lote de novillos). El libro de antes era el de un almacén con dos hojas
 * de campañas metidas en el medio, y decía cosas falsas: «No se registraron
 * ventas» el mes que se liquidó la soja (la venta de una liquidación entra
 * sin items), costo de la mercadería en cero y margen del 100 %, y al
 * ganadero una hoja «Campañas» con columnas de hectáreas y kilos vacías.
 *
 * Lo que trae ahora:
 *
 *   Agricultura: Resumen (la caja del período, sin resultado del mes),
 *   Campañas (+ precio esperado, costo/t, kg/ha para cubrir y lo que falta
 *   cubrir), Cosechas (los tickets del período), Liquidaciones (+ la moneda
 *   y el precio del papel), Movimientos (+ Cuenta, moneda original y
 *   Campaña), Deudas a cosecha y Gastos.
 *
 *   Ganadería: Resumen, Lotes (cantidad y unidad, días, costo y resultado
 *   por unidad), Movimientos con la columna Lote, Deudas de los lotes y
 *   Gastos. Sin cosechas ni liquidaciones: el ganadero no las usa.
 *
 * NINGÚN NÚMERO DE CAMPAÑA SE CALCULA ACÁ: salen de `numeros_de_lote` (los
 * mismos que la tarjeta y el panel). Lo único que se divide acá son dos
 * cuentas de ganadería que la base no trae —costo por unidad y resultado por
 * unidad y día— y están en funciones puras que la pantalla usa igual
 * (`costoPorUnidad`, `porUnidadYDia`), así el Excel y Reportes dicen lo mismo.
 *
 * Función pura: no toca red ni base. La ruta `/api/excel` lee, convierte a la
 * moneda de la vista y llama acá.
 */

// =====================================================================
// LO QUE LEE LA RUTA PARA ESTE LIBRO
// =====================================================================

/** Un ticket de balanza del período, con el nombre de su campaña ya armado. */
export interface FilaCosecha {
  id: string;
  lote_id: string;
  campana: string;
  fecha: string;
  ticket: string;
  destino: string;
  kg_brutos: number | null;
  kg_netos: number;
  humedad: number | null;
}

/** Una deuda activa con saldo, atada a una campaña o lote. Es foto de hoy, no del período. */
export interface FilaDeudaCampo {
  id: string;
  lote_id: string;
  campana: string;
  nombre: string;
  acreedor: string;
  /** Ya traducida por la ruta. Vacía = «Deudas». */
  categoria: string;
  saldo: number;
  vence_el: string | null;
}

/** Lo que la rama del campo lee aparte (lo demás ya lo leyó la ruta para todos). */
export interface LeidoCampo {
  cosechas: FilaCosecha[];
  deudas: FilaDeudaCampo[];
}

/** Todo lo propio del campo que recibe el libro. */
export interface ExtrasCampo extends LeidoCampo {
  /** Las campañas del período (`campanasDelPeriodo`), con los números de la campaña entera. */
  campanas: Lote[];
  /** Las liquidaciones del período, activas y anuladas. */
  liquidaciones: FilaLiquidacion[];
  /** Id de movimiento → nombre de su campaña o lote. */
  campanaDeMovimiento: Record<string, string>;
}

/**
 * Lo leído aparte, en la moneda de la vista. Los kilos no se convierten; el
 * saldo sí. Las campañas y las liquidaciones llegan ya convertidas por la
 * ruta (`enLaMonedaDeLaVista`), por eso no pasan por acá.
 */
export function enLaVistaCampo(extras: LeidoCampo, c: Conversor): LeidoCampo {
  if (!c.convierte) return extras;
  return {
    cosechas: extras.cosechas,
    deudas: extras.deudas.map((d) => ({ ...d, saldo: c.x(d.saldo) })),
  };
}

// =====================================================================
// CUENTAS PURAS QUE COMPARTEN LA PANTALLA Y EL LIBRO
// =====================================================================

/** ¿Habla de campañas con hectáreas (agricultura) o de lotes con cabezas (ganadería)? */
export function esAgricola(jerga: Jerga | null | undefined): boolean {
  return jerga === 'agricultura';
}

/**
 * Las campañas que estuvieron abiertas en algún momento del período: abiertas
 * antes de que termine y no cerradas antes de que empiece. La misma regla
 * que usa la ruta para la hoja, así la pantalla muestra las mismas.
 */
export function campanasDelPeriodo<L extends Pick<Lote, 'abierto_el' | 'cerrado_el'>>(
  lotes: L[], desde: string, hasta: string,
): L[] {
  return lotes.filter((l) => l.abierto_el <= hasta && (!l.cerrado_el || l.cerrado_el >= desde));
}

/**
 * Costo por unidad de un lote (por cabeza, si cuenta cabezas). Null si el
 * costo no se puede ver (no es administración) o si el lote no se cuenta:
 * dividir por cero cabezas no es un dato.
 */
export function costoPorUnidad(l: Pick<Lote, 'costo' | 'cantidad'>): number | null {
  const costo = quizas(l.costo);
  const cantidad = Number(l.cantidad);
  if (costo === null || !(cantidad > 0)) return null;
  return Math.round((costo / cantidad) * 100) / 100;
}

/**
 * Resultado por unidad y por día: cuánto dejó cada cabeza por cada día que
 * estuvo (la pregunta del engorde). Null sin cantidad o con cero días.
 */
export function porUnidadYDia(l: Pick<Lote, 'por_unidad' | 'dias'>): number | null {
  const porUnidad = quizas(l.por_unidad);
  const dias = Number(l.dias);
  if (porUnidad === null || !(dias > 0)) return null;
  return Math.round((porUnidad / dias) * 100) / 100;
}

/**
 * Lo que salió en el período según el resumen: los gastos, más la compra de
 * mercadería cuando va aparte (106; un ganadero que vende hacienda del
 * catálogo con costo cargado). Es lo mismo que suma la hoja Gastos.
 */
export function salioEnElPeriodo(r: Resumen): number {
  return Number(r.gastos) + (r.mercaderiaAparte ? Number(r.comprasMercaderia ?? 0) : 0);
}

/** El cultivo guardado (en español), dicho en el idioma del archivo. Uno escrito a mano queda como está. */
function cultivoEnIdioma(cultivo: string | null | undefined, idioma?: string): string {
  if (!cultivo) return '';
  const porNombre = cultivoPorNombre(cultivo);
  const ficha = porNombre.clave === 'otro'
    ? CULTIVOS.find((c) => c.clave === cultivo.trim().toLowerCase()) ?? porNombre
    : porNombre;
  if (ficha.clave === 'otro' && cultivo.trim().toLowerCase() !== ficha.nombre.es.toLowerCase()) return cultivo;
  return idioma === 'pt' ? ficha.nombre.pt : ficha.nombre.es;
}

// =====================================================================
// LAS HOJAS QUE TRAE, PARA LA TARJETA DE DESCARGA
// =====================================================================

/**
 * Las hojas del libro, en el orden en que salen. Las que dependen del período
 * (cosechas, liquidaciones) o de lo que se debe hoy van `siHay`: la tarjeta
 * las nombra «si hubo». Una prueba arma el libro y compara.
 */
export function hojasCampo(ficha: Pick<FichaRubro, 'jerga'>, idioma?: string): HojaDelLibro[] {
  const tx = textosExcel(idioma);
  const tc = textosCampo(idioma);
  if (esAgricola(ficha.jerga)) {
    return [
      { nombre: tx.hojaResumen },
      { nombre: tx.hojaCampanas },
      { nombre: tc.hojaCosechas, siHay: true },
      { nombre: tx.hojaLiquidaciones, siHay: true },
      { nombre: tx.hojaMovimientos },
      { nombre: tc.hojaDeudasAgro, siHay: true },
      { nombre: tx.hojaGastos },
    ];
  }
  return [
    { nombre: tx.hojaResumen },
    { nombre: tc.hojaLotes },
    { nombre: tx.hojaMovimientos },
    { nombre: tc.hojaDeudasLotes, siHay: true },
    { nombre: tx.hojaGastos },
  ];
}

// =====================================================================
// EL LIBRO
// =====================================================================

const FUENTE = 'Calibri';
const GRIS_TEXTO = 'FF6B7C75';
const TACHADO = 'FF9AA5A0';

export function libroCampo(datos: DatosBaseLibro & ExtrasCampo): ExcelJS.Workbook {
  const tx = textosExcel(datos.idioma);
  const tc = textosCampo(datos.idioma);
  const agro = esAgricola(datos.jerga);
  const fmt = formatoMoneda(datos.empresa.moneda);
  const periodo = textoPeriodo(datos.desde, datos.hasta, datos.empresa, tx);

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Orden';
  libro.created = new Date();

  // Las cosechas y las liquidaciones solo en agricultura (el ganadero no las
  // usa), y solo si hubo: una hoja vacía no informa y hace dudar del resto.
  const cosechas = agro ? datos.cosechas : [];
  const liquidaciones = agro ? datos.liquidaciones : [];

  hojaResumen(libro, datos, tx, tc, agro, fmt, periodo);
  if (agro) hojaCampanasAgro(libro, datos.empresa.nombre, periodo, datos.campanas, fmt, tx, tc, datos.idioma);
  else hojaLotes(libro, datos.empresa.nombre, periodo, datos.campanas, fmt, tx, tc);
  if (cosechas.length > 0) hojaCosechas(libro, datos.empresa.nombre, periodo, cosechas, tx, tc);
  if (liquidaciones.length > 0) hojaLiquidacionesAgro(libro, datos.empresa.nombre, periodo, liquidaciones, fmt, tx, tc);
  hojaMovimientos(libro, datos, tx, tc, agro, fmt, periodo);
  if (datos.deudas.length > 0) hojaDeudas(libro, datos.empresa.nombre, periodo, datos.deudas, fmt, tx, tc, agro);
  hojaGastos(libro, datos, tx, tc, fmt, periodo);

  return libro;
}

/** Pinta una fila de tabla: bordes, cebra, formato por columna y alineación. */
function pintarFila(
  fila: ExcelJS.Row, i: number,
  formato: (c: ExcelJS.Cell, n: number) => void,
  alinear: (n: number) => 'left' | 'center' | 'right',
) {
  fila.height = 18;
  fila.eachCell({ includeEmpty: true }, (c, n) => {
    c.font = { name: FUENTE, size: 10 };
    c.border = bordeFino;
    c.alignment = { vertical: 'middle', horizontal: alinear(n) };
    formato(c, n);
    if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
  });
}

/** La fila de total, en tinta con letra blanca, como en todos los libros de Orden. */
function pintarTotal(fila: ExcelJS.Row, formato: (c: ExcelJS.Cell, n: number) => void, textoHasta = 1) {
  fila.height = 22;
  fila.eachCell({ includeEmpty: true }, (c, n) => {
    c.font = { name: FUENTE, size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
    c.alignment = { vertical: 'middle', horizontal: n <= textoHasta ? 'left' : 'right' };
    formato(c, n);
  });
}

/** Tacha una fila anulada: se ve en el historial pero no suma. */
function tachar(fila: ExcelJS.Row, colEstado: number) {
  fila.eachCell((c) => {
    c.font = { ...(c.font ?? {}), strike: true, color: { argb: TACHADO }, italic: true };
  });
  fila.getCell(colEstado).font = { name: FUENTE, size: 9.5, bold: true, color: { argb: ROJO } };
}

/** Una nota en cursiva debajo de una tabla. */
function notaAlPie(h: ExcelJS.Worksheet, fila: number, columnas: number, texto: string) {
  h.mergeCells(fila, 1, fila, Math.min(columnas, 10));
  const c = h.getCell(fila, 1);
  c.value = texto;
  c.font = { name: FUENTE, size: 9.5, italic: true, color: { argb: GRIS_TEXTO } };
  c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  h.getRow(fila).height = 30;
}

const fecha = (iso: string | null | undefined, tx: TextosExcel) => (iso ? fechaLegible(iso, true, tx.locale) : null);

// ---------------------------------------------------------------------
// RESUMEN: la caja del período, sin «ganancia» del mes
// ---------------------------------------------------------------------

/**
 * Entró, salió y lo de las campañas. Sin ganancia bruta, margen, ticket ni
 * «lo que más dejó» (no hay catálogo, o no significa nada), y sin ganancia
 * del mes: lo gastado en una campaña que se cosecha en marzo no es una
 * pérdida de este mes. El resultado de verdad está en cada campaña.
 *
 * Tampoco la nota «No se registraron ventas»: el mes que se liquidó el grano
 * la decía igual (la liquidación entra sin items), y el mes que de verdad no
 * se vendió nada, para el campo es lo normal y no un problema que señalar.
 */
function hojaResumen(
  libro: ExcelJS.Workbook, d: DatosBaseLibro & ExtrasCampo, tx: TextosExcel, tc: TextosCampo,
  agro: boolean, fmt: string, periodo: string,
) {
  const r = d.resumen;
  const h = libro.addWorksheet(tx.hojaResumen, {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  h.columns = [{ width: 4 }, { width: 40 }, { width: 20 }, { width: 26 }, { width: 4 }];
  encabezado(h, d.empresa.nombre, tc.resumenTitulo, periodo, 5);

  let f = 6;
  const bloque = (titulo: string) => {
    h.mergeCells(`B${f}:D${f}`);
    const c = h.getCell(`B${f}`);
    c.value = titulo.toUpperCase();
    c.font = { name: FUENTE, size: 9, bold: true, color: { argb: GRIS_TEXTO } };
    c.alignment = { vertical: 'middle' };
    h.getRow(f).height = 20;
    f += 1;
  };
  const linea = (
    etiqueta: string, valor: number,
    o?: { formato?: string; fuerte?: boolean; color?: string; nota?: string },
  ) => {
    const fila = h.getRow(f);
    const [a, b, c] = [fila.getCell(2), fila.getCell(3), fila.getCell(4)];
    a.value = etiqueta;
    a.font = { name: FUENTE, size: 11, bold: !!o?.fuerte, color: { argb: TINTA } };
    b.value = valor;
    b.numFmt = o?.formato ?? fmt;
    b.font = { name: FUENTE, size: 11, bold: !!o?.fuerte, color: { argb: o?.color ?? TINTA } };
    b.alignment = { vertical: 'middle', horizontal: 'right' };
    if (o?.nota) {
      c.value = o.nota;
      c.font = { name: FUENTE, size: 9, italic: true, color: { argb: 'FF8A968F' } };
      c.alignment = { vertical: 'middle', horizontal: 'right' };
    }
    a.border = bordeFino; b.border = bordeFino; c.border = bordeFino;
    fila.height = 20;
    f += 1;
  };
  const nota = (texto: string) => {
    h.mergeCells(`B${f}:D${f}`);
    const c = h.getCell(`B${f}`);
    c.value = texto;
    c.font = { name: FUENTE, size: 10, color: { argb: TINTA } };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } };
    h.getRow(f).height = 32;
    f += 1;
  };

  bloque(tc.entroPlata);
  const notaVentas = [tc.operaciones(r.cantidadVentas)];
  if (agro && d.liquidaciones.some((q) => q.estado !== 'anulada')) notaVentas.push(tc.incluyeLiquidaciones);
  linea(tc.cobradoVentas, r.ventas, { nota: notaVentas.join(' · ') });
  linea(tc.otrosIngresos, r.otrosIngresos);
  linea(tc.totalQueEntro, r.ingresosTotales, { fuerte: true, color: VERDE });
  f += 1;

  bloque(tc.salioPlata);
  linea(tc.gastos, r.gastos, { color: ROJO });
  if (r.mercaderiaAparte && Number(r.comprasMercaderia) > 0) {
    linea(tc.compraMercaderia, r.comprasMercaderia, { color: ROJO, nota: tc.aparte });
  }
  linea(tc.totalQueSalio, salioEnElPeriodo(r), { fuerte: true, color: ROJO });
  f += 1;

  bloque(agro ? tc.campanasBloque : tc.lotesBloque);
  linea(agro ? tc.delPeriodoAgro : tc.delPeriodoLotes, d.campanas.length, { formato: '#,##0' });
  linea(agro ? tc.yaCerradasAgro : tc.yaCerradasLotes,
    d.campanas.filter((l) => l.estado === 'cerrado').length, { formato: '#,##0' });
  if (agro) {
    const activas = d.liquidaciones.filter((q) => q.estado !== 'anulada');
    linea(tc.liquidado, sumaQuizas(activas, (q) => q.bruto) ?? 0);
    linea(tc.kgCosechados, sumaQuizas(d.cosechas, (c) => c.kg_netos) ?? 0, { formato: '#,##0' });
  }
  linea(agro ? tc.debesAgro : tc.debesLotes, sumaQuizas(d.deudas, (x) => x.saldo) ?? 0, { color: ROJO });
  f += 2;

  h.mergeCells(`B${f}:D${f}`);
  const dc = h.getCell(`B${f}`);
  dc.value = tc.paraTenerEnCuenta;
  dc.font = { name: FUENTE, size: 9, bold: true, color: { argb: GRIS_TEXTO } };
  f += 1;

  nota(agro ? tc.sinResultadoAgro : tc.sinResultadoLotes);
  const plata = (n: number) => `${simboloDe(d.empresa.moneda)} ${Math.round(n).toLocaleString(tx.locale)}`;
  const mayor = d.movimientos
    .filter((m) => m.tipo === 'gasto' && esValido(m))
    .sort((a, b) => Number(b.monto) - Number(a.monto))[0];
  if (mayor) nota(tc.gastoMasGrande(mayor.descripcion || tx.sinDescripcion, plata(Number(mayor.monto))));
  if (r.movimientosAnulados > 0) nota(tc.seAnularon(r.movimientosAnulados));
}

// ---------------------------------------------------------------------
// CAMPAÑAS (agricultura): las de siempre más cuatro columnas al final
// ---------------------------------------------------------------------

/**
 * Las 19 columnas de la hoja de siempre, en el mismo orden (quien ya tiene
 * fórmulas armadas no pierde nada), y al final Precio esperado/t, Costo/t,
 * kg/ha para cubrir y Falta cubrir: están en la campaña y no salían.
 *
 * Los por hectárea, por tonelada y el rendimiento no se suman (una suma de
 * promedios no es nada). El precio promedio del total sale como lo calcula
 * la base, lo vendido sobre los kilos, y solo si todas son del mismo cultivo:
 * el promedio de soja con maíz no es el precio de nada.
 */
function hojaCampanasAgro(
  libro: ExcelJS.Workbook, empresa: string, periodo: string, campanas: Lote[], fmt: string,
  tx: TextosExcel, tc: TextosCampo, idioma?: string,
) {
  const titulos = [...tx.columnasCampanas, ...tc.columnasCampanasExtra];
  const columnas = titulos.length;
  const h = libro.addWorksheet(tx.hojaCampanas, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 6, xSplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  h.columns = [
    { width: 22 }, { width: 13 }, { width: 16 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 13 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 13 },
    { width: 14 }, { width: 10 }, { width: 13 }, { width: 15 }, { width: 13 },
    { width: 15 }, { width: 13 }, { width: 14 }, { width: 15 },
  ];
  encabezado(h, empresa, tx.campanasTitulo, periodo, columnas);
  filaEncabezadoTabla(h, 6, titulos);

  // 1 Lote … 19 kg sin vender; 20 Precio esperado/t, 21 Costo/t, 22 kg/ha para cubrir, 23 Falta cubrir.
  const PLATA = new Set([8, 9, 10, 11, 12, 13, 14, 18, 20, 21, 23]);
  const KILOS = new Set([15, 16, 17, 19, 22]);
  const formato = (c: ExcelJS.Cell, n: number) => {
    if (PLATA.has(n)) c.numFmt = fmt;
    if (KILOS.has(n)) c.numFmt = '#,##0';
    if (n === 4) c.numFmt = '#,##0.##';
  };

  if (campanas.length === 0) {
    notaAlPie(h, 7, columnas, tx.sinCampanas);
    return;
  }

  campanas.forEach((l, i) => {
    const fila = h.getRow(7 + i);
    fila.values = [
      l.nombre, cultivoEnIdioma(l.cultivo, idioma), l.campana || '', quizas(l.hectareas),
      l.estado === 'cerrado' ? tx.cerrada : tx.abierta, fecha(l.abierto_el, tx), fecha(l.cerrado_el, tx),
      quizas(l.puesto), quizas(l.a_cosecha), quizas(l.costo), quizas(l.costo_ha),
      quizas(l.cobrado), quizas(l.resultado), quizas(l.resultado_ha),
      quizas(l.kg_cosechados), quizas(l.rendimiento), quizas(l.kg_vendidos),
      quizas(l.precio_promedio), quizas(l.kg_sin_vender),
      quizas(l.precio_esperado), quizas(l.costo_ton), quizas(l.kg_ha_para_cubrir), quizas(l.falta_cubrir),
    ];
    pintarFila(fila, i, formato, (n) => (n <= 3 ? 'left' : n >= 5 && n <= 7 ? 'center' : 'right'));
    fila.getCell(1).font = { name: FUENTE, size: 10, bold: true };
    const res = quizas(l.resultado) ?? 0;
    fila.getCell(13).font = { name: FUENTE, size: 10, bold: true, color: { argb: res >= 0 ? VERDE : ROJO } };
  });

  const kgVendidos = sumaQuizas(campanas, (l) => l.kg_vendidos) ?? 0;
  const vendido = sumaQuizas(campanas, (l) => l.vendido) ?? 0;
  const unCultivo = new Set(campanas.map((l) => cultivoPorNombre(l.cultivo).clave === 'otro'
    ? (l.cultivo || '').trim().toLowerCase() : cultivoPorNombre(l.cultivo).clave)).size === 1;
  const fTotal = 7 + campanas.length;
  h.getRow(fTotal).values = [
    'TOTAL', '', '', sumaQuizas(campanas, (l) => l.hectareas), '', '', '',
    sumaQuizas(campanas, (l) => l.puesto), sumaQuizas(campanas, (l) => l.a_cosecha),
    sumaQuizas(campanas, (l) => l.costo), null,
    sumaQuizas(campanas, (l) => l.cobrado), sumaQuizas(campanas, (l) => l.resultado), null,
    sumaQuizas(campanas, (l) => l.kg_cosechados), null, kgVendidos,
    unCultivo && kgVendidos > 0 ? Math.round((vendido / kgVendidos) * 1000 * 100) / 100 : null,
    sumaQuizas(campanas, (l) => l.kg_sin_vender),
    null, null, null, sumaQuizas(campanas, (l) => l.falta_cubrir),
  ];
  pintarTotal(h.getRow(fTotal), formato, 3);

  h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + campanas.length, column: columnas } };
  notaAlPie(h, fTotal + 2, columnas, tx.campanasEnteras);
  notaAlPie(h, fTotal + 3, columnas, tx.campanasSonDeCaja);
}

// ---------------------------------------------------------------------
// LOTES (ganadería): sus propias columnas, sin hectáreas ni kilos vacíos
// ---------------------------------------------------------------------

function hojaLotes(
  libro: ExcelJS.Workbook, empresa: string, periodo: string, lotes: Lote[], fmt: string,
  tx: TextosExcel, tc: TextosCampo,
) {
  const columnas = tc.columnasLotes.length;
  const h = libro.addWorksheet(tc.hojaLotes, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 6, xSplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  h.columns = [
    { width: 24 }, { width: 11 }, { width: 12 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 8 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }, { width: 15 },
  ];
  encabezado(h, empresa, tc.lotesTitulo, periodo, columnas);
  filaEncabezadoTabla(h, 6, tc.columnasLotes);

  // 1 Lote, 2 Cantidad, 3 Unidad, 4 Estado, 5 Desde, 6 Hasta, 7 Días, 8… plata.
  const formato = (c: ExcelJS.Cell, n: number) => {
    if (n >= 8) c.numFmt = fmt;
    if (n === 2) c.numFmt = '#,##0.##';
    if (n === 7) c.numFmt = '#,##0';
  };

  if (lotes.length === 0) {
    notaAlPie(h, 7, columnas, tc.sinLotes);
    return;
  }

  lotes.forEach((l, i) => {
    const fila = h.getRow(7 + i);
    const cantidad = Number(l.cantidad);
    fila.values = [
      l.nombre, cantidad > 0 ? cantidad : null, l.unidad || '',
      l.estado === 'cerrado' ? tx.cerrada : tx.abierta, fecha(l.abierto_el, tx), fecha(l.cerrado_el, tx),
      quizas(l.dias),
      quizas(l.puesto), quizas(l.a_cosecha), quizas(l.costo), costoPorUnidad(l),
      quizas(l.cobrado), quizas(l.resultado), quizas(l.por_unidad), porUnidadYDia(l),
    ];
    pintarFila(fila, i, formato, (n) => (n === 1 || n === 3 ? 'left' : n >= 4 && n <= 6 ? 'center' : 'right'));
    fila.getCell(1).font = { name: FUENTE, size: 10, bold: true };
    const res = quizas(l.resultado) ?? 0;
    fila.getCell(13).font = { name: FUENTE, size: 10, bold: true, color: { argb: res >= 0 ? VERDE : ROJO } };
  });

  // Las cantidades no se suman: 40 cabezas y 300 litros no son 340 de nada.
  const fTotal = 7 + lotes.length;
  h.getRow(fTotal).values = [
    'TOTAL', null, '', '', '', '', null,
    sumaQuizas(lotes, (l) => l.puesto), sumaQuizas(lotes, (l) => l.a_cosecha), sumaQuizas(lotes, (l) => l.costo), null,
    sumaQuizas(lotes, (l) => l.cobrado), sumaQuizas(lotes, (l) => l.resultado), null, null,
  ];
  pintarTotal(h.getRow(fTotal), formato, 3);

  h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + lotes.length, column: columnas } };
  notaAlPie(h, fTotal + 2, columnas, tc.lotesEnteros);
  notaAlPie(h, fTotal + 3, columnas, tc.lotesSonDeCaja);
}

// ---------------------------------------------------------------------
// COSECHAS: los tickets de balanza del período
// ---------------------------------------------------------------------

function hojaCosechas(
  libro: ExcelJS.Workbook, empresa: string, periodo: string, cosechas: FilaCosecha[], tx: TextosExcel, tc: TextosCampo,
) {
  const columnas = tc.columnasCosechas.length;
  const h = libro.addWorksheet(tc.hojaCosechas, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  h.columns = [{ width: 13 }, { width: 28 }, { width: 14 }, { width: 24 }, { width: 13 }, { width: 13 }, { width: 12 }];
  encabezado(h, empresa, tc.cosechasTitulo, periodo, columnas);
  filaEncabezadoTabla(h, 6, tc.columnasCosechas);

  const formato = (c: ExcelJS.Cell, n: number) => {
    if (n === 5 || n === 6) c.numFmt = '#,##0';
    if (n === 7) c.numFmt = '0.0';
  };
  const ordenadas = [...cosechas].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  ordenadas.forEach((c, i) => {
    const fila = h.getRow(7 + i);
    fila.values = [
      fecha(c.fecha, tx), c.campana, c.ticket || '—', c.destino || '—',
      quizas(c.kg_brutos), quizas(c.kg_netos), quizas(c.humedad),
    ];
    pintarFila(fila, i, formato, (n) => (n === 1 ? 'center' : n <= 4 ? 'left' : 'right'));
  });

  const fTotal = 7 + ordenadas.length;
  h.getRow(fTotal).values = [
    tc.totalCosechas, '', '', '',
    sumaQuizas(ordenadas, (c) => c.kg_brutos), sumaQuizas(ordenadas, (c) => c.kg_netos) ?? 0, null,
  ];
  pintarTotal(h.getRow(fTotal), formato, 4);
  h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ordenadas.length, column: columnas } };
}

// ---------------------------------------------------------------------
// LIQUIDACIONES: las de siempre más la moneda y el precio del papel
// ---------------------------------------------------------------------

/**
 * Las 11 columnas de siempre y tres más: la moneda, el precio y el cambio
 * tal como venían en el papel del silo. El precio del papel NO se convierte
 * a la moneda de la vista: ya está en la suya, y la columna lo dice.
 */
function hojaLiquidacionesAgro(
  libro: ExcelJS.Workbook, empresa: string, periodo: string, filas: FilaLiquidacion[], fmt: string,
  tx: TextosExcel, tc: TextosCampo,
) {
  const titulos = [...tx.columnasLiquidaciones, ...tc.columnasLiquidacionesExtra];
  const columnas = titulos.length;
  const h = libro.addWorksheet(tx.hojaLiquidaciones, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  h.columns = [
    { width: 13 }, { width: 26 }, { width: 22 }, { width: 12 }, { width: 13 }, { width: 15 },
    { width: 15 }, { width: 17 }, { width: 15 }, { width: 15 }, { width: 13 },
    { width: 12 }, { width: 15 }, { width: 12 },
  ];
  encabezado(h, empresa, tx.liquidacionesTitulo, periodo, columnas);
  filaEncabezadoTabla(h, 6, titulos);

  const formato = (c: ExcelJS.Cell, n: number) => {
    if (n >= 5 && n <= 10) c.numFmt = fmt;
    if (n === 4) c.numFmt = '#,##0';
    if (n === 13) c.numFmt = '#,##0.00';
    if (n === 14) c.numFmt = '#,##0.######';
  };
  const ordenadas = [...filas].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  ordenadas.forEach((q, i) => {
    const fila = h.getRow(7 + i);
    const anulada = q.estado === 'anulada';
    fila.values = [
      fecha(q.fecha, tx), q.campana, q.comprador || '—',
      quizas(q.kg), quizas(q.precio_tonelada), quizas(q.bruto),
      quizas(q.descuentos), quizas(q.compensado), quizas(q.pagado_con_grano), quizas(q.neto),
      anulada ? tx.anulada : tx.activa,
      q.moneda_original || '', quizas(q.precio_original), quizas(q.cambio),
    ];
    pintarFila(fila, i, formato,
      (n) => (n === 2 || n === 3 ? 'left' : n === 1 || n === 11 || n === 12 ? 'center' : 'right'));
    fila.getCell(10).font = { name: FUENTE, size: 10, bold: true, color: { argb: VERDE } };
    if (anulada) tachar(fila, 11);
  });

  const activas = ordenadas.filter((q) => q.estado !== 'anulada');
  const kg = sumaQuizas(activas, (q) => q.kg) ?? 0;
  const bruto = sumaQuizas(activas, (q) => q.bruto) ?? 0;
  const fTotal = 7 + ordenadas.length;
  h.getRow(fTotal).values = [
    '', tx.totalLiquidaciones, '', kg,
    kg > 0 ? Math.round((bruto / kg) * 1000 * 100) / 100 : null,
    bruto,
    sumaQuizas(activas, (q) => q.descuentos), sumaQuizas(activas, (q) => q.compensado),
    sumaQuizas(activas, (q) => q.pagado_con_grano), sumaQuizas(activas, (q) => q.neto) ?? 0,
    '', '', null, null,
  ];
  pintarTotal(h.getRow(fTotal), formato, 3);
  h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ordenadas.length, column: columnas } };
}

// ---------------------------------------------------------------------
// MOVIMIENTOS: sin costo ni ganancia por fila, con cuenta, moneda y campaña
// ---------------------------------------------------------------------

/**
 * El detalle del período. Se van Subtotal, Descuento, Costo y Ganancia (el
 * costo del campo está en la campaña, no en la venta: en cada fila salía
 * cero y la «ganancia» era el monto entero), y entran Cuenta, la moneda y
 * el monto originales (la compra de insumos en dólares) y de qué campaña o
 * lote es cada uno.
 *
 * El total sale del resumen y no de sumar filas: el detalle es para listar.
 */
function hojaMovimientos(
  libro: ExcelJS.Workbook, d: DatosBaseLibro & ExtrasCampo, tx: TextosExcel, tc: TextosCampo,
  agro: boolean, fmt: string, periodo: string,
) {
  const r = d.resumen;
  const titulos = [...tc.columnasMovimientos, agro ? tc.columnaCampana : tc.columnaLote, tc.columnaEstado];
  const columnas = titulos.length;
  const h = libro.addWorksheet(tx.hojaMovimientos, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  h.columns = [
    { width: 12 }, { width: 10 }, { width: 34 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 15 },
    { width: 11 }, { width: 14 }, { width: 11 }, { width: 26 }, { width: 17 },
  ];
  encabezado(h, d.empresa.nombre, tc.movimientosTitulo, periodo, columnas);
  filaEncabezadoTabla(h, 6, titulos);

  // 7 Monto (en la moneda de la vista), 9 Monto original (en la suya), 10 Cambio.
  const formato = (c: ExcelJS.Cell, n: number) => {
    if (n === 7) c.numFmt = fmt;
    if (n === 9) c.numFmt = '#,##0.00';
    if (n === 10) c.numFmt = '#,##0.######';
  };
  const ordenados = [...d.movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  ordenados.forEach((mv, i) => {
    const fila = h.getRow(7 + i);
    const esGasto = mv.tipo === 'gasto';
    const anulado = !esValido(mv);
    const original = mv.moneda_original ? quizas(mv.monto_original) : null;
    fila.values = [
      fecha(mv.fecha, tx),
      mv.tipo === 'venta' ? tc.venta : esGasto ? tc.gasto : tc.ingreso,
      mv.descripcion || '—',
      mv.categoria,
      mv.metodo_pago,
      mv.cuenta_nombre || '',
      (esGasto ? -1 : 1) * Number(mv.monto),
      mv.moneda_original || '',
      original,
      mv.moneda_original ? quizas(mv.cambio) : null,
      d.campanaDeMovimiento[mv.id] || mv.lote_nombre || '',
      anulado ? `${tc.anulada}${mv.motivo_anulacion ? ` · ${mv.motivo_anulacion}` : ''}` : tc.valida,
    ];
    pintarFila(fila, i, formato,
      (n) => (n === 7 || n === 9 || n === 10 ? 'right' : n === 3 || n === 4 || n === 6 || n >= 11 ? 'left' : 'center'));
    fila.getCell(2).font = { name: FUENTE, size: 9.5, bold: true, color: { argb: esGasto ? ROJO : VERDE } };
    if (anulado) tachar(fila, 12);
  });

  // Todo lo que salió de verdad en el período: los gastos, la mercadería si
  // va aparte y lo pagado a comisión (que no está en `gastos`, pero sí es
  // una fila de acá). Así el total es la suma de las filas válidas.
  const fTotal = 7 + ordenados.length;
  h.getRow(fTotal).values = [
    '', '', tc.totalSinAnuladas, '', '', '',
    r.ingresosTotales - salioEnElPeriodo(r) - Number(r.pagadoAProfesionales ?? 0),
    '', null, null, '', '',
  ];
  pintarTotal(h.getRow(fTotal), formato, 6);
  if (ordenados.length > 0) {
    h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ordenados.length, column: columnas } };
  }
}

// ---------------------------------------------------------------------
// DEUDAS A COSECHA (o de los lotes): foto de hoy
// ---------------------------------------------------------------------

function hojaDeudas(
  libro: ExcelJS.Workbook, empresa: string, periodo: string, deudas: FilaDeudaCampo[], fmt: string,
  tx: TextosExcel, tc: TextosCampo, agro: boolean,
) {
  const titulos = agro ? tc.columnasDeudasAgro : tc.columnasDeudasLotes;
  const columnas = titulos.length;
  const h = libro.addWorksheet(agro ? tc.hojaDeudasAgro : tc.hojaDeudasLotes, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  h.columns = [{ width: 24 }, { width: 26 }, { width: 18 }, { width: 26 }, { width: 16 }, { width: 13 }];
  encabezado(h, empresa, agro ? tc.deudasTituloAgro : tc.deudasTituloLotes, periodo, columnas);
  filaEncabezadoTabla(h, 6, titulos);

  const formato = (c: ExcelJS.Cell, n: number) => { if (n === 5) c.numFmt = fmt; };
  // Por vencimiento, lo que no vence al final: lo primero que se paga, arriba.
  const ordenadas = [...deudas].sort((a, b) => {
    if (a.vence_el === b.vence_el) return a.acreedor.localeCompare(b.acreedor);
    if (!a.vence_el) return 1;
    if (!b.vence_el) return -1;
    return a.vence_el < b.vence_el ? -1 : 1;
  });
  ordenadas.forEach((x, i) => {
    const fila = h.getRow(7 + i);
    fila.values = [
      x.acreedor || '—', x.nombre || '—', x.categoria || tc.sinCategoria, x.campana,
      quizas(x.saldo), fecha(x.vence_el, tx),
    ];
    pintarFila(fila, i, formato, (n) => (n === 5 ? 'right' : n === 6 ? 'center' : 'left'));
    fila.getCell(5).font = { name: FUENTE, size: 10, bold: true, color: { argb: ROJO } };
  });

  const fTotal = 7 + ordenadas.length;
  h.getRow(fTotal).values = [tc.totalDeudas, '', '', '', sumaQuizas(ordenadas, (x) => x.saldo) ?? 0, ''];
  pintarTotal(h.getRow(fTotal), formato, 4);
  notaAlPie(h, fTotal + 2, columnas, tc.deudasEsFoto);
}

// ---------------------------------------------------------------------
// GASTOS POR CATEGORÍA
// ---------------------------------------------------------------------

/**
 * La misma tabla que los otros libros. El total es la suma de las
 * categorías, que es `salioEnElPeriodo` del Resumen: la lista incluye la
 * Mercadería aunque vaya aparte, y el Resumen la muestra en su renglón.
 */
function hojaGastos(
  libro: ExcelJS.Workbook, d: DatosBaseLibro & ExtrasCampo, tx: TextosExcel, tc: TextosCampo,
  fmt: string, periodo: string,
) {
  const h = libro.addWorksheet(tx.hojaGastos, {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
  });
  h.columns = [{ width: 5 }, { width: 32 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 5 }];
  encabezado(h, d.empresa.nombre, tc.gastosTitulo, periodo, 6);
  filaEncabezadoTabla(h, 6, tx.columnasGastos);
  const total = d.categorias.reduce((s, c) => s + Number(c.monto), 0);
  tablaDeCategorias(h, d.categorias, total, fmt, '0.0"%"', tc.sinGastos);
}

