/**
 * TEXTOS DEL REPORTE DE comercio (almacén, despensa, reventa).
 *
 * El diccionario lo incluye como `t.reportesComercio` (ver es.ts y pt.ts). Lo
 * usa el componente `src/components/reportes/ReporteComercio.tsx`; lo que es de
 * todos los reportes (rango, indicador, gráfico, descarga) está en
 * `reportes-comunes.ts`. Los textos del Excel NO van acá: el libro se
 * compila suelto para las pruebas y los lleva en src/lib/reportes
 * (`textos-comercio.ts`).
 */
export const reportesComercioEs = {
  /** El cuarto indicador cuando la mercadería va aparte: se aclara que no la resta. */
  gastosSinMercaderia: 'sin la compra de mercadería',

  /** El bloque de la compra de mercadería (decisión 2). */
  mercaderia: {
    titulo: 'Compraste mercadería',
    aparte: 'No resta de tu ganancia: lo que vendiste ya descuenta su costo.',
    resta: 'Cuenta como gasto, porque tus ventas del período no tienen costo cargado. Cargá el costo de tus productos y la ganancia sale exacta.',
    compras: (n: number) => (n === 1 ? '1 compra' : `${n} compras`),
    /** Debajo de la lista de compras: un gasto mal puesto acá infla la ganancia. */
    revisar: 'Si alguna no fue mercadería (luz, alquiler, flete), anulala en el Historial y cargala de nuevo con su categoría: acá no resta y tu ganancia sale más alta.',
    sinDescripcion: 'Sin descripción',
    verMovimientos: 'Ver historial',
  },

  /** El aviso encima del ranking. */
  sinCosto: (n: number) => (n === 1
    ? '1 producto se vendió sin costo cargado: su margen sale inflado.'
    : `${n} productos se vendieron sin costo cargado: su margen sale inflado.`),
  sinCostoCorto: 'sin costo',
  cargarCostos: 'Cargar costos',

  /** «Fiado (todavía no entró)» en «Cómo te pagaron». */
  todaviaNoEntro: (metodo: string) => `${metodo} (todavía no entró)`,

  /** Lo que te deben: foto de hoy. */
  fiado: {
    titulo: 'Lo que te deben',
    hoy: 'A hoy, no al cierre del período.',
    clientes: (n: number) => (n === 1 ? '1 cliente' : `${n} clientes`),
    hace: (dias: number) => (dias === 0 ? 'desde hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`),
    enElPeriodo: 'En este período',
    fiaste: 'Fiaste',
    tePagaron: 'Te pagaron',
    nadie: 'Hoy nadie te debe nada.',
    verTodo: 'Ver fiado',
    masN: (n: number) => `y ${n} más`,
  },

  /** A reponer: en el mínimo o por debajo. */
  reponer: {
    titulo: (n: number) => `A reponer · ${n}`,
    detalle: 'Llegaron al mínimo que les pusiste. Stock de hoy.',
    quedan: (stock: string, minimo: string) => `quedan ${stock} · mínimo ${minimo}`,
  },

  /** Quieto en el estante: tiene stock y no se vendió en el período. */
  quietos: {
    titulo: (n: number) => `Quieto en el estante · ${n}`,
    plataParada: (plata: string) => `${plata} parados en productos que no se vendieron en este período (al costo).`,
    sinCosto: (n: number) => (n === 1 ? '1 no tiene costo cargado y no suma.' : `${n} no tienen costo cargado y no suman.`),
  },

  /** Saldo por cuenta: foto de hoy (`billetera`). */
  cuentas: {
    titulo: 'Dónde está la plata',
    detalle: 'Saldo de hoy en cada cuenta, no del período.',
    total: 'Total',
    verBilletera: 'Ver billetera',
  },

  /** Ventas por quien las cargó. */
  vendedores: {
    titulo: 'Quién vendió',
    colVendedor: 'Vendedor',
    colVentas: 'Ventas',
    colTicket: 'Ticket',
    colAnuladas: 'Anuladas',
    sinNombre: 'Ya no está',
  },
};

export const reportesComercioPt: typeof reportesComercioEs = {
  gastosSinMercaderia: 'sem a compra de mercadoria',

  mercaderia: {
    titulo: 'Você comprou mercadoria',
    aparte: 'Não desconta do seu lucro: o que você vendeu já desconta o custo.',
    resta: 'Conta como despesa, porque suas vendas do período não têm custo cadastrado. Cadastre o custo dos produtos e o lucro sai exato.',
    compras: (n: number) => (n === 1 ? '1 compra' : `${n} compras`),
    revisar: 'Se alguma não foi mercadoria (luz, aluguel, frete), anule no Histórico e lance de novo com a categoria certa: aqui não desconta e seu lucro sai mais alto.',
    sinDescripcion: 'Sem descrição',
    verMovimientos: 'Ver histórico',
  },

  sinCosto: (n: number) => (n === 1
    ? '1 produto foi vendido sem custo cadastrado: a margem sai inflada.'
    : `${n} produtos foram vendidos sem custo cadastrado: a margem sai inflada.`),
  sinCostoCorto: 'sem custo',
  cargarCostos: 'Cadastrar custos',

  todaviaNoEntro: (metodo: string) => `${metodo} (ainda não entrou)`,

  fiado: {
    titulo: 'O que devem pra você',
    hoy: 'Hoje, não no fechamento do período.',
    clientes: (n: number) => (n === 1 ? '1 cliente' : `${n} clientes`),
    hace: (dias: number) => (dias === 0 ? 'desde hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`),
    enElPeriodo: 'Neste período',
    fiaste: 'Vendeu fiado',
    tePagaron: 'Recebeu',
    nadie: 'Hoje ninguém deve nada pra você.',
    verTodo: 'Ver fiado',
    masN: (n: number) => `e mais ${n}`,
  },

  reponer: {
    titulo: (n: number) => `Para repor · ${n}`,
    detalle: 'Chegaram ao mínimo que você definiu. Estoque de hoje.',
    quedan: (stock: string, minimo: string) => `restam ${stock} · mínimo ${minimo}`,
  },

  quietos: {
    titulo: (n: number) => `Parado na prateleira · ${n}`,
    plataParada: (plata: string) => `${plata} parados em produtos que não venderam neste período (ao custo).`,
    sinCosto: (n: number) => (n === 1 ? '1 não tem custo cadastrado e não entra.' : `${n} não têm custo cadastrado e não entram.`),
  },

  cuentas: {
    titulo: 'Onde está o dinheiro',
    detalle: 'Saldo de hoje em cada conta, não do período.',
    total: 'Total',
    verBilletera: 'Ver carteira',
  },

  vendedores: {
    titulo: 'Quem vendeu',
    colVendedor: 'Vendedor',
    colVentas: 'Vendas',
    colTicket: 'Ticket',
    colAnuladas: 'Canceladas',
    sinNombre: 'Já não está',
  },
};
