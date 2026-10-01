-- ============================================================
-- 119 · EL CALENDARIO QUE SE ENTIENDE
-- ============================================================
--
-- LO QUE PASÓ (Matías, 01/10/2026, cuenta de «Clases y cursos»)
--
--   Agendó clases y el calendario de la Agenda le mostró todos los días en
--   gris, «Cerrado», con «2 turnos · 0 días con lugar». «No entiendo por qué
--   aparece gris, cerrado. Quiero ver el mes y decir: acá tengo casi lleno,
--   acá tengo libre.»
--
-- POR QUÉ
--
--   `agenda_calendario` (072) mide el lugar contra el horario de atención
--   (`turnos_horario`). Sin horario, `abierto_min` es 0 y el día salía
--   «cerrado». A un profe la pantalla ni siquiera le ofrecía cargar un
--   horario (089/090), así que su calendario estaba gris para siempre. Y una
--   clase en grupo (108) contaba los minutos de cada alumno por separado:
--   tres alumnos de 18 a 19 eran tres horas ocupadas, y el día salía «lleno»
--   con dos horas libres.
--
-- QUÉ CAMBIA
--
--   1. agenda_calendario: COPIA EXACTA de la 072 con estos cambios.
--      · «Cerrado» queda para lo que de verdad está cerrado: un feriado (el
--        local cierra), unas vacaciones cuando no atiende NADIE (todas las
--        personas activas con su excepción cerrada) o un día que no trabaja
--        teniendo horario cargado. Las vacaciones de una sola persona no
--        cierran la cuenta: otro puede tener turnos ese día.
--      · Estado nuevo 'sin_horario': no hay con qué medir el lugar (la cuenta
--        no cargó ningún horario, o ese día nadie tiene horario y hay turnos).
--        La pantalla lo pinta por cantidad y no inventa «libre» ni «cerrado».
--      · Lo ocupado es la UNIÓN de los horarios de cada profesional: una clase
--        en grupo ocupa su hora una sola vez. Lo de profesionales distintos se
--        sigue sumando, como antes.
--      · Y se mide ADENTRO del horario de cada uno ese día (su excepción, la
--        del local o su horario de la semana, la misma regla que el lugar
--        abierto). Una clase a la mañana de un profe que atiende de 18 a 21
--        no le quita la tarde, y los turnos de alguien de vacaciones o sin
--        horario no llenan el horario de otro.
--      · Claves nuevas por día: 'franjas' (horarios distintos: las clases de
--        un profe, aunque vayan tres alumnos), 'fuera' (las franjas que no
--        caen enteras en el horario de su profesional: la pantalla las marca
--        con un punto, sin contarlas en el lugar), 'con_horario' (si la
--        cuenta cargó algún horario) y 'motivo' (el del feriado o las
--        vacaciones). Las claves de la 072 siguen iguales, con la misma firma
--        y los mismos permisos: nada que las lea se rompe.
--
--   2. mi_profesional (nueva): el profe que todavía no inscribió a nadie no
--      tiene fila en `turnos_profesional`, y `guardar_horario` la exige. Esta
--      la da (o la crea con la misma regla de `profe_y_clase`, que no se
--      puede llamar desde afuera). Solo en una cuenta de clases o de
--      entrenamiento: una barbería arma su equipo en Equipo y reparto.
--
-- QUÉ NO CAMBIA
--
--   · huecos_del_dia, agenda_del_dia, inscribir_alumno ni la puerta pública.
--     El horario del profe es opcional y solo lo lee el calendario: no prende
--     ningún link público (089 sigue igual).
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
  v_con_horario boolean;
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

  -- (119) Sin ningún horario cargado no hay contra qué medir el lugar.
  v_con_horario := exists (
    select 1 from public.turnos_horario h
    join public.turnos_profesional p on p.id = h.profesional_id
    where p.empresa_id = p_empresa and p.activo and h.activo
  );

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
  -- (119) Las horas en que atiende cada persona cada día, con la misma regla
  -- que `abierto`: su excepción (o la del local) manda sobre su horario de la
  -- semana. Lo ocupado se mide adentro de esto.
  ventanas as (
    select e.fecha, e.profesional_id,
      range_agg(tstzrange((e.fecha + e.desde) at time zone v_zona, (e.fecha + e.hasta) at time zone v_zona)) as abiertas
    from excepcion e
    where not e.cerrado
    group by 1, 2
    union all
    select d.fecha, g.id,
      range_agg(tstzrange((d.fecha + h.desde) at time zone v_zona, (d.fecha + h.hasta) at time zone v_zona))
    from dias d
    cross join gente g
    join public.turnos_horario h
      on h.profesional_id = g.id and h.activo
     and h.dia_semana = extract(dow from d.fecha)::smallint
    where not exists (select 1 from excepcion e where e.fecha = d.fecha and e.profesional_id = g.id)
    group by 1, 2
  ),
  -- (119) El feriado o las vacaciones de ese día: el local cerrado, o nadie
  -- que atienda (cada persona activa con su excepción cerrada, según
  -- `excepcion`). Las vacaciones de uno solo no cierran la cuenta.
  cierre as (
    select c.fecha, c.motivo
    from (
      select distinct on (x.fecha) x.fecha, x.motivo, x.profesional_id
      from public.turnos_excepcion x
      where x.empresa_id = p_empresa and x.cerrado
        and x.fecha between p_desde and p_hasta
        and (x.profesional_id is null or x.profesional_id in (select id from gente))
      order by x.fecha, x.profesional_id nulls first, (x.motivo = '')
    ) c
    where c.profesional_id is null
       or not exists (
         select 1 from gente g
         where not exists (
           select 1 from excepcion e
           where e.fecha = c.fecha and e.profesional_id = g.id and e.cerrado
         )
       )
  ),
  reservas as (
    select (r.inicia at time zone v_zona)::date as fecha, r.profesional_id, r.inicia, r.termina
    from public.turnos_reserva r
    where r.empresa_id = p_empresa
      and r.estado in ('pendiente', 'confirmada', 'atendida', 'no_vino')
      and r.inicia >= (p_desde::timestamp at time zone v_zona)
      and r.inicia <  ((p_hasta + 1)::timestamp at time zone v_zona)
  ),
  -- (119) Lo ocupado de cada profesional es la UNIÓN de sus horarios: tres
  -- alumnos de 18 a 19 en la misma clase (108) ocupan una hora, no tres. Y
  -- solo la parte que cae en SU horario de ese día (`ventanas`): lo de afuera
  -- no le quita lugar a nadie.
  ocupado as (
    select u.fecha, sum(extract(epoch from (upper(x.r) - lower(x.r))) / 60) as minutos
    from (
      select fecha, profesional_id, range_agg(tstzrange(inicia, termina)) as rangos
      from reservas group by 1, 2
    ) u
    join ventanas v on v.fecha = u.fecha and v.profesional_id = u.profesional_id
    cross join lateral unnest(u.rangos * v.abiertas) as x(r)
    group by u.fecha
  ),
  tomado as (
    select r.fecha,
      count(*)::int as turnos,
      count(distinct (r.profesional_id, r.inicia, r.termina))::int as franjas,
      -- (119) Las franjas que no caen enteras en el horario de su profesional.
      (count(distinct (r.profesional_id, r.inicia, r.termina))
        filter (where v.abiertas is null or not v.abiertas @> tstzrange(r.inicia, r.termina)))::int as fuera
    from reservas r
    left join ventanas v on v.fecha = r.fecha and v.profesional_id = r.profesional_id
    group by 1
  ),
  por_dia as (
    select d.fecha,
      coalesce((select sum(a.minutos) from abierto a where a.fecha = d.fecha), 0)::int as abierto_min,
      coalesce(o.minutos, 0)::int as ocupado_min,
      coalesce(t.turnos, 0) as turnos,
      coalesce(t.franjas, 0) as franjas,
      coalesce(t.fuera, 0) as fuera,
      c.fecha is not null as con_cierre,
      nullif(c.motivo, '') as motivo
    from dias d
    left join tomado t on t.fecha = d.fecha
    left join ocupado o on o.fecha = d.fecha
    left join cierre c on c.fecha = d.fecha
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'fecha', fecha,
    'turnos', turnos,
    'franjas', franjas,
    'fuera', fuera,
    'abierto_min', abierto_min,
    'ocupado_min', least(ocupado_min, abierto_min),
    'libre_min', greatest(abierto_min - ocupado_min, 0),
    'con_horario', v_con_horario,
    'motivo', case when abierto_min = 0 and con_cierre then motivo end,
    'estado', case
      when abierto_min = 0 and con_cierre then 'cerrado'
      when abierto_min = 0 and (not v_con_horario or turnos > 0) then 'sin_horario'
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

-- ------------------------------------------------------------
-- EL PROFE QUE CARGA SU HORARIO
--
-- `guardar_horario` pide un profesional. El profe que recién empieza no lo
-- tiene: lo crea `profe_y_clase` en la primera inscripción. Esta función lo
-- da (o lo crea con esa misma regla) para que pueda cargar su horario antes
-- de inscribir a nadie. Los permisos de cada horario siguen siendo los de
-- `guardar_horario` (`puede_agendar`).
-- ------------------------------------------------------------
create or replace function public.mi_profesional(p_empresa uuid)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_rubro text;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select rubro into v_rubro from public.empresas where id = p_empresa;
  if not public.rubro_de_alumnos(v_rubro) then
    raise exception 'Esto es para la agenda de un profe: el equipo se arma en Equipo y reparto.' using errcode = '42501';
  end if;

  return (public.profe_y_clase(p_empresa) ->> 'profesional')::uuid;
end $fn$;

revoke all on function public.mi_profesional(uuid) from public, anon;
grant execute on function public.mi_profesional(uuid) to authenticated;
