import { clienteServidor } from './supabase/servidor';
import type {
  AhorroDelPeriodo, FilaCategoria, FilaDia, FilaProducto, Resumen,
} from './calculos';
import { exigir, exigirLista, recorrerPaginas } from './lectura';
import type {
  FiadoDelPeriodo, Movimiento, ProgresoClientes, ReporteAlumnos, ReporteTurnos, TipoMovimiento,
  VentasDeVendedor,
} from './tipos';

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
  // 106: la compra de mercadería aparte y los pagos de comisión.
  compras_mercaderia?: number;
  mercaderia_aparte?: boolean;
  pagado_a_profesionales?: number | null;
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
    // 106. Con la mercadería aparte, `gastos` ya viene sin ella: la regla del
    // período la decidió la base y acá no se recalcula nada.
    comprasMercaderia: num(sql.compras_mercaderia),
    mercaderiaAparte: Boolean(sql.mercaderia_aparte),
    // A quien no ve sueldos le llega null: queda en 0, igual que el costo.
    pagadoAProfesionales: conCostos ? num(sql.pagado_a_profesionales) : 0,
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
  // 106
  compras_mercaderia?: number;
  mercaderia_aparte?: boolean;
  pagado_a_profesionales?: number | null;
}

export function mapearSerie(filas: FilaDiaSql[]): FilaDia[] {
  return filas.map((f) => ({
    fecha: f.fecha,
    ventas: num(f.ventas),
    gastos: num(f.gastos),
    otrosIngresos: num(f.otros_ingresos),
    ganancia: quizas(f.ganancia),
    comprasMercaderia: num(f.compras_mercaderia),
    mercaderiaAparte: Boolean(f.mercaderia_aparte),
    pagadoAProfesionales: quizas(f.pagado_a_profesionales),
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

// ------------------------------------------------------------------ reportes por rubro (106)
//
// Las lecturas por período que agregó la 106. Cada una devuelve UN jsonb (el
// patrón de este archivo) y, si falla, lanza: un reporte sin turnos porque no
// se pudo leer diría «no tuviste turnos». Los montos llegan como texto o
// número según PostgREST; se normalizan acá para que la pantalla y el Excel
// reciban números y los null sigan siendo null («no hay dato», no cero).

const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function mapearReporteTurnos(j: any): ReporteTurnos {
  const e = j?.por_estado ?? {};
  return {
    total: num(j?.total),
    por_estado: {
      pendiente: num(e.pendiente), confirmada: num(e.confirmada), atendida: num(e.atendida),
      no_vino: num(e.no_vino), cancelada: num(e.cancelada),
    },
    por_origen: { local: num(j?.por_origen?.local), publico: num(j?.por_origen?.publico) },
    por_profesional: lista<any>(j?.por_profesional).map((f) => ({
      id: String(f.id), nombre: String(f.nombre), total: num(f.total), atendidas: num(f.atendidas),
      no_vino: num(f.no_vino), canceladas: num(f.canceladas), pendientes: num(f.pendientes),
    })),
    por_servicio: lista<any>(j?.por_servicio).map((f) => ({
      producto_id: String(f.producto_id), nombre: String(f.nombre),
      total: num(f.total), atendidas: num(f.atendidas),
    })),
    clientes: lista<any>(j?.clientes).map((f) => ({
      cliente_id: String(f.cliente_id), nombre: String(f.nombre),
      visitas: num(f.visitas), ultima: String(f.ultima),
    })),
  };
}

export async function traerReporteTurnos(empresaId: string, desde: string, hasta: string): Promise<ReporteTurnos> {
  const respuesta = await clienteServidor().rpc('reporte_turnos', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return mapearReporteTurnos(exigir(respuesta, 'turnos del período'));
}

export function mapearReporteAlumnos(j: any): ReporteAlumnos {
  const p = j?.paquetes ?? {};
  return {
    clases_dadas: num(j?.clases_dadas),
    faltas: num(j?.faltas),
    por_semana: lista<any>(j?.por_semana).map((f) => ({
      semana: String(f.semana), dadas: num(f.dadas), faltas: num(f.faltas),
    })),
    cobrado: num(j?.cobrado),
    cobrado_por_clase: quizas(j?.cobrado_por_clase),
    por_cobrar: num(j?.por_cobrar),
    fiado_pendiente: num(j?.fiado_pendiente),
    activos: num(j?.activos),
    nuevos: num(j?.nuevos),
    paquetes: {
      vendidos: num(p.vendidos), terminados: num(p.terminados),
      vencidos: num(p.vencidos), renovaron: num(p.renovaron),
    },
    por_terminar: lista<any>(j?.por_terminar).map((f) => ({
      paquete: String(f.paquete), cliente_id: String(f.cliente_id), alumno: String(f.alumno),
      nombre: String(f.nombre), quedan: num(f.quedan), vence_el: f.vence_el ?? null,
    })),
    alumnos: lista<any>(j?.alumnos).map((f) => ({
      cliente_id: String(f.cliente_id), nombre: String(f.nombre),
      clases: num(f.clases), faltas: num(f.faltas), cobrado: num(f.cobrado),
      debe: num(f.debe), debe_inscripciones: num(f.debe_inscripciones), debe_fiado: num(f.debe_fiado),
      paquete: f.paquete ?? null, materia: f.materia ?? null,
      usadas: quizas(f.usadas), quedan: quizas(f.quedan),
      vence_el: f.vence_el ?? null, ultima_clase: f.ultima_clase ?? null,
    })),
    por_paquete: lista<any>(j?.por_paquete).map((f) => ({
      nombre: String(f.nombre), vendidos: num(f.vendidos), cobrado: num(f.cobrado),
    })),
    por_materia: lista<any>(j?.por_materia).map((f) => ({
      materia: f.materia ?? null, alumnos: num(f.alumnos), cobrado: num(f.cobrado),
    })),
  };
}

export async function traerReporteAlumnos(empresaId: string, desde: string, hasta: string): Promise<ReporteAlumnos> {
  const respuesta = await clienteServidor().rpc('reporte_alumnos', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return mapearReporteAlumnos(exigir(respuesta, 'alumnos del período'));
}

export function mapearProgresoClientes(j: any): ProgresoClientes {
  return {
    medidos: num(j?.medidos),
    con_peso: num(j?.con_peso),
    cambio_peso: quizas(j?.cambio_peso),
    con_cintura: num(j?.con_cintura),
    cambio_cintura: quizas(j?.cambio_cintura),
    con_grasa: num(j?.con_grasa),
    cambio_grasa: quizas(j?.cambio_grasa),
    sin_medir_30: num(j?.sin_medir_30),
    sin_rutina: num(j?.sin_rutina),
    clientes: lista<any>(j?.clientes).map((f) => ({
      cliente_id: String(f.cliente_id), nombre: String(f.nombre), activo: Boolean(f.activo),
      mediciones: num(f.mediciones),
      peso_inicial: quizas(f.peso_inicial), peso_final: quizas(f.peso_final), peso_cambio: quizas(f.peso_cambio),
      cintura_inicial: quizas(f.cintura_inicial), cintura_final: quizas(f.cintura_final),
      cintura_cambio: quizas(f.cintura_cambio),
      grasa_inicial: quizas(f.grasa_inicial), grasa_final: quizas(f.grasa_final), grasa_cambio: quizas(f.grasa_cambio),
      grasa_metodo: f.grasa_metodo ?? null,
      ultima_medicion: f.ultima_medicion ?? null,
      dias_sin_medir: quizas(f.dias_sin_medir),
      sin_medir_30: Boolean(f.sin_medir_30),
      rutina_vigente: f.rutina_vigente ?? null,
    })),
  };
}

/** Solo administración (como las medidas): a un vendedor la base lo rechaza. */
export async function traerProgresoClientes(empresaId: string, desde: string, hasta: string): Promise<ProgresoClientes> {
  const respuesta = await clienteServidor().rpc('progreso_clientes', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return mapearProgresoClientes(exigir(respuesta, 'progreso de los clientes'));
}

export function mapearVentasPorVendedor(filas: any[]): VentasDeVendedor[] {
  return lista<any>(filas).map((f) => ({
    user_id: f.user_id ?? null,
    nombre: f.nombre ?? null,
    rol: f.rol ?? null,
    vendido: num(f.vendido),
    cantidad: num(f.cantidad),
    ticket_promedio: quizas(f.ticket_promedio),
    anuladas: num(f.anuladas),
    monto_anulado: num(f.monto_anulado),
  }));
}

/** Solo administración: a un vendedor la base lo rechaza. */
export async function traerVentasPorVendedor(
  empresaId: string, desde: string, hasta: string,
): Promise<VentasDeVendedor[]> {
  const respuesta = await clienteServidor().rpc('ventas_por_vendedor', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return mapearVentasPorVendedor(exigirLista<any>(respuesta, 'ventas por vendedor'));
}

export function mapearFiadoDelPeriodo(j: any): FiadoDelPeriodo {
  return {
    otorgado: num(j?.otorgado),
    cobrado: num(j?.cobrado),
    clientes: lista<any>(j?.clientes).map((f) => ({
      cliente_id: String(f.cliente_id), nombre: String(f.nombre),
      otorgado: num(f.otorgado), cobrado: num(f.cobrado), saldo_hoy: num(f.saldo_hoy),
    })),
  };
}

export async function traerFiadoDelPeriodo(empresaId: string, desde: string, hasta: string): Promise<FiadoDelPeriodo> {
  const respuesta = await clienteServidor().rpc('fiado_del_periodo', {
    p_empresa: empresaId, p_desde: desde, p_hasta: hasta,
  });
  return mapearFiadoDelPeriodo(exigir(respuesta, 'fiado del período'));
}
