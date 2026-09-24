/**
 * LO QUE DICE EL EXCEL DEL COMERCIO, EN CADA IDIOMA (23/09).
 *
 * Solo lo que es de este libro. Lo que comparte con los demás (los nombres
 * de Resumen, Productos, Movimientos, Gastos y Día por día, las columnas de
 * siempre, el período) sale de `../reporte-textos`, así la tarjeta de
 * descarga y el archivo no pueden llamar distinto a la misma hoja.
 *
 * Vive en src/lib y no en i18n por lo mismo que reporte-textos.ts: el libro
 * se compila suelto, sin Next, para las pruebas.
 */
const es = {
  hojaInventario: 'Inventario valuado',
  hojaFiado: 'Fiado',
  hojaVendedores: 'Vendedores',
  hojaContador: 'Para tu contador',

  // ---- Resumen ----
  columnasResumen: (antes: string) => ['', 'Este período', `Antes (${antes})`, 'Cambio', ''],
  antesNada: 'antes: nada',
  gastosSinMercaderia: 'Gastos (sin la compra de mercadería)',
  mercaderiaTitulo: 'Compraste mercadería',
  comprasMercaderia: 'Compras de mercadería',
  mercaderiaAparteNota: 'no resta: lo vendido ya descuenta su costo',
  mercaderiaRestaNota: 'resta como gasto: tus ventas no tienen costo cargado',
  cajaTitulo: (hoy: string) => `Caja · saldo de cada cuenta hoy, ${hoy}`,
  totalEnCuentas: 'Total en tus cuentas',
  fotoDeHoy: 'de hoy, no del período',
  fiadoTitulo: 'Fiado',
  fiadoOtorgado: 'Fiaste en el período',
  fiadoCobrado: 'Te pagaron de lo fiado',
  teDebenHoy: 'Te deben hoy',
  clientes: (n: number) => (n === 1 ? '1 cliente' : `${n} clientes`),
  cantidadVentas: 'Cantidad de ventas',

  // ---- Notas del Resumen ----
  sinCostoAviso: (n: number) => (n === 1
    ? '1 producto se vendió sin costo cargado: su margen sale inflado (ver la hoja Productos).'
    : `${n} productos se vendieron sin costo cargado: su margen sale inflado (ver la hoja Productos).`),
  mercaderiaAparte: (plata: string) =>
    `Compraste mercadería por ${plata}. No resta de la ganancia: lo que vendiste ya descuenta su costo.`,
  mercaderiaResta: (plata: string) =>
    `Compraste mercadería por ${plata} y cuenta como gasto, porque tus ventas del período no tienen costo cargado. `
    + 'Cargá el costo de tus productos y la ganancia sale exacta.',
  reglaDistintaAntes: 'En el período anterior la compra de mercadería se contó distinto (con o sin costo cargado): '
    + 'los gastos de las dos columnas no se comparan uno a uno.',

  // ---- Productos ----
  columnasProductosExtra: ['Stock hoy', 'Mínimo', '¿Reponer?', 'Aviso'],
  si: 'Sí',
  sinCostoCelda: 'Sin costo: margen inflado',
  stockEsDeHoy: (hoy: string) => `«Stock hoy» y «Mínimo» son del ${hoy}, no del cierre del período.`,

  // ---- Inventario ----
  inventarioTitulo: (hoy: string) => `INVENTARIO VALUADO AL ${hoy} (DÍA DE DESCARGA)`,
  columnasInventario: ['#', 'Producto', 'Categoría', 'Stock', 'Costo', 'Valor al costo'],
  inventarioNota: 'Es el stock de hoy, no el del cierre del período: Orden no guarda la historia del stock.',
  inventarioSinCosto: (n: number) => (n === 1
    ? '1 producto no tiene costo cargado y no suma en el total.'
    : `${n} productos no tienen costo cargado y no suman en el total.`),
  sinInventario: 'Ningún producto con stock hoy.',

  // ---- Fiado ----
  fiadoHoyTitulo: (hoy: string) => `LO QUE TE DEBEN HOY (${hoy}) · DE LA MÁS VIEJA A LA MÁS NUEVA`,
  columnasFiadoHoy: ['#', 'Cliente', 'Te debe', 'Fiado desde', 'Días'],
  nadieDebe: 'Hoy nadie te debe nada.',
  fiadoPeriodoTitulo: 'FIADO EN ESTE PERÍODO · POR CLIENTE',
  columnasFiadoPeriodo: ['#', 'Cliente', 'Fiaste', 'Te pagó', 'Debe hoy'],
  sinFiadoPeriodo: 'No fiaste ni cobraste fiado en este período.',

  // ---- Movimientos ----
  columnasMovimientosExtra: ['Cliente', 'Cuenta', 'Cargó'],
  movimientosMercaderia: 'Las compras de mercadería no tienen ganancia en esta hoja: en este período van aparte (ver Resumen).',

  // ---- Gastos ----
  gastosAparteTitulo: 'COMPRASTE MERCADERÍA · APARTE, NO RESTA DE LA GANANCIA',
  columnasMercaderia: ['', 'Categoría', 'Total comprado', 'Movimientos', ''],
  comprasTitulo: 'CADA COMPRA DE MERCADERÍA',
  revisarCompras: 'Si alguna no fue mercadería (luz, alquiler, flete), anulala en el Historial y cargala de nuevo con su categoría: acá no resta y la ganancia sale más alta.',
  columnasCompras: ['#', 'Descripción', 'Monto', 'Fecha'],
  sinDescripcion: 'Sin descripción',

  // ---- Día por día ----
  columnaComprasDia: 'Compraste mercadería',

  // ---- Vendedores ----
  vendedoresTitulo: 'VENTAS POR QUIÉN LAS CARGÓ',
  columnasVendedores: ['#', 'Vendedor', 'Vendido', 'Ventas', 'Ticket promedio', 'Anuladas', 'Monto anulado'],
  sinNombre: 'Sin nombre (ya no está en el negocio)',
  roles: { propietario: 'Dueño', admin: 'Administración', vendedor: 'Vendedor' } as Record<string, string>,

  // ---- Para tu contador ----
  contadorTitulo: 'PARA TU CONTADOR',
  contadorVentas: 'Ventas del período',
  contadorGastos: 'Gastos por categoría (sin las compras de mercadería)',
  totalGastos: 'Total de gastos',
  contadorMercaderia: 'Mercadería',
  costoVendido: 'Costo de la mercadería vendida',
  inventarioAl: (hoy: string) => `Inventario valuado al ${hoy}`,
  sinCategorias: 'Sin gastos en este período.',
  pagadoProfesionales: 'Pagado a profesionales a comisión',
  aclaracionContador: 'Este resumen ayuda a tu contador, pero NO reemplaza el registro de comprobantes de la SET '
    + '(libro IVA de compras y ventas): Orden no guarda RUC, timbrado, número de factura ni el IVA de cada comprobante.',
};

export type TextosComercio = typeof es;

const pt: TextosComercio = {
  hojaInventario: 'Estoque valorizado',
  hojaFiado: 'Fiado',
  hojaVendedores: 'Vendedores',
  hojaContador: 'Para o contador',

  columnasResumen: (antes: string) => ['', 'Este período', `Antes (${antes})`, 'Variação', ''],
  antesNada: 'antes: nada',
  gastosSinMercaderia: 'Despesas (sem a compra de mercadoria)',
  mercaderiaTitulo: 'Você comprou mercadoria',
  comprasMercaderia: 'Compras de mercadoria',
  mercaderiaAparteNota: 'não desconta: o vendido já desconta o custo',
  mercaderiaRestaNota: 'desconta como despesa: suas vendas não têm custo cadastrado',
  cajaTitulo: (hoy: string) => `Caixa · saldo de cada conta hoje, ${hoy}`,
  totalEnCuentas: 'Total nas suas contas',
  fotoDeHoy: 'de hoje, não do período',
  fiadoTitulo: 'Fiado',
  fiadoOtorgado: 'Você vendeu fiado no período',
  fiadoCobrado: 'Recebeu do fiado',
  teDebenHoy: 'Devem pra você hoje',
  clientes: (n: number) => (n === 1 ? '1 cliente' : `${n} clientes`),
  cantidadVentas: 'Quantidade de vendas',

  sinCostoAviso: (n: number) => (n === 1
    ? '1 produto foi vendido sem custo cadastrado: a margem sai inflada (veja a aba Produtos).'
    : `${n} produtos foram vendidos sem custo cadastrado: a margem sai inflada (veja a aba Produtos).`),
  mercaderiaAparte: (plata: string) =>
    `Você comprou mercadoria por ${plata}. Não desconta do lucro: o que você vendeu já desconta o custo.`,
  mercaderiaResta: (plata: string) =>
    `Você comprou mercadoria por ${plata} e ela conta como despesa, porque suas vendas do período não têm custo cadastrado. `
    + 'Cadastre o custo dos produtos e o lucro sai exato.',
  reglaDistintaAntes: 'No período anterior a compra de mercadoria foi contada de outro jeito (com ou sem custo cadastrado): '
    + 'as despesas das duas colunas não se comparam uma a uma.',

  columnasProductosExtra: ['Estoque hoje', 'Mínimo', 'Repor?', 'Aviso'],
  si: 'Sim',
  sinCostoCelda: 'Sem custo: margem inflada',
  stockEsDeHoy: (hoy: string) => `«Estoque hoje» e «Mínimo» são de ${hoy}, não do fechamento do período.`,

  inventarioTitulo: (hoy: string) => `ESTOQUE VALORIZADO EM ${hoy} (DIA DO DOWNLOAD)`,
  columnasInventario: ['#', 'Produto', 'Categoria', 'Estoque', 'Custo', 'Valor ao custo'],
  inventarioNota: 'É o estoque de hoje, não o do fechamento do período: o Orden não guarda o histórico do estoque.',
  inventarioSinCosto: (n: number) => (n === 1
    ? '1 produto não tem custo cadastrado e não entra no total.'
    : `${n} produtos não têm custo cadastrado e não entram no total.`),
  sinInventario: 'Nenhum produto com estoque hoje.',

  fiadoHoyTitulo: (hoy: string) => `O QUE DEVEM PRA VOCÊ HOJE (${hoy}) · DO MAIS ANTIGO AO MAIS NOVO`,
  columnasFiadoHoy: ['#', 'Cliente', 'Deve', 'Fiado desde', 'Dias'],
  nadieDebe: 'Hoje ninguém deve nada pra você.',
  fiadoPeriodoTitulo: 'FIADO NESTE PERÍODO · POR CLIENTE',
  columnasFiadoPeriodo: ['#', 'Cliente', 'Fiado', 'Pagou', 'Deve hoje'],
  sinFiadoPeriodo: 'Nada fiado nem recebido de fiado neste período.',

  columnasMovimientosExtra: ['Cliente', 'Conta', 'Lançou'],
  movimientosMercaderia: 'As compras de mercadoria não têm lucro nesta aba: neste período ficam à parte (veja Resumo).',

  gastosAparteTitulo: 'VOCÊ COMPROU MERCADORIA · À PARTE, NÃO DESCONTA DO LUCRO',
  columnasMercaderia: ['', 'Categoria', 'Total comprado', 'Movimentos', ''],
  comprasTitulo: 'CADA COMPRA DE MERCADORIA',
  revisarCompras: 'Se alguma não foi mercadoria (luz, aluguel, frete), anule no Histórico e lance de novo com a categoria certa: aqui não desconta e o lucro sai mais alto.',
  columnasCompras: ['#', 'Descrição', 'Valor', 'Data'],
  sinDescripcion: 'Sem descrição',

  columnaComprasDia: 'Compra de mercadoria',

  vendedoresTitulo: 'VENDAS POR QUEM LANÇOU',
  columnasVendedores: ['#', 'Vendedor', 'Vendido', 'Vendas', 'Ticket médio', 'Canceladas', 'Valor cancelado'],
  sinNombre: 'Sem nome (já não está no negócio)',
  roles: { propietario: 'Dono', admin: 'Administração', vendedor: 'Vendedor' },

  contadorTitulo: 'PARA O CONTADOR',
  contadorVentas: 'Vendas do período',
  contadorGastos: 'Despesas por categoria (sem as compras de mercadoria)',
  totalGastos: 'Total de despesas',
  contadorMercaderia: 'Mercadoria',
  costoVendido: 'Custo da mercadoria vendida',
  inventarioAl: (hoy: string) => `Estoque valorizado em ${hoy}`,
  sinCategorias: 'Sem despesas neste período.',
  pagadoProfesionales: 'Pago a profissionais por comissão',
  aclaracionContador: 'Este resumo ajuda o seu contador, mas NÃO substitui o registro de comprovantes da SET '
    + '(livro de IVA de compras e vendas): o Orden não guarda RUC, timbrado, número da nota nem o IVA de cada comprovante.',
};

export function textosComercio(idioma?: string): TextosComercio {
  return idioma === 'pt' ? pt : es;
}
