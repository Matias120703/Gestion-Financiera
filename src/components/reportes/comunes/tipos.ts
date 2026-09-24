import type { Textos } from '@/i18n';
import type { Idioma } from '@/i18n/idiomas';
import type { Resumen } from '@/lib/calculos';
import type { Vista } from '@/lib/formato';
import type { Permisos } from '@/lib/permisos';
import type { FichaRubro } from '@/lib/rubros';
import type { TipoCuenta } from '@/lib/tipos';
import type { RangoReporte } from '@/lib/reportes/rango';

/**
 * LO QUE RECIBE CADA REPORTE DE LA PANTALLA (23/09).
 *
 * `src/app/(app)/reportes/page.tsx` decide la variante, arma el rango, pinta
 * el selector y la tarjeta de descarga, y le pasa esto al componente de la
 * variante (`Reporte<Variante>.tsx`, componente de servidor y async: lee él
 * mismo lo que es solo suyo, en un `Promise.all`).
 *
 * Lo que llega YA LEÍDO es lo que usan los cinco para los indicadores de
 * arriba: el resumen del período y el del período anterior (la flecha).
 * Todo lo demás —ranking, turnos, alumnos, campañas, presupuesto, la serie
 * por día— lo lee cada variante con los `traer*` de `@/lib/agregados` y
 * compañía, sobre `rango.desde`/`rango.hasta` (y `previo` si compara).
 *
 * `t` ya viene con la jerga del oficio encima (`conJerga`): el trainer lee
 * «sesión» y «cliente» sin que el reporte pregunte nada. Para las palabras
 * de la ficha («Cobrado» en vez de «Vendido»), `palabra(rubro, tipoCuenta,
 * clave, porDefecto, idioma)` de `@/lib/rubros`.
 */
export interface PropsReporte {
  empresaId: string;
  /** El rubro guardado y el tipo de cuenta, para `palabra()`. */
  rubro: string | null;
  tipoCuenta: TipoCuenta;
  ficha: FichaRubro;
  rango: RangoReporte;
  /** Contra qué se compara la flecha: el mismo largo antes, o el mismo tramo del ciclo pasado. */
  previo: { desde: string; hasta: string };
  /** `resumen_financiero` del rango y del previo. */
  resumen: Resumen;
  resumenPrevio: Resumen;
  /** La moneda en que se MIRA (051), con el factor adentro: pasala a `dinero()`. */
  moneda: Vista;
  t: Textos;
  idioma: Idioma;
  locale: string;
  zonaHoraria: string;
  /** Hoy en la zona del negocio, para las fotos «a hoy» (lo que te deben, stock). */
  hoy: string;
  /** Qué puede ver quien mira. Hoy la página solo deja entrar a administración. */
  permisos: Permisos;
}
