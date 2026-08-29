-- ============================================================
-- ORDEN · Migración 016 · Tipo de cuenta y panel del dueño del sistema
--
-- Dos cosas que van juntas porque una no sirve sin la otra:
--
--   1. TIPO DE CUENTA. Orden pasa a atender dos públicos: alguien que lleva
--      sus finanzas personales (deudas, sueldo, gastos) y un comerciante
--      (todo lo anterior más ventas, productos y vendedores). No son dos
--      sistemas: el personal es el comercial MENOS ventas y productos.
--      De este campo cuelgan el largo de la prueba, los planes que se le
--      muestran y las pantallas que ve.
--
--   2. EL PANEL DEL DUEÑO DEL SISTEMA. Mientras el cobro sea por
--      transferencia y WhatsApp, alguien tiene que poder activar la cuenta
--      a mano después de recibir el pago. Sin esto no se le puede cobrar a
--      nadie.
--
-- LA REGLA QUE MANDA EN TODO ESTE ARCHIVO
--
-- El panel ve CUENTAS, no PLATA.
--
-- Para activarle el plan a alguien hace falta saber su nombre, su correo,
-- qué plan tiene y cuándo vence. NO hace falta saber cuánto vendió, qué
-- compró ni a quién le debe. Por eso ninguna función de acá devuelve un
-- monto, una descripción, un producto ni una deuda. Ni una.
--
-- Sí devuelven señales de USO —cuántos movimientos, cuándo fue el último,
-- cuántas capturas de IA consumió—, porque sin eso es imposible saber si
-- una cuenta está viva o si alguien está consumiendo de más. Un conteo y
-- una fecha no dicen nada del negocio de nadie.
--
-- Esto no es cosmética: es lo que permite prometerle a un comerciante que
-- sus números no los mira nadie, y que sea verdad.
--
-- LO QUE ESTA MIGRACIÓN NO PUEDE EVITAR
--
-- Quien administra la base de datos siempre puede leerla. Eso no lo cambia
-- ninguna función. Lo que sí se logra acá es que el panel no tenga forma de
-- mostrarlo, ni por accidente ni por comodidad.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TIPO DE CUENTA
--
--    Las empresas que ya existen son todas comercios: nacieron cuando
--    Orden era solo para comerciantes. Por eso el default y el relleno
--    son 'emprendedor'.
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists tipo_cuenta text not null default 'emprendedor';

do $$ begin
  alter table public.empresas
    add constraint empresas_tipo_cuenta_check
    check (tipo_cuenta in ('personal', 'emprendedor'));
exception when duplicate_object then null; end $$;

comment on column public.empresas.tipo_cuenta is
  'personal = finanzas propias (sin ventas ni productos). emprendedor = negocio completo.';

-- ------------------------------------------------------------
-- 2. LARGO DE LA PRUEBA, POR TIPO
--
--    Distintos a propósito. Una persona que anota sus gastos sabe en pocos
--    días si le sirve. Un comerciante necesita ver un pedazo de mes suyo
--    —una quincena con su cobro, sus cuotas y sus días flojos— antes de
--    decidir si vale 190.000 al mes.
--
--    Y hay algo más de fondo: Orden se apoya en el hábito (la racha, el
--    cierre del día). El hábito no se forma en una semana. Cortar la
--    prueba antes de que se forme es apagar el propio motor.
-- ------------------------------------------------------------
create or replace function public.dias_de_prueba(p_tipo text)
returns integer language sql immutable set search_path = public as $fn$
  select case coalesce(p_tipo, 'emprendedor')
    when 'personal' then 14
    else 20
  end;
$fn$;

grant execute on function public.dias_de_prueba(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. QUIÉN ADMINISTRA EL SISTEMA
--
--    Una tabla y no una columna en `miembros` porque no es un rol dentro
--    de una empresa: es un rol por ENCIMA de todas. Mezclarlo con los roles
--    de empresa haría que un error en una consulta de permisos de negocio
--    pudiera, en el peor caso, dar permisos de sistema.
--
--    Nadie se puede agregar solo. La tabla no tiene política de INSERT para
--    usuarios: se carga desde el editor SQL de Supabase o con service_role.
--    Un panel que se pudiera auto-otorgar sería una puerta abierta.
-- ------------------------------------------------------------
create table if not exists public.superadmins (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  nota       text not null default '',
  created_at timestamptz not null default now()
);

alter table public.superadmins enable row level security;

-- Solo se ve a sí mismo. Sirve para que la interfaz sepa si mostrar el
-- acceso al panel, sin revelar quiénes más lo son.
drop policy if exists superadmins_select on public.superadmins;
create policy superadmins_select on public.superadmins
  for select to authenticated
  using (usuario_id = auth.uid());

-- Sin políticas de insert, update ni delete. Y además, revocado a nivel de
-- privilegio: Supabase le otorga por defecto todos los permisos de tabla a
-- `authenticated` sobre lo nuevo que aparece en `public`, así que confiar
-- solo en "no hay policy" sería confiar en una configuración de la nube que
-- no controlamos. Dos cerrojos, no uno.
revoke all on public.superadmins from anon, authenticated;
grant select on public.superadmins to authenticated;

create or replace function public.es_superadmin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.superadmins s where s.usuario_id = auth.uid()
  );
$fn$;

-- Se revoca de PUBLIC, no solo de anon. Es la misma trampa de la migración
-- 012: PostgreSQL le da EXECUTE a PUBLIC sobre toda función nueva, y `anon`
-- hereda de PUBLIC. Revocarle solo a anon deja la puerta igual de abierta.
-- Acá el daño sería chico —para un anónimo siempre devuelve falso— pero la
-- regla no admite excepciones «inofensivas»: la próxima no lo sería.
revoke all on function public.es_superadmin() from public, anon;
grant execute on function public.es_superadmin() to authenticated;

-- ------------------------------------------------------------
-- 4. REGISTRO DE LO QUE HACE EL PANEL
--
--    Todo lo que el panel modifica queda anotado, con quién, cuándo y qué
--    había antes.
--
--    No es burocracia. El día que alguien diga «me desactivaste la cuenta
--    sin avisar» o «yo pagué y no me activaste», la única forma de saber
--    quién tiene razón es esto. Y como el panel puede cambiar el plan de
--    cualquiera, sin registro no habría forma de auditar un error propio.
-- ------------------------------------------------------------
create table if not exists public.registro_admin (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references auth.users (id) on delete set null,
  empresa_id uuid references public.empresas (id) on delete set null,
  accion     text not null,
  detalle    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists registro_admin_empresa_idx
  on public.registro_admin (empresa_id, created_at desc);
create index if not exists registro_admin_fecha_idx
  on public.registro_admin (created_at desc);

alter table public.registro_admin enable row level security;

drop policy if exists registro_admin_select on public.registro_admin;
create policy registro_admin_select on public.registro_admin
  for select to authenticated
  using (public.es_superadmin());

-- Se escribe solo desde las funciones de abajo, que son security definer.
-- Nadie puede insertar a mano: un registro de auditoría en el que cualquiera
-- puede escribir no sirve para auditar nada.
revoke all on public.registro_admin from anon, authenticated;
grant select on public.registro_admin to authenticated;

-- ------------------------------------------------------------
-- 5. LISTAR CUENTAS
--
--    El corazón del panel. Devuelve una fila por empresa con lo necesario
--    para administrarla y NADA de lo que pasa adentro.
--
--    `dias_restantes` es lo que convierte esta lista en una herramienta de
--    trabajo: ordenada por ese número, arriba quedan los que están por
--    vencer, que son a quienes hay que escribirles hoy.
-- ------------------------------------------------------------
create or replace function public.listar_cuentas(
  p_busqueda text default null,
  p_estado   text default null,
  p_limite   integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
  v_periodo text;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  v_periodo := to_char(now(), 'YYYY-MM');

  select coalesce(jsonb_agg(x order by x->>'orden'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id',   e.id,
      'nombre',       e.nombre,
      'tipo_cuenta',  e.tipo_cuenta,
      'moneda',       e.moneda,
      'creada',       e.created_at,

      -- Con quién hablar. Es dato de contacto, no dato del negocio.
      'propietario',  coalesce(prop.nombre, 'Sin nombre'),
      'correo',       coalesce(u.email, ''),

      'plan',         public.plan_efectivo_calculado(e.id),
      'plan_guardado', s.plan,
      'estado',       s.estado,
      'periodo_fin',  s.periodo_fin,
      'prueba_fin',   s.prueba_fin,

      -- Negativo = ya venció. Es el número por el que se ordena.
      'dias_restantes', case
        when s.periodo_fin is null then null
        else floor(extract(epoch from (s.periodo_fin - now())) / 86400)::integer
      end,

      'miembros', (select count(*) from public.miembros m where m.empresa_id = e.id),

      -- Señales de vida. Un conteo y una fecha: cuántas veces se usó el
      -- sistema y cuándo fue la última. Sin montos: no se puede deducir
      -- de acá cuánto factura nadie.
      'movimientos', (select count(*) from public.movimientos mv where mv.empresa_id = e.id),
      'ultima_actividad', (select max(mv.created_at) from public.movimientos mv where mv.empresa_id = e.id),

      -- Cuánta IA consumió este mes. Lo que permite ver al raro antes de
      -- que la factura de OpenAI lo muestre.
      'ia_usada', coalesce((
        select ui.usados from public.uso_ia ui
        where ui.empresa_id = e.id and ui.periodo = v_periodo
      ), 0),
      'ia_tope', (public.limites_plan(public.plan_efectivo_calculado(e.id))->>'capturas_mes')::integer,

      -- Ordena: primero lo vencido y lo que vence pronto, después el resto
      -- por fecha de creación. Se arma como texto con relleno de ceros
      -- porque jsonb_agg ordena por el valor de la clave, no numéricamente.
      'orden', lpad(
        greatest(0, coalesce(
          floor(extract(epoch from (s.periodo_fin - now())) / 86400)::integer + 1000,
          9999))::text, 5, '0')
    ) as x
    from public.empresas e
    join public.suscripciones s on s.empresa_id = e.id
    left join public.miembros prop
      on prop.empresa_id = e.id and prop.rol = 'propietario'
    left join auth.users u on u.id = prop.user_id
    where (
        p_busqueda is null
        or trim(p_busqueda) = ''
        or e.nombre ilike '%' || trim(p_busqueda) || '%'
        or coalesce(u.email, '') ilike '%' || trim(p_busqueda) || '%'
      )
      and (p_estado is null or trim(p_estado) = '' or s.estado = p_estado)
    limit greatest(1, least(coalesce(p_limite, 200), 500))
  ) t;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 6. RESUMEN DEL PANEL
--
--    Los cuatro números que hay que ver al abrir: cuántas cuentas hay,
--    cuántas están probando, cuántas pagan y —el importante— cuántas
--    vencen esta semana, que es la lista de a quiénes escribir.
-- ------------------------------------------------------------
create or replace function public.resumen_panel()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'cuentas',      count(*),
    'personales',   count(*) filter (where e.tipo_cuenta = 'personal'),
    'comercios',    count(*) filter (where e.tipo_cuenta = 'emprendedor'),
    'en_prueba',    count(*) filter (where s.estado = 'prueba' and s.periodo_fin > now()),
    'pagando',      count(*) filter (where s.estado = 'activa' and s.plan <> 'gratis'),
    'vencidas',     count(*) filter (where s.periodo_fin is not null and s.periodo_fin <= now()),
    'vencen_semana', count(*) filter (
      where s.periodo_fin between now() and now() + interval '7 days'
    ),
    -- Cuánta IA se consumió este mes entre todos. Es el número que hay que
    -- mirar para saber si la factura de OpenAI va a sorprender.
    'ia_mes', coalesce((
      select sum(ui.usados) from public.uso_ia ui
      where ui.periodo = to_char(now(), 'YYYY-MM')
    ), 0)
  ) into v_res
  from public.empresas e
  join public.suscripciones s on s.empresa_id = e.id;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 7. CAMBIAR EL PLAN DE UNA CUENTA
--
--    Esto es lo que se aprieta cuando entra una transferencia.
--
--    Está separado de `aplicar_suscripcion()` —la que usa el webhook de
--    Stripe— aunque hagan algo parecido. El motivo: aquella confía en una
--    firma criptográfica, esta confía en una persona. Mezclarlas obligaría
--    a que la de la firma acepte también llamadas de un humano, y ahí se
--    pierde la garantía de que el plan solo cambia con un pago verificado.
-- ------------------------------------------------------------
create or replace function public.cambiar_plan_cuenta(
  p_empresa uuid,
  p_plan    text,
  p_meses   integer default 1,
  p_nota    text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes  public.suscripciones;
  v_fin    timestamptz;
  v_estado text;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  if p_plan not in ('gratis', 'pro', 'negocio') then
    raise exception 'Plan desconocido: %', p_plan using errcode = '22023';
  end if;

  select * into v_antes from public.suscripciones where empresa_id = p_empresa;
  if v_antes.empresa_id is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  if p_plan = 'gratis' then
    -- Bajar a gratis es cortar el servicio: vence ya.
    v_estado := 'vencida';
    v_fin := now();
  else
    v_estado := 'activa';
    -- Si todavía le queda tiempo pago, se le suma; si no, arranca hoy.
    -- Sin esto, activarle el mes a alguien que pagó antes de tiempo le
    -- comería los días que ya tenía.
    v_fin := greatest(coalesce(v_antes.periodo_fin, now()), now())
             + make_interval(months => greatest(1, coalesce(p_meses, 1)));
  end if;

  update public.suscripciones
  set plan = p_plan,
      estado = v_estado,
      periodo_inicio = case when p_plan = 'gratis' then periodo_inicio else now() end,
      periodo_fin = v_fin,
      proveedor_pago = case when p_plan = 'gratis' then proveedor_pago else 'transferencia' end,
      updated_at = now()
  where empresa_id = p_empresa;

  -- El espejo en `empresas.plan` solo acepta 'gratis' o 'pro'; 'negocio'
  -- se guarda como 'pro' porque para esa columna lo único que importa es
  -- si paga o no. La autoridad es `suscripciones`.
  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas
  set plan = case when p_plan = 'gratis' then 'gratis' else 'pro' end
  where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'cambiar_plan', jsonb_build_object(
    'plan_antes', v_antes.plan, 'plan_despues', p_plan,
    'estado_antes', v_antes.estado, 'estado_despues', v_estado,
    'vence_antes', v_antes.periodo_fin, 'vence_despues', v_fin,
    'meses', greatest(1, coalesce(p_meses, 1)),
    'nota', left(coalesce(p_nota, ''), 300)
  ));

  return jsonb_build_object('plan', p_plan, 'estado', v_estado, 'periodo_fin', v_fin);
end $fn$;

-- ------------------------------------------------------------
-- 8. ESTIRAR LA PRUEBA
--
--    Para el caso real: alguien está por vencer, dice «mañana te
--    transfiero», y no se le va a cortar el servicio por 24 horas.
--
--    Solo estira, nunca acorta. Recortarle la prueba a alguien que ya la
--    está usando es de las cosas que no deberían poder hacerse de un clic.
-- ------------------------------------------------------------
create or replace function public.extender_prueba(
  p_empresa uuid,
  p_dias    integer default 7,
  p_nota    text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes public.suscripciones;
  v_fin   timestamptz;
  v_dias  integer;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  v_dias := greatest(1, least(coalesce(p_dias, 7), 90));

  select * into v_antes from public.suscripciones where empresa_id = p_empresa;
  if v_antes.empresa_id is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  -- Desde hoy si ya venció, desde el vencimiento si todavía corre.
  v_fin := greatest(coalesce(v_antes.periodo_fin, now()), now())
           + make_interval(days => v_dias);

  update public.suscripciones
  set estado = 'prueba', plan = case when plan = 'gratis' then 'pro' else plan end,
      periodo_fin = v_fin, prueba_fin = v_fin, updated_at = now()
  where empresa_id = p_empresa;

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = 'pro' where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'extender_prueba', jsonb_build_object(
    'dias', v_dias, 'vence_antes', v_antes.periodo_fin, 'vence_despues', v_fin,
    'nota', left(coalesce(p_nota, ''), 300)
  ));

  return jsonb_build_object('periodo_fin', v_fin, 'dias', v_dias);
end $fn$;

-- ------------------------------------------------------------
-- 9. CAMBIAR EL TIPO DE CUENTA
--
--    Para el que se registró como personal y abrió un negocio. Al revés
--    también, aunque casi no va a pasar.
--
--    Importante: NO borra nada. Una cuenta que pasa de emprendedor a
--    personal deja de ver ventas y productos, pero los datos quedan donde
--    están. Si vuelve a comercio, los encuentra intactos.
-- ------------------------------------------------------------
create or replace function public.cambiar_tipo_cuenta(
  p_empresa uuid,
  p_tipo    text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes text;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  if p_tipo not in ('personal', 'emprendedor') then
    raise exception 'Tipo de cuenta desconocido: %', p_tipo using errcode = '22023';
  end if;

  select tipo_cuenta into v_antes from public.empresas where id = p_empresa;
  if v_antes is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  update public.empresas set tipo_cuenta = p_tipo where id = p_empresa;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'cambiar_tipo', jsonb_build_object(
    'antes', v_antes, 'despues', p_tipo
  ));

  return jsonb_build_object('tipo_cuenta', p_tipo);
end $fn$;

-- ------------------------------------------------------------
-- 10. HISTORIAL DE UNA CUENTA
--
--     Todo lo que se le hizo a una cuenta desde el panel. Es lo que se
--     mira cuando alguien reclama.
-- ------------------------------------------------------------
create or replace function public.historial_cuenta(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'accion', r.accion,
    'detalle', r.detalle,
    'cuando', r.created_at,
    'quien', coalesce(u.email, 'sistema')
  ) order by r.created_at desc), '[]'::jsonb) into v_res
  from public.registro_admin r
  left join auth.users u on u.id = r.actor_id
  where r.empresa_id = p_empresa;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 11. CREAR EMPRESA · ahora con tipo de cuenta y prueba según el tipo
--
--     Redefinición completa de la versión de la 009. Lo único que cambia:
--     recibe el tipo de cuenta y el largo de la prueba sale de él.
-- ------------------------------------------------------------
create or replace function public.crear_empresa(
  p_nombre text,
  p_moneda text default 'PYG',
  p_nombre_usuario text default null,
  p_zona text default 'America/Asuncion',
  p_tipo_cuenta text default 'emprendedor'
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_codigo text;
  v_intentos int := 0;
  v_fin timestamptz;
  v_tipo text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre del negocio es muy corto.' using errcode = '22023';
  end if;

  v_tipo := case when p_tipo_cuenta = 'personal' then 'personal' else 'emprendedor' end;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresa_accesos where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código de acceso.' using errcode = '55000';
    end if;
  end loop;

  insert into public.empresas (nombre, moneda, creada_por, zona_horaria, tipo_cuenta)
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), auth.uid(),
          coalesce(nullif(trim(p_zona), ''), 'America/Asuncion'), v_tipo)
  returning id into v_id;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Propietario'), 'propietario');

  insert into public.empresa_accesos (empresa_id, codigo)
  values (v_id, v_codigo);

  -- La prueba se escribe acá directamente y no llamando a iniciar_prueba()
  -- porque esa función es de service_role: quien crea la empresa es un
  -- usuario común, y no queremos otorgarle ese permiso para esto.
  v_fin := now() + make_interval(days => public.dias_de_prueba(v_tipo));
  insert into public.suscripciones (empresa_id, plan, estado, periodo_inicio, periodo_fin, prueba_fin)
  values (v_id, 'pro', 'prueba', now(), v_fin, v_fin);

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = 'pro' where id = v_id;
  perform set_config('orden.suscripcion_confiable', '0', true);

  return v_id;
end $fn$;

-- La firma de 4 argumentos queda muerta: si no se borra, PostgREST ve dos
-- funciones con el mismo nombre y no sabe cuál llamar.
drop function if exists public.crear_empresa(text, text, text, text);

-- ------------------------------------------------------------
-- 12. PERMISOS
--
--     Todo revocado de PUBLIC, no solo de anon: anon hereda de PUBLIC, y
--     revocarle solo a anon deja la puerta abierta. Ver migración 012.
-- ------------------------------------------------------------
revoke all on function public.listar_cuentas(text, text, integer)      from public, anon;
revoke all on function public.resumen_panel()                          from public, anon;
revoke all on function public.cambiar_plan_cuenta(uuid, text, integer, text) from public, anon;
revoke all on function public.extender_prueba(uuid, integer, text)     from public, anon;
revoke all on function public.cambiar_tipo_cuenta(uuid, text)          from public, anon;
revoke all on function public.historial_cuenta(uuid)                   from public, anon;
revoke all on function public.crear_empresa(text, text, text, text, text) from public, anon;

grant execute on function public.listar_cuentas(text, text, integer)      to authenticated;
grant execute on function public.resumen_panel()                          to authenticated;
grant execute on function public.cambiar_plan_cuenta(uuid, text, integer, text) to authenticated;
grant execute on function public.extender_prueba(uuid, integer, text)     to authenticated;
grant execute on function public.cambiar_tipo_cuenta(uuid, text)          to authenticated;
grant execute on function public.historial_cuenta(uuid)                   to authenticated;
grant execute on function public.crear_empresa(text, text, text, text, text) to authenticated;

-- El grant es a `authenticated` y no a un rol especial porque el permiso de
-- verdad lo pone `es_superadmin()` adentro de cada función. Un usuario
-- común que llame a cualquiera de estas recibe un 42501, no una fila.
