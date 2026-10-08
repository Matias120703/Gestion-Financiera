import type { CuentaParaElegir } from './tipos';

/**
 * EN QUÉ CUENTA CAE LA PLATA (095; 01/10 con el sentido).
 *
 * Las reglas de `ElegirCuenta` (components/FormaDeCobro.tsx), sin React,
 * para poder probarlas solas (pruebas/calculos.test.js).
 */

/** Para dónde va la plata: entra (un cobro, una venta) o sale (un gasto, un pago). */
export type SentidoPlata = 'entra' | 'sale';

/**
 * Dónde puede caer un cobro según cómo se pagó: la plata en mano va a una
 * cuenta de efectivo; una transferencia o una tarjeta, a un banco o a una
 * billetera del celular. Ofrecer «Efectivo» para una transferencia sería
 * ofrecer un error.
 *
 * La cuenta que reclama esa forma de pago entra siempre, sea del tipo que
 * sea: es la que el dueño eligió en su billetera. «Otro» puede ser cualquiera.
 *
 * «CRÉDITO» DEPENDE DE PARA DÓNDE VA (01/10). Lo que ENTRA a crédito es
 * fiado: todavía no te pagaron y no va a ninguna cuenta. Lo que SALE a
 * crédito es la tarjeta con la que pagaste un gasto (en Gastos «Crédito» es
 * eso): va a la cuenta que reclama «crédito» y, si ninguna la reclama, no
 * hay posibles y se ofrecen todas con el aviso, como con cualquier forma de
 * pago sin cuenta. Antes se trataba igual en los dos sentidos y un gasto con
 * la tarjeta se iba de la billetera sin preguntar ni avisar (lo que la 083
 * había cerrado).
 */
export function cuentasDelMetodo(
  todas: CuentaParaElegir[], metodo: string, sentido: SentidoPlata = 'entra',
): CuentaParaElegir[] {
  // Una cuenta en otra moneda (131) no es de acá: ver `sinOtraMoneda`.
  const cuentas = sinOtraMoneda(todas);
  if (metodo === 'credito') {
    return sentido === 'sale' ? cuentas.filter((c) => (c.metodos ?? []).includes('credito')) : [];
  }
  if (metodo === 'otro') return cuentas;
  const tipos = metodo === 'efectivo' ? ['efectivo'] : ['banco', 'billetera'];
  return cuentas.filter((c) => tipos.includes(c.tipo) || (c.metodos ?? []).includes(metodo));
}

/**
 * LAS CUENTAS EN OTRA MONEDA NO ENTRAN EN ESTAS REGLAS (131).
 *
 * Un cobro de Gs. 500.000 no puede caer «solo» en una cuenta en dólares: el
 * importe está en la moneda del negocio y la cuenta en otra. Por eso lo
 * primero que hacen `cuentasDelMetodo` y `cuentaDelCobro` es descartarlas:
 * aunque una pantalla reciba la lista ampliada, nunca las ofrece, nunca las
 * marca y nunca las manda, ni siendo la única cuenta posible ni tocada a
 * mano. La base, además, las rechaza si llegan sin su importe.
 *
 * Solo Gastos las muestra, aparte, con `cuentasEnOtraMoneda` y
 * `cuentaTocada`, y preguntando cuánto salió en la moneda de la cuenta.
 */
function sinOtraMoneda(cuentas: CuentaParaElegir[]): CuentaParaElegir[] {
  return cuentas.some((c) => c.otra) ? cuentas.filter((c) => !c.otra) : cuentas;
}

/**
 * Las cuentas en otra moneda que sirven para esa forma de pago (131), por
 * tipo: la plata en mano, de una de efectivo; cualquier otra forma de pago,
 * de un banco o una billetera. Con «otro» puede ser cualquiera, igual que
 * con las propias. No reclaman formas de pago, así que no hay «la de siempre».
 */
export function cuentasEnOtraMoneda(cuentas: CuentaParaElegir[], metodo: string): CuentaParaElegir[] {
  const otras = cuentas.filter((c) => c.otra);
  if (metodo === 'otro') return otras;
  const tipos = metodo === 'efectivo' ? ['efectivo'] : ['banco', 'billetera'];
  return otras.filter((c) => tipos.includes(c.tipo));
}

/**
 * La cuenta en otra moneda que la persona TOCÓ, si sirve para esa forma de
 * pago; si no, null. Una cuenta en otra moneda nunca queda marcada sola:
 * vale únicamente si la tocaron.
 *
 * LO QUE ENTRA FIADO NO VA A NINGUNA CUENTA, TAMPOCO A ESTAS. En Gastos se
 * podía tocar la de dólares con «Salió plata» y «Crédito» (la tarjeta) y
 * pasar a «Entró plata»: los chips desaparecían (lo fiado no pregunta
 * cuenta) pero la tocada seguía valiendo, y un ingreso que todavía nadie
 * pagó entraba en la cuenta en dólares. Por eso mira el sentido, igual que
 * `cuentaDelCobro`.
 */
export function cuentaTocada(
  cuentas: CuentaParaElegir[], elegida: string | null, metodo = 'otro', sentido: SentidoPlata = 'entra',
): CuentaParaElegir | null {
  if (!elegida || esFiado(metodo, sentido)) return null;
  return cuentasEnOtraMoneda(cuentas, metodo).find((c) => c.id === elegida) ?? null;
}

/** Lo que entra a crédito es fiado: no va a ninguna cuenta ni se pregunta. */
export function esFiado(metodo: string, sentido: SentidoPlata = 'entra'): boolean {
  return metodo === 'credito' && sentido === 'entra';
}

/**
 * La cuenta que se manda al cobrar (o al pagar).
 *
 * La elegida a mano, si sirve para esa forma de pago. Si no, la que reclama
 * esa forma de pago (la de siempre, 074). Y si ninguna la reclama pero hay
 * una sola donde puede caer, esa: con un solo banco, una transferencia no
 * tiene otro lugar adonde ir, y dejarla afuera de la billetera es peor.
 *
 * Cuando NINGUNA cuenta sirve para esa forma de pago (efectivo sin cuenta de
 * efectivo, un gasto con crédito sin tarjeta cargada), `ElegirCuenta` ofrece
 * todas para arreglarlo en el momento: la tocada a mano vale, aunque no sea
 * del tipo. Lo fiado no va a ninguna.
 */
export function cuentaDelCobro(
  todas: CuentaParaElegir[], metodo: string, elegida: string | null, sentido: SentidoPlata = 'entra',
): string | null {
  // Una en otra moneda no vale ni tocada a mano (131): ver `sinOtraMoneda`.
  const cuentas = sinOtraMoneda(todas);
  if (esFiado(metodo, sentido)) return null;
  const posibles = cuentasDelMetodo(cuentas, metodo, sentido);
  if (elegida && posibles.some((c) => c.id === elegida)) return elegida;
  if (elegida && posibles.length === 0 && cuentas.some((c) => c.id === elegida)) return elegida;
  const reclama = posibles.find((c) => (c.metodos ?? []).includes(metodo));
  if (reclama) return reclama.id;
  return posibles.length === 1 ? posibles[0].id : null;
}
