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

/**
 * VER LOS NÚMEROS EN OTRA MONEDA (migración 051)
 *
 * Todo importe se guarda en la moneda del negocio y en ninguna otra. Esto es
 * solo para mirarlos: un negocio en guaraníes que quiere leer su mes en
 * dólares carga a cuánto está el cambio y todas las pantallas lo muestran
 * convertido, sin que se toque un solo dato.
 *
 * POR QUÉ VIAJA JUNTO A LA MONEDA Y NO APARTE
 *
 * Porque hay 144 lugares que formatean plata, y todos reciben la moneda. Si
 * el factor viajara por su cuenta habría que llevarlo hasta cada uno de esos
 * 144, y el que se olvidara mostraría un número en la moneda de al lado con
 * la etiqueta de la otra — el mismo error que esto viene a arreglar, pero
 * peor, porque sería en una sola pantalla y nadie lo notaría.
 *
 * Yendo pegado a la moneda, es imposible tener el símbolo sin la conversión.
 *
 * Un string suelto sigue valiendo y significa «esta moneda, sin convertir».
 * Eso es lo que reciben los formularios: donde se ESCRIBE un importe hay que
 * escribirlo en la moneda de verdad, o se guardarían dólares como guaraníes.
 */
export interface Vista {
  /** En qué moneda se muestra. */
  moneda: string;
  /** Por cuánto se multiplica un importe guardado. 1 = no se convierte. */
  factor: number;
  /** La moneda en la que están guardados los datos. */
  propia: string;
  /** El cambio tal como lo escribió el negocio, para poder mostrarlo. */
  cotizacion: number | null;
  /** Cuándo lo cargó. Un cambio viejo mostrado como de hoy es otra mentira. */
  desde: string | null;
}

export type Moneda = string | Vista;

/** Una vista que no convierte nada: el caso de siempre. */
export function sinConvertir(moneda: string): Vista {
  return { moneda, factor: 1, propia: moneda, cotizacion: null, desde: null };
}

export function vistaDe(m: Moneda): Vista {
  return typeof m === 'string' ? sinConvertir(m) : m;
}

/** ¿Se está mirando en una moneda distinta a la de los datos? */
export function estaConvertida(m: Moneda): boolean {
  return typeof m !== 'string' && m.moneda !== m.propia;
}

/** El importe llevado a la moneda en la que se está mirando. */
export function convertido(valor: number, m: Moneda): number {
  const v = vistaDe(m);
  const n = Number.isFinite(valor) ? valor : 0;
  return n * v.factor;
}

/** Formatea un monto con el estilo del idioma que se esté leyendo. */
export function dinero(valor: number, moneda: Moneda = 'PYG', conSimbolo = true, locale?: string): string {
  const v = vistaDe(moneda);
  const d = decimalesDe(v.moneda);
  const n = convertido(valor, v);
  const texto = n.toLocaleString(localeDe(locale), {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  return conSimbolo ? `${simboloDe(v.moneda)} ${texto}` : texto;
}

/**
 * Un precio, sin centavos cuando no los tiene.
 *
 * `dinero()` siempre muestra los dos decimales de una moneda que los usa, y
 * está bien: un gasto de US$ 32,50 los necesita, y esconderlos sería perder
 * plata de la vista.
 *
 * Una suscripción es otra cosa. Vale 32 dólares, no 32 y monedas, y escribir
 * «US$ 32,00» en una portada suena a planilla exportada, no a un precio.
 *
 * Se mira el número y no la moneda: si algún día un plan sale 9,90, los
 * decimales aparecen solos.
 */
export function precio(valor: number, moneda = 'PYG', locale?: string): string {
  const n = Number.isFinite(valor) ? valor : 0;
  const d = Number.isInteger(n) ? 0 : decimalesDe(moneda);
  const texto = n.toLocaleString(localeDe(locale), {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  return `${simboloDe(moneda)} ${texto}`;
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
  valor: number, moneda: Moneda = 'PYG', locale?: string, abrev: Abreviaturas = ABREVIATURAS_POR_DEFECTO,
): string {
  const v = vistaDe(moneda);
  const s = simboloDe(v.moneda);
  const loc = localeDe(locale);
  // Se abrevia sobre el número YA convertido. Al revés, un negocio mirando en
  // dólares vería «US$ 5,0 M» donde son cinco mil: la escala se decidiría con
  // los guaraníes y el símbolo con los dólares.
  const n = convertido(valor, v);
  const abs = Math.abs(n);
  const conUnDecimal = (x: number) => x.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  if (!Number.isFinite(valor)) return dinero(valor, v, true, locale);

  if (decimalesDe(v.moneda) === 0) {
    if (abs >= 1_000_000_000) return `${s} ${conUnDecimal(n / 1_000_000_000)} ${abrev.milMillones}`;
    if (abs >= 1_000_000)     return `${s} ${conUnDecimal(n / 1_000_000)} ${abrev.millon}`;
    if (abs >= 100_000)       return `${s} ${Math.round(n / 1000).toLocaleString(loc)} ${abrev.mil}`;
  } else if (abs >= 1_000_000) {
    return `${s} ${conUnDecimal(n / 1_000_000)} ${abrev.millon}`;
  }

  return dinero(valor, v, true, locale);
}

/**
 * El monto entero si entra en una casilla de media pantalla, y si no, el
 * corto (13,0 M).
 *
 * A 22px, en la mitad de un celular de 360 entran unas 12 letras:
 * «Gs. 850.000» entra entero y se lee exacto; «Gs. 13.000.000» se partía en
 * dos renglones («Gs.» arriba, el número abajo). Abreviar siempre perdería
 * precisión donde no hace falta.
 */
export function dineroQueEntra(
  valor: number, moneda: Moneda = 'PYG', locale?: string, abrev: Abreviaturas = ABREVIATURAS_POR_DEFECTO, max = 12,
): string {
  const lleno = dinero(valor, moneda, true, locale);
  return lleno.length > max ? dineroCorto(valor, moneda, locale, abrev) : lleno;
}

/**
 * Marca de "este dato no está disponible para vos".
 * Nunca se reemplaza por un cero: un cero parece un dato, un guion no.
 */
export const SIN_DATO = '—';

/** Como dinero(), pero devuelve un guion si el valor no está disponible. */
export function dineroQuizas(
  valor: number | null | undefined, moneda: Moneda = 'PYG', conSimbolo = true, locale?: string,
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
