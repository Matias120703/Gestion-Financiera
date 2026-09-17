-- ============================================================
-- ORDEN · Migración 072 · La agenda vista como calendario
--
-- LO QUE PIDIÓ MATÍAS (16/09/2026)
--
--   «Añadir calendario para ver la agenda. El calendario como una opción
--    para ver: una semana, un mes o el rango que quieran, si tienen
--    disponible o no.»
--
-- Hasta acá la agenda se miraba de a un día. Para saber si el jueves que
-- viene hay lugar había que avanzar día por día con la flecha.
--
-- QUÉ DEVUELVE, POR DÍA
--
--   · cuántos turnos hay (sin contar los cancelados);
--   · cuántos minutos atiende el local ese día (la suma de las franjas de
--     cada profesional, o la del día especial si hay una excepción);
--   · cuántos de esos minutos ya están tomados;
--   · y una sola palabra para pintarlo: libre, casi (60% o más ocupado),
--     lleno (90% o más) o cerrado.
--
-- Es la misma regla de horarios que usa `huecos_del_dia` (037): la excepción
-- de la persona gana sobre la del local, y sin excepción manda el horario de
-- siempre. Un calendario que dijera «libre» un feriado sería peor que no
-- tener calendario.
-- ============================================================

create or replace function public.agenda_calendario(
  p_empresa uuid,
  p_desde   date,
  p_hasta   date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona text;
  v_res  jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = '22023';
  end if;

  -- Tres meses alcanzan para cualquier vista y no dejan pedir un año entero.
  if p_hasta - p_desde > 92 then
    raise exception 'Elegí un rango de hasta tres meses.' using errcode = '22023';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas where id = p_empresa;

  with dias as (
    select d::date as fecha from generate_series(p_desde, p_hasta, interval '1 day') d
  ),
  gente as (
    select p.id from public.turnos_profesional p
    where p.empresa_id = p_empresa and p.activo
  ),
  -- Para cada día y persona, la excepción que manda (la suya antes que la del local).
  excepcion as (
    select distinct on (d.fecha, g.id)
      d.fecha, g.id as profesional_id, x.cerrado, x.desde, x.hasta
    from dias d
    cross join gente g
    join public.turnos_excepcion x
      on x.empresa_id = p_empresa and x.fecha = d.fecha
     and (x.profesional_id = g.id or x.profesional_id is null)
    order by d.fecha, g.id, x.profesional_id nulls last
  ),
  abierto as (
    select d.fecha, g.id as profesional_id,
      case
        when e.profesional_id is not null then
          case when e.cerrado then 0 else extract(epoch from (e.hasta - e.desde)) / 60 end
        else coalesce((
          select sum(extract(epoch from (h.hasta - h.desde)) / 60)
          from public.turnos_horario h
          where h.profesional_id = g.id and h.activo
            and h.dia_semana = extract(dow from d.fecha)::smallint
        ), 0)
      end as minutos
    from dias d
    cross join gente g
    left join excepcion e on e.fecha = d.fecha and e.profesional_id = g.id
  ),
  tomado as (
    select (r.inicia at time zone v_zona)::date as fecha,
      count(*)::int as turnos,
      sum(extract(epoch from (r.termina - r.inicia)) / 60) as minutos
    from public.turnos_reserva r
    where r.empresa_id = p_empresa
      and r.estado in ('pendiente', 'confirmada', 'atendida', 'no_vino')
      and r.inicia >= (p_desde::timestamp at time zone v_zona)
      and r.inicia <  ((p_hasta + 1)::timestamp at time zone v_zona)
    group by 1
  ),
  por_dia as (
    select d.fecha,
      coalesce((select sum(a.minutos) from abierto a where a.fecha = d.fecha), 0)::int as abierto_min,
      coalesce(t.minutos, 0)::int as ocupado_min,
      coalesce(t.turnos, 0) as turnos
    from dias d
    left join tomado t on t.fecha = d.fecha
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'fecha', fecha,
    'turnos', turnos,
    'abierto_min', abierto_min,
    'ocupado_min', least(ocupado_min, abierto_min),
    'libre_min', greatest(abierto_min - ocupado_min, 0),
    'estado', case
      when abierto_min = 0 then 'cerrado'
      when ocupado_min >= abierto_min * 0.9 then 'lleno'
      when ocupado_min >= abierto_min * 0.6 then 'casi'
      else 'libre'
    end
  ) order by fecha), '[]'::jsonb) into v_res
  from por_dia;

  return v_res;
end $fn$;

revoke all on function public.agenda_calendario(uuid, date, date) from public, anon;
grant execute on function public.agenda_calendario(uuid, date, date) to authenticated;
