/**
 * LO QUE DICE EL EXCEL, EN CADA IDIOMA.
 *
 * No vive en i18n/textos con el resto porque reporte.ts se compila suelto,
 * sin Next, para las pruebas (probar:calculos), y todo lo que importa tiene
 * que estar en src/lib. El idioma lo elige la ruta /api/excel: el de quien
 * baja el archivo.
 *
 * Los nombres de las categorías y de las formas de pago no están acá. Se
 * guardan en español y la ruta los pasa por i18n/nombres antes de armar el
 * libro, igual que hacen las pantallas.
 */
const es = {
  locale: 'es-PY',
  negocio: 'Negocio',
  enMoneda: (moneda: string) => ` en ${moneda}`,
  periodoUnDia: (dia: string) => `Periodo: ${dia}`,
  periodoRango: (desde: string, hasta: string) => `Periodo: ${desde} al ${hasta}`,
  conCambio: (periodo: string, simbolo: string, cuando: string | null, propia: string, cambio: string) =>
    `${periodo} · En ${simbolo}, al cambio${cuando ? ` del ${cuando}` : ''}: 1 ${simbolo} = ${propia} ${cambio}`,
  /**
   * Lo mismo dicho al revés, cuando la moneda que se mira vale menos de 1
   * de la propia (un negocio en dólares mirando en guaraníes): «1 US$ =
   * Gs. 6.000» se lee; «1 Gs. = US$ 0,000167» no.
   */
  conCambioInverso: (periodo: string, simbolo: string, cuando: string | null, propia: string, cambio: string) =>
    `${periodo} · En ${simbolo}, al cambio${cuando ? ` del ${cuando}` : ''}: 1 ${propia} = ${simbolo} ${cambio}`,
  paraTenerEnCuenta: 'PARA TENER EN CUENTA',
  noSumanEnNingunTotal: 'no suman en ningún total',
  sinDescripcion: 'sin descripción',
  gastoMasGrande: (descripcion: string, plata: string) => `El gasto más grande: ${descripcion} — ${plata}`,

  hojaResumen: 'Resumen',
  hojaProductos: 'Productos',
  hojaMovimientos: 'Movimientos',
  hojaGastos: 'Gastos',
  hojaDiaPorDia: 'Día por día',
  hojaEnQueSeFue: 'En qué se fue',
  hojaDeDondeVino: 'De dónde vino',
  hojaAhorro: 'Ahorro',
  // Las campañas y las liquidaciones del campo (100). Solo en un negocio de
  // ciclos largos (`fichaDe(...).ciclosLargos`); las hojas hablan de
  // «campaña» porque el Excel lo baja el contador, no el ganadero.
  hojaCampanas: 'Campañas',
  hojaLiquidaciones: 'Liquidaciones',

  // ---- el libro de un negocio ----
  resumenEjecutivo: 'RESUMEN EJECUTIVO',
  entroPlata: 'Entró plata',
  ventasPrecioLista: 'Ventas a precio de lista',
  operaciones: (n: number) => `${n} operaciones`,
  descuentosOtorgados: 'Descuentos otorgados',
  ventasCobradas: 'Ventas cobradas',
  otrosIngresos: 'Otros ingresos',
  totalQueEntro: 'Total que entró',
  costosYGastos: 'Costos y gastos',
  costoMercaderia: 'Costo de la mercadería vendida',
  gastosOperativos: 'Gastos operativos',
  totalQueSalio: 'Total que salió',
  resultado: 'Resultado',
  gananciaBruta: 'Ganancia bruta',
  gananciaNeta: 'Ganancia neta',
  margen: (pct: string) => `margen ${pct}%`,
  indicadores: 'Indicadores',
  ticketPromedio: 'Ticket promedio',
  unidadesVendidas: 'Unidades vendidas',
  productosDistintos: 'Productos distintos vendidos',
  promedioVentasDia: 'Promedio de ventas por día',
  ventasAnuladas: 'Ventas anuladas',
  montoVentasAnuladas: 'Monto de ventas anuladas',
  loQueMasDejo: (nombre: string, unidades: string) => `Lo que más dejó: ${nombre} — ${unidades} unidades`,
  conGanancia: (plata: string) => `, ganancia ${plata}`,
  gastasteMasQueGanaste: 'Atención: en este periodo gastaste más de lo que ganaste.',
  disteDescuentos: (plata: string, pct: string) => `Diste ${plata} en descuentos: el ${pct}% de tu precio de lista.`,
  seAnularon: (movimientos: number, ventas: number) =>
    `Se anularon ${movimientos} movimiento(s), de los cuales ${ventas} son ventas. `
    + 'Figuran en el detalle pero no suman en ningún total.',
  sinVentas: 'No se registraron ventas en este periodo.',

  productosVendidos: 'PRODUCTOS VENDIDOS · DE MAYOR A MENOR',
  columnasProductos: ['#', 'Producto', 'Unidades', 'Precio lista', 'Descuento', 'Cobrado', 'Costo', 'Ganancia', 'Margen', 'Participación'],
  noSeVendieron: (n: number) => `NO SE VENDIERON EN ESTE PERIODO (${n})`,
  columnasQuietos: ['', 'Producto', 'Stock', 'Precio', 'Costo', 'Plata parada'],

  detalleMovimientos: 'DETALLE DE MOVIMIENTOS',
  columnasMovimientos: [
    'Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cobro/Pago',
    'Subtotal', 'Descuento', 'Cobrado', 'Costo', 'Ganancia', 'Estado',
  ],
  venta: 'Venta',
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  anulada: 'ANULADA',
  valida: 'Válida',
  totalSinAnuladas: 'TOTAL DEL PERIODO (sin anuladas)',

  enQueSeFueLaPlata: 'EN QUÉ SE FUE LA PLATA',
  columnasGastos: ['#', 'Categoría', 'Total gastado', 'Movimientos', 'Del total'],

  resultadoDeCadaDia: 'RESULTADO DE CADA DÍA',
  columnasDias: ['', 'Fecha', 'Vendido', 'Gastado', 'Ganancia del día'],

  // ---- las campañas (100) ----
  /**
   * La columna nueva de Movimientos: de qué campaña es cada uno (vacía si
   * de ninguna). Solo en ciclo largo, al final, para no correr las columnas
   * de siempre.
   */
  columnaCampana: 'Campaña',
  campanasTitulo: 'CAMPAÑAS · UNA FILA POR CAMPAÑA',
  columnasCampanas: [
    'Lote', 'Cultivo', 'Campaña', 'Hectáreas', 'Estado', 'Desde', 'Hasta',
    'Puesto', 'A cosecha', 'Costo', 'Costo/ha', 'Cobrado', 'Resultado', 'Resultado/ha',
    'kg cosechados', 'kg/ha', 'kg vendidos', 'Precio promedio/t', 'kg sin vender',
  ],
  abierta: 'Abierta',
  cerrada: 'Cerrada',
  sinCampanas: 'Todavía no hay campañas cargadas.',
  campanasSonDeCaja: 'Puesto, cobrado y resultado son de caja: plata que entró menos plata que salió. '
    + '«A cosecha» es lo que se debe todavía y cuenta en el costo, no en el resultado.',
  /** Una campaña cruza los meses: su fila no se recorta al período de la planilla. */
  campanasEnteras: 'Las campañas que estuvieron abiertas en este periodo, con los números de toda la campaña '
    + '(no solo de estas fechas).',
  liquidacionesTitulo: 'LIQUIDACIONES · UNA FILA POR CAMPAÑA Y PAPEL',
  columnasLiquidaciones: [
    'Fecha', 'Campaña', 'Comprador', 'kg', 'Precio/t', 'Bruto',
    'Descuentos', 'Compensado de deudas', 'Pagado con grano', 'Neto', 'Estado',
  ],
  activa: 'Activa',
  sinLiquidaciones: 'Todavía no hay liquidaciones cargadas.',
  totalLiquidaciones: 'TOTAL (sin anuladas)',

  // ---- el libro de una persona ----
  tusNumeros: 'TUS NÚMEROS DEL PERIODO',
  loQueEntro: 'Lo que entró',
  sinIngresos: 'Todavía no cargaste ningún ingreso',
  veces: (n: number) => (n === 1 ? '1 vez' : `${n} veces`),
  loQueSalio: 'Lo que salió',
  sinGastos: 'Todavía no cargaste ningún gasto',
  deTusGastos: (pct: string) => `${pct}% de tus gastos`,
  otrasCategorias: (n: number) => `Otras ${n} categorías`,
  loQueGuardaste: 'Lo que guardaste',
  depositadoEnFondos: 'Depositado en tus fondos',
  retiradoDeFondos: 'Retirado de tus fondos',
  guardadoEnElPeriodo: 'Guardado en el periodo',
  teQuedo: 'Te quedó',
  entroMenosSalio: 'lo que entró menos lo que salió',
  yaEstaGuardado: 'De eso, ya está guardado',
  sigueSiendoTuyo: 'sigue siendo tuyo, no es un gasto',
  paraMirarloDeCerca: 'Para mirarlo de cerca',
  gastoPromedioDia: 'Gasto promedio por día',
  diasDelPeriodo: (n: number) => `${n} días del periodo`,
  diasConAlgo: 'Días en que cargaste algo',
  delTotalGastaste: 'Del total que entró, gastaste',
  movimientosAnulados: 'Movimientos anulados',
  dondeMasSeFue: (categoria: string, plata: string, pct: string) =>
    `Donde más se te fue: ${categoria} — ${plata}, el ${pct}% de todo lo que gastaste.`,
  guardaste: (plata: string) =>
    `Guardaste ${plata} en el periodo. Esa plata no figura como gasto en ninguna hoja: la seguís teniendo.`,
  sinNada: 'Todavía no cargaste nada en este periodo. Contale un gasto por voz y en diez segundos ya tenés tu primer número.',
  gastosSinIngresos: 'Cargaste gastos pero ningún ingreso. Anotá tu sueldo y vas a ver de verdad cuánto te queda cada mes.',
  gastasteDeMas: (plata: string) => `En este periodo gastaste ${plata} más de lo que entró.`,
  sobro: (plata: string) =>
    `Te quedaron ${plata} sin gastar. Si creás un fondo de ahorro, esa plata deja de estar suelta y le ponés un destino.`,
  nadaGastado: 'Nada gastado en este periodo.',
  deDondeVinoLaPlata: 'DE DÓNDE VINO LA PLATA',
  columnasIngresos: ['#', 'Categoría', 'Total que entró', 'Veces', 'Del total'],
  nadaCargado: 'Nada cargado en este periodo.',
  tusFondos: 'TUS FONDOS DE AHORRO',
  columnasFondos: ['#', 'Fondo', 'Depositado', 'Retirado', 'Guardado', 'Saldo a hoy'],
  avisoSaldoAHoy: 'La columna «Saldo a hoy» es el total acumulado de cada fondo, de siempre: '
    + 'no pertenece al periodo de esta planilla y por eso no se suma en la fila del total.',
  todoLoQueCargaste: 'TODO LO QUE CARGASTE',
  columnasMovimientosPersona: ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cómo', 'Monto', 'Estado'],
  anulado: 'ANULADO',
  valido: 'Válido',
  totalSinAnulados: 'TOTAL DEL PERIODO (sin anulados)',
  comoVinoCadaDia: 'CÓMO VINO CADA DÍA',
  columnasDiasPersona: ['', 'Fecha', 'Entró', 'Salió', 'Diferencia'],
};

export type TextosExcel = typeof es;

const pt: TextosExcel = {
  locale: 'pt-BR',
  negocio: 'Negócio',
  enMoneda: (moneda: string) => ` em ${moneda}`,
  periodoUnDia: (dia: string) => `Período: ${dia}`,
  periodoRango: (desde: string, hasta: string) => `Período: ${desde} a ${hasta}`,
  conCambio: (periodo: string, simbolo: string, cuando: string | null, propia: string, cambio: string) =>
    `${periodo} · Em ${simbolo}, ao câmbio${cuando ? ` de ${cuando}` : ''}: 1 ${simbolo} = ${propia} ${cambio}`,
  conCambioInverso: (periodo: string, simbolo: string, cuando: string | null, propia: string, cambio: string) =>
    `${periodo} · Em ${simbolo}, ao câmbio${cuando ? ` de ${cuando}` : ''}: 1 ${propia} = ${simbolo} ${cambio}`,
  paraTenerEnCuenta: 'PRA LEVAR EM CONTA',
  noSumanEnNingunTotal: 'não entram em nenhum total',
  sinDescripcion: 'sem descrição',
  gastoMasGrande: (descripcion: string, plata: string) => `A maior despesa: ${descripcion} — ${plata}`,

  hojaResumen: 'Resumo',
  hojaProductos: 'Produtos',
  hojaMovimientos: 'Lançamentos',
  hojaGastos: 'Despesas',
  hojaDiaPorDia: 'Dia a dia',
  hojaEnQueSeFue: 'Pra onde foi',
  hojaDeDondeVino: 'De onde veio',
  hojaAhorro: 'Reserva',
  hojaCampanas: 'Safras',
  hojaLiquidaciones: 'Liquidações',

  resumenEjecutivo: 'RESUMO EXECUTIVO',
  entroPlata: 'Entrou dinheiro',
  ventasPrecioLista: 'Vendas a preço de tabela',
  operaciones: (n: number) => `${n} operações`,
  descuentosOtorgados: 'Descontos concedidos',
  ventasCobradas: 'Vendas recebidas',
  otrosIngresos: 'Outras entradas',
  totalQueEntro: 'Total que entrou',
  costosYGastos: 'Custos e despesas',
  costoMercaderia: 'Custo da mercadoria vendida',
  gastosOperativos: 'Despesas operacionais',
  totalQueSalio: 'Total que saiu',
  resultado: 'Resultado',
  gananciaBruta: 'Lucro bruto',
  gananciaNeta: 'Lucro líquido',
  margen: (pct: string) => `margem ${pct}%`,
  indicadores: 'Indicadores',
  ticketPromedio: 'Ticket médio',
  unidadesVendidas: 'Unidades vendidas',
  productosDistintos: 'Produtos diferentes vendidos',
  promedioVentasDia: 'Média de vendas por dia',
  ventasAnuladas: 'Vendas anuladas',
  montoVentasAnuladas: 'Valor das vendas anuladas',
  loQueMasDejo: (nombre: string, unidades: string) => `O que mais rendeu: ${nombre} — ${unidades} unidades`,
  conGanancia: (plata: string) => `, lucro ${plata}`,
  gastasteMasQueGanaste: 'Atenção: neste período você gastou mais do que ganhou.',
  disteDescuentos: (plata: string, pct: string) => `Você deu ${plata} em descontos: ${pct}% do seu preço de tabela.`,
  seAnularon: (movimientos: number, ventas: number) =>
    `Foram anulados ${movimientos} lançamento(s), dos quais ${ventas} são vendas. `
    + 'Aparecem no detalhe, mas não entram em nenhum total.',
  sinVentas: 'Não houve vendas registradas neste período.',

  productosVendidos: 'PRODUTOS VENDIDOS · DO MAIOR AO MENOR',
  columnasProductos: ['#', 'Produto', 'Unidades', 'Preço de tabela', 'Desconto', 'Recebido', 'Custo', 'Lucro', 'Margem', 'Participação'],
  noSeVendieron: (n: number) => `NÃO FORAM VENDIDOS NESTE PERÍODO (${n})`,
  columnasQuietos: ['', 'Produto', 'Estoque', 'Preço', 'Custo', 'Dinheiro parado'],

  detalleMovimientos: 'DETALHE DOS LANÇAMENTOS',
  columnasMovimientos: [
    'Data', 'Tipo', 'Descrição', 'Categoria', 'Forma de pagamento',
    'Subtotal', 'Desconto', 'Recebido', 'Custo', 'Lucro', 'Situação',
  ],
  venta: 'Venda',
  gasto: 'Despesa',
  ingreso: 'Entrada',
  anulada: 'ANULADA',
  valida: 'Válida',
  totalSinAnuladas: 'TOTAL DO PERÍODO (sem anuladas)',

  enQueSeFueLaPlata: 'PRA ONDE FOI O DINHEIRO',
  columnasGastos: ['#', 'Categoria', 'Total gasto', 'Lançamentos', 'Do total'],

  resultadoDeCadaDia: 'RESULTADO DE CADA DIA',
  columnasDias: ['', 'Data', 'Vendido', 'Despesas', 'Lucro do dia'],

  columnaCampana: 'Safra',
  campanasTitulo: 'SAFRAS · UMA LINHA POR SAFRA',
  // «Lote», como no espanhol: a planilha também serve pro pecuarista, e o
  // contador lê «lote» sem estranhar.
  columnasCampanas: [
    'Lote', 'Cultura', 'Safra', 'Hectares', 'Situação', 'De', 'Até',
    'Investido', 'Na colheita', 'Custo', 'Custo/ha', 'Recebido', 'Resultado', 'Resultado/ha',
    'kg colhidos', 'kg/ha', 'kg vendidos', 'Preço médio/t', 'kg a vender',
  ],
  abierta: 'Aberta',
  cerrada: 'Fechada',
  sinCampanas: 'Ainda não há safras lançadas.',
  campanasSonDeCaja: 'Investido, recebido e resultado são de caixa: dinheiro que entrou menos dinheiro que saiu. '
    + '«Na colheita» é o que ainda se deve e conta no custo, não no resultado.',
  campanasEnteras: 'As safras que estiveram abertas neste período, com os números da safra inteira '
    + '(não só destas datas).',
  liquidacionesTitulo: 'LIQUIDAÇÕES · UMA LINHA POR SAFRA E PAPEL',
  columnasLiquidaciones: [
    'Data', 'Safra', 'Comprador', 'kg', 'Preço/t', 'Bruto',
    'Descontos', 'Compensado de dívidas', 'Pago com grão', 'Líquido', 'Situação',
  ],
  activa: 'Ativa',
  sinLiquidaciones: 'Ainda não há liquidações lançadas.',
  totalLiquidaciones: 'TOTAL (sem anuladas)',

  tusNumeros: 'SEUS NÚMEROS DO PERÍODO',
  loQueEntro: 'O que entrou',
  sinIngresos: 'Você ainda não lançou nenhuma entrada',
  veces: (n: number) => (n === 1 ? '1 vez' : `${n} vezes`),
  loQueSalio: 'O que saiu',
  sinGastos: 'Você ainda não lançou nenhuma despesa',
  deTusGastos: (pct: string) => `${pct}% das suas despesas`,
  otrasCategorias: (n: number) => `Outras ${n} categorias`,
  loQueGuardaste: 'O que você guardou',
  depositadoEnFondos: 'Depositado nas suas reservas',
  retiradoDeFondos: 'Retirado das suas reservas',
  guardadoEnElPeriodo: 'Guardado no período',
  teQuedo: 'Sobrou',
  entroMenosSalio: 'o que entrou menos o que saiu',
  yaEstaGuardado: 'Disso, já está guardado',
  sigueSiendoTuyo: 'continua sendo seu, não é uma despesa',
  paraMirarloDeCerca: 'Pra olhar de perto',
  gastoPromedioDia: 'Gasto médio por dia',
  diasDelPeriodo: (n: number) => `${n} dias do período`,
  diasConAlgo: 'Dias em que você lançou algo',
  delTotalGastaste: 'Do total que entrou, você gastou',
  movimientosAnulados: 'Lançamentos anulados',
  dondeMasSeFue: (categoria: string, plata: string, pct: string) =>
    `Onde mais foi o dinheiro: ${categoria} — ${plata}, ${pct}% de tudo o que você gastou.`,
  guardaste: (plata: string) =>
    `Você guardou ${plata} no período. Esse dinheiro não aparece como despesa em nenhuma aba: continua sendo seu.`,
  sinNada: 'Você ainda não lançou nada neste período. Fale uma despesa por voz e em dez segundos já tem seu primeiro número.',
  gastosSinIngresos: 'Você lançou despesas, mas nenhuma entrada. Anote seu salário e vai ver de verdade quanto sobra a cada mês.',
  gastasteDeMas: (plata: string) => `Neste período você gastou ${plata} a mais do que entrou.`,
  sobro: (plata: string) =>
    `Sobraram ${plata} sem gastar. Se você criar uma reserva, esse dinheiro deixa de ficar solto e ganha um destino.`,
  nadaGastado: 'Nada gasto neste período.',
  deDondeVinoLaPlata: 'DE ONDE VEIO O DINHEIRO',
  columnasIngresos: ['#', 'Categoria', 'Total que entrou', 'Vezes', 'Do total'],
  nadaCargado: 'Nada lançado neste período.',
  tusFondos: 'SUAS RESERVAS',
  columnasFondos: ['#', 'Reserva', 'Depositado', 'Retirado', 'Guardado', 'Saldo hoje'],
  avisoSaldoAHoy: 'A coluna «Saldo hoje» é o total acumulado de cada reserva, desde sempre: '
    + 'não pertence ao período desta planilha e por isso não entra na linha do total.',
  todoLoQueCargaste: 'TUDO O QUE VOCÊ LANÇOU',
  columnasMovimientosPersona: ['Data', 'Tipo', 'Descrição', 'Categoria', 'Como', 'Valor', 'Situação'],
  anulado: 'ANULADO',
  valido: 'Válido',
  totalSinAnulados: 'TOTAL DO PERÍODO (sem anulados)',
  comoVinoCadaDia: 'COMO FOI CADA DIA',
  columnasDiasPersona: ['', 'Data', 'Entrou', 'Saiu', 'Diferença'],
};

/** Los textos del Excel en ese idioma. Sin idioma, o uno que no hay, español. */
export function textosExcel(idioma?: string | null): TextosExcel {
  return idioma === 'pt' ? pt : es;
}
