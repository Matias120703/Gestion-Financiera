-- ============================================================
-- ORDEN · Migración 002 · Integridad financiera
--
-- Objetivo: que los números sean confiables aunque alguien
-- llame a Supabase directamente desde la consola del navegador.
--
-- Cambios principales:
--   1. Las ventas solo se pueden crear/anular con funciones transaccionales.
--   2. El costo de un producto del catálogo lo pone la base, nunca el cliente.
--   3. Las ventas se anulan (con devolución de stock), no se borran.
--   4. subtotal / descuento / total quedan explícitos y coherentes.
--   5. Un vendedor no puede tocar costos, precios, stock ni roles.
--   6. El plan de suscripción no se puede elevar desde el cliente.
--
-- Es idempotente y no borra datos. Se puede ejecutar sobre una
-- instalación existente que ya tenga movimientos cargados.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TIPOS NUEVOS
-- ------------------------------------------------------------
do $$ begin
  create type estado_movimiento as enum ('activo', 'anulado');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. EMPRESAS · bandera de stock y protección de campos
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists permitir_stock_negativo boolean not null default true;

comment on column public.empresas.permitir_stock_negativo is
  'true = se puede vender aunque no haya stock cargado (modo flexible, por defecto). '
  'false = la venta se rechaza si dejaría stock negativo. Preparado para exponerse en Ajustes.';

-- ------------------------------------------------------------
-- 3. SUSCRIPCIONES · la autoridad sobre el plan pasa al backend
-- ------------------------------------------------------------
create table if not exists public.suscripciones (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null unique references public.empresas (id) on delete cascade,
  plan                   text not null default 'gratis' check (plan in ('gratis', 'pro')),
  estado                 text not null default 'activa' check (estado in ('activa', 'prueba', 'vencida', 'cancelada')),
  periodo_inicio         timestamptz,
  periodo_fin            timestamptz,
  proveedor_pago         text,
  customer_id_externo    text,
  subscription_id_externo text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists suscripciones_empresa_idx on public.suscripciones (empresa_id);

-- Toda empresa existente arranca con su suscripción espejo del plan actual.
insert into public.suscripciones (empresa_id, plan)
select e.id, e.plan from public.empresas e
on conflict (empresa_id) do nothing;

-- ------------------------------------------------------------
-- 4. MOVIMIENTOS · estado, descuento explícito y auditoría
-- ------------------------------------------------------------
alter table public.movimientos
  add column if not exists estado           estado_movimiento not null default 'activo',
  add column if not exists subtotal         numeric(14,2),
  add column if not exists descuento        numeric(14,2) not null default 0,
  add column if not exists anulado_por      uuid references auth.users (id) on delete set null,
  add column if not exists anulado_at       timestamptz,
  add column if not exists motivo_anulacion text,
  add column if not exists actualizado_por  uuid references auth.users (id) on delete set null,
  add column if not exists updated_at       timestamptz;

-- creado_por se completa solo: así la policy puede exigir que sea el usuario real.
alter table public.movimientos alter column creado_por set default auth.uid();

-- Backfill del subtotal en instalaciones existentes.
-- Antes de esta migración, `monto` ya venía neto de descuento y los items
-- guardaban el precio bruto, así que el subtotal se puede reconstruir.
update public.movimientos m
set subtotal  = greatest(m.monto, coalesce(i.bruto, m.monto)),
    descuento = greatest(coalesce(i.bruto, m.monto) - m.monto, 0)
from (
  select movimiento_id, sum(cantidad * precio_unitario) as bruto
  from public.movimiento_items group by movimiento_id
) i
where i.movimiento_id = m.id and m.subtotal is null;

update public.movimientos
set subtotal = monto, descuento = 0
where subtotal is null;

alter table public.movimientos alter column subtotal set default 0;
alter table public.movimientos alter column subtotal set not null;

-- ------------------------------------------------------------
-- 5. RESTRICCIONES DE COHERENCIA
-- ------------------------------------------------------------
do $$ begin
  alter table public.movimientos
    add constraint movimientos_descuento_valido check (descuento >= 0 and descuento <= subtotal);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.movimientos
    add constraint movimientos_total_coherente check (monto = subtotal - descuento);
exception when duplicate_object then null; end $$;

-- Solo una venta puede tener descuento o costo de mercadería.
do $$ begin
  alter table public.movimientos
    add constraint movimientos_solo_venta_descuenta
    check (tipo = 'venta' or (descuento = 0 and costo_total = 0));
exception when duplicate_object then null; end $$;

-- Una anulación siempre deja constancia de quién y cuándo.
do $$ begin
  alter table public.movimientos
    add constraint movimientos_anulacion_auditada
    check (estado = 'activo' or (anulado_por is not null and anulado_at is not null));
exception when duplicate_object then null; end $$;

-- Fechas razonables. El CHECK usa límites fijos porque una restricción no puede
-- depender de current_date (no es inmutable); el margen fino lo aplican la RPC y la policy.
do $$ begin
  alter table public.movimientos
    add constraint movimientos_fecha_razonable
    check (fecha >= date '2000-01-01' and fecha <= date '2100-01-01');
exception when duplicate_object then null; end $$;

-- El item recuerda si realmente movió stock, para devolver exactamente eso al anular.
alter table public.movimiento_items
  add column if not exists afecto_stock boolean not null default false;

-- Backfill imprescindible: las ventas cargadas ANTES de esta migración sí
-- descontaron stock, pero la columna nace en false. Sin esto, anular una venta
-- vieja no devolvería nada al inventario.
--
-- La versión anterior descontaba cuando el item apuntaba a un producto y ese
-- producto controlaba stock, así que reconstruimos con ese mismo criterio.
-- Se ejecuta una sola vez: si ya hay algún item marcado, la migración ya corrió.
do $$
begin
  if not exists (select 1 from public.movimiento_items where afecto_stock) then
    update public.movimiento_items i
    set afecto_stock = true
    from public.productos p, public.movimientos m
    where i.producto_id = p.id
      and i.movimiento_id = m.id
      and m.tipo = 'venta'
      and p.controla_stock;
  end if;
end $$;

do $$ begin
  alter table public.movimiento_items
    add constraint items_precio_valido check (precio_unitario >= 0 and costo_unitario >= 0);
exception when duplicate_object then null; end $$;

create index if not exists movimientos_empresa_estado_idx
  on public.movimientos (empresa_id, estado, fecha desc);

create index if not exists items_producto_idx
  on public.movimiento_items (producto_id) where producto_id is not null;

-- ------------------------------------------------------------
-- 6. TRIGGERS DE CAMPOS PROTEGIDOS
--    Se aplican incluso a los administradores y a las funciones
--    SECURITY DEFINER, así que son la última línea de defensa.
-- ------------------------------------------------------------

-- 6.1 EMPRESAS: identidad y plan intocables desde el cliente.
create or replace function public.proteger_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id
     or new.creada_por is distinct from old.creada_por
     or new.codigo_acceso is distinct from old.codigo_acceso then
    raise exception 'No se pueden cambiar los datos de identidad de la empresa.' using errcode = '42501';
  end if;

  if new.plan is distinct from old.plan
     and coalesce(current_setting('orden.suscripcion_confiable', true), '') <> '1' then
    raise exception 'El plan solo lo puede cambiar el sistema de suscripciones.' using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists empresas_proteger on public.empresas;
create trigger empresas_proteger
  before update on public.empresas
  for each row execute function public.proteger_empresa();

-- 6.2 MIEMBROS: nadie se asciende a sí mismo ni se muda de empresa.
create or replace function public.proteger_miembro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.empresa_id is distinct from old.empresa_id or new.user_id is distinct from old.user_id then
    raise exception 'No se puede mover un miembro de empresa ni de usuario.' using errcode = '42501';
  end if;

  if new.rol is distinct from old.rol then
    if old.user_id = auth.uid() then
      raise exception 'No podés cambiar tu propio rol.' using errcode = '42501';
    end if;
    if new.rol = 'propietario' then
      raise exception 'La propiedad de la empresa no se transfiere desde la aplicación.' using errcode = '42501';
    end if;
    if old.rol = 'propietario' then
      raise exception 'No se puede quitar el rol al propietario.' using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists miembros_proteger on public.miembros;
create trigger miembros_proteger
  before update on public.miembros
  for each row execute function public.proteger_miembro();

-- 6.3 MOVIMIENTOS y ITEMS: no pueden cambiar de empresa nunca.
create or replace function public.proteger_movimiento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'Un movimiento no puede cambiar de empresa.' using errcode = '42501';
  end if;
  if new.tipo is distinct from old.tipo then
    raise exception 'Un movimiento no puede cambiar de tipo.' using errcode = '42501';
  end if;
  if old.estado = 'anulado' and new.estado = 'activo' then
    raise exception 'Un movimiento anulado no se puede reactivar.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists movimientos_proteger on public.movimientos;
create trigger movimientos_proteger
  before update on public.movimientos
  for each row execute function public.proteger_movimiento();

-- 6.4 PRODUCTOS: el producto no cambia de empresa.
create or replace function public.proteger_producto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'Un producto no puede cambiar de empresa.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists productos_proteger on public.productos;
create trigger productos_proteger
  before update on public.productos
  for each row execute function public.proteger_producto();

-- ------------------------------------------------------------
-- 7. REGISTRAR VENTA (reescrita)
--
--    Reglas duras:
--    · el costo de un producto del catálogo SIEMPRE sale de productos.costo;
--    · el producto tiene que ser de la misma empresa;
--    · el descuento no puede superar el subtotal (se rechaza, no se recorta);
--    · el stock se mueve con aritmética relativa dentro de la transacción.
-- ------------------------------------------------------------
-- Helper: recorre un array jsonb conservando el orden.
create or replace function public.jsonb_elements_ordenados(p jsonb)
returns setof jsonb language sql immutable as $$
  select valor from jsonb_array_elements(p) with ordinality as t(valor, orden) order by orden;
$$;

create or replace function public.registrar_venta(
  p_empresa uuid,
  p_items jsonb,
  p_fecha date default null,
  p_descripcion text default '',
  p_metodo_pago text default 'efectivo',
  p_contraparte text default '',
  p_notas text default '',
  p_origen origen_captura default 'manual',
  p_descuento numeric default 0
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_mov       uuid;
  v_item      jsonb;
  v_prod      public.productos%rowtype;
  v_norm      jsonb := '[]'::jsonb;
  v_subtotal  numeric(14,2) := 0;
  v_costo     numeric(14,2) := 0;
  v_desc      numeric(14,2);
  v_cant      numeric(14,2);
  v_precio    numeric(14,2);
  v_costo_u   numeric(14,2);
  v_nombre    text;
  v_pid       uuid;
  v_fecha     date;
  v_permitir  boolean;
  v_stock     numeric(14,2);
  v_metodo    text;
begin
  ------------------------------------------------ autenticación y pertenencia
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select permitir_stock_negativo into v_permitir from public.empresas where id = p_empresa;
  if not found then
    raise exception 'La empresa no existe.' using errcode = '42501';
  end if;

  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  ------------------------------------------------ validaciones generales
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La venta necesita una lista de productos.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La venta necesita al menos un producto.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 200 then
    raise exception 'Una venta no puede tener más de 200 líneas.' using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, (now() at time zone 'America/Asuncion')::date);
  if v_fecha < date '2000-01-01' or v_fecha > (now() at time zone 'America/Asuncion')::date + 1 then
    raise exception 'La fecha de la venta no es válida.' using errcode = '22007';
  end if;

  v_metodo := lower(coalesce(nullif(trim(p_metodo_pago), ''), 'efectivo'));
  if v_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro') then
    raise exception 'La forma de cobro no es válida.' using errcode = '22023';
  end if;

  ------------------------------------------------ primera pasada: validar y normalizar
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada línea de la venta tiene que ser un objeto.' using errcode = '22023';
    end if;

    begin
      v_cant := (v_item ->> 'cantidad')::numeric;
    exception when others then
      raise exception 'La cantidad tiene que ser un número.' using errcode = '22023';
    end;

    if v_cant is null or v_cant <= 0 then
      raise exception 'La cantidad tiene que ser mayor a cero.' using errcode = '22023';
    end if;
    if v_cant > 1000000 then
      raise exception 'La cantidad es demasiado grande.' using errcode = '22023';
    end if;

    v_pid := null;
    if nullif(trim(coalesce(v_item ->> 'producto_id', '')), '') is not null then
      begin
        v_pid := (v_item ->> 'producto_id')::uuid;
      exception when others then
        raise exception 'El identificador del producto no es válido.' using errcode = '22023';
      end;
    end if;

    if v_pid is not null then
      -- El producto tiene que existir Y ser de esta empresa.
      select * into v_prod from public.productos where id = v_pid and empresa_id = p_empresa;
      if not found then
        raise exception 'Ese producto no pertenece a esta empresa.' using errcode = '42501';
      end if;

      v_nombre  := v_prod.nombre;
      -- El precio SÍ puede ser distinto al del catálogo (rebaja puntual, acuerdo con el cliente).
      v_precio  := coalesce(nullif(v_item ->> 'precio_unitario', '')::numeric, v_prod.precio);
      -- El costo NO: siempre el del catálogo. Lo que mande el cliente se descarta.
      v_costo_u := v_prod.costo;
    else
      v_nombre := nullif(trim(coalesce(v_item ->> 'nombre', '')), '');
      if v_nombre is null then
        raise exception 'Cada producto suelto necesita un nombre.' using errcode = '22023';
      end if;
      v_nombre  := left(v_nombre, 120);
      v_precio  := coalesce(nullif(v_item ->> 'precio_unitario', '')::numeric, 0);
      v_costo_u := coalesce(nullif(v_item ->> 'costo_unitario', '')::numeric, 0);
    end if;

    if v_precio is null or v_precio < 0 then
      raise exception 'El precio no puede ser negativo.' using errcode = '22023';
    end if;
    if v_costo_u is null or v_costo_u < 0 then
      raise exception 'El costo no puede ser negativo.' using errcode = '22023';
    end if;

    v_subtotal := v_subtotal + (v_cant * v_precio);
    v_costo    := v_costo + (v_cant * v_costo_u);

    v_norm := v_norm || jsonb_build_object(
      'producto_id', v_pid,
      'nombre', v_nombre,
      'cantidad', v_cant,
      'precio_unitario', v_precio,
      'costo_unitario', v_costo_u,
      'controla_stock', coalesce(v_pid is not null and v_prod.controla_stock, false)
    );
  end loop;

  ------------------------------------------------ descuento
  v_desc := coalesce(p_descuento, 0);
  if v_desc < 0 then
    raise exception 'El descuento no puede ser negativo.' using errcode = '22023';
  end if;
  if v_desc > v_subtotal then
    raise exception 'El descuento no puede ser mayor que el subtotal de la venta.' using errcode = '22023';
  end if;

  ------------------------------------------------ cabecera
  insert into public.movimientos (
    empresa_id, tipo, estado, fecha, descripcion, categoria,
    subtotal, descuento, monto, costo_total,
    metodo_pago, contraparte, notas, origen, creado_por
  )
  values (
    p_empresa, 'venta', 'activo', v_fecha,
    left(coalesce(trim(p_descripcion), ''), 200), 'Ventas',
    v_subtotal, v_desc, v_subtotal - v_desc, v_costo,
    v_metodo, left(coalesce(trim(p_contraparte), ''), 80), left(coalesce(p_notas, ''), 500),
    coalesce(p_origen, 'manual'), auth.uid()
  )
  returning id into v_mov;

  ------------------------------------------------ items y stock
  for v_item in select * from jsonb_elements_ordenados(v_norm) loop
    v_cant := (v_item ->> 'cantidad')::numeric;
    v_pid  := nullif(v_item ->> 'producto_id', '')::uuid;

    if v_pid is not null and (v_item ->> 'controla_stock')::boolean then
      -- Aritmética relativa: dos ventas simultáneas no se pisan.
      update public.productos
        set stock = stock - v_cant
        where id = v_pid
        returning stock into v_stock;

      if not v_permitir and v_stock < 0 then
        raise exception 'No hay stock suficiente de %.', v_item ->> 'nombre' using errcode = '23514';
      end if;
    end if;

    insert into public.movimiento_items (
      movimiento_id, empresa_id, producto_id, nombre, cantidad,
      precio_unitario, costo_unitario, afecto_stock
    )
    values (
      v_mov, p_empresa, v_pid, v_item ->> 'nombre', v_cant,
      (v_item ->> 'precio_unitario')::numeric,
      (v_item ->> 'costo_unitario')::numeric,
      coalesce(v_pid is not null and (v_item ->> 'controla_stock')::boolean, false)
    );
  end loop;

  ------------------------------------------------ descripción automática
  update public.movimientos
  set descripcion = (
    select string_agg(nombre || ' x' || trim(to_char(cantidad, 'FM999999990.##')), ', ')
    from public.movimiento_items where movimiento_id = v_mov
  )
  where id = v_mov and coalesce(trim(descripcion), '') = '';

  return v_mov;
end $$;

-- ------------------------------------------------------------
-- 8. ANULAR MOVIMIENTO
--    Reemplaza al borrado. Devuelve el stock exactamente una vez.
-- ------------------------------------------------------------
create or replace function public.anular_movimiento(
  p_movimiento uuid,
  p_motivo text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_mov     public.movimientos%rowtype;
  v_item    public.movimiento_items%rowtype;
  v_hoy     date := (now() at time zone 'America/Asuncion')::date;
  v_filas   integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  -- El FOR UPDATE serializa dos anulaciones simultáneas del mismo movimiento.
  select * into v_mov from public.movimientos where id = p_movimiento for update;
  if not found then
    raise exception 'El movimiento no existe.' using errcode = '42501';
  end if;

  if not public.es_miembro(v_mov.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if v_mov.estado = 'anulado' then
    raise exception 'Este movimiento ya estaba anulado.' using errcode = '23505';
  end if;

  -- Un vendedor solo anula lo que cargó él y solo el mismo día.
  if not public.es_admin(v_mov.empresa_id)
     and not (v_mov.creado_por = auth.uid() and v_mov.fecha = v_hoy) then
    raise exception 'Solo un administrador puede anular movimientos de otra persona o de días anteriores.'
      using errcode = '42501';
  end if;

  -- Marcamos primero, con guarda de estado: si otra transacción ganó la carrera,
  -- v_filas = 0 y salimos sin tocar el stock.
  update public.movimientos
  set estado = 'anulado',
      anulado_por = auth.uid(),
      anulado_at = now(),
      motivo_anulacion = left(nullif(trim(coalesce(p_motivo, '')), ''), 200)
  where id = v_mov.id and estado = 'activo';

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Este movimiento ya estaba anulado.' using errcode = '23505';
  end if;

  -- Devolvemos exactamente el stock que la venta descontó.
  if v_mov.tipo = 'venta' then
    for v_item in
      select * from public.movimiento_items
      where movimiento_id = v_mov.id and afecto_stock and producto_id is not null
    loop
      update public.productos
        set stock = stock + v_item.cantidad
        where id = v_item.producto_id;
    end loop;
  end if;

  return v_mov.id;
end $$;

-- ------------------------------------------------------------
-- 9. REEMPLAZAR VENTA (la "edición" segura)
--    Anula la original y crea una nueva, todo en una transacción.
-- ------------------------------------------------------------
create or replace function public.reemplazar_venta(
  p_movimiento uuid,
  p_items jsonb,
  p_fecha date default null,
  p_descripcion text default '',
  p_metodo_pago text default 'efectivo',
  p_contraparte text default '',
  p_notas text default '',
  p_descuento numeric default 0
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_orig  public.movimientos%rowtype;
  v_nueva uuid;
begin
  select * into v_orig from public.movimientos where id = p_movimiento;
  if not found or v_orig.tipo <> 'venta' then
    raise exception 'La venta que querés corregir no existe.' using errcode = '42501';
  end if;

  perform public.anular_movimiento(p_movimiento, 'Reemplazada por una corrección');

  v_nueva := public.registrar_venta(
    v_orig.empresa_id, p_items,
    coalesce(p_fecha, v_orig.fecha),
    p_descripcion, p_metodo_pago, p_contraparte, p_notas,
    v_orig.origen, p_descuento
  );

  update public.movimientos
  set actualizado_por = auth.uid(), updated_at = now()
  where id = v_nueva;

  return v_nueva;
end $$;

-- ------------------------------------------------------------
-- 10. APLICAR SUSCRIPCIÓN (solo backend)
--     Única puerta para cambiar el plan. No se otorga a `authenticated`.
-- ------------------------------------------------------------
create or replace function public.aplicar_suscripcion(
  p_empresa uuid,
  p_plan text,
  p_estado text default 'activa',
  p_periodo_inicio timestamptz default null,
  p_periodo_fin timestamptz default null,
  p_proveedor text default null,
  p_customer_id text default null,
  p_subscription_id text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_plan not in ('gratis', 'pro') then
    raise exception 'Plan desconocido: %', p_plan using errcode = '22023';
  end if;

  insert into public.suscripciones (
    empresa_id, plan, estado, periodo_inicio, periodo_fin,
    proveedor_pago, customer_id_externo, subscription_id_externo, updated_at
  )
  values (p_empresa, p_plan, p_estado, p_periodo_inicio, p_periodo_fin,
          p_proveedor, p_customer_id, p_subscription_id, now())
  on conflict (empresa_id) do update set
    plan = excluded.plan,
    estado = excluded.estado,
    periodo_inicio = excluded.periodo_inicio,
    periodo_fin = excluded.periodo_fin,
    proveedor_pago = coalesce(excluded.proveedor_pago, public.suscripciones.proveedor_pago),
    customer_id_externo = coalesce(excluded.customer_id_externo, public.suscripciones.customer_id_externo),
    subscription_id_externo = coalesce(excluded.subscription_id_externo, public.suscripciones.subscription_id_externo),
    updated_at = now();

  -- Espejo en empresas.plan para no romper las lecturas existentes.
  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = p_plan where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);
end $$;

-- ------------------------------------------------------------
-- 11. RLS · reconstrucción completa
-- ------------------------------------------------------------
alter table public.suscripciones enable row level security;

-- ---------- EMPRESAS ----------
drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas
  for select using (public.es_miembro(id));

-- El trigger `empresas_proteger` bloquea plan / código / propiedad.
drop policy if exists empresas_update on public.empresas;
create policy empresas_update on public.empresas
  for update using (public.es_admin(id)) with check (public.es_admin(id));

-- ---------- MIEMBROS ----------
drop policy if exists miembros_select on public.miembros;
create policy miembros_select on public.miembros
  for select using (user_id = auth.uid() or public.es_miembro(empresa_id));

drop policy if exists miembros_update on public.miembros;
create policy miembros_update on public.miembros
  for update using (public.es_admin(empresa_id)) with check (public.es_admin(empresa_id));

drop policy if exists miembros_delete on public.miembros;
create policy miembros_delete on public.miembros
  for delete using (public.es_admin(empresa_id) and rol <> 'propietario' and user_id <> auth.uid());

-- ---------- PRODUCTOS ----------
-- Todos leen; solo propietario/admin escriben. El vendedor nunca toca costo,
-- precio ni stock: el stock lo mueven las RPC de venta y anulación.
drop policy if exists productos_select on public.productos;
create policy productos_select on public.productos
  for select using (public.es_miembro(empresa_id));

drop policy if exists productos_insert on public.productos;
create policy productos_insert on public.productos
  for insert with check (public.es_admin(empresa_id));

drop policy if exists productos_update on public.productos;
create policy productos_update on public.productos
  for update using (public.es_admin(empresa_id)) with check (public.es_admin(empresa_id));

drop policy if exists productos_delete on public.productos;
create policy productos_delete on public.productos
  for delete using (public.es_admin(empresa_id));

-- ---------- MOVIMIENTOS ----------
drop policy if exists movimientos_select on public.movimientos;
create policy movimientos_select on public.movimientos
  for select using (public.es_miembro(empresa_id));

-- Solo gastos y otros ingresos se insertan directo. Las ventas van por RPC.
drop policy if exists movimientos_insert on public.movimientos;
create policy movimientos_insert on public.movimientos
  for insert with check (
    public.es_miembro(empresa_id)
    and tipo <> 'venta'
    and estado = 'activo'
    and creado_por = auth.uid()
    and descuento = 0
    and costo_total = 0
    and subtotal = monto
    and anulado_por is null
    and anulado_at is null
    and fecha >= date '2000-01-01'
    and fecha <= ((now() at time zone 'America/Asuncion')::date + 1)
  );

-- Sin UPDATE ni DELETE desde el cliente: se anula con anular_movimiento().
drop policy if exists movimientos_update on public.movimientos;
drop policy if exists movimientos_delete on public.movimientos;

-- ---------- MOVIMIENTO_ITEMS ----------
-- Solo lectura. Se crean y se borran únicamente dentro de las RPC.
drop policy if exists items_select on public.movimiento_items;
create policy items_select on public.movimiento_items
  for select using (public.es_miembro(empresa_id));

drop policy if exists items_insert on public.movimiento_items;
drop policy if exists items_delete on public.movimiento_items;
drop policy if exists items_update on public.movimiento_items;

-- ---------- RETOS ----------
-- Todos ven la meta; solo propietario/admin la definen.
drop policy if exists retos_write on public.retos;
drop policy if exists retos_select on public.retos;
create policy retos_select on public.retos
  for select using (public.es_miembro(empresa_id));

drop policy if exists retos_insert on public.retos;
create policy retos_insert on public.retos
  for insert with check (public.es_admin(empresa_id));

drop policy if exists retos_update on public.retos;
create policy retos_update on public.retos
  for update using (public.es_admin(empresa_id)) with check (public.es_admin(empresa_id));

drop policy if exists retos_delete on public.retos;
create policy retos_delete on public.retos
  for delete using (public.es_admin(empresa_id));

-- ---------- SUSCRIPCIONES ----------
-- Se leen para saber el plan; no hay ninguna política de escritura,
-- así que `authenticated` no puede insertar ni actualizar nunca.
drop policy if exists suscripciones_select on public.suscripciones;
create policy suscripciones_select on public.suscripciones
  for select using (public.es_miembro(empresa_id));

-- ------------------------------------------------------------
-- 12. PERMISOS DE TABLA Y DE FUNCIÓN
-- ------------------------------------------------------------
revoke all on public.suscripciones from anon, authenticated;
grant select on public.suscripciones to authenticated;

revoke update, delete on public.movimientos from anon, authenticated;
grant select, insert on public.movimientos to authenticated;

revoke insert, update, delete on public.movimiento_items from anon, authenticated;
grant select on public.movimiento_items to authenticated;

grant execute on function public.registrar_venta(uuid, jsonb, date, text, text, text, text, origen_captura, numeric) to authenticated;
grant execute on function public.anular_movimiento(uuid, text) to authenticated;
grant execute on function public.reemplazar_venta(uuid, jsonb, date, text, text, text, text, numeric) to authenticated;
grant execute on function public.jsonb_elements_ordenados(jsonb) to authenticated;

-- El plan solo lo mueve el backend con la clave de servicio.
revoke all on function public.aplicar_suscripcion(uuid, text, text, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;

-- Los triggers no se llaman a mano.
revoke all on function public.proteger_empresa() from public, anon, authenticated;
revoke all on function public.proteger_miembro() from public, anon, authenticated;
revoke all on function public.proteger_movimiento() from public, anon, authenticated;
revoke all on function public.proteger_producto() from public, anon, authenticated;
