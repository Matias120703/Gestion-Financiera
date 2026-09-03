-- ORDEN · Migración 036 · La agenda: cuándo trabaja cada uno
--
-- Segunda pieza del módulo de turnos. La primera fue el reparto —quién cobra
-- qué y cómo se divide— y esta contesta la otra mitad: cuándo está libre.
--
-- TRES TABLAS Y NO UNA
--
--   · `turnos_servicio`  cuánto dura cada servicio, y si se puede reservar.
--   · `turnos_horario`   lo que se repite todas las semanas.
--   · `turnos_excepcion` el día que no es como los demás.
--
-- Guardar el horario y las excepciones juntos obligaría a reescribir la
-- semana entera cada feriado. Separarlos permite que el horario sea la regla
-- y la excepción sea la excepción, que es como lo piensa la persona.
--
-- LAS HORAS SE GUARDAN COMO HORA LOCAL, NO COMO INSTANTE
--
-- «Abro a las 8» es una regla sobre el reloj de la pared, no sobre un momento
-- del tiempo: sigue siendo a las 8 en verano y en invierno. Guardarla como
-- instante la movería sola con cada cambio de horario. La conversión a
-- instante se hace al calcular los huecos de un día concreto, usando la zona
-- de la empresa — que desde la 032 es la de la empresa y no Asunción.

-- ============================================================
-- 1. QUÉ SE PUEDE RESERVAR Y CUÁNTO DURA
--
--    Un servicio de la lista de precios no es automáticamente reservable: el
--    dueño puede cobrar «retoque de barba» sin querer que ocupe un turno.
--    Y sin duración no hay agenda posible: los huecos salen de ahí.
-- ============================================================
create table if not exists public.turnos_servicio (
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  producto_id  uuid not null references public.productos (id) on delete cascade,
  duracion_min integer not null default 30
               check (duracion_min between 5 and 480),
  -- Si está en falso, se puede cobrar pero no aparece para reservar.
  reservable   boolean not null default true,
  updated_at   timestamptz not null default now(),
  primary key (producto_id)
);

create index if not exists turnos_servicio_empresa_idx
  on public.turnos_servicio (empresa_id) where reservable;

-- ============================================================
-- 2. EL HORARIO QUE SE REPITE
--
--    Varias filas por día: quien corta de 8 a 12 y de 15 a 20 carga dos
--    franjas, y el hueco del mediodía queda cerrado sin tener que explicarlo.
--    Que sea «cerrado» y no «ocupado» importa: la página pública no muestra
--    el mediodía como un turno tomado, simplemente no está.
-- ============================================================
create table if not exists public.turnos_horario (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  profesional_id uuid not null references public.turnos_profesional (id) on delete cascade,
  -- 0 = domingo, igual que `extract(dow from fecha)`.
  dia_semana     smallint not null check (dia_semana between 0 and 6),
  desde          time not null,
  hasta          time not null,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),

  constraint franja_con_sentido check (hasta > desde)
);

create index if not exists turnos_horario_idx
  on public.turnos_horario (profesional_id, dia_semana) where activo;

-- ============================================================
-- 3. EL DÍA QUE NO ES COMO LOS DEMÁS
--
--    `profesional_id` nulo = vale para todo el local (un feriado). Con
--    profesional = solo esa persona (se tomó el día).
-- ============================================================
create table if not exists public.turnos_excepcion (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  profesional_id uuid references public.turnos_profesional (id) on delete cascade,
  fecha          date not null,
  cerrado        boolean not null default true,
  desde          time,
  hasta          time,
  motivo         text not null default '',
  created_at     timestamptz not null default now(),

  -- Si no está cerrado, tiene que decir de cuándo a cuándo. Una excepción
  -- abierta sin horario no significa nada y dejaría la agenda en blanco.
  constraint excepcion_coherente check (
    cerrado or (desde is not null and hasta is not null and hasta > desde)
  )
);

create unique index if not exists turnos_excepcion_una_por_dia
  on public.turnos_excepcion (empresa_id, fecha, coalesce(profesional_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ============================================================
-- 4. PERMISOS
--
--    Los horarios los lee cualquier miembro: son la agenda del local, no un
--    secreto. Escribir pasa por funciones, como todo lo demás.
-- ============================================================
alter table public.turnos_servicio  enable row level security;
alter table public.turnos_horario   enable row level security;
alter table public.turnos_excepcion enable row level security;

drop policy if exists turnos_servicio_select on public.turnos_servicio;
create policy turnos_servicio_select on public.turnos_servicio
  for select to authenticated using (public.es_miembro(empresa_id));

drop policy if exists turnos_horario_select on public.turnos_horario;
create policy turnos_horario_select on public.turnos_horario
  for select to authenticated using (public.es_miembro(empresa_id));

drop policy if exists turnos_excepcion_select on public.turnos_excepcion;
create policy turnos_excepcion_select on public.turnos_excepcion
  for select to authenticated using (public.es_miembro(empresa_id));

revoke all on public.turnos_servicio  from anon, authenticated;
revoke all on public.turnos_horario   from anon, authenticated;
revoke all on public.turnos_excepcion from anon, authenticated;

grant select on public.turnos_servicio  to authenticated;
grant select on public.turnos_horario   to authenticated;
grant select on public.turnos_excepcion to authenticated;

do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['turnos_servicio', 'turnos_horario', 'turnos_excepcion'] loop
    execute format('drop trigger if exists %I on public.%I',
                   'cuenta_activa_' || v_tabla, v_tabla);
    execute format(
      'create trigger %I before insert or update on public.%I '
      || 'for each row execute function public.exigir_cuenta_activa()',
      'cuenta_activa_' || v_tabla, v_tabla);
  end loop;
end $$;

-- ============================================================
-- 5. ESCRIBIR
--
--    El horario lo maneja el propio profesional, igual que su precio: es SU
--    agenda. El dueño también, porque muchos no van a tener cuenta.
-- ============================================================
create or replace function public.puede_agendar(p_empresa uuid, p_profesional uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select public.es_admin(p_empresa) or exists (
    select 1 from public.turnos_profesional p
    where p.id = p_profesional and p.empresa_id = p_empresa
      and p.user_id is not null and p.user_id = auth.uid()
  );
$fn$;

revoke all on function public.puede_agendar(uuid, uuid) from public, anon;
grant execute on function public.puede_agendar(uuid, uuid) to authenticated;

create or replace function public.guardar_servicio_agenda(
  p_empresa   uuid,
  p_producto  uuid,
  p_duracion  integer,
  p_reservable boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede definir los servicios.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.productos
                 where id = p_producto and empresa_id = p_empresa and not controla_stock) then
    raise exception 'Eso no es un servicio de esta cuenta.' using errcode = 'P0002';
  end if;

  if coalesce(p_duracion, 0) < 5 or p_duracion > 480 then
    raise exception 'La duración tiene que estar entre 5 minutos y 8 horas.' using errcode = '22023';
  end if;

  insert into public.turnos_servicio (empresa_id, producto_id, duracion_min, reservable)
  values (p_empresa, p_producto, p_duracion, coalesce(p_reservable, true))
  on conflict (producto_id) do update
    set duracion_min = excluded.duracion_min,
        reservable = excluded.reservable,
        updated_at = now();

  return jsonb_build_object('guardado', true);
end $fn$;

revoke all on function public.guardar_servicio_agenda(uuid, uuid, integer, boolean) from public, anon;
grant execute on function public.guardar_servicio_agenda(uuid, uuid, integer, boolean) to authenticated;

create or replace function public.guardar_horario(
  p_empresa     uuid,
  p_profesional uuid,
  p_dia         integer,
  p_desde       time,
  p_hasta       time,
  p_id          uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not public.puede_agendar(p_empresa, p_profesional) then
    raise exception 'Solo podés cambiar tu propio horario.' using errcode = '42501';
  end if;

  if p_dia is null or p_dia < 0 or p_dia > 6 then
    raise exception 'Ese día de la semana no existe.' using errcode = '22023';
  end if;

  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'La hora de cierre tiene que ser posterior a la de apertura.' using errcode = '22023';
  end if;

  -- Dos franjas del mismo día que se pisan dejarían huecos duplicados en la
  -- página pública: el mismo turno ofrecido dos veces.
  if exists (
    select 1 from public.turnos_horario h
    where h.profesional_id = p_profesional and h.dia_semana = p_dia and h.activo
      and (p_id is null or h.id <> p_id)
      and h.desde < p_hasta and p_desde < h.hasta
  ) then
    raise exception 'Ese horario se superpone con otro del mismo día.' using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.turnos_horario (empresa_id, profesional_id, dia_semana, desde, hasta)
    values (p_empresa, p_profesional, p_dia, p_desde, p_hasta)
    returning id into v_id;
  else
    update public.turnos_horario
    set dia_semana = p_dia, desde = p_desde, hasta = p_hasta
    where id = p_id and empresa_id = p_empresa and profesional_id = p_profesional
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese horario no existe.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_horario(uuid, uuid, integer, time, time, uuid) from public, anon;
grant execute on function public.guardar_horario(uuid, uuid, integer, time, time, uuid) to authenticated;

create or replace function public.borrar_horario(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_prof uuid;
begin
  select profesional_id into v_prof from public.turnos_horario
  where id = p_id and empresa_id = p_empresa;
  if v_prof is null then
    raise exception 'Ese horario no existe.' using errcode = 'P0002';
  end if;

  if not public.puede_agendar(p_empresa, v_prof) then
    raise exception 'Solo podés cambiar tu propio horario.' using errcode = '42501';
  end if;

  delete from public.turnos_horario where id = p_id and empresa_id = p_empresa;
  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_horario(uuid, uuid) from public, anon;
grant execute on function public.borrar_horario(uuid, uuid) to authenticated;

-- Un feriado lo pone el dueño; el día libre de alguien, esa persona.
create or replace function public.guardar_excepcion(
  p_empresa     uuid,
  p_fecha       date,
  p_cerrado     boolean default true,
  p_profesional uuid default null,
  p_desde       time default null,
  p_hasta       time default null,
  p_motivo      text default ''
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  -- Sin profesional es un feriado del local: eso solo lo decide el dueño.
  if p_profesional is null then
    if not public.es_admin(p_empresa) then
      raise exception 'Solo el dueño de la cuenta puede cerrar el local.' using errcode = '42501';
    end if;
  elsif not public.puede_agendar(p_empresa, p_profesional) then
    raise exception 'Solo podés cambiar tu propia agenda.' using errcode = '42501';
  end if;

  if p_fecha is null then
    raise exception 'Falta la fecha.' using errcode = '22023';
  end if;

  if not coalesce(p_cerrado, true)
     and (p_desde is null or p_hasta is null or p_hasta <= p_desde) then
    raise exception 'Si ese día abrís, decí de cuándo a cuándo.' using errcode = '22023';
  end if;

  insert into public.turnos_excepcion (empresa_id, profesional_id, fecha, cerrado, desde, hasta, motivo)
  values (p_empresa, p_profesional, p_fecha, coalesce(p_cerrado, true),
          case when coalesce(p_cerrado, true) then null else p_desde end,
          case when coalesce(p_cerrado, true) then null else p_hasta end,
          left(coalesce(p_motivo, ''), 100))
  on conflict (empresa_id, fecha, coalesce(profesional_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set cerrado = excluded.cerrado, desde = excluded.desde,
                hasta = excluded.hasta, motivo = excluded.motivo
  returning id into v_id;

  return v_id;
end $fn$;

revoke all on function public.guardar_excepcion(uuid, date, boolean, uuid, time, time, text) from public, anon;
grant execute on function public.guardar_excepcion(uuid, date, boolean, uuid, time, time, text) to authenticated;

create or replace function public.borrar_excepcion(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_prof uuid; v_hay boolean;
begin
  select profesional_id, true into v_prof, v_hay from public.turnos_excepcion
  where id = p_id and empresa_id = p_empresa;
  if not coalesce(v_hay, false) then
    raise exception 'Esa excepción no existe.' using errcode = 'P0002';
  end if;

  if v_prof is null then
    if not public.es_admin(p_empresa) then
      raise exception 'Solo el dueño de la cuenta puede tocar los feriados.' using errcode = '42501';
    end if;
  elsif not public.puede_agendar(p_empresa, v_prof) then
    raise exception 'Solo podés cambiar tu propia agenda.' using errcode = '42501';
  end if;

  delete from public.turnos_excepcion where id = p_id and empresa_id = p_empresa;
  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_excepcion(uuid, uuid) from public, anon;
grant execute on function public.borrar_excepcion(uuid, uuid) to authenticated;
