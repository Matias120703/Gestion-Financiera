/**
 * TEXTOS DEL REPORTE DE agricultura y ganadería: campañas con hectáreas o lotes con cabezas.
 *
 * El diccionario lo incluye como `t.reportesCampo` (ver es.ts y pt.ts). Lo
 * usa el componente `src/components/reportes/ReporteCampo.tsx`; lo que es de
 * todos los reportes (rango, indicador, gráfico, descarga) está en
 * `reportes-comunes.ts`. Los textos del Excel NO van acá: el libro se
 * compila suelto para las pruebas y los lleva en src/lib/reportes
 * (`textos-campo.ts`).
 *
 * Dos oficios con el mismo reporte: lo que cambia entre el agricultor
 * (campañas, hectáreas, «a cosecha») y el ganadero (lotes, cabezas, «a la
 * venta») va en par, `agro` y `lotes`, y el componente elige por la ficha.
 * No se pisa con la jerga (textos/agricultura.ts) porque el diccionario de
 * la jerga no es de este reporte. Lo que se dice igual en los dos oficios va
 * suelto. Las palabras de la tarjeta de cada campaña («Costo», «por
 * hectárea», «Necesitás … kg/ha») salen de `t.panelCampo.tarjeta`: son las
 * mismas del panel, así el productor lee lo mismo en los dos lugares.
 */
export const reportesCampoEs = {
  agro: {
    titulo: 'Campañas de estas fechas',
    detalle: 'Las que estuvieron abiertas en algún momento del período, con los números de toda la campaña: una campaña no se corta por mes.',
    vacio: 'Ninguna campaña abierta en estas fechas',
    vacioDetalle: 'Elegí otro período, o abrí una campaña en Campañas y cargale lo que le vas poniendo.',
    debes: 'Lo que debés a cosecha',
    debesDetalle: 'Es lo que se debe hoy, no en el período: cerrar una campaña no salda la deuda.',
    /** Debajo de «Cobrado»: la venta del grano entra por la liquidación, y cuenta. */
    ventasN: (n: string) => `${n} ventas, contando las liquidaciones`,
  },
  lotes: {
    titulo: 'Lotes de estas fechas',
    detalle: 'Los que estuvieron abiertos en algún momento del período, con los números de todo el lote: un lote no se corta por mes.',
    vacio: 'Ningún lote abierto en estas fechas',
    vacioDetalle: 'Elegí otro período, o abrí un lote en Lotes y cargale lo que le vas poniendo.',
    debes: 'Lo que debés atado a los lotes',
    debesDetalle: 'Es lo que se debe hoy, no en el período: cerrar un lote no salda la deuda.',
    ventasN: (n: string) => `${n} ventas`,
  },

  /** La pastilla de cada tarjeta. */
  abierta: 'En curso',
  cerrada: 'Cerrada',
  /** «cerró el 15 sep 2026». */
  cerroEl: (fecha: string) => `cerró el ${fecha}`,
  /** Ganadería: «2.500 por cabeza por día». */
  porUnidadYDia: (monto: string, unidad: string) => `${monto} por ${unidad.replace(/s$/, '')} por día`,
  /** «Costo por cabeza», debajo del costo del lote. */
  costoPorUnidad: (monto: string, unidad: string) => `${monto} por ${unidad.replace(/s$/, '')}`,
  faltaCubrir: (monto: string) => `Falta cubrir ${monto}`,
  aCosecha: (monto: string) => `Debés ${monto} a cosecha`,
  aLaVenta: (monto: string) => `Debés ${monto} a la venta`,
  esDeCaja: 'Todo es de caja: plata que entró menos plata que salió. Lo que se debe cuenta en el costo, no en el resultado.',

  /** La caja del período, abajo y como apoyo. */
  caja: 'La caja de estas fechas',
  cajaDetalle: 'Lo que entró y salió en el período. El resultado de verdad es el de cada campaña o lote: lo gastado este mes en algo que se vende más adelante no es una pérdida del mes.',
  cobrado: 'Cobrado',
  gastos: 'Gastos',
  /** Debajo de Gastos, si la compra de mercadería va aparte (106). */
  masMercaderia: (monto: string) => `+ ${monto} de mercadería, aparte`,
  otrosIngresos: 'Otros ingresos',
  otrosIngresosDetalle: 'Préstamos y aportes también caen acá',

  /** La lista de deudas. */
  vence: (fecha: string) => `vence el ${fecha}`,
  sinVencimiento: 'sin fecha',
  total: 'Total',
  sinCategoria: 'Deudas',
};

export const reportesCampoPt: typeof reportesCampoEs = {
  agro: {
    titulo: 'Safras destas datas',
    detalle: 'As que estiveram abertas em algum momento do período, com os números da safra inteira: uma safra não se corta por mês.',
    vacio: 'Nenhuma safra aberta nestas datas',
    vacioDetalle: 'Escolha outro período, ou abra uma safra em Safras e lance o que você vai colocando nela.',
    debes: 'O que você deve na colheita',
    debesDetalle: 'É o que se deve hoje, não no período: fechar uma safra não quita a dívida.',
    ventasN: (n: string) => `${n} vendas, contando as liquidações`,
  },
  lotes: {
    titulo: 'Lotes destas datas',
    detalle: 'Os que estiveram abertos em algum momento do período, com os números do lote inteiro: um lote não se corta por mês.',
    vacio: 'Nenhum lote aberto nestas datas',
    vacioDetalle: 'Escolha outro período, ou abra um lote em Lotes e lance o que você vai colocando nele.',
    debes: 'O que você deve atrelado aos lotes',
    debesDetalle: 'É o que se deve hoje, não no período: fechar um lote não quita a dívida.',
    ventasN: (n: string) => `${n} vendas`,
  },

  abierta: 'Em andamento',
  cerrada: 'Fechada',
  cerroEl: (fecha: string) => `fechou em ${fecha}`,
  porUnidadYDia: (monto: string, unidad: string) => `${monto} por ${unidad.replace(/s$/, '')} por dia`,
  costoPorUnidad: (monto: string, unidad: string) => `${monto} por ${unidad.replace(/s$/, '')}`,
  faltaCubrir: (monto: string) => `Falta cobrir ${monto}`,
  aCosecha: (monto: string) => `Você deve ${monto} na colheita`,
  aLaVenta: (monto: string) => `Você deve ${monto} na venda`,
  esDeCaja: 'Tudo é de caixa: dinheiro que entrou menos dinheiro que saiu. O que se deve conta no custo, não no resultado.',

  caja: 'O caixa destas datas',
  cajaDetalle: 'O que entrou e saiu no período. O resultado de verdade é o de cada safra ou lote: o que se gastou este mês em algo que se vende mais adiante não é uma perda do mês.',
  cobrado: 'Recebido',
  gastos: 'Despesas',
  masMercaderia: (monto: string) => `+ ${monto} de mercadoria, à parte`,
  otrosIngresos: 'Outras entradas',
  otrosIngresosDetalle: 'Empréstimos e aportes também caem aqui',

  vence: (fecha: string) => `vence em ${fecha}`,
  sinVencimiento: 'sem data',
  total: 'Total',
  sinCategoria: 'Dívidas',
};
