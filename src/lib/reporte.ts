import ExcelJS from 'exceljs';
import {
  esValido,
  type AhorroDelPeriodo, type FilaCategoria, type FilaDia, type FilaProducto, type Resumen,
} from './calculos';
import { decimalesDe, simboloDe, fechaLegible } from './formato';
import type { Movimiento, Producto } from './tipos';

const VERDE = 'FF17795A';
const VERDE_SUAVE = 'FFE6F4EE';
const TINTA = 'FF0D1B16';
const ROJO = 'FFC0392B';
const GRIS = 'FFF6F7F5';
const BORDE = 'FFE3E7E4';

const bordeFino: Partial<ExcelJS.Borders> = {
  bottom: { style: 'thin', color: { argb: BORDE } },
};

function formatoMoneda(moneda: string) {
  const s = simboloDe(moneda);
  return decimalesDe(moneda) === 0 ? `"${s}" #,##0;[Red]-"${s}" #,##0` : `"${s}" #,##0.00;[Red]-"${s}" #,##0.00`;
}

/** Encabezado con el nombre del negocio, el periodo y la fecha de emisión. */
function encabezado(hoja: ExcelJS.Worksheet, empresa: string, titulo: string, periodo: string, columnas: number) {
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

function filaEncabezadoTabla(hoja: ExcelJS.Worksheet, fila: number, titulos: string[]) {
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
}

/** Arma el libro de Excel completo. Función pura: no toca red ni base de datos. */
export function construirLibro(datos: DatosReporte): ExcelJS.Workbook {
  // Una persona y un comercio no comparten casi ninguna hoja, así que cada
  // uno tiene su función. Ver el comentario de `libroPersonal` al final.
  if (datos.empresa.tipo_cuenta === 'personal') return libroPersonal(datos);
  return libroDeNegocio(datos);
}

function libroDeNegocio({
  empresa, desde, hasta, resumen, ranking, categorias, serie, movimientos, productosBd,
}: DatosReporte): ExcelJS.Workbook {
  const moneda = empresa.moneda;
  const cicloLargo = empresa.rubro === 'ganaderia' || empresa.rubro === 'agricultura';
  const fmt = formatoMoneda(moneda);
  const fmtPorc = '0.0"%"';
  const fmtNum = '#,##0.##';

  const r = resumen;
  const productos = ranking;
  const dias = serie.map((d) => d.fecha);
  const periodo = desde === hasta
    ? `Periodo: ${fechaLegible(desde)}`
    : `Periodo: ${fechaLegible(desde)} al ${fechaLegible(hasta)}`;

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Orden';
  libro.created = new Date();

  // ==========================================================
  // HOJA 1 · RESUMEN
  // ==========================================================
  {
    const h = libro.addWorksheet('Resumen', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [
      { width: 4 }, { width: 34 }, { width: 20 }, { width: 20 }, { width: 4 },
    ];
    encabezado(h, empresa.nombre, 'RESUMEN EJECUTIVO', periodo, 5);

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

    bloque('Entró plata');
    linea('Ventas a precio de lista', r.ventasBrutas, { nota: `${r.cantidadVentas} operaciones` });
    if (r.descuentos > 0) {
      linea('Descuentos otorgados', -r.descuentos, { color: ROJO });
    }
    linea('Ventas cobradas', r.ventas, { fuerte: true });
    linea('Otros ingresos', r.otrosIngresos);
    linea('Total que entró', r.ingresosTotales, { fuerte: true, color: VERDE });
    f += 1;

    bloque('Costos y gastos');
    linea('Costo de la mercadería vendida', r.costoMercaderia, { color: ROJO });
    linea('Gastos operativos', r.gastos, { color: ROJO });
    linea('Total que salió', r.costoMercaderia + r.gastos, { fuerte: true, color: ROJO });
    f += 1;

    bloque('Resultado');
    linea('Ganancia bruta', r.gananciaBruta, { fuerte: true, nota: `margen ${r.margenBruto.toFixed(1)}%` });
    linea('Ganancia neta', r.gananciaNeta, { fuerte: true, color: r.gananciaNeta >= 0 ? VERDE : ROJO, nota: `margen ${r.margenNeto.toFixed(1)}%` });
    f += 1;

    bloque('Indicadores');
    linea('Ticket promedio', r.ticketPromedio);
    linea('Unidades vendidas', r.unidadesVendidas, { formato: fmtNum });
    linea('Productos distintos vendidos', productos.length, { formato: '#,##0' });
    linea('Promedio de ventas por día', dias.length ? r.ventas / dias.length : 0);
    if (r.ventasAnuladas > 0) {
      linea('Ventas anuladas', r.ventasAnuladas, { formato: '#,##0', nota: 'no suman en ningún total' });
      linea('Monto de ventas anuladas', r.montoVentasAnuladas, { color: ROJO });
    }
    f += 2;

    // Destacados
    const mejor = productos[0];
    const mayorGasto = movimientos.filter((m) => m.tipo === 'gasto').sort((a, b) => Number(b.monto) - Number(a.monto))[0];

    h.mergeCells(`B${f}:D${f}`);
    const dc = h.getCell(`B${f}`);
    dc.value = 'PARA TENER EN CUENTA';
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

    if (mejor) {
      const detalleGanancia = mejor.ganancia === null
        ? ''
        : `, ganancia ${simboloDe(moneda)} ${Math.round(mejor.ganancia).toLocaleString('es-PY')}`;
      nota(`Lo que más dejó: ${mejor.nombre} — ${mejor.unidades.toLocaleString('es-PY')} unidades${detalleGanancia}`);
    }
    if (mayorGasto) nota(`El gasto más grande: ${mayorGasto.descripcion} — ${simboloDe(moneda)} ${Math.round(Number(mayorGasto.monto)).toLocaleString('es-PY')}`);
    if (r.gananciaNeta < 0) nota('Atención: en este periodo gastaste más de lo que ganaste.');
    if (r.descuentos > 0) {
      const pct = r.ventasBrutas > 0 ? (r.descuentos / r.ventasBrutas) * 100 : 0;
      nota(`Diste ${simboloDe(moneda)} ${Math.round(r.descuentos).toLocaleString('es-PY')} en descuentos: el ${pct.toFixed(1)}% de tu precio de lista.`);
    }
    if (r.movimientosAnulados > 0) {
      nota(`Se anularon ${r.movimientosAnulados} movimiento(s), de los cuales ${r.ventasAnuladas} son ventas. `
        + 'Figuran en el detalle pero no suman en ningún total.');
    }
    // Para un comercio, no haber vendido nada es un dato —y probablemente un
    // problema que mirar—, así que se dice. La versión de esta frase para una
    // cuenta personal está en `libroPersonal`: ahí no hay ventas nunca, y
    // señalarlo sería acusar a alguien de no hacer algo que ni se le ofrece.
    if (productos.length === 0) {
      nota('No se registraron ventas en este periodo.');
    }
  }

  // ==========================================================
  // HOJA 2 · PRODUCTOS
  // ==========================================================
  {
    const h = libro.addWorksheet('Productos', {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [
      { width: 5 }, { width: 32 }, { width: 11 }, { width: 15 }, { width: 14 },
      { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 13 },
    ];
    encabezado(h, empresa.nombre, 'PRODUCTOS VENDIDOS · DE MAYOR A MENOR', periodo, 10);

    filaEncabezadoTabla(h, 6, ['#', 'Producto', 'Unidades', 'Precio lista', 'Descuento', 'Cobrado', 'Costo', 'Ganancia', 'Margen', 'Participación']);

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

    // Productos que no se movieron
    const vendidos = new Set(productos.map((p) => p.producto_id).filter(Boolean) as string[]);
    const quietos = (productosBd ?? []).filter((p: any) => !vendidos.has(p.id));
    if (quietos.length > 0) {
      let f = fTotal + 3;
      h.mergeCells(`B${f}:G${f}`);
      const t = h.getCell(`B${f}`);
      t.value = `NO SE VENDIERON EN ESTE PERIODO (${quietos.length})`;
      t.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF6B7C75' } };
      f += 1;
      filaEncabezadoTabla(h, f, ['', 'Producto', 'Stock', 'Precio', 'Costo', 'Plata parada']);
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
    const h = libro.addWorksheet('Movimientos', {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [
      { width: 12 }, { width: 11 }, { width: 36 }, { width: 16 }, { width: 14 },
      { width: 15 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 17 },
    ];
    encabezado(h, empresa.nombre, 'DETALLE DE MOVIMIENTOS', periodo, 11);

    filaEncabezadoTabla(h, 6, [
      'Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cobro/Pago',
      'Subtotal', 'Descuento', 'Cobrado', 'Costo', 'Ganancia', 'Estado',
    ]);

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
        fechaLegible(mv.fecha),
        mv.tipo === 'venta' ? 'Venta' : esGasto ? 'Gasto' : 'Ingreso',
        mv.descripcion || '—',
        mv.categoria,
        mv.metodo_pago,
        signo * Number(mv.subtotal ?? mv.monto),
        -Number(mv.descuento ?? 0),
        signo * Number(mv.monto),
        Number(mv.costo_total ?? 0),
        ganancia,
        anulado ? `ANULADA${mv.motivo_anulacion ? ` · ${mv.motivo_anulacion}` : ''}` : 'Válida',
      ];
      fila.height = 18;
      fila.eachCell((c, n) => {
        c.font = { name: 'Calibri', size: 10 };
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n >= 6 && n <= 10 ? 'right' : n === 3 || n === 11 ? 'left' : 'center' };
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
      '', '', 'TOTAL DEL PERIODO (sin anuladas)', '', '',
      r.ventasBrutas + r.otrosIngresos - r.gastos,
      -r.descuentos,
      r.ingresosTotales - r.gastos,
      r.costoMercaderia,
      r.gananciaNeta,
      '',
    ];
    total.height = 22;
    total.eachCell((c, n) => {
      c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
      c.alignment = { vertical: 'middle', horizontal: n >= 6 ? 'right' : 'left' };
      if (n >= 6 && n <= 10) c.numFmt = fmt;
    });

    if (ordenados.length > 0) {
      h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + ordenados.length, column: 11 } };
    }
  }

  // ==========================================================
  // HOJA 4 · GASTOS
  // ==========================================================
  {
    const h = libro.addWorksheet('Gastos', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 32 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 5 }];
    encabezado(h, empresa.nombre, 'EN QUÉ SE FUE LA PLATA', periodo, 6);

    filaEncabezadoTabla(h, 6, ['#', 'Categoría', 'Total gastado', 'Movimientos', 'Del total']);

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
  if (!cicloLargo) {
    const h = libro.addWorksheet('Día por día', {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 5 }];
    encabezado(h, empresa.nombre, 'RESULTADO DE CADA DÍA', periodo, 6);

    filaEncabezadoTabla(h, 6, ['', 'Fecha', 'Vendido', 'Gastado', 'Ganancia del día']);

    serie.forEach((d, i) => {
      const fila = h.getRow(7 + i);
      fila.values = ['', fechaLegible(d.fecha), d.ventas, d.gastos, d.ganancia ?? null];
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
function libroPersonal({
  empresa, desde, hasta, resumen, categorias, ingresos, ahorro, serie, movimientos,
}: DatosReporte): ExcelJS.Workbook {
  const moneda = empresa.moneda;
  const fmt = formatoMoneda(moneda);
  const fmtPorc = '0.0"%"';
  const r = resumen;

  const entro = r.ingresosTotales;
  const salio = r.gastos;
  const teQuedo = entro - salio;

  const periodo = desde === hasta
    ? `Periodo: ${fechaLegible(desde)}`
    : `Periodo: ${fechaLegible(desde)} al ${fechaLegible(hasta)}`;

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
    const h = libro.addWorksheet('Resumen', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [{ width: 4 }, { width: 34 }, { width: 20 }, { width: 20 }, { width: 4 }];
    encabezado(h, empresa.nombre, 'TUS NÚMEROS DEL PERIODO', periodo, 5);

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
    bloque('Lo que entró');
    if (ingresos.length === 0) {
      linea('Todavía no cargaste ningún ingreso', 0);
    } else {
      ingresos.forEach((i) => {
        linea(i.nombre, i.monto, {
          nota: i.operaciones === 1 ? '1 vez' : `${i.operaciones} veces`,
        });
      });
    }
    linea('Total que entró', entro, { fuerte: true, color: VERDE });
    f += 1;

    // ---- en qué se fue ----
    bloque('Lo que salió');
    if (categorias.length === 0) {
      linea('Todavía no cargaste ningún gasto', 0);
    } else {
      // Las cinco más caras. El detalle completo tiene su propia hoja: acá
      // repetir veinte categorías taparía el número que importa.
      categorias.slice(0, 5).forEach((c) => {
        linea(c.nombre, c.monto, { color: ROJO, nota: `${c.participacion.toFixed(1)}% de tus gastos` });
      });
      if (categorias.length > 5) {
        const resto = categorias.slice(5).reduce((s, c) => s + c.monto, 0);
        linea(`Otras ${categorias.length - 5} categorías`, resto, { color: ROJO });
      }
    }
    linea('Total que salió', salio, { fuerte: true, color: ROJO });
    f += 1;

    // ---- el ahorro, que no es ninguna de las dos cosas ----
    if (huboAhorro) {
      bloque('Lo que guardaste');
      linea('Depositado en tus fondos', ahorro.aportado, { color: VERDE });
      if (ahorro.retirado > 0) linea('Retirado de tus fondos', -ahorro.retirado, { color: ROJO });
      linea('Guardado en el periodo', ahorro.neto, { fuerte: true });
      f += 1;
    }

    // ---- el número ----
    bloque('Resultado');
    linea('Te quedó', teQuedo, {
      fuerte: true,
      color: teQuedo >= 0 ? VERDE : ROJO,
      nota: 'lo que entró menos lo que salió',
    });
    if (huboAhorro && ahorro.neto > 0) {
      linea('De eso, ya está guardado', ahorro.neto, {
        nota: 'sigue siendo tuyo, no es un gasto',
      });
    }
    f += 1;

    bloque('Para mirarlo de cerca');
    linea('Gasto promedio por día', salio / dias, { nota: `${dias} días del periodo` });
    linea('Días en que cargaste algo', serie.length, { formato: '#,##0' });
    if (entro > 0) {
      linea('Del total que entró, gastaste', (salio / entro) * 100, { formato: fmtPorc });
    }
    if (r.movimientosAnulados > 0) {
      linea('Movimientos anulados', r.movimientosAnulados, {
        formato: '#,##0', nota: 'no suman en ningún total',
      });
    }
    f += 2;

    // ---- para tener en cuenta ----
    h.mergeCells(`B${f}:D${f}`);
    const dc = h.getCell(`B${f}`);
    dc.value = 'PARA TENER EN CUENTA';
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
    const enPlata = (n: number) => `${simbolo} ${Math.round(n).toLocaleString('es-PY')}`;

    const mayorGasto = movimientos
      .filter((m) => m.tipo === 'gasto' && esValido(m))
      .sort((a, b) => Number(b.monto) - Number(a.monto))[0];

    if (categorias[0]) {
      nota(`Donde más se te fue: ${categorias[0].nombre} — ${enPlata(categorias[0].monto)}, `
        + `el ${categorias[0].participacion.toFixed(1)}% de todo lo que gastaste.`);
    }
    if (mayorGasto) {
      nota(`El gasto más grande: ${mayorGasto.descripcion || 'sin descripción'} — ${enPlata(Number(mayorGasto.monto))}.`);
    }
    if (huboAhorro && ahorro.neto > 0) {
      nota(`Guardaste ${enPlata(ahorro.neto)} en el periodo. Esa plata no figura como gasto en ninguna hoja: la seguís teniendo.`);
    }

    // Cuando no hay nada que destacar, el archivo dice algo útil en vez de
    // señalar un vacío. Un reporte que solo marca lo que falta no invita a
    // volver a abrirlo.
    if (entro === 0 && salio === 0) {
      nota('Todavía no cargaste nada en este periodo. Contale un gasto por voz y en diez segundos ya tenés tu primer número.');
    } else if (salio > 0 && entro === 0) {
      nota('Cargaste gastos pero ningún ingreso. Anotá tu sueldo y vas a ver de verdad cuánto te queda cada mes.');
    } else if (teQuedo < 0) {
      nota(`En este periodo gastaste ${enPlata(Math.abs(teQuedo))} más de lo que entró.`);
    } else if (teQuedo > 0 && !huboAhorro) {
      nota(`Te quedaron ${enPlata(teQuedo)} sin gastar. Si creás un fondo de ahorro, esa plata deja de estar suelta y le ponés un destino.`);
    }
  }

  // ==========================================================
  // HOJA 2 · EN QUÉ SE FUE
  // ==========================================================
  {
    const h = libro.addWorksheet('En qué se fue', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 32 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 5 }];
    encabezado(h, empresa.nombre, 'EN QUÉ SE FUE LA PLATA', periodo, 6);

    filaEncabezadoTabla(h, 6, ['#', 'Categoría', 'Total gastado', 'Movimientos', 'Del total']);
    tablaDeCategorias(h, categorias, salio, fmt, fmtPorc, 'Nada gastado en este periodo.');
  }

  // ==========================================================
  // HOJA 3 · DE DÓNDE VINO
  //
  // El espejo de la anterior, y para una persona con sueldo es la que
  // contesta la pregunta de fondo: qué parte de lo que entra se repite el mes
  // que viene y qué parte fue de una sola vez.
  // ==========================================================
  {
    const h = libro.addWorksheet('De dónde vino', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 32 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 5 }];
    encabezado(h, empresa.nombre, 'DE DÓNDE VINO LA PLATA', periodo, 6);

    filaEncabezadoTabla(h, 6, ['#', 'Categoría', 'Total que entró', 'Veces', 'Del total']);
    tablaDeCategorias(h, ingresos, entro, fmt, fmtPorc, 'Nada cargado en este periodo.');
  }

  // ==========================================================
  // HOJA 4 · AHORRO
  //
  // Solo si hubo movimiento. Una hoja de ahorro vacía para alguien que no
  // usa fondos es exactamente el problema que esta planilla vino a corregir.
  // ==========================================================
  if (huboAhorro) {
    const h = libro.addWorksheet('Ahorro', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [
      { width: 5 }, { width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 5 },
    ];
    encabezado(h, empresa.nombre, 'TUS FONDOS DE AHORRO', periodo, 7);

    filaEncabezadoTabla(h, 6, ['#', 'Fondo', 'Depositado', 'Retirado', 'Guardado', 'Saldo a hoy']);

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
    c.value = 'La columna «Saldo a hoy» es el total acumulado de cada fondo, de siempre: '
      + 'no pertenece al periodo de esta planilla y por eso no se suma en la fila del total.';
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
    const h = libro.addWorksheet('Movimientos', {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    });
    h.columns = [
      { width: 13 }, { width: 11 }, { width: 42 }, { width: 20 }, { width: 16 }, { width: 18 }, { width: 20 },
    ];
    encabezado(h, empresa.nombre, 'TODO LO QUE CARGASTE', periodo, 7);

    filaEncabezadoTabla(h, 6, ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cómo', 'Monto', 'Estado']);

    const ordenados = [...movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

    ordenados.forEach((mv, i) => {
      const fila = h.getRow(7 + i);
      const esGasto = mv.tipo === 'gasto';
      const anulado = !esValido(mv);

      fila.values = [
        fechaLegible(mv.fecha),
        esGasto ? 'Gasto' : 'Ingreso',
        mv.descripcion || '—',
        mv.categoria,
        mv.metodo_pago,
        (esGasto ? -1 : 1) * Number(mv.monto),
        anulado ? `ANULADO${mv.motivo_anulacion ? ` · ${mv.motivo_anulacion}` : ''}` : 'Válido',
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
    total.values = ['', '', 'TOTAL DEL PERIODO (sin anulados)', '', '', teQuedo, ''];
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
    const h = libro.addWorksheet('Día por día', {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, horizontalCentered: true },
    });
    h.columns = [{ width: 5 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 5 }];
    encabezado(h, empresa.nombre, 'CÓMO VINO CADA DÍA', periodo, 6);

    filaEncabezadoTabla(h, 6, ['', 'Fecha', 'Entró', 'Salió', 'Diferencia']);

    serie.forEach((d, i) => {
      // Para una persona no hay ventas: lo que entró es todo junto.
      const entroDia = d.ventas + d.otrosIngresos;
      const diferencia = entroDia - d.gastos;
      const fila = h.getRow(7 + i);
      fila.values = ['', fechaLegible(d.fecha), entroDia, d.gastos, diferencia];
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
function tablaDeCategorias(
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

export function nombreArchivo(empresa: string, desde: string, hasta: string): string {
  const limpio = empresa.replace(/[^\p{L}\p{N} ]/gu, '').trim() || 'Negocio';
  return `Orden ${limpio} ${desde}${desde === hasta ? '' : ` a ${hasta}`}.xlsx`;
}
