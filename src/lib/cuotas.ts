import type { CadaCuota, CuotaFiado, DetalleFiado, DeudorFiado, GrupoFiado, Plan } from './tipos';

/**
 * FECHAS DE COBRO Y CUOTAS DEL FIADO (127) · la cuenta, sin pantalla.
 *
 * Matías: «una venta a crédito puede llevar fecha de cobro, una sola o en
 * cuotas: cuántas, cada cuánto, la primera fecha».
 *
 * Acá vive solo la aritmética: partir un total en cuotas que SUMAN el total,
 * armar las fechas, y decidir en qué grupo de la pantalla va cada deudor.
 * Es puro a propósito (sin React, sin diccionario, sin Supabase): se prueba
 * en pruebas/calculos.test.js y lo usan Vender, Fiado y la revisión por voz.
 *
 * Lo que NO vive acá: cuánto de cada cuota está pagado. Eso lo calcula la
 * base desde el libro (`estado_cuotas`) y la pantalla lo muestra tal cual;
 * repetir esa fórmula en el navegador sería tener dos saldos.
 */

/** Hasta cuántas cuotas acepta la base por deuda. */
export const MAX_CUOTAS = 60;

const DIAS: Record<Exclude<CadaCuota, 'mes'>, number> = { semana: 7, quincena: 15 };

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number);
  return [a, m, d];
}

function aISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** ¿Es una fecha 'YYYY-MM-DD' que existe? (el 31/02 no). */
export function esFecha(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = partes(iso);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/**
 * La fecha, `k` períodos después.
 *
 * El mes NO se encadena: se cuenta siempre desde la fecha de partida y el
 * día se recorta al último del mes. Encadenando, una primera cuota el 31 de
 * enero daba 28/02 y de ahí 28/03 para siempre: quien cobra «a fin de mes»
 * terminaba cobrando el 28. Así da 31/01 → 28/02 → 31/03.
 */
export function sumarPeriodo(fecha: string, cada: CadaCuota, k: number): string {
  const [a, m, d] = partes(fecha);
  if (cada !== 'mes') {
    return aISO(new Date(Date.UTC(a, m - 1, d + DIAS[cada] * k)));
  }
  const primero = new Date(Date.UTC(a, m - 1 + k, 1));
  const ultimo = new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth() + 1, 0)).getUTCDate();
  return aISO(new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth(), Math.min(d, ultimo))));
}

/**
 * Parte un total en `n` cuotas que suman EXACTAMENTE el total.
 *
 * Cada una es el total dividido `n`, cortado (no redondeado) a los decimales
 * de la moneda, y la última lleva lo que sobra: 500.000 en 3 es 166.666 ·
 * 166.666 · 166.668. Se hace con enteros (centavos) porque 0,1 + 0,2 no da
 * 0,3 y la base rechaza un plan que no suma la deuda.
 */
export function repartir(total: number, n: number, decimales = 0): number[] {
  const cuantas = Math.max(1, Math.floor(n));
  const f = 10 ** decimales;
  const enteros = Math.round((Number.isFinite(total) ? total : 0) * f);
  const base = Math.floor(enteros / cuantas);
  const montos = Array.from({ length: cuantas }, () => base / f);
  montos[cuantas - 1] = (enteros - base * (cuantas - 1)) / f;
  return montos;
}

function acotar(n: number): number {
  return Math.min(MAX_CUOTAS, Math.max(1, Math.floor(Number.isFinite(n) ? n : 1)));
}

/** El plan listo para mandar: una fecha y un monto por cuota. */
export function armarPlan({
  total, cuotas, cada, primera, decimales = 0,
}: {
  total: number;
  cuotas: number;
  cada: CadaCuota;
  primera: string;
  decimales?: number;
}): Plan {
  let n = acotar(cuotas);
  // 2 guaraníes en 3 cuotas daría una cuota de 0, y la base no acepta cuotas
  // sin monto: se achica la cantidad en vez de mandar algo que rebota.
  const enteros = Math.round(total * 10 ** decimales);
  if (enteros > 0 && enteros < n) n = enteros;
  const montos = repartir(total, n, decimales);
  return montos.map((monto, k) => ({ vence_el: sumarPeriodo(primera, cada, k), monto }));
}

/** Cuánto suma un plan, sin el polvo de los decimales. */
export function sumaDelPlan(plan: Plan, decimales = 0): number {
  const f = 10 ** decimales;
  return plan.reduce((s, c) => s + Math.round(c.monto * f), 0) / f;
}

/**
 * El mismo plan (mismas fechas) para otro total.
 *
 * En Vender el total cambia mientras se arma el carrito, después de haber
 * elegido «en 3 cuotas». Las fechas se respetan y los montos se reparten de
 * nuevo. Si ya suma, se devuelve EL MISMO arreglo: quien lo guarda en un
 * estado de React no vuelve a dibujar por nada.
 */
export function ajustarPlan(plan: Plan, total: number, decimales = 0): Plan {
  if (plan.length === 0) return plan;
  const f = 10 ** decimales;
  if (Math.round(sumaDelPlan(plan, decimales) * f) === Math.round(total * f)) return plan;
  const montos = repartir(total, plan.length, decimales);
  return plan.map((c, k) => ({ vence_el: c.vence_el, monto: montos[k] }));
}

/** ¿Se puede mandar? Todas con fecha y monto, en orden, y sumando el total. */
export function planValido(plan: Plan, total: number, decimales = 0): boolean {
  if (plan.length < 1 || plan.length > MAX_CUOTAS) return false;
  const f = 10 ** decimales;
  if (Math.round(sumaDelPlan(plan, decimales) * f) !== Math.round(total * f)) return false;
  return plan.every((c, k) => esFecha(c.vence_el) && c.monto > 0 && (k === 0 || plan[k - 1].vence_el <= c.vence_el));
}

/**
 * Qué se eligió para llegar a este plan: cuántas, cada cuánto y la primera.
 *
 * La pantalla no guarda esas tres cosas por separado: las lee del plan. Así
 * hay una sola verdad (el plan que se va a mandar) y dos copias del selector
 * abiertas a la vez —el carrito de la computadora y el del celular— no
 * pueden contradecirse.
 */
export function leerPlan(plan: Plan): { cuotas: number; cada: CadaCuota; primera: string } {
  const primera = plan[0]?.vence_el ?? '';
  let cada: CadaCuota = 'mes';
  if (plan.length >= 2 && esFecha(plan[0].vence_el) && esFecha(plan[1].vence_el)) {
    const [a1, m1, d1] = partes(plan[0].vence_el);
    const [a2, m2, d2] = partes(plan[1].vence_el);
    const dias = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
    if (dias === 7) cada = 'semana';
    else if (dias === 15) cada = 'quincena';
  }
  return { cuotas: plan.length, cada, primera };
}

/**
 * '2026-11-15' → '15/11'. Con el año ('15/10/27') solo cuando no es el de
 * `anioDe`: en una lista de cuotas el año sobra hasta que cambia.
 */
export function fechaCorta(iso: string, anioDe?: string): string {
  if (!esFecha(iso)) return iso || '';
  const [a, m, d] = iso.split('-');
  const corta = `${d}/${m}`;
  return anioDe && anioDe.slice(0, 4) !== a ? `${corta}/${a.slice(2)}` : corta;
}

/**
 * 'vie', 'sex': el día de la semana, corto y en el idioma de quien mira.
 *
 * «Me paga el viernes» por voz lo convierte en fecha un modelo, y un modelo
 * se equivoca de viernes. Con «24/10» a secas no hay con qué notarlo; con
 * «sáb 24/10» se ve de un vistazo que no era ese día.
 */
export function diaCorto(iso: string, locale = 'es'): string {
  if (!esFecha(iso)) return '';
  const [a, m, d] = partes(iso);
  try {
    // En UTC: la fecha no tiene hora, y en la zona del teléfono un día a
    // medianoche puede caer en el anterior. El portugués trae «sex.»: sin punto.
    return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(a, m - 1, d))).replace(/[.]$/, '');
  } catch {
    return '';
  }
}

/** 'vie 23/10' (y 'vie 15/01/27' si no es de este año). */
export function fechaConDia(iso: string, hoy: string, locale = 'es'): string {
  return [diaCorto(iso, locale), fechaCorta(iso, hoy)].filter(Boolean).join(' ');
}

/** La base no acepta una cuota antes del 2000 ni a más de diez años. */
const PRIMER_DIA = '2000-01-01';

/**
 * ¿Lo que hay ESCRITO en un campo de fecha ya es una fecha para el plan?
 *
 * En la computadora la fecha se teclea, y al escribir el año el navegador
 * pasa por «0002-01-15», «0020-…», «0202-…» antes de llegar a 2027. Si cada
 * una de esas fuera al plan (o se rechazara y el campo volviera atrás), el
 * año no se podía escribir y la cuota quedaba en el año en curso, ya
 * vencida. Al plan va solo lo que la base aceptaría.
 */
export function fechaQueSeManda(iso: string | null | undefined, hoy: string): iso is string {
  if (!esFecha(iso) || iso < PRIMER_DIA) return false;
  return !esFecha(hoy) || iso <= sumarPeriodo(hoy, 'mes', 120);
}

/**
 * La última cuota, cuando NO es igual a las demás; si no, null.
 *
 * 1.250.000 en 12 son once de 104.166 y una de 104.174. «12 × 104.166» a
 * secas da 1.249.992: la vista previa tiene que decir la que cierra la cuenta.
 */
export function ultimaDistinta(plan: Plan, decimales = 0): number | null {
  if (plan.length < 2) return null;
  const f = 10 ** decimales;
  const ultima = plan[plan.length - 1].monto;
  return Math.round(ultima * f) === Math.round(plan[0].monto * f) ? null : ultima;
}

/**
 * Entre qué fechas se puede correr una cuota: las de sus vecinas por número.
 *
 * Los pagos de una deuda tapan las cuotas POR NÚMERO. Si la cuota 1 se
 * corría más allá de la 2, quien pagaba la de hoy quedaba con la de hoy sin
 * pagar y la de dentro de un mes pagada: atrasado habiendo pagado a tiempo.
 * La base lo rechaza (`mover_cuota`); el campo ya no lo deja elegir. La
 * misma fecha que la vecina sí vale. Para saltar una por encima de otra
 * está «Rearmar».
 */
export function vecinasDe(cuotas: Pick<CuotaFiado, 'numero' | 'vence_el'>[], numero: number): { min?: string; max?: string } {
  const antes = cuotas.filter((c) => c.numero < numero && esFecha(c.vence_el)).map((c) => c.vence_el).sort();
  const despues = cuotas.filter((c) => c.numero > numero && esFecha(c.vence_el)).map((c) => c.vence_el).sort();
  return {
    ...(antes.length ? { min: antes[antes.length - 1] } : {}),
    ...(despues.length ? { max: despues[0] } : {}),
  };
}

/**
 * Cuántas cuotas atrasadas tiene y cuánto suman, cuando son MÁS DE UNA.
 *
 * Con dos vencidas, la fila decía «Cuota 1 de 3 · 150.000» y el WhatsApp
 * reclamaba esa sola: la mitad de lo que ya venció. Con más de una se habla
 * del total atrasado. Con una sola (o ninguna), null: vale lo de su próxima.
 */
export function variasAtrasadas(d: Pick<DeudorFiado, 'atrasadas' | 'monto_atrasado'>): { cuantas: number; monto: number } | null {
  const cuantas = Number(d.atrasadas ?? 0);
  const monto = Number(d.monto_atrasado ?? 0);
  return cuantas > 1 && monto > 0 ? { cuantas, monto } : null;
}

/**
 * ¿Hoy toca avisar por una cuota que lleva `diasDeAtraso` días vencida?
 *
 * El día que vence, a los 3 días y después una vez por semana (0, 3, 7, 14,
 * 21…). Todos los días sería el aviso que se aprende a ignorar. Es el espejo
 * de la regla de `cobros_de_hoy` en la base, para poder probarla sin base.
 */
export function tocaAvisar(diasDeAtraso: number): boolean {
  if (!Number.isInteger(diasDeAtraso) || diasDeAtraso < 0) return false;
  return diasDeAtraso === 0 || diasDeAtraso === 3 || diasDeAtraso % 7 === 0;
}

/** En qué grupo va: lo dice la base; si no vino, sale de su próxima cuota. */
export function grupoDe(d: DeudorFiado): GrupoFiado {
  if (d.grupo) return d.grupo;
  if (!d.proxima) return 'sin_fecha';
  return d.proxima.dias < 0 ? 'atrasada' : d.proxima.dias === 0 ? 'hoy' : 'proxima';
}

export interface GruposFiado {
  atrasadas: DeudorFiado[];
  hoy: DeudorFiado[];
  proximas: DeudorFiado[];
  sinFecha: DeudorFiado[];
}

/**
 * Los cuatro grupos de la pantalla de Fiado.
 *
 * Cada cliente va en UNO solo (el de su cuota pendiente más próxima). El
 * orden adentro responde a «¿a quién voy primero?»: en atrasadas y próximas,
 * la fecha más vieja arriba; en hoy y sin fecha, quien más debe.
 */
export function agruparDeudores(clientes: DeudorFiado[]): GruposFiado {
  const g: GruposFiado = { atrasadas: [], hoy: [], proximas: [], sinFecha: [] };
  for (const d of clientes) {
    const grupo = grupoDe(d);
    if (grupo === 'atrasada') g.atrasadas.push(d);
    else if (grupo === 'hoy') g.hoy.push(d);
    else if (grupo === 'proxima') g.proximas.push(d);
    else g.sinFecha.push(d);
  }
  const porFecha = (a: DeudorFiado, b: DeudorFiado) =>
    (a.proxima?.vence_el ?? '9999').localeCompare(b.proxima?.vence_el ?? '9999') || b.saldo - a.saldo;
  const porSaldo = (a: DeudorFiado, b: DeudorFiado) => b.saldo - a.saldo;
  g.atrasadas.sort(porFecha);
  g.hoy.sort(porSaldo);
  g.proximas.sort(porFecha);
  g.sinFecha.sort(porSaldo);
  return g;
}

/** La cuota que tapa el próximo pago de una deuda: la primera pendiente, por número. */
export function proximaCuota(cuotas: CuotaFiado[]): CuotaFiado | null {
  return [...cuotas].sort((a, b) => a.numero - b.numero).find((c) => c.pendiente > 0) ?? null;
}

/** Una opción de «¿De qué?» al cobrar. */
export interface OpcionCobro {
  /** El fio_id de la deuda, o 'sin_fecha' / 'todo'. */
  clave: string;
  tipo: 'deuda' | 'sin_fecha' | 'todo';
  /** La cuota que se manda como `p_cuota`; null = pago suelto. */
  cuota: CuotaFiado | null;
  concepto: string;
  /** Lo que se propone en el campo. */
  propuesto: number;
  /** Lo máximo que la base deja cobrar con esta opción. */
  tope: number;
}

/**
 * De qué se puede cobrar, y qué va elegido de entrada.
 *
 * Sin deudas con cuotas devuelve una lista vacía: no hay nada que elegir y
 * el formulario es el de siempre (se cobra del total).
 *
 * Elegida: la deuda con una cuota atrasada o de hoy (la más vieja); si no
 * hay, lo sin fecha; si no hay, la primera deuda. Es lo que casi siempre
 * vino a pagar.
 */
export function opcionesDeCobro(
  d: Pick<DetalleFiado, 'saldo' | 'sin_fecha' | 'deudas'>,
): { opciones: OpcionCobro[]; elegida: string } {
  const deudas: OpcionCobro[] = [];
  for (const deuda of d.deudas) {
    const cuota = proximaCuota(deuda.cuotas);
    if (!cuota) continue;
    // La base frena en lo que falta de ESA deuda, y nunca más que el saldo.
    const tope = Math.min(deuda.falta, d.saldo);
    if (tope <= 0) continue;
    deudas.push({
      clave: deuda.fio_id, tipo: 'deuda', cuota, concepto: deuda.concepto,
      propuesto: Math.min(cuota.pendiente, tope), tope,
    });
  }
  if (deudas.length === 0) return { opciones: [], elegida: 'todo' };

  const opciones = [...deudas];
  if (d.sin_fecha > 0) {
    opciones.push({ clave: 'sin_fecha', tipo: 'sin_fecha', cuota: null, concepto: '', propuesto: d.sin_fecha, tope: d.saldo });
  }
  opciones.push({ clave: 'todo', tipo: 'todo', cuota: null, concepto: '', propuesto: d.saldo, tope: d.saldo });

  const vencidas = deudas
    .filter((o) => (o.cuota?.dias ?? 1) <= 0)
    .sort((a, b) => (a.cuota?.dias ?? 0) - (b.cuota?.dias ?? 0));
  const elegida = vencidas[0]?.clave ?? (d.sin_fecha > 0 ? 'sin_fecha' : deudas[0].clave);
  return { opciones, elegida };
}

/**
 * `detalle_fiado` tal como llega de la base, con los números hechos número.
 *
 * Un `numeric` de Postgres puede llegar como texto según por dónde pase, y
 * «150000» + 1 da «1500001». Se pasa todo por acá una sola vez y las
 * pantallas (Fiado y la revisión por voz) ya no tienen que acordarse.
 */
export function leerDetalleFiado(d: any): DetalleFiado {
  const lista = (x: unknown): any[] => (Array.isArray(x) ? x : []);
  return {
    cliente_id: String(d?.cliente_id ?? ''),
    nombre: String(d?.nombre ?? ''),
    telefono: String(d?.telefono ?? ''),
    activo: d?.activo !== false,
    saldo: Number(d?.saldo ?? 0),
    sin_fecha: Number(d?.sin_fecha ?? 0),
    desde: d?.desde ?? null,
    dias: d?.dias == null ? null : Number(d.dias),
    deudas: lista(d?.deudas).map((x) => ({
      fio_id: String(x.fio_id),
      concepto: String(x.concepto ?? ''),
      fecha: String(x.fecha ?? ''),
      monto: Number(x.monto ?? 0),
      venta_id: x.venta_id ?? null,
      pagado: Number(x.pagado ?? 0),
      falta: Number(x.falta ?? 0),
      cuotas: lista(x.cuotas).map((c) => ({
        cuota_id: String(c.cuota_id),
        fio_id: String(x.fio_id),
        numero: Number(c.numero ?? 1),
        de: Number(c.de ?? 1),
        vence_el: String(c.vence_el ?? ''),
        dias: Number(c.dias ?? 0),
        monto: Number(c.monto ?? 0),
        pagado: Number(c.pagado ?? 0),
        pendiente: Number(c.pendiente ?? 0),
        avisado_el: c.avisado_el ?? null,
      })).sort((a, b) => a.numero - b.numero),
    })),
    sin_fecha_lineas: lista(d?.sin_fecha_lineas).map((l) => ({
      id: String(l.id),
      fecha: String(l.fecha ?? ''),
      monto: Number(l.monto ?? 0),
      concepto: String(l.concepto ?? ''),
      venta_id: l.venta_id ?? null,
      cubierto: Number(l.cubierto ?? 0),
    })),
    libro: lista(d?.libro).map((l) => ({
      id: String(l.id),
      tipo: l.tipo === 'cobro' ? 'cobro' : 'fio',
      monto: Number(l.monto ?? 0),
      fecha: String(l.fecha ?? ''),
      concepto: String(l.concepto ?? ''),
      venta_id: l.venta_id ?? null,
      created_at: String(l.created_at ?? ''),
      fio_id: l.fio_id ?? null,
      metodo: l.metodo ?? null,
    })),
  };
}

/**
 * Lo que ya se cobró de una línea sin fecha, para avisarlo al «Ponerle fecha».
 *
 * Las cuotas tienen que sumar la línea ENTERA (400.000), no lo que falta
 * (250.000): lo ya pagado tapa las primeras. Sin decirlo, la hoja mostraba
 * «2 × 200.000» y nadie entendía por qué no 2 × 125.000.
 *
 * El número NO se calcula acá: lo manda la base en cada línea sin fecha
 * (`detalle_fiado.sin_fecha_lineas[].cubierto`), y es exactamente lo que
 * `programar_cuotas` va a dejar atado a esa deuda al guardar (los pagos
 * sueltos cubren primero lo que se anotó primero). Así el aviso dice la
 * verdad con una línea o con diez, y haya o no otras deudas en cuotas. Si la
 * base no manda la clave, 0: no se dice nada.
 */
export function yaCobradoAlFechar(
  d: Pick<DetalleFiado, 'sin_fecha_lineas'>, linea: { id: string; monto: number }, decimales = 0,
): number {
  const cubierto = Number(d.sin_fecha_lineas.find((l) => l.id === linea.id)?.cubierto ?? 0);
  if (!(cubierto > 0)) return 0;
  const f = 10 ** decimales;
  return Math.min(linea.monto, Math.round(cubierto * f) / f);
}

/**
 * A cuáles líneas sin fecha tiene sentido ofrecerles «Ponerle fecha».
 *
 * Un cliente de años tiene decenas de líneas viejas ya pagadas, y un botón
 * en cada una taparía el libro. Lo que hoy debe sin fecha son sus líneas más
 * NUEVAS (los pagos sueltos tapan primero lo más viejo).
 *
 * Cuáles son lo dice la base: cada línea trae `cubierto` (lo que ya tiene
 * pagado) y el botón va en las que todavía tienen algo sin cubrir. Es la
 * misma regla con la que `programar_cuotas` ata los pagos, así que nunca se
 * ofrece ponerle fecha a una línea que nacería pagada entera. Sin esa clave
 * (una lista armada a mano), la cuenta de antes: de la más nueva hacia atrás
 * hasta cubrir lo que debe sin fecha.
 */
export function lineasParaFechar<L extends { id: string; fecha: string; monto: number; cubierto?: number }>(
  lineas: L[], sinFecha: number,
): L[] {
  if (!(sinFecha > 0)) return [];
  if (lineas.length > 0 && lineas.every((l) => typeof l.cubierto === 'number')) {
    return lineas.filter((l) => (l.cubierto ?? 0) < l.monto);
  }
  const deNuevaAVieja = lineas
    .map((l, i) => ({ l, i }))
    .sort((a, b) => b.l.fecha.localeCompare(a.l.fecha) || a.i - b.i);
  const elegidas: L[] = [];
  let cubierto = 0;
  for (const { l } of deNuevaAVieja) {
    if (cubierto >= sinFecha) break;
    elegidas.push(l);
    cubierto += l.monto;
  }
  return elegidas;
}
