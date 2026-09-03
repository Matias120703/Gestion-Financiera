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
  /**
   * 'personal' = finanzas propias, sin ventas ni productos.
   * 'emprendedor' = el negocio completo.
   * De acá cuelgan el largo de la prueba, los planes que se muestran y
   * qué pantallas existen.
   */
  tipo_cuenta: TipoCuenta;
  /** Solo tiene sentido en una cuenta de negocio. Ver src/lib/rubros.ts. */
  rubro: Rubro;
  creada_por: string;
  created_at: string;
}

export type TipoCuenta = 'personal' | 'emprendedor';
/**
 * El rubro adapta vocabulario, categorías sugeridas y qué secciones existen.
 * NO es un permiso: lo que protege datos sigue siendo RLS y los roles.
 * Ver migración 021 y src/lib/rubros.ts.
 */
export type Rubro = 'comercio' | 'ganaderia' | 'agricultura' | 'servicios';
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
  /**
   * Si es false, la cuenta está vencida: se ve todo y se baja el Excel, pero
   * no se carga nada nuevo. Lo aplica PostgreSQL con triggers, no la
   * pantalla — acá solo sirve para avisar antes del choque. Ver migración 018.
   */
  escritura: boolean;
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


/**
 * Una cuenta vista desde el panel del dueño del sistema.
 *
 * Fijate qué NO hay acá: ni un monto, ni una venta, ni una deuda. Solo lo
 * necesario para administrar el cobro, más señales de uso (cuántos
 * movimientos, cuándo fue el último, cuánta IA consumió) que no dicen nada
 * del negocio de nadie. Ver la migración 016.
 */
export interface CuentaAdmin {
  empresa_id: string;
  nombre: string;
  tipo_cuenta: TipoCuenta;
  moneda: string;
  creada: string;
  propietario: string;
  correo: string;
  /** El que manda: lo calcula la base mirando estado y fechas. */
  plan: PlanEfectivo;
  /** Lo que dice la columna, que puede estar vencido. Solo para depurar. */
  plan_guardado: string;
  estado: EstadoSuscripcion;
  periodo_fin: string | null;
  prueba_fin: string | null;
  /** Negativo = ya venció. Es el número por el que se ordena la lista. */
  dias_restantes: number | null;
  miembros: number;
  movimientos: number;
  ultima_actividad: string | null;
  ia_usada: number;
  ia_tope: number;
  /** El rubro elegido al crear la cuenta. Ver migración 021. */
  rubro: Rubro;
  /**
   * Quedó sin nadie adentro. Pasa al borrar un usuario desde Supabase: la
   * empresa sobrevive y nadie puede entrar. Ver migración 022.
   */
  sin_duenio: boolean;
  /** Lo contestó quien creó la cuenta, no la administración. */
  como_nos_conocio: string;
  /** Ficha de seguimiento: solo la ve y la escribe la administración. */
  contacto: string;
  telefono: string;
  se_dedica: string;
  notas: string;
  /** Si hay un cambio de plan que todavía se puede revertir. */
  puede_deshacer: boolean;
}

/**
 * Las finanzas de Orden mismo, para el panel.
 *
 * Salen de los mismos movimientos que ve cualquier cliente: no hay una
 * contabilidad paralela. Ver migración 019.
 */
export type FinanzasOrden =
  | { configurada: false }
  | {
      configurada: true;
      empresa_id: string;
      nombre: string;
      moneda: string;
      cobrado_mes: number;
      cobrado_total: number;
      cobros_mes: number;
      ingresos_mes: number;
      gastos_mes: number;
      deuda_total: number;
      deudas_vencidas: number;
    };

export interface ResumenPanel {
  cuentas: number;
  personales: number;
  comercios: number;
  en_prueba: number;
  pagando: number;
  vencidas: number;
  vencen_semana: number;
  ia_mes: number;
}

/** Una acción del panel, para el historial de una cuenta. */
export interface AccionAdmin {
  accion: string;
  detalle: Record<string, any>;
  cuando: string;
  quien: string;
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
  /**
   * El mismo plan cuesta distinto según a quién se le vende: una cuenta
   * personal y un comercio pueden estar los dos en `pro` y pagar distinto,
   * porque no reciben el mismo valor. El plan decide QUÉ SE PUEDE HACER;
   * este par decide CUÁNTO SE PAGA. Ver migración 017.
   */
  tipo_cuenta: TipoCuenta;
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

/**
 * LA CUENTA PERSONAL
 *
 * Lo que devuelve `resumen_personal()`. El ciclo no es el mes calendario:
 * va de cobro a cobro, porque para alguien con sueldo el mes útil empieza el
 * día que cobra.
 */
export interface IngresoFijo {
  id: string;
  nombre: string;
  importe: number;
  dia_del_mes: number;
  /** Cuál define el ciclo, si hay varios. */
  principal: boolean;
}

/**
 * Algo que se paga todos los meses: el wifi, la línea del celular, el bus.
 *
 * `dia_del_mes` puede ir en null a propósito — el pasaje del bus se gasta
 * todos los días, no tiene fecha. Obligar a inventar un día haría que el
 * dato sea mentira.
 */
export interface GastoFijo {
  id: string;
  nombre: string;
  importe: number;
  categoria: string;
  dia_del_mes: number | null;
  notas: string;
}

/**
 * Un fondo de ahorro. Guardar plata no es gastarla —seguís teniéndola— así
 * que un aporte no aparece como gasto en ningún reporte. Pero sí baja lo
 * disponible: no la podés gastar dos veces.
 */
export interface Ahorro {
  id: string;
  nombre: string;
  /** Cuánto quiere juntar. Null si ahorra sin meta puesta. */
  meta: number | null;
  /** Para cuándo lo quiere tener. Null si ahorra sin fecha. */
  fecha_limite: string | null;
  saldo: number;
  /** Lo que falta para la meta, nunca negativo. Null si no hay meta. */
  falta: number | null;
  /** Negativo si la fecha ya pasó. Null si no hay fecha. */
  dias_para_limite: number | null;
  /**
   * Cuánto habría que guardar por mes para llegar a tiempo, calculado en la
   * base. Null cuando no hay ritmo que calcular, y son tres situaciones
   * distintas que se distinguen mirando los otros campos: sin meta, sin
   * fecha, o con la fecha ya vencida sin haber llegado. Cero significa que
   * la meta ya está juntada.
   */
  por_mes: number | null;
}

/**
 * Una categoría que la cuenta puede usar: las de fábrica más las que la
 * persona creó. `propia` marca cuáles se pueden editar o borrar.
 */
export interface CategoriaDeCuenta {
  nombre: string;
  pistas: string;
  propia: boolean;
}

/** De dónde vino la plata que entró en el ciclo. */
export interface EntradaPorCategoria {
  categoria: string;
  monto: number;
}

export interface LineaPlan {
  categoria: string;
  planeado: number;
  gastado: number;
  /** Negativo si se pasó. No se recorta en cero a propósito. */
  resta: number;
}

export interface ResumenPersonal {
  desde: string;
  hasta: string;
  dia_cobro: number;
  dias_restantes: number;
  entro: number;
  salio: number;
  /** Cuotas que todavía no se pagaron y vencen antes de que cierre el ciclo. */
  cuotas_por_vencer: number;
  /**
   * Lo que falta pagar de los gastos fijos, comparado por categoría contra
   * lo que ya se gastó en el ciclo. Nunca cuenta dos veces algo ya pagado.
   */
  fijos_por_pagar: number;
  disponible: number;
  por_dia: number;
  plan: LineaPlan[];
  gastado_sin_planear: number;
  ingresos_fijos: IngresoFijo[];
  gastos_fijos: GastoFijo[];
  ahorros: Ahorro[];
  /** Lo guardado en este ciclo, neto de retiros. Puede ser negativo. */
  ahorrado_en_el_ciclo: number;
  /** Lo acumulado de siempre, sumando todos los fondos. */
  ahorro_total: number;
  de_donde_vino: EntradaPorCategoria[];
  esperado: number;
  /** La suma de todos los gastos fijos del mes, se hayan pagado o no. */
  fijo_mensual: number;
  /** Hay ingresos fijos cargados y todavía no entró ninguno en este ciclo. */
  cobro_pendiente: boolean;
}

/** Cómo se reparte lo que cobra un profesional. */
export type Reparto = 'local' | 'comision' | 'alquiler' | 'sueldo';

export interface Profesional {
  id: string;
  nombre: string;
  /** Null si no tiene cuenta en Orden: el dueño le carga los cortes. */
  user_id: string | null;
  reparto: Reparto;
  /** Qué porcentaje se lleva ÉL. Solo con comisión. */
  porcentaje: number | null;
  activo: boolean;
}

export interface CorteAtribuido {
  id: string;
  profesional: string;
  servicio: string;
  fecha: string;
  monto: number;
  parte_profesional: number;
  parte_local: number;
  reparto: Reparto;
  anulado: boolean;
}

/**
 * El desglose del propietario. Los tres primeros suman exactamente
 * `ganancia_bruta`, que es la misma que ya calcula el panel.
 */
export interface ResumenReparto {
  /** Lo que le quedó de los cortes que hizo con sus propias manos. */
  mis_cortes: number;
  /** Lo que le quedó de los cortes que hizo su equipo. */
  de_mi_equipo: number;
  /** Margen de lo que vendió y no es un servicio: cera, shampoo, peines. */
  mercaderia: number;
  /** Lo que entró sin ser una venta. Acá cae el alquiler de las sillas. */
  otros_ingresos: number;
  ganancia_bruta: number;
  total: number;
  cortes: CorteAtribuido[];
}

export interface FilaLiquidacion {
  id: string;
  nombre: string;
  reparto: Reparto;
  porcentaje: number | null;
  activo: boolean;
  cortes: number;
  cobrado: number;
  le_toca: number;
  del_local: number;
  pagado: number;
  /** Lo que está en la caja del local pero es de él. */
  le_debe: number;
}

export interface MisServicios {
  es_profesional: boolean;
  cortes: { fecha: string; servicio: string; monto: number; tuyo: number }[];
  le_toca: number;
  pagado: number;
  le_deben: number;
}

// ---- La agenda pública: lo único que sale al mundo sin sesión ----

export interface ServicioPublico {
  id: string;
  nombre: string;
  /** Minutos. De acá salen los huecos. */
  duracion: number;
  precio: number;
}

export interface ProfesionalPublico {
  id: string;
  nombre: string;
  servicios: ServicioPublico[];
}

/**
 * Lo que devuelve `agenda_publica`. No trae el id de la empresa, ni costos,
 * ni productos con stock: si algo de eso hiciera falta acá, sería que la
 * función de la base está devolviendo de más.
 */
export interface AgendaPublica {
  existe: boolean;
  negocio?: string;
  direccion?: string;
  mensaje?: string;
  moneda: string;
  profesionales: ProfesionalPublico[];
}

/** La reserva vista con el token. Nunca trae teléfonos. */
export interface ReservaPorToken {
  existe: boolean;
  inicia?: string;
  termina?: string;
  estado?: string;
  servicio?: string;
  con?: string;
  negocio?: string;
  cliente?: string;
}

export interface TurnoDelDia {
  id: string;
  inicia: string;
  termina: string;
  profesional: string;
  profesional_id: string;
  servicio: string;
  cliente: string;
  telefono: string;
  estado: 'pendiente' | 'confirmada' | 'atendida' | 'no_vino';
  origen: 'local' | 'publico';
}

export interface HorarioSemanal {
  id: string;
  profesional_id: string;
  /** 0 = domingo, igual que `extract(dow)`. */
  dia_semana: number;
  desde: string;
  hasta: string;
  activo: boolean;
}

export interface ServicioAgenda {
  producto_id: string;
  duracion_min: number;
  reservable: boolean;
}

/** El link público del negocio. */
export interface LinkPublico {
  slug: string;
  activo: boolean;
  titulo: string;
  mensaje: string;
  direccion: string;
}

export interface PagoDeuda {
  id: string;
  monto: number;
  fecha: string;
  movimiento_id: string | null;
  nota: string;
  created_at: string;
}
