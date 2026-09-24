import { diffDias, rangoAnterior, resolverRango, sumarDias, type ClaveRango } from '../fechas';

/**
 * EL RANGO DE LOS REPORTES: EL DE SIEMPRE, MÁS EL CICLO DE COBRO (23/09).
 *
 * Una persona que cobra el 5 no cierra su mes el 31: su mes va de cobro a
 * cobro, y así lo mide el resto de Orden (`ciclo_personal`, 024). Reportes
 * solo ofrecía meses de calendario, así que «¿me alcanzó este mes?» se
 * contestaba cortando el sueldo por la mitad.
 *
 * `ciclo` y `ciclo_pasado` no entran en `ClaveRango` (fechas.ts) a propósito:
 * esas claves las usan el panel y el reto, que no saben de días de cobro, y
 * sumarlas allá obligaría a contestar qué es «este ciclo» en un almacén.
 *
 * Todo acá es puro (sin fecha del reloj adentro): `hoy` y el día de cobro
 * llegan de afuera, así se prueba con cualquier día del año.
 */
export type ClaveCiclo = 'ciclo' | 'ciclo_pasado';
export type ClaveRangoReporte = ClaveRango | ClaveCiclo;

export interface RangoReporte {
  desde: string;
  hasta: string;
  clave: ClaveRangoReporte;
}

const CLAVES_COMUNES: ClaveRango[] = [
  'hoy', 'ayer', 'semana', 'semana_pasada', 'mes', 'mes_pasado', 'anio', 'siempre', 'personalizado',
];

/** El mes de `iso` corrido `n` meses (n negativo = para atrás), como 'YYYY-MM-01'. */
function mesCorrido(iso: string, n: number): string {
  const [a, m] = iso.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${anio}-${String(mes).padStart(2, '0')}-01`;
}

/**
 * Espejo de `fecha_de_cobro(date, int)` (024): el día de cobro en el mes de
 * `mes`, recortado si el mes es más corto. Quien cobra el 31 en febrero
 * cobra el 28. Un día fuera de 1..31 se trata como en la base: al menos 1.
 */
export function fechaDeCobro(mes: string, dia: number | null | undefined): string {
  const primero = `${mes.slice(0, 7)}-01`;
  const [a, m] = primero.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const d = Math.min(Math.max(Math.trunc(Number(dia) || 1), 1), ultimo);
  return `${primero.slice(0, 8)}${String(d).padStart(2, '0')}`;
}

/** El primer día del ciclo en curso: el último cobro que ya llegó. */
export function inicioDeCiclo(hoy: string, dia: number): string {
  const esteMes = fechaDeCobro(hoy, dia);
  return hoy < esteMes ? fechaDeCobro(mesCorrido(hoy, -1), dia) : esteMes;
}

/**
 * «Este ciclo» va del último cobro a hoy (corrido, como «Este mes»).
 * «Ciclo pasado» es el ciclo entero anterior: del cobro anterior al día
 * antes del último cobro. Con día 1 son exactamente «Este mes» y «Mes
 * pasado», que es lo que hace la base cuando no hay ingreso fijo.
 */
export function rangoDeCiclo(clave: ClaveCiclo, hoy: string, dia: number): RangoReporte {
  const inicio = inicioDeCiclo(hoy, dia);
  if (clave === 'ciclo') return { desde: inicio, hasta: hoy, clave };
  return { desde: fechaDeCobro(mesCorrido(inicio, -1), dia), hasta: sumarDias(inicio, -1), clave };
}

/**
 * CONTRA QUÉ SE COMPARA (la flecha de cada indicador).
 *
 * El panel compara contra el rango del mismo largo inmediatamente anterior
 * (`rangoAnterior`), y acá se hace igual para todo lo que no es un ciclo.
 *
 * Un ciclo no: comparar los primeros diez días de este ciclo contra los diez
 * días anteriores mezclaría el final del ciclo pasado —cuando ya no queda
 * nada— con el principio de este, cuando entró el sueldo. Se compara contra
 * el MISMO tramo del ciclo pasado (del cobro anterior, la misma cantidad de
 * días, sin pasarse de su final), y así un ciclo pasado entero queda contra
 * el ciclo entero anterior.
 *
 * Se decide por las FECHAS y no por el botón: un rango que empieza un día de
 * cobro se mide como ciclo. Así la ruta del Excel, que solo recibe `desde` y
 * `hasta`, compara contra lo mismo que la pantalla sin que nadie le avise.
 */
export function rangoPrevio(rango: { desde: string; hasta: string }, dia: number | null): { desde: string; hasta: string } {
  // Empieza un día de cobro y no pasa del cobro siguiente: es un ciclo (o
  // un tramo de uno). Tres meses que empiezan el 5 no son «un ciclo».
  const esCiclo = !!dia && rango.desde === fechaDeCobro(rango.desde, dia)
    && rango.hasta < fechaDeCobro(mesCorrido(rango.desde, 1), dia);
  if (dia && esCiclo) {
    const desde = fechaDeCobro(mesCorrido(rango.desde, -1), dia);
    const finDelCiclo = sumarDias(rango.desde, -1);
    const tramo = sumarDias(desde, diffDias(rango.desde, rango.hasta));
    return { desde, hasta: tramo < finDelCiclo ? tramo : finDelCiclo };
  }
  return rangoAnterior(rango);
}

/**
 * El rango que piden los parámetros de la URL.
 *
 * `dia` es el día de cobro de la cuenta personal, o null si esta cuenta no
 * mide por ciclo (un negocio, o una persona que cobra el 1: su ciclo ES el
 * mes, y ofrecerle «Este ciclo» al lado de «Este mes» sería mostrarle dos
 * botones que hacen lo mismo). Sin día, un `?rango=ciclo` que quedó en un
 * enlace cae en el mes equivalente, no en «hoy».
 *
 * `porDefecto` es lo que se ve al entrar sin nada elegido.
 */
export function rangoDeReporte(
  params: Record<string, string | string[] | undefined>,
  hoy: string,
  dia: number | null,
  porDefecto: ClaveRangoReporte,
): RangoReporte {
  const bruto = typeof params.rango === 'string' ? params.rango : porDefecto;
  if (bruto === 'ciclo' || bruto === 'ciclo_pasado') {
    if (dia) return rangoDeCiclo(bruto, hoy, dia);
    const r = resolverRango(bruto === 'ciclo' ? 'mes' : 'mes_pasado', hoy);
    return { desde: r.desde, hasta: r.hasta, clave: r.clave };
  }
  const clave: ClaveRango = (CLAVES_COMUNES as string[]).includes(bruto) ? (bruto as ClaveRango) : 'hoy';
  if (clave === 'personalizado') {
    const valida = (f: unknown) => (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : undefined);
    const d = valida(params.desde) ?? hoy;
    const h = valida(params.hasta) ?? hoy;
    return { desde: d <= h ? d : h, hasta: h >= d ? h : d, clave };
  }
  const r = resolverRango(clave, hoy);
  return { desde: r.desde, hasta: r.hasta, clave: r.clave };
}
