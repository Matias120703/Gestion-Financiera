-- ============================================================
-- ORDEN · Migración 019 · Orden lleva las finanzas de Orden
--
-- LA IDEA
--
-- El panel de administración mostraba cuentas ajenas y nada más. Pero quien
-- administra Orden **también tiene un negocio**: cobra suscripciones, paga
-- Supabase y OpenAI, y probablemente deba algo. Eso es exactamente lo que
-- Orden sabe hacer.
--
-- Así que no se construye un módulo de finanzas adentro del panel. Se
-- **enlaza**: quien administra tiene su propia empresa en Orden, como
-- cualquier cliente, y el panel le suma dos cosas que ningún cliente
-- necesita:
--
--   1. cuando activa el plan de alguien, el cobro se anota solo como
--      ingreso en SU empresa;
--   2. un resumen de cuánto entró por suscripciones.
--
-- Todo lo demás —deudas, gastos, cierre del día, Excel— ya existe y funciona.
-- Escribir un segundo sistema de finanzas adentro del primero habría sido
-- mantener dos veces la misma matemática.
--
-- EL EFECTO SECUNDARIO QUE VALE LA PENA
--
-- El dueño de Orden pasa a usar Orden todos los días para su propia plata.
-- Es la mejor prueba que puede tener un producto: si algo molesta, lo va a
-- sentir antes que ningún cliente.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CUÁL ES LA EMPRESA DE ORDEN
--
--    Una sola fila. La restricción `unica` no es decorativa: sin ella, dos
--    filas harían que los cobros se anoten en una empresa distinta según el
--    orden en que salgan de la consulta, y eso es de los errores que se
--    descubren tarde y mal.
-- ------------------------------------------------------------
create table if not exists public.ajustes_orden (
  unica       boolean primary key default true check (unica),
  empresa_id  uuid references public.empresas (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.ajustes_orden enable row level security;

-- Solo la administración la lee. Un cliente no tiene por qué saber que
-- existe una empresa que representa a Orden.
drop policy if exists ajustes_orden_select on public.ajustes_orden;
create policy ajustes_orden_select on public.ajustes_orden
  for select to authenticated
  using (public.es_superadmin());

revoke all on public.ajustes_orden from anon, authenticated;
grant select on public.ajustes_orden to authenticated;

create or replace function public.definir_empresa_orden(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  -- Tiene que ser una empresa suya. Apuntar a la de un cliente haría que los
  -- cobros de Orden se anoten adentro del negocio de otro.
  if p_empresa is not null and not exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa and m.user_id = auth.uid()
      and m.rol in ('propietario', 'admin')
  ) then
    raise exception 'Solo podés elegir una empresa tuya.' using errcode = '42501';
  end if;

  insert into public.ajustes_orden (unica, empresa_id, updated_at)
  values (true, p_empresa, now())
  on conflict (unica) do update set empresa_id = excluded.empresa_id, updated_at = now();

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'definir_empresa_orden', jsonb_build_object('empresa', p_empresa));

  return jsonb_build_object('empresa_id', p_empresa);
end $fn$;

revoke all on function public.definir_empresa_orden(uuid) from public, anon;
grant execute on function public.definir_empresa_orden(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. ACTIVAR UN PLAN TAMBIÉN ANOTA EL COBRO
--
--    Redefine `cambiar_plan_cuenta()` de la 016 sumando `p_importe`.
--
--    El cobro se anota en un bloque aparte con su propio manejador de
--    errores, y eso es deliberado: **si falla anotar el ingreso, la cuenta
--    del cliente se activa igual**. La prioridad es que quien pagó pueda
--    trabajar; la contabilidad propia se arregla después y a mano. Al revés
--    —dejar sin servicio a alguien que pagó porque no se pudo escribir un
--    movimiento— sería absurdo.
-- ------------------------------------------------------------
create or replace function public.cambiar_plan_cuenta(
  p_empresa uuid,
  p_plan    text,
  p_meses   integer default 1,
  p_nota    text default '',
  p_importe numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes    public.suscripciones;
  v_fin      timestamptz;
  v_estado   text;
  v_orden    uuid;
  v_cliente  text;
  v_ingreso  uuid;
  v_aviso    text := null;
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

  select nombre into v_cliente from public.empresas where id = p_empresa;

  if p_plan = 'gratis' then
    v_estado := 'vencida';
    v_fin := now();
  else
    v_estado := 'activa';
    -- Si todavía le queda tiempo pago, se le suma; si no, arranca hoy.
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

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas
  set plan = case when p_plan = 'gratis' then 'gratis' else 'pro' end
  where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  -- ---- el cobro, como ingreso de Orden ----
  if p_plan <> 'gratis' and coalesce(p_importe, 0) > 0 then
    select empresa_id into v_orden from public.ajustes_orden where unica;

    if v_orden is null then
      v_aviso := 'No hay una empresa de Orden elegida, así que el cobro no se anotó en tus finanzas.';
    elsif v_orden = p_empresa then
      -- Cobrarse a uno mismo sería inventarse un ingreso.
      v_aviso := 'Esta ES tu empresa, así que no se anotó ningún ingreso.';
    else
      begin
        insert into public.movimientos (
          empresa_id, tipo, estado, fecha, descripcion, categoria,
          subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por
        ) values (
          v_orden, 'ingreso', 'activo', public.hoy_empresa(v_orden),
          'Suscripción ' || coalesce(v_cliente, 'cliente'), 'Suscripciones',
          p_importe, 0, p_importe, 0, 'transferencia',
          left(coalesce(v_cliente, ''), 80), auth.uid()
        )
        returning id into v_ingreso;
      exception when others then
        -- La cuenta del cliente YA quedó activa. Que no se pueda anotar el
        -- ingreso propio no puede deshacer eso.
        v_aviso := 'La cuenta se activó, pero el ingreso no se pudo anotar: ' || sqlerrm;
      end;
    end if;
  end if;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'cambiar_plan', jsonb_build_object(
    'plan_antes', v_antes.plan, 'plan_despues', p_plan,
    'estado_antes', v_antes.estado, 'estado_despues', v_estado,
    'vence_antes', v_antes.periodo_fin, 'vence_despues', v_fin,
    'meses', greatest(1, coalesce(p_meses, 1)),
    'importe', p_importe,
    'ingreso_id', v_ingreso,
    'nota', left(coalesce(p_nota, ''), 300)
  ));

  return jsonb_build_object(
    'plan', p_plan, 'estado', v_estado, 'periodo_fin', v_fin,
    'ingreso_anotado', v_ingreso is not null,
    'aviso', v_aviso
  );
end $fn$;

-- La firma de 4 argumentos queda muerta: si no se borra, PostgREST ve dos
-- funciones con el mismo nombre y no sabe cuál llamar.
drop function if exists public.cambiar_plan_cuenta(uuid, text, integer, text);

revoke all on function public.cambiar_plan_cuenta(uuid, text, integer, text, numeric)
  from public, anon;
grant execute on function public.cambiar_plan_cuenta(uuid, text, integer, text, numeric)
  to authenticated;

-- ------------------------------------------------------------
-- 3. LAS FINANZAS DE ORDEN, PARA EL PANEL
--
--    Cuánto entró por suscripciones y cómo está la propia empresa. Los
--    números salen de los mismos movimientos que ve cualquier cliente: no
--    hay una contabilidad paralela.
-- ------------------------------------------------------------
create or replace function public.finanzas_orden()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_orden uuid;
  v_hoy   date;
  v_res   jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select empresa_id into v_orden from public.ajustes_orden where unica;

  if v_orden is null then
    -- Sin configurar. La pantalla ofrece elegirla en vez de mostrar ceros,
    -- que parecerían un negocio fundido.
    return jsonb_build_object('configurada', false);
  end if;

  v_hoy := public.hoy_empresa(v_orden);

  select jsonb_build_object(
    'configurada', true,
    'empresa_id', v_orden,
    'nombre', (select e.nombre from public.empresas e where e.id = v_orden),
    'moneda', (select e.moneda from public.empresas e where e.id = v_orden),

    -- Suscripciones cobradas este mes y en total.
    'cobrado_mes', coalesce(sum(m.monto) filter (
      where m.categoria = 'Suscripciones'
        and m.fecha >= date_trunc('month', v_hoy)::date), 0),
    'cobrado_total', coalesce(sum(m.monto) filter (where m.categoria = 'Suscripciones'), 0),
    'cobros_mes', coalesce(count(*) filter (
      where m.categoria = 'Suscripciones'
        and m.fecha >= date_trunc('month', v_hoy)::date), 0),

    -- Y el negocio entero, no solo las suscripciones.
    'ingresos_mes', coalesce(sum(m.monto) filter (
      where m.tipo in ('venta', 'ingreso')
        and m.fecha >= date_trunc('month', v_hoy)::date), 0),
    'gastos_mes', coalesce(sum(m.monto) filter (
      where m.tipo = 'gasto'
        and m.fecha >= date_trunc('month', v_hoy)::date), 0)
  ) into v_res
  from public.movimientos m
  where m.empresa_id = v_orden and m.estado = 'activo';

  -- Lo que se debe sale de su propia tabla.
  return v_res || jsonb_build_object(
    'deuda_total', coalesce((
      select sum(d.saldo) from public.deudas d
      where d.empresa_id = v_orden and d.activa), 0),
    'deudas_vencidas', coalesce((
      select count(*) from public.deudas d
      where d.empresa_id = v_orden and d.activa
        and d.saldo > 0 and d.vence_el is not null and d.vence_el < v_hoy), 0)
  );
end $fn$;

revoke all on function public.finanzas_orden() from public, anon;
grant execute on function public.finanzas_orden() to authenticated;

-- ------------------------------------------------------------
-- 4. UNA CUENTA PERSONAL ES DE UNA SOLA PERSONA
--
--    Redefine `unirse_empresa()` de la 009.
--
--    Antes el tope salía solo del plan, y una cuenta personal en `pro`
--    permitía tres. No tiene sentido: quien lleva sus finanzas propias no
--    tiene vendedores. Y como el código de acceso se puede compartir por
--    WhatsApp sin querer, conviene que la base lo impida y no solo que la
--    pantalla lo esconda.
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
  v_tipo    text;
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

  select tipo_cuenta into v_tipo from public.empresas where id = v_id;
  if v_tipo = 'personal' then
    raise exception 'Esa es una cuenta personal: no admite más personas.'
      using errcode = '54000';
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
