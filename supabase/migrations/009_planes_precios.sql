-- ============================================================
-- ORDEN · Migración 009 · Planes, precios y prueba gratis
--
-- Tres cosas que hasta acá no existían:
--
--   1. UN TERCER PLAN. Orden ya tenía construido lo caro: roles, empleados,
--      costos ocultos para el vendedor, código de invitación. Eso no vale
--      lo mismo que una persona sola cargando sus ventas. `negocio` cobra
--      por lo que ya está hecho.
--
--   2. PRECIOS EN UNA TABLA, NO EN EL CÓDIGO. Guaraníes para Paraguay,
--      dólares para el resto, y el día que entres a Brasil se agrega una
--      fila. Cambiar un precio no puede requerir un despliegue.
--
--   3. PRUEBA DE 14 DÍAS, SIN TARJETA. Tres días no alcanzan: el valor de
--      Orden aparece cuando hay datos acumulados, y a los tres días el
--      panel está casi vacío. Catorce días son dos cierres de semana y un
--      resumen semanal por email.
--
--      Al vencer NO se bloquean los datos. Se cae a `gratis`: sigue viendo
--      todo su historial y cargando a mano, y pierde la captura ilimitada,
--      los comprobantes y el Excel. Quitarle los datos genera bronca;
--      quitarle la magia genera compras.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ABRIR LOS CHECKS AL PLAN `negocio`
--
--    Los checks viejos solo conocían gratis/pro. Se reemplazan por nombre
--    para que la migración sea repetible.
-- ------------------------------------------------------------
alter table public.empresas       drop constraint if exists empresas_plan_check;
alter table public.suscripciones  drop constraint if exists suscripciones_plan_check;
alter table public.suscripciones  drop constraint if exists suscripciones_estado_check;

alter table public.empresas
  add constraint empresas_plan_check check (plan in ('gratis', 'pro', 'negocio'));

alter table public.suscripciones
  add constraint suscripciones_plan_check check (plan in ('gratis', 'pro', 'negocio'));

alter table public.suscripciones
  add constraint suscripciones_estado_check
  check (estado in ('activa', 'prueba', 'vencida', 'cancelada', 'morosa'));

-- Datos del cobro. `importe` y `moneda` se guardan tal como se cobró: si
-- mañana sube el precio, la suscripción vieja tiene que seguir mostrando
-- lo que esa persona realmente paga.
alter table public.suscripciones
  add column if not exists periodo            text not null default 'mensual',
  add column if not exists moneda             text,
  add column if not exists importe            numeric(14,2),
  add column if not exists prueba_fin         timestamptz,
  add column if not exists cancela_al_vencer  boolean not null default false;

do $$ begin
  alter table public.suscripciones add constraint suscripciones_periodo_check
    check (periodo in ('mensual', 'anual'));
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. PRECIOS
--
--    Clave (plan, moneda, periodo). `activo` permite dejar de ofrecer un
--    precio sin borrarlo, para que las suscripciones que ya lo usan sigan
--    teniendo a qué apuntar.
-- ------------------------------------------------------------
create table if not exists public.precios (
  id          uuid primary key default gen_random_uuid(),
  plan        text not null check (plan in ('pro', 'negocio')),
  moneda      text not null check (moneda in ('PYG', 'USD', 'ARS', 'BRL', 'EUR')),
  periodo     text not null check (periodo in ('mensual', 'anual')),
  importe     numeric(14,2) not null check (importe > 0),
  -- Identificador del precio en la pasarela (price_id de Stripe, etc.).
  referencia_externa text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (plan, moneda, periodo)
);

comment on table public.precios is
  'Precio de venta por plan, moneda y periodo. Cambiar un precio acá no requiere desplegar la app.';

-- Precios de arranque. El anual da dos meses gratis: a cinco dólares, la
-- comisión fija de la pasarela se lleva cerca del 10% todos los meses;
-- cobrando una vez al año se paga una sola vez.
insert into public.precios (plan, moneda, periodo, importe) values
  ('pro',     'PYG', 'mensual',   35000),
  ('pro',     'PYG', 'anual',    350000),
  ('pro',     'USD', 'mensual',    4.99),
  ('pro',     'USD', 'anual',     49.00),
  ('negocio', 'PYG', 'mensual',   79000),
  ('negocio', 'PYG', 'anual',    790000),
  ('negocio', 'USD', 'mensual',    8.99),
  ('negocio', 'USD', 'anual',      89.00)
on conflict (plan, moneda, periodo) do nothing;

alter table public.precios enable row level security;

-- La lista de precios es pública: la pantalla de planes tiene que poder
-- mostrarla antes de que la persona se registre.
drop policy if exists precios_select on public.precios;
create policy precios_select on public.precios for select using (activo);

revoke all on public.precios from anon, authenticated;
grant select on public.precios to anon, authenticated;

create or replace function public.lista_precios(p_moneda text default null)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'plan', p.plan, 'moneda', p.moneda, 'periodo', p.periodo,
    'importe', p.importe, 'referencia_externa', p.referencia_externa
  ) order by p.plan, p.periodo), '[]'::jsonb)
  from public.precios p
  where p.activo and (p_moneda is null or p.moneda = p_moneda);
$fn$;

grant execute on function public.lista_precios(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. QUÉ DA CADA PLAN
--
--    Una sola definición, en la base. Si estuviera en TypeScript habría que
--    confiar en el navegador para saber si alguien puede subir un
--    comprobante, y el navegador es de quien lo abre.
-- ------------------------------------------------------------
create or replace function public.limites_plan(p_plan text)
returns jsonb language sql immutable set search_path = public as $fn$
  select case coalesce(p_plan, 'gratis')
    when 'negocio' then jsonb_build_object(
      'capturas_mes', 3000, 'miembros', 15,
      'adjuntos', true, 'excel', true, 'avisos', true)
    -- Tres personas: el dueño y un par de ayudantes. Una despensa chica no
    -- tiene por qué pagar el plan de una cadena, y si la apretamos termina
    -- compartiendo un solo login — que es peor para todos, porque perdemos
    -- el registro de quién cargó cada venta.
    when 'pro' then jsonb_build_object(
      'capturas_mes', 600, 'miembros', 3,
      'adjuntos', true, 'excel', true, 'avisos', true)
    else jsonb_build_object(
      -- Veinte capturas alcanzan para que la magia se entienda y no para
      -- vivir del plan gratis. Cargar a mano nunca se limita: los datos
      -- son de la persona, no nuestros.
      'capturas_mes', 20, 'miembros', 1,
      'adjuntos', false, 'excel', false, 'avisos', true)
  end;
$fn$;

grant execute on function public.limites_plan(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. PLAN EFECTIVO · ahora con tres planes y prueba
--
--    Reemplaza al de la 003, que asumía que todo lo que no era 'pro' era
--    'gratis'. El orden de las ramas importa: primero lo que vence, después
--    lo que está vigente.
-- ------------------------------------------------------------
create or replace function public.plan_efectivo_calculado(p_empresa uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select coalesce((
    select case
      when s.plan = 'gratis' then 'gratis'
      -- Vencida por fecha: no importa qué diga el estado.
      when s.periodo_fin is not null and s.periodo_fin <= now() then 'gratis'
      when s.estado in ('activa', 'prueba') then s.plan
      -- Canceló pero pagó hasta fin de mes: conserva lo que compró.
      when s.estado = 'cancelada' and s.periodo_fin is not null and s.periodo_fin > now() then s.plan
      else 'gratis'
    end
    from public.suscripciones s
    where s.empresa_id = p_empresa
  ), 'gratis');
$fn$;

-- `empresa_es_pro` existía cuando pro era el único plan pago. Ahora la
-- pregunta útil es "¿paga?", y negocio también paga.
create or replace function public.empresa_es_pro(p_empresa uuid)
returns boolean language plpgsql stable security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  return public.plan_efectivo_calculado(p_empresa) in ('pro', 'negocio');
end $fn$;

-- ------------------------------------------------------------
-- 5. CONSUMO DE IA
--
--    Se cuenta por empresa y por mes calendario. Nada de borrar filas
--    viejas: sirven para ver cuánto usa realmente la gente antes de
--    decidir si el tope está bien puesto.
-- ------------------------------------------------------------
create table if not exists public.uso_ia (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  periodo    text not null,           -- 'YYYY-MM'
  usados     integer not null default 0 check (usados >= 0),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, periodo)
);

alter table public.uso_ia enable row level security;

drop policy if exists uso_ia_select on public.uso_ia;
create policy uso_ia_select on public.uso_ia
  for select to authenticated using (public.es_miembro(empresa_id));

revoke all on public.uso_ia from anon, authenticated;
grant select on public.uso_ia to authenticated;

-- ------------------------------------------------------------
-- 6. CONSUMIR UN CRÉDITO
--
--    Devuelve si se permitió, cuántos van y cuál es el tope. Es la única
--    forma de gastar un crédito: la ruta /api/capturar la llama ANTES de
--    hablar con OpenAI, así un plan gratis no puede quemarnos la cuenta.
--
--    El `where` dentro del `on conflict` es lo que lo hace seguro con dos
--    pedidos simultáneos: si el cupo está lleno, la actualización no se
--    aplica y no devuelve fila. Sin eso, dos capturas al mismo tiempo
--    podrían pasar las dos por encima del tope.
-- ------------------------------------------------------------
create or replace function public.consumir_credito_ia(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_periodo text;
  v_tope    integer;
  v_usados  integer;
  v_plan    text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_plan    := public.plan_efectivo_calculado(p_empresa);
  v_tope    := (public.limites_plan(v_plan)->>'capturas_mes')::integer;
  v_periodo := to_char(public.hoy_empresa(p_empresa), 'YYYY-MM');

  insert into public.uso_ia (empresa_id, periodo, usados)
  values (p_empresa, v_periodo, 1)
  on conflict (empresa_id, periodo) do update
    set usados = public.uso_ia.usados + 1, updated_at = now()
    where public.uso_ia.usados < v_tope
  returning usados into v_usados;

  if v_usados is null then
    select usados into v_usados from public.uso_ia
    where empresa_id = p_empresa and periodo = v_periodo;

    return jsonb_build_object(
      'permitido', false, 'usados', coalesce(v_usados, v_tope),
      'tope', v_tope, 'plan', v_plan);
  end if;

  return jsonb_build_object(
    'permitido', true, 'usados', v_usados, 'tope', v_tope, 'plan', v_plan);
end $fn$;

-- Cuánto va usado, sin gastar nada. Para mostrarlo en pantalla.
create or replace function public.uso_ia_actual(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_plan text;
  v_tope integer;
  v_usados integer;
begin
  if auth.uid() is null or not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_plan := public.plan_efectivo_calculado(p_empresa);
  v_tope := (public.limites_plan(v_plan)->>'capturas_mes')::integer;

  select usados into v_usados from public.uso_ia
  where empresa_id = p_empresa and periodo = to_char(public.hoy_empresa(p_empresa), 'YYYY-MM');

  return jsonb_build_object('usados', coalesce(v_usados, 0), 'tope', v_tope, 'plan', v_plan);
end $fn$;

-- ------------------------------------------------------------
-- 7. APLICAR SUSCRIPCIÓN · ahora acepta los tres planes y guarda el cobro
--
--    Sigue siendo exclusiva de service_role: la llama el webhook de la
--    pasarela, nunca el navegador.
-- ------------------------------------------------------------
create or replace function public.aplicar_suscripcion(
  p_empresa uuid,
  p_plan text,
  p_estado text default 'activa',
  p_periodo_inicio timestamptz default null,
  p_periodo_fin timestamptz default null,
  p_proveedor text default null,
  p_customer_id text default null,
  p_subscription_id text default null,
  p_periodo text default 'mensual',
  p_moneda text default null,
  p_importe numeric default null
)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if p_plan not in ('gratis', 'pro', 'negocio') then
    raise exception 'Plan desconocido: %', p_plan using errcode = '22023';
  end if;
  if p_estado not in ('activa', 'prueba', 'vencida', 'cancelada', 'morosa') then
    raise exception 'Estado desconocido: %', p_estado using errcode = '22023';
  end if;

  insert into public.suscripciones (
    empresa_id, plan, estado, periodo_inicio, periodo_fin,
    proveedor_pago, customer_id_externo, subscription_id_externo,
    periodo, moneda, importe, updated_at
  )
  values (p_empresa, p_plan, p_estado, p_periodo_inicio, p_periodo_fin,
          p_proveedor, p_customer_id, p_subscription_id,
          coalesce(p_periodo, 'mensual'), p_moneda, p_importe, now())
  on conflict (empresa_id) do update set
    plan = excluded.plan,
    estado = excluded.estado,
    periodo_inicio = excluded.periodo_inicio,
    periodo_fin = excluded.periodo_fin,
    proveedor_pago = coalesce(excluded.proveedor_pago, public.suscripciones.proveedor_pago),
    customer_id_externo = coalesce(excluded.customer_id_externo, public.suscripciones.customer_id_externo),
    subscription_id_externo = coalesce(excluded.subscription_id_externo, public.suscripciones.subscription_id_externo),
    periodo = coalesce(excluded.periodo, public.suscripciones.periodo),
    moneda = coalesce(excluded.moneda, public.suscripciones.moneda),
    importe = coalesce(excluded.importe, public.suscripciones.importe),
    cancela_al_vencer = (excluded.estado = 'cancelada'),
    updated_at = now();

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = p_plan where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);
end $fn$;

-- La firma vieja de 8 argumentos tiene que morir. Si conviven las dos,
-- cualquier llamada con menos argumentos que los que ambas aceptan por
-- defecto es ambigua y PostgreSQL la rechaza con "is not unique" — el
-- webhook de pago fallaría justo cuando hay plata de por medio.
drop function if exists public.aplicar_suscripcion(
  uuid, text, text, timestamptz, timestamptz, text, text, text);

revoke all on function public.aplicar_suscripcion(
  uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.aplicar_suscripcion(
  uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, numeric)
  to service_role;

-- ------------------------------------------------------------
-- 8. PRUEBA GRATIS
--
--    Se otorga una sola vez por empresa: `prueba_fin` queda escrito para
--    siempre, así que borrar la suscripción y volver a crearla no sirve
--    (la empresa es la misma fila). Se llama al crear la empresa.
-- ------------------------------------------------------------
create or replace function public.iniciar_prueba(p_empresa uuid, p_dias integer default 14)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_sus public.suscripciones;
  v_fin timestamptz;
begin
  select * into v_sus from public.suscripciones where empresa_id = p_empresa;

  if v_sus.empresa_id is null then
    raise exception 'Esa empresa no tiene suscripción.' using errcode = 'P0002';
  end if;
  if v_sus.prueba_fin is not null then
    return jsonb_build_object('otorgada', false, 'motivo', 'ya_usada', 'prueba_fin', v_sus.prueba_fin);
  end if;
  if v_sus.plan <> 'gratis' then
    return jsonb_build_object('otorgada', false, 'motivo', 'ya_paga', 'prueba_fin', null);
  end if;

  v_fin := now() + make_interval(days => greatest(coalesce(p_dias, 14), 1));

  update public.suscripciones
  set plan = 'pro', estado = 'prueba',
      periodo_inicio = now(), periodo_fin = v_fin, prueba_fin = v_fin,
      updated_at = now()
  where empresa_id = p_empresa;

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = 'pro' where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  return jsonb_build_object('otorgada', true, 'motivo', null, 'prueba_fin', v_fin);
end $fn$;

revoke all on function public.iniciar_prueba(uuid, integer) from public, anon, authenticated;
grant execute on function public.iniciar_prueba(uuid, integer) to service_role;

-- ------------------------------------------------------------
-- 9. CREAR EMPRESA · ahora nace con la prueba andando
--
--    Redefinición completa de la versión de la 003. Lo único que cambia es
--    el bloque final: en vez de dejar la suscripción en gratis, arranca la
--    prueba de 14 días. Que la primera experiencia sea la buena.
-- ------------------------------------------------------------
create or replace function public.crear_empresa(
  p_nombre text,
  p_moneda text default 'PYG',
  p_nombre_usuario text default null,
  p_zona text default 'America/Asuncion'
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_codigo text;
  v_intentos int := 0;
  v_fin timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre del negocio es muy corto.' using errcode = '22023';
  end if;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresa_accesos where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código de acceso.' using errcode = '55000';
    end if;
  end loop;

  insert into public.empresas (nombre, moneda, creada_por, zona_horaria)
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), auth.uid(),
          coalesce(nullif(trim(p_zona), ''), 'America/Asuncion'))
  returning id into v_id;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Propietario'), 'propietario');

  insert into public.empresa_accesos (empresa_id, codigo)
  values (v_id, v_codigo);

  -- La prueba se escribe acá directamente y no llamando a iniciar_prueba()
  -- porque esa función es de service_role: quien crea la empresa es un
  -- usuario común, y no queremos otorgarle ese permiso para esto.
  v_fin := now() + interval '14 days';
  insert into public.suscripciones (empresa_id, plan, estado, periodo_inicio, periodo_fin, prueba_fin)
  values (v_id, 'pro', 'prueba', now(), v_fin, v_fin);

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = 'pro' where id = v_id;
  perform set_config('orden.suscripcion_confiable', '0', true);

  return v_id;
end $fn$;

-- La firma vieja (3 argumentos) queda muerta: si no la borramos, PostgREST
-- ve dos funciones con el mismo nombre y no sabe cuál llamar.
drop function if exists public.crear_empresa(text, text, text);

revoke all on function public.crear_empresa(text, text, text, text) from public, anon;
grant execute on function public.crear_empresa(text, text, text, text) to authenticated;

revoke all on function public.consumir_credito_ia(uuid) from public, anon;
revoke all on function public.uso_ia_actual(uuid)       from public, anon;
grant execute on function public.consumir_credito_ia(uuid) to authenticated;
grant execute on function public.uso_ia_actual(uuid)       to authenticated;

-- ------------------------------------------------------------
-- 10. TOPE DE MIEMBROS POR PLAN
--
--    Se controla al ENTRAR, no de forma retroactiva: si una empresa ya
--    tiene cinco personas y su plan pasa a permitir dos, nadie queda
--    afuera. Echar gente que ya trabajaba adentro por un cambio de precio
--    sería romperle el negocio a alguien.
-- ------------------------------------------------------------
create or replace function public.unirse_empresa(
  p_codigo text,
  p_nombre_usuario text default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id      uuid;
  v_cuantos integer;
  v_tope    integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select a.empresa_id into v_id
  from public.empresa_accesos a
  where a.codigo = upper(trim(coalesce(p_codigo, ''))) and a.activo;

  if v_id is null then
    raise exception 'El código no corresponde a ninguna empresa.' using errcode = '42501';
  end if;

  -- Ya es miembro: no es un error, simplemente devolvemos la empresa.
  if exists (select 1 from public.miembros where empresa_id = v_id and user_id = auth.uid()) then
    return v_id;
  end if;

  select count(*)::int into v_cuantos from public.miembros where empresa_id = v_id;
  v_tope := (public.limites_plan(public.plan_efectivo_calculado(v_id))->>'miembros')::integer;

  if v_cuantos >= v_tope then
    raise exception 'Este negocio llegó al máximo de % personas de su plan. El plan Negocio permite más.', v_tope
      using errcode = '54000';
  end if;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Colaborador'), 'vendedor')
  on conflict (empresa_id, user_id) do nothing;

  return v_id;
end $fn$;

revoke all on function public.unirse_empresa(text, text) from public, anon;
grant execute on function public.unirse_empresa(text, text) to authenticated;
