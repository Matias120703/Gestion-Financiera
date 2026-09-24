/**
 * LO QUE DICE EL EXCEL DEL CAMPO, EN CADA IDIOMA (23/09).
 *
 * Vive en src/lib y no en i18n por lo mismo que `reporte-textos.ts`: el
 * libro se compila suelto para las pruebas (`probar:calculos`). Lo que ya
 * dice el libro de siempre (los nombres de Resumen, Campañas, Liquidaciones,
 * Movimientos y Gastos) sale de `textosExcel`, así la hoja se llama igual en
 * los dos archivos y en la tarjeta de descarga.
 *
 * Dos oficios en un mismo libro: el agricultor habla de campañas, cosechas y
 * lo que debe «a cosecha»; el ganadero, de lotes con cabezas y lo que debe
 * «a la venta» (la misma deuda atada al lote). Cada texto que cambia entre
 * los dos va en par: `...Agro` y `...Lotes`.
 */
const es = {
  // ---- las hojas nuevas ----
  hojaCosechas: 'Cosechas',
  hojaLotes: 'Lotes',
  hojaDeudasAgro: 'Deudas a cosecha',
  hojaDeudasLotes: 'Deudas de los lotes',

  // ---- el resumen ----
  resumenTitulo: 'RESUMEN · LA CAJA DEL PERIODO',
  entroPlata: 'Entró plata',
  cobradoVentas: 'Cobrado por ventas',
  /** Debajo de «Cobrado por ventas»: la venta del grano entra por la liquidación. */
  incluyeLiquidaciones: 'incluye lo liquidado',
  operaciones: (n: number) => (n === 1 ? '1 venta' : `${n} ventas`),
  otrosIngresos: 'Otros ingresos',
  totalQueEntro: 'Total que entró',
  salioPlata: 'Salió plata',
  gastos: 'Gastos',
  compraMercaderia: 'Compra de mercadería',
  aparte: 'va aparte: tiene costo cargado',
  totalQueSalio: 'Total que salió',
  campanasBloque: 'Las campañas',
  lotesBloque: 'Los lotes',
  delPeriodoAgro: 'Campañas abiertas en algún momento del periodo',
  delPeriodoLotes: 'Lotes abiertos en algún momento del periodo',
  yaCerradasAgro: 'De esas, ya cerradas',
  yaCerradasLotes: 'De esos, ya cerrados',
  liquidado: 'Liquidado en el periodo (bruto)',
  kgCosechados: 'kg cosechados en el periodo',
  debesAgro: 'Debés a cosecha (hoy)',
  debesLotes: 'Debés atado a los lotes (hoy)',
  paraTenerEnCuenta: 'PARA TENER EN CUENTA',
  sinResultadoAgro: 'El resultado de verdad es el de cada campaña (hoja Campañas): lo gastado este mes en una '
    + 'campaña que se cosecha más adelante no es una pérdida del mes.',
  sinResultadoLotes: 'El resultado de verdad es el de cada lote (hoja Lotes): lo gastado este mes en un lote que '
    + 'se vende más adelante no es una pérdida del mes.',
  gastoMasGrande: (descripcion: string, plata: string) => `El gasto más grande: ${descripcion} — ${plata}`,
  seAnularon: (n: number) =>
    `Se anularon ${n} movimiento(s). Figuran en el detalle pero no suman en ningún total.`,

  // ---- campañas (agricultura) ----
  /** Las de siempre (`columnasCampanas`) más cuatro al final, para no correr las fórmulas armadas. */
  columnasCampanasExtra: ['Precio esperado/t', 'Costo/t', 'kg/ha para cubrir', 'Falta cubrir'],

  // ---- lotes (ganadería) ----
  lotesTitulo: 'LOTES · UNA FILA POR LOTE',
  columnasLotes: [
    'Lote', 'Cantidad', 'Unidad', 'Estado', 'Desde', 'Hasta', 'Días',
    'Puesto', 'A la venta', 'Costo', 'Costo por unidad', 'Cobrado', 'Resultado',
    'Resultado por unidad', 'Por unidad y día',
  ],
  sinLotes: 'Todavía no hay lotes cargados.',
  lotesEnteros: 'Los lotes que estuvieron abiertos en este periodo, con los números de todo el lote '
    + '(no solo de estas fechas).',
  lotesSonDeCaja: 'Puesto, cobrado y resultado son de caja: plata que entró menos plata que salió. '
    + '«A la venta» es lo que se debe todavía y cuenta en el costo, no en el resultado. '
    + '«Por unidad» es por cada una de la cantidad del lote (una cabeza, si cuenta cabezas).',

  // ---- cosechas ----
  cosechasTitulo: 'COSECHAS DEL PERIODO · UN TICKET POR FILA',
  columnasCosechas: ['Fecha', 'Campaña', 'Ticket', 'Destino', 'kg brutos', 'kg netos', 'Humedad %'],
  totalCosechas: 'TOTAL',

  // ---- liquidaciones: las de siempre más la moneda del papel ----
  columnasLiquidacionesExtra: ['Moneda del papel', 'Precio del papel/t', 'Cambio'],

  // ---- movimientos ----
  movimientosTitulo: 'DETALLE DE MOVIMIENTOS',
  columnasMovimientos: [
    'Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cobro/Pago', 'Cuenta', 'Monto',
    'Moneda original', 'Monto original', 'Cambio',
  ],
  columnaCampana: 'Campaña',
  columnaLote: 'Lote',
  columnaEstado: 'Estado',
  venta: 'Venta',
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  anulada: 'ANULADA',
  valida: 'Válida',
  totalSinAnuladas: 'TOTAL DEL PERIODO (sin anuladas)',

  // ---- deudas ----
  deudasTituloAgro: 'LO QUE DEBÉS A COSECHA · A LA FECHA DE DESCARGA',
  deudasTituloLotes: 'LO QUE DEBÉS ATADO A LOS LOTES · A LA FECHA DE DESCARGA',
  columnasDeudasAgro: ['Acreedor', 'Deuda', 'Categoría', 'Campaña', 'Saldo', 'Vence'],
  columnasDeudasLotes: ['Acreedor', 'Deuda', 'Categoría', 'Lote', 'Saldo', 'Vence'],
  totalDeudas: 'TOTAL',
  deudasEsFoto: 'Es lo que se debe hoy, no en el periodo: cerrar una campaña no salda la deuda.',
  sinCategoria: 'Deudas',

  // ---- gastos ----
  gastosTitulo: 'EN QUÉ SE FUE LA PLATA',
  sinGastos: 'No hubo gastos en este periodo.',
};

export type TextosCampo = typeof es;

const pt: TextosCampo = {
  hojaCosechas: 'Colheitas',
  hojaLotes: 'Lotes',
  hojaDeudasAgro: 'Dívidas na colheita',
  hojaDeudasLotes: 'Dívidas dos lotes',

  resumenTitulo: 'RESUMO · O CAIXA DO PERÍODO',
  entroPlata: 'Entrou dinheiro',
  cobradoVentas: 'Recebido por vendas',
  incluyeLiquidaciones: 'inclui o liquidado',
  operaciones: (n: number) => (n === 1 ? '1 venda' : `${n} vendas`),
  otrosIngresos: 'Outras entradas',
  totalQueEntro: 'Total que entrou',
  salioPlata: 'Saiu dinheiro',
  gastos: 'Despesas',
  compraMercaderia: 'Compra de mercadoria',
  aparte: 'vai à parte: tem custo lançado',
  totalQueSalio: 'Total que saiu',
  campanasBloque: 'As safras',
  lotesBloque: 'Os lotes',
  delPeriodoAgro: 'Safras abertas em algum momento do período',
  delPeriodoLotes: 'Lotes abertos em algum momento do período',
  yaCerradasAgro: 'Dessas, já fechadas',
  yaCerradasLotes: 'Desses, já fechados',
  liquidado: 'Liquidado no período (bruto)',
  kgCosechados: 'kg colhidos no período',
  debesAgro: 'Você deve na colheita (hoje)',
  debesLotes: 'Você deve atrelado aos lotes (hoje)',
  paraTenerEnCuenta: 'PRA LEVAR EM CONTA',
  sinResultadoAgro: 'O resultado de verdade é o de cada safra (aba Safras): o que se gastou este mês numa safra '
    + 'que se colhe mais adiante não é uma perda do mês.',
  sinResultadoLotes: 'O resultado de verdade é o de cada lote (aba Lotes): o que se gastou este mês num lote que '
    + 'se vende mais adiante não é uma perda do mês.',
  gastoMasGrande: (descripcion: string, plata: string) => `A maior despesa: ${descripcion} — ${plata}`,
  seAnularon: (n: number) =>
    `Foram anulados ${n} lançamento(s). Aparecem no detalhe mas não entram em nenhum total.`,

  columnasCampanasExtra: ['Preço esperado/t', 'Custo/t', 'kg/ha pra cobrir', 'Falta cobrir'],

  lotesTitulo: 'LOTES · UMA LINHA POR LOTE',
  columnasLotes: [
    'Lote', 'Quantidade', 'Unidade', 'Situação', 'De', 'Até', 'Dias',
    'Investido', 'Na venda', 'Custo', 'Custo por unidade', 'Recebido', 'Resultado',
    'Resultado por unidade', 'Por unidade e dia',
  ],
  sinLotes: 'Ainda não há lotes lançados.',
  lotesEnteros: 'Os lotes que estiveram abertos neste período, com os números do lote inteiro '
    + '(não só destas datas).',
  lotesSonDeCaja: 'Investido, recebido e resultado são de caixa: dinheiro que entrou menos dinheiro que saiu. '
    + '«Na venda» é o que ainda se deve e conta no custo, não no resultado. '
    + '«Por unidade» é por cada uma da quantidade do lote (uma cabeça, se conta cabeças).',

  cosechasTitulo: 'COLHEITAS DO PERÍODO · UM ROMANEIO POR LINHA',
  columnasCosechas: ['Data', 'Safra', 'Romaneio', 'Destino', 'kg brutos', 'kg líquidos', 'Umidade %'],
  totalCosechas: 'TOTAL',

  columnasLiquidacionesExtra: ['Moeda do papel', 'Preço do papel/t', 'Câmbio'],

  movimientosTitulo: 'DETALHE DOS LANÇAMENTOS',
  columnasMovimientos: [
    'Data', 'Tipo', 'Descrição', 'Categoria', 'Recebimento/Pagamento', 'Conta', 'Valor',
    'Moeda original', 'Valor original', 'Câmbio',
  ],
  columnaCampana: 'Safra',
  columnaLote: 'Lote',
  columnaEstado: 'Situação',
  venta: 'Venda',
  gasto: 'Despesa',
  ingreso: 'Entrada',
  anulada: 'ANULADA',
  valida: 'Válida',
  totalSinAnuladas: 'TOTAL DO PERÍODO (sem anuladas)',

  deudasTituloAgro: 'O QUE VOCÊ DEVE NA COLHEITA · NA DATA DO DOWNLOAD',
  deudasTituloLotes: 'O QUE VOCÊ DEVE ATRELADO AOS LOTES · NA DATA DO DOWNLOAD',
  columnasDeudasAgro: ['Credor', 'Dívida', 'Categoria', 'Safra', 'Saldo', 'Vence'],
  columnasDeudasLotes: ['Credor', 'Dívida', 'Categoria', 'Lote', 'Saldo', 'Vence'],
  totalDeudas: 'TOTAL',
  deudasEsFoto: 'É o que se deve hoje, não no período: fechar uma safra não quita a dívida.',
  sinCategoria: 'Dívidas',

  gastosTitulo: 'PRA ONDE FOI O DINHEIRO',
  sinGastos: 'Não houve despesas neste período.',
};

/** Los textos del Excel del campo en ese idioma. Sin idioma, o uno que no hay, español. */
export function textosCampo(idioma?: string | null): TextosCampo {
  return idioma === 'pt' ? pt : es;
}
