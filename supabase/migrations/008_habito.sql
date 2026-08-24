-- ============================================================
-- ORDEN · Migración 008 · El hábito (cierre del día y racha)
--
-- Las notificaciones no crean la costumbre: traen de vuelta a quien ya la
-- tenía. Lo que la crea es un ritual corto que cierra el día y algo que se
-- pierde si se falta. Eso es lo que agrega esta migración.
--
--   · CIERRE DEL DÍA — una lectura de diez segundos: cuánto entró, cuánto
--     salió, cuánto quedó, y contra qué se compara. Todo calculado en la
--     base, reusando resumen_financiero() para no tener dos definiciones
--     distintas de "ganancia" en el sistema.
--
--   · RACHA — días seguidos con al menos un movimiento cargado. La racha
--     NO se rompe porque hoy todavía no cargaste: se rompe cuando el día
--     termina vacío. Por eso se cuenta hasta ayer y hoy marca "en riesgo".
--     Un contador que te castiga a las 8 de la mañana no motiva a nadie.
--
-- Y de paso: ZONA HORARIA POR EMPRESA. Hasta acá "hoy" era siempre
-- America/Asuncion, clavado. Si Orden sale de Paraguay, un cierre del día
-- calculado en la zona equivocada le muestra a la persona el día de otro.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ZONA HORARIA POR EMPRESA
--
--    El check contra pg_timezone_names evita guardar una zona inventada,
--    que después haría fallar el `at time zone` de todas las lecturas.
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists zona_horaria text not null default 'America/Asuncion';

do $$ begin
  alter table public.empresas add constraint empresas_zona_valida
    check (zona_horaria in (select name from pg_timezone_names));
exception when duplicate_object then null;
          when others then null;  -- si el catálogo no está disponible, no bloquea la migración
end $$;

comment on column public.empresas.zona_horaria is
  'Zona en la que se decide qué día es "hoy" para este negocio. El cierre del día y la racha dependen de esto.';

create or replace function public.hoy_empresa(p_empresa uuid)
returns date language sql stable security definer set search_path = public as $fn$
  select (now() at time zone coalesce(
    (select e.zona_horaria from public.empresas e where e.id = p_empresa),
    'America/Asuncion'
  ))::date;
$fn$;

-- ------------------------------------------------------------
-- 2. CIERRES · el gesto de cerrar el día
--
--    Guardamos que la persona MIRÓ el cierre, no un total. Los totales se
--    recalculan siempre: si mañana se anula una venta de hoy, el cierre de
--    hoy tiene que reflejarlo. Una foto congelada mentiría.
--
--    Es por usuario y no por empresa: en un negocio con tres vendedores,
--    que uno haya mirado el cierre no significa que los otros lo vieron.
-- ------------------------------------------------------------
create table if not exists public.cierres (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  fecha      date not null,
  visto_at   timestamptz not null default now(),
  unique (empresa_id, user_id, fecha)
);

create index if not exists cierres_empresa_fecha_idx on public.cierres (empresa_id, fecha desc);

alter table public.cierres enable row level security;

drop policy if exists cierres_select on public.cierres;
create policy cierres_select on public.cierres
  for select to authenticated
  using (user_id = auth.uid() and public.es_miembro(empresa_id));

revoke all on public.cierres from anon, authenticated;
grant select on public.cierres to authenticated;

create or replace function public.marcar_cierre(p_empresa uuid, p_fecha date default null)
returns date language plpgsql security definer set search_path = public as $fn$
declare v_fecha date;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  -- Un cierre del futuro no existe. Uno muy viejo tampoco sirve de nada.
  if v_fecha > public.hoy_empresa(p_empresa) then
    raise exception 'No se puede cerrar un día que todavía no pasó.' using errcode = '22007';
  end if;

  insert into public.cierres (empresa_id, user_id, fecha)
  values (p_empresa, auth.uid(), v_fecha)
  on conflict (empresa_id, user_id, fecha) do update set visto_at = now();

  return v_fecha;
end $fn$;

-- ------------------------------------------------------------
-- 3. RACHA · días seguidos cargando
--
--    Islas y huecos: a cada día con actividad le restamos su número de
--    orden. Los días consecutivos dan todos el mismo resultado, así que
--    agrupar por ese valor separa las rachas sin recorrer nada dos veces.
--
--    `dias` cuenta la racha vigente; `en_riesgo` es true cuando la racha
--    viene de ayer y hoy todavía está vacío. Ese es el único momento en
--    que tiene sentido empujar con un aviso.
-- ------------------------------------------------------------
create or replace function public.racha_empresa(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_hoy   date;
  v_ayer  date;
  v_res   jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_hoy  := public.hoy_empresa(p_empresa);
  v_ayer := v_hoy - 1;

  with dias as (
    select distinct m.fecha
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.estado = 'activo'
      and m.fecha <= v_hoy
  ),
  numeradas as (
    select fecha, (fecha - (row_number() over (order by fecha))::int) as isla
    from dias
  ),
  rachas as (
    select isla, count(*)::int as largo, min(fecha) as desde, max(fecha) as hasta
    from numeradas group by isla
  ),
  vigente as (
    select * from rachas where hasta in (v_hoy, v_ayer) order by hasta desc limit 1
  )
  select jsonb_build_object(
    'hoy',           v_hoy,
    'dias',          coalesce((select largo from vigente), 0),
    'desde',         (select desde from vigente),
    'hoy_cargado',   exists (select 1 from dias where fecha = v_hoy),
    -- Solo está en riesgo si HAY algo que perder.
    'en_riesgo',     coalesce((select hasta from vigente), v_ayer - 1) = v_ayer,
    'mejor',         coalesce((select max(largo) from rachas), 0),
    'dias_activos',  (select count(*)::int from dias)
  ) into v_res;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 4. CIERRE DEL DÍA
--
--    Reusa resumen_financiero() tres veces: el día, el mismo día de la
--    semana pasada, y los siete días previos. No reimplementa ni una suma,
--    así que "ganancia neta" quiere decir exactamente lo mismo acá que en
--    el panel y que en el Excel. Los permisos también viajan solos: si
--    quien pregunta es vendedor, la ganancia ya llega en null desde
--    adentro y no hay que acordarse de taparla acá.
-- ------------------------------------------------------------
create or replace function public.cierre_del_dia(p_empresa uuid, p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_fecha    date;
  v_previo   date;
  v_hoy_r    jsonb;
  v_prev_r   jsonb;
  v_sem_r    jsonb;
  v_top      jsonb;
  v_res      jsonb;
  v_admin    boolean;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_fecha  := coalesce(p_fecha, public.hoy_empresa(p_empresa));
  v_previo := v_fecha - 7;
  v_admin  := public.es_admin(p_empresa);

  v_hoy_r  := public.resumen_financiero(p_empresa, v_fecha, v_fecha);
  v_prev_r := public.resumen_financiero(p_empresa, v_previo, v_previo);
  -- Los siete días ANTERIORES, sin incluir el que se está cerrando: si lo
  -- incluyéramos, el día se estaría comparando en parte contra sí mismo.
  v_sem_r  := public.resumen_financiero(p_empresa, v_fecha - 7, v_fecha - 1);

  select jsonb_build_object('nombre', r->>'nombre', 'unidades', r->'unidades', 'ingresos', r->'ingresos')
  into v_top
  from jsonb_array_elements(
    coalesce(public.ranking_productos(p_empresa, v_fecha, v_fecha, 1), '[]'::jsonb)
  ) as r
  limit 1;

  select jsonb_build_object(
    'fecha',              v_fecha,
    'es_hoy',             v_fecha = public.hoy_empresa(p_empresa),
    'hubo_actividad',     coalesce((v_hoy_r->>'cantidad_ventas')::numeric, 0) > 0
                          or coalesce((v_hoy_r->>'gastos')::numeric, 0) > 0
                          or coalesce((v_hoy_r->>'otros_ingresos')::numeric, 0) > 0,
    'resumen',            v_hoy_r,
    'misma_dia_semana_pasada', v_prev_r,
    -- Promedio diario de la semana previa, para decir "hoy vendiste más que
    -- un día normal tuyo" sin que un lunes flojo arruine la comparación.
    'promedio_semana',    jsonb_build_object(
                            'ventas',  round(coalesce((v_sem_r->>'ventas')::numeric, 0) / 7, 2),
                            'gastos',  round(coalesce((v_sem_r->>'gastos')::numeric, 0) / 7, 2),
                            'ganancia_neta', case when v_admin
                              then round(coalesce((v_sem_r->>'ganancia_neta')::numeric, 0) / 7, 2)
                              else null end
                          ),
    'producto_estrella',  v_top,
    'racha',              public.racha_empresa(p_empresa),
    'ya_cerrado',         exists (
                            select 1 from public.cierres c
                            where c.empresa_id = p_empresa
                              and c.user_id = auth.uid()
                              and c.fecha = v_fecha
                          )
  ) into v_res;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 5. NEGOCIOS QUE HOY NO CARGARON NADA
--
--    La usa la tarea programada que manda el aviso de la noche. Devuelve
--    solo lo necesario para armar el mensaje, y solo de quien tiene una
--    racha viva que perder: avisarle a alguien que hace tres semanas no
--    entra no es un recordatorio, es spam.
--
--    Es para service_role: corre sin sesión de usuario, desde el cron.
-- ------------------------------------------------------------
create or replace function public.empresas_sin_cargar_hoy(p_racha_minima integer default 2)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id', e.id,
      'nombre',     e.nombre,
      'zona',       e.zona_horaria,
      'racha',      r.largo
    ) as x
    from public.empresas e
    join lateral (
      with dias as (
        select distinct m.fecha from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo'
          and m.fecha <= (now() at time zone e.zona_horaria)::date
      ),
      numeradas as (
        select fecha, (fecha - (row_number() over (order by fecha))::int) as isla from dias
      ),
      rachas as (
        select count(*)::int as largo, max(fecha) as hasta from numeradas group by isla
      )
      select largo, hasta from rachas order by hasta desc limit 1
    ) r on true
    where r.hasta = (now() at time zone e.zona_horaria)::date - 1
      and r.largo >= greatest(p_racha_minima, 1)
  ) s;

  return v_res;
end $fn$;

revoke all on function public.marcar_cierre(uuid, date)      from public, anon;
revoke all on function public.racha_empresa(uuid)            from public, anon;
revoke all on function public.cierre_del_dia(uuid, date)     from public, anon;
revoke all on function public.hoy_empresa(uuid)              from public, anon;
revoke all on function public.empresas_sin_cargar_hoy(integer) from public, anon, authenticated;

grant execute on function public.marcar_cierre(uuid, date)   to authenticated;
grant execute on function public.racha_empresa(uuid)         to authenticated;
grant execute on function public.cierre_del_dia(uuid, date)  to authenticated;
grant execute on function public.hoy_empresa(uuid)           to authenticated;
grant execute on function public.empresas_sin_cargar_hoy(integer) to service_role;
