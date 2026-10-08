/**
 * QUÉ ES UN PAGO Y QUÉ ES UN INTENTO, en el panel de la administración (08/10/2026).
 *
 * Matías: «cuando entro en cambiar el plan y salgo sin pagar, en mi panel me
 * aparece que se abrió eso; solo me tiene que aparecer lo pagado». Cada vez
 * que alguien abre el formulario de Bancard, Orden anota una operación
 * («Abierta»); si no paga, queda «Vencida». Eso sirve para diagnosticar, pero
 * no es un pago.
 *
 * En «Últimos pagos» van, por defecto, solo las operaciones donde hubo plata
 * o puede haberla: pagadas, revertidas, las que están sin resolver (incierta,
 * esperando 3D Secure) y cualquiera marcada «para revisar». Abrir y cerrar,
 * dejar vencer o un rechazo son INTENTOS: no se muestran salvo que se pidan.
 *
 * Puro y sin imports, para poder probarlo.
 */
export interface OperacionMinima {
  estado: string;
  revisar?: string | null;
}

/** Estados en los que no entró plata ni puede haber entrado. */
const SOLO_INTENTO = new Set(['creada', 'vencida', 'rechazada']);

export function esUnIntentoSinPagar(o: OperacionMinima): boolean {
  if (typeof o.revisar === 'string' && o.revisar.trim() !== '') return false;
  return SOLO_INTENTO.has(o.estado);
}

/** Separa lo que se muestra siempre (pagos) de lo que queda detrás del enlace (intentos), sin cambiar el orden. */
export function separarPagos<T extends OperacionMinima>(ops: readonly T[]): { pagos: T[]; intentos: T[] } {
  const pagos: T[] = [];
  const intentos: T[] = [];
  for (const o of ops) (esUnIntentoSinPagar(o) ? intentos : pagos).push(o);
  return { pagos, intentos };
}

/** El texto del enlace que muestra u oculta los intentos. */
export function textoDeIntentos(cuantos: number, a_la_vista: boolean): string {
  if (a_la_vista) return 'Ocultar los intentos sin pagar';
  return cuantos === 1 ? 'Ver también 1 intento sin pagar' : `Ver también ${cuantos} intentos sin pagar`;
}
