/**
 * TEXTOS DEL REPORTE DE la cuenta personal: de cobro a cobro, presupuesto, fijos, ahorro y deudas.
 *
 * El diccionario lo incluye como `t.reportesPersonal` (ver es.ts y pt.ts). Lo
 * llena el componente `src/components/reportes/ReportePersonal.tsx`; lo que es de
 * todos los reportes (rango, indicador, gráfico, descarga) está en
 * `reportes-comunes.ts`. Los textos del Excel NO van acá: el libro se
 * compila suelto para las pruebas y los lleva en src/lib/reportes
 * (`textos-personal.ts`).
 *
 * Las palabras son las del Excel a propósito («Entró», «Salió», «Te quedó»,
 * «En qué se fue», «De dónde vino»): la pantalla y el archivo tienen que
 * decir lo mismo con las mismas palabras.
 */
export const reportesPersonalEs = {
  numeros: {
    entro: 'Entró',
    salio: 'Salió',
    guarde: 'Guardé',
    teQuedo: 'Te quedó',
    /** Debajo de «Guardé»: la duda de siempre es si lo guardado es un gasto. */
    guardeDetalle: 'No resta de lo que te quedó',
    teQuedoDetalle: 'Lo que entró menos lo que salió',
  },
  frase: {
    sobro: (monto: string) => `Te quedaron ${monto} de lo que entró en este período.`,
    deMas: (monto: string) => `En este período salió ${monto} más de lo que entró.`,
    nada: 'Todavía no cargaste nada en este período.',
  },
  barras: {
    tituloCiclos: 'Cómo viene, ciclo a ciclo',
    tituloMeses: 'Cómo viene, mes a mes',
    entro: 'Entró',
    salio: 'Salió',
    guarde: 'Guardé',
    /** Lo que se lee al pasar el dedo por un ciclo. */
    detalle: (tramo: string, entro: string, salio: string, guardo: string) =>
      `${tramo}: entró ${entro}, salió ${salio}, guardaste ${guardo}`,
    /** El último tramo va hasta el fin del rango elegido. */
    hastaAca: 'El último va hasta el final del período elegido.',
  },
  enQueSeFue: {
    titulo: 'En qué se fue',
    vacio: 'Sin gastos en este período',
    vacioDetalle: 'Cuando cargues tus gastos, vas a ver acá en qué se va la plata.',
    dePlan: (plan: string) => `de ${plan}`,
    quedan: (monto: string) => `quedan ${monto}`,
    tePasaste: (monto: string) => `te pasaste ${monto}`,
    sinPlan: 'sin presupuesto',
    planSinGastar: 'Nada gastado',
    pasadas: (n: number) => (n === 1 ? '1 categoría se pasó del plan' : `${n} categorías se pasaron del plan`),
    ningunaPasada: 'Ninguna categoría se pasó del plan',
    contraPlanDeHoy: (ciclos: number) => (ciclos === 1
      ? 'Se compara contra tu presupuesto de hoy, para un ciclo.'
      : `Se compara contra tu presupuesto de hoy, por ${ciclos} ciclos.`),
    soloPorCiclo:
      'Tu presupuesto se mide de cobro a cobro. Elegí «Este ciclo» o «Ciclo pasado» para verlo al lado de lo gastado.',
  },
  deDondeVino: {
    titulo: 'De dónde vino',
    vacio: 'Sin ingresos en este período',
    vacioDetalle: 'Cuando registres lo que cobrás, vas a ver acá de dónde viene cada parte.',
  },
  fijos: {
    titulo: 'Gastos fijos del ciclo',
    tituloRango: 'Gastos fijos',
    pagado: 'Pagado',
    pendiente: 'Pendiente',
    falta: (monto: string) => `Falta ${monto}`,
    venceEl: (dia: number) => `vence el ${dia}`,
    sinDia: 'sin día fijo',
    resumen: (pagados: number, total: number) => `${pagados} de ${total} pagados`,
    faltaTotal: (monto: string) => `Falta pagar ${monto}`,
    todoPagado: 'Todo pagado',
    regla: 'Se da por pagado si en el ciclo gastaste en su categoría por lo menos lo que vale.',
    soloPorCiclo: 'Pagado o pendiente se mide dentro de un ciclo. Elegí «Este ciclo» o «Ciclo pasado».',
    gastadoCategoria: (monto: string) => `En su categoría: ${monto}`,
  },
  ahorro: {
    titulo: 'Ahorro y metas',
    guardadoPeriodo: (monto: string) => `Guardaste ${monto} en el período`,
    sacastePeriodo: (monto: string) => `Sacaste ${monto} en el período`,
    sinMovimiento: 'Sin movimiento en el período',
    meta: (monto: string) => `Meta ${monto}`,
    paraEl: (fecha: string) => `para el ${fecha}`,
    falta: (monto: string) => `Faltan ${monto}`,
    porMes: (monto: string) => `${monto} por mes para llegar`,
    cumplida: 'Meta cumplida',
    fechaPasada: 'La fecha ya pasó',
    sinMeta: 'Sin meta',
    saldoHoy: 'Saldo a hoy',
  },
  deudas: {
    titulo: 'Deudas y cuotas',
    debesHoy: 'Debés a hoy',
    pagadoPeriodo: 'Pagaste en el período',
    proximo: (fecha: string) => `Próximo vencimiento: ${fecha}`,
    cuotas: (pagadas: number, total: number) => `Cuota ${pagadas} de ${total}`,
    cuota: (monto: string) => `cuota de ${monto}`,
    vence: (fecha: string) => `vence el ${fecha}`,
    vencio: (fecha: string) => `venció el ${fecha}`,
    saldada: 'Saldada',
    pagaste: (monto: string) => `pagaste ${monto}`,
  },
  teDeben: {
    titulo: 'Lo que te deben',
    total: 'Te deben a hoy',
    cuantos: (n: number) => (n === 1 ? '1 persona' : `${n} personas`),
    prestado: 'Prestaste o fiaste en el período',
    devuelto: 'Te devolvieron en el período',
    notaDevuelto: 'Lo que te devolvieron no suma en «Entró»: era tu plata que volvió.',
  },
};

export const reportesPersonalPt: typeof reportesPersonalEs = {
  numeros: {
    entro: 'Entrou',
    salio: 'Saiu',
    guarde: 'Guardei',
    teQuedo: 'Sobrou',
    guardeDetalle: 'Não sai do que sobrou',
    teQuedoDetalle: 'O que entrou menos o que saiu',
  },
  frase: {
    sobro: (monto: string) => `Sobraram ${monto} do que entrou neste período.`,
    deMas: (monto: string) => `Neste período saiu ${monto} a mais do que entrou.`,
    nada: 'Você ainda não lançou nada neste período.',
  },
  barras: {
    tituloCiclos: 'Como vem, ciclo a ciclo',
    tituloMeses: 'Como vem, mês a mês',
    entro: 'Entrou',
    salio: 'Saiu',
    guarde: 'Guardei',
    detalle: (tramo: string, entro: string, salio: string, guardo: string) =>
      `${tramo}: entrou ${entro}, saiu ${salio}, você guardou ${guardo}`,
    hastaAca: 'O último vai até o fim do período escolhido.',
  },
  enQueSeFue: {
    titulo: 'Pra onde foi',
    vacio: 'Sem despesas neste período',
    vacioDetalle: 'Quando você lançar suas despesas, vai ver aqui pra onde vai o dinheiro.',
    dePlan: (plan: string) => `de ${plan}`,
    quedan: (monto: string) => `restam ${monto}`,
    tePasaste: (monto: string) => `passou ${monto}`,
    sinPlan: 'sem orçamento',
    planSinGastar: 'Nada gasto',
    pasadas: (n: number) => (n === 1 ? '1 categoria passou do plano' : `${n} categorias passaram do plano`),
    ningunaPasada: 'Nenhuma categoria passou do plano',
    contraPlanDeHoy: (ciclos: number) => (ciclos === 1
      ? 'Compara com o seu orçamento de hoje, para um ciclo.'
      : `Compara com o seu orçamento de hoje, para ${ciclos} ciclos.`),
    soloPorCiclo:
      'Seu orçamento se mede de pagamento a pagamento. Escolha «Este ciclo» ou «Ciclo passado» para vê-lo ao lado do gasto.',
  },
  deDondeVino: {
    titulo: 'De onde veio',
    vacio: 'Sem entradas neste período',
    vacioDetalle: 'Quando você registrar o que recebe, vai ver aqui de onde vem cada parte.',
  },
  fijos: {
    titulo: 'Despesas fixas do ciclo',
    tituloRango: 'Despesas fixas',
    pagado: 'Paga',
    pendiente: 'Pendente',
    falta: (monto: string) => `Faltam ${monto}`,
    venceEl: (dia: number) => `vence no dia ${dia}`,
    sinDia: 'sem dia fixo',
    resumen: (pagados: number, total: number) => `${pagados} de ${total} pagas`,
    faltaTotal: (monto: string) => `Falta pagar ${monto}`,
    todoPagado: 'Tudo pago',
    regla: 'Conta como paga se no ciclo você gastou na categoria dela pelo menos o valor dela.',
    soloPorCiclo: 'Paga ou pendente se mede dentro de um ciclo. Escolha «Este ciclo» ou «Ciclo passado».',
    gastadoCategoria: (monto: string) => `Na categoria: ${monto}`,
  },
  ahorro: {
    titulo: 'Reservas e metas',
    guardadoPeriodo: (monto: string) => `Você guardou ${monto} no período`,
    sacastePeriodo: (monto: string) => `Você tirou ${monto} no período`,
    sinMovimiento: 'Sem movimento no período',
    meta: (monto: string) => `Meta ${monto}`,
    paraEl: (fecha: string) => `até ${fecha}`,
    falta: (monto: string) => `Faltam ${monto}`,
    porMes: (monto: string) => `${monto} por mês para chegar`,
    cumplida: 'Meta cumprida',
    fechaPasada: 'A data já passou',
    sinMeta: 'Sem meta',
    saldoHoy: 'Saldo hoje',
  },
  deudas: {
    titulo: 'Dívidas e parcelas',
    debesHoy: 'Você deve hoje',
    pagadoPeriodo: 'Você pagou no período',
    proximo: (fecha: string) => `Próximo vencimento: ${fecha}`,
    cuotas: (pagadas: number, total: number) => `Parcela ${pagadas} de ${total}`,
    cuota: (monto: string) => `parcela de ${monto}`,
    vence: (fecha: string) => `vence em ${fecha}`,
    vencio: (fecha: string) => `venceu em ${fecha}`,
    saldada: 'Quitada',
    pagaste: (monto: string) => `você pagou ${monto}`,
  },
  teDeben: {
    titulo: 'O que te devem',
    total: 'Te devem hoje',
    cuantos: (n: number) => (n === 1 ? '1 pessoa' : `${n} pessoas`),
    prestado: 'Você emprestou ou vendeu fiado no período',
    devuelto: 'Te devolveram no período',
    notaDevuelto: 'O que te devolveram não soma em «Entrou»: era seu dinheiro que voltou.',
  },
};
