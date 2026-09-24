import ExcelJS from 'exceljs';
import { esValido, type AhorroDelPeriodo, type FilaCategoria, type FilaDia, type Resumen } from '../calculos';
import { fechaLegible, simboloDe } from '../formato';
import { sumarDias } from '../fechas';
import {
  encabezado, filaEncabezadoTabla, formatoMoneda, textoPeriodo, tablaDeCategorias,
  bordeFino, VERDE, VERDE_SUAVE, TINTA, ROJO, GRIS,
} from '../reporte';
import { textosExcel } from '../reporte-textos';
import type { FichaRubro } from '../rubros';
import type { Conversor, DatosBaseLibro, HojaDelLibro } from './comun';
import { fechaDeCobro, inicioDeCiclo } from './rango';
import { textosPersonalExcel } from './textos-personal';

/**
 * ============================================================
 * EL REPORTE DE LA CUENTA PERSONAL: LAS CUENTAS Y EL EXCEL (23/09)
 * ============================================================
 *
 * La pantalla (`src/components/reportes/ReportePersonal.tsx`) y este libro
 * usan las MISMAS funciones de abajo para cada número que no viene hecho de
 * la base: qué es «Salió», cuántos ciclos entran en el rango, el presupuesto
 * contra lo gastado, qué fijo está pagado, las barras por ciclo y las
 * deudas del período. Así el archivo y la pantalla no pueden decir dos
 * cosas distintas, y todo se prueba sin base (pruebas/excel-personal.test.js).
 *
 * Todo es puro: sin red, sin reloj, sin Next. Las fechas llegan de afuera.
 */

// =====================================================================
// LAS CUENTAS
// =====================================================================

/** Lo que entró: sueldo, cobros, todo junto. Para una persona no hay «ventas». */
export function entroDe(r: Resumen): number {
  return r.ingresosTotales;
}

/**
 * Lo que salió. Es `gastos` salvo en un caso: si en el período hubo ventas
 * con costo cargado, la 106 saca la categoría «Mercadería» de `gastos` y la
 * devuelve aparte (decisión 2, pensada para un comercio). Para una persona
 * toda la plata que salió salió, así que se vuelve a sumar. En la práctica
 * una cuenta personal casi nunca vende con costo; esto evita que el día que
 * lo haga «Salió» no coincida con la suma de «En qué se fue», que sí trae
 * la Mercadería.
 */
export function salioDe(r: Resumen): number {
  return r.gastos + (r.mercaderiaAparte ? r.comprasMercaderia : 0);
}

/** Lo mismo, para un día de la serie (la bandera es la del período entero). */
export function salioDelDia(d: FilaDia): number {
  return d.gastos + (d.mercaderiaAparte ? Number(d.comprasMercaderia ?? 0) : 0);
}

/** «Te quedó»: lo que entró menos lo que salió. Lo guardado NO resta: sigue siendo tuyo. */
export function teQuedoDe(r: Resumen): number {
  return entroDe(r) - salioDe(r);
}

/** El mes de `iso` corrido `n` meses, como 'YYYY-MM-01'. */
function mesCorrido(iso: string, n: number): string {
  const [a, m] = iso.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/** Más ciclos que esto no se comparan con el presupuesto: el plan de hoy no es el de hace años. */
export const TOPE_CICLOS_PRESUPUESTO = 12;

/**
 * CUÁNTOS CICLOS DE COBRO ENTRAN EN EL RANGO, para multiplicar el
 * presupuesto (que vale «por ciclo», a propósito: 024).
 *
 * Solo cuenta si el rango EMPIEZA un día de cobro (el 1 para quien no tiene
 * ingreso fijo: su ciclo es el mes). Entonces son los cobros que caen
 * adentro, y el ciclo en curso cuenta entero: a mitad de ciclo se compara lo
 * gastado hasta hoy contra el plan del ciclo, que es «cuánto te queda».
 *
 * Un rango que corta un ciclo por la mitad (del 1 al 30 para quien cobra el
 * 5) devuelve 0: la mitad del gasto de un ciclo contra el plan entero sería
 * un semáforo que no se puede sostener. La pantalla y el Excel lo explican
 * en vez de mostrarlo.
 */
export function ciclosDelRango(desde: string, hasta: string, dia: number | null): number {
  const d = dia && dia > 1 ? dia : 1;
  if (fechaDeCobro(desde, d) !== desde || hasta < desde) return 0;
  let n = 0;
  let mes = desde;
  // El tope corta un «Todo» de veinte años sin recorrerlo entero.
  while (fechaDeCobro(mes, d) <= hasta && n <= TOPE_CICLOS_PRESUPUESTO) {
    n += 1;
    mes = mesCorrido(mes, 1);
  }
  return n;
}

/** ¿Se puede poner el presupuesto al lado de lo gastado en este rango? */
export function presupuestoAplica(ciclos: number): boolean {
  return ciclos >= 1 && ciclos <= TOPE_CICLOS_PRESUPUESTO;
}

export interface LineaPresupuesto {
  categoria: string;
  /** Lo planeado POR CICLO, como se guarda. */
  planeado: number;
}

export type Semaforo = 'bien' | 'cerca' | 'pasado';

/** Una categoría de «En qué se fue», con su presupuesto si tiene. */
export interface FilaEnQueSeFue extends FilaCategoria {
  /** Planeado × ciclos del rango. Null si la categoría no tiene plan o el rango no se compara. */
  planeado: number | null;
  /** Planeado − gastado. Negativo si se pasó. */
  diferencia: number | null;
  /** Gastado sobre planeado, en %. */
  usado: number | null;
  semaforo: Semaforo | null;
}

/** Hasta el 80 % va bien; del 80 al 100, cerca; más de 100, se pasó. */
export function semaforoDe(usado: number): Semaforo {
  if (usado > 100) return 'pasado';
  if (usado >= 80) return 'cerca';
  return 'bien';
}

/**
 * EN QUÉ SE FUE, CON EL PRESUPUESTO AL LADO.
 *
 * Primero las categorías con gasto (en el orden de la base, de mayor a
 * menor), y al final las planeadas donde no se gastó nada: que el plan de
 * «Salidas» siga intacto también es una respuesta. Los nombres se comparan
 * tal cual llegan: la pantalla los pasa en español (como se guardan) y el
 * Excel ya traducidos, los dos del mismo lado.
 */
export function enQueSeFue(
  gastos: FilaCategoria[],
  plan: LineaPresupuesto[],
  ciclos: number,
): { filas: FilaEnQueSeFue[]; pasadas: number; planeadoTotal: number; gastadoEnPlan: number; gastadoSinPlan: number } {
  const aplica = presupuestoAplica(ciclos);
  const planes = new Map<string, number>();
  if (aplica) {
    for (const p of plan) {
      const v = Number(p.planeado);
      if (v > 0) planes.set(p.categoria, (planes.get(p.categoria) ?? 0) + v * ciclos);
    }
  }

  const conPlan = (nombre: string, monto: number) => {
    const planeado = planes.get(nombre);
    if (planeado === undefined) return { planeado: null, diferencia: null, usado: null, semaforo: null };
    const usado = (monto / planeado) * 100;
    return { planeado, diferencia: planeado - monto, usado, semaforo: semaforoDe(usado) };
  };

  const filas: FilaEnQueSeFue[] = gastos.map((g) => ({ ...g, ...conPlan(g.nombre, g.monto) }));
  const conGasto = new Set(gastos.map((g) => g.nombre));
  for (const [categoria] of Array.from(planes.entries()).sort((a, b) => b[1] - a[1])) {
    if (!conGasto.has(categoria)) {
      filas.push({ nombre: categoria, monto: 0, operaciones: 0, participacion: 0, ...conPlan(categoria, 0) });
    }
  }

  const planeadoTotal = Array.from(planes.values()).reduce((s, v) => s + v, 0);
  const gastadoEnPlan = gastos.filter((g) => planes.has(g.nombre)).reduce((s, g) => s + g.monto, 0);
  const gastadoSinPlan = aplica ? gastos.filter((g) => !planes.has(g.nombre)).reduce((s, g) => s + g.monto, 0) : 0;
  const pasadas = filas.filter((f) => f.semaforo === 'pasado').length;
  return { filas, pasadas, planeadoTotal, gastadoEnPlan, gastadoSinPlan };
}

export interface GastoFijoDelReporte {
  nombre: string;
  categoria: string;
  importe: number;
  dia_del_mes: number | null;
}

export type EstadoFijo = 'pagado' | 'parcial' | 'pendiente';

export interface FilaFijo extends GastoFijoDelReporte {
  /** Lo gastado en su categoría en el rango (el mismo número para todos los fijos de esa categoría). */
  gastadoCategoria: number;
  estado: EstadoFijo;
  /** Lo que le falta a ESTE fijo. */
  falta: number;
}

/**
 * LOS FIJOS DEL CICLO: PAGADOS Y PENDIENTES.
 *
 * La regla es la de Orden desde la 025 (`fijos_por_pagar`): no hay un
 * vínculo entre el gasto y el fijo, se da por pagado si en el ciclo se gastó
 * en su categoría por lo menos lo que vale. Con dos fijos en la misma
 * categoría (luz y agua en «Servicios»), lo gastado se reparte en el orden
 * en que vencen: el que vence primero se cubre primero. Así la suma de lo
 * que falta es exactamente la de la base: lo planeado de la categoría menos
 * lo gastado, nunca menos de cero.
 */
export function fijosDelCiclo(
  fijos: GastoFijoDelReporte[],
  gastos: FilaCategoria[],
): { filas: FilaFijo[]; total: number; cubierto: number; falta: number } {
  const gastado = new Map(gastos.map((g) => [g.nombre, g.monto]));
  const orden = [...fijos].sort((a, b) =>
    (a.dia_del_mes ?? 99) - (b.dia_del_mes ?? 99) || Number(b.importe) - Number(a.importe));
  const resto = new Map<string, number>();
  const filas: FilaFijo[] = orden.map((f) => {
    const importe = Number(f.importe);
    const gastadoCategoria = gastado.get(f.categoria) ?? 0;
    const queda = resto.has(f.categoria) ? resto.get(f.categoria)! : gastadoCategoria;
    const cubre = Math.max(0, Math.min(importe, queda));
    resto.set(f.categoria, queda - cubre);
    const falta = importe - cubre;
    return {
      ...f, importe, gastadoCategoria, falta,
      estado: falta <= 0 ? 'pagado' : cubre > 0 ? 'parcial' : 'pendiente',
    };
  });
  const total = filas.reduce((s, f) => s + f.importe, 0);
  const falta = filas.reduce((s, f) => s + f.falta, 0);
  return { filas, total, cubierto: total - falta, falta };
}

/** Un tramo de las barras: un ciclo (o un mes), el último cortado en `hasta`. */
export interface Tramo { desde: string; hasta: string }

/**
 * LOS ÚLTIMOS `n` CICLOS HASTA `hasta`, para las barras de «cómo viene».
 * Con día de cobro son ciclos; sin él, meses. El último termina en `hasta`
 * (el ciclo en curso va hasta hoy, como «Este ciclo»).
 */
export function ultimosCiclos(hasta: string, dia: number | null, n = 6): Tramo[] {
  const d = dia && dia > 1 ? dia : 1;
  const inicio = inicioDeCiclo(hasta, d);
  const tramos: Tramo[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const desde = fechaDeCobro(mesCorrido(inicio, -k), d);
    const fin = k === 0 ? hasta : sumarDias(fechaDeCobro(mesCorrido(inicio, -k + 1), d), -1);
    tramos.push({ desde, hasta: fin });
  }
  return tramos;
}

export interface BarraCiclo extends Tramo {
  entro: number;
  salio: number;
  /** Null si no se leyó (no hay dato: no se dibuja un cero). */
  guardo: number | null;
}

/** Suma la serie diaria por tramo. `guardado[i]` es lo guardado neto en el tramo i. */
export function barrasPorCiclo(tramos: Tramo[], serie: FilaDia[], guardado: (number | null)[]): BarraCiclo[] {
  return tramos.map((t, i) => {
    const dias = serie.filter((d) => d.fecha >= t.desde && d.fecha <= t.hasta);
    return {
      ...t,
      entro: dias.reduce((s, d) => s + d.ventas + d.otrosIngresos, 0),
      salio: dias.reduce((s, d) => s + salioDelDia(d), 0),
      guardo: guardado[i] ?? null,
    };
  });
}

/** «ago» o «5 ago»: cómo se nombra un tramo debajo de su barra. */
export function etiquetaTramo(desde: string, dia: number | null, locale: string): string {
  const [a, m, d] = desde.split('-').map(Number);
  const mes = new Date(Date.UTC(a, m - 1, d)).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' }).replace('.', '');
  return dia && dia > 1 ? `${d} ${mes}` : mes;
}

export interface DeudaDelReporte {
  id: string;
  tipo: string;
  nombre: string;
  acreedor: string;
  monto_original: number;
  saldo: number;
  cuotas_totales: number | null;
  cuotas_pagadas: number;
  monto_cuota: number | null;
  vence_el: string | null;
  vencida: boolean;
  activa: boolean;
}

export interface PagoDeudaDelReporte {
  deuda_id: string;
  fecha: string;
  monto: number;
  nota: string;
}

export interface FilaDeuda extends DeudaDelReporte {
  pagadoEnPeriodo: number;
}

/**
 * LAS DEUDAS DEL REPORTE: las que siguen abiertas y las que se pagaron en
 * el período (aunque ya estén saldadas: saldar una deuda en el ciclo es de
 * lo mejor que puede mostrar este reporte). El saldo es el de hoy
 * (`deudas.saldo`): el saldo a una fecha pasada no se reconstruye (fase 2).
 */
export function deudasDelReporte(
  deudas: DeudaDelReporte[],
  pagos: PagoDeudaDelReporte[],
): { filas: FilaDeuda[]; debesHoy: number; pagadoEnPeriodo: number; proximoVencimiento: string | null } {
  const pagado = new Map<string, number>();
  for (const p of pagos) pagado.set(p.deuda_id, (pagado.get(p.deuda_id) ?? 0) + Number(p.monto));
  const abierta = (d: DeudaDelReporte) => d.activa && Number(d.saldo) > 0;
  const filas = deudas
    .filter((d) => abierta(d) || (pagado.get(d.id) ?? 0) > 0)
    .map((d) => ({ ...d, saldo: Number(d.saldo), pagadoEnPeriodo: pagado.get(d.id) ?? 0 }));
  const vencimientos = filas.filter((d) => abierta(d) && d.vence_el).map((d) => d.vence_el as string).sort();
  return {
    filas,
    debesHoy: filas.filter(abierta).reduce((s, d) => s + d.saldo, 0),
    pagadoEnPeriodo: pagos.reduce((s, p) => s + Number(p.monto), 0),
    proximoVencimiento: vencimientos[0] ?? null,
  };
}

export interface FondoDelReporte {
  nombre: string;
  /**
   * La moneda del fondo si NO es la de la cuenta (073). Null = la de la
   * cuenta: sus montos se pasan a la moneda de la vista como todo. Uno en
   * dólares muestra saldo, meta, falta y por mes en dólares, sin convertir.
   */
  moneda: string | null;
  saldo: number;
  meta: number | null;
  fecha_limite: string | null;
  falta: number | null;
  por_mes: number | null;
}

export interface FilaMeta extends FondoDelReporte {
  /** Guardado neto en el período, en la moneda de la cuenta (lo que costó). */
  guardadoEnPeriodo: number;
}

/**
 * FONDOS Y METAS: los fondos de hoy, con lo guardado en el período al lado.
 * `resumen_ahorro_periodo` nombra los fondos por nombre (no trae id), así
 * que se unen por nombre; un fondo que se movió en el período y ya no está
 * activo sale igual, sin meta.
 */
export function metasDeAhorro(fondos: FondoDelReporte[], ahorro: AhorroDelPeriodo): FilaMeta[] {
  const guardado = new Map<string, number>();
  for (const f of ahorro.porFondo) guardado.set(f.nombre, (guardado.get(f.nombre) ?? 0) + f.neto);
  const filas: FilaMeta[] = fondos.map((f) => ({ ...f, guardadoEnPeriodo: guardado.get(f.nombre) ?? 0 }));
  const conocidos = new Set(fondos.map((f) => f.nombre));
  for (const f of ahorro.porFondo) {
    if (conocidos.has(f.nombre)) continue;
    conocidos.add(f.nombre);
    filas.push({
      nombre: f.nombre, moneda: null, saldo: f.saldo_hoy, meta: null, fecha_limite: null, falta: null, por_mes: null,
      guardadoEnPeriodo: guardado.get(f.nombre) ?? 0,
    });
  }
  return filas;
}

/** Lo que te deben: la foto de hoy y lo que se movió en el período. */
export interface TeDeben {
  totalHoy: number;
  cuantos: number;
  /** Lo que te devolvieron en el período. No es un ingreso (056): era tu plata. */
  devuelto: number;
  /** Lo que prestaste o fiaste en el período. */
  prestado: number;
}

// =====================================================================
// EL LIBRO
// =====================================================================

/**
 * Lo propio de la cuenta personal que el libro necesita además de lo común.
 * Llega en la moneda de la cuenta y la ruta lo pasa por `enLaVistaPersonal`.
 * Las categorías del presupuesto y de los fijos llegan ya traducidas, igual
 * que `categorias` (si no, «Comida» no encontraría a «Alimentação»).
 */
export interface ExtrasPersonal {
  /** El día de cobro, o null (mide por mes). */
  diaCobro: number | null;
  /** Lo guardado neto en el período anterior: la columna «Antes» de «Guardé». */
  guardadoPrevio: number;
  presupuesto: LineaPresupuesto[];
  fijos: GastoFijoDelReporte[];
  fondos: FondoDelReporte[];
  deudas: DeudaDelReporte[];
  pagosDeuda: PagoDeudaDelReporte[];
  teDeben: TeDeben | null;
}

/** Lo que el libro recibe además: ya leído por la ruta para el libro de hoy (y ya convertido). */
export interface LeidoPersonal {
  /** De dónde vino, por categoría (traducido). */
  ingresos: FilaCategoria[];
  /** Lo guardado y sacado de los fondos en el período. */
  ahorro: AhorroDelPeriodo;
}

export type DatosLibroPersonal = DatosBaseLibro & ExtrasPersonal & LeidoPersonal;

/** Los extras en la moneda de la vista. Lo que falta sigue faltando; los fondos en otra moneda quedan en la suya. */
export function enLaVistaPersonal(extras: ExtrasPersonal, c: Conversor): ExtrasPersonal {
  if (!c.convierte) return extras;
  return {
    ...extras,
    guardadoPrevio: c.x(extras.guardadoPrevio),
    presupuesto: extras.presupuesto.map((p) => ({ ...p, planeado: c.x(p.planeado) })),
    fijos: extras.fijos.map((f) => ({ ...f, importe: c.x(f.importe) })),
    fondos: extras.fondos.map((f) => (f.moneda ? f : {
      ...f, saldo: c.x(f.saldo), meta: c.xn(f.meta), falta: c.xn(f.falta), por_mes: c.xn(f.por_mes),
    })),
    deudas: extras.deudas.map((d) => ({
      ...d, monto_original: c.x(d.monto_original), saldo: c.x(d.saldo), monto_cuota: c.xn(d.monto_cuota),
    })),
    pagosDeuda: extras.pagosDeuda.map((p) => ({ ...p, monto: c.x(p.monto) })),
    teDeben: extras.teDeben && {
      ...extras.teDeben,
      totalHoy: c.x(extras.teDeben.totalHoy), devuelto: c.x(extras.teDeben.devuelto), prestado: c.x(extras.teDeben.prestado),
    },
  };
}

/**
 * LAS HOJAS QUE TRAE `libroPersonal`, para la tarjeta de descarga. Las que
 * dependen de lo que la persona cargó salen «si hubo»: los fijos si tiene
 * alguno, el ahorro si tiene fondos o los movió, las deudas si debe o pagó.
 */
export function hojasPersonal(ficha?: FichaRubro | null, idioma?: string): HojaDelLibro[] {
  void ficha;
  const tx = textosExcel(idioma);
  const tp = textosPersonalExcel(idioma);
  return [
    { nombre: tx.hojaResumen },
    { nombre: tx.hojaEnQueSeFue },
    { nombre: tx.hojaDeDondeVino },
    { nombre: tp.hojaGastosFijos, siHay: true },
    { nombre: tx.hojaAhorro, siHay: true },
    { nombre: tp.hojaDeudas, siHay: true },
    { nombre: tx.hojaMovimientos },
    { nombre: tx.hojaDiaPorDia },
  ];
}

const HOJA_VERTICAL = {
  views: [{ showGridLines: false }],
  pageSetup: { paperSize: 9, orientation: 'portrait' as const, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
};

function filaTotal(fila: ExcelJS.Row, fmt: string, plata: number[], izquierda: number[] = [2]) {
  fila.height = 22;
  fila.eachCell({ includeEmpty: true }, (c, n) => {
    c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
    c.alignment = { vertical: 'middle', horizontal: izquierda.includes(n) ? 'left' : 'right' };
    if (plata.includes(n)) c.numFmt = fmt;
  });
}

function nota(h: ExcelJS.Worksheet, fila: number, desde: string, hasta: string, texto: string, alto = 30) {
  h.mergeCells(`${desde}${fila}:${hasta}${fila}`);
  const c = h.getCell(`${desde}${fila}`);
  c.value = texto;
  c.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF8A968F' } };
  c.alignment = { vertical: 'middle', wrapText: true };
  h.getRow(fila).height = alto;
}

/**
 * EL LIBRO DE LA CUENTA PERSONAL (reemplaza al `libroPersonal` de
 * reporte.ts para esta variante). Lo de antes sigue: lo que entró y de
 * dónde, en qué se fue, lo guardado, el detalle y el día por día. Suma:
 * la comparación con el período anterior (la misma flecha de la pantalla),
 * el presupuesto al lado de lo gastado, los gastos fijos, las metas y las
 * deudas, y la cuenta de cada movimiento en vez de la forma de pago.
 */
export function libroPersonal(datos: DatosLibroPersonal): ExcelJS.Workbook {
  const {
    empresa, desde, hasta, idioma, resumen: r, resumenPrevio: rp, previo, categorias, serie, movimientos,
    ingresos, ahorro, diaCobro, guardadoPrevio, presupuesto, fijos, fondos, deudas, pagosDeuda, teDeben,
  } = datos;
  const tx = textosExcel(idioma);
  const tp = textosPersonalExcel(idioma);
  const moneda = empresa.moneda;
  const fmt = formatoMoneda(moneda);
  const fmtPorc = '0.0"%"';
  const periodo = textoPeriodo(desde, hasta, empresa, tx);
  const fecha = (iso: string) => fechaLegible(iso, true, tx.locale);
  const simbolo = simboloDe(moneda);
  const enPlata = (n: number) => `${simbolo} ${Math.round(n).toLocaleString(tx.locale)}`;

  const entro = entroDe(r);
  const salio = salioDe(r);
  const teQuedo = entro - salio;
  const ciclos = ciclosDelRango(desde, hasta, diaCobro);
  const gasto = enQueSeFue(categorias, presupuesto, ciclos);
  const deFijos = fijosDelCiclo(fijos, categorias);
  const fijosConEstado = ciclos === 1;
  const metas = metasDeAhorro(fondos, ahorro);
  const deDeudas = deudasDelReporte(deudas, pagosDeuda);
  const nombreDeuda = new Map(deudas.map((d) => [d.id, d.nombre]));

  const dias = Math.max(1, Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000,
  ) + 1);

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Orden';
  libro.created = new Date();

  // ==========================================================
  // RESUMEN
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaResumen, HOJA_VERTICAL);
    h.columns = [{ width: 4 }, { width: 36 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 4 }];
    encabezado(h, empresa.nombre, tx.tusNumeros, periodo, 6);
    let f = 6;

    const bloque = (titulo: string) => {
      h.mergeCells(`B${f}:E${f}`);
      const c = h.getCell(`B${f}`);
      c.value = titulo;
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      h.getRow(f).height = 22;
      f += 1;
    };

    const linea = (
      etiqueta: string, valor: number,
      o?: { fuerte?: boolean; color?: string; nota?: string; formato?: string },
    ) => {
      const fila = h.getRow(f);
      const a = fila.getCell(2), b = fila.getCell(3), c = fila.getCell(4);
      a.value = etiqueta;
      a.font = { name: 'Calibri', size: 10.5, bold: o?.fuerte, color: { argb: TINTA } };
      a.alignment = { vertical: 'middle', indent: 1 };
      b.value = valor;
      b.numFmt = o?.formato ?? fmt;
      b.font = { name: 'Calibri', size: 10.5, bold: o?.fuerte, color: { argb: o?.color ?? TINTA } };
      b.alignment = { vertical: 'middle', horizontal: 'right' };
      if (o?.nota) {
        h.mergeCells(`D${f}:E${f}`);
        c.value = o.nota;
        c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF8A968F' } };
        c.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
      }
      [a, b, c, fila.getCell(5)].forEach((x) => { x.border = bordeFino; });
      fila.height = 20;
      f += 1;
    };

    const notaVerde = (texto: string) => {
      h.mergeCells(`B${f}:E${f}`);
      const c = h.getCell(`B${f}`);
      c.value = texto;
      c.font = { name: 'Calibri', size: 10, color: { argb: TINTA } };
      c.alignment = { vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } };
      h.getRow(f).height = 30;
      f += 1;
    };

    // ---- los cuatro números contra el período anterior (lo mismo que la pantalla) ----
    bloque(tp.comparado);
    filaEncabezadoTabla(h, f, tp.columnasComparacion);
    f += 1;
    const guardado = ahorro.neto;
    const comparacion: [string, number, number, boolean][] = [
      [tp.entro, entro, entroDe(rp), true],
      [tp.salio, salio, salioDe(rp), false],
      [tp.guarde, guardado, guardadoPrevio, true],
      [tp.teQuedo, teQuedo, teQuedoDe(rp), true],
    ];
    comparacion.forEach(([etiqueta, ahora, antes, subirEsBueno], i) => {
      const fila = h.getRow(f);
      const dif = ahora - antes;
      fila.getCell(2).value = etiqueta;
      fila.getCell(3).value = ahora;
      fila.getCell(4).value = antes;
      fila.getCell(5).value = dif;
      fila.height = 20;
      for (let n = 2; n <= 5; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10.5, bold: n === 3 || i === 3, color: { argb: TINTA } };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right', indent: n === 2 ? 1 : 0 };
        if (n >= 3) c.numFmt = fmt;
      }
      if (dif !== 0) {
        fila.getCell(5).font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: (dif > 0) === subirEsBueno ? VERDE : ROJO } };
      }
      f += 1;
    });
    nota(h, f, 'B', 'E', `${tp.periodoAnterior(fecha(previo.desde), fecha(previo.hasta))}. ${tp.notaGuarde}`);
    f += 2;

    // ---- de dónde vino ----
    bloque(tx.loQueEntro);
    if (ingresos.length === 0) linea(tx.sinIngresos, 0);
    else ingresos.forEach((i) => linea(i.nombre, i.monto, { nota: tx.veces(i.operaciones) }));
    linea(tx.totalQueEntro, entro, { fuerte: true, color: VERDE });
    f += 1;

    // ---- en qué se fue ----
    bloque(tx.loQueSalio);
    if (categorias.length === 0) linea(tx.sinGastos, 0);
    else {
      categorias.slice(0, 5).forEach((c) => linea(c.nombre, c.monto, { color: ROJO, nota: tx.deTusGastos(c.participacion.toFixed(1)) }));
      if (categorias.length > 5) {
        linea(tx.otrasCategorias(categorias.length - 5), categorias.slice(5).reduce((s, c) => s + c.monto, 0), { color: ROJO });
      }
    }
    linea(tx.totalQueSalio, salio, { fuerte: true, color: ROJO });
    f += 1;

    // ---- presupuesto ----
    if (presupuestoAplica(ciclos) && gasto.planeadoTotal > 0) {
      bloque(tp.presupuesto);
      linea(tp.planeadoTotal, gasto.planeadoTotal);
      linea(tp.gastadoEnLoPlaneado, gasto.gastadoEnPlan, { color: ROJO });
      if (gasto.gastadoSinPlan > 0) linea(tp.gastadoSinPlan, gasto.gastadoSinPlan, { color: ROJO });
      linea(gasto.pasadas > 0 ? tp.categoriasPasadas(gasto.pasadas) : tp.ningunaPasada, gasto.pasadas, {
        formato: '#,##0', color: gasto.pasadas > 0 ? ROJO : VERDE, fuerte: true,
      });
      f += 1;
    }

    // ---- fijos ----
    if (fijosConEstado && deFijos.filas.length > 0) {
      bloque(tp.fijos);
      linea(tp.fijosPagados, deFijos.cubierto, { color: VERDE, nota: `${deFijos.filas.filter((x) => x.estado === 'pagado').length} / ${deFijos.filas.length}` });
      linea(tp.fijosFalta, deFijos.falta, { color: deFijos.falta > 0 ? ROJO : TINTA, fuerte: true });
      f += 1;
    }

    // ---- ahorro ----
    if (ahorro.aportado > 0 || ahorro.retirado > 0) {
      bloque(tx.loQueGuardaste);
      linea(tx.depositadoEnFondos, ahorro.aportado, { color: VERDE });
      if (ahorro.retirado > 0) linea(tx.retiradoDeFondos, -ahorro.retirado, { color: ROJO });
      linea(tx.guardadoEnElPeriodo, ahorro.neto, { fuerte: true });
      f += 1;
    }

    // ---- deudas ----
    if (deDeudas.filas.length > 0) {
      bloque(tp.deudas);
      linea(tp.debesHoy, deDeudas.debesHoy, { color: ROJO, fuerte: true, nota: tp.aHoy });
      linea(tp.pagadoEnElPeriodo, deDeudas.pagadoEnPeriodo);
      f += 1;
    }

    // ---- lo que te deben ----
    if (teDeben && (teDeben.totalHoy > 0 || teDeben.devuelto > 0 || teDeben.prestado > 0)) {
      bloque(tp.teDeben);
      linea(tp.teDebenHoy(teDeben.cuantos), teDeben.totalHoy, { color: VERDE, fuerte: true });
      if (teDeben.prestado > 0) linea(tp.prestaste, teDeben.prestado);
      if (teDeben.devuelto > 0) {
        linea(tp.teDevolvieron, teDeben.devuelto);
        nota(h, f, 'B', 'E', tp.notaDevuelto, 22);
        f += 1;
      }
      f += 1;
    }

    // ---- para mirarlo de cerca ----
    bloque(tx.paraMirarloDeCerca);
    linea(tx.gastoPromedioDia, salio / dias, { nota: tx.diasDelPeriodo(dias) });
    linea(tx.diasConAlgo, serie.filter((d) => d.ventas + d.otrosIngresos + salioDelDia(d) > 0).length, { formato: '#,##0' });
    if (entro > 0) linea(tx.delTotalGastaste, (salio / entro) * 100, { formato: fmtPorc });
    if (r.movimientosAnulados > 0) {
      linea(tx.movimientosAnulados, r.movimientosAnulados, { formato: '#,##0', nota: tx.noSumanEnNingunTotal });
    }
    f += 2;

    h.mergeCells(`B${f}:E${f}`);
    const dc = h.getCell(`B${f}`);
    dc.value = tx.paraTenerEnCuenta;
    dc.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF6B7C75' } };
    f += 1;

    const mayorGasto = movimientos
      .filter((m) => m.tipo === 'gasto' && esValido(m))
      .sort((a, b) => Number(b.monto) - Number(a.monto))[0];
    if (categorias[0]) {
      notaVerde(tx.dondeMasSeFue(categorias[0].nombre, enPlata(categorias[0].monto), categorias[0].participacion.toFixed(1)));
    }
    if (mayorGasto) notaVerde(`${tx.gastoMasGrande(mayorGasto.descripcion || tx.sinDescripcion, enPlata(Number(mayorGasto.monto)))}.`);
    if (ahorro.neto > 0) notaVerde(tx.guardaste(enPlata(ahorro.neto)));
    if (entro === 0 && salio === 0) notaVerde(tx.sinNada);
    else if (salio > 0 && entro === 0) notaVerde(tx.gastosSinIngresos);
    else if (teQuedo < 0) notaVerde(tx.gastasteDeMas(enPlata(Math.abs(teQuedo))));
    else if (teQuedo > 0 && ahorro.neto <= 0) notaVerde(tx.sobro(enPlata(teQuedo)));
  }

  // ==========================================================
  // EN QUÉ SE FUE (+ presupuesto, diferencia y % usado)
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaEnQueSeFue, HOJA_VERTICAL);
    h.columns = [
      { width: 5 }, { width: 30 }, { width: 18 }, { width: 13 }, { width: 11 }, { width: 18 }, { width: 18 }, { width: 11 },
    ];
    encabezado(h, empresa.nombre, tx.enQueSeFueLaPlata, periodo, 8);
    filaEncabezadoTabla(h, 6, tp.columnasEnQueSeFue);

    if (gasto.filas.length === 0) {
      h.mergeCells('B7:H7');
      const c = h.getCell('B7');
      c.value = tx.nadaGastado;
      c.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF8A968F' } };
      h.getRow(7).height = 20;
    }
    gasto.filas.forEach((g, i) => {
      const fila = h.getRow(7 + i);
      fila.values = [
        i + 1, g.nombre, g.monto, g.operaciones, g.participacion,
        g.planeado ?? '—', g.diferencia ?? '—', g.usado ?? '—',
      ];
      fila.height = 18;
      for (let n = 1; n <= 8; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : n === 1 ? 'center' : 'right' };
        if ((n === 3 || n === 6 || n === 7) && typeof c.value === 'number') c.numFmt = fmt;
        if (n === 4) c.numFmt = '#,##0';
        if ((n === 5 || n === 8) && typeof c.value === 'number') c.numFmt = fmtPorc;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      }
      if (g.semaforo) {
        const color = g.semaforo === 'pasado' ? ROJO : g.semaforo === 'cerca' ? 'FFB7791F' : VERDE;
        fila.getCell(7).font = { name: 'Calibri', size: 10, bold: true, color: { argb: color } };
        fila.getCell(8).font = { name: 'Calibri', size: 10, bold: true, color: { argb: color } };
      }
    });
    if (gasto.filas.length > 0) {
      const fT = 7 + gasto.filas.length;
      const conPlan = gasto.planeadoTotal > 0;
      h.getRow(fT).values = [
        '', 'TOTAL', salio, categorias.reduce((s, c) => s + c.operaciones, 0), 100,
        conPlan ? gasto.planeadoTotal : '', conPlan ? gasto.planeadoTotal - gasto.gastadoEnPlan : '', '',
      ];
      filaTotal(h.getRow(fT), fmt, conPlan ? [3, 6, 7] : [3]);
      h.getRow(fT).getCell(4).numFmt = '#,##0';
      h.getRow(fT).getCell(5).numFmt = fmtPorc;
      nota(h, fT + 2, 'B', 'H',
        presupuestoAplica(ciclos) ? tp.contraElPlanDeHoy(ciclos) : tp.presupuestoSoloPorCiclo);
    }
  }

  // ==========================================================
  // DE DÓNDE VINO
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaDeDondeVino, HOJA_VERTICAL);
    h.columns = [{ width: 5 }, { width: 32 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 5 }];
    encabezado(h, empresa.nombre, tx.deDondeVinoLaPlata, periodo, 6);
    filaEncabezadoTabla(h, 6, tx.columnasIngresos);
    tablaDeCategorias(h, ingresos, entro, fmt, fmtPorc, tx.nadaCargado);
    if (teDeben && teDeben.devuelto > 0) {
      nota(h, 7 + Math.max(1, ingresos.length) + 2, 'B', 'E', tp.notaDevuelto, 22);
    }
  }

  // ==========================================================
  // GASTOS FIJOS (si tiene alguno)
  // ==========================================================
  if (deFijos.filas.length > 0) {
    const h = libro.addWorksheet(tp.hojaGastosFijos, HOJA_VERTICAL);
    h.columns = [{ width: 5 }, { width: 28 }, { width: 20 }, { width: 12 }, { width: 16 }, { width: 20 }, { width: 18 }];
    encabezado(h, empresa.nombre, tp.tusFijos, periodo, 7);
    filaEncabezadoTabla(h, 6, tp.columnasFijos);
    deFijos.filas.forEach((x, i) => {
      const fila = h.getRow(7 + i);
      const estado = !fijosConEstado ? '—'
        : x.estado === 'pagado' ? tp.pagado
          : x.estado === 'pendiente' ? tp.pendiente : tp.parcial(enPlata(x.falta));
      fila.values = [i + 1, x.nombre, x.categoria, x.dia_del_mes ?? tp.sinDia, x.importe, x.gastadoCategoria, estado];
      fila.height = 18;
      for (let n = 1; n <= 7; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 || n === 3 ? 'left' : n === 1 || n === 4 ? 'center' : 'right' };
        if (n === 5 || n === 6) c.numFmt = fmt;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      }
      if (fijosConEstado) {
        fila.getCell(7).font = { name: 'Calibri', size: 10, bold: true, color: { argb: x.estado === 'pagado' ? VERDE : ROJO } };
      }
    });
    const fT = 7 + deFijos.filas.length;
    // Con todo cubierto dice «Pagado», no «Falta Gs. 0»: un cero que parece deuda.
    const estadoTotal = !fijosConEstado ? '' : deFijos.falta > 0 ? tp.parcial(enPlata(deFijos.falta)) : tp.pagado;
    h.getRow(fT).values = ['', 'TOTAL', '', '', deFijos.total, '', estadoTotal];
    filaTotal(h.getRow(fT), fmt, [5]);
    nota(h, fT + 2, 'B', 'G', fijosConEstado ? tp.reglaFijos : `${tp.fijosSoloPorCiclo} ${tp.reglaFijos}`, 32);
  }

  // ==========================================================
  // AHORRO (si tiene fondos o los movió)
  // ==========================================================
  if (metas.length > 0) {
    const h = libro.addWorksheet(tx.hojaAhorro, HOJA_VERTICAL);
    h.columns = [
      { width: 5 }, { width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 18 },
    ];
    encabezado(h, empresa.nombre, tp.tusMetas, periodo, 8);
    filaEncabezadoTabla(h, 6, tp.columnasMetas);
    metas.forEach((m, i) => {
      const fila = h.getRow(7 + i);
      const fmtFondo = m.moneda ? formatoMoneda(m.moneda) : fmt;
      const falta = m.meta === null ? tp.sinMeta : m.falta === 0 ? tp.metaCumplida : m.falta;
      const porMes = m.meta === null || m.fecha_limite === null ? '—'
        : m.falta === 0 ? tp.metaCumplida
          : m.por_mes === null ? tp.fechaPasada : m.por_mes;
      fila.values = [
        i + 1, m.moneda ? `${m.nombre} (${m.moneda})` : m.nombre, m.guardadoEnPeriodo, m.saldo,
        m.meta ?? '—', m.fecha_limite ? fecha(m.fecha_limite) : '—', falta, porMes,
      ];
      fila.height = 18;
      for (let n = 1; n <= 8; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : n === 1 || n === 6 ? 'center' : 'right' };
        if (n === 3 && typeof c.value === 'number') c.numFmt = fmt;
        if (n >= 4 && n !== 6 && typeof c.value === 'number') c.numFmt = fmtFondo;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      }
      fila.getCell(3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: m.guardadoEnPeriodo >= 0 ? VERDE : ROJO } };
    });
    const fT = 7 + metas.length;
    h.getRow(fT).values = ['', 'TOTAL', ahorro.neto, '', '', '', '', ''];
    filaTotal(h.getRow(fT), fmt, [3]);
    nota(h, fT + 2, 'B', 'H', `${tp.notaMetas} ${tx.avisoSaldoAHoy}`, 40);
  }

  // ==========================================================
  // DEUDAS (si debe o pagó alguna)
  // ==========================================================
  if (deDeudas.filas.length > 0) {
    const h = libro.addWorksheet(tp.hojaDeudas, {
      ...HOJA_VERTICAL, pageSetup: { ...HOJA_VERTICAL.pageSetup, orientation: 'landscape' as const },
    });
    h.columns = [
      { width: 5 }, { width: 24 }, { width: 13 }, { width: 20 }, { width: 16 }, { width: 18 }, { width: 16 },
      { width: 10 }, { width: 14 }, { width: 18 },
    ];
    encabezado(h, empresa.nombre, tp.tusDeudas, periodo, 10);
    filaEncabezadoTabla(h, 6, tp.columnasDeudas);
    deDeudas.filas.forEach((d, i) => {
      const fila = h.getRow(7 + i);
      const vence = d.vence_el ? `${fecha(d.vence_el)}${d.vencida && d.saldo > 0 ? ` (${tp.vencida})` : ''}` : '—';
      fila.values = [
        i + 1, d.nombre, tp.tipoDeuda[d.tipo] ?? d.tipo, d.acreedor || '—', d.monto_original, d.pagadoEnPeriodo, d.saldo,
        d.cuotas_totales ? tp.cuotasDe(d.cuotas_pagadas, d.cuotas_totales) : '—', d.monto_cuota ?? '—', vence,
      ];
      fila.height = 18;
      for (let n = 1; n <= 10; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 || n === 4 ? 'left' : n === 1 || n === 3 || n === 8 || n === 10 ? 'center' : 'right' };
        if (n >= 5 && n <= 9 && n !== 8 && typeof c.value === 'number') c.numFmt = fmt;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      }
      if (d.vencida && d.saldo > 0) fila.getCell(10).font = { name: 'Calibri', size: 10, bold: true, color: { argb: ROJO } };
    });
    let f = 7 + deDeudas.filas.length;
    h.getRow(f).values = ['', 'TOTAL', '', '', '', deDeudas.pagadoEnPeriodo, deDeudas.debesHoy, '', '', ''];
    filaTotal(h.getRow(f), fmt, [6, 7]);

    // Los pagos, uno por uno: «¿cuándo pagué la tarjeta?».
    f += 2;
    h.mergeCells(`B${f}:E${f}`);
    const t = h.getCell(`B${f}`);
    t.value = tp.pagosDelPeriodo;
    t.font = { name: 'Calibri', size: 10, bold: true, color: { argb: TINTA } };
    f += 1;
    filaEncabezadoTabla(h, f, tp.columnasPagos);
    f += 1;
    const pagos = [...pagosDeuda].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    if (pagos.length === 0) {
      h.mergeCells(`B${f}:E${f}`);
      const c = h.getCell(`B${f}`);
      c.value = tp.sinPagos;
      c.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF8A968F' } };
    }
    pagos.forEach((p, i) => {
      const fila = h.getRow(f + i);
      fila.values = [i + 1, fecha(p.fecha), nombreDeuda.get(p.deuda_id) ?? '—', Number(p.monto), p.nota || ''];
      fila.height = 18;
      for (let n = 1; n <= 5; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 4 ? 'right' : n === 1 || n === 2 ? 'center' : 'left' };
        if (n === 4) c.numFmt = fmt;
      }
    });
  }

  // ==========================================================
  // MOVIMIENTOS («Cómo» pasa a ser «Cuenta»: el banco, no la forma de pago)
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaMovimientos, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [{ width: 13 }, { width: 11 }, { width: 42 }, { width: 20 }, { width: 20 }, { width: 18 }, { width: 20 }];
    encabezado(h, empresa.nombre, tx.todoLoQueCargaste, periodo, 7);
    filaEncabezadoTabla(h, 6, tp.columnasMovimientos);

    const ordenados = [...movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    ordenados.forEach((mv, i) => {
      const fila = h.getRow(7 + i);
      const esGasto = mv.tipo === 'gasto';
      const anulado = !esValido(mv);
      fila.values = [
        fecha(mv.fecha), esGasto ? tx.gasto : tx.ingreso, mv.descripcion || '—', mv.categoria,
        mv.cuenta_nombre || '—', (esGasto ? -1 : 1) * Number(mv.monto),
        anulado ? `${tx.anulado}${mv.motivo_anulacion ? ` · ${mv.motivo_anulacion}` : ''}` : tx.valido,
      ];
      fila.height = 18;
      fila.eachCell((c, n) => {
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 6 ? 'right' : n === 3 || n === 7 ? 'left' : 'center' };
        if (n === 6) c.numFmt = fmt;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      });
      fila.getCell(2).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: esGasto ? ROJO : VERDE } };
      fila.getCell(6).font = { name: 'Calibri', size: 10, bold: true, color: { argb: esGasto ? ROJO : VERDE } };
      if (anulado) {
        fila.eachCell((c) => { c.font = { ...(c.font ?? {}), strike: true, color: { argb: 'FF9AA5A0' }, italic: true }; });
        fila.getCell(7).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: ROJO } };
      }
    });
    const fT = 7 + ordenados.length;
    h.getRow(fT).values = ['', '', tx.totalSinAnulados, '', '', teQuedo, ''];
    filaTotal(h.getRow(fT), fmt, [6], [1, 2, 3, 4, 5, 7]);
    if (ordenados.length > 0) h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ordenados.length, column: 7 } };
  }

  // ==========================================================
  // DÍA POR DÍA
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaDiaPorDia, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 5 }];
    encabezado(h, empresa.nombre, tx.comoVinoCadaDia, periodo, 6);
    filaEncabezadoTabla(h, 6, tx.columnasDiasPersona);
    serie.forEach((d, i) => {
      const entroDia = d.ventas + d.otrosIngresos;
      const salioDia = salioDelDia(d);
      const diferencia = entroDia - salioDia;
      const fila = h.getRow(7 + i);
      fila.values = ['', fecha(d.fecha), entroDia, salioDia, diferencia];
      fila.height = 18;
      fila.eachCell((c, n) => {
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
        if (n >= 3) c.numFmt = fmt;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      });
      fila.getCell(5).font = { name: 'Calibri', size: 10, bold: true, color: { argb: diferencia >= 0 ? VERDE : ROJO } };
    });
    const fT = 7 + serie.length;
    h.getRow(fT).values = ['', 'TOTAL', entro, salio, teQuedo];
    filaTotal(h.getRow(fT), fmt, [3, 4, 5]);
  }

  return libro;
}
