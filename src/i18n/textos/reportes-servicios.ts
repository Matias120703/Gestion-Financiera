/**
 * TEXTOS DEL REPORTE DE servicios y oficios (barbería, peluquería, taller): profesionales, turnos y reparto.
 *
 * El diccionario lo incluye como `t.reportesServicios` (ver es.ts y pt.ts). Lo
 * llena el componente `src/components/reportes/ReporteServicios.tsx`; lo que es de
 * todos los reportes (rango, indicador, gráfico, descarga) está en
 * `reportes-comunes.ts`. Los textos del Excel NO van acá: el libro se
 * compila suelto para las pruebas y los lleva en src/lib/reportes
 * (textos-servicios.ts).
 *
 * «Cobrado» no está acá: sale de la ficha del rubro con `palabra()`, igual
 * que en el menú.
 */
export const reportesServiciosEs = {
  indicadores: {
    cobros: (n: string) => `${n} cobros`,
    quedo: 'Quedó para el local',
    quedoDetalle: 'después de la parte del equipo',
    gastos: 'Gastos',
    neta: 'Ganancia neta',
  },

  /** La cuenta del dueño: de dónde salió lo que le quedó. */
  cuenta: {
    titulo: 'De dónde salió lo que quedó',
    tusServicios: 'Tus servicios',
    tusServiciosDetalle: 'lo que cobraste con tus propias manos',
    deTuEquipo: 'De tu equipo',
    deTuEquipoDetalle: 'lo que te queda de lo que cobraron ellos',
    productos: 'Productos y otros cobros',
    productosDetalle: 'precio menos lo que costó',
    quedo: 'Quedó para el local',
    otrosIngresos: 'Otros ingresos',
    otrosIngresosDetalle: 'alquiler de sillas, cobros de fiado y más',
    gastos: 'Gastos del local',
    neta: 'Ganancia neta',
  },

  /** Lo que salió de la caja pero no resta de la ganancia. */
  aparte: {
    mercaderia: (monto: string) =>
      `Compraste mercadería por ${monto}. No resta de la ganancia: ya resta el costo de cada producto que vendiste.`,
    comision: (monto: string) =>
      `Le pagaste ${monto} al equipo a comisión. Salió de la caja, pero no resta otra vez: ya restó como su parte de cada servicio.`,
  },

  equipo: {
    titulo: 'Por profesional',
    colPersona: 'Persona',
    colServicios: 'Servicios',
    colCobro: 'Cobró',
    colLocal: 'Para el local',
    colLeToca: 'Le toca',
    colPagado: 'Ya le pagaste',
    colFalta: 'Le debés',
    local: 'Todo para el local',
    comision: (pct: string) => `Comisión ${pct} %`,
    alquiler: 'Alquila la silla',
    sueldo: 'A sueldo',
    yaNoEsta: 'ya no está',
    cobroDirecto: (monto: string) => `cobró directo ${monto}`,
    turnos: (atendidos: number, noVino: number) =>
      `${atendidos} ${atendidos === 1 ? 'atendido' : 'atendidos'}${noVino > 0 ? ` · ${noVino} no vino` : ''}`,
    alDia: 'al día',
    total: 'Total',
    nota: (fecha: string) =>
      `«Le debés» es a la fecha del ${fecha} y cuenta lo de antes: un pago de esta semana puede ser por servicios de la semana pasada. Quien alquila la silla cobra directo: «Le toca» cuenta esos cortes, que son suyos, pero no se le debe nada por ellos.`,
    faltaPagar: (monto: string) => `Falta pagarle al equipo ${monto}`,
  },

  turnos: {
    titulo: 'Turnos del período',
    atendidos: 'Atendidos',
    noVino: 'No vino',
    cancelados: 'Cancelados',
    pendientes: 'Por venir',
    porLink: (n: number, total: number) => `${n} de ${total} entraron por tu link de reservas`,
    colPersona: 'Persona',
    colTurnos: 'Turnos',
    nota: 'Un turno cancelado cuenta en el día del turno: Orden no guarda cuándo se canceló.',
  },

  servicios: {
    /** Solo servicios: la mercadería va en su propio bloque. */
    titulo: 'Servicios',
    colServicio: 'Servicio',
    colVeces: 'Veces',
    colEquipo: 'Parte del equipo',
    colLocal: 'Para el local',
    colPct: '% local',
    sinServicios: 'Sin servicios cobrados en este período',
    sinServiciosDetalle: 'Cuando cobres un servicio, aparece acá con lo que quedó para el local.',
  },

  mercaderia: {
    titulo: 'Productos vendidos',
    colProducto: 'Producto',
    colUnidades: 'Unidades',
    colCosto: 'Costo',
    colGanancia: 'Ganancia',
    colMargen: 'Margen',
    sinCosto: (n: number) => (n === 1
      ? '1 producto sin costo cargado: su margen sale inflado.'
      : `${n} productos sin costo cargado: su margen sale inflado.`),
    marcaSinCosto: 'sin costo',
  },

  cobros: {
    titulo: 'Cómo te pagaron',
    /** Al lado de la forma «Crédito» (fiado): se cobró, pero la plata no entró. */
    todaviaNoEntro: 'todavía no entró',
    sinCobros: 'Sin cobros en este período',
    sinCobrosDetalle: 'Cuando cobres algo, vas a ver acá cómo te pagaron.',
  },

  gastos: {
    titulo: 'Gastos por categoría',
    colCategoria: 'Categoría',
    colTotal: 'Total',
    colMov: 'Mov.',
    sinGastos: 'Sin gastos en este período',
    sinGastosDetalle: 'Cuando anotes un gasto, aparece acá por categoría.',
  },

  clientes: {
    titulo: 'Los clientes que más vuelven',
    visitas: (n: number) => (n === 1 ? '1 visita' : `${n} visitas`),
    ultima: (fecha: string) => `última: ${fecha}`,
    nota: 'Cuenta los turnos atendidos con un cliente de tu lista.',
  },

  teDeben: {
    titulo: 'Lo que te deben',
    resumen: (monto: string, n: number) => `${monto} entre ${n} ${n === 1 ? 'cliente' : 'clientes'}, a hoy.`,
    dias: (n: number) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
    ver: 'Ver fiado →',
  },

  aReponer: {
    titulo: (n: number) => `A reponer (${n})`,
    detalle: 'Productos en su mínimo o por debajo, a hoy.',
    stock: (stock: string, minimo: string) => `quedan ${stock} · mínimo ${minimo}`,
  },
};

export const reportesServiciosPt: typeof reportesServiciosEs = {
  indicadores: {
    cobros: (n: string) => `${n} recebimentos`,
    quedo: 'Ficou pro local',
    quedoDetalle: 'depois da parte da equipe',
    gastos: 'Despesas',
    neta: 'Lucro líquido',
  },
  cuenta: {
    titulo: 'De onde saiu o que ficou',
    tusServicios: 'Seus serviços',
    tusServiciosDetalle: 'o que você recebeu com as próprias mãos',
    deTuEquipo: 'Da sua equipe',
    deTuEquipoDetalle: 'o que fica pra você do que eles receberam',
    productos: 'Produtos e outros recebimentos',
    productosDetalle: 'preço menos o que custou',
    quedo: 'Ficou pro local',
    otrosIngresos: 'Outras entradas',
    otrosIngresosDetalle: 'aluguel de cadeiras, fiado recebido e mais',
    gastos: 'Despesas do local',
    neta: 'Lucro líquido',
  },
  aparte: {
    mercaderia: (monto: string) =>
      `Você comprou mercadoria por ${monto}. Não desconta do lucro: o custo de cada produto vendido já desconta.`,
    comision: (monto: string) =>
      `Você pagou ${monto} à equipe por comissão. Saiu do caixa, mas não desconta de novo: já descontou como a parte dela em cada serviço.`,
  },
  equipo: {
    titulo: 'Por profissional',
    colPersona: 'Pessoa',
    colServicios: 'Serviços',
    colCobro: 'Recebeu',
    colLocal: 'Pro local',
    colLeToca: 'Cabe a ele',
    colPagado: 'Você já pagou',
    colFalta: 'Você deve',
    local: 'Tudo pro local',
    comision: (pct: string) => `Comissão ${pct} %`,
    alquiler: 'Aluga a cadeira',
    sueldo: 'Com salário',
    yaNoEsta: 'não está mais',
    cobroDirecto: (monto: string) => `recebeu direto ${monto}`,
    turnos: (atendidos: number, noVino: number) =>
      `${atendidos} ${atendidos === 1 ? 'atendido' : 'atendidos'}${noVino > 0 ? ` · ${noVino} não veio` : ''}`,
    alDia: 'em dia',
    total: 'Total',
    nota: (fecha: string) =>
      `«Você deve» é na data de ${fecha} e conta o que vem de antes: um pagamento desta semana pode ser por serviços da semana passada. Quem aluga a cadeira recebe direto: «Cabe a ele» conta esses cortes, que são dele, mas não se deve nada a ele por eles.`,
    faltaPagar: (monto: string) => `Falta pagar à equipe ${monto}`,
  },
  turnos: {
    titulo: 'Horários do período',
    atendidos: 'Atendidos',
    noVino: 'Não veio',
    cancelados: 'Cancelados',
    pendientes: 'Por vir',
    porLink: (n: number, total: number) => `${n} de ${total} entraram pelo seu link de reservas`,
    colPersona: 'Pessoa',
    colTurnos: 'Horários',
    nota: 'Um horário cancelado conta no dia do horário: o Orden não guarda quando foi cancelado.',
  },
  servicios: {
    titulo: 'Serviços',
    colServicio: 'Serviço',
    colVeces: 'Vezes',
    colEquipo: 'Parte da equipe',
    colLocal: 'Pro local',
    colPct: '% local',
    sinServicios: 'Nenhum serviço recebido neste período',
    sinServiciosDetalle: 'Quando você receber um serviço, ele aparece aqui com o que ficou pro local.',
  },
  mercaderia: {
    titulo: 'Produtos vendidos',
    colProducto: 'Produto',
    colUnidades: 'Unidades',
    colCosto: 'Custo',
    colGanancia: 'Lucro',
    colMargen: 'Margem',
    sinCosto: (n: number) => (n === 1
      ? '1 produto sem custo cadastrado: a margem dele sai inflada.'
      : `${n} produtos sem custo cadastrado: a margem deles sai inflada.`),
    marcaSinCosto: 'sem custo',
  },
  cobros: {
    titulo: 'Como te pagaram',
    todaviaNoEntro: 'ainda não entrou',
    sinCobros: 'Nenhum recebimento neste período',
    sinCobrosDetalle: 'Quando você receber algo, vai ver aqui como te pagaram.',
  },
  gastos: {
    titulo: 'Despesas por categoria',
    colCategoria: 'Categoria',
    colTotal: 'Total',
    colMov: 'Lanç.',
    sinGastos: 'Nenhuma despesa neste período',
    sinGastosDetalle: 'Quando você anotar uma despesa, ela aparece aqui por categoria.',
  },
  clientes: {
    titulo: 'Os clientes que mais voltam',
    visitas: (n: number) => (n === 1 ? '1 visita' : `${n} visitas`),
    ultima: (fecha: string) => `última: ${fecha}`,
    nota: 'Conta os horários atendidos com um cliente da sua lista.',
  },
  teDeben: {
    titulo: 'O que te devem',
    resumen: (monto: string, n: number) => `${monto} entre ${n} ${n === 1 ? 'cliente' : 'clientes'}, hoje.`,
    dias: (n: number) => (n === 1 ? 'há 1 dia' : `há ${n} dias`),
    ver: 'Ver fiado →',
  },
  aReponer: {
    titulo: (n: number) => `Para repor (${n})`,
    detalle: 'Produtos no mínimo ou abaixo, hoje.',
    stock: (stock: string, minimo: string) => `restam ${stock} · mínimo ${minimo}`,
  },
};
