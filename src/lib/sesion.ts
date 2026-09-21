import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type {
  DatosEmpresa, Empresa, EstadoDelPlan, LimitesPlan, Miembro, PlanEfectivo,
} from './tipos';
import { COOKIE_EMPRESA } from './constantes';
import { idiomaActual } from '@/i18n';
import type { Idioma } from '@/i18n/idiomas';
import { sinConvertir, type Vista } from './formato';

export { COOKIE_EMPRESA };

/**
 * En qué moneda mira sus números este negocio.
 *
 * El factor es 1/cotización porque la cotización se guarda como la dice la
 * persona —«el dólar está a 7.300»— y para pasar un guaraní a dólares hay
 * que dividir.
 *
 * Se defiende de una cotización rota (cero, negativa, no numérica) volviendo
 * a la moneda propia en vez de mostrar infinitos. La base ya no deja
 * guardarla así, pero esto lee una fila que puede venir de cualquier lado, y
 * un número financiero roto tiene que degradar a la verdad conocida y no a
 * un símbolo raro.
 */
export function vistaDeEmpresa(empresa: Empresa): Vista {
  const cot = Number(empresa.cotizacion);
  if (!empresa.moneda_vista
      || empresa.moneda_vista === empresa.moneda
      || !Number.isFinite(cot) || cot <= 0) {
    return sinConvertir(empresa.moneda);
  }
  return {
    moneda: empresa.moneda_vista,
    factor: 1 / cot,
    propia: empresa.moneda,
    cotizacion: cot,
    desde: empresa.cotizacion_at,
  };
}

export interface Contexto {
  userId: string;
  email: string;
  empresa: Empresa;
  /**
   * En qué moneda MIRAR los números, con la conversión adentro (051).
   *
   * Se le pasa a las pantallas en lugar de `empresa.moneda`, y así el
   * símbolo y el factor no se pueden separar. Donde se ESCRIBE un importe va
   * `empresa.moneda` a secas: un formulario en dólares que guarda el número
   * tal cual estaría guardando dólares como guaraníes.
   */
  vista: Vista;
  /**
   * Si esta persona administra ORDEN (no su negocio). Ver migración 016.
   *
   * Sirve para UNA sola cosa: decidir si el menú muestra el enlace al panel
   * de administración. No habilita nada — cada función del panel exige
   * `es_superadmin()` en PostgreSQL y rechaza a cualquier otro aunque
   * llame directo a la API sin pasar por ninguna pantalla.
   */
  administraOrden: boolean;
  miembro: Miembro;
  esAdmin: boolean;
  empresas: { empresa: Empresa; rol: Miembro['rol'] }[];
  /**
   * Plan real, calculado por la base con plan_efectivo(): mira el estado y el
   * periodo, no solo el nombre del plan. Es lo único que se puede usar para
   * habilitar funciones. NUNCA usar empresa.plan.
   */
  planEfectivo: PlanEfectivo;
  /** Qué habilita ese plan. También lo decide la base. */
  limites: LimitesPlan;
  /** Estado del cobro: prueba, días que faltan, si canceló. */
  suscripcion: EstadoDelPlan;
  capturasIA: { usados: number; tope: number };
  /** Solo llega con valor si es propietario o administrador. */
  codigoAcceso: string | null;
  zonaHoraria: string;
  idioma: Idioma;
}

/**
 * Devuelve el usuario y su empresa activa.
 * Si no hay sesión → /ingresar. Si no tiene empresa → /empezar.
 */
export async function contextoObligatorio(): Promise<Contexto> {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/ingresar');

  const consultaMiembros = await supabase
    .from('miembros')
    .select('*, empresas(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const miembros = exigir(consultaMiembros, 'empresas del usuario');
  const lista = (miembros as any[]).filter((m: any) => m.empresas) as (Miembro & { empresas: Empresa })[];
  if (lista.length === 0) redirect('/empezar');

  const preferida = (await cookies()).get(COOKIE_EMPRESA)?.value;
  const elegido = lista.find((m) => m.empresa_id === preferida) ?? lista[0];

  // Una sola llamada trae plan, límites, uso y, si corresponde, el código de
  // acceso. Si falla, lanzamos: mostrar "plan gratis" porque no se pudo leer
  // sería inventar información. La pantalla de error ofrece reintentar.
  const respuesta = await supabase.rpc('datos_empresa', { p_empresa: elegido.empresa_id });
  const info = exigir(respuesta, 'datos de la empresa') as DatosEmpresa;

  /**
   * ¿Administra Orden? Solo para decidir si el menú muestra ese enlace.
   *
   * El error se traga a propósito, al revés que las lecturas financieras: si
   * no se pudo comprobar, la respuesta segura es «no». Esconder un enlace de
   * más no rompe nada; mostrarlo por las dudas sería lo contrario de seguro.
   *
   * Va aparte y no dentro de `datos_empresa` porque no es un dato de la
   * empresa: es un rol que está POR ENCIMA de todas, y mezclarlo haría que
   * un error en los permisos de un negocio pudiera, en el peor caso, dar
   * permisos de sistema. La 016 separa las dos cosas por esa misma razón.
   */
  const { data: esSuper } = await supabase.rpc('es_superadmin');
  const superadmin = esSuper === true;

  return {
    userId: user.id,
    email: user.email ?? '',
    empresa: elegido.empresas,
    vista: vistaDeEmpresa(elegido.empresas),
    administraOrden: superadmin,
    miembro: elegido,
    esAdmin: elegido.rol === 'propietario' || elegido.rol === 'admin',
    empresas: lista.map((m) => ({ empresa: m.empresas, rol: m.rol })),
    planEfectivo: info.plan_efectivo ?? 'gratis',
    limites: info.limites,
    suscripcion: info.suscripcion,
    capturasIA: info.uso_ia ?? { usados: 0, tope: 0 },
    codigoAcceso: info.codigo_acceso ?? null,
    zonaHoraria: info.zona_horaria ?? 'America/Asuncion',
    idioma: (await idiomaActual()),
  };
}
