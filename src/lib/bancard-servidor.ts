import { crearBancard, disponibleParaLaCuenta, transporteDe, type ConfigBancard, type EntornoBancard } from './bancard';
import type { BaseBancard, Deps } from './bancard-flujo';
import { clienteDeServicio } from './supabase/servicio';
import type { clienteServidor } from './supabase/servidor';
import { sitio } from './pagos';
import { avisarResultado } from './avisos-bancard';

/**
 * ============================================================
 * BANCARD EN EL SERVIDOR: LAS CLAVES, QUIÉN LO VE, Y LAS PIEZAS ARMADAS
 * ============================================================
 *
 * EL ÚNICO ARCHIVO DEL REPO QUE LEE LAS CLAVES DE BANCARD (lo vigila
 * pruebas/bancard-fuentes.test.js). Las variables viven solo en Vercel:
 *
 *   BANCARD_ENTORNO        'staging' | 'produccion'. Sin ella (o con otro
 *                          valor), Bancard está apagado para todos.
 *   BANCARD_CLAVE_PUBLICA  la del portal (32 letras y números).
 *   BANCARD_CLAVE_PRIVADA  la del portal (40). SECRETA: nunca va a una
 *                          respuesta, a un error, a un registro ni al navegador.
 *   BANCARD_ABIERTO        '1' lo abre a todos los dueños. En staging no
 *                          cuenta nunca: con plata de mentira no se le abre
 *                          el pago a ningún cliente de verdad.
 *   BANCARD_3DS            '0' para no pedir el 3D Secure en el cobro con
 *                          tarjeta guardada (por defecto se pide).
 *   BANCARD_HTTP           '2' para hablar con Bancard por HTTP/2 (si su
 *                          protección bloquea el HTTP/1.1 de Node: «Probar
 *                          conexión» en /admin dice «Bloqueo»). Por defecto,
 *                          el fetch de Node.
 *
 * Nada de esto se importa desde un componente del navegador.
 */

export type MotivoSinBancard = 'sin_entorno' | 'clave_publica' | 'clave_privada';

/** ¿Están las variables, con la forma que dice el manual? Sin mostrar ningún valor. */
export function estadoDeConfiguracion(): { configurado: true; entorno: EntornoBancard } | { configurado: false; motivo: MotivoSinBancard } {
  const entorno = (process.env.BANCARD_ENTORNO ?? '').trim().toLowerCase();
  if (entorno !== 'staging' && entorno !== 'produccion') return { configurado: false, motivo: 'sin_entorno' };
  // Manual, «Autenticación»: «La clave pública será única, y de la forma:
  // [a-zA-Z0-9] {32}»; la privada, de 40.
  if (!/^[a-zA-Z0-9]{32}$/.test((process.env.BANCARD_CLAVE_PUBLICA ?? '').trim())) {
    return { configurado: false, motivo: 'clave_publica' };
  }
  if (!/^[a-zA-Z0-9]{40}$/.test((process.env.BANCARD_CLAVE_PRIVADA ?? '').trim())) {
    return { configurado: false, motivo: 'clave_privada' };
  }
  return { configurado: true, entorno };
}

/** Las claves y el entorno, o null si Bancard no está configurado. */
export function configBancard(): ConfigBancard | null {
  const estado = estadoDeConfiguracion();
  if (!estado.configurado) return null;
  return {
    entorno: estado.entorno,
    clavePublica: (process.env.BANCARD_CLAVE_PUBLICA ?? '').trim(),
    clavePrivada: (process.env.BANCARD_CLAVE_PRIVADA ?? '').trim(),
    con3ds: process.env.BANCARD_3DS !== '0',
  };
}

/** El interruptor general. Se lee solo acá. */
export function abiertoATodos(): boolean {
  return process.env.BANCARD_ABIERTO === '1';
}

export interface AccesoBancard {
  /** ¿Se le muestra el pago con Bancard a esta persona en esta cuenta? */
  disponible: boolean;
  entorno: EntornoBancard | null;
  superadmin: boolean;
  habilitada: boolean;
  admin: boolean;
  abierto: boolean;
}

/**
 * QUIÉN VE BANCARD, decidido en un solo lugar: configurado, la persona
 * administra la cuenta, y además es la administración de Orden, o la cuenta
 * está habilitada desde /admin (la de prueba que se le da al certificador),
 * o está abierto a todos (solo en producción). La regla vive en
 * `disponibleParaLaCuenta` (bancard.ts, probada); acá se juntan los datos.
 *
 * `supabase` es el cliente CON LA SESIÓN de quien mira: `bancard_acceso`
 * comprueba en la base que sea de la cuenta.
 */
export async function accesoBancard(
  supabase: ReturnType<typeof clienteServidor>,
  empresaId: string,
): Promise<AccesoBancard> {
  const config = configBancard();
  const base: AccesoBancard = {
    disponible: false, entorno: config?.entorno ?? null, superadmin: false, habilitada: false, admin: false,
    abierto: abiertoATodos(),
  };
  if (!config || !empresaId) return base;

  try {
    const { data, error } = await supabase.rpc('bancard_acceso', { p_empresa: empresaId });
    if (error || !data || typeof data !== 'object') return base;
    const a = data as { superadmin?: boolean; habilitada?: boolean; admin?: boolean };
    const acceso = { ...base, superadmin: a.superadmin === true, habilitada: a.habilitada === true, admin: a.admin === true };
    return {
      ...acceso,
      disponible: disponibleParaLaCuenta({
        configurado: true,
        entorno: config.entorno,
        abierto: acceso.abierto,
        superadmin: acceso.superadmin,
        habilitada: acceso.habilitada,
        admin: acceso.admin,
      }),
    };
  } catch {
    return base;
  }
}

/** El cliente de servicio, reducido a lo único que usa Bancard: llamar funciones, nunca tablas. */
function baseSobre(servicio: ReturnType<typeof clienteDeServicio>): BaseBancard {
  return {
    async rpc(nombre, args) {
      const { data, error } = await servicio.rpc(nombre, args);
      return { data, error: error ? { message: error.message, code: error.code } : null };
    },
  };
}

/**
 * La base sola, sin Bancard: para lo único que tiene que andar con Bancard
 * apagado, deshacer una baja de personas programada
 * (`/api/pagos/bancard/personas`). Como `dependencias()`, se arma DESPUÉS
 * de validar la sesión y el acceso con el cliente del usuario.
 */
export function baseDeServicio(): BaseBancard {
  return baseSobre(clienteDeServicio());
}

/**
 * Las piezas de `bancard-flujo.ts`, armadas de verdad: la base con la clave
 * de servicio (solo funciones `bancard_*`, nunca tablas), Bancard con
 * `fetch`, el sitio y los avisos. Null si Bancard no está configurado.
 */
export function dependencias(): Deps | null {
  const config = configBancard();
  if (!config) return null;
  const servicio = clienteDeServicio();
  return {
    bd: baseSobre(servicio),
    bancard: crearBancard(config, transporteDe(process.env.BANCARD_HTTP)),
    entorno: config.entorno,
    clavePrivada: config.clavePrivada,
    sitio: sitio(),
    avisar: (resultado) => avisarResultado(servicio, resultado),
    // Solo tipo, número de pedido y clave de error: nada secreto.
    registrar: (texto) => console.error('[bancard]', texto),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La cuenta de un pedido con sesión: la que manda la pantalla (si es un uuid),
 * o la activa de la cookie, o la primera que la persona administra. Nunca se
 * confía sin comprobar: después la mira `bancard_acceso` y otra vez cada
 * función de la base con `p_usuario`.
 */
export async function empresaDelPedido(
  supabase: ReturnType<typeof clienteServidor>,
  userId: string,
  pedida: unknown,
  cookieEmpresa: string | undefined,
): Promise<string | null> {
  if (typeof pedida === 'string' && UUID.test(pedida)) return pedida;
  if (cookieEmpresa && UUID.test(cookieEmpresa)) return cookieEmpresa;
  const { data } = await supabase
    .from('miembros')
    .select('empresa_id')
    .eq('user_id', userId)
    .in('rol', ['propietario', 'admin'])
    .order('created_at', { ascending: true })
    .limit(1);
  const id = (data as { empresa_id?: string }[] | null)?.[0]?.empresa_id;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

/** Lo que el navegador manda para pagar: QUÉ se paga, nunca cuánto. */
export interface PedidoLeido {
  tipo: 'plan' | 'personas';
  plan: string | null;
  periodo: string | null;
  personas: number | null;
}

/**
 * Qué se quiere pagar, con los tipos y rangos comprobados. Null si no cierra.
 * Lo usan el pago con el formulario y el cobro con la tarjeta guardada; la
 * base lo vuelve a validar (que el plan lleve personas, que no sean menos que
 * el equipo de hoy) y calcula el importe.
 */
export function leerPedidoDePago(c: Record<string, unknown>): PedidoLeido | null {
  const tipo = c.tipo === 'personas' ? 'personas' : c.tipo === 'plan' || c.tipo === undefined ? 'plan' : null;
  if (!tipo) return null;

  const personas = c.personas === null || c.personas === undefined ? null : c.personas;
  if (personas !== null && !(typeof personas === 'number' && Number.isInteger(personas) && personas >= 1 && personas <= 200)) {
    return null;
  }

  if (tipo === 'personas') {
    // Sumar personas a un Premium vigente: el plan y el período son los que
    // ya tiene la cuenta (los pone la base).
    return personas === null ? null : { tipo, plan: null, periodo: null, personas };
  }

  const plan = c.plan;
  if (plan !== 'basico' && plan !== 'pro' && plan !== 'negocio') return null;
  const periodo = c.periodo === 'anual' ? 'anual' : c.periodo === 'mensual' || c.periodo === undefined ? 'mensual' : null;
  if (!periodo) return null;
  return { tipo, plan, periodo, personas };
}

/** Un error de la base, al código HTTP que le corresponde. */
export function httpDeErrorDeBase(codigo: string): 400 | 403 | 404 | 503 {
  if (codigo === '42501') return 403;
  if (codigo === 'P0002') return 404;
  if (codigo.startsWith('22') || codigo === 'P0001') return 400;
  return 503;
}
