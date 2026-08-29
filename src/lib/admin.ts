import { clienteServidor } from './supabase/servidor';
import { exigir } from './lectura';
import type { CuentaAdmin, FinanzasOrden, ResumenPanel } from './tipos';

/**
 * Lecturas del panel del dueño del sistema.
 *
 * Ninguna de estas funciones devuelve plata de nadie. No es una casualidad
 * ni una omisión: las funciones de PostgreSQL que hay detrás no la devuelven,
 * y hay una prueba que falla si alguien agrega un campo que la filtre. Ver
 * la migración 016 y `pruebas/panel.test.js`.
 */

/** ¿Este usuario administra Orden? Falso ante cualquier duda. */
export async function esSuperadmin(): Promise<boolean> {
  const supabase = clienteServidor();
  const { data, error } = await supabase.rpc('es_superadmin');
  // Acá sí se traga el error a propósito, al revés que en las lecturas
  // financieras: si no se puede comprobar, la respuesta segura es "no".
  // Mostrar el panel por las dudas sería lo contrario de seguro.
  if (error) return false;
  return data === true;
}

export async function traerCuentas(busqueda?: string, estado?: string): Promise<CuentaAdmin[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('listar_cuentas', {
    p_busqueda: busqueda ?? null,
    p_estado: estado ?? null,
    p_limite: 200,
  });
  const lista = exigir(respuesta, 'cuentas') as CuentaAdmin[];
  return Array.isArray(lista) ? lista : [];
}

export async function traerResumenPanel(): Promise<ResumenPanel> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('resumen_panel');
  return exigir(respuesta, 'resumen del panel') as ResumenPanel;
}

/**
 * Las finanzas de Orden mismo.
 *
 * Se traga el error a propósito, igual que `esSuperadmin()`: si esto falla,
 * el panel tiene que seguir mostrando las cuentas —que es para lo que se
 * entra— en vez de romperse entero por un resumen que es un extra.
 */
export async function traerFinanzasOrden(): Promise<FinanzasOrden> {
  const supabase = clienteServidor();
  const { data, error } = await supabase.rpc('finanzas_orden');
  if (error || !data) return { configurada: false };
  return data as FinanzasOrden;
}

/** Las empresas propias, para poder elegir cuál representa a Orden. */
export async function traerMisEmpresas(): Promise<{ id: string; nombre: string }[]> {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('miembros')
    .select('rol, empresas(id, nombre)')
    .eq('user_id', user.id)
    .in('rol', ['propietario', 'admin']);

  return (data ?? [])
    .map((m: any) => m.empresas)
    .filter(Boolean)
    .map((e: any) => ({ id: String(e.id), nombre: String(e.nombre) }));
}
