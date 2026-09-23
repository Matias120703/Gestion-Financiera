/**
 * TEXTOS DEL PANEL DEL CAMPO (100): lo que ve al abrir la app quien mide
 * por ciclo largo (`ficha.ciclosLargos`), en vez de la racha y el cierre.
 *
 * Arriba de todo, los lotes en curso con una tarjeta compacta cada uno
 * (costo por hectárea, kilos para cubrir, cosechado, resultado y lo que
 * queda en el silo); después UNA tarjeta «Debés» que junta todas las
 * deudas con lo que se debe a la venta y el próximo vencimiento; la
 * billetera y lo que te deben usan lo que ya existe en `t.panel`; y al
 * final «Cerrados este año» en vez de «En lo que va del año», que en
 * septiembre mezclaba la cosecha de abril con la siembra de ahora. Sin
 * racha: contarle días seguidos a quien vende tres veces al año es
 * contarle su fracaso.
 *
 * También vive acá lo de «Ver en otra moneda» que la 100 agrega: la
 * pregunta «¿A cuánto está el dólar?» en las dos direcciones. La hoja del
 * Excel se nombra en `src/lib/reporte-textos.ts` (se compila suelto).
 *
 * El diccionario lo incluye como `t.panelCampo` (ver es.ts y pt.ts). Es
 * NEUTRO («lote», «a la venta»): lo lee así el ganadero, y la jerga del
 * agricultor pone «campaña» y «a cosecha» encima (textos/agricultura.ts).
 * Los montos, kilos y precios llegan ya formateados.
 */
export const panelCampoEs = {
  enCurso: 'Lotes en curso',
  verTodos: 'Ver todos',
  vacio: 'Abrí tu primer lote',
  vacioDetalle: 'Cargale lo que le vas poniendo y acá vas a ver cómo viene: cuánto llevás por hectárea y cuántos kilos necesitás para cubrir.',
  abrir: 'Abrir un lote',

  /** La tarjeta compacta de cada lote. */
  tarjeta: {
    /** «50 ha», en el renglón de arriba: «Norte · Soja · 50 ha». */
    ha: (h: string) => `${h} ha`,
    costo: 'Costo',
    resultado: 'Resultado',
    /** «428/ha», debajo del monto grande. */
    porHa: (monto: string) => `${monto} por hectárea`,
    /** El punto de equilibrio: «Necesitás 1.032 kg/ha a US$ 415/t para cubrir el costo». */
    paraCubrir: (kgHa: string, precio: string) => `Necesitás ${kgHa} kg/ha a ${precio} para cubrir el costo`,
    /** Al lado de los kg/ha en soja, maíz y trigo, en los dos idiomas: el brasiguayo habla en sacas. */
    sacas: (sc: string) => `${sc} sc/ha`,
    cosechado: (kg: string) => `Cosechado ${kg} kg`,
    kgHa: (kgHa: string) => `${kgHa} kg/ha`,
    enElSilo: (kg: string) => `${kg} kg en el silo sin vender`,
    vendisteMas: 'Vendiste más kilos de los que cargaste como cosecha.',
    cubierto: 'Ya cubriste el costo',
    sinPrecio: 'Cargá a cuánto pensás vender y te decimos cuántos kilos necesitás.',
    sinNada: 'Todavía no le cargaste nada.',
    llevaDias: (n: number) => (n === 1 ? 'lleva 1 día' : `lleva ${n} días`),
    /** El precio en la unidad en que lo dice cada uno: US$/t el sojero, Gs/kg el sesamero. */
    porTonelada: (precio: string) => `${precio}/t`,
    porKilo: (precio: string) => `${precio}/kg`,
  },

  /** «Debés X · Y a la venta · vence el …»: una sola tarjeta para la misma plata. */
  debes: {
    titulo: 'Debés',
    aCosecha: (monto: string) => `${monto} a la venta`,
    venceEl: (fecha: string) => `el próximo vence el ${fecha}`,
    venceHoy: 'una vence hoy',
    vencida: 'vencida',
    nada: 'No debés nada.',
    ver: 'Ver las deudas',
  },

  cerradasEsteAnio: 'Cerrados este año',
  cerradasDetalle: (n: number) => (n === 1 ? '1 lote cerrado' : `${n} lotes cerrados`),
  resultadoCerradas: (monto: string) => `resultado ${monto}`,
  esDeCaja: 'Todo es de caja: plata que entró menos plata que salió. Lo que debés a la venta no está acá hasta que lo pagues.',

  /**
   * Ver en otra moneda, en las dos direcciones (Ajustes › Moneda).
   *
   * SOLO para la pareja guaraní/dólar: ahí nadie piensa «0,000166 dólares
   * por guaraní», se piensa «el dólar está a 6.000», así que se pregunta
   * siempre por el dólar y la pantalla da vuelta el número cuando el
   * negocio va en dólares (`cambioDesde` de lib/agricultura.ts). Para
   * reales, pesos o euros sigue la pregunta genérica de `t.ajustes`
   * («1 R$ = cuántos Gs.»), por eso `cuantoElDolarDetalle` dice
   * «guaraníes por dólar» sin rodeos.
   */
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
    ha: (h: string) => `${h} ha`,
    costo: 'Custo',
    resultado: 'Resultado',
    porHa: (monto: string) => `${monto} por hectare`,
    paraCubrir: (kgHa: string, precio: string) => `Você precisa de ${kgHa} kg/ha a ${precio} pra cobrir o custo`,
    sacas: (sc: string) => `${sc} sc/ha`,
    cosechado: (kg: string) => `Colhido ${kg} kg`,
    kgHa: (kgHa: string) => `${kgHa} kg/ha`,
    enElSilo: (kg: string) => `${kg} kg no silo, a vender`,
    vendisteMas: 'Você vendeu mais quilos do que lançou como colheita.',
    cubierto: 'Você já cobriu o custo',
    sinPrecio: 'Lance a quanto pensa vender e a gente diz quantos quilos você precisa.',
    sinNada: 'Você ainda não lançou nada.',
    llevaDias: (n: number) => (n === 1 ? '1 dia' : `${n} dias`),
    porTonelada: (precio: string) => `${precio}/t`,
    porKilo: (precio: string) => `${precio}/kg`,
  },

  debes: {
    titulo: 'Você deve',
    aCosecha: (monto: string) => `${monto} na venda`,
    venceEl: (fecha: string) => `a próxima vence em ${fecha}`,
    venceHoy: 'uma vence hoje',
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
