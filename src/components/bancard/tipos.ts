/**
 * Lo que devuelve `bancard_operacion_ver` (125): una operación tal como la
 * puede ver quien administra la cuenta. Solo lo que el manual de Bancard deja
 * mostrar: nunca el número de autorización ni el código de respuesta.
 */
export interface OperacionVista {
  operacion: number;
  estado: 'creada' | 'en_3ds' | 'incierta' | 'pagada' | 'rechazada' | 'revertida' | 'vencida';
  /** 'cambio' = subir de plan con días pagos (130): `plan` es el nuevo y `desglose.plan_antes` el de antes. */
  tipo: 'plan' | 'personas' | 'cambio';
  medio: 'formulario' | 'token';
  origen: 'usuario' | 'automatico';
  plan: 'basico' | 'pro' | 'negocio';
  periodo: 'mensual' | 'anual';
  personas: number | null;
  desglose: unknown;
  importe: number;
  moneda: 'PYG';
  /** La de la confirmación si se pagó; si no, la de creación. */
  fecha: string;
  minutos: number;
  /** `response_description` de Bancard: lo único de su respuesta que se muestra. */
  descripcion_respuesta: string | null;
  vence: string | null;
  entorno: 'staging' | 'produccion';
  tarjeta: { marca: string | null; ultimos4: string | null } | null;
  process_id: string | null;
}

/**
 * ¿Se le cobra sola a esta cuenta si guarda la tarjeta? (decisión del 07/10/2026)
 *
 *   · 'activa'   tiene un plan pago activo: el día anterior al vencimiento se
 *                cobra de la tarjeta guardada (lo decide `bancard_tomar_cobro`).
 *   · 'prueba'   está probando: la tarjeta queda guardada y NO se cobra sola;
 *                cuando termine la prueba elige su plan y paga con un toque.
 *   · 'sin_plan' la prueba ya terminó, o el plan está vencido o cancelado:
 *                lo mismo, sin «cuando termine la prueba».
 *
 * Las pantallas no prometen ningún cobro automático fuera de 'activa'.
 */
export type MomentoDelDebito = 'activa' | 'prueba' | 'sin_plan';

/**
 * Lo que la base deja en `bancard_cuentas.ultimo_error` cuando la
 * administración revierte un pago y el débito queda pausado
 * (`bancard_revertir`, 125). La pantalla lo reconoce para no decir «no
 * pudimos cobrar: …» de algo que no fue un rechazo; el texto que ve la
 * persona es `t.bancard.tarjeta.pagoRevertido`, en su idioma.
 */
export const ERROR_PAGO_REVERTIDO = 'Pago revertido por la administración';

export const ESTADOS_VIVOS: OperacionVista['estado'][] = ['creada', 'en_3ds', 'incierta'];

export function estaViva(estado: string | null | undefined): boolean {
  return ESTADOS_VIVOS.includes(estado as OperacionVista['estado']);
}
