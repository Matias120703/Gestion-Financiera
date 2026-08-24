-- ============================================================
-- ORDEN · Gestión financiera
-- Esquema completo para Supabase (PostgreSQL)
-- Ejecutar entero en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- TIPOS
-- ------------------------------------------------------------
do $$ begin
  create type rol_miembro as enum ('propietario', 'admin', 'vendedor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_movimiento as enum ('venta', 'gasto', 'ingreso');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origen_captura as enum ('manual', 'texto', 'audio', 'foto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_meta as enum ('ventas', 'ganancia');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- EMPRESAS
-- ------------------------------------------------------------
create table if not exists public.empresas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (char_length(trim(nombre)) between 2 and 80),
  moneda        text not null default 'PYG' check (moneda in ('PYG', 'USD', 'ARS', 'BRL', 'EUR')),
  codigo_acceso text not null unique,
  plan          text not null default 'gratis' check (plan in ('gratis', 'pro')),
  creada_por    uuid not null references auth.users (id) on delete restrict,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- MIEMBROS (relación usuario ↔ empresa)
-- ------------------------------------------------------------
create table if not exists public.miembros (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  nombre     text not null default 'Sin nombre',
  rol        rol_miembro not null default 'vendedor',
  created_at timestamptz not null default now(),
  unique (empresa_id, user_id)
);

create index if not exists miembros_user_idx on public.miembros (user_id);

-- ------------------------------------------------------------
-- PRODUCTOS
-- ------------------------------------------------------------
create table if not exists public.productos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  nombre         text not null check (char_length(trim(nombre)) between 1 and 120),
  categoria      text not null default 'General',
  costo          numeric(14,2) not null default 0 check (costo >= 0),
  precio         numeric(14,2) not null default 0 check (precio >= 0),
  stock          numeric(14,2) not null default 0,
  stock_minimo   numeric(14,2) not null default 0 check (stock_minimo >= 0),
  controla_stock boolean not null default true,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (empresa_id, nombre)
);

create index if not exists productos_empresa_idx on public.productos (empresa_id) where activo;

-- ------------------------------------------------------------
-- MOVIMIENTOS (ventas, gastos, otros ingresos)
-- ------------------------------------------------------------
create table if not exists public.movimientos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  tipo        tipo_movimiento not null,
  fecha       date not null default (now() at time zone 'America/Asuncion')::date,
  descripcion text not null default '',
  categoria   text not null default 'General',
  monto       numeric(14,2) not null check (monto >= 0),
  costo_total numeric(14,2) not null default 0 check (costo_total >= 0),
  metodo_pago text not null default 'efectivo',
  contraparte text default '',
  notas       text default '',
  origen      origen_captura not null default 'manual',
  creado_por  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists movimientos_empresa_fecha_idx on public.movimientos (empresa_id, fecha desc);
create index if not exists movimientos_empresa_tipo_idx on public.movimientos (empresa_id, tipo, fecha desc);

-- ------------------------------------------------------------
-- ITEMS DE MOVIMIENTO (detalle por producto en una venta)
-- Guardamos nombre/costo/precio como "foto del momento" para que
-- el margen histórico no cambie si después editás el producto.
-- ------------------------------------------------------------
create table if not exists public.movimiento_items (
  id              uuid primary key default gen_random_uuid(),
  movimiento_id   uuid not null references public.movimientos (id) on delete cascade,
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  producto_id     uuid references public.productos (id) on delete set null,
  nombre          text not null,
  cantidad        numeric(14,2) not null check (cantidad > 0),
  precio_unitario numeric(14,2) not null default 0 check (precio_unitario >= 0),
  costo_unitario  numeric(14,2) not null default 0 check (costo_unitario >= 0)
);

create index if not exists items_movimiento_idx on public.movimiento_items (movimiento_id);
create index if not exists items_empresa_idx on public.movimiento_items (empresa_id);

-- ------------------------------------------------------------
-- RETOS / METAS
-- ------------------------------------------------------------
create table if not exists public.retos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  nombre       text not null default 'Mi reto',
  meta         numeric(14,2) not null check (meta > 0),
  medida       tipo_meta not null default 'ventas',
  fecha_inicio date not null,
  fecha_fin    date not null,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create index if not exists retos_empresa_idx on public.retos (empresa_id) where activo;

-- ------------------------------------------------------------
-- HELPERS DE SEGURIDAD
-- security definer para evitar recursión infinita en las policies
-- ------------------------------------------------------------
create or replace function public.es_miembro(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa and m.user_id = auth.uid()
  );
$$;

create or replace function public.es_admin(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa
      and m.user_id = auth.uid()
      and m.rol in ('propietario', 'admin')
  );
$$;

-- ------------------------------------------------------------
-- CREAR EMPRESA (genera código y deja al creador como propietario)
-- ------------------------------------------------------------
create or replace function public.crear_empresa(
  p_nombre text,
  p_moneda text default 'PYG',
  p_nombre_usuario text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_codigo text;
  v_intentos int := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.';
  end if;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresas where codigo_acceso = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código de acceso.';
    end if;
  end loop;

  insert into public.empresas (nombre, moneda, codigo_acceso, creada_por)
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), v_codigo, auth.uid())
  returning id into v_id;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Propietario'), 'propietario');

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- UNIRSE A EMPRESA CON CÓDIGO
-- ------------------------------------------------------------
create or replace function public.unirse_empresa(
  p_codigo text,
  p_nombre_usuario text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.';
  end if;

  select id into v_id from public.empresas
  where codigo_acceso = upper(trim(p_codigo));

  if v_id is null then
    raise exception 'El código no corresponde a ninguna empresa.';
  end if;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Colaborador'), 'vendedor')
  on conflict (empresa_id, user_id) do nothing;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- REGISTRAR UNA VENTA COMPLETA (movimiento + items + descuento de stock)
-- Todo en una transacción: o entra todo, o no entra nada.
-- p_items: [{"producto_id": uuid|null, "nombre": text, "cantidad": num,
--            "precio_unitario": num, "costo_unitario": num|null}]
-- ------------------------------------------------------------
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
  v_mov uuid;
  v_item jsonb;
  v_prod public.productos%rowtype;
  v_total numeric(14,2) := 0;
  v_costo numeric(14,2) := 0;
  v_cant numeric(14,2);
  v_precio numeric(14,2);
  v_costo_u numeric(14,2);
  v_nombre text;
  v_desc numeric(14,2) := greatest(coalesce(p_descuento, 0), 0);
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta necesita al menos un producto.';
  end if;

  insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, monto, costo_total, metodo_pago, contraparte, notas, origen, creado_por)
  values (
    p_empresa, 'venta',
    coalesce(p_fecha, (now() at time zone 'America/Asuncion')::date),
    coalesce(p_descripcion, ''), 'Ventas', 0, 0,
    coalesce(nullif(p_metodo_pago, ''), 'efectivo'),
    coalesce(p_contraparte, ''), coalesce(p_notas, ''), p_origen, auth.uid()
  )
  returning id into v_mov;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cant := coalesce((v_item ->> 'cantidad')::numeric, 0);
    if v_cant <= 0 then
      raise exception 'La cantidad debe ser mayor a cero.';
    end if;

    v_prod := null;
    if (v_item ->> 'producto_id') is not null and (v_item ->> 'producto_id') <> '' then
      select * into v_prod from public.productos
      where id = (v_item ->> 'producto_id')::uuid and empresa_id = p_empresa;
    end if;

    v_nombre  := coalesce(nullif(trim(v_item ->> 'nombre'), ''), v_prod.nombre, 'Producto');
    v_precio  := coalesce((v_item ->> 'precio_unitario')::numeric, v_prod.precio, 0);
    v_costo_u := coalesce((v_item ->> 'costo_unitario')::numeric, v_prod.costo, 0);

    insert into public.movimiento_items (movimiento_id, empresa_id, producto_id, nombre, cantidad, precio_unitario, costo_unitario)
    values (v_mov, p_empresa, v_prod.id, v_nombre, v_cant, v_precio, v_costo_u);

    v_total := v_total + (v_cant * v_precio);
    v_costo := v_costo + (v_cant * v_costo_u);

    if v_prod.id is not null and v_prod.controla_stock then
      update public.productos set stock = stock - v_cant where id = v_prod.id;
    end if;
  end loop;

  v_desc := least(v_desc, v_total);

  update public.movimientos
  set monto = v_total - v_desc,
      costo_total = v_costo,
      descripcion = case
        when coalesce(trim(descripcion), '') <> '' then descripcion
        else (select string_agg(nombre || ' x' || trim(to_char(cantidad, 'FM999999990.##')), ', ')
              from public.movimiento_items where movimiento_id = v_mov)
      end
  where id = v_mov;

  return v_mov;
end;
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.empresas         enable row level security;
alter table public.miembros         enable row level security;
alter table public.productos        enable row level security;
alter table public.movimientos      enable row level security;
alter table public.movimiento_items enable row level security;
alter table public.retos            enable row level security;

-- EMPRESAS: solo ves las tuyas. Se crean vía función crear_empresa().
drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas
  for select using (public.es_miembro(id));

drop policy if exists empresas_update on public.empresas;
create policy empresas_update on public.empresas
  for update using (public.es_admin(id)) with check (public.es_admin(id));

-- MIEMBROS
drop policy if exists miembros_select on public.miembros;
create policy miembros_select on public.miembros
  for select using (user_id = auth.uid() or public.es_miembro(empresa_id));

drop policy if exists miembros_update on public.miembros;
create policy miembros_update on public.miembros
  for update using (public.es_admin(empresa_id)) with check (public.es_admin(empresa_id));

drop policy if exists miembros_delete on public.miembros;
create policy miembros_delete on public.miembros
  for delete using (public.es_admin(empresa_id) and rol <> 'propietario');

-- PRODUCTOS
drop policy if exists productos_select on public.productos;
create policy productos_select on public.productos
  for select using (public.es_miembro(empresa_id));

drop policy if exists productos_insert on public.productos;
create policy productos_insert on public.productos
  for insert with check (public.es_miembro(empresa_id));

drop policy if exists productos_update on public.productos;
create policy productos_update on public.productos
  for update using (public.es_miembro(empresa_id)) with check (public.es_miembro(empresa_id));

drop policy if exists productos_delete on public.productos;
create policy productos_delete on public.productos
  for delete using (public.es_admin(empresa_id));

-- MOVIMIENTOS
drop policy if exists movimientos_select on public.movimientos;
create policy movimientos_select on public.movimientos
  for select using (public.es_miembro(empresa_id));

drop policy if exists movimientos_insert on public.movimientos;
create policy movimientos_insert on public.movimientos
  for insert with check (public.es_miembro(empresa_id));

drop policy if exists movimientos_update on public.movimientos;
create policy movimientos_update on public.movimientos
  for update using (public.es_admin(empresa_id) or creado_por = auth.uid())
  with check (public.es_miembro(empresa_id));

drop policy if exists movimientos_delete on public.movimientos;
create policy movimientos_delete on public.movimientos
  for delete using (public.es_admin(empresa_id) or creado_por = auth.uid());

-- ITEMS
drop policy if exists items_select on public.movimiento_items;
create policy items_select on public.movimiento_items
  for select using (public.es_miembro(empresa_id));

drop policy if exists items_insert on public.movimiento_items;
create policy items_insert on public.movimiento_items
  for insert with check (public.es_miembro(empresa_id));

drop policy if exists items_delete on public.movimiento_items;
create policy items_delete on public.movimiento_items
  for delete using (public.es_miembro(empresa_id));

-- RETOS
drop policy if exists retos_select on public.retos;
create policy retos_select on public.retos
  for select using (public.es_miembro(empresa_id));

drop policy if exists retos_write on public.retos;
create policy retos_write on public.retos
  for all using (public.es_miembro(empresa_id)) with check (public.es_miembro(empresa_id));

-- ------------------------------------------------------------
-- PERMISOS DE EJECUCIÓN
-- ------------------------------------------------------------
grant execute on function public.crear_empresa(text, text, text) to authenticated;
grant execute on function public.unirse_empresa(text, text)      to authenticated;
grant execute on function public.es_miembro(uuid)                to authenticated;
grant execute on function public.es_admin(uuid)                  to authenticated;
grant execute on function public.registrar_venta(uuid, jsonb, date, text, text, text, text, origen_captura, numeric) to authenticated;
