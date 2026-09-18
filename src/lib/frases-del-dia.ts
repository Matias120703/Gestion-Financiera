import { dinero } from './formato';

/**
 * LO QUE LE DICE ORDEN A CADA UNO, TODOS LOS DÍAS.
 *
 * Los números salen de la base (`avisos_del_dia`, 071). Acá solo se elige la
 * frase: si ayer vendió o no, si ganó o perdió, cuánto más que el día
 * anterior. Es una función pura, sin red, para poder probar cada caso sin
 * mandar una sola notificación.
 *
 * LAS TRES REGLAS
 *
 *   · A la mañana siempre hay algo que decir: cómo fue ayer, o un empujón
 *     para arrancar si ayer no cargó nada.
 *   · A la tarde solo se escribe si todavía no cargó nada hoy. A quien ya
 *     cargó, «no te olvides de cargar» es ruido.
 *   · A la noche solo si cargó algo: el resumen de un día vacío no dice nada.
 *     Ese caso lo cubre el aviso de la racha (tareas/recordatorio).
 *
 * Los textos llegan como parámetro con esta forma y no importando el
 * diccionario: este archivo se compila suelto para las pruebas y no puede
 * traer i18n (ver probar:calculos).
 */

export type Momento = 'manana' | 'tarde' | 'noche';

export const MOMENTOS: Momento[] = ['manana', 'tarde', 'noche'];

export interface NumerosDelDia {
  ventas: number;
  ingresos: number;
  gastos: number;
  ganancia: number;
  cargados: number;
}

export interface RachaDelDia {
  /** Días seguidos cargando, hasta hoy si ya cargó algo, o hasta ayer si no. */
  dias: number;
  /** La racha llega hasta ayer y hoy todavía está vacío: es el momento de empujar. */
  en_riesgo: boolean;
}

export interface CuentaDelDia {
  nombre: string;
  moneda: string;
  tipo_cuenta: 'personal' | 'emprendedor' | string;
  hoy: NumerosDelDia;
  ayer: NumerosDelDia;
  racha?: RachaDelDia;
}

export interface TextosDelDia {
  manana: {
    negocioConVentas: (ventas: string, ganancia: string) => string;
    negocioConPerdida: (ventas: string, perdida: string) => string;
    negocioSoloGastos: (gastos: string) => string;
    negocioNada: string;
    personalConGastos: (gastos: string) => string;
    personalSoloIngresos: (ingresos: string) => string;
    personalNada: string;
    /** Se agrega al final cuando la racha (contada hasta ayer) ya vale la pena decirla. */
    rachaLinea: (dias: number) => string;
  };
  tarde: {
    negocio: string;
    personal: string;
    /** Con racha en juego: empuja más fuerte que el genérico. */
    negocioRacha: (dias: number) => string;
    personalRacha: (dias: number) => string;
  };
  noche: {
    titulo: (nombre: string) => string;
    negocio: (ventas: string, comparacion: string, gastos: string, ganancia: string) => string;
    negocioConPerdida: (ventas: string, comparacion: string, gastos: string, perdida: string) => string;
    negocioSinVentas: (gastos: string) => string;
    personal: (ingresos: string, gastos: string) => string;
    personalSoloGastos: (gastos: string) => string;
    personalSoloIngresos: (ingresos: string) => string;
    masQueAyer: (pct: number) => string;
    menosQueAyer: (pct: number) => string;
    igualQueAyer: string;
    /** Se agrega al final cuando hoy extendió una racha que ya vale la pena decir. */
    rachaLinea: (dias: number) => string;
  };
}

/**
 * Desde cuántos días seguidos la racha ya es una frase, no un detalle.
 *
 * Un solo día es «cargaste hoy», que el resto del mensaje ya dice. Dos es lo
 * mínimo que empieza a sonar a racha de verdad.
 */
const RACHA_MINIMA = 2;

export interface Frase {
  titulo: string;
  cuerpo: string;
  url: string;
}

const n = (v: unknown) => Number(v ?? 0) || 0;

/**
 * «(12% más que ayer)». Solo si ayer hubo ventas: contra cero no hay
 * porcentaje que tenga sentido.
 */
export function comparacionConAyer(hoy: number, ayer: number, tx: TextosDelDia['noche']): string {
  if (!(ayer > 0)) return '';
  const pct = Math.round(((hoy - ayer) / ayer) * 100);
  if (pct > 0) return tx.masQueAyer(pct);
  if (pct < 0) return tx.menosQueAyer(-pct);
  return tx.igualQueAyer;
}

export function fraseDelDia(
  momento: Momento,
  cuenta: CuentaDelDia,
  tx: TextosDelDia,
  locale: string,
): Frase | null {
  const plata = (v: number) => dinero(v, cuenta.moneda, true, locale);
  const personal = cuenta.tipo_cuenta === 'personal';
  const url = '/panel';
  const rachaDias = n(cuenta.racha?.dias);
  const rachaEnRiesgo = Boolean(cuenta.racha?.en_riesgo);
  const conRacha = (base: string, linea: (dias: number) => string) =>
    rachaDias >= RACHA_MINIMA ? `${base} ${linea(rachaDias)}` : base;

  if (momento === 'manana') {
    const a = cuenta.ayer;
    let cuerpo: string;
    if (personal) {
      // Para una persona, lo que entra es todo junto: no vende.
      const entro = n(a.ingresos) + n(a.ventas);
      cuerpo = n(a.gastos) > 0 ? tx.manana.personalConGastos(plata(n(a.gastos)))
        : entro > 0 ? tx.manana.personalSoloIngresos(plata(entro))
        : tx.manana.personalNada;
    } else if (n(a.ventas) > 0) {
      cuerpo = n(a.ganancia) >= 0
        ? tx.manana.negocioConVentas(plata(n(a.ventas)), plata(n(a.ganancia)))
        : tx.manana.negocioConPerdida(plata(n(a.ventas)), plata(-n(a.ganancia)));
    } else if (n(a.gastos) > 0) {
      cuerpo = tx.manana.negocioSoloGastos(plata(n(a.gastos)));
    } else {
      cuerpo = tx.manana.negocioNada;
    }
    // Acá la racha viene contada hasta AYER (todavía no cargó nada hoy): es
    // lo que trae de la noche anterior, para arrancar el día sabiéndolo.
    return { titulo: cuenta.nombre, cuerpo: conRacha(cuerpo, tx.manana.rachaLinea), url };
  }

  if (momento === 'tarde') {
    if (n(cuenta.hoy.cargados) > 0) return null;
    // Con una racha en juego, el empujón pega más fuerte que el genérico:
    // no es solo «cargá algo», es «no cortés lo que venís haciendo».
    const cuerpo = rachaEnRiesgo && rachaDias >= RACHA_MINIMA
      ? (personal ? tx.tarde.personalRacha(rachaDias) : tx.tarde.negocioRacha(rachaDias))
      : (personal ? tx.tarde.personal : tx.tarde.negocio);
    return { titulo: cuenta.nombre, cuerpo, url };
  }

  // noche
  const h = cuenta.hoy;
  if (n(h.cargados) === 0) return null;
  const titulo = tx.noche.titulo(cuenta.nombre);

  if (personal) {
    const entro = n(h.ingresos) + n(h.ventas);
    const cuerpo = entro > 0 && n(h.gastos) > 0 ? tx.noche.personal(plata(entro), plata(n(h.gastos)))
      : n(h.gastos) > 0 ? tx.noche.personalSoloGastos(plata(n(h.gastos)))
      : tx.noche.personalSoloIngresos(plata(entro));
    return { titulo, cuerpo: conRacha(cuerpo, tx.noche.rachaLinea), url };
  }

  if (n(h.ventas) === 0) {
    // Cargó algo que no es venta ni gasto (un ingreso suelto): igual se dice.
    return { titulo, cuerpo: conRacha(tx.noche.negocioSinVentas(plata(n(h.gastos))), tx.noche.rachaLinea), url };
  }

  const comparacion = comparacionConAyer(n(h.ventas), n(cuenta.ayer.ventas), tx.noche);
  const cuerpo = n(h.ganancia) >= 0
    ? tx.noche.negocio(plata(n(h.ventas)), comparacion, plata(n(h.gastos)), plata(n(h.ganancia)))
    : tx.noche.negocioConPerdida(plata(n(h.ventas)), comparacion, plata(n(h.gastos)), plata(-n(h.ganancia)));
  return { titulo, cuerpo: conRacha(cuerpo, tx.noche.rachaLinea), url };
}
