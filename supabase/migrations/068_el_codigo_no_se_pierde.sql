-- ============================================================
-- 068 · EL CÓDIGO DEL ENLACE NO SE PIERDE EN SILENCIO
--
-- LO QUE PASÓ (2026-09-16)
--
-- Matías había desactivado su propio socio a la mañana: era la única forma
-- de sacarlo de la lista antes de que existiera borrar (067). A la tarde
-- alguien entró con su enlace, creó la cuenta y pagó. Resultado:
--
--   1. `usar_codigo_referido` rechazó el código —«Ese código ya no está
--      activo»—, que es exactamente lo que tiene que hacer con uno pausado.
--   2. La pantalla borró el código del navegador ANTES de intentar usarlo,
--      y el rechazo no se guardó en ningún lado. `aplicarRef` además
--      esperaba una excepción, y supabase-js no tira: devuelve `{ error }`.
--      No quedó ni un rastro de que esa cuenta había llegado por un enlace.
--   3. Al cobrarle, como no había referido, no nació ninguna comisión.
--   4. Al querer anotarlo a mano después, la regla del grupo 4 de las
--      pruebas —anotar tarde no inventa comisiones viejas— dejó al socio
--      sin la comisión del primer pago, que era suya.
--
-- La regla del punto 4 está bien y NO se toca: si la administración le
-- atribuye a alguien un cliente viejo que nunca usó su enlace, no le
-- corresponde lo que ese cliente ya pagó. Lo que faltaba era poder probar
-- el otro caso: la cuenta SÍ entró con ese código, antes de pagar, y se
-- perdió en el camino.
--
-- LO QUE CAMBIA
--
--   · `codigos_rechazados`: cuando el código del enlace se rechaza al crear
--     la cuenta, queda anotado con el motivo. Una fila por negocio.
--   · `listar_codigos_rechazados()`: el panel de administración los ve en
--     la ficha de cada cuenta, con el motivo y a quién pertenecía.
--   · `asignar_referido()`: si el código que se anota es el mismo con el
--     que la cuenta intentó entrar, se anota como que vino por el enlace y
--     la comisión sale del PRIMER pago, como si nunca se hubiera perdido.
--     Si no coincide, todo sigue exactamente como antes.
--   · De paso, «ya pagó N veces» se cuenta por el importe y no por el
--     asiento contable, igual que hace `usar_codigo_referido` desde la 063.
--     Con la empresa de Orden sin elegir, el asiento no existe aunque el
--     cliente haya pagado, y el aviso no aparecía.
-- ============================================================

create table if not exists public.codigos_rechazados (
  empresa_id    uuid primary key references public.empresas (id) on delete cascade,
  codigo        text not null,
  motivo        text not null default '',
  intentado_por uuid references auth.users (id) on delete set null,
  intentado_at  timestamptz not null default now()
);

alter table public.codigos_rechazados enable row level security;
revoke all on public.codigos_rechazados from anon, authenticated;

-- ------------------------------------------------------------
-- 1. ANOTAR EL RECHAZO
--
--    Lo llama la pantalla de registro cuando `usar_codigo_referido` dice
--    que no. Solo el dueño de la cuenta, y solo si la cuenta todavía no
--    tiene a nadie anotado: una vez que hay referido, un rechazo posterior
--    es ruido.
--
--    El motivo lo manda el navegador, así que no se le cree para nada más
--    que para mostrárselo a la administración. Nada se decide con él.
-- ------------------------------------------------------------
create or replace function public.guardar_codigo_rechazado(
  p_empresa uuid,
  p_codigo  text,
  p_motivo  text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_codigo text := left(upper(trim(coalesce(p_codigo, ''))), 12);
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa and m.user_id = v_uid and m.rol = 'propietario'
  ) then
    raise exception 'Solo el dueño de la cuenta puede usar un código.' using errcode = '42501';
  end if;

  if v_codigo = '' or exists (select 1 from public.referidos where empresa_id = p_empresa) then
    return jsonb_build_object('ok', true, 'guardado', false);
  end if;

  -- Se queda el primero: es el enlace con el que la persona llegó. Si
  -- después prueba otro código a mano, el que importa sigue siendo aquel.
  insert into public.codigos_rechazados (empresa_id, codigo, motivo, intentado_por)
  values (p_empresa, v_codigo, left(coalesce(p_motivo, ''), 200), v_uid)
  on conflict (empresa_id) do nothing;

  return jsonb_build_object('ok', true, 'guardado', true);
end $fn$;

revoke all on function public.guardar_codigo_rechazado(uuid, text, text) from public, anon;
grant execute on function public.guardar_codigo_rechazado(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 2. QUE LA ADMINISTRACIÓN LOS VEA
-- ------------------------------------------------------------
create or replace function public.listar_codigos_rechazados()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'empresa_id',   c.empresa_id,
      'codigo',       c.codigo,
      'motivo',       c.motivo,
      'intentado_at', c.intentado_at,
      'socio_id',     s.id,
      'socio',        s.nombre,
      'socio_activo', s.activo
    ) order by c.intentado_at desc)
    from public.codigos_rechazados c
    left join public.socios s on s.codigo = c.codigo
    -- Si ya se anotó a alguien, el rechazo ya no es asunto de nadie.
    where not exists (select 1 from public.referidos r where r.empresa_id = c.empresa_id)
  ), '[]'::jsonb);
end $fn$;

revoke all on function public.listar_codigos_rechazados() from public, anon;
grant execute on function public.listar_codigos_rechazados() to authenticated;

-- ------------------------------------------------------------
-- 3. ANOTARLO A MANO, SABIENDO SI VINO POR EL ENLACE
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

    begin
      insert into public.comisiones (
        socio_id, empresa_id, movimiento_id, base, porcentaje, monto, nota
      ) values (
        v_socio.id, p_empresa, v_primero.ingreso, v_primero.importe, v_pct,
        round(v_primero.importe * v_pct / 100),
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

revoke all on function public.asignar_referido(uuid, text, text) from public, anon;
grant execute on function public.asignar_referido(uuid, text, text) to authenticated;
