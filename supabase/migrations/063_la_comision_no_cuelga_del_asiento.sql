-- ============================================================
-- ORDEN · Migración 063 · La comisión no cuelga de la contabilidad
--
-- LO QUE PASÓ, PORQUE ES EL MOTIVO DE ESTA MIGRACIÓN
--
-- Primera prueba real del programa de socios. Se recomendó, el referido entró
-- por el enlace, se le activó el plan con 60.000 de importe... y el socio no
-- vio ninguna comisión.
--
-- No falló nada del programa. Falló otra cosa: la empresa que representaba a
-- Orden en `ajustes_orden` había sido borrada, y la clave foránea dejó ese
-- campo en null. Así que al cobrar no había dónde anotar el ingreso, la
-- función avisó «no hay una empresa de Orden elegida», y como la comisión
-- colgaba de que ese ingreso existiera, no nació.
--
-- Dicho de otro modo: un problema de contabilidad interna le borró la
-- comisión a una persona que sí trajo un cliente que sí pagó.
--
-- LA REGLA QUE CAMBIA
--
-- La señal de que entró plata NO es la fila del libro. Es que una persona
-- escribió un importe en el panel porque vio la transferencia. Eso es lo que
-- la comisión mira ahora: plan pago más importe mayor que cero.
--
-- Lo que NO cambia: sin importe no hay comisión, sigue siendo una sola por
-- negocio, y si el cobro se anula la que está por pagar se cae igual. El
-- movimiento se guarda cuando existe, y ahora puede quedar en null —la
-- columna ya lo permitía—.
--
-- Y de paso, «esta cuenta ya pagó» en `usar_codigo_referido` se mide igual:
-- por el importe cobrado y no por el asiento, que era la misma trampa.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EL COBRO
-- ------------------------------------------------------------
create or replace function public.cambiar_plan_cuenta(
  p_empresa    uuid,
  p_plan       text,
  p_meses      integer default 1,
  p_nota       text default '',
  p_importe    numeric default null,
  p_vendedores integer default null
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
  v_tope     integer;
  v_personas integer;
  v_socio    uuid;
  v_pct      numeric;
  v_comision boolean := false;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  if p_plan not in ('gratis', 'pro', 'negocio') then
    raise exception 'Plan desconocido: %', p_plan using errcode = '22023';
  end if;

  if p_vendedores is not null and p_vendedores < -1 then
    raise exception 'El tope de vendedores no puede ser negativo.' using errcode = '22023';
  end if;

  select * into v_antes from public.suscripciones where empresa_id = p_empresa;
  if v_antes.empresa_id is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  select nombre into v_cliente from public.empresas where id = p_empresa;

  if p_plan = 'gratis' then
    v_estado := 'vencida';
    v_fin := now();
    -- Cortar el servicio borra el trato: si vuelve, se negocia de nuevo.
    v_tope := null;
  else
    v_estado := 'activa';
    -- Si todavía le queda tiempo pago, se le suma; si no, arranca hoy.
    v_fin := greatest(coalesce(v_antes.periodo_fin, now()), now())
             + make_interval(months => greatest(1, coalesce(p_meses, 1)));
    v_tope := case
      when p_vendedores is null then v_antes.tope_vendedores  -- no se toca
      when p_vendedores = -1    then null                     -- volver al plan
      else p_vendedores
    end;
  end if;

  update public.suscripciones
  set plan = p_plan,
      estado = v_estado,
      periodo_inicio = case when p_plan = 'gratis' then periodo_inicio else now() end,
      periodo_fin = v_fin,
      tope_vendedores = v_tope,
      proveedor_pago = case when p_plan = 'gratis' then proveedor_pago else 'transferencia' end,
      updated_at = now()
  where empresa_id = p_empresa;

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas
  set plan = case when p_plan = 'gratis' then 'gratis' else 'pro' end
  where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  -- ---- ¿le queda gente afuera del tope nuevo? ----
  --
  -- No se echa a nadie: bajar un número en un panel no puede sacarle el
  -- acceso a una persona que hoy está trabajando. Pero hay que decirlo, o
  -- el que lo bajó se entera cuando el cliente reclama.
  if v_tope is not null then
    select count(*)::int into v_personas from public.miembros where empresa_id = p_empresa;
    if v_personas > v_tope + 1 then
      v_aviso := 'Ojo: este negocio ya tiene ' || v_personas || ' personas y le habilitaste '
              || v_tope || ' vendedores (' || (v_tope + 1) || ' con el dueño). '
              || 'No se sacó a nadie, pero no va a poder sumar a nadie más.';
    end if;
  end if;

  -- ---- el cobro, como ingreso de Orden ----
  if p_plan <> 'gratis' and coalesce(p_importe, 0) > 0 then
    select empresa_id into v_orden from public.ajustes_orden where unica;

    if v_orden is null then
      v_aviso := coalesce(v_aviso || ' ', '')
              || 'No hay una empresa de Orden elegida, así que el cobro no se anotó en tus finanzas.';
    elsif v_orden = p_empresa then
      v_aviso := coalesce(v_aviso || ' ', '')
              || 'Esta ES tu empresa, así que no se anotó ningún ingreso.';
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
        v_aviso := coalesce(v_aviso || ' ', '')
                || 'La cuenta se activó, pero el ingreso no se pudo anotar: ' || sqlerrm;
      end;
    end if;
  end if;

  -- ---- la comisión de quien trajo al cliente (060, corregida acá) ----
  -- Nace cuando se cobra, una sola vez por negocio, y eso lo garantiza el
  -- índice único de comisiones y no el acordarse.
  --
  -- Antes colgaba de que el ingreso se hubiera podido anotar, y eso costó
  -- una comisión de verdad: la empresa que representaba a Orden estaba
  -- borrada, el ingreso no se pudo escribir, y el socio se quedó sin nada
  -- por un problema de contabilidad que no tenía nada que ver con él.
  --
  -- La señal de que entró plata no es la fila del libro: es que una
  -- persona escribió un importe porque vio la transferencia. Eso es lo
  -- que se mira. El movimiento se guarda si existe, y puede ser null.
  if p_plan <> 'gratis' and coalesce(p_importe, 0) > 0 then
    select r.socio_id into v_socio
    from public.referidos r
    join public.socios s on s.id = r.socio_id
    where r.empresa_id = p_empresa and s.activo;

    if v_socio is not null then
      select coalesce(a.comision_porcentaje, 50) into v_pct
      from public.ajustes_orden a where a.unica;

      begin
        insert into public.comisiones (
          socio_id, empresa_id, movimiento_id, base, porcentaje, monto
        ) values (
          v_socio, p_empresa, v_ingreso, p_importe, coalesce(v_pct, 50),
          round(p_importe * coalesce(v_pct, 50) / 100)
        );
        v_comision := true;
      exception when unique_violation then
        -- Ya cobró por este negocio. Se paga una sola vez: el primer pago.
        null;
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
    'tope_antes', v_antes.tope_vendedores,
    'tope_despues', v_tope,
    'ingreso_id', v_ingreso,
    'nota', left(coalesce(p_nota, ''), 300)
  ));

  return jsonb_build_object(
    'plan', p_plan, 'estado', v_estado, 'periodo_fin', v_fin,
    'tope_vendedores', v_tope,
    'personas_permitidas', public.tope_de_miembros(p_empresa),
    'ingreso_anotado', v_ingreso is not null,
    'comision_generada', v_comision,
    'aviso', v_aviso
  );
end $fn$;

-- ------------------------------------------------------------
-- 2. ENTRAR CON EL CÓDIGO DE ALGUIEN
-- ------------------------------------------------------------
create or replace function public.usar_codigo_referido(p_empresa uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_socio  public.socios;
  v_creada timestamptz;
  v_ya     uuid;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  -- Solo el dueño. Un vendedor no decide a nombre de quién queda el negocio
  -- donde trabaja.
  if not exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa and m.user_id = v_uid and m.rol = 'propietario'
  ) then
    raise exception 'Solo el dueño de la cuenta puede usar un código.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios
  where codigo = upper(trim(coalesce(p_codigo, '')));

  if v_socio.id is null then
    raise exception 'Ese código no existe. Revisalo con quien te lo pasó.' using errcode = '22023';
  end if;

  if not v_socio.activo then
    raise exception 'Ese código ya no está activo.' using errcode = '22023';
  end if;

  if v_socio.user_id = v_uid then
    raise exception 'Ese es tu propio código: no se gana comisión por uno mismo.'
      using errcode = '22023';
  end if;

  if v_socio.user_id is not null and exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa and m.user_id = v_socio.user_id
  ) then
    raise exception 'Esa persona trabaja en este negocio: no corresponde comisión.'
      using errcode = '22023';
  end if;

  select socio_id into v_ya from public.referidos where empresa_id = p_empresa;
  if v_ya is not null then
    if v_ya = v_socio.id then
      return jsonb_build_object('ok', true, 'socio', v_socio.nombre, 'repetido', true);
    end if;
    raise exception 'Esta cuenta ya entró con otro código.' using errcode = '22023';
  end if;

  select created_at into v_creada from public.empresas where id = p_empresa;
  if v_creada is null then
    raise exception 'Esa cuenta no existe.' using errcode = '22023';
  end if;

  if v_creada < now() - interval '30 days' then
    raise exception 'El código es para cuentas nuevas, y esta ya tiene más de un mes.'
      using errcode = '22023';
  end if;

  -- Ya pagó: se mira el importe cobrado y no el ingreso anotado, por lo
  -- mismo que arriba. Que la contabilidad de Orden haya fallado no
  -- convierte a un cliente que ya paga en un cliente nuevo.
  if exists (
    select 1 from public.registro_admin r
    where r.empresa_id = p_empresa and r.accion = 'cambiar_plan'
      and coalesce(r.detalle->>'importe', '') ~ '^[0-9]+(\.[0-9]+)?$'
      and (r.detalle->>'importe')::numeric > 0
  ) then
    raise exception 'Esta cuenta ya pagó, así que el código no corresponde.'
      using errcode = '22023';
  end if;

  insert into public.referidos (empresa_id, socio_id, origen, nota, creado_por)
  values (p_empresa, v_socio.id, 'link', '', v_uid);

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (v_uid, p_empresa, 'asignar_referido', jsonb_build_object(
    'socio_id', v_socio.id, 'socio', v_socio.nombre, 'codigo', v_socio.codigo,
    'origen', 'link'
  ));

  return jsonb_build_object('ok', true, 'socio', v_socio.nombre, 'repetido', false);
end $fn$;

revoke all on function public.usar_codigo_referido(uuid, text) from public, anon;
grant execute on function public.usar_codigo_referido(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 3. LAS COMISIONES QUE SE PERDIERON POR ESTO
--
--    Una, la de la prueba. Pero si no se recupera acá, hay que acordarse de
--    volver a activarle el plan al mismo cliente para que nazca —y eso le
--    suma un mes que no pagó—. Se arregla sola, ahora, con lo que ya quedó
--    escrito en el registro del panel.
--
--    Se toma el PRIMER cobro con importe de cada negocio traído que todavía
--    no tenga comisión. El primero y no el último: la comisión es del primer
--    pago, y si hubo dos, el segundo ya no le corresponde a nadie.
-- ------------------------------------------------------------
do $$
declare
  v_pct   numeric;
  v_hecho integer := 0;
  f       record;
begin
  select coalesce(comision_porcentaje, 50) into v_pct from public.ajustes_orden where unica;
  v_pct := coalesce(v_pct, 50);

  for f in
    select r.empresa_id, r.socio_id, c.importe, c.ingreso
    from public.referidos r
    cross join lateral (
      select (ra.detalle->>'importe')::numeric as importe,
             nullif(ra.detalle->>'ingreso_id', '')::uuid as ingreso
      from public.registro_admin ra
      where ra.empresa_id = r.empresa_id
        and ra.accion = 'cambiar_plan'
        and coalesce(ra.detalle->>'importe', '') ~ '^[0-9]+(\.[0-9]+)?$'
        and (ra.detalle->>'importe')::numeric > 0
      order by ra.created_at
      limit 1
    ) c
    where not exists (select 1 from public.comisiones x where x.empresa_id = r.empresa_id)
  loop
    insert into public.comisiones (
      socio_id, empresa_id, movimiento_id, base, porcentaje, monto, nota
    ) values (
      f.socio_id, f.empresa_id, f.ingreso, f.importe, v_pct,
      round(f.importe * v_pct / 100),
      'Recuperada: el cobro existió pero la comisión no se había generado.'
    )
    on conflict (empresa_id) do nothing;
    v_hecho := v_hecho + 1;
  end loop;

  raise notice 'Comisiones recuperadas: %', v_hecho;
end $$;
