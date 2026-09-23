/**
 * LO QUE UNA PANTALLA AGRÍCOLA NECESITA SABER SIN PREGUNTARLE A LA BASE (100).
 *
 * Puro y sin dependencias a propósito: se compila suelto para las pruebas
 * (`probar:calculos`) y lo usan las pantallas de campañas, gastos y el
 * panel por igual. Los NÚMEROS de una campaña (puesto, cobrado, costo por
 * hectárea, kilos para cubrir) NO se calculan acá: salen de
 * `numeros_de_lote` en la base, un solo lugar para las fórmulas, y la
 * tarjeta, el panel y el Excel los leen iguales. Acá vive lo que es de la
 * pantalla: los cultivos y sus rangos, la campaña sugerida por la fecha,
 * la conversión de moneda que el usuario escribe, los avisos de rango y
 * el reparto de un gasto entre campañas.
 *
 * SOBRE LOS AVISOS. Un aviso deja seguir; un bloqueo es solo lo físicamente
 * imposible o lo que la base rechaza igual. 60.000 en vez de 6.000 al dólar
 * multiplica todo por diez y nadie lo nota hasta el cierre: por eso el
 * dólar avisa fuera de 5.000–9.000 y bloquea fuera de 3.000–20.000. El
 * resto (hectáreas, rinde, precio, humedad) avisa y nada más: la caña da
 * 56.000 kg/ha y un año seco da 800 kg de soja; ninguno es un error.
 */

export type ClaveCultivo =
  | 'soja' | 'maiz' | 'trigo' | 'sesamo' | 'mandioca' | 'cana' | 'hortalizas' | 'otro';

export interface Cultivo {
  clave: ClaveCultivo;
  nombre: { es: string; pt: string };
  /** Si se habla en sacas de 60 kg (soja, maíz, trigo): el brasiguayo dice «50 sc/ha». */
  sacas: boolean;
  /**
   * Días típicos entre la siembra y la cosecha. Sirve para sugerir el
   * vencimiento de un insumo «a cosecha»: la casa de insumos se cobra con
   * el grano, así que la deuda vence cuando el grano existe.
   */
  diasHastaCosecha: number;
  /** Rinde habitual en kg/ha, para avisar (no para bloquear). Null: no se sabe. */
  rinde: { min: number; max: number } | null;
  /** Precio habitual en US$/t, para avisar. Null: no se sabe. */
  precioRango: { min: number; max: number } | null;
}

/**
 * Los cultivos que se ofrecen como chips al abrir una campaña. Los rangos
 * salen de las planillas de la UNA y de INBIO para Paraguay; el sésamo no
 * tiene mínimo porque un año seco lo deja en cero y eso no es un error de
 * carga.
 */
export const CULTIVOS: Cultivo[] = [
  { clave: 'soja', nombre: { es: 'Soja', pt: 'Soja' }, sacas: true, diasHastaCosecha: 180,
    rinde: { min: 500, max: 5000 }, precioRango: { min: 250, max: 600 } },
  { clave: 'maiz', nombre: { es: 'Maíz', pt: 'Milho' }, sacas: true, diasHastaCosecha: 180,
    rinde: { min: 1500, max: 9000 }, precioRango: null },
  { clave: 'trigo', nombre: { es: 'Trigo', pt: 'Trigo' }, sacas: true, diasHastaCosecha: 150,
    rinde: { min: 800, max: 5000 }, precioRango: null },
  { clave: 'sesamo', nombre: { es: 'Sésamo', pt: 'Gergelim' }, sacas: false, diasHastaCosecha: 120,
    rinde: { min: 0, max: 1500 }, precioRango: null },
  { clave: 'mandioca', nombre: { es: 'Mandioca', pt: 'Mandioca' }, sacas: false, diasHastaCosecha: 300,
    rinde: null, precioRango: null },
  { clave: 'cana', nombre: { es: 'Caña', pt: 'Cana' }, sacas: false, diasHastaCosecha: 365,
    rinde: null, precioRango: null },
  { clave: 'hortalizas', nombre: { es: 'Hortalizas', pt: 'Hortaliças' }, sacas: false, diasHastaCosecha: 90,
    rinde: null, precioRango: null },
  { clave: 'otro', nombre: { es: 'Otro', pt: 'Outro' }, sacas: false, diasHastaCosecha: 180,
    rinde: null, precioRango: null },
];

/** La ficha de un cultivo por su clave; una clave desconocida cae en «otro». */
export function cultivoDe(clave: string | null | undefined): Cultivo {
  return CULTIVOS.find((c) => c.clave === clave) ?? CULTIVOS[CULTIVOS.length - 1];
}

/**
 * El cultivo que corresponde a un nombre guardado («Soja», «Milho»,
 * «soja»): la base guarda texto libre, y la pantalla necesita volver a la
 * ficha para los rangos y las sacas. Sin coincidencia, «otro».
 */
export function cultivoPorNombre(nombre: string | null | undefined): Cultivo {
  const buscado = (nombre ?? '').trim().toLowerCase();
  if (!buscado) return cultivoDe('otro');
  return CULTIVOS.find((c) => c.nombre.es.toLowerCase() === buscado || c.nombre.pt.toLowerCase() === buscado)
    ?? cultivoDe('otro');
}

/** El nombre del cultivo en ese idioma (cualquier otro idioma lee español). */
export function nombreCultivo(clave: string | null | undefined, idioma: string): string {
  const c = cultivoDe(clave);
  return idioma === 'pt' ? c.nombre.pt : c.nombre.es;
}

/** Saca de 60 kg: es la unidad en que habla el brasiguayo y media Alto Paraná. */
export const KG_POR_SACA = 60;

/**
 * La campaña que corresponde a una fecha, con el nombre que se usa en el
 * campo: sep–dic es la zafra (que cruza el año: «Zafra 2026/27»), ene–mar
 * la zafriña, abr–ago el invierno (trigo, canola). Se lee del texto ISO y
 * no de un Date para que la zona horaria no corra el mes.
 */
export function sugerirCampana(fechaISO: string, idioma: 'es' | 'pt'): string {
  const anio = Number(fechaISO.slice(0, 4));
  const mes = Number(fechaISO.slice(5, 7));
  const corto = (a: number) => String(a % 100).padStart(2, '0');
  if (mes >= 9) {
    return idioma === 'pt' ? `Safra ${corto(anio)}/${corto(anio + 1)}` : `Zafra ${anio}/${corto(anio + 1)}`;
  }
  if (mes <= 3) return idioma === 'pt' ? `Safrinha ${corto(anio)}` : `Zafriña ${anio}`;
  return idioma === 'pt' ? `Inverno ${corto(anio)}` : `Invierno ${anio}`;
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

/** kg/ha → sacas de 60 kg por hectárea, con un decimal. */
export function sacasPorHa(kgHa: number): number {
  return redondear(kgHa / KG_POR_SACA, 1);
}

export type UnidadPrecio = 'kg' | 't';

/**
 * En qué unidad se DICE el precio según la moneda del negocio. El sojero en
 * dólares habla en US$ por tonelada; el sesamero en guaraníes, en Gs por
 * kilo. La base guarda siempre por tonelada.
 */
export function unidadDePrecio(moneda: string): UnidadPrecio {
  return moneda === 'PYG' ? 'kg' : 't';
}

/** Lo que escribió la persona (en su unidad) → precio por tonelada, como se guarda. */
export function precioPorTonelada(valor: number, unidad: UnidadPrecio): number {
  return redondear(unidad === 'kg' ? valor * 1000 : valor, 4);
}

/** Precio por tonelada guardado → como se muestra en la unidad de la persona. */
export function precioEnUnidad(precioTonelada: number, unidad: UnidadPrecio): number {
  return redondear(unidad === 'kg' ? precioTonelada / 1000 : precioTonelada, 4);
}

/**
 * La «otra» moneda de un negocio: el sojero en dólares paga el gasoil en
 * guaraníes; el sesamero en guaraníes compra la semilla en dólares.
 */
export function otraMoneda(propia: string): 'USD' | 'PYG' {
  return propia === 'PYG' ? 'USD' : 'PYG';
}

/**
 * EL CAMBIO QUE SE GUARDA, A PARTIR DE LO QUE LA PERSONA ESCRIBE.
 *
 * `cambio` es cuántas unidades de la moneda propia vale 1 de la original
 * (`monto = monto_original × cambio`). Pero nadie en Paraguay piensa
 * «0,000166 dólares por guaraní»: se piensa «el dólar está a 6.000». Para
 * la pareja PYG/USD la persona escribe siempre guaraníes por dólar, y acá
 * se da vuelta cuando hace falta: negocio en dólares que pagó en guaraníes
 * → 1/6.000, con diez decimales (con seis se pierde un 0,2 %).
 *
 * Para cualquier otra pareja (reales, pesos, euros) se escribe directo
 * «cuántos {propia} vale 1 {original}» y se guarda tal cual.
 */
export function cambioDesde(propia: string, original: string, valor: number): number {
  if (propia === 'PYG' && original === 'USD') return valor;
  if (propia === 'USD' && original === 'PYG') return redondear(1 / valor, 10);
  return valor;
}

/** monto_original × cambio, a dos decimales: lo que se guarda en `monto`. */
export function convertir(montoOriginal: number, cambio: number): number {
  return redondear(montoOriginal * cambio, 2);
}

/**
 * Lo que la persona escribió en la otra moneda, ya en la propia y con el
 * cambio que se guarda, en una sola llamada. `valor` es lo que escribió
 * para el dólar (o el cambio directo en otras parejas).
 */
export function convertirDesde(
  propia: string, original: string, montoOriginal: number, valor: number,
): { monto: number; cambio: number } {
  const cambio = cambioDesde(propia, original, valor);
  return { monto: convertir(montoOriginal, cambio), cambio };
}

/** Merma informativa del ticket: (brutos − netos) / brutos, en %, un decimal. Null si no hay brutos. */
export function merma(kgBrutos: number | null | undefined, kgNetos: number): number | null {
  if (!kgBrutos || kgBrutos <= 0) return null;
  return redondear(Math.max(0, (kgBrutos - kgNetos) / kgBrutos) * 100, 1);
}

/**
 * La retención de IVA que el silo descuenta en la liquidación: 30 % del
 * IVA del 5 % = 1,5 % del bruto. Se sugiere, no se impone: cada silo
 * aplica la suya.
 */
export const RETENCION_IVA = 0.015;
export function retencionSugerida(bruto: number): number {
  return redondear(bruto * RETENCION_IVA, 2);
}

export type Aviso = 'ok' | 'aviso' | 'bloqueo';

/** Más de 3.000 ha es raro para quien usa esta app; cero o negativo lo rechaza la base. */
export function avisoHectareas(hectareas: number): Aviso {
  if (!Number.isFinite(hectareas) || hectareas <= 0 || hectareas > 50000) return 'bloqueo';
  return hectareas > 3000 ? 'aviso' : 'ok';
}

/** Un rinde fuera del rango del cultivo avisa; sin rango conocido no dice nada. */
export function avisoRinde(cultivo: string | null | undefined, kgHa: number): Aviso {
  const rango = cultivoDe(cultivo).rinde;
  if (!rango || !Number.isFinite(kgHa) || kgHa <= 0) return 'ok';
  return kgHa < rango.min || kgHa > rango.max ? 'aviso' : 'ok';
}

/** Un precio fuera del rango del cultivo (en US$/t) avisa; negativo lo rechaza la base. */
export function avisoPrecio(cultivo: string | null | undefined, precioUSDt: number): Aviso {
  if (!Number.isFinite(precioUSDt) || precioUSDt < 0) return 'bloqueo';
  const rango = cultivoDe(cultivo).precioRango;
  if (!rango || precioUSDt === 0) return 'ok';
  return precioUSDt < rango.min || precioUSDt > rango.max ? 'aviso' : 'ok';
}

/** Humedad fuera de 5–40 la rechaza la base; más de 25 avisa (el silo va a descontar mucho). */
export function avisoHumedad(humedad: number): Aviso {
  if (!Number.isFinite(humedad) || humedad < 5 || humedad > 40) return 'bloqueo';
  return humedad > 25 ? 'aviso' : 'ok';
}

/**
 * El dólar en guaraníes. Fuera de 5.000–9.000 avisa; fuera de 3.000–20.000
 * bloquea: un cero de más multiplica todo por diez.
 */
export function avisoDolar(valor: number): Aviso {
  if (!Number.isFinite(valor) || valor < 3000 || valor > 20000) return 'bloqueo';
  return valor < 5000 || valor > 9000 ? 'aviso' : 'ok';
}

/**
 * REPARTIR UN GASTO ENTRE CAMPAÑAS POR HECTÁREAS.
 *
 * El gasoil o los jornales de un día se gastan en varias campañas a la
 * vez. Se reparte proporcional a las hectáreas; si alguna campaña no tiene
 * hectáreas cargadas, en partes iguales (repartir «por hectárea» con una
 * incógnita sería inventar). Todo en centavos para que la suma dé exacta:
 * el resto del redondeo va a la campaña más grande. Σ = monto, peso por peso.
 */
export function repartirPorHectareas(
  monto: number,
  campanas: { id: string; hectareas: number | null }[],
): { id: string; monto: number }[] {
  if (campanas.length === 0) return [];
  const conHectareas = campanas.every((c) => c.hectareas !== null && c.hectareas > 0);
  const pesos = campanas.map((c) => (conHectareas ? (c.hectareas as number) : 1));
  const total = pesos.reduce((a, b) => a + b, 0);
  const montoC = Math.round(monto * 100);
  const partesC = pesos.map((p) => Math.round((montoC * p) / total));
  const resto = montoC - partesC.reduce((a, b) => a + b, 0);
  // La más grande por peso; con pesos iguales, la primera.
  let masGrande = 0;
  pesos.forEach((p, i) => { if (p > pesos[masGrande]) masGrande = i; });
  partesC[masGrande] += resto;
  return campanas.map((c, i) => ({ id: c.id, monto: partesC[i] / 100 }));
}
