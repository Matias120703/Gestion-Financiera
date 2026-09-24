/**
 * LO QUE DICE EL EXCEL DE LA CUENTA PERSONAL, EN CADA IDIOMA (23/09).
 *
 * Lo que ya decía el libro de siempre («Lo que entró», «Te quedó», las
 * columnas de los fondos) sigue saliendo de `reporte-textos.ts`: el archivo
 * que baja una persona no cambia de palabras de un día para el otro. Acá va
 * solo lo nuevo de esta variante: la comparación con el ciclo anterior, el
 * presupuesto, los gastos fijos, las metas y las deudas.
 *
 * Vive en src/lib y no en i18n por lo mismo que reporte-textos: el libro se
 * compila suelto para las pruebas, sin Next.
 */
const es = {
  hojaGastosFijos: 'Gastos fijos',
  hojaDeudas: 'Deudas',

  // ---- Resumen ----
  comparado: 'ESTE PERÍODO CONTRA EL ANTERIOR',
  columnasComparacion: ['', 'Concepto', 'Este período', 'Período anterior', 'Diferencia'],
  periodoAnterior: (desde: string, hasta: string) => `Período anterior: ${desde} al ${hasta}`,
  entro: 'Entró',
  salio: 'Salió',
  guarde: 'Guardé',
  teQuedo: 'Te quedó',
  notaGuarde: 'Lo guardado no resta de «Te quedó»: sigue siendo tu plata.',
  presupuesto: 'Tu presupuesto',
  categoriasPasadas: (n: number) => (n === 1 ? '1 categoría se pasó del plan' : `${n} categorías se pasaron del plan`),
  ningunaPasada: 'Ninguna categoría se pasó del plan',
  planeadoTotal: 'Planeado en total',
  gastadoEnLoPlaneado: 'Gastado en lo planeado',
  gastadoSinPlan: 'Gastado fuera del plan',
  fijos: 'Gastos fijos',
  fijosPagados: 'Pagados',
  fijosFalta: 'Falta pagar',
  deudas: 'Deudas',
  debesHoy: 'Debés a hoy',
  pagadoEnElPeriodo: 'Pagado en el período',
  teDeben: 'Lo que te deben',
  teDebenHoy: (n: number) => (n === 1 ? 'Te debe 1 persona, a hoy' : `Te deben ${n} personas, a hoy`),
  teDevolvieron: 'Te devolvieron en el período',
  prestaste: 'Prestaste o fiaste en el período',
  notaDevuelto: 'Lo que te devolvieron no suma en «Entró»: era plata tuya que volvió.',
  aHoy: 'a hoy',

  // ---- En qué se fue ----
  columnasEnQueSeFue: ['#', 'Categoría', 'Gastado', 'Movimientos', 'Del total', 'Presupuesto', 'Diferencia', '% usado'],
  contraElPlanDeHoy: (ciclos: number) => (ciclos === 1
    ? 'El presupuesto es el de hoy, para un ciclo: si lo cambiaste en el medio, se compara contra el nuevo.'
    : `El presupuesto es el de hoy, por ${ciclos} ciclos: si lo cambiaste en el medio, se compara contra el nuevo.`),
  presupuestoSoloPorCiclo:
    'El presupuesto se mide de cobro a cobro: bajá el Excel de «Este ciclo», «Ciclo pasado», un mes o un año para verlo al lado de lo gastado.',
  planSinGastar: 'sin gastar',

  // ---- Gastos fijos ----
  tusFijos: 'TUS GASTOS FIJOS',
  columnasFijos: ['#', 'Gasto', 'Categoría', 'Vence el día', 'Importe', 'Gastado en la categoría', 'Estado'],
  pagado: 'Pagado',
  pendiente: 'Pendiente',
  parcial: (falta: string) => `Falta ${falta}`,
  sinDia: 'sin día',
  reglaFijos:
    'Un fijo se da por pagado si en el período hubo gastos de su categoría por lo menos por su importe. Es la misma regla que usa Orden en Organización.',
  fijosSoloPorCiclo:
    'Pagado o pendiente se mide dentro de un ciclo: en este rango se muestra lo gastado en cada categoría, sin estado.',

  // ---- Ahorro ----
  tusMetas: 'TUS FONDOS Y METAS',
  columnasMetas: ['#', 'Fondo', 'Guardado en el período', 'Saldo a hoy', 'Meta', 'Fecha límite', 'Falta', 'Por mes para llegar'],
  metaCumplida: 'Meta cumplida',
  fechaPasada: 'La fecha ya pasó',
  sinMeta: 'sin meta',
  notaMetas:
    '«Saldo a hoy», «Falta» y «Por mes» son de hoy, no del período. Un fondo en otra moneda muestra su saldo y su meta en esa moneda.',

  // ---- Deudas ----
  tusDeudas: 'TUS DEUDAS',
  columnasDeudas: ['#', 'Deuda', 'Tipo', 'A quién', 'Monto original', 'Pagado en el período', 'Saldo a hoy', 'Cuotas', 'Cuota', 'Próximo vencimiento'],
  tipoDeuda: { tarjeta: 'Tarjeta', prestamo: 'Préstamo', proveedor: 'Proveedor', otro: 'Otro' } as Record<string, string>,
  cuotasDe: (pagadas: number, total: number) => `${pagadas} de ${total}`,
  vencida: 'vencida',
  pagosDelPeriodo: 'PAGOS DEL PERÍODO',
  columnasPagos: ['#', 'Fecha', 'Deuda', 'Monto', 'Nota'],
  sinPagos: 'No pagaste deudas en este período.',

  // ---- Movimientos ----
  columnasMovimientos: ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cuenta', 'Monto', 'Estado'],
};

export type TextosPersonalExcel = typeof es;

const pt: TextosPersonalExcel = {
  hojaGastosFijos: 'Despesas fixas',
  hojaDeudas: 'Dívidas',

  comparado: 'ESTE PERÍODO CONTRA O ANTERIOR',
  columnasComparacion: ['', 'Conceito', 'Este período', 'Período anterior', 'Diferença'],
  periodoAnterior: (desde: string, hasta: string) => `Período anterior: ${desde} a ${hasta}`,
  entro: 'Entrou',
  salio: 'Saiu',
  guarde: 'Guardei',
  teQuedo: 'Sobrou',
  notaGuarde: 'O que você guardou não sai de «Sobrou»: continua sendo seu dinheiro.',
  presupuesto: 'Seu orçamento',
  categoriasPasadas: (n: number) => (n === 1 ? '1 categoria passou do plano' : `${n} categorias passaram do plano`),
  ningunaPasada: 'Nenhuma categoria passou do plano',
  planeadoTotal: 'Planejado no total',
  gastadoEnLoPlaneado: 'Gasto no que foi planejado',
  gastadoSinPlan: 'Gasto fora do plano',
  fijos: 'Despesas fixas',
  fijosPagados: 'Pagas',
  fijosFalta: 'Falta pagar',
  deudas: 'Dívidas',
  debesHoy: 'Você deve hoje',
  pagadoEnElPeriodo: 'Pago no período',
  teDeben: 'O que te devem',
  teDebenHoy: (n: number) => (n === 1 ? '1 pessoa te deve, hoje' : `${n} pessoas te devem, hoje`),
  teDevolvieron: 'Te devolveram no período',
  prestaste: 'Você emprestou ou vendeu fiado no período',
  notaDevuelto: 'O que te devolveram não soma em «Entrou»: era dinheiro seu que voltou.',
  aHoy: 'hoje',

  columnasEnQueSeFue: ['#', 'Categoria', 'Gasto', 'Lançamentos', 'Do total', 'Orçamento', 'Diferença', '% usado'],
  contraElPlanDeHoy: (ciclos: number) => (ciclos === 1
    ? 'O orçamento é o de hoje, para um ciclo: se você mudou no meio, compara com o novo.'
    : `O orçamento é o de hoje, para ${ciclos} ciclos: se você mudou no meio, compara com o novo.`),
  presupuestoSoloPorCiclo:
    'O orçamento se mede de pagamento a pagamento: baixe o Excel de «Este ciclo», «Ciclo passado», um mês ou um ano para vê-lo ao lado do que você gastou.',
  planSinGastar: 'sem gastar',

  tusFijos: 'SUAS DESPESAS FIXAS',
  columnasFijos: ['#', 'Despesa', 'Categoria', 'Vence no dia', 'Valor', 'Gasto na categoria', 'Situação'],
  pagado: 'Paga',
  pendiente: 'Pendente',
  parcial: (falta: string) => `Faltam ${falta}`,
  sinDia: 'sem dia',
  reglaFijos:
    'Uma despesa fixa conta como paga se no período houve gastos da categoria pelo menos no valor dela. É a mesma regra que o Orden usa em Organização.',
  fijosSoloPorCiclo:
    'Paga ou pendente se mede dentro de um ciclo: neste período aparece o gasto em cada categoria, sem situação.',

  tusMetas: 'SUAS RESERVAS E METAS',
  columnasMetas: ['#', 'Reserva', 'Guardado no período', 'Saldo hoje', 'Meta', 'Data limite', 'Falta', 'Por mês para chegar'],
  metaCumplida: 'Meta cumprida',
  fechaPasada: 'A data já passou',
  sinMeta: 'sem meta',
  notaMetas:
    '«Saldo hoje», «Falta» e «Por mês» são de hoje, não do período. Uma reserva em outra moeda mostra saldo e meta nessa moeda.',

  tusDeudas: 'SUAS DÍVIDAS',
  columnasDeudas: ['#', 'Dívida', 'Tipo', 'Com quem', 'Valor original', 'Pago no período', 'Saldo hoje', 'Parcelas', 'Parcela', 'Próximo vencimento'],
  tipoDeuda: { tarjeta: 'Cartão', prestamo: 'Empréstimo', proveedor: 'Fornecedor', otro: 'Outro' } as Record<string, string>,
  cuotasDe: (pagadas: number, total: number) => `${pagadas} de ${total}`,
  vencida: 'vencida',
  pagosDelPeriodo: 'PAGAMENTOS DO PERÍODO',
  columnasPagos: ['#', 'Data', 'Dívida', 'Valor', 'Nota'],
  sinPagos: 'Você não pagou dívidas neste período.',

  columnasMovimientos: ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Valor', 'Situação'],
};

export function textosPersonalExcel(idioma?: string | null): TextosPersonalExcel {
  return idioma === 'pt' ? pt : es;
}
