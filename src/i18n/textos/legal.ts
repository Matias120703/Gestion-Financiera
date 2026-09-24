import { DIAS_DE_PRUEBA } from '@/lib/constantes';
import type { PlanDeRubro } from '@/lib/rubros';

/**
 * TÉRMINOS Y PRIVACIDAD, EN ESPAÑOL Y EN PORTUGUÉS (24/09/2026).
 *
 * Hasta hoy estaban escritos directo en las páginas y solo en español: un
 * brasileño que abría Orden en portugués leía las condiciones en otro idioma.
 * Viven acá, fuera de es.ts y pt.ts, porque son largos y los lee solo quien
 * abre /terminos o /privacidad: no tienen por qué viajar con el diccionario
 * de toda la app. Las páginas eligen con `legalDe(await idiomaActual())`.
 *
 * CADA FRASE SE SOSTIENE CON EL CÓDIGO DE HOY. De dónde sale cada una:
 *   · días de prueba ............ `DIAS_DE_PRUEBA` (constantes.ts, espejo de
 *                                  `dias_de_prueba()`, 049). No se escriben a mano.
 *   · plan de la prueba ......... `plan_de_prueba()` (102): Pro si el rubro lo
 *                                  ofrece; si no, el más alto de su lista.
 *   · planes de cada rubro ...... la tabla la arma la página con
 *                                  `FichaRubro.planes` (espejo de `planes_de_rubro()`, 102).
 *   · cuenta pausada ............ `CandadoCuenta` (decisión del 15/09): no se ve
 *                                  nada salvo /plan; los datos no se borran.
 *   · avisos 3, 1 y 0 días ...... 071 (push de la prueba) y 107 (push y correo).
 *   · cobro ..................... /plan abre WhatsApp (`NEXT_PUBLIC_WHATSAPP`);
 *                                  `pasarelaActiva()` sigue en 'ninguna'.
 *   · comisión .................. 102-105 y la letra chica de la portada.
 *   · datos del alta ............ src/app/crear/page.tsx (`crear_empresa`).
 *   · datos del socio ........... 064 y 070 (banco, titular, cuenta, CI o RUC;
 *                                  cada retiro guarda su copia).
 *   · lo que ve quien te invitó . `mi_panel_socio` (070): negocio, desde, si
 *                                  paga y qué plan.
 *   · lo que ve la administración `listar_cuentas` / `CuentaAdmin` (tipos.ts).
 *   · qué se manda a OpenAI ..... src/app/api/capturar/route.ts y
 *                                  src/lib/captura.ts (el costo NO va en el
 *                                  prompt), src/lib/transcribir.ts.
 *   · Resend .................... src/lib/avisos.ts, el resumen semanal, 107, y
 *                                  el SMTP de Supabase (recuperar la contraseña).
 *   · dónde ..................... Supabase sa-east-1 (memoria del proyecto,
 *                                  verificado el 23/09) y `vercel.json` → gru1.
 *   · rutinas y medidas ......... 098 y 099; la hoja «Progreso» del Excel del
 *                                  trainer es de la 106 (excel-alumnos.ts).
 *   · borrar la cuenta .......... 014 y Ajustes → «Zona delicada».
 *
 * Si mañana cambia una de esas cosas, se cambia acá en el mismo commit. Una
 * página legal que no dice la verdad es peor que no tenerla.
 *
 * MARCAS: `**así**` es negrita y `[texto](/ruta)` es un enlace interno. Las
 * separa `partesDeTexto`; las páginas solo las pintan.
 *
 * NO SOY ABOGADO. Esto describe con honestidad lo que hace el sistema; antes
 * de crecer, que un profesional lo revise contra la ley de cada país.
 */

export type BloqueLegal =
  | string
  | { lista: string[] }
  /** Piezas que la página arma con datos vivos: la tabla de planes, el botón de WhatsApp. */
  | { especial: 'planesPorRubro' | 'contacto' };

export interface ApartadoLegal {
  /** El ancla del índice: /terminos#pagos. */
  id: string;
  titulo: string;
  bloques: BloqueLegal[];
}

export interface DocumentoLegal {
  metaTitulo: string;
  metaDescripcion: string;
  titulo: string;
  actualizado: string;
  bajada: string;
  esencialTitulo: string;
  esencial: string[];
  apartados: ApartadoLegal[];
}

export interface TextosLegal {
  terminos: DocumentoLegal;
  privacidad: DocumentoLegal;
  indice: string;
  tabla: {
    rubro: string;
    planes: string;
    prueba: string;
    nombresPlanes: Record<PlanDeRubro, string>;
    cuentaPersonal: string;
    planPersonal: string;
    /** El nombre solo, para «Personal, 5 días». */
    nombrePlanPersonal: string;
    pruebaDe: (plan: string, dias: number) => string;
  };
  contacto: {
    whatsapp: string;
    mensaje: string;
  };
}

const E = DIAS_DE_PRUEBA.emprendedor;
const P = DIAS_DE_PRUEBA.personal;

// ======================================================================
// ESPAÑOL
// ======================================================================

export const legalEs: TextosLegal = {
  indice: 'En esta página',
  tabla: {
    rubro: 'Rubro',
    planes: 'Planes',
    prueba: 'La prueba',
    nombresPlanes: { basico: 'Básico', pro: 'Pro', negocio: 'Premium' },
    cuentaPersonal: 'Cuenta personal',
    planPersonal: 'Personal (plan único)',
    nombrePlanPersonal: 'Personal',
    pruebaDe: (plan, dias) => `${plan}, ${dias} días`,
  },
  contacto: {
    whatsapp: 'Escribinos por WhatsApp',
    mensaje: 'Hola, tengo una consulta sobre Orden.',
  },

  // --------------------------------------------------------------------
  terminos: {
    metaTitulo: 'Términos · Orden',
    metaDescripcion: 'Las condiciones de uso de Orden: la prueba, los planes de cada rubro, cómo se paga, qué pasa si no pagás y cómo funcionan las invitaciones.',
    titulo: 'Términos del servicio',
    actualizado: '24 de septiembre de 2026',
    bajada: 'Escritos para que se entiendan de una leída. Cada cosa que dice esta página es lo que Orden hace hoy, no lo que hará algún día.',
    esencialTitulo: 'Lo esencial',
    esencial: [
      `**${E} días gratis** si es un negocio y **${P}** si es una cuenta personal. Sin tarjeta.`,
      'Cada rubro tiene sus planes, con precio en guaraníes.',
      'Hoy se paga **por transferencia**, coordinada por WhatsApp. No hay débito automático.',
      'Si no pagás, **la cuenta se pausa** y no se puede usar hasta activar el plan. **Tus datos no se borran.**',
      'Si traés a alguien que paga, te llevás **la mitad del precio de lista de un mes** de su plan.',
    ],
    apartados: [
      {
        id: 'que-es',
        titulo: 'Qué es Orden',
        bloques: [
          'Orden es una aplicación para llevar la plata de lo que hacés: un comercio, un servicio con turnos, clases, entrenamiento personal, el campo, la ganadería o tus finanzas personales. Anotás ventas, cobros y gastos hablando, con una foto o escribiendo, y Orden te muestra cuánto te quedó.',
          'Está pensada para personas que trabajan por su cuenta y para negocios chicos. Al crear una cuenta aceptás lo que dice esta página y la [política de privacidad](/privacidad).',
        ],
      },
      {
        id: 'cuenta',
        titulo: 'Tu cuenta',
        bloques: [
          {
            lista: [
              'Tenés que dar un correo real y una contraseña, y cuidar esa contraseña.',
              'Lo que se haga desde tu cuenta se considera hecho por vos.',
              'Si sumás gente a tu negocio con el código de invitación, sos responsable de a quién se lo pasás y de qué permiso le das. Podés sacarlos y cambiar el código cuando quieras.',
              'Si cargás datos de otras personas —clientes, alumnos, profesionales—, tenés que tener derecho a hacerlo. Cómo los cuida Orden está en la [política de privacidad](/privacidad).',
            ],
          },
        ],
      },
      {
        id: 'prueba',
        titulo: 'La prueba gratis',
        bloques: [
          `Toda cuenta nueva arranca a prueba, **sin pedir tarjeta**: **${E} días** si es un negocio y **${P} días** si es una cuenta personal.`,
          'Se prueba el plan más completo que se le vende a tu rubro: Pro si tu rubro lo tiene y, si no, el que tiene. Así lo que probás es algo que después podés contratar.',
          'Si cambiás de rubro mientras probás, la prueba pasa al plan de tu rubro nuevo. Los días que te quedan no cambian.',
        ],
      },
      {
        id: 'planes',
        titulo: 'Los planes de cada rubro',
        bloques: [
          'Cada rubro tiene los planes que le sirven. Los que suman más personas no se le ofrecen a quien trabaja solo:',
          { especial: 'planesPorRubro' },
          'Los planes cambian cuántas personas pueden usar la cuenta y cuántas cargas con inteligencia artificial entran por mes. Eso y los precios están en la portada y en la pantalla de tu plan.',
          'Los precios se cobran en **guaraníes**. Al lado puede aparecer un «≈ US$» chico: es solo una referencia, no se cobra en dólares.',
          'Los descuentos —por cargar todos los días durante la prueba y por constancia— se explican en la pantalla de tu plan, con sus condiciones, y se aplican al pagar.',
          'Si los precios suben, te avisamos antes de que se apliquen a tu cuenta. Si ya pagaste un plan y cambiás de rubro, lo que pagaste se respeta hasta que termine ese período.',
        ],
      },
      {
        id: 'pagos',
        titulo: 'Cómo se paga',
        bloques: [
          'Hoy se paga **por transferencia**. En la pantalla de tu plan tocás «Suscribirme», se abre un WhatsApp con nosotros, transferís y te activamos el plan. Se paga por adelantado, por mes o por año.',
          'Hoy no se pide ni se guarda ninguna tarjeta, y **no hay débito automático**: nada se cobra solo.',
          'Si más adelante se suma el pago con tarjeta, esta página se actualiza antes de que empiece a funcionar.',
        ],
      },
      {
        id: 'si-no-pagas',
        titulo: 'Qué pasa si no pagás',
        bloques: [
          'Cuando termina la prueba, o el período que pagaste, y no hay un pago nuevo, **la cuenta se pausa**. Mientras está pausada no se puede ver ni usar ninguna pantalla —ni el panel, ni el historial, ni el Excel— salvo la de tu plan, que es donde se activa. Vale para todas las personas de la cuenta.',
          '**Tus datos no se borran.** Quedan guardados tal cual, y apenas se activa el plan volvés a encontrar todo como lo dejaste.',
          'Antes del vencimiento te avisamos tres días antes, un día antes y el mismo día: por correo, y en el celular si activaste los avisos. Si querés tener una copia de tus números, bajá el Excel desde Reportes antes de esa fecha.',
          'Si sos personal trainer, los links de rutina de tus clientes siguen andando hasta 30 días después del vencimiento, y los podés apagar todos de una vez desde la misma pantalla de la cuenta pausada.',
          'No borramos una cuenta por estar pausada. Si algún día eso cambiara, te lo avisaríamos por correo, con tiempo, antes de hacerlo.',
        ],
      },
      {
        id: 'dejar',
        titulo: 'Dejar de usar Orden',
        bloques: [
          'No hace falta cancelar nada: como no hay débito automático, si no renovás, la cuenta se pausa al terminar el período que ya pagaste. Hasta ese día la seguís usando entera.',
          'Si además querés borrar tus datos, mirá [Cerrar la cuenta](/terminos#cerrar), más abajo.',
        ],
      },
      {
        id: 'invitaciones',
        titulo: 'Invitaciones y comisión',
        bloques: [
          'Cada cuenta tiene un enlace para invitar, en «Invitaciones». Si alguien crea su cuenta con tu enlace y paga, te llevás una comisión:',
          {
            lista: [
              'Es **la mitad del precio de lista de un mes** del plan que activó, según su tipo de cuenta. Se calcula en guaraníes.',
              'Nace con **su primer pago** y es una sola vez por cada cuenta que traés. Lo que pague después no suma.',
              'Aunque pague con descuento o pague el año entero, la base es el precio de lista de un mes. Nunca es más de lo que esa cuenta pagó.',
              'Mientras la otra persona prueba gratis no se genera nada.',
              'No vale traerte a vos mismo ni al negocio donde trabajás.',
              'Lo que ganás se acumula como saldo. Lo retirás desde el mínimo que muestra la pantalla de Invitaciones y te lo transferimos a tu banco o billetera. Para eso te pedimos una vez el titular, la cuenta o alias y la CI o el RUC.',
            ],
          },
          'Si alguna vez cambian estas reglas, lo que ya ganaste se respeta.',
        ],
      },
      {
        id: 'tus-datos',
        titulo: 'Tus datos son tuyos',
        bloques: [
          'Lo que cargás es tuyo. Mientras la cuenta está activa podés verlo todo, bajarlo en Excel y borrarlo desde Ajustes.',
          'Nosotros lo usamos solo para prestarte el servicio. Qué guardamos, dónde está y con quién se comparte para funcionar está en la [política de privacidad](/privacidad).',
        ],
      },
      {
        id: 'no-se-puede',
        titulo: 'Qué no se puede hacer',
        bloques: [
          {
            lista: [
              'Usar Orden para algo ilegal.',
              'Intentar entrar a los datos de otro negocio o romper las protecciones del sistema.',
              'Revender el servicio o hacerlo pasar por propio.',
              'Cargar contenido que no tengas derecho a subir.',
            ],
          },
          'Si pasa algo de esto podemos suspender la cuenta. Salvo que haya un motivo grave, avisamos antes y damos tiempo de bajar los datos.',
        ],
      },
      {
        id: 'no-es',
        titulo: 'Lo que Orden no es',
        bloques: [
          '**Orden no es un contador ni un asesor financiero.** Te muestra tus propios números ordenados. No damos consejos de inversión ni te decimos en qué poner tu plata, y lo que muestra la aplicación no reemplaza a un profesional cuando lo necesitás.',
          '**Tampoco es un sistema de facturación legal.** Los comprobantes que exige tu país los seguís emitiendo por donde corresponda.',
          '**La carga por voz, foto o texto la interpreta una inteligencia artificial, y puede equivocarse.** Mirá lo que quedó cargado: cualquier movimiento se puede corregir o anular.',
          'Las decisiones que tomes mirando estos números son tuyas.',
        ],
      },
      {
        id: 'disponibilidad',
        titulo: 'Disponibilidad',
        bloques: [
          'Hacemos lo posible para que el servicio esté siempre disponible, pero puede haber cortes por mantenimiento o por fallas de los proveedores. No prometemos un porcentaje de disponibilidad.',
          'Orden necesita internet. Si se corta, te avisa en vez de quedarse en blanco, pero sin conexión no se puede cargar.',
          'La carga por voz y foto depende de un servicio externo: si ese servicio se cae, esa función puede dejar de andar un rato. Cargar a mano no depende de él.',
        ],
      },
      {
        id: 'responsabilidad',
        titulo: 'Responsabilidad',
        bloques: [
          'Orden se presta tal como está. Ponemos todo el cuidado en que los números sean correctos —hay controles en la base de datos justamente para eso— pero no respondemos por decisiones comerciales que tomes ni por lucro cesante.',
          'Si algo sale mal por nuestra culpa, nuestra responsabilidad no supera lo que nos hayas pagado en los últimos doce meses.',
          'Esto no limita los derechos que te dé la ley de defensa del consumidor de tu país.',
        ],
      },
      {
        id: 'cerrar',
        titulo: 'Cerrar la cuenta',
        bloques: [
          'Podés borrar tu cuenta cuando quieras desde Ajustes, en «Zona delicada». Es inmediato e irreversible: bajate el Excel antes si querés guardar tu historial.',
          'Si sos dueño de un negocio donde trabaja más gente, primero tenés que sacarlos del equipo. No borramos la contabilidad de personas que siguen trabajando.',
          'Con la cuenta pausada no se llega a Ajustes. En ese caso pedinos el borrado por WhatsApp y lo hacemos por vos.',
        ],
      },
      {
        id: 'cambios',
        titulo: 'Cambios',
        bloques: [
          'Si estos términos cambian, cambia la fecha de arriba y avisamos dentro de la aplicación cuando el cambio sea importante. Seguir usando Orden después de eso significa que los aceptás.',
        ],
      },
      {
        id: 'contacto',
        titulo: 'Contacto',
        bloques: [
          'Escribinos por WhatsApp, al mismo número con el que se coordina el pago. También se abre desde la pantalla de tu plan, que funciona aunque la cuenta esté pausada.',
          { especial: 'contacto' },
        ],
      },
    ],
  },

  // --------------------------------------------------------------------
  privacidad: {
    metaTitulo: 'Privacidad · Orden',
    metaDescripcion: 'Qué datos guarda Orden, dónde están, con quién se comparten para funcionar y cómo se borran.',
    titulo: 'Privacidad',
    actualizado: '24 de septiembre de 2026',
    bajada: 'Escrita sobre lo que Orden hace de verdad, no copiada de una plantilla. Si cambia un proveedor o un dato que pedimos, esta página cambia con él.',
    esencialTitulo: 'Lo esencial',
    esencial: [
      'No vendemos tus datos ni los usamos para publicidad. No hay rastreadores ni píxeles de redes sociales.',
      'Están en **São Paulo, Brasil**: la base de datos en Supabase y la aplicación en Vercel.',
      'Lo que dictás o fotografiás pasa por **OpenAI** para entenderlo. El audio no se guarda.',
      'Ningún otro negocio puede ver tus datos: lo impide la base de datos, no la pantalla.',
      'Podés **borrar tu cuenta y todo lo que cargaste** vos mismo, desde Ajustes.',
    ],
    apartados: [
      {
        id: 'alta',
        titulo: 'Lo que te pedimos al crear la cuenta',
        bloques: [
          {
            lista: [
              '**Tu correo y una contraseña,** para entrar. La contraseña la maneja Supabase y nosotros nunca la vemos.',
              '**Tu teléfono,** que es obligatorio, para poder contactarte por tu cuenta.',
              '**Tu nombre** (si lo ponés), **el nombre de tu negocio o de tu cuenta, tu rubro y tu moneda.**',
              '**A qué te dedicás y cómo nos conociste,** para entender quién usa Orden y en qué mejorarlo.',
              '**Tu zona horaria,** que se toma del navegador, para saber cuándo termina tu día.',
              '**Quién te invitó,** si entraste con el enlace de alguien, para pagarle su comisión.',
            ],
          },
          'Para usar Orden no pedimos tu documento, tu dirección ni datos de tarjetas. El documento solo se pide si querés cobrar comisiones por invitar (más abajo).',
        ],
      },
      {
        id: 'lo-que-cargas',
        titulo: 'Lo que cargás, según lo que hacés',
        bloques: [
          'Es el servicio: lo guardamos para mostrártelo. Depende de tu rubro:',
          {
            lista: [
              '**Comercio:** ventas, gastos, productos con sus costos, precios y stock, fiado y clientes (nombre y teléfono, si los ponés).',
              '**Servicios y oficios:** además, turnos con el nombre y el teléfono del cliente, los profesionales y cómo se reparte lo cobrado. Quien reserva por tu link escribe él mismo su nombre y su teléfono.',
              '**Clases y cursos:** alumnos, sus inscripciones (días, horario y precio), lo que te pagaron y las clases que se dieron.',
              '**Personal trainer:** lo de clases, más rutinas, medidas y notas de «Salud y lesiones». Tienen su propio apartado, [más abajo](/privacidad#trainer).',
              '**Agricultura:** campañas con cultivo y hectáreas, cosechas, liquidaciones del acopio, insumos a cosecha, y los montos en guaraníes o dólares con el cambio que usaste.',
              '**Ganadería:** lotes con lo que costaron y lo que se vendió.',
              '**Cuenta personal:** tu sueldo y otros ingresos, gastos, gastos fijos, presupuesto, ahorros y metas, deudas y lo que te deben.',
              '**En todas:** tus cuentas de plata (banco, efectivo, billetera) con su nombre y su saldo —no pedimos números de cuenta ni claves del banco— y tus deudas.',
            ],
          },
          'Y además:',
          {
            lista: [
              '**Las fotos de comprobantes** que subas. Se guardan en un depósito privado: solo se ven con un enlace temporal que se genera cuando las abrís.',
              '**Lo que dictás por voz,** convertido en texto. El audio no se guarda: se transcribe y se descarta.',
              '**Tus preferencias:** idioma, zona horaria y qué avisos querés. Si activás los avisos, la dirección de tu celular para mandártelos.',
              '**Datos técnicos mínimos** de los envíos y los errores, para saber si algo se rompió.',
            ],
          },
        ],
      },
      {
        id: 'de-otros',
        titulo: 'Datos de otras personas que cargás vos',
        bloques: [
          'Tus clientes, alumnos y profesionales no tienen cuenta en Orden: sus datos los cargás vos, para tu trabajo. Anotá solo lo que necesitás. Si alguien te pide que borres sus datos, corregí su ficha o eliminalo: si no tiene nada atado se borra del todo; si ya tiene cobros, turnos o historia, queda archivado para que tus números cierren, y sus notas se borran.',
          'Orden no los contacta ni los usa para nada más. Cuando tocás un botón de WhatsApp —un recordatorio de turno, un cobro—, el mensaje lo mandás vos desde tu propio WhatsApp: Orden no se conecta a WhatsApp.',
        ],
      },
      {
        id: 'trainer',
        titulo: 'Si sos personal trainer: rutinas y medidas',
        bloques: [
          'Si tu negocio es de entrenamiento, Orden guarda además lo que cargás de tus clientes para entrenarlos. Son datos de ellos que vos guardás acá, y vos decidís qué anotar. Las medidas del cuerpo y las notas de salud son datos de salud, que la ley trata con más cuidado (en Paraguay, la Ley 7593/2025; en Brasil, la LGPD): por eso piden consentimiento y tienen reglas propias.',
          {
            lista: [
              '**Las rutinas:** días, ejercicios, series, repeticiones, cargas, descansos y tus notas, con el historial de cómo fueron subiendo las cargas. También tu lista de ejercicios, con su «cómo se hace» y el link al video si lo pusiste.',
              '**Las medidas del cuerpo:** peso, altura, contornos y porcentaje de grasa, con la fecha de cada control. Para anotarlas hay que confirmar antes que el cliente —o su madre, padre o tutor si es menor— está de acuerdo, y Orden guarda cuándo se confirmó y quién lo hizo.',
              '**«Salud y lesiones»:** lo que escribas en la ficha del cliente, para que quien lo entrena sepa de la rodilla operada antes de empezar.',
            ],
          },
          '**Quién lo ve.** Las medidas las anotan y las ven solo el dueño y los administradores del negocio: alguien del equipo que no es administrador no puede sacarlas ni pidiéndolas a mano, porque la regla está en la base de datos y no en la pantalla. «Salud y lesiones» la ve todo el equipo del negocio, porque cualquiera que entrene a esa persona tiene que saberlo. Fuera de tu negocio, nadie.',
          '**El link del cliente.** Cada cliente tiene un link para ver su rutina sin crear una cuenta. Muestra el nombre del negocio, su nombre de pila y la rutina vigente, y nada más: nunca su apellido, su teléfono, sus medidas, «Salud y lesiones», sus pagos ni sus rutinas anteriores. Los buscadores no lo guardan, y al abrir un video no se le pasa la dirección del link a YouTube ni a Instagram. Lo que el cliente marca como hecho queda solo en su celular: el link no escribe nada en Orden. Podés cambiarlo (el viejo deja de andar) o apagarlo cuando quieras, y con la cuenta pausada podés apagar todos los links de una vez. Si la cuenta lleva más de 30 días vencida, los links dejan de mostrar la rutina.',
          '**La inteligencia artificial.** Las medidas, «Salud y lesiones» y las rutinas que tenés guardadas no se le mandan a OpenAI. Leer una rutina que pegás o escribís en un renglón lo hace Orden solo, sin inteligencia artificial. Lo único que llega a OpenAI es lo que vos dictás o escribís en la carga por voz, foto o texto: si ahí dictás una lesión, esa frase pasa por OpenAI para convertirse en texto.',
          '**Una ficha por persona.** Si cargás a alguien nuevo con el teléfono de un cliente que ya tiene rutinas o medidas y otro nombre, Orden no los junta en una sola ficha: te pregunta si es la misma persona y, si no lo es, la ficha nueva queda sin ese teléfono. Así nadie hereda las lesiones, las medidas ni el consentimiento de otro.',
          '**El Excel.** El Excel de Reportes, que baja solo la administración del negocio, trae una hoja «Progreso»: por cliente, el peso, la cintura y el porcentaje de grasa al principio y al final del período, cuándo se midió por última vez y el nombre de su rutina vigente. «Salud y lesiones» y el detalle de las rutinas no van en el Excel: se ven en la carpeta de cada cliente, dentro de la app.',
          '**Cómo se borra.**',
          {
            lista: [
              'Un control de medidas lo borran el dueño o un administrador desde el progreso del cliente, y se borra de verdad.',
              '«Salud y lesiones» se corrige o se vacía desde la ficha del cliente.',
              'Las rutinas en preparación y las plantillas se borran. La vigente y las anteriores quedan como la historia del cliente.',
              'Si eliminás a un cliente que tiene rutinas o medidas, Orden lo archiva en vez de borrarlo, y en ese mismo paso borra sus medidas, su consentimiento y «Salud y lesiones»; su link deja de andar en ese momento. Sus rutinas y el historial de sus cargas quedan como tu historia de trabajo, y no se ven en ningún link. Si esa persona vuelve, vuelve a dar su consentimiento antes de que le anotes medidas.',
              'Vaciar el negocio desde Ajustes no toca nada de esto. Todo —rutinas, medidas, links e historial— se borra de verdad cuando borrás tu cuenta.',
            ],
          },
        ],
      },
      {
        id: 'socios',
        titulo: 'Si invitás gente a Orden',
        bloques: [
          'Para pagarte la comisión te pedimos una vez: el banco o billetera, a nombre de quién está, la cuenta o alias y la CI o el RUC del titular. Los usamos solo para transferirte. Los ve la administración de Orden, que es la que hace la transferencia, y cada retiro guarda una copia de esos datos como constancia del pago.',
          'Y al revés: si entraste con el enlace de alguien, esa persona ve el nombre de tu negocio, desde cuándo lo tenés, si pagás y qué plan tenés, para seguir su comisión. No ve nada más de tu cuenta.',
        ],
      },
      {
        id: 'quien-ve',
        titulo: 'Quién ve tus datos',
        bloques: [
          '**Vos y las personas que sumás a tu negocio,** cada una con su permiso. Quien no es administrador no ve costos, márgenes ni ganancias: esa información no sale del servidor para esa persona.',
          '**Ningún otro negocio.** Cada negocio está separado dentro de la base de datos, no en la pantalla: aunque alguien manipule su navegador, no puede leer los datos de otro.',
          '**Nosotros,** para atender y cobrar las cuentas, vemos de cada una el nombre del negocio, el correo, el teléfono, el rubro, a qué se dedica, cómo nos conoció, el plan, las fechas, cuántos movimientos tiene, cuántas cargas con inteligencia artificial usó y cuándo entró por última vez. No miramos tus movimientos, tus clientes ni tus números salvo que nos lo pidas para resolver un problema puntual.',
        ],
      },
      {
        id: 'donde',
        titulo: 'Dónde están',
        bloques: [
          'La base de datos y las fotos están en **Supabase**, en su región de **São Paulo, Brasil**, sobre infraestructura de Amazon Web Services. La aplicación corre en **Vercel**, también en São Paulo.',
          'Hasta mediados de septiembre de 2026 la base estaba en Estados Unidos. Esa base vieja se conserva sin uso y sin recibir datos nuevos, como respaldo de la mudanza: tiene lo que se había cargado hasta ese momento.',
        ],
      },
      {
        id: 'compartir',
        titulo: 'Con quién se comparte algo para funcionar',
        bloques: [
          'Solo con lo que hace falta para que la aplicación funcione, y solo lo necesario:',
          {
            lista: [
              '**OpenAI** (Estados Unidos). Cuando cargás hablando, con una foto o escribiendo, se le manda el audio, la foto o el texto para entenderlo. Para que acierte va también lo mínimo de tu cuenta: los nombres y precios de tus productos, tus categorías, los nombres y saldos de tus deudas y de quien te debe, tus gastos fijos, los servicios y profesionales de tu agenda y, en el campo, el nombre, el cultivo y las hectáreas de tus campañas abiertas. Al dictar un turno, también el nombre y el teléfono del cliente que digas. Los costos no se mandan. Según las condiciones de OpenAI para su API, esto no se usa para entrenar sus modelos. Si no usás esa función, no se le manda nada.',
              '**Resend.** Manda los correos: tu dirección y el contenido de cada mensaje (recuperar la contraseña, el resumen de tu semana con tus números, los avisos de la prueba y del plan).',
              '**Supabase y Vercel.** Alojan la base de datos, las fotos y la aplicación.',
              '**El servicio de avisos de tu navegador** (de Apple, Google o Mozilla), si activás los avisos: es el que los entrega en tu celular. Viajan cifrados y ese servicio no puede leerlos.',
            ],
          },
          'Nada más. No hay rastreadores de publicidad, ni píxeles de redes sociales, ni venta de datos a terceros.',
        ],
      },
      {
        id: 'cookies',
        titulo: 'Cookies y lo que queda en tu celular',
        bloques: [
          'Usamos solo lo necesario para que Orden funcione: tu sesión (para no pedirte la contraseña cada vez), qué negocio tenés abierto y el idioma. El tema claro u oscuro y algunos borradores se guardan en tu propio navegador. No hay cookies de publicidad ni de medición.',
        ],
      },
      {
        id: 'cuanto-tiempo',
        titulo: 'Por cuánto tiempo',
        bloques: [
          'Mientras tengas la cuenta. Tu historial no se borra solo: justamente sirve para poder mirar hacia atrás. Tampoco se borra si la cuenta se pausa por falta de pago.',
          'Cuando borrás tu cuenta, se borra de verdad. No queda una copia «marcada como borrada»: las filas desaparecen de la base y las fotos se eliminan del depósito. Lo único que puede sobrevivir un tiempo son las copias de seguridad automáticas, que se rotan solas.',
        ],
      },
      {
        id: 'equipo',
        titulo: 'Si trabajás en el negocio de otro',
        bloques: [
          'Si te sumaste al negocio de otra persona con un código de invitación, lo que cargues ahí es del negocio, no tuyo. Si borrás tu cuenta, salís del equipo y esas ventas y gastos se quedan: son la contabilidad de ese negocio.',
          'Y al revés: si sos dueño de un negocio donde hay más gente trabajando, no vas a poder borrar tu cuenta sin sacarlos antes. No queremos dejar sin sistema —ni sin sus números— a personas que están trabajando.',
        ],
      },
      {
        id: 'derechos',
        titulo: 'Tus derechos',
        bloques: [
          {
            lista: [
              '**Verlo todo.** Está en la app, y la administración del negocio lo puede bajar en Excel desde Reportes.',
              '**Corregirlo.** Podés editar o anular cualquier movimiento, y corregir la ficha de un cliente o eliminarlo.',
              '**Empezar de cero.** Desde Ajustes, el dueño puede vaciar el negocio sin borrar la cuenta.',
              '**Irte.** Desde Ajustes podés borrar tu cuenta y todo lo que tengas cargado, vos mismo y en el momento. Si la cuenta está pausada, pedínoslo por WhatsApp y lo hacemos por vos.',
            ],
          },
        ],
      },
      {
        id: 'seguridad',
        titulo: 'Seguridad, sin exagerar',
        bloques: [
          'Las reglas de acceso están aplicadas en la base de datos y no en los botones de la pantalla, que es lo que hace que sigan valiendo aunque alguien intente saltárselas. Las contraseñas las maneja Supabase y nunca las vemos.',
          'Dicho eso: ningún sistema es infalible. Si alguna vez pasara algo que afecte tus datos, te lo vamos a decir.',
        ],
      },
      {
        id: 'menores',
        titulo: 'Menores',
        bloques: [
          'Orden es una herramienta de trabajo y no está pensada para que la usen menores de edad.',
          'Si das clases o entrenás a menores, sus datos los cargás vos. Las medidas de un menor se anotan con el acuerdo de su madre, padre o tutor, que Orden te pide confirmar antes de la primera, y se borran como las de cualquier cliente: desde su progreso, o al eliminarlo.',
        ],
      },
      {
        id: 'contacto',
        titulo: 'Cambios y contacto',
        bloques: [
          'Si esto cambia, cambia la fecha de arriba. Si el cambio es importante, te avisamos dentro de la aplicación.',
          'Para cualquier duda sobre tus datos, escribinos por WhatsApp, al mismo número con el que se coordina el pago.',
          { especial: 'contacto' },
        ],
      },
    ],
  },
};

// ======================================================================
// PORTUGUÊS (Brasil)
// ======================================================================

export const legalPt: TextosLegal = {
  indice: 'Nesta página',
  tabla: {
    rubro: 'Ramo',
    planes: 'Planos',
    prueba: 'O teste',
    nombresPlanes: { basico: 'Básico', pro: 'Pro', negocio: 'Premium' },
    cuentaPersonal: 'Conta pessoal',
    planPersonal: 'Pessoal (plano único)',
    nombrePlanPersonal: 'Pessoal',
    pruebaDe: (plan, dias) => `${plan}, ${dias} dias`,
  },
  contacto: {
    whatsapp: 'Fale com a gente no WhatsApp',
    mensaje: 'Olá, tenho uma dúvida sobre o Orden.',
  },

  // --------------------------------------------------------------------
  terminos: {
    metaTitulo: 'Termos · Orden',
    metaDescripcion: 'As condições de uso do Orden: o teste, os planos de cada ramo, como se paga, o que acontece se você não pagar e como funcionam os convites.',
    titulo: 'Termos de serviço',
    actualizado: '24 de setembro de 2026',
    bajada: 'Escritos pra serem entendidos numa leitura só. Tudo o que esta página diz é o que o Orden faz hoje, não o que vai fazer algum dia.',
    esencialTitulo: 'O essencial',
    esencial: [
      `**${E} dias grátis** se for um negócio e **${P}** se for uma conta pessoal. Sem cartão.`,
      'Cada ramo tem seus planos, com preço em guaranis.',
      'Hoje o pagamento é **por transferência**, combinado pelo WhatsApp. Não tem débito automático.',
      'Se você não pagar, **a conta fica pausada** e não pode ser usada até ativar o plano. **Seus dados não são apagados.**',
      'Se você trouxer alguém que paga, fica com **a metade do preço de tabela de um mês** do plano dessa pessoa.',
    ],
    apartados: [
      {
        id: 'que-es',
        titulo: 'O que é o Orden',
        bloques: [
          'O Orden é um aplicativo pra controlar o dinheiro do que você faz: um comércio, um serviço com horários, aulas, treino personalizado, a lavoura, a pecuária ou as suas finanças pessoais. Você registra vendas, recebimentos e despesas falando, com uma foto ou escrevendo, e o Orden mostra quanto sobrou.',
          'Foi pensado pra quem trabalha por conta própria e pra negócios pequenos. Ao criar uma conta você aceita o que diz esta página e a [política de privacidade](/privacidad).',
        ],
      },
      {
        id: 'cuenta',
        titulo: 'Sua conta',
        bloques: [
          {
            lista: [
              'Você precisa informar um e-mail real e uma senha, e cuidar dessa senha.',
              'O que for feito pela sua conta é considerado feito por você.',
              'Se você adicionar pessoas ao seu negócio com o código de convite, é responsável por quem recebe o código e pela permissão que dá. Pode tirá-las e trocar o código quando quiser.',
              'Se você registrar dados de outras pessoas —clientes, alunos, profissionais—, precisa ter o direito de fazer isso. Como o Orden cuida deles está na [política de privacidade](/privacidad).',
            ],
          },
        ],
      },
      {
        id: 'prueba',
        titulo: 'O teste grátis',
        bloques: [
          `Toda conta nova começa em teste, **sem pedir cartão**: **${E} dias** se for um negócio e **${P} dias** se for uma conta pessoal.`,
          'Você testa o plano mais completo que é vendido pro seu ramo: o Pro, se o seu ramo tem; se não, o que ele tem. Assim o que você testa é algo que depois pode contratar.',
          'Se você mudar de ramo durante o teste, o teste passa pro plano do ramo novo. Os dias que faltam não mudam.',
        ],
      },
      {
        id: 'planes',
        titulo: 'Os planos de cada ramo',
        bloques: [
          'Cada ramo tem os planos que servem pra ele. Os que somam mais pessoas não são oferecidos a quem trabalha sozinho:',
          { especial: 'planesPorRubro' },
          'Os planos mudam quantas pessoas podem usar a conta e quantos registros com inteligência artificial cabem por mês. Isso e os preços estão na página inicial e na tela do seu plano.',
          'Os preços são cobrados em **guaranis**. Do lado pode aparecer um «≈ US$» pequeno: é só uma referência, não se cobra em dólares.',
          'Os descontos —por registrar todos os dias durante o teste e por constância— são explicados na tela do seu plano, com as condições, e se aplicam na hora de pagar.',
          'Se os preços subirem, avisamos antes de valerem pra sua conta. Se você já pagou um plano e muda de ramo, o que pagou é respeitado até o fim desse período.',
        ],
      },
      {
        id: 'pagos',
        titulo: 'Como se paga',
        bloques: [
          'Hoje o pagamento é **por transferência**. Na tela do seu plano você toca em «Assinar», abre um WhatsApp com a gente, faz a transferência e ativamos o plano. O pagamento é adiantado, por mês ou por ano.',
          'Hoje nenhum cartão é pedido nem guardado, e **não tem débito automático**: nada é cobrado sozinho.',
          'Se mais adiante entrar o pagamento com cartão, esta página é atualizada antes de ele começar a funcionar.',
        ],
      },
      {
        id: 'si-no-pagas',
        titulo: 'O que acontece se você não pagar',
        bloques: [
          'Quando termina o teste, ou o período que você pagou, e não entra um pagamento novo, **a conta fica pausada**. Enquanto está pausada não dá pra ver nem usar nenhuma tela —nem o painel, nem o histórico, nem o Excel— a não ser a do seu plano, que é onde se ativa. Vale pra todas as pessoas da conta.',
          '**Seus dados não são apagados.** Ficam guardados do jeito que estão e, assim que o plano é ativado, você encontra tudo como deixou.',
          'Antes do vencimento avisamos três dias antes, um dia antes e no próprio dia: por e-mail, e no celular se você ativou os avisos. Se quiser ter uma cópia dos seus números, baixe o Excel em Relatórios antes dessa data.',
          'Se você é personal trainer, os links de treino dos seus clientes continuam funcionando até 30 dias depois do vencimento, e você pode desligar todos de uma vez na própria tela da conta pausada.',
          'Não apagamos uma conta por estar pausada. Se um dia isso mudar, vamos avisar por e-mail, com tempo, antes de fazer.',
        ],
      },
      {
        id: 'dejar',
        titulo: 'Parar de usar o Orden',
        bloques: [
          'Não precisa cancelar nada: como não tem débito automático, se você não renovar, a conta fica pausada ao terminar o período que já pagou. Até esse dia você continua usando tudo.',
          'Se além disso quiser apagar seus dados, veja [Encerrar a conta](/terminos#cerrar), mais abaixo.',
        ],
      },
      {
        id: 'invitaciones',
        titulo: 'Convites e comissão',
        bloques: [
          'Cada conta tem um link pra convidar, em «Convites». Se alguém cria a conta com o seu link e paga, você recebe uma comissão:',
          {
            lista: [
              'É **a metade do preço de tabela de um mês** do plano que a pessoa ativou, conforme o tipo de conta. É calculada em guaranis.',
              'Nasce com **o primeiro pagamento** e é uma vez só por cada conta que você traz. O que ela pagar depois não soma.',
              'Mesmo que pague com desconto ou pague o ano inteiro, a base é o preço de tabela de um mês. Nunca é mais do que essa conta pagou.',
              'Enquanto a outra pessoa testa grátis, não gera nada.',
              'Não vale trazer você mesmo nem o negócio onde você trabalha.',
              'O que você ganha vira saldo. Você saca a partir do mínimo que aparece na tela de Convites e transferimos pro seu banco ou carteira. Pra isso pedimos uma vez o titular, a conta ou o alias e a CI ou o RUC.',
            ],
          },
          'Se um dia essas regras mudarem, o que você já ganhou é respeitado.',
        ],
      },
      {
        id: 'tus-datos',
        titulo: 'Seus dados são seus',
        bloques: [
          'O que você registra é seu. Enquanto a conta está ativa, você pode ver tudo, baixar em Excel e apagar em Configurações.',
          'A gente usa só pra prestar o serviço. O que guardamos, onde fica e com quem se compartilha pra funcionar está na [política de privacidade](/privacidad).',
        ],
      },
      {
        id: 'no-se-puede',
        titulo: 'O que não pode',
        bloques: [
          {
            lista: [
              'Usar o Orden pra algo ilegal.',
              'Tentar entrar nos dados de outro negócio ou quebrar as proteções do sistema.',
              'Revender o serviço ou fazer ele passar por seu.',
              'Subir conteúdo que você não tem direito de subir.',
            ],
          },
          'Se algo disso acontecer, podemos suspender a conta. A não ser que haja um motivo grave, avisamos antes e damos tempo de baixar os dados.',
        ],
      },
      {
        id: 'no-es',
        titulo: 'O que o Orden não é',
        bloques: [
          '**O Orden não é um contador nem um consultor financeiro.** Ele mostra os seus próprios números organizados. Não damos conselhos de investimento nem dizemos onde colocar o seu dinheiro, e o que o aplicativo mostra não substitui um profissional quando você precisa.',
          '**Também não é um sistema de faturamento legal.** Os comprovantes fiscais que o seu país exige continuam sendo emitidos por onde for o caso.',
          '**O registro por voz, foto ou texto é interpretado por uma inteligência artificial, e ela pode errar.** Confira o que ficou registrado: qualquer movimento pode ser corrigido ou anulado.',
          'As decisões que você tomar olhando esses números são suas.',
        ],
      },
      {
        id: 'disponibilidad',
        titulo: 'Disponibilidade',
        bloques: [
          'Fazemos o possível pra que o serviço esteja sempre no ar, mas pode haver quedas por manutenção ou por falhas dos fornecedores. Não prometemos uma porcentagem de disponibilidade.',
          'O Orden precisa de internet. Se ela cair, ele avisa em vez de ficar em branco, mas sem conexão não dá pra registrar.',
          'O registro por voz e foto depende de um serviço externo: se esse serviço cair, essa função pode parar por um tempo. Registrar à mão não depende dele.',
        ],
      },
      {
        id: 'responsabilidad',
        titulo: 'Responsabilidade',
        bloques: [
          'O Orden é oferecido do jeito que está. Colocamos todo o cuidado pra que os números estejam certos —há controles no banco de dados justamente pra isso—, mas não respondemos por decisões comerciais que você tomar nem por lucros cessantes.',
          'Se algo der errado por culpa nossa, a nossa responsabilidade não passa do que você nos pagou nos últimos doze meses.',
          'Isso não limita os direitos que a lei de defesa do consumidor do seu país te dá.',
        ],
      },
      {
        id: 'cerrar',
        titulo: 'Encerrar a conta',
        bloques: [
          'Você pode apagar sua conta quando quiser em Configurações, na «Zona delicada». É imediato e irreversível: baixe o Excel antes se quiser guardar o seu histórico.',
          'Se você é dono de um negócio onde trabalham outras pessoas, primeiro precisa tirá-las da equipe. Não apagamos a contabilidade de pessoas que continuam trabalhando.',
          'Com a conta pausada não dá pra chegar em Configurações. Nesse caso, peça o apagamento pelo WhatsApp e a gente faz por você.',
        ],
      },
      {
        id: 'cambios',
        titulo: 'Mudanças',
        bloques: [
          'Se estes termos mudarem, muda a data lá em cima e avisamos dentro do aplicativo quando a mudança for importante. Continuar usando o Orden depois disso significa que você aceita.',
        ],
      },
      {
        id: 'contacto',
        titulo: 'Contato',
        bloques: [
          'Fale com a gente pelo WhatsApp, no mesmo número em que se combina o pagamento. Ele também abre na tela do seu plano, que funciona mesmo com a conta pausada.',
          { especial: 'contacto' },
        ],
      },
    ],
  },

  // --------------------------------------------------------------------
  privacidad: {
    metaTitulo: 'Privacidade · Orden',
    metaDescripcion: 'Que dados o Orden guarda, onde ficam, com quem são compartilhados pra funcionar e como se apagam.',
    titulo: 'Privacidade',
    actualizado: '24 de setembro de 2026',
    bajada: 'Escrita sobre o que o Orden faz de verdade, não copiada de um modelo. Se mudar um fornecedor ou um dado que pedimos, esta página muda junto.',
    esencialTitulo: 'O essencial',
    esencial: [
      'Não vendemos seus dados nem usamos pra publicidade. Não tem rastreadores nem pixels de redes sociais.',
      'Ficam em **São Paulo, Brasil**: o banco de dados no Supabase e o aplicativo na Vercel.',
      'O que você dita ou fotografa passa pela **OpenAI** pra ser entendido. O áudio não é guardado.',
      'Nenhum outro negócio pode ver seus dados: quem impede é o banco de dados, não a tela.',
      'Você mesmo pode **apagar sua conta e tudo o que registrou**, em Configurações.',
    ],
    apartados: [
      {
        id: 'alta',
        titulo: 'O que pedimos ao criar a conta',
        bloques: [
          {
            lista: [
              '**Seu e-mail e uma senha,** pra entrar. A senha é gerenciada pelo Supabase e a gente nunca vê.',
              '**Seu telefone,** que é obrigatório, pra poder falar com você sobre a sua conta.',
              '**Seu nome** (se você colocar), **o nome do seu negócio ou da sua conta, o seu ramo e a sua moeda.**',
              '**O que você faz e como conheceu a gente,** pra entender quem usa o Orden e no que melhorar.',
              '**Seu fuso horário,** que vem do navegador, pra saber quando termina o seu dia.',
              '**Quem te convidou,** se você entrou pelo link de alguém, pra pagar a comissão dessa pessoa.',
            ],
          },
          'Pra usar o Orden não pedimos seu documento, seu endereço nem dados de cartão. O documento só é pedido se você quiser receber comissões por convidar (mais abaixo).',
        ],
      },
      {
        id: 'lo-que-cargas',
        titulo: 'O que você registra, conforme o que você faz',
        bloques: [
          'É o serviço: guardamos pra mostrar pra você. Depende do seu ramo:',
          {
            lista: [
              '**Comércio:** vendas, despesas, produtos com custos, preços e estoque, fiado e clientes (nome e telefone, se você colocar).',
              '**Serviços e ofícios:** além disso, horários com o nome e o telefone do cliente, os profissionais e como se divide o que foi recebido. Quem agenda pelo seu link escreve o próprio nome e telefone.',
              '**Aulas e cursos:** alunos, as matrículas (dias, horário e preço), o que te pagaram e as aulas dadas.',
              '**Personal trainer:** o mesmo das aulas, mais treinos, medidas e notas de «Saúde e lesões». Têm uma seção própria, [mais abaixo](/privacidad#trainer).',
              '**Agricultura:** safras com cultura e hectares, colheitas, liquidações do armazém, insumos pra pagar na colheita, e os valores em guaranis ou dólares com o câmbio que você usou.',
              '**Pecuária:** lotes com o que custaram e o que foi vendido.',
              '**Conta pessoal:** seu salário e outras entradas, despesas, despesas fixas, orçamento, economias e metas, dívidas e o que te devem.',
              '**Em todas:** suas contas de dinheiro (banco, dinheiro vivo, carteira) com nome e saldo —não pedimos número de conta nem senhas do banco— e suas dívidas.',
            ],
          },
          'E também:',
          {
            lista: [
              '**As fotos de comprovantes** que você subir. Ficam num depósito privado: só abrem com um link temporário que é gerado quando você abre a foto.',
              '**O que você dita por voz,** convertido em texto. O áudio não é guardado: é transcrito e descartado.',
              '**Suas preferências:** idioma, fuso horário e quais avisos você quer. Se você ativar os avisos, o endereço do seu celular pra enviá-los.',
              '**Dados técnicos mínimos** dos envios e dos erros, pra saber se algo quebrou.',
            ],
          },
        ],
      },
      {
        id: 'de-otros',
        titulo: 'Dados de outras pessoas que você registra',
        bloques: [
          'Seus clientes, alunos e profissionais não têm conta no Orden: os dados deles quem registra é você, pro seu trabalho. Anote só o que precisa. Se alguém pedir pra você apagar os dados dele, corrija a ficha ou exclua a pessoa: se não tem nada ligado a ela, é apagada de vez; se já tem pagamentos, horários ou histórico, fica arquivada pra que os seus números fechem, e as anotações dela são apagadas.',
          'O Orden não entra em contato com eles nem usa esses dados pra mais nada. Quando você toca num botão de WhatsApp —um lembrete de horário, uma cobrança—, a mensagem sai do seu próprio WhatsApp: o Orden não se conecta ao WhatsApp.',
        ],
      },
      {
        id: 'trainer',
        titulo: 'Se você é personal trainer: treinos e medidas',
        bloques: [
          'Se o seu negócio é de treino, o Orden guarda também o que você registra dos seus clientes pra treiná-los. São dados deles que você guarda aqui, e você decide o que anotar. As medidas do corpo e as notas de saúde são dados de saúde, que a lei trata com mais cuidado (no Paraguai, a Lei 7593/2025; no Brasil, a LGPD): por isso pedem consentimento e têm regras próprias.',
          {
            lista: [
              '**Os treinos:** dias, exercícios, séries, repetições, cargas, descansos e suas notas, com o histórico de como as cargas foram subindo. Também a sua lista de exercícios, com o «como se faz» e o link do vídeo, se você colocou.',
              '**As medidas do corpo:** peso, altura, circunferências e percentual de gordura, com a data de cada avaliação. Pra anotar é preciso confirmar antes que o cliente —ou a mãe, o pai ou o responsável, se for menor— está de acordo, e o Orden guarda quando isso foi confirmado e por quem.',
              '**«Saúde e lesões»:** o que você escrever na ficha do cliente, pra quem treina a pessoa saber do joelho operado antes de começar.',
            ],
          },
          '**Quem vê.** As medidas só são anotadas e vistas pelo dono e pelos administradores do negócio: alguém da equipe que não é administrador não consegue tirá-las nem pedindo à mão, porque a regra está no banco de dados e não na tela. «Saúde e lesões» é visto por toda a equipe do negócio, porque qualquer um que treine a pessoa precisa saber. Fora do seu negócio, ninguém.',
          '**O link do cliente.** Cada cliente tem um link pra ver o treino sem criar conta. Mostra o nome do negócio, o primeiro nome dele e o treino vigente, e nada mais: nunca o sobrenome, o telefone, as medidas, «Saúde e lesões», os pagamentos nem os treinos anteriores. Os buscadores não guardam o link, e ao abrir um vídeo o endereço do link não é passado pro YouTube nem pro Instagram. O que o cliente marca como feito fica só no celular dele: o link não escreve nada no Orden. Você pode trocar o link (o antigo para de funcionar) ou desligar quando quiser, e com a conta pausada pode desligar todos os links de uma vez. Se a conta estiver vencida há mais de 30 dias, os links param de mostrar o treino.',
          '**A inteligência artificial.** As medidas, «Saúde e lesões» e os treinos que você tem guardados não são enviados pra OpenAI. Ler um treino que você cola ou escreve numa linha é feito pelo próprio Orden, sem inteligência artificial. O único que chega na OpenAI é o que você dita ou escreve no registro por voz, foto ou texto: se ali você ditar uma lesão, essa frase passa pela OpenAI pra virar texto.',
          '**Uma ficha por pessoa.** Se você cadastrar alguém novo com o telefone de um cliente que já tem treinos ou medidas e outro nome, o Orden não junta os dois numa ficha só: pergunta se é a mesma pessoa e, se não for, a ficha nova fica sem esse telefone. Assim ninguém herda as lesões, as medidas nem o consentimento de outro.',
          '**O Excel.** O Excel de Relatórios, que só a administração do negócio baixa, traz uma aba «Progresso»: por cliente, o peso, a cintura e o percentual de gordura no começo e no fim do período, quando foi a última avaliação e o nome do treino vigente. «Saúde e lesões» e o detalhe dos treinos não vão no Excel: aparecem na pasta de cada cliente, dentro do app.',
          '**Como se apaga.**',
          {
            lista: [
              'Uma avaliação de medidas é apagada pelo dono ou por um administrador no progresso do cliente, e é apagada de verdade.',
              '«Saúde e lesões» se corrige ou se esvazia na ficha do cliente.',
              'Os treinos em preparação e os modelos se apagam. O vigente e os anteriores ficam como a história do cliente.',
              'Se você excluir um cliente que tem treinos ou medidas, o Orden arquiva em vez de apagar e, no mesmo passo, apaga as medidas, o consentimento e «Saúde e lesões»; o link dele para de funcionar na hora. Os treinos e o histórico de cargas ficam como a sua história de trabalho, e não aparecem em nenhum link. Se essa pessoa voltar, ela dá o consentimento de novo antes de você anotar medidas.',
              'Esvaziar o negócio em Configurações não mexe em nada disso. Tudo —treinos, medidas, links e histórico— é apagado de verdade quando você apaga a sua conta.',
            ],
          },
        ],
      },
      {
        id: 'socios',
        titulo: 'Se você convida pessoas pro Orden',
        bloques: [
          'Pra pagar a sua comissão pedimos uma vez: o banco ou carteira, em nome de quem está, a conta ou o alias e a CI ou o RUC do titular. Usamos só pra transferir pra você. Quem vê é a administração do Orden, que faz a transferência, e cada saque guarda uma cópia desses dados como comprovante do pagamento.',
          'E o contrário: se você entrou pelo link de alguém, essa pessoa vê o nome do seu negócio, desde quando você tem a conta, se você paga e qual plano tem, pra acompanhar a comissão dela. Não vê mais nada da sua conta.',
        ],
      },
      {
        id: 'quien-ve',
        titulo: 'Quem vê seus dados',
        bloques: [
          '**Você e as pessoas que você adiciona ao seu negócio,** cada uma com a sua permissão. Quem não é administrador não vê custos, margens nem lucros: essa informação não sai do servidor pra essa pessoa.',
          '**Nenhum outro negócio.** Cada negócio fica separado dentro do banco de dados, não na tela: mesmo que alguém mexa no navegador, não consegue ler os dados de outro.',
          '**A gente,** pra atender e cobrar as contas, vê de cada uma o nome do negócio, o e-mail, o telefone, o ramo, o que faz, como nos conheceu, o plano, as datas, quantos movimentos tem, quantos registros com inteligência artificial usou e quando entrou pela última vez. Não olhamos seus movimentos, seus clientes nem seus números, a não ser que você peça pra resolver um problema específico.',
        ],
      },
      {
        id: 'donde',
        titulo: 'Onde ficam',
        bloques: [
          'O banco de dados e as fotos ficam no **Supabase**, na região de **São Paulo, Brasil**, sobre infraestrutura da Amazon Web Services. O aplicativo roda na **Vercel**, também em São Paulo.',
          'Até meados de setembro de 2026 o banco ficava nos Estados Unidos. Esse banco antigo é guardado sem uso e sem receber dados novos, como backup da mudança: tem o que tinha sido registrado até aquele momento.',
        ],
      },
      {
        id: 'compartir',
        titulo: 'Com quem algo é compartilhado pra funcionar',
        bloques: [
          'Só com o que é preciso pro aplicativo funcionar, e só o necessário:',
          {
            lista: [
              '**OpenAI** (Estados Unidos). Quando você registra falando, com uma foto ou escrevendo, o áudio, a foto ou o texto é enviado pra ser entendido. Pra acertar vai também o mínimo da sua conta: os nomes e preços dos seus produtos, suas categorias, os nomes e saldos das suas dívidas e de quem te deve, suas despesas fixas, os serviços e profissionais da sua agenda e, na lavoura, o nome, a cultura e os hectares das safras abertas. Ao ditar um horário, também o nome e o telefone do cliente que você disser. Os custos não são enviados. Pelas condições da OpenAI para a API dela, isso não é usado pra treinar os modelos. Se você não usa essa função, nada é enviado.',
              '**Resend.** Envia os e-mails: seu endereço e o conteúdo de cada mensagem (recuperar a senha, o resumo da sua semana com os seus números, os avisos do teste e do plano).',
              '**Supabase e Vercel.** Hospedam o banco de dados, as fotos e o aplicativo.',
              '**O serviço de notificações do seu navegador** (da Apple, do Google ou da Mozilla), se você ativar os avisos: é ele que entrega no seu celular. Os avisos viajam criptografados e esse serviço não consegue lê-los.',
            ],
          },
          'Nada mais. Não tem rastreadores de publicidade, nem pixels de redes sociais, nem venda de dados pra terceiros.',
        ],
      },
      {
        id: 'cookies',
        titulo: 'Cookies e o que fica no seu celular',
        bloques: [
          'Usamos só o necessário pro Orden funcionar: a sua sessão (pra não pedir a senha toda vez), qual negócio você está usando e o idioma. O tema claro ou escuro e alguns rascunhos ficam guardados no seu próprio navegador. Não tem cookies de publicidade nem de medição.',
        ],
      },
      {
        id: 'cuanto-tiempo',
        titulo: 'Por quanto tempo',
        bloques: [
          'Enquanto você tiver a conta. O seu histórico não se apaga sozinho: ele serve justamente pra olhar pra trás. Também não se apaga se a conta ficar pausada por falta de pagamento.',
          'Quando você apaga a sua conta, ela é apagada de verdade. Não fica uma cópia «marcada como apagada»: as linhas somem do banco e as fotos são eliminadas do depósito. O único que pode sobreviver um tempo são os backups automáticos, que vão sendo substituídos sozinhos.',
        ],
      },
      {
        id: 'equipo',
        titulo: 'Se você trabalha no negócio de outra pessoa',
        bloques: [
          'Se você entrou no negócio de outra pessoa com um código de convite, o que você registra ali é do negócio, não seu. Se apagar a sua conta, você sai da equipe e essas vendas e despesas ficam: são a contabilidade daquele negócio.',
          'E o contrário: se você é dono de um negócio onde trabalham outras pessoas, não vai conseguir apagar a sua conta sem tirá-las antes. Não queremos deixar sem sistema —nem sem os números— pessoas que estão trabalhando.',
        ],
      },
      {
        id: 'derechos',
        titulo: 'Seus direitos',
        bloques: [
          {
            lista: [
              '**Ver tudo.** Está no app, e a administração do negócio pode baixar em Excel em Relatórios.',
              '**Corrigir.** Você pode editar ou anular qualquer movimento, e corrigir a ficha de um cliente ou excluí-lo.',
              '**Começar do zero.** Em Configurações, o dono pode esvaziar o negócio sem apagar a conta.',
              '**Ir embora.** Em Configurações você mesmo pode apagar a sua conta e tudo o que registrou, na hora. Se a conta estiver pausada, peça pelo WhatsApp e a gente faz por você.',
            ],
          },
        ],
      },
      {
        id: 'seguridad',
        titulo: 'Segurança, sem exagero',
        bloques: [
          'As regras de acesso ficam no banco de dados e não nos botões da tela, e é isso que faz com que continuem valendo mesmo se alguém tentar pular por cima. As senhas são gerenciadas pelo Supabase e a gente nunca vê.',
          'Dito isso: nenhum sistema é infalível. Se um dia acontecer algo que afete seus dados, vamos te contar.',
        ],
      },
      {
        id: 'menores',
        titulo: 'Menores de idade',
        bloques: [
          'O Orden é uma ferramenta de trabalho e não foi pensado pra ser usado por menores de idade.',
          'Se você dá aulas ou treina menores, os dados deles quem registra é você. As medidas de um menor são anotadas com o acordo da mãe, do pai ou do responsável, que o Orden pede pra você confirmar antes da primeira, e se apagam como as de qualquer cliente: no progresso dele ou ao excluí-lo.',
        ],
      },
      {
        id: 'contacto',
        titulo: 'Mudanças e contato',
        bloques: [
          'Se isto mudar, muda a data lá em cima. Se a mudança for importante, avisamos dentro do aplicativo.',
          'Pra qualquer dúvida sobre seus dados, fale com a gente pelo WhatsApp, no mesmo número em que se combina o pagamento.',
          { especial: 'contacto' },
        ],
      },
    ],
  },
};

export function legalDe(idioma: string): TextosLegal {
  return idioma === 'pt' ? legalPt : legalEs;
}

/** Un pedazo de texto ya separado: negrita, enlace interno o texto común. */
export interface ParteDeTexto {
  texto: string;
  negrita?: boolean;
  enlace?: string;
}

/**
 * Separa las marcas `**negrita**` y `[texto](/ruta)`. Pura, sin React: la
 * página solo decide cómo se pinta cada parte. Un enlace que no empiece con
 * «/» se deja como texto: acá solo hay enlaces internos, y así ningún texto
 * puede colar una dirección de afuera.
 */
export function partesDeTexto(texto: string): ParteDeTexto[] {
  const partes: ParteDeTexto[] = [];
  const marca = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let desde = 0;
  let m: RegExpExecArray | null;
  while ((m = marca.exec(texto)) !== null) {
    if (m.index > desde) partes.push({ texto: texto.slice(desde, m.index) });
    if (m[1] !== undefined) partes.push({ texto: m[1], negrita: true });
    else if (m[3].startsWith('/')) partes.push({ texto: m[2], enlace: m[3] });
    else partes.push({ texto: m[2] });
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) partes.push({ texto: texto.slice(desde) });
  return partes;
}
