import type { Movimiento } from './tipos';

/**
 * ============================================================
 * REGLAS FINANCIERAS DE ORDEN
 * ============================================================
 *
 * DÓNDE SE CALCULA DE VERDAD
 *
 * Para lo que se muestra en pantalla y en el Excel, la agregación la hace
 * PostgreSQL (ver `agregados.ts` y la migración 005). Ese es el camino de
 * producción: devuelve pocas filas y no lo afecta ningún tope de la Data API.
 *
 * Este archivo mantiene la MISMA matemática como implementación de referencia:
 * se usa en las pruebas, para conjuntos chicos ya cargados en memoria y como
 * documentación ejecutable de las reglas. Hay una prueba de reconciliación
 * (pruebas/agregados.test.js) que corre las dos implementaciones sobre el mismo
 * dataset y exige resultados idénticos. Si tocás una regla acá, tocala también
 * en la migración, o esa prueba falla.
 *
 * 1. VÁLIDO vs ANULADO
 *    Solo cuentan los movimientos con estado 'activo'. Una venta anulada
 *    sigue existiendo para el historial, pero no suma en ningún total,
 *    ranking, reto ni hoja de Excel.
 *
 * 2. DESCUENTOS
 *    Cada venta guarda tres números: `subtotal` (precio de lista),
 *    `descuento` y `monto` (lo que realmente se cobró). Siempre se cumple
 *    monto = subtotal − descuento, y la base de datos lo garantiza con una
 *    restricción, no la aplicación.
 *
 *    "Ventas" SIEMPRE significa `monto`, nunca `subtotal`. Es decir: lo que
 *    entró a la caja.
 *
 * 3. DESCUENTO POR PRODUCTO
 *    Para saber cuánto dejó cada producto, el descuento se reparte
 *    proporcionalmente al peso de cada línea dentro del subtotal:
 *
 *        ingreso_neto_del_item = cantidad × precio × (monto / subtotal)
 *
 *    Ejemplo: A vale 60% del subtotal y B el 40%. Con 10.000 de descuento,
 *    A absorbe 6.000 y B 4.000. Así la suma del ranking da exactamente el
 *    mismo número que el panel. No se persiste: se deriva, y siempre igual.
 *
 * 4. COSTO
 *    El descuento NO cambia el costo. El costo es lo que te salió la
 *    mercadería y se congela en el momento de la venta.
 *
 * 5. DIVISIONES
 *    Todo denominador se comprueba antes. Nunca sale NaN ni Infinity.
 *
 * 6. ANULADAS
 *    `ventasAnuladas` cuenta SOLO ventas anuladas. Los gastos y los ingresos
 *    anulados se cuentan aparte, en `movimientosAnulados`. Un nombre que dice
 *    "ventas" no puede estar contando gastos.
 *
 * 7. COSTOS SEGÚN QUIÉN MIRA — null NO es cero
 *    Un vendedor no recibe los costos desde la base: llegan en null.
 *
 *    La regla es absoluta: **la ausencia de un dato nunca se convierte en un
 *    valor financiero.** Un costo desconocido tratado como 0 produciría una
 *    ganancia igual a la venta entera y un margen del 100 %, que es una
 *    mentira, no un dato incompleto.
 *
 *    Por eso, cuando el costo no está disponible:
 *      · `resumir()` devuelve `conCostos: false`;
 *      · `FilaProducto.costo`, `.ganancia` y `.margen` valen `null`;
 *      · `FilaDia.ganancia` vale `null`;
 *      · `logradoEnReto()` devuelve `null` si el reto se mide por ganancia.
 *
 *    La interfaz muestra un guion, no un número.
 */

/** Un movimiento cuenta para las finanzas solo si no está anulado. */
export function esValido(m: Movimiento): boolean {
  return m.estado !== 'anulado';
}

export function soloValidos(movimientos: Movimiento[]): Movimiento[] {
  return movimientos.filter(esValido);
}

/**
 * Factor por el que hay que multiplicar el precio de lista de cada línea
 * para obtener lo realmente cobrado por ella. Sin descuento vale 1.
 */
export function factorDescuento(m: Movimiento): number {
  const subtotal = Number(m.subtotal) || 0;
  const monto = Number(m.monto) || 0;
  if (subtotal <= 0) return 1;
  return monto / subtotal;
}

export interface Resumen {
  ventas: number;          // lo cobrado por ventas válidas (ya neto de descuentos)
  ventasBrutas: number;    // lo mismo pero a precio de lista
  descuentos: number;      // ventasBrutas − ventas
  otrosIngresos: number;   // ingresos que no son venta de producto
  ingresosTotales: number;
  costoMercaderia: number; // lo que costó lo que se vendió (no lo afecta el descuento)
  gananciaBruta: number;   // ventas − costo de mercadería
  gastos: number;          // gastos operativos
  gananciaNeta: number;    // ganancia bruta + otros ingresos − gastos
  margenBruto: number;     // %
  margenNeto: number;      // %
  cantidadVentas: number;
  ticketPromedio: number;
  unidadesVendidas: number;

  /** Solo VENTAS anuladas. No incluye gastos ni ingresos anulados. */
  ventasAnuladas: number;
  montoVentasAnuladas: number;
  /** Todos los movimientos anulados, del tipo que sean. */
  movimientosAnulados: number;
  montoMovimientosAnulados: number;

  /**
   * false cuando quien consulta no tiene permiso para ver costos (un vendedor).
   * En ese caso costoMercaderia, gananciaBruta, gananciaNeta y los márgenes
   * quedan en cero y NO deben mostrarse.
   */
  conCostos: boolean;
}

export const RESUMEN_VACIO: Resumen = {
  ventas: 0, ventasBrutas: 0, descuentos: 0, otrosIngresos: 0, ingresosTotales: 0,
  costoMercaderia: 0, gananciaBruta: 0, gastos: 0, gananciaNeta: 0,
  margenBruto: 0, margenNeto: 0, cantidadVentas: 0, ticketPromedio: 0,
  unidadesVendidas: 0, ventasAnuladas: 0, montoVentasAnuladas: 0,
  movimientosAnulados: 0, montoMovimientosAnulados: 0, conCostos: true,
};

/**
 * ¿Vinieron los costos en esta consulta? Si alguna venta válida trae
 * costo_total en null, es que la base los ocultó por permisos.
 */
export function tieneCostos(movimientos: Movimiento[]): boolean {
  const ventas = movimientos.filter((m) => m.tipo === 'venta' && esValido(m));
  if (ventas.length === 0) return true;
  return ventas.every((m) => m.costo_total !== null && m.costo_total !== undefined);
}

export function resumir(movimientos: Movimiento[]): Resumen {
  let ventas = 0, ventasBrutas = 0, otrosIngresos = 0, costoMercaderia = 0, gastos = 0;
  let cantidadVentas = 0, unidadesVendidas = 0;
  let ventasAnuladas = 0, montoVentasAnuladas = 0;
  let movimientosAnulados = 0, montoMovimientosAnulados = 0;

  const conCostos = tieneCostos(movimientos);

  for (const m of movimientos) {
    const monto = Number(m.monto) || 0;

    if (!esValido(m)) {
      movimientosAnulados += 1;
      montoMovimientosAnulados += monto;
      // Solo las ventas cuentan en la métrica que se llama "ventas anuladas".
      if (m.tipo === 'venta') {
        ventasAnuladas += 1;
        montoVentasAnuladas += monto;
      }
      continue;
    }

    if (m.tipo === 'venta') {
      ventas += monto;
      ventasBrutas += Number(m.subtotal) || monto;
      costoMercaderia += Number(m.costo_total) || 0;
      cantidadVentas += 1;
      for (const it of m.movimiento_items ?? []) unidadesVendidas += Number(it.cantidad) || 0;
    } else if (m.tipo === 'ingreso') {
      otrosIngresos += monto;
    } else {
      gastos += monto;
    }
  }

  const ingresosTotales = ventas + otrosIngresos;
  const gananciaBruta = conCostos ? ventas - costoMercaderia : 0;
  const gananciaNeta = conCostos ? gananciaBruta + otrosIngresos - gastos : 0;

  return {
    ventas,
    ventasBrutas,
    descuentos: ventasBrutas - ventas,
    otrosIngresos,
    ingresosTotales,
    costoMercaderia: conCostos ? costoMercaderia : 0,
    gananciaBruta,
    gastos,
    gananciaNeta,
    margenBruto: conCostos && ventas > 0 ? (gananciaBruta / ventas) * 100 : 0,
    margenNeto: conCostos && ingresosTotales > 0 ? (gananciaNeta / ingresosTotales) * 100 : 0,
    cantidadVentas,
    ticketPromedio: cantidadVentas > 0 ? ventas / cantidadVentas : 0,
    unidadesVendidas,
    ventasAnuladas,
    montoVentasAnuladas,
    movimientosAnulados,
    montoMovimientosAnulados,
    conCostos,
  };
}

export interface FilaProducto {
  nombre: string;
  producto_id: string | null;
  unidades: number;
  ingresosBrutos: number; // a precio de lista
  descuento: number;      // parte proporcional del descuento de sus ventas
  ingresos: number;       // lo realmente cobrado por este producto
  /** null si alguna de sus ventas no trajo el costo (quien mira no puede verlo). */
  costo: number | null;
  ganancia: number | null;
  margen: number | null;
  operaciones: number;
  participacion: number;  // % sobre el total cobrado
}

export function rankingProductos(movimientos: Movimiento[]): FilaProducto[] {
  // Acumulamos el costo aparte junto con una marca de "acá faltó el costo".
  // Si a un producto le falta el costo en aunque sea una línea, su costo,
  // ganancia y margen quedan en null: no se puede saber, no se inventa.
  const mapa = new Map<string, FilaProducto>();
  const costos = new Map<string, { acumulado: number; completo: boolean }>();

  for (const m of movimientos) {
    if (m.tipo !== 'venta' || !esValido(m)) continue;

    const factor = factorDescuento(m);

    for (const it of m.movimiento_items ?? []) {
      const clave = it.producto_id ?? `libre:${it.nombre.toLowerCase().trim()}`;
      const cant = Number(it.cantidad) || 0;
      const bruto = cant * (Number(it.precio_unitario) || 0);
      const neto = bruto * factor;

      const actual = mapa.get(clave) ?? {
        nombre: it.nombre, producto_id: it.producto_id,
        unidades: 0, ingresosBrutos: 0, descuento: 0, ingresos: 0,
        costo: null as number | null, ganancia: null as number | null,
        margen: null as number | null, operaciones: 0, participacion: 0,
      };
      actual.unidades += cant;
      actual.ingresosBrutos += bruto;
      actual.ingresos += neto;
      actual.operaciones += 1;
      mapa.set(clave, actual);

      const acumulador = costos.get(clave) ?? { acumulado: 0, completo: true };
      if (it.costo_unitario == null) {
        acumulador.completo = false;
      } else {
        acumulador.acumulado += cant * (Number(it.costo_unitario) || 0);
      }
      costos.set(clave, acumulador);
    }
  }

  const filas = Array.from(mapa.entries());
  const totalIngresos = filas.reduce((s, [, f]) => s + f.ingresos, 0);

  for (const [clave, f] of filas) {
    const c = costos.get(clave);
    f.descuento = f.ingresosBrutos - f.ingresos;
    f.participacion = totalIngresos > 0 ? (f.ingresos / totalIngresos) * 100 : 0;

    if (c && c.completo) {
      f.costo = c.acumulado;
      f.ganancia = f.ingresos - c.acumulado;
      f.margen = f.ingresos > 0 ? (f.ganancia / f.ingresos) * 100 : 0;
    } else {
      f.costo = null;
      f.ganancia = null;
      f.margen = null;
    }
  }

  return filas.map(([, f]) => f).sort((a, b) => b.ingresos - a.ingresos);
}

export interface FilaCategoria { nombre: string; monto: number; operaciones: number; participacion: number }

/**
 * Lo que se movió en los fondos de ahorro dentro de un período.
 *
 * El ahorro no es un gasto —la plata sigue siendo de la persona— así que
 * no entra en ningún total de gastos. Se cuenta aparte, y por eso tiene
 * su propia forma.
 */
export interface FilaFondo {
  nombre: string;
  aportado: number;
  retirado: number;
  neto: number;
  /** El saldo del fondo A HOY. Es de otro recorte: nunca se suma con lo del período. */
  saldo_hoy: number;
}

export interface AhorroDelPeriodo {
  aportado: number;
  retirado: number;
  /** Aportes menos retiros. Negativo si en el período sacó más de lo que puso. */
  neto: number;
  porFondo: FilaFondo[];
}

/**
 * De dónde vino la plata, agrupado por categoría.
 *
 * Espejo exacto de `gastosPorCategoria`, y espejo en JavaScript de la
 * función `ingresos_por_categoria` de la migración 028. Existe por el mismo
 * motivo que el resto de este archivo: la base es la que calcula en
 * producción, y esto es la referencia contra la que se comprueba que dé lo
 * mismo.
 *
 * Ventas e ingresos van juntos: para quien mira el reporte, todo lo que
 * entró es lo que entró. La distinción es interna.
 */
export function ingresosPorCategoria(movimientos: Movimiento[]): FilaCategoria[] {
  const mapa = new Map<string, FilaCategoria>();
  for (const m of movimientos) {
    if ((m.tipo !== 'ingreso' && m.tipo !== 'venta') || !esValido(m)) continue;
    const clave = (m.categoria || 'General').trim();
    const actual = mapa.get(clave) ?? { nombre: clave, monto: 0, operaciones: 0, participacion: 0 };
    actual.monto += Number(m.monto) || 0;
    actual.operaciones += 1;
    mapa.set(clave, actual);
  }
  const filas = Array.from(mapa.values());
  const total = filas.reduce((s, f) => s + f.monto, 0);
  for (const f of filas) f.participacion = total > 0 ? (f.monto / total) * 100 : 0;
  return filas.sort((a, b) => b.monto - a.monto);
}

export function gastosPorCategoria(movimientos: Movimiento[]): FilaCategoria[] {
  const mapa = new Map<string, FilaCategoria>();
  for (const m of movimientos) {
    if (m.tipo !== 'gasto' || !esValido(m)) continue;
    const clave = (m.categoria || 'General').trim();
    const actual = mapa.get(clave) ?? { nombre: clave, monto: 0, operaciones: 0, participacion: 0 };
    actual.monto += Number(m.monto) || 0;
    actual.operaciones += 1;
    mapa.set(clave, actual);
  }
  const filas = Array.from(mapa.values());
  const total = filas.reduce((s, f) => s + f.monto, 0);
  for (const f of filas) f.participacion = total > 0 ? (f.monto / total) * 100 : 0;
  return filas.sort((a, b) => b.monto - a.monto);
}

export interface FilaDia {
  fecha: string;
  ventas: number;
  gastos: number;
  otrosIngresos: number;
  /** null si alguna venta de ese día no trajo el costo. Nunca se rellena con cero. */
  ganancia: number | null;
}

export function serieDiaria(movimientos: Movimiento[], dias: string[]): FilaDia[] {
  const mapa = new Map<string, FilaDia>(
    dias.map((d) => [d, { fecha: d, ventas: 0, gastos: 0, otrosIngresos: 0, ganancia: 0 }]),
  );
  // Días en los que apareció una venta sin costo: su ganancia es incalculable.
  const sinCosto = new Set<string>();

  for (const m of movimientos) {
    if (!esValido(m)) continue;
    const fila = mapa.get(m.fecha);
    if (!fila) continue;
    const monto = Number(m.monto) || 0;

    if (m.tipo === 'venta') {
      fila.ventas += monto;
      if (m.costo_total == null) {
        sinCosto.add(m.fecha);
      } else if (fila.ganancia !== null) {
        fila.ganancia += monto - (Number(m.costo_total) || 0);
      }
    } else if (m.tipo === 'ingreso') {
      fila.otrosIngresos += monto;
      if (fila.ganancia !== null) fila.ganancia += monto;
    } else {
      fila.gastos += monto;
      if (fila.ganancia !== null) fila.ganancia -= monto;
    }
  }

  for (const fecha of sinCosto) {
    const fila = mapa.get(fecha);
    if (fila) fila.ganancia = null;
  }

  return Array.from(mapa.values());
}

/** Cuánto se cobró por cada forma de pago, solo con movimientos válidos. */
export function cobrosPorMetodo(movimientos: Movimiento[]): { metodo: string; monto: number; participacion: number }[] {
  const mapa = new Map<string, number>();
  for (const m of movimientos) {
    if (!esValido(m) || m.tipo === 'gasto') continue;
    mapa.set(m.metodo_pago, (mapa.get(m.metodo_pago) ?? 0) + (Number(m.monto) || 0));
  }
  const total = Array.from(mapa.values()).reduce((s, v) => s + v, 0);
  return Array.from(mapa.entries())
    .map(([metodo, monto]) => ({ metodo, monto, participacion: total > 0 ? (monto / total) * 100 : 0 }))
    .sort((a, b) => b.monto - a.monto);
}

/**
 * Lo logrado en un reto, según lo que el reto mida.
 * Devuelve null si el reto se mide por ganancia y quien consulta no puede
 * ver costos: preferimos no mostrar nada antes que mostrar un número falso.
 */
export function logradoEnReto(movimientos: Movimiento[], medida: 'ventas' | 'ganancia'): number | null {
  const r = resumir(movimientos);
  if (medida === 'ganancia') return r.conCostos ? r.gananciaNeta : null;
  return r.ventas;
}

/** Variación porcentual segura contra división por cero. */
export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return actual ? null : 0;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}
