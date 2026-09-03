import type { Rubro, TipoCuenta } from './tipos';

/**
 * QUÉ CAMBIA SEGÚN EL RUBRO.
 *
 * Un motor, varias puertas. El 90% de Orden —entró, salió, me queda, debo
 * esto— es igual para un almacén, un ganadero, un agricultor y un taller.
 * Acá vive el 10% que no.
 *
 * POR QUÉ ESTO ESTÁ EN TYPESCRIPT Y NO EN POSTGRESQL
 *
 * Porque no protege nada. Que un ganadero vea la pantalla del cierre del día
 * no filtra un dato de nadie: simplemente le sobra. La regla de siempre sigue
 * intacta —lo que decide quién puede VER o ESCRIBIR algo vive en la base— y
 * esto es presentación.
 *
 * Las dos cosas que sí tienen consecuencia fuera de la pantalla viven en
 * PostgreSQL, en la migración 021: las categorías de gasto (las usa el prompt
 * de la captura) y `rubro_cierra_el_dia()` (la usa la tarea de la noche para
 * no mandarle un recordatorio a quien no tiene nada que cerrar).
 *
 * SOBRE LAS PALABRAS Y LOS IDIOMAS
 *
 * Los reemplazos de vocabulario están en español solamente, y es a propósito.
 * Orden habla seis idiomas: si cada rubro trajera su juego completo de
 * palabras traducidas, serían cuatro rubros × seis idiomas de texto a
 * mantener para siempre. En los demás idiomas se usa la palabra genérica del
 * diccionario, que se entiende igual. Cuando haya clientes de un rubro
 * hablando otro idioma, se traduce ese caso y no antes.
 */
export interface FichaRubro {
  clave: Rubro;
  /** Cómo se llama al elegirlo. */
  nombre: string;
  /** Ejemplos concretos, para que la persona se reconozca. */
  ejemplo: string;
  /**
   * Rutas que NO existen para este rubro. No se muestran en gris ni con un
   * candado: no están, y la página redirige si alguien escribe la URL.
   */
  sinSecciones: string[];
  /**
   * Reemplazos de vocabulario, solo en español. Lo que no esté acá usa la
   * palabra del diccionario.
   */
  palabras: Partial<Record<'vender' | 'productos' | 'ventas', string>>;
  /**
   * Si el negocio tiene ciclos largos —un novillo que se engorda dieciocho
   * meses, una campaña de soja, una obra— la ganancia no se mide por día.
   * De acá va a colgar la pantalla de lotes.
   */
  ciclosLargos: boolean;
  /** Espejo de `rubro_cierra_el_dia()`. La autoridad es la base. */
  cierraElDia: boolean;
}

export const RUBROS: Record<Rubro, FichaRubro> = {
  comercio: {
    clave: 'comercio',
    nombre: 'Comercio',
    ejemplo: 'Almacén, tienda de ropa, perfumería, delivery',
    sinSecciones: ['/reparto'],
    palabras: {},
    ciclosLargos: false,
    cierraElDia: true,
  },

  ganaderia: {
    clave: 'ganaderia',
    nombre: 'Ganadería',
    ejemplo: 'Cría, engorde, tambo',
    // Sin cierre del día ni reto: la ganancia de un novillo no se mide por
    // día, y una meta de ventas diaria no significa nada cuando vendés tres
    // veces al año. Un sistema que todas las noches te dice que no cargaste
    // nada, cuando no había nada que cargar, se desinstala.
    sinSecciones: ['/cierre', '/reto', '/reparto'],
    palabras: { vender: 'Vender', productos: 'Hacienda', ventas: 'Ventas' },
    ciclosLargos: true,
    cierraElDia: false,
  },

  agricultura: {
    clave: 'agricultura',
    nombre: 'Agricultura',
    ejemplo: 'Soja, maíz, huerta, frutales',
    sinSecciones: ['/cierre', '/reto', '/reparto'],
    palabras: { vender: 'Vender', productos: 'Cultivos', ventas: 'Ventas' },
    ciclosLargos: true,
    cierraElDia: false,
  },

  servicios: {
    clave: 'servicios',
    nombre: 'Servicios y oficios',
    ejemplo: 'Taller, obra, plomería, peluquería, freelance',
    // El cierre del día sí aplica: un taller trabaja todos los días. Pero
    // además tiene trabajos que duran —la obra de una casa— así que también
    // le van a servir los lotes.
    sinSecciones: [],
    palabras: { vender: 'Cobrar', productos: 'Servicios', ventas: 'Cobrado' },
    ciclosLargos: true,
    cierraElDia: true,
  },
};

export const LISTA_RUBROS: FichaRubro[] = [
  RUBROS.comercio, RUBROS.servicios, RUBROS.ganaderia, RUBROS.agricultura,
];

/**
 * LA CUENTA PERSONAL NO ES UN RUBRO, PERO ES UNA PUERTA.
 *
 * No está en RUBROS ni en LISTA_RUBROS a propósito: nadie la elige de la
 * lista, se llega por el tipo de cuenta. Pero necesita lo mismo que un rubro
 * —qué pantallas existen, qué palabras se usan— así que tiene su ficha.
 *
 * Sin esto pasaba lo que estuvo pasando en producción: como a toda cuenta
 * personal se le guarda rubro 'comercio' (una persona no tiene rubro), la
 * ficha que le tocaba era la de un almacén, y por eso seguía viendo el
 * cierre del día. El bug no estaba en la pantalla del cierre: estaba acá,
 * en que se preguntaba por el rubro cuando había que preguntar por el tipo
 * de cuenta.
 *
 * Sin `/cierre` por el mismo motivo que la ganadería: el día no es el ciclo.
 * El de un ganadero es el novillo; el de alguien con sueldo va de cobro a
 * cobro. Y sin `/reto`, que es una meta de ventas.
 */
export const PERSONAL: FichaRubro = {
  clave: 'comercio',
  nombre: 'Personal',
  ejemplo: 'Tu sueldo, tus gastos y tus deudas',
  sinSecciones: ['/cierre', '/reto', '/vender', '/productos', '/reparto'],
  palabras: {},
  ciclosLargos: false,
  cierraElDia: false,
};

/**
 * Qué puerta le toca a esta cuenta.
 *
 * El tipo de cuenta es OBLIGATORIO y va primero en importancia: manda sobre
 * el rubro. Es a propósito que no tenga valor por defecto — el día que se
 * agregue una pantalla nueva, el compilador obliga a contestar la pregunta
 * en cada lugar en vez de dejar que alguien se olvide en silencio.
 *
 * Nunca devuelve undefined: un rubro desconocido cae en comercio.
 */
export function fichaDe(
  rubro: string | null | undefined,
  tipoCuenta: TipoCuenta,
): FichaRubro {
  if (tipoCuenta === 'personal') return PERSONAL;
  return RUBROS[(rubro ?? 'comercio') as Rubro] ?? RUBROS.comercio;
}

/**
 * La palabra de este rubro, o la del diccionario si no la cambia.
 *
 * `porDefecto` viene traducida; el reemplazo no. Por eso el reemplazo solo se
 * aplica cuando el idioma es español: en inglés o portugués es mejor la
 * palabra genérica bien traducida que una específica en el idioma equivocado.
 */
export function palabra(
  rubro: string | null | undefined,
  tipoCuenta: TipoCuenta,
  clave: keyof FichaRubro['palabras'],
  porDefecto: string,
  idioma: string,
): string {
  if (idioma !== 'es') return porDefecto;
  return fichaDe(rubro, tipoCuenta).palabras[clave] ?? porDefecto;
}
