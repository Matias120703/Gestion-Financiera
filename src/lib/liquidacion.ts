/**
 * EL PAPEL DE LA LIQUIDACIÓN, REPARTIDO ENTRE CAMPAÑAS (100).
 *
 * La cooperativa liquida por socio, no por lote: un solo papel puede
 * juntar kilos de dos campañas (la soja del Norte y la del Sur), con un
 * solo bruto, un solo secado, un solo flete y un solo neto. La base guarda
 * una fila de `liquidaciones` por campaña, todas con el mismo `grupo_id`,
 * y cada fila tiene que cuadrar sola (bruto − descuentos − compensado −
 * grano = neto). Entonces alguien tiene que repartir el papel entre las
 * partes ANTES de mandarlo, y ese alguien es este archivo: puro, sin
 * dependencias, probado peso por peso.
 *
 * Reglas del reparto:
 *   · el bruto de cada parte es sus kilos por el precio del papel;
 *   · descuentos y «grano que pagó otra cosa» se prorratean por kilos, a
 *     dos decimales, y el resto del redondeo va a la última parte;
 *   · cada deuda va ENTERA a la parte de su campaña (una deuda «a cosecha»
 *     es de una campaña), o a la primera si la deuda no tiene campaña;
 *   · la suma de las partes es el papel, peso por peso. Nunca aparece un
 *     centavo ni desaparece uno.
 *
 * Y la regla del año seco (decisión 12): si lo que el silo descontó suma
 * más que el bruto, no se manda un neto negativo. Se baja lo compensado de
 * las deudas hasta que el neto sea cero y lo que falte sigue como deuda.
 */

export interface DescuentoPapel {
  /** Categoría de gasto: Secado y acopio, Fletes, Retención de IVA… */
  categoria: string;
  monto: number;
}

export interface DeudaPapel {
  deuda_id: string;
  /** La campaña de la deuda («a cosecha»); null si la deuda no tiene. */
  lote_id: string | null;
  /** Cuánto se cobró el silo de esa deuda en este papel. */
  monto: number;
}

export interface GranoPapel {
  /** Categoría del gasto que pagó el grano: Arrendamiento, u otra. */
  categoria: string;
  monto: number;
  /** «12.000 kg del dueño a 0,415». Vacía: se usa la categoría. */
  descripcion: string;
}

export interface ParteKg {
  lote_id: string;
  kg: number;
}

/** El papel de la cooperativa, tal como lo cargó la pantalla. */
export interface Papel {
  fecha: string;
  comprador: string;
  /** En la moneda del negocio, por tonelada. */
  precioTonelada: number;
  descuentos: DescuentoPapel[];
  deudas: DeudaPapel[];
  grano: GranoPapel[];
  /** Kilos de cada campaña que entraron en el papel, en el orden de la pantalla. */
  partesKg: ParteKg[];
}

/** La forma EXACTA de cada elemento de `p_partes` de `registrar_liquidacion`. */
export interface ParteLiquidacion {
  lote_id: string;
  kg: number;
  descuentos: { categoria: string; monto: number }[];
  deudas: { deuda_id: string; monto: number }[];
  grano: { categoria: string; monto: number; descripcion: string }[];
}

/** Los números de una parte, para que la pantalla los muestre por campaña. */
export interface NumerosDeParte {
  lote_id: string;
  kg: number;
  bruto: number;
  descuentos: number;
  compensado: number;
  grano: number;
  neto: number;
}

export interface Reparto {
  partes: ParteLiquidacion[];
  porParte: NumerosDeParte[];
  bruto: number;
  descuentos: number;
  compensado: number;
  grano: number;
  neto: number;
}

function redondear2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function suma(valores: number[]): number {
  return redondear2(valores.reduce((a, b) => a + b, 0));
}

/** Lo mismo que hace la base: round(kg × precio / 1000, 2). */
export function brutoDe(kg: number, precioTonelada: number): number {
  return redondear2((kg * precioTonelada) / 1000);
}

/** El bruto del papel entero: la suma de los brutos de cada parte, como lo suma la base. */
export function brutoDelPapel(papel: Papel): number {
  return suma(papel.partesKg.map((p) => brutoDe(p.kg, papel.precioTonelada)));
}

/**
 * Prorratea un monto por kilos entre las partes, a dos decimales, por el
 * método del mayor resto: cada parte recibe los centavos enteros que le
 * tocan y los que sobran van de a uno a las de mayor fracción. Así la suma
 * es exactamente el monto y ninguna cuota sale negativa (con «el resto a la
 * última», 0,05 entre diez partes podía dar −0,04 en una parte chica). Una
 * cuota puede ser 0 en una parte muy chica: la que llama la descarta,
 * porque la base no acepta un descuento en cero.
 */
function prorratear(monto: number, partes: ParteKg[]): number[] {
  const totalKg = partes.reduce((a, p) => a + p.kg, 0);
  if (partes.length === 0) return [];
  const centavos = Math.round(monto * 100);
  if (totalKg <= 0) {
    return partes.map((_, i) => (i === partes.length - 1 ? centavos / 100 : 0));
  }
  const exactas = partes.map((p) => (centavos * p.kg) / totalKg);
  const enteras = exactas.map((x) => Math.floor(x));
  let sobran = centavos - enteras.reduce((a, b) => a + b, 0);
  const orden = exactas
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let k = 0; sobran > 0; k = (k + 1) % orden.length, sobran--) enteras[orden[k].i] += 1;
  return enteras.map((c) => c / 100);
}

/**
 * Reparte el papel entre sus campañas y devuelve las partes listas para
 * `p_partes`, más los totales del papel y los números de cada parte.
 */
export function repartirLiquidacion(papel: Papel): Reparto {
  const partesKg = papel.partesKg;
  const n = partesKg.length;
  const partes: ParteLiquidacion[] = partesKg.map((p) => ({
    lote_id: p.lote_id, kg: p.kg, descuentos: [], deudas: [], grano: [],
  }));

  for (const d of papel.descuentos) {
    prorratear(d.monto, partesKg).forEach((cuota, i) => {
      if (cuota > 0) partes[i].descuentos.push({ categoria: d.categoria, monto: cuota });
    });
  }
  for (const g of papel.grano) {
    prorratear(g.monto, partesKg).forEach((cuota, i) => {
      if (cuota > 0) partes[i].grano.push({ categoria: g.categoria, monto: cuota, descripcion: g.descripcion });
    });
  }
  // LAS DEUDAS. Cada una va a la parte de su campaña (o a la primera si no
  // tiene), pero nunca más de lo que a esa parte le queda de neto: la base
  // mira el neto parte por parte, y una deuda de «Norte» compensada en un
  // papel donde Norte trae pocos kilos dejaría esa parte en negativo aunque
  // el papel entero cierre. Lo que no entra pasa a la parte con más lugar.
  // No cambia a qué campaña va el costo: el gasto que nace al pagar lleva
  // la campaña de la DEUDA (registrar_pago_deuda), sea cual sea la parte.
  // Se cuenta en centavos para no perder ninguno.
  const lugar = partes.map((p) => Math.round(brutoDe(p.kg, papel.precioTonelada) * 100)
    - Math.round(p.descuentos.reduce((a, x) => a + x.monto, 0) * 100)
    - Math.round(p.grano.reduce((a, x) => a + x.monto, 0) * 100));
  const poner = (i: number, deudaId: string, centavos: number) => {
    const ya = partes[i].deudas.find((x) => x.deuda_id === deudaId);
    if (ya) ya.monto = redondear2(ya.monto + centavos / 100);
    else partes[i].deudas.push({ deuda_id: deudaId, monto: centavos / 100 });
    lugar[i] -= centavos;
  };
  for (const d of papel.deudas) {
    if (d.monto <= 0 || n === 0) continue;
    let falta = Math.round(d.monto * 100);
    const suya = Math.max(0, partes.findIndex((p) => p.lote_id === d.lote_id));
    const enLaSuya = Math.min(falta, Math.max(0, lugar[suya]));
    if (enLaSuya > 0) { poner(suya, d.deuda_id, enLaSuya); falta -= enLaSuya; }
    while (falta > 0) {
      let mejor = -1;
      for (let i = 0; i < n; i++) if (lugar[i] > 0 && (mejor < 0 || lugar[i] > lugar[mejor])) mejor = i;
      // No hay lugar en ninguna parte: el papel no cuadra. Va entero a la
      // suya y la base lo dice (la pantalla ya lo topó con toparCompensaciones).
      if (mejor < 0) { poner(suya, d.deuda_id, falta); break; }
      const cuanto = Math.min(falta, lugar[mejor]);
      poner(mejor, d.deuda_id, cuanto);
      falta -= cuanto;
    }
  }

  const porParte: NumerosDeParte[] = partes.map((p) => {
    const bruto = brutoDe(p.kg, papel.precioTonelada);
    const descuentos = suma(p.descuentos.map((x) => x.monto));
    const compensado = suma(p.deudas.map((x) => x.monto));
    const grano = suma(p.grano.map((x) => x.monto));
    return {
      lote_id: p.lote_id, kg: p.kg, bruto, descuentos, compensado, grano,
      neto: redondear2(bruto - descuentos - compensado - grano),
    };
  });

  return {
    partes,
    porParte,
    bruto: suma(porParte.map((p) => p.bruto)),
    descuentos: suma(porParte.map((p) => p.descuentos)),
    compensado: suma(porParte.map((p) => p.compensado)),
    grano: suma(porParte.map((p) => p.grano)),
    neto: suma(porParte.map((p) => p.neto)),
  };
}

/** Lo que acredita el banco: bruto − descuentos − deudas − grano. Negativo si no cuadra. */
export function netoDe(papel: Papel): number {
  return redondear2(
    brutoDelPapel(papel)
    - papel.descuentos.reduce((a, d) => a + d.monto, 0)
    - papel.deudas.reduce((a, d) => a + d.monto, 0)
    - papel.grano.reduce((a, g) => a + g.monto, 0),
  );
}

export interface Topado {
  /** El mismo papel con las deudas bajadas hasta que el neto sea cero (o el original si cuadraba). */
  papel: Papel;
  /** Por cada deuda que se bajó, cuánto quedó sin compensar (sigue como deuda). */
  sinCompensar: { deuda_id: string; monto: number }[];
  /** El neto del papel topado. Sigue negativo solo si descuentos + grano ya superan el bruto. */
  neto: number;
}

/**
 * EL AÑO SECO. Si Σ(descuentos + deudas + grano) > bruto, la base rechaza
 * el papel. Acá se bajan los montos de las deudas, en el orden en que
 * vienen, hasta que el neto sea cero. Lo que se baja no se pierde: la
 * deuda sigue con ese saldo, y la pantalla lo dice.
 *
 * Los descuentos y el grano no se tocan: son lo que el silo ya hizo.
 */
export function toparCompensaciones(papel: Papel): Topado {
  const neto = netoDe(papel);
  if (neto >= 0) return { papel, sinCompensar: [], neto };

  const disponible = Math.max(0, redondear2(
    brutoDelPapel(papel)
    - papel.descuentos.reduce((a, d) => a + d.monto, 0)
    - papel.grano.reduce((a, g) => a + g.monto, 0),
  ));
  let queda = disponible;
  const sinCompensar: { deuda_id: string; monto: number }[] = [];
  const deudas = papel.deudas.map((d) => {
    const asignado = redondear2(Math.min(d.monto, queda));
    queda = redondear2(queda - asignado);
    if (asignado < d.monto) sinCompensar.push({ deuda_id: d.deuda_id, monto: redondear2(d.monto - asignado) });
    return { ...d, monto: asignado };
  }).filter((d) => d.monto > 0);

  const topado: Papel = { ...papel, deudas };
  return { papel: topado, sinCompensar, neto: netoDe(topado) };
}
