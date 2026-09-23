import crypto from 'node:crypto';
import type { PeriodoCobro } from './tipos';
import type { PlanDeRubro } from './rubros';

/**
 * ============================================================
 * COBRO
 * ============================================================
 *
 * POR QUÉ HAY UNA COSTURA Y NO UNA SOLA PASARELA
 *
 * Stripe no opera con cuentas de todos los países, y Paraguay es uno de los
 * que quedan afuera. Quien factura desde Asunción cobra con Pagopar o
 * Bancard; quien factura desde otro lado, con Stripe o con un intermediario
 * tipo Paddle. Elegir una sola y clavarla en el código obligaría a reescribir
 * todo el cobro el día que cambie el país de facturación.
 *
 * Por eso `PASARELA` es una variable de entorno y acá hay un adaptador por
 * cada una. Mientras valga 'ninguna', la app funciona entera y la pantalla de
 * planes lo dice con todas las letras en vez de romperse.
 *
 * REGLAS QUE NO SE NEGOCIAN
 *
 *   1. EL IMPORTE NUNCA VIAJA DESDE EL NAVEGADOR. El cliente manda plan y
 *      periodo; el precio sale de la tabla `precios`. Si el monto llegara en
 *      el pedido, alguien pagaría un guaraní por el plan Premium.
 *
 *   2. EL PLAN LO ACTIVA EL WEBHOOK, NO LA PANTALLA DE "GRACIAS". Volver de
 *      la pasarela no prueba que se haya pagado: se puede llegar a esa URL
 *      escribiéndola. Lo único que activa el plan es `aplicar_suscripcion()`
 *      llamada desde un webhook con firma verificada.
 *
 *   3. LA FIRMA SE COMPARA EN TIEMPO CONSTANTE. Con `===`, el tiempo que
 *      tarda en fallar filtra cuántos caracteres acertó quien lo intenta.
 */

export type Pasarela = 'ninguna' | 'stripe' | 'pagopar';

export function pasarelaActiva(): Pasarela {
  const valor = (process.env.PASARELA ?? 'ninguna').toLowerCase();
  if (valor === 'stripe' || valor === 'pagopar') return valor;
  return 'ninguna';
}

export function sitio(): string {
  return (process.env.NEXT_PUBLIC_SITIO ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Los tres planes que se cobran. Es el mismo trío de `PlanDeRubro` (102):
 * si un día se suma un cuarto, el compilador avisa acá y en el webhook.
 */
export type PlanPago = PlanDeRubro;

const PLANES_PAGOS: readonly PlanPago[] = ['basico', 'pro', 'negocio'];

/**
 * Lo que dice cada plan en el resumen de la tarjeta cuando el precio se arma
 * al vuelo. «negocio» se vende como Premium: la persona tiene que reconocer
 * en el resumen el nombre que eligió en la pantalla.
 */
export const NOMBRE_DE_PRODUCTO: Record<PlanPago, string> = {
  basico: 'Orden Básico',
  pro: 'Orden Pro',
  negocio: 'Orden Premium',
};

/** `true` solo para 'basico', 'pro' o 'negocio', escritos exactamente así. */
export function esPlanPago(valor: unknown): valor is PlanPago {
  return typeof valor === 'string' && (PLANES_PAGOS as readonly string[]).includes(valor);
}

/**
 * QUÉ PLAN SE PAGÓ, SEGÚN LOS METADATOS DEL EVENTO.
 *
 * El checkout escribe `plan` en los metadatos de la sesión y de la
 * suscripción. Cada evento lo trae en un lugar distinto: la sesión y la
 * suscripción, en `metadata`; la factura (el impago), en
 * `subscription_details.metadata` o, con la API nueva de Stripe, en
 * `parent.subscription_details.metadata`. Se mira en ese orden.
 *
 * Antes el webhook hacía `plan === 'negocio' ? 'negocio' : 'pro'`: todo lo
 * que no fuera Premium salía Pro, y un Básico pagado con tarjeta quedaba
 * con el plan de 190.000 cobrando el de 110.000. Ahora, lo que no sea uno de
 * los tres planes escrito tal cual devuelve `null`, y no se adivina.
 */
export function planDeMetadatos(objeto: any): PlanPago | null {
  const candidatos = [
    objeto?.metadata?.plan,
    objeto?.subscription_details?.metadata?.plan,
    objeto?.parent?.subscription_details?.metadata?.plan,
  ];
  for (const c of candidatos) {
    if (c === undefined || c === null || c === '') continue;
    // El primero que aparece manda: si dice otra cosa, no se sigue buscando
    // más abajo uno que convenga.
    return esPlanPago(c) ? c : null;
  }
  return null;
}

/**
 * CON QUÉ PLAN SE LLAMA A `aplicar_suscripcion()`, O SI NO SE LLAMA (`null`).
 *
 *   · Si los metadatos traen un plan válido, ese.
 *   · Si no, y el evento DA algo (queda 'activa' o 'prueba'), no se aplica
 *     nada: activar un plan adivinado es regalar uno más caro del que se
 *     pagó. El webhook lo deja en el registro y el plan se carga a mano con
 *     «Activar mes», que es como se cobra hoy.
 *   · Si no, y el evento QUITA algo ('morosa', 'cancelada'), se aplica con el
 *     plan que la suscripción ya tiene: marcarla morosa o cancelada no regala
 *     nada, y saltearla dejaría como al día a quien dejó de pagar. Si la
 *     suscripción no tiene un plan pago, tampoco se inventa: `null`.
 */
export function planParaAplicar(
  deMetadatos: PlanPago | null, estado: string, planActual: unknown,
): PlanPago | null {
  if (deMetadatos) return deMetadatos;
  if (estado === 'morosa' || estado === 'cancelada') {
    return esPlanPago(planActual) ? planActual : null;
  }
  return null;
}

/** Los estados que el webhook le manda a `aplicar_suscripcion()`. */
export type EstadoDeStripe = 'activa' | 'prueba' | 'morosa' | 'cancelada';

/**
 * EL ESTADO DE LA SUSCRIPCIÓN, SOLO SI STRIPE DICE ALGO QUE SE CONOCE.
 *
 * Antes, todo `status` que no fuera 'trialing', 'past_due', 'unpaid' o
 * 'canceled' caía en 'activa', y un evento sin `status` también. Eso incluía
 * 'incomplete' (el primer cobro todavía no se confirmó), 'incomplete_expired'
 * (el cobro falló del todo) y 'paused'. Con el importe del precio al lado,
 * la base lo toma como plata que entró: activaba el plan sin cobro y, desde
 * la 104, además le generaba la comisión al socio, que ocupaba el único
 * lugar por negocio y el cobro de verdad ya no generaba la suya.
 *
 * Ahora:
 *   · la sesión de checkout ('checkout.session.completed') cuenta como
 *     'activa' solo con `payment_status` 'paid'. Una prueba sin cobro
 *     ('no_payment_required') o un pago que se acredita después ('unpaid')
 *     no activan nada desde acá: el estado real lo trae el evento de la
 *     suscripción que llega al lado.
 *   · la suscripción: 'active' → 'activa', 'trialing' → 'prueba',
 *     'past_due' y 'unpaid' → 'morosa', 'canceled' → 'cancelada'.
 *   · cualquier otro, o ninguno: `null`, y el webhook no aplica nada.
 *
 * «Cancela al vencer» convierte en 'cancelada' solo lo que estaba al día
 * ('activa' o 'prueba'): una 'cancelada' con fin de período por delante
 * conserva el plan hasta esa fecha, así que aplicarla a un status que no se
 * conoce, o a uno moroso, regalaría el mes que no se pagó.
 */
export function estadoDeStripe(tipo: string, objeto: any): EstadoDeStripe | null {
  if (tipo === 'checkout.session.completed') {
    return objeto?.payment_status === 'paid' ? 'activa' : null;
  }
  const status = objeto?.status;
  const estado: EstadoDeStripe | null =
    status === 'active' ? 'activa'
    : status === 'trialing' ? 'prueba'
    : status === 'past_due' || status === 'unpaid' ? 'morosa'
    : status === 'canceled' ? 'cancelada'
    : null;
  if ((estado === 'activa' || estado === 'prueba') && objeto?.cancel_at_period_end === true) {
    return 'cancelada';
  }
  return estado;
}

export interface PedidoDeCobro {
  empresaId: string;
  email: string;
  plan: PlanPago;
  periodo: PeriodoCobro;
  moneda: string;
  /** En la unidad de la moneda (guaraníes enteros, dólares con decimales). */
  importe: number;
  /** El price_id de la pasarela, si el precio de la tabla lo tiene cargado. */
  referenciaExterna: string | null;
}

/** Comparación que no filtra información por el tiempo que tarda. */
export function firmaCoincide(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ------------------------------------------------------------------ Stripe

/** Monedas sin centavos: Stripe las espera en unidades, no en céntimos. */
const SIN_CENTAVOS = new Set(['PYG', 'CLP', 'JPY', 'KRW', 'VND']);

export function aMenorUnidad(importe: number, moneda: string): number {
  return SIN_CENTAVOS.has(moneda.toUpperCase())
    ? Math.round(importe)
    : Math.round(importe * 100);
}

export function desdeMenorUnidad(monto: number, moneda: string): number {
  return SIN_CENTAVOS.has(moneda.toUpperCase()) ? monto : monto / 100;
}

/**
 * Crea una sesión de pago en Stripe usando su API REST.
 *
 * Se usa `fetch` y no el SDK oficial a propósito: son dos llamadas en toda la
 * aplicación, y el SDK agrega varios megas de dependencia que después hay que
 * mantener actualizada por seguridad.
 */
export async function checkoutStripe(pedido: PedidoDeCobro): Promise<string> {
  const clave = process.env.STRIPE_SECRET_KEY;
  if (!clave) throw new Error('Falta STRIPE_SECRET_KEY.');

  const cuerpo = new URLSearchParams();
  cuerpo.set('mode', 'subscription');
  cuerpo.set('success_url', `${sitio()}/plan?pago=listo`);
  cuerpo.set('cancel_url', `${sitio()}/plan?pago=cancelado`);
  cuerpo.set('customer_email', pedido.email);
  cuerpo.set('client_reference_id', pedido.empresaId);

  // El webhook necesita saber a qué empresa aplicarle el plan. Va en los
  // metadatos de la suscripción y no solo de la sesión, porque las
  // renovaciones de los meses siguientes ya no traen la sesión.
  cuerpo.set('metadata[empresa_id]', pedido.empresaId);
  cuerpo.set('metadata[plan]', pedido.plan);
  cuerpo.set('subscription_data[metadata][empresa_id]', pedido.empresaId);
  cuerpo.set('subscription_data[metadata][plan]', pedido.plan);

  if (pedido.referenciaExterna) {
    // Precio ya creado en Stripe: es lo que conviene, porque la facturación
    // recurrente y los impuestos los maneja el panel de Stripe.
    cuerpo.set('line_items[0][price]', pedido.referenciaExterna);
    cuerpo.set('line_items[0][quantity]', '1');
  } else {
    // Sin price_id armamos el precio al vuelo, para poder probar sin tener
    // que dar de alta el catálogo antes.
    cuerpo.set('line_items[0][quantity]', '1');
    cuerpo.set('line_items[0][price_data][currency]', pedido.moneda.toLowerCase());
    cuerpo.set('line_items[0][price_data][unit_amount]',
      String(aMenorUnidad(pedido.importe, pedido.moneda)));
    cuerpo.set('line_items[0][price_data][recurring][interval]',
      pedido.periodo === 'anual' ? 'year' : 'month');
    cuerpo.set('line_items[0][price_data][product_data][name]',
      NOMBRE_DE_PRODUCTO[pedido.plan]);
  }

  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: cuerpo,
  });

  const datos = await r.json();
  if (!r.ok) {
    throw new Error(datos?.error?.message ?? 'Stripe rechazó el pedido.');
  }
  return datos.url as string;
}

/**
 * Verifica la firma de un webhook de Stripe.
 *
 * Stripe manda `t=<marca>,v1=<hmac>`. El HMAC es sobre `<marca>.<cuerpo>` con
 * el secreto del endpoint. Se comprueba también que la marca no sea vieja:
 * sin eso, alguien que haya capturado un webhook legítimo podría reenviarlo
 * más tarde y volver a activar un plan que ya se canceló.
 */
export function verificarFirmaStripe(
  cuerpoCrudo: string, cabecera: string | null, secreto: string, toleranciaSegundos = 300,
): boolean {
  if (!cabecera) return false;

  const partes = Object.fromEntries(
    cabecera.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );

  const marca = Number(partes.t);
  const firmaRecibida = partes.v1;
  if (!Number.isFinite(marca) || !firmaRecibida) return false;

  const ahora = Math.floor(Date.now() / 1000);
  if (Math.abs(ahora - marca) > toleranciaSegundos) return false;

  const esperada = crypto
    .createHmac('sha256', secreto)
    .update(`${marca}.${cuerpoCrudo}`, 'utf8')
    .digest('hex');

  return firmaCoincide(esperada, firmaRecibida);
}

// ----------------------------------------------------------------- Pagopar

/**
 * PAGOPAR (Paraguay) — pendiente de credenciales.
 *
 * Está declarado y no implementado a propósito, y no se finge que funciona:
 * si se activa `PASARELA=pagopar` sin terminar esto, el checkout devuelve 501
 * y la pantalla de planes lo dice. Un checkout que redirige a una URL
 * inventada sería mucho peor que uno que avisa que todavía no está.
 *
 * Lo que falta cuando estén las claves (PAGOPAR_PUBLICO / PAGOPAR_PRIVADO):
 *   · armar el pedido con el token sha1(privado + pedido + monto);
 *   · POST a su API de pedidos y devolver la URL de pago;
 *   · en el webhook, revalidar ese mismo token antes de tocar nada.
 *
 * Pagopar cobra en guaraníes y acepta transferencia y billeteras locales,
 * que es como paga de verdad el comerciante paraguayo.
 */
export async function checkoutPagopar(_pedido: PedidoDeCobro): Promise<string> {
  throw new Error('SIN_IMPLEMENTAR');
}
