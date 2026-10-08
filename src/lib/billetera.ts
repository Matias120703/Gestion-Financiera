import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { Billetera, CotizacionDeMoneda, CuentaDinero, CuentaParaElegir, TotalDeMoneda } from './tipos';

/** Lo que la base devuelve además de lo de siempre desde la 131. Todo opcional: una base vieja no lo trae. */
interface OtrasMonedasCrudas {
  moneda?: unknown;
  cuentas_otras?: unknown;
  totales_otras?: unknown;
  cotizaciones?: unknown;
}

/** La billetera de la cuenta: cada banco con su saldo, y el total (074). */
export async function traerBilletera(empresaId: string): Promise<Billetera> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('billetera', { p_empresa: empresaId });
  const datos = exigir(respuesta, 'la billetera') as Billetera | null;
  const sueltos = (datos as unknown as { sin_cuenta?: { cantidad?: number; neto?: number; desde?: string | null } } | null)?.sin_cuenta;
  const metodos = (datos as unknown as { metodos_sin_cuenta?: unknown } | null)?.metodos_sin_cuenta;
  // LAS OTRAS MONEDAS (131). `cuentas` y `total` siguen siendo solo lo que
  // está en la moneda del negocio; esto viaja aparte y con «si falta, vacío»:
  // contra una base que todavía no tiene la 131, la billetera es la de siempre.
  const otras = datos as unknown as OtrasMonedasCrudas | null;
  const lista = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  return {
    cuentas: Array.isArray(datos?.cuentas) ? datos!.cuentas : [],
    total: Number(datos?.total ?? 0),
    sinCuenta: {
      cantidad: Number(sueltos?.cantidad ?? 0),
      neto: Number(sueltos?.neto ?? 0),
      desde: sueltos?.desde ?? null,
    },
    metodosSinCuenta: Array.isArray(metodos) ? (metodos as string[]) : [],
    moneda: typeof otras?.moneda === 'string' ? otras.moneda : '',
    cuentasOtras: lista<CuentaDinero>(otras?.cuentas_otras),
    totalesOtras: lista<TotalDeMoneda>(otras?.totales_otras)
      .map((t) => ({ moneda: String(t.moneda), total: Number(t.total ?? 0), cuentas: Number(t.cuentas ?? 0) })),
    cotizaciones: lista<CotizacionDeMoneda>(otras?.cotizaciones)
      .map((k) => ({ moneda: String(k.moneda), valor: Number(k.valor ?? 0), desde: String(k.desde ?? '') })),
  };
}

/**
 * Las cuentas, solo para llenar un selector (075).
 *
 * No usa `billetera()` porque eso calcula el saldo de cada una, y para
 * elegir «de qué cuenta salió» alcanzan el nombre y el tipo. Si falla —o si
 * quien mira no administra la cuenta— devuelve la lista vacía y las
 * pantallas siguen andando con el reparto por forma de pago de la 074.
 *
 * LAS CUENTAS EN OTRA MONEDA SE PIDEN A PROPÓSITO (131). Sin `otrasMonedas`
 * —lo que hace toda pantalla menos Gastos— la base devuelve solo las cuentas
 * en la moneda del negocio: Vender, Fiado, Deudas, Reparto, Agenda, Alumnos,
 * la liquidación, la captura y el Presupuesto no pueden ofrecer una cuenta
 * en dólares porque no la reciben (y si alguien la mandara a mano, la base
 * la rechaza). Con `otrasMonedas` vienen después de las propias, marcadas
 * con `otra: true`, su `moneda` y su `cotizacion`.
 *
 * Si la base todavía no conoce la bandera (la 131 se aplica antes que este
 * código, pero un despliegue adelantado no puede romper Gastos), se vuelve a
 * pedir la lista de siempre.
 */
export async function traerCuentasParaElegir(empresaId: string, otrasMonedas = false): Promise<CuentaParaElegir[]> {
  try {
    const supabase = clienteServidor();
    if (otrasMonedas) {
      const { data, error } = await supabase.rpc('cuentas_para_elegir', { p_empresa: empresaId, p_otras_monedas: true });
      if (!error && Array.isArray(data)) return data as CuentaParaElegir[];
    }
    const { data } = await supabase.rpc('cuentas_para_elegir', { p_empresa: empresaId });
    return Array.isArray(data) ? (data as CuentaParaElegir[]) : [];
  } catch {
    return [];
  }
}
