/**
 * TEXTOS DEL PANEL DEL CAMPO (100): lo que ve al abrir la app quien mide
 * por ciclo largo (`ficha.ciclosLargos`), en vez de la racha y el cierre.
 *
 * Arriba de todo, los lotes en curso con una tarjeta compacta cada uno
 * (costo por hectárea, kilos para cubrir, cosechado); después «Debés» con
 * el próximo vencimiento a la venta; la billetera y lo que te deben usan
 * lo que ya existe en `t.panel`; y «En lo que va del año» al final. Sin
 * racha: contarle días seguidos a quien vende tres veces al año es
 * contarle su fracaso.
 *
 * También vive acá lo de «Ver en otra moneda» que la 100 agrega: la
 * pregunta «¿A cuánto está el dólar?» en las dos direcciones, y la hoja
 * del Excel se nombra en `src/lib/reporte-textos.ts` (se compila suelto).
 *
 * El diccionario lo incluye como `t.panelCampo` (ver es.ts y pt.ts). Es
 * NEUTRO («lote», «a la venta»); la jerga del agricultura pone «campaña» y
 * «a cosecha» encima. Los montos llegan ya formateados con su moneda.
 */
export const panelCampoEs = {
  enCurso: 'Lotes en curso',
  verTodos: 'Ver todos',
  vacio: 'Abrí tu primer lote',
  vacioDetalle: 'Cargale lo que le vas poniendo y acá vas a ver cómo viene: cuánto llevás por hectárea y cuántos kilos necesitás para cubrir.',
  abrir: 'Abrir un lote',

  /** La tarjeta compacta de cada lote. */
  tarjeta: {
    costoHa: (monto: string) => `${monto}/ha de costo`,
    costo: (monto: string) => `${monto} de costo`,
    resultado: (monto: string) => `resultado ${monto}`,
    resultadoHa: (monto: string) => `${monto}/ha`,
    paraCubrir: (kgHa: string) => `necesitás ${kgHa} kg/ha para cubrir`,
    paraCubrirSacas: (sacas: string) => `necesitás ${sacas} sc/ha para cubrir`,
    cosechado: (kg: string, kgHa: string) => `${kg} kg cosechados · ${kgHa} kg/ha`,
    sinVender: (kg: string) => `${kg} kg sin vender`,
    faltanVender: (kg: string) => `te faltan vender ${kg} kg`,
    cubierto: 'costo cubierto',
    sinNada: 'todavía sin nada',
    llevaDias: (n: number) => (n === 1 ? 'lleva 1 día' : `lleva ${n} días`),
    ha: (h: string) => `${h} ha`,
  },

  /** «Debés X · Y a la venta, vence el …». */
  debes: {
    titulo: 'Debés',
    aCosecha: (monto: string) => `${monto} a la venta`,
    venceEl: (fecha: string) => `vence el ${fecha}`,
    venceHoy: 'vence hoy',
    vencida: 'vencida',
    nada: 'No debés nada.',
    ver: 'Ver las deudas',
  },

  cerradasEsteAnio: 'Cerrados este año',
  cerradasDetalle: (n: number) => (n === 1 ? '1 lote cerrado' : `${n} lotes cerrados`),
  resultadoCerradas: (monto: string) => `resultado ${monto}`,
  esDeCaja: 'Todo es de caja: plata que entró menos plata que salió. Lo que debés a la venta no está acá hasta que lo pagues.',

  /** Ver en otra moneda, en las dos direcciones. */
  moneda: {
    cuantoElDolar: '¿A cuánto está el dólar?',
    cuantoElDolarDetalle: (propia: string, otra: string) =>
      `Guaraníes por dólar. Sirve para mirar tus números en ${otra} sin dejar de cargarlos en ${propia}.`,
    dolarRaro: 'Un dólar fuera de lo habitual. Si está bien, seguí.',
    dolarImposible: 'Ese dólar no puede ser. Revisá los ceros.',
    guardado: (cambio: string) => `Listo: dólar a ${cambio}.`,
  },
};

export const panelCampoPt: typeof panelCampoEs = {
  enCurso: 'Lotes em andamento',
  verTodos: 'Ver todos',
  vacio: 'Abra seu primeiro lote',
  vacioDetalle: 'Lance o que você vai colocando nele e aqui você vê como vai: quanto já foi por hectare e quantos quilos precisa pra cobrir.',
  abrir: 'Abrir um lote',

  tarjeta: {
    costoHa: (monto: string) => `${monto}/ha de custo`,
    costo: (monto: string) => `${monto} de custo`,
    resultado: (monto: string) => `resultado ${monto}`,
    resultadoHa: (monto: string) => `${monto}/ha`,
    paraCubrir: (kgHa: string) => `você precisa de ${kgHa} kg/ha pra cobrir`,
    paraCubrirSacas: (sacas: string) => `você precisa de ${sacas} sc/ha pra cobrir`,
    cosechado: (kg: string, kgHa: string) => `${kg} kg colhidos · ${kgHa} kg/ha`,
    sinVender: (kg: string) => `${kg} kg a vender`,
    faltanVender: (kg: string) => `faltam vender ${kg} kg`,
    cubierto: 'custo coberto',
    sinNada: 'ainda sem nada',
    llevaDias: (n: number) => (n === 1 ? '1 dia' : `${n} dias`),
    ha: (h: string) => `${h} ha`,
  },

  debes: {
    titulo: 'Você deve',
    aCosecha: (monto: string) => `${monto} na venda`,
    venceEl: (fecha: string) => `vence em ${fecha}`,
    venceHoy: 'vence hoje',
    vencida: 'vencida',
    nada: 'Você não deve nada.',
    ver: 'Ver as dívidas',
  },

  cerradasEsteAnio: 'Fechados este ano',
  cerradasDetalle: (n: number) => (n === 1 ? '1 lote fechado' : `${n} lotes fechados`),
  resultadoCerradas: (monto: string) => `resultado ${monto}`,
  esDeCaja: 'Tudo é de caixa: dinheiro que entrou menos dinheiro que saiu. O que você deve na venda não está aqui até você pagar.',

  moneda: {
    cuantoElDolar: 'A quanto está o dólar?',
    cuantoElDolarDetalle: (propia: string, otra: string) =>
      `Guaranis por dólar. Serve pra olhar seus números em ${otra} sem deixar de lançá-los em ${propia}.`,
    dolarRaro: 'Um dólar fora do habitual. Se estiver certo, siga.',
    dolarImposible: 'Esse dólar não pode ser. Confira os zeros.',
    guardado: (cambio: string) => `Pronto: dólar a ${cambio}.`,
  },
};
