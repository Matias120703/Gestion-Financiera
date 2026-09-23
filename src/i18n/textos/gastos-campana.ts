/**
 * TEXTOS DE LA CAMPAÑA EN GASTOS, VENDER, EL HISTORIAL Y LA CAPTURA (100).
 *
 * Lo que las pantallas de plata de siempre ganan cuando el negocio tiene
 * lotes: el chip «¿De qué lote?» al cargar un gasto, el interruptor de
 * moneda («Pagué en guaraníes» en un negocio en dólares), la forma de pago
 * «A la venta» que en vez de un gasto crea una deuda atada al lote,
 * repartir un gasto entre los lotes abiertos, la acción «Lote» del
 * historial, el renglón del silo en Vender y la pregunta de la captura
 * por voz cuando nombra un lote que no existe.
 *
 * El diccionario lo incluye como `t.gastosCampana` (ver es.ts y pt.ts).
 * Es NEUTRO («lote», «a la venta») por lo mismo que `campanas.ts`: la
 * jerga del agricultor pone «campaña» y «a cosecha» encima. Los montos
 * llegan ya formateados con su moneda.
 *
 * En portugués «anular» se dice «cancelar», como en el resto de pt.ts: la
 * persona ve el mismo verbo en el historial que en el botón.
 */
export const gastosCampanaEs = {
  /** El chip de lote en Gastos y en Vender. */
  chip: {
    deQueLote: '¿De qué lote?',
    ninguno: 'Ninguno',
    ningunoDetalle: 'Para los gastos de la casa o del negocio en general.',
    repartir: 'Repartir entre los lotes abiertos',
    repartirDetalle: 'Por hectáreas. Si alguno no tiene hectáreas, en partes iguales.',
    repartidoEn: (n: number) => (n === 1 ? 'en 1 lote' : `repartido en ${n} lotes`),
    /** Confirmación al guardar: «Semilla US$ 3.400 en Norte · US$ 68 por hectárea». */
    guardadoEn: (categoria: string, monto: string, lote: string) => `${categoria} ${monto} en ${lote}`,
    porHectarea: (monto: string) => `${monto} por hectárea`,
    guardadoRepartido: (monto: string, n: number) => `${monto} repartidos en ${n} lotes por hectáreas`,
    ventaEn: (monto: string, lote: string) => `Venta de ${monto} sumada a ${lote}`,
    /** El reparto antes de guardar: «Norte US$ 40 · Sur US$ 60». */
    parte: (lote: string, monto: string) => `${lote} ${monto}`,
  },

  /** El interruptor de moneda al lado del monto. */
  moneda: {
    /** «Pagué en guaraníes» / «Pagué en dólares»: el nombre lo pone la pantalla. */
    pagueEn: (moneda: string) => `Pagué en ${moneda}`,
    cobreEn: (moneda: string) => `Cobré en ${moneda}`,
    enMiMoneda: (moneda: string) => `En ${moneda}`,
    cuantoElDolar: '¿A cuánto está el dólar?',
    cuantoElCambio: (una: string, propia: string) => `¿Cuántos ${propia} vale 1 ${una}?`,
    /** «= US$ 400 al dólar de 6.000». */
    convertido: (monto: string, cambio: string) => `= ${monto} al dólar de ${cambio}`,
    convertidoCambio: (monto: string, cambio: string) => `= ${monto} al cambio de ${cambio}`,
    dolarRaro: 'Un dólar fuera de lo habitual. Si está bien, seguí.',
    dolarImposible: 'Ese dólar no puede ser. Revisá los ceros.',
    faltaDolar: 'Poné a cuánto está el dólar para convertirlo.',
    seGuardaEn: (moneda: string) => `Se guarda en ${moneda}; lo que pagaste queda anotado al lado.`,
    /** En el historial: «Gs 2.400.000 al dólar de 6.000». */
    original: (monto: string, cambio: string) => `${monto} al cambio de ${cambio}`,
    /** Cómo se nombra cada moneda dentro de «Pagué en …». */
    nombres: {
      PYG: 'guaraníes', USD: 'dólares', BRL: 'reales', ARS: 'pesos', EUR: 'euros',
    } as Record<string, string>,
  },

  /** La forma de pago «A la venta» (solo admin). */
  aCosecha: {
    forma: 'A la venta',
    formaDetalle: 'No pagás ahora: te lo cobran con lo que vendas. Queda como deuda del lote y cuenta en su costo.',
    proveedor: '¿A quién le debés?',
    proveedorEjemplo: 'Agrofértil, la cooperativa, el silo',
    vence: 'Vence el',
    venceDetalle: 'Sugerido con la cosecha estimada del cultivo. Cambialo si el papel dice otra fecha.',
    faltaLote: 'Elegí de qué lote es: una deuda a la venta siempre es de un lote.',
    faltaProveedor: 'Decinos a quién le debés.',
    soloAdmin: 'Solo administración carga deudas a la venta.',
    /** «Quedó como deuda del lote Norte: US$ 4.800 a Agrofértil, vence el 15/03.» */
    quedo: (lote: string, monto: string, acreedor: string, vence: string) =>
      `Quedó como deuda del lote ${lote}: ${monto} a ${acreedor}, vence el ${vence}.`,
    quedoSinVence: (lote: string, monto: string, acreedor: string) =>
      `Quedó como deuda del lote ${lote}: ${monto} a ${acreedor}.`,
    quedoDetalle: 'Cuenta en el costo del lote; cuando la pagues o el silo se la cobre, pasa a gasto.',
    /** El nombre con que nace la deuda: «Fertilizante · Norte». */
    nombreDeuda: (categoria: string, lote: string) => `${categoria} · ${lote}`,
    /** El botón de guardar cuando la forma de pago es esta. */
    guardarDeuda: (monto: string) => `Anotar ${monto} como deuda`,
  },

  /** La acción «Lote» del historial. */
  historial: {
    accion: 'Lote',
    asignar: 'Sumarlo a un lote',
    sacar: 'Sacarlo del lote',
    deLote: (nombre: string) => `Lote: ${nombre}`,
    sinLote: 'Sin lote',
    asignado: (nombre: string) => `Sumado a ${nombre}.`,
    sacado: 'Sacado del lote.',
    parteDeLiquidacion: (fecha: string) => `Parte de la liquidación del ${fecha}`,
    parteDeLiquidacionDetalle: 'Se maneja desde el lote: no se edita ni se anula suelta. Anulá la liquidación entera.',
    repartido: (n: number) => `Repartido en ${n} lotes`,
    anularJuntas: (n: number) => `Anular las ${n} juntas`,
    anularJuntasPregunta: (n: number) =>
      `Este gasto está repartido en ${n} lotes. Se anulan las ${n} partes juntas. ¿Seguimos?`,
    anuladasJuntas: (n: number) => `Listo: se anularon las ${n} partes.`,
    noSePudo: 'No se pudo cambiar. Probá de nuevo.',
    /** Si una parte no se pudo anular, las anteriores ya quedaron anuladas: se dice cuántas. */
    anuladasAMedias: (hechas: number, n: number) =>
      `Se anularon ${hechas} de las ${n} partes. Probá de nuevo para anular las que faltan.`,
  },

  /** Vender, en un negocio con lotes. */
  vender: {
    silo: '¿Es grano que entregaste al silo?',
    siloDetalle: 'Cargalo desde el lote, así te calcula el rendimiento y el precio promedio.',
    irAlLote: 'Ir al lote',
    deQueLote: '¿De qué lote es esta venta?',
    /** Un negocio sin catálogo (el agricultor): se vende con «producto suelto». */
    sinCatalogo: 'Vendé con «+ Suelto»',
    sinCatalogoDetalle: 'Poné qué es y el precio, y cobrá: queda registrada igual que cualquier venta.',
    /** Si la venta se guardó pero no se pudo sumar al lote. */
    noSeSumo: 'La venta quedó registrada, pero no se pudo sumar al lote. Hacelo desde el historial.',
  },

  /** La captura por voz cuando nombra un lote. */
  captura: {
    deQueLoteEs: '¿De qué lote es?',
    noReconocido: (nombre: string) => `Nombraste «${nombre}», pero no hay ningún lote con ese nombre. Elegí uno o dejalo sin lote.`,
    sinLote: 'Sin lote',
    enLote: (nombre: string) => `en ${nombre}`,
    aCosechaDespues: 'Si esto fue a la venta, cargalo desde Gastos: por voz todavía no.',
  },

  /**
   * Las categorías del agricultor (101) que el diccionario general
   * (`t.categorias` de pt.ts) todavía no traduce. Mientras falten allá,
   * Gastos, Vender y el historial las leen de acá; cuando pt.ts las tenga,
   * manda la de pt.ts (ver `categoriaDelRubro`). En español se guardan y se
   * muestran igual.
   */
  categorias: {
    'Siembra y pulverización': 'Siembra y pulverización',
    'Secado y acopio': 'Secado y acopio',
    'Maquinaria y repuestos': 'Maquinaria y repuestos',
    'Intereses y bancos': 'Intereses y bancos',
    'Retención de IVA': 'Retención de IVA',
    'Granos': 'Granos',
  } as Record<string, string>,
};

export const gastosCampanaPt: typeof gastosCampanaEs = {
  chip: {
    deQueLote: 'De qual lote?',
    ninguno: 'Nenhum',
    ningunoDetalle: 'Pras despesas da casa ou do negócio em geral.',
    repartir: 'Dividir entre os lotes abertos',
    repartirDetalle: 'Por hectares. Se algum não tiver hectares, em partes iguais.',
    repartidoEn: (n: number) => (n === 1 ? 'em 1 lote' : `dividido em ${n} lotes`),
    guardadoEn: (categoria: string, monto: string, lote: string) => `${categoria} ${monto} em ${lote}`,
    porHectarea: (monto: string) => `${monto} por hectare`,
    guardadoRepartido: (monto: string, n: number) => `${monto} divididos em ${n} lotes por hectares`,
    ventaEn: (monto: string, lote: string) => `Venda de ${monto} somada a ${lote}`,
    parte: (lote: string, monto: string) => `${lote} ${monto}`,
  },

  moneda: {
    pagueEn: (moneda: string) => `Paguei em ${moneda}`,
    cobreEn: (moneda: string) => `Recebi em ${moneda}`,
    enMiMoneda: (moneda: string) => `Em ${moneda}`,
    cuantoElDolar: 'A quanto está o dólar?',
    cuantoElCambio: (una: string, propia: string) => `Quantos ${propia} vale 1 ${una}?`,
    convertido: (monto: string, cambio: string) => `= ${monto} ao dólar de ${cambio}`,
    convertidoCambio: (monto: string, cambio: string) => `= ${monto} ao câmbio de ${cambio}`,
    dolarRaro: 'Um dólar fora do habitual. Se estiver certo, siga.',
    dolarImposible: 'Esse dólar não pode ser. Confira os zeros.',
    faltaDolar: 'Coloque a quanto está o dólar pra converter.',
    seGuardaEn: (moneda: string) => `Fica salvo em ${moneda}; o que você pagou fica anotado do lado.`,
    original: (monto: string, cambio: string) => `${monto} ao câmbio de ${cambio}`,
    nombres: {
      PYG: 'guaranis', USD: 'dólares', BRL: 'reais', ARS: 'pesos', EUR: 'euros',
    } as Record<string, string>,
  },

  aCosecha: {
    forma: 'Na venda',
    formaDetalle: 'Você não paga agora: cobram com o que você vender. Fica como dívida do lote e conta no custo dele.',
    proveedor: 'Pra quem você deve?',
    proveedorEjemplo: 'Agrofértil, a cooperativa, o armazém',
    vence: 'Vence em',
    venceDetalle: 'Sugerido com a colheita estimada da cultura. Mude se o papel disser outra data.',
    faltaLote: 'Escolha de qual lote é: uma dívida na venda é sempre de um lote.',
    faltaProveedor: 'Diga pra quem você deve.',
    soloAdmin: 'Só a administração lança dívidas na venda.',
    quedo: (lote: string, monto: string, acreedor: string, vence: string) =>
      `Ficou como dívida do lote ${lote}: ${monto} pra ${acreedor}, vence em ${vence}.`,
    quedoSinVence: (lote: string, monto: string, acreedor: string) =>
      `Ficou como dívida do lote ${lote}: ${monto} pra ${acreedor}.`,
    quedoDetalle: 'Conta no custo do lote; quando você pagar ou o armazém cobrar, vira despesa.',
    nombreDeuda: (categoria: string, lote: string) => `${categoria} · ${lote}`,
    guardarDeuda: (monto: string) => `Anotar ${monto} como dívida`,
  },

  historial: {
    accion: 'Lote',
    asignar: 'Somar a um lote',
    sacar: 'Tirar do lote',
    deLote: (nombre: string) => `Lote: ${nombre}`,
    sinLote: 'Sem lote',
    asignado: (nombre: string) => `Somado a ${nombre}.`,
    sacado: 'Tirado do lote.',
    parteDeLiquidacion: (fecha: string) => `Parte da liquidação de ${fecha}`,
    parteDeLiquidacionDetalle: 'Se mexe a partir do lote: não se edita nem se cancela solta. Cancele a liquidação inteira.',
    repartido: (n: number) => `Dividido em ${n} lotes`,
    anularJuntas: (n: number) => `Cancelar as ${n} juntas`,
    anularJuntasPregunta: (n: number) =>
      `Esta despesa está dividida em ${n} lotes. As ${n} partes são canceladas juntas. Seguimos?`,
    anuladasJuntas: (n: number) => `Pronto: as ${n} partes foram canceladas.`,
    noSePudo: 'Não deu pra mudar. Tente de novo.',
    anuladasAMedias: (hechas: number, n: number) =>
      `Foram canceladas ${hechas} das ${n} partes. Tente de novo pra cancelar as que faltam.`,
  },

  vender: {
    silo: 'É grão que você entregou no armazém?',
    siloDetalle: 'Lance a partir do lote, assim calcula a produtividade e o preço médio.',
    irAlLote: 'Ir pro lote',
    deQueLote: 'De qual lote é esta venda?',
    sinCatalogo: 'Venda com «+ Avulso»',
    sinCatalogoDetalle: 'Coloque o que é e o preço, e receba: fica registrada igual a qualquer venda.',
    noSeSumo: 'A venda ficou registrada, mas não deu pra somar ao lote. Faça isso pelo histórico.',
  },

  captura: {
    deQueLoteEs: 'De qual lote é?',
    noReconocido: (nombre: string) => `Você falou «${nombre}», mas não há nenhum lote com esse nome. Escolha um ou deixe sem lote.`,
    sinLote: 'Sem lote',
    enLote: (nombre: string) => `em ${nombre}`,
    aCosechaDespues: 'Se isso foi na venda, lance a partir de Despesas: por voz ainda não.',
  },

  categorias: {
    'Siembra y pulverización': 'Plantio e pulverização',
    'Secado y acopio': 'Secagem e armazenagem',
    'Maquinaria y repuestos': 'Máquinas e peças',
    'Intereses y bancos': 'Juros e bancos',
    'Retención de IVA': 'Retenção de IVA',
    'Granos': 'Grãos',
  } as Record<string, string>,
};

/**
 * El nombre de una categoría en el idioma de quien mira, con el respaldo
 * de las categorías de la 101. Primero el diccionario general (así, cuando
 * pt.ts sume las del agricultor, gana esa), después el de acá, y si nadie
 * la conoce, el nombre tal cual se guardó (las categorías propias).
 *
 * Recibe solo lo que usa para no importar `Textos` (que se arma con este
 * archivo adentro).
 */
export function categoriaDelRubro(
  t: { categorias: Record<string, string>; gastosCampana: { categorias: Record<string, string> } },
  nombre: string | null | undefined,
): string {
  if (!nombre) return '';
  return t.categorias[nombre] ?? t.gastosCampana.categorias[nombre] ?? nombre;
}
