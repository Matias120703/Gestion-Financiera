-- ============================================================
-- 103 · LA COMISIÓN GUARDA LO QUE ENTRÓ
-- ============================================================
--
-- La 102 cambió de dónde sale la comisión del socio: la mitad del precio de
-- lista de UN mes del plan, y no de lo que entró. Para eso `comisiones.base`
-- pasó a guardar el precio de lista, y `monto` = least(base × % / 100,
-- importe). La regla está bien y no se toca. Lo que se perdió en el camino
-- es otro número: cuánta plata entró de verdad.
--
-- HASTA LA 102, `base` ERA LO QUE PAGÓ EL CLIENTE
--
-- Desde la 060 `base` era el importe del cobro, y el panel de la
-- administración (src/components/PanelSocios.tsx) lo usaba así: «pagó
-- {base}» y, al lado de la comisión, «te queda {base − monto}», lo que le
-- queda a Orden de ese pago. Con la 102 esas dos líneas empezaron a mentir
-- sin que nada fallara:
--
--     Básico con el descuento de la prueba (078)
--       entró              90.200
--       base (la lista)   110.000
--       comisión           55.000
--       el panel decía    «pagó 110.000 · te queda 55.000»
--       la verdad          pagó 90.200 · te quedan 35.200
--
-- Con el año pagado de una miente al revés: entran 1.210.000, el panel
-- dice «pagó 110.000 · te queda 55.000», y a Orden le quedan 1.155.000.
--
-- Y la tabla ya no tenía de dónde sacarlo: el importe no se guardaba en
-- ningún otro lado de `comisiones`, porque hasta la 102 ERA `base`.
--
-- UNA COLUMNA MÁS, NO OTRA CUENTA
--
-- `importe` guarda lo que entró en el cobro que generó la comisión: el
-- mismo número que alguien escribió en el panel porque vio la
-- transferencia (`p_importe`). Quedan tres números, cada uno con su nombre:
--
--     importe   lo que entró                    (esta migración)
--     base      el precio de lista de un mes    (102)
--     monto     lo que se lleva el socio        (060, 102)
--
-- No se recalcula nada: ni la base ni el monto de ninguna comisión cambian.
--
-- Nace en los mismos dos lugares que la comisión (la 102 verificó en
-- producción que no hay un tercero): `cambiar_plan_cuenta` guarda
-- `p_importe`, y `asignar_referido` el importe del primer pago
-- (`v_primero.importe`, del mismo renglón del registro del que ya sacaba el
-- plan y el ingreso). Las dos son copia EXACTA de la versión viva (la de la
-- 102, verificada en producción con pg_get_functiondef) con esa sola columna
-- de más en el insert. `listar_comisiones` (066, viva, también verificada)
-- devuelve `importe` al lado de `base`, y nada más cambia.
--
-- LAS QUE YA EXISTEN
--
-- En producción hoy hay cero comisiones, pero una migración sirve para
-- cualquier base. El importe se reconstruye así, del dato más seguro al
-- menos:
--
--   1. El renglón de `registro_admin` de ESE cobro: el 'cambiar_plan' de la
--      misma empresa cuyo `ingreso_id` es el `movimiento_id` de la
--      comisión, o el que se escribió en la misma transacción (misma
--      `created_at`: `cambiar_plan_cuenta` escribe la comisión y el
--      registro en la misma llamada, y `now()` es el de la transacción).
--      El registro no se edita nunca: es el número que se escribió.
--   2. Si la comisión nació en `asignar_referido` (hay un renglón
--      'asignar_referido' de esa empresa con `comision_generada`), el
--      primer 'cambiar_plan' con importe > 0: el mismo criterio con el que
--      esa función eligió el pago (068, 102).
--   3. El `monto` del ingreso de Orden que la originó (`movimiento_id`).
--      Va último porque un movimiento se puede editar y el registro no.
--
-- El criterio 2 NO se usa para cualquier comisión: una que nació en
-- `cambiar_plan_cuenta` pudo nacer en el segundo o el tercer pago (el
-- socio se anotó tarde: grupo 4 de pruebas/comisiones.test.js), y el primer
-- pago sería otro número. Mejor null que un número equivocado con cara de
-- cierto.
--
-- Lo que no se puede reconstruir queda en null, y el panel cae en `base`,
-- como hasta hoy. Para una comisión anterior a la 102 eso es exacto (ahí
-- `base` ERA lo que entró); para una posterior es lo mismo que ya mostraba.
-- El relleno solo toca las que tienen `importe` null: correrlo dos veces
-- no cambia nada.
--
-- QUIÉN VE ESTO: LOS MISMOS DE HOY
--
-- `comisiones` no tiene ningún permiso para anon ni authenticated: la 060
-- hizo `revoke all` y nunca hubo grants por columna (verificado en
-- producción con information_schema.column_privileges). La columna nueva
-- no se abre a nadie; se lee solo por función, y `listar_comisiones` es
-- solo de la administración (`es_superadmin`).
--
-- El socio NO ve cuánto pagó el negocio que trajo, y sigue sin verlo:
-- `mi_panel_socio` (070, viva) le devuelve el monto de SU comisión y ni
-- siquiera la base, así que no se toca. `listar_referidos` devuelve `base`,
-- también solo a la administración, y el panel no la muestra: tampoco se
-- toca.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA COLUMNA
--
--    Null en las viejas que no se puedan reconstruir (ver la cabecera).
--    Misma precisión y misma regla que `base` y `monto`: nunca negativa.
-- ------------------------------------------------------------
alter table public.comisiones
  add column if not exists importe numeric(14,2) check (importe >= 0);

comment on column public.comisiones.importe is
  'Lo que entró en el cobro que generó la comisión (103). base = precio de lista de un mes (102); monto = lo del socio.';

-- ------------------------------------------------------------
-- 2. EL RELLENO DE LAS QUE YA EXISTEN
--
--    En el orden de la cabecera: el registro de ESE cobro, el primer pago
--    si nació en `asignar_referido`, el ingreso de Orden. Solo las que
--    tienen `importe` null.
-- ------------------------------------------------------------
update public.comisiones c
set importe = coalesce(
  -- 1. El renglón del registro de ese mismo cobro.
  (select (ra.detalle->>'importe')::numeric
   from public.registro_admin ra
   where ra.empresa_id = c.empresa_id
     and ra.accion = 'cambiar_plan'
     and coalesce(ra.detalle->>'importe', '') ~ '^[0-9]+(\.[0-9]+)?$'
     and (ra.detalle->>'importe')::numeric > 0
     and ((c.movimiento_id is not null
           and ra.detalle->>'ingreso_id' = c.movimiento_id::text)
          or ra.created_at = c.created_at)
   order by ra.created_at
   limit 1),
  -- 2. Nació al anotar un código perdido: el primer pago, como en la 068.
  (select (ra.detalle->>'importe')::numeric
   from public.registro_admin ra
   where ra.empresa_id = c.empresa_id
     and ra.accion = 'cambiar_plan'
     and coalesce(ra.detalle->>'importe', '') ~ '^[0-9]+(\.[0-9]+)?$'
     and (ra.detalle->>'importe')::numeric > 0
     and exists (
       select 1 from public.registro_admin rr
       where rr.empresa_id = c.empresa_id
         and rr.accion = 'asignar_referido'
         and rr.detalle->>'comision_generada' = 'true'
     )
   order by ra.created_at
   limit 1),
  -- 3. El ingreso de Orden que la originó.
  (select mv.monto from public.movimientos mv where mv.id = c.movimiento_id)
)
where c.importe is null;

-- ------------------------------------------------------------
-- 3. EL COBRO (063, 102): LA COMISIÓN GUARDA LO QUE ENTRÓ
--
--    Copia exacta de la viva (102). Cambia solo el insert de la comisión:
--    una columna más, `importe`, con `p_importe`.
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
  v_base     numeric;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  -- 'basico' faltaba desde la 077 (ver la cabecera de la 102).
  if p_plan not in ('gratis', 'basico', 'pro', 'negocio') then
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

      -- Desde la 102: la mitad del precio de lista de un mes del plan que
      -- se activó, nunca más de lo que entró.
      v_base := public.base_de_comision(p_empresa, p_plan, p_importe);

      begin
        -- Desde la 103: y lo que entró de verdad, que ya no es la base.
        insert into public.comisiones (
          socio_id, empresa_id, movimiento_id, base, porcentaje, monto, importe
        ) values (
          v_socio, p_empresa, v_ingreso, v_base, coalesce(v_pct, 50),
          public.monto_de_comision(p_empresa, v_base, coalesce(v_pct, 50), p_importe),
          p_importe
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
-- 4. EL CÓDIGO QUE SE HABÍA PERDIDO (068, 102): LO MISMO
--
--    Copia exacta de la viva (102). Cambia solo el insert de la comisión:
--    `importe` es el del primer pago, del mismo renglón del registro del
--    que ya salen el plan y el ingreso (`v_primero.importe`).
-- ------------------------------------------------------------
create or replace function public.asignar_referido(
  p_empresa uuid,
  p_codigo  text,
  p_nota    text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_socio      public.socios;
  v_ya         uuid;
  v_pagos      integer;
  v_aviso      text := null;
  v_rechazo    public.codigos_rechazados;
  v_por_enlace boolean := false;
  v_primero    record;
  v_pct        numeric;
  v_comision   boolean := false;
  v_base       numeric;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios
  where codigo = upper(trim(coalesce(p_codigo, '')));

  if v_socio.id is null then
    raise exception 'No hay ningún socio con ese código.' using errcode = '22023';
  end if;

  if not v_socio.activo then
    raise exception '% está desactivado como socio. Activalo en «Socios» y volvé a anotarlo.',
      v_socio.nombre using errcode = '22023';
  end if;

  if not exists (select 1 from public.empresas where id = p_empresa) then
    raise exception 'Ese negocio no existe.' using errcode = '22023';
  end if;

  if v_socio.user_id is not null and exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa and m.user_id = v_socio.user_id
  ) then
    raise exception
      '% trabaja en ese negocio: no se cobra comisión por traerse a uno mismo.',
      v_socio.nombre using errcode = '22023';
  end if;

  select socio_id into v_ya from public.referidos where empresa_id = p_empresa;

  if v_ya is not null then
    if v_ya = v_socio.id then
      return jsonb_build_object(
        'ok', true, 'socio', v_socio.nombre,
        'aviso', 'Ya estaba anotado a nombre de ' || v_socio.nombre || '.'
      );
    end if;
    raise exception
      'Ese negocio ya está anotado a nombre de %. Se cuenta una sola vez y no se cambia.',
      coalesce((select nombre from public.socios where id = v_ya), 'otra persona')
      using errcode = '22023';
  end if;

  -- ¿Esta cuenta intentó entrar con ESTE código y se lo rechazaron?
  select * into v_rechazo from public.codigos_rechazados where empresa_id = p_empresa;
  v_por_enlace := v_rechazo.empresa_id is not null and v_rechazo.codigo = v_socio.codigo;

  -- «Ya pagó» se mide por el importe, no por el asiento (ver arriba).
  select count(*)::int into v_pagos
  from public.registro_admin r
  where r.empresa_id = p_empresa
    and r.accion = 'cambiar_plan'
    and coalesce(r.detalle->>'importe', '') ~ '^[0-9]+(\.[0-9]+)?$'
    and (r.detalle->>'importe')::numeric > 0;

  insert into public.referidos (empresa_id, socio_id, origen, nota, creado_por)
  values (
    p_empresa, v_socio.id,
    case when v_por_enlace then 'link' else 'a_mano' end,
    left(coalesce(p_nota, ''), 300), auth.uid()
  );

  if v_por_enlace and v_pagos > 0 then
    -- Entró con el enlace antes de pagar: la comisión del primer pago es
    -- suya, igual que si el código no se hubiera perdido. El primero y no
    -- el último, por la misma razón que en la 063.
    select (ra.detalle->>'importe')::numeric as importe,
           nullif(ra.detalle->>'ingreso_id', '')::uuid as ingreso,
           ra.detalle->>'plan_despues' as plan,
           ra.created_at
    into v_primero
    from public.registro_admin ra
    where ra.empresa_id = p_empresa
      and ra.accion = 'cambiar_plan'
      and coalesce(ra.detalle->>'importe', '') ~ '^[0-9]+(\.[0-9]+)?$'
      and (ra.detalle->>'importe')::numeric > 0
    order by ra.created_at
    limit 1;

    select coalesce(a.comision_porcentaje, 50) into v_pct from public.ajustes_orden a where a.unica;
    v_pct := coalesce(v_pct, 50);

    -- Desde la 102: el precio de lista del plan de ESE primer pago.
    v_base := public.base_de_comision(p_empresa, v_primero.plan, v_primero.importe);

    begin
      -- Desde la 103: y lo que entró en ese primer pago.
      insert into public.comisiones (
        socio_id, empresa_id, movimiento_id, base, porcentaje, monto, importe, nota
      ) values (
        v_socio.id, p_empresa, v_primero.ingreso, v_base, v_pct,
        public.monto_de_comision(p_empresa, v_base, v_pct, v_primero.importe),
        v_primero.importe,
        'Entró con el enlace el ' || to_char(v_rechazo.intentado_at at time zone 'America/Asuncion', 'DD/MM/YYYY')
          || ', pero el código fue rechazado (' || coalesce(nullif(v_rechazo.motivo, ''), 'sin motivo') || ') y se anotó después.'
      );
      v_comision := true;
      v_aviso := 'Entró con este código y se había perdido. Se generó la comisión por su primer pago.';
    exception when unique_violation then
      v_aviso := 'Entró con este código y se había perdido. Ya tenía una comisión, así que no se generó otra.';
    end;
  elsif v_por_enlace then
    v_aviso := 'Entró con este código y se había perdido. Cuando pague, la comisión sale sola.';
  elsif v_pagos > 0 then
    v_aviso := 'Ojo: este negocio ya pagó ' || v_pagos
            || (case when v_pagos = 1 then ' vez' else ' veces' end)
            || ' antes de anotarlo. La comisión no se genera por esos pagos, sino con el próximo cobro. Revisá el monto antes de pagarla.';
  end if;

  -- Resuelto: el rechazo deja de figurar.
  delete from public.codigos_rechazados where empresa_id = p_empresa;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'asignar_referido', jsonb_build_object(
    'socio_id', v_socio.id, 'socio', v_socio.nombre, 'codigo', v_socio.codigo,
    'pagos_previos', v_pagos, 'por_enlace', v_por_enlace, 'comision_generada', v_comision
  ));

  return jsonb_build_object(
    'ok', true, 'socio', v_socio.nombre, 'aviso', v_aviso,
    'por_enlace', v_por_enlace, 'comision_generada', v_comision
  );
end $fn$;

-- ------------------------------------------------------------
-- 5. LA LISTA DE LA ADMINISTRACIÓN (066): TAMBIÉN EL IMPORTE
--
--    Copia exacta de la viva (066) sumando 'importe' al lado de 'base'. Es
--    lo que el panel necesita para decir cuánto pagó el cliente y cuánto le
--    queda a Orden sin confundirlo con el precio de lista.
-- ------------------------------------------------------------
create or replace function public.listar_comisiones(
  p_estado text default null,
  p_socio  uuid default null,
  p_limite integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x->>'creado' desc), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'id',         c.id,
      'socio_id',   c.socio_id,
      'socio',      s.nombre,
      'telefono',   s.telefono,
      'cobra_en',   s.cobra_en,
      'banco',      s.banco,
      'titular',    s.titular,
      'cuenta',     s.cuenta,
      'documento',  s.documento,
      'empresa_id', c.empresa_id,
      'negocio',    coalesce(e.nombre, 'Negocio borrado'),
      'base',       c.base,
      'importe',    c.importe,
      'porcentaje', c.porcentaje,
      'monto',      c.monto,
      'estado',     c.estado,
      'creado',     c.created_at,
      'pagada_at',  c.pagada_at,
      'solicitada_at', c.solicitada_at,
      'medio',      c.medio,
      'nota',       c.nota,
      'ingreso_anulado', coalesce(mv.estado::text, '') = 'anulado'
    ) as x
    from public.comisiones c
    join public.socios s on s.id = c.socio_id
    left join public.empresas e on e.id = c.empresa_id
    left join public.movimientos mv on mv.id = c.movimiento_id
    where (p_estado is null or trim(p_estado) = '' or c.estado = p_estado)
      and (p_socio is null or c.socio_id = p_socio)
    order by c.created_at desc
    limit greatest(1, least(coalesce(p_limite, 200), 500))
  ) t;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 6. PERMISOS
--
--    Las mismas firmas: `create or replace` conserva los permisos, pero se
--    reescriben igual, como en la 102 y la 066, para que este archivo diga
--    por sí solo quién puede llamar cada una.
-- ------------------------------------------------------------
revoke all on function public.cambiar_plan_cuenta(uuid, text, integer, text, numeric, integer) from public, anon;
grant execute on function public.cambiar_plan_cuenta(uuid, text, integer, text, numeric, integer) to authenticated;

revoke all on function public.asignar_referido(uuid, text, text) from public, anon;
grant execute on function public.asignar_referido(uuid, text, text) to authenticated;

revoke all on function public.listar_comisiones(text, uuid, integer) from public, anon;
grant execute on function public.listar_comisiones(text, uuid, integer) to authenticated;
