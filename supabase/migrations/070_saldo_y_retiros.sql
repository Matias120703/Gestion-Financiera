-- ============================================================
-- ORDEN · Migración 070 · El socio tiene un saldo y retira lo que quiere
--
-- LO QUE CAMBIA
--
-- Hasta la 066 el socio pedía «todo lo pendiente» de una: cada comisión era
-- una unidad y se pagaba entera. Matías lo pidió distinto (16/09/2026):
--
--   «Un usuario tiene un millón de saldo, decide retirar quinientos mil, eso
--    es lo que se le transfiere, y queda el resto de su saldo.»
--
-- Y con un mínimo: menos de Gs. 120.000 no se retira, porque transferir de a
-- poco cuesta más en tiempo que lo que se paga.
--
-- EL MODELO
--
--   · Las comisiones siguen naciendo igual (060) y siguen siendo una por
--     negocio. Mientras están «por_pagar», suman al saldo.
--   · Un RETIRO es un pedido de plata contra ese saldo: tiene monto, estado
--     (pedido, pagado, rechazado) y la foto de a dónde había que transferir
--     en el momento de pedirlo.
--   · SALDO = comisiones por_pagar − retiros pedidos o pagados.
--
--   Un retiro pedido ya descuenta: si no, alguien con un millón podría pedir
--   un millón dos veces antes de que nadie pague la primera. Si se rechaza,
--   vuelve solo al saldo, porque deja de contar.
--
--   Las comisiones marcadas «pagada» antes de esto (pago directo, 060) no
--   entran en el saldo: esa plata ya se transfirió.
--
-- UN PEDIDO A LA VEZ
--
-- Un índice único parcial: mientras hay un retiro pedido, no se puede pedir
-- otro. Para la administración, una sola transferencia pendiente por persona
-- es algo que se resuelve; tres pedidos chicos del mismo socio es desorden.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EL MÍNIMO, EN UN SOLO LUGAR
-- ------------------------------------------------------------
alter table public.ajustes_orden
  add column if not exists retiro_minimo numeric(14,2) not null default 120000;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ajustes_orden_retiro_minimo') then
    alter table public.ajustes_orden
      add constraint ajustes_orden_retiro_minimo check (retiro_minimo >= 0);
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. LOS RETIROS
-- ------------------------------------------------------------
create table if not exists public.retiros (
  id           uuid primary key default gen_random_uuid(),
  socio_id     uuid not null references public.socios (id) on delete restrict,
  monto        numeric(14,2) not null check (monto > 0),
  estado       text not null default 'pedido' check (estado in ('pedido', 'pagado', 'rechazado')),
  pedido_at    timestamptz not null default now(),
  resuelto_at  timestamptz,
  -- A dónde había que transferir cuando lo pidió. Si después cambia sus
  -- datos, este pedido sigue diciendo a qué cuenta se prometió.
  banco        text not null default '',
  titular      text not null default '',
  cuenta       text not null default '',
  documento    text not null default '',
  medio        text not null default '' check (char_length(medio) <= 60),
  nota         text not null default '' check (char_length(nota) <= 300),
  -- El gasto de Orden al pagarlo, como en la 060.
  gasto_id     uuid references public.movimientos (id) on delete set null,
  resuelto_por uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create unique index if not exists retiros_uno_pedido_por_socio
  on public.retiros (socio_id) where estado = 'pedido';

create index if not exists retiros_estado_idx on public.retiros (estado, pedido_at desc);

alter table public.retiros enable row level security;
revoke all on public.retiros from anon, authenticated;

-- ------------------------------------------------------------
-- 3. DOS AYUDAS: EL SALDO Y LA PLATA ESCRITA
-- ------------------------------------------------------------
create or replace function public.saldo_socio(p_socio uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select coalesce((select sum(monto) from public.comisiones
                    where socio_id = p_socio and estado = 'por_pagar'), 0)
       - coalesce((select sum(monto) from public.retiros
                    where socio_id = p_socio and estado in ('pedido', 'pagado')), 0);
$fn$;

revoke all on function public.saldo_socio(uuid) from public, anon, authenticated;

-- «Gs. 120.000», con punto de miles como se escribe acá. La coma de
-- to_char es fija (no depende del idioma del servidor) y se cambia por punto.
create or replace function public.guaranies(p numeric)
returns text language sql immutable set search_path = public as $fn$
  select 'Gs. ' || replace(to_char(round(coalesce(p, 0)), 'FM999,999,999,990'), ',', '.');
$fn$;

revoke all on function public.guaranies(numeric) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. PEDIR UN RETIRO
--
--    Lo llama el socio con su sesión: el socio sale de auth.uid(). Reemplaza
--    a `solicitar_cobro()` de la 066, que pedía todo junto.
-- ------------------------------------------------------------
create or replace function public.solicitar_retiro(p_monto numeric)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_socio  public.socios;
  v_minimo numeric;
  v_saldo  numeric;
  v_monto  numeric := round(coalesce(p_monto, 0));
  v_pedido public.retiros;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios where user_id = v_uid;
  if v_socio.id is null then
    raise exception 'Todavía no pediste tu código de recomendación.' using errcode = '22023';
  end if;

  if not v_socio.activo then
    raise exception 'Tu código está pausado. Escribinos y lo vemos.' using errcode = '42501';
  end if;

  select * into v_pedido from public.retiros where socio_id = v_socio.id and estado = 'pedido';
  if v_pedido.id is not null then
    raise exception 'Ya pediste un retiro de % el %. Cuando te lo transfiramos vas a poder pedir otro.',
      public.guaranies(v_pedido.monto),
      to_char(v_pedido.pedido_at at time zone 'America/Asuncion', 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  select coalesce(retiro_minimo, 120000) into v_minimo from public.ajustes_orden where unica;
  v_minimo := coalesce(v_minimo, 120000);
  v_saldo := public.saldo_socio(v_socio.id);

  if v_saldo <= 0 then
    raise exception 'Todavía no tenés nada por cobrar.' using errcode = '22023';
  end if;

  if coalesce(nullif(trim(v_socio.cuenta), ''), nullif(trim(v_socio.cobra_en), '')) is null then
    raise exception 'Antes de pedir el cobro, completá dónde te transferimos.'
      using errcode = '22023';
  end if;

  if v_saldo < v_minimo then
    raise exception 'Para retirar necesitás al menos %. Hoy tenés %.',
      public.guaranies(v_minimo), public.guaranies(v_saldo)
      using errcode = '22023';
  end if;

  if v_monto <= 0 then
    raise exception 'Escribí cuánto querés retirar.' using errcode = '22023';
  end if;

  if v_monto < v_minimo then
    raise exception 'El mínimo para retirar es %.', public.guaranies(v_minimo) using errcode = '22023';
  end if;

  if v_monto > v_saldo then
    raise exception 'No podés retirar más de lo que tenés: tu saldo es %.', public.guaranies(v_saldo)
      using errcode = '22023';
  end if;

  insert into public.retiros (socio_id, monto, banco, titular, cuenta, documento)
  values (v_socio.id, v_monto, v_socio.banco, v_socio.titular,
          coalesce(nullif(trim(v_socio.cuenta), ''), v_socio.cobra_en), v_socio.documento)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'retiro_id', v_id,
    'socio', v_socio.nombre,
    'socio_id', v_socio.id,
    'monto', v_monto,
    'saldo', v_saldo - v_monto,
    'banco', v_socio.banco,
    'titular', v_socio.titular,
    'documento', v_socio.documento,
    'donde', coalesce(nullif(trim(v_socio.cuenta), ''), v_socio.cobra_en)
  );
end $fn$;

revoke all on function public.solicitar_retiro(numeric) from public, anon;
grant execute on function public.solicitar_retiro(numeric) to authenticated;

-- El pedido de todo junto ya no existe: dejarlo sería una segunda puerta
-- para cobrar sin mínimo y sin saldo.
drop function if exists public.solicitar_cobro();

-- ------------------------------------------------------------
-- 5. LA ADMINISTRACIÓN: VER LOS RETIROS
-- ------------------------------------------------------------
create or replace function public.listar_retiros(
  p_estado text default null,
  p_limite integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x->>'pedido_at' desc), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'id',          r.id,
      'socio_id',    r.socio_id,
      'socio',       s.nombre,
      'telefono',    s.telefono,
      'monto',       r.monto,
      'estado',      r.estado,
      'pedido_at',   r.pedido_at,
      'resuelto_at', r.resuelto_at,
      'banco',       r.banco,
      'titular',     r.titular,
      'cuenta',      r.cuenta,
      'documento',   r.documento,
      'medio',       r.medio,
      'nota',        r.nota
    ) as x
    from public.retiros r
    join public.socios s on s.id = r.socio_id
    where (p_estado is null or trim(p_estado) = '' or r.estado = p_estado)
    order by r.pedido_at desc
    limit greatest(1, least(coalesce(p_limite, 200), 500))
  ) t;

  return v_res;
end $fn$;

revoke all on function public.listar_retiros(text, integer) from public, anon;
grant execute on function public.listar_retiros(text, integer) to authenticated;

-- ------------------------------------------------------------
-- 6. LA ADMINISTRACIÓN: YA LE TRANSFERÍ
--
--    Queda como gasto de Orden, igual que el pago de una comisión en la 060.
--    Devuelve el usuario del socio: la ruta que llama a esto le manda el
--    push de «tu pago ya fue realizado».
-- ------------------------------------------------------------
create or replace function public.marcar_retiro_pagado(
  p_retiro uuid,
  p_medio  text default '',
  p_nota   text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_r     public.retiros;
  v_socio public.socios;
  v_orden uuid;
  v_gasto uuid;
  v_aviso text := null;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_r from public.retiros where id = p_retiro for update;
  if v_r.id is null then
    raise exception 'Ese retiro no existe.' using errcode = '22023';
  end if;
  if v_r.estado = 'pagado' then
    raise exception 'Ese retiro ya está pagado.' using errcode = '22023';
  end if;
  if v_r.estado = 'rechazado' then
    raise exception 'Ese retiro está rechazado: la plata volvió a su saldo.' using errcode = '22023';
  end if;

  select * into v_socio from public.socios where id = v_r.socio_id;
  select empresa_id into v_orden from public.ajustes_orden where unica;

  if v_orden is null then
    v_aviso := 'No hay una empresa de Orden elegida, así que el pago no se anotó en tus finanzas.';
  else
    begin
      insert into public.movimientos (
        empresa_id, tipo, estado, fecha, descripcion, categoria,
        subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por
      ) values (
        v_orden, 'gasto', 'activo', public.hoy_empresa(v_orden),
        'Retiro de ' || coalesce(v_socio.nombre, 'socio'), 'Comisiones',
        v_r.monto, 0, v_r.monto, 0, 'transferencia',
        left(coalesce(v_socio.nombre, ''), 80), auth.uid()
      )
      returning id into v_gasto;
    exception when others then
      v_aviso := 'El retiro quedó pagado, pero el gasto no se pudo anotar: ' || sqlerrm;
    end;
  end if;

  update public.retiros set
    estado       = 'pagado',
    resuelto_at  = now(),
    resuelto_por = auth.uid(),
    gasto_id     = v_gasto,
    medio        = left(coalesce(trim(p_medio), ''), 60),
    nota         = left(coalesce(trim(p_nota), ''), 300)
  where id = p_retiro;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), null, 'pagar_retiro', jsonb_build_object(
    'retiro_id', v_r.id, 'socio_id', v_r.socio_id, 'socio', v_socio.nombre,
    'monto', v_r.monto, 'medio', left(coalesce(trim(p_medio), ''), 60), 'gasto_id', v_gasto
  ));

  return jsonb_build_object(
    'ok', true,
    'monto', v_r.monto,
    'socio', v_socio.nombre,
    'socio_user_id', v_socio.user_id,
    'saldo', greatest(public.saldo_socio(v_r.socio_id), 0),
    'gasto_anotado', v_gasto is not null,
    'aviso', v_aviso
  );
end $fn$;

revoke all on function public.marcar_retiro_pagado(uuid, text, text) from public, anon;
grant execute on function public.marcar_retiro_pagado(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 7. LA ADMINISTRACIÓN: NO SE PUEDE PAGAR
--
--    Los datos no sirven, la cuenta no existe. La plata vuelve a su saldo
--    sola (un retiro rechazado no descuenta) y el motivo queda escrito.
-- ------------------------------------------------------------
create or replace function public.rechazar_retiro(
  p_retiro uuid,
  p_nota   text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_r     public.retiros;
  v_socio public.socios;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_r from public.retiros where id = p_retiro for update;
  if v_r.id is null then
    raise exception 'Ese retiro no existe.' using errcode = '22023';
  end if;
  if v_r.estado <> 'pedido' then
    raise exception 'Solo se puede rechazar un retiro que todavía no se pagó.' using errcode = '22023';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'Escribí por qué no se pudo pagar: es lo que va a leer.' using errcode = '22023';
  end if;

  update public.retiros set
    estado       = 'rechazado',
    resuelto_at  = now(),
    resuelto_por = auth.uid(),
    nota         = left(trim(p_nota), 300)
  where id = p_retiro;

  select * into v_socio from public.socios where id = v_r.socio_id;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), null, 'rechazar_retiro', jsonb_build_object(
    'retiro_id', v_r.id, 'socio_id', v_r.socio_id, 'monto', v_r.monto,
    'motivo', left(trim(p_nota), 300)
  ));

  return jsonb_build_object(
    'ok', true,
    'monto', v_r.monto,
    'socio', v_socio.nombre,
    'socio_user_id', v_socio.user_id,
    'motivo', left(trim(p_nota), 300)
  );
end $fn$;

revoke all on function public.rechazar_retiro(uuid, text) from public, anon;
grant execute on function public.rechazar_retiro(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 8. AJUSTAR UNA COMISIÓN
--
--    En la 060 el monto se ajustaba al pagarla (un negocio que pagó un año
--    de una). Ahora la comisión no se paga sola —se retira del saldo—, así
--    que el ajuste va antes: se corrige la comisión y el saldo la sigue.
-- ------------------------------------------------------------
create or replace function public.ajustar_comision(
  p_comision uuid,
  p_monto    numeric,
  p_nota     text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_c public.comisiones;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_c from public.comisiones where id = p_comision for update;
  if v_c.id is null then
    raise exception 'Esa comisión no existe.' using errcode = '22023';
  end if;
  if v_c.estado <> 'por_pagar' then
    raise exception 'Solo se ajusta una comisión que todavía está en el saldo.' using errcode = '22023';
  end if;
  if p_monto is null or p_monto < 0 then
    raise exception 'El monto no puede ser negativo.' using errcode = '22023';
  end if;
  if public.saldo_socio(v_c.socio_id) - v_c.monto + p_monto < 0 then
    raise exception 'Ese socio ya retiró parte de esa plata: el monto no puede bajar de %.',
      public.guaranies(v_c.monto - public.saldo_socio(v_c.socio_id))
      using errcode = '22023';
  end if;

  update public.comisiones set
    monto = round(p_monto),
    nota  = left(
      case when coalesce(trim(p_nota), '') = '' then nota else trim(p_nota) end, 300)
  where id = p_comision;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), v_c.empresa_id, 'ajustar_comision', jsonb_build_object(
    'comision_id', v_c.id, 'socio_id', v_c.socio_id,
    'antes', v_c.monto, 'ahora', round(p_monto), 'nota', left(coalesce(trim(p_nota), ''), 300)
  ));

  return jsonb_build_object('ok', true, 'monto', round(p_monto));
end $fn$;

revoke all on function public.ajustar_comision(uuid, numeric, text) from public, anon;
grant execute on function public.ajustar_comision(uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 9. LOS DOS CAMINOS VIEJOS, CON UNA GUARDA
--
--    Pagar o anular una comisión suelta sigue sirviendo para los socios que
--    nunca retiraron. Pero si ya retiró, sacar esa comisión del saldo lo
--    dejaría en negativo: se le pagó plata que ya no figura en ningún lado.
--    Mismo cuerpo que la 060, con la guarda marcada (070).
-- ------------------------------------------------------------
create or replace function public.marcar_comision_pagada(
  p_comision uuid,
  p_monto    numeric default null,
  p_medio    text default '',
  p_nota     text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_c     public.comisiones;
  v_socio text;
  v_monto numeric;
  v_orden uuid;
  v_gasto uuid;
  v_aviso text := null;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_c from public.comisiones where id = p_comision;

  if v_c.id is null then
    raise exception 'Esa comisión no existe.' using errcode = '22023';
  end if;

  if v_c.estado = 'pagada' then
    raise exception 'Esa comisión ya está pagada.' using errcode = '22023';
  end if;

  if v_c.estado = 'anulada' then
    raise exception 'Esa comisión está anulada: el cobro que la generó se deshizo.'
      using errcode = '22023';
  end if;

  -- (070) Quien ya cobra por retiros se paga por retiros.
  if exists (select 1 from public.retiros where socio_id = v_c.socio_id and estado in ('pedido', 'pagado')) then
    raise exception 'Este socio cobra con retiros desde su saldo. Registrá el pago desde su pedido de retiro.'
      using errcode = '22023';
  end if;

  v_monto := coalesce(p_monto, v_c.monto);

  if v_monto < 0 then
    raise exception 'El monto no puede ser negativo.' using errcode = '22023';
  end if;

  select nombre into v_socio from public.socios where id = v_c.socio_id;
  select empresa_id into v_orden from public.ajustes_orden where unica;

  if v_orden is null then
    v_aviso := 'No hay una empresa de Orden elegida, así que el pago no se anotó en tus finanzas.';
  elsif v_monto > 0 then
    begin
      insert into public.movimientos (
        empresa_id, tipo, estado, fecha, descripcion, categoria,
        subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por
      ) values (
        v_orden, 'gasto', 'activo', public.hoy_empresa(v_orden),
        'Comisión a ' || coalesce(v_socio, 'socio'), 'Comisiones',
        v_monto, 0, v_monto, 0, 'transferencia',
        left(coalesce(v_socio, ''), 80), auth.uid()
      )
      returning id into v_gasto;
    exception when others then
      v_aviso := 'La comisión quedó pagada, pero el gasto no se pudo anotar: ' || sqlerrm;
    end;
  end if;

  update public.comisiones set
    estado    = 'pagada',
    monto     = v_monto,
    pagada_at = now(),
    gasto_id  = v_gasto,
    medio     = left(coalesce(trim(p_medio), ''), 60),
    nota      = left(coalesce(trim(p_nota), ''), 300)
  where id = p_comision;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), v_c.empresa_id, 'pagar_comision', jsonb_build_object(
    'comision_id', v_c.id,
    'socio_id', v_c.socio_id,
    'socio', v_socio,
    'monto_calculado', v_c.monto,
    'monto_pagado', v_monto,
    'medio', left(coalesce(trim(p_medio), ''), 60),
    'gasto_id', v_gasto
  ));

  return jsonb_build_object(
    'ok', true,
    'monto', v_monto,
    'ajustado', v_monto <> v_c.monto,
    'gasto_anotado', v_gasto is not null,
    'aviso', v_aviso
  );
end $fn$;

revoke all on function public.marcar_comision_pagada(uuid, numeric, text, text) from public, anon;
grant execute on function public.marcar_comision_pagada(uuid, numeric, text, text) to authenticated;

create or replace function public.anular_comision(
  p_comision uuid,
  p_nota     text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_c public.comisiones;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_c from public.comisiones where id = p_comision;

  if v_c.id is null then
    raise exception 'Esa comisión no existe.' using errcode = '22023';
  end if;

  if v_c.estado = 'pagada' then
    raise exception
      'Esa comisión ya se pagó. Si hay que recuperar la plata, eso se arregla con la persona, no borrando el registro.'
      using errcode = '22023';
  end if;

  -- (070) Si ya la retiró, anularla lo deja debiendo plata que se le pagó.
  if v_c.estado = 'por_pagar' and public.saldo_socio(v_c.socio_id) - v_c.monto < 0 then
    raise exception
      'Ese socio ya retiró esa plata. Si hay que recuperarla, eso se arregla con la persona, no anulando la comisión.'
      using errcode = '22023';
  end if;

  update public.comisiones set
    estado = 'anulada',
    nota   = left(coalesce(trim(p_nota), ''), 300)
  where id = p_comision;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), v_c.empresa_id, 'anular_comision', jsonb_build_object(
    'comision_id', v_c.id, 'socio_id', v_c.socio_id, 'monto', v_c.monto,
    'motivo', left(coalesce(trim(p_nota), ''), 300)
  ));

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.anular_comision(uuid, text) from public, anon;
grant execute on function public.anular_comision(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 10. LO QUE VE EL SOCIO
--
--     Redefine `mi_panel_socio()` de la 066. `por_pagar` pasa a ser el saldo
--     disponible (lo que puede retirar), y `pagado` suma lo que se le pagó
--     de las dos formas: comisiones pagadas directo y retiros pagados.
-- ------------------------------------------------------------
create or replace function public.mi_panel_socio()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_socio  public.socios;
  v_lista  jsonb;
  v_retiros jsonb;
  v_pedido public.retiros;
  v_minimo numeric;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios where user_id = v_uid;

  if v_socio.id is null then
    return jsonb_build_object('tiene_codigo', false);
  end if;

  select coalesce(jsonb_agg(x order by x->>'desde' desc), '[]'::jsonb) into v_lista
  from (
    select jsonb_build_object(
      'negocio',  coalesce(e.nombre, 'Negocio borrado'),
      'desde',    r.created_at,
      'paga',     public.plan_efectivo_calculado(r.empresa_id) <> 'gratis',
      'plan',     public.plan_efectivo_calculado(r.empresa_id),
      'estado',   coalesce(c.estado, 'sin_pagar'),
      'monto',    coalesce(c.monto, 0),
      'cuando',   c.created_at,
      'pagada_at', c.pagada_at
    ) as x
    from public.referidos r
    left join public.empresas e on e.id = r.empresa_id
    left join public.comisiones c on c.empresa_id = r.empresa_id
    where r.socio_id = v_socio.id
  ) t;

  select coalesce(jsonb_agg(x order by x->>'pedido_at' desc), '[]'::jsonb) into v_retiros
  from (
    select jsonb_build_object(
      'id', rt.id, 'monto', rt.monto, 'estado', rt.estado,
      'pedido_at', rt.pedido_at, 'resuelto_at', rt.resuelto_at,
      -- El motivo se muestra solo si lo rechazaron: es lo que tiene que leer.
      'nota', case when rt.estado = 'rechazado' then rt.nota else '' end
    ) as x
    from public.retiros rt
    where rt.socio_id = v_socio.id
    order by rt.pedido_at desc
    limit 20
  ) t;

  select * into v_pedido from public.retiros where socio_id = v_socio.id and estado = 'pedido';
  select retiro_minimo into v_minimo from public.ajustes_orden where unica;

  return jsonb_build_object(
    'tiene_codigo', true,
    'codigo',    v_socio.codigo,
    'nombre',    v_socio.nombre,
    'cobra_en',  v_socio.cobra_en,
    'banco',     v_socio.banco,
    'titular',   v_socio.titular,
    'cuenta',    v_socio.cuenta,
    'documento', v_socio.documento,
    'activo',    v_socio.activo,
    'traidos',   (select count(*) from public.referidos r where r.socio_id = v_socio.id),
    'pagaron',   (select count(*) from public.comisiones c
                  where c.socio_id = v_socio.id and c.estado <> 'anulada'),
    'por_pagar', greatest(public.saldo_socio(v_socio.id), 0),
    'pagado',    coalesce((select sum(c.monto) from public.comisiones c
                           where c.socio_id = v_socio.id and c.estado = 'pagada'), 0)
               + coalesce((select sum(rt.monto) from public.retiros rt
                           where rt.socio_id = v_socio.id and rt.estado = 'pagado'), 0),
    'minimo',    coalesce(v_minimo, 120000),
    'cobro_pedido_el', v_pedido.pedido_at,
    'retiro_pedido', case when v_pedido.id is null then null else jsonb_build_object(
      'id', v_pedido.id, 'monto', v_pedido.monto, 'pedido_at', v_pedido.pedido_at
    ) end,
    'retiros',   v_retiros,
    'referidos', v_lista
  );
end $fn$;

revoke all on function public.mi_panel_socio() from public, anon;
grant execute on function public.mi_panel_socio() to authenticated;

-- ------------------------------------------------------------
-- 11. Y LO QUE VE LA ADMINISTRACIÓN DE CADA SOCIO
--
--     Redefine `listar_socios()` de la 064: el saldo real y cuánto tiene
--     pedido, en vez de la suma de comisiones sin descontar retiros.
-- ------------------------------------------------------------
create or replace function public.listar_socios(
  p_busqueda text default null,
  p_limite   integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'id',        s.id,
      'nombre',    s.nombre,
      'telefono',  s.telefono,
      'email',     s.email,
      'codigo',    s.codigo,
      'activo',    s.activo,
      'cobra_en',  s.cobra_en,
      'banco',     s.banco,
      'titular',   s.titular,
      'cuenta',    s.cuenta,
      'documento', s.documento,
      'notas',     s.notas,
      'tiene_cuenta', s.user_id is not null,
      'creado',    s.created_at,
      'traidos',   (select count(*) from public.referidos r where r.socio_id = s.id),
      'pagaron',   (select count(*) from public.comisiones c
                    where c.socio_id = s.id and c.estado <> 'anulada'),
      -- Lo que todavía se le debe: su saldo más lo que tiene pedido.
      'por_pagar', greatest(public.saldo_socio(s.id), 0)
                 + coalesce((select sum(rt.monto) from public.retiros rt
                             where rt.socio_id = s.id and rt.estado = 'pedido'), 0),
      'pagado',    coalesce((select sum(c.monto) from public.comisiones c
                             where c.socio_id = s.id and c.estado = 'pagada'), 0)
                 + coalesce((select sum(rt.monto) from public.retiros rt
                             where rt.socio_id = s.id and rt.estado = 'pagado'), 0)
    ) as x
    from public.socios s
    where (
        p_busqueda is null
        or trim(p_busqueda) = ''
        or s.nombre ilike '%' || trim(p_busqueda) || '%'
        or s.codigo ilike '%' || trim(p_busqueda) || '%'
        or s.telefono ilike '%' || trim(p_busqueda) || '%'
        or s.email ilike '%' || trim(p_busqueda) || '%'
      )
    order by s.nombre
    limit greatest(1, least(coalesce(p_limite, 200), 500))
  ) t;

  return v_res;
end $fn$;

revoke all on function public.listar_socios(text, integer) from public, anon;
grant execute on function public.listar_socios(text, integer) to authenticated;
