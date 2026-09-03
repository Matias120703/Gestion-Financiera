-- ORDEN · Migración 037 · Los huecos y la reserva
--
-- El motor de la agenda. Dos cosas: calcular qué huecos quedan libres un día
-- dado, y tomar uno sin que dos personas se queden con el mismo.

-- ============================================================
-- 1. LOS HUECOS DE UN DÍA
--
--    Sale de tres capas, en este orden de prioridad:
--
--      1. la excepción de ESA persona para ese día (se tomó el día);
--      2. la excepción del LOCAL para ese día (feriado);
--      3. el horario que se repite esa semana.
--
--    La primera que aparece manda. Sin esa prioridad, un feriado del local
--    taparía el día que alguien decidió abrir igual.
--
--    Los huecos se cortan del tamaño del servicio elegido, no de una grilla
--    fija de una hora: si el corte con barba dura 45 minutos, los turnos van
--    cada 45 minutos.
-- ============================================================
create or replace function public.huecos_del_dia(
  p_profesional uuid,
  p_fecha       date,
  p_producto    uuid
)
returns table (inicia timestamptz, termina timestamptz)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_empresa uuid;
  v_zona    text;
  v_dur     integer;
  v_ahora   timestamptz := now();
begin
  select p.empresa_id, coalesce(e.zona_horaria, 'America/Asuncion')
  into v_empresa, v_zona
  from public.turnos_profesional p
  join public.empresas e on e.id = p.empresa_id
  where p.id = p_profesional and p.activo;

  if v_empresa is null then
    return;
  end if;

  select coalesce(s.duracion_min, 30) into v_dur
  from public.turnos_servicio s
  where s.producto_id = p_producto and s.empresa_id = v_empresa and s.reservable;

  -- Un servicio que no está marcado como reservable no ofrece huecos. No es
  -- lo mismo que no tener agenda: es que ese servicio no se agenda.
  if v_dur is null then
    return;
  end if;

  return query
  with excepcion as (
    -- La de la persona gana sobre la del local; por eso el order by.
    select x.cerrado, x.desde, x.hasta
    from public.turnos_excepcion x
    where x.empresa_id = v_empresa and x.fecha = p_fecha
      and (x.profesional_id = p_profesional or x.profesional_id is null)
    order by x.profesional_id nulls last
    limit 1
  ),
  ventanas as (
    -- Con excepción abierta, la ventana es la de la excepción.
    select (p_fecha + e.desde)::timestamp as ini, (p_fecha + e.hasta)::timestamp as fin
    from excepcion e
    where not e.cerrado
    union all
    -- Sin ninguna excepción, el horario de siempre.
    select (p_fecha + h.desde)::timestamp, (p_fecha + h.hasta)::timestamp
    from public.turnos_horario h
    where h.profesional_id = p_profesional
      and h.activo
      and h.dia_semana = extract(dow from p_fecha)::smallint
      and not exists (select 1 from excepcion)
  ),
  puntos as (
    select generate_series(
             v.ini,
             v.fin - (v_dur || ' minutes')::interval,
             (v_dur || ' minutes')::interval
           ) as arranca
    from ventanas v
  )
  select
    (pt.arranca at time zone v_zona) as inicia,
    ((pt.arranca + (v_dur || ' minutes')::interval) at time zone v_zona) as termina
  from puntos pt
  where
    -- Un turno que ya pasó no se ofrece.
    (pt.arranca at time zone v_zona) > v_ahora
    -- Ni uno que se pisa con algo ya reservado.
    and not exists (
      select 1 from public.turnos_reserva r
      where r.profesional_id = p_profesional
        and r.estado in ('pendiente', 'confirmada')
        and r.inicia < ((pt.arranca + (v_dur || ' minutes')::interval) at time zone v_zona)
        and (pt.arranca at time zone v_zona) < r.termina
    )
  order by 1;
end $fn$;

-- ============================================================
-- 2. LA RESERVA
--
--    El horario se guarda como INSTANTE y no como «10:30 del jueves». Un
--    texto con la hora se mueve solo el día que cambia la zona de la cuenta;
--    un instante no se mueve nunca.
-- ============================================================
create table if not exists public.turnos_reserva (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas (id) on delete cascade,
  profesional_id   uuid not null references public.turnos_profesional (id) on delete cascade,
  producto_id      uuid not null references public.productos (id) on delete restrict,
  inicia           timestamptz not null,
  termina          timestamptz not null,
  cliente_nombre   text not null check (char_length(trim(cliente_nombre)) between 1 and 80),
  cliente_telefono text not null default '',
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'confirmada', 'atendida', 'cancelada', 'no_vino')),
  -- El corte que se cobró, cuando se atendió.
  atribucion_id    uuid references public.turnos_atribucion (id) on delete set null,
  -- El secreto del enlace para cancelar. Es lo único que el cliente guarda.
  token            uuid not null default gen_random_uuid(),
  origen           text not null default 'local' check (origen in ('local', 'publico')),
  creada_por       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint reserva_con_sentido check (termina > inicia)
);

create index if not exists turnos_reserva_agenda_idx
  on public.turnos_reserva (profesional_id, inicia)
  where estado in ('pendiente', 'confirmada');
create index if not exists turnos_reserva_empresa_idx
  on public.turnos_reserva (empresa_id, inicia desc);
create unique index if not exists turnos_reserva_token_idx
  on public.turnos_reserva (token);

alter table public.turnos_reserva enable row level security;

-- Los datos del cliente son de terceros que nunca se registraron en Orden.
-- Los ve quien trabaja en el local, y nadie más.
drop policy if exists turnos_reserva_select on public.turnos_reserva;
create policy turnos_reserva_select on public.turnos_reserva
  for select to authenticated using (public.es_miembro(empresa_id));

revoke all on public.turnos_reserva from anon, authenticated;
grant select on public.turnos_reserva to authenticated;

drop trigger if exists cuenta_activa_turnos_reserva on public.turnos_reserva;
create trigger cuenta_activa_turnos_reserva
  before insert or update on public.turnos_reserva
  for each row execute function public.exigir_cuenta_activa();

-- ============================================================
-- 3. TOMAR UN TURNO
--
--    QUE DOS PERSONAS NO SE QUEDEN CON EL MISMO HUECO
--
--    `for update` sobre la fila del profesional serializa todas las reservas
--    de esa persona: la segunda transacción espera a que la primera termine y
--    recién entonces mira si el hueco sigue libre. Es el mismo recurso que ya
--    usa `anular_movimiento` para que dos anulaciones simultáneas no se pisen.
--
--    Un chequeo en el navegador pierde esa carrera siempre: entre que
--    pregunta y escribe, el otro ya reservó.
-- ============================================================
create or replace function public.reservar(
  p_empresa     uuid,
  p_profesional uuid,
  p_producto    uuid,
  p_inicia      timestamptz,
  p_nombre      text,
  p_telefono    text default '',
  p_origen      text default 'local'
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_zona   text;
  v_fecha  date;
  v_libre  boolean;
  v_fin    timestamptz;
  v_id     uuid;
  v_token  uuid;
begin
  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Falta el nombre de quien reserva.' using errcode = '22023';
  end if;

  if p_inicia is null then
    raise exception 'Falta el horario.' using errcode = '22023';
  end if;

  -- Esta puerta es la del LOCAL: la usa quien trabaja ahí para anotar a
  -- alguien que llamó por teléfono. La puerta pública —la del link que el
  -- dueño comparte— es otra función, con sus propios límites, y por eso acá
  -- se exige pertenecer. Sin esta línea, cualquiera con una cuenta de Orden
  -- podía llenarle la agenda a un negocio ajeno.
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  -- El candado. Todo lo que sigue está serializado por profesional.
  perform 1 from public.turnos_profesional
  where id = p_profesional and empresa_id = p_empresa and activo
  for update;

  if not found then
    raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
  end if;

  select coalesce(e.zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas e where e.id = p_empresa;

  v_fecha := (p_inicia at time zone v_zona)::date;

  -- Que el hueco EXISTA, no solo que esté libre. Sin esto se podría reservar
  -- a las tres de la mañana mandando el horario a mano.
  select exists (
    select 1 from public.huecos_del_dia(p_profesional, v_fecha, p_producto) h
    where h.inicia = p_inicia
  ) into v_libre;

  if not v_libre then
    raise exception 'Ese horario ya no está disponible.' using errcode = '23505';
  end if;

  select h.termina into v_fin
  from public.huecos_del_dia(p_profesional, v_fecha, p_producto) h
  where h.inicia = p_inicia;

  insert into public.turnos_reserva (
    empresa_id, profesional_id, producto_id, inicia, termina,
    cliente_nombre, cliente_telefono, origen, creada_por
  )
  values (
    p_empresa, p_profesional, p_producto, p_inicia, v_fin,
    left(trim(p_nombre), 80), left(coalesce(trim(p_telefono), ''), 40),
    case when p_origen = 'publico' then 'publico' else 'local' end,
    auth.uid()
  )
  returning id, token into v_id, v_token;

  return jsonb_build_object('reserva', v_id, 'token', v_token, 'inicia', p_inicia, 'termina', v_fin);
end $fn$;

revoke all on function public.reservar(uuid, uuid, uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.reservar(uuid, uuid, uuid, timestamptz, text, text, text) to authenticated;

-- ============================================================
-- 4. CANCELAR
--
--    Por token y sin sesión: es el enlace que el cliente guardó. Sin una
--    forma de avisar que no viene, en dos semanas la agenda está llena de
--    fantasmas y el barbero deja de creerle — que es el mismo problema que
--    una agenda vacía, pero peor, porque parece que funciona.
-- ============================================================
create or replace function public.cancelar_reserva(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_estado text;
begin
  select estado into v_estado from public.turnos_reserva where token = p_token;

  if v_estado is null then
    raise exception 'Esa reserva no existe.' using errcode = 'P0002';
  end if;

  if v_estado = 'cancelada' then
    return jsonb_build_object('cancelada', true, 'ya_estaba', true);
  end if;

  if v_estado <> 'pendiente' and v_estado <> 'confirmada' then
    raise exception 'Esa reserva ya no se puede cancelar.' using errcode = '22023';
  end if;

  update public.turnos_reserva set estado = 'cancelada' where token = p_token;
  return jsonb_build_object('cancelada', true);
end $fn$;

revoke all on function public.cancelar_reserva(uuid) from public, anon;
grant execute on function public.cancelar_reserva(uuid) to authenticated;

-- ============================================================
-- 5. ATENDER
--
--    Cierra el turno y cobra, en una sola transacción. El precio sale del
--    servicio reservado, no de lo que alguien tipee: si el profesional cobró
--    distinto, lo pasa explícito y queda a la vista.
-- ============================================================
create or replace function public.atender_reserva(
  p_reserva uuid,
  p_precio  numeric default null,
  p_metodo  text default 'efectivo'
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_r      public.turnos_reserva%rowtype;
  v_cobro  jsonb;
begin
  select * into v_r from public.turnos_reserva where id = p_reserva for update;
  if not found then
    raise exception 'Esa reserva no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v_r.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if v_r.estado not in ('pendiente', 'confirmada') then
    raise exception 'Esa reserva ya se cerró.' using errcode = '23505';
  end if;

  -- LA VENTA SE FECHA HOY, NO EL DÍA DEL TURNO.
  --
  -- Parece más prolijo usar la fecha de la reserva, y es un error: un turno
  -- reservado para dentro de dos semanas crearía una venta con fecha futura,
  -- que `registrar_venta` rechaza desde la migración 002 —y hace bien, porque
  -- sería facturación que todavía no ocurrió.
  --
  -- Una venta es plata que SE MOVIÓ, y se mueve cuando el cliente paga. Que
  -- el turno estuviera agendado para otro día ya quedó guardado en la
  -- reserva; no hace falta repetirlo en la contabilidad, ni conviene.
  v_cobro := public.registrar_servicio(
    v_r.empresa_id, v_r.profesional_id, v_r.producto_id,
    p_precio, null, p_metodo, v_r.cliente_nombre, '', 'manual'
  );

  update public.turnos_reserva
  set estado = 'atendida', atribucion_id = (v_cobro->>'atribucion')::uuid
  where id = p_reserva;

  return v_cobro || jsonb_build_object('reserva', p_reserva);
end $fn$;

revoke all on function public.atender_reserva(uuid, numeric, text) from public, anon;
grant execute on function public.atender_reserva(uuid, numeric, text) to authenticated;

-- El que no vino. Sin esto la agenda de la semana que viene arrastra
-- fantasmas y deja de ser confiable.
create or replace function public.marcar_no_vino(p_reserva uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_emp uuid; v_estado text;
begin
  select empresa_id, estado into v_emp, v_estado
  from public.turnos_reserva where id = p_reserva;

  if v_emp is null then
    raise exception 'Esa reserva no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_emp) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if v_estado not in ('pendiente', 'confirmada') then
    raise exception 'Esa reserva ya se cerró.' using errcode = '23505';
  end if;

  update public.turnos_reserva set estado = 'no_vino' where id = p_reserva;
  return jsonb_build_object('no_vino', true);
end $fn$;

revoke all on function public.marcar_no_vino(uuid) from public, anon;
grant execute on function public.marcar_no_vino(uuid) to authenticated;

-- ============================================================
-- 6. LA AGENDA DEL DÍA
--
--    Lo que el profesional mira a la mañana: sus turnos en orden, con el
--    teléfono a un toque.
-- ============================================================
create or replace function public.agenda_del_dia(
  p_empresa uuid,
  p_fecha   date default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona  text;
  v_fecha date;
  v_res   jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas where id = p_empresa;
  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          r.id,
    'inicia',      r.inicia,
    'termina',     r.termina,
    'profesional', p.nombre,
    'profesional_id', r.profesional_id,
    'servicio',    pr.nombre,
    'cliente',     r.cliente_nombre,
    'telefono',    r.cliente_telefono,
    'estado',      r.estado,
    'origen',      r.origen
  ) order by r.inicia), '[]'::jsonb)
  into v_res
  from public.turnos_reserva r
  join public.turnos_profesional p on p.id = r.profesional_id
  join public.productos pr on pr.id = r.producto_id
  where r.empresa_id = p_empresa
    and (r.inicia at time zone v_zona)::date = v_fecha
    -- Una cancelada no ocupa lugar en la agenda del día.
    and r.estado <> 'cancelada';

  return v_res;
end $fn$;

revoke all on function public.agenda_del_dia(uuid, date) from public, anon;
grant execute on function public.agenda_del_dia(uuid, date) to authenticated;

revoke all on function public.huecos_del_dia(uuid, date, uuid) from public, anon;
grant execute on function public.huecos_del_dia(uuid, date, uuid) to authenticated;
