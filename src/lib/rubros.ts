import type { Rubro, TipoCuenta } from './tipos';

/**
 * Las palabras de un oficio que usa el motor de otro (097).
 *
 * El trainer usa las pantallas del profe tal cual, pero no dice «alumno»
 * ni «clase»: dice «cliente» y «sesión». En vez de copiar las pantallas, el
 * diccionario se pisa con las palabras del oficio (ver i18n/jergas.ts).
 *
 * El agricultor usa los lotes del ganadero (100), pero no dice «lote» ni
 * «ciclo»: dice «campaña», y lo que debe «a cosecha».
 */
export type Jerga = 'entrenamiento' | 'agricultura';

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
  | '/lotes' | '/reportes' | '/ajustes' | '/fiado' | '/clientes' | '/billetera'
  // Las rutinas y el progreso de cada cliente del personal trainer (098).
  | '/rutinas';

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
  palabras: Partial<Record<'vender' | 'productos' | 'ventas' | 'clientes' | 'fiado', string>>;
  /** Lo mismo en portugués: nombre y ejemplo al elegirlo, y sus palabras. */
  pt: {
    nombre: string;
    ejemplo: string;
    palabras: Partial<Record<'vender' | 'productos' | 'ventas' | 'clientes' | 'fiado', string>>;
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
   * pregunta en cada rubro. El personal trainer lo prendió con una
   * palabra (097).
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
  /**
   * Con qué palabras se habla, si no son las del diccionario (097). Null
   * es el diccionario tal cual; el del profe ES el diccionario.
   */
  jerga: Jerga | null;
  /**
   * QUÉ VA FIJO EN LA BARRA DE ABAJO DEL CELULAR, SI NO ES LA DE SIEMPRE.
   *
   * Null es la de siempre: Panel, Vender, Gastos y Cierre (o la del vendedor).
   * Al profe y al trainer esa barra les dejaba Panel y Gastos y nada más,
   * porque no venden ni cierran caja: la agenda y sus alumnos, que es lo que
   * miran todo el día, quedaban a dos toques. Matías: «en la barra de abajo
   * tendría que aparecer agendas y alumnos, para que tenga un mejor atajo».
   */
  barra: Seccion[] | null;
  /**
   * SI LAS NOTAS DE CADA CLIENTE VAN PEGADAS A CADA SESIÓN (097).
   *
   * Para un trainer, las notas de un cliente son sus lesiones: «rodilla
   * operada, sin saltos». Tiene que leerlas antes de empezar, no ir a
   * buscarlas a la ficha. Se ven en la agenda, en las sesiones de hoy del
   * panel, y se piden al agendar a alguien nuevo.
   */
  notasALaVista: boolean;
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
  '/rutinas': false,
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
    jerga: null,
    notasALaVista: false,
    barra: null,
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
    jerga: null,
    notasALaVista: false,
    barra: null,
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
    jerga: null,
    notasALaVista: false,
    barra: null,
  },

  /**
   * EL PRODUCTOR AGRÍCOLA (100).
   *
   * Su unidad no es el día sino la campaña: el mismo lote físico tiene soja
   * en la zafra y maíz en la zafriña, y el resultado se sabe recién al
   * final. Por eso usa los lotes del ganadero —una fila por campaña, con
   * cultivo, hectáreas y precio esperado— y les suma lo que el ganadero no
   * tiene: la cosecha camión por camión, la liquidación del silo tal como
   * viene en el papel, y los insumos que debe «a cosecha» atados a la
   * campaña. Casi nadie paga los insumos al contado.
   *
   * Habla con su jerga: «campaña» donde el ganadero lee «lote», «a cosecha»
   * donde el motor dice «a la venta» (ver i18n/textos/agricultura.ts).
   */
  agricultura: {
    clave: 'agricultura',
    nombre: 'Agricultura',
    ejemplo: 'Soja, maíz, trigo, sésamo, mandioca, huerta',
    secciones: {
      ...NUCLEO,
      // Lo suyo, igual que al ganadero: el ciclo es la campaña, no el día.
      // Una hectárea de soja se siembra, junta costos seis meses y recién
      // ahí se cosecha y se vende.
      '/lotes': true,
      '/cierre': false,
      '/reto': false,
      // SIN CATÁLOGO. El sojero no tiene productos: su grano se vende por
      // la liquidación, dentro de la campaña, que es la que sabe los kilos
      // y el precio. Y el que va a la feria vende con «producto suelto».
      // Un catálogo con «Soja» y stock en toneladas restaría dos veces el
      // costo (los insumos ya están como gastos de la campaña).
      '/productos': false,
    },
    palabras: { vender: 'Vender', productos: 'Cultivos', ventas: 'Ventas' },
    pt: {
      nombre: 'Agricultura',
      ejemplo: 'Soja, milho, trigo, gergelim, mandioca, horta',
      palabras: { vender: 'Vender', productos: 'Culturas', ventas: 'Vendas' },
    },
    ciclosLargos: true,
    cierraElDia: false,
    paquetes: false,
    agendaDeAlumnos: false,
    jerga: 'agricultura',
    notasALaVista: false,
    // Decidido en el contrato de la 100: lo de todos los días. Mirar cómo
    // va, la campaña (la cosecha y la liquidación viven ahí), cargar un
    // gasto, y vender para el que va a la feria o vende mandioca por
    // camión. Deudas y billetera quedan a un toque desde «Más».
    barra: ['/panel', '/lotes', '/gastos', '/vender'],
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
    // UN PROFE NO COMPRA NI VENDE NADA (090).
    //
    // Matías, mirando la pantalla: «¿Cómo vas a comprar y vender un curso?
    // Dice un corte, una sesión. Y aparece invertido en stock, reponer. No
    // tiene sentido. Esto es para que el profesor se administre mejor con
    // su agenda, con lo que entra y con lo que sale».
    //
    // Tenía razón: era una barbería con otras palabras. Así que se va todo
    // lo que es de un negocio que compra y vende —productos y stock, la
    // pantalla de cobrar, el cierre de caja— y queda lo que un profe mira:
    // su agenda, sus alumnos, lo que entra, lo que sale y lo que le deben.
    secciones: {
      ...NUCLEO,
      '/agenda': true,
      // Sin catálogo: lo que un profe vende es su tiempo, y el precio lo
      // pone al inscribir a cada alumno. No hay stock que reponer.
      '/productos': false,
      // Sin pantalla de cobrar: el cobro se hace al inscribir al alumno.
      '/vender': false,
      // Sin cierre del día: no tiene caja que contar a la noche.
      '/cierre': false,
      // Sin fiado: a un profe le deben inscripciones sin cobrar, y eso se
      // ve arriba de sus alumnos (091). Una venta fiada contaría como cobrado
      // lo que todavía no entró, y el profe eligió que se gane al cobrar.
      '/fiado': false,
    },
    // «Alumnos» y no «clientes»: un profe no dice «tengo doce clientes».
    palabras: {
      ventas: 'Cobrado', clientes: 'Alumnos',
    },
    pt: {
      nombre: 'Aulas e cursos',
      ejemplo: 'Professor de inglês, matemática, música, programação; online ou presencial',
      palabras: {
        ventas: 'Recebido', clientes: 'Alunos',
      },
    },
    // Sin cierre del día (arriba), y tampoco el recordatorio de la noche:
    // «no cargaste nada hoy» a quien no da clases los sábados es regañarlo
    // por descansar.
    ciclosLargos: false,
    cierraElDia: false,
    paquetes: true,
    agendaDeAlumnos: true,
    jerga: null,
    notasALaVista: false,
    // La agenda y los alumnos a un toque: es lo que un profe mira todo el día.
    barra: ['/panel', '/agenda', '/clientes', '/gastos'],
  },

  /**
   * EL PERSONAL TRAINER (097).
   *
   * Matías: «ponete en el lugar de un personal trainer». Su día es el del
   * profe con otra ropa: clientes que vuelven todas las semanas con un
   * horario fijo, el mes cobrado por adelantado, y cada sesión que se
   * marca como dada o no. Así que usa el mismo motor —las mismas
   * pantallas, las mismas funciones de la base— con sus palabras.
   *
   * Lo que decidió Matías para arrancar: uno a uno (sin dúos ni grupos),
   * la rutina como una nota simple por cliente, y las faltas como el
   * profe (se decide en cada una si se descuenta). Lo único suyo de
   * verdad: las lesiones de cada cliente, a la vista en cada sesión.
   */
  entrenamiento: {
    clave: 'entrenamiento',
    nombre: 'Personal trainer',
    ejemplo: 'Entrenamiento personalizado: en el gimnasio, a domicilio, al aire libre u online',
    // Lo mismo que el profe, y por lo mismo: no compra ni vende nada, no
    // cuenta caja a la noche, y lo que le deben son planes sin cobrar.
    secciones: {
      ...NUCLEO,
      '/agenda': true,
      '/productos': false,
      '/vender': false,
      '/cierre': false,
      '/fiado': false,
      // Las rutinas de cada cliente, sus medidas y su avance (098).
      '/rutinas': true,
    },
    // «Clientes», que es como dice un trainer; lo cobrado, como el profe.
    palabras: { ventas: 'Cobrado' },
    pt: {
      nombre: 'Personal trainer',
      ejemplo: 'Treino personalizado: na academia, em domicílio, ao ar livre ou online',
      palabras: { ventas: 'Recebido' },
    },
    ciclosLargos: false,
    cierraElDia: false,
    paquetes: true,
    agendaDeAlumnos: true,
    jerga: 'entrenamiento',
    notasALaVista: true,
    // Decidido con Matías (22/09): las cuatro que un trainer usa todos los
    // días. Gastos queda a un toque desde «Más».
    barra: ['/panel', '/agenda', '/rutinas', '/clientes'],
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
  RUBROS.comercio, RUBROS.servicios, RUBROS.clases, RUBROS.entrenamiento, RUBROS.ganaderia,
];
// CLASES Y CURSOS VUELVE A OFRECERSE (22/09). Estuvo afuera desde la 090
// mientras se rehacía para como trabaja un profe de verdad (inscribir con
// días y horario, cobrar el período, marcar la clase). Matías, al ver el
// alta: «también falta la de los docentes, para que puedan crear su
// cuenta».
//
// EL PERSONAL TRAINER SÍ SE OFRECE (097, 22/09). Matías lo pidió para
// probarlo creando una cuenta como cualquiera: «podés agregarlo al crear la
// cuenta, para probar». Va después de servicios, que es su vecino más
// parecido en la lista.

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
  jerga: null,
  notasALaVista: false,
  barra: null,
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
