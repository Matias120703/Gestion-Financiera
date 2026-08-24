-- ============================================================
-- ORDEN · Migración 010 · Preferencias, avisos y datos del plan
--
--   · PREFERENCIAS son del USUARIO, no de la empresa. El idioma lo elige la
--     persona: en un negocio pueden convivir alguien que lee español y
--     alguien que lee portugués, y la empresa es una sola.
--
--   · DISPOSITIVOS PUSH: una persona puede tener el celular y la compu. Cada
--     navegador es un endpoint distinto, y el endpoint es la identidad.
--
--   · ENVÍOS: para que el resumen semanal no llegue dos veces si el cron se
--     dispara de más. La clave única es la garantía, no un `if` en el código.
--
-- Y cierra el círculo del plan: datos_empresa() pasa a devolver también qué
-- permite el plan y cuánto va usado, para que la app no tenga que adivinarlo
-- ni pedirlo aparte en cada pantalla.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PREFERENCIAS
--
--    `idioma` no tiene check contra una lista cerrada a propósito: agregar
--    un idioma nuevo no debería requerir una migración. Si llega uno que la
--    app no conoce, el diccionario cae a inglés y no se rompe nada.
-- ------------------------------------------------------------
create table if not exists public.preferencias (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  idioma        text not null default 'es',
  -- Aviso de la noche: "todavía no cargaste nada hoy".
  aviso_cierre  boolean not null default true,
  -- Resumen del lunes por email.
  aviso_semanal boolean not null default true,
  -- A qué hora, en la zona del negocio, tiene sentido recordarle.
  hora_cierre   smallint not null default 20 check (hora_cierre between 0 and 23),
  updated_at    timestamptz not null default now()
);

alter table public.preferencias enable row level security;

drop policy if exists preferencias_select on public.preferencias;
create policy preferencias_select on public.preferencias
  for select to authenticated using (user_id = auth.uid());

revoke all on public.preferencias from anon, authenticated;
grant select on public.preferencias to authenticated;

create or replace function public.mis_preferencias()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'idioma', p.idioma, 'aviso_cierre', p.aviso_cierre,
    'aviso_semanal', p.aviso_semanal, 'hora_cierre', p.hora_cierre
  ) into v_res
  from public.preferencias p where p.user_id = auth.uid();

  -- Sin fila todavía: devolvemos los valores por defecto en vez de null,
  -- así la pantalla no tiene que distinguir "no eligió" de "no existe".
  return coalesce(v_res, jsonb_build_object(
    'idioma', 'es', 'aviso_cierre', true, 'aviso_semanal', true, 'hora_cierre', 20));
end $fn$;

create or replace function public.guardar_preferencias(
  p_idioma text default null,
  p_aviso_cierre boolean default null,
  p_aviso_semanal boolean default null,
  p_hora_cierre smallint default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  insert into public.preferencias as p (user_id, idioma, aviso_cierre, aviso_semanal, hora_cierre)
  values (
    auth.uid(),
    coalesce(nullif(lower(trim(p_idioma)), ''), 'es'),
    coalesce(p_aviso_cierre, true),
    coalesce(p_aviso_semanal, true),
    coalesce(p_hora_cierre, 20::smallint)
  )
  on conflict (user_id) do update set
    -- coalesce con el valor viejo: mandar un solo campo no borra los otros.
    idioma        = coalesce(nullif(lower(trim(p_idioma)), ''), p.idioma),
    aviso_cierre  = coalesce(p_aviso_cierre,  p.aviso_cierre),
    aviso_semanal = coalesce(p_aviso_semanal, p.aviso_semanal),
    hora_cierre   = coalesce(p_hora_cierre,   p.hora_cierre),
    updated_at    = now();

  return public.mis_preferencias();
end $fn$;

-- ------------------------------------------------------------
-- 2. DISPOSITIVOS PUSH
--
--    El endpoint es único en todo el sistema, no por usuario: si alguien
--    cierra sesión y entra otra persona en el mismo navegador, la
--    suscripción tiene que cambiar de dueño, no duplicarse. Por eso el
--    upsert pisa `user_id`.
-- ------------------------------------------------------------
create table if not exists public.push_dispositivos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth_clave  text not null,
  navegador   text,
  created_at  timestamptz not null default now(),
  ultimo_uso  timestamptz
);

create index if not exists push_user_idx on public.push_dispositivos (user_id);

alter table public.push_dispositivos enable row level security;

drop policy if exists push_select on public.push_dispositivos;
create policy push_select on public.push_dispositivos
  for select to authenticated using (user_id = auth.uid());

revoke all on public.push_dispositivos from anon, authenticated;
grant select on public.push_dispositivos to authenticated;

create or replace function public.registrar_dispositivo(
  p_endpoint text, p_p256dh text, p_auth text, p_navegador text default null
)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if coalesce(trim(p_endpoint), '') = '' or coalesce(trim(p_p256dh), '') = ''
     or coalesce(trim(p_auth), '') = '' then
    raise exception 'Faltan datos de la suscripción push.' using errcode = '22023';
  end if;

  insert into public.push_dispositivos (user_id, endpoint, p256dh, auth_clave, navegador)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_navegador, ''), 200))
  on conflict (endpoint) do update set
    user_id    = auth.uid(),
    p256dh     = excluded.p256dh,
    auth_clave = excluded.auth_clave,
    navegador  = excluded.navegador;
end $fn$;

create or replace function public.borrar_dispositivo(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  delete from public.push_dispositivos where endpoint = p_endpoint and user_id = auth.uid();
end $fn$;

-- Baja desde el servidor: cuando el proveedor push responde 404/410, esa
-- suscripción está muerta y hay que sacarla o se reintenta para siempre.
create or replace function public.purgar_dispositivo(p_endpoint text)
returns void language sql security definer set search_path = public as $fn$
  delete from public.push_dispositivos where endpoint = p_endpoint;
$fn$;

-- ------------------------------------------------------------
-- 3. ENVÍOS · idempotencia de los avisos
--
--    `clave` incluye el periodo: 'semanal:<empresa>:2026-W34'. Si el cron
--    corre dos veces, el segundo insert choca contra el índice único y no
--    se manda nada. La garantía es de la base, no del código que la llama.
-- ------------------------------------------------------------
create table if not exists public.envios (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null,
  clave      text not null unique,
  user_id    uuid references auth.users (id) on delete set null,
  empresa_id uuid references public.empresas (id) on delete cascade,
  canal      text not null default 'email',
  enviado_at timestamptz not null default now()
);

create index if not exists envios_empresa_idx on public.envios (empresa_id, enviado_at desc);

alter table public.envios enable row level security;
revoke all on public.envios from anon, authenticated;

-- Reserva el envío. Devuelve true solo la primera vez.
create or replace function public.reservar_envio(
  p_tipo text, p_clave text, p_user uuid default null,
  p_empresa uuid default null, p_canal text default 'email'
)
returns boolean language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.envios (tipo, clave, user_id, empresa_id, canal)
  values (p_tipo, p_clave, p_user, p_empresa, coalesce(p_canal, 'email'));
  return true;
exception when unique_violation then
  return false;
end $fn$;

-- ------------------------------------------------------------
-- 4. DESTINATARIOS DEL RESUMEN SEMANAL
--
--    Solo propietarios y administradores: el resumen trae ganancia y
--    márgenes, que un vendedor no puede ver. Mandárselo por email sería
--    saltarse por la puerta de atrás el permiso por columna que la 003
--    puso con tanto cuidado.
--
--    Y solo negocios con actividad en los últimos 30 días: escribirle a
--    quien abandonó hace meses es spam, no retención.
-- ------------------------------------------------------------
create or replace function public.destinatarios_resumen_semanal()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'user_id',    u.id,
      'email',      u.email,
      'nombre',     mi.nombre,
      'empresa_id', e.id,
      'empresa',    e.nombre,
      'moneda',     e.moneda,
      'zona',       e.zona_horaria,
      'idioma',     coalesce(p.idioma, 'es')
    ) as x
    from public.miembros mi
    join public.empresas e on e.id = mi.empresa_id
    join auth.users u      on u.id = mi.user_id
    left join public.preferencias p on p.user_id = mi.user_id
    where mi.rol in ('propietario', 'admin')
      and u.email is not null
      and coalesce(p.aviso_semanal, true)
      and exists (
        select 1 from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo'
          and m.fecha >= (now() at time zone e.zona_horaria)::date - 30
      )
  ) s;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 5. DATOS DE LA EMPRESA · ahora también dice qué permite el plan
--
--    Una sola llamada por carga de página ya traía nombre, moneda y plan.
--    Sumarle límites y uso evita dos viajes más y, sobre todo, evita que
--    cada pantalla decida por su cuenta qué significa "pro".
-- ------------------------------------------------------------
create or replace function public.datos_empresa(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res   jsonb;
  v_plan  text;
  v_sus   public.suscripciones;
  v_usados integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_plan := public.plan_efectivo_calculado(p_empresa);
  select * into v_sus from public.suscripciones where empresa_id = p_empresa;

  select usados into v_usados from public.uso_ia
  where empresa_id = p_empresa and periodo = to_char(public.hoy_empresa(p_empresa), 'YYYY-MM');

  select jsonb_build_object(
    'id', e.id,
    'nombre', e.nombre,
    'moneda', e.moneda,
    'zona_horaria', e.zona_horaria,
    'plan_efectivo', v_plan,
    'permitir_stock_negativo', e.permitir_stock_negativo,
    'codigo_acceso', case
      when public.es_admin(e.id) then (select a.codigo from public.empresa_accesos a where a.empresa_id = e.id and a.activo)
      else null
    end,
    'limites', public.limites_plan(v_plan),
    'uso_ia', jsonb_build_object('usados', coalesce(v_usados, 0),
                                 'tope', (public.limites_plan(v_plan)->>'capturas_mes')::integer),
    'suscripcion', jsonb_build_object(
      'estado',      coalesce(v_sus.estado, 'activa'),
      'plan',        coalesce(v_sus.plan, 'gratis'),
      'periodo',     coalesce(v_sus.periodo, 'mensual'),
      'periodo_fin', v_sus.periodo_fin,
      'en_prueba',   coalesce(v_sus.estado, '') = 'prueba'
                     and v_sus.periodo_fin is not null and v_sus.periodo_fin > now(),
      -- Días enteros que faltan. Se redondea hacia arriba: mientras quede
      -- una hora, todavía es "un día", no "cero días".
      'dias_restantes', case
        when v_sus.periodo_fin is null or v_sus.periodo_fin <= now() then 0
        else ceil(extract(epoch from (v_sus.periodo_fin - now())) / 86400)::int
      end,
      'ya_uso_prueba', v_sus.prueba_fin is not null,
      'cancela_al_vencer', coalesce(v_sus.cancela_al_vencer, false)
    ),
    'miembros', (select count(*)::int from public.miembros mm where mm.empresa_id = e.id)
  ) into v_res
  from public.empresas e where e.id = p_empresa;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 6. ZONA HORARIA · quien administra puede corregirla
--
--    Va por función y no por update directo porque el trigger
--    `empresas_proteger` bloquea la escritura sobre empresas.
-- ------------------------------------------------------------
create or replace function public.actualizar_zona(p_empresa uuid, p_zona text)
returns text language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el propietario o un administrador puede cambiar la zona horaria.' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_zona) then
    raise exception 'Esa zona horaria no existe.' using errcode = '22023';
  end if;

  update public.empresas set zona_horaria = p_zona where id = p_empresa;
  return p_zona;
end $fn$;

revoke all on function public.mis_preferencias()                                    from public, anon;
revoke all on function public.guardar_preferencias(text, boolean, boolean, smallint) from public, anon;
revoke all on function public.registrar_dispositivo(text, text, text, text)         from public, anon;
revoke all on function public.borrar_dispositivo(text)                              from public, anon;
revoke all on function public.actualizar_zona(uuid, text)                           from public, anon;
revoke all on function public.purgar_dispositivo(text)             from public, anon, authenticated;
revoke all on function public.reservar_envio(text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.destinatarios_resumen_semanal()      from public, anon, authenticated;

grant execute on function public.mis_preferencias()                                    to authenticated;
grant execute on function public.guardar_preferencias(text, boolean, boolean, smallint) to authenticated;
grant execute on function public.registrar_dispositivo(text, text, text, text)         to authenticated;
grant execute on function public.borrar_dispositivo(text)                              to authenticated;
grant execute on function public.actualizar_zona(uuid, text)                           to authenticated;
grant execute on function public.purgar_dispositivo(text)                              to service_role;
grant execute on function public.reservar_envio(text, text, uuid, uuid, text)          to service_role;
grant execute on function public.destinatarios_resumen_semanal()                       to service_role;

-- El cron necesita leer para armar los mensajes.
grant select on public.push_dispositivos to service_role;
grant select, insert on public.envios    to service_role;
grant select on public.preferencias      to service_role;
