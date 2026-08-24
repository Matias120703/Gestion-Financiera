/**
 * Formateo de plata, números y fechas.
 *
 * Todo recibe un `locale` opcional. Cuando no llega, usa el de Paraguay: es
 * el valor que tenía este archivo clavado antes de que existieran los
 * idiomas, así que ninguna llamada vieja cambia de comportamiento.
 *
 * Las abreviaturas ("1,2 M") salen de Intl con notación compacta y no de una
 * tabla escrita a mano. Escribirlas nosotros significaba tener que traducir
 * "mil" y "M" a seis idiomas y equivocarnos en las reglas de cada uno.
 */
/**
 * Este archivo recibe un LOCALE ('pt-BR'), no un idioma ('pt'), y no importa
 * nada de `@/i18n` a propósito: las pruebas de cálculo lo compilan suelto con
 * tsc, sin los alias de rutas de Next. El mapa idioma → locale vive en un
 * solo lugar, `src/i18n/idiomas.ts`, y quien llama acá ya lo resolvió
 * (`useLocale()` en el navegador, `FICHA[idioma].locale` en el servidor).
 */
const LOCALE_POR_DEFECTO = 'es-PY';

export function localeDe(locale?: string | null): string {
  return locale || LOCALE_POR_DEFECTO;
}

const SIN_DECIMALES = new Set(['PYG', 'CLP', 'JPY', 'KRW', 'COP']);

export function decimalesDe(moneda: string): number {
  return SIN_DECIMALES.has(moneda) ? 0 : 2;
}

export function simboloDe(moneda: string): string {
  switch (moneda) {
    case 'PYG': return 'Gs.';
    case 'USD': return 'US$';
    case 'ARS': return '$';
    case 'BRL': return 'R$';
    case 'EUR': return '€';
    default:    return moneda;
  }
}

/** Formatea un monto con el estilo del idioma que se esté leyendo. */
export function dinero(valor: number, moneda = 'PYG', conSimbolo = true, locale?: string): string {
  const d = decimalesDe(moneda);
  const n = Number.isFinite(valor) ? valor : 0;
  const texto = n.toLocaleString(localeDe(locale), {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  return conSimbolo ? `${simboloDe(moneda)} ${texto}` : texto;
}

/**
 * Abreviaturas de escala. Vienen de afuera porque cambian con el idioma, y
 * el diccionario es donde viven los textos.
 *
 * NO se usa `Intl` con notación compacta, aunque sería menos código: en
 * es-PY devuelve "850 k", y quien vende en la calle dice "850 mil". La
 * abreviatura correcta según la biblioteca no es la que entiende la persona.
 */
export interface Abreviaturas { mil: string; millon: string; milMillones: string }

export const ABREVIATURAS_POR_DEFECTO: Abreviaturas = { mil: 'mil', millon: 'M', milMillones: 'mil M' };

/**
 * Versión corta para tarjetas: 1,2 M · 850 mil.
 *
 * Debajo de cien mil guaraníes no se abrevia: "85 mil" y "85.000" ocupan
 * casi lo mismo, y el número exacto se lee mejor.
 */
export function dineroCorto(
  valor: number, moneda = 'PYG', locale?: string, abrev: Abreviaturas = ABREVIATURAS_POR_DEFECTO,
): string {
  const s = simboloDe(moneda);
  const loc = localeDe(locale);
  const abs = Math.abs(valor);
  const conUnDecimal = (n: number) => n.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  if (!Number.isFinite(valor)) return dinero(valor, moneda, true, locale);

  if (decimalesDe(moneda) === 0) {
    if (abs >= 1_000_000_000) return `${s} ${conUnDecimal(valor / 1_000_000_000)} ${abrev.milMillones}`;
    if (abs >= 1_000_000)     return `${s} ${conUnDecimal(valor / 1_000_000)} ${abrev.millon}`;
    if (abs >= 100_000)       return `${s} ${Math.round(valor / 1000).toLocaleString(loc)} ${abrev.mil}`;
  } else if (abs >= 1_000_000) {
    return `${s} ${conUnDecimal(valor / 1_000_000)} ${abrev.millon}`;
  }

  return dinero(valor, moneda, true, locale);
}

/**
 * Marca de "este dato no está disponible para vos".
 * Nunca se reemplaza por un cero: un cero parece un dato, un guion no.
 */
export const SIN_DATO = '—';

/** Como dinero(), pero devuelve un guion si el valor no está disponible. */
export function dineroQuizas(
  valor: number | null | undefined, moneda = 'PYG', conSimbolo = true, locale?: string,
): string {
  if (valor === null || valor === undefined) return SIN_DATO;
  return dinero(valor, moneda, conSimbolo, locale);
}

/** Como porcentaje(), pero devuelve un guion si el valor no está disponible. */
export function porcentajeQuizas(
  valor: number | null | undefined, decimales = 1, locale?: string,
): string {
  if (valor === null || valor === undefined) return SIN_DATO;
  return porcentaje(valor, decimales, locale);
}

export function porcentaje(valor: number, decimales = 1, locale?: string): string {
  if (!Number.isFinite(valor)) valor = 0;
  return `${valor.toLocaleString(localeDe(locale), {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} %`;
}

export function numero(valor: number, locale?: string): string {
  const n = Number.isFinite(valor) ? valor : 0;
  return n.toLocaleString(localeDe(locale), { maximumFractionDigits: 2 });
}

/**
 * '2026-08-13' → un Date en UTC.
 *
 * Nunca `new Date('2026-08-13')`: JavaScript lo lee como medianoche UTC y al
 * mostrarlo en la zona local puede devolver el día anterior. Armándolo con
 * Date.UTC y formateando con timeZone 'UTC', el día es siempre el que dice
 * la cadena.
 */
function comoUTC(iso: string): Date | null {
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(Date.UTC(a, m - 1, d));
}

/** '2026-08-13' → '13 ago 2026' (o lo que corresponda al idioma). */
export function fechaLegible(iso: string, conAnio = true, locale?: string): string {
  if (!iso) return '';
  const fecha = comoUTC(iso);
  if (!fecha) return iso;

  return new Intl.DateTimeFormat(localeDe(locale), {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(conAnio ? { year: 'numeric' } : {}),
  }).format(fecha);
}

/** '2026-08-13' → 'jueves 13 de agosto' (o lo que corresponda al idioma). */
export function fechaLarga(iso: string, locale?: string): string {
  if (!iso) return '';
  const fecha = comoUTC(iso);
  if (!fecha) return iso;

  return new Intl.DateTimeFormat(localeDe(locale), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(fecha);
}
