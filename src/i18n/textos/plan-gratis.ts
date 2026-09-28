/**
 * TEXTOS DEL PLAN GRATIS DE LA CUENTA PERSONAL (110, 28/09/2026).
 *
 * Matías decidió que la cuenta personal, al terminar la prueba de 5 días, no
 * quede con el candado total: pasa al plan Gratis. Anota gastos e ingresos a
 * mano, ve su historial e invita. La voz, la foto, «escribir», los
 * comprobantes, el presupuesto, las deudas, «Me deben», la billetera, los
 * reportes y el Excel son del Pro. Los negocios no cambian: al vencer siguen
 * con el candado del 15/09 y sus textos de siempre.
 *
 * Va en su propio archivo por lo mismo que las campañas: es una pieza que
 * atraviesa varias pantallas (el candado de cada sección, el micrófono, el
 * panel, /plan, la franja, el registro, dos rutas y un push), y así se lee y
 * se revisa entera. El diccionario lo incluye como `t.planGratis` (ver es.ts
 * y pt.ts). El portugués se escribe con el tipo del español: si falta una
 * clave, no compila.
 *
 * NADA QUE EL PLAN GRATIS NO TENGA. Ningún texto de acá promete la voz, el
 * presupuesto ni el Excel a quien está en Gratis; lo del Pro se nombra como
 * del Pro. Tampoco se dice «para siempre»: Gratis no vence, pero no se
 * promete lo que no está escrito en ningún lado. Y como nada se borra (15/09),
 * lo cargado en las secciones del Pro «queda guardado» y «vuelve» al pagar.
 *
 * Los mensajes que rechaza la base («Eso es del plan Pro…») NO van acá:
 * viven en la 110 y su portugués en `src/lib/mensajes-base.ts`.
 */
export const planGratisEs = {
  /** La tarjeta que tapa una sección del Pro (CandadoSeccion). */
  seccion: {
    titulo: 'Esto es del plan Pro',
    // Una por sección cerrada, con la clave de su ruta sin la barra.
    detalle: {
      deudas: 'Lo que debés, cada cuota y cuándo vence.',
      fiado: 'Quién te debe plata, cuánto, y el mensaje para cobrarle.',
      billetera: 'Cuánto tenés en cada banco y en efectivo.',
      organizacion: 'Cuánto podés gastar por día hasta tu próximo cobro, tus gastos fijos y tus ahorros.',
      reportes: 'Tus números del mes explicados, y el Excel para bajar.',
    },
    guardado: 'Lo que cargaste acá sigue guardado: vuelve cuando actives Pro.',
    verPlan: 'Ver el plan Pro',
    anotarGasto: 'Anotar un gasto',
  },

  /** El título chico que agrupa, abajo del menú, las secciones con candado. */
  nav: {
    conPro: 'Con Pro',
  },

  /**
   * El micrófono en Gratis: no promete la IA. Lleva a anotar a mano y dice
   * en una línea que lo otro es del Pro.
   */
  captura: {
    botonAria: 'Anotar un gasto o un ingreso',
    encabezado: 'Anotá a mano un gasto o un ingreso.',
    anotarAMano: 'Anotar a mano',
    anotarAManoDetalle: 'Un gasto o un ingreso, en Gastos',
    soloPro: 'Cargar con voz, foto o texto es del plan Pro.',
    verPlan: 'Ver el plan Pro',
  },

  /** El panel propio de Gratis: el mes, lo último y una invitación al Pro. */
  panel: {
    esteMes: 'Este mes',
    // Con gastos y ningún ingreso no se pinta un «Te quedó» en rojo: quien
    // cobra a fin de mes lo vería en rojo todo el mes.
    sinIngresos: 'Todavía no anotaste ingresos este mes',
    cobroACobro: '¿Cobrás a fin de mes? Con Pro, tus números van de cobro a cobro.',
    ultimas: 'Lo último que anotaste',
    verTodo: 'Ver todo',
    sinCargas: 'Todavía no anotaste nada.',
    sinCargasDetalle: 'Anotá tu primer gasto o ingreso: queda en tu historial.',
    pasateTitulo: 'Pasate al plan Pro',
    pasateDetalle: 'Cargá hablando o con una foto, sabé cuánto podés gastar por día hasta tu cobro, llevá tus deudas, lo que te deben y tus cuentas de banco, y mirá tus reportes.',
    pasateBoton: 'Ver el plan Pro',
    ahoraNo: 'Ahora no',
  },

  /** /plan y Ajustes → Tu plan, para la cuenta personal. */
  plan: {
    // Durante la prueba también se llama «Pro»: así es, desde el primer día,
    // el nombre de lo que usa (y de lo que después se paga).
    enPrueba: 'Estás probando el Pro',
    gratisTitulo: 'Estás en el plan Gratis',
    gratisDetalle: 'Anotás tus gastos e ingresos a mano y ves tu historial. Con Pro vuelven la voz, la foto, tu presupuesto, tus deudas, lo que te deben, tus cuentas y los reportes, con todo lo que ya habías cargado.',
    pruebaVence: 'Cuando termine, pasás al plan Gratis y seguís anotando tus gastos e ingresos a mano. La voz, la foto, el presupuesto, tus deudas y tus cuentas son del Pro: lo que cargues queda guardado.',
    gratisPuntos: [
      'Gastos e ingresos, cargados a mano',
      'Todo tu historial, para ver lo que cargaste',
      'Invitaciones: ganás cuando alguien que trajiste paga su primer mes',
    ],
    // El tope sale de la base (limites_de_empresa); acá no se escribe.
    proCargas: (n: number) => `Cargás hablando, con una foto o escribiendo (${n} por mes)`,
    proPresupuesto: 'Presupuesto de cobro a cobro, gastos fijos y metas',
    proMeDebenYBilletera: 'Lo que te deben y tus cuentas de banco',
    proReportes: 'Reportes y Excel de tus finanzas',
    verPro: 'Ver el plan Pro',
    podesGanar: 'Ganá plata invitando',
    podesGanarDetalle: 'Traé a alguien con tu enlace: cuando pague su primer mes, te llevás la mitad del precio de su plan. También en el plan Gratis.',
    // Lo manda la persona por WhatsApp: «Cuenta», no «Negocio».
    mensajeSuscribirme: (cuenta: string, plan: string, precio: string, cada: string) =>
      `Hola! Quiero suscribirme a Orden.\n\nCuenta: ${cuenta}\nPlan: ${plan}\nPrecio: ${precio} ${cada}\n\n¿Cómo hago la transferencia?`,
    comoSePagaDetalle: 'Por transferencia. Tocás el botón, se abre un WhatsApp con nosotros y lo arreglamos ahí mismo: no hace falta cargar ninguna tarjeta. Apenas entra la transferencia te activamos el Pro y vuelve todo lo que habías cargado.',
  },

  /** La franja de arriba (AvisoCuenta): antes del paso a Gratis y el día que pasa. */
  aviso: {
    quedanDiasDetalle: 'Después pasás al plan Gratis y seguís anotando a mano. La voz, la foto, el presupuesto, tus deudas y tus cuentas son del Pro; lo que cargaste queda guardado.',
    ultimoDiaDetalle: 'Mañana pasás al plan Gratis y seguís anotando a mano. Tu presupuesto, tus deudas y tus cuentas quedan guardados hasta que actives Pro.',
    gratisTituloPrueba: 'Tu prueba terminó: estás en el plan Gratis',
    gratisTituloPro: 'Tu plan Pro terminó: estás en el plan Gratis',
    gratisDetalle: 'Seguís anotando tus gastos e ingresos a mano. Tus deudas, tu presupuesto y tus cuentas quedaron guardados y vuelven con Pro.',
    verQueCambio: 'Ver qué cambió',
    cerrar: 'Cerrar aviso',
  },

  /** El alta: la pastilla de «Para mí». */
  registro: {
    diasPrueba: (n: number) => `${n} días de Pro, después gratis`,
  },

  /**
   * Ajustes → Estado del sistema. El de siempre dice «Funcionando… contale
   * al sistema lo que pasó», y en Gratis la captura con IA es del Pro.
   */
  ajustes: {
    estadoCaptura: 'Es del plan Pro. En el plan Gratis anotás a mano con el botón verde o desde Gastos.',
  },

  /** Lo que contestan las rutas cuando la persona en Gratis pide algo del Pro. */
  servidor: {
    capturaEsDePro: 'Cargar con voz, foto o texto es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.',
    excelEsDePro: 'El Excel es del plan Pro. En el plan Gratis ves tus movimientos en el historial.',
  },

  /** El push de la prueba que se termina (071), para la cuenta personal. */
  notificaciones: {
    pruebaCuerpo: 'Después pasás al plan Gratis y seguís anotando a mano. Tu presupuesto, tus deudas y tus cuentas quedan guardados: activá Pro para seguir usándolos.',
  },
};

export const planGratisPt: typeof planGratisEs = {
  seccion: {
    titulo: 'Isso é do plano Pro',
    detalle: {
      deudas: 'O que você deve, cada parcela e quando vence.',
      fiado: 'Quem te deve dinheiro, quanto, e a mensagem pra cobrar.',
      billetera: 'Quanto você tem em cada banco e em dinheiro.',
      organizacion: 'Quanto você pode gastar por dia até o próximo pagamento, seus gastos fixos e suas reservas.',
      reportes: 'Seus números do mês explicados, e o Excel pra baixar.',
    },
    guardado: 'O que você lançou aqui continua guardado: volta quando você ativar o Pro.',
    verPlan: 'Ver o plano Pro',
    anotarGasto: 'Anotar uma despesa',
  },

  nav: {
    conPro: 'Com o Pro',
  },

  captura: {
    botonAria: 'Anotar uma despesa ou uma entrada',
    encabezado: 'Anote na mão uma despesa ou uma entrada.',
    anotarAMano: 'Anotar na mão',
    anotarAManoDetalle: 'Uma despesa ou uma entrada, em Despesas',
    soloPro: 'Lançar por voz, foto ou texto é do plano Pro.',
    verPlan: 'Ver o plano Pro',
  },

  panel: {
    esteMes: 'Este mês',
    sinIngresos: 'Você ainda não anotou entradas este mês',
    cobroACobro: 'Recebe no fim do mês? Com o Pro, seus números vão de pagamento a pagamento.',
    ultimas: 'O que você anotou por último',
    verTodo: 'Ver tudo',
    sinCargas: 'Você ainda não anotou nada.',
    sinCargasDetalle: 'Anote sua primeira despesa ou entrada: fica no seu histórico.',
    pasateTitulo: 'Passe para o plano Pro',
    pasateDetalle: 'Lance falando ou com uma foto, saiba quanto pode gastar por dia até o pagamento, acompanhe suas dívidas, o que te devem e suas contas de banco, e veja seus relatórios.',
    pasateBoton: 'Ver o plano Pro',
    ahoraNo: 'Agora não',
  },

  plan: {
    enPrueba: 'Você está testando o Pro',
    gratisTitulo: 'Você está no plano Grátis',
    gratisDetalle: 'Você lança suas despesas e entradas na mão e vê seu histórico. Com o Pro voltam a voz, a foto, seu orçamento, suas dívidas, o que te devem, suas contas e os relatórios, com tudo o que você já tinha lançado.',
    pruebaVence: 'Quando terminar, você passa pro plano Grátis e continua lançando suas despesas e entradas na mão. A voz, a foto, o orçamento, suas dívidas e suas contas são do Pro: o que você lançar fica guardado.',
    gratisPuntos: [
      'Despesas e entradas, lançadas na mão',
      'Todo o seu histórico, pra ver o que você lançou',
      'Convites: você ganha quando alguém que você trouxe paga o primeiro mês',
    ],
    proCargas: (n: number) => `Você lança falando, com uma foto ou escrevendo (${n} por mês)`,
    proPresupuesto: 'Orçamento de pagamento a pagamento, gastos fixos e metas',
    proMeDebenYBilletera: 'O que te devem e suas contas de banco',
    proReportes: 'Relatórios e Excel das suas finanças',
    verPro: 'Ver o plano Pro',
    podesGanar: 'Ganhe dinheiro convidando',
    podesGanarDetalle: 'Traga alguém com seu link: quando pagar o primeiro mês, você fica com metade do preço do plano dele. Também no plano Grátis.',
    mensajeSuscribirme: (cuenta: string, plan: string, precio: string, cada: string) =>
      `Olá! Quero assinar o Orden.\n\nConta: ${cuenta}\nPlano: ${plan}\nPreço: ${precio} ${cada}\n\nComo faço a transferência?`,
    comoSePagaDetalle: 'Por transferência. Você toca no botão, abre um WhatsApp com a gente e resolvemos ali mesmo: não precisa cadastrar cartão nenhum. Assim que a transferência entra, ativamos o Pro e volta tudo o que você tinha lançado.',
  },

  aviso: {
    quedanDiasDetalle: 'Depois você passa pro plano Grátis e continua lançando na mão. A voz, a foto, o orçamento, suas dívidas e suas contas são do Pro; o que você lançou fica guardado.',
    ultimoDiaDetalle: 'Amanhã você passa pro plano Grátis e continua lançando na mão. Seu orçamento, suas dívidas e suas contas ficam guardados até você ativar o Pro.',
    gratisTituloPrueba: 'Seu teste terminou: você está no plano Grátis',
    gratisTituloPro: 'Seu plano Pro terminou: você está no plano Grátis',
    gratisDetalle: 'Você continua lançando suas despesas e entradas na mão. Suas dívidas, seu orçamento e suas contas ficaram guardados e voltam com o Pro.',
    verQueCambio: 'Ver o que mudou',
    cerrar: 'Fechar aviso',
  },

  registro: {
    diasPrueba: (n: number) => `${n} dias de Pro, depois grátis`,
  },

  ajustes: {
    estadoCaptura: 'É do plano Pro. No plano Grátis você lança na mão pelo botão verde ou em Despesas.',
  },

  servidor: {
    capturaEsDePro: 'Lançar por voz, foto ou texto é do plano Pro. No plano Grátis você lança suas despesas e entradas na mão.',
    excelEsDePro: 'O Excel é do plano Pro. No plano Grátis você vê seus lançamentos no histórico.',
  },

  notificaciones: {
    pruebaCuerpo: 'Depois você passa pro plano Grátis e continua lançando na mão. Seu orçamento, suas dívidas e suas contas ficam guardados: ative o Pro pra continuar usando.',
  },
};
