import { decimalesDe, localeDe, simboloDe } from './formato';

/**
 * LA BILLETERA EN OTRAS MONEDAS (131) · las cuentas, sin React y sin base.
 *
 * Matías: «Tengo una cuenta bancaria en dólares con 10 mil dólares: ¿cómo la
 * guardo en mi billetera, si solo me aparece la opción de cargar en
 * guaraníes?».
 *
 * TRES REGLAS QUE ESTE ARCHIVO CUIDA
 *
 *   1. NUNCA SE SUMAN MONEDAS DISTINTAS COMO SI FUERAN UNA. Lo exacto va por
 *      moneda. Lo único que junta varias es `totalAprox`, y su resultado se
 *      muestra siempre con «≈», con el cambio y su fecha al lado. Si falta
 *      una cotización no hay número: hay una pregunta.
 *   2. LA COTIZACIÓN LA ESCRIBE LA PERSONA. Orden no la baja de internet.
 *      Sirve para el «≈» y para proponer un importe que la persona confirma;
 *      no entra en ningún saldo guardado.
 *   3. ES SIMÉTRICO. Acá no dice «guaraníes» en ningún lado: dice «propia»
 *      (la moneda del negocio) y «otra». Un negocio en dólares con una caja
 *      en guaraníes es el mismo caso.
 *
 * CÓMO SE GUARDA Y CÓMO SE DICE UN CAMBIO
 *
 * La base guarda `valor` = cuánto vale 1 de la OTRA moneda en la PROPIA
 * (negocio en guaraníes, cuenta en dólares: 7400; negocio en dólares, caja en
 * guaraníes: 0,0001351351). Nadie dice «el guaraní está a 0,000135»: la gente
 * dice «el dólar está a 7.400» en los dos casos. Por eso lo que se ve y se
 * escribe es siempre «cuántas de la chica vale 1 de la grande»
 * (`cotizacionEscrita`), y se da vuelta al guardar (`cotizacionAGuardar`).
 *
 * No importa nada de `@/i18n` ni de Next: las pruebas de cálculo lo compilan
 * suelto (pruebas/tsconfig.calculos.json).
 */

/** Las monedas que puede tener una cuenta: las mismas cinco de un negocio. */
export const MONEDAS = ['PYG', 'USD', 'BRL', 'ARS', 'EUR'] as const;
export type CodigoMoneda = (typeof MONEDAS)[number];

/** De la más grande a la más chica: decide de qué lado se dice el cambio. */
export const ORDEN_DE_VALOR: CodigoMoneda[] = ['EUR', 'USD', 'BRL', 'ARS', 'PYG'];

/** Una cotización como la devuelve la base: 1 de `moneda` vale `valor` en la propia. */
export interface CotizacionGuardada {
  moneda: string;
  valor: number;
}

/**
 * Redondeo «del medio para arriba», como el `round()` de la base. El
 * empujoncito es por los binarios: 1,005 × 100 da 100,49999… y sin él
 * redondearía para abajo.
 */
function redondear(n: number, decimales: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimales;
  const x = n * f;
  return Math.round(x + Math.sign(x) * 1e-7) / f;
}

export function esMoneda(m: string): m is CodigoMoneda {
  return (MONEDAS as readonly string[]).includes(m);
}

/** La propia primero, después las otras en el orden de MONEDAS. */
export function monedasParaElegir(propia: string): CodigoMoneda[] {
  const resto = MONEDAS.filter((m) => m !== propia);
  return esMoneda(propia) ? [propia, ...resto] : resto;
}

function puesto(m: string): number {
  const i = ORDEN_DE_VALOR.indexOf(m as CodigoMoneda);
  return i < 0 ? ORDEN_DE_VALOR.length : i;
}

/** Cuál se nombra («1 dólar») y cuál se cuenta («7.400 guaraníes»). */
export function parDe(a: string, b: string): { grande: string; chica: string } {
  return puesto(a) <= puesto(b) ? { grande: a, chica: b } : { grande: b, chica: a };
}

/** La pareja guaraní/dólar: la única que se pregunta «¿a cuánto está el dólar?». */
export function esParDolar(a: string, b: string): boolean {
  const { grande, chica } = parDe(a, b);
  return grande === 'USD' && chica === 'PYG';
}

/** Con cuántos decimales se escribe el cambio: el dólar en guaraníes, sin ninguno; el resto, hasta cuatro. */
export function decimalesDelCambio(a: string, b: string): number {
  return esParDolar(a, b) ? 0 : 4;
}

/**
 * EL CAMBIO GUARDADO AL REVÉS, SIN EL RUIDO DE LOS DIEZ DECIMALES.
 *
 * Un negocio en dólares con una caja en guaraníes guarda 1/7400 con diez
 * decimales: 0,0001351351. Darlo vuelta da 7400,0003, y multiplicar por él
 * hace que US$ 300 sean Gs. 2.220.001. Nadie escribió eso: escribió 7.400.
 *
 * Si `valor` es, dentro de lo que diez decimales pueden guardar, el inverso
 * de un número de hasta cuatro decimales, devuelve ESE número (7400) para
 * dividir o multiplicar por él. Si no, null y se usa `valor` tal cual.
 */
function inversoLimpio(valor: number): number | null {
  if (!(valor > 0) || valor >= 1) return null;
  const n = 1 / valor;
  // Lo guardado puede estar corrido hasta medio último decimal (5e-11): eso
  // mueve a `n` hasta 5e-11 x n al cuadrado. Con un margen.
  const tolerancia = 7.5e-11 * n * n;
  for (let d = 0; d <= 4; d++) {
    const limpio = redondear(n, d);
    if (limpio > 0 && Math.abs(limpio - n) <= tolerancia) return limpio;
  }
  return null;
}

/** `monto` en otra moneda, llevado a la propia. Sin redondear. */
function llevarAPropia(monto: number, valor: number): number {
  const limpio = inversoLimpio(valor);
  return limpio !== null ? monto / limpio : monto * valor;
}

/** `montoPropio` llevado a la otra moneda. Sin redondear. */
function llevarAOtra(montoPropio: number, valor: number): number {
  const limpio = inversoLimpio(valor);
  return limpio !== null ? montoPropio * limpio : montoPropio / valor;
}

/** valor guardado (1 de `otra` en `propia`) -> lo que ve la persona (7.400). */
export function cotizacionEscrita(valor: number, propia: string, otra: string): number {
  const v = Number(valor);
  if (!(v > 0)) return 0;
  const { grande } = parDe(propia, otra);
  const decimales = decimalesDelCambio(propia, otra);
  if (grande === otra) return redondear(v, decimales);
  return redondear(inversoLimpio(v) ?? 1 / v, decimales);
}

/** lo que escribió la persona -> valor a guardar (7400, o 1/7400 con diez decimales). */
export function cotizacionAGuardar(escrita: number, propia: string, otra: string): number {
  const n = Number(escrita);
  if (!(n > 0)) return 0;
  const { grande } = parDe(propia, otra);
  return redondear(grande === otra ? n : 1 / n, 10);
}

/** monto en `otra` -> moneda propia, redondeado a decimalesDe(propia). */
export function aPropia(monto: number, valor: number, propia: string): number {
  const v = Number(valor);
  if (!(v > 0)) return 0;
  return redondear(llevarAPropia(Number(monto), v), decimalesDe(propia));
}

/** monto en la propia -> `otra`, redondeado a decimalesDe(otra). */
export function aOtra(montoPropio: number, valor: number, otra: string): number {
  const v = Number(valor);
  if (!(v > 0)) return 0;
  return redondear(llevarAOtra(Number(montoPropio), v), decimalesDe(otra));
}

/** Cuánto vale 1 de `moneda` en la propia según lo guardado; null si no hay cotización. */
function valorEnPropia(moneda: string, propia: string, cotizaciones: CotizacionGuardada[]): number | null {
  if (moneda === propia) return 1;
  const v = Number(cotizaciones.find((k) => k.moneda === moneda)?.valor);
  return v > 0 ? v : null;
}

/**
 * Un importe de una moneda a otra con lo guardado (pasar plata entre dos
 * cuentas). Es una PROPUESTA: la persona la confirma o la pisa. Null si
 * falta la cotización de alguna de las dos.
 */
export function convertirEntre(
  monto: number, de: string, a: string, propia: string, cotizaciones: CotizacionGuardada[],
): number | null {
  if (de === a) return redondear(Number(monto), decimalesDe(a));
  const vDe = valorEnPropia(de, propia, cotizaciones);
  const vA = valorEnPropia(a, propia, cotizaciones);
  if (vDe === null || vA === null) return null;
  return redondear(llevarAOtra(llevarAPropia(Number(monto), vDe), vA), decimalesDe(a));
}

/** El cambio que resulta de dos importes: cuántas de la chica por 1 de la grande. null si falta alguno. */
export function cambioQueResulta(montoA: number, monedaA: string, montoB: number, monedaB: string): number | null {
  const a = Number(montoA);
  const b = Number(montoB);
  if (!(a > 0) || !(b > 0) || monedaA === monedaB) return null;
  const { grande } = parDe(monedaA, monedaB);
  return redondear(grande === monedaA ? b / a : a / b, decimalesDelCambio(monedaA, monedaB));
}

/**
 * El cambio guardado de una pareja, dicho igual que `cambioQueResulta`
 * (chicas por 1 grande), para compararlos. Entre dos monedas que no son la
 * propia sale de cruzar sus dos cotizaciones. Null si falta alguna.
 */
export function cambioGuardado(
  monedaA: string, monedaB: string, propia: string, cotizaciones: CotizacionGuardada[],
): number | null {
  if (monedaA === monedaB) return null;
  const vA = valorEnPropia(monedaA, propia, cotizaciones);
  const vB = valorEnPropia(monedaB, propia, cotizaciones);
  if (vA === null || vB === null) return null;
  const { grande } = parDe(monedaA, monedaB);
  // Cuántas de la chica vale 1 de la grande: 1 grande a la propia, y de ahí a la chica.
  const [vGrande, vChica] = grande === monedaA ? [vA, vB] : [vB, vA];
  return redondear(llevarAOtra(llevarAPropia(1, vGrande), vChica), decimalesDelCambio(monedaA, monedaB));
}

/**
 * Suma partes de varias monedas en la propia. ES APROXIMADO: quien lo muestre
 * le pone «≈» y el cambio al lado. Convierte el subtotal de cada moneda, no
 * fila por fila (así el redondeo es uno solo por moneda).
 *
 * `total` es null si falta la cotización de alguna moneda con plata: un
 * total al que le falta una parte no es un total. Una moneda en cero no
 * necesita cotización.
 */
export function totalAprox(
  partes: { moneda: string; total: number }[], propia: string, cotizaciones: CotizacionGuardada[],
): { total: number | null; faltan: string[] } {
  const porMoneda = new Map<string, number>();
  for (const p of partes) {
    porMoneda.set(p.moneda, (porMoneda.get(p.moneda) ?? 0) + (Number(p.total) || 0));
  }
  let total = 0;
  const faltan: string[] = [];
  for (const [moneda, subtotal] of porMoneda) {
    if (moneda === propia) { total += subtotal; continue; }
    if (subtotal === 0) continue;
    const valor = valorEnPropia(moneda, propia, cotizaciones);
    if (valor === null) { faltan.push(moneda); continue; }
    total += aPropia(subtotal, valor, propia);
  }
  return { total: faltan.length > 0 ? null : redondear(total, decimalesDe(propia)), faltan };
}

/** ¿El cambio de esta operación se aleja más de un 20 % del guardado? Solo avisa, nunca bloquea. */
export function cambioRaro(resultante: number, escritaGuardada: number | null): boolean {
  const g = Number(escritaGuardada);
  if (escritaGuardada === null || !(g > 0)) return false;
  return Math.abs(Number(resultante) - g) / g > 0.2;
}

/**
 * Las dos mitades de «US$ 1 = Gs. 7.400», siempre igual y en las dos
 * direcciones. Las frases las arma el diccionario; acá van los números.
 */
export function textoDelCambio(
  escrita: number, a: string, b: string, locale?: string,
): { uno: string; vale: string } {
  const { grande, chica } = parDe(a, b);
  const n = Number(escrita) || 0;
  const maximo = decimalesDelCambio(a, b);
  const numero = n.toLocaleString(localeDe(locale), {
    // Un cambio redondo se dice redondo («7.400»); con centavos, al menos los
    // de la moneda («5,50» reales y no «5,5»).
    minimumFractionDigits: Number.isInteger(n) ? 0 : Math.min(maximo, decimalesDe(chica)),
    maximumFractionDigits: maximo,
  });
  return { uno: `${simboloDe(grande)} 1`, vale: `${simboloDe(chica)} ${numero}` };
}

/**
 * El día en que se escribió una cotización, en la zona del negocio y como
 * 'YYYY-MM-DD'. La base guarda el instante; cortarle los diez primeros
 * caracteres daría el día de Londres, y lo cargado a las diez de la noche en
 * Asunción saldría con fecha de mañana. '' si no se entiende.
 */
export function diaDeLaCotizacion(desde: string | null | undefined, zona: string): string {
  if (!desde) return '';
  const t = Date.parse(desde);
  if (!Number.isFinite(t)) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(t));
  } catch {
    return new Date(t).toISOString().slice(0, 10);
  }
}

/** Una cotización de más de 30 días se muestra con su fecha en ámbar: sigue valiendo, pero se avisa. */
export function cotizacionVieja(desde: string | null | undefined, ahora: number = Date.now()): boolean {
  if (!desde) return false;
  const t = Date.parse(desde);
  return Number.isFinite(t) && ahora - t > 30 * 86400000;
}

/**
 * ¿HAY QUE GUARDAR ESTA COTIZACIÓN? (la hoja «¿A cuánto está el dólar?»)
 *
 * Solo lo que tiene un número y cambió: un campo vacío no borra nada, y
 * volver a guardar lo mismo no hace falta.
 *
 * SALVO QUE LA GUARDADA YA SEA VIEJA. Con más de 30 días la fecha se ve en
 * ámbar, y si el dólar sigue igual la persona tiene que poder decir «sí,
 * sigue a 7.400»: se manda el mismo número y la base le pone la fecha de hoy.
 * Sin esto había que guardar otro número y después el bueno.
 *
 * `valor` y `guardada.valor` van en la dirección de la base.
 */
export function cotizacionPorGuardar(
  valor: number, guardada: { valor: number; desde?: string | null } | null | undefined, ahora: number = Date.now(),
): boolean {
  const v = Number(valor);
  if (!(v > 0)) return false;
  if (!guardada) return true;
  return v !== Number(guardada.valor) || cotizacionVieja(guardada.desde, ahora);
}
