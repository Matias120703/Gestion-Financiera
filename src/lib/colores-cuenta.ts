/**
 * EL COLOR DE CADA CUENTA.
 *
 * Matías: «los colores de cada banco. El Ueno es verde, el Atlas rojo
 * oscuro, el Continental azul marino, el Familiar celeste».
 *
 * PARA QUÉ SIRVE DE VERDAD
 *
 * En el panel las cuentas son tarjetas que se deslizan de costado. Con seis
 * tarjetas iguales hay que leer el nombre de cada una para saber cuál es;
 * con seis colores no hace falta leer nada. Eso es todo lo que busca esto:
 * que se distingan de un vistazo.
 *
 * Por eso no es una reproducción exacta de cada marca —no somos los bancos y
 * no tenemos sus manuales—, sino un color reconocible y, sobre todo,
 * distinto del de al lado.
 *
 * TRES FORMAS DE LLEGAR AL COLOR, EN ESTE ORDEN
 *
 *   1. El que la persona eligió a mano. Manda siempre: si alguien puso su
 *      caja en violeta, es violeta.
 *   2. El del banco, si le reconocemos el nombre.
 *   3. Uno sacado del nombre. No es al azar: la misma cuenta saca siempre el
 *      mismo color, en este teléfono y en el otro. Así una cuenta que no
 *      conocemos igual se distingue de las demás, en vez de caer todas en un
 *      gris que no dice nada.
 *
 * EL EFECTIVO NO ENTRA EN ESTO: es verde siempre, en todas las cuentas, en
 * todos los rubros. Es la plata en la mano y conviene que se lea igual para
 * todo el mundo.
 */

/** Los colores que se pueden elegir a mano. Se guardan por nombre, no por código. */
export const COLORES = [
  'verde', 'rojo', 'azul', 'celeste', 'naranja', 'violeta', 'rosa', 'gris',
] as const;

export type ColorCuenta = (typeof COLORES)[number];

/**
 * El tono fuerte de cada color: el círculo va pintado de esto y la letra va
 * blanca encima. Pintado en sólido y no en tinte claro porque así se ve igual
 * de bien con el fondo claro y con el oscuro, y no hay que tener dos juegos.
 */
export const TONO: Record<ColorCuenta, string> = {
  verde:   '#0E9F6E',
  rojo:    '#9B2226',
  azul:    '#1B3A6B',
  celeste: '#0EA5E9',
  naranja: '#EA7317',
  violeta: '#6D3FA0',
  rosa:    '#BE3455',
  gris:    '#4A5054',
};

/**
 * Los bancos y billeteras de Paraguay que se nombran seguido. La clave es el
 * nombre sin tildes ni mayúsculas, y se busca por «contiene»: así «Banco
 * Atlas», «atlas» y «mi cuenta atlas» caen todas en el mismo lugar.
 *
 * El orden importa: se devuelve la primera que coincida, así que lo más
 * específico va primero. «Banco Familiar» tiene que ganarle a «familiar».
 */
const BANCOS: [string, ColorCuenta][] = [
  ['ueno',         'verde'],
  ['atlas',        'rojo'],
  ['continental',  'azul'],
  ['familiar',     'celeste'],
  ['itau',         'naranja'],
  ['vision',       'naranja'],
  ['sudameris',    'azul'],
  ['regional',     'azul'],
  ['gnb',          'azul'],
  ['basa',         'azul'],
  ['rio',          'rojo'],
  ['fomento',      'azul'],
  ['bnf',          'azul'],
  ['solar',        'naranja'],
  ['interfisa',    'verde'],
  ['tigo',         'azul'],
  ['personal',     'celeste'],
  ['claro',        'rojo'],
  ['zimple',       'violeta'],
  ['wally',        'violeta'],
  ['mango',        'naranja'],
  ['mercado pago', 'celeste'],
  ['paypal',       'azul'],
  ['binance',      'naranja'],
];

/** Sin tildes, en minúsculas: «Banco Itaú» y «banco itau» son lo mismo. */
function plano(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * El color de una cuenta que no reconocemos, sacado de su nombre. La misma
 * cuenta da siempre el mismo, porque el número sale de las letras y no de un
 * azar que cambiaría en cada visita.
 */
function delNombre(nombre: string): ColorCuenta {
  const texto = plano(nombre);
  let n = 0;
  for (let i = 0; i < texto.length; i++) n = (n * 31 + texto.charCodeAt(i)) % 100000;
  // El gris queda fuera del sorteo: es el color de «no sé qué poner», y acá
  // siempre hay algo mejor. Se elige a mano, no se reparte solo.
  const sorteables = COLORES.filter((c) => c !== 'gris');
  return sorteables[n % sorteables.length];
}

/** El color final de una cuenta, en el orden explicado arriba. */
export function colorDeCuenta(cuenta: {
  nombre: string;
  tipo: string;
  color?: string | null;
}): ColorCuenta {
  const elegido = cuenta.color as ColorCuenta | null | undefined;
  if (elegido && (COLORES as readonly string[]).includes(elegido)) return elegido;

  if (cuenta.tipo === 'efectivo') return 'verde';

  const nombre = plano(cuenta.nombre);
  const banco = BANCOS.find(([clave]) => nombre.includes(clave));
  if (banco) return banco[1];

  return delNombre(cuenta.nombre);
}

/** El código de color listo para pintar. */
export function tonoDeCuenta(cuenta: { nombre: string; tipo: string; color?: string | null }): string {
  return TONO[colorDeCuenta(cuenta)];
}

/**
 * EL COLOR DE UNA TARJETA ENTERA (094).
 *
 * Matías: «quiero que se vea como una tarjeta real de un banco, y con el
 * color en toda la tarjeta, no solo en una partecita».
 *
 * Una tarjeta pintada entera lleva la letra blanca encima, y ahí los tonos
 * de los círculos no alcanzan. El nombre de la cuenta va arriba a la
 * izquierda, en letra chica (15px), justo donde el degradé todavía no
 * oscureció: necesita 4,5 de contraste. Con los tonos de los círculos, el
 * verde daba 3,4, el naranja 3,6 y el celeste 4,0 —una revisión lo midió
 * píxel por píxel, con el brillo de encima incluido—.
 *
 * Así que esos tres arrancan más profundos: verde 4,8, celeste 5,2 y
 * naranja 4,6, ya con el brillo. Los otros cinco pasaban. El que eligió
 * naranja sigue viendo naranja; solo que ahora se lee lo que dice encima.
 */
export const TARJETA: Record<ColorCuenta, { desde: string; hasta: string }> = {
  verde:   { desde: '#047857', hasta: '#03503A' },
  rojo:    { desde: '#A4262C', hasta: '#5E1216' },
  azul:    { desde: '#24508F', hasta: '#0E2241' },
  celeste: { desde: '#0369A1', hasta: '#06507A' },
  naranja: { desde: '#C2410C', hasta: '#8A2F0E' },
  violeta: { desde: '#7A48B3', hasta: '#3E1A6E' },
  rosa:    { desde: '#C4365A', hasta: '#7A1331' },
  gris:    { desde: '#565D62', hasta: '#232629' },
};

/** El fondo de la tarjeta de una cuenta, listo para `background`. */
export function fondoDeTarjeta(cuenta: { nombre: string; tipo: string; color?: string | null }): string {
  const { desde, hasta } = TARJETA[colorDeCuenta(cuenta)];
  return `linear-gradient(135deg, ${desde} 0%, ${hasta} 100%)`;
}
