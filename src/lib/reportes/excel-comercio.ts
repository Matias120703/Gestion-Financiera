import ExcelJS from 'exceljs';
import { esCategoriaMercaderia, esValido, variacion, type FilaProducto } from '../calculos';
import { fechaLegible, simboloDe } from '../formato';
import {
  BORDE, GRIS, ROJO, TINTA, VERDE, VERDE_SUAVE, bordeFino,
  encabezado, filaEncabezadoTabla, formatoMoneda, textoPeriodo,
} from '../reporte';
import { textosExcel } from '../reporte-textos';
import type { FichaRubro } from '../rubros';
import type { FiadoDelPeriodo, Producto, ResumenFiado, VentasDeVendedor } from '../tipos';
import type { Conversor, DatosBaseLibro, HojaDelLibro } from './comun';
import {
  comprasDeMercaderia, conCosto, deudoresPorAntiguedad, gastosDelComercio, hayVariosVendedores, inventarioConStock,
  quietosEnElEstante, valorAlCosto, vendidosSinCosto,
} from './comercio';
import { textosComercio } from './textos-comercio';

/**
 * EL REPORTE DEL COMERCIO: EL LIBRO DE EXCEL Y LAS CUENTAS QUE COMPARTE CON
 * LA PANTALLA (23/09, contrato 2.1).
 *
 * Es el reporte para el que se pensó el de antes (almacén, despensa,
 * reventa), con lo que le faltaba para contestar lo que el dueño se pregunta
 * a fin de mes: si ganó (con la compra de mercadería contada una sola vez,
 * decisión 2), dónde está la plata (saldo de cada cuenta y el fiado), qué
 * reponer, qué está quieto, quién vende y qué llevarle al contador.
 *
 * Las cuentas chicas que se hacen en JS (qué reponer, qué está quieto, el
 * inventario valuado, qué productos no tienen costo, la lista de gastos sin
 * la mercadería) viven en `comercio.ts` y las usa también
 * `ReporteComercio.tsx`: la pantalla y el archivo no pueden decir dos cosas
 * distintas porque es la misma función. Los números de plata del período
 * vienen de la base (`resumen_financiero` y compañía); acá no se recalcula
 * ninguno.
 *
 * Función pura: no toca red ni base. Solo importa de src/lib por ruta
 * relativa, para compilarse suelta en las pruebas.
 */

// =====================================================================
// LO QUE EL LIBRO LEE APARTE
// =====================================================================

/**
 * Lo que la ruta lee solo para el comercio (en su rama de `libroDeLaVariante`).
 * Todo es de administración, que es la única que baja el Excel.
 *
 * `fiado` y `cuentas` son FOTOS de hoy (`resumen_fiado`, `billetera`): no
 * hay forma de saber el saldo de una cuenta a una fecha pasada, y el libro
 * lo dice. `null` = no se leyó: la parte no sale (nunca un cero).
 */
export interface LecturasComercio {
  fiado: ResumenFiado | null;
  fiadoPeriodo: FiadoDelPeriodo | null;
  cuentas: { nombre: string; saldo: number }[] | null;
  vendedores: VentasDeVendedor[];
}

export interface ExtrasComercio extends LecturasComercio {
  /** `ranking_productos` del período (ya en la moneda de la vista: `x.leido.ranking`). */
  ranking: FilaProducto[];
  /** El catálogo de hoy (`x.leido.productosBd`). */
  productos: Producto[];
  /** El día en que se baja: el de la foto del stock, las cuentas y el fiado. */
  hoy: string;
}

/** Lo leído aparte, en la moneda de la vista (051). Lo que falta sigue faltando. */
export function enLaVistaComercio(l: LecturasComercio, c: Conversor): LecturasComercio {
  if (!c.convierte) return l;
  return {
    fiado: l.fiado && {
      ...l.fiado,
      total: c.x(l.fiado.total),
      clientes: l.fiado.clientes.map((f) => ({ ...f, saldo: c.x(f.saldo) })),
    },
    fiadoPeriodo: l.fiadoPeriodo && {
      otorgado: c.x(l.fiadoPeriodo.otorgado),
      cobrado: c.x(l.fiadoPeriodo.cobrado),
      clientes: l.fiadoPeriodo.clientes.map((f) => ({
        ...f, otorgado: c.x(f.otorgado), cobrado: c.x(f.cobrado), saldo_hoy: c.x(f.saldo_hoy),
      })),
    },
    cuentas: l.cuentas && l.cuentas.map((k) => ({ ...k, saldo: c.x(k.saldo) })),
    vendedores: l.vendedores.map((v) => ({
      ...v, vendido: c.x(v.vendido), ticket_promedio: c.xn(v.ticket_promedio), monto_anulado: c.x(v.monto_anulado),
    })),
  };
}

// =====================================================================
// LAS HOJAS QUE TRAE, PARA LA TARJETA DE DESCARGA
// =====================================================================

/**
 * El orden y los nombres de `libroComercio`. Las que dependen de lo que
 * haya (stock, fiado, más de un vendedor) van con `siHay`. La prueba arma el
 * libro y compara con esta lista, en los dos idiomas.
 */
export function hojasComercio(ficha: Pick<FichaRubro, 'clave'> | null, idioma?: string): HojaDelLibro[] {
  void ficha;
  const tx = textosExcel(idioma);
  const tc = textosComercio(idioma);
  return [
    { nombre: tx.hojaResumen },
    { nombre: tx.hojaProductos },
    { nombre: tc.hojaInventario, siHay: true },
    { nombre: tc.hojaFiado, siHay: true },
    { nombre: tx.hojaMovimientos },
    { nombre: tx.hojaGastos },
    { nombre: tx.hojaDiaPorDia },
    { nombre: tc.hojaVendedores, siHay: true },
    { nombre: tc.hojaContador },
  ];
}

// =====================================================================
// EL LIBRO
// =====================================================================

const GRIS_TEXTO = 'FF6B7C75';
const GRIS_NOTA = 'FF8A968F';
const GRIS_VACIO = 'FF9AA5A0';
const AMBAR = 'FFB7791F';

export function libroComercio(datos: DatosBaseLibro & ExtrasComercio): ExcelJS.Workbook {
  const {
    empresa, desde, hasta, idioma, resumen: r, resumenPrevio: rp, previo, categorias, serie, movimientos,
    ranking, productos, fiado, fiadoPeriodo, cuentas, vendedores, hoy,
  } = datos;
  const tx = textosExcel(idioma);
  const tc = textosComercio(idioma);
  const moneda = empresa.moneda;
  const fmt = formatoMoneda(moneda);
  const fmtPorc = '0.0"%"';
  const fmtNum = '#,##0.##';
  const periodo = textoPeriodo(desde, hasta, empresa, tx);
  const fecha = (iso: string) => fechaLegible(iso, true, tx.locale);
  const plata = (n: number) => `${simboloDe(moneda)} ${Math.round(n).toLocaleString(tx.locale)}`;
  const hoyTexto = fecha(hoy);

  const aparte = r.mercaderiaAparte;
  const { lista: gastosLista, mercaderia } = gastosDelComercio(categorias, r);
  const sinCosto = vendidosSinCosto(ranking);
  const inventario = inventarioConStock(productos);
  const valorInventario = valorAlCosto(inventario);
  const porId = new Map(productos.map((p) => [p.id, p]));
  // Sin nadie que deba y sin fiado en el período, no hay hoja ni bloque: el
  // negocio no fía, y una tabla de ceros lo diría peor que no decir nada.
  const hayFiado = (!!fiado && fiado.clientes.some((c) => c.saldo > 0))
    || (!!fiadoPeriodo && fiadoPeriodo.clientes.length > 0);

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Orden';
  libro.created = new Date();

  const celdaTexto = (c: ExcelJS.Cell, color = TINTA, negrita = false, tamano = 10) => {
    c.font = { name: 'Calibri', size: tamano, bold: negrita, color: { argb: color } };
  };
  const filaTotal = (fila: ExcelJS.Row, formatos: Record<number, string>, izquierda = 2) => {
    fila.height = 22;
    fila.eachCell((c, n) => {
      c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: n <= izquierda ? 'left' : 'right' };
      if (formatos[n]) c.numFmt = formatos[n];
    });
  };
  const titulito = (h: ExcelJS.Worksheet, f: number, texto: string, hasta = 'F') => {
    h.mergeCells(`B${f}:${hasta}${f}`);
    const c = h.getCell(`B${f}`);
    c.value = texto;
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS_TEXTO } };
    c.alignment = { vertical: 'middle' };
    h.getRow(f).height = 20;
  };
  const notaAl = (h: ExcelJS.Worksheet, f: number, texto: string, hasta = 'F') => {
    h.mergeCells(`B${f}:${hasta}${f}`);
    const c = h.getCell(`B${f}`);
    c.value = texto;
    c.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: GRIS_NOTA } };
    c.alignment = { vertical: 'middle', wrapText: true };
    h.getRow(f).height = 30;
  };
  const cebra = (c: ExcelJS.Cell, i: number) => {
    if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
  };

  // ==========================================================
  // RESUMEN · con la columna «Antes» y la caja
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaResumen, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [{ width: 4 }, { width: 38 }, { width: 18 }, { width: 18 }, { width: 11 }, { width: 34 }];
    encabezado(h, empresa.nombre, tx.resumenEjecutivo, periodo, 6);

    let f = 6;
    const antesTexto = previo.desde === previo.hasta
      ? fecha(previo.desde)
      : `${fecha(previo.desde)} – ${fecha(previo.hasta)}`;
    {
      const fila = h.getRow(f);
      tc.columnasResumen(antesTexto).forEach((t, i) => {
        const c = fila.getCell(i + 2);
        c.value = t || null;
        c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS_TEXTO } };
        c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right', wrapText: true };
      });
      fila.height = 28;
      f += 1;
    }

    const bloque = (titulo: string) => {
      h.mergeCells(`B${f}:F${f}`);
      const c = h.getCell(`B${f}`);
      c.value = titulo.toUpperCase();
      c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS_TEXTO } };
      c.alignment = { vertical: 'middle' };
      h.getRow(f).height = 20;
      f += 1;
    };

    /**
     * Una línea: el número del período y, si se pasa `antes`, el del período
     * anterior y el cambio. Sin `antes` (una foto de hoy, un conteo que no
     * se leyó para el anterior) esas celdas quedan vacías: no hay con qué
     * comparar, y un cero diría que lo hubo.
     */
    const linea = (etiqueta: string, valor: number, o?: {
      antes?: number; formato?: string; fuerte?: boolean; color?: string; nota?: string; subirEsBueno?: boolean;
    }) => {
      const fila = h.getRow(f);
      const [a, b, c, d, e] = [2, 3, 4, 5, 6].map((n) => fila.getCell(n));
      a.value = etiqueta;
      a.font = { name: 'Calibri', size: 11, bold: !!o?.fuerte, color: { argb: TINTA } };
      b.value = valor;
      b.numFmt = o?.formato ?? fmt;
      b.font = { name: 'Calibri', size: 11, bold: !!o?.fuerte, color: { argb: o?.color ?? TINTA } };
      b.alignment = { vertical: 'middle', horizontal: 'right' };
      if (o?.antes !== undefined) {
        c.value = o.antes;
        c.numFmt = o?.formato ?? fmt;
        c.font = { name: 'Calibri', size: 10.5, color: { argb: GRIS_TEXTO } };
        c.alignment = { vertical: 'middle', horizontal: 'right' };
        const v = !valor && !o.antes ? undefined : variacion(valor, o.antes);
        if (v === null) {
          d.value = tc.antesNada;
          d.font = { name: 'Calibri', size: 9, italic: true, color: { argb: GRIS_NOTA } };
        } else if (typeof v === 'number') {
          // Como porcentaje de Excel (0,25 = 25 %): se puede ordenar y sumar.
          d.value = Math.round(v * 10) / 1000;
          d.numFmt = '+0%;-0%;0%';
          const bueno = v === 0 || (v > 0) === (o.subirEsBueno ?? true);
          d.font = { name: 'Calibri', size: 10, bold: true, color: { argb: bueno ? VERDE : ROJO } };
        }
        d.alignment = { vertical: 'middle', horizontal: 'right' };
      }
      if (o?.nota) {
        e.value = o.nota;
        e.font = { name: 'Calibri', size: 9, italic: true, color: { argb: GRIS_NOTA } };
        e.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
      }
      [a, b, c, d, e].forEach((x) => { x.border = bordeFino; });
      a.alignment = { vertical: 'middle' };
      fila.height = 20;
      f += 1;
    };

    bloque(tx.entroPlata);
    linea(tx.ventasPrecioLista, r.ventasBrutas, { antes: rp.ventasBrutas, nota: tx.operaciones(r.cantidadVentas) });
    if (r.descuentos > 0 || rp.descuentos > 0) {
      linea(tx.descuentosOtorgados, -r.descuentos, { antes: -rp.descuentos, color: ROJO });
    }
    linea(tx.ventasCobradas, r.ventas, { antes: rp.ventas, fuerte: true });
    linea(tx.otrosIngresos, r.otrosIngresos, { antes: rp.otrosIngresos });
    linea(tx.totalQueEntro, r.ingresosTotales, { antes: rp.ingresosTotales, fuerte: true, color: VERDE });
    f += 1;

    bloque(tx.costosYGastos);
    linea(tx.costoMercaderia, r.costoMercaderia, { antes: rp.costoMercaderia, color: ROJO, subirEsBueno: false });
    linea(aparte ? tc.gastosSinMercaderia : tx.gastosOperativos, r.gastos, {
      antes: rp.gastos, color: ROJO, subirEsBueno: false,
    });
    linea(tx.totalQueSalio, r.costoMercaderia + r.gastos, {
      antes: rp.costoMercaderia + rp.gastos, fuerte: true, color: ROJO, subirEsBueno: false,
    });
    f += 1;

    bloque(tx.resultado);
    linea(tx.gananciaBruta, r.gananciaBruta, {
      antes: rp.gananciaBruta, fuerte: true, nota: tx.margen(r.margenBruto.toFixed(1)),
    });
    linea(tx.gananciaNeta, r.gananciaNeta, {
      antes: rp.gananciaNeta, fuerte: true, color: r.gananciaNeta >= 0 ? VERDE : ROJO,
      nota: tx.margen(r.margenNeto.toFixed(1)),
    });
    f += 1;

    // La compra de mercadería, aparte o dentro de los gastos: se dice cuál.
    if (r.comprasMercaderia > 0 || rp.comprasMercaderia > 0) {
      bloque(tc.mercaderiaTitulo);
      linea(tc.comprasMercaderia, r.comprasMercaderia, {
        antes: rp.comprasMercaderia, subirEsBueno: false,
        nota: aparte ? tc.mercaderiaAparteNota : tc.mercaderiaRestaNota,
      });
      f += 1;
    }

    // La caja: fotos de hoy. Sin columna «Antes»: no hay saldo a una fecha pasada.
    if (cuentas && cuentas.length > 0) {
      bloque(tc.cajaTitulo(hoyTexto));
      for (const k of cuentas) linea(k.nombre, k.saldo, { color: k.saldo < 0 ? ROJO : TINTA });
      linea(tc.totalEnCuentas, cuentas.reduce((s, k) => s + k.saldo, 0), { fuerte: true, nota: tc.fotoDeHoy });
      f += 1;
    }
    if (hayFiado) {
      bloque(tc.fiadoTitulo);
      if (fiadoPeriodo) {
        linea(tc.fiadoOtorgado, fiadoPeriodo.otorgado);
        linea(tc.fiadoCobrado, fiadoPeriodo.cobrado);
      }
      if (fiado) {
        linea(tc.teDebenHoy, fiado.total, { fuerte: true, nota: `${tc.clientes(fiado.cuantos)} · ${tc.fotoDeHoy}` });
      }
      f += 1;
    }

    bloque(tx.indicadores);
    linea(tc.cantidadVentas, r.cantidadVentas, { antes: rp.cantidadVentas, formato: '#,##0' });
    linea(tx.ticketPromedio, r.ticketPromedio, { antes: rp.ticketPromedio });
    linea(tx.unidadesVendidas, r.unidadesVendidas, { antes: rp.unidadesVendidas, formato: fmtNum });
    linea(tx.productosDistintos, ranking.length, { formato: '#,##0' });
    linea(tx.promedioVentasDia, serie.length ? r.ventas / serie.length : 0);
    if (r.ventasAnuladas > 0) {
      linea(tx.ventasAnuladas, r.ventasAnuladas, { formato: '#,##0', nota: tx.noSumanEnNingunTotal });
      linea(tx.montoVentasAnuladas, r.montoVentasAnuladas, { color: ROJO });
    }
    f += 2;

    h.mergeCells(`B${f}:F${f}`);
    const dc = h.getCell(`B${f}`);
    dc.value = tx.paraTenerEnCuenta;
    dc.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS_TEXTO } };
    f += 1;
    const nota = (texto: string, aviso = false) => {
      h.mergeCells(`B${f}:F${f}`);
      const c = h.getCell(`B${f}`);
      c.value = texto;
      c.font = { name: 'Calibri', size: 10, color: { argb: aviso ? AMBAR : TINTA }, bold: aviso };
      c.alignment = { vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } };
      h.getRow(f).height = texto.length > 90 ? 32 : 20;
      f += 1;
    };

    if (sinCosto.length > 0) nota(tc.sinCostoAviso(sinCosto.length), true);
    if (r.comprasMercaderia > 0) {
      nota(aparte ? tc.mercaderiaAparte(plata(r.comprasMercaderia)) : tc.mercaderiaResta(plata(r.comprasMercaderia)));
    }
    if ((r.comprasMercaderia > 0 || rp.comprasMercaderia > 0) && r.mercaderiaAparte !== rp.mercaderiaAparte) {
      nota(tc.reglaDistintaAntes);
    }
    const mejor = ranking[0];
    if (mejor) {
      const detalleGanancia = mejor.ganancia === null ? '' : tx.conGanancia(plata(mejor.ganancia));
      nota(tx.loQueMasDejo(mejor.nombre, mejor.unidades.toLocaleString(tx.locale)) + detalleGanancia);
    }
    // El gasto más grande, sin la compra de mercadería cuando no es gasto.
    const mayorGasto = movimientos
      .filter((m) => m.tipo === 'gasto' && esValido(m) && !(aparte && esCategoriaMercaderia(m.categoria)))
      .sort((a, b) => Number(b.monto) - Number(a.monto))[0];
    if (mayorGasto) nota(tx.gastoMasGrande(mayorGasto.descripcion || tx.sinDescripcion, plata(Number(mayorGasto.monto))));
    if (r.gananciaNeta < 0) nota(tx.gastasteMasQueGanaste);
    if (r.descuentos > 0) {
      const pct = r.ventasBrutas > 0 ? (r.descuentos / r.ventasBrutas) * 100 : 0;
      nota(tx.disteDescuentos(plata(r.descuentos), pct.toFixed(1)));
    }
    if (r.movimientosAnulados > 0) nota(tx.seAnularon(r.movimientosAnulados, r.ventasAnuladas));
    if (r.cantidadVentas === 0) nota(tx.sinVentas);
  }

  // ==========================================================
  // PRODUCTOS · + stock de hoy, mínimo, ¿reponer? y el aviso de sin costo
  // ==========================================================
  {
    const cols = 14;
    const h = libro.addWorksheet(tx.hojaProductos, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [
      { width: 5 }, { width: 32 }, { width: 11 }, { width: 15 }, { width: 14 },
      { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 13 },
      { width: 11 }, { width: 10 }, { width: 11 }, { width: 24 },
    ];
    encabezado(h, empresa.nombre, tx.productosVendidos, periodo, cols);
    filaEncabezadoTabla(h, 6, [...tx.columnasProductos, ...tc.columnasProductosExtra]);

    const sinCostoIds = new Set(sinCosto.map((p) => p.producto_id ?? p.nombre));
    ranking.forEach((p, i) => {
      const fila = h.getRow(7 + i);
      const prod = p.producto_id ? porId.get(p.producto_id) : undefined;
      const conStock = !!prod && prod.controla_stock;
      const reponer = conStock && Number(prod!.stock) <= Number(prod!.stock_minimo);
      const avisoSinCosto = sinCostoIds.has(p.producto_id ?? p.nombre);
      // Lo que falta queda vacío, nunca en cero: ver `quizas` en reporte.ts.
      fila.values = [
        i + 1, p.nombre, p.unidades, p.ingresosBrutos, -p.descuento, p.ingresos,
        p.costo ?? null, p.ganancia ?? null, p.margen ?? null, p.participacion,
        conStock ? Number(prod!.stock) : null, conStock ? Number(prod!.stock_minimo) : null,
        reponer ? tc.si : null, avisoSinCosto ? tc.sinCostoCelda : null,
      ];
      fila.height = 18;
      for (let n = 1; n <= cols; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 || n === 14 ? 'left' : n === 1 || n === 13 ? 'center' : 'right' };
        if (n >= 4 && n <= 8) c.numFmt = fmt;
        if (n === 3 || n === 11 || n === 12) c.numFmt = fmtNum;
        if (n === 9 || n === 10) c.numFmt = fmtPorc;
        cebra(c, i);
      }
      fila.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
      fila.getCell(8).font = {
        name: 'Calibri', size: 10, bold: true,
        color: { argb: p.ganancia === null ? GRIS_VACIO : p.ganancia >= 0 ? VERDE : ROJO },
      };
      if (reponer) celdaTexto(fila.getCell(13), ROJO, true);
      if (avisoSinCosto) {
        celdaTexto(fila.getCell(14), AMBAR, true, 9.5);
        celdaTexto(fila.getCell(9), AMBAR, true);
      }
      if (i < 3) fila.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: VERDE } };
    });

    const fTotal = 7 + ranking.length;
    const total = h.getRow(fTotal);
    total.values = [
      '', 'TOTAL',
      ranking.reduce((s, p) => s + p.unidades, 0),
      ranking.reduce((s, p) => s + p.ingresosBrutos, 0),
      -ranking.reduce((s, p) => s + p.descuento, 0),
      ranking.reduce((s, p) => s + p.ingresos, 0),
      ranking.every((p) => p.costo !== null) ? ranking.reduce((s, p) => s + (p.costo ?? 0), 0) : null,
      ranking.every((p) => p.ganancia !== null) ? ranking.reduce((s, p) => s + (p.ganancia ?? 0), 0) : null,
      r.margenBruto, 100,
    ];
    filaTotal(total, { 3: fmtNum, 4: fmt, 5: fmt, 6: fmt, 7: fmt, 8: fmt, 9: fmtPorc, 10: fmtPorc });
    if (ranking.length > 0) {
      h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ranking.length, column: cols } };
    }

    let f = fTotal + 2;
    notaAl(h, f, tc.stockEsDeHoy(hoyTexto), 'N');
    f += 2;

    // Quieto en el estante: tiene stock de verdad y no se vendió.
    const quietos = quietosEnElEstante(productos, ranking);
    if (quietos.length > 0) {
      titulito(h, f, tx.noSeVendieron(quietos.length), 'G');
      f += 1;
      filaEncabezadoTabla(h, f, tx.columnasQuietos);
      quietos.forEach((p, i) => {
        const fila = h.getRow(f + 1 + i);
        const costo = conCosto(p) ? Number(p.costo) : null;
        fila.values = ['', p.nombre, Number(p.stock), Number(p.precio), costo, costo === null ? null : Number(p.stock) * costo];
        fila.eachCell((c, n) => {
          c.font = { name: 'Calibri', size: 10 };
          c.border = bordeFino;
          c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
          if (n >= 4) c.numFmt = fmt;
          if (n === 3) c.numFmt = fmtNum;
        });
      });
    }
  }

  // ==========================================================
  // INVENTARIO VALUADO · al día de descarga (solo si hay stock)
  // ==========================================================
  if (inventario.length > 0) {
    const h = libro.addWorksheet(tc.hojaInventario, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 34 }, { width: 18 }, { width: 11 }, { width: 16 }, { width: 18 }];
    encabezado(h, empresa.nombre, tc.inventarioTitulo(hoyTexto.toUpperCase()), periodo, 6);
    filaEncabezadoTabla(h, 6, tc.columnasInventario);
    inventario.forEach((p, i) => {
      const fila = h.getRow(7 + i);
      const costo = conCosto(p) ? Number(p.costo) : null;
      fila.values = [i + 1, p.nombre, p.categoria || '', Number(p.stock), costo, costo === null ? null : Number(p.stock) * costo];
      fila.height = 18;
      for (let n = 1; n <= 6; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 || n === 3 ? 'left' : n === 1 ? 'center' : 'right' };
        if (n >= 5) c.numFmt = fmt;
        if (n === 4) c.numFmt = fmtNum;
        cebra(c, i);
      }
      fila.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
    });
    const fTotal = 7 + inventario.length;
    const total = h.getRow(fTotal);
    total.values = ['', 'TOTAL', '', inventario.reduce((s, p) => s + Number(p.stock), 0), '', valorInventario.total];
    filaTotal(total, { 4: fmtNum, 6: fmt }, 3);
    let f = fTotal + 2;
    notaAl(h, f, tc.inventarioNota);
    if (valorInventario.sinCosto > 0) {
      f += 1;
      notaAl(h, f, tc.inventarioSinCosto(valorInventario.sinCosto));
    }
  }

  // ==========================================================
  // FIADO · quién debe hoy (foto) y lo fiado y cobrado en el período
  // ==========================================================
  if (hayFiado) {
    const h = libro.addWorksheet(tc.hojaFiado, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 32 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 5 }];
    encabezado(h, empresa.nombre, tc.hojaFiado.toUpperCase(), periodo, 6);

    let f = 6;
    titulito(h, f, tc.fiadoHoyTitulo(hoyTexto.toUpperCase()));
    f += 1;
    const deudores = fiado ? deudoresPorAntiguedad(fiado) : [];
    if (deudores.length === 0) {
      notaAl(h, f, tc.nadieDebe);
      f += 2;
    } else {
      filaEncabezadoTabla(h, f, tc.columnasFiadoHoy);
      f += 1;
      deudores.forEach((d, i) => {
        const fila = h.getRow(f);
        fila.values = [i + 1, d.nombre, d.saldo, d.desde ? fecha(d.desde) : null, d.dias];
        for (let n = 1; n <= 5; n++) {
          const c = fila.getCell(n);
          c.font = { name: 'Calibri', size: 10 };
          c.border = bordeFino;
          c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : n === 1 ? 'center' : 'right' };
          if (n === 3) c.numFmt = fmt;
          if (n === 5) c.numFmt = '#,##0';
          cebra(c, i);
        }
        fila.getCell(3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: ROJO } };
        f += 1;
      });
      h.getRow(f).values = ['', 'TOTAL', deudores.reduce((s, d) => s + d.saldo, 0)];
      filaTotal(h.getRow(f), { 3: fmt });
      f += 3;
    }

    titulito(h, f, tc.fiadoPeriodoTitulo);
    f += 1;
    const delPeriodo = fiadoPeriodo?.clientes ?? [];
    if (delPeriodo.length === 0) {
      notaAl(h, f, tc.sinFiadoPeriodo);
    } else {
      filaEncabezadoTabla(h, f, tc.columnasFiadoPeriodo);
      f += 1;
      delPeriodo.forEach((d, i) => {
        const fila = h.getRow(f);
        fila.values = [i + 1, d.nombre, d.otorgado, d.cobrado, d.saldo_hoy];
        for (let n = 1; n <= 5; n++) {
          const c = fila.getCell(n);
          c.font = { name: 'Calibri', size: 10 };
          c.border = bordeFino;
          c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : n === 1 ? 'center' : 'right' };
          if (n >= 3) c.numFmt = fmt;
          cebra(c, i);
        }
        f += 1;
      });
      // El saldo de hoy no se suma: es de siempre, no del período.
      h.getRow(f).values = ['', 'TOTAL', fiadoPeriodo!.otorgado, fiadoPeriodo!.cobrado, null];
      filaTotal(h.getRow(f), { 3: fmt, 4: fmt });
    }
  }

  // ==========================================================
  // MOVIMIENTOS · las columnas de siempre + Cliente, Cuenta y quién lo cargó
  // ==========================================================
  {
    const extra = tc.columnasMovimientosExtra;
    const cols = tx.columnasMovimientos.length + extra.length;
    const h = libro.addWorksheet(tx.hojaMovimientos, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    // Las columnas nuevas van al final: las de siempre quedan en su lugar
    // para quien ya tiene fórmulas armadas sobre ellas.
    h.columns = [
      { width: 12 }, { width: 11 }, { width: 36 }, { width: 16 }, { width: 14 },
      { width: 15 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 17 },
      { width: 22 }, { width: 18 }, { width: 18 },
    ];
    encabezado(h, empresa.nombre, tx.detalleMovimientos, periodo, cols);
    filaEncabezadoTabla(h, 6, [...tx.columnasMovimientos, ...extra]);

    const ordenados = [...movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    let hayMercaderiaAparte = false;
    ordenados.forEach((mv, i) => {
      const fila = h.getRow(7 + i);
      const esGasto = mv.tipo === 'gasto';
      const anulado = !esValido(mv);
      const signo = esGasto ? -1 : 1;
      // La compra de mercadería que va aparte no tiene ganancia: no resta.
      const mercAparte = esGasto && aparte && esCategoriaMercaderia(mv.categoria);
      if (mercAparte && !anulado) hayMercaderiaAparte = true;
      const ganancia = mercAparte ? null : mv.tipo === 'venta'
        ? Number(mv.monto) - Number(mv.costo_total ?? 0)
        : signo * Number(mv.monto);

      fila.values = [
        fecha(mv.fecha),
        mv.tipo === 'venta' ? tx.venta : esGasto ? tx.gasto : tx.ingreso,
        mv.descripcion || '—',
        mv.categoria,
        mv.metodo_pago,
        signo * Number(mv.subtotal ?? mv.monto),
        -Number(mv.descuento ?? 0),
        signo * Number(mv.monto),
        Number(mv.costo_total ?? 0),
        ganancia,
        anulado ? `${tx.anulada}${mv.motivo_anulacion ? ` · ${mv.motivo_anulacion}` : ''}` : tx.valida,
        mv.cliente_nombre || mv.contraparte || null,
        mv.cuenta_nombre || null,
        mv.creado_por_nombre || null,
      ];
      fila.height = 18;
      for (let n = 1; n <= cols; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n >= 6 && n <= 10 ? 'right' : n === 3 || n >= 11 ? 'left' : 'center' };
        if (n >= 6 && n <= 10) c.numFmt = fmt;
        cebra(c, i);
      }
      fila.getCell(2).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: esGasto ? ROJO : VERDE } };
      if (ganancia !== null) {
        fila.getCell(10).font = { name: 'Calibri', size: 10, bold: true, color: { argb: ganancia >= 0 ? VERDE : ROJO } };
      }
      if (anulado) {
        for (let n = 1; n <= cols; n++) {
          const c = fila.getCell(n);
          c.font = { ...(c.font ?? {}), strike: true, color: { argb: GRIS_VACIO }, italic: true };
        }
        fila.getCell(11).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: ROJO } };
      }
    });

    // Los totales salen del resumen (ya sin anuladas) y suman lo mismo que
    // las filas: la compra de mercadería que va aparte sí resta de la plata
    // (columnas Subtotal y Cobrado) pero no de la ganancia.
    const mercEnFilas = aparte ? r.comprasMercaderia : 0;
    const fTotal = 7 + ordenados.length;
    const total = h.getRow(fTotal);
    total.values = [
      '', '', tx.totalSinAnuladas, '', '',
      r.ventasBrutas + r.otrosIngresos - r.gastos - mercEnFilas,
      -r.descuentos,
      r.ingresosTotales - r.gastos - mercEnFilas,
      r.costoMercaderia,
      r.gananciaNeta,
      '', '', '', '',
    ];
    filaTotal(total, { 6: fmt, 7: fmt, 8: fmt, 9: fmt, 10: fmt }, 5);
    if (ordenados.length > 0) {
      h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ordenados.length, column: cols } };
    }
    if (hayMercaderiaAparte) notaAl(h, fTotal + 2, tc.movimientosMercaderia, 'J');
  }

  // ==========================================================
  // GASTOS · sin la mercadería cuando va aparte, y la mercadería abajo
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaGastos, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 32 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 5 }];
    encabezado(h, empresa.nombre, tx.enQueSeFueLaPlata, periodo, 6);
    filaEncabezadoTabla(h, 6, tx.columnasGastos);

    gastosLista.forEach((c, i) => {
      const fila = h.getRow(7 + i);
      fila.values = [i + 1, c.nombre, c.monto, c.operaciones, c.participacion];
      fila.height = 18;
      fila.eachCell((cell, n) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = bordeFino;
        cell.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : n === 1 ? 'center' : 'right' };
        if (n === 3) cell.numFmt = fmt;
        if (n === 4) cell.numFmt = '#,##0';
        if (n === 5) cell.numFmt = fmtPorc;
        cebra(cell, i);
      });
      fila.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
      fila.getCell(3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: ROJO } };
    });
    const fTotal = 7 + gastosLista.length;
    const total = h.getRow(fTotal);
    total.values = ['', 'TOTAL', r.gastos, gastosLista.reduce((s, c) => s + c.operaciones, 0), 100];
    filaTotal(total, { 3: fmt, 4: '#,##0', 5: fmtPorc });

    if (aparte && mercaderia) {
      let f = fTotal + 3;
      titulito(h, f, tc.gastosAparteTitulo, 'E');
      f += 1;
      filaEncabezadoTabla(h, f, tc.columnasMercaderia);
      f += 1;
      const fila = h.getRow(f);
      fila.values = ['', tc.contadorMercaderia, r.comprasMercaderia, mercaderia.operaciones];
      fila.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
      fila.getCell(3).numFmt = fmt;
      fila.getCell(3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: TINTA } };
      fila.getCell(4).numFmt = '#,##0';
      [2, 3, 4].forEach((n) => { fila.getCell(n).border = bordeFino; });
      f += 2;
      notaAl(h, f, tc.mercaderiaAparte(plata(r.comprasMercaderia)), 'E');

      // Cada compra con su descripción (la misma lista que la pantalla): un
      // gasto de luz que quedó en «Mercadería» acá no resta, y así se ve.
      const compras = comprasDeMercaderia(movimientos);
      if (compras.length > 0) {
        f += 2;
        titulito(h, f, tc.comprasTitulo, 'E');
        f += 1;
        filaEncabezadoTabla(h, f, tc.columnasCompras);
        compras.forEach((c, i) => {
          f += 1;
          const fc = h.getRow(f);
          fc.values = [i + 1, c.descripcion?.trim() || tc.sinDescripcion, Number(c.monto), fecha(c.fecha)];
          fc.height = 18;
          fc.eachCell((cell, n) => {
            cell.font = { name: 'Calibri', size: 10 };
            cell.border = bordeFino;
            cell.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : n === 1 ? 'center' : 'right' };
            if (n === 3) cell.numFmt = fmt;
            cebra(cell, i);
          });
        });
        f += 2;
        notaAl(h, f, tc.revisarCompras, 'E');
      }
    }
  }

  // ==========================================================
  // DÍA POR DÍA · con la compra de mercadería aparte cuando corresponde
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaDiaPorDia, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    // La columna de la mercadería solo cuando va aparte: si resta, ya está
    // adentro de «Gastado» y mostrarla otra vez invitaría a restarla dos veces.
    const conMerc = aparte;
    const titulos = conMerc
      ? [...tx.columnasDias.slice(0, 4), tc.columnaComprasDia, tx.columnasDias[4]]
      : tx.columnasDias;
    const cols = titulos.length;
    h.columns = conMerc
      ? [{ width: 5 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 18 }]
      : [{ width: 5 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 5 }];
    encabezado(h, empresa.nombre, tx.resultadoDeCadaDia, periodo, 6);
    filaEncabezadoTabla(h, 6, titulos);
    const colGanancia = cols;

    serie.forEach((d, i) => {
      const fila = h.getRow(7 + i);
      fila.values = conMerc
        ? ['', fecha(d.fecha), d.ventas, d.gastos, d.comprasMercaderia, d.ganancia ?? null]
        : ['', fecha(d.fecha), d.ventas, d.gastos, d.ganancia ?? null];
      fila.height = 18;
      for (let n = 1; n <= cols; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
        if (n >= 3) c.numFmt = fmt;
        cebra(c, i);
      }
      fila.getCell(colGanancia).font = {
        name: 'Calibri', size: 10, bold: true,
        color: { argb: d.ganancia === null ? GRIS_VACIO : d.ganancia >= 0 ? VERDE : ROJO },
      };
    });
    const total = h.getRow(7 + serie.length);
    total.values = conMerc
      ? ['', 'TOTAL', r.ventas, r.gastos, r.comprasMercaderia, r.gananciaNeta]
      : ['', 'TOTAL', r.ventas, r.gastos, r.gananciaNeta];
    filaTotal(total, { 3: fmt, 4: fmt, 5: fmt, 6: fmt });
  }

  // ==========================================================
  // VENDEDORES · solo con dos o más personas cargando ventas
  // ==========================================================
  if (hayVariosVendedores(vendedores)) {
    const h = libro.addWorksheet(tc.hojaVendedores, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 32 }, { width: 18 }, { width: 10 }, { width: 16 }, { width: 11 }, { width: 16 }];
    encabezado(h, empresa.nombre, tc.vendedoresTitulo, periodo, 7);
    filaEncabezadoTabla(h, 6, tc.columnasVendedores);
    vendedores.forEach((v, i) => {
      const fila = h.getRow(7 + i);
      const nombre = v.nombre
        ? `${v.nombre}${v.rol && tc.roles[v.rol] ? ` · ${tc.roles[v.rol]}` : ''}`
        : tc.sinNombre;
      fila.values = [i + 1, nombre, v.vendido, v.cantidad, v.ticket_promedio, v.anuladas, v.monto_anulado];
      for (let n = 1; n <= 7; n++) {
        const c = fila.getCell(n);
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : n === 1 ? 'center' : 'right' };
        if (n === 3 || n === 5 || n === 7) c.numFmt = fmt;
        if (n === 4 || n === 6) c.numFmt = '#,##0';
        cebra(c, i);
      }
      fila.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
      if (v.anuladas > 0) fila.getCell(6).font = { name: 'Calibri', size: 10, bold: true, color: { argb: ROJO } };
    });
    const total = h.getRow(7 + vendedores.length);
    const vendido = vendedores.reduce((s, v) => s + v.vendido, 0);
    const cantidad = vendedores.reduce((s, v) => s + v.cantidad, 0);
    total.values = [
      '', 'TOTAL', vendido, cantidad, cantidad > 0 ? vendido / cantidad : null,
      vendedores.reduce((s, v) => s + v.anuladas, 0), vendedores.reduce((s, v) => s + v.monto_anulado, 0),
    ];
    filaTotal(total, { 3: fmt, 4: '#,##0', 5: fmt, 6: '#,##0', 7: fmt });
  }

  // ==========================================================
  // PARA TU CONTADOR · lo que te pide, dicho sin vueltas
  // ==========================================================
  {
    const h = libro.addWorksheet(tc.hojaContador, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [{ width: 4 }, { width: 44 }, { width: 20 }, { width: 14 }, { width: 4 }];
    encabezado(h, empresa.nombre, tc.contadorTitulo, periodo, 5);

    let f = 6;
    const bloque = (titulo: string) => {
      h.mergeCells(`B${f}:D${f}`);
      const c = h.getCell(`B${f}`);
      c.value = titulo.toUpperCase();
      c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS_TEXTO } };
      h.getRow(f).height = 20;
      f += 1;
    };
    const linea = (etiqueta: string, valor: number | null, o?: { formato?: string; fuerte?: boolean; cantidad?: number }) => {
      const fila = h.getRow(f);
      fila.getCell(2).value = etiqueta;
      fila.getCell(2).font = { name: 'Calibri', size: 10.5, bold: !!o?.fuerte };
      fila.getCell(3).value = valor;
      fila.getCell(3).numFmt = o?.formato ?? fmt;
      fila.getCell(3).font = { name: 'Calibri', size: 10.5, bold: !!o?.fuerte };
      fila.getCell(3).alignment = { horizontal: 'right' };
      if (o?.cantidad !== undefined) {
        fila.getCell(4).value = o.cantidad;
        fila.getCell(4).numFmt = '#,##0';
        fila.getCell(4).font = { name: 'Calibri', size: 9.5, color: { argb: GRIS_NOTA } };
      }
      [2, 3, 4].forEach((n) => { fila.getCell(n).border = { bottom: { style: 'thin', color: { argb: BORDE } } }; });
      fila.height = 19;
      f += 1;
    };

    bloque(tc.contadorVentas);
    linea(tx.ventasPrecioLista, r.ventasBrutas);
    if (r.descuentos > 0) linea(tx.descuentosOtorgados, -r.descuentos);
    linea(tx.ventasCobradas, r.ventas, { fuerte: true, cantidad: r.cantidadVentas });
    linea(tx.otrosIngresos, r.otrosIngresos);
    f += 1;

    // Todas las categorías menos la mercadería, que va en su propia línea:
    // al contador le importa separar compras de gastos, se reste o no de la
    // ganancia en Orden.
    const categoriasContador = categorias.filter((c) => !esCategoriaMercaderia(c.nombre));
    bloque(tc.contadorGastos);
    if (categoriasContador.length === 0) {
      notaAl(h, f, tc.sinCategorias, 'D');
      f += 1;
    } else {
      for (const c of categoriasContador) linea(c.nombre, c.monto, { cantidad: c.operaciones });
      linea(tc.totalGastos, categoriasContador.reduce((s, c) => s + c.monto, 0), {
        fuerte: true, cantidad: categoriasContador.reduce((s, c) => s + c.operaciones, 0),
      });
    }
    if (r.pagadoAProfesionales > 0) linea(tc.pagadoProfesionales, r.pagadoAProfesionales);
    f += 1;

    bloque(tc.contadorMercaderia);
    linea(tc.comprasMercaderia, r.comprasMercaderia, { cantidad: mercaderia?.operaciones ?? 0 });
    linea(tc.costoVendido, r.costoMercaderia);
    if (inventario.length > 0) linea(tc.inventarioAl(hoyTexto), valorInventario.total, { fuerte: true });
    f += 1;
    if (inventario.length > 0) {
      notaAl(h, f, tc.inventarioNota, 'D');
      f += 1;
      if (valorInventario.sinCosto > 0) {
        notaAl(h, f, tc.inventarioSinCosto(valorInventario.sinCosto), 'D');
        f += 1;
      }
    }
    f += 1;

    h.mergeCells(`B${f}:D${f}`);
    const c = h.getCell(`B${f}`);
    c.value = tc.aclaracionContador;
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: TINTA } };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } };
    h.getRow(f).height = 48;
  }

  return libro;
}
