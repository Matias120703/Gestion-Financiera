import { convertirEntre, esMoneda, totalAprox } from './monedas';
import type { Bien, CotizacionDeMoneda, ParteDeMoneda, Patrimonio, TipoBien } from './tipos';

/**
 * EL PATRIMONIO (132) · «Tengo en total», sin React y sin base.
 *
 * Matías: «También tiene que ver lo que sería patrimonios; por ejemplo, un
 * auto, un terreno, lo que sea». Quiere anotar lo que tiene y no es plata,
 * con su valor, y ver cuánto tiene en total.
 *
 * LO QUE ESTE ARCHIVO CUIDA
 *
 *   1. UN BIEN ES UNA ANOTACIÓN. De acá no sale nada hacia la base: son
 *      cuentas sobre lo que `patrimonio()` ya devolvió.
 *   2. NUNCA SE SUMAN MONEDAS DISTINTAS. La base manda cada parte en su
 *      moneda. Lo único que las junta es `tengoEnTotal`, con la cotización
 *      que escribió la persona (la misma de la Billetera, `totalAprox` de
 *      monedas.ts): se muestra siempre con «≈», y si falta la cotización de
 *      una moneda que tiene algo adentro NO HAY NÚMERO.
 *   3. EL TOTAL ES LA SUMA DE LOS RENGLONES QUE SE VEN. Un renglón que no se
 *      muestra (la mercadería de quien no vende productos, un «te deben» en
 *      cero) tampoco suma: nadie tiene que adivinar de dónde sale la cuenta.
 *   4. ES SIMÉTRICO. Acá no dice «guaraníes»: dice «propia» y «otra».
 *
 *      Tengo en total ≈ plata + te deben + mercadería + bienes − debés
 *
 * Los ahorros NO se suman: guardar en un fondo no saca plata de ninguna
 * cuenta, así que ya están adentro de «Plata». Van como «de eso, guardado».
 *
 * No importa nada de `@/i18n` ni de Next: las pruebas de cálculo lo compilan
 * suelto (pruebas/tsconfig.calculos.json).
 */

/** En el orden en que se ofrecen al anotar. */
export const TIPOS_DE_BIEN: TipoBien[] = ['vehiculo', 'terreno', 'casa', 'maquina', 'animales', 'otro'];

/** Un tipo que esta versión no conoce se muestra como «otro»: nunca un texto vacío. */
export function tipoDeBien(tipo: string | null | undefined): TipoBien {
  return (TIPOS_DE_BIEN as string[]).includes(String(tipo)) ? (tipo as TipoBien) : 'otro';
}

const numero = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

const texto = (x: unknown): string => (typeof x === 'string' ? x : '');

function partes(x: unknown): ParteDeMoneda[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((p): p is { moneda: string; total?: unknown } => Boolean(p) && typeof p === 'object' && typeof p.moneda === 'string' && p.moneda !== '')
    .map((p) => ({ moneda: p.moneda, total: numero(p.total) }));
}

/**
 * LO QUE CONTESTÓ `patrimonio()`, YA ORDENADO PARA LA PANTALLA.
 *
 * Devuelve null si eso no es un patrimonio (la función no existe todavía en
 * la base, o contestó otra cosa): quien lo llama deja la Billetera de
 * siempre, sin el bloque. Lo que falte adentro vale cero o vacío.
 */
export function leerPatrimonio(datos: unknown): Patrimonio | null {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const d = datos as Record<string, unknown>;
  if (typeof d.moneda !== 'string' || d.moneda === '' || !Array.isArray(d.bienes)) return null;
  const bienes: Bien[] = d.bienes
    .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === 'object' && typeof (b as { id?: unknown }).id === 'string')
    .map((b) => ({
      id: String(b.id),
      nombre: texto(b.nombre),
      tipo: texto(b.tipo) || 'otro',
      valor: numero(b.valor),
      moneda: texto(b.moneda) || String(d.moneda),
      valor_al: texto(b.valor_al).slice(0, 10),
      nota: texto(b.nota),
    }));
  const cotizaciones: CotizacionDeMoneda[] = (Array.isArray(d.cotizaciones) ? d.cotizaciones : [])
    .filter((k): k is Record<string, unknown> => Boolean(k) && typeof k === 'object' && typeof (k as { moneda?: unknown }).moneda === 'string')
    .map((k) => ({ moneda: String(k.moneda), valor: numero(k.valor), desde: texto(k.desde) }));
  return {
    moneda: d.moneda,
    bienes,
    bienesPorMoneda: partes(d.bienes_por_moneda),
    plata: partes(d.plata),
    plataDeAhorros: d.plata_de_ahorros === true,
    ahorroApartado: numero(d.ahorro_apartado),
    teDeben: numero(d.te_deben),
    mercaderia: numero(d.mercaderia),
    debes: numero(d.debes),
    cotizaciones,
  };
}

/** Lo que muestra la tarjeta «Tengo en total»: sus renglones y, si se puede, el número. */
export interface TengoEnTotal {
  /** «Plata», por moneda: la propia siempre (aunque sea cero); las otras, solo con algo adentro. */
  plata: ParteDeMoneda[];
  /** «de eso, guardado»: ya está adentro de la plata, NO suma. Cero = no se muestra. */
  guardado: number;
  /** Moneda propia. Cero = el renglón no se muestra (y no suma). */
  teDeben: number;
  /** A precio de costo, moneda propia. Cero = no se muestra. */
  mercaderia: number;
  /** «Lo que tenés», por moneda. */
  bienes: ParteDeMoneda[];
  /** Moneda propia, en positivo: se RESTA. Cero = no se muestra. */
  debes: number;
  /**
   * ≈ en la moneda del negocio. Null si falta la cotización de alguna moneda
   * con algo adentro: un total al que le falta una parte no es un total.
   */
  total: number | null;
  /** Las monedas con algo adentro y sin cotización. */
  faltan: string[];
  /** De esas, las que Orden no sabe cotizar (un fondo en libras): no hay enlace que sirva. */
  imposibles: string[];
  /** Las monedas que se convirtieron para llegar al total. Vacío: todo está en una sola. */
  conCambio: string[];
  /** «ver en»: el mismo total, dicho en cada una de esas monedas. Vacío si no hay total. */
  enOtras: ParteDeMoneda[];
}

/** Un importe a los decimales de su moneda, con el redondeo de monedas.ts (no se copia acá). */
const redondeado = (monto: number, moneda: string): number => convertirEntre(monto, moneda, moneda, moneda, []) ?? 0;

/** Lo que hay en cada moneda, ya neto (la propia primero). Sumar adentro de UNA moneda no convierte nada. */
function netosPorMoneda(propia: string, sueltas: ParteDeMoneda[]): ParteDeMoneda[] {
  const porMoneda = new Map<string, number>([[propia, 0]]);
  for (const s of sueltas) porMoneda.set(s.moneda, (porMoneda.get(s.moneda) ?? 0) + s.total);
  return [...porMoneda].map(([moneda, total]) => ({ moneda, total: redondeado(total, moneda) }));
}

/**
 * TENGO EN TOTAL ≈ plata + te deben + mercadería + bienes − debés.
 *
 * Junta las partes por moneda, convierte el NETO de cada moneda con la
 * cotización que escribió la persona y suma (`totalAprox`: un solo redondeo
 * por moneda). Es aproximado aunque todo esté en una sola moneda, porque el
 * valor de un bien es una estimación: quien lo muestre le pone «≈».
 *
 * `conMercaderia`: solo quien tiene la pantalla de Productos cuenta su
 * mercadería. Sin ella el renglón no existe, y lo que no se ve no suma.
 */
export function tengoEnTotal(p: Patrimonio, conMercaderia = false): TengoEnTotal {
  const propia = p.moneda;
  const positivo = (n: number) => (n > 0 ? redondeado(n, propia) : 0);

  const plataPropia = p.plata.filter((x) => x.moneda === propia);
  const plata: ParteDeMoneda[] = [
    // La propia va siempre, y una sola vez.
    netosPorMoneda(propia, plataPropia)[0],
    ...p.plata.filter((x) => x.moneda !== propia && x.total !== 0),
  ];
  const bienes = p.bienesPorMoneda.filter((x) => x.total !== 0);
  const guardado = positivo(p.ahorroApartado);
  const teDeben = positivo(p.teDeben);
  const mercaderia = conMercaderia ? positivo(p.mercaderia) : 0;
  const debes = positivo(p.debes);

  const netos = netosPorMoneda(propia, [
    ...plata, ...bienes,
    { moneda: propia, total: teDeben }, { moneda: propia, total: mercaderia }, { moneda: propia, total: -debes },
  ]);
  const junto = totalAprox(netos, propia, p.cotizaciones);
  const conCambio = junto.total === null
    ? []
    : netos.filter((n) => n.moneda !== propia && n.total !== 0).map((n) => n.moneda);

  // «ver en US$»: la misma cuenta al revés. El neto de cada moneda va DIRECTO
  // a la que se quiere ver (lo que ya está en ella no se toca), y se suma.
  const enOtras = conCambio.flatMap((destino) => {
    let suma = 0;
    for (const n of netos) {
      if (n.total === 0) continue;
      const parte = convertirEntre(n.total, n.moneda, destino, propia, p.cotizaciones);
      if (parte === null) return [];
      suma += parte;
    }
    return [{ moneda: destino, total: redondeado(suma, destino) }];
  });

  return {
    plata, guardado, teDeben, mercaderia, bienes, debes,
    total: junto.total,
    faltan: junto.faltan,
    imposibles: junto.faltan.filter((m) => !esMoneda(m)),
    conCambio,
    enOtras,
  };
}

/**
 * LAS MONEDAS QUE HAY QUE COTIZAR PARA VER TODO JUNTO, cada una con lo que
 * hay en ella (plata más bienes: es la misma moneda, sumar no convierte).
 *
 * Es lo que pregunta la hoja de la cotización cuando se abre desde «Tengo en
 * total»: la de la Billetera pregunta solo por las monedas en las que hay
 * cuentas, y un terreno en dólares sin ninguna cuenta en dólares se quedaba
 * sin pregunta. Solo las cinco que Orden sabe cotizar.
 */
export function monedasACotizar(p: Patrimonio): ParteDeMoneda[] {
  const otras = [...p.plata, ...p.bienesPorMoneda].filter((x) => x.moneda !== p.moneda && x.total !== 0 && esMoneda(x.moneda));
  return netosPorMoneda(p.moneda, otras).filter((n) => n.moneda !== p.moneda);
}

/**
 * ¿LA ESTIMACIÓN TIENE MÁS DE UN AÑO? Entonces su fecha se muestra en ámbar:
 * sigue valiendo, pero un auto no vale lo mismo que hace dos años.
 *
 * Las dos fechas son 'YYYY-MM-DD' (la de hoy, la del negocio). Justo un año
 * no es «más de un año».
 */
export function valorViejo(valorAl: string | null | undefined, hoy: string): boolean {
  if (!valorAl || !/^\d{4}-\d{2}-\d{2}/.test(valorAl) || !/^\d{4}-\d{2}-\d{2}/.test(hoy)) return false;
  const haceUnAnio = `${String(Number(hoy.slice(0, 4)) - 1).padStart(4, '0')}${hoy.slice(4, 10)}`;
  return valorAl.slice(0, 10) < haceUnAnio;
}
