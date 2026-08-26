export type Rol = 'propietario' | 'admin' | 'vendedor';
export type TipoMovimiento = 'venta' | 'gasto' | 'ingreso';
/**
 * Lo que la captura por voz, foto o texto puede llegar a entender.
 *
 * Es más ancho que TipoMovimiento a propósito: contraer una deuda NO es un
 * movimiento —no entra ni sale plata al firmarla— pero sí es algo que
 * alguien le puede dictar a la app. Tenerlos separados es lo que evita que
 * una deuda termine sumando en los ingresos del día.
 */
export type TipoCaptura = TipoMovimiento | 'deuda' | 'pago_deuda';
export type ClaseDeuda = 'tarjeta' | 'prestamo' | 'proveedor' | 'otro';
export type Origen = 'manual' | 'texto' | 'audio' | 'foto';
export type Medida = 'ventas' | 'ganancia';
export type EstadoMovimiento = 'activo' | 'anulado';

export interface Empresa {
  id: string;
  nombre: string;
  moneda: string;
  /**
   * ESPEJO / LEGADO. La autoridad sobre el plan es `suscripciones` +
   * `plan_efectivo()`. No usar este campo para habilitar funciones.
   */
  plan: string;
  permitir_stock_negativo: boolean;
  creada_por: string;
  created_at: string;
}

export type PlanEfectivo = 'gratis' | 'pro' | 'negocio';
export type PeriodoCobro = 'mensual' | 'anual';
export type EstadoSuscripcion = 'activa' | 'prueba' | 'vencida' | 'cancelada' | 'morosa';
export type TipoAdjunto = 'foto' | 'audio';

/** Qué habilita el plan. Lo decide la base, no la interfaz. */
export interface LimitesPlan {
  capturas_mes: number;
  miembros: number;
  adjuntos: boolean;
  excel: boolean;
  avisos: boolean;
}

export interface EstadoDelPlan {
  estado: EstadoSuscripcion;
  plan: string;
  periodo: PeriodoCobro;
  periodo_fin: string | null;
  en_prueba: boolean;
  /** Días enteros que faltan para que venza. Cero si ya venció. */
  dias_restantes: number;
  ya_uso_prueba: boolean;
  cancela_al_vencer: boolean;
}

/** Lo que devuelve datos_empresa(): ya filtrado por lo que la persona puede ver. */
export interface DatosEmpresa {
  id: string;
  nombre: string;
  moneda: string;
  zona_horaria: string;
  plan_efectivo: PlanEfectivo;
  permitir_stock_negativo: boolean;
  /** null si quien pregunta no es propietario ni administrador. */
  codigo_acceso: string | null;
  limites: LimitesPlan;
  uso_ia: { usados: number; tope: number };
  suscripcion: EstadoDelPlan;
  miembros: number;
}

export interface Miembro {
  id: string;
  empresa_id: string;
  user_id: string;
  nombre: string;
  rol: Rol;
  created_at: string;
}

export interface Producto {
  id: string;
  empresa_id: string;
  nombre: string;
  categoria: string;
  /** null cuando quien consulta no puede ver costos (un vendedor). */
  costo: number | null;
  precio: number;
  stock: number;
  stock_minimo: number;
  controla_stock: boolean;
  activo: boolean;
  created_at: string;
}

export interface MovimientoItem {
  id: string;
  movimiento_id: string;
  empresa_id: string;
  producto_id: string | null;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  /** null cuando quien consulta no puede ver costos (un vendedor). */
  costo_unitario: number | null;
  /** true si esta línea descontó stock. Al anular se devuelve exactamente eso. */
  afecto_stock: boolean;
}

export interface Movimiento {
  id: string;
  empresa_id: string;
  tipo: TipoMovimiento;
  estado: EstadoMovimiento;
  fecha: string;
  descripcion: string;
  categoria: string;
  /** Precio de lista por lo vendido, antes del descuento. */
  subtotal: number;
  descuento: number;
  /** Lo que realmente se cobró: subtotal − descuento. Es el número que manda. */
  monto: number;
  /** null cuando quien consulta no puede ver costos (un vendedor). */
  costo_total: number | null;
  metodo_pago: string;
  contraparte: string | null;
  notas: string | null;
  origen: Origen;
  creado_por: string | null;
  created_at: string;
  anulado_por: string | null;
  anulado_at: string | null;
  motivo_anulacion: string | null;
  actualizado_por: string | null;
  updated_at: string | null;
  movimiento_items?: MovimientoItem[];
}

export interface Suscripcion {
  id: string;
  empresa_id: string;
  plan: string;
  estado: 'activa' | 'prueba' | 'vencida' | 'cancelada';
  periodo_inicio: string | null;
  periodo_fin: string | null;
}

export interface Reto {
  id: string;
  empresa_id: string;
  nombre: string;
  meta: number;
  medida: Medida;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  created_at: string;
}

/** Lo que devuelve la IA después de escuchar/leer/mirar algo. */
export interface ItemInterpretado {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  /**
   * Solo se usa para productos sueltos (sin producto_id). Si la línea apunta a
   * un producto del catálogo, la base ignora este valor y usa productos.costo.
   */
  costo_unitario?: number | null;
  producto_id?: string | null;
}

/**
 * Lo que la IA entendió de una deuda dictada, ya limpio por el servidor.
 *
 * Va aparte de los campos del movimiento porque casi ninguno sirve para los
 * dos: una venta no tiene acreedor ni cuotas, y una deuda no tiene método de
 * pago.
 */
export interface DeudaInterpretada {
  clase: ClaseDeuda;
  acreedor: string | null;
  cuotas: number | null;
  monto_cuota: number | null;
  /** YYYY-MM-DD. */
  vence_el: string | null;
  /**
   * Solo en pago_deuda: a cuál de las deudas ya cargadas corresponde. El
   * servidor lo valida contra las deudas reales de la empresa, así que si
   * llega con valor es un id que existe. Si viene null, hay que preguntar.
   */
  deuda_id: string | null;
}

export interface CapturaInterpretada {
  tipo: TipoCaptura;
  fecha?: string | null;
  descripcion: string;
  categoria: string;
  monto: number;
  metodo_pago: string;
  contraparte?: string | null;
  items: ItemInterpretado[];
  /** Solo cuando tipo es 'deuda' o 'pago_deuda'. */
  deuda?: DeudaInterpretada | null;
  confianza: number;
  aviso?: string | null;
  transcripcion?: string | null;
}

/** Un respaldo colgado de un movimiento. Ver migración 007. */
export interface Adjunto {
  id: string;
  tipo: TipoAdjunto;
  /** Ruta dentro del bucket `comprobantes`. null en las transcripciones de audio. */
  ruta: string | null;
  mime: string | null;
  bytes: number;
  /** Transcripción de la nota de voz, o lo que la IA leyó de la foto. */
  texto: string;
  creado_por: string | null;
  created_at: string;
}

/** Preferencias de la PERSONA, no del negocio. Ver migración 010. */
export interface Preferencias {
  idioma: string;
  aviso_cierre: boolean;
  aviso_semanal: boolean;
  /** Hora del día (0–23), en la zona del negocio. */
  hora_cierre: number;
}

/** Lo que devuelve cierre_del_dia(). Todo calculado en PostgreSQL. */
export interface Racha {
  hoy: string;
  dias: number;
  desde: string | null;
  hoy_cargado: boolean;
  /** Viene de ayer y hoy todavía está vacío: el único momento para empujar. */
  en_riesgo: boolean;
  mejor: number;
  dias_activos: number;
}

export interface ResumenCrudo {
  ventas: number;
  gastos: number;
  otros_ingresos: number;
  cantidad_ventas: number;
  unidades_vendidas: number;
  ticket_promedio: number;
  /** null cuando quien consulta no puede ver rentabilidad. */
  ganancia_neta: number | null;
  ganancia_bruta: number | null;
  con_costos: boolean;
}

export interface CierreDelDia {
  fecha: string;
  es_hoy: boolean;
  hubo_actividad: boolean;
  resumen: ResumenCrudo;
  misma_dia_semana_pasada: ResumenCrudo;
  promedio_semana: { ventas: number; gastos: number; ganancia_neta: number | null };
  producto_estrella: { nombre: string; unidades: number; ingresos: number } | null;
  racha: Racha;
  ya_cerrado: boolean;
}

export interface Precio {
  plan: 'pro' | 'negocio';
  moneda: string;
  periodo: PeriodoCobro;
  importe: number;
  referencia_externa: string | null;
}

export type TipoDeuda = 'tarjeta' | 'prestamo' | 'proveedor' | 'otro';

/** Lo que devuelve listar_deudas(). Ver migración 015. */
export interface Deuda {
  id: string;
  tipo: TipoDeuda;
  nombre: string;
  acreedor: string;
  monto_original: number;
  /** Lo que FALTA pagar. Solo lo cambia registrar_pago_deuda(). */
  saldo: number;
  pagado: number;
  /** Porcentaje ya pagado, 0 a 100. */
  avance: number;
  cuotas_totales: number | null;
  cuotas_pagadas: number;
  monto_cuota: number | null;
  vence_el: string | null;
  /** Negativo si ya venció. null si la deuda no tiene vencimiento. */
  dias_para_vencer: number | null;
  vencida: boolean;
  saldada: boolean;
  activa: boolean;
  notas: string;
}

export interface ResumenDeudas {
  total_debido: number;
  cuantas: number;
  vencidas: number;
  monto_vencido: number;
  /** Cuántas vencen dentro de los próximos siete días. */
  vence_pronto: number;
  /** Lo que hay que tener disponible para esas: la cuota, no el saldo entero. */
  monto_pronto: number;
  proximo_vencimiento: string | null;
}

export interface PagoDeuda {
  id: string;
  monto: number;
  fecha: string;
  movimiento_id: string | null;
  nota: string;
  created_at: string;
}
