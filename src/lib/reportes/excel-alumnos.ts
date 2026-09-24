import ExcelJS from 'exceljs';
import { esValido } from '../calculos';
import { fechaLegible } from '../formato';
import {
  GRIS, ROJO, TINTA, VERDE, VERDE_SUAVE, bordeFino, encabezado, filaEncabezadoTabla, formatoMoneda,
  tablaDeCategorias, textoPeriodo,
} from '../reporte';
import { textosExcel } from '../reporte-textos';
import type { FichaRubro } from '../rubros';
import type { PorCobrarAlumnos, ProgresoClientes, ReporteAlumnos } from '../tipos';
import type { Conversor, DatosBaseLibro, HojaDelLibro } from './comun';
import { textosAlumnosExcel } from './textos-alumnos';

/**
 * EL EXCEL DEL PROFE Y DEL PERSONAL TRAINER (23/09).
 *
 * Hasta acá bajaban el libro de un almacén: una hoja de productos con sus
 * paquetes a margen 100 % (el paquete se guarda con costo 0), «unidades
 * vendidas», ticket promedio y un día por día casi vacío, porque un profe
 * cobra dos o tres veces al mes. Nada de eso le contesta lo que se pregunta.
 *
 * Este libro contesta sus preguntas, en este orden:
 *
 *   1. Resumen: cobrado, gastos y lo que le quedó, contra el período
 *      anterior (el mismo que la flecha de la pantalla); las clases dadas y
 *      las faltas, lo cobrado por clase, los alumnos activos y nuevos, los
 *      paquetes que se vendieron, terminaron, vencieron y renovaron; y lo que
 *      le deben HOY.
 *   2. Por cobrar: quién le debe, qué paquete y desde cuándo (a hoy).
 *   3. Cobros: el libro de ingresos (fecha, alumno, paquete, monto, forma de
 *      pago y cuenta). Es lo más útil que se le puede dar al contador sin
 *      inventar datos: Orden no guarda RUC, timbrado ni IVA del alumno.
 *   4. Asistencia: clases dadas y faltas por semana y por alumno, desde
 *      `clases_dadas` (NO desde los turnos: `dar_clase` guarda clases sin
 *      turno, y contar turnos las perdía).
 *   5. Alumnos: una fila por alumno.
 *   6. Gastos: por categoría y cada gasto.
 *   7. Progreso: solo el trainer (el que tiene rutinas y medidas).
 *
 * Con las palabras del oficio: el trainer lee «sesiones», «clientes» y
 * «planes» (ver textos-alumnos.ts).
 *
 * Función pura: recibe todo leído y convertido a la moneda de la vista. Los
 * números salen de la base (`reporte_alumnos`, `por_cobrar_alumnos`,
 * `progreso_clientes`, `resumen_financiero`) y son los mismos que muestra la
 * pantalla (`ReporteAlumnos.tsx`); acá no se recalcula nada que la pantalla
 * no muestre igual.
 */

/** Lo que el libro de alumnos lee además de lo común. */
export interface ExtrasAlumnos {
  /** `reporte_alumnos` del período (106). */
  alumnos: ReporteAlumnos;
  /** `por_cobrar_alumnos` (094): las inscripciones sin cobrar, a hoy. */
  porCobrar: PorCobrarAlumnos;
  /** `progreso_clientes` (106): solo el trainer. Null para el profe. */
  progreso: ProgresoClientes | null;
}

/**
 * ¿Lleva la hoja de progreso? La lleva quien toma medidas y arma rutinas: el
 * trainer. Se mira la sección y no el nombre del rubro, como `varianteDeReporte`.
 */
export function conProgreso(ficha: Pick<FichaRubro, 'secciones'>): boolean {
  return !!ficha.secciones['/rutinas'];
}

/** Las hojas que trae el libro, para la tarjeta de descarga. Todas salen siempre. */
export function hojasAlumnos(ficha: Pick<FichaRubro, 'secciones' | 'jerga'>, idioma?: string): HojaDelLibro[] {
  const tx = textosExcel(idioma);
  const ta = textosAlumnosExcel(idioma, ficha.jerga);
  return [
    { nombre: tx.hojaResumen },
    { nombre: ta.hojaPorCobrar },
    { nombre: ta.hojaCobros },
    { nombre: ta.hojaAsistencia },
    { nombre: ta.hojaAlumnos },
    { nombre: tx.hojaGastos },
    ...(conProgreso(ficha) ? [{ nombre: ta.hojaProgreso }] : []),
  ];
}

/**
 * La respuesta de `por_cobrar_alumnos` (094) en números. La leen la pantalla y
 * la ruta del Excel, así las dos la entienden igual.
 */
export function mapearPorCobrar(j: any): PorCobrarAlumnos {
  const lista = Array.isArray(j?.lista) ? j.lista : [];
  return {
    total: Number(j?.total ?? 0) || 0,
    lista: lista.map((f: any) => ({
      paquete: String(f.paquete), cliente_id: String(f.cliente_id), alumno: String(f.alumno ?? ''),
      nombre: String(f.nombre ?? ''), materia: f.materia ?? null, monto: Number(f.monto ?? 0) || 0,
      desde: f.desde ?? null, hasta: f.hasta ?? null,
    })),
  };
}

/**
 * Los extras en la moneda de la vista (051). Solo la plata: clases, conteos
 * y medidas no son plata. Lo que falta sigue faltando (`xn`).
 */
export function enLaVistaAlumnos(e: ExtrasAlumnos, c: Conversor): ExtrasAlumnos {
  if (!c.convierte) return e;
  const a = e.alumnos;
  return {
    alumnos: {
      ...a,
      cobrado: c.x(a.cobrado),
      cobrado_por_clase: c.xn(a.cobrado_por_clase),
      por_cobrar: c.x(a.por_cobrar),
      fiado_pendiente: c.x(a.fiado_pendiente),
      alumnos: a.alumnos.map((f) => ({
        ...f, cobrado: c.x(f.cobrado), debe: c.x(f.debe),
        debe_inscripciones: c.x(f.debe_inscripciones), debe_fiado: c.x(f.debe_fiado),
      })),
      por_paquete: a.por_paquete.map((f) => ({ ...f, cobrado: c.x(f.cobrado) })),
      por_materia: a.por_materia.map((f) => ({ ...f, cobrado: c.x(f.cobrado) })),
    },
    porCobrar: {
      total: c.x(e.porCobrar.total),
      lista: e.porCobrar.lista.map((f) => ({ ...f, monto: c.x(f.monto) })),
    },
    progreso: e.progreso,
  };
}

/** Asistencia en %: dadas sobre dadas + faltas. Sin ninguna de las dos, no hay número. */
export function asistenciaPct(dadas: number, faltas: number): number | null {
  const total = dadas + faltas;
  return total > 0 ? (dadas / total) * 100 : null;
}

/**
 * Lo que te deben, a hoy: las inscripciones sin cobrar (la lista de
 * `por_cobrar_alumnos`) y el saldo de fiado de cada alumno. La pantalla y el
 * Excel suman con esto: el total es la suma de las filas, sin nada aparte.
 */
export function loQueTeDeben(e: Pick<ExtrasAlumnos, 'alumnos' | 'porCobrar'>) {
  const fiados = e.alumnos.alumnos
    .filter((a) => a.debe_fiado > 0)
    .map((a) => ({ cliente_id: a.cliente_id, alumno: a.nombre, monto: a.debe_fiado }));
  const fiado = fiados.reduce((s, f) => s + f.monto, 0);
  return {
    inscripciones: e.porCobrar.total,
    fiado,
    total: e.porCobrar.total + fiado,
    lista: e.porCobrar.lista,
    fiados,
  };
}

const FUENTE = 'Calibri';

/** Pinta una fila de datos con el estilo de la casa (cebra, borde fino). */
function pintarFila(
  fila: ExcelJS.Row, i: number, formatos: Record<number, string>, izquierda: number[] = [1],
) {
  fila.height = 18;
  // Con las vacías: la cebra y el borde siguen aunque falte un dato.
  fila.eachCell({ includeEmpty: true }, (c, n) => {
    c.font = { name: FUENTE, size: 10 };
    c.border = bordeFino;
    c.alignment = { vertical: 'middle', horizontal: izquierda.includes(n) ? 'left' : 'right' };
    if (formatos[n]) c.numFmt = formatos[n];
    if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
  });
}

/** La fila del total: fondo tinta, letra blanca. */
function pintarTotal(fila: ExcelJS.Row, formatos: Record<number, string>, izquierda: number[] = [1]) {
  fila.height = 22;
  fila.eachCell({ includeEmpty: true }, (c, n) => {
    c.font = { name: FUENTE, size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
    c.alignment = { vertical: 'middle', horizontal: izquierda.includes(n) ? 'left' : 'right' };
    if (formatos[n]) c.numFmt = formatos[n];
  });
}

/** Un renglón de texto en cursiva, a lo ancho: una aclaración o «no hay nada». */
function aclaracion(h: ExcelJS.Worksheet, fila: number, texto: string, columnas: number) {
  const ultima = String.fromCharCode(64 + columnas);
  h.mergeCells(`A${fila}:${ultima}${fila}`);
  const c = h.getCell(`A${fila}`);
  c.value = texto;
  c.font = { name: FUENTE, size: 9.5, italic: true, color: { argb: 'FF8A968F' } };
  c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  h.getRow(fila).height = 30;
}

/** Un subtítulo gris en mayúsculas dentro de una hoja. */
function subtitulo(h: ExcelJS.Worksheet, fila: number, texto: string) {
  const c = h.getCell(`A${fila}`);
  c.value = texto;
  c.font = { name: FUENTE, size: 9, bold: true, color: { argb: 'FF6B7C75' } };
  h.getRow(fila).height = 20;
}

const fecha = (iso: string | null | undefined, locale: string) => (iso ? fechaLegible(iso, true, locale) : '');

export function libroAlumnos(datos: DatosBaseLibro & ExtrasAlumnos): ExcelJS.Workbook {
  const { empresa, desde, hasta, idioma, jerga, resumen: r, resumenPrevio: rp, categorias, movimientos } = datos;
  const a = datos.alumnos;
  const tx = textosExcel(idioma);
  const ta = textosAlumnosExcel(idioma, jerga);
  const fmt = formatoMoneda(empresa.moneda);
  const fmtPorc = '0.0"%"';
  const fmtEntero = '#,##0';
  const periodo = textoPeriodo(desde, hasta, empresa, tx);
  const deben = loQueTeDeben(datos);

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Orden';
  libro.created = new Date();

  const hojaNueva = (nombre: string, horizontal = false, congelar = 0) => libro.addWorksheet(nombre, {
    views: [congelar ? { showGridLines: false, state: 'frozen', ySplit: congelar } : { showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: horizontal ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
    },
  });

  // ==========================================================
  // 1 · RESUMEN
  // ==========================================================
  {
    const h = hojaNueva(tx.hojaResumen);
    h.columns = [{ width: 3 }, { width: 36 }, { width: 18 }, { width: 18 }, { width: 34 }];
    encabezado(h, empresa.nombre, ta.resumenTitulo, periodo, 5);

    let f = 6;
    // La cabecera de las dos columnas: este período y el anterior, con sus fechas.
    {
      const fila = h.getRow(f);
      fila.getCell(3).value = ta.columnaAhora;
      fila.getCell(4).value = ta.columnaAntes;
      fila.getCell(5).value = `${fecha(datos.previo.desde, tx.locale)} – ${fecha(datos.previo.hasta, tx.locale)}`;
      [3, 4, 5].forEach((n) => {
        const c = fila.getCell(n);
        c.font = { name: FUENTE, size: 9, bold: true, color: { argb: 'FF6B7C75' } };
        c.alignment = { vertical: 'middle', horizontal: n === 5 ? 'left' : 'right' };
      });
      fila.height = 18;
      f += 1;
    }

    const bloque = (titulo: string) => {
      const c = h.getCell(`B${f}`);
      c.value = titulo.toUpperCase();
      c.font = { name: FUENTE, size: 9, bold: true, color: { argb: 'FF6B7C75' } };
      h.getRow(f).height = 20;
      f += 1;
    };

    /** Un renglón. `antes` null deja la columna vacía: no se leyó, no es cero. */
    const linea = (etiqueta: string, valor: number, o: {
      antes?: number | null; formato?: string; fuerte?: boolean; color?: string; nota?: string;
    } = {}) => {
      const fila = h.getRow(f);
      const formato = o.formato ?? fmt;
      fila.getCell(2).value = etiqueta;
      fila.getCell(3).value = valor;
      if (o.antes !== undefined && o.antes !== null) fila.getCell(4).value = o.antes;
      if (o.nota) fila.getCell(5).value = o.nota;
      [2, 3, 4, 5].forEach((n) => {
        const c = fila.getCell(n);
        c.border = bordeFino;
        c.alignment = { vertical: 'middle', horizontal: n === 2 || n === 5 ? 'left' : 'right' };
        if (n === 3 || n === 4) c.numFmt = formato;
        c.font = n === 5
          ? { name: FUENTE, size: 9, italic: true, color: { argb: 'FF8A968F' } }
          : {
            name: FUENTE, size: 11, bold: !!o.fuerte,
            color: { argb: n === 3 && o.color ? o.color : n === 4 ? 'FF6B7C75' : TINTA },
          };
      });
      fila.height = 20;
      f += 1;
    };

    bloque(ta.plata);
    linea(ta.cobrado, r.ventas, { antes: rp.ventas, fuerte: true });
    if (r.otrosIngresos > 0 || rp.otrosIngresos > 0) {
      linea(ta.otrosIngresos, r.otrosIngresos, { antes: rp.otrosIngresos, nota: ta.otrosIngresosNota });
      linea(ta.totalQueEntro, r.ingresosTotales, { antes: rp.ingresosTotales, fuerte: true, color: VERDE });
    }
    linea(ta.gastos, r.gastos, { antes: rp.gastos, color: ROJO });
    // Quien no ve costos no tiene «te quedó»: un cero ahí parecería un dato.
    if (r.conCostos) {
      linea(ta.teQuedo, r.gananciaNeta, {
        antes: rp.conCostos ? rp.gananciaNeta : null, fuerte: true, color: r.gananciaNeta >= 0 ? VERDE : ROJO,
      });
    }
    f += 1;

    bloque(ta.tusClases);
    linea(ta.clasesDadas, a.clases_dadas, { formato: fmtEntero, fuerte: true });
    linea(ta.faltas, a.faltas, { formato: fmtEntero });
    const pct = asistenciaPct(a.clases_dadas, a.faltas);
    if (pct !== null) linea(ta.asistencia, pct, { formato: fmtPorc });
    if (a.cobrado_por_clase !== null) {
      linea(ta.cobradoPorClase, a.cobrado_por_clase, { nota: ta.cobradoPorClaseNota });
    }
    f += 1;

    bloque(ta.tusAlumnos);
    linea(ta.activos, a.activos, { formato: fmtEntero, nota: ta.aHoy });
    linea(ta.nuevos, a.nuevos, { formato: fmtEntero, nota: ta.nuevosNota });
    linea(ta.paquetesVendidos, a.paquetes.vendidos, { formato: fmtEntero });
    linea(ta.paquetesTerminados, a.paquetes.terminados, { formato: fmtEntero });
    linea(ta.paquetesVencidos, a.paquetes.vencidos, { formato: fmtEntero });
    if (a.paquetes.terminados + a.paquetes.vencidos > 0) {
      linea(ta.renovaron, a.paquetes.renovaron, { formato: fmtEntero });
    }
    f += 1;

    bloque(`${ta.loQueTeDeben} (${ta.aHoy})`);
    linea(ta.inscripcionesSinCobrar, deben.inscripciones);
    if (deben.fiado > 0) linea(ta.fiado, deben.fiado);
    linea(ta.totalPorCobrar, deben.total, { fuerte: true, color: deben.total > 0 ? ROJO : TINTA });
    f += 2;

    // Para tener en cuenta: solo lo que el dato sostiene.
    const notas: string[] = [];
    if (r.ventas === 0) notas.push(ta.sinCobros);
    if (r.conCostos && r.gananciaNeta < 0) notas.push(ta.gastasteMasDeLoQueCobraste);
    if (a.cobrado_por_clase === null && r.ventas > 0) notas.push(ta.sinClasesNoHayPorClase);
    if (r.movimientosAnulados > 0) notas.push(ta.anulados(r.movimientosAnulados));
    if (notas.length > 0) {
      const t = h.getCell(`B${f}`);
      t.value = ta.paraTenerEnCuenta;
      t.font = { name: FUENTE, size: 9, bold: true, color: { argb: 'FF6B7C75' } };
      f += 1;
      for (const texto of notas) {
        h.mergeCells(`B${f}:E${f}`);
        const c = h.getCell(`B${f}`);
        c.value = texto;
        c.font = { name: FUENTE, size: 10, color: { argb: TINTA } };
        c.alignment = { vertical: 'middle', wrapText: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } };
        h.getRow(f).height = 20;
        f += 1;
      }
    }
  }

  // ==========================================================
  // 2 · POR COBRAR (a hoy)
  // ==========================================================
  {
    const h = hojaNueva(ta.hojaPorCobrar, false, 6);
    h.columns = [{ width: 28 }, { width: 26 }, { width: 18 }, { width: 13 }, { width: 13 }, { width: 16 }];
    encabezado(h, empresa.nombre, ta.porCobrarTitulo, periodo, 6);
    filaEncabezadoTabla(h, 6, ta.columnasPorCobrar);

    let f = 7;
    const formatos = { 6: fmt };
    deben.lista.forEach((p, i) => {
      const fila = h.getRow(f);
      fila.values = [p.alumno, p.nombre, p.materia ?? '', fecha(p.desde, tx.locale), fecha(p.hasta, tx.locale), p.monto];
      pintarFila(fila, i, formatos, [1, 2, 3]);
      f += 1;
    });
    deben.fiados.forEach((p, i) => {
      const fila = h.getRow(f);
      fila.values = [p.alumno, ta.filaFiado, '', '', '', p.monto];
      pintarFila(fila, deben.lista.length + i, formatos, [1, 2, 3]);
      f += 1;
    });
    if (deben.lista.length + deben.fiados.length === 0) {
      aclaracion(h, f, ta.nadieTeDebe, 6);
      f += 1;
    } else {
      const total = h.getRow(f);
      total.values = [ta.totalPorCobrar, '', '', '', '', deben.total];
      pintarTotal(total, formatos);
      f += 1;
    }
    aclaracion(h, f + 1, ta.porCobrarEsFoto, 6);
  }

  // ==========================================================
  // 3 · COBROS (el libro de ingresos)
  // ==========================================================
  {
    const h = hojaNueva(ta.hojaCobros, true, 6);
    h.columns = [{ width: 13 }, { width: 28 }, { width: 30 }, { width: 18 }, { width: 20 }, { width: 16 }];
    encabezado(h, empresa.nombre, ta.cobrosTitulo, periodo, 6);
    filaEncabezadoTabla(h, 6, ta.columnasCobros);

    // Las ventas válidas del período: la misma base que el «Cobrado» del
    // resumen. Las anuladas no son un cobro y no se listan acá.
    const cobros = movimientos
      .filter((m) => m.tipo === 'venta' && esValido(m))
      .sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
    const formatos = { 6: fmt };
    cobros.forEach((m, i) => {
      const fila = h.getRow(7 + i);
      fila.values = [
        fecha(m.fecha, tx.locale),
        m.cliente_nombre || m.contraparte || '',
        m.descripcion || m.movimiento_items?.[0]?.nombre || '',
        m.metodo_pago,
        m.cuenta_nombre ?? '',
        Number(m.monto),
      ];
      pintarFila(fila, i, formatos, [1, 2, 3, 4, 5]);
    });
    const f = 7 + cobros.length;
    if (cobros.length === 0) {
      aclaracion(h, f, ta.sinCobrosEnElPeriodo, 6);
    } else {
      const total = h.getRow(f);
      // El total es el «Cobrado» del resumen: el mismo número de la pantalla.
      total.values = [ta.totalCobrado, '', '', '', '', r.ventas];
      pintarTotal(total, formatos);
      h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + cobros.length, column: 6 } };
    }
    aclaracion(h, f + 2, ta.cobrosNota, 6);
  }

  // ==========================================================
  // 4 · ASISTENCIA
  // ==========================================================
  {
    const h = hojaNueva(ta.hojaAsistencia);
    h.columns = [{ width: 28 }, { width: 16 }, { width: 12 }, { width: 14 }, { width: 16 }];
    encabezado(h, empresa.nombre, ta.asistenciaTitulo, periodo, 5);

    if (a.clases_dadas + a.faltas === 0) {
      aclaracion(h, 6, ta.sinClases, 5);
    } else {
      let f = 6;
      subtitulo(h, f, ta.porSemana);
      f += 1;
      filaEncabezadoTabla(h, f, ta.columnasSemana);
      f += 1;
      const formatos = { 2: fmtEntero, 3: fmtEntero, 4: fmtPorc };
      a.por_semana.forEach((s, i) => {
        const fila = h.getRow(f);
        fila.values = [fecha(s.semana, tx.locale), s.dadas, s.faltas, asistenciaPct(s.dadas, s.faltas)];
        pintarFila(fila, i, formatos);
        f += 1;
      });
      const total = h.getRow(f);
      total.values = [ta.total, a.clases_dadas, a.faltas, asistenciaPct(a.clases_dadas, a.faltas)];
      pintarTotal(total, formatos);
      f += 3;

      subtitulo(h, f, ta.porAlumno);
      f += 1;
      filaEncabezadoTabla(h, f, ta.columnasAsistenciaAlumno);
      f += 1;
      const conClases = a.alumnos
        .filter((x) => x.clases > 0 || x.faltas > 0)
        .sort((x, y) => y.clases - x.clases || x.nombre.localeCompare(y.nombre));
      conClases.forEach((x, i) => {
        const fila = h.getRow(f);
        fila.values = [x.nombre, x.clases, x.faltas, asistenciaPct(x.clases, x.faltas), fecha(x.ultima_clase, tx.locale)];
        pintarFila(fila, i, formatos);
        f += 1;
      });
    }
  }

  // ==========================================================
  // 5 · ALUMNOS (una fila por alumno)
  // ==========================================================
  {
    const h = hojaNueva(ta.hojaAlumnos, true, 6);
    h.columns = [
      { width: 26 }, { width: 24 }, { width: 16 }, { width: 9 }, { width: 9 }, { width: 13 },
      { width: 12 }, { width: 9 }, { width: 15 }, { width: 15 }, { width: 14 },
    ];
    encabezado(h, empresa.nombre, ta.alumnosTitulo, periodo, 11);
    filaEncabezadoTabla(h, 6, ta.columnasAlumnos);

    const formatos = { 4: fmtEntero, 5: fmtEntero, 7: fmtEntero, 8: fmtEntero, 9: fmt, 10: fmt };
    a.alumnos.forEach((x, i) => {
      const fila = h.getRow(7 + i);
      // Sin paquete activo, sus cuatro columnas quedan vacías (null), no en cero.
      fila.values = [
        x.nombre, x.paquete ?? '', x.materia ?? '', x.usadas, x.quedan, fecha(x.vence_el, tx.locale),
        x.clases, x.faltas, x.cobrado, x.debe, fecha(x.ultima_clase, tx.locale),
      ];
      pintarFila(fila, i, formatos, [1, 2, 3]);
      fila.getCell(1).font = { name: FUENTE, size: 10, bold: true };
      if (x.debe > 0) fila.getCell(10).font = { name: FUENTE, size: 10, bold: true, color: { argb: ROJO } };
    });
    const f = 7 + a.alumnos.length;
    if (a.alumnos.length === 0) {
      aclaracion(h, f, ta.sinAlumnos, 11);
    } else {
      h.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + a.alumnos.length, column: 11 } };
      aclaracion(h, f + 1, ta.alumnosNota, 11);
    }
  }

  // ==========================================================
  // 6 · GASTOS: por categoría y cada uno
  // ==========================================================
  {
    const h = hojaNueva(tx.hojaGastos);
    h.columns = [{ width: 13 }, { width: 32 }, { width: 20 }, { width: 16 }, { width: 18 }, { width: 16 }];
    encabezado(h, empresa.nombre, tx.enQueSeFueLaPlata, periodo, 6);
    filaEncabezadoTabla(h, 6, tx.columnasGastos);
    tablaDeCategorias(h, categorias, r.gastos, fmt, fmtPorc, tx.nadaGastado);

    const gastos = movimientos
      .filter((m) => m.tipo === 'gasto' && esValido(m))
      .sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
    if (gastos.length > 0) {
      let f = 7 + Math.max(categorias.length, 1) + 3;
      subtitulo(h, f, ta.cadaGasto);
      f += 1;
      filaEncabezadoTabla(h, f, ta.columnasCadaGasto);
      f += 1;
      gastos.forEach((m, i) => {
        const fila = h.getRow(f);
        fila.values = [
          fecha(m.fecha, tx.locale), m.descripcion || tx.sinDescripcion, m.categoria,
          m.metodo_pago, m.cuenta_nombre ?? '', Number(m.monto),
        ];
        pintarFila(fila, i, { 6: fmt }, [1, 2, 3, 4, 5]);
        f += 1;
      });
    }
  }

  // ==========================================================
  // 7 · PROGRESO (solo el trainer)
  // ==========================================================
  if (datos.progreso) {
    const p = datos.progreso;
    const h = hojaNueva(ta.hojaProgreso, true, 6);
    h.columns = [
      { width: 24 }, { width: 9 },
      { width: 11 }, { width: 11 }, { width: 11 },
      { width: 11 }, { width: 11 }, { width: 11 },
      { width: 11 }, { width: 11 }, { width: 11 }, { width: 16 },
      { width: 14 }, { width: 11 }, { width: 22 },
    ];
    encabezado(h, empresa.nombre, ta.progresoTitulo, periodo, 15);
    filaEncabezadoTabla(h, 6, ta.columnasProgreso);

    const medida = '0.0';
    const cambio = '+0.0;-0.0;0.0';
    const formatos = {
      2: fmtEntero, 3: medida, 4: medida, 5: cambio, 6: medida, 7: medida, 8: cambio,
      9: medida, 10: medida, 11: cambio, 14: fmtEntero,
    };
    p.clientes.forEach((x, i) => {
      const fila = h.getRow(7 + i);
      fila.values = [
        x.nombre, x.mediciones,
        x.peso_inicial, x.peso_final, x.peso_cambio,
        x.cintura_inicial, x.cintura_final, x.cintura_cambio,
        x.grasa_inicial, x.grasa_final, x.grasa_cambio, x.grasa_metodo ?? '',
        fecha(x.ultima_medicion, tx.locale), x.dias_sin_medir, x.rutina_vigente ?? (x.activo ? ta.sinRutina : ''),
      ];
      pintarFila(fila, i, formatos, [1, 12, 13, 15]);
      fila.getCell(1).font = { name: FUENTE, size: 10, bold: true };
      // Lo que hay que mirar, en rojo: más de 30 días sin medirse, o sin rutina.
      if (x.sin_medir_30) fila.getCell(14).font = { name: FUENTE, size: 10, bold: true, color: { argb: ROJO } };
      if (x.activo && !x.rutina_vigente) fila.getCell(15).font = { name: FUENTE, size: 10, italic: true, color: { argb: ROJO } };
    });
    const f = 7 + p.clientes.length;
    if (p.clientes.length === 0) {
      aclaracion(h, f, ta.sinMedidas, 15);
    } else {
      // El promedio es el de la base (solo de quien se puede comparar): el
      // mismo número que la pantalla.
      const total = h.getRow(f);
      total.values = [ta.promedio, p.medidos, null, null, p.cambio_peso, null, null, p.cambio_cintura, null, null, p.cambio_grasa];
      pintarTotal(total, formatos);
      aclaracion(h, f + 2, ta.progresoNota, 15);
    }
  }

  return libro;
}
