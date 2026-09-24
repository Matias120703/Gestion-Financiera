import type { Parcial } from '../fusionar';
import type { Textos } from './es';

/**
 * LAS PALABRAS DEL GANADERO (fase 0 de ganadería, 24/09).
 *
 * Los lotes son del ganadero desde la 044, pero cuando el agricultor los
 * heredó (100) los textos neutros quedaron con ejemplos del grano: «la soja
 * de esta campaña», «esta zafra», «Parcela 2», «mismas hectáreas», «el silo
 * se lo cobra del grano». Un ganadero los leía todos. Acá se pisan con
 * palabras de la hacienda, igual que la jerga del agricultor pisa las suyas
 * (ver i18n/jergas.ts).
 *
 * Tres cosas más que no son de palabra sino de verdad:
 *
 *   · «Cobrado» pasa a «Vendido». El lote suma la venta fiada al
 *     frigorífico el día que se vende, no el día que paga: llamarlo
 *     «cobrado» decía que la plata ya estaba.
 *   · El que se suma con el código es el CAPATAZ, no un «vendedor». Es el
 *     mismo rol `vendedor` de la base; cambia cómo se lo llama. Lo que ve y
 *     lo que no se decide en la fase 1a (el capataz no ve precios ni
 *     montos); mientras tanto no se le promete nada que no sea cierto.
 *   · Sin hectáreas, un gasto repartido entre lotes va en partes iguales, y
 *     la confirmación lo dice así.
 */
export const ganaderiaEs: Parcial<Textos> = {
  lotes: {
    sinLotesDetalle: 'Un lote es la hacienda que entra y sale junta: los novillos de este corral, los desmamantes que compraste en la feria. Abrí uno y cargale lo que le vas poniendo.',
    cerradosDetalle: 'Quedan para comparar: cómo te fue este lote contra el anterior.',
    cobrado: 'Vendido',
    nombreEjemplo: 'Novillos corral 3, Desmamantes de la feria',
    unidadEjemplo: 'cabezas',
  },
  campanas: {
    formulario: {
      nombreEjemplo: 'Novillos corral 3, Desmamantes de marzo',
      campanaEjemplo: 'Engorde 2026, Invernada de otoño',
      repetirDetalle: 'Mismo nombre; el ciclo nuevo se sugiere solo.',
    },
    tarjeta: {
      cobrado: 'Vendido',
    },
    deudas: {
      detalle: 'Cuenta en el costo. Cuando la pagues, o te la descuenten de la venta, pasa a gasto.',
    },
  },
  gastosCampana: {
    chip: {
      repartirDetalle: 'En partes iguales entre los lotes abiertos.',
      guardadoRepartido: (monto: string, n: number) => `${monto} repartidos en ${n} lotes, en partes iguales`,
    },
    aCosecha: {
      proveedorEjemplo: 'La veterinaria, la agropecuaria, el vecino',
      venceDetalle: 'Cuándo pensás pagarla. Si el papel dice una fecha, poné esa.',
      quedoDetalle: 'Cuenta en el costo del lote; cuando la pagues, o te la descuenten de la venta, pasa a gasto.',
    },
  },
  panelCampo: {
    vacioDetalle: 'Cargale lo que le vas poniendo y acá vas a ver cómo viene: cuánto llevás puesto, cuánto vendiste y el resultado por cabeza.',
    esDeCaja: 'Lo vendido cuenta el día que vendés, aunque te paguen después. Lo que debés a la venta no está acá hasta que lo pagues.',
  },
  movimientos: {
    resultadoEnLotes: 'Ahí está el resultado de cada tropa',
  },

  // EL CAPATAZ. Como el encargado del agricultor (102): el mismo rol de la
  // base con el nombre del oficio, solo en lo que se ve adentro de la app.
  roles: {
    vendedor: 'Capataz',
  },
  pantallas: {
    colVendedor: 'Capataz',
    estadoCostosOk: 'Un capataz no puede recuperar el costo de compra, el margen ni la ganancia, ni siquiera consultando la base directamente.',
  },
  ajustes: {
    permisosEnLaBase: 'Estos permisos están aplicados en la base de datos, no en los botones. Los costos de compra ni siquiera salen del servidor para un capataz: le llegan vacíos. Aunque alguien abra la consola del navegador y consulte directamente, no puede recuperarlos. El plan de suscripción no lo cambia nadie desde la aplicación: lo define el sistema de pagos.',
    pasaleElCodigo: 'Pasale este código a tu capataz. Va a poder cargar gastos y ventas, pero no cambiar la configuración.',
  },
  plan: {
    soloUnaPersona: 'Vos solo, sin capataz',
  },
};

export const ganaderiaPt: Parcial<Textos> = {
  lotes: {
    sinLotesDetalle: 'Um lote é o gado que entra e sai junto: os novilhos deste curral, os bezerros que você comprou no leilão. Abra um e lance o que você vai colocando nele.',
    cerradosDetalle: 'Ficam pra comparar: como foi este lote contra o anterior.',
    cobrado: 'Vendido',
    nombreEjemplo: 'Novilhos curral 3, Bezerros do leilão',
    unidadEjemplo: 'cabeças',
  },
  campanas: {
    formulario: {
      nombreEjemplo: 'Novilhos curral 3, Bezerros de março',
      campanaEjemplo: 'Engorda 2026, Recria de outono',
      repetirDetalle: 'Mesmo nome; o ciclo novo é sugerido sozinho.',
    },
    tarjeta: {
      cobrado: 'Vendido',
    },
    deudas: {
      detalle: 'Conta no custo. Quando você pagar, ou descontarem da venda, vira despesa.',
    },
  },
  gastosCampana: {
    chip: {
      repartirDetalle: 'Em partes iguais entre os lotes abertos.',
      guardadoRepartido: (monto: string, n: number) => `${monto} divididos em ${n} lotes, em partes iguais`,
    },
    aCosecha: {
      proveedorEjemplo: 'A veterinária, a agropecuária, o vizinho',
      venceDetalle: 'Quando você pensa pagar. Se o papel diz uma data, coloque essa.',
      quedoDetalle: 'Conta no custo do lote; quando você pagar, ou descontarem da venda, vira despesa.',
    },
  },
  panelCampo: {
    vacioDetalle: 'Lance o que você vai colocando nele e aqui você vê como vai: quanto já investiu, quanto vendeu e o resultado por cabeça.',
    esDeCaja: 'O vendido conta no dia em que você vende, mesmo que paguem depois. O que você deve na venda não está aqui até você pagar.',
  },
  movimientos: {
    resultadoEnLotes: 'Lá está o resultado de cada lote',
  },
  roles: {
    vendedor: 'Capataz',
  },
  pantallas: {
    colVendedor: 'Capataz',
    estadoCostosOk: 'Um capataz não consegue recuperar o custo de compra, a margem nem o lucro, nem consultando o banco de dados diretamente.',
  },
  ajustes: {
    permisosEnLaBase: 'Essas permissões estão aplicadas no banco de dados, não nos botões. Os custos de compra nem saem do servidor para um capataz: chegam vazios. Mesmo que alguém abra o console do navegador e consulte diretamente, não consegue recuperá-los. O plano de assinatura ninguém muda pelo aplicativo: quem define é o sistema de pagamentos.',
    pasaleElCodigo: 'Passe este código pro seu capataz. Ele vai poder lançar despesas e vendas, mas não mudar a configuração.',
  },
  plan: {
    soloUnaPersona: 'Só você, sem capataz',
  },
};
