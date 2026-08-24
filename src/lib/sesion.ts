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

export { COOKIE_EMPRESA };

export interface Contexto {
  userId: string;
  email: string;
  empresa: Empresa;
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

  const preferida = cookies().get(COOKIE_EMPRESA)?.value;
  const elegido = lista.find((m) => m.empresa_id === preferida) ?? lista[0];

  // Una sola llamada trae plan, límites, uso y, si corresponde, el código de
  // acceso. Si falla, lanzamos: mostrar "plan gratis" porque no se pudo leer
  // sería inventar información. La pantalla de error ofrece reintentar.
  const respuesta = await supabase.rpc('datos_empresa', { p_empresa: elegido.empresa_id });
  const info = exigir(respuesta, 'datos de la empresa') as DatosEmpresa;

  return {
    userId: user.id,
    email: user.email ?? '',
    empresa: elegido.empresas,
    miembro: elegido,
    esAdmin: elegido.rol === 'propietario' || elegido.rol === 'admin',
    empresas: lista.map((m) => ({ empresa: m.empresas, rol: m.rol })),
    planEfectivo: info.plan_efectivo ?? 'gratis',
    limites: info.limites,
    suscripcion: info.suscripcion,
    capturasIA: info.uso_ia ?? { usados: 0, tope: 0 },
    codigoAcceso: info.codigo_acceso ?? null,
    zonaHoraria: info.zona_horaria ?? 'America/Asuncion',
    idioma: idiomaActual(),
  };
}
