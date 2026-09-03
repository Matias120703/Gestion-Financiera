import { clienteServidor } from './supabase/servidor';
import { exigir, exigirLista } from './lectura';
import type { LinkPublico, TurnoDelDia, HorarioSemanal, ServicioAgenda, Excepcion } from './tipos';

/** Lecturas de la agenda de turnos. */

/** El link público del negocio. Null si todavía no se creó. */
export async function traerLinkPublico(empresaId: string): Promise<LinkPublico | null> {
  const supabase = clienteServidor();
  const { data, error } = await supabase
    .from('turnos_publico')
    .select('slug, activo, titulo, mensaje, direccion')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as LinkPublico | null;
}

/** Los turnos de un día, en orden. */
export async function traerAgendaDelDia(empresaId: string, fecha?: string): Promise<TurnoDelDia[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase.rpc('agenda_del_dia', {
    p_empresa: empresaId,
    p_fecha: fecha ?? null,
  });
  const lista = exigir(respuesta, 'la agenda del día');
  return Array.isArray(lista) ? (lista as TurnoDelDia[]) : [];
}

/** El horario semanal de todo el equipo. */
export async function traerHorarios(empresaId: string): Promise<HorarioSemanal[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase
    .from('turnos_horario')
    .select('id, profesional_id, dia_semana, desde, hasta, activo')
    .eq('empresa_id', empresaId)
    .order('dia_semana')
    .order('desde');
  return exigirLista<HorarioSemanal>(respuesta, 'los horarios');
}

/**
 * Los feriados, vacaciones y horarios especiales de hoy en adelante.
 *
 * Los de antes de hoy no se traen: ya no cambian nada y una lista que
 * arrastra todos los feriados del año pasado no se lee.
 */
export async function traerExcepciones(empresaId: string, desde: string): Promise<Excepcion[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase
    .from('turnos_excepcion')
    .select('id, profesional_id, fecha, cerrado, desde, hasta, motivo')
    .eq('empresa_id', empresaId)
    .gte('fecha', desde)
    .order('fecha');
  return exigirLista<Excepcion>(respuesta, 'los feriados y días libres');
}

/** Qué servicios se pueden reservar y cuánto duran. */
export async function traerServiciosAgenda(empresaId: string): Promise<ServicioAgenda[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase
    .from('turnos_servicio')
    .select('producto_id, duracion_min, reservable')
    .eq('empresa_id', empresaId);
  return exigirLista<ServicioAgenda>(respuesta, 'los servicios de la agenda');
}
