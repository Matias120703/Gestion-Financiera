import ExcelJS from 'exceljs';
import { esCategoriaMercaderia, esValido, type FilaCategoria, type FilaProducto, type Resumen } from '../calculos';
import { fechaLegible, simboloDe } from '../formato';
import {
  bordeFino, encabezado, filaEncabezadoTabla, formatoMoneda, tablaDeCategorias, textoPeriodo,
  GRIS, ROJO, TINTA, VERDE, VERDE_SUAVE,
} from '../reporte';
import { textosExcel } from '../reporte-textos';
import { fichaDe, palabra, type FichaRubro } from '../rubros';
import type { FilaLiquidacion, Producto, ReporteTurnos, ResumenReparto } from '../tipos';
import type { Conversor, DatosBaseLibro, HojaDelLibro } from './comun';
import { textosServicios, type TextosServicios } from './textos-servicios';

/**
 * EL REPORTE DE SERVICIOS Y OFICIOS: BARBERÍA, PELUQUERÍA, TALLER (23/09).
 *
 * Hasta acá una barbería bajaba el Excel de un almacén: «Ranking de
 * productos» con sus cortes a «0 unidades» en la lista de no vendidos,
 * «Unidades vendidas», y ni una palabra de lo que el dueño se pregunta el
 * viernes: cuánto le toca a cada uno, cuánto ya le pagué, cuánto me quedó a
 * mí. Este archivo arma ese libro y, además, las cuentas que la pantalla
 * (src/components/reportes/ReporteServicios.tsx) muestra con los MISMOS
 * números: las dos llaman a las funciones de abajo, que son puras y están
 * probadas (pruebas/excel-servicios.test.js).
 *
 * Los números salen de la base, ya corregidos por la 106: el pago al
 * profesional a comisión no resta dos veces (`pagadoAProfesionales` va
 * aparte), quien alquila la silla no aparece con «le debés» por sus propios
 * cortes (`cobro_directo`) y la compra de mercadería va aparte cuando lo
 * vendido tiene costo. Acá solo se ordenan y se separan; nada se recalcula
 * que la base ya haya calculado.
 *
 * Qué NO trae, a propósito:
 *   · Ocupación de la agenda: `agenda_calendario` tiene tope de 92 días y
 *     cuenta «no vino» como ocupado; no es una lectura por período (fase 2).
 *   · Teléfonos de clientes: el archivo termina en el mail del contador.
 *   · Libro IVA o «formato Hechauka»: Orden no guarda timbrado ni tasa.
 */

// =====================================================================
// LO QUE RECIBE EL LIBRO
// =====================================================================

/** Lo justo del catálogo: qué es mercadería (tiene stock) y qué es servicio. */
export type ProductoDelLibro = Pick<Producto, 'id' | 'nombre' | 'controla_stock' | 'stock' | 'stock_minimo' | 'costo' | 'precio'>;

/** Lo que la ruta ya leyó para todos (`x.leido`), YA en la moneda de la vista. */
export interface LeidoServicios {
  ranking: FilaProducto[];
  productos: ProductoDelLibro[];
}

/** Un pago al equipo (`turnos_pago`, 035; `de_comision`, 106). */
export interface PagoAlEquipo {
  fecha: string;
  profesional: string;
  monto: number;
  /** Pago a quien cobra a comisión: ya restó como parte de cada corte. */
  de_comision: boolean;
  notas: string;
  movimiento_id: string | null;
}

/** Lo que lee la rama de servicios de la ruta, en la moneda del negocio (lo convierte `enLaVistaServicios`). */
export interface ExtrasServicios {
  /** `resumen_reparto` del período. */
  reparto: ResumenReparto;
  /** `liquidacion` del período. */
  liquidacion: FilaLiquidacion[];
  /** `liquidacion` desde siempre hasta el último día del período: de acá sale «falta pagar». */
  liquidacionAcumulada: FilaLiquidacion[];
  pagos: PagoAlEquipo[];
  /** `reporte_turnos` del período (106). Solo conteos: no se convierte. */
  turnos: ReporteTurnos;
  /** Id de movimiento → quién lo hizo (el corte) o a quién se le pagó. */
  profesionalDeMovimiento: Record<string, string>;
}

export type DatosLibroServicios = DatosBaseLibro & LeidoServicios & ExtrasServicios;

// =====================================================================
// LAS CUENTAS QUE COMPARTEN LA PANTALLA Y EL EXCEL
// =====================================================================

/**
 * Desde cuándo se cuenta «falta pagar»: desde siempre. Ninguna venta puede
 * tener fecha anterior (055 la rechaza), así que es el principio de todo.
 */
export const DESDE_SIEMPRE = '2000-01-01';

/** ¿Hay equipo que reparte? Con una sola persona cobrando todo, el desglose no dice nada. */
export function usaReparto(liquidacion: FilaLiquidacion[]): boolean {
  return liquidacion.some((l) => l.cortes > 0);
}

/**
 * DE DÓNDE SALIÓ LO QUE QUEDÓ PARA EL LOCAL: tus servicios, los del equipo y
 * lo demás que se cobró (productos, trabajos sin profesional), precio menos
 * costo. Los tres suman la ganancia bruta del resumen (035 lo garantiza).
 *
 * Si por lo que sea no suman lo mismo, no se muestra el desglose: dos
 * números que no cierran obligan a elegir a cuál creerle, y es peor que no
 * tener el detalle. Sin equipo tampoco: «de tu equipo 0» no informa.
 */
export interface CuentaDelLocal {
  misCortes: number;
  deMiEquipo: number;
  productos: number;
  /** = `resumen.gananciaBruta`. */
  quedo: number;
}

export function cuentaDelLocal(
  r: Resumen,
  rep: Pick<ResumenReparto, 'mis_cortes' | 'de_mi_equipo' | 'mercaderia' | 'ganancia_bruta'> | null,
  liquidacion: FilaLiquidacion[],
): CuentaDelLocal | null {
  if (!rep || !r.conCostos || !usaReparto(liquidacion)) return null;
  const suma = Number(rep.mis_cortes) + Number(rep.de_mi_equipo) + Number(rep.mercaderia);
  if (!cerca(suma, r.gananciaBruta) || !cerca(Number(rep.ganancia_bruta), r.gananciaBruta)) return null;
  return {
    misCortes: Number(rep.mis_cortes),
    deMiEquipo: Number(rep.de_mi_equipo),
    productos: Number(rep.mercaderia),
    quedo: r.gananciaBruta,
  };
}

/** Iguales salvo el centavo del redondeo (y el ruido de convertir de moneda). */
function cerca(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.011 + Math.abs(b) * 1e-9;
}

/**
 * SERVICIOS POR UN LADO, MERCADERÍA POR OTRO.
 *
 * Los dos viven en la misma tabla (`productos`): lo que controla stock es
 * mercadería (la cera, el shampoo); lo demás, servicio. En un servicio el
 * «costo» es la parte del profesional (034), así que sus columnas se llaman
 * «parte del equipo» y «para el local». El aviso de costo sin cargar es solo
 * de la mercadería: un corte propio sin costo no está inflado, es así.
 */
export function separarRanking(ranking: FilaProducto[], productos: ProductoDelLibro[]): {
  servicios: FilaProducto[];
  mercaderia: FilaProducto[];
  /** Productos con stock que se vendieron con costo 0: su margen sale inflado. */
  sinCosto: number;
} {
  const conStock = new Set(productos.filter((p) => p.controla_stock).map((p) => p.id));
  const esMercaderia = (p: FilaProducto) => !!p.producto_id && conStock.has(p.producto_id);
  const mercaderia = ranking.filter(esMercaderia);
  return {
    servicios: ranking.filter((p) => !esMercaderia(p)),
    mercaderia,
    sinCosto: mercaderia.filter((p) => p.costo === 0 && p.ingresos > 0).length,
  };
}

/** Lo que está en el mínimo o por debajo: la misma regla que el panel. */
export function aReponer(productos: ProductoDelLibro[]): ProductoDelLibro[] {
  return productos.filter((p) => p.controla_stock && Number(p.stock) <= Number(p.stock_minimo));
}

/**
 * LOS GASTOS POR CATEGORÍA, COMO LOS CUENTA LA GANANCIA.
 *
 * `gastos_por_categoria` ya deja afuera los pagos a comisión (106), pero
 * trae «Mercadería» aunque ese período vaya aparte. Si va aparte, se saca
 * de la lista (así la lista suma lo mismo que «Gastos») y se devuelve sola.
 */
export function gastosVisibles(categorias: FilaCategoria[], r: Resumen): {
  filas: FilaCategoria[];
  /** Compraste mercadería, aparte; null si este período resta como gasto. */
  comprasAparte: number | null;
} {
  if (!r.mercaderiaAparte) return { filas: categorias, comprasAparte: null };
  const filas = categorias.filter((c) => !esCategoriaMercaderia(c.nombre));
  const total = filas.reduce((s, c) => s + c.monto, 0);
  return {
    filas: filas.map((c) => ({ ...c, participacion: total > 0 ? (c.monto / total) * 100 : 0 })),
    comprasAparte: r.comprasMercaderia > 0 ? r.comprasMercaderia : null,
  };
}

/** Una persona del equipo: el período, lo que falta pagarle a la fecha y sus turnos. */
export interface FilaEquipo {
  id: string;
  nombre: string;
  reparto: FilaLiquidacion['reparto'];
  porcentaje: number | null;
  activo: boolean;
  cortes: number;
  cobrado: number;
  del_local: number;
  /**
   * TODA la parte del profesional en el período, también lo que cobró
   * directo quien alquila la silla: esos cortes son suyos. Lo que separa al
   * que alquila es `falta` (no se le debe), no «le toca». Así
   * cobrado = del_local + le_toca, para cualquier arreglo.
   */
  le_toca: number;
  pagado: number;
  /** Quien alquila la silla: lo que cobró él mismo (ya está dentro de le_toca). No se le debe. */
  cobro_directo: number;
  /**
   * Lo que falta pagarle contando todo lo anterior hasta el último día del
   * período. El «le debe» del período solo no sirve: el pago del lunes por
   * la semana pasada lo deja en negativo una semana y en positivo la otra.
   */
  falta: number | null;
  /** Sus turnos del período; null si no tuvo ninguno (no es lo mismo que 0 atendidos). */
  turnos: { atendidas: number; no_vino: number; canceladas: number; pendientes: number; total: number } | null;
}

export function filasDelEquipo(
  liquidacion: FilaLiquidacion[],
  acumulada: FilaLiquidacion[],
  turnos: Pick<ReporteTurnos, 'por_profesional'>,
): FilaEquipo[] {
  const falta = new Map(acumulada.map((l) => [l.id, Number(l.le_debe)]));
  const deTurnos = new Map(turnos.por_profesional.map((p) => [p.id, p]));
  const fila = (l: FilaLiquidacion, delPeriodo: boolean): FilaEquipo => {
    const t = deTurnos.get(l.id);
    const directo = Number(l.cobro_directo ?? 0);
    // «Le toca» se arma con le_debe + pagado + cobro_directo y no con el
    // `le_toca` de la base, porque la 106 está en discusión sobre qué quiere
    // decir: hoy lo deja sin lo cobrado directo, y el arreglo propuesto
    // (hallazgo del 24/09 sobre /reparto) lo vuelve a la parte entera y saca
    // el alquiler solo de le_debe. En las dos versiones le_debe + pagado es
    // lo que pasó por la caja del local, así que esta suma da lo mismo con
    // cualquiera y la pantalla no cambia de número si la base cambia.
    const leToca = Number(l.le_debe) + Number(l.pagado) + directo;
    return {
      id: l.id, nombre: l.nombre, reparto: l.reparto, porcentaje: l.porcentaje, activo: l.activo,
      cortes: delPeriodo ? Number(l.cortes) : 0,
      cobrado: delPeriodo ? Number(l.cobrado) : 0,
      del_local: delPeriodo ? Number(l.del_local) : 0,
      le_toca: delPeriodo ? leToca : 0,
      pagado: delPeriodo ? Number(l.pagado) : 0,
      cobro_directo: delPeriodo ? directo : 0,
      falta: falta.has(l.id) ? falta.get(l.id)! : null,
      turnos: t ? {
        atendidas: t.atendidas, no_vino: t.no_vino, canceladas: t.canceladas, pendientes: t.pendientes, total: t.total,
      } : null,
    };
  };
  const enElPeriodo = new Set(liquidacion.map((l) => l.id));
  // Alguien que ya no trabaja acá y a quien todavía se le debe: aparece,
  // aunque este período no haya hecho nada. Es plata que sigue en la caja.
  const deAntes = acumulada.filter((l) => !enElPeriodo.has(l.id) && Math.abs(Number(l.le_debe)) > 0.005);
  return [...liquidacion.map((l) => fila(l, true)), ...deAntes.map((l) => fila(l, false))];
}

/** Lo que se le debe al equipo, sumando solo a quien se le debe (un adelanto no descuenta la deuda de otro). */
export function faltaPagarAlEquipo(filas: FilaEquipo[]): number {
  return filas.reduce((s, f) => s + Math.max(0, f.falta ?? 0), 0);
}

/**
 * Los movimientos que están en la caja pero NO en la ganancia: el pago al
 * profesional a comisión (ya restó en cada corte) y la compra de
 * mercadería cuando va aparte. En la hoja Movimientos llevan su nota y la
 * columna «Para el local» vacía, así la columna suma la ganancia neta.
 */
export function fueraDeLaGanancia(
  movimientos: DatosBaseLibro['movimientos'],
  pagos: PagoAlEquipo[],
  r: Resumen,
): Map<string, 'comision' | 'mercaderia'> {
  const res = new Map<string, 'comision' | 'mercaderia'>();
  for (const p of pagos) if (p.de_comision && p.movimiento_id) res.set(p.movimiento_id, 'comision');
  if (r.mercaderiaAparte) {
    for (const m of movimientos) {
      if (m.tipo === 'gasto' && !res.has(m.id) && esCategoriaMercaderia(m.categoria)) res.set(m.id, 'mercaderia');
    }
  }
  return res;
}

// =====================================================================
// LAS HOJAS QUE TRAE, PARA LA TARJETA DE DESCARGA
// =====================================================================

/** La hoja de servicios lleva la palabra de la ficha: «Servicios y productos». */
function nombreHojaServicios(ficha: FichaRubro, idioma: string | undefined, ts: TextosServicios): string {
  const deLaFicha = idioma === 'pt' ? ficha.pt.palabras.productos : ficha.palabras.productos;
  // Excel no acepta estos caracteres en el nombre de una hoja, ni más de 31.
  return (deLaFicha ?? ts.hojaServicios).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
}

export function hojasServicios(ficha: FichaRubro, idioma?: string): HojaDelLibro[] {
  const tx = textosExcel(idioma);
  const ts = textosServicios(idioma);
  return [
    { nombre: tx.hojaResumen },
    // Un taller o un plomero sin equipo no tiene a quién liquidar, y sin
    // agenda no hay turnos: esas dos hojas salen si hubo con qué llenarlas.
    { nombre: ts.hojaPorProfesional, siHay: true },
    { nombre: ts.hojaTurnos, siHay: true },
    { nombre: nombreHojaServicios(ficha, idioma, ts) },
    { nombre: tx.hojaMovimientos },
    { nombre: tx.hojaGastos },
    { nombre: tx.hojaDiaPorDia },
    { nombre: ts.hojaContador },
  ];
}

// =====================================================================
// A LA MONEDA DE LA VISTA (051)
// =====================================================================

export function enLaVistaServicios(e: ExtrasServicios, c: Conversor): ExtrasServicios {
  if (!c.convierte) return e;
  const liq = (l: FilaLiquidacion): FilaLiquidacion => ({
    ...l,
    cobrado: c.x(l.cobrado), le_toca: c.x(l.le_toca), del_local: c.x(l.del_local),
    pagado: c.x(l.pagado), le_debe: c.x(l.le_debe), cobro_directo: c.x(l.cobro_directo ?? 0),
  });
  return {
    ...e,
    reparto: {
      ...e.reparto,
      mis_cortes: c.x(e.reparto.mis_cortes), de_mi_equipo: c.x(e.reparto.de_mi_equipo),
      mercaderia: c.x(e.reparto.mercaderia), otros_ingresos: c.x(e.reparto.otros_ingresos),
      ganancia_bruta: c.x(e.reparto.ganancia_bruta), total: c.x(e.reparto.total),
      cortes: e.reparto.cortes.map((k) => ({
        ...k, monto: c.x(k.monto), parte_profesional: c.x(k.parte_profesional), parte_local: c.x(k.parte_local),
      })),
    },
    liquidacion: e.liquidacion.map(liq),
    liquidacionAcumulada: e.liquidacionAcumulada.map(liq),
    pagos: e.pagos.map((p) => ({ ...p, monto: c.x(p.monto) })),
  };
}

// =====================================================================
// EL LIBRO
// =====================================================================

const FMT_PORC = '0.0"%"';
const FMT_ENTERO = '#,##0';
const FMT_NUM = '#,##0.##';
const GRIS_TEXTO = 'FF8A968F';
const GRIS_TITULO = 'FF6B7C75';

type Celda = string | number | null;

export function libroServicios(datos: DatosLibroServicios): ExcelJS.Workbook {
  const {
    empresa, desde, hasta, idioma, resumen: r, resumenPrevio: rp, previo, categorias, serie, movimientos,
    ranking, productos, reparto, liquidacion, liquidacionAcumulada, pagos, turnos, profesionalDeMovimiento,
  } = datos;
  const tx = textosExcel(idioma);
  const ts = textosServicios(idioma);
  const tipo = empresa.tipo_cuenta ?? 'emprendedor';
  const ficha = fichaDe(empresa.rubro, tipo);
  const cobrado = palabra(empresa.rubro, tipo, 'ventas', idioma === 'pt' ? 'Recebido' : 'Cobrado', idioma ?? 'es');
  const fmt = formatoMoneda(empresa.moneda);
  const periodo = textoPeriodo(desde, hasta, empresa, tx);
  const fecha = (iso: string) => fechaLegible(iso, true, tx.locale);

  const equipo = filasDelEquipo(liquidacion, liquidacionAcumulada, turnos);
  const cuenta = cuentaDelLocal(r, reparto, liquidacion);
  const { servicios, mercaderia, sinCosto } = separarRanking(ranking, productos);
  const reponer = aReponer(productos);
  const gastos = gastosVisibles(categorias, r);
  const fuera = fueraDeLaGanancia(movimientos, pagos, r);
  const faltaTotal = faltaPagarAlEquipo(equipo);
  const hayEquipo = equipo.length > 0;
  const hayTurnos = turnos.total > 0;

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Orden';
  libro.created = new Date();

  const hoja = (nombre: string, apaisada: boolean, congelar: boolean) => libro.addWorksheet(nombre, {
    views: [congelar ? { showGridLines: false, state: 'frozen', ySplit: 6 } : { showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: apaisada ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
    },
  });

  /** Una fila de tabla: bordes, cebra, formato por columna (1 = primera). */
  const filaDeTabla = (
    h: ExcelJS.Worksheet, n: number, valores: Celda[], i: number,
    formatos: Record<number, string>, izquierda: number[] = [1, 2],
  ) => {
    const fila = h.getRow(n);
    fila.values = valores;
    fila.height = 18;
    for (let col = 1; col <= valores.length; col++) {
      const c = fila.getCell(col);
      c.font = { name: 'Calibri', size: 10 };
      c.border = bordeFino;
      c.alignment = { vertical: 'middle', horizontal: izquierda.includes(col) ? 'left' : 'right' };
      if (formatos[col]) c.numFmt = formatos[col];
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
    }
    return fila;
  };

  const filaTotal = (h: ExcelJS.Worksheet, n: number, valores: Celda[], formatos: Record<number, string>) => {
    const fila = h.getRow(n);
    fila.values = valores;
    fila.height = 22;
    for (let col = 1; col <= valores.length; col++) {
      const c = fila.getCell(col);
      c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: col <= 2 ? 'left' : 'right' };
      if (formatos[col]) c.numFmt = formatos[col];
    }
  };

  /** Un subtítulo gris dentro de una hoja. */
  const subtitulo = (h: ExcelJS.Worksheet, n: number, texto: string, hastaCol: number) => {
    h.mergeCells(n, 1, n, hastaCol);
    const c = h.getCell(n, 1);
    c.value = texto;
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS_TITULO } };
    c.alignment = { vertical: 'middle' };
    h.getRow(n).height = 20;
  };

  /** Una nota en verde claro, a lo ancho. */
  const nota = (h: ExcelJS.Worksheet, n: number, texto: string, desdeCol: number, hastaCol: number) => {
    h.mergeCells(n, desdeCol, n, hastaCol);
    const c = h.getCell(n, desdeCol);
    c.value = texto;
    c.font = { name: 'Calibri', size: 10, color: { argb: TINTA } };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } };
    // Sin alto automático para celdas unidas: se estima por el largo.
    h.getRow(n).height = Math.max(20, Math.ceil(texto.length / 90) * 15);
  };

  const vacio = (h: ExcelJS.Worksheet, n: number, texto: string, hastaCol: number) => {
    h.mergeCells(n, 1, n, hastaCol);
    const c = h.getCell(n, 1);
    c.value = texto;
    c.font = { name: 'Calibri', size: 10, italic: true, color: { argb: GRIS_TEXTO } };
    h.getRow(n).height = 20;
  };

  // ==========================================================
  // RESUMEN: la cuenta que se hace el dueño, este período y el anterior
  // ==========================================================
  {
    const h = hoja(tx.hojaResumen, false, false);
    h.columns = [{ width: 4 }, { width: 40 }, { width: 18 }, { width: 18 }, { width: 34 }, { width: 4 }];
    encabezado(h, empresa.nombre, ts.resumenTitulo, periodo, 6);

    let f = 6;
    const cab = h.getRow(f);
    cab.getCell(3).value = ts.colEstePeriodo;
    cab.getCell(4).value = ts.colAntes(previo.desde === previo.hasta
      ? fecha(previo.desde)
      : `${fecha(previo.desde)} – ${fecha(previo.hasta)}`);
    [3, 4].forEach((col) => {
      const c = cab.getCell(col);
      c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS_TITULO } };
      c.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
    });
    cab.height = 28;
    f += 1;

    const bloque = (titulo: string) => {
      f += 1;
      h.mergeCells(`B${f}:E${f}`);
      const c = h.getCell(`B${f}`);
      c.value = titulo.toUpperCase();
      c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS_TITULO } };
      h.getRow(f).height = 20;
      f += 1;
    };

    const linea = (
      etiqueta: string, actual: number, antes: number | null,
      o?: { formato?: string; fuerte?: boolean; color?: string; nota?: string; sangria?: boolean },
    ) => {
      const fila = h.getRow(f);
      const celdas = [2, 3, 4, 5].map((col) => fila.getCell(col));
      celdas[0].value = etiqueta;
      celdas[0].alignment = { vertical: 'middle', indent: o?.sangria ? 2 : 0 };
      celdas[1].value = actual;
      celdas[2].value = antes;
      celdas[3].value = o?.nota ?? null;
      celdas.forEach((c, i) => {
        c.border = bordeFino;
        if (i === 0) c.font = { name: 'Calibri', size: 11, bold: !!o?.fuerte, color: { argb: TINTA } };
        if (i === 1 || i === 2) {
          c.numFmt = o?.formato ?? fmt;
          c.alignment = { vertical: 'middle', horizontal: 'right' };
          c.font = {
            name: 'Calibri', size: 11, bold: !!o?.fuerte && i === 1,
            color: { argb: i === 2 ? GRIS_TITULO : o?.color ?? TINTA },
          };
        }
        if (i === 3) {
          c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: GRIS_TEXTO } };
          c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }
      });
      fila.height = 20;
      f += 1;
    };

    bloque(ts.entroPlata);
    linea(cobrado, r.ventas, rp.ventas, { fuerte: true, nota: ts.cobros(r.cantidadVentas) });
    if (r.descuentos > 0 || rp.descuentos > 0) linea(ts.descuentos, -r.descuentos, -rp.descuentos, { color: ROJO });
    linea(ts.otrosIngresos, r.otrosIngresos, rp.otrosIngresos, { nota: ts.otrosIngresosNota });
    linea(ts.totalEntro, r.ingresosTotales, rp.ingresosTotales, { fuerte: true, color: VERDE });

    bloque(ts.loQueQuedo);
    linea(ts.parteDelEquipo, -r.costoMercaderia, -rp.costoMercaderia, { color: ROJO });
    linea(ts.quedoParaElLocal, r.gananciaBruta, rp.gananciaBruta, { fuerte: true });
    if (cuenta) {
      linea(ts.tusServicios, cuenta.misCortes, null, { sangria: true, nota: ts.deDondeSalio });
      linea(ts.deTuEquipo, cuenta.deMiEquipo, null, { sangria: true });
      linea(ts.productosYOtros, cuenta.productos, null, { sangria: true, nota: ts.productosYOtrosNota });
    }

    bloque(ts.gastosBloque);
    linea(ts.gastosDelLocal, -r.gastos, -rp.gastos, { color: ROJO });
    if (gastos.comprasAparte !== null) {
      linea(ts.comprasteMercaderia, r.comprasMercaderia, rp.mercaderiaAparte ? rp.comprasMercaderia : null,
        { nota: ts.comprasteMercaderiaNota });
    }
    if (r.pagadoAProfesionales > 0) {
      linea(ts.pagadoAlEquipo, r.pagadoAProfesionales, rp.pagadoAProfesionales, { nota: ts.pagadoAlEquipoNota });
    }

    bloque(ts.resultado);
    linea(ts.gananciaNeta, r.gananciaNeta, rp.gananciaNeta, {
      fuerte: true, color: r.gananciaNeta >= 0 ? VERDE : ROJO,
    });

    if (hayTurnos) {
      bloque(ts.turnosBloque);
      linea(ts.turnosTotal, turnos.total, null, { formato: FMT_ENTERO });
      linea(ts.estados.atendida, turnos.por_estado.atendida, null, { formato: FMT_ENTERO, sangria: true });
      linea(ts.estados.no_vino, turnos.por_estado.no_vino, null, { formato: FMT_ENTERO, sangria: true });
      linea(ts.estados.cancelada, turnos.por_estado.cancelada, null, { formato: FMT_ENTERO, sangria: true });
      linea(ts.porElLink, turnos.por_origen.publico, null, { formato: FMT_ENTERO });
    }

    if (hayEquipo) {
      bloque(ts.equipoBloque);
      linea(ts.faltaPagar(fecha(hasta)), faltaTotal, null, {
        fuerte: true, color: faltaTotal > 0 ? ROJO : TINTA, nota: ts.faltaPagarNota,
      });
    }

    // Lo que conviene mirar. Solo lo que dice algo.
    const notas: string[] = [];
    const plata = (n: number) => `${simboloDe(empresa.moneda)} ${Math.round(n).toLocaleString(tx.locale)}`;
    if (r.gananciaNeta < 0) notas.push(tx.gastasteMasQueGanaste);
    if (r.movimientosAnulados > 0) notas.push(tx.seAnularon(r.movimientosAnulados, r.ventasAnuladas));
    if (sinCosto > 0) notas.push(ts.sinCostoAviso(sinCosto));
    if (r.cantidadVentas === 0) notas.push(ts.sinCobros);
    if (r.descuentos > 0) {
      const pct = r.ventasBrutas > 0 ? (r.descuentos / r.ventasBrutas) * 100 : 0;
      notas.push(tx.disteDescuentos(plata(r.descuentos), pct.toFixed(1)));
    }
    if (notas.length > 0) {
      f += 1;
      h.mergeCells(`B${f}:E${f}`);
      const t = h.getCell(`B${f}`);
      t.value = tx.paraTenerEnCuenta;
      t.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS_TITULO } };
      f += 1;
      for (const texto of notas) { nota(h, f, texto, 2, 5); f += 1; }
    }
  }

  // ==========================================================
  // POR PROFESIONAL: lo que se firma el viernes
  // ==========================================================
  if (hayEquipo) {
    const h = hoja(ts.hojaPorProfesional, true, true);
    const cols = ts.columnasEquipo.length;
    h.columns = [
      { width: 24 }, { width: 18 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
      { width: 15 }, { width: 18 }, { width: 12 }, { width: 10 }, { width: 11 },
    ];
    encabezado(h, empresa.nombre, ts.equipoTitulo, periodo, cols);
    filaEncabezadoTabla(h, 6, ts.columnasEquipo);

    const comoCobra = (e: FilaEquipo) => {
      const base = e.reparto === 'comision'
        ? ts.repartoComision(e.porcentaje === null ? '—' : String(Number(e.porcentaje)))
        : e.reparto === 'alquiler' ? ts.repartoAlquiler
          : e.reparto === 'sueldo' ? ts.repartoSueldo : ts.repartoLocal;
      return e.activo ? base : `${base} · ${ts.inactivo}`;
    };

    equipo.forEach((e, i) => {
      const fila = filaDeTabla(h, 7 + i, [
        e.nombre, comoCobra(e), e.cortes, e.cobrado, e.del_local, e.le_toca, e.pagado,
        e.reparto === 'alquiler' || e.cobro_directo > 0 ? e.cobro_directo : null,
        e.falta,
        e.turnos?.atendidas ?? null, e.turnos?.no_vino ?? null, e.turnos?.canceladas ?? null,
      ], i, { 3: FMT_ENTERO, 4: fmt, 5: fmt, 6: fmt, 7: fmt, 8: fmt, 9: fmt, 10: FMT_ENTERO, 11: FMT_ENTERO, 12: FMT_ENTERO });
      fila.getCell(1).font = { name: 'Calibri', size: 10, bold: true };
      fila.getCell(9).font = {
        name: 'Calibri', size: 10, bold: true,
        color: { argb: (e.falta ?? 0) > 0 ? ROJO : VERDE },
      };
    });
    const fTotal = 7 + equipo.length;
    filaTotal(h, fTotal, [
      'TOTAL', '',
      equipo.reduce((s, e) => s + e.cortes, 0),
      equipo.reduce((s, e) => s + e.cobrado, 0),
      equipo.reduce((s, e) => s + e.del_local, 0),
      equipo.reduce((s, e) => s + e.le_toca, 0),
      equipo.reduce((s, e) => s + e.pagado, 0),
      equipo.reduce((s, e) => s + e.cobro_directo, 0),
      faltaTotal,
      '', '', '',
    ], { 3: FMT_ENTERO, 4: fmt, 5: fmt, 6: fmt, 7: fmt, 8: fmt, 9: fmt });

    let f = fTotal + 2;
    nota(h, f, ts.notaEquipo, 1, cols);
    f += 2;

    if (pagos.length > 0) {
      subtitulo(h, f, ts.pagosTitulo, 5);
      f += 1;
      filaEncabezadoTabla(h, f, ts.columnasPagos);
      f += 1;
      [...pagos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)).forEach((p, i) => {
        filaDeTabla(h, f, [
          fecha(p.fecha), p.profesional, p.monto, p.de_comision ? ts.pagoComision : ts.pagoOtro, p.notas || null,
        ], i, { 3: fmt }, [1, 2, 4, 5]);
        f += 1;
      });
      f += 1;
    }

    // Cada corte, para cerrar el «ese era mío». Del más viejo al más nuevo.
    if (reparto.cortes.length > 0) {
      subtitulo(h, f, ts.cortesTitulo, 7);
      f += 1;
      filaEncabezadoTabla(h, f, ts.columnasCortes);
      f += 1;
      [...reparto.cortes].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)).forEach((k, i) => {
        const fila = filaDeTabla(h, f, [
          fecha(k.fecha), k.profesional, k.servicio || '—', k.monto, k.parte_profesional, k.parte_local,
          k.anulado ? tx.anulada : tx.valida,
        ], i, { 4: fmt, 5: fmt, 6: fmt }, [1, 2, 3, 7]);
        if (k.anulado) {
          fila.eachCell((c) => { c.font = { ...(c.font ?? {}), strike: true, italic: true, color: { argb: 'FF9AA5A0' } }; });
        }
        f += 1;
      });
    }
  }

  // ==========================================================
  // TURNOS
  // ==========================================================
  if (hayTurnos) {
    const h = hoja(ts.hojaTurnos, false, false);
    h.columns = [{ width: 30 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }];
    encabezado(h, empresa.nombre, ts.turnosTitulo, periodo, 6);
    let f = 6;

    subtitulo(h, f, ts.porEstado, 3); f += 1;
    filaEncabezadoTabla(h, f, ts.columnasEstado); f += 1;
    const estados = (['atendida', 'no_vino', 'cancelada', 'confirmada', 'pendiente'] as const)
      .filter((e) => turnos.por_estado[e] > 0);
    estados.forEach((e, i) => {
      const n = turnos.por_estado[e];
      filaDeTabla(h, f, [ts.estados[e], n, (n / turnos.total) * 100], i, { 2: FMT_ENTERO, 3: FMT_PORC }, [1]);
      f += 1;
    });
    filaTotal(h, f, ['TOTAL', turnos.total, 100], { 2: FMT_ENTERO, 3: FMT_PORC }); f += 2;

    subtitulo(h, f, ts.porOrigen, 3); f += 1;
    filaEncabezadoTabla(h, f, ts.columnasEstado.map((c, i) => (i === 0 ? '' : c))); f += 1;
    [[ts.origenLocal, turnos.por_origen.local], [ts.origenPublico, turnos.por_origen.publico]]
      .forEach(([etiqueta, n], i) => {
        filaDeTabla(h, f, [etiqueta as string, n as number, ((n as number) / turnos.total) * 100], i,
          { 2: FMT_ENTERO, 3: FMT_PORC }, [1]);
        f += 1;
      });
    f += 1;

    if (turnos.por_profesional.length > 0) {
      subtitulo(h, f, ts.porProfesional, 6); f += 1;
      filaEncabezadoTabla(h, f, ts.columnasTurnosProfesional); f += 1;
      turnos.por_profesional.forEach((p, i) => {
        filaDeTabla(h, f, [p.nombre, p.total, p.atendidas, p.no_vino, p.canceladas, p.pendientes], i,
          { 2: FMT_ENTERO, 3: FMT_ENTERO, 4: FMT_ENTERO, 5: FMT_ENTERO, 6: FMT_ENTERO }, [1]);
        f += 1;
      });
      f += 1;
    }

    if (turnos.por_servicio.length > 0) {
      subtitulo(h, f, ts.porServicio, 3); f += 1;
      filaEncabezadoTabla(h, f, ts.columnasTurnosServicio); f += 1;
      turnos.por_servicio.forEach((s, i) => {
        filaDeTabla(h, f, [s.nombre, s.total, s.atendidas], i, { 2: FMT_ENTERO, 3: FMT_ENTERO }, [1]);
        f += 1;
      });
      f += 1;
    }

    // Solo el nombre: el teléfono es de un tercero y este archivo viaja.
    if (turnos.clientes.length > 0) {
      subtitulo(h, f, ts.clientesTitulo, 3); f += 1;
      filaEncabezadoTabla(h, f, ts.columnasClientes); f += 1;
      turnos.clientes.forEach((c, i) => {
        filaDeTabla(h, f, [c.nombre, c.visitas, fecha(c.ultima)], i, { 2: FMT_ENTERO }, [1]);
        f += 1;
      });
      f += 1;
    }

    nota(h, f, ts.notaTurnos, 1, 6);
  }

  // ==========================================================
  // SERVICIOS (y la mercadería, aparte)
  // ==========================================================
  {
    const h = hoja(nombreHojaServicios(ficha, idioma, ts), true, true);
    h.columns = [
      { width: 5 }, { width: 32 }, { width: 11 }, { width: 15 }, { width: 15 },
      { width: 15 }, { width: 13 }, { width: 11 }, { width: 13 },
    ];
    encabezado(h, empresa.nombre, ts.serviciosTitulo, periodo, 9);
    filaEncabezadoTabla(h, 6, ts.columnasServicios);

    let f = 7;
    if (servicios.length === 0) {
      vacio(h, f, ts.sinServicios, 8);
      f += 1;
    } else {
      servicios.forEach((p, i) => {
        const fila = filaDeTabla(h, f, [
          i + 1, p.nombre, p.unidades, p.ingresos, p.costo, p.ganancia, p.margen, p.participacion,
        ], i, { 3: FMT_NUM, 4: fmt, 5: fmt, 6: fmt, 7: FMT_PORC, 8: FMT_PORC }, [2]);
        fila.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
        f += 1;
      });
      filaTotal(h, f, [
        '', 'TOTAL',
        servicios.reduce((s, p) => s + p.unidades, 0),
        servicios.reduce((s, p) => s + p.ingresos, 0),
        servicios.every((p) => p.costo !== null) ? servicios.reduce((s, p) => s + (p.costo ?? 0), 0) : null,
        servicios.every((p) => p.ganancia !== null) ? servicios.reduce((s, p) => s + (p.ganancia ?? 0), 0) : null,
        '', servicios.reduce((s, p) => s + p.participacion, 0),
      ], { 3: FMT_NUM, 4: fmt, 5: fmt, 6: fmt, 8: FMT_PORC });
      f += 1;
    }

    if (mercaderia.length > 0) {
      f += 2;
      subtitulo(h, f, ts.mercaderiaTitulo, 9); f += 1;
      filaEncabezadoTabla(h, f, ts.columnasMercaderia); f += 1;
      mercaderia.forEach((p, i) => {
        const sinCostoFila = p.costo === 0 && p.ingresos > 0;
        const fila = filaDeTabla(h, f, [
          i + 1, p.nombre, p.unidades, p.ingresos, p.costo, p.ganancia, p.margen, p.participacion,
          sinCostoFila ? ts.sinCostoMarca : ts.conCostoMarca,
        ], i, { 3: FMT_NUM, 4: fmt, 5: fmt, 6: fmt, 7: FMT_PORC, 8: FMT_PORC }, [2]);
        fila.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
        if (sinCostoFila) fila.getCell(9).font = { name: 'Calibri', size: 10, bold: true, color: { argb: ROJO } };
        f += 1;
      });
      if (sinCosto > 0) { f += 1; nota(h, f, ts.sinCostoAviso(sinCosto), 2, 9); f += 1; }
    }

    if (reponer.length > 0) {
      f += 2;
      subtitulo(h, f, ts.aReponerTitulo(reponer.length), 4); f += 1;
      filaEncabezadoTabla(h, f, ts.columnasReponer); f += 1;
      reponer.forEach((p, i) => {
        filaDeTabla(h, f, ['', p.nombre, Number(p.stock), Number(p.stock_minimo)], i, { 3: FMT_NUM, 4: FMT_NUM }, [2]);
        f += 1;
      });
    }
  }

  // ==========================================================
  // MOVIMIENTOS (+ Cuenta, Cliente y Profesional si hay equipo)
  // ==========================================================
  {
    const h = hoja(tx.hojaMovimientos, true, true);
    const conProfesional = movimientos.some((m) => profesionalDeMovimiento[m.id]);
    const titulos = [...ts.columnasMovimientos];
    if (conProfesional) titulos.splice(7, 0, ts.columnaProfesional);
    const cols = titulos.length;
    // Dónde quedó cada columna de plata, con o sin «Profesional».
    const cMonto = conProfesional ? 9 : 8;
    const cCosto = cMonto + 1;
    const cLocal = cMonto + 2;
    const cEstado = cMonto + 3;
    h.columns = [
      { width: 12 }, { width: 10 }, { width: 34 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 20 },
      ...(conProfesional ? [{ width: 18 }] : []),
      { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }, { width: 34 },
    ];
    encabezado(h, empresa.nombre, tx.detalleMovimientos, periodo, cols);
    filaEncabezadoTabla(h, 6, titulos);

    const ordenados = [...movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    ordenados.forEach((mv, i) => {
      const esGasto = mv.tipo === 'gasto';
      const anulado = !esValido(mv);
      const monto = Number(mv.monto);
      const aparte = fuera.get(mv.id);
      const costo = mv.tipo === 'venta' ? (mv.costo_total === null || mv.costo_total === undefined ? null : Number(mv.costo_total)) : null;
      const local = aparte ? null
        : mv.tipo === 'venta' ? (costo === null ? null : monto - costo)
          : esGasto ? -monto : monto;
      const valores: Celda[] = [
        fecha(mv.fecha),
        mv.tipo === 'venta' ? tx.venta : esGasto ? tx.gasto : tx.ingreso,
        mv.descripcion || '—',
        mv.categoria,
        mv.metodo_pago,
        mv.cuenta_nombre ?? null,
        mv.cliente_nombre ?? mv.contraparte ?? null,
        ...(conProfesional ? [profesionalDeMovimiento[mv.id] ?? null] : []),
        esGasto ? -monto : monto,
        costo,
        local,
        anulado ? `${tx.anulada}${mv.motivo_anulacion ? ` · ${mv.motivo_anulacion}` : ''}` : tx.valida,
        aparte === 'comision' ? ts.notaPagoComision : aparte === 'mercaderia' ? ts.notaMercaderiaAparte : null,
      ];
      const izquierda = [1, 2, 3, 4, 5, 6, 7, ...(conProfesional ? [8] : []), cEstado, cEstado + 1];
      const fila = filaDeTabla(h, 7 + i, valores, i, { [cMonto]: fmt, [cCosto]: fmt, [cLocal]: fmt }, izquierda);
      fila.getCell(2).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: esGasto ? ROJO : VERDE } };
      if (local !== null) {
        fila.getCell(cLocal).font = { name: 'Calibri', size: 10, bold: true, color: { argb: local >= 0 ? VERDE : ROJO } };
      }
      if (aparte) fila.getCell(cEstado + 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: GRIS_TITULO } };
      if (anulado) {
        fila.eachCell((c) => { c.font = { ...(c.font ?? {}), strike: true, color: { argb: 'FF9AA5A0' }, italic: true }; });
        fila.getCell(cEstado).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: ROJO } };
      }
    });

    // Los totales salen del resumen (sin anulados). «Monto» es la caja: lo
    // que entró menos TODO lo que salió, incluidos los pagos a comisión y la
    // mercadería aparte; «Para el local» es la ganancia neta.
    const caja = r.ingresosTotales - r.gastos - r.pagadoAProfesionales
      - (r.mercaderiaAparte ? r.comprasMercaderia : 0);
    const total: Celda[] = Array.from({ length: cols }, () => '');
    total[2] = tx.totalSinAnuladas;
    total[cMonto - 1] = caja;
    total[cCosto - 1] = r.costoMercaderia;
    total[cLocal - 1] = r.gananciaNeta;
    filaTotal(h, 7 + ordenados.length, total, { [cMonto]: fmt, [cCosto]: fmt, [cLocal]: fmt });

    if (ordenados.length > 0) {
      h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ordenados.length, column: cols } };
    }
  }

  // ==========================================================
  // GASTOS (la mercadería aparte y los pagos a comisión, afuera del total)
  // ==========================================================
  {
    const h = hoja(tx.hojaGastos, false, false);
    h.columns = [{ width: 5 }, { width: 44 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 5 }];
    encabezado(h, empresa.nombre, tx.enQueSeFueLaPlata, periodo, 6);
    filaEncabezadoTabla(h, 6, tx.columnasGastos);
    tablaDeCategorias(h, gastos.filas, r.gastos, fmt, FMT_PORC, tx.nadaGastado);

    const aparte: [string, number][] = [];
    if (gastos.comprasAparte !== null) aparte.push([ts.comprasAparte, gastos.comprasAparte]);
    if (r.pagadoAProfesionales > 0) aparte.push([ts.pagadoAparte, r.pagadoAProfesionales]);
    if (aparte.length > 0) {
      let f = 7 + Math.max(gastos.filas.length, 0) + 3;
      subtitulo(h, f, ts.fueraDelTotal, 5); f += 1;
      aparte.forEach(([etiqueta, monto], i) => {
        filaDeTabla(h, f, ['', etiqueta, monto], i, { 3: fmt }, [2]);
        f += 1;
      });
    }
  }

  // ==========================================================
  // DÍA POR DÍA
  // ==========================================================
  {
    const h = hoja(tx.hojaDiaPorDia, false, true);
    h.columns = [{ width: 5 }, { width: 18 }, { width: 17 }, { width: 17 }, { width: 17 }, { width: 18 }];
    encabezado(h, empresa.nombre, tx.resultadoDeCadaDia, periodo, 6);
    filaEncabezadoTabla(h, 6, ts.columnasDias(cobrado));
    serie.forEach((d, i) => {
      const fila = filaDeTabla(h, 7 + i, ['', fecha(d.fecha), d.ventas, d.otrosIngresos, d.gastos, d.ganancia],
        i, { 3: fmt, 4: fmt, 5: fmt, 6: fmt }, [2]);
      fila.getCell(6).font = {
        name: 'Calibri', size: 10, bold: true,
        color: { argb: d.ganancia === null ? 'FF9AA5A0' : d.ganancia >= 0 ? VERDE : ROJO },
      };
    });
    filaTotal(h, 7 + serie.length, ['', 'TOTAL', r.ventas, r.otrosIngresos, r.gastos, r.gananciaNeta],
      { 3: fmt, 4: fmt, 5: fmt, 6: fmt });
  }

  // ==========================================================
  // PARA TU CONTADOR
  // ==========================================================
  {
    const h = hoja(ts.hojaContador, false, false);
    h.columns = [{ width: 4 }, { width: 46 }, { width: 20 }, { width: 4 }];
    encabezado(h, empresa.nombre, ts.contadorTitulo, periodo, 4);
    let f = 6;
    const linea = (etiqueta: string, monto: number, fuerte = false, color = TINTA) => {
      const fila = h.getRow(f);
      fila.getCell(2).value = etiqueta;
      fila.getCell(3).value = monto;
      fila.getCell(2).font = { name: 'Calibri', size: 11, bold: fuerte, color: { argb: TINTA } };
      fila.getCell(3).font = { name: 'Calibri', size: 11, bold: fuerte, color: { argb: color } };
      fila.getCell(3).numFmt = fmt;
      fila.getCell(3).alignment = { horizontal: 'right' };
      fila.getCell(2).border = bordeFino; fila.getCell(3).border = bordeFino;
      fila.height = 20;
      f += 1;
    };
    const titulo = (texto: string) => {
      h.mergeCells(`B${f}:C${f}`);
      const c = h.getCell(`B${f}`);
      c.value = texto.toUpperCase();
      c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS_TITULO } };
      h.getRow(f).height = 20;
      f += 1;
    };

    titulo(ts.loQueEntro);
    linea(ts.cobradoServicios, r.ventas);
    linea(ts.otrosIngresos, r.otrosIngresos);
    linea(ts.totalEntro, r.ingresosTotales, true, VERDE);
    f += 1;

    titulo(ts.loQueSalio);
    for (const c of gastos.filas) linea(c.nombre, c.monto);
    if (gastos.comprasAparte !== null) linea(ts.comprasMercaderia, gastos.comprasAparte);
    if (r.pagadoAProfesionales > 0) linea(ts.pagosAlEquipo, r.pagadoAProfesionales);
    linea(ts.totalSalio, r.gastos + (gastos.comprasAparte ?? 0) + r.pagadoAProfesionales, true, ROJO);
    f += 1;

    const notas = [
      ...(gastos.comprasAparte !== null || r.pagadoAProfesionales > 0 ? [ts.notaAparte] : []),
      ts.notaDetalle(tx.hojaMovimientos, hayEquipo ? ts.hojaPorProfesional : null),
      ts.notaSet,
    ];
    for (const texto of notas) { nota(h, f, texto, 2, 3); h.getRow(f).height = Math.max(32, Math.ceil(texto.length / 55) * 15); f += 1; }
  }

  return libro;
}
