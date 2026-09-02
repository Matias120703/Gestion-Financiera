import { clienteServidor } from './supabase/servidor';
import type {
  AhorroDelPeriodo, FilaCategoria, FilaDia, FilaProducto, Resumen,
} from './calculos';
import { exigir, exigirLista, recorrerPaginas } from './lectura';
import type { Movimiento, TipoMovimiento } from './tipos';

/**
 * ============================================================
 * LECTURAS AGREGADAS · calcular en la base, no en el navegador
 * ============================================================
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * Antes, cada pantalla pedía todos los movimientos del periodo y sumaba con
 * JavaScript. Eso funciona con 200 operaciones y falla en silencio con 20.000:
 * entre PostgreSQL y el navegador está PostgREST / la Data API, que aplica su
 * propio máximo de filas (`db-max-rows`, habitualmente 1.000). Si ese tope se
 * activa, el cliente recibe menos filas de las que hay y muestra un total
 * incompleto sin ningún aviso.
 *
 * La regla que resuelve eso es simple:
 *
 *   · Para MOSTRAR el historial  → paginar (`traerPaginaMovimientos`).
 *   · Para CALCULAR un número    → agregar en PostgreSQL (todo lo demás acá).
 *
 * Desde la migración 006, TODAS estas funciones devuelven exactamente UNA fila
 * con un valor jsonb adentro (un objeto o un array). Un array dentro de un
 * jsonb es un valor, no un conjunto de filas: no hay nada que PostgREST pueda
 * recortar. El tope puede ser 1.000, 100 o 10; da igual.
 *
 * SI ALGO FALLA, FALLA
 *
 * Ninguna de estas funciones devuelve un valor de respaldo ante un error.
 * Lanzan `ErrorDeLectura` y la pantalla muestra `error.tsx`. Un cero en
 * pantalla significa cero, nunca "no pudimos leer". Ver `lectura.ts`.
 *
 * FUENTE DE VERDAD
 *
 * Para lo que se muestra en pantalla y en el Excel, la fuente es PostgreSQL.
 * `calculos.ts` conserva la misma matemática como implementación de referencia:
 * se usa en las pruebas y para conjuntos chicos ya cargados en memoria. Hay una
 * prueba de reconciliación que corre las dos sobre el mismo dataset y exige
 * resultados idénticos, justamente para que no se separen con el tiempo.
 */

// ------------------------------------------------------------------ resumen

interface ResumenSql {
  ventas: number;
  ventas_brutas: number;
  descuentos: number;
  otros_ingresos: number;
  ingresos_totales: number;
  gastos: number;
  cantidad_ventas: number;
  unidades_vendidas: number;
  ticket_promedio: number;
  ventas_anuladas: number;
  monto_ventas_anuladas: number;
  movimientos_anulados: number;
  monto_movimientos_anulados: number;
  costo_mercaderia: number | null;
  ganancia_bruta: number | null;
  ganancia_neta: number | null;
  margen_bruto: number | null;
  margen_neto: number | null;
  con_costos: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Convierte la respuesta de la base al mismo `Resumen` que produce calculos.ts. */
export function mapearResumen(sql: ResumenSql): Resumen {
  const conCostos = Boolean(sql.con_costos) && sql.costo_mercaderia !== null;
  return {
    ventas: num(sql.ventas),
    ventasBrutas: num(sql.ventas_brutas),
    descuentos: num(sql.descuentos),
    otrosIngresos: num(sql.otros_ingresos),
    ingresosTotales: num(sql.ingresos_totales),
    gastos: num(sql.gastos),
    cantidadVentas: num(sql.cantidad_ventas),
    unidadesVendidas: num(sql.unidades_vendidas),
    ticketPromedio: num(sql.ticket_promedio),
    ventasAnuladas: num(sql.ventas_anuladas),
    montoVentasAnuladas: num(sql.monto_ventas_anuladas),
    movimientosAnulados: num(sql.movimientos_anulados),
    montoMovimientosAnulados: num(sql.monto_movimientos_anulados),
    // Sin permiso llegan en null. Los dejamos en cero PERO con conCostos:false,
    // que es la bandera que mira la interfaz para no mostrarlos.
    costoMercaderia: conCostos ? num(sql.costo_mercaderia) : 0,
    gananciaBruta: conCostos ? num(sql.ganancia_bruta) : 0,
    gananciaNeta: conCostos ? num(sql.ganancia_neta) : 0,
    margenBruto: conCostos ? num(sql.margen_bruto) : 0,
    margenNeto: conCostos ? num(sql.margen_neto) : 0,
    conCostos,
  };
}

export async function traerResumen(empresaId: string, desde: string, hasta: string): Promise<Resumen> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('resumen_financiero', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return mapearResumen(exigir(respuesta, 'resumen financiero') as ResumenSql);
}

// ------------------------------------------------------------------ ranking

interface FilaProductoSql {
  producto_id: string | null;
  nombre: string;
  unidades: number;
  ingresos_brutos: number;
  descuento: number;
  ingresos: number;
  operaciones: number;
  participacion: number;
  costo: number | null;
  ganancia: number | null;
  margen: number | null;
}

const quizas = (v: number | null | undefined): number | null =>
  v === null || v === undefined ? null : num(v);

export function mapearRanking(filas: FilaProductoSql[]): FilaProducto[] {
  return filas.map((f) => ({
    producto_id: f.producto_id,
    nombre: f.nombre,
    unidades: num(f.unidades),
    ingresosBrutos: num(f.ingresos_brutos),
    descuento: num(f.descuento),
    ingresos: num(f.ingresos),
    operaciones: num(f.operaciones),
    participacion: num(f.participacion),
    costo: quizas(f.costo),
    ganancia: quizas(f.ganancia),
    margen: quizas(f.margen),
  }));
}

export async function traerRanking(
  empresaId: string, desde: string, hasta: string, limite?: number,
): Promise<FilaProducto[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('ranking_productos', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta, p_limite: limite ?? null,
  });
  return mapearRanking(exigirLista<FilaProductoSql>(respuesta, 'ranking de productos'));
}

// ------------------------------------------------------------------ serie diaria

interface FilaDiaSql {
  fecha: string;
  ventas: number;
  gastos: number;
  otros_ingresos: number;
  ganancia: number | null;
}

export function mapearSerie(filas: FilaDiaSql[]): FilaDia[] {
  return filas.map((f) => ({
    fecha: f.fecha,
    ventas: num(f.ventas),
    gastos: num(f.gastos),
    otrosIngresos: num(f.otros_ingresos),
    ganancia: quizas(f.ganancia),
  }));
}

export async function traerSerieDiaria(
  empresaId: string, desde: string, hasta: string,
): Promise<FilaDia[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('serie_financiera_diaria', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return mapearSerie(exigirLista<FilaDiaSql>(respuesta, 'serie diaria'));
}

// ------------------------------------------------------------------ gastos y cobros

/**
 * De dónde vino la plata en el período elegido.
 *
 * Espejo de `traerGastosPorCategoria`. Para un comercio casi todo lo que entra
 * es una venta y este desglose no dice nada; para alguien con sueldo es el
 * número que separa «gano bien» de «este mes zafé».
 */
export async function traerIngresosPorCategoria(
  empresaId: string, desde: string, hasta: string,
): Promise<FilaCategoria[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('ingresos_por_categoria', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return exigirLista<any>(respuesta, 'ingresos por categoría').map((f) => ({
    nombre: String(f.nombre),
    monto: num(f.monto),
    operaciones: num(f.operaciones),
    participacion: num(f.participacion),
  }));
}

export async function traerGastosPorCategoria(
  empresaId: string, desde: string, hasta: string,
): Promise<FilaCategoria[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('gastos_por_categoria', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return exigirLista<any>(respuesta, 'gastos por categoría').map((f) => ({
    nombre: String(f.nombre),
    monto: num(f.monto),
    operaciones: num(f.operaciones),
    participacion: num(f.participacion),
  }));
}


/**
 * Lo que se guardó y se sacó de los fondos de ahorro DENTRO del período
 * elegido.
 *
 * `resumen_personal` también cuenta el ahorro, pero siempre del ciclo en
 * curso —de cobro a cobro—. Este mira el rango que la persona pidió, que es
 * el único recorte que puede convivir con el resto del reporte sin mentir.
 */
export async function traerAhorroDelPeriodo(
  empresaId: string, desde: string, hasta: string,
): Promise<AhorroDelPeriodo> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('resumen_ahorro_periodo', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  const d = exigir(respuesta, 'ahorro del período') as any;
  return {
    aportado: num(d?.aportado),
    retirado: num(d?.retirado),
    neto: num(d?.neto),
    porFondo: Array.isArray(d?.por_fondo)
      ? d.por_fondo.map((f: any) => ({
          nombre: String(f?.nombre ?? ''),
          aportado: num(f?.aportado),
          retirado: num(f?.retirado),
          neto: num(f?.neto),
          saldo_hoy: num(f?.saldo_hoy),
        }))
      : [],
  };
}

export interface FilaCobro { metodo: string; monto: number; participacion: number }

export async function traerCobrosPorMetodo(
  empresaId: string, desde: string, hasta: string,
): Promise<FilaCobro[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('cobros_por_metodo', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return exigirLista<any>(respuesta, 'cobros por método').map((f) => ({
    metodo: String(f.metodo),
    monto: num(f.monto),
    participacion: num(f.participacion),
  }));
}

// ------------------------------------------------------------------ historial paginado

export const TAMANO_PAGINA = 100;
/** Lote más grande, para procesos de servidor como el Excel. */
export const TAMANO_LOTE_SERVIDOR = 500;

export interface Cursor { fecha: string; created_at: string; id: string }

export interface FiltrosHistorial {
  tipo?: TipoMovimiento | null;
  incluirAnuladas?: boolean;
  busqueda?: string | null;
}

export interface PaginaMovimientos {
  movimientos: Movimiento[];
  /** null cuando ya no queda nada más que traer. */
  siguiente: Cursor | null;
}

export async function traerPaginaMovimientos(
  empresaId: string,
  desde: string,
  hasta: string,
  opciones: { cursor?: Cursor | null; tamano?: number } & FiltrosHistorial = {},
): Promise<PaginaMovimientos> {
  const supabase = clienteServidor();
  const tamano = Math.min(Math.max(opciones.tamano ?? TAMANO_PAGINA, 1), TAMANO_LOTE_SERVIDOR);

  const respuesta = await supabase.rpc('pagina_movimientos', {
    p_empresa: empresaId,
    p_desde: desde,
    p_hasta: hasta,
    p_tamano: tamano,
    p_cursor_fecha: opciones.cursor?.fecha ?? null,
    p_cursor_created: opciones.cursor?.created_at ?? null,
    p_cursor_id: opciones.cursor?.id ?? null,
    p_tipo: opciones.tipo ?? null,
    p_incluir_anuladas: opciones.incluirAnuladas ?? true,
    p_busqueda: opciones.busqueda ?? null,
  });

  // Si falla, lanza. Devolver `{ movimientos: [], siguiente: null }` diría
  // "se terminó el historial", que es exactamente lo contrario de lo que pasó.
  const pagina = exigir(respuesta, 'historial de movimientos') as {
    movimientos: Movimiento[];
    siguiente: Cursor | null;
  };

  return {
    movimientos: Array.isArray(pagina.movimientos) ? pagina.movimientos : [],
    // El cursor lo calcula el servidor sobre la consulta real, no el cliente
    // sobre la lista recibida: si la lista llegara incompleta, un cursor
    // derivado acá apuntaría al lugar equivocado y saltearía movimientos.
    siguiente: pagina.siguiente ?? null,
  };
}

/**
 * Recorre TODAS las páginas del periodo. Solo para procesos de servidor
 * (el Excel). Nunca se llama desde el navegador: la idea es justamente que el
 * navegador no reciba miles de filas.
 */
export async function recorrerTodosLosMovimientos(
  empresaId: string,
  desde: string,
  hasta: string,
  opciones: FiltrosHistorial & { tope?: number } = {},
): Promise<Movimiento[]> {
  // Si una sola página falla, el error sube y no se arma nada. Media lista es
  // peor que ninguna, porque parece completa.
  return recorrerPaginas<Movimiento, Cursor>(
    async (cursor) => {
      const pagina = await traerPaginaMovimientos(empresaId, desde, hasta, {
        ...opciones, cursor, tamano: TAMANO_LOTE_SERVIDOR,
      });
      return { items: pagina.movimientos, siguiente: pagina.siguiente };
    },
    { tope: opciones.tope, contexto: 'detalle de movimientos' },
  );
}

export async function contarMovimientos(empresaId: string, desde: string, hasta: string): Promise<number> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('contar_movimientos', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  // Cero movimientos es un dato; no poder contarlos, no.
  return num(exigir(respuesta, 'conteo de movimientos'));
}
