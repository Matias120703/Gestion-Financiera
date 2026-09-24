/**
 * LO QUE DICE EL EXCEL DE SERVICIOS Y OFICIOS, EN CADA IDIOMA (23/09).
 *
 * Vive en src/lib y no en i18n por lo mismo que reporte-textos.ts: el libro
 * se compila suelto, sin Next, para las pruebas. Lo común a todos los
 * libros (nombre de las hojas Resumen, Movimientos, Gastos, Día por día, el
 * período, «Venta», «Anulada»…) sigue viniendo de reporte-textos.ts.
 *
 * La hoja de servicios no se nombra acá: lleva la palabra de la ficha del
 * rubro («Servicios y productos»), la misma que ve el dueño en el menú.
 */
const es = {
  hojaPorProfesional: 'Por profesional',
  hojaTurnos: 'Turnos',
  /** Solo si la ficha no trae su palabra para «productos». */
  hojaServicios: 'Servicios',
  hojaContador: 'Para tu contador',

  // ---- Resumen ----
  resumenTitulo: 'RESUMEN DEL PERÍODO',
  colEstePeriodo: 'Este período',
  colAntes: (periodo: string) => `Antes (${periodo})`,
  cobros: (n: number) => (n === 1 ? '1 cobro' : `${n} cobros`),
  entroPlata: 'Entró plata',
  descuentos: 'Descuentos',
  otrosIngresos: 'Otros ingresos',
  otrosIngresosNota: 'alquiler de sillas, cobros de fiado y más',
  totalEntro: 'Total que entró',
  loQueQuedo: 'Lo que quedó para el local',
  parteDelEquipo: 'Parte del equipo y costo de lo vendido',
  quedoParaElLocal: 'Quedó para el local',
  deDondeSalio: 'De dónde salió (este período)',
  tusServicios: 'Tus servicios',
  deTuEquipo: 'De tu equipo',
  productosYOtros: 'Productos y otros cobros',
  productosYOtrosNota: 'precio menos costo',
  gastosBloque: 'Gastos',
  gastosDelLocal: 'Gastos del local',
  comprasteMercaderia: 'Compraste mercadería',
  comprasteMercaderiaNota: 'aparte: ya resta el costo de lo vendido',
  pagadoAlEquipo: 'Pagado al equipo a comisión',
  pagadoAlEquipoNota: 'ya restó en cada servicio',
  resultado: 'Resultado',
  gananciaNeta: 'Ganancia neta',
  turnosBloque: 'Turnos',
  turnosTotal: 'Turnos del período',
  porElLink: 'Reservados por tu link',
  equipoBloque: 'Equipo',
  faltaPagar: (fecha: string) => `Falta pagar al equipo al ${fecha}`,
  faltaPagarNota: 'incluye lo de antes de este período',
  sinCobros: 'No se registraron cobros en este período.',

  // ---- Por profesional ----
  equipoTitulo: 'POR PROFESIONAL · EL PERÍODO Y LO QUE FALTA PAGAR',
  columnasEquipo: [
    'Profesional', 'Cómo cobra', 'Servicios', 'Cobró', 'Para el local', 'Le toca', 'Ya le pagaste',
    'Cobró directo', 'Falta pagar (a la fecha)', 'Turnos atendidos', 'No vino', 'Cancelados',
  ],
  repartoLocal: 'Todo para el local',
  repartoComision: (pct: string) => `Comisión ${pct}%`,
  repartoAlquiler: 'Alquila la silla',
  repartoSueldo: 'A sueldo',
  inactivo: 'ya no está',
  notaEquipo: '«Falta pagar» cuenta todo lo anterior hasta la última fecha del período: un pago de esta semana '
    + 'puede ser por servicios de la semana pasada. Quien alquila la silla cobra directo: «Le toca» cuenta esos '
    + 'cortes, que son suyos, y «Cobró directo» dice cuánto ya tiene; no se le debe nada por ellos.',
  pagosTitulo: 'PAGOS AL EQUIPO EN EL PERÍODO',
  columnasPagos: ['Fecha', 'Profesional', 'Monto', 'Qué fue', 'Notas'],
  pagoComision: 'Comisión: no resta otra vez',
  pagoOtro: 'Sueldo u otro: resta como gasto',
  cortesTitulo: 'CADA SERVICIO DEL PERÍODO',
  columnasCortes: ['Fecha', 'Profesional', 'Servicio', 'Cobrado', 'Parte del profesional', 'Parte del local', 'Estado'],

  // ---- Turnos ----
  turnosTitulo: 'TURNOS DEL PERÍODO',
  porEstado: 'POR ESTADO',
  columnasEstado: ['Estado', 'Turnos', 'Del total'],
  estados: {
    atendida: 'Atendidos', no_vino: 'No vino', cancelada: 'Cancelados',
    confirmada: 'Confirmados', pendiente: 'Pendientes',
  } as Record<'atendida' | 'no_vino' | 'cancelada' | 'confirmada' | 'pendiente', string>,
  porOrigen: 'POR DÓNDE ENTRARON',
  origenLocal: 'Cargados en el local',
  origenPublico: 'Por tu link de reservas',
  porProfesional: 'POR PROFESIONAL',
  columnasTurnosProfesional: ['Profesional', 'Turnos', 'Atendidos', 'No vino', 'Cancelados', 'Pendientes'],
  porServicio: 'POR SERVICIO',
  columnasTurnosServicio: ['Servicio', 'Turnos', 'Atendidos'],
  clientesTitulo: 'LOS CLIENTES QUE MÁS VUELVEN',
  columnasClientes: ['Cliente', 'Visitas', 'Última visita'],
  notaTurnos: 'Un turno cancelado cuenta en el día del turno y no en el día que se canceló: Orden no guarda '
    + 'cuándo se canceló. Los clientes cuentan solo turnos atendidos con un cliente de tu lista.',

  // ---- Servicios ----
  serviciosTitulo: 'SERVICIOS · DE MAYOR A MENOR',
  columnasServicios: ['#', 'Servicio', 'Veces', 'Cobrado', 'Parte del equipo', 'Para el local', '% para el local', 'Del total'],
  sinServicios: 'No se cobraron servicios en este período.',
  mercaderiaTitulo: 'PRODUCTOS VENDIDOS',
  columnasMercaderia: ['#', 'Producto', 'Unidades', 'Cobrado', 'Costo', 'Ganancia', 'Margen', 'Del total', 'Costo cargado'],
  sinCostoMarca: 'NO',
  conCostoMarca: 'Sí',
  sinCostoAviso: (n: number) => (n === 1
    ? '1 producto sin costo cargado: su margen sale inflado.'
    : `${n} productos sin costo cargado: su margen sale inflado.`),
  aReponerTitulo: (n: number) => `A REPONER (${n})`,
  columnasReponer: ['', 'Producto', 'Stock hoy', 'Mínimo'],

  // ---- Movimientos ----
  columnasMovimientos: [
    'Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cobro/Pago', 'Cuenta', 'Cliente',
    'Monto', 'Costo / parte del equipo', 'Para el local', 'Estado', 'Nota',
  ],
  columnaProfesional: 'Profesional',
  notaPagoComision: 'Pago al equipo: ya restó en cada servicio',
  notaMercaderiaAparte: 'Compra de mercadería: va aparte',

  // ---- Gastos ----
  fueraDelTotal: 'NO ESTÁN EN EL TOTAL DE GASTOS',
  comprasAparte: 'Compraste mercadería (ya resta el costo de lo vendido)',
  pagadoAparte: 'Pagado al equipo a comisión (ya restó en cada servicio)',

  // ---- Día por día ----
  columnasDias: (cobrado: string) => ['', 'Fecha', cobrado, 'Otros ingresos', 'Gastos', 'Ganancia del día'],

  // ---- Para tu contador ----
  contadorTitulo: 'PARA TU CONTADOR',
  loQueEntro: 'Lo que entró',
  cobradoServicios: 'Cobrado por servicios y productos',
  loQueSalio: 'Lo que salió de la caja',
  comprasMercaderia: 'Compras de mercadería',
  pagosAlEquipo: 'Pagos al equipo a comisión',
  totalSalio: 'Total que salió',
  notaAparte: 'Las compras de mercadería y los pagos al equipo a comisión salieron de la caja, pero no restan en '
    + 'la ganancia del Resumen: ya restaron como costo de lo vendido o como la parte de cada servicio.',
  /** Recibe los nombres de las hojas tal cual salen en el archivo. */
  notaDetalle: (movimientos: string, equipo: string | null) =>
    `El detalle de cada cobro y de cada gasto, con su cuenta y su cliente, está en la hoja ${movimientos}.`
    + (equipo ? ` Los pagos al equipo, uno por uno, en ${equipo}.` : ''),
  notaSet: 'Esta hoja ordena tus números para el contador, pero no reemplaza el registro de comprobantes de la SET: '
    + 'Orden no guarda timbrado, número de factura ni la tasa de IVA de cada movimiento.',
};

export type TextosServicios = typeof es;

const pt: TextosServicios = {
  hojaPorProfesional: 'Por profissional',
  hojaTurnos: 'Horários',
  hojaServicios: 'Serviços',
  hojaContador: 'Para o contador',

  resumenTitulo: 'RESUMO DO PERÍODO',
  colEstePeriodo: 'Este período',
  colAntes: (periodo: string) => `Antes (${periodo})`,
  cobros: (n: number) => (n === 1 ? '1 recebimento' : `${n} recebimentos`),
  entroPlata: 'Entrou dinheiro',
  descuentos: 'Descontos',
  otrosIngresos: 'Outras entradas',
  otrosIngresosNota: 'aluguel de cadeiras, fiado recebido e mais',
  totalEntro: 'Total que entrou',
  loQueQuedo: 'O que ficou pro local',
  parteDelEquipo: 'Parte da equipe e custo do que foi vendido',
  quedoParaElLocal: 'Ficou pro local',
  deDondeSalio: 'De onde saiu (este período)',
  tusServicios: 'Seus serviços',
  deTuEquipo: 'Da sua equipe',
  productosYOtros: 'Produtos e outros recebimentos',
  productosYOtrosNota: 'preço menos custo',
  gastosBloque: 'Despesas',
  gastosDelLocal: 'Despesas do local',
  comprasteMercaderia: 'Você comprou mercadoria',
  comprasteMercaderiaNota: 'à parte: o custo do vendido já desconta',
  pagadoAlEquipo: 'Pago à equipe por comissão',
  pagadoAlEquipoNota: 'já descontou em cada serviço',
  resultado: 'Resultado',
  gananciaNeta: 'Lucro líquido',
  turnosBloque: 'Horários',
  turnosTotal: 'Horários do período',
  porElLink: 'Reservados pelo seu link',
  equipoBloque: 'Equipe',
  faltaPagar: (fecha: string) => `Falta pagar à equipe em ${fecha}`,
  faltaPagarNota: 'inclui o que vem de antes deste período',
  sinCobros: 'Nenhum recebimento neste período.',

  equipoTitulo: 'POR PROFISSIONAL · O PERÍODO E O QUE FALTA PAGAR',
  columnasEquipo: [
    'Profissional', 'Como recebe', 'Serviços', 'Recebeu', 'Pro local', 'Cabe a ele', 'Você já pagou',
    'Recebeu direto', 'Falta pagar (na data)', 'Horários atendidos', 'Não veio', 'Cancelados',
  ],
  repartoLocal: 'Tudo pro local',
  repartoComision: (pct: string) => `Comissão ${pct}%`,
  repartoAlquiler: 'Aluga a cadeira',
  repartoSueldo: 'Com salário',
  inactivo: 'não está mais',
  notaEquipo: '«Falta pagar» conta tudo o que vem de antes até a última data do período: um pagamento desta semana '
    + 'pode ser por serviços da semana passada. Quem aluga a cadeira recebe direto: «Cabe a ele» conta esses '
    + 'cortes, que são dele, e «Recebeu direto» diz quanto ele já tem; não se deve nada a ele por eles.',
  pagosTitulo: 'PAGAMENTOS À EQUIPE NO PERÍODO',
  columnasPagos: ['Data', 'Profissional', 'Valor', 'O que foi', 'Notas'],
  pagoComision: 'Comissão: não desconta de novo',
  pagoOtro: 'Salário ou outro: desconta como despesa',
  cortesTitulo: 'CADA SERVIÇO DO PERÍODO',
  columnasCortes: ['Data', 'Profissional', 'Serviço', 'Recebido', 'Parte do profissional', 'Parte do local', 'Situação'],

  turnosTitulo: 'HORÁRIOS DO PERÍODO',
  porEstado: 'POR SITUAÇÃO',
  columnasEstado: ['Situação', 'Horários', 'Do total'],
  estados: {
    atendida: 'Atendidos', no_vino: 'Não veio', cancelada: 'Cancelados',
    confirmada: 'Confirmados', pendiente: 'Pendentes',
  },
  porOrigen: 'POR ONDE ENTRARAM',
  origenLocal: 'Marcados no local',
  origenPublico: 'Pelo seu link de reservas',
  porProfesional: 'POR PROFISSIONAL',
  columnasTurnosProfesional: ['Profissional', 'Horários', 'Atendidos', 'Não veio', 'Cancelados', 'Pendentes'],
  porServicio: 'POR SERVIÇO',
  columnasTurnosServicio: ['Serviço', 'Horários', 'Atendidos'],
  clientesTitulo: 'OS CLIENTES QUE MAIS VOLTAM',
  columnasClientes: ['Cliente', 'Visitas', 'Última visita'],
  notaTurnos: 'Um horário cancelado conta no dia do horário e não no dia em que foi cancelado: o Orden não guarda '
    + 'quando foi cancelado. Os clientes contam só horários atendidos com um cliente da sua lista.',

  serviciosTitulo: 'SERVIÇOS · DO MAIOR PRO MENOR',
  columnasServicios: ['#', 'Serviço', 'Vezes', 'Recebido', 'Parte da equipe', 'Pro local', '% pro local', 'Do total'],
  sinServicios: 'Nenhum serviço recebido neste período.',
  mercaderiaTitulo: 'PRODUTOS VENDIDOS',
  columnasMercaderia: ['#', 'Produto', 'Unidades', 'Recebido', 'Custo', 'Lucro', 'Margem', 'Do total', 'Custo cadastrado'],
  sinCostoMarca: 'NÃO',
  conCostoMarca: 'Sim',
  sinCostoAviso: (n: number) => (n === 1
    ? '1 produto sem custo cadastrado: a margem dele sai inflada.'
    : `${n} produtos sem custo cadastrado: a margem deles sai inflada.`),
  aReponerTitulo: (n: number) => `PARA REPOR (${n})`,
  columnasReponer: ['', 'Produto', 'Estoque hoje', 'Mínimo'],

  columnasMovimientos: [
    'Data', 'Tipo', 'Descrição', 'Categoria', 'Recebimento/Pagamento', 'Conta', 'Cliente',
    'Valor', 'Custo / parte da equipe', 'Pro local', 'Situação', 'Nota',
  ],
  columnaProfesional: 'Profissional',
  notaPagoComision: 'Pagamento à equipe: já descontou em cada serviço',
  notaMercaderiaAparte: 'Compra de mercadoria: vai à parte',

  fueraDelTotal: 'NÃO ESTÃO NO TOTAL DE DESPESAS',
  comprasAparte: 'Você comprou mercadoria (o custo do vendido já desconta)',
  pagadoAparte: 'Pago à equipe por comissão (já descontou em cada serviço)',

  columnasDias: (cobrado: string) => ['', 'Data', cobrado, 'Outras entradas', 'Despesas', 'Lucro do dia'],

  contadorTitulo: 'PARA O CONTADOR',
  loQueEntro: 'O que entrou',
  cobradoServicios: 'Recebido por serviços e produtos',
  loQueSalio: 'O que saiu do caixa',
  comprasMercaderia: 'Compras de mercadoria',
  pagosAlEquipo: 'Pagamentos à equipe por comissão',
  totalSalio: 'Total que saiu',
  notaAparte: 'As compras de mercadoria e os pagamentos à equipe por comissão saíram do caixa, mas não descontam '
    + 'no lucro do Resumo: já descontaram como custo do vendido ou como a parte de cada serviço.',
  notaDetalle: (movimientos: string, equipo: string | null) =>
    `O detalhe de cada recebimento e de cada despesa, com a conta e o cliente, está na aba ${movimientos}.`
    + (equipo ? ` Os pagamentos à equipe, um por um, em ${equipo}.` : ''),
  notaSet: 'Esta aba organiza seus números para o contador, mas não substitui o registro de comprovantes da SET: '
    + 'o Orden não guarda timbrado, número da nota nem a alíquota de IVA de cada movimento.',
};

export function textosServicios(idioma?: string): TextosServicios {
  return idioma === 'pt' ? pt : es;
}
