/**
 * LA BILLETERA EN OTRAS MONEDAS (131).
 *
 * Matías: «Tengo una cuenta bancaria en dólares con 10 mil dólares: ¿cómo la
 * guardo en mi billetera, si solo me aparece la opción de cargar en
 * guaraníes? También en reales».
 *
 * El diccionario lo incluye como `t.monedas` (ver es.ts y pt.ts), con dos
 * bloques: `billetera` (crear una cuenta en otra moneda, los totales por
 * moneda, la cotización, pasar plata entre monedas) y `cobro` (pagar un gasto
 * o anotar un ingreso con una cuenta en otra moneda). No se suman claves a
 * los bloques `billetera` y `cobro` de siempre: quien no usa otra moneda
 * sigue leyendo exactamente los textos de antes.
 *
 * NADA DICE «GUARANÍES». Las frases reciben el nombre de la moneda («dólares»,
 * «el dólar») o el importe ya escrito: un negocio en dólares con una caja en
 * guaraníes lee lo mismo, al revés. Los nombres en minúscula para adentro de
 * una frase salen de `t.gastosCampana.moneda.nombres` (plural) y `.uno`
 * (singular); los de acá (`monedas`) van con mayúscula, para un botón.
 *
 * Lo aproximado se dice con «≈» y nada más: sin «tipo de cambio», sin
 * «conversión». «Cotización» sí, que es como se dice en la calle.
 *
 * EL PATRIMONIO (132) es el tercer bloque, `patrimonio`. Matías: «También
 * tiene que ver lo que sería patrimonios; por ejemplo, un auto, un terreno,
 * lo que sea». Son los textos de «Lo que tenés» y de «Tengo en total», en la
 * misma Billetera. Tampoco nombran ninguna moneda: «Depende del dólar que
 * pusiste» recibe «dólar» de afuera, y un negocio en reales lee «del real».
 */
export const monedasEs = {
  billetera: {
    // ---- crear y editar una cuenta ----
    moneda: 'Moneda',
    monedas: {
      PYG: 'Guaraníes', USD: 'Dólares', BRL: 'Reales', ARS: 'Pesos', EUR: 'Euros',
    } as Record<string, string>,
    /** El renglón que separa cada grupo de cuentas: «En dólares». */
    enMoneda: (moneda: string) => `En ${moneda}`,
    noRecibeSola: 'No recibe nada sola. La elegís vos al pagar o al pasar plata.',
    monedaFija: (moneda: string) => `En ${moneda}. La moneda no se cambia.`,
    nombreBancoOtra: (moneda: string) => `Atlas ${moneda}, Itaú ${moneda}…`,
    nombreBilleteraOtra: 'Binance, Wise, PayPal…',
    /** Recibe el nombre con mayúscula: «Dólares en mano…». */
    nombreEfectivoOtra: (Moneda: string) => `${Moneda} en mano…`,

    // ---- todo junto, que es aproximado ----
    aproxTotal: (monto: string) => `≈ ${monto} en total`,
    /** «US$ 10.350,00 ≈ Gs. 76.590.000», mientras se escribe la cotización. */
    aprox: (exacto: string, aproximado: string) => `${exacto} ≈ ${aproximado}`,
    /** «US$ 1 = Gs. 7.400»: siempre igual, en las dos direcciones. */
    cambio: (uno: string, vale: string) => `${uno} = ${vale}`,
    ponerCotizacion: (moneda: string) => `Poné a cuánto está el ${moneda} para ver todo junto`,
    cotizacion: 'Cotización',
    cambiarCotizacion: 'Cambiar la cotización',
    cuantoEsta: (moneda: string) => `¿A cuánto está el ${moneda}?`,
    cuantosVale: (chicas: string, grande: string) => `¿Cuántos ${chicas} vale 1 ${grande}?`,
    cotizacionDetalle: 'La ponés vos. Solo cambia el «≈»: tus saldos no se tocan.',
    /** Sin punto final: la fecha corta ya puede traer el suyo («8 oct.»). */
    cargadoEl: (fecha: string) => `Cargado el ${fecha}`,

    // ---- pasar plata de una moneda a otra ----
    salen: (simbolo: string) => `Salen (${simbolo})`,
    entran: (simbolo: string) => `Entran (${simbolo})`,
    cambiarNoEsGasto: 'Cambiar de moneda no es un gasto ni una ganancia.',
    cambioRaroAviso: 'Ese cambio es distinto del que pusiste. Revisá los ceros.',
    pasaste: (sale: string, entra: string) => `Salieron ${sale} · entraron ${entra}`,
    usarComoCotizacion: (cambio: string) => `Usar ${cambio} para ver todo junto`,
    ultimosPases: 'Últimos pases',
    paseDesde: (cuenta: string) => `Desde ${cuenta}`,
    paseHacia: (cuenta: string) => `A ${cuenta}`,
    deshacer: 'Deshacer',
    deshacerTitulo: '¿Deshacer este pase?',
    deshacerDetalle: 'La plata vuelve a las dos cuentas.',

    // ---- quitar una cuenta que tiene plata ----
    quitarConSaldoTitulo: (nombre: string) => `¿Quitar «${nombre}»?`,
    quitarConSaldo: (saldo: string) => `Tiene ${saldo} y deja de contarse.`,

    // ---- reportes y presupuesto ----
    enOtrasMonedas: 'En otras monedas',
    /** Debajo de «Disponible», sin sumar: «+ US$ 10.350,00 en dólares». */
    masEn: (saldo: string, moneda: string) => `+ ${saldo} en ${moneda}`,
    /** Una tarjeta en otra moneda que quedó en rojo. */
    menosEn: (saldo: string, moneda: string) => `− ${saldo} en ${moneda}`,
  },

  cobro: {
    cuantoSalioEn: (moneda: string) => `¿Cuánto salió en ${moneda}?`,
    cuantoEntroEn: (moneda: string) => `¿Cuánto entró en ${moneda}?`,
    seGuardaEn: (moneda: string) => `El gasto se guarda en ${moneda}, como siempre.`,
    seGuardaEnIngreso: (moneda: string) => `El ingreso se guarda en ${moneda}, como siempre.`,
    salenDe: (monto: string, cuenta: string) => `Salen ${monto} de ${cuenta}`,
    entranA: (monto: string, cuenta: string) => `Entran ${monto} a ${cuenta}`,
    repartoMuyChico: 'Ese importe es muy chico para repartirlo entre todos los lotes.',
  },

  patrimonio: {
    // ---- lo que tenés: la lista y sus hojas ----
    loQueTenes: 'Lo que tenés',
    agregar: 'Agregar',
    agregarUnBien: '+ Anotar algo que tenés',
    vacioDetalle: 'Un auto, un terreno, una casa: lo que tenés y no es plata.',
    algoQueTenes: 'Algo que tenés',
    /** Por el tipo que guarda la base (132). */
    tipos: {
      vehiculo: 'Auto o moto', terreno: 'Terreno', casa: 'Casa o local',
      maquina: 'Máquina', animales: 'Animales', otro: 'Otro',
    } as Record<string, string>,
    queEs: '¿Qué es?',
    /** Lo que se ve en el campo vacío, según el tipo marcado. */
    ejemplo: {
      vehiculo: 'Toyota Hilux 2018', terreno: 'Terreno en Luque', casa: 'Casa de Lambaré',
      maquina: 'Tractor', animales: '120 vacas', otro: 'Lo que sea',
    } as Record<string, string>,
    cuantoValeHoy: '¿Cuánto vale hoy?',
    valorDetalle: 'Lo que vos calculás. Lo cambiás cuando quieras.',
    nota: 'Nota',
    noMueveCuentas: 'Anotarlo no mueve ninguna cuenta.',
    /** Sin punto final: la fecha corta ya puede traer el suyo («8 oct.»). */
    valorDel: (fecha: string) => `valor del ${fecha}`,
    actualizarValor: 'Actualizar valor',
    yaNoLoTengo: 'Ya no lo tengo',
    loVendi: 'Lo vendí',
    sacarDeLaLista: 'Sacarlo de la lista',
    siEntroPlata: 'Si entró plata, ajustá el saldo de esa cuenta.',
    irAMisCuentas: 'Ir a mis cuentas',

    // ---- tengo en total ----
    tengoEnTotal: 'Tengo en total',
    plata: 'Plata',
    deEsoGuardado: (monto: string) => `de eso, guardado: ${monto}`,
    teDeben: 'Te deben',
    debes: 'Debés',
    mercaderia: 'Mercadería · a precio de costo',
    /** Recibe el símbolo: «ver en US$». */
    verEn: (simbolo: string) => `ver en ${simbolo}`,
    /** Recibe la moneda que se cotizó, en singular: «del dólar», «del real». */
    esAproximado: (moneda: string) => `Depende del ${moneda} que pusiste y de lo que calculás que valen tus cosas.`,
    /** Con más de una moneda cotizada. */
    esAproximadoVarios: 'Depende de los cambios que pusiste y de lo que calculás que valen tus cosas.',
    esAproximadoSinCambio: 'Depende de lo que calculás que valen tus cosas.',
    /** Una moneda que Orden no sabe cotizar (un fondo en libras): no hay «≈» ni dónde ponerlo. */
    sinTotal: (moneda: string) => `Sin total: no hay cotización para ${moneda}.`,
  },
};

export const monedasPt: typeof monedasEs = {
  billetera: {
    moneda: 'Moeda',
    monedas: {
      PYG: 'Guaranis', USD: 'Dólares', BRL: 'Reais', ARS: 'Pesos', EUR: 'Euros',
    } as Record<string, string>,
    enMoneda: (moneda: string) => `Em ${moneda}`,
    noRecibeSola: 'Não recebe nada sozinha. Você escolhe ao pagar ou ao passar dinheiro.',
    monedaFija: (moneda: string) => `Em ${moneda}. A moeda não muda.`,
    nombreBancoOtra: (moneda: string) => `Atlas ${moneda}, Itaú ${moneda}…`,
    nombreBilleteraOtra: 'Binance, Wise, PayPal…',
    nombreEfectivoOtra: (Moneda: string) => `${Moneda} em mãos…`,

    aproxTotal: (monto: string) => `≈ ${monto} no total`,
    aprox: (exacto: string, aproximado: string) => `${exacto} ≈ ${aproximado}`,
    cambio: (uno: string, vale: string) => `${uno} = ${vale}`,
    ponerCotizacion: (moneda: string) => `Informe a quanto está o ${moneda} para ver tudo junto`,
    cotizacion: 'Cotação',
    cambiarCotizacion: 'Mudar a cotação',
    cuantoEsta: (moneda: string) => `A quanto está o ${moneda}?`,
    cuantosVale: (chicas: string, grande: string) => `Quantos ${chicas} vale 1 ${grande}?`,
    cotizacionDetalle: 'Você informa. Só muda o «≈»: seus saldos não mudam.',
    cargadoEl: (fecha: string) => `Informado em ${fecha}`,

    salen: (simbolo: string) => `Saem (${simbolo})`,
    entran: (simbolo: string) => `Entram (${simbolo})`,
    cambiarNoEsGasto: 'Trocar de moeda não é gasto nem lucro.',
    cambioRaroAviso: 'Esse câmbio é diferente do que você informou. Confira os zeros.',
    pasaste: (sale: string, entra: string) => `Saíram ${sale} · entraram ${entra}`,
    usarComoCotizacion: (cambio: string) => `Usar ${cambio} para ver tudo junto`,
    ultimosPases: 'Últimas transferências',
    paseDesde: (cuenta: string) => `De ${cuenta}`,
    paseHacia: (cuenta: string) => `Para ${cuenta}`,
    deshacer: 'Desfazer',
    deshacerTitulo: 'Desfazer esta transferência?',
    deshacerDetalle: 'O dinheiro volta para as duas contas.',

    quitarConSaldoTitulo: (nombre: string) => `Remover «${nombre}»?`,
    quitarConSaldo: (saldo: string) => `Tem ${saldo} e deixa de contar.`,

    enOtrasMonedas: 'Em outras moedas',
    masEn: (saldo: string, moneda: string) => `+ ${saldo} em ${moneda}`,
    menosEn: (saldo: string, moneda: string) => `− ${saldo} em ${moneda}`,
  },

  cobro: {
    cuantoSalioEn: (moneda: string) => `Quanto saiu em ${moneda}?`,
    cuantoEntroEn: (moneda: string) => `Quanto entrou em ${moneda}?`,
    seGuardaEn: (moneda: string) => `O gasto fica em ${moneda}, como sempre.`,
    seGuardaEnIngreso: (moneda: string) => `A entrada fica em ${moneda}, como sempre.`,
    salenDe: (monto: string, cuenta: string) => `Saem ${monto} de ${cuenta}`,
    entranA: (monto: string, cuenta: string) => `Entram ${monto} em ${cuenta}`,
    repartoMuyChico: 'Esse valor é pequeno demais para dividir entre todos os lotes.',
  },

  patrimonio: {
    loQueTenes: 'O que você tem',
    agregar: 'Adicionar',
    agregarUnBien: '+ Anotar algo que você tem',
    vacioDetalle: 'Um carro, um terreno, uma casa: o que você tem e não é dinheiro.',
    algoQueTenes: 'Algo que você tem',
    tipos: {
      vehiculo: 'Carro ou moto', terreno: 'Terreno', casa: 'Casa ou loja',
      maquina: 'Máquina', animales: 'Animais', otro: 'Outro',
    } as Record<string, string>,
    queEs: 'O que é?',
    ejemplo: {
      vehiculo: 'Toyota Hilux 2018', terreno: 'Terreno em Luque', casa: 'Casa em Lambaré',
      maquina: 'Trator', animales: '120 vacas', otro: 'O que for',
    } as Record<string, string>,
    cuantoValeHoy: 'Quanto vale hoje?',
    valorDetalle: 'O que você calcula. Você muda quando quiser.',
    nota: 'Observação',
    noMueveCuentas: 'Anotar não mexe em nenhuma conta.',
    valorDel: (fecha: string) => `valor de ${fecha}`,
    actualizarValor: 'Atualizar valor',
    yaNoLoTengo: 'Não tenho mais',
    loVendi: 'Vendi',
    sacarDeLaLista: 'Tirar da lista',
    siEntroPlata: 'Se entrou dinheiro, ajuste o saldo dessa conta.',
    irAMisCuentas: 'Ir para as minhas contas',

    tengoEnTotal: 'Tenho no total',
    plata: 'Dinheiro',
    deEsoGuardado: (monto: string) => `disso, guardado: ${monto}`,
    teDeben: 'Devem a você',
    debes: 'Você deve',
    mercaderia: 'Mercadoria · a preço de custo',
    verEn: (simbolo: string) => `ver em ${simbolo}`,
    esAproximado: (moneda: string) => `Depende do ${moneda} que você informou e de quanto você calcula que valem suas coisas.`,
    esAproximadoVarios: 'Depende dos câmbios informados e de quanto você calcula que valem suas coisas.',
    esAproximadoSinCambio: 'Depende de quanto você calcula que valem suas coisas.',
    sinTotal: (moneda: string) => `Sem total: não há cotação para ${moneda}.`,
  },
};
