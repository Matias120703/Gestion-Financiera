import type { FilaCategoria, FilaDia, Resumen } from '../calculos';
import type { Jerga } from '../rubros';
import type { Movimiento } from '../tipos';

/**
 * LO QUE COMPARTEN LOS CINCO LIBROS DE EXCEL (23/09).
 *
 * Cada reporte (ver variante.ts) arma su propio libro en
 * `src/lib/reportes/excel-<variante>.ts`. Este archivo es el contrato entre
 * la ruta `/api/excel`, que lee, y esos libros, que son funciones puras
 * (se prueban sin base ni red, compilados sueltos por `probar:calculos`).
 *
 * No importa nada de Next ni de i18n a propósito: si lo hiciera, el arnés de
 * pruebas se llevaría medio Next.js puesto.
 */

/**
 * Una hoja del libro, como la anuncia la tarjeta de descarga.
 *
 * `siHay`: la hoja sale solo si el período tiene con qué llenarla (el
 * ahorro de quien no usó sus fondos, las liquidaciones de un mes sin
 * cosecha). La tarjeta la nombra con «si hubo» en vez de prometerla.
 */
export interface HojaDelLibro {
  nombre: string;
  siHay?: boolean;
}

/**
 * ¿Las hojas que anuncia la tarjeta son las que de verdad trae el archivo?
 *
 * La tarjeta de hoy decía «5 hojas: resumen, productos, movimientos, gastos
 * y día por día» a un agricultor cuyo archivo no tenía día por día y sí
 * campañas. Cada libro publica su lista (`hojas<Variante>`) y una prueba
 * arma el libro de verdad y compara con esto: mismo orden, ninguna hoja de
 * más, y todas las que no son `siHay` presentes.
 */
export function coincidenLasHojas(anunciadas: HojaDelLibro[], reales: string[]): boolean {
  let i = 0;
  for (const nombre of reales) {
    // Avanzar por lo anunciado saltando las condicionales que no salieron.
    while (i < anunciadas.length && anunciadas[i].nombre !== nombre && anunciadas[i].siHay) i++;
    if (i >= anunciadas.length || anunciadas[i].nombre !== nombre) return false;
    i++;
  }
  // Lo que quedó sin aparecer tiene que ser condicional.
  return anunciadas.slice(i).every((h) => h.siHay);
}

/**
 * CÓMO SE PASA LA PLATA A LA MONEDA DE LA VISTA (051).
 *
 * La ruta convierte lo común con `enLaMonedaDeLaVista` (reporte.ts). Lo que
 * cada libro lee aparte —los turnos de servicios, los alumnos, las
 * campañas— lo convierte su propio `enLaVista<Variante>(extras, c)` con este
 * conversor, y así hay una sola regla: lo que falta sigue faltando (null
 * no pasa a ser cero) y el redondeo solo saca el ruido de la coma flotante.
 */
export interface Conversor {
  /** ¿Convierte algo? Si no, `x` y `xn` devuelven lo mismo. */
  convierte: boolean;
  x: (n: number) => number;
  xn: (n: number | null | undefined) => number | null;
}

export function conversorDe(vista: { moneda: string; propia: string; factor: number }): Conversor {
  const convierte = vista.moneda !== vista.propia && vista.factor > 0;
  const k = convierte ? vista.factor : 1;
  const x = (n: number) => (convierte ? Math.round(Number(n) * k * 1e6) / 1e6 : Number(n));
  const xn = (n: number | null | undefined) => (n === null || n === undefined ? null : x(n));
  return { convierte, x, xn };
}

/**
 * LO QUE LE LLEGA A CUALQUIER LIBRO, YA LEÍDO Y YA EN LA MONEDA DE LA VISTA.
 *
 * La ruta lo lee para todos (son lecturas baratas que usan los cinco) y lo
 * convierte antes de llamar al libro. Lo que es de una variante sola viaja
 * en sus «extras»: `libro<Variante>(datos: DatosBaseLibro & Extras<Variante>)`.
 *
 * Las categorías, las formas de pago y las categorías de cada movimiento
 * llegan ya traducidas al idioma de quien baja el archivo.
 */
export interface DatosBaseLibro {
  empresa: {
    nombre: string;
    /** La moneda en que salen los números: la de la vista. */
    moneda: string;
    tipo_cuenta?: 'personal' | 'emprendedor';
    rubro?: string;
    /** Si los números vienen convertidos: de qué moneda y a qué cambio. */
    conversion?: { propia: string; cotizacion: number | null; desde: string | null };
  };
  desde: string;
  hasta: string;
  /** El idioma de quien lo baja ('es' | 'pt'). */
  idioma?: string;
  /** Las palabras del oficio (trainer, agricultor), para los textos del libro. */
  jerga: Jerga | null;
  /** `resumen_financiero` del período pedido. */
  resumen: Resumen;
  /**
   * El mismo resumen del período anterior (el del mismo largo, o el mismo
   * tramo del ciclo pasado): la columna «Antes» del Resumen. Es la misma
   * comparación que muestra la pantalla, así los dos dicen lo mismo.
   */
  resumenPrevio: Resumen;
  previo: { desde: string; hasta: string };
  /** Gastos por categoría (nombres ya traducidos). */
  categorias: FilaCategoria[];
  /** `serie_financiera_diaria` del período entero. */
  serie: FilaDia[];
  /**
   * El detalle completo del período, recorrido página por página y
   * verificado contra el conteo. Solo para listar, nunca para sumar.
   */
  movimientos: Movimiento[];
}
