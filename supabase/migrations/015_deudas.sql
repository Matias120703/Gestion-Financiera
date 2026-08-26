-- ============================================================
-- ORDEN · Migración 015 · Deudas
--
-- Tarjetas, préstamos y lo que se le debe al proveedor.
--
-- POR QUÉ ESTO NO ES UNA FUNCIÓN "PERSONAL"
--
-- Apareció pidiéndolo alguien que quería llevar sus gastos personales, pero
-- el comerciante debe plata igual o más: la cuota del préstamo con el que
-- compró la mercadería, la tarjeta, lo que le fía el proveedor. Un almacenero
-- que sabe que el 15 le vence una cuota de 800.000 toma decisiones distintas
-- que uno que se entera cuando le rebota el débito.
--
-- Por eso va adentro de Orden y no en otro sistema.
--
-- LA DECISIÓN QUE MÁS SE DISCUTE: ¿pagar una cuota es un gasto?
--
-- En contabilidad estricta, no del todo: devolver capital baja una deuda, no
-- es un gasto del período. Pero Orden no le habla a un contador, le habla a
-- alguien que quiere saber cuánta plata le queda. Y para esa persona, los
-- 800.000 de la cuota SALIERON de su bolsillo.
--
-- Solución: al registrar el pago se crea también el gasto, **y se puede
-- desactivar**. Quien lleva la contabilidad fina lo apaga; el resto ve la
-- plata salir, que es lo que espera.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

do $$ begin
  create type tipo_deuda as enum ('tarjeta', 'prestamo', 'proveedor', 'otro');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 1. LA DEUDA
--
--    `saldo` es lo que FALTA pagar y es el número que manda: se recalcula
--    con cada pago y nunca se toca a mano desde afuera. `monto_original`
--    queda como referencia histórica.
--
--    Las cuotas son opcionales: una tarjeta no tiene «12 cuotas», un
--    préstamo sí.
-- ------------------------------------------------------------
create table if not exists public.deudas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  tipo            tipo_deuda not null default 'otro',
  nombre          text not null check (char_length(trim(nombre)) between 1 and 80),
  -- A quién se le debe: el banco, la financiera, el proveedor.
  acreedor        text not null default '',
  monto_original  numeric(14,2) not null check (monto_original >= 0),
  saldo           numeric(14,2) not null check (saldo >= 0),
  cuotas_totales  integer check (cuotas_totales is null or cuotas_totales > 0),
  cuotas_pagadas  integer not null default 0 check (cuotas_pagadas >= 0),
  -- Cuánto sale cada cuota, si son fijas.
  monto_cuota     numeric(14,2) check (monto_cuota is null or monto_cuota > 0),
  -- Próximo vencimiento. Se corre solo al registrar un pago.
  vence_el        date,
  notas           text not null default '',
  activa          boolean not null default true,
  creada_por      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- El saldo nunca puede pasar lo que se pidió: sería deber más de lo que
  -- se debía nunca.
  constraint deuda_saldo_coherente check (saldo <= monto_original),
  constraint deuda_cuotas_coherentes check (
    cuotas_totales is null or cuotas_pagadas <= cuotas_totales
  )
);

create index if not exists deudas_empresa_idx on public.deudas (empresa_id) where activa;
create index if not exists deudas_vence_idx   on public.deudas (empresa_id, vence_el) where activa and saldo > 0;

comment on table public.deudas is
  'Lo que el negocio debe: tarjetas, préstamos y proveedores. `saldo` es lo que falta pagar y solo lo cambia registrar_pago_deuda().';

-- ------------------------------------------------------------
-- 2. LOS PAGOS
--
--    Cada pago queda registrado con su fecha. Sin esto, el saldo sería un
--    número sin historia: no habría forma de saber si bajó porque se pagó o
--    porque alguien lo editó.
--
--    `movimiento_id` enlaza con el gasto que generó, si se generó. Al anular
--    ese gasto NO se deshace el pago: son dos cosas distintas y deshacer una
--    a espaldas de la otra dejaría los números peor.
-- ------------------------------------------------------------
create table if not exists public.pagos_deuda (
  id            uuid primary key default gen_random_uuid(),
  deuda_id      uuid not null references public.deudas (id) on delete cascade,
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  monto         numeric(14,2) not null check (monto > 0),
  fecha         date not null,
  movimiento_id uuid references public.movimientos (id) on delete set null,
  nota          text not null default '',
  creado_por    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists pagos_deuda_idx    on public.pagos_deuda (deuda_id, fecha desc);
create index if not exists pagos_empresa_idx  on public.pagos_deuda (empresa_id, fecha desc);

-- ------------------------------------------------------------
-- 3. RLS · lectura para el equipo, escritura solo por las funciones
--
--    Igual que con las ventas: si el insert estuviera abierto, cualquiera
--    podría bajarse el saldo de una deuda sin dejar rastro del pago.
-- ------------------------------------------------------------
alter table public.deudas      enable row level security;
alter table public.pagos_deuda enable row level security;

drop policy if exists deudas_select on public.deudas;
create policy deudas_select on public.deudas
  for select to authenticated using (public.es_miembro(empresa_id));

drop policy if exists pagos_deuda_select on public.pagos_deuda;
create policy pagos_deuda_select on public.pagos_deuda
  for select to authenticated using (public.es_miembro(empresa_id));

revoke all on public.deudas      from anon, authenticated;
revoke all on public.pagos_deuda from anon, authenticated;
grant select on public.deudas      to authenticated;
grant select on public.pagos_deuda to authenticated;

-- ------------------------------------------------------------
-- 4. CREAR
--
--    Solo administración: cuánto debe el negocio es información sensible,
--    del mismo orden que los costos. Un vendedor no la carga ni la cambia.
-- ------------------------------------------------------------
create or replace function public.crear_deuda(
  p_empresa         uuid,
  p_nombre          text,
  p_tipo            text default 'otro',
  p_acreedor        text default '',
  p_monto           numeric default 0,
  p_saldo           numeric default null,
  p_cuotas_totales  integer default null,
  p_monto_cuota     numeric default null,
  p_vence_el        date default null,
  p_notas           text default ''
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id    uuid;
  v_saldo numeric;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el propietario o un administrador puede cargar deudas.' using errcode = '42501';
  end if;
  if p_tipo not in ('tarjeta', 'prestamo', 'proveedor', 'otro') then
    raise exception 'Tipo de deuda no reconocido.' using errcode = '22023';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'La deuda tiene que tener un monto.' using errcode = '22023';
  end if;

  -- Sin saldo explícito se asume que todavía no se pagó nada. Es lo normal
  -- al cargar una deuda nueva, y evita que alguien la deje en cero sin querer.
  v_saldo := coalesce(p_saldo, p_monto);
  if v_saldo > p_monto then
    raise exception 'El saldo no puede ser mayor que el monto original.' using errcode = '22023';
  end if;

  insert into public.deudas (
    empresa_id, tipo, nombre, acreedor, monto_original, saldo,
    cuotas_totales, monto_cuota, vence_el, notas, creada_por
  ) values (
    p_empresa, p_tipo::tipo_deuda, trim(p_nombre), coalesce(trim(p_acreedor), ''),
    p_monto, v_saldo, p_cuotas_totales, p_monto_cuota, p_vence_el,
    coalesce(left(p_notas, 500), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $fn$;

-- ------------------------------------------------------------
-- 5. REGISTRAR UN PAGO
--
--    Todo en una transacción: baja el saldo, suma la cuota, corre el
--    vencimiento al mes siguiente, deja el pago registrado y —si se pide—
--    crea el gasto correspondiente.
--
--    No se puede pagar más de lo que se debe: el `least` recorta y avisa en
--    el resultado. Sin eso, un dedo de más dejaría un saldo negativo, que es
--    un estado que no existe en la vida real.
-- ------------------------------------------------------------
create or replace function public.registrar_pago_deuda(
  p_deuda       uuid,
  p_monto       numeric,
  p_fecha       date default null,
  p_crear_gasto boolean default true,
  p_metodo      text default 'efectivo',
  p_nota        text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_deuda      public.deudas;
  v_fecha      date;
  v_aplicado   numeric;
  v_movimiento uuid;
  v_pago       uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_deuda from public.deudas where id = p_deuda;
  if v_deuda.id is null then
    raise exception 'Esa deuda no existe.' using errcode = 'P0002';
  end if;
  if not public.es_admin(v_deuda.empresa_id) then
    raise exception 'Solo el propietario o un administrador puede registrar pagos.' using errcode = '42501';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El pago tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_deuda.saldo <= 0 then
    raise exception 'Esa deuda ya está saldada.' using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(v_deuda.empresa_id));

  -- Nunca más de lo que falta.
  v_aplicado := least(p_monto, v_deuda.saldo);

  -- El gasto primero: si falla, no queremos haber bajado el saldo.
  if p_crear_gasto then
    insert into public.movimientos (
      empresa_id, tipo, fecha, descripcion, categoria,
      subtotal, descuento, monto, costo_total, metodo_pago, creado_por
    ) values (
      v_deuda.empresa_id, 'gasto', v_fecha,
      'Pago ' || v_deuda.nombre, 'Deudas',
      v_aplicado, 0, v_aplicado, 0, coalesce(p_metodo, 'efectivo'), auth.uid()
    )
    returning id into v_movimiento;
  end if;

  insert into public.pagos_deuda (deuda_id, empresa_id, monto, fecha, movimiento_id, nota, creado_por)
  values (p_deuda, v_deuda.empresa_id, v_aplicado, v_fecha, v_movimiento,
          coalesce(left(p_nota, 300), ''), auth.uid())
  returning id into v_pago;

  update public.deudas
  set saldo = saldo - v_aplicado,
      cuotas_pagadas = case
        -- Solo cuenta como cuota si hay cuotas y todavía faltan.
        when cuotas_totales is not null and cuotas_pagadas < cuotas_totales
          then cuotas_pagadas + 1
        else cuotas_pagadas
      end,
      vence_el = case
        -- El próximo vencimiento se corre un mes. Si con esto queda saldada,
        -- se limpia: una deuda pagada no vence nunca más.
        when saldo - v_aplicado <= 0 then null
        when vence_el is not null then vence_el + interval '1 month'
        else null
      end,
      updated_at = now()
  where id = p_deuda;

  return jsonb_build_object(
    'pago_id', v_pago,
    'aplicado', v_aplicado,
    -- Si intentó pagar de más, la pantalla lo puede avisar.
    'sobrante', greatest(p_monto - v_aplicado, 0),
    'saldo', v_deuda.saldo - v_aplicado,
    'saldada', (v_deuda.saldo - v_aplicado) <= 0,
    'movimiento_id', v_movimiento
  );
end $fn$;

-- ------------------------------------------------------------
-- 6. EDITAR Y DAR DE BAJA
--
--    El saldo NO se puede editar por acá: para eso están los pagos. Si se
--    pudiera, el historial de pagos dejaría de explicar el saldo y no habría
--    forma de saber cuál de los dos miente.
-- ------------------------------------------------------------
create or replace function public.editar_deuda(
  p_deuda      uuid,
  p_nombre     text default null,
  p_acreedor   text default null,
  p_monto_cuota numeric default null,
  p_vence_el   date default null,
  p_notas      text default null
)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from public.deudas where id = p_deuda;
  if v_empresa is null then
    raise exception 'Esa deuda no existe.' using errcode = 'P0002';
  end if;
  if not public.es_admin(v_empresa) then
    raise exception 'Solo el propietario o un administrador puede editar deudas.' using errcode = '42501';
  end if;

  update public.deudas
  set nombre      = coalesce(nullif(trim(p_nombre), ''), nombre),
      acreedor    = coalesce(p_acreedor, acreedor),
      monto_cuota = coalesce(p_monto_cuota, monto_cuota),
      vence_el    = coalesce(p_vence_el, vence_el),
      notas       = coalesce(left(p_notas, 500), notas),
      updated_at  = now()
  where id = p_deuda;
end $fn$;

create or replace function public.archivar_deuda(p_deuda uuid, p_activa boolean default false)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from public.deudas where id = p_deuda;
  if v_empresa is null then
    raise exception 'Esa deuda no existe.' using errcode = 'P0002';
  end if;
  if not public.es_admin(v_empresa) then
    raise exception 'Solo el propietario o un administrador puede archivar deudas.' using errcode = '42501';
  end if;

  update public.deudas set activa = coalesce(p_activa, false), updated_at = now() where id = p_deuda;
end $fn$;

-- ------------------------------------------------------------
-- 7. LISTAR · una sola fila jsonb, como todo desde la 006
-- ------------------------------------------------------------
create or replace function public.listar_deudas(p_empresa uuid, p_incluir_saldadas boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
  v_hoy date;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  -- Cuánto debe el negocio es del mismo orden que los costos: no sale del
  -- servidor para un vendedor.
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés permiso para ver las deudas del negocio.' using errcode = '42501';
  end if;

  v_hoy := public.hoy_empresa(p_empresa);

  select coalesce(jsonb_agg(x order by x->>'orden'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'id', d.id,
      'tipo', d.tipo,
      'nombre', d.nombre,
      'acreedor', d.acreedor,
      'monto_original', d.monto_original,
      'saldo', d.saldo,
      'pagado', d.monto_original - d.saldo,
      'avance', case when d.monto_original > 0
                     then round(((d.monto_original - d.saldo) / d.monto_original) * 100, 1)
                     else 0 end,
      'cuotas_totales', d.cuotas_totales,
      'cuotas_pagadas', d.cuotas_pagadas,
      'monto_cuota', d.monto_cuota,
      'vence_el', d.vence_el,
      -- Días que faltan. Negativo = ya venció, y eso es lo primero que hay
      -- que ver al abrir la pantalla.
      'dias_para_vencer', case when d.vence_el is null then null else (d.vence_el - v_hoy) end,
      'vencida', d.vence_el is not null and d.vence_el < v_hoy and d.saldo > 0,
      'saldada', d.saldo <= 0,
      'activa', d.activa,
      'notas', d.notas,
      -- Orden de la lista: primero lo vencido, después lo que vence antes,
      -- y lo saldado al final.
      'orden', case
        when d.saldo <= 0 then '3'
        when d.vence_el is null then '2'
        else '1' || to_char(d.vence_el, 'YYYYMMDD')
      end
    ) as x
    from public.deudas d
    where d.empresa_id = p_empresa
      and (p_incluir_saldadas or (d.activa and d.saldo > 0))
  ) s;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 8. RESUMEN · el número que va en el panel
-- ------------------------------------------------------------
create or replace function public.resumen_deudas(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_hoy date;
  v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés permiso para ver las deudas del negocio.' using errcode = '42501';
  end if;

  v_hoy := public.hoy_empresa(p_empresa);

  select jsonb_build_object(
    'total_debido', coalesce(sum(saldo), 0),
    'cuantas', count(*),
    'vencidas', count(*) filter (where vence_el is not null and vence_el < v_hoy),
    'monto_vencido', coalesce(sum(saldo) filter (where vence_el is not null and vence_el < v_hoy), 0),
    -- Lo que vence dentro de los próximos siete días: es el aviso útil.
    'vence_pronto', count(*) filter (where vence_el between v_hoy and v_hoy + 7),
    'monto_pronto', coalesce(sum(coalesce(monto_cuota, saldo))
                     filter (where vence_el between v_hoy and v_hoy + 7), 0),
    'proximo_vencimiento', min(vence_el) filter (where vence_el >= v_hoy)
  ) into v_res
  from public.deudas
  where empresa_id = p_empresa and activa and saldo > 0;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 9. HISTORIAL DE PAGOS DE UNA DEUDA
-- ------------------------------------------------------------
create or replace function public.pagos_de_deuda(p_deuda uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_empresa uuid;
  v_res     jsonb;
begin
  select empresa_id into v_empresa from public.deudas where id = p_deuda;
  if v_empresa is null or not public.es_admin(v_empresa) then
    raise exception 'No tenés permiso para ver esta deuda.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'monto', p.monto, 'fecha', p.fecha,
    'movimiento_id', p.movimiento_id, 'nota', p.nota, 'created_at', p.created_at
  ) order by p.fecha desc, p.created_at desc), '[]'::jsonb) into v_res
  from public.pagos_deuda p where p.deuda_id = p_deuda;

  return v_res;
end $fn$;

revoke all on function public.crear_deuda(uuid, text, text, text, numeric, numeric, integer, numeric, date, text) from public, anon;
revoke all on function public.registrar_pago_deuda(uuid, numeric, date, boolean, text, text) from public, anon;
revoke all on function public.editar_deuda(uuid, text, text, numeric, date, text) from public, anon;
revoke all on function public.archivar_deuda(uuid, boolean)          from public, anon;
revoke all on function public.listar_deudas(uuid, boolean)           from public, anon;
revoke all on function public.resumen_deudas(uuid)                   from public, anon;
revoke all on function public.pagos_de_deuda(uuid)                   from public, anon;

grant execute on function public.crear_deuda(uuid, text, text, text, numeric, numeric, integer, numeric, date, text) to authenticated;
grant execute on function public.registrar_pago_deuda(uuid, numeric, date, boolean, text, text) to authenticated;
grant execute on function public.editar_deuda(uuid, text, text, numeric, date, text) to authenticated;
grant execute on function public.archivar_deuda(uuid, boolean)       to authenticated;
grant execute on function public.listar_deudas(uuid, boolean)        to authenticated;
grant execute on function public.resumen_deudas(uuid)                to authenticated;
grant execute on function public.pagos_de_deuda(uuid)                to authenticated;
