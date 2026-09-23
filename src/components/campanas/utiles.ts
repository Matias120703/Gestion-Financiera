/**
 * CUENTAS CHICAS DE LAS PANTALLAS DE CAMPAÑAS (100).
 *
 * Lo que repiten la tarjeta, el formulario de la campaña, la cosecha y la
 * liquidación: kilos con separador de miles, el precio en la unidad en que
 * lo dice cada uno (US$/t el sojero, Gs/kg el sesamero), el nombre largo de
 * una campaña y el último precio que se cargó de un cultivo.
 *
 * Ningún NÚMERO de la campaña se calcula acá: salen de `numeros_de_lote`.
 * Esto solo los dice. Sin React ni directiva de cliente, y sin nada del
 * servidor: lo importan los componentes del navegador.
 */
import { CULTIVOS, cultivoPorNombre, precioEnUnidad, unidadDePrecio } from '@/lib/agricultura';
import { dinero, decimalesDe, simboloDe } from '@/lib/formato';
import type { Textos } from '@/i18n/diccionarios';
import { categoriaVisible } from '@/i18n/nombres';
import type { Lote } from '@/lib/tipos';

/** «28.665»: kilos enteros, con el separador de miles del idioma. */
export function kilos(n: number | null | undefined, locale: string): string {
  const v = Number(n);
  return Math.round(Number.isFinite(v) ? v : 0).toLocaleString(locale);
}

/** «9,6»: un decimal, para kg/ha y sc/ha. */
export function unDecimal(n: number, locale: string): string {
  return n.toLocaleString(locale, { maximumFractionDigits: 1 });
}

/**
 * El precio guardado por tonelada, dicho en la unidad de esa moneda:
 * «US$ 415,00/t» o «Gs. 6.500/kg». La base guarda siempre por tonelada;
 * el sesamero en guaraníes piensa por kilo.
 */
export function precioDicho(precioTonelada: number, moneda: string, locale: string, t: Textos): string {
  const unidad = unidadDePrecio(moneda);
  const valor = precioEnUnidad(precioTonelada, unidad);
  // Por kilo en guaraníes no hay centavos; en dólares por kilo sí hacen
  // falta (0,415): se muestran hasta tres.
  const d = unidad === 'kg' && decimalesDe(moneda) > 0 ? 3 : decimalesDe(moneda);
  const numero = valor.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: d });
  const conSimbolo = `${simboloDe(moneda)} ${numero}`;
  return unidad === 'kg' ? t.campanas.formulario.porKilo(conSimbolo) : t.campanas.formulario.porTonelada(conSimbolo);
}

/** La unidad del precio como etiqueta del campo: «US$/t», «Gs./kg». */
export function unidadDelPrecio(moneda: string, t: Textos): string {
  return unidadDePrecio(moneda) === 'kg'
    ? t.campanas.formulario.porKilo(simboloDe(moneda))
    : t.campanas.formulario.porTonelada(simboloDe(moneda));
}

/**
 * El cultivo guardado, dicho en el idioma de quien mira («Soja» → «Soja»,
 * «Maíz» → «Milho»). Se guarda con el nombre en español; si quedó una
 * clave de antes («maiz»), también se reconoce. Un cultivo escrito a mano
 * («Chía») se muestra como está. Es la ÚNICA forma de mostrar un cultivo:
 * la tarjeta, el panel, los chips de Gastos, Vender y la captura por voz.
 */
export function cultivoVisible(cultivo: string | null | undefined, idioma: string): string {
  if (!cultivo) return '';
  const porNombre = cultivoPorNombre(cultivo);
  const ficha = porNombre.clave === 'otro'
    ? CULTIVOS.find((c) => c.clave === cultivo.trim().toLowerCase()) ?? porNombre
    : porNombre;
  if (ficha.clave === 'otro' && cultivo.trim().toLowerCase() !== ficha.nombre.es.toLowerCase()) return cultivo;
  return idioma === 'pt' ? ficha.nombre.pt : ficha.nombre.es;
}

/** «Norte · Soja · Zafra 2026/27»: el nombre con que se habla de una campaña. */
export function nombreLargo(lote: Pick<Lote, 'nombre' | 'cultivo' | 'campana'>, idioma: string): string {
  return [lote.nombre, cultivoVisible(lote.cultivo, idioma), lote.campana].filter(Boolean).join(' · ');
}

/**
 * El último precio cargado para ese cultivo en esta cuenta, por tonelada.
 * Sin precio por defecto (decisión 16: envejece en un mes): lo que la
 * persona puso la última vez, o lo que vendió, que es más fresco todavía.
 */
export function ultimoPrecio(lotes: Lote[], cultivo: string, sinContar?: string): number | null {
  const clave = cultivoPorNombre(cultivo).clave;
  const buscado = cultivo.trim().toLowerCase();
  if (!buscado) return null;
  const mismos = lotes
    .filter((l) => l.id !== sinContar)
    .filter((l) => (clave === 'otro'
      ? l.cultivo.trim().toLowerCase() === buscado
      : cultivoPorNombre(l.cultivo).clave === clave))
    .sort((a, b) => (a.abierto_el < b.abierto_el ? 1 : a.abierto_el > b.abierto_el ? -1 : 0));
  for (const l of mismos) {
    const p = l.precio_promedio ?? l.precio_esperado;
    if (p !== null && p !== undefined && Number(p) > 0) return Number(p);
  }
  return null;
}

/**
 * El dólar como lo dice la gente (guaraníes por dólar), a partir del
 * `cambio` guardado. Para otras parejas, el cambio tal cual.
 */
export function dolarDicho(propia: string, original: string, cambio: number): number {
  if (propia === 'USD' && original === 'PYG' && cambio > 0) return Math.round(1 / cambio);
  return cambio;
}

/** Una categoría como se lee: primero las de la liquidación (101), después el diccionario. */
export function categoriaDeCampana(t: Textos, nombre: string): string {
  return t.campanas.liquidacion.categorias[nombre] ?? categoriaVisible(t, nombre);
}

/** Plata en la moneda propia, con su símbolo. */
export function plataPropia(n: number, moneda: string, locale: string): string {
  return dinero(n, moneda, true, locale);
}
