import type { Parcial } from '../fusionar';
import type { Textos } from './es';

/**
 * LAS PALABRAS DEL AGRICULTOR (100).
 *
 * El agricultor usa los lotes del ganadero tal cual: abrir uno, cargarle
 * lo que le va poniendo, ver cuánto le dio. Pero no dice «lote» para el
 * ciclo: dice CAMPAÑA («la soja de esta zafra», «el maíz de la zafriña»).
 * El lote, para él, es el pedazo de tierra: «el Norte», «la parcela 3».
 * Y lo que debe no es «a la venta» sino A COSECHA, que es como se lo
 * vende la casa de insumos.
 *
 * Esto NO es un diccionario entero: son solo las claves que cambian, y se
 * pisan sobre el diccionario de siempre (ver i18n/jergas.ts). Lo que no
 * está acá se lee igual que para el ganadero, y está bien: «Cobrado» o
 * «Sacar» se dicen igual en los dos oficios. Las palabras neutras viven en
 * `campanas.ts`, `gastos-campana.ts` y `panel-campo.ts`.
 *
 * En portugués la campaña es «safra», el lote físico es «talhão», el
 * ticket de balanza es «romaneio» y la deuda a cosecha se paga «na
 * colheita»: el brasiguayo de Alto Paraná habla así.
 */
export const agriculturaEs: Parcial<Textos> = {
  nav: {
    lotes: 'Campañas',
  },
  lotes: {
    enCurso: 'Campañas en curso',
    detalle: 'Una campaña es la soja de este lote o el maíz de la zafriña. Los gastos y las ventas se cargan donde siempre: acá se dice de qué campaña es cada uno y se ve cómo viene.',
    nuevo: 'Abrir una campaña',
    sinLotes: 'No tenés ninguna campaña abierta',
    sinLotesDetalle: 'Una campaña es la soja de este lote o el maíz de la zafriña: «Norte · Soja · 50 ha». Cargale lo que le vas poniendo y te dice cuánto llevás por hectárea y cuántos kilos necesitás para cubrir.',
    cerrados: 'Campañas cerradas',
    cerradosDetalle: 'Quedan para comparar: cómo te fue esta zafra contra la anterior.',
    puesto: 'Puesto',
    cobrado: 'Cobrado',
    sumarAlgo: 'Sumarle algo que ya cargaste',
    sumarAlgoDetalle: 'Gastos e ingresos de los últimos dos meses que todavía no son de ninguna campaña.',
    haySueltos: (n: number) => (n === 1
      ? 'Hay 1 movimiento que todavía no es de ninguna campaña. Abrí una para sumárselo.'
      : `Hay ${n} movimientos que todavía no son de ninguna campaña. Abrí una para sumárselos.`),
    cerrar: 'Cerrar la campaña',
    reabrir: 'Volver a abrirla',
    confirmarCerrar: (nombre: string) =>
      `¿Cerrar ${nombre}? Sale de la lista de lo que está en curso. Si después aparece un gasto o una liquidación que faltaba, el resultado se corrige igual.`,
    nombre: 'Nombre del lote',
    nombreEjemplo: 'Norte, Parcela 3, Chacra de la ruta',
    abrir: 'Abrir la campaña',
  },
  campanas: {
    formulario: {
      titulo: 'Abrir una campaña',
      tituloEditar: 'Editar la campaña',
      tituloRepetir: 'Repetir la campaña',
      cultivo: 'Cultivo',
      nombre: 'Nombre del lote',
      nombreEjemplo: 'Norte, Parcela 3, Chacra de la ruta',
      campana: 'Campaña',
      campanaEjemplo: 'Zafra 2026/27, Zafriña 2027',
      repetirDetalle: 'Mismo lote, mismo cultivo y mismas hectáreas; la campaña nueva se sugiere sola.',
      abrir: 'Abrir la campaña',
      soloAdmin: 'Solo administración abre y edita campañas.',
    },
    tarjeta: {
      aCosecha: 'A cosecha',
      costoFormula: (puesto: string, aCosecha: string) => `Puesto ${puesto} + A cosecha ${aCosecha}`,
      siPagasLoQueDebes: (monto: string) => `${monto} si pagás lo que debés a cosecha`,
      enElSiloSinVender: (kg: string) => `${kg} kg en el silo sin vender`,
      yTenesEnSilo: (kg: string) => `y tenés ${kg} kg en el silo`,
      estructuraDetalle: 'Los gastos por categoría. Lo que debés a cosecha todavía no está acá: entra cuando lo pagás o el silo se lo cobra.',
      deudas: 'A cosecha',
    },
    cosecha: {
      enLoteCerrado: 'La campaña está cerrada, pero se puede cargar igual: el resultado se corrige solo.',
    },
    liquidacion: {
      sumarOtro: 'Sumar kilos de otra campaña',
      sumarOtroDetalle: 'Un solo papel de la cooperativa puede juntar kilos de dos campañas. Los descuentos se reparten por kilos.',
      maxDescuentos: (n: number) => `Hasta ${n} descuentos por campaña.`,
      deudas: 'Deudas a cosecha de esta campaña',
      sinDeudas: 'Esta campaña no debe nada a cosecha.',
      faltaLote: 'La liquidación necesita al menos una campaña con kilos.',
      parteDeDetalle: 'Se maneja desde la campaña: no se edita ni se anula suelta.',
      dosLotes: (n: number) => `Un papel con ${n} campañas`,
    },
    deudas: {
      titulo: 'A cosecha',
      detalle: 'Cuenta en el costo. Cuando lo pagues o el silo se lo cobre del grano, pasa a gasto.',
      sinDeudas: 'No debés nada a cosecha.',
    },
    cierre: {
      cerrar: 'Cerrar la campaña',
      quedanKilos: (kg: string) => `Todavía tenés ${kg} kg sin liquidar`,
      quedanDeudas: (monto: string) => `${monto} a cosecha`,
      cerrado: 'Campaña cerrada.',
      reabierto: 'Campaña abierta de nuevo.',
      comparar: 'Zafra contra zafra',
      compararDetalle: 'Las campañas cerradas del mismo lote, lado a lado: kg/ha y resultado por hectárea.',
      sinComparar: 'Cuando cierres dos campañas del mismo lote las vas a ver acá, una al lado de la otra.',
    },
  },
  gastosCampana: {
    chip: {
      deQueLote: '¿De qué campaña?',
      ninguno: 'Ninguna',
      ningunoDetalle: 'Para los gastos de la casa o del negocio en general.',
      repartir: 'Repartir entre las campañas abiertas',
      repartidoEn: (n: number) => (n === 1 ? 'en 1 campaña' : `repartido en ${n} campañas`),
      guardadoRepartido: (monto: string, n: number) => `${monto} repartidos en ${n} campañas por hectáreas`,
    },
    aCosecha: {
      forma: 'A cosecha',
      formaDetalle: 'No pagás ahora: te lo cobran con el grano. Queda como deuda de la campaña y cuenta en su costo.',
      faltaLote: 'Elegí de qué campaña es: una deuda a cosecha siempre es de una campaña.',
      soloAdmin: 'Solo administración carga deudas a cosecha.',
      quedo: (lote: string, monto: string, acreedor: string, vence: string) =>
        `Quedó como deuda de la campaña ${lote}: ${monto} a ${acreedor}, vence el ${vence}.`,
      quedoSinVence: (lote: string, monto: string, acreedor: string) =>
        `Quedó como deuda de la campaña ${lote}: ${monto} a ${acreedor}.`,
      quedoDetalle: 'Cuenta en el costo de la campaña; cuando la pagues o el silo se la cobre, pasa a gasto.',
    },
    historial: {
      accion: 'Campaña',
      asignar: 'Sumarlo a una campaña',
      sacar: 'Sacarlo de la campaña',
      deLote: (nombre: string) => `Campaña: ${nombre}`,
      sinLote: 'Sin campaña',
      sacado: 'Sacado de la campaña.',
      parteDeLiquidacionDetalle: 'Se maneja desde la campaña: no se edita ni se anula suelta. Anulá la liquidación entera.',
      repartido: (n: number) => `Repartido en ${n} campañas`,
      anularJuntasPregunta: (n: number) =>
        `Este gasto está repartido en ${n} campañas. Se anulan las ${n} partes juntas. ¿Seguimos?`,
    },
    vender: {
      siloDetalle: 'Cargalo desde la campaña, así te calcula el rendimiento y el precio promedio.',
      irAlLote: 'Ir a la campaña',
      deQueLote: '¿De qué campaña es esta venta?',
    },
    captura: {
      deQueLoteEs: '¿De qué campaña es?',
      noReconocido: (nombre: string) => `Nombraste «${nombre}», pero no hay ninguna campaña con ese nombre. Elegí una o dejalo sin campaña.`,
      sinLote: 'Sin campaña',
      aCosechaDespues: 'Si esto fue a cosecha, cargalo desde Gastos: por voz todavía no.',
    },
  },
  panelCampo: {
    enCurso: 'Campañas en curso',
    vacio: 'Abrí tu primera campaña',
    vacioDetalle: 'Cargale lo que le vas poniendo y acá vas a ver cómo viene: cuánto llevás por hectárea y cuántos kilos necesitás para cubrir.',
    abrir: 'Abrir una campaña',
    debes: {
      aCosecha: (monto: string) => `${monto} a cosecha`,
    },
    cerradasEsteAnio: 'Cerradas este año',
    cerradasDetalle: (n: number) => (n === 1 ? '1 campaña cerrada' : `${n} campañas cerradas`),
    esDeCaja: 'Todo es de caja: plata que entró menos plata que salió. Lo que debés a cosecha no está acá hasta que lo pagues.',
  },
};

export const agriculturaPt: Parcial<Textos> = {
  nav: {
    lotes: 'Safras',
  },
  lotes: {
    enCurso: 'Safras em andamento',
    detalle: 'Uma safra é a soja deste talhão ou o milho da safrinha. As despesas e as vendas se lançam onde sempre: aqui se diz de qual safra é cada uma e se vê como vai indo.',
    nuevo: 'Abrir uma safra',
    sinLotes: 'Você não tem nenhuma safra aberta',
    sinLotesDetalle: 'Uma safra é a soja deste talhão ou o milho da safrinha: «Norte · Soja · 50 ha». Lance o que você vai colocando nela e ela diz quanto já foi por hectare e quantas sacas você precisa pra cobrir.',
    cerrados: 'Safras fechadas',
    cerradosDetalle: 'Ficam pra comparar: como foi esta safra contra a anterior.',
    puesto: 'Investido',
    cobrado: 'Recebido',
    sumarAlgo: 'Somar algo que você já lançou',
    sumarAlgoDetalle: 'Despesas e entradas dos últimos dois meses que ainda não são de nenhuma safra.',
    haySueltos: (n: number) => (n === 1
      ? 'Há 1 lançamento que ainda não é de nenhuma safra. Abra uma pra somar.'
      : `Há ${n} lançamentos que ainda não são de nenhuma safra. Abra uma pra somar.`),
    cerrar: 'Fechar a safra',
    reabrir: 'Abrir de novo',
    confirmarCerrar: (nombre: string) =>
      `Fechar ${nombre}? Sai da lista do que está em andamento. Se depois aparecer uma despesa ou uma liquidação que faltava, o resultado se corrige igual.`,
    nombre: 'Nome do talhão',
    nombreEjemplo: 'Talhão 3, Lavoura da estrada',
    abrir: 'Abrir a safra',
  },
  campanas: {
    formulario: {
      titulo: 'Abrir uma safra',
      tituloEditar: 'Editar a safra',
      tituloRepetir: 'Repetir a safra',
      cultivo: 'Cultura',
      nombre: 'Nome do talhão',
      nombreEjemplo: 'Talhão 3, Lavoura da estrada',
      campana: 'Safra',
      campanaEjemplo: 'Safra 26/27, Safrinha 27',
      repetirDetalle: 'Mesmo talhão, mesma cultura e mesmos hectares; a safra nova é sugerida sozinha.',
      abrir: 'Abrir a safra',
      soloAdmin: 'Só a administração abre e edita safras.',
    },
    tarjeta: {
      aCosecha: 'Na colheita',
      costoFormula: (puesto: string, aCosecha: string) => `Investido ${puesto} + Na colheita ${aCosecha}`,
      siPagasLoQueDebes: (monto: string) => `${monto} se você pagar o que deve na colheita`,
      enElSiloSinVender: (kg: string) => `${kg} kg no silo, a vender`,
      yTenesEnSilo: (kg: string) => `e você tem ${kg} kg no silo`,
      estructuraDetalle: 'As despesas por categoria. O que você deve na colheita ainda não está aqui: entra quando você paga ou o armazém cobra.',
      deudas: 'Na colheita',
    },
    cosecha: {
      enLoteCerrado: 'A safra está fechada, mas dá pra lançar igual: o resultado se corrige sozinho.',
    },
    liquidacion: {
      sumarOtro: 'Somar quilos de outra safra',
      sumarOtroDetalle: 'Um papel só da cooperativa pode juntar quilos de duas safras. Os descontos se dividem por quilos.',
      maxDescuentos: (n: number) => `Até ${n} descontos por safra.`,
      deudas: 'Dívidas na colheita desta safra',
      sinDeudas: 'Esta safra não deve nada na colheita.',
      faltaLote: 'A liquidação precisa de pelo menos uma safra com quilos.',
      parteDeDetalle: 'Se mexe a partir da safra: não se edita nem se anula solta.',
      dosLotes: (n: number) => `Um papel com ${n} safras`,
    },
    deudas: {
      titulo: 'Na colheita',
      detalle: 'Conta no custo. Quando você pagar ou o armazém cobrar do grão, vira despesa.',
      sinDeudas: 'Você não deve nada na colheita.',
    },
    cierre: {
      cerrar: 'Fechar a safra',
      quedanKilos: (kg: string) => `Você ainda tem ${kg} kg sem liquidar`,
      quedanDeudas: (monto: string) => `${monto} na colheita`,
      cerrado: 'Safra fechada.',
      reabierto: 'Safra aberta de novo.',
      comparar: 'Safra contra safra',
      compararDetalle: 'As safras fechadas do mesmo talhão, lado a lado: sc/ha e resultado por hectare.',
      sinComparar: 'Quando você fechar duas safras do mesmo talhão, vai vê-las aqui, uma do lado da outra.',
    },
  },
  gastosCampana: {
    chip: {
      deQueLote: 'De qual safra?',
      ninguno: 'Nenhuma',
      ningunoDetalle: 'Pras despesas da casa ou do negócio em geral.',
      repartir: 'Dividir entre as safras abertas',
      repartidoEn: (n: number) => (n === 1 ? 'em 1 safra' : `dividido em ${n} safras`),
      guardadoRepartido: (monto: string, n: number) => `${monto} divididos em ${n} safras por hectares`,
    },
    aCosecha: {
      forma: 'Na colheita',
      formaDetalle: 'Você não paga agora: cobram com o grão. Fica como dívida da safra e conta no custo dela.',
      faltaLote: 'Escolha de qual safra é: uma dívida na colheita é sempre de uma safra.',
      soloAdmin: 'Só a administração lança dívidas na colheita.',
      quedo: (lote: string, monto: string, acreedor: string, vence: string) =>
        `Ficou como dívida da safra ${lote}: ${monto} pra ${acreedor}, vence em ${vence}.`,
      quedoSinVence: (lote: string, monto: string, acreedor: string) =>
        `Ficou como dívida da safra ${lote}: ${monto} pra ${acreedor}.`,
      quedoDetalle: 'Conta no custo da safra; quando você pagar ou o armazém cobrar, vira despesa.',
    },
    historial: {
      accion: 'Safra',
      asignar: 'Somar a uma safra',
      sacar: 'Tirar da safra',
      deLote: (nombre: string) => `Safra: ${nombre}`,
      sinLote: 'Sem safra',
      sacado: 'Tirado da safra.',
      parteDeLiquidacionDetalle: 'Se mexe a partir da safra: não se edita nem se anula solta. Anule a liquidação inteira.',
      repartido: (n: number) => `Dividido em ${n} safras`,
      anularJuntasPregunta: (n: number) =>
        `Esta despesa está dividida em ${n} safras. As ${n} partes são anuladas juntas. Seguimos?`,
    },
    vender: {
      siloDetalle: 'Lance a partir da safra, assim calcula a produtividade e o preço médio.',
      irAlLote: 'Ir pra safra',
      deQueLote: 'De qual safra é esta venda?',
    },
    captura: {
      deQueLoteEs: 'De qual safra é?',
      noReconocido: (nombre: string) => `Você falou «${nombre}», mas não há nenhuma safra com esse nome. Escolha uma ou deixe sem safra.`,
      sinLote: 'Sem safra',
      aCosechaDespues: 'Se isso foi na colheita, lance a partir de Despesas: por voz ainda não.',
    },
  },
  panelCampo: {
    enCurso: 'Safras em andamento',
    vacio: 'Abra sua primeira safra',
    vacioDetalle: 'Lance o que você vai colocando nela e aqui você vê como vai: quanto já foi por hectare e quantas sacas precisa pra cobrir.',
    abrir: 'Abrir uma safra',
    debes: {
      aCosecha: (monto: string) => `${monto} na colheita`,
    },
    cerradasEsteAnio: 'Fechadas este ano',
    cerradasDetalle: (n: number) => (n === 1 ? '1 safra fechada' : `${n} safras fechadas`),
    esDeCaja: 'Tudo é de caixa: dinheiro que entrou menos dinheiro que saiu. O que você deve na colheita não está aqui até você pagar.',
  },
};
