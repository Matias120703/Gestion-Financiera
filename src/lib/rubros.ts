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
 * Acá decía: «cuando haya clientes de un rubro hablando otro idioma, se
 * traduce ese caso y no antes». Los hay desde el 2026-09-16: brasileños que
 * trabajan en Paraguay, muchos en el campo. Por eso cada rubro trae su
 * nombre, su ejemplo y sus palabras también en portugués (`pt`). Un idioma
 * que no esté en `pt` ni sea español sigue usando la palabra genérica del
 * diccionario.
 */

/**
 * Todas las pantallas que el rubro puede prender o apagar.
 *
 * Es una unión y no `string` a propósito: escribir `'/lote'` por error deja
 * de compilar, en vez de apagar una pantalla en silencio.
 */
export type Seccion =
  | '/panel' | '/vender' | '/gastos' | '/deudas' | '/cierre' | '/productos'
  | '/movimientos' | '/reto' | '/organizacion' | '/agenda' | '/reparto'
  | '/lotes' | '/reportes' | '/ajustes' | '/fiado' | '/clientes' | '/billetera';

export interface FichaRubro {
  clave: Rubro;
  /** Cómo se llama al elegirlo. */
  nombre: string;
  /** Ejemplos concretos, para que la persona se reconozca. */
  ejemplo: string;
  /**
   * QUÉ PANTALLAS EXISTEN PARA ESTE RUBRO.
   *
   * Es una lista de lo que HAY, no de lo que falta, y ese detalle es toda la
   * diferencia. Antes era al revés —`sinSecciones`, lo que se esconde— y eso
   * significaba que una pantalla nueva aparecía en TODOS los rubros hasta que
   * alguien se acordara de apagarla en cada uno. Fue exactamente lo que pasó
   * con los lotes: se construyeron para el ganadero y aparecieron también en
   * la barbería, donde no significan nada.
   *
   * Al revés falla del lado seguro: una pantalla nueva no aparece en ningún
   * lado hasta que alguien diga dónde va. Y como es `Record<Seccion, …>`, el
   * compilador no deja sumar una sección a la unión sin contestar la pregunta
   * en los cinco lugares. Nadie se puede olvidar en silencio.
   *
   * Lo que está en `false` no se muestra en gris ni con un candado: no está,
   * y la página redirige si alguien escribe la URL a mano.
   */
  secciones: Record<Seccion, boolean>;
  /**
   * Reemplazos de vocabulario, solo en español. Lo que no esté acá usa la
   * palabra del diccionario.
   */
  palabras: Partial<Record<'vender' | 'productos' | 'ventas' | 'clientes', string>>;
  /** Lo mismo en portugués: nombre y ejemplo al elegirlo, y sus palabras. */
  pt: {
    nombre: string;
    ejemplo: string;
    palabras: Partial<Record<'vender' | 'productos' | 'ventas' | 'clientes', string>>;
  };
  /**
   * Si el negocio tiene ciclos largos —un novillo que se engorda dieciocho
   * meses, una campaña de soja— la ganancia no se mide por día.
   *
   * Cambia dos cosas en el panel: esconde la racha (contarle días seguidos a
   * quien vende tres veces al año es contarle su fracaso) y en su lugar
   * muestra el acumulado del año.
   */
  ciclosLargos: boolean;
  /** Espejo de `rubro_cierra_el_dia()`. La autoridad es la base. */
  cierraElDia: boolean;
  /**
   * Si vende sus servicios en paquetes: «ocho clases por 400.000» (088).
   *
   * Es un campo y no un «if rubro === 'clases'» suelto en la pantalla
   * por lo mismo que `secciones`: así el compilador obliga a contestar la
   * pregunta en cada rubro, y el día que el personal trainer venda
   * paquetes de entrenamientos se prende con una palabra.
   */
  paquetes: boolean;
  /**
   * SI LA AGENDA ES DE UN PROFE Y NO DE UN LOCAL (089).
   *
   * La agenda se hizo para una barbería: un equipo de profesionales, cada
   * uno con su comisión, y un link público por el que cualquiera toma un
   * hueco. Un profe no trabaja así. Es uno solo, lo que cobra es todo
   * suyo, y los horarios los arma él alumno por alumno.
   *
   * En `true`: sin link público, y la agenda no pide armar un equipo —el
   * que da las clases es el dueño—. Espejo de `rubro_de_alumnos()`.
   */
  agendaDeAlumnos: boolean;
}

/**
 * Lo que tiene cualquier negocio, sea del rubro que sea.
 *
 * Existe para que la tabla de abajo se lea: cada rubro escribe SOLO lo suyo,
 * y lo suyo se ve de un vistazo. Un rubro puede apagar algo de acá igual —la
 * ganadería apaga el cierre del día— porque lo de abajo pisa a lo de acá.
 */
const NUCLEO = {
  '/panel': true,
  '/vender': true,
  '/gastos': true,
  '/deudas': true,
  '/cierre': true,
  '/productos': true,
  '/movimientos': true,
  '/reto': true,
  '/reportes': true,
  '/ajustes': true,
  // Lo que te deben y a quién le vendés (052-055). Un almacén fía, a una
  // persona también le deben, y un ganadero le vende a un frigorífico que
  // paga a treinta días: no es de un rubro, es de todos.
  '/fiado': true,
  '/clientes': true,
  // Cuánto hay en cada banco (074). Una persona y un negocio tienen bancos.
  '/billetera': true,
  // Lo que NO es de un negocio común. Cada rubro prende lo suyo.
  '/organizacion': false,
  '/agenda': false,
  '/reparto': false,
  '/lotes': false,
} as const satisfies Record<Seccion, boolean>;

export const RUBROS: Record<Rubro, FichaRubro> = {
  comercio: {
    clave: 'comercio',
    nombre: 'Comercio',
    ejemplo: 'Almacén, tienda de ropa, perfumería, delivery',
    // El núcleo tal cual. Un almacén compra hoy y vende mañana: el día le
    // sirve como unidad y no necesita nada de los otros rubros.
    secciones: { ...NUCLEO },
    palabras: {},
    pt: { nombre: 'Comércio', ejemplo: 'Mercearia, loja de roupas, perfumaria, delivery', palabras: {} },
    ciclosLargos: false,
    cierraElDia: true,
    paquetes: false,
    agendaDeAlumnos: false,
  },

  servicios: {
    clave: 'servicios',
    nombre: 'Servicios y oficios',
    ejemplo: 'Peluquería, barbería, taller, plomería, freelance',
    secciones: {
      ...NUCLEO,
      // Lo suyo: los turnos, y cómo se reparte lo que cobra cada uno.
      '/agenda': true,
      '/reparto': true,
    },
    // «Servicios y productos» y no «Servicios»: la pantalla tiene las dos
    // cosas, en dos pestañas. Con el nombre viejo, quien entraba a cargar el
    // shampoo que vende no sabía si estaba en el lugar correcto.
    palabras: { vender: 'Cobrar', productos: 'Servicios y productos', ventas: 'Cobrado' },
    pt: {
      nombre: 'Serviços e ofícios',
      ejemplo: 'Salão, barbearia, oficina, encanador, freelancer',
      palabras: { vender: 'Receber', productos: 'Serviços e produtos', ventas: 'Recebido' },
    },
    // El día SÍ es su unidad: un peluquero cobra hoy lo que hizo hoy, cierra
    // su día y tiene racha como cualquier comercio. Estuvo en `true` un
    // tiempo, arrastrado de cuando los lotes iban a servir también acá, y el
    // efecto era que a una barbería se le escondía la racha y en su lugar se
    // le mostraba un acumulado anual que no mira nadie.
    ciclosLargos: false,
    cierraElDia: true,
    paquetes: false,
    agendaDeAlumnos: false,
  },

  ganaderia: {
    clave: 'ganaderia',
    nombre: 'Ganadería',
    ejemplo: 'Cría, engorde, tambo',
    secciones: {
      ...NUCLEO,
      // Lo suyo: el ciclo del negocio es el novillo, no el día.
      '/lotes': true,
      // Sin cierre del día ni reto: la ganancia de un novillo no se mide por
      // día, y una meta de ventas diaria no significa nada cuando vendés tres
      // veces al año. Un sistema que todas las noches te dice que no cargaste
      // nada, cuando no había nada que cargar, se desinstala.
      '/cierre': false,
      '/reto': false,
    },
    palabras: { vender: 'Vender', productos: 'Hacienda', ventas: 'Ventas' },
    pt: {
      nombre: 'Pecuária',
      ejemplo: 'Cria, engorda, leite',
      palabras: { vender: 'Vender', productos: 'Rebanho', ventas: 'Vendas' },
    },
    ciclosLargos: true,
    cierraElDia: false,
    paquetes: false,
    agendaDeAlumnos: false,
  },

  agricultura: {
    clave: 'agricultura',
    nombre: 'Agricultura',
    ejemplo: 'Soja, maíz, huerta, frutales',
    secciones: {
      ...NUCLEO,
      // Lo suyo, igual que al ganadero: el ciclo es la campaña, no el día.
      // Una hectárea de soja se siembra, junta costos seis meses y recién
      // ahí se cosecha y se vende.
      '/lotes': true,
      '/cierre': false,
      '/reto': false,
    },
    palabras: { vender: 'Vender', productos: 'Cultivos', ventas: 'Ventas' },
    pt: {
      nombre: 'Agricultura',
      ejemplo: 'Soja, milho, horta, frutas',
      palabras: { vender: 'Vender', productos: 'Culturas', ventas: 'Vendas' },
    },
    ciclosLargos: true,
    cierraElDia: false,
    paquetes: false,
    agendaDeAlumnos: false,
  },

  /**
   * QUIEN VENDE SU TIEMPO EN CLASES (087).
   *
   * Estuvo un tiempo dentro de «servicios y oficios», y ahí la mitad de
   * las palabras le quedaban mal. Un plomero cobra un trabajo y se
   * termina; un profe tiene ALUMNOS que vuelven todas las semanas durante
   * meses, y vende ocho clases juntas que después va dando.
   */
  clases: {
    clave: 'clases',
    nombre: 'Clases y cursos',
    ejemplo: 'Profe de inglés, matemática, música, programación; online o presencial',
    secciones: {
      ...NUCLEO,
      // Lo suyo: cuándo es cada clase. Sin «Equipo y reparto»: el profe
      // da sus clases solo, y lo que cobra es todo suyo. No hay a quién
      // repartirle ni comisión que calcular.
      '/agenda': true,
    },
    // «Alumnos» y no «clientes»: un profe no dice «tengo doce clientes».
    // Y «Clases y paquetes» porque la pantalla tiene las dos cosas.
    palabras: {
      vender: 'Cobrar', productos: 'Clases y paquetes', ventas: 'Cobrado',
      clientes: 'Alumnos',
    },
    pt: {
      nombre: 'Aulas e cursos',
      ejemplo: 'Professor de inglês, matemática, música, programação; online ou presencial',
      palabras: {
        vender: 'Receber', productos: 'Aulas e pacotes', ventas: 'Recebido',
        clientes: 'Alunos',
      },
    },
    // El día es su unidad: da sus clases hoy y las cobra hoy, igual que un
    // peluquero. Por eso cierra el día y tiene racha.
    ciclosLargos: false,
    cierraElDia: true,
    paquetes: true,
    agendaDeAlumnos: true,
  },
};

/**
 * LOS RUBROS QUE SE OFRECEN AL CREAR UNA CUENTA.
 *
 * No es lo mismo que `RUBROS`. Acá está lo que se muestra en la lista; arriba
 * está todo lo que el sistema sabe atender.
 *
 * AGRICULTURA NO SE OFRECE, Y NO ES QUE ESTÉ ROTA.
 *
 * Funciona: tiene sus categorías de gasto, su vocabulario y sus lotes. Lo que
 * pasa es que no se probó con un agricultor de verdad, y salir a ofrecer un
 * rubro que nadie uso todavía es prometer algo que no se sabe si cumple.
 * Decisión de Matías para el lanzamiento: comercio, servicios y ganadería,
 * más la cuenta personal.
 *
 * Se ofrece de nuevo agregándola a esta lista. Nada más: la ficha sigue
 * entera, la base sigue aceptando el rubro, y una cuenta que ya lo tenga
 * guardado sigue funcionando igual —por eso se saca de la lista y no de
 * `RUBROS`—.
 */
export const LISTA_RUBROS: FichaRubro[] = [
  RUBROS.comercio, RUBROS.servicios, RUBROS.clases, RUBROS.ganaderia,
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
 */
export const PERSONAL: FichaRubro = {
  clave: 'comercio',
  nombre: 'Personal',
  ejemplo: 'Tu sueldo, tus gastos y tus deudas',
  secciones: {
    ...NUCLEO,
    // Lo suyo: el presupuesto, que va de cobro a cobro y no del 1 al 30.
    '/organizacion': true,
    // Una persona no vende ni lleva stock.
    '/vender': false,
    // Ni tiene clientes. A quien le debe plata lo lleva en «Me deben», que
    // es la misma tabla por debajo: una sección de «Clientes» en las
    // finanzas de alguien sería hablarle como a un comercio.
    '/clientes': false,
    '/productos': false,
    // Sin cierre por el mismo motivo que la ganadería: el día no es el ciclo.
    // El de un ganadero es el novillo; el de alguien con sueldo va de cobro a
    // cobro. Y sin reto, que es una meta de ventas.
    '/cierre': false,
    '/reto': false,
  },
  palabras: {},
  pt: { nombre: 'Pessoal', ejemplo: 'Seu salário, suas despesas e suas dívidas', palabras: {} },
  ciclosLargos: false,
  cierraElDia: false,
  paquetes: false,
  agendaDeAlumnos: false,
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
 * ¿Esta cuenta tiene esta pantalla?
 *
 * Una sola pregunta para toda la aplicación: la usan el menú, la barra de
 * abajo y el guardia de cada página. Antes cada lugar escribía su propio
 * `.includes(...)` sobre la lista, y ahí es donde se cuelan las diferencias
 * entre lo que el menú esconde y lo que la URL igual abre.
 */
export function tieneSeccion(
  rubro: string | null | undefined,
  tipoCuenta: TipoCuenta,
  seccion: Seccion,
): boolean {
  return fichaDe(rubro, tipoCuenta).secciones[seccion];
}

/**
 * La palabra de este rubro, o la del diccionario si no la cambia.
 *
 * `porDefecto` viene traducida. El reemplazo del rubro se usa en español y en
 * portugués, que lo tienen escrito; en cualquier otro idioma es mejor la
 * palabra genérica bien traducida que una específica en el idioma equivocado.
 */
export function palabra(
  rubro: string | null | undefined,
  tipoCuenta: TipoCuenta,
  clave: keyof FichaRubro['palabras'],
  porDefecto: string,
  idioma: string,
): string {
  const ficha = fichaDe(rubro, tipoCuenta);
  if (idioma === 'pt') return ficha.pt.palabras[clave] ?? porDefecto;
  if (idioma !== 'es') return porDefecto;
  return ficha.palabras[clave] ?? porDefecto;
}

/** El nombre y el ejemplo de un rubro, como se leen en ese idioma. */
export function rubroVisible(ficha: FichaRubro, idioma: string): { nombre: string; ejemplo: string } {
  if (idioma === 'pt') return { nombre: ficha.pt.nombre, ejemplo: ficha.pt.ejemplo };
  return { nombre: ficha.nombre, ejemplo: ficha.ejemplo };
}
