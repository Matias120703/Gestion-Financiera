import {
  ultimos4, verificarConfirmacion,
  type ClienteBancard, type EntornoBancard, type RespuestaCobro, type Resultado, type TarjetaBancard,
} from './bancard';
import { CATASTRO_CON_EXITO, leerLoQueDijoElFormulario, type DichoPorElFormulario } from './bancard-formulario';

/**
 * ============================================================
 * EL PAGO CON BANCARD, DE PUNTA A PUNTA (la orquestación)
 * ============================================================
 *
 * Entre la base (que decide cuánto se cobra y es el único lugar que activa un
 * plan: `bancard_confirmar`, migración 125) y el cliente de Bancard
 * (`bancard.ts`, que solo sabe hablar con vPOS) está esto: el orden de las
 * llamadas y qué hacer con cada respuesta.
 *
 * Todo entra por `Deps`: la base, Bancard, el entorno, la clave para
 * comprobar la confirmación, el sitio y cómo avisar. Así se prueba entero
 * sin Next ni Supabase (pruebas/bancard-flujo.test.js, con PGlite y un
 * Bancard de mentira), y el servidor arma las de verdad en
 * `bancard-servidor.ts`.
 *
 * LO QUE NO SE NEGOCIA
 *
 *   1. EL IMPORTE NUNCA VIENE DEL NAVEGADOR. Lo calcula y lo congela la base
 *      al crear la operación; la confirmación se compara contra eso.
 *   2. LA PANTALLA DE VUELTA NO ACTIVA NADA. Lo que diga el formulario
 *      («payment_success») no se cree: se le pregunta a Bancard
 *      (`resolverOperacion`) o se espera su confirmación firmada.
 *   3. UN CORTE NO ES UN RECHAZO, Y LO INCIERTO NO SE VUELVE A COBRAR. Una
 *      operación viva se resuelve consultando a Bancard antes de abrir otra.
 *   4. NADA SECRETO SALE DE ACÁ: ni la clave, ni el `process_id` en un
 *      registro, ni un token. Lo que se anota en `bancard_eventos` lo vuelve
 *      a sanear la base.
 *
 * LA TARJETA GUARDADA (catastro, cobro con token, débito de cada mes) va
 * sobre estas mismas piezas, más abajo:
 *
 *   5. EL ALIAS DE LA TARJETA NO SE GUARDA NUNCA: se le pide a Bancard justo
 *      antes de cobrar o de borrar (vale para una sola operación y vive
 *      minutos). De la tarjeta queda solo marca, últimos cuatro y tipo.
 *   6. UNA TARJETA SE DA POR GUARDADA CUANDO BANCARD LA LISTA, no cuando el
 *      formulario dice «éxito».
 *   7. QUITARLA RIGE EN EL ACTO: el débito se apaga en la base ANTES de
 *      hablar con Bancard. Si Bancard no contesta, la conciliación termina
 *      el borrado; a la persona ya no se le cobra más.
 *   8. UN COBRO POR DÍA, UNA OPERACIÓN POR INTENTO, y un cobro incierto
 *      (se cortó) no se repite: lo resuelve la conciliación.
 */

// ------------------------------------------------------------------ tipos

/** Lo que devuelve una función de la base: como `supabase.rpc`. */
export interface RespuestaBd {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** El cliente de servicio, reducido a lo único que se usa: llamar funciones. */
export interface BaseBancard {
  rpc(nombre: string, args: Record<string, unknown>): PromiseLike<RespuestaBd>;
}

/**
 * Lo que devolvió `bancard_confirmar`, más lo que hace falta para el
 * comprobante y que la base no guarda en ese resultado.
 */
export type AvisoDePago = Record<string, unknown> & {
  /** `response_description` de Bancard: lo único de la respuesta que se le muestra a la persona. */
  descripcion_respuesta?: string | null;
  /** Cuándo se confirmó (ISO). */
  fecha?: string;
};

export interface Deps {
  bd: BaseBancard;
  bancard: ClienteBancard;
  entorno: EntornoBancard;
  clavePrivada: string;
  /** `https://orden.com.py`, sin barra final: arma el `return_url`. */
  sitio: string;
  /** Avisos (push, correo, administración). Nunca lanza; si lanza, se traga. */
  avisar: (resultado: AvisoDePago) => Promise<void>;
  /** Para el registro del servidor. Solo recibe tipo, número y clave: nada secreto. */
  registrar?: (texto: string) => void;
}

const ESTADOS_VIVOS = ['creada', 'en_3ds', 'incierta'];

/** Cuánto se espera a Bancard cuando hay alguien esperando del otro lado. */
const ESPERA_CORTA_MS = 8_000;

/** El tope de la confirmación: Bancard corta a los 30 segundos. */
const TOPE_CONFIRMACION_MS = 25_000;

/** Lo mínimo de una operación que lee el servidor (`bancard_operacion_interna`). */
interface OperacionInterna {
  operacion: number;
  empresa_id: string;
  entorno: EntornoBancard;
  estado: string;
  tipo: string;
  medio: string;
  origen: string;
  importe: number;
  minutos: number;
  consultas: number;
  /** Hace cuántos segundos se le preguntó a Bancard por ella (null: nunca). */
  consultaHace: number | null;
}

type Llamada<T> = { ok: true; data: T } | { ok: false; mensaje: string; codigo: string };

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Una función de la base. Nunca lanza: un corte de red es un error más. */
async function llamar<T = unknown>(d: Deps, nombre: string, args: Record<string, unknown>): Promise<Llamada<T>> {
  try {
    const { data, error } = await d.bd.rpc(nombre, args);
    if (error) return { ok: false, mensaje: error.message ?? '', codigo: error.code ?? '' };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : '', codigo: '' };
  }
}

function anotarEnRegistro(d: Deps, texto: string): void {
  try { d.registrar?.(texto); } catch { /* el registro no puede tumbar un pago */ }
}

/**
 * Deja constancia de lo que se habló con Bancard (`bancard_eventos`). A
 * propósito no se manda nada más que tipo, número, ok, clave y HTTP, y la
 * respuesta de Bancard (que la base sanea) o un par de datos sueltos que no
 * son de ninguna tarjeta (cuántas listó, qué dijo el formulario). Si falla,
 * el pago sigue.
 */
async function anotar(d: Deps, e: {
  operacion?: number | null;
  tarjeta?: number | null;
  tipo: string;
  ok: boolean;
  clave?: string | null;
  http?: number | null;
  detalle?: Record<string, unknown>;
}): Promise<void> {
  await llamar(d, 'bancard_anotar_evento', {
    p_operacion: e.operacion ?? null,
    p_tarjeta: e.tarjeta ?? null,
    p_entorno: d.entorno,
    p_tipo: e.tipo,
    p_ok: e.ok,
    p_clave: e.clave ?? null,
    p_http: e.http ?? null,
    p_detalle: e.detalle ?? {},
  });
}

async function avisarSeguro(d: Deps, resultado: AvisoDePago): Promise<void> {
  try {
    await d.avisar(resultado);
  } catch {
    anotarEnRegistro(d, `aviso fallido · pedido ${String(resultado.operacion ?? '')}`);
  }
}

async function operacionInterna(d: Deps, operacion: number): Promise<OperacionInterna | null | undefined> {
  const r = await llamar(d, 'bancard_operacion_interna', { p_operacion: operacion });
  if (r.ok === false) return undefined;
  if (!esObjeto(r.data)) return null;
  return {
    operacion: Number(r.data.operacion),
    empresa_id: String(r.data.empresa_id ?? ''),
    entorno: r.data.entorno as EntornoBancard,
    estado: String(r.data.estado ?? ''),
    tipo: String(r.data.tipo ?? ''),
    medio: String(r.data.medio ?? ''),
    origen: String(r.data.origen ?? ''),
    importe: Number(r.data.importe),
    minutos: Number(r.data.minutos ?? 0),
    consultas: Number(r.data.consultas ?? 0),
    consultaHace: typeof r.data.consulta_hace === 'number' ? r.data.consulta_hace : null,
  };
}

async function cerrar(d: Deps, operacion: number, estado: 'en_3ds' | 'incierta' | 'vencida', detalle: Record<string, unknown> = {}) {
  return llamar(d, 'bancard_cerrar_operacion', { p_operacion: operacion, p_estado: estado, p_detalle: detalle });
}

/**
 * CERRAR DESPUÉS DE UNA REVERSA, MIRANDO QUÉ ENCONTRÓ LA BASE (revisión 07/10).
 *
 * Entre que Orden decide mandar la reversa y Bancard la hace pasan
 * milisegundos, y en ese hueco puede entrar el pago: la persona reintenta en
 * el formulario rechazado, o paga justo el que se iba a vencer. Bancard
 * devuelve la plata (RollbackSuccessful) y en Orden la operación ya está
 * «pagada», con el plan activo y el ingreso anotado. La base no deshace nada
 * sola (es plata: lo mira una persona), pero deja el «para revisar» y avisa
 * UNA vez con `revisar: true`; acá se le pasa a la administración.
 *
 * Devuelve cómo quedó de verdad: 'pagada' si la base no la cerró porque ya
 * estaba pagada (nunca se informa «vencida» de algo que sigue activo).
 */
async function cerrarTrasReversa(
  d: Deps, operacion: number, clave: string,
): Promise<'vencida' | 'pagada' | 'incierta'> {
  const c = await cerrar(d, operacion, 'vencida', { clave });
  if (c.ok === false) return 'incierta';
  if (!esObjeto(c.data) || c.data.cambio !== false || c.data.estado !== 'pagada') return 'vencida';
  if (c.data.revisar === true) {
    anotarEnRegistro(d, `reversa hecha en Bancard sobre un pago que quedó activo · pedido ${operacion}`);
    await avisarSeguro(d, { ...c.data, aviso: 'reversa_sobre_pagada', operacion });
  }
  return 'pagada';
}

/**
 * EL ÚNICO CAMINO HACIA `bancard_confirmar`. Después avisa: plan activo y
 * comprobante si se acaba de aprobar, la administración si hay algo que
 * mirar. Null si la base no contestó (el pago no se pierde: la operación
 * sigue viva y la conciliación la resuelve).
 */
async function confirmar(
  d: Deps,
  operacion: number,
  respuesta: Record<string, unknown>,
  fuente: 'confirmacion' | 'consulta' | 'charge',
): Promise<Record<string, unknown> | null> {
  const r = await llamar(d, 'bancard_confirmar', { p_operacion: operacion, p_respuesta: respuesta, p_fuente: fuente });
  if (r.ok === false || !esObjeto(r.data)) {
    anotarEnRegistro(d, `bancard_confirmar falló · pedido ${operacion}`);
    return null;
  }
  const c = r.data;
  const nuevo = c.ok === true && c.ya === false;
  const paraRevisar = c.ok === false && (c.motivo === 'importe' || c.motivo === 'revertida');
  if (nuevo || paraRevisar || (c.ok === true && typeof c.revisar === 'string' && c.revisar)) {
    const descripcion = typeof respuesta.response_description === 'string'
      ? respuesta.response_description.slice(0, 120) : null;
    await avisarSeguro(d, { ...c, descripcion_respuesta: descripcion, fecha: new Date().toISOString() });
  }
  return c;
}

/** Qué quedó, en una palabra, después de `bancard_confirmar`. */
function estadoDeConfirmar(c: Record<string, unknown>): EstadoResuelto {
  if (c.ok === true) return c.aprobada === true ? 'pagada' : 'rechazada';
  switch (c.motivo) {
    case 'revertida': return 'revertida';
    case 'desconocida': return 'desconocida';
    case 'sin_respuesta': return 'sigue';
    default: return 'incierta';    // 'importe', 'sin_suscripcion': lo mira una persona
  }
}

/** La clave de un resultado de Bancard que no salió bien (o 'ok'). */
function claveDe<T>(r: Resultado<T>): string {
  return r.ok === true ? 'ok' : r.clave;
}

// ---------------------------------------------------------- resolver una

/**
 * Lo que se sabe de una operación después de preguntarle a Bancard:
 *   · 'pagada' / 'rechazada'  Bancard tiene la respuesta y la base la aplicó.
 *   · 'vencida'               no se pagó y quedó cerrada (con su reversa).
 *                             Si al ir a cerrarla ya estaba pagada, 'pagada'.
 *   · 'revertida'             se había revertido.
 *   · 'sigue'                 todavía no se pagó (un QR que se está por pagar).
 *   · 'incierta'              no se pudo saber (Bancard o la base no contestaron,
 *                             o confirmó otro importe): nada cambió.
 *   · 'desconocida'           Orden no tiene ese número.
 */
export type EstadoResuelto = 'pagada' | 'rechazada' | 'vencida' | 'revertida' | 'sigue' | 'incierta' | 'desconocida';

/**
 * PREGUNTARLE A BANCARD POR UNA OPERACIÓN (manual, «Get Buy Single
 * Confirmation»; marca «Recibimos pedido de confirmación del comercio»).
 *
 * Lo usan la pantalla de vuelta, la conciliación, la confirmación con un
 * token que no coincide y el botón «Consultar a Bancard» de /admin.
 *
 * `vencerSiNoPago`: si Bancard dice que no se pagó, se le manda la reversa y
 * se cierra («Si el pago todavía no ha sido realizado, el comercio puede
 * optar por realizar un rollback»; PaymentNotFoundError en la reversa «deberá
 * tomarse como una respuesta correcta»).
 *
 * Solo toca operaciones de SU entorno: una de staging no se le pregunta a
 * producción ni al revés.
 *
 * `noRepetirAntesDeS`: si ya se le preguntó a Bancard hace menos de esos
 * segundos, no se vuelve a preguntar (la pantalla que sondea cada 2 s y la
 * URL pública con un token que no coincide no pueden convertirse en una
 * consulta a Bancard por pedido).
 */
export async function resolverOperacion(
  d: Deps,
  operacion: number,
  opciones: { vencerSiNoPago?: boolean; esperaMs?: number; noRepetirAntesDeS?: number } = {},
): Promise<EstadoResuelto> {
  const info = await operacionInterna(d, operacion);
  if (info === undefined) return 'incierta';
  if (info === null) return 'desconocida';
  if (info.entorno !== d.entorno) return 'sigue';

  const viva = ESTADOS_VIVOS.includes(info.estado);
  const espera = opciones.esperaMs ?? ESPERA_CORTA_MS;

  if (opciones.noRepetirAntesDeS !== undefined && info.consultaHace !== null
      && info.consultaHace < opciones.noRepetirAntesDeS) {
    return viva ? 'sigue' : estadoActual(info.estado);
  }

  const r = await d.bancard.consultar(operacion, { esperaMs: espera });
  if (r.ok === true) {
    await anotar(d, { operacion, tipo: 'consulta', ok: true, http: 200, detalle: { confirmation: r.confirmacion } });
    const c = await confirmar(d, operacion, r.confirmacion, 'consulta');
    return c ? estadoDeConfirmar(c) : 'incierta';
  }
  await anotar(d, { operacion, tipo: 'consulta', ok: false, clave: r.clave, http: r.http });

  if (r.clave === 'PaymentNotFoundError') {
    if (!viva) return estadoActual(info.estado);
    if (!opciones.vencerSiNoPago) return 'sigue';

    const rv = await d.bancard.revertir(operacion, { esperaMs: espera });
    await anotar(d, { operacion, tipo: 'rollback', ok: rv.ok, clave: claveDe(rv), http: rv.ok === true ? 200 : rv.http });
    const cerrada = rv.ok === true || rv.clave === 'PaymentNotFoundError' || rv.clave === 'AlreadyRollbackedError';
    if (!cerrada) {
      anotarEnRegistro(d, `reversa de abandonada sin éxito · pedido ${operacion} · ${claveDe(rv)}`);
      return 'sigue';
    }
    // El motivo real: 'abandonada' si no había pago; si la reversa SÍ
    // encontró plata y la devolvió (RollbackSuccessful: el pago entró entre
    // la consulta y la reversa), queda escrito, y una aprobación que llegue
    // después no activa nada (bancard_confirmar). Y si la confirmación de
    // ese pago llegó ANTES que este cierre, la operación ya está pagada:
    // se informa 'pagada' y la administración recibe el aviso.
    return cerrarTrasReversa(d, operacion,
      rv.ok === true ? 'RollbackSuccessful' : rv.clave === 'PaymentNotFoundError' ? 'abandonada' : rv.clave);
  }

  // Bancard no conoce el pedido (el formulario nunca se abrió) o ya lo
  // revirtió: no hay nada que cobrar.
  if (r.clave === 'BuyNotFoundError' || r.clave === 'AlreadyRollbackedError') {
    if (!viva) return estadoActual(info.estado);
    return cerrarTrasReversa(d, operacion, r.clave);
  }

  anotarEnRegistro(d, `consulta sin respuesta útil · pedido ${operacion} · ${r.clave} · http ${r.http}`);
  return 'incierta';
}

function estadoActual(estado: string): EstadoResuelto {
  if (estado === 'pagada') return 'pagada';
  if (estado === 'rechazada') return 'rechazada';
  if (estado === 'revertida') return 'revertida';
  if (estado === 'vencida') return 'vencida';
  return 'sigue';
}

// -------------------------------------------------------- iniciar el pago

export interface PedidoDePago {
  empresa: string;
  usuario: string;
  /** 'plan' = pagar (o renovar) un plan; 'personas' = sumar gente a un Premium vigente. */
  tipo: 'plan' | 'personas';
  plan: string | null;
  periodo: string | null;
  /** Solo el Premium de un negocio; si no, null. */
  personas: number | null;
}

export type InicioDePago =
  /** Listo para abrir el formulario de Bancard con este `processId`. */
  | { estado: 'listo'; operacion: number; processId: string; importe: number; desglose: unknown; entorno: EntornoBancard; reusada: boolean }
  /** Había una operación sin resolver y resultó pagada: no hay que pagar de nuevo. */
  | { estado: 'ya_pagada'; operacion: number }
  /** Hay otra operación de la cuenta en curso que no se pudo resolver todavía. */
  | { estado: 'en_curso'; operacion: number; estadoOperacion: string }
  /** La base lo rechazó (el mensaje es para la persona). */
  | { estado: 'error_base'; mensaje: string; codigo: string }
  /** Bancard no abrió el pedido. */
  | { estado: 'error_bancard'; clave: string };

/**
 * ¿Se puede dar por abandonada esta operación viva para abrir otra?
 *
 *   · Un formulario sí: quien pide pagar de nuevo dejó el anterior.
 *   · Un cobro con tarjeta guardada de menos de 10 minutos, no, ni creado ni
 *     incierto: el emisor puede estar procesándolo todavía (el manual habla
 *     de 49 segundos del emisor y de esperar 10 minutos antes de consultar).
 *     Mandarle la reversa y cobrar de nuevo enseguida cobraba dos veces.
 *   · Un 3D Secure esperando a la persona, no: se consulta y nada más.
 */
const MINUTOS_DE_UN_COBRO_EN_CURSO = 10;

async function liberarViva(d: Deps, viva: number): Promise<'pagada' | 'libre' | 'en_curso'> {
  const info = await operacionInterna(d, viva);
  if (info === undefined) return 'en_curso';
  if (info === null) return 'libre';
  if (info.entorno !== d.entorno) return 'en_curso';     // la cierra la conciliación
  if (!ESTADOS_VIVOS.includes(info.estado)) return info.estado === 'pagada' ? 'pagada' : 'libre';

  if (info.medio === 'token' && (info.estado === 'creada' || info.estado === 'incierta')
      && info.minutos < MINUTOS_DE_UN_COBRO_EN_CURSO) {
    return 'en_curso';
  }
  const vencer = !(info.medio === 'token' && info.estado === 'en_3ds');

  const r = await resolverOperacion(d, viva, { vencerSiNoPago: vencer, esperaMs: ESPERA_CORTA_MS });
  if (r === 'pagada') return 'pagada';
  if (r === 'vencida' || r === 'rechazada' || r === 'revertida' || r === 'desconocida') return 'libre';
  return 'en_curso';
}

/**
 * ARRANCAR UN PAGO CON EL FORMULARIO DE BANCARD (tarjeta, QR y lo que ofrezca
 * adentro). Manual, «Single Buy»: marca «Recibir creación de pago».
 *
 *   1. La base crea la operación con el importe congelado (o devuelve la
 *      misma de hace un momento si es un doble clic, o avisa que hay otra
 *      viva: entonces se resuelve con Bancard y se prueba UNA vez más).
 *   2. `single_buy` con `return_url` = la pantalla de vuelta de ese pedido.
 *   3. Se guarda el `process_id` (para reusarlo) y se devuelve: el navegador
 *      lo necesita para abrir el formulario. Nunca va en una URL.
 */
export async function iniciarPago(d: Deps, p: PedidoDePago): Promise<InicioDePago> {
  for (let intento = 0; intento < 2; intento++) {
    const r = await llamar<Record<string, unknown> | null>(d, 'bancard_crear_operacion', {
      p_empresa: p.empresa,
      p_usuario: p.usuario,
      p_entorno: d.entorno,
      p_tipo: p.tipo,
      p_medio: 'formulario',
      p_plan: p.plan,
      p_periodo: p.periodo,
      p_personas: p.personas,
    });
    if (r.ok === false) return { estado: 'error_base', mensaje: r.mensaje, codigo: r.codigo };
    const o = r.data;
    if (!esObjeto(o)) return { estado: 'error_base', mensaje: '', codigo: '' };

    if (o.viva !== undefined && o.viva !== null) {
      const viva = Number(o.viva);
      if (intento > 0) return { estado: 'en_curso', operacion: viva, estadoOperacion: String(o.estado ?? '') };
      const libre = await liberarViva(d, viva);
      if (libre === 'pagada') return { estado: 'ya_pagada', operacion: viva };
      if (libre === 'libre') continue;
      return { estado: 'en_curso', operacion: viva, estadoOperacion: String(o.estado ?? '') };
    }

    const operacion = Number(o.operacion);
    const importe = Number(o.importe);

    // Doble clic, o cerrar y volver a abrir: el mismo formulario de antes.
    if (o.reusada === true && typeof o.process_id === 'string' && o.process_id) {
      return {
        estado: 'listo', operacion, processId: o.process_id, importe, desglose: o.desglose,
        entorno: d.entorno, reusada: true,
      };
    }

    const vuelta = `${d.sitio}/plan/pago/${operacion}`;
    let sb: Resultado<{ processId: string }>;
    try {
      sb = await d.bancard.singleBuy({
        operacion,
        importe,
        descripcion: String(o.descripcion ?? ''),
        returnUrl: vuelta,
        // El manual: «Opcional, se usará return_url por defecto». Igual se
        // manda: la pantalla de vuelta no cree lo que diga la dirección.
        cancelUrl: vuelta,
      });
    } catch {
      // Un dato que no cumple el manual (no debería pasar: lo arma la base).
      sb = { ok: false, clave: 'pedido_invalido', http: 0, clase: 'bancard' };
    }
    await anotar(d, { operacion, tipo: 'single_buy', ok: sb.ok, clave: sb.ok === true ? null : sb.clave, http: sb.ok === true ? 200 : sb.http });

    if (sb.ok === false) {
      // Sin process_id nadie puede pagar esa operación: se cierra.
      await cerrar(d, operacion, 'vencida', { clave: sb.clave });
      anotarEnRegistro(d, `single_buy falló · pedido ${operacion} · ${sb.clave} · http ${sb.http}`);
      return { estado: 'error_bancard', clave: sb.clave };
    }

    const g = await llamar(d, 'bancard_guardar_proceso', { p_operacion: operacion, p_process_id: sb.processId });
    if (!g.ok) anotarEnRegistro(d, `no se guardó el process_id · pedido ${operacion}`);

    // Las rechazadas de esta cuenta que todavía tienen un formulario abierto
    // en Bancard se cierran con la reversa: quien abre otro pago dejó esas.
    // Lo que no se pueda ahora lo termina la conciliación.
    for (const id of Array.isArray(o.reemplaza) ? o.reemplaza : []) {
      await cerrarRechazada(d, Number(id));
    }

    return {
      estado: 'listo', operacion, processId: sb.processId, importe, desglose: o.desglose,
      entorno: d.entorno, reusada: false,
    };
  }
  return { estado: 'error_base', mensaje: '', codigo: '' };
}

/**
 * CERRAR EN BANCARD UNA OPERACIÓN RECHAZADA (revisión 03/10). Una rechazada
 * de formulario seguía pagable en su iframe para siempre, y una aprobación
 * tardía la activaba al precio viejo. Se le manda la reversa: sin pago
 * (PaymentNotFoundError, «deberá tomarse como una respuesta correcta»), ya
 * revertida o desconocida → `vencida` con motivo 'reemplazada'; si la
 * reversa encontró plata y la devolvió → 'RollbackSuccessful'. Si Bancard no
 * contesta, queda rechazada y la conciliación vuelve a intentar.
 *
 * Devuelve true solo si quedó cerrada. Si en el medio la persona reintentó
 * en ese formulario y el pago entró, la operación está pagada: no se cuenta
 * como «rechazada cerrada» y `cerrarTrasReversa` avisa a la administración
 * (revisión 07/10).
 */
async function cerrarRechazada(d: Deps, operacion: number): Promise<boolean> {
  if (!Number.isSafeInteger(operacion) || operacion <= 0) return false;
  const rv = await d.bancard.revertir(operacion, { esperaMs: ESPERA_CORTA_MS });
  await anotar(d, { operacion, tipo: 'rollback', ok: rv.ok, clave: claveDe(rv), http: rv.ok === true ? 200 : rv.http });
  const clave = rv.ok === true ? 'RollbackSuccessful'
    : ['PaymentNotFoundError', 'AlreadyRollbackedError', 'BuyNotFoundError'].includes(rv.clave) ? 'reemplazada'
    : null;
  if (!clave) {
    anotarEnRegistro(d, `reversa de rechazada sin éxito · pedido ${operacion} · ${claveDe(rv)}`);
    return false;
  }
  return (await cerrarTrasReversa(d, operacion, clave)) === 'vencida';
}

// ------------------------------------------------ la confirmación de Bancard

export interface RespuestaHttp {
  http: 200 | 400 | 503;
  cuerpo: { status: 'success' | 'error' };
}

const EXITO: RespuestaHttp = { http: 200, cuerpo: { status: 'success' } };
const PEDIDO_MALO: RespuestaHttp = { http: 400, cuerpo: { status: 'error' } };
const NO_AHORA: RespuestaHttp = { http: 503, cuerpo: { status: 'error' } };

/**
 * ¿Es un cuerpo «vacío» (sin pedido de pago)? El manual viejo hablaba de un
 * POST de monitoreo con un JSON vacío cada 5 minutos: se contesta 200 sin
 * hacer nada.
 */
export function esConfirmacionVacia(crudo: string): boolean {
  const texto = (crudo ?? '').trim();
  if (!texto) return true;
  try {
    const cuerpo = JSON.parse(texto);
    return !esObjeto(cuerpo) || !esObjeto(cuerpo.operation);
  } catch {
    return false;
  }
}

/**
 * Con Bancard sin configurar (sin claves) no se puede comprobar nada: un
 * cuerpo vacío es monitoreo (200); lo demás, «ahora no» (503), y la
 * operación, si existiera, la resuelve la conciliación cuando haya claves.
 */
export function recibirSinConfigurar(crudo: string): RespuestaHttp {
  return esConfirmacionVacia(crudo) ? EXITO : NO_AHORA;
}

/**
 * LA CONFIRMACIÓN QUE MANDA BANCARD (manual, «Buy Single Confirm»: «Este será
 * el único medio por el cual el cliente tendrá la certeza de que el usuario
 * completó satisfactoriamente una transacción»). Marca «Confirmamos
 * correctamente al comercio» cuando se contesta 200 en menos de 30 s.
 *
 *   · Cuerpo vacío → 200 (monitoreo).
 *   · Un número que Orden no creó → 200 (el «Cliente de prueba» del portal).
 *   · Una operación del otro entorno → 200 sin tocar nada.
 *   · Token válido → `bancard_confirmar` (que compara el importe y la
 *     moneda con lo congelado, y no hace nada si ya estaba pagada) → 200.
 *   · Token «de reversa» ("0.00") → se anota; si estaba pagada, queda para
 *     revisar. No revierte sola → 200.
 *   · Token inválido sobre una operación que YA TERMINÓ (pagada, rechazada,
 *     vencida, revertida) → 200 sin preguntarle nada a Bancard: nada puede
 *     cambiar, y la URL es pública (revisión 03/10: con los números
 *     correlativos, cada POST inventado era una consulta a Bancard).
 *   · Token inválido sobre una viva → se le pregunta a Bancard con NUESTRA
 *     clave, como mucho una vez por minuto por operación: si tiene la
 *     respuesta, se aplica esa (200); si no → 400 (en la traza del portal
 *     se ve que la clave privada no coincide). Si la operación es un cobro
 *     con tarjeta guardada, la confirmación puede venir firmada con la
 *     fórmula del charge (que lleva el alias, que Orden no guarda): se anota
 *     'token_de_charge' y se contesta 200 igual; la conciliación la resuelve.
 *   · La base no contesta → 503: el pago no se pierde, la operación sigue
 *     viva y la conciliación la resuelve.
 *
 * Lo que no es un pedido de pago (vacío, inválido, no JSON) no deja fila en
 * `bancard_eventos`: la tabla no puede crecer a razón de un POST ajeno.
 */
const SEGUNDOS_ENTRE_CONSULTAS_POR_TOKEN_INVALIDO = 60;
export async function recibirConfirmacion(
  d: Deps,
  crudo: string,
  opciones: { topeMs?: number } = {},
): Promise<RespuestaHttp> {
  const tope = opciones.topeMs ?? TOPE_CONFIRMACION_MS;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const corte = new Promise<RespuestaHttp>((resolver) => {
    reloj = setTimeout(() => resolver(NO_AHORA), Math.max(1, tope));
  });
  try {
    return await Promise.race([atenderConfirmacion(d, crudo).catch(() => NO_AHORA), corte]);
  } finally {
    if (reloj !== undefined) clearTimeout(reloj);
  }
}

async function atenderConfirmacion(d: Deps, crudo: string): Promise<RespuestaHttp> {
  const texto = (crudo ?? '').trim();
  if (!texto) return EXITO;

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    anotarEnRegistro(d, 'confirmación que no es JSON');
    return PEDIDO_MALO;
  }

  const primera = verificarConfirmacion(cuerpo, d.clavePrivada, null);
  if (primera.forma === 'vacia') return EXITO;
  if (primera.forma === 'invalida') {
    anotarEnRegistro(d, 'confirmación sin número de pedido o sin token usables');
    return PEDIDO_MALO;
  }

  const operacion = Number(primera.operacion);
  const detalle = { operation: primera.respuesta };
  const info = await operacionInterna(d, operacion);
  if (info === undefined) return NO_AHORA;

  if (info === null) {
    await anotar(d, { operacion, tipo: 'confirmacion', ok: true, clave: 'desconocida', detalle });
    return EXITO;
  }
  if (info.entorno !== d.entorno) {
    await anotar(d, { operacion, tipo: 'confirmacion', ok: true, clave: 'otro_entorno', detalle });
    return EXITO;
  }

  // Ahora sí, con el importe que se congeló al crear la operación.
  const leida = verificarConfirmacion(cuerpo, d.clavePrivada, info.importe);
  if (leida.forma !== 'confirmacion') return PEDIDO_MALO;

  if (leida.tokenValido) {
    const c = await confirmar(d, operacion, leida.respuesta, 'confirmacion');
    if (!c) return NO_AHORA;
    await anotar(d, {
      operacion, tipo: 'confirmacion', ok: c.ok === true,
      clave: c.ok === true ? (c.aprobada === true ? (c.ya === true ? 'repetida' : 'aprobada') : 'rechazada') : String(c.motivo ?? 'no'),
      detalle,
    });
    return EXITO;
  }

  if (leida.deReversa) {
    await anotar(d, { operacion, tipo: 'rollback', ok: true, clave: 'aviso_de_reversa', detalle });
    if (info.estado === 'pagada') {
      await llamar(d, 'bancard_marcar_revisar', { p_operacion: operacion, p_motivo: 'Bancard avisó una reversa' });
    }
    return EXITO;
  }

  // El md5 no coincide: o la clave de Vercel no es la del portal, o alguien
  // inventó el mensaje, o (cobro con tarjeta guardada) Bancard firmó con la
  // fórmula del charge, que lleva el alias que Orden no guarda.
  const deCharge = info.medio === 'token';
  const clave = deCharge ? 'token_de_charge' : 'token_invalido';

  // Sobre una operación que ya terminó nada puede cambiar: no se le pregunta
  // nada a Bancard.
  if (!ESTADOS_VIVOS.includes(info.estado)) {
    await anotar(d, { operacion, tipo: 'confirmacion', ok: true, clave: `${clave}_cerrada`, detalle });
    return EXITO;
  }

  // Manda lo que diga Bancard consultado con nuestra clave (una vez por minuto).
  const estado = await resolverOperacion(d, operacion, {
    esperaMs: ESPERA_CORTA_MS,
    noRepetirAntesDeS: SEGUNDOS_ENTRE_CONSULTAS_POR_TOKEN_INVALIDO,
  });
  if (estado === 'pagada' || estado === 'rechazada') {
    await anotar(d, { operacion, tipo: 'confirmacion', ok: true, clave: `${clave}_consultada`, detalle });
    return EXITO;
  }
  await anotar(d, { operacion, tipo: 'confirmacion', ok: deCharge, clave, detalle });
  anotarEnRegistro(d, `confirmación con ${clave} · pedido ${operacion}`);
  // Con la tarjeta guardada no se contesta 400: en la traza quedaría
  // «inválida» cada vez, y es la conciliación la que la resuelve igual.
  return deCharge ? EXITO : PEDIDO_MALO;
}

// ------------------------------------------------ la baja de personas

export type BajaDePersonas =
  | { estado: 'listo'; proxima: number | null }
  /** La cuenta no ve Bancard y pidió PROGRAMAR una baja: no se escribe nada. */
  | { estado: 'no_disponible' }
  | { estado: 'error_base'; mensaje: string; codigo: string };

/**
 * «BAJAR DESDE LA PRÓXIMA RENOVACIÓN» (un número) Y «DESHACER» (null), para
 * la ruta `/api/pagos/bancard/personas` (revisión 07/10/2026).
 *
 * `bancard_bajar_personas` es solo del servidor y no sabe si la cuenta ve
 * Bancard (la configuración vive en Vercel): eso llega en `veBancard`, que
 * la ruta saca de `accesoBancard` con la sesión de quien lo pide.
 *
 *   · Programar una baja sin ver Bancard: no se llama a la base. Una cuenta
 *     que no puede pagar por Bancard no tiene por qué quedar con el tope del
 *     equipo bajado por una renovación que no va a pasar por acá.
 *   · Deshacer (null) se permite SIEMPRE: nadie queda atrapado con una baja
 *     si después se le deshabilita Bancard. La base igual comprueba que
 *     `usuario` administre la cuenta.
 *
 * Recibe solo la base (no `Deps`): no le habla a Bancard, y tiene que andar
 * con Bancard sin configurar.
 */
export async function programarBajaDePersonas(
  bd: BaseBancard,
  p: { empresa: string; usuario: string; personas: number | null; veBancard: boolean },
): Promise<BajaDePersonas> {
  if (p.personas !== null && !p.veBancard) return { estado: 'no_disponible' };
  try {
    const { data, error } = await bd.rpc('bancard_bajar_personas', {
      p_empresa: p.empresa, p_usuario: p.usuario, p_personas: p.personas,
    });
    if (error) return { estado: 'error_base', mensaje: error.message ?? '', codigo: error.code ?? '' };
    const proxima = esObjeto(data) && typeof data.personas_proxima === 'number' ? data.personas_proxima : null;
    return { estado: 'listo', proxima };
  } catch (e) {
    return { estado: 'error_base', mensaje: e instanceof Error ? e.message : '', codigo: '' };
  }
}

// ---------------------------------------------------------------- revertir

export type ReversaDePago =
  | { ok: true; bancard: 'revertida' | 'ya_estaba' | 'sin_bancard'; datos: Record<string, unknown> }
  /**
   * 'base'               la base no lo deja (otro día, cambios después, no aprobado…): `mensaje`.
   * 'otro_entorno'       ese pago es del otro ambiente de Bancard.
   * 'cuponada'           Bancard ya no lo revierte: se anula por el portal y se marca con `sinBancard`.
   * 'bancard'            Bancard no contestó o dijo que no (`clave`).
   * 'despues_de_bancard' Bancard SÍ lo revirtió y Orden no pudo deshacerlo: quedó para revisar.
   */
  | { ok: false; motivo: 'base' | 'otro_entorno' | 'cuponada' | 'bancard' | 'despues_de_bancard'; mensaje?: string; clave?: string };

/**
 * REVERTIR UN PAGO APROBADO (manual, «Single Buy Rollback»: «Debe
 * completarse con éxito un Single Buy Rollback manual en un caso de
 * transacción aprobada» para marcar «Recibir rollback»). Solo la
 * administración, y solo el mismo día del pago (después, por el portal de
 * comercios → Soporte → Anulaciones, y acá con `sinBancard`).
 *
 *   1. La base comprueba que se pueda (antes de pedirle nada a Bancard).
 *   2. Bancard revierte (RollbackSuccessful, o AlreadyRollbackedError si ya
 *      lo había hecho). TransactionAlreadyConfirmed = cuponada: no se toca la base.
 *   3. La base deshace en Orden lo que el pago activó.
 */
export async function revertirPago(
  d: Deps,
  p: { operacion: number; actor: string; motivo: string; sinBancard: boolean },
): Promise<ReversaDePago> {
  const argumentos = {
    p_operacion: p.operacion,
    p_actor: p.actor,
    p_motivo: p.motivo,
    p_sin_bancard: p.sinBancard,
  };

  const prueba = await llamar(d, 'bancard_revertir', { ...argumentos, p_solo_comprobar: true });
  if (prueba.ok === false) return { ok: false, motivo: 'base', mensaje: prueba.mensaje };

  let bancard: 'revertida' | 'ya_estaba' | 'sin_bancard' = 'sin_bancard';
  if (!p.sinBancard) {
    const info = await operacionInterna(d, p.operacion);
    if (!info) return { ok: false, motivo: 'base', mensaje: '' };
    if (info.entorno !== d.entorno) return { ok: false, motivo: 'otro_entorno' };

    const rv = await d.bancard.revertir(p.operacion);
    await anotar(d, { operacion: p.operacion, tipo: 'rollback', ok: rv.ok, clave: claveDe(rv), http: rv.ok === true ? 200 : rv.http });
    if (rv.ok === true) bancard = 'revertida';
    else if (rv.clave === 'AlreadyRollbackedError') bancard = 'ya_estaba';
    else if (rv.clave === 'TransactionAlreadyConfirmed') return { ok: false, motivo: 'cuponada', clave: rv.clave };
    else return { ok: false, motivo: 'bancard', clave: rv.clave };
  }

  const hecho = await llamar<Record<string, unknown>>(d, 'bancard_revertir', { ...argumentos, p_solo_comprobar: false });
  if (hecho.ok === false) {
    if (bancard === 'sin_bancard') return { ok: false, motivo: 'base', mensaje: hecho.mensaje };
    // Lo peor que puede pasar: la plata volvió y el plan sigue activo. Que
    // lo vea una persona, con el motivo.
    await llamar(d, 'bancard_marcar_revisar', {
      p_operacion: p.operacion,
      p_motivo: `Bancard revirtió el pago y Orden no pudo deshacerlo: ${hecho.mensaje}`.slice(0, 200),
    });
    anotarEnRegistro(d, `reversa hecha en Bancard y no en la base · pedido ${p.operacion}`);
    return { ok: false, motivo: 'despues_de_bancard', mensaje: hecho.mensaje };
  }
  return { ok: true, bancard, datos: esObjeto(hecho.data) ? hecho.data : {} };
}

// ------------------------------------------------- la tarjeta guardada

/** Lo que el servidor sabe de una tarjeta (`bancard_tarjeta_interna`). */
interface TarjetaInterna {
  tarjeta: number;
  userId: number;
  empresa_id: string;
  entorno: EntornoBancard;
  estado: string;
}

async function tarjetaInterna(d: Deps, tarjeta: number): Promise<TarjetaInterna | null | undefined> {
  const r = await llamar(d, 'bancard_tarjeta_interna', { p_tarjeta: tarjeta });
  if (r.ok === false) return undefined;
  if (!esObjeto(r.data)) return null;
  return {
    tarjeta: Number(r.data.tarjeta_id),
    userId: Number(r.data.user_id),
    empresa_id: String(r.data.empresa_id ?? ''),
    entorno: r.data.entorno as EntornoBancard,
    estado: String(r.data.estado ?? ''),
  };
}

/**
 * Las tarjetas de un pagador en Bancard, anotando el pedido.
 *
 * En el detalle queda CUÁNTAS vinieron y con qué `card_id` (los números que
 * les puso Orden: no son datos de la tarjeta). Un «users_cards ok 200» a
 * secas no decía si Bancard contestó la lista vacía o con otras tarjetas, y
 * así no se podía saber por qué una no quedó guardada (07/10/2026). Del
 * resto de cada tarjeta (alias, número enmascarado, vencimiento) no se anota
 * nada, nunca.
 */
async function listarTarjetas(
  d: Deps, userId: number, e: { operacion?: number | null; tarjeta?: number | null; esperaMs?: number },
): Promise<Resultado<{ tarjetas: TarjetaBancard[] }>> {
  const r = await d.bancard.tarjetas(userId, { esperaMs: e.esperaMs ?? ESPERA_CORTA_MS * 2 });
  await anotar(d, {
    operacion: e.operacion ?? null, tarjeta: e.tarjeta ?? null, tipo: 'users_cards',
    ok: r.ok, clave: r.ok === true ? null : r.clave, http: r.ok === true ? 200 : r.http,
    detalle: r.ok === true ? { cuantas: r.tarjetas.length, ids: r.tarjetas.map((t) => t.cardId).join(',') } : {},
  });
  return r;
}

/**
 * BORRAR UNA TARJETA EN BANCARD Y DARLA POR QUITADA (manual, «Eliminar
 * tarjeta»: el alias tiene que ser recién pedido). Si Bancard ya no la tiene,
 * también está quitada. Devuelve si quedó terminado; si no (Bancard no
 * contestó), queda `por_quitar` y la conciliación vuelve a intentar.
 *
 * `usuario` null es la conciliación: la base lo admite solo para el paso
 * 'hecho'.
 */
async function borrarEnBancard(
  d: Deps,
  p: { tarjeta: number; userId: number; usuario?: string | null; alias?: string | null },
): Promise<boolean> {
  let alias = p.alias ?? null;
  if (!alias) {
    const lista = await listarTarjetas(d, p.userId, { tarjeta: p.tarjeta });
    if (lista.ok === false) return false;
    const t = lista.tarjetas.find((x) => x.cardId === p.tarjeta);
    if (!t) {
      // Bancard ya no la tiene: no hay nada que borrar.
      const h = await llamar(d, 'bancard_quitar_tarjeta', { p_tarjeta: p.tarjeta, p_usuario: p.usuario ?? null, p_paso: 'hecho' });
      return h.ok;
    }
    alias = t.alias;
  }

  const b = await d.bancard.borrarTarjeta(p.userId, alias, { esperaMs: ESPERA_CORTA_MS * 2 });
  await anotar(d, { tarjeta: p.tarjeta, tipo: 'delete_card', ok: b.ok, clave: claveDe(b), http: b.ok === true ? 200 : b.http });
  if (b.ok === false && b.clave !== 'CardNotFoundError') {
    anotarEnRegistro(d, `borrar tarjeta sin éxito · tarjeta ${p.tarjeta} · ${b.clave}`);
    return false;
  }
  const h = await llamar(d, 'bancard_quitar_tarjeta', { p_tarjeta: p.tarjeta, p_usuario: p.usuario ?? null, p_paso: 'hecho' });
  return h.ok;
}

export type InicioDeCatastro =
  /** Listo para abrir el formulario de catastro de Bancard con este `processId`. */
  | { estado: 'listo'; tarjeta: number; processId: string; entorno: EntornoBancard }
  /** Bancard exige un teléfono y la cuenta no tiene: la pantalla lo pide. */
  | { estado: 'falta_telefono'; mensaje: string }
  | { estado: 'error_base'; mensaje: string; codigo: string }
  | { estado: 'error_bancard'; clave: string };

/**
 * PEDIR EL FORMULARIO PARA GUARDAR UNA TARJETA (manual, «Catastro de Tarjeta
 * (Cards_new)»; marca «Solicitud de catastro»).
 *
 * La base guarda el consentimiento del cobro recurrente (quién, cuándo, qué
 * texto) y le pone a la tarjeta su número; Bancard devuelve el `process_id`
 * con el que el navegador abre el formulario. Si Bancard no abre el pedido,
 * la tarjeta queda `fallida` y nada más cambió.
 */
export async function iniciarCatastro(
  d: Deps,
  p: { empresa: string; usuario: string; telefono: string | null; consentimiento: string },
): Promise<InicioDeCatastro> {
  const r = await llamar<Record<string, unknown>>(d, 'bancard_crear_catastro', {
    p_empresa: p.empresa,
    p_usuario: p.usuario,
    p_entorno: d.entorno,
    p_telefono: p.telefono,
    p_consentimiento: p.consentimiento,
  });
  if (r.ok === false) {
    if (/tel[eé]fono/i.test(r.mensaje)) return { estado: 'falta_telefono', mensaje: r.mensaje };
    return { estado: 'error_base', mensaje: r.mensaje, codigo: r.codigo };
  }
  if (!esObjeto(r.data)) return { estado: 'error_base', mensaje: '', codigo: '' };

  const tarjeta = Number(r.data.card_id);
  const userId = Number(r.data.user_id);
  let cn: Resultado<{ processId: string }>;
  try {
    cn = await d.bancard.cardsNew({
      cardId: tarjeta,
      userId,
      telefono: String(r.data.telefono ?? ''),
      email: String(r.data.email ?? ''),
      returnUrl: `${d.sitio}/plan/tarjeta/${tarjeta}`,
    });
  } catch {
    cn = { ok: false, clave: 'pedido_invalido', http: 0, clase: 'bancard' };
  }
  await anotar(d, { tarjeta, tipo: 'cards_new', ok: cn.ok, clave: cn.ok === true ? null : cn.clave, http: cn.ok === true ? 200 : cn.http });

  if (cn.ok === false) {
    await llamar(d, 'bancard_tarjeta_fallida', { p_tarjeta: tarjeta, p_motivo: cn.clave });
    anotarEnRegistro(d, `cards_new falló · tarjeta ${tarjeta} · ${cn.clave} · http ${cn.http}`);
    return { estado: 'error_bancard', clave: cn.clave };
  }
  return { estado: 'listo', tarjeta, processId: cn.processId, entorno: d.entorno };
}

export type VerificacionDeTarjeta =
  | { guardada: true; tarjeta: number; marca: string | null; ultimos4: string | null; ya: boolean }
  /**
   * 'no_esta'       Bancard no la tiene: el catastro no terminó (queda `fallida`).
   * 'bancard'       Bancard no contestó: no se sabe todavía (la conciliación vuelve).
   * 'base'          la base no contestó.
   * 'ajena'         no es de esa cuenta.
   * 'desconocida'   no existe.
   * 'otro_entorno'  es del otro ambiente de Bancard.
   * otro texto      su estado: 'quitada', 'por_quitar'…
   */
  | { guardada: false; motivo: string; clave?: string };

/**
 * ¿QUEDÓ GUARDADA? Se le pregunta a Bancard por las tarjetas del pagador
 * (manual, «users_cards»; marca «Recibir tarjetas del usuario»): si la lista
 * trae este `card_id`, la tarjeta queda activa con su marca y sus últimos
 * cuatro, y es la del débito. La que estaba antes se borra en Bancard. Lo
 * que dijo el formulario («add_new_card_success») no cuenta para nada.
 *
 * `empresa`, si viene, tiene que ser la dueña de la tarjeta.
 *
 * `formulario`, si viene, es lo que avisó el iframe de catastro (o la
 * dirección de vuelta), tal como lo mandó el navegador. SOLO SE ANOTA: un
 * evento `catastro_formulario` con el estado en `clave` y la descripción en
 * el detalle, para que de un catastro rechazado adentro del iframe quede por
 * qué. Se anota antes de preguntarle a Bancard y no se vuelve a mirar: un
 * «add_new_card_success» inventado no guarda ninguna tarjeta.
 */
export async function verificarTarjeta(
  d: Deps,
  p: { tarjeta: number; empresa?: string | null; formulario?: DichoPorElFormulario | null },
): Promise<VerificacionDeTarjeta> {
  const info = await tarjetaInterna(d, p.tarjeta);
  if (info === undefined) return { guardada: false, motivo: 'base' };
  if (info === null) return { guardada: false, motivo: 'desconocida' };
  if (p.empresa && info.empresa_id !== p.empresa) return { guardada: false, motivo: 'ajena' };
  if (info.entorno !== d.entorno) return { guardada: false, motivo: 'otro_entorno' };
  if (info.estado !== 'activa' && info.estado !== 'pendiente' && info.estado !== 'fallida') {
    return { guardada: false, motivo: info.estado };
  }

  // Recién acá: la tarjeta existe y es de esa cuenta (nadie anota sobre una
  // ajena). Se vuelve a limpiar, venga de donde venga.
  const dicho = leerLoQueDijoElFormulario(p.formulario);
  if (dicho) {
    await anotar(d, {
      tarjeta: p.tarjeta, tipo: 'catastro_formulario',
      ok: dicho.mensaje === CATASTRO_CON_EXITO,
      clave: dicho.mensaje.slice(0, 80) || null,
      detalle: dicho.detalle ? { descripcion: dicho.detalle } : {},
    });
  }

  const lista = await listarTarjetas(d, info.userId, { tarjeta: p.tarjeta });
  if (lista.ok === false) {
    if (info.estado === 'activa') return { guardada: true, tarjeta: p.tarjeta, marca: null, ultimos4: null, ya: true };
    return { guardada: false, motivo: 'bancard', clave: lista.clave };
  }

  const t = lista.tarjetas.find((x) => x.cardId === p.tarjeta);
  if (!t) {
    if (info.estado === 'activa') {
      // Una activa que Bancard ya no tiene: se da por quitada, con su débito.
      await llamar(d, 'bancard_quitar_tarjeta', { p_tarjeta: p.tarjeta, p_usuario: null, p_paso: 'hecho' });
      return { guardada: false, motivo: 'quitada' };
    }
    await llamar(d, 'bancard_tarjeta_fallida', { p_tarjeta: p.tarjeta, p_motivo: 'Bancard no la tiene' });
    return { guardada: false, motivo: 'no_esta' };
  }

  const a = await llamar<Record<string, unknown>>(d, 'bancard_activar_tarjeta', {
    p_tarjeta: p.tarjeta,
    p_marca: t.marca || null,
    p_ultimos4: ultimos4(t.enmascarado),
    p_tipo: t.tipo,
  });
  if (a.ok === false || !esObjeto(a.data) || a.data.ok !== true) {
    return { guardada: false, motivo: a.ok === false ? 'base' : String(a.data && esObjeto(a.data) ? a.data.motivo ?? 'base' : 'base') };
  }

  // La que estaba antes (cambió de tarjeta): se borra en Bancard con el alias
  // de esta misma lista. Si no se puede ahora, la conciliación insiste.
  const anterior = a.data.anterior;
  if (typeof anterior === 'number' || (typeof anterior === 'string' && anterior)) {
    const vieja = Number(anterior);
    const aliasVieja = lista.tarjetas.find((x) => x.cardId === vieja)?.alias ?? null;
    if (aliasVieja) await borrarEnBancard(d, { tarjeta: vieja, userId: info.userId, alias: aliasVieja });
    else await llamar(d, 'bancard_quitar_tarjeta', { p_tarjeta: vieja, p_usuario: null, p_paso: 'hecho' });
  }

  return {
    guardada: true,
    tarjeta: p.tarjeta,
    marca: typeof a.data.marca === 'string' ? a.data.marca : null,
    ultimos4: typeof a.data.ultimos4 === 'string' ? a.data.ultimos4 : null,
    ya: a.data.ya === true,
  };
}

export type QuitarTarjeta =
  /** Ya no se cobra más. `pendienteEnBancard`: Bancard no contestó; la conciliación termina el borrado. */
  | { ok: true; tarjeta: number; pendienteEnBancard: boolean }
  | { ok: false; motivo: 'sin_tarjeta' | 'base'; mensaje?: string };

/**
 * QUITAR LA TARJETA GUARDADA (manual, «Eliminar tarjeta»; marca «Eliminar
 * tarjeta del usuario»). Primero la base: el débito se apaga en el acto,
 * aunque Bancard no conteste. Después Bancard, con un alias recién pedido.
 */
export async function quitarTarjeta(d: Deps, p: { empresa: string; usuario: string }): Promise<QuitarTarjeta> {
  const datos = await llamar(d, 'bancard_datos_de_tarjeta', { p_empresa: p.empresa, p_entorno: d.entorno });
  if (datos.ok === false) return { ok: false, motivo: 'base', mensaje: datos.mensaje };
  if (!esObjeto(datos.data)) return { ok: false, motivo: 'sin_tarjeta' };

  const tarjeta = Number(datos.data.tarjeta_id);
  const userId = Number(datos.data.user_id);
  const pedido = await llamar(d, 'bancard_quitar_tarjeta', { p_tarjeta: tarjeta, p_usuario: p.usuario, p_paso: 'pedido' });
  if (pedido.ok === false) return { ok: false, motivo: 'base', mensaje: pedido.mensaje };

  const hecho = await borrarEnBancard(d, { tarjeta, userId, usuario: p.usuario });
  if (!hecho) anotarEnRegistro(d, `tarjeta ${tarjeta} quitada en Orden; Bancard todavía no`);
  return { ok: true, tarjeta, pendienteEnBancard: !hecho };
}

// ------------------------------------------ cobrar con la tarjeta guardada

/** Lo que `bancard_crear_operacion` / `bancard_tomar_cobro` devuelven para cobrar con token. */
export interface OperacionTomada {
  operacion: number;
  importe: number;
  descripcion: string;
  user_id: number;
  card_id: number;
}

export type ResultadoDeCobro =
  | { estado: 'pagada'; operacion: number; descripcion: string | null }
  | { estado: 'rechazada'; operacion: number; descripcion: string | null; clase: string | null }
  /** El banco pide 3D Secure: el navegador abre el formulario con este número. */
  | { estado: 'en_3ds'; operacion: number; processId: string }
  /** No se sabe qué pasó (se cortó). NO se vuelve a cobrar: la conciliación lo resuelve. */
  | { estado: 'incierta'; operacion: number }
  /** Bancard no aceptó el pedido (la tarjeta no está, bloqueada…): no se cobró nada. */
  | { estado: 'vencida'; operacion: number; clave: string }
  | { estado: 'ya_pagada'; operacion: number }
  | { estado: 'en_curso'; operacion: number; estadoOperacion: string }
  | { estado: 'error_base'; mensaje: string; codigo: string };

/**
 * COBRAR CON LA TARJETA GUARDADA, CON LA PERSONA DELANTE («Pagar con mi
 * Visa •••• 0016»). La base crea la operación con medio 'token' (exige la
 * tarjeta activa y no rebotada) y de ahí es lo mismo que el cobro automático.
 */
export async function cobrarConTarjeta(
  d: Deps,
  p: PedidoDePago,
  opciones: { esperaMs?: number } = {},
): Promise<ResultadoDeCobro> {
  for (let intento = 0; intento < 2; intento++) {
    const r = await llamar<Record<string, unknown> | null>(d, 'bancard_crear_operacion', {
      p_empresa: p.empresa,
      p_usuario: p.usuario,
      p_entorno: d.entorno,
      p_tipo: p.tipo,
      p_medio: 'token',
      p_plan: p.plan,
      p_periodo: p.periodo,
      p_personas: p.personas,
    });
    if (r.ok === false) return { estado: 'error_base', mensaje: r.mensaje, codigo: r.codigo };
    const o = r.data;
    if (!esObjeto(o)) return { estado: 'error_base', mensaje: '', codigo: '' };

    if (o.viva !== undefined && o.viva !== null) {
      const viva = Number(o.viva);
      if (intento > 0) return { estado: 'en_curso', operacion: viva, estadoOperacion: String(o.estado ?? '') };
      const libre = await liberarViva(d, viva);
      if (libre === 'pagada') return { estado: 'ya_pagada', operacion: viva };
      if (libre === 'libre') continue;
      return { estado: 'en_curso', operacion: viva, estadoOperacion: String(o.estado ?? '') };
    }

    return cobrarOperacionTomada(d, {
      operacion: Number(o.operacion),
      importe: Number(o.importe),
      descripcion: String(o.descripcion ?? ''),
      user_id: Number(o.user_id),
      card_id: Number(o.card_id),
    }, opciones);
  }
  return { estado: 'error_base', mensaje: '', codigo: '' };
}

/**
 * EL COBRO CON TOKEN (manual, «Pago con token (charge)»; marca «Pago con
 * alias token»), sobre una operación ya creada (por la persona o por la
 * tarea diaria):
 *
 *   1. Se le piden a Bancard las tarjetas del pagador; si la guardada no
 *      está, se da por quitada y la operación vence sin cobrar.
 *   2. `charge` con el alias recién pedido. Si el alias venció en el medio,
 *      se pide de nuevo y se reintenta UNA vez.
 *   3. La respuesta viene en el mismo pedido: aprobada o rechazada la aplica
 *      `bancard_confirmar` (que también recibirá la confirmación de Bancard
 *      por la URL: el segundo no hace nada). Si todo viene vacío menos
 *      `process_id`, es 3D Secure: la operación queda esperando a la persona.
 *   4. Si Bancard no contestó, la operación queda INCIERTA y no se vuelve a
 *      cobrar: la conciliación consulta y decide. Lo mismo si contestó un
 *      error de servidor (5xx), aunque traiga JSON: un proxy puede devolver
 *      un 502 DESPUÉS de que Bancard cobró, y darlo por «no se cobró»
 *      devolvía el intento y cobraba otra vez al día siguiente (revisión
 *      07/10). Solo un «no» de Bancard por debajo de 500 cierra el cobro.
 */
export async function cobrarOperacionTomada(
  d: Deps,
  tomada: OperacionTomada,
  opciones: { esperaMs?: number } = {},
): Promise<ResultadoDeCobro> {
  const { operacion } = tomada;
  const userId = Number(tomada.user_id);
  const cardId = Number(tomada.card_id);
  const espera = opciones.esperaMs;

  const lista = await listarTarjetas(d, userId, { operacion, tarjeta: cardId });
  if (lista.ok === false) {
    // Sin la tarjeta no se mandó ningún cobro: se cierra y se prueba otro día.
    await cerrar(d, operacion, 'vencida', { clave: lista.clave });
    if (lista.clase === 'no_json') await avisarSeguro(d, { aviso: 'bloqueo', operacion, clave: lista.clave });
    anotarEnRegistro(d, `users_cards falló · pedido ${operacion} · ${lista.clave} · http ${lista.http}`);
    return { estado: 'vencida', operacion, clave: lista.clave };
  }
  let t = lista.tarjetas.find((x) => x.cardId === cardId);
  if (!t) {
    await llamar(d, 'bancard_quitar_tarjeta', { p_tarjeta: cardId, p_usuario: null, p_paso: 'hecho' });
    await cerrar(d, operacion, 'vencida', { clave: 'CardNotFoundError' });
    anotarEnRegistro(d, `la tarjeta guardada ya no está en Bancard · pedido ${operacion}`);
    return { estado: 'vencida', operacion, clave: 'CardNotFoundError' };
  }

  const vuelta = `${d.sitio}/plan/pago/${operacion}`;
  const cobrar = (alias: string) => d.bancard.cobrar(
    { operacion, importe: tomada.importe, descripcion: tomada.descripcion, alias, returnUrl: vuelta },
    espera !== undefined ? { esperaMs: espera } : {},
  );

  let r: Resultado<RespuestaCobro>;
  try {
    r = await cobrar(t.alias);
    if (r.ok === false && r.clave === 'CardAliasTokenExpiredError') {
      const otra = await listarTarjetas(d, userId, { operacion, tarjeta: cardId });
      t = otra.ok === true ? otra.tarjetas.find((x) => x.cardId === cardId) : undefined;
      if (t) r = await cobrar(t.alias);
    }
  } catch {
    r = { ok: false, clave: 'pedido_invalido', http: 0, clase: 'bancard' };
  }
  await anotar(d, {
    operacion, tarjeta: cardId, tipo: 'charge', ok: r.ok,
    clave: r.ok === true ? (r.tipo === '3ds' ? '3ds' : null) : r.clave,
    http: r.ok === true ? 200 : r.http,
    detalle: r.ok === true && r.tipo === 'resuelto' ? { operation: r.respuesta } : {},
  });

  if (r.ok === true) {
    if (r.tipo === '3ds') {
      const c = await cerrar(d, operacion, 'en_3ds', { process_id: r.processId });
      if (c.ok && esObjeto(c.data) && c.data.cambio === true && c.data.origen === 'automatico') {
        await avisarSeguro(d, { ...c.data, aviso: 'tres_ds', operacion });
      }
      return { estado: 'en_3ds', operacion, processId: r.processId };
    }
    const c = await confirmar(d, operacion, r.respuesta, 'charge');
    if (!c) return { estado: 'incierta', operacion };
    const e = estadoDeConfirmar(c);
    const descripcion = typeof r.respuesta.response_description === 'string' ? r.respuesta.response_description.slice(0, 120) : null;
    if (e === 'pagada') return { estado: 'pagada', operacion, descripcion };
    if (e === 'rechazada') return { estado: 'rechazada', operacion, descripcion, clase: typeof c.clase === 'string' ? c.clase : null };
    return { estado: 'incierta', operacion };
  }

  if (r.clase === 'bancard' && r.http < 500) {
    // Bancard no aceptó el pedido (no es el banco rechazando): no se cobró.
    // Un pedido que ni salió (http 0, armado acá arriba) entra también.
    await cerrar(d, operacion, 'vencida', { clave: r.clave });
    anotarEnRegistro(d, `charge no aceptado · pedido ${operacion} · ${r.clave} · http ${r.http}`);
    return { estado: 'vencida', operacion, clave: r.clave };
  }

  // Se cortó, o contestó un 5xx: puede haberse cobrado. NUNCA otro charge
  // encima; la conciliación le pregunta a Bancard y decide.
  await cerrar(d, operacion, 'incierta');
  if (r.clase === 'no_json') await avisarSeguro(d, { aviso: 'bloqueo', operacion, clave: r.clave });
  anotarEnRegistro(d, `charge sin respuesta · pedido ${operacion} · ${r.clave} · http ${r.http}`);
  return { estado: 'incierta', operacion };
}

// ------------------------------------------------------- la tarea diaria

export interface ResumenCobros {
  tarjetasRevisadas: number;
  tarjetasPorVencer: number;
  tomados: number;
  pagados: number;
  rechazados: number;
  tresDs: number;
  inciertos: number;
  vencidos: number;
  pausados: number;
}

/**
 * ¿Vence la tarjeta antes de ese día? El vencimiento llega como «MM/AA» (manual,
 * `expiration_date`) y vale hasta el último día de ese mes. Si no se entiende,
 * no se avisa nada.
 */
export function tarjetaVenceAntes(vencimiento: string, fechaIso: string): boolean {
  const v = /^\s*([0-9]{1,2})\s*\/\s*([0-9]{2}|[0-9]{4})\s*$/.exec(vencimiento ?? '');
  const f = /^([0-9]{4})-([0-9]{2})/.exec(String(fechaIso ?? ''));
  if (!v || !f) return false;
  const mes = Number(v[1]);
  const anio = v[2].length === 2 ? 2000 + Number(v[2]) : Number(v[2]);
  if (mes < 1 || mes > 12) return false;
  return anio * 12 + mes < Number(f[1]) * 12 + Number(f[2]);
}

/** Lo que falta para que no se corte la ruta a mitad de un cobro. */
const RESERVA_DE_COBRO_MS = 45_000;

/**
 * LOS COBROS DE LA TARJETA GUARDADA (cada hora de 9 a 18, `orden-cobros-bancard`).
 *
 *   1. Las tarjetas de las cuentas que vencen en 5 días se miran en vivo en
 *      Bancard (el vencimiento no se guarda): si vencen antes del cobro, se
 *      avisa «cambiala».
 *   2. Mientras quede tiempo, la base entrega DE A UNO el cobro que toca
 *      (`bancard_tomar_cobro`, que lo reserva en la misma transacción: dos
 *      corridas a la vez nunca cobran la misma cuenta) y se cobra con el
 *      token. Una cuenta que no se pudo cotizar queda pausada y se le avisa
 *      a la administración.
 */
export async function correrCobros(
  d: Deps,
  limites: { hastaMs: number },
  opciones: { esperaMs?: number } = {},
): Promise<ResumenCobros> {
  const resumen: ResumenCobros = {
    tarjetasRevisadas: 0, tarjetasPorVencer: 0, tomados: 0, pagados: 0, rechazados: 0,
    tresDs: 0, inciertos: 0, vencidos: 0, pausados: 0,
  };
  const hayTiempo = () => Date.now() < limites.hastaMs - RESERVA_DE_COBRO_MS;

  // 1. Tarjetas por vencer.
  const porRevisar = await llamar(d, 'bancard_tarjetas_por_revisar', { p_entorno: d.entorno });
  const filas = porRevisar.ok === true && Array.isArray(porRevisar.data) ? porRevisar.data : [];
  for (const f of filas) {
    if (!hayTiempo() || !esObjeto(f)) break;
    const lista = await listarTarjetas(d, Number(f.user_id), { tarjeta: Number(f.card_id) });
    resumen.tarjetasRevisadas += 1;
    if (lista.ok === false) continue;
    const t = lista.tarjetas.find((x) => x.cardId === Number(f.card_id));
    if (!t || !tarjetaVenceAntes(t.vencimiento, String(f.fecha_cobro ?? ''))) continue;
    resumen.tarjetasPorVencer += 1;
    await avisarSeguro(d, {
      aviso: 'tarjeta_vence',
      empresa_id: f.empresa_id,
      fecha_fin: f.fecha_fin,
      fecha_cobro: f.fecha_cobro,
      marca: f.marca ?? t.marca,
      ultimos4: f.ultimos4 ?? ultimos4(t.enmascarado),
      destinatarios: f.destinatarios,
    });
  }

  // 2. Los cobros, de a uno.
  while (hayTiempo()) {
    const t = await llamar(d, 'bancard_tomar_cobro', { p_entorno: d.entorno });
    if (t.ok === false) {
      anotarEnRegistro(d, `bancard_tomar_cobro falló · ${t.mensaje}`);
      break;
    }
    if (!esObjeto(t.data)) break;

    if (t.data.pausada) {
      resumen.pausados += 1;
      await avisarSeguro(d, { aviso: 'pausada', empresa_id: t.data.pausada, motivo: t.data.motivo });
      continue;
    }

    resumen.tomados += 1;
    const c = await cobrarOperacionTomada(d, {
      operacion: Number(t.data.operacion),
      importe: Number(t.data.importe),
      descripcion: String(t.data.descripcion ?? ''),
      user_id: Number(t.data.user_id),
      card_id: Number(t.data.card_id),
    }, { esperaMs: opciones.esperaMs ?? 40_000 });

    if (c.estado === 'pagada') resumen.pagados += 1;
    else if (c.estado === 'rechazada') resumen.rechazados += 1;
    else if (c.estado === 'en_3ds') resumen.tresDs += 1;
    else if (c.estado === 'vencida') resumen.vencidos += 1;
    else resumen.inciertos += 1;
  }

  return resumen;
}

// ------------------------------------------------------------ conciliación

export interface ResumenConciliacion {
  revisadas: number;
  pagadas: number;
  rechazadas: number;
  vencidas: number;
  siguen: number;
  inciertas: number;
  deOtroEntorno: number;
  /** Rechazadas de formulario cerradas en Bancard con la reversa. */
  rechazadasCerradas: number;
  tarjetasVerificadas: number;
  tarjetasGuardadas: number;
  tarjetasQuitadas: number;
}

/** Cuánto se guarda el registro de lo hablado con Bancard. */
const DIAS_DE_EVENTOS = 90;

/**
 * LO QUE QUEDÓ A MEDIAS (cada 10 minutos, `orden-conciliar-bancard`).
 *
 * El manual: si no llega la confirmación en 10 minutos, consultar; si no se
 * pagó, el comercio puede mandar la reversa. Acá:
 *   · las vivas del otro entorno se cierran sin llamar a Bancard;
 *   · cada viva de más de 10 minutos se consulta. Pasada su vida (30 minutos
 *     un formulario, 60 un 3D Secure) y sin pago: reversa y cerrada. Un
 *     cobro con tarjeta guardada que quedó incierto se cierra apenas Bancard
 *     dice que no se pagó (nunca se le manda otro cobro encima).
 */
export async function correrConciliacion(d: Deps, limites: { hastaMs: number }): Promise<ResumenConciliacion> {
  const resumen: ResumenConciliacion = {
    revisadas: 0, pagadas: 0, rechazadas: 0, vencidas: 0, siguen: 0, inciertas: 0, deOtroEntorno: 0,
    rechazadasCerradas: 0, tarjetasVerificadas: 0, tarjetasGuardadas: 0, tarjetasQuitadas: 0,
  };
  const hayTiempo = () => Date.now() < limites.hastaMs - 10_000;

  // El registro no crece sin tope (revisión 03/10): lo de más de 90 días se va.
  await llamar(d, 'bancard_purgar_eventos', { p_dias: DIAS_DE_EVENTOS });

  const r = await llamar<Record<string, unknown>>(d, 'bancard_por_conciliar', { p_entorno: d.entorno, p_limite: 10 });
  if (r.ok === false || !esObjeto(r.data)) return resumen;

  const otras = Array.isArray(r.data.de_otro_entorno) ? r.data.de_otro_entorno : [];
  for (const id of otras) {
    const c = await cerrar(d, Number(id), 'vencida', { clave: 'otro_entorno' });
    if (c.ok) resumen.deOtroEntorno += 1;
  }

  // Las rechazadas de formulario de más de 10 minutos: se cierran en Bancard
  // con la reversa (una rechazada no queda pagable para siempre).
  const rechazadas = Array.isArray(r.data.rechazadas) ? r.data.rechazadas : [];
  for (const id of rechazadas) {
    if (!hayTiempo()) break;
    if (await cerrarRechazada(d, Number(id))) resumen.rechazadasCerradas += 1;
  }

  const operaciones = Array.isArray(r.data.operaciones) ? r.data.operaciones : [];
  for (const op of operaciones) {
    if (!hayTiempo()) break;
    if (!esObjeto(op)) continue;
    const vencer = op.vencida === true || (op.medio === 'token' && op.estado !== 'en_3ds');
    const estado = await resolverOperacion(d, Number(op.id), { vencerSiNoPago: vencer, esperaMs: ESPERA_CORTA_MS });
    resumen.revisadas += 1;
    if (estado === 'pagada') resumen.pagadas += 1;
    else if (estado === 'rechazada') resumen.rechazadas += 1;
    else if (estado === 'vencida' || estado === 'revertida' || estado === 'desconocida') resumen.vencidas += 1;
    else if (estado === 'sigue') resumen.siguen += 1;
    else resumen.inciertas += 1;
  }

  // Tarjetas a medio guardar (más de 30 minutos sin verificar): se le
  // pregunta a Bancard si quedó. Si no, `fallida`.
  const pendientes = Array.isArray(r.data.tarjetas_pendientes) ? r.data.tarjetas_pendientes : [];
  for (const p of pendientes) {
    if (!hayTiempo()) break;
    if (!esObjeto(p)) continue;
    const v = await verificarTarjeta(d, { tarjeta: Number(p.tarjeta_id) });
    resumen.tarjetasVerificadas += 1;
    if (v.guardada) resumen.tarjetasGuardadas += 1;
  }

  // Tarjetas que la persona quitó y Bancard todavía no borró.
  const porQuitar = Array.isArray(r.data.tarjetas_por_quitar) ? r.data.tarjetas_por_quitar : [];
  for (const p of porQuitar) {
    if (!hayTiempo()) break;
    if (!esObjeto(p)) continue;
    const hecho = await borrarEnBancard(d, { tarjeta: Number(p.tarjeta_id), userId: Number(p.user_id) });
    if (hecho) resumen.tarjetasQuitadas += 1;
  }

  return resumen;
}

// ------------------------------------------------------- probar conexión

export type PruebaDeConexion = 'bien' | 'claves' | 'bloqueo' | 'red';

/**
 * «PROBAR CONEXIÓN» de /admin: una consulta por un pedido que no existe
 * (el 1). Si Bancard contesta BuyNotFoundError o PaymentNotFoundError, llegó
 * y la firma sirvió. Una página en vez de datos es el bloqueo de su
 * protección (Cloudflare); claves equivocadas dan InvalidTokenError o
 * InvalidPublicKeyError. No se anota como consulta de ninguna operación.
 */
export async function probarConexion(d: Deps): Promise<{ resultado: PruebaDeConexion; http: number; clave: string }> {
  const r = await d.bancard.consultar(1, { esperaMs: 10_000 });
  if (r.ok === true) return { resultado: 'bien', http: 200, clave: 'ok' };
  await anotar(d, { tipo: 'conexion', ok: ['BuyNotFoundError', 'PaymentNotFoundError'].includes(r.clave), clave: r.clave, http: r.http });
  if (r.clave === 'BuyNotFoundError' || r.clave === 'PaymentNotFoundError') return { resultado: 'bien', http: r.http, clave: r.clave };
  if (r.clase === 'no_json') return { resultado: 'bloqueo', http: r.http, clave: r.clave };
  if (r.clase === 'red' || r.clase === 'timeout') return { resultado: 'red', http: r.http, clave: r.clave };
  return { resultado: 'claves', http: r.http, clave: r.clave };
}
