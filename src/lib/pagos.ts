import crypto from 'node:crypto';
import type { PeriodoCobro } from './tipos';

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
 *      el pedido, alguien pagaría un guaraní por el plan Negocio.
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

export interface PedidoDeCobro {
  empresaId: string;
  email: string;
  plan: 'pro' | 'negocio';
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
      `Orden ${pedido.plan === 'pro' ? 'Pro' : 'Negocio'}`);
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
