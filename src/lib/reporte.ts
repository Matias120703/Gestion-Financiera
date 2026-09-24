import ExcelJS from 'exceljs';
import {
  esValido,
  type AhorroDelPeriodo, type FilaCategoria, type FilaDia, type FilaProducto, type Resumen,
} from './calculos';
import { decimalesDe, simboloDe, fechaLegible } from './formato';
import type { Liquidacion, Lote, Movimiento, Producto } from './tipos';
import { textosExcel, type TextosExcel } from './reporte-textos';
import { fichaDe } from './rubros';
import type { Conversor, HojaDelLibro } from './reportes/comun';
import { varianteDeReporte } from './reportes/variante';

/**
 * Una fila de la hoja «Liquidaciones»: la liquidación de una campaña, con
 * el nombre de su campaña ya armado («Norte · Zafra 2026/27»). La ruta la
 * trae de `resumen_lote`, que es la única lectura que devuelve los
 * descuentos (la tabla no deja pedirlos por columnas).
 */
export interface FilaLiquidacion extends Liquidacion {
  campana: string;
}

/**
 * Cómo se nombra una campaña en una celda: el lote y la campaña, que es lo
 * que la distingue de la del año anterior en el mismo lote.
 */
export function nombreDeCampana(l: { nombre: string; campana?: string | null }): string {
  return [l.nombre, (l.campana ?? '').trim()].filter(Boolean).join(' · ');
}

/*
 * Los colores, los formatos y las piezas de cada hoja se exportan (23/09):
 * los cinco libros por rubro (`src/lib/reportes/excel-*.ts`) arman sus hojas
 * con las mismas piezas, así un Excel de Orden se ve igual venga del reporte
 * que venga. Ninguno de esos libros se importa desde acá (sería circular):
 * el despacho por variante vive en la ruta `/api/excel`.
 */
export const VERDE = 'FF17795A';
export const VERDE_SUAVE = 'FFE6F4EE';
export const TINTA = 'FF0D1B16';
export const ROJO = 'FFC0392B';
export const GRIS = 'FFF6F7F5';
export const BORDE = 'FFE3E7E4';

export const bordeFino: Partial<ExcelJS.Borders> = {
  bottom: { style: 'thin', color: { argb: BORDE } },
};

export function formatoMoneda(moneda: string) {
  const s = simboloDe(moneda);
  return decimalesDe(moneda) === 0 ? `"${s}" #,##0;[Red]-"${s}" #,##0` : `"${s}" #,##0.00;[Red]-"${s}" #,##0.00`;
}

/** Encabezado con el nombre del negocio, el periodo y la fecha de emisión. */
export function encabezado(hoja: ExcelJS.Worksheet, empresa: string, titulo: string, periodo: string, columnas: number) {
  const ultimaCol = String.fromCharCode(64 + columnas);

  hoja.mergeCells(`A1:${ultimaCol}1`);
  const t = hoja.getCell('A1');
  t.value = empresa;
  t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
  hoja.getRow(1).height = 30;

  hoja.mergeCells(`A2:${ultimaCol}2`);
  const s = hoja.getCell('A2');
  s.value = titulo;
  s.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  s.alignment = { vertical: 'middle', horizontal: 'center' };
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  hoja.getRow(2).height = 20;

  hoja.mergeCells(`A3:${ultimaCol}3`);
  const p = hoja.getCell('A3');
  p.value = periodo;
  p.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF6B7C75' } };
  p.alignment = { vertical: 'middle', horizontal: 'center' };
  hoja.getRow(3).height = 18;

  hoja.getRow(4).height = 6;
}

export function filaEncabezadoTabla(hoja: ExcelJS.Worksheet, fila: number, titulos: string[]) {
  const r = hoja.getRow(fila);
  titulos.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: VERDE } } };
  });
  r.height = 24;
  return r;
}

export interface DatosReporte {
  /**
   * El Excel incluye costos y márgenes, así que solo se genera para
   * propietario y administradores. La ruta /api/excel lo verifica antes
   * de llamar acá.
   */
  empresa: {
    nombre: string;
    moneda: string;
    tipo_cuenta?: 'personal' | 'emprendedor';
    /**
     * En un negocio de ciclo largo —ganadería, agricultura— la hoja «Día por
     * día» son trescientas sesenta y cinco filas en cero con tres picos. No
     * se genera: una hoja vacía no informa, ocupa y hace dudar del resto.
     */
    rubro?: string;
    /**
     * Si los números vienen convertidos a otra moneda (051): de cuál, a qué
     * cambio y desde cuándo. `moneda` ya es la de la vista. Lo pone
     * `enLaMonedaDeLaVista`, y cada hoja lo dice arriba.
     */
    conversion?: { propia: string; cotizacion: number | null; desde: string | null };
  };
  desde: string;
  hasta: string;
  /**
   * Los cuatro agregados vienen calculados por PostgreSQL sobre TODO el
   * periodo (ver agregados.ts). No se derivan de `movimientos`: así los
   * totales son exactos aunque el detalle se haya traído por páginas.
   */
  resumen: Resumen;
  ranking: FilaProducto[];
  /** Gastos agrupados por categoría: en qué se fue la plata. */
  categorias: FilaCategoria[];
  /**
   * Ingresos agrupados por categoría: de dónde vino. Para un comercio casi
   * todo es una venta y este desglose no dice nada; para una persona es el
   * número que separa el sueldo de lo que entró una sola vez.
   */
  ingresos: FilaCategoria[];
  /** Lo que se guardó y se sacó de los fondos DENTRO del período pedido. */
  ahorro: AhorroDelPeriodo;
  serie: FilaDia[];
  /**
   * Detalle completo del periodo, recorrido página por página desde el
   * servidor. Se usa SOLO para la hoja de movimientos, nunca para sumar.
   */
  movimientos: Movimiento[];
  productosBd: Producto[];
  /**
   * Las campañas (lotes) que estuvieron abiertas en el período, con los
   * números de `numeros_de_lote` de TODA la campaña: los mismos que la
   * tarjeta y el panel. Solo en ciclo largo; sin esto no hay hoja.
   */
  campanas?: Lote[];
  /** Las liquidaciones del período, activas y anuladas. Sin ninguna, no hay hoja. */
  liquidaciones?: FilaLiquidacion[];
  /** Id de movimiento → nombre de su campaña, para la columna «Campaña» de Movimientos. */
  campanaDeMovimiento?: Record<string, string>;
  /**
   * En qué idioma sale el archivo: el de quien lo baja. Sin idioma, español.
   * Las categorías y las formas de pago llegan ya traducidas: ver
   * reporte-textos.ts.
   */
  idioma?: string;
}

/** Arma el libro de Excel completo. Función pura: no toca red ni base de datos. */
export function construirLibro(datos: DatosReporte): ExcelJS.Workbook {
  // Una persona y un comercio no comparten casi ninguna hoja, así que cada
  // uno tiene su función. Ver el comentario de `libroPersonal` al final.
  if (datos.empresa.tipo_cuenta === 'personal') return libroPersonal(datos);
  return libroDeNegocio(datos);
}

/**
 * LAS HOJAS QUE TRAE `construirLibro`, PARA LA TARJETA DE DESCARGA (23/09).
 *
 * La tarjeta decía «5 hojas: resumen, productos, movimientos, gastos y día
 * por día» a todos los negocios, y al campo le llegaba otro archivo. Esta
 * lista sigue las mismas condiciones que los dos libros de hoy, y una prueba
 * (reportes-variante.test.js) arma el libro de verdad y compara.
 *
 * Es la lista de transición: cuando cada variante tenga su libro
 * (`src/lib/reportes/excel-*.ts`), la tarjeta usa el `hojas<Variante>` de
 * ese libro y esta queda sin uso.
 */
export function hojasDelLibroDeHoy(
  empresa: Pick<DatosReporte['empresa'], 'tipo_cuenta' | 'rubro'>,
  idioma?: string,
): HojaDelLibro[] {
  const tx = textosExcel(idioma);
  if (empresa.tipo_cuenta === 'personal') {
    return [
      { nombre: tx.hojaResumen }, { nombre: tx.hojaEnQueSeFue }, { nombre: tx.hojaDeDondeVino },
      { nombre: tx.hojaAhorro, siHay: true }, { nombre: tx.hojaMovimientos }, { nombre: tx.hojaDiaPorDia },
    ];
  }
  const { cicloLargo, sinCatalogo } = formaDelLibro(empresa);
  return [
    { nombre: tx.hojaResumen },
    ...(cicloLargo ? [{ nombre: tx.hojaCampanas }, { nombre: tx.hojaLiquidaciones, siHay: true }] : []),
    ...(sinCatalogo ? [] : [{ nombre: tx.hojaProductos }]),
    { nombre: tx.hojaMovimientos }, { nombre: tx.hojaGastos },
    ...(cicloLargo || sinCatalogo ? [] : [{ nombre: tx.hojaDiaPorDia }]),
  ];
}

/**
 * QUÉ LLEVA EL LIBRO DE NEGOCIO SEGÚN EL REPORTE QUE LE TOCA (23/09).
 *
 * Mientras clases, entrenamiento y campo no tengan su libro propio
 * (`src/lib/reportes/excel-*.ts`), usan este, pero sin lo que para ellos es
 * falso: la hoja de productos (paquetes a margen 100 %, o vacía el mes que se
 * vendió el grano, porque la liquidación entra sin items), la ganancia bruta
 * y el margen, lo que «no se vendió» y el día por día. Es lo mismo que les
 * saca la pantalla, así el archivo y Reportes dicen lo mismo.
 *
 * `conResultado`: el profe y el trainer ven lo que les quedó (su período es
 * el mes). El campo no: lo gastado este mes en una campaña que se cosecha en
 * marzo no es una pérdida del mes; su resultado es el de cada campaña.
 */
function formaDelLibro(empresa: Pick<DatosReporte['empresa'], 'tipo_cuenta' | 'rubro'>) {
  const tipo = empresa.tipo_cuenta ?? 'emprendedor';
  const ficha = fichaDe(empresa.rubro, tipo);
  const variante = varianteDeReporte(ficha, tipo);
  return {
    cicloLargo: ficha.ciclosLargos,
    sinCatalogo: variante === 'alumnos' || variante === 'campo',
    conResultado: variante !== 'campo',
  };
}

export function libroDeNegocio({
  empresa, desde, hasta, resumen, ranking, categorias, serie, movimientos, productosBd, idioma,
  campanas, liquidaciones, campanaDeMovimiento,
}: DatosReporte): ExcelJS.Workbook {
  const tx = textosExcel(idioma);
  const moneda = empresa.moneda;
  // La ficha del rubro decide, no una lista escrita acá: el día que un
  // rubro nuevo mida por ciclo, el Excel se entera solo (100). Lo que se
  // les saca a clases y al campo, en `formaDelLibro` (23/09).
  const { cicloLargo, sinCatalogo, conResultado } = formaDelLibro(empresa);
  const fmt = formatoMoneda(moneda);
  const fmtPorc = '0.0"%"';
  const fmtNum = '#,##0.##';

  const r = resumen;
  const productos = ranking;
  const dias = serie.map((d) => d.fecha);
  const periodo = textoPeriodo(desde, hasta, empresa, tx);

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Orden';
  libro.created = new Date();

  // ==========================================================
  // HOJA 1 · RESUMEN
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaResumen, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [
      { width: 4 }, { width: 34 }, { width: 20 }, { width: 20 }, { width: 4 },
    ];
    encabezado(h, empresa.nombre, tx.resumenEjecutivo, periodo, 5);

    let f = 6;
    const bloque = (titulo: string) => {
      h.mergeCells(`B${f}:D${f}`);
      const c = h.getCell(`B${f}`);
      c.value = titulo.toUpperCase();
      c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF6B7C75' } };
      c.alignment = { vertical: 'middle' };
      h.getRow(f).height = 20;
      f += 1;
    };

    const linea = (etiqueta: string, valor: number, opciones?: { formato?: string; fuerte?: boolean; color?: string; nota?: string }) => {
      const fila = h.getRow(f);
      const a = fila.getCell(2);
      const b = fila.getCell(3);
      const c = fila.getCell(4);
      a.value = etiqueta;
      a.font = { name: 'Calibri', size: 11, bold: !!opciones?.fuerte, color: { argb: TINTA } };
      a.alignment = { vertical: 'middle' };
      b.value = valor;
      b.numFmt = opciones?.formato ?? fmt;
      b.font = { name: 'Calibri', size: 11, bold: !!opciones?.fuerte, color: { argb: opciones?.color ?? TINTA } };
      b.alignment = { vertical: 'middle', horizontal: 'right' };
      if (opciones?.nota) {
        c.value = opciones.nota;
        c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF8A968F' } };
        c.alignment = { vertical: 'middle', horizontal: 'right' };
      }
      a.border = bordeFino; b.border = bordeFino; c.border = bordeFino;
      fila.height = 20;
      f += 1;
    };

    bloque(tx.entroPlata);
    linea(tx.ventasPrecioLista, r.ventasBrutas, { nota: tx.operaciones(r.cantidadVentas) });
    if (r.descuentos > 0) {
      linea(tx.descuentosOtorgados, -r.descuentos, { color: ROJO });
    }
    linea(tx.ventasCobradas, r.ventas, { fuerte: true });
    linea(tx.otrosIngresos, r.otrosIngresos);
    linea(tx.totalQueEntro, r.ingresosTotales, { fuerte: true, color: VERDE });
    f += 1;

    bloque(tx.costosYGastos);
    // Sin catálogo no hay costo de mercadería que mostrar: un «0» ahí parece
    // un dato (el paquete del profe no tiene costo; el costo del campo está
    // en la campaña, no en la venta).
    if (!sinCatalogo) linea(tx.costoMercaderia, r.costoMercaderia, { color: ROJO });
    linea(tx.gastosOperativos, r.gastos, { color: ROJO });
    linea(tx.totalQueSalio, (sinCatalogo ? 0 : r.costoMercaderia) + r.gastos, { fuerte: true, color: ROJO });
    f += 1;

    if (conResultado) {
      bloque(tx.resultado);
      if (!sinCatalogo) linea(tx.gananciaBruta, r.gananciaBruta, { fuerte: true, nota: tx.margen(r.margenBruto.toFixed(1)) });
      linea(tx.gananciaNeta, r.gananciaNeta, {
        fuerte: true, color: r.gananciaNeta >= 0 ? VERDE : ROJO,
        nota: sinCatalogo ? undefined : tx.margen(r.margenNeto.toFixed(1)),
      });
      f += 1;
    }

    if (!sinCatalogo || r.ventasAnuladas > 0) bloque(tx.indicadores);
    if (!sinCatalogo) {
      linea(tx.ticketPromedio, r.ticketPromedio);
      linea(tx.unidadesVendidas, r.unidadesVendidas, { formato: fmtNum });
      linea(tx.productosDistintos, productos.length, { formato: '#,##0' });
      linea(tx.promedioVentasDia, dias.length ? r.ventas / dias.length : 0);
    }
    if (r.ventasAnuladas > 0) {
      linea(tx.ventasAnuladas, r.ventasAnuladas, { formato: '#,##0', nota: tx.noSumanEnNingunTotal });
      linea(tx.montoVentasAnuladas, r.montoVentasAnuladas, { color: ROJO });
    }
    f += 2;

    // Destacados. «Lo que más dejó» sale del ranking: sin catálogo no dice nada.
    const mejor = sinCatalogo ? undefined : productos[0];
    const mayorGasto = movimientos.filter((m) => m.tipo === 'gasto').sort((a, b) => Number(b.monto) - Number(a.monto))[0];

    h.mergeCells(`B${f}:D${f}`);
    const dc = h.getCell(`B${f}`);
    dc.value = tx.paraTenerEnCuenta;
    dc.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF6B7C75' } };
    f += 1;

    const nota = (texto: string) => {
      h.mergeCells(`B${f}:D${f}`);
      const c = h.getCell(`B${f}`);
      c.value = texto;
      c.font = { name: 'Calibri', size: 10, color: { argb: TINTA } };
      c.alignment = { vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } };
      h.getRow(f).height = 20;
      f += 1;
    };

    const plata = (n: number) => `${simboloDe(moneda)} ${Math.round(n).toLocaleString(tx.locale)}`;
    if (mejor) {
      const detalleGanancia = mejor.ganancia === null ? '' : tx.conGanancia(plata(mejor.ganancia));
      nota(tx.loQueMasDejo(mejor.nombre, mejor.unidades.toLocaleString(tx.locale)) + detalleGanancia);
    }
    if (mayorGasto) nota(tx.gastoMasGrande(mayorGasto.descripcion, plata(Number(mayorGasto.monto))));
    if (conResultado && r.gananciaNeta < 0) nota(tx.gastasteMasQueGanaste);
    if (r.descuentos > 0) {
      const pct = r.ventasBrutas > 0 ? (r.descuentos / r.ventasBrutas) * 100 : 0;
      nota(tx.disteDescuentos(plata(r.descuentos), pct.toFixed(1)));
    }
    if (r.movimientosAnulados > 0) {
      nota(tx.seAnularon(r.movimientosAnulados, r.ventasAnuladas));
    }
    // Para un comercio, no haber vendido nada es un dato —y probablemente un
    // problema que mirar—, así que se dice. La versión de esta frase para una
    // cuenta personal está en `libroPersonal`: ahí no hay ventas nunca, y
    // señalarlo sería acusar a alguien de no hacer algo que ni se le ofrece.
    //
    // Se mira la cantidad de ventas del resumen y no el ranking: la venta de
    // una liquidación del campo entra sin items (100), así que el ranking
    // quedaba vacío y el Excel decía «No se registraron ventas» el mismo mes
    // que el productor vendió la soja (23/09).
    if (r.cantidadVentas === 0) {
      nota(tx.sinVentas);
    }
  }

  // ==========================================================
  // LAS CAMPAÑAS Y LAS LIQUIDACIONES (100)
  //
  // Solo en ciclo largo, y segundas: para el que vive de campañas es lo
  // primero que el contador le pregunta. Ver `hojaCampanas`.
  // ==========================================================
  if (cicloLargo && campanas) {
    hojaCampanas(libro, empresa.nombre, periodo, campanas, fmt, tx);
  }
  if (cicloLargo && liquidaciones && liquidaciones.length > 0) {
    hojaLiquidaciones(libro, empresa.nombre, periodo, liquidaciones, fmt, tx);
  }

  // ==========================================================
  // HOJA 2 · PRODUCTOS (no en clases ni en el campo: ver `formaDelLibro`)
  // ==========================================================
  if (!sinCatalogo) {
    const h = libro.addWorksheet(tx.hojaProductos, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [
      { width: 5 }, { width: 32 }, { width: 11 }, { width: 15 }, { width: 14 },
      { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 13 },
    ];
    encabezado(h, empresa.nombre, tx.productosVendidos, periodo, 10);

    filaEncabezadoTabla(h, 6, tx.columnasProductos);

    // El descuento de cada venta se reparte entre sus productos en proporción
    // a lo que pesa cada uno. Así la suma de esta columna da exactamente el
    // mismo total que el panel y que la hoja de Movimientos.
    productos.forEach((p, i) => {
      const fila = h.getRow(7 + i);
      // Si el costo no está disponible, la celda va vacía. Nunca un cero:
      // en una planilla, un cero se suma y se promedia como si fuera real.
      fila.values = [
        i + 1, p.nombre, p.unidades, p.ingresosBrutos, -p.descuento, p.ingresos,
        p.costo ?? null, p.ganancia ?? null, p.margen ?? null, p.participacion,
      ];
      fila.height = 18;
      fila.eachCell((c, n) => {
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : n === 1 ? 'center' : 'right' };
        if (n >= 4 && n <= 8) c.numFmt = fmt;
        if (n === 3) c.numFmt = fmtNum;
        if (n === 9 || n === 10) c.numFmt = fmtPorc;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      });
      fila.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
      fila.getCell(8).font = {
        name: 'Calibri', size: 10, bold: true,
        color: { argb: p.ganancia === null ? 'FF9AA5A0' : p.ganancia >= 0 ? VERDE : ROJO },
      };
      if (i < 3) fila.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: VERDE } };
    });

    const fTotal = 7 + productos.length;
    const total = h.getRow(fTotal);
    total.values = [
      '', 'TOTAL',
      productos.reduce((s, p) => s + p.unidades, 0),
      productos.reduce((s, p) => s + p.ingresosBrutos, 0),
      -productos.reduce((s, p) => s + p.descuento, 0),
      productos.reduce((s, p) => s + p.ingresos, 0),
      productos.every((p) => p.costo !== null) ? productos.reduce((s, p) => s + (p.costo ?? 0), 0) : null,
      productos.every((p) => p.ganancia !== null) ? productos.reduce((s, p) => s + (p.ganancia ?? 0), 0) : null,
      r.margenBruto, 100,
    ];
    total.height = 22;
    total.eachCell((c, n) => {
      c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
      if (n >= 4 && n <= 8) c.numFmt = fmt;
      if (n === 3) c.numFmt = fmtNum;
      if (n === 9 || n === 10) c.numFmt = fmtPorc;
    });

    if (productos.length > 0) {
      h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + productos.length, column: 10 } };
    }

    // Productos que no se movieron. Solo lo que tiene stock de verdad
    // (`controla_stock` y más de cero), igual que la pantalla: un corte de
    // pelo no se queda «quieto en el estante», y un producto sin stock no
    // tiene plata parada (23/09).
    const vendidos = new Set(productos.map((p) => p.producto_id).filter(Boolean) as string[]);
    const quietos = (productosBd ?? []).filter((p) => p.controla_stock && Number(p.stock) > 0 && !vendidos.has(p.id));
    if (quietos.length > 0) {
      let f = fTotal + 3;
      h.mergeCells(`B${f}:G${f}`);
      const t = h.getCell(`B${f}`);
      t.value = tx.noSeVendieron(quietos.length);
      t.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF6B7C75' } };
      f += 1;
      filaEncabezadoTabla(h, f, tx.columnasQuietos);
      quietos.forEach((p: any, i: number) => {
        const fila = h.getRow(f + 1 + i);
        fila.values = ['', p.nombre, Number(p.stock), Number(p.precio), Number(p.costo), Number(p.stock) * Number(p.costo)];
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
  // HOJA 3 · MOVIMIENTOS
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaMovimientos, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    // En ciclo largo, una columna más al final: de qué campaña es cada
    // movimiento (100). Al final y no en el medio, para que las de siempre
    // queden en su lugar para quien ya tiene fórmulas armadas sobre ellas.
    const cols = cicloLargo ? 12 : 11;
    h.columns = [
      { width: 12 }, { width: 11 }, { width: 36 }, { width: 16 }, { width: 14 },
      { width: 15 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 17 },
      ...(cicloLargo ? [{ width: 26 }] : []),
    ];
    encabezado(h, empresa.nombre, tx.detalleMovimientos, periodo, cols);

    filaEncabezadoTabla(h, 6, cicloLargo ? [...tx.columnasMovimientos, tx.columnaCampana] : tx.columnasMovimientos);

    const ordenados = [...movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

    ordenados.forEach((mv, i) => {
      const fila = h.getRow(7 + i);
      const esGasto = mv.tipo === 'gasto';
      const anulado = !esValido(mv);
      const signo = esGasto ? -1 : 1;
      const ganancia = mv.tipo === 'venta'
        ? Number(mv.monto) - Number(mv.costo_total ?? 0)
        : signo * Number(mv.monto);

      fila.values = [
        fechaLegible(mv.fecha, true, tx.locale),
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
        ...(cicloLargo ? [campanaDeMovimiento?.[mv.id] ?? ''] : []),
      ];
      fila.height = 18;
      fila.eachCell((c, n) => {
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n >= 6 && n <= 10 ? 'right' : n === 3 || n >= 11 ? 'left' : 'center' };
        if (n >= 6 && n <= 10) c.numFmt = fmt;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      });
      fila.getCell(2).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: esGasto ? ROJO : VERDE } };
      fila.getCell(10).font = { name: 'Calibri', size: 10, bold: true, color: { argb: ganancia >= 0 ? VERDE : ROJO } };

      // Las anuladas quedan tachadas y en gris: se ven en el historial pero no suman.
      if (anulado) {
        fila.eachCell((c) => {
          c.font = { ...(c.font ?? {}), strike: true, color: { argb: 'FF9AA5A0' }, italic: true };
        });
        fila.getCell(11).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: ROJO } };
      }
    });

    const fTotal = 7 + ordenados.length;
    const total = h.getRow(fTotal);
    // Los totales usan el resumen, que ya excluye las anuladas.
    total.values = [
      '', '', tx.totalSinAnuladas, '', '',
      r.ventasBrutas + r.otrosIngresos - r.gastos,
      -r.descuentos,
      r.ingresosTotales - r.gastos,
      r.costoMercaderia,
      r.gananciaNeta,
      '',
      ...(cicloLargo ? [''] : []),
    ];
    total.height = 22;
    total.eachCell((c, n) => {
      c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: n >= 6 ? 'right' : 'left' };
      if (n >= 6 && n <= 10) c.numFmt = fmt;
    });

    if (ordenados.length > 0) {
      h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ordenados.length, column: cols } };
    }
  }

  // ==========================================================
  // HOJA 4 · GASTOS
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaGastos, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 32 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 5 }];
    encabezado(h, empresa.nombre, tx.enQueSeFueLaPlata, periodo, 6);

    filaEncabezadoTabla(h, 6, tx.columnasGastos);

    categorias.forEach((c, i) => {
      const fila = h.getRow(7 + i);
      fila.values = [i + 1, c.nombre, c.monto, c.operaciones, c.participacion];
      fila.height = 18;
      fila.eachCell((cell, n) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = bordeFino;
        cell.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : n === 1 ? 'center' : 'right' };
        if (n === 3) cell.numFmt = fmt;
        if (n === 5) cell.numFmt = fmtPorc;
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      });
      fila.getCell(2).font = { name: 'Calibri', size: 10, bold: true };
      fila.getCell(3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: ROJO } };
    });

    const fTotal = 7 + categorias.length;
    const total = h.getRow(fTotal);
    total.values = ['', 'TOTAL', r.gastos, categorias.reduce((s, c) => s + c.operaciones, 0), 100];
    total.eachCell((c, n) => {
      c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
      if (n === 3) c.numFmt = fmt;
      if (n === 5) c.numFmt = fmtPorc;
    });
    total.height = 22;
  }

  // ==========================================================
  // HOJA 5 · DÍA POR DÍA
  //
  // No se genera en ciclo largo: ver el comentario de `rubro` arriba.
  // ==========================================================
  if (!cicloLargo && !sinCatalogo) {
    const h = libro.addWorksheet(tx.hojaDiaPorDia, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 5 }];
    encabezado(h, empresa.nombre, tx.resultadoDeCadaDia, periodo, 6);

    filaEncabezadoTabla(h, 6, tx.columnasDias);

    serie.forEach((d, i) => {
      const fila = h.getRow(7 + i);
      fila.values = ['', fechaLegible(d.fecha, true, tx.locale), d.ventas, d.gastos, d.ganancia ?? null];
      fila.height = 18;
      fila.eachCell((c, n) => {
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
        if (n >= 3) c.numFmt = fmt;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      });
      fila.getCell(5).font = {
        name: 'Calibri', size: 10, bold: true,
        color: { argb: d.ganancia === null ? 'FF9AA5A0' : d.ganancia >= 0 ? VERDE : ROJO },
      };
    });

    const fTotal = 7 + serie.length;
    const total = h.getRow(fTotal);
    total.values = ['', 'TOTAL', r.ventas, r.gastos, r.gananciaNeta];
    total.height = 22;
    total.eachCell((c, n) => {
      c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
      if (n >= 3) c.numFmt = fmt;
    });
  }

  return libro;
}

/** Un número que puede faltar: lo que falta queda vacío, nunca en cero. */
export function quizas(v: number | null | undefined): number | null {
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
}

/** Σ de una columna que puede faltar: si falta en todas las filas, falta en el total. */
export function sumaQuizas<T>(filas: T[], valor: (f: T) => number | null | undefined): number | null {
  const presentes = filas.map((f) => quizas(valor(f))).filter((v): v is number => v !== null);
  return presentes.length === 0 ? null : presentes.reduce((s, v) => s + v, 0);
}

/**
 * HOJA «CAMPAÑAS» (100): una fila por campaña, con los números de
 * `numeros_de_lote` tal cual los ven la tarjeta y el panel. Nada se
 * recalcula acá: el costo por hectárea del Excel tiene que ser el mismo
 * que el de la pantalla, o el productor deja de creerle a los dos.
 *
 * Los por hectárea y el rendimiento no se suman en el total (una suma de
 * promedios no es nada); el precio promedio del total sí se calcula, como
 * lo hace la base: lo vendido sobre los kilos vendidos.
 */
export function hojaCampanas(
  libro: ExcelJS.Workbook, empresaNombre: string, periodo: string, campanas: Lote[], fmt: string, tx: TextosExcel,
) {
  const h = libro.addWorksheet(tx.hojaCampanas, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 6, xSplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  const columnas = tx.columnasCampanas.length;
  h.columns = [
    { width: 22 }, { width: 13 }, { width: 16 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 13 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 13 },
    { width: 14 }, { width: 10 }, { width: 13 }, { width: 15 }, { width: 13 },
  ];
  encabezado(h, empresaNombre, tx.campanasTitulo, periodo, columnas);
  filaEncabezadoTabla(h, 6, tx.columnasCampanas);

  // Qué es cada columna (1 = Lote … 19 = kg sin vender).
  const PLATA = new Set([8, 9, 10, 11, 12, 13, 14, 18]);
  const KILOS = new Set([15, 16, 17, 19]);
  const fecha = (iso: string | null) => (iso ? fechaLegible(iso, true, tx.locale) : null);
  const formatear = (c: ExcelJS.Cell, n: number) => {
    if (PLATA.has(n)) c.numFmt = fmt;
    if (KILOS.has(n)) c.numFmt = '#,##0';
    if (n === 4) c.numFmt = '#,##0.##';
  };

  const nota = (fila: number, texto: string) => {
    h.mergeCells(fila, 1, fila, Math.min(columnas, 10));
    const c = h.getCell(fila, 1);
    c.value = texto;
    c.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF6B7C75' } };
    c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    h.getRow(fila).height = 30;
  };

  if (campanas.length === 0) {
    nota(7, tx.sinCampanas);
    return;
  }

  campanas.forEach((l, i) => {
    const fila = h.getRow(7 + i);
    fila.values = [
      l.nombre, l.cultivo || '', l.campana || '', quizas(l.hectareas),
      l.estado === 'cerrado' ? tx.cerrada : tx.abierta, fecha(l.abierto_el), fecha(l.cerrado_el),
      quizas(l.puesto), quizas(l.a_cosecha), quizas(l.costo), quizas(l.costo_ha),
      quizas(l.cobrado), quizas(l.resultado), quizas(l.resultado_ha),
      quizas(l.kg_cosechados), quizas(l.rendimiento), quizas(l.kg_vendidos),
      quizas(l.precio_promedio), quizas(l.kg_sin_vender),
    ];
    fila.height = 18;
    fila.eachCell({ includeEmpty: true }, (c, n) => {
      c.font = { name: 'Calibri', size: 10 };
      c.border = bordeFino;
      c.alignment = { vertical: 'middle', horizontal: n <= 3 ? 'left' : n >= 5 && n <= 7 ? 'center' : 'right' };
      formatear(c, n);
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
    });
    fila.getCell(1).font = { name: 'Calibri', size: 10, bold: true };
    const res = quizas(l.resultado) ?? 0;
    fila.getCell(13).font = { name: 'Calibri', size: 10, bold: true, color: { argb: res >= 0 ? VERDE : ROJO } };
  });

  const kgVendidos = sumaQuizas(campanas, (l) => l.kg_vendidos) ?? 0;
  const vendido = sumaQuizas(campanas, (l) => l.vendido) ?? 0;
  const fTotal = 7 + campanas.length;
  const total = h.getRow(fTotal);
  total.values = [
    'TOTAL', '', '', sumaQuizas(campanas, (l) => l.hectareas), '', '', '',
    sumaQuizas(campanas, (l) => l.puesto), sumaQuizas(campanas, (l) => l.a_cosecha),
    sumaQuizas(campanas, (l) => l.costo), null,
    sumaQuizas(campanas, (l) => l.cobrado), sumaQuizas(campanas, (l) => l.resultado), null,
    sumaQuizas(campanas, (l) => l.kg_cosechados), null, kgVendidos,
    kgVendidos > 0 ? Math.round((vendido / kgVendidos) * 1000 * 100) / 100 : null,
    sumaQuizas(campanas, (l) => l.kg_sin_vender),
  ];
  total.height = 22;
  total.eachCell({ includeEmpty: true }, (c, n) => {
    c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
    c.alignment = { vertical: 'middle', horizontal: n <= 3 ? 'left' : 'right' };
    formatear(c, n);
  });

  h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + campanas.length, column: columnas } };

  nota(fTotal + 2, tx.campanasEnteras);
  nota(fTotal + 3, tx.campanasSonDeCaja);
}

/**
 * HOJA «LIQUIDACIONES» (100): una fila por campaña y papel, como las guarda
 * la base. Las anuladas figuran tachadas y no suman, igual que en
 * Movimientos. Bruto − descuentos − compensado − pagado con grano = neto,
 * fila por fila: es lo que dice el papel de la cooperativa.
 */
export function hojaLiquidaciones(
  libro: ExcelJS.Workbook, empresaNombre: string, periodo: string, filas: FilaLiquidacion[], fmt: string, tx: TextosExcel,
) {
  const h = libro.addWorksheet(tx.hojaLiquidaciones, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  const columnas = tx.columnasLiquidaciones.length;
  h.columns = [
    { width: 13 }, { width: 26 }, { width: 22 }, { width: 12 }, { width: 13 }, { width: 15 },
    { width: 15 }, { width: 17 }, { width: 15 }, { width: 15 }, { width: 13 },
  ];
  encabezado(h, empresaNombre, tx.liquidacionesTitulo, periodo, columnas);
  filaEncabezadoTabla(h, 6, tx.columnasLiquidaciones);

  const formatear = (c: ExcelJS.Cell, n: number) => {
    if (n >= 5 && n <= 10) c.numFmt = fmt;
    if (n === 4) c.numFmt = '#,##0';
  };

  const ordenadas = [...filas].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  ordenadas.forEach((q, i) => {
    const fila = h.getRow(7 + i);
    const anulada = q.estado === 'anulada';
    fila.values = [
      fechaLegible(q.fecha, true, tx.locale), q.campana, q.comprador || '—',
      quizas(q.kg), quizas(q.precio_tonelada), quizas(q.bruto),
      quizas(q.descuentos), quizas(q.compensado), quizas(q.pagado_con_grano), quizas(q.neto),
      anulada ? tx.anulada : tx.activa,
    ];
    fila.height = 18;
    fila.eachCell({ includeEmpty: true }, (c, n) => {
      c.font = { name: 'Calibri', size: 10 };
      c.border = bordeFino;
      c.alignment = { vertical: 'middle', horizontal: n === 2 || n === 3 ? 'left' : n === 1 || n === 11 ? 'center' : 'right' };
      formatear(c, n);
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
    });
    fila.getCell(10).font = { name: 'Calibri', size: 10, bold: true, color: { argb: VERDE } };
    if (anulada) {
      fila.eachCell((c) => {
        c.font = { ...(c.font ?? {}), strike: true, color: { argb: 'FF9AA5A0' }, italic: true };
      });
      fila.getCell(11).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: ROJO } };
    }
  });

  const activas = ordenadas.filter((q) => q.estado !== 'anulada');
  const kg = sumaQuizas(activas, (q) => q.kg) ?? 0;
  const bruto = sumaQuizas(activas, (q) => q.bruto) ?? 0;
  const fTotal = 7 + ordenadas.length;
  const total = h.getRow(fTotal);
  total.values = [
    '', tx.totalLiquidaciones, '', kg,
    kg > 0 ? Math.round((bruto / kg) * 1000 * 100) / 100 : null,
    bruto,
    sumaQuizas(activas, (q) => q.descuentos), sumaQuizas(activas, (q) => q.compensado),
    sumaQuizas(activas, (q) => q.pagado_con_grano), sumaQuizas(activas, (q) => q.neto) ?? 0,
    '',
  ];
  total.height = 22;
  total.eachCell({ includeEmpty: true }, (c, n) => {
    c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
    c.alignment = { vertical: 'middle', horizontal: n <= 3 ? 'left' : 'right' };
    formatear(c, n);
  });

  h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ordenadas.length, column: columnas } };
}


/**
 * ============================================================
 * EL LIBRO DE UNA CUENTA PERSONAL
 * ============================================================
 *
 * POR QUÉ ES OTRA FUNCIÓN Y NO UN PUÑADO DE `if` ADENTRO DE LA DE ARRIBA
 *
 * Hasta acá el Excel de una persona era el de un comercio con un texto
 * distinto al final. Eso quiere decir que alguien que lleva su sueldo abría
 * la planilla y leía «Ventas a precio de lista», «Costo de la mercadería
 * vendida», «Ticket promedio», «Productos distintos vendidos» y una hoja
 * entera de productos vacía. Todos ceros, porque no vende nada.
 *
 * Un reporte que le habla a alguien de cosas que no hace no es solo feo: le
 * enseña que ese archivo no es para él, y no lo vuelve a abrir.
 *
 * Se separó en dos funciones en vez de ramificar la de arriba porque las dos
 * planillas no comparten casi nada: distintas hojas, distintas columnas,
 * distintos totales. Mezclarlas dejaría una función llena de condicionales
 * donde tocar la del comercio rompería la de la persona. Acá, el camino del
 * negocio no se toca.
 *
 * LO QUE UNA PERSONA SÍ QUIERE VER
 *
 *   · cuánto entró y de dónde  —qué parte es sueldo y qué parte fue extra—;
 *   · cuánto salió y en qué;
 *   · cuánto le quedó;
 *   · cuánto guardó, que no es ni un gasto ni un ingreso;
 *   · el detalle completo, para poder buscar «¿cuándo pagué esto?».
 */
export function libroPersonal({
  empresa, desde, hasta, resumen, categorias, ingresos, ahorro, serie, movimientos, idioma,
}: DatosReporte): ExcelJS.Workbook {
  const tx = textosExcel(idioma);
  const moneda = empresa.moneda;
  const fmt = formatoMoneda(moneda);
  const fmtPorc = '0.0"%"';
  const r = resumen;

  const entro = r.ingresosTotales;
  const salio = r.gastos;
  const teQuedo = entro - salio;

  const periodo = textoPeriodo(desde, hasta, empresa, tx);

  // Días del calendario, no días con movimientos: para el promedio diario lo
  // que importa es cuánto duró el período, no en cuántos días cargó algo.
  const dias = Math.max(1, Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000,
  ) + 1);

  const huboAhorro = ahorro.aportado > 0 || ahorro.retirado > 0;

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Orden';
  libro.created = new Date();

  // ==========================================================
  // HOJA 1 · RESUMEN
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaResumen, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [{ width: 4 }, { width: 34 }, { width: 20 }, { width: 20 }, { width: 4 }];
    encabezado(h, empresa.nombre, tx.tusNumeros, periodo, 5);

    let f = 6;

    const bloque = (titulo: string) => {
      h.mergeCells(`B${f}:D${f}`);
      const c = h.getCell(`B${f}`);
      c.value = titulo;
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      h.getRow(f).height = 22;
      f += 1;
    };

    const linea = (
      etiqueta: string,
      valor: number,
      opciones?: { fuerte?: boolean; color?: string; nota?: string; formato?: string },
    ) => {
      const fila = h.getRow(f);
      const a = fila.getCell(2);
      const b = fila.getCell(3);
      const c = fila.getCell(4);
      a.value = etiqueta;
      a.font = { name: 'Calibri', size: 10.5, bold: opciones?.fuerte, color: { argb: TINTA } };
      a.alignment = { vertical: 'middle', indent: 1 };
      b.value = valor;
      b.numFmt = opciones?.formato ?? fmt;
      b.font = {
        name: 'Calibri', size: 10.5, bold: opciones?.fuerte,
        color: { argb: opciones?.color ?? TINTA },
      };
      b.alignment = { vertical: 'middle', horizontal: 'right' };
      if (opciones?.nota) {
        c.value = opciones.nota;
        c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF8A968F' } };
        c.alignment = { vertical: 'middle', horizontal: 'right' };
      }
      a.border = bordeFino; b.border = bordeFino; c.border = bordeFino;
      fila.height = 20;
      f += 1;
    };

    // ---- de dónde vino ----
    bloque(tx.loQueEntro);
    if (ingresos.length === 0) {
      linea(tx.sinIngresos, 0);
    } else {
      ingresos.forEach((i) => {
        linea(i.nombre, i.monto, {
          nota: tx.veces(i.operaciones),
        });
      });
    }
    linea(tx.totalQueEntro, entro, { fuerte: true, color: VERDE });
    f += 1;

    // ---- en qué se fue ----
    bloque(tx.loQueSalio);
    if (categorias.length === 0) {
      linea(tx.sinGastos, 0);
    } else {
      // Las cinco más caras. El detalle completo tiene su propia hoja: acá
      // repetir veinte categorías taparía el número que importa.
      categorias.slice(0, 5).forEach((c) => {
        linea(c.nombre, c.monto, { color: ROJO, nota: tx.deTusGastos(c.participacion.toFixed(1)) });
      });
      if (categorias.length > 5) {
        const resto = categorias.slice(5).reduce((s, c) => s + c.monto, 0);
        linea(tx.otrasCategorias(categorias.length - 5), resto, { color: ROJO });
      }
    }
    linea(tx.totalQueSalio, salio, { fuerte: true, color: ROJO });
    f += 1;

    // ---- el ahorro, que no es ninguna de las dos cosas ----
    if (huboAhorro) {
      bloque(tx.loQueGuardaste);
      linea(tx.depositadoEnFondos, ahorro.aportado, { color: VERDE });
      if (ahorro.retirado > 0) linea(tx.retiradoDeFondos, -ahorro.retirado, { color: ROJO });
      linea(tx.guardadoEnElPeriodo, ahorro.neto, { fuerte: true });
      f += 1;
    }

    // ---- el número ----
    bloque(tx.resultado);
    linea(tx.teQuedo, teQuedo, {
      fuerte: true,
      color: teQuedo >= 0 ? VERDE : ROJO,
      nota: tx.entroMenosSalio,
    });
    if (huboAhorro && ahorro.neto > 0) {
      linea(tx.yaEstaGuardado, ahorro.neto, {
        nota: tx.sigueSiendoTuyo,
      });
    }
    f += 1;

    bloque(tx.paraMirarloDeCerca);
    linea(tx.gastoPromedioDia, salio / dias, { nota: tx.diasDelPeriodo(dias) });
    linea(tx.diasConAlgo, serie.length, { formato: '#,##0' });
    if (entro > 0) {
      linea(tx.delTotalGastaste, (salio / entro) * 100, { formato: fmtPorc });
    }
    if (r.movimientosAnulados > 0) {
      linea(tx.movimientosAnulados, r.movimientosAnulados, {
        formato: '#,##0', nota: tx.noSumanEnNingunTotal,
      });
    }
    f += 2;

    // ---- para tener en cuenta ----
    h.mergeCells(`B${f}:D${f}`);
    const dc = h.getCell(`B${f}`);
    dc.value = tx.paraTenerEnCuenta;
    dc.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF6B7C75' } };
    f += 1;

    const nota = (texto: string) => {
      h.mergeCells(`B${f}:D${f}`);
      const c = h.getCell(`B${f}`);
      c.value = texto;
      c.font = { name: 'Calibri', size: 10, color: { argb: TINTA } };
      c.alignment = { vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } };
      h.getRow(f).height = 20;
      f += 1;
    };

    const simbolo = simboloDe(moneda);
    const enPlata = (n: number) => `${simbolo} ${Math.round(n).toLocaleString(tx.locale)}`;

    const mayorGasto = movimientos
      .filter((m) => m.tipo === 'gasto' && esValido(m))
      .sort((a, b) => Number(b.monto) - Number(a.monto))[0];

    if (categorias[0]) {
      nota(tx.dondeMasSeFue(categorias[0].nombre, enPlata(categorias[0].monto), categorias[0].participacion.toFixed(1)));
    }
    if (mayorGasto) {
      nota(`${tx.gastoMasGrande(mayorGasto.descripcion || tx.sinDescripcion, enPlata(Number(mayorGasto.monto)))}.`);
    }
    if (huboAhorro && ahorro.neto > 0) {
      nota(tx.guardaste(enPlata(ahorro.neto)));
    }

    // Cuando no hay nada que destacar, el archivo dice algo útil en vez de
    // señalar un vacío. Un reporte que solo marca lo que falta no invita a
    // volver a abrirlo.
    if (entro === 0 && salio === 0) {
      nota(tx.sinNada);
    } else if (salio > 0 && entro === 0) {
      nota(tx.gastosSinIngresos);
    } else if (teQuedo < 0) {
      nota(tx.gastasteDeMas(enPlata(Math.abs(teQuedo))));
    } else if (teQuedo > 0 && !huboAhorro) {
      nota(tx.sobro(enPlata(teQuedo)));
    }
  }

  // ==========================================================
  // HOJA 2 · EN QUÉ SE FUE
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaEnQueSeFue, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 32 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 5 }];
    encabezado(h, empresa.nombre, tx.enQueSeFueLaPlata, periodo, 6);

    filaEncabezadoTabla(h, 6, tx.columnasGastos);
    tablaDeCategorias(h, categorias, salio, fmt, fmtPorc, tx.nadaGastado);
  }

  // ==========================================================
  // HOJA 3 · DE DÓNDE VINO
  //
  // El espejo de la anterior, y para una persona con sueldo es la que
  // contesta la pregunta de fondo: qué parte de lo que entra se repite el mes
  // que viene y qué parte fue de una sola vez.
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaDeDondeVino, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 32 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 5 }];
    encabezado(h, empresa.nombre, tx.deDondeVinoLaPlata, periodo, 6);

    filaEncabezadoTabla(h, 6, tx.columnasIngresos);
    tablaDeCategorias(h, ingresos, entro, fmt, fmtPorc, tx.nadaCargado);
  }

  // ==========================================================
  // HOJA 4 · AHORRO
  //
  // Solo si hubo movimiento. Una hoja de ahorro vacía para alguien que no
  // usa fondos es exactamente el problema que esta planilla vino a corregir.
  // ==========================================================
  if (huboAhorro) {
    const h = libro.addWorksheet(tx.hojaAhorro, {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [
      { width: 5 }, { width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 5 },
    ];
    encabezado(h, empresa.nombre, tx.tusFondos, periodo, 7);

    filaEncabezadoTabla(h, 6, tx.columnasFondos);

    ahorro.porFondo.forEach((fondo, i) => {
      const fila = h.getRow(7 + i);
      fila.values = [i + 1, fondo.nombre, fondo.aportado, -fondo.retirado, fondo.neto, fondo.saldo_hoy];
      fila.height = 18;
      fila.eachCell((c, n) => {
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : n === 1 ? 'center' : 'right' };
        if (n >= 3) c.numFmt = fmt;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      });
      fila.getCell(5).font = {
        name: 'Calibri', size: 10, bold: true,
        color: { argb: fondo.neto >= 0 ? VERDE : ROJO },
      };
    });

    const fTotal = 7 + ahorro.porFondo.length;
    const total = h.getRow(fTotal);
    total.values = ['', 'TOTAL', ahorro.aportado, -ahorro.retirado, ahorro.neto, ''];
    total.height = 22;
    total.eachCell((c, n) => {
      c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
      if (n >= 3 && n <= 5) c.numFmt = fmt;
    });

    const aviso = h.getRow(fTotal + 2);
    h.mergeCells(`B${fTotal + 2}:F${fTotal + 2}`);
    const c = aviso.getCell(2);
    c.value = tx.avisoSaldoAHoy;
    c.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF8A968F' } };
    c.alignment = { vertical: 'middle', wrapText: true };
    aviso.height = 28;
  }

  // ==========================================================
  // HOJA 5 · MOVIMIENTOS
  //
  // Sin subtotal, sin descuento, sin costo y sin ganancia. Esas cinco
  // columnas son de una venta; en la vida de una persona no significan nada
  // y lo único que hacían era empujar el monto —la única columna que le
  // importa— hacia la derecha de la pantalla.
  // ==========================================================
  {
    const h = libro.addWorksheet(tx.hojaMovimientos, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [
      { width: 13 }, { width: 11 }, { width: 42 }, { width: 20 }, { width: 16 }, { width: 18 }, { width: 20 },
    ];
    encabezado(h, empresa.nombre, tx.todoLoQueCargaste, periodo, 7);

    filaEncabezadoTabla(h, 6, tx.columnasMovimientosPersona);

    const ordenados = [...movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

    ordenados.forEach((mv, i) => {
      const fila = h.getRow(7 + i);
      const esGasto = mv.tipo === 'gasto';
      const anulado = !esValido(mv);

      fila.values = [
        fechaLegible(mv.fecha, true, tx.locale),
        esGasto ? tx.gasto : tx.ingreso,
        mv.descripcion || '—',
        mv.categoria,
        mv.metodo_pago,
        (esGasto ? -1 : 1) * Number(mv.monto),
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
        fila.eachCell((c) => {
          c.font = { ...(c.font ?? {}), strike: true, color: { argb: 'FF9AA5A0' }, italic: true };
        });
        fila.getCell(7).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: ROJO } };
      }
    });

    const fTotal = 7 + ordenados.length;
    const total = h.getRow(fTotal);
    // El total sale del resumen, que ya deja afuera las anuladas.
    total.values = ['', '', tx.totalSinAnulados, '', '', teQuedo, ''];
    total.height = 22;
    total.eachCell((c, n) => {
      c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: n === 6 ? 'right' : 'left' };
      if (n === 6) c.numFmt = fmt;
    });

    if (ordenados.length > 0) {
      h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ordenados.length, column: 7 } };
    }
  }

  // ==========================================================
  // HOJA 6 · DÍA POR DÍA
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
      // Para una persona no hay ventas: lo que entró es todo junto.
      const entroDia = d.ventas + d.otrosIngresos;
      const diferencia = entroDia - d.gastos;
      const fila = h.getRow(7 + i);
      fila.values = ['', fechaLegible(d.fecha, true, tx.locale), entroDia, d.gastos, diferencia];
      fila.height = 18;
      fila.eachCell((c, n) => {
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
        if (n >= 3) c.numFmt = fmt;
        if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      });
      fila.getCell(5).font = {
        name: 'Calibri', size: 10, bold: true,
        color: { argb: diferencia >= 0 ? VERDE : ROJO },
      };
    });

    const fTotal = 7 + serie.length;
    const total = h.getRow(fTotal);
    total.values = ['', 'TOTAL', entro, salio, teQuedo];
    total.height = 22;
    total.eachCell((c, n) => {
      c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
      if (n >= 3) c.numFmt = fmt;
    });
  }

  return libro;
}

/**
 * La tabla de categorías, que las dos hojas de desglose comparten.
 *
 * Son idénticas salvo los títulos: escribirlas dos veces garantizaba que el
 * día que se ajuste una, la otra quede distinta.
 */
export function tablaDeCategorias(
  h: ExcelJS.Worksheet,
  filas: FilaCategoria[],
  total: number,
  fmt: string,
  fmtPorc: string,
  siNoHay: string,
) {
  filas.forEach((c, i) => {
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
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
    });
  });

  if (filas.length === 0) {
    const fila = h.getRow(7);
    h.mergeCells('B7:E7');
    const c = fila.getCell(2);
    c.value = siNoHay;
    c.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF8A968F' } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    fila.height = 20;
    return;
  }

  const fTotal = 7 + filas.length;
  const fila = h.getRow(fTotal);
  fila.values = ['', 'TOTAL', total, filas.reduce((s, c) => s + c.operaciones, 0), 100];
  fila.height = 22;
  fila.eachCell((c, n) => {
    c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
    c.alignment = { vertical: 'middle', horizontal: n === 2 ? 'left' : 'right' };
    if (n === 3) c.numFmt = fmt;
    if (n === 4) c.numFmt = '#,##0';
    if (n === 5) c.numFmt = fmtPorc;
  });
}

export function nombreArchivo(empresa: string, desde: string, hasta: string, moneda?: string, idioma?: string): string {
  const tx = textosExcel(idioma);
  const limpio = empresa.replace(/[^\p{L}\p{N} ]/gu, '').trim() || tx.negocio;
  // En otra moneda se dice en el nombre: dos archivos del mismo mes, uno en
  // guaraníes y otro en dólares, no pueden llamarse igual.
  const enOtra = moneda ? tx.enMoneda(moneda) : '';
  return `Orden ${limpio} ${desde}${desde === hasta ? '' : ` a ${hasta}`}${enOtra}.xlsx`;
}

/**
 * Lo que dice arriba de cada hoja. Con los números convertidos dice además a
 * qué cambio: sin eso, quien abra en seis meses un Excel en dólares de un
 * negocio en guaraníes no tendría cómo saber de dónde salió cada número.
 */
export function textoPeriodo(desde: string, hasta: string, empresa: DatosReporte['empresa'], tx: TextosExcel): string {
  const fecha = (iso: string) => fechaLegible(iso, true, tx.locale);
  const periodo = desde === hasta
    ? tx.periodoUnDia(fecha(desde))
    : tx.periodoRango(fecha(desde), fecha(hasta));
  const c = empresa.conversion;
  if (!c || !c.cotizacion) return periodo;
  const cuando = c.desde ? fecha(c.desde.slice(0, 10)) : null;
  // Un negocio en dólares que mira en guaraníes guarda 1/6.000 (100): se
  // dice al revés, «1 US$ = Gs. 6.000», que es como se piensa.
  if (c.cotizacion < 1) {
    const inverso = (1 / c.cotizacion).toLocaleString(tx.locale, { maximumFractionDigits: 2 });
    return tx.conCambioInverso(periodo, simboloDe(empresa.moneda), cuando, simboloDe(c.propia), inverso);
  }
  const cambio = c.cotizacion.toLocaleString(tx.locale, { maximumFractionDigits: 6 });
  return tx.conCambio(periodo, simboloDe(empresa.moneda), cuando, simboloDe(c.propia), cambio);
}

/**
 * Qué campos del resumen son plata. Los demás son conteos, porcentajes o
 * banderas, y se quedan como están.
 *
 * Una prueba revisa que cada campo del resumen esté en una de las dos
 * listas. El día que el resumen sume un campo de plata y nadie lo agregue
 * acá, el Excel en dólares lo mostraría en guaraníes con el símbolo del
 * dólar: exactamente el error que esto viene a evitar.
 */
export const RESUMEN_PLATA: (keyof Resumen)[] = [
  'ventas', 'ventasBrutas', 'descuentos', 'otrosIngresos', 'ingresosTotales', 'costoMercaderia',
  'gananciaBruta', 'gastos', 'gananciaNeta', 'ticketPromedio', 'montoVentasAnuladas',
  'montoMovimientosAnulados',
  // La compra de mercadería aparte y lo pagado a profesionales a comisión (106).
  'comprasMercaderia', 'pagadoAProfesionales',
];

export const RESUMEN_NO_PLATA: (keyof Resumen)[] = [
  'margenBruto', 'margenNeto', 'cantidadVentas', 'unidadesVendidas', 'ventasAnuladas',
  'movimientosAnulados', 'conCostos', 'mercaderiaAparte',
];

/**
 * Un resumen en la moneda de la vista, con la misma lista de campos de plata
 * que usa `enLaMonedaDeLaVista`. Lo usa la ruta para el resumen del período
 * anterior, que va aparte (la columna «Antes» de los libros por rubro).
 */
export function resumenEnLaMoneda(r: Resumen, c: Conversor): Resumen {
  if (!c.convierte) return r;
  const copia = { ...r };
  for (const campo of RESUMEN_PLATA) (copia as any)[campo] = c.x(r[campo] as number);
  return copia;
}

/**
 * EL EXCEL EN LA MONEDA QUE SE ESTÁ MIRANDO (051)
 *
 * Si el negocio mira sus números en otra moneda, el Excel sale en esa, con el
 * mismo cambio que las pantallas: bajar el archivo no puede mostrar otros
 * números que los que se estaban viendo.
 *
 * Se convierte ANTES de armar el libro y no celda por celda. El libro tiene
 * decenas de celdas de plata, y la que se olvidara saldría en la moneda de
 * al lado con el símbolo de la otra. Acá hay un solo lugar donde mirar.
 *
 * El redondeo a millonésimas solo saca el ruido de la coma flotante
 * (450.000 × 1/7.500 da 60,00000000000001): no cambia ningún número que se
 * vea, y deja limpia la celda para quien copie el valor.
 */
export function enLaMonedaDeLaVista(
  datos: DatosReporte,
  vista: { moneda: string; factor: number; propia: string; cotizacion: number | null; desde: string | null },
): DatosReporte {
  if (vista.moneda === vista.propia || !(vista.factor > 0)) return datos;
  const k = vista.factor;
  const x = (n: number) => Math.round(Number(n) * k * 1e6) / 1e6;
  // Lo que falta sigue faltando: un costo que no se ve no pasa a ser cero.
  const xn = (n: number | null) => (n === null || n === undefined ? null : x(n));
  // Lo que en los tipos es un número pero en una fila vieja puede venir
  // vacío: se deja vacío, para que la hoja caiga en su valor de respaldo.
  const xs = (n: number) => (n === null || n === undefined ? n : x(n));

  const resumen = { ...datos.resumen };
  for (const campo of RESUMEN_PLATA) (resumen as any)[campo] = x(datos.resumen[campo] as number);

  return {
    ...datos,
    empresa: {
      ...datos.empresa,
      moneda: vista.moneda,
      conversion: { propia: vista.propia, cotizacion: vista.cotizacion, desde: vista.desde },
    },
    resumen,
    ranking: datos.ranking.map((p) => ({
      ...p,
      ingresosBrutos: x(p.ingresosBrutos), descuento: x(p.descuento), ingresos: x(p.ingresos),
      costo: xn(p.costo), ganancia: xn(p.ganancia),
    })),
    categorias: datos.categorias.map((c) => ({ ...c, monto: x(c.monto) })),
    ingresos: datos.ingresos.map((c) => ({ ...c, monto: x(c.monto) })),
    ahorro: {
      ...datos.ahorro,
      aportado: x(datos.ahorro.aportado), retirado: x(datos.ahorro.retirado), neto: x(datos.ahorro.neto),
      porFondo: datos.ahorro.porFondo.map((f) => ({
        ...f, aportado: x(f.aportado), retirado: x(f.retirado), neto: x(f.neto), saldo_hoy: x(f.saldo_hoy),
      })),
    },
    serie: datos.serie.map((d) => ({
      ...d, ventas: x(d.ventas), gastos: x(d.gastos), otrosIngresos: x(d.otrosIngresos), ganancia: xn(d.ganancia),
      // Pueden no venir (una serie armada antes de la 106): lo que falta sigue faltando.
      comprasMercaderia: xs(d.comprasMercaderia), pagadoAProfesionales: xn(d.pagadoAProfesionales),
    })),
    movimientos: datos.movimientos.map((m) => ({
      ...m,
      subtotal: xs(m.subtotal), descuento: xs(m.descuento), monto: x(m.monto), costo_total: xn(m.costo_total),
      movimiento_items: m.movimiento_items?.map((i) => ({
        ...i, precio_unitario: x(i.precio_unitario), costo_unitario: xn(i.costo_unitario),
      })),
    })),
    productosBd: datos.productosBd.map((p) => ({ ...p, precio: x(p.precio), costo: xn(p.costo) })),
    // Las campañas y las liquidaciones (100): la plata se convierte, los
    // kilos y las hectáreas no. Lo que es de administración y llega null
    // sigue null. `precio_original` queda como vino en el papel: ya está en
    // su propia moneda (`moneda_original`).
    campanas: datos.campanas?.map((l) => ({
      ...l,
      puesto: x(l.puesto), cobrado: x(l.cobrado), resultado: x(l.resultado), vendido: x(l.vendido),
      por_unidad: xn(l.por_unidad), a_cosecha: xn(l.a_cosecha), costo: xn(l.costo), costo_ha: xn(l.costo_ha),
      resultado_ha: xn(l.resultado_ha), precio_promedio: xn(l.precio_promedio), precio_ref: xn(l.precio_ref),
      precio_esperado: xn(l.precio_esperado), costo_ton: xn(l.costo_ton), falta_cubrir: xn(l.falta_cubrir),
    })),
    liquidaciones: datos.liquidaciones?.map((q) => ({
      ...q,
      precio_tonelada: x(q.precio_tonelada), bruto: x(q.bruto), neto: x(q.neto),
      descuentos: xn(q.descuentos), compensado: xn(q.compensado), pagado_con_grano: xn(q.pagado_con_grano),
    })),
  };
}
