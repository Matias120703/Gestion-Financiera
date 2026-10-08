import crypto from 'node:crypto';
import http2 from 'node:http2';
import { firmaCoincide } from './pagos';

/**
 * ============================================================
 * EL CLIENTE DE BANCARD vPOS 2.0
 * ============================================================
 *
 * Todo lo que Orden le pide a Bancard pasa por acá, y nada más: siete
 * operaciones, la firma md5 de cada una y la lectura de lo que contesta.
 * Está escrito contra el manual oficial «eCommerce Bancard compra simple
 * versión 1.23» (21/05/2026); entre paréntesis va la parte del manual de
 * donde sale cada cosa.
 *
 * No sabe nada de Orden: no importa Next, ni Supabase, ni los textos. Recibe
 * las claves y un transporte (el `fetch` de verdad, o uno de mentira en las
 * pruebas) y devuelve resultados. Quién paga, cuánto y qué se activa lo
 * deciden la base (`precio_de_la_cuenta`, `bancard_confirmar`) y
 * `bancard-flujo.ts`.
 *
 * LO QUE NO SE NEGOCIA
 *
 *   1. LA CLAVE PRIVADA NO SALE DE ACÁ. Viaja solo adentro del md5 («la clave
 *      privada nunca viaja en forma plana», Autenticación). No va en ningún
 *      error ni en ningún resultado.
 *
 *   2. ESTE ARCHIVO NO REGISTRA NADA. Ni cuerpos, ni claves, ni tokens, ni
 *      alias. No hay una sola llamada a la consola (lo vigila
 *      `pruebas/bancard-cliente.test.js`). Los errores que lanza son de
 *      programación y no llevan el pedido adentro.
 *
 *   3. NUNCA `test_client`. Con ese campo Bancard no marca el ítem en la
 *      lista de tests («No se marcará en la lista de test si es que en el
 *      json del pedido envían test_client»).
 *
 *   4. SE COBRA EN GUARANÍES, ENTEROS. El importe va como texto con dos
 *      decimales y punto ("370000.00"), igual en el pedido y en el md5
 *      (Token: «los números deben ser transformados en cadenas, usar dos
 *      dígitos decimales y un punto»).
 *
 *   5. UN CORTE NO ES UN RECHAZO. Si Bancard no contesta (tiempo de espera,
 *      red, una respuesta que no es JSON) el resultado lo dice con su
 *      `clase`, para que quien llama NO vuelva a cobrar: primero se consulta.
 *
 * OJO, NAVEGADOR: este archivo usa `node:crypto`. Un componente con
 * 'use client' no lo puede importar; la dirección del script del formulario
 * (`urlDelScript`) se la pasa la página, que corre en el servidor.
 */

export type EntornoBancard = 'staging' | 'produccion';

/** Manual, «Environment»: producción y staging (este, en el puerto 8888). */
export const HOST_BANCARD: Record<EntornoBancard, string> = {
  produccion: 'https://vpos.infonet.com.py',
  staging: 'https://vpos.infonet.com.py:8888',
};

/** La versión de la API. «vPOS 2.0» y «manual 1.23» son otra numeración. */
export const RUTA_API = '/vpos/api/0.3';

/**
 * La librería del formulario (pago ocasional, catastro y 3D Secure). Cada
 * host sirve la suya, con su dirección adentro: hay que cargar la del entorno.
 */
export const SCRIPT_BANCARD = '/checkout/javascript/dist/bancard-checkout-4.0.0.js';

export function urlDelScript(entorno: EntornoBancard): string {
  return HOST_BANCARD[entorno] + SCRIPT_BANCARD;
}

/** Orden cobra siempre en guaraníes (el manual solo admite PYG). */
export const MONEDA_BANCARD = 'PYG';

/** Cuánto se espera a Bancard: todo, y el cobro con tarjeta guardada. */
export const ESPERA_MS = 15_000;
/**
 * El cobro tarda más: los códigos 46 y 47 del anexo hablan de 49 segundos
 * del emisor. Tiene que entrar en los 60 de la ruta.
 */
export const ESPERA_DE_COBRO_MS = 55_000;

/** Límites del manual que se comprueban antes de llamar. */
const LARGO_DESCRIPCION = 20;
const LARGO_URL = 255;
const LARGO_TEXTO = 255;
/** `shop_process_id` es Entero (15); `amount` es Decimal (15,2). */
const TOPE_DE_OPERACION = 999_999_999_999_999;
const TOPE_DE_IMPORTE = 9_999_999_999_999;

export interface ConfigBancard {
  entorno: EntornoBancard;
  clavePublica: string;
  clavePrivada: string;
  /**
   * Mandar `extra_response_attributes: ["confirmation.process_id"]` en el
   * cobro con tarjeta guardada. El manual dice «siempre enviar este dato»; se
   * puede apagar si Bancard rechaza el pedido por no estar enrolado en 3DS.
   */
  con3ds: boolean;
}

export interface PedidoHttp {
  method: 'POST' | 'DELETE';
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

/**
 * Cómo se llega a Bancard. Inyectable: las pruebas usan un Bancard de
 * mentira, y si un día hace falta otro camino (HTTP/2) se cambia acá.
 */
export type Transporte = (url: string, init: PedidoHttp) => Promise<{ status: number; texto: string }>;

/**
 * `clase` dice de qué lado estuvo el problema:
 *   · 'bancard'  Bancard contestó que no (`clave` = messages[].key).
 *   · 'timeout'  no contestó a tiempo.
 *   · 'red'      no se pudo llegar.
 *   · 'no_json'  contestó algo que no se entiende (el 403 en HTML de un
 *                bloqueo, o un JSON con otra forma).
 * Las tres últimas dejan un cobro en estado INCIERTO: no se reintenta.
 */
export type ClaseDeError = 'bancard' | 'red' | 'timeout' | 'no_json';

export type Resultado<T> =
  | ({ ok: true } & T)
  /**
   * `forma` viene solo con la clave 'forma_desconocida': los NOMBRES de los
   * campos que mandó Bancard (nunca un valor), para poder anotar qué llegó.
   */
  | { ok: false; clave: string; http: number; clase: ClaseDeError; forma?: string };

export type RespuestaCobro =
  /** Aprobada o rechazada: lo decide `bancard_confirmar` con este objeto. */
  | { tipo: 'resuelto'; respuesta: Record<string, unknown> }
  /** El banco pide 3D Secure: hay que abrir el formulario con este número. */
  | { tipo: '3ds'; processId: string };

/** Una tarjeta guardada, como la devuelve Bancard. */
export interface TarjetaBancard {
  /**
   * Vale para UNA operación y vive minutos. No se guarda ni se registra:
   * se pide justo antes de cobrar o de borrar.
   */
  alias: string;
  /** El número que Orden le puso a la tarjeta al pedir el catastro. */
  cardId: number;
  /** "5418********0014". Para sacar los últimos cuatro; no se guarda. */
  enmascarado: string;
  marca: string;
  /** "MM/AA". Se mira en vivo; no se guarda. */
  vencimiento: string;
  tipo: 'credit' | 'debit' | null;
}

export interface Opciones {
  /** Para acortar la espera (la confirmación usa 8 s; la tarea diaria, 40). */
  esperaMs?: number;
}

// ------------------------------------------------------------------ importes

/**
 * Guaraníes enteros → el texto que va en el pedido y en el md5.
 * 370000 → "370000.00". Lanza si no es un entero mayor que cero.
 */
export function importeTexto(guaranies: number): string {
  if (typeof guaranies !== 'number' || !Number.isSafeInteger(guaranies)
      || guaranies <= 0 || guaranies > TOPE_DE_IMPORTE) {
    throw new Error('Bancard: el importe tiene que ser un entero de guaraníes mayor que cero.');
  }
  return `${guaranies}.00`;
}

/**
 * Lo que Bancard manda como importe, a número. Llega como "10100.00", como
 * 10100 o como "1100.0" según el ejemplo del manual: se compara como número.
 * Cualquier otra cosa → null.
 */
export function importeDe(valor: unknown): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) && valor >= 0 ? valor : null;
  }
  if (typeof valor === 'string' && /^[0-9]{1,15}(\.[0-9]{1,4})?$/.test(valor.trim())) {
    return Number(valor.trim());
  }
  return null;
}

/** "5418********0014" → "0014". Si no termina en cuatro números, null. */
export function ultimos4(enmascarado: string): string | null {
  const m = /([0-9]{4})\s*$/.exec(typeof enmascarado === 'string' ? enmascarado : '');
  return m ? m[1] : null;
}

/**
 * Aprobada = `response` "S" y `response_code` "00". En el cable el código
 * son dos caracteres; el anexo los lista sin el cero.
 */
export function esAprobada(r: Record<string, unknown>): boolean {
  const codigo = r.response_code;
  if (typeof codigo !== 'string' && typeof codigo !== 'number') return false;
  return r.response === 'S' && String(codigo).trim().padStart(2, '0') === '00';
}

// -------------------------------------------------------------------- tokens

function md5(texto: string): string {
  return crypto.createHash('md5').update(texto, 'utf8').digest('hex');
}

/**
 * El md5 de cada operación (manual, «Token»: «El orden debe ser exactamente
 * como se indica»). `k` es la clave privada. Los enteros van como su texto
 * decimal; el importe, como lo arma `importeTexto`.
 */
export const tokens = {
  /** md5(private_key + shop_process_id + amount + currency) */
  singleBuy(k: string, id: number, importe: string): string {
    return md5(k + String(id) + importe + MONEDA_BANCARD);
  },
  /** md5(private_key + shop_process_id + "confirm" + amount + currency) */
  confirm(k: string, id: string | number, importe: string): string {
    return md5(k + String(id) + 'confirm' + importe + MONEDA_BANCARD);
  },
  /** md5(private_key + shop_process_id + "get_confirmation") */
  consulta(k: string, id: number): string {
    return md5(k + String(id) + 'get_confirmation');
  },
  /** md5(private_key + shop_process_id + "rollback" + "0.00") */
  rollback(k: string, id: number): string {
    return md5(k + String(id) + 'rollback' + '0.00');
  },
  /** md5(private_key + card_id + user_id + "request_new_card") */
  cardsNew(k: string, cardId: number, userId: number): string {
    return md5(k + String(cardId) + String(userId) + 'request_new_card');
  },
  /** md5(private_key + user_id + "request_user_cards") */
  usersCards(k: string, userId: number): string {
    return md5(k + String(userId) + 'request_user_cards');
  },
  /** md5(private_key + shop_process_id + "charge" + amount + currency + alias_token) */
  charge(k: string, id: number, importe: string, alias: string): string {
    return md5(k + String(id) + 'charge' + importe + MONEDA_BANCARD + alias);
  },
  /** md5(private_key + "delete_card" + user_id + card_token) */
  borrar(k: string, userId: number, alias: string): string {
    return md5(k + 'delete_card' + String(userId) + alias);
  },
};

// ------------------------------------------------------- validar antes de ir

/** Errores de programación: se lanzan ANTES de hablar con Bancard. */
function exigir(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`Bancard: ${mensaje}`);
}

function exigirEntero(valor: number, tope: number, nombre: string): void {
  exigir(typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0 && valor <= tope,
    `${nombre} tiene que ser un número entero mayor que cero.`);
}

function exigirDescripcion(valor: string): void {
  exigir(typeof valor === 'string' && valor.length >= 1 && valor.length <= LARGO_DESCRIPCION,
    `la descripción lleva entre 1 y ${LARGO_DESCRIPCION} caracteres.`);
}

function exigirUrl(valor: string, nombre: string): void {
  exigir(typeof valor === 'string' && /^https?:\/\/\S+$/.test(valor) && valor.length <= LARGO_URL,
    `${nombre} tiene que ser una dirección web de hasta ${LARGO_URL} caracteres.`);
}

function exigirTexto(valor: string, nombre: string): void {
  exigir(typeof valor === 'string' && valor.trim().length >= 1 && valor.length <= LARGO_TEXTO,
    `falta ${nombre}, o pasa de ${LARGO_TEXTO} caracteres.`);
}

// ------------------------------------------------------------ el transporte

const transporteFetch: Transporte = async (url, init) => {
  const r = await fetch(url, init);
  return { status: r.status, texto: await r.text() };
};

/**
 * EL MISMO PEDIDO POR HTTP/2 (`node:http2`). Revisión 03/10: la protección
 * que Bancard tiene delante de vPOS (Cloudflare) bloqueó, en otras
 * integraciones, los pedidos HTTP/1.1 que salen con la huella TLS de
 * OpenSSL 3.0 (la de Node 20/22 en Vercel) contestando un 403 en HTML; esas
 * integraciones pasaron todo a HTTP/2. No se pudo confirmar sin claves: por
 * eso se elige con `BANCARD_HTTP=2` (bancard-servidor.ts) y «Probar
 * conexión» de /admin dice si hace falta.
 *
 * Una sesión por pedido (en Vercel no hay conexión que reusar), respetando
 * la señal de corte. `origenDe` existe para las pruebas: un servidor h2 de
 * mentira en localhost recibe lo que iría a Bancard.
 */
export function crearTransporteHttp2(opciones: { origenDe?: (url: string) => string } = {}): Transporte {
  return (url, init) => new Promise((resolver, rechazar) => {
    const u = new URL(url);
    const sesion = http2.connect(opciones.origenDe ? opciones.origenDe(url) : u.origin);
    let terminado = false;
    const terminar = (fin: () => void) => {
      if (terminado) return;
      terminado = true;
      init.signal.removeEventListener('abort', abortar);
      fin();
      sesion.close();
    };
    const abortar = () => terminar(() => {
      // Solo el nombre importa (`esAbortado`); el texto no es técnico a
      // propósito: pruebas/errores.test.js vigila que ningún mensaje de
      // `new Error` caiga en una regla genérica.
      const e = new Error('Bancard: se cortó la espera del pedido.');
      e.name = 'AbortError';
      rechazar(e);
      sesion.destroy();
    });
    if (init.signal.aborted) {
      abortar();
      return;
    }
    init.signal.addEventListener('abort', abortar, { once: true });
    sesion.on('error', (e) => terminar(() => rechazar(e)));

    const cuerpo = Buffer.from(init.body, 'utf8');
    const cabeceras: Record<string, string> = {};
    for (const [nombre, valor] of Object.entries(init.headers)) cabeceras[nombre.toLowerCase()] = valor;
    const pedido = sesion.request({
      ':method': init.method,
      ':path': u.pathname + u.search,
      ...cabeceras,
      'content-length': String(cuerpo.length),
    });
    let status = 0;
    const partes: Buffer[] = [];
    pedido.on('response', (h) => { status = Number(h[':status'] ?? 0); });
    pedido.on('data', (trozo: Buffer) => { partes.push(trozo); });
    pedido.on('end', () => terminar(() => resolver({ status, texto: Buffer.concat(partes).toString('utf8') })));
    pedido.on('error', (e) => terminar(() => rechazar(e)));
    pedido.end(cuerpo);
  });
}

/** `'2'` → HTTP/2; cualquier otra cosa (o nada) → el `fetch` de Node (HTTP/1.1). */
export function transporteDe(modo: string | undefined): Transporte {
  return (modo ?? '').trim() === '2' ? crearTransporteHttp2() : transporteFetch;
}

const CORTE = Symbol('corte');

type Leido =
  | { ok: true; http: number; cuerpo: Record<string, unknown> }
  | { ok: false; clave: string; http: number; clase: ClaseDeError };

/**
 * QUÉ FORMA TENÍA una respuesta que no se entendió: solo los NOMBRES de sus
 * campos, y los de los objetos que traiga adentro (un nivel). Ni un valor:
 * ahí pueden venir un token, un alias o un número de tarjeta. Los nombres se
 * limpian y se recortan, porque vienen de afuera. Ejemplo:
 * «status,confirmation{token,shop_process_id,response}».
 */
function formaDe(cuerpo: unknown): string {
  if (!esObjeto(cuerpo)) return '';
  const nombre = (k: string) => k.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
  const partes = Object.keys(cuerpo).slice(0, 12).map((k) => {
    const v = cuerpo[k];
    if (esObjeto(v)) return `${nombre(k)}{${Object.keys(v).slice(0, 25).map(nombre).join(',')}}`;
    return Array.isArray(v) ? `${nombre(k)}[]` : nombre(k);
  });
  return partes.join(',').slice(0, 280);
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** La primera clave de `messages` (RollbackSuccessful, InvalidTokenError…). */
function claveDe(cuerpo: Record<string, unknown>): string | null {
  const mensajes = cuerpo.messages;
  if (!Array.isArray(mensajes)) return null;
  for (const m of mensajes) {
    if (esObjeto(m) && typeof m.key === 'string' && m.key.trim()) return m.key.trim().slice(0, 80);
  }
  return null;
}

function esAbortado(e: unknown): boolean {
  if (e === CORTE) return true;
  const nombre = esObjeto(e) ? e.name : null;
  return nombre === 'AbortError' || nombre === 'TimeoutError';
}

// ----------------------------------------------------------------- el cliente

export function crearBancard(config: ConfigBancard, transporte: Transporte = transporteFetch) {
  exigir(config.entorno === 'staging' || config.entorno === 'produccion', 'el entorno no es válido.');
  exigir(typeof config.clavePublica === 'string' && config.clavePublica.length > 0, 'falta la clave pública.');
  exigir(typeof config.clavePrivada === 'string' && config.clavePrivada.length > 0, 'falta la clave privada.');

  const base = HOST_BANCARD[config.entorno] + RUTA_API;
  const k = config.clavePrivada;

  /**
   * Un pedido a Bancard. El sobre es siempre el mismo (manual, «Peticiones
   * realizadas por el comercio a VPOS»): `{ public_key, operation: { token,
   * … } }`. Se lee el cuerpo aunque el HTTP no sea 200. Nunca lanza.
   */
  async function pedir(
    metodo: 'POST' | 'DELETE',
    ruta: string,
    operacion: Record<string, unknown>,
    esperaMs: number,
  ): Promise<Leido> {
    const control = new AbortController();
    let reloj: ReturnType<typeof setTimeout> | undefined;
    // El corte no depende de que el transporte respete la señal.
    const corte = new Promise<never>((_, rechazar) => {
      reloj = setTimeout(() => {
        control.abort();
        rechazar(CORTE);
      }, Math.max(1, esperaMs));
    });

    let respuesta: { status: number; texto: string };
    try {
      respuesta = await Promise.race([
        transporte(base + ruta, {
          method: metodo,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ public_key: config.clavePublica, operation: operacion }),
          signal: control.signal,
        }),
        corte,
      ]);
    } catch (e) {
      // A propósito no se guarda nada de `e`: su mensaje podría traer la URL
      // o el pedido.
      return esAbortado(e)
        ? { ok: false, clave: 'timeout', http: 0, clase: 'timeout' }
        : { ok: false, clave: 'red', http: 0, clase: 'red' };
    } finally {
      if (reloj !== undefined) clearTimeout(reloj);
    }

    const http = Number.isInteger(respuesta?.status) ? respuesta.status : 0;
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(typeof respuesta?.texto === 'string' ? respuesta.texto : '');
    } catch {
      return { ok: false, clave: 'no_json', http, clase: 'no_json' };
    }
    if (!esObjeto(cuerpo)) return { ok: false, clave: 'no_json', http, clase: 'no_json' };

    if (cuerpo.status === 'error') {
      return { ok: false, clave: claveDe(cuerpo) ?? 'ErrorDesconocido', http, clase: 'bancard' };
    }
    if (http < 200 || http >= 300) {
      return { ok: false, clave: claveDe(cuerpo) ?? `http_${http}`, http, clase: 'bancard' };
    }
    return { ok: true, http, cuerpo };
  }

  const desconocida = (http: number, cuerpo?: unknown) => {
    const forma = formaDe(cuerpo);
    return forma
      ? { ok: false as const, clave: 'forma_desconocida', http, clase: 'no_json' as const, forma }
      : { ok: false as const, clave: 'forma_desconocida', http, clase: 'no_json' as const };
  };

  return {
    entorno: config.entorno,

    /**
     * PAGO OCASIONAL (manual, «Single Buy»). Devuelve el `process_id` con el
     * que el navegador abre el formulario: tarjeta, QR y los demás medios se
     * eligen ahí adentro. Marca «Recibir creación de pago».
     */
    async singleBuy(
      p: { operacion: number; importe: number; descripcion: string; returnUrl: string; cancelUrl: string },
      opciones: Opciones = {},
    ): Promise<Resultado<{ processId: string }>> {
      exigirEntero(p.operacion, TOPE_DE_OPERACION, 'el número de operación');
      exigirDescripcion(p.descripcion);
      exigirUrl(p.returnUrl, 'la dirección de vuelta');
      exigirUrl(p.cancelUrl, 'la dirección de cancelación');
      const importe = importeTexto(p.importe);

      const r = await pedir('POST', '/single_buy', {
        token: tokens.singleBuy(k, p.operacion, importe),
        // Número acá y en el cobro; cadena en la consulta y la reversa: así
        // están los ejemplos del manual.
        shop_process_id: p.operacion,
        amount: importe,
        currency: MONEDA_BANCARD,
        description: p.descripcion,
        return_url: p.returnUrl,
        cancel_url: p.cancelUrl,
      }, opciones.esperaMs ?? ESPERA_MS);
      if (r.ok === false) return r;

      const processId = r.cuerpo.process_id;
      if (typeof processId !== 'string' || !processId) return desconocida(r.http);
      return { ok: true, processId };
    },

    /**
     * CONSULTA (manual, «Get Buy Single Confirmation»). Sirve para pago
     * ocasional y con tarjeta guardada. `PaymentNotFoundError` = todavía no
     * pagó: llega como `ok: false` con esa clave. Marca «Recibimos pedido de
     * confirmación del comercio».
     */
    async consultar(
      operacion: number,
      opciones: Opciones = {},
    ): Promise<Resultado<{ confirmacion: Record<string, unknown> }>> {
      exigirEntero(operacion, TOPE_DE_OPERACION, 'el número de operación');

      const r = await pedir('POST', '/single_buy/confirmations', {
        token: tokens.consulta(k, operacion),
        shop_process_id: String(operacion),
      }, opciones.esperaMs ?? ESPERA_MS);
      if (r.ok === false) return r;

      const confirmacion = r.cuerpo.confirmation;
      if (!esObjeto(confirmacion)) return desconocida(r.http);
      return { ok: true, confirmacion };
    },

    /**
     * REVERSA (manual, «Single Buy Rollback»). Solo sirve el mismo día.
     * `PaymentNotFoundError` (no pagó) y `AlreadyRollbackedError` llegan como
     * `ok: false`: quien llama decide cuáles toma por buenas. Marca «Recibir
     * rollback» cuando es sobre un pago aprobado.
     */
    async revertir(operacion: number, opciones: Opciones = {}): Promise<Resultado<{ clave: string }>> {
      exigirEntero(operacion, TOPE_DE_OPERACION, 'el número de operación');

      const r = await pedir('POST', '/single_buy/rollback', {
        token: tokens.rollback(k, operacion),
        shop_process_id: String(operacion),
      }, opciones.esperaMs ?? ESPERA_MS);
      if (r.ok === false) return r;

      if (r.cuerpo.status !== 'success') return desconocida(r.http);
      return { ok: true, clave: claveDe(r.cuerpo) ?? 'RollbackSuccessful' };
    },

    /**
     * PEDIR EL FORMULARIO PARA GUARDAR UNA TARJETA (manual, «Catastro de
     * Tarjeta (Cards_new)»). `cardId` y `userId` los inventa Orden. El
     * teléfono y el correo son obligatorios y van como texto (el ejemplo del
     * manual trae el teléfono sin comillas, que no es JSON válido). Marca
     * «Solicitud de catastro».
     */
    async cardsNew(
      p: { cardId: number; userId: number; telefono: string; email: string; returnUrl: string },
      opciones: Opciones = {},
    ): Promise<Resultado<{ processId: string }>> {
      exigirEntero(p.cardId, Number.MAX_SAFE_INTEGER, 'el número de tarjeta');
      exigirEntero(p.userId, Number.MAX_SAFE_INTEGER, 'el número de usuario');
      exigirTexto(p.telefono, 'el teléfono');
      exigirTexto(p.email, 'el correo');
      exigirUrl(p.returnUrl, 'la dirección de vuelta');

      const r = await pedir('POST', '/cards/new', {
        token: tokens.cardsNew(k, p.cardId, p.userId),
        card_id: p.cardId,
        user_id: p.userId,
        user_cell_phone: String(p.telefono),
        user_mail: String(p.email),
        return_url: p.returnUrl,
      }, opciones.esperaMs ?? ESPERA_MS);
      if (r.ok === false) return r;

      const processId = r.cuerpo.process_id;
      if (typeof processId !== 'string' || !processId) return desconocida(r.http);
      return { ok: true, processId };
    },

    /**
     * LAS TARJETAS DE UN USUARIO (manual, «Recuperar Tarjetas catastradas de
     * un usuario (users_cards)»; es un POST). Cada una trae su alias, que
     * vale para una sola operación y vive minutos. Marca «Recibir tarjetas
     * del usuario».
     */
    async tarjetas(userId: number, opciones: Opciones = {}): Promise<Resultado<{ tarjetas: TarjetaBancard[] }>> {
      exigirEntero(userId, Number.MAX_SAFE_INTEGER, 'el número de usuario');

      const r = await pedir('POST', `/users/${userId}/cards`, {
        token: tokens.usersCards(k, userId),
      }, opciones.esperaMs ?? ESPERA_MS);
      if (r.ok === false) return r;

      const cards = r.cuerpo.cards;
      if (!Array.isArray(cards)) return desconocida(r.http);

      const tarjetas: TarjetaBancard[] = [];
      for (const c of cards) {
        if (!esObjeto(c)) continue;
        const cardId = Number(c.card_id);
        if (typeof c.alias_token !== 'string' || !c.alias_token || !Number.isSafeInteger(cardId)) continue;
        tarjetas.push({
          alias: c.alias_token,
          cardId,
          enmascarado: typeof c.card_masked_number === 'string' ? c.card_masked_number : '',
          marca: typeof c.card_brand === 'string' ? c.card_brand : '',
          vencimiento: typeof c.expiration_date === 'string' ? c.expiration_date : '',
          tipo: c.card_type === 'credit' || c.card_type === 'debit' ? c.card_type : null,
        });
      }
      return { ok: true, tarjetas };
    },

    /**
     * COBRAR CON LA TARJETA GUARDADA (manual, «Pago con token (charge)»). La
     * respuesta viene en el mismo pedido, y además Bancard manda la
     * confirmación a la URL. Si el banco pide 3D Secure, todo viene vacío
     * menos `process_id` («Flujo 3D SECURE Pago con token»). Siempre una
     * cuota. Marca «Pago con alias token».
     */
    async cobrar(
      p: { operacion: number; importe: number; descripcion: string; alias: string; returnUrl: string },
      opciones: Opciones = {},
    ): Promise<Resultado<RespuestaCobro>> {
      exigirEntero(p.operacion, TOPE_DE_OPERACION, 'el número de operación');
      exigirDescripcion(p.descripcion);
      exigirTexto(p.alias, 'el alias de la tarjeta');
      exigirUrl(p.returnUrl, 'la dirección de vuelta');
      const importe = importeTexto(p.importe);

      const operacion: Record<string, unknown> = {
        token: tokens.charge(k, p.operacion, importe, p.alias),
        shop_process_id: p.operacion,
        amount: importe,
        number_of_payments: 1,
        currency: MONEDA_BANCARD,
        additional_data: '',
        description: p.descripcion,
        return_url: p.returnUrl,
        alias_token: p.alias,
      };
      if (config.con3ds) operacion.extra_response_attributes = ['confirmation.process_id'];

      const r = await pedir('POST', '/charge', operacion, opciones.esperaMs ?? ESPERA_DE_COBRO_MS);
      if (r.ok === false) return r;

      // EL RESULTADO VIENE EN `operation` O EN `confirmation` (07/10/2026). El
      // ejemplo del manual lo trae en `operation`; el primer cobro de verdad
      // en el ambiente de prueba llegó con otra forma y quedó como
      // «forma_desconocida» (se resolvió solo, consultándole a Bancard, pero
      // cuatro segundos después y sin saber qué había llegado). El propio
      // pedido nombra `confirmation.process_id`, y la consulta de un pago
      // contesta en `confirmation`: se aceptan los dos nombres. Lo que decide
      // si se pagó sigue siendo la base, con este objeto.
      const respuesta = esObjeto(r.cuerpo.operation) ? r.cuerpo.operation : r.cuerpo.confirmation;
      if (!esObjeto(respuesta)) return desconocida(r.http, r.cuerpo);

      const contesto = typeof respuesta.response === 'string' && respuesta.response.trim() !== '';
      if (contesto) return { ok: true, tipo: 'resuelto', respuesta };

      const processId = respuesta.process_id;
      if (typeof processId === 'string' && processId) return { ok: true, tipo: '3ds', processId };

      // Ni resultado ni 3D Secure: no se sabe qué pasó. No se reintenta. Con
      // los nombres de los campos que llegaron, para poder leerlo después.
      return desconocida(r.http, r.cuerpo);
    },

    /**
     * BORRAR UNA TARJETA (manual, «Eliminar tarjeta»): es un DELETE con el
     * JSON en el cuerpo. El alias también tiene que ser recién pedido. Marca
     * «Eliminar tarjeta del usuario».
     */
    async borrarTarjeta(userId: number, alias: string, opciones: Opciones = {}): Promise<Resultado<Record<never, never>>> {
      exigirEntero(userId, Number.MAX_SAFE_INTEGER, 'el número de usuario');
      exigirTexto(alias, 'el alias de la tarjeta');

      const r = await pedir('DELETE', `/users/${userId}/cards`, {
        token: tokens.borrar(k, userId, alias),
        alias_token: alias,
      }, opciones.esperaMs ?? ESPERA_MS);
      if (r.ok === false) return r;

      if (r.cuerpo.status !== 'success') return desconocida(r.http);
      return { ok: true };
    },
  };
}

export type ClienteBancard = ReturnType<typeof crearBancard>;

// ------------------------------------------- la confirmación que manda Bancard

export type ConfirmacionLeida =
  /** Sin cuerpo, `{}` o sin `operation`: no es un pago. Se contesta 200. */
  | { forma: 'vacia' }
  /** Trae `operation` pero no un número de pedido ni un token usables. */
  | { forma: 'invalida' }
  | {
      forma: 'confirmacion';
      /** El `shop_process_id`, siempre como texto. */
      operacion: string;
      /** El md5 coincide con la fórmula `confirm` y el importe. */
      tokenValido: boolean;
      /**
       * El md5 coincide con la fórmula de una REVERSA («El token de confirm
       * para una acción de rollback se genera usando "0.00" para amount»).
       * Si es de reversa, `tokenValido` es false: no es un pago.
       */
      deReversa: boolean;
      /** El objeto `operation` tal como llegó. Lo sanea la base al guardarlo. */
      respuesta: Record<string, unknown>;
    };

/**
 * Lee lo que Bancard mandó a la URL de confirmación (manual, «Buy Single
 * Confirm») y comprueba su md5 en tiempo constante.
 *
 * El token vale si coincide con la fórmula calculada con el importe GUARDADO
 * de la operación o con el `amount` tal como llegó (el manual lo muestra con
 * formatos distintos). Que el importe recibido sea el guardado lo vuelve a
 * exigir la base (`bancard_confirmar`): acá solo se decide si el mensaje
 * viene de quien tiene la clave. `importeGuardado` null = todavía no se sabe
 * cuál es la operación.
 */
export function verificarConfirmacion(
  cuerpo: unknown,
  clavePrivada: string,
  importeGuardado: number | null,
): ConfirmacionLeida {
  if (!esObjeto(cuerpo) || !esObjeto(cuerpo.operation)) return { forma: 'vacia' };

  const respuesta = cuerpo.operation;
  const id = respuesta.shop_process_id;
  const operacion = typeof id === 'number' && Number.isSafeInteger(id) ? String(id)
    : typeof id === 'string' ? id.trim() : '';
  const token = typeof respuesta.token === 'string' ? respuesta.token.trim().toLowerCase() : '';

  if (!/^[1-9][0-9]{0,14}$/.test(operacion) || !/^[0-9a-f]{32}$/.test(token)) {
    return { forma: 'invalida' };
  }

  const coincide = (importe: string) => firmaCoincide(token, tokens.confirm(clavePrivada, operacion, importe));

  const deReversa = coincide('0.00');

  const candidatos: string[] = [];
  if (typeof importeGuardado === 'number' && Number.isSafeInteger(importeGuardado)
      && importeGuardado > 0 && importeGuardado <= TOPE_DE_IMPORTE) {
    candidatos.push(importeTexto(importeGuardado));
  }
  const recibido = respuesta.amount;
  if (typeof recibido === 'string' && recibido.trim()) candidatos.push(recibido.trim());
  if (typeof recibido === 'number' && Number.isFinite(recibido)) {
    candidatos.push(String(recibido), recibido.toFixed(2));
  }

  const tokenValido = !deReversa && candidatos.some(coincide);

  return { forma: 'confirmacion', operacion, tokenValido, deReversa, respuesta };
}

// ------------------------------------------------------------ quién lo ve

/**
 * QUIÉN VE EL PAGO CON BANCARD. Pura, para poder probarla; el único lugar
 * donde vive la regla.
 *
 *   · Tiene que estar configurado (claves y entorno) y la persona tiene que
 *     administrar la cuenta.
 *   · Lo ve la administración de Orden, o una cuenta habilitada a mano desde
 *     /admin (la de prueba que se le da al certificador), o todos si el
 *     interruptor general está prendido.
 *   · EN STAGING EL INTERRUPTOR GENERAL NO CUENTA: con plata de mentira no se
 *     le abre el pago a ningún cliente de verdad.
 */
export function disponibleParaLaCuenta(p: {
  configurado: boolean;
  entorno: EntornoBancard | null;
  abierto: boolean;
  superadmin: boolean;
  habilitada: boolean;
  admin: boolean;
}): boolean {
  if (!p.configurado || !p.admin) return false;
  if (p.entorno !== 'staging' && p.entorno !== 'produccion') return false;
  return p.superadmin || p.habilitada || (p.abierto && p.entorno === 'produccion');
}
