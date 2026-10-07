import { dinero } from './formato';
import type { Frase } from './frases-del-dia';

/**
 * «HOY TE PAGA JUAN»: EL AVISO DE LA MAÑANA DE LOS COBROS CON FECHA (127).
 *
 * Quién cobra hoy, cuánto y quién sigue atrasado lo decide la base
 * (`cobros_de_hoy`): ella sabe qué cuota está pagada y a cuál le toca aviso
 * (el día que vence, a los 3 días y después una vez por semana). Acá solo se
 * elige la frase, como en `frases-del-dia.ts`: función pura, sin red, para
 * probar cada caso sin mandar una sola notificación.
 *
 * Los textos llegan como parámetro y no importando el diccionario: este
 * archivo se compila suelto para las pruebas (ver probar:calculos).
 */

/** Una mitad del aviso: lo de hoy, o lo atrasado. */
export interface ParteDeCobros {
  /** Cuotas. */
  cuantas: number;
  /**
   * Gente distinta. Una persona con dos cuotas hoy es UNA a quien cobrarle,
   * y la frase habla de personas («Hoy te pagan 2»). Si la base no lo manda,
   * se usa `cuantas`.
   */
  personas?: number;
  /** Lo que FALTA cobrar: una cuota a medias cuenta por lo pendiente. */
  monto: number;
  /** Nombres de pila, hasta tres, sin repetir a nadie. */
  nombres: string[];
}

/** Lo que devuelve `cobros_de_hoy()` por cuenta (la forma de `CobrosDeHoy`, tipos.ts). */
export interface CobrosDeLaCuenta {
  nombre: string;
  moneda: string;
  tipo_cuenta: 'personal' | 'emprendedor' | string;
  hoy: ParteDeCobros;
  atrasadas: ParteDeCobros & { dias_max: number };
  /**
   * Gente distinta entre las dos mitades. Quien paga hoy y además arrastra
   * una cuota atrasada está en `hoy` Y en `atrasadas`, pero es UNA persona:
   * `personas − hoy.personas` son los atrasados que NO están en lo de hoy.
   * Con un plan semanal pasa siempre que queda una cuota sin pagar (el
   * atraso de 7 días coincide con el vencimiento siguiente), y el aviso
   * decía «Hoy te paga Juan… Y 1 atrasado» hablando del mismo Juan.
   */
  personas?: number;
  /**
   * PERSONAS (no cuotas) con ALGUNA cuota de hoy o atrasada, con algo
   * pendiente, por la que todavía no se les escribió. Alcanza con una: el
   * botón de WhatsApp marca todas las vencidas de la persona de una vez, así
   * que si le queda una sin marca es porque venció después del último
   * mensaje. A quien se le escribió hace una semana y hoy le vence otra hay
   * que volver a escribirle, y por eso se lo vuelve a contar. La frase dice
   * «A 2 todavía no les escribiste»: son dos a quienes escribirles, no dos
   * cuotas.
   */
  sin_escribir: number;
}

export interface TextosCobros {
  /** El título en una cuenta personal, que no tiene nombre de negocio. */
  tituloPersonal: string;
  hoyUno: (nombre: string, monto: string) => string;
  hoyVarios: (n: number, monto: string, nombres: string) => string;
  hoyUnoPersonal: (nombre: string, monto: string) => string;
  hoyVariosPersonal: (n: number, monto: string, nombres: string) => string;
  /**
   * Se agrega a la frase de hoy; empieza con un espacio. `n` son los
   * atrasados que NO están en lo de hoy: otra gente.
   */
  masAtrasados: (n: number, monto: string) => string;
  /** Lo mismo cuando el atrasado es el mismo que paga hoy: «Y debe otros…». */
  masAtrasadoElMismo: (monto: string) => string;
  /**
   * Lo mismo sin contar gente: cuando los atrasados son en parte los de hoy
   * y en parte otros, cualquier número se leería mal. La plata nunca miente.
   */
  masAtrasadosSinContar: (monto: string) => string;
  soloAtrasadoUno: (nombre: string, dias: number, monto: string) => string;
  soloAtrasados: (n: number, monto: string, nombres: string) => string;
  /** Se agrega al final; empieza con un espacio. */
  sinEscribir: (n: number) => string;
  yMas: (n: number) => string;
  /** El último nombre de la lista: «y Ana», «e Inés», «e Ana». */
  yNombre: (nombre: string) => string;
}

const n = (v: unknown) => Number(v ?? 0) || 0;

/**
 * «Pedro», «Pedro y Ana», «Pedro, Ana y Luis», «Pedro, Ana, Luis y 2 más».
 *
 * `personas` es a cuánta gente hay que cobrarle en total; la base manda como
 * mucho tres nombres, y el resto se cuenta.
 */
export function listaDeNombres(nombres: string[], personas: number, tx: Pick<TextosCobros, 'yMas' | 'yNombre'>): string {
  const lista = nombres.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 3);
  const mas = Math.max(0, personas - lista.length);
  if (lista.length === 0) return '';
  if (mas > 0) return `${lista.join(', ')} ${tx.yMas(mas)}`;
  if (lista.length === 1) return lista[0];
  return `${lista.slice(0, -1).join(', ')} ${tx.yNombre(lista[lista.length - 1])}`;
}

/**
 * La frase del aviso, o `null` si no hay nada que decir.
 *
 * Si hay algo de hoy, lo atrasado va en la misma frase («Y 1 atrasado»): un
 * solo aviso por mañana, no uno por cada cosa.
 *
 * A LA MISMA PERSONA NO SE LA CUENTA DOS VECES. Con `personas` (la gente
 * distinta entre las dos mitades) se sabe cuántos atrasados son OTROS:
 * - todos otros            → «Y 2 atrasados: 300.000.»
 * - es el mismo que hoy    → «Hoy te paga Juan: 100.000. Y debe otros 100.000 atrasados.»
 * - mezclados, o sin dato  → «Y hay 300.000 atrasados.» (sin contar gente)
 * No se comparan nombres: son de pila y hasta tres; dos «Juan» se confunden.
 */
export function fraseDeCobros(c: CobrosDeLaCuenta, tx: TextosCobros, locale: string): Frase | null {
  const plata = (v: number) => dinero(v, c.moneda, true, locale);
  const personal = c.tipo_cuenta === 'personal';

  const cuotasHoy = n(c.hoy?.cuantas);
  const cuotasAtrasadas = n(c.atrasadas?.cuantas);
  if (cuotasHoy <= 0 && cuotasAtrasadas <= 0) return null;

  const genteHoy = Math.max(1, n(c.hoy?.personas ?? c.hoy?.cuantas));
  const genteAtrasada = Math.max(1, n(c.atrasadas?.personas ?? c.atrasadas?.cuantas));
  const nombresHoy = listaDeNombres(c.hoy?.nombres ?? [], genteHoy, tx);
  const nombresAtrasados = listaDeNombres(c.atrasadas?.nombres ?? [], genteAtrasada, tx);

  let cuerpo: string;
  if (cuotasHoy > 0) {
    const monto = plata(n(c.hoy.monto));
    // Con una sola persona y su nombre, se la nombra. Sin nombre (no debería
    // pasar) se cae a la forma con número, que no deja un hueco en la frase.
    cuerpo = genteHoy === 1 && nombresHoy
      ? (personal ? tx.hoyUnoPersonal(nombresHoy, monto) : tx.hoyUno(nombresHoy, monto))
      : (personal ? tx.hoyVariosPersonal(genteHoy, monto, nombresHoy) : tx.hoyVarios(genteHoy, monto, nombresHoy));
    if (cuotasAtrasadas > 0) {
      const atrasado = plata(n(c.atrasadas.monto));
      const otros = c.personas == null ? null : Math.max(0, n(c.personas) - genteHoy);
      const repetidos = otros === null ? 0 : Math.max(0, genteAtrasada - otros);
      if (otros !== null && otros > 0 && repetidos === 0) cuerpo += tx.masAtrasados(otros, atrasado);
      else if (otros === 0 && genteHoy === 1 && nombresHoy) cuerpo += tx.masAtrasadoElMismo(atrasado);
      else cuerpo += tx.masAtrasadosSinContar(atrasado);
    }
  } else {
    const monto = plata(n(c.atrasadas.monto));
    cuerpo = genteAtrasada === 1 && nombresAtrasados
      ? tx.soloAtrasadoUno(nombresAtrasados, n(c.atrasadas.dias_max), monto)
      : tx.soloAtrasados(genteAtrasada, monto, nombresAtrasados);
  }

  // A quién le falta escribirle: el botón de WhatsApp está en Fiado, y es a
  // donde lleva el aviso.
  if (n(c.sin_escribir) > 0) cuerpo += tx.sinEscribir(n(c.sin_escribir));

  return { titulo: personal ? tx.tituloPersonal : c.nombre, cuerpo, url: '/fiado' };
}

/**
 * LA PASTILLA DE «TE DEBEN» (panel): una sola, la más urgente.
 *
 * Cuotas atrasadas (rojo) → lo que toca cobrar hoy (ámbar) → las que vencen
 * esta semana (ámbar) → nada. La misma prioridad que la pastilla de Deudas.
 * Quien no usa fechas no ve ninguna: su tarjeta es la de siempre.
 */
export type PastillaDeCuotas =
  | { tipo: 'atrasadas'; tono: 'rojo'; cuantas: number }
  | { tipo: 'hoy'; tono: 'ambar'; monto: number }
  | { tipo: 'semana'; tono: 'ambar'; cuantas: number };

export function pastillaDeCuotas(r: {
  atrasadas?: number; vencen_hoy?: number; monto_hoy?: number; vencen_semana?: number;
} | null | undefined): PastillaDeCuotas | null {
  if (!r) return null;
  if (n(r.atrasadas) > 0) return { tipo: 'atrasadas', tono: 'rojo', cuantas: n(r.atrasadas) };
  if (n(r.vencen_hoy) > 0 && n(r.monto_hoy) > 0) return { tipo: 'hoy', tono: 'ambar', monto: n(r.monto_hoy) };
  if (n(r.vencen_semana) > 0) return { tipo: 'semana', tono: 'ambar', cuantas: n(r.vencen_semana) };
  return null;
}

/** La clave de `reservar_envio`: un aviso por persona, cuenta y día (el día de la cuenta). */
export function claveDeCobros(empresaId: string, userId: string, fecha: string): string {
  return `cobros:${empresaId}:${userId}:${fecha}`;
}
