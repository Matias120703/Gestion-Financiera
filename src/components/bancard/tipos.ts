/**
 * Lo que devuelve `bancard_operacion_ver` (125): una operación tal como la
 * puede ver quien administra la cuenta. Solo lo que el manual de Bancard deja
 * mostrar: nunca el número de autorización ni el código de respuesta.
 */
export interface OperacionVista {
  operacion: number;
  estado: 'creada' | 'en_3ds' | 'incierta' | 'pagada' | 'rechazada' | 'revertida' | 'vencida';
  tipo: 'plan' | 'personas';
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

export const ESTADOS_VIVOS: OperacionVista['estado'][] = ['creada', 'en_3ds', 'incierta'];

export function estaViva(estado: string | null | undefined): boolean {
  return ESTADOS_VIVOS.includes(estado as OperacionVista['estado']);
}
