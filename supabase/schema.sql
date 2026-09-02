-- ============================================================
-- ORDEN · Esquema completo
--
-- GENERADO AUTOMÁTICAMENTE — no editar a mano.
-- Se arma con: node supabase/generar-schema.js
-- La fuente son los archivos de supabase/migrations/.
--
-- Cómo usarlo:
--   · Base nueva      → pegá todo esto en Supabase → SQL Editor → Run.
--   · Base existente  → ejecutá solo las migraciones que te falten,
--                       o esto mismo (es idempotente y no borra datos).
--
-- Migraciones incluidas:
--   · 001_base.sql
--   · 002_integridad_financiera.sql
--   · 003_cierre_permisos.sql
--   · 004_lecturas_consistentes.sql
--   · 005_lecturas_escalables.sql
--   · 006_confiabilidad_lecturas.sql
--   · 007_adjuntos.sql
--   · 008_habito.sql
--   · 009_planes_precios.sql
--   · 010_preferencias_avisos.sql
--   · 011_baja_de_miembros.sql
--   · 012_cerrar_anon.sql
--   · 013_borrar_usuario.sql
--   · 014_borrar_mi_cuenta.sql
--   · 015_deudas.sql
--   · 016_panel_admin.sql
--   · 017_precios_por_tipo.sql
--   · 018_solo_lectura.sql
--   · 019_orden_es_un_negocio.sql
--   · 020_precios_ajustados.sql
--   · 021_rubros.sql
--   · 022_ficha_y_correcciones.sql
--   · 023_registro_con_ficha.sql
--   · 024_cuenta_personal.sql
--   · 025_gastos_fijos.sql
--   · 026_ahorros_y_entradas.sql
--   · 027_categorias_propias.sql
--   · 028_ingresos_por_categoria.sql
--   · 029_meta_con_fecha.sql
--   · 030_ahorro_del_periodo.sql
--   · 031_aviso_para_personas.sql
-- ============================================================

-- ############################################################
-- ##  001_base.sql
-- ############################################################

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


-- ############################################################
-- ##  002_integridad_financiera.sql
-- ############################################################

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


-- ############################################################
-- ##  003_cierre_permisos.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 003 · Cierre de permisos e información sensible
--
-- Cierra seis huecos que quedaron abiertos después de la 002:
--   1. Las empresas nuevas no creaban su suscripción.
--   2. `service_role` no tenía permiso explícito sobre aplicar_suscripcion().
--   3. El código de acceso viajaba en la fila de `empresas`, o sea que un
--      vendedor podía leerlo aunque la pantalla no se lo mostrara.
--   4. Un vendedor podía leer `productos.costo`, `movimientos.costo_total`
--      y `movimiento_items.costo_unitario` con una consulta directa.
--   5. No existía el concepto de "plan efectivo" (plan + estado + periodo).
--   6. `empresas.plan` era la única lectura posible del plan.
--
-- Idempotente. No borra empresas, movimientos, productos ni usuarios.
--
-- ATENCIÓN — orden de despliegue:
-- Esta migración ELIMINA la columna `empresas.codigo_acceso` (después de
-- copiarla a `empresa_accesos`). Aplicala junto con el código de esta versión,
-- no antes: la versión anterior de la app leía esa columna.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EMPRESA_ACCESOS · el código de invitación sale de `empresas`
--
--    RLS filtra filas, no columnas. Mientras el código viviera en la misma
--    fila que el nombre de la empresa, cualquier miembro que pudiera ver su
--    empresa podía leerlo. Moverlo a su propia tabla permite una policy propia.
-- ------------------------------------------------------------
create table if not exists public.empresa_accesos (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas (id) on delete cascade,
  codigo     text not null unique check (char_length(codigo) between 6 and 24),
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists empresa_accesos_codigo_idx on public.empresa_accesos (codigo) where activo;

-- Copiamos los códigos existentes antes de tocar nada.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'empresas' and column_name = 'codigo_acceso'
  ) then
    execute $sql$
      insert into public.empresa_accesos (empresa_id, codigo)
      select e.id, e.codigo_acceso from public.empresas e
      where e.codigo_acceso is not null
      on conflict (empresa_id) do nothing
    $sql$;
  end if;
end $$;

-- Cualquier empresa sin código (no debería haber) recibe uno.
insert into public.empresa_accesos (empresa_id, codigo)
select e.id, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
from public.empresas e
where not exists (select 1 from public.empresa_accesos a where a.empresa_id = e.id)
on conflict do nothing;

-- ------------------------------------------------------------
-- 2. SUSCRIPCIÓN PARA TODA EMPRESA (incluidas las que falten)
-- ------------------------------------------------------------
insert into public.suscripciones (empresa_id, plan, estado)
select e.id, coalesce(e.plan, 'gratis'), 'activa'
from public.empresas e
on conflict (empresa_id) do nothing;

-- ------------------------------------------------------------
-- 3. CREAR EMPRESA · ahora crea empresa + miembro + acceso + suscripción
--    Todo en la misma transacción: o entra todo, o no entra nada.
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

  insert into public.empresas (nombre, moneda, creada_por)
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), auth.uid())
  returning id into v_id;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Propietario'), 'propietario');

  insert into public.empresa_accesos (empresa_id, codigo)
  values (v_id, v_codigo);

  -- Toda empresa nace con su suscripción gratis activa. Sin esto,
  -- plan_efectivo() tendría que adivinar y los pagos futuros tendrían
  -- que crear la fila desde el cliente, que es justo lo que no queremos.
  insert into public.suscripciones (empresa_id, plan, estado)
  values (v_id, 'gratis', 'activa');

  return v_id;
end $$;

-- ------------------------------------------------------------
-- 4. UNIRSE CON CÓDIGO · busca en empresa_accesos
--    Es SECURITY DEFINER, así que funciona sin que el usuario tenga
--    permiso de lectura sobre la tabla. Nadie necesita poder listar
--    códigos para poder usar el que le pasaron.
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
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select a.empresa_id into v_id
  from public.empresa_accesos a
  where a.codigo = upper(trim(coalesce(p_codigo, ''))) and a.activo;

  if v_id is null then
    raise exception 'El código no corresponde a ninguna empresa.' using errcode = '42501';
  end if;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Colaborador'), 'vendedor')
  on conflict (empresa_id, user_id) do nothing;

  return v_id;
end $$;

-- ------------------------------------------------------------
-- 5. Recién ahora sacamos la columna vieja.
--    Ya está copiada a empresa_accesos y ninguna función la usa.
-- ------------------------------------------------------------
alter table public.empresas drop column if exists codigo_acceso;

-- El trigger de la 002 controlaba `codigo_acceso` dentro de `empresas`.
-- Si no lo redefinimos, cualquier UPDATE sobre empresas falla con
-- "record new has no field codigo_acceso". La identidad ahora son `id` y
-- `creada_por`; el código está en empresa_accesos, que no tiene ninguna
-- policy de escritura, así que sigue igual de protegido.
create or replace function public.proteger_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id
     or new.creada_por is distinct from old.creada_por then
    raise exception 'No se pueden cambiar los datos de identidad de la empresa.' using errcode = '42501';
  end if;

  if new.plan is distinct from old.plan
     and coalesce(current_setting('orden.suscripcion_confiable', true), '') <> '1' then
    raise exception 'El plan solo lo puede cambiar el sistema de suscripciones.' using errcode = '42501';
  end if;

  return new;
end $$;

-- ------------------------------------------------------------
-- 6. PLAN EFECTIVO · la única fuente de verdad sobre el acceso Pro
--
--    Regla:
--      · plan 'gratis'                                    → gratis
--      · plan 'pro' + estado 'activa'  y periodo vigente  → pro
--      · plan 'pro' + estado 'prueba'  y periodo vigente  → pro
--      · plan 'pro' + estado 'cancelada' con periodo_fin en el futuro → pro
--        (lo pagado se respeta hasta que termine; al vencer cae a gratis)
--      · plan 'pro' + estado 'vencida'                    → gratis
--      · cualquier plan con periodo_fin ya pasado         → gratis
--      · sin fila de suscripción                          → gratis
--
--    periodo_fin NULL significa "sin vencimiento" (no vence).
-- ------------------------------------------------------------
-- Devuelve SIEMPRE un valor. Si no hay fila de suscripción, la respuesta es
-- 'gratis', nunca NULL: un null podría romper una comparación y regalar acceso.
create or replace function public.plan_efectivo(p_empresa uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when s.plan <> 'pro' then 'gratis'
      when s.periodo_fin is not null and s.periodo_fin <= now() then 'gratis'
      when s.estado in ('activa', 'prueba') then 'pro'
      when s.estado = 'cancelada' and s.periodo_fin is not null and s.periodo_fin > now() then 'pro'
      else 'gratis'
    end
    from public.suscripciones s
    where s.empresa_id = p_empresa
  ), 'gratis');
$$;

create or replace function public.empresa_es_pro(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.plan_efectivo(p_empresa), 'gratis') = 'pro';
$$;

comment on function public.plan_efectivo(uuid) is
  'Única fuente de verdad sobre el plan. empresas.plan es solo un espejo de lectura '
  'rápida y NO debe usarse para habilitar funciones.';

-- Dejamos claro en el esquema que empresas.plan es legado.
comment on column public.empresas.plan is
  'ESPEJO / LEGADO. La autoridad es suscripciones + plan_efectivo(). No usar para dar acceso.';

-- ------------------------------------------------------------
-- 7. COLUMNAS SENSIBLES · el costo no sale de la base para un vendedor
--
--    RLS no filtra columnas, así que usamos privilegios por columna:
--    `authenticated` pierde el SELECT sobre las tres columnas de costo.
--    Ni siquiera un administrador las lee por consulta directa: los costos
--    se sirven por las funciones listar_productos() y listar_movimientos(),
--    que deciden según el rol.
--
--    Esto es lo que hace que ocultarlo en React deje de ser la protección.
-- ------------------------------------------------------------
revoke select on public.productos        from anon, authenticated;
revoke select on public.movimientos      from anon, authenticated;
revoke select on public.movimiento_items from anon, authenticated;

grant select (
  id, empresa_id, nombre, categoria, precio, stock, stock_minimo,
  controla_stock, activo, created_at
) on public.productos to authenticated;

grant select (
  id, empresa_id, tipo, estado, fecha, descripcion, categoria,
  subtotal, descuento, monto, metodo_pago, contraparte, notas, origen,
  creado_por, created_at, anulado_por, anulado_at, motivo_anulacion,
  actualizado_por, updated_at
) on public.movimientos to authenticated;

grant select (
  id, movimiento_id, empresa_id, producto_id, nombre, cantidad,
  precio_unitario, afecto_stock
) on public.movimiento_items to authenticated;

-- El INSERT de gastos e ingresos sigue igual (la policy ya exige costo_total = 0).
grant insert on public.movimientos to authenticated;

-- ------------------------------------------------------------
-- 8. LECTURAS SEGURAS · una sola puerta que decide según el rol
--
--    El frontend deja de hacer `select *` y de ignorar columnas.
--    Estas funciones devuelven exactamente lo que la persona puede ver:
--    los costos vienen en NULL para un vendedor.
-- ------------------------------------------------------------
create or replace function public.listar_productos(
  p_empresa uuid,
  p_incluir_pausados boolean default false
)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_admin := public.es_admin(p_empresa);

  return query
  select to_jsonb(x) from (
    select
      p.id, p.empresa_id, p.nombre, p.categoria,
      case when v_admin then p.costo else null end as costo,
      p.precio, p.stock, p.stock_minimo, p.controla_stock, p.activo, p.created_at
    from public.productos p
    where p.empresa_id = p_empresa
      and (p_incluir_pausados or p.activo)
    order by p.nombre
  ) x;
end $$;

create or replace function public.listar_movimientos(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_admin := public.es_admin(p_empresa);

  return query
  select to_jsonb(x) from (
    select
      m.id, m.empresa_id, m.tipo, m.estado, m.fecha, m.descripcion, m.categoria,
      m.subtotal, m.descuento, m.monto,
      case when v_admin then m.costo_total else null end as costo_total,
      m.metodo_pago, m.contraparte, m.notas, m.origen, m.creado_por, m.created_at,
      m.anulado_por, m.anulado_at, m.motivo_anulacion, m.actualizado_por, m.updated_at,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'movimiento_id', i.movimiento_id,
            'empresa_id', i.empresa_id,
            'producto_id', i.producto_id,
            'nombre', i.nombre,
            'cantidad', i.cantidad,
            'precio_unitario', i.precio_unitario,
            'costo_unitario', case when v_admin then i.costo_unitario else null end,
            'afecto_stock', i.afecto_stock
          ) order by i.nombre
        )
        from public.movimiento_items i where i.movimiento_id = m.id
      ), '[]'::jsonb) as movimiento_items
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
    order by m.fecha desc, m.created_at desc
    limit 5000
  ) x;
end $$;

-- Datos de la empresa activa + su plan efectivo, en una sola llamada.
create or replace function public.datos_empresa(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', e.id,
    'nombre', e.nombre,
    'moneda', e.moneda,
    'plan_efectivo', public.plan_efectivo(e.id),
    'permitir_stock_negativo', e.permitir_stock_negativo,
    -- El código solo viaja si quien pregunta puede administrarlo.
    'codigo_acceso', case
      when public.es_admin(e.id) then (select a.codigo from public.empresa_accesos a where a.empresa_id = e.id and a.activo)
      else null
    end
  ) into v_res
  from public.empresas e where e.id = p_empresa;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- 9. RLS DE LAS TABLAS NUEVAS
-- ------------------------------------------------------------
alter table public.empresa_accesos enable row level security;

-- Solo propietario y admin ven el código. El vendedor no, ni por consulta directa.
drop policy if exists empresa_accesos_select on public.empresa_accesos;
create policy empresa_accesos_select on public.empresa_accesos
  for select using (public.es_admin(empresa_id));

-- Sin policies de escritura: el código lo crea crear_empresa().
revoke all on public.empresa_accesos from anon, authenticated;
grant select on public.empresa_accesos to authenticated;

-- ------------------------------------------------------------
-- 10. PERMISOS DE FUNCIÓN
-- ------------------------------------------------------------
grant execute on function public.listar_productos(uuid, boolean)   to authenticated;
grant execute on function public.listar_movimientos(uuid, date, date) to authenticated;
grant execute on function public.datos_empresa(uuid)               to authenticated;
grant execute on function public.plan_efectivo(uuid)               to authenticated;
grant execute on function public.empresa_es_pro(uuid)              to authenticated;
grant execute on function public.crear_empresa(text, text, text)   to authenticated;
grant execute on function public.unirse_empresa(text, text)        to authenticated;

-- El plan lo mueve únicamente el backend con la clave de servicio.
-- `revoke from public` no alcanza: hay que otorgárselo explícitamente a service_role.
revoke all on function public.aplicar_suscripcion(uuid, text, text, timestamptz, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.aplicar_suscripcion(uuid, text, text, timestamptz, timestamptz, text, text, text)
  to service_role;

-- service_role también necesita poder leer/escribir las tablas de suscripción
-- para tareas de mantenimiento (vencer periodos, conciliar). Las funciones
-- SECURITY DEFINER no lo requieren, pero un job del backend sí.
grant select, insert, update on public.suscripciones to service_role;
grant select on public.empresas to service_role;


-- ############################################################
-- ##  004_lecturas_consistentes.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 004 · Consistencia final de lecturas
--
-- Dos correcciones sobre la 003:
--
--   1. `listar_movimientos()` tenía `limit 5000`. Si un negocio superaba esa
--      cantidad en el periodo consultado, el panel, los reportes, el reto y el
--      Excel mostraban totales incompletos SIN avisar. Un número financiero
--      incorrecto y silencioso es peor que un error.
--
--   2. `plan_efectivo()` y `empresa_es_pro()` estaban otorgadas a
--      `authenticated` sin comprobar pertenencia: cualquier usuario con sesión
--      podía averiguar el plan de cualquier empresa pasando su UUID.
--
-- Idempotente. No toca datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PLAN EFECTIVO · separar el cálculo del control de acceso
--
--    La lógica pasa a una función interna que NO se otorga a nadie.
--    Las funciones públicas comprueban pertenencia antes de responder.
-- ------------------------------------------------------------
create or replace function public.plan_efectivo_calculado(p_empresa uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when s.plan <> 'pro' then 'gratis'
      when s.periodo_fin is not null and s.periodo_fin <= now() then 'gratis'
      when s.estado in ('activa', 'prueba') then 'pro'
      when s.estado = 'cancelada' and s.periodo_fin is not null and s.periodo_fin > now() then 'pro'
      else 'gratis'
    end
    from public.suscripciones s
    where s.empresa_id = p_empresa
  ), 'gratis');
$$;

comment on function public.plan_efectivo_calculado(uuid) is
  'Cálculo puro del plan, SIN control de acceso. No se otorga a authenticated: '
  'la usan plan_efectivo() y datos_empresa(), que ya comprobaron pertenencia.';

-- Versión pública: primero verifica que quien pregunta sea de la empresa.
create or replace function public.plan_efectivo(p_empresa uuid)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  return public.plan_efectivo_calculado(p_empresa);
end $$;

create or replace function public.empresa_es_pro(p_empresa uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  return public.plan_efectivo_calculado(p_empresa) = 'pro';
end $$;

-- datos_empresa() ya comprobó pertenencia, así que usa el cálculo directo.
create or replace function public.datos_empresa(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', e.id,
    'nombre', e.nombre,
    'moneda', e.moneda,
    'plan_efectivo', public.plan_efectivo_calculado(e.id),
    'permitir_stock_negativo', e.permitir_stock_negativo,
    -- El código solo viaja si quien pregunta puede administrarlo.
    'codigo_acceso', case
      when public.es_admin(e.id) then (select a.codigo from public.empresa_accesos a where a.empresa_id = e.id and a.activo)
      else null
    end
  ) into v_res
  from public.empresas e where e.id = p_empresa;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- 2. LISTAR MOVIMIENTOS · nunca truncar en silencio
--
--    Si el periodo tiene más movimientos de los que se pueden devolver de una
--    vez, la función FALLA con un mensaje claro en vez de entregar totales
--    incompletos. El tope es alto (20.000): un negocio chico no lo alcanza ni
--    con un año entero, y quien lo alcance recibe una instrucción concreta.
-- ------------------------------------------------------------
create or replace function public.listar_movimientos(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean;
  v_total bigint;
  v_tope  constant integer := 20000;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  -- Contamos ANTES de devolver nada. Si no entra, avisamos en vez de recortar:
  -- un total incompleto sin aviso es un número equivocado.
  select count(*) into v_total
  from public.movimientos m
  where m.empresa_id = p_empresa and m.fecha between p_desde and p_hasta;

  if v_total > v_tope then
    raise exception
      'El periodo elegido tiene % movimientos y el máximo por consulta es %. Elegí un rango más corto para que los totales sean exactos.',
      v_total, v_tope
      using errcode = '54000';
  end if;

  v_admin := public.es_admin(p_empresa);

  return query
  select to_jsonb(x) from (
    select
      m.id, m.empresa_id, m.tipo, m.estado, m.fecha, m.descripcion, m.categoria,
      m.subtotal, m.descuento, m.monto,
      case when v_admin then m.costo_total else null end as costo_total,
      m.metodo_pago, m.contraparte, m.notas, m.origen, m.creado_por, m.created_at,
      m.anulado_por, m.anulado_at, m.motivo_anulacion, m.actualizado_por, m.updated_at,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'movimiento_id', i.movimiento_id,
            'empresa_id', i.empresa_id,
            'producto_id', i.producto_id,
            'nombre', i.nombre,
            'cantidad', i.cantidad,
            'precio_unitario', i.precio_unitario,
            'costo_unitario', case when v_admin then i.costo_unitario else null end,
            'afecto_stock', i.afecto_stock
          ) order by i.nombre
        )
        from public.movimiento_items i where i.movimiento_id = m.id
      ), '[]'::jsonb) as movimiento_items
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
    order by m.fecha desc, m.created_at desc
  ) x;
end $$;

-- ------------------------------------------------------------
-- 3. PERMISOS
-- ------------------------------------------------------------
-- El cálculo interno no se expone: solo lo usan funciones que ya controlaron acceso.
revoke all on function public.plan_efectivo_calculado(uuid) from public, anon, authenticated;

grant execute on function public.plan_efectivo(uuid)                  to authenticated;
grant execute on function public.empresa_es_pro(uuid)                 to authenticated;
grant execute on function public.datos_empresa(uuid)                  to authenticated;
grant execute on function public.listar_movimientos(uuid, date, date) to authenticated;

-- El backend sí puede consultar el plan de cualquier empresa (jobs de
-- vencimiento, conciliación de pagos): para eso usa el cálculo directo.
grant execute on function public.plan_efectivo_calculado(uuid) to service_role;


-- ############################################################
-- ##  005_lecturas_escalables.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 005 · Lecturas escalables
--
-- Problema: hasta acá, panel, reportes, reto y Excel pedían TODOS los
-- movimientos del periodo y sumaban en JavaScript. La 004 evitó que
-- PostgreSQL truncara en silencio, pero entre PostgreSQL y el navegador hay
-- otra capa —PostgREST / Data API— que aplica su propio máximo de filas
-- (`db-max-rows`, típicamente 1.000). Si ese tope se activa, el cliente
-- recibe menos filas de las que hay y suma un total incompleto sin enterarse.
--
-- Solución: separar mostrar de calcular.
--   · CALCULAR  → agregaciones en PostgreSQL que devuelven pocas filas.
--                 Un tope de 1.000 filas no puede afectar a algo que
--                 devuelve 1 objeto o 30 categorías.
--   · MOSTRAR   → historial paginado con cursor estable.
--
-- Las reglas financieras son exactamente las mismas que en calculos.ts:
--   ventas = monto (neto de descuento) · anuladas no suman ·
--   ganancia bruta = ventas − costo histórico ·
--   ganancia neta = bruta + otros ingresos − gastos ·
--   descuento prorrateado por peso de cada línea.
--
-- Idempotente. No toca datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RESUMEN FINANCIERO · un solo objeto, sin importar el volumen
--
--    Los campos sensibles (costo, ganancias, márgenes) vienen en NULL para
--    quien no puede verlos. Nunca en cero: null no es cero.
-- ------------------------------------------------------------
create or replace function public.resumen_financiero(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean;
  v_res   jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_admin := public.es_admin(p_empresa);

  with base as (
    select m.tipo, m.estado, m.monto, m.subtotal, m.costo_total, m.id
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
  ),
  totales as (
    select
      coalesce(sum(monto)       filter (where estado = 'activo' and tipo = 'venta'),   0)::numeric as ventas,
      coalesce(sum(subtotal)    filter (where estado = 'activo' and tipo = 'venta'),   0)::numeric as ventas_brutas,
      coalesce(sum(costo_total) filter (where estado = 'activo' and tipo = 'venta'),   0)::numeric as costo_mercaderia,
      coalesce(sum(monto)       filter (where estado = 'activo' and tipo = 'ingreso'), 0)::numeric as otros_ingresos,
      coalesce(sum(monto)       filter (where estado = 'activo' and tipo = 'gasto'),   0)::numeric as gastos,
      coalesce(count(*)         filter (where estado = 'activo' and tipo = 'venta'),   0)::bigint  as cantidad_ventas,
      coalesce(count(*)         filter (where estado = 'anulado' and tipo = 'venta'),  0)::bigint  as ventas_anuladas,
      coalesce(sum(monto)       filter (where estado = 'anulado' and tipo = 'venta'),  0)::numeric as monto_ventas_anuladas,
      coalesce(count(*)         filter (where estado = 'anulado'),                     0)::bigint  as movimientos_anulados,
      coalesce(sum(monto)       filter (where estado = 'anulado'),                     0)::numeric as monto_movimientos_anulados
    from base
  ),
  unidades as (
    -- Solo de ventas válidas. Se cuenta acá y no en `base` para no multiplicar
    -- los montos de la cabecera por la cantidad de líneas.
    select coalesce(sum(i.cantidad), 0)::numeric as unidades
    from public.movimiento_items i
    join public.movimientos m on m.id = i.movimiento_id
    -- El filtro por empresa va también sobre los items. Es redundante (un item
    -- siempre pertenece a la misma empresa que su movimiento, y hay una prueba
    -- que lo verifica), pero le permite al planificador entrar por el índice
    -- de items en vez de recorrer la tabla entera. Medido: 7 veces más rápido.
    where i.empresa_id = p_empresa
      and m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and m.tipo = 'venta'
  ),
  derivados as (
    select
      t.*,
      u.unidades,
      (t.ventas + t.otros_ingresos) as ingresos_totales,
      (t.ventas - t.costo_mercaderia) as ganancia_bruta,
      (t.ventas - t.costo_mercaderia + t.otros_ingresos - t.gastos) as ganancia_neta
    from totales t cross join unidades u
  )
  select jsonb_build_object(
    'ventas',                     d.ventas,
    'ventas_brutas',              d.ventas_brutas,
    'descuentos',                 d.ventas_brutas - d.ventas,
    'otros_ingresos',             d.otros_ingresos,
    'ingresos_totales',           d.ingresos_totales,
    'gastos',                     d.gastos,
    'cantidad_ventas',            d.cantidad_ventas,
    'unidades_vendidas',          d.unidades,
    'ticket_promedio',            case when d.cantidad_ventas > 0 then d.ventas / d.cantidad_ventas else 0 end,
    'ventas_anuladas',            d.ventas_anuladas,
    'monto_ventas_anuladas',      d.monto_ventas_anuladas,
    'movimientos_anulados',       d.movimientos_anulados,
    'monto_movimientos_anulados', d.monto_movimientos_anulados,
    -- A partir de acá, solo para quien puede ver rentabilidad.
    'costo_mercaderia', case when v_admin then d.costo_mercaderia else null end,
    'ganancia_bruta',   case when v_admin then d.ganancia_bruta   else null end,
    'ganancia_neta',    case when v_admin then d.ganancia_neta    else null end,
    'margen_bruto',     case when v_admin and d.ventas > 0
                             then (d.ganancia_bruta / d.ventas) * 100 else null end,
    'margen_neto',      case when v_admin and d.ingresos_totales > 0
                             then (d.ganancia_neta / d.ingresos_totales) * 100 else null end,
    'con_costos',       v_admin
  ) into v_res
  from derivados d;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- 2. RANKING DE PRODUCTOS · agregado sobre todas las ventas válidas
--
--    El descuento se reparte proporcionalmente al peso de cada línea dentro
--    del subtotal de su venta: exactamente la misma política que calculos.ts.
--    Por eso la suma de `ingresos` reconcilia con `resumen.ventas`.
-- ------------------------------------------------------------
create or replace function public.ranking_productos(
  p_empresa uuid,
  p_desde date,
  p_hasta date,
  p_limite integer default null
)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_admin := public.es_admin(p_empresa);

  return query
  with lineas as (
    select
      -- Misma clave de agrupación que calculos.ts: por producto del catálogo,
      -- o por nombre normalizado si fue una venta suelta.
      coalesce(i.producto_id::text, 'libre:' || lower(trim(i.nombre))) as clave,
      i.producto_id,
      i.nombre,
      i.cantidad,
      i.cantidad * i.precio_unitario as bruto,
      i.cantidad * i.precio_unitario * coalesce(m.monto / nullif(m.subtotal, 0), 1) as neto,
      i.cantidad * i.costo_unitario as costo,
      m.fecha,
      m.created_at
    from public.movimiento_items i
    join public.movimientos m on m.id = i.movimiento_id
    -- Mismo motivo que en resumen_financiero: filtrar los items por empresa
    -- evita un recorrido completo de movimiento_items.
    where i.empresa_id = p_empresa
      and m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and m.tipo = 'venta'
  ),
  agrupado as (
    select
      clave,
      -- El nombre de la línea más reciente, igual que hace la versión de
      -- TypeScript recorriendo los movimientos en orden descendente.
      (array_agg(nombre order by fecha desc, created_at desc))[1] as nombre,
      (array_agg(producto_id order by fecha desc, created_at desc))[1] as producto_id,
      sum(cantidad)::numeric as unidades,
      sum(bruto)::numeric    as ingresos_brutos,
      sum(neto)::numeric     as ingresos,
      sum(costo)::numeric    as costo,
      count(*)::bigint       as operaciones
    from lineas
    group by clave
  ),
  con_total as (
    select a.*, sum(a.ingresos) over () as total_ingresos
    from agrupado a
  )
  select jsonb_build_object(
    'producto_id',     c.producto_id,
    'nombre',          c.nombre,
    'unidades',        c.unidades,
    'ingresos_brutos', c.ingresos_brutos,
    'descuento',       c.ingresos_brutos - c.ingresos,
    'ingresos',        c.ingresos,
    'operaciones',     c.operaciones,
    'participacion',   case when c.total_ingresos > 0 then (c.ingresos / c.total_ingresos) * 100 else 0 end,
    'costo',    case when v_admin then c.costo else null end,
    'ganancia', case when v_admin then c.ingresos - c.costo else null end,
    'margen',   case when v_admin and c.ingresos > 0
                     then ((c.ingresos - c.costo) / c.ingresos) * 100 else null end
  )
  from con_total c
  order by c.ingresos desc
  limit case when p_limite is null or p_limite <= 0 then null else p_limite end;
end $$;

-- ------------------------------------------------------------
-- 3. SERIE DIARIA · una fila por día, con o sin ganancia según el rol
-- ------------------------------------------------------------
create or replace function public.serie_financiera_diaria(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean;
  v_dias  integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_dias := (p_hasta - p_desde) + 1;
  if v_dias > 1100 then
    raise exception 'El rango no puede superar los 3 años para la serie diaria.' using errcode = '22023';
  end if;

  v_admin := public.es_admin(p_empresa);

  return query
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha
  ),
  porDia as (
    select
      m.fecha,
      coalesce(sum(m.monto)       filter (where m.tipo = 'venta'), 0)::numeric   as ventas,
      coalesce(sum(m.monto)       filter (where m.tipo = 'gasto'), 0)::numeric   as gastos,
      coalesce(sum(m.monto)       filter (where m.tipo = 'ingreso'), 0)::numeric as otros_ingresos,
      coalesce(sum(m.costo_total) filter (where m.tipo = 'venta'), 0)::numeric   as costo
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
    group by m.fecha
  )
  select jsonb_build_object(
    'fecha',          to_char(d.fecha, 'YYYY-MM-DD'),
    'ventas',         coalesce(p.ventas, 0),
    'gastos',         coalesce(p.gastos, 0),
    'otros_ingresos', coalesce(p.otros_ingresos, 0),
    'ganancia', case
      when v_admin then coalesce(p.ventas, 0) - coalesce(p.costo, 0)
                      + coalesce(p.otros_ingresos, 0) - coalesce(p.gastos, 0)
      else null
    end
  )
  from dias d
  left join porDia p on p.fecha = d.fecha
  order by d.fecha;
end $$;

-- ------------------------------------------------------------
-- 4. GASTOS POR CATEGORÍA
-- ------------------------------------------------------------
create or replace function public.gastos_por_categoria(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  return query
  with porCategoria as (
    select
      trim(coalesce(nullif(trim(m.categoria), ''), 'General')) as nombre,
      sum(m.monto)::numeric as monto,
      count(*)::bigint      as operaciones
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and m.tipo = 'gasto'
    group by 1
  ),
  con_total as (
    select c.*, sum(c.monto) over () as total from porCategoria c
  )
  select jsonb_build_object(
    'nombre',        c.nombre,
    'monto',         c.monto,
    'operaciones',   c.operaciones,
    'participacion', case when c.total > 0 then (c.monto / c.total) * 100 else 0 end
  )
  from con_total c
  order by c.monto desc;
end $$;

-- ------------------------------------------------------------
-- 5. COBROS POR MÉTODO · todo lo que entró (ventas y otros ingresos)
-- ------------------------------------------------------------
create or replace function public.cobros_por_metodo(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  return query
  with porMetodo as (
    select m.metodo_pago as metodo, sum(m.monto)::numeric as monto
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and m.tipo <> 'gasto'
    group by m.metodo_pago
  ),
  con_total as (
    select p.*, sum(p.monto) over () as total from porMetodo p
  )
  select jsonb_build_object(
    'metodo',        c.metodo,
    'monto',         c.monto,
    'participacion', case when c.total > 0 then (c.monto / c.total) * 100 else 0 end
  )
  from con_total c
  order by c.monto desc;
end $$;

-- ------------------------------------------------------------
-- 6. HISTORIAL PAGINADO · cursor estable (fecha, created_at, id)
--
--    Se usa comparación de tuplas para que el keyset no salte ni repita
--    filas cuando hay varias operaciones en el mismo instante.
--    El orden es siempre descendente: lo más nuevo primero.
-- ------------------------------------------------------------
create or replace function public.pagina_movimientos(
  p_empresa uuid,
  p_desde date,
  p_hasta date,
  p_tamano integer default 100,
  p_cursor_fecha date default null,
  p_cursor_created timestamptz default null,
  p_cursor_id uuid default null,
  p_tipo tipo_movimiento default null,
  p_incluir_anuladas boolean default true,
  p_busqueda text default null
)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin  boolean;
  v_tamano integer;
  v_busca  text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  -- Tope duro: nadie pide más de 500 por página, ni siquiera el generador
  -- de Excel. Así ninguna respuesta se acerca al máximo de filas de la API.
  v_tamano := least(greatest(coalesce(p_tamano, 100), 1), 500);
  v_admin  := public.es_admin(p_empresa);
  v_busca  := nullif(lower(trim(coalesce(p_busqueda, ''))), '');

  return query
  select to_jsonb(x) from (
    select
      m.id, m.empresa_id, m.tipo, m.estado, m.fecha, m.descripcion, m.categoria,
      m.subtotal, m.descuento, m.monto,
      case when v_admin then m.costo_total else null end as costo_total,
      m.metodo_pago, m.contraparte, m.notas, m.origen, m.creado_por, m.created_at,
      m.anulado_por, m.anulado_at, m.motivo_anulacion, m.actualizado_por, m.updated_at,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'movimiento_id', i.movimiento_id,
            'empresa_id', i.empresa_id,
            'producto_id', i.producto_id,
            'nombre', i.nombre,
            'cantidad', i.cantidad,
            'precio_unitario', i.precio_unitario,
            'costo_unitario', case when v_admin then i.costo_unitario else null end,
            'afecto_stock', i.afecto_stock
          ) order by i.nombre
        )
        from public.movimiento_items i where i.movimiento_id = m.id
      ), '[]'::jsonb) as movimiento_items
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and (p_tipo is null or m.tipo = p_tipo)
      and (p_incluir_anuladas or m.estado = 'activo')
      and (
        p_cursor_id is null
        or (m.fecha, m.created_at, m.id) < (p_cursor_fecha, p_cursor_created, p_cursor_id)
      )
      and (
        v_busca is null
        or lower(m.descripcion) like '%' || v_busca || '%'
        or lower(m.categoria)   like '%' || v_busca || '%'
        or lower(coalesce(m.contraparte, '')) like '%' || v_busca || '%'
        or exists (
          select 1 from public.movimiento_items i2
          where i2.movimiento_id = m.id and lower(i2.nombre) like '%' || v_busca || '%'
        )
      )
    order by m.fecha desc, m.created_at desc, m.id desc
    limit v_tamano
  ) x;
end $$;

-- Cuántos movimientos hay en el periodo, para saber si vale la pena paginar.
create or replace function public.contar_movimientos(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare v_total bigint;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.movimientos m
  where m.empresa_id = p_empresa and m.fecha between p_desde and p_hasta;

  return v_total;
end $$;

-- ------------------------------------------------------------
-- 7. ÍNDICES
--
--    Comprobado con EXPLAIN ANALYZE sobre 36.500 movimientos en 20 empresas.
--
--    Los agregados ya entran por movimientos_empresa_fecha_idx (001):
--      resumen de un día  → Bitmap Index Scan ... 0,39 ms
--      resumen de un mes  → Bitmap Index Scan ... 0,41 ms
--      serie de un mes    → Bitmap Index Scan ... 0,41 ms
--    No hace falta ningún índice nuevo para ellos.
--
--    Lo que sí faltaba es el orden exacto de la paginación por cursor:
--    (empresa_id, fecha desc, created_at desc, id desc). Con él la primera
--    página resuelve por Index Only Scan en 0,59 ms; sin él habría que
--    ordenar en memoria todo el periodo en cada página.
-- ------------------------------------------------------------
create index if not exists movimientos_cursor_idx
  on public.movimientos (empresa_id, fecha desc, created_at desc, id desc);

-- El ranking agrupa items por producto dentro de una empresa. Con este índice
-- y el filtro `i.empresa_id = ...` de arriba, el plan pasa de recorrer toda la
-- tabla de items a un Bitmap Index Scan.
--
-- Medido con 18.100 items de 10 empresas, ranking de un mes:
--   sin el filtro → Seq Scan de 18.100 filas ... 18,9 ms
--   con el filtro → Bitmap Index Scan de 1.810 ...  2,5 ms
create index if not exists items_empresa_producto_idx
  on public.movimiento_items (empresa_id, producto_id);

-- ------------------------------------------------------------
-- 8. PERMISOS
-- ------------------------------------------------------------
revoke all on function public.resumen_financiero(uuid, date, date)          from public, anon;
revoke all on function public.ranking_productos(uuid, date, date, integer)  from public, anon;
revoke all on function public.serie_financiera_diaria(uuid, date, date)     from public, anon;
revoke all on function public.gastos_por_categoria(uuid, date, date)        from public, anon;
revoke all on function public.cobros_por_metodo(uuid, date, date)           from public, anon;
revoke all on function public.contar_movimientos(uuid, date, date)          from public, anon;
revoke all on function public.pagina_movimientos(uuid, date, date, integer, date, timestamptz, uuid, tipo_movimiento, boolean, text)
  from public, anon;

grant execute on function public.resumen_financiero(uuid, date, date)         to authenticated;
grant execute on function public.ranking_productos(uuid, date, date, integer) to authenticated;
grant execute on function public.serie_financiera_diaria(uuid, date, date)    to authenticated;
grant execute on function public.gastos_por_categoria(uuid, date, date)       to authenticated;
grant execute on function public.cobros_por_metodo(uuid, date, date)          to authenticated;
grant execute on function public.contar_movimientos(uuid, date, date)         to authenticated;
grant execute on function public.pagina_movimientos(uuid, date, date, integer, date, timestamptz, uuid, tipo_movimiento, boolean, text)
  to authenticated;

-- ------------------------------------------------------------
-- 9. listar_movimientos() · qué pasa con la función de la 003/004
--
--    DECISIÓN: queda como helper acotado del lado del SERVIDOR y deja de ser
--    la fuente de los totales. Ya no la usa ninguna pantalla.
--
--    Se conserva porque su tope de 20.000 con error explícito sigue siendo
--    útil para procesos internos que necesitan el periodo entero de una vez,
--    y porque quitarla rompería instalaciones que la tengan cacheada.
--    Para el navegador, el camino correcto es siempre:
--      · números  → resumen_financiero / ranking_productos / serie / gastos / cobros
--      · historial → pagina_movimientos
-- ------------------------------------------------------------
comment on function public.listar_movimientos(uuid, date, date) is
  'HELPER ACOTADO. Devuelve el periodo completo (máx. 20.000, falla si se pasa). '
  'No usar para totales ni desde el navegador: para números usar resumen_financiero() '
  'y para historial pagina_movimientos(). Se mantiene para procesos de servidor.';


-- ############################################################
-- ##  006_confiabilidad_lecturas.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 006 · Confiabilidad de lecturas
--
-- La 005 movió los cálculos a PostgreSQL, pero dejó una grieta: las funciones
-- que devuelven `setof jsonb` siguen siendo, para PostgREST, un conjunto de
-- FILAS. Y PostgREST recorta conjuntos de filas según `db-max-rows`, sin avisar.
--
-- En la práctica eso significaba que:
--   · un catálogo con más de 1.000 productos podía llegar recortado;
--   · un ranking con más de 1.000 productos distintos, también;
--   · una serie diaria de más de 1.000 días (se permitían hasta 1.100), también;
--   · y si `db-max-rows` estuviera configurado bajo (100, 50), hasta una
--     página del historial de 500 podía perder filas.
--
-- Mientras exista una respuesta que PUEDA superar el tope, la afirmación
-- "el tope no afecta los reportes" es una suposición, no una garantía.
--
-- Esta migración la convierte en garantía: TODA función que la aplicación
-- llama devuelve **exactamente una fila** con un único valor jsonb dentro.
-- Un array adentro de un jsonb es un valor, no un conjunto de filas: no hay
-- nada que recortar. El tope puede ser 1.000, 100 o 10; da igual.
--
-- Las reglas de negocio, los permisos y el prorrateo de descuentos NO cambian:
-- el cuerpo de cada consulta es el mismo, solo cambia el envoltorio.
--
-- Idempotente. No toca datos.
-- ============================================================

-- Cambiar el tipo de retorno exige eliminar primero: `create or replace` no
-- puede pasar de `setof jsonb` a `jsonb`.
drop function if exists public.listar_productos(uuid, boolean);
drop function if exists public.listar_movimientos(uuid, date, date);
drop function if exists public.ranking_productos(uuid, date, date, integer);
drop function if exists public.serie_financiera_diaria(uuid, date, date);
drop function if exists public.gastos_por_categoria(uuid, date, date);
drop function if exists public.cobros_por_metodo(uuid, date, date);
drop function if exists public.pagina_movimientos(
  uuid, date, date, integer, date, timestamptz, uuid, tipo_movimiento, boolean, text);

-- ------------------------------------------------------------
-- 1. CATÁLOGO DE PRODUCTOS · un array, no mil filas
-- ------------------------------------------------------------
create or replace function public.listar_productos(
  p_empresa uuid,
  p_incluir_pausados boolean default false
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean;
  v_res   jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_admin := public.es_admin(p_empresa);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.nombre), '[]'::jsonb) into v_res
  from (
    select
      p.id, p.empresa_id, p.nombre, p.categoria,
      case when v_admin then p.costo else null end as costo,
      p.precio, p.stock, p.stock_minimo, p.controla_stock, p.activo, p.created_at
    from public.productos p
    where p.empresa_id = p_empresa
      and (p_incluir_pausados or p.activo)
  ) x;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- 2. RANKING DE PRODUCTOS · el reporte completo, en un solo valor
-- ------------------------------------------------------------
create or replace function public.ranking_productos(
  p_empresa uuid,
  p_desde date,
  p_hasta date,
  p_limite integer default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean;
  v_res   jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_admin := public.es_admin(p_empresa);

  with lineas as (
    select
      -- Misma clave de agrupación que calculos.ts: por producto del catálogo,
      -- o por nombre normalizado si fue una venta suelta.
      coalesce(i.producto_id::text, 'libre:' || lower(trim(i.nombre))) as clave,
      i.producto_id,
      i.nombre,
      i.cantidad,
      i.cantidad * i.precio_unitario as bruto,
      -- Descuento prorrateado por el peso de la línea dentro de su venta.
      i.cantidad * i.precio_unitario * coalesce(m.monto / nullif(m.subtotal, 0), 1) as neto,
      i.cantidad * i.costo_unitario as costo,
      m.fecha,
      m.created_at
    from public.movimiento_items i
    join public.movimientos m on m.id = i.movimiento_id
    -- El filtro por empresa sobre los items es redundante pero le permite al
    -- planificador entrar por índice en vez de recorrer la tabla entera.
    where i.empresa_id = p_empresa
      and m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and m.tipo = 'venta'
  ),
  agrupado as (
    select
      clave,
      (array_agg(nombre order by fecha desc, created_at desc))[1] as nombre,
      (array_agg(producto_id order by fecha desc, created_at desc))[1] as producto_id,
      sum(cantidad)::numeric as unidades,
      sum(bruto)::numeric    as ingresos_brutos,
      sum(neto)::numeric     as ingresos,
      sum(costo)::numeric    as costo,
      count(*)::bigint       as operaciones
    from lineas
    group by clave
  ),
  con_total as (
    select a.*, sum(a.ingresos) over () as total_ingresos from agrupado a
  ),
  recortado as (
    select * from con_total
    order by ingresos desc
    limit case when p_limite is null or p_limite <= 0 then null else p_limite end
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'producto_id',     c.producto_id,
      'nombre',          c.nombre,
      'unidades',        c.unidades,
      'ingresos_brutos', c.ingresos_brutos,
      'descuento',       c.ingresos_brutos - c.ingresos,
      'ingresos',        c.ingresos,
      'operaciones',     c.operaciones,
      'participacion',   case when c.total_ingresos > 0 then (c.ingresos / c.total_ingresos) * 100 else 0 end,
      'costo',    case when v_admin then c.costo else null end,
      'ganancia', case when v_admin then c.ingresos - c.costo else null end,
      'margen',   case when v_admin and c.ingresos > 0
                       then ((c.ingresos - c.costo) / c.ingresos) * 100 else null end
    ) order by c.ingresos desc
  ), '[]'::jsonb) into v_res
  from recortado c;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- 3. SERIE DIARIA · un array con todos los días del rango
-- ------------------------------------------------------------
create or replace function public.serie_financiera_diaria(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean;
  v_dias  integer;
  v_res   jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_dias := (p_hasta - p_desde) + 1;
  if v_dias > 1100 then
    raise exception 'El rango no puede superar los 3 años para la serie diaria.' using errcode = '22023';
  end if;

  v_admin := public.es_admin(p_empresa);

  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha
  ),
  porDia as (
    select
      m.fecha,
      coalesce(sum(m.monto)       filter (where m.tipo = 'venta'), 0)::numeric   as ventas,
      coalesce(sum(m.monto)       filter (where m.tipo = 'gasto'), 0)::numeric   as gastos,
      coalesce(sum(m.monto)       filter (where m.tipo = 'ingreso'), 0)::numeric as otros_ingresos,
      coalesce(sum(m.costo_total) filter (where m.tipo = 'venta'), 0)::numeric   as costo
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
    group by m.fecha
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'fecha',          to_char(d.fecha, 'YYYY-MM-DD'),
      'ventas',         coalesce(p.ventas, 0),
      'gastos',         coalesce(p.gastos, 0),
      'otros_ingresos', coalesce(p.otros_ingresos, 0),
      'ganancia', case
        when v_admin then coalesce(p.ventas, 0) - coalesce(p.costo, 0)
                        + coalesce(p.otros_ingresos, 0) - coalesce(p.gastos, 0)
        else null
      end
    ) order by d.fecha
  ), '[]'::jsonb) into v_res
  from dias d
  left join porDia p on p.fecha = d.fecha;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- 4. GASTOS POR CATEGORÍA
-- ------------------------------------------------------------
create or replace function public.gastos_por_categoria(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  with porCategoria as (
    select
      trim(coalesce(nullif(trim(m.categoria), ''), 'General')) as nombre,
      sum(m.monto)::numeric as monto,
      count(*)::bigint      as operaciones
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and m.tipo = 'gasto'
    group by 1
  ),
  con_total as (
    select c.*, sum(c.monto) over () as total from porCategoria c
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'nombre',        c.nombre,
      'monto',         c.monto,
      'operaciones',   c.operaciones,
      'participacion', case when c.total > 0 then (c.monto / c.total) * 100 else 0 end
    ) order by c.monto desc
  ), '[]'::jsonb) into v_res
  from con_total c;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- 5. COBROS POR MÉTODO
-- ------------------------------------------------------------
create or replace function public.cobros_por_metodo(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  with porMetodo as (
    select m.metodo_pago as metodo, sum(m.monto)::numeric as monto
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and m.tipo <> 'gasto'
    group by m.metodo_pago
  ),
  con_total as (
    select p.*, sum(p.monto) over () as total from porMetodo p
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'metodo',        c.metodo,
      'monto',         c.monto,
      'participacion', case when c.total > 0 then (c.monto / c.total) * 100 else 0 end
    ) order by c.monto desc
  ), '[]'::jsonb) into v_res
  from con_total c;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- 6. PÁGINA DEL HISTORIAL · un objeto con la página y el cursor
--
--    Además de blindar el tamaño de la respuesta, ahora el cursor lo calcula
--    el servidor. Antes lo derivaba el cliente de la última fila recibida: si
--    esa lista venía recortada, el cursor apuntaba al lugar equivocado y la
--    paginación se salteaba movimientos en silencio.
-- ------------------------------------------------------------
create or replace function public.pagina_movimientos(
  p_empresa uuid,
  p_desde date,
  p_hasta date,
  p_tamano integer default 100,
  p_cursor_fecha date default null,
  p_cursor_created timestamptz default null,
  p_cursor_id uuid default null,
  p_tipo tipo_movimiento default null,
  p_incluir_anuladas boolean default true,
  p_busqueda text default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin   boolean;
  v_tamano  integer;
  v_busca   text;
  v_filas   jsonb;
  v_cuantas integer;
  v_ultima  jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_tamano := least(greatest(coalesce(p_tamano, 100), 1), 500);
  v_admin  := public.es_admin(p_empresa);
  v_busca  := nullif(lower(trim(coalesce(p_busqueda, ''))), '');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha desc, x.created_at desc, x.id desc), '[]'::jsonb)
  into v_filas
  from (
    select
      m.id, m.empresa_id, m.tipo, m.estado, m.fecha, m.descripcion, m.categoria,
      m.subtotal, m.descuento, m.monto,
      case when v_admin then m.costo_total else null end as costo_total,
      m.metodo_pago, m.contraparte, m.notas, m.origen, m.creado_por, m.created_at,
      m.anulado_por, m.anulado_at, m.motivo_anulacion, m.actualizado_por, m.updated_at,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'movimiento_id', i.movimiento_id,
            'empresa_id', i.empresa_id,
            'producto_id', i.producto_id,
            'nombre', i.nombre,
            'cantidad', i.cantidad,
            'precio_unitario', i.precio_unitario,
            'costo_unitario', case when v_admin then i.costo_unitario else null end,
            'afecto_stock', i.afecto_stock
          ) order by i.nombre
        )
        from public.movimiento_items i where i.movimiento_id = m.id
      ), '[]'::jsonb) as movimiento_items
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and (p_tipo is null or m.tipo = p_tipo)
      and (p_incluir_anuladas or m.estado = 'activo')
      and (
        p_cursor_id is null
        or (m.fecha, m.created_at, m.id) < (p_cursor_fecha, p_cursor_created, p_cursor_id)
      )
      and (
        v_busca is null
        or lower(m.descripcion) like '%' || v_busca || '%'
        or lower(m.categoria)   like '%' || v_busca || '%'
        or lower(coalesce(m.contraparte, '')) like '%' || v_busca || '%'
        or exists (
          select 1 from public.movimiento_items i2
          where i2.movimiento_id = m.id and lower(i2.nombre) like '%' || v_busca || '%'
        )
      )
    order by m.fecha desc, m.created_at desc, m.id desc
    limit v_tamano
  ) x;

  v_cuantas := jsonb_array_length(v_filas);
  v_ultima  := case when v_cuantas > 0 then v_filas -> (v_cuantas - 1) else null end;

  return jsonb_build_object(
    'movimientos', v_filas,
    -- Si la página vino completa puede haber más; si vino incompleta, terminó.
    'siguiente', case
      when v_cuantas = v_tamano and v_ultima is not null then jsonb_build_object(
        'fecha',      v_ultima ->> 'fecha',
        'created_at', v_ultima ->> 'created_at',
        'id',         v_ultima ->> 'id'
      )
      else null
    end,
    'tamano', v_tamano
  );
end $$;

-- ------------------------------------------------------------
-- 7. HELPER DE SERVIDOR · también devuelve un solo valor
--
--    No lo usa ninguna pantalla (ver el comentario de la 005), pero mientras
--    exista con `setof` es un camino que alguien podría tomar y que el tope
--    de filas podría recortar. Con esto ya no queda ningún camino truncable.
-- ------------------------------------------------------------
create or replace function public.listar_movimientos(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean;
  v_total bigint;
  v_tope  constant integer := 20000;
  v_res   jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select count(*) into v_total
  from public.movimientos m
  where m.empresa_id = p_empresa and m.fecha between p_desde and p_hasta;

  if v_total > v_tope then
    raise exception
      'El periodo elegido tiene % movimientos y el máximo por consulta es %. Elegí un rango más corto para que los totales sean exactos.',
      v_total, v_tope
      using errcode = '54000';
  end if;

  v_admin := public.es_admin(p_empresa);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha desc, x.created_at desc), '[]'::jsonb)
  into v_res
  from (
    select
      m.id, m.empresa_id, m.tipo, m.estado, m.fecha, m.descripcion, m.categoria,
      m.subtotal, m.descuento, m.monto,
      case when v_admin then m.costo_total else null end as costo_total,
      m.metodo_pago, m.contraparte, m.notas, m.origen, m.creado_por, m.created_at,
      m.anulado_por, m.anulado_at, m.motivo_anulacion, m.actualizado_por, m.updated_at,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'movimiento_id', i.movimiento_id,
            'empresa_id', i.empresa_id,
            'producto_id', i.producto_id,
            'nombre', i.nombre,
            'cantidad', i.cantidad,
            'precio_unitario', i.precio_unitario,
            'costo_unitario', case when v_admin then i.costo_unitario else null end,
            'afecto_stock', i.afecto_stock
          ) order by i.nombre
        )
        from public.movimiento_items i where i.movimiento_id = m.id
      ), '[]'::jsonb) as movimiento_items
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
  ) x;

  return v_res;
end $$;

comment on function public.listar_movimientos(uuid, date, date) is
  'HELPER ACOTADO DE SERVIDOR. Devuelve el periodo completo en un solo jsonb '
  '(máx. 20.000, falla si se pasa). No usar desde el navegador: para números '
  'usar resumen_financiero() y para historial pagina_movimientos().';

-- ------------------------------------------------------------
-- 8. PERMISOS · los mismos de siempre, sobre las firmas nuevas
-- ------------------------------------------------------------
revoke all on function public.listar_productos(uuid, boolean)               from public, anon;
revoke all on function public.listar_movimientos(uuid, date, date)          from public, anon;
revoke all on function public.ranking_productos(uuid, date, date, integer)  from public, anon;
revoke all on function public.serie_financiera_diaria(uuid, date, date)     from public, anon;
revoke all on function public.gastos_por_categoria(uuid, date, date)        from public, anon;
revoke all on function public.cobros_por_metodo(uuid, date, date)           from public, anon;
revoke all on function public.pagina_movimientos(
  uuid, date, date, integer, date, timestamptz, uuid, tipo_movimiento, boolean, text) from public, anon;

grant execute on function public.listar_productos(uuid, boolean)              to authenticated;
grant execute on function public.listar_movimientos(uuid, date, date)         to authenticated;
grant execute on function public.ranking_productos(uuid, date, date, integer) to authenticated;
grant execute on function public.serie_financiera_diaria(uuid, date, date)    to authenticated;
grant execute on function public.gastos_por_categoria(uuid, date, date)       to authenticated;
grant execute on function public.cobros_por_metodo(uuid, date, date)          to authenticated;
grant execute on function public.pagina_movimientos(
  uuid, date, date, integer, date, timestamptz, uuid, tipo_movimiento, boolean, text) to authenticated;


-- ############################################################
-- ##  007_adjuntos.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 007 · Adjuntos (comprobantes y transcripciones)
--
-- Hasta acá, la foto de un comprobante se mandaba a la IA, se interpretaba
-- y se tiraba. Lo mismo el audio. Eso convertía a Orden en un anotador:
-- el número quedaba, la prueba no.
--
-- Esta migración le da respaldo al movimiento. Dos decisiones que conviene
-- entender antes de leer el SQL:
--
--   1. LA FOTO SE GUARDA, EL AUDIO NO. De un audio lo único que sirve
--      después es lo que se dijo, y eso ya lo tenemos transcripto. Guardar
--      el archivo costaría storage todos los meses para que nadie lo vuelva
--      a escuchar nunca. Por eso `audio` guarda texto y ruta en null.
--
--   2. LOS ARCHIVOS NO VIVEN EN ESTA TABLA. Viven en Storage, bucket
--      privado `comprobantes`, con la ruta empresa_id/movimiento_id/archivo.
--      La primera carpeta es el empresa_id justamente para que la policy de
--      storage.objects pueda decidir con es_miembro() sin consultar nada más.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

do $$ begin
  create type tipo_adjunto as enum ('foto', 'audio');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 1. TABLA
--
--    `movimiento_id` es NOT NULL a propósito: un adjunto suelto no le
--    sirve a nadie y nos dejaría huérfanos imposibles de encontrar. El
--    orden del flujo es: se guarda el movimiento, se sube el archivo,
--    se crea esta fila.
-- ------------------------------------------------------------
create table if not exists public.adjuntos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  movimiento_id uuid not null references public.movimientos (id) on delete cascade,
  tipo          tipo_adjunto not null,
  -- Ruta dentro del bucket. null cuando el adjunto es solo texto (audio).
  ruta          text,
  mime          text,
  bytes         integer not null default 0 check (bytes >= 0),
  -- Transcripción del audio, o lo que la IA leyó de la foto.
  texto         text not null default '',
  creado_por    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),

  -- Una foto sin archivo no es una foto. Un audio con archivo no lo guardamos.
  constraint adjunto_coherente check (
    (tipo = 'foto'  and ruta is not null and char_length(ruta) > 0) or
    (tipo = 'audio' and ruta is null)
  )
);

create index if not exists adjuntos_movimiento_idx on public.adjuntos (movimiento_id);
create index if not exists adjuntos_empresa_idx    on public.adjuntos (empresa_id, created_at desc);

-- La ruta es única: dos filas apuntando al mismo archivo harían que borrar
-- una deje a la otra apuntando a la nada.
create unique index if not exists adjuntos_ruta_idx on public.adjuntos (ruta) where ruta is not null;

comment on table public.adjuntos is
  'Respaldo de un movimiento: foto del comprobante (archivo en Storage) o transcripción de la nota de voz (solo texto, sin archivo).';

-- ------------------------------------------------------------
-- 2. TOPES
--
--    No son de seguridad, son de costo. Storage se paga todos los meses;
--    un usuario subiendo veinte fotos de 4 MB por venta sale más caro que
--    lo que paga. El cliente ya comprime a ~150 KB antes de subir, así que
--    estos topes solo atrapan a quien esquive la interfaz.
-- ------------------------------------------------------------
create or replace function public.limite_adjuntos_movimiento() returns integer
  language sql immutable as $fn$ select 8 $fn$;

create or replace function public.limite_bytes_adjunto() returns integer
  language sql immutable as $fn$ select 5 * 1024 * 1024 $fn$;

-- ------------------------------------------------------------
-- 3. BUCKET PRIVADO Y PERMISOS SOBRE LOS ARCHIVOS
--
--    Todo este bloque está guardado detrás de "¿existe storage.objects?".
--    En Supabase existe siempre. En un PostgreSQL pelado —el que levantan
--    las pruebas— no, y sin la guarda la migración entera fallaría por algo
--    que no tiene nada que ver con las reglas de negocio.
--
--    `public = false`: nadie llega por URL adivinada. La app pide una URL
--    firmada de corta vida, y para que se la den tiene que pasar la policy.
--
--    storage.foldername(name) parte la ruta: [1] es el empresa_id. Con eso
--    es_miembro() decide sin tocar la tabla adjuntos, que puede todavía no
--    tener la fila (el archivo se sube antes de registrarlo).
--
--    Nadie puede ACTUALIZAR un objeto: un comprobante que se puede
--    reemplazar en su lugar no es un comprobante. Se borra y se sube otro.
-- ------------------------------------------------------------
do $bloque$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Sin esquema storage: se omiten bucket y policies de comprobantes.';
    return;
  end if;

  execute format($sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('comprobantes', 'comprobantes', false, %s,
            array['image/webp', 'image/jpeg', 'image/png', 'image/heic'])
    on conflict (id) do update
      set public             = false,
          file_size_limit    = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types
  $sql$, public.limite_bytes_adjunto());

  execute 'drop policy if exists comprobantes_ver    on storage.objects';
  execute 'drop policy if exists comprobantes_subir  on storage.objects';
  execute 'drop policy if exists comprobantes_borrar on storage.objects';

  execute $sql$
    create policy comprobantes_ver on storage.objects
      for select to authenticated
      using (
        bucket_id = 'comprobantes'
        and public.es_miembro(nullif((storage.foldername(name))[1], '')::uuid)
      )
  $sql$;

  execute $sql$
    create policy comprobantes_subir on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'comprobantes'
        and public.es_miembro(nullif((storage.foldername(name))[1], '')::uuid)
      )
  $sql$;

  execute $sql$
    create policy comprobantes_borrar on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'comprobantes'
        and public.es_miembro(nullif((storage.foldername(name))[1], '')::uuid)
      )
  $sql$;

exception
  -- En algunos proyectos de Supabase el rol que corre el SQL Editor no es
  -- dueño de storage.objects y no puede crear policies ahí. No es motivo
  -- para que falle la migración entera: todo lo demás (la tabla `adjuntos`,
  -- las funciones, los topes) queda perfecto, y las tres policies se pueden
  -- cargar a mano desde Storage → Policies con estas mismas condiciones.
  --
  -- Se avisa fuerte porque, hasta que existan, subir un comprobante va a
  -- fallar con "new row violates row-level security policy".
  when insufficient_privilege then
    raise warning 'No se pudieron crear las policies de storage (falta ser dueño de storage.objects). Crealas a mano en Storage → Policies del bucket "comprobantes". El resto de la migración se aplicó bien.';
end $bloque$;

-- ------------------------------------------------------------
-- 5. RLS DE LA TABLA
--
--    Lectura: cualquier miembro. Escritura: NADIE por la puerta directa.
--    Se entra por adjuntar() y borrar_adjunto(), que validan empresa,
--    movimiento, tipo y topes. Si dejáramos el insert abierto, un cliente
--    podría crear una fila que apunta a la ruta de otra empresa.
-- ------------------------------------------------------------
alter table public.adjuntos enable row level security;

drop policy if exists adjuntos_select on public.adjuntos;
create policy adjuntos_select on public.adjuntos
  for select to authenticated
  using (public.es_miembro(empresa_id));

revoke all on public.adjuntos from anon, authenticated;
grant select on public.adjuntos to authenticated;

-- ------------------------------------------------------------
-- 6. ADJUNTAR · la única puerta de entrada
--
--    Valida en este orden: sesión, movimiento visible, coherencia del tipo,
--    tope por movimiento y tope de bytes. Devuelve el id creado.
--
--    Para 'foto' exige que la ruta empiece con "<empresa_id>/<movimiento_id>/".
--    Sin eso, alguien podría registrar como propio un archivo que subió en
--    la carpeta de otro movimiento de su misma empresa y confundir el
--    respaldo de una venta con el de otra.
-- ------------------------------------------------------------
create or replace function public.adjuntar(
  p_movimiento uuid,
  p_tipo       text,
  p_ruta       text default null,
  p_mime       text default null,
  p_bytes      integer default 0,
  p_texto      text default ''
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_empresa uuid;
  v_estado  text;
  v_cuantos integer;
  v_id      uuid;
  v_prefijo text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if p_tipo not in ('foto', 'audio') then
    raise exception 'Tipo de adjunto no reconocido.' using errcode = '22023';
  end if;

  select m.empresa_id, m.estado::text into v_empresa, v_estado
  from public.movimientos m where m.id = p_movimiento;

  if v_empresa is null then
    raise exception 'Ese movimiento no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if v_estado = 'anulado' then
    raise exception 'No se le pueden agregar comprobantes a un movimiento anulado.' using errcode = '42501';
  end if;

  select count(*) into v_cuantos from public.adjuntos where movimiento_id = p_movimiento;
  if v_cuantos >= public.limite_adjuntos_movimiento() then
    raise exception 'Este movimiento ya tiene % comprobantes, que es el máximo.',
      public.limite_adjuntos_movimiento() using errcode = '54000';
  end if;

  if p_tipo = 'foto' then
    if p_ruta is null or char_length(trim(p_ruta)) = 0 then
      raise exception 'Falta la ruta del archivo.' using errcode = '22023';
    end if;
    if coalesce(p_bytes, 0) > public.limite_bytes_adjunto() then
      raise exception 'La foto pesa demasiado.' using errcode = '54000';
    end if;

    v_prefijo := v_empresa::text || '/' || p_movimiento::text || '/';
    if position(v_prefijo in p_ruta) <> 1 then
      raise exception 'La ruta no corresponde a este movimiento.' using errcode = '42501';
    end if;

    insert into public.adjuntos (empresa_id, movimiento_id, tipo, ruta, mime, bytes, texto, creado_por)
    values (v_empresa, p_movimiento, 'foto', p_ruta, p_mime, coalesce(p_bytes, 0),
            coalesce(left(p_texto, 2000), ''), auth.uid())
    returning id into v_id;
  else
    if coalesce(trim(p_texto), '') = '' then
      raise exception 'Una nota de voz sin transcripción no se guarda.' using errcode = '22023';
    end if;

    insert into public.adjuntos (empresa_id, movimiento_id, tipo, ruta, mime, bytes, texto, creado_por)
    values (v_empresa, p_movimiento, 'audio', null, null, 0, left(p_texto, 2000), auth.uid())
    returning id into v_id;
  end if;

  return v_id;
end $fn$;

-- ------------------------------------------------------------
-- 7. BORRAR
--
--    Solo borra la FILA. El archivo lo borra el cliente contra Storage, que
--    tiene su propia policy. Se hace en ese orden a propósito: si el borrado
--    del archivo falla, queda un archivo sin fila (invisible, se limpia
--    después) y no una fila sin archivo (un comprobante roto en pantalla).
--
--    Quien no administra solo puede borrar lo que subió él.
-- ------------------------------------------------------------
create or replace function public.borrar_adjunto(p_adjunto uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_fila public.adjuntos;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_fila from public.adjuntos where id = p_adjunto;
  if v_fila.id is null then
    raise exception 'Ese comprobante no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_fila.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if not public.es_admin(v_fila.empresa_id) and v_fila.creado_por is distinct from auth.uid() then
    raise exception 'Solo podés borrar los comprobantes que subiste vos.' using errcode = '42501';
  end if;

  delete from public.adjuntos where id = p_adjunto;
  return v_fila.ruta;  -- para que el cliente sepa qué archivo borrar
end $fn$;

-- ------------------------------------------------------------
-- 8. LISTAR · una sola fila jsonb
--
--    Mismo criterio que la 006: nada que PostgREST pueda recortar.
-- ------------------------------------------------------------
create or replace function public.adjuntos_de(p_movimiento uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_empresa uuid;
  v_res     jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select m.empresa_id into v_empresa from public.movimientos m where m.id = p_movimiento;
  if v_empresa is null or not public.es_miembro(v_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'id', a.id, 'tipo', a.tipo, 'ruta', a.ruta, 'mime', a.mime,
      'bytes', a.bytes, 'texto', a.texto, 'creado_por', a.creado_por,
      'created_at', a.created_at
    ) as x
    from public.adjuntos a where a.movimiento_id = p_movimiento
  ) s;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 9. CUÁNTOS TIENE CADA MOVIMIENTO · para el listado
--
--    El historial necesita mostrar el clip sin traer los adjuntos de cada
--    fila. Esto devuelve solo el conteo, de a un lote de movimientos.
-- ------------------------------------------------------------
create or replace function public.conteo_adjuntos(p_empresa uuid, p_movimientos uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if auth.uid() is null or not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(movimiento_id::text, n), '{}'::jsonb) into v_res
  from (
    select a.movimiento_id, count(*)::int as n
    from public.adjuntos a
    where a.empresa_id = p_empresa
      and a.movimiento_id = any(coalesce(p_movimientos, '{}'::uuid[]))
    group by a.movimiento_id
  ) s;

  return v_res;
end $fn$;

revoke all on function public.adjuntar(uuid, text, text, text, integer, text) from public, anon;
revoke all on function public.borrar_adjunto(uuid) from public, anon;
revoke all on function public.adjuntos_de(uuid) from public, anon;
revoke all on function public.conteo_adjuntos(uuid, uuid[]) from public, anon;

grant execute on function public.adjuntar(uuid, text, text, text, integer, text) to authenticated;
grant execute on function public.borrar_adjunto(uuid) to authenticated;
grant execute on function public.adjuntos_de(uuid) to authenticated;
grant execute on function public.conteo_adjuntos(uuid, uuid[]) to authenticated;


-- ############################################################
-- ##  008_habito.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 008 · El hábito (cierre del día y racha)
--
-- Las notificaciones no crean la costumbre: traen de vuelta a quien ya la
-- tenía. Lo que la crea es un ritual corto que cierra el día y algo que se
-- pierde si se falta. Eso es lo que agrega esta migración.
--
--   · CIERRE DEL DÍA — una lectura de diez segundos: cuánto entró, cuánto
--     salió, cuánto quedó, y contra qué se compara. Todo calculado en la
--     base, reusando resumen_financiero() para no tener dos definiciones
--     distintas de "ganancia" en el sistema.
--
--   · RACHA — días seguidos con al menos un movimiento cargado. La racha
--     NO se rompe porque hoy todavía no cargaste: se rompe cuando el día
--     termina vacío. Por eso se cuenta hasta ayer y hoy marca "en riesgo".
--     Un contador que te castiga a las 8 de la mañana no motiva a nadie.
--
-- Y de paso: ZONA HORARIA POR EMPRESA. Hasta acá "hoy" era siempre
-- America/Asuncion, clavado. Si Orden sale de Paraguay, un cierre del día
-- calculado en la zona equivocada le muestra a la persona el día de otro.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ZONA HORARIA POR EMPRESA
--
--    El check contra pg_timezone_names evita guardar una zona inventada,
--    que después haría fallar el `at time zone` de todas las lecturas.
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists zona_horaria text not null default 'America/Asuncion';

do $$ begin
  alter table public.empresas add constraint empresas_zona_valida
    check (zona_horaria in (select name from pg_timezone_names));
exception when duplicate_object then null;
          when others then null;  -- si el catálogo no está disponible, no bloquea la migración
end $$;

comment on column public.empresas.zona_horaria is
  'Zona en la que se decide qué día es "hoy" para este negocio. El cierre del día y la racha dependen de esto.';

create or replace function public.hoy_empresa(p_empresa uuid)
returns date language sql stable security definer set search_path = public as $fn$
  select (now() at time zone coalesce(
    (select e.zona_horaria from public.empresas e where e.id = p_empresa),
    'America/Asuncion'
  ))::date;
$fn$;

-- ------------------------------------------------------------
-- 2. CIERRES · el gesto de cerrar el día
--
--    Guardamos que la persona MIRÓ el cierre, no un total. Los totales se
--    recalculan siempre: si mañana se anula una venta de hoy, el cierre de
--    hoy tiene que reflejarlo. Una foto congelada mentiría.
--
--    Es por usuario y no por empresa: en un negocio con tres vendedores,
--    que uno haya mirado el cierre no significa que los otros lo vieron.
-- ------------------------------------------------------------
create table if not exists public.cierres (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  fecha      date not null,
  visto_at   timestamptz not null default now(),
  unique (empresa_id, user_id, fecha)
);

create index if not exists cierres_empresa_fecha_idx on public.cierres (empresa_id, fecha desc);

alter table public.cierres enable row level security;

drop policy if exists cierres_select on public.cierres;
create policy cierres_select on public.cierres
  for select to authenticated
  using (user_id = auth.uid() and public.es_miembro(empresa_id));

revoke all on public.cierres from anon, authenticated;
grant select on public.cierres to authenticated;

create or replace function public.marcar_cierre(p_empresa uuid, p_fecha date default null)
returns date language plpgsql security definer set search_path = public as $fn$
declare v_fecha date;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  -- Un cierre del futuro no existe. Uno muy viejo tampoco sirve de nada.
  if v_fecha > public.hoy_empresa(p_empresa) then
    raise exception 'No se puede cerrar un día que todavía no pasó.' using errcode = '22007';
  end if;

  insert into public.cierres (empresa_id, user_id, fecha)
  values (p_empresa, auth.uid(), v_fecha)
  on conflict (empresa_id, user_id, fecha) do update set visto_at = now();

  return v_fecha;
end $fn$;

-- ------------------------------------------------------------
-- 3. RACHA · días seguidos cargando
--
--    Islas y huecos: a cada día con actividad le restamos su número de
--    orden. Los días consecutivos dan todos el mismo resultado, así que
--    agrupar por ese valor separa las rachas sin recorrer nada dos veces.
--
--    `dias` cuenta la racha vigente; `en_riesgo` es true cuando la racha
--    viene de ayer y hoy todavía está vacío. Ese es el único momento en
--    que tiene sentido empujar con un aviso.
-- ------------------------------------------------------------
create or replace function public.racha_empresa(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_hoy   date;
  v_ayer  date;
  v_res   jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_hoy  := public.hoy_empresa(p_empresa);
  v_ayer := v_hoy - 1;

  with dias as (
    select distinct m.fecha
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.estado = 'activo'
      and m.fecha <= v_hoy
  ),
  numeradas as (
    select fecha, (fecha - (row_number() over (order by fecha))::int) as isla
    from dias
  ),
  rachas as (
    select isla, count(*)::int as largo, min(fecha) as desde, max(fecha) as hasta
    from numeradas group by isla
  ),
  vigente as (
    select * from rachas where hasta in (v_hoy, v_ayer) order by hasta desc limit 1
  )
  select jsonb_build_object(
    'hoy',           v_hoy,
    'dias',          coalesce((select largo from vigente), 0),
    'desde',         (select desde from vigente),
    'hoy_cargado',   exists (select 1 from dias where fecha = v_hoy),
    -- Solo está en riesgo si HAY algo que perder.
    'en_riesgo',     coalesce((select hasta from vigente), v_ayer - 1) = v_ayer,
    'mejor',         coalesce((select max(largo) from rachas), 0),
    'dias_activos',  (select count(*)::int from dias)
  ) into v_res;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 4. CIERRE DEL DÍA
--
--    Reusa resumen_financiero() tres veces: el día, el mismo día de la
--    semana pasada, y los siete días previos. No reimplementa ni una suma,
--    así que "ganancia neta" quiere decir exactamente lo mismo acá que en
--    el panel y que en el Excel. Los permisos también viajan solos: si
--    quien pregunta es vendedor, la ganancia ya llega en null desde
--    adentro y no hay que acordarse de taparla acá.
-- ------------------------------------------------------------
create or replace function public.cierre_del_dia(p_empresa uuid, p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_fecha    date;
  v_previo   date;
  v_hoy_r    jsonb;
  v_prev_r   jsonb;
  v_sem_r    jsonb;
  v_top      jsonb;
  v_res      jsonb;
  v_admin    boolean;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_fecha  := coalesce(p_fecha, public.hoy_empresa(p_empresa));
  v_previo := v_fecha - 7;
  v_admin  := public.es_admin(p_empresa);

  v_hoy_r  := public.resumen_financiero(p_empresa, v_fecha, v_fecha);
  v_prev_r := public.resumen_financiero(p_empresa, v_previo, v_previo);
  -- Los siete días ANTERIORES, sin incluir el que se está cerrando: si lo
  -- incluyéramos, el día se estaría comparando en parte contra sí mismo.
  v_sem_r  := public.resumen_financiero(p_empresa, v_fecha - 7, v_fecha - 1);

  select jsonb_build_object('nombre', r->>'nombre', 'unidades', r->'unidades', 'ingresos', r->'ingresos')
  into v_top
  from jsonb_array_elements(
    coalesce(public.ranking_productos(p_empresa, v_fecha, v_fecha, 1), '[]'::jsonb)
  ) as r
  limit 1;

  select jsonb_build_object(
    'fecha',              v_fecha,
    'es_hoy',             v_fecha = public.hoy_empresa(p_empresa),
    'hubo_actividad',     coalesce((v_hoy_r->>'cantidad_ventas')::numeric, 0) > 0
                          or coalesce((v_hoy_r->>'gastos')::numeric, 0) > 0
                          or coalesce((v_hoy_r->>'otros_ingresos')::numeric, 0) > 0,
    'resumen',            v_hoy_r,
    'misma_dia_semana_pasada', v_prev_r,
    -- Promedio diario de la semana previa, para decir "hoy vendiste más que
    -- un día normal tuyo" sin que un lunes flojo arruine la comparación.
    'promedio_semana',    jsonb_build_object(
                            'ventas',  round(coalesce((v_sem_r->>'ventas')::numeric, 0) / 7, 2),
                            'gastos',  round(coalesce((v_sem_r->>'gastos')::numeric, 0) / 7, 2),
                            'ganancia_neta', case when v_admin
                              then round(coalesce((v_sem_r->>'ganancia_neta')::numeric, 0) / 7, 2)
                              else null end
                          ),
    'producto_estrella',  v_top,
    'racha',              public.racha_empresa(p_empresa),
    'ya_cerrado',         exists (
                            select 1 from public.cierres c
                            where c.empresa_id = p_empresa
                              and c.user_id = auth.uid()
                              and c.fecha = v_fecha
                          )
  ) into v_res;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 5. NEGOCIOS QUE HOY NO CARGARON NADA
--
--    La usa la tarea programada que manda el aviso de la noche. Devuelve
--    solo lo necesario para armar el mensaje, y solo de quien tiene una
--    racha viva que perder: avisarle a alguien que hace tres semanas no
--    entra no es un recordatorio, es spam.
--
--    Es para service_role: corre sin sesión de usuario, desde el cron.
-- ------------------------------------------------------------
create or replace function public.empresas_sin_cargar_hoy(p_racha_minima integer default 2)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id', e.id,
      'nombre',     e.nombre,
      'zona',       e.zona_horaria,
      'racha',      r.largo
    ) as x
    from public.empresas e
    join lateral (
      with dias as (
        select distinct m.fecha from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo'
          and m.fecha <= (now() at time zone e.zona_horaria)::date
      ),
      numeradas as (
        select fecha, (fecha - (row_number() over (order by fecha))::int) as isla from dias
      ),
      rachas as (
        select count(*)::int as largo, max(fecha) as hasta from numeradas group by isla
      )
      select largo, hasta from rachas order by hasta desc limit 1
    ) r on true
    where r.hasta = (now() at time zone e.zona_horaria)::date - 1
      and r.largo >= greatest(p_racha_minima, 1)
  ) s;

  return v_res;
end $fn$;

revoke all on function public.marcar_cierre(uuid, date)      from public, anon;
revoke all on function public.racha_empresa(uuid)            from public, anon;
revoke all on function public.cierre_del_dia(uuid, date)     from public, anon;
revoke all on function public.hoy_empresa(uuid)              from public, anon;
revoke all on function public.empresas_sin_cargar_hoy(integer) from public, anon, authenticated;

grant execute on function public.marcar_cierre(uuid, date)   to authenticated;
grant execute on function public.racha_empresa(uuid)         to authenticated;
grant execute on function public.cierre_del_dia(uuid, date)  to authenticated;
grant execute on function public.hoy_empresa(uuid)           to authenticated;
grant execute on function public.empresas_sin_cargar_hoy(integer) to service_role;


-- ############################################################
-- ##  009_planes_precios.sql
-- ############################################################

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


-- ############################################################
-- ##  010_preferencias_avisos.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 010 · Preferencias, avisos y datos del plan
--
--   · PREFERENCIAS son del USUARIO, no de la empresa. El idioma lo elige la
--     persona: en un negocio pueden convivir alguien que lee español y
--     alguien que lee portugués, y la empresa es una sola.
--
--   · DISPOSITIVOS PUSH: una persona puede tener el celular y la compu. Cada
--     navegador es un endpoint distinto, y el endpoint es la identidad.
--
--   · ENVÍOS: para que el resumen semanal no llegue dos veces si el cron se
--     dispara de más. La clave única es la garantía, no un `if` en el código.
--
-- Y cierra el círculo del plan: datos_empresa() pasa a devolver también qué
-- permite el plan y cuánto va usado, para que la app no tenga que adivinarlo
-- ni pedirlo aparte en cada pantalla.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PREFERENCIAS
--
--    `idioma` no tiene check contra una lista cerrada a propósito: agregar
--    un idioma nuevo no debería requerir una migración. Si llega uno que la
--    app no conoce, el diccionario cae a inglés y no se rompe nada.
-- ------------------------------------------------------------
create table if not exists public.preferencias (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  idioma        text not null default 'es',
  -- Aviso de la noche: "todavía no cargaste nada hoy".
  aviso_cierre  boolean not null default true,
  -- Resumen del lunes por email.
  aviso_semanal boolean not null default true,
  -- A qué hora, en la zona del negocio, tiene sentido recordarle.
  hora_cierre   smallint not null default 20 check (hora_cierre between 0 and 23),
  updated_at    timestamptz not null default now()
);

alter table public.preferencias enable row level security;

drop policy if exists preferencias_select on public.preferencias;
create policy preferencias_select on public.preferencias
  for select to authenticated using (user_id = auth.uid());

revoke all on public.preferencias from anon, authenticated;
grant select on public.preferencias to authenticated;

create or replace function public.mis_preferencias()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'idioma', p.idioma, 'aviso_cierre', p.aviso_cierre,
    'aviso_semanal', p.aviso_semanal, 'hora_cierre', p.hora_cierre
  ) into v_res
  from public.preferencias p where p.user_id = auth.uid();

  -- Sin fila todavía: devolvemos los valores por defecto en vez de null,
  -- así la pantalla no tiene que distinguir "no eligió" de "no existe".
  return coalesce(v_res, jsonb_build_object(
    'idioma', 'es', 'aviso_cierre', true, 'aviso_semanal', true, 'hora_cierre', 20));
end $fn$;

create or replace function public.guardar_preferencias(
  p_idioma text default null,
  p_aviso_cierre boolean default null,
  p_aviso_semanal boolean default null,
  p_hora_cierre smallint default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  insert into public.preferencias as p (user_id, idioma, aviso_cierre, aviso_semanal, hora_cierre)
  values (
    auth.uid(),
    coalesce(nullif(lower(trim(p_idioma)), ''), 'es'),
    coalesce(p_aviso_cierre, true),
    coalesce(p_aviso_semanal, true),
    coalesce(p_hora_cierre, 20::smallint)
  )
  on conflict (user_id) do update set
    -- coalesce con el valor viejo: mandar un solo campo no borra los otros.
    idioma        = coalesce(nullif(lower(trim(p_idioma)), ''), p.idioma),
    aviso_cierre  = coalesce(p_aviso_cierre,  p.aviso_cierre),
    aviso_semanal = coalesce(p_aviso_semanal, p.aviso_semanal),
    hora_cierre   = coalesce(p_hora_cierre,   p.hora_cierre),
    updated_at    = now();

  return public.mis_preferencias();
end $fn$;

-- ------------------------------------------------------------
-- 2. DISPOSITIVOS PUSH
--
--    El endpoint es único en todo el sistema, no por usuario: si alguien
--    cierra sesión y entra otra persona en el mismo navegador, la
--    suscripción tiene que cambiar de dueño, no duplicarse. Por eso el
--    upsert pisa `user_id`.
-- ------------------------------------------------------------
create table if not exists public.push_dispositivos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth_clave  text not null,
  navegador   text,
  created_at  timestamptz not null default now(),
  ultimo_uso  timestamptz
);

create index if not exists push_user_idx on public.push_dispositivos (user_id);

alter table public.push_dispositivos enable row level security;

drop policy if exists push_select on public.push_dispositivos;
create policy push_select on public.push_dispositivos
  for select to authenticated using (user_id = auth.uid());

revoke all on public.push_dispositivos from anon, authenticated;
grant select on public.push_dispositivos to authenticated;

create or replace function public.registrar_dispositivo(
  p_endpoint text, p_p256dh text, p_auth text, p_navegador text default null
)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if coalesce(trim(p_endpoint), '') = '' or coalesce(trim(p_p256dh), '') = ''
     or coalesce(trim(p_auth), '') = '' then
    raise exception 'Faltan datos de la suscripción push.' using errcode = '22023';
  end if;

  insert into public.push_dispositivos (user_id, endpoint, p256dh, auth_clave, navegador)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_navegador, ''), 200))
  on conflict (endpoint) do update set
    user_id    = auth.uid(),
    p256dh     = excluded.p256dh,
    auth_clave = excluded.auth_clave,
    navegador  = excluded.navegador;
end $fn$;

create or replace function public.borrar_dispositivo(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  delete from public.push_dispositivos where endpoint = p_endpoint and user_id = auth.uid();
end $fn$;

-- Baja desde el servidor: cuando el proveedor push responde 404/410, esa
-- suscripción está muerta y hay que sacarla o se reintenta para siempre.
create or replace function public.purgar_dispositivo(p_endpoint text)
returns void language sql security definer set search_path = public as $fn$
  delete from public.push_dispositivos where endpoint = p_endpoint;
$fn$;

-- ------------------------------------------------------------
-- 3. ENVÍOS · idempotencia de los avisos
--
--    `clave` incluye el periodo: 'semanal:<empresa>:2026-W34'. Si el cron
--    corre dos veces, el segundo insert choca contra el índice único y no
--    se manda nada. La garantía es de la base, no del código que la llama.
-- ------------------------------------------------------------
create table if not exists public.envios (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null,
  clave      text not null unique,
  user_id    uuid references auth.users (id) on delete set null,
  empresa_id uuid references public.empresas (id) on delete cascade,
  canal      text not null default 'email',
  enviado_at timestamptz not null default now()
);

create index if not exists envios_empresa_idx on public.envios (empresa_id, enviado_at desc);

alter table public.envios enable row level security;
revoke all on public.envios from anon, authenticated;

-- Reserva el envío. Devuelve true solo la primera vez.
create or replace function public.reservar_envio(
  p_tipo text, p_clave text, p_user uuid default null,
  p_empresa uuid default null, p_canal text default 'email'
)
returns boolean language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.envios (tipo, clave, user_id, empresa_id, canal)
  values (p_tipo, p_clave, p_user, p_empresa, coalesce(p_canal, 'email'));
  return true;
exception when unique_violation then
  return false;
end $fn$;

-- ------------------------------------------------------------
-- 4. DESTINATARIOS DEL RESUMEN SEMANAL
--
--    Solo propietarios y administradores: el resumen trae ganancia y
--    márgenes, que un vendedor no puede ver. Mandárselo por email sería
--    saltarse por la puerta de atrás el permiso por columna que la 003
--    puso con tanto cuidado.
--
--    Y solo negocios con actividad en los últimos 30 días: escribirle a
--    quien abandonó hace meses es spam, no retención.
-- ------------------------------------------------------------
create or replace function public.destinatarios_resumen_semanal()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'user_id',    u.id,
      'email',      u.email,
      'nombre',     mi.nombre,
      'empresa_id', e.id,
      'empresa',    e.nombre,
      'moneda',     e.moneda,
      'zona',       e.zona_horaria,
      'idioma',     coalesce(p.idioma, 'es')
    ) as x
    from public.miembros mi
    join public.empresas e on e.id = mi.empresa_id
    join auth.users u      on u.id = mi.user_id
    left join public.preferencias p on p.user_id = mi.user_id
    where mi.rol in ('propietario', 'admin')
      and u.email is not null
      and coalesce(p.aviso_semanal, true)
      and exists (
        select 1 from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo'
          and m.fecha >= (now() at time zone e.zona_horaria)::date - 30
      )
  ) s;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 5. DATOS DE LA EMPRESA · ahora también dice qué permite el plan
--
--    Una sola llamada por carga de página ya traía nombre, moneda y plan.
--    Sumarle límites y uso evita dos viajes más y, sobre todo, evita que
--    cada pantalla decida por su cuenta qué significa "pro".
-- ------------------------------------------------------------
create or replace function public.datos_empresa(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res   jsonb;
  v_plan  text;
  v_sus   public.suscripciones;
  v_usados integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_plan := public.plan_efectivo_calculado(p_empresa);
  select * into v_sus from public.suscripciones where empresa_id = p_empresa;

  select usados into v_usados from public.uso_ia
  where empresa_id = p_empresa and periodo = to_char(public.hoy_empresa(p_empresa), 'YYYY-MM');

  select jsonb_build_object(
    'id', e.id,
    'nombre', e.nombre,
    'moneda', e.moneda,
    'zona_horaria', e.zona_horaria,
    'plan_efectivo', v_plan,
    'permitir_stock_negativo', e.permitir_stock_negativo,
    'codigo_acceso', case
      when public.es_admin(e.id) then (select a.codigo from public.empresa_accesos a where a.empresa_id = e.id and a.activo)
      else null
    end,
    'limites', public.limites_plan(v_plan),
    'uso_ia', jsonb_build_object('usados', coalesce(v_usados, 0),
                                 'tope', (public.limites_plan(v_plan)->>'capturas_mes')::integer),
    'suscripcion', jsonb_build_object(
      'estado',      coalesce(v_sus.estado, 'activa'),
      'plan',        coalesce(v_sus.plan, 'gratis'),
      'periodo',     coalesce(v_sus.periodo, 'mensual'),
      'periodo_fin', v_sus.periodo_fin,
      'en_prueba',   coalesce(v_sus.estado, '') = 'prueba'
                     and v_sus.periodo_fin is not null and v_sus.periodo_fin > now(),
      -- Días enteros que faltan. Se redondea hacia arriba: mientras quede
      -- una hora, todavía es "un día", no "cero días".
      'dias_restantes', case
        when v_sus.periodo_fin is null or v_sus.periodo_fin <= now() then 0
        else ceil(extract(epoch from (v_sus.periodo_fin - now())) / 86400)::int
      end,
      'ya_uso_prueba', v_sus.prueba_fin is not null,
      'cancela_al_vencer', coalesce(v_sus.cancela_al_vencer, false)
    ),
    'miembros', (select count(*)::int from public.miembros mm where mm.empresa_id = e.id)
  ) into v_res
  from public.empresas e where e.id = p_empresa;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 6. ZONA HORARIA · quien administra puede corregirla
--
--    Va por función y no por update directo porque el trigger
--    `empresas_proteger` bloquea la escritura sobre empresas.
-- ------------------------------------------------------------
create or replace function public.actualizar_zona(p_empresa uuid, p_zona text)
returns text language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el propietario o un administrador puede cambiar la zona horaria.' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_zona) then
    raise exception 'Esa zona horaria no existe.' using errcode = '22023';
  end if;

  update public.empresas set zona_horaria = p_zona where id = p_empresa;
  return p_zona;
end $fn$;

revoke all on function public.mis_preferencias()                                    from public, anon;
revoke all on function public.guardar_preferencias(text, boolean, boolean, smallint) from public, anon;
revoke all on function public.registrar_dispositivo(text, text, text, text)         from public, anon;
revoke all on function public.borrar_dispositivo(text)                              from public, anon;
revoke all on function public.actualizar_zona(uuid, text)                           from public, anon;
revoke all on function public.purgar_dispositivo(text)             from public, anon, authenticated;
revoke all on function public.reservar_envio(text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.destinatarios_resumen_semanal()      from public, anon, authenticated;

grant execute on function public.mis_preferencias()                                    to authenticated;
grant execute on function public.guardar_preferencias(text, boolean, boolean, smallint) to authenticated;
grant execute on function public.registrar_dispositivo(text, text, text, text)         to authenticated;
grant execute on function public.borrar_dispositivo(text)                              to authenticated;
grant execute on function public.actualizar_zona(uuid, text)                           to authenticated;
grant execute on function public.purgar_dispositivo(text)                              to service_role;
grant execute on function public.reservar_envio(text, text, uuid, uuid, text)          to service_role;
grant execute on function public.destinatarios_resumen_semanal()                       to service_role;

-- El cron necesita leer para armar los mensajes.
grant select on public.push_dispositivos to service_role;
grant select, insert on public.envios    to service_role;
grant select on public.preferencias      to service_role;


-- ############################################################
-- ##  011_baja_de_miembros.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 011 · Dar de baja a alguien del equipo
--
-- La policy `miembros_delete` de la 002 ya dejaba a un administrador borrar
-- filas de `miembros`, pero por la puerta cruda: sin mensajes claros, sin
-- impedir que alguien se borre a sí mismo y sin jerarquía entre roles.
-- Esta migración pone la puerta oficial.
--
-- QUÉ PASA CON LO QUE ESA PERSONA CARGÓ: nada. Sus ventas y gastos quedan
-- exactamente donde están, con su nombre. `movimientos.creado_por` apunta a
-- `auth.users`, no a `miembros`, así que sacarla del equipo no toca ni un
-- número. Borrar el historial de alguien porque dejó de trabajar ahí sería
-- destruir la contabilidad del negocio.
--
-- Y SE ROTA EL CÓDIGO. Sacar a alguien que puede volver a entrar con el
-- mismo código de invitación es media baja. Por eso va también
-- `rotar_codigo_acceso()`: el propietario genera uno nuevo y el viejo deja
-- de servir para siempre.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUITAR A ALGUIEN DEL EQUIPO
--
--    Jerarquía, de arriba abajo:
--      · el propietario puede sacar a cualquiera menos a sí mismo;
--      · un administrador solo puede sacar vendedores;
--      · nadie puede sacarse a sí mismo (no existe "irse" y hacerlo por
--        accidente dejaría al negocio sin dueño).
--
--    Devuelve el nombre de quien salió, para poder confirmarlo en pantalla
--    sin tener que volver a consultar.
-- ------------------------------------------------------------
create or replace function public.quitar_miembro(p_empresa uuid, p_user uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_fila     public.miembros;
  v_mi_rol   rol_miembro;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el propietario o un administrador puede sacar gente del equipo.' using errcode = '42501';
  end if;

  select * into v_fila
  from public.miembros where empresa_id = p_empresa and user_id = p_user;

  if v_fila.id is null then
    raise exception 'Esa persona no está en el equipo.' using errcode = 'P0002';
  end if;

  if v_fila.user_id = auth.uid() then
    raise exception 'No podés sacarte a vos mismo del equipo.' using errcode = '42501';
  end if;

  if v_fila.rol = 'propietario' then
    raise exception 'Al propietario del negocio no se lo puede sacar.' using errcode = '42501';
  end if;

  select rol into v_mi_rol
  from public.miembros where empresa_id = p_empresa and user_id = auth.uid();

  if v_mi_rol = 'admin' and v_fila.rol = 'admin' then
    raise exception 'Un administrador no puede sacar a otro administrador. Pedíselo al propietario.'
      using errcode = '42501';
  end if;

  -- Solo se borra la membresía. Los movimientos que cargó quedan intactos.
  delete from public.miembros where id = v_fila.id;

  return v_fila.nombre;
end $fn$;

-- ------------------------------------------------------------
-- 2. ROTAR EL CÓDIGO DE INVITACIÓN
--
--    Solo el propietario. Un administrador puede VER el código para pasarlo,
--    pero cambiarlo deja afuera a todo el que lo tuviera anotado, y esa es
--    una decisión del dueño del negocio.
-- ------------------------------------------------------------
create or replace function public.rotar_codigo_acceso(p_empresa uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_codigo   text;
  v_intentos int := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.miembros
    where empresa_id = p_empresa and user_id = auth.uid() and rol = 'propietario'
  ) then
    raise exception 'Solo el propietario puede cambiar el código de invitación.' using errcode = '42501';
  end if;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresa_accesos where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código nuevo.' using errcode = '55000';
    end if;
  end loop;

  update public.empresa_accesos
  set codigo = v_codigo, updated_at = now()
  where empresa_id = p_empresa;

  return v_codigo;
end $fn$;

-- ------------------------------------------------------------
-- 3. CERRAR LA PUERTA CRUDA
--
--    La policy de la 002 permitía a un administrador borrar cualquier fila
--    que no fuera del propietario, incluida la suya. Se le agrega la misma
--    guarda que tiene la función: nadie se borra a sí mismo por accidente
--    desde la consola del navegador.
-- ------------------------------------------------------------
drop policy if exists miembros_delete on public.miembros;
create policy miembros_delete on public.miembros
  for delete using (
    public.es_admin(empresa_id)
    and rol <> 'propietario'
    and user_id <> auth.uid()
  );

revoke all on function public.quitar_miembro(uuid, uuid)   from public, anon;
revoke all on function public.rotar_codigo_acceso(uuid)    from public, anon;
grant execute on function public.quitar_miembro(uuid, uuid) to authenticated;
grant execute on function public.rotar_codigo_acceso(uuid)  to authenticated;


-- ############################################################
-- ##  012_cerrar_anon.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 012 · Cerrarle la puerta a `anon`
--
-- Dos hallazgos del linter de Supabase, los dos reales.
--
-- 1. NUEVE FUNCIONES SEGUÍAN OTORGADAS A `anon`, el rol de quien NO inició
--    sesión. Entre ellas `registrar_venta`, `anular_movimiento` y
--    `reemplazar_venta`, que escriben.
--
--    ¿Se podía hacer daño? No: las tres arrancan con
--    `if auth.uid() is null then raise`. Alguien sin sesión que las llamara
--    recibía un error, no una venta.
--
--    Entonces, ¿por qué se toca? Porque esa defensa está a UNA línea de
--    distancia de desaparecer. El día que alguien edite una de esas
--    funciones y mueva o borre esa guarda sin darse cuenta, una ruta pública
--    de internet queda escribiendo en la base. El permiso no debería
--    depender de que nadie se equivoque nunca dentro del cuerpo de la
--    función.
--
--    Vienen de la 001: Supabase otorga EXECUTE a `anon` y `authenticated`
--    por defecto sobre todo lo que se crea en `public`, y las migraciones
--    posteriores revocaron caso por caso, pero estas quedaron afuera.
--
--    `lista_precios` SÍ se queda: la pantalla de planes tiene que poder
--    mostrar los precios antes de que la persona se registre.
--
-- 2. TRES FUNCIONES SIN `search_path` FIJO. Dos son de la 007 y las
--    escribimos nosotros. En estas tres el riesgo es teórico —devuelven
--    constantes o no tocan tablas— pero dejar la excepción invita a
--    copiarla en la próxima función, que sí va a tocar tablas.
--
-- Idempotente. No toca datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. FUERA `anon`
--
--    Se usa `do` con `to_regprocedure` para no fallar si alguna firma no
--    existe en una instalación vieja: revocar algo que no está no debería
--    tirar abajo la migración.
-- ------------------------------------------------------------
--    OJO CON CÓMO SE REVOCA. `revoke ... from anon` NO alcanza y no da
--    ningún error: PostgreSQL otorga EXECUTE sobre toda función nueva al
--    pseudo-rol PUBLIC, y `anon` lo hereda de ahí. Revocarle a `anon` un
--    permiso que nunca tuvo en forma directa no cambia nada; hay que
--    quitárselo a PUBLIC y volver a otorgárselo explícitamente a quien sí
--    lo necesita.
do $bloque$
declare
  v_firma text;
  v_firmas text[] := array[
    'public.registrar_venta(uuid, jsonb, date, text, text, text, text, origen_captura, numeric)',
    'public.reemplazar_venta(uuid, jsonb, date, text, text, text, text, numeric)',
    'public.anular_movimiento(uuid, text)',
    'public.datos_empresa(uuid)',
    'public.empresa_es_pro(uuid)',
    'public.es_admin(uuid)',
    'public.es_miembro(uuid)',
    'public.plan_efectivo(uuid)'
  ];
begin
  foreach v_firma in array v_firmas loop
    if to_regprocedure(v_firma) is not null then
      execute format('revoke all on function %s from public, anon', v_firma);
      execute format('grant execute on function %s to authenticated', v_firma);
    else
      raise notice 'No existe %, se omite.', v_firma;
    end if;
  end loop;
end $bloque$;

-- `lista_precios` es la excepción y se deja explícita, para que se vea que
-- es una decisión y no un olvido: la pantalla de planes muestra los precios
-- antes de que la persona tenga cuenta.
grant execute on function public.lista_precios(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. `search_path` FIJO EN LAS TRES QUE FALTABAN
--
--    `alter function ... set search_path` no reescribe el cuerpo: solo le
--    clava el esquema. Es la forma más chica de cerrarlo.
-- ------------------------------------------------------------
do $bloque$
declare
  v_firma text;
  v_firmas text[] := array[
    'public.jsonb_elements_ordenados(jsonb)',
    'public.limite_adjuntos_movimiento()',
    'public.limite_bytes_adjunto()'
  ];
begin
  foreach v_firma in array v_firmas loop
    if to_regprocedure(v_firma) is not null then
      execute format('alter function %s set search_path = public', v_firma);
    end if;
  end loop;
end $bloque$;


-- ############################################################
-- ##  013_borrar_usuario.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 013 · Que se pueda borrar un usuario
--
-- EL PROBLEMA, tal como apareció en producción:
--
--   ERROR: update or delete on table "users" violates foreign key constraint
--   "empresas_creada_por_fkey" on table "empresas"
--
-- `empresas.creada_por` apuntaba a `auth.users` con ON DELETE RESTRICT. La
-- intención era buena —no perder el registro de quién fundó el negocio— pero
-- el efecto era que **una persona que creó una empresa no se podía borrar
-- nunca**. Ni para limpiar una cuenta de prueba, ni el día que alguien pida
-- que se borren sus datos.
--
-- LA SOLUCIÓN: ON DELETE SET NULL. Si se borra la persona, la empresa sigue
-- entera —con sus ventas, su stock y su equipo— y lo único que se pierde es
-- el dato de quién la creó. Borrar el negocio de un local que sigue
-- funcionando porque se dio de baja una cuenta sería mucho peor.
--
-- LA TRAMPA: `ON DELETE SET NULL` ejecuta un UPDATE sobre `empresas`, y el
-- trigger `proteger_empresa` bloquea cualquier cambio de `creada_por`. O sea
-- que sin tocar el trigger, cambiar la clave foránea no arregla nada: el
-- borrado seguiría fallando, ahora con otro mensaje. Por eso van las dos
-- cosas juntas en esta migración.
--
-- Idempotente. No toca datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA COLUMNA ADMITE NULL Y LA CLAVE PASA A SET NULL
-- ------------------------------------------------------------
alter table public.empresas alter column creada_por drop not null;

alter table public.empresas drop constraint if exists empresas_creada_por_fkey;

alter table public.empresas
  add constraint empresas_creada_por_fkey
  foreign key (creada_por) references auth.users (id) on delete set null;

comment on column public.empresas.creada_por is
  'Quién fundó el negocio. Queda en null si esa cuenta se borra: la empresa y toda su contabilidad sobreviven.';

-- ------------------------------------------------------------
-- 2. EL TRIGGER DEJA PASAR EL BORRADO, PERO NADA MÁS
--
--    Se permite exactamente una transición: de "alguien" a "nadie", que es
--    la que hace la clave foránea al borrarse la cuenta.
--
--    Lo que se sigue bloqueando es lo que importaba: **apropiarse** de una
--    empresa poniéndose como creador. De null a alguien, o de una persona a
--    otra, sigue siendo imposible.
-- ------------------------------------------------------------
create or replace function public.proteger_empresa()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.id is distinct from old.id then
    raise exception 'No se pueden cambiar los datos de identidad de la empresa.' using errcode = '42501';
  end if;

  if new.creada_por is distinct from old.creada_por
     and not (new.creada_por is null and old.creada_por is not null) then
    raise exception 'No se puede cambiar quién creó la empresa.' using errcode = '42501';
  end if;

  if new.plan is distinct from old.plan
     and coalesce(current_setting('orden.suscripcion_confiable', true), '') <> '1' then
    raise exception 'El plan solo lo puede cambiar el sistema de suscripciones.' using errcode = '42501';
  end if;

  return new;
end $fn$;


-- ############################################################
-- ##  014_borrar_mi_cuenta.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 014 · Que cada uno pueda borrar su propia cuenta
--
-- No es solo un requisito legal: los datos son de la persona, y una app que
-- no te deja irte es una app que te tiene de rehén. Si alguien quiere borrar
-- todo, tiene que poder hacerlo solo, sin escribirle a nadie.
--
-- LA PREGUNTA DIFÍCIL: ¿qué pasa con el negocio?
--
--   · Si sos el ÚNICO en tu empresa → se borra entera. Es tuya y nadie más
--     la usa.
--   · Si sos propietario Y HAY MÁS GENTE ADENTRO → NO se borra nada. Sería
--     dejar sin sistema a personas que están trabajando, y borrarles la
--     contabilidad de su negocio. Se avisa y se pide que primero saque a los
--     demás (o que no se vaya).
--   · Si sos vendedor o admin de la empresa de otro → solo se va tu
--     membresía. La empresa y todo lo que cargaste quedan intactos: esos
--     movimientos son del negocio, no tuyos.
--
-- SE BORRA DE VERDAD. No hay "marcado como borrado": las filas desaparecen y
-- el borrado en cascada se lleva movimientos, productos, comprobantes,
-- suscripción y códigos. Lo único que queda afuera son los ARCHIVOS de
-- Storage, que no entienden de claves foráneas y los borra la ruta que llama
-- a esto (ver src/app/api/cuenta/borrar/route.ts).
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUÉ VA A PASAR SI ME BORRO
--
--    Se lo pide la pantalla ANTES de mostrar el botón, para que nadie
--    confirme sin saber qué está por perder. Es de solo lectura: no borra
--    nada, solo cuenta.
-- ------------------------------------------------------------
create or replace function public.resumen_borrado_cuenta()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid  uuid := auth.uid();
  v_res  jsonb;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  with mias as (
    select
      e.id,
      e.nombre,
      m.rol,
      (select count(*)::int from public.miembros mm where mm.empresa_id = e.id) as gente,
      (select count(*)::int from public.movimientos mv where mv.empresa_id = e.id) as movimientos
    from public.miembros m
    join public.empresas e on e.id = m.empresa_id
    where m.user_id = v_uid
  )
  select jsonb_build_object(
    -- Empresas que desaparecen: soy propietario y estoy solo.
    'se_borran', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', nombre, 'movimientos', movimientos))
      from mias where rol = 'propietario' and gente = 1
    ), '[]'::jsonb),
    -- Empresas de las que solo me voy.
    'me_voy_de', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', nombre))
      from mias where rol <> 'propietario'
    ), '[]'::jsonb),
    -- Lo que bloquea: soy propietario y hay más gente adentro.
    'bloqueadas', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', nombre, 'gente', gente))
      from mias where rol = 'propietario' and gente > 1
    ), '[]'::jsonb),
    'movimientos_que_se_pierden', coalesce((
      select sum(movimientos)::int from mias where rol = 'propietario' and gente = 1
    ), 0)
  ) into v_res;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 2. LAS RUTAS DE LOS ARCHIVOS QUE HAY QUE LIMPIAR
--
--    Storage no tiene claves foráneas: borrar la empresa se lleva las filas
--    de `adjuntos`, pero los archivos quedan ocupando lugar para siempre.
--    Esta función devuelve qué borrar, y la ruta lo hace ANTES de borrar los
--    datos (después ya no habría cómo saber cuáles eran).
-- ------------------------------------------------------------
create or replace function public.archivos_a_borrar(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(a.ruta), '[]'::jsonb) into v_res
  from public.adjuntos a
  where a.ruta is not null
    and a.empresa_id in (
      select m.empresa_id
      from public.miembros m
      where m.user_id = p_user
        and m.rol = 'propietario'
        and (select count(*) from public.miembros mm where mm.empresa_id = m.empresa_id) = 1
    );

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 3. BORRAR
--
--    Solo `service_role`: la llama la ruta del servidor después de comprobar
--    la sesión. No se le otorga a `authenticated` a propósito — un borrado
--    irreversible no se dispara desde el navegador sin que el servidor haya
--    verificado quién es y que confirmó.
--
--    Devuelve qué se hizo, para poder registrarlo.
-- ------------------------------------------------------------
create or replace function public.borrar_datos_de_usuario(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_bloqueadas int;
  v_borradas   int := 0;
  v_salidas    int := 0;
begin
  if p_user is null then
    raise exception 'Falta el usuario.' using errcode = '22023';
  end if;

  -- Si es propietario de una empresa con más gente, no se toca NADA.
  -- Se comprueba de nuevo acá y no solo en la pantalla: entre que alguien
  -- confirma y se ejecuta esto, pudo entrar un vendedor con el código.
  select count(*) into v_bloqueadas
  from public.miembros m
  where m.user_id = p_user
    and m.rol = 'propietario'
    and (select count(*) from public.miembros mm where mm.empresa_id = m.empresa_id) > 1;

  if v_bloqueadas > 0 then
    raise exception 'Todavía hay gente trabajando en % de tus negocios. Sacalos del equipo antes de borrar tu cuenta.', v_bloqueadas
      using errcode = '54000';
  end if;

  -- Empresas donde estoy solo: se van enteras. El cascade se lleva
  -- movimientos, items, productos, adjuntos, retos, suscripción y accesos.
  with a_borrar as (
    select m.empresa_id
    from public.miembros m
    where m.user_id = p_user and m.rol = 'propietario'
  ), borradas as (
    delete from public.empresas e
    where e.id in (select empresa_id from a_borrar)
    returning 1
  )
  select count(*) into v_borradas from borradas;

  -- De las demás, solo me voy.
  with salidas as (
    delete from public.miembros m where m.user_id = p_user returning 1
  )
  select count(*) into v_salidas from salidas;

  -- Lo que es de la persona y no del negocio.
  delete from public.preferencias      where user_id = p_user;
  delete from public.push_dispositivos where user_id = p_user;
  delete from public.cierres           where user_id = p_user;

  return jsonb_build_object(
    'empresas_borradas', v_borradas,
    'membresias_cerradas', v_salidas
  );
end $fn$;

revoke all on function public.resumen_borrado_cuenta()          from public, anon;
revoke all on function public.archivos_a_borrar(uuid)           from public, anon, authenticated;
revoke all on function public.borrar_datos_de_usuario(uuid)     from public, anon, authenticated;

grant execute on function public.resumen_borrado_cuenta()       to authenticated;
grant execute on function public.archivos_a_borrar(uuid)        to service_role;
grant execute on function public.borrar_datos_de_usuario(uuid)  to service_role;

-- El borrado necesita poder eliminar filas de estas tablas desde el cron/API.
grant delete on public.empresas          to service_role;
grant delete on public.miembros          to service_role;
grant delete on public.preferencias      to service_role;
grant delete on public.push_dispositivos to service_role;
grant delete on public.cierres           to service_role;

-- ============================================================
-- EMPEZAR DE CERO
--
-- Distinto de borrar la cuenta: acá la persona SE QUEDA. Vacía el negocio
-- para arrancar limpio —después de probar el sistema, después de un año
-- cerrado, después de cargar todo mal la primera vez.
--
-- Es la única puerta por la que un movimiento se borra de verdad. La policy
-- `movimientos_delete` no existe justamente para que no se pueda: lo normal
-- es ANULAR, que deja el rastro. Vaciar es otra cosa y por eso pide escribir
-- el nombre del negocio: nadie lo hace sin querer.
--
-- QUÉ SE VA: movimientos (y con ellos sus líneas y comprobantes), productos,
-- retos y los cierres marcados.
--
-- QUÉ SE QUEDA: la empresa, el equipo, la suscripción y el código de
-- invitación. Y el CONSUMO DE IA DEL MES, a propósito: si vaciar reseteara
-- el contador, sería una forma de tener capturas gratis infinitas vaciando
-- el negocio cada vez que se acaban.
-- ============================================================
create or replace function public.vaciar_empresa(p_empresa uuid, p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre     text;
  v_rutas      jsonb;
  v_movs       int := 0;
  v_prods      int := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  -- Solo el propietario. Un administrador maneja el día a día, pero borrar
  -- la historia entera del negocio es decisión del dueño.
  if not exists (
    select 1 from public.miembros
    where empresa_id = p_empresa and user_id = auth.uid() and rol = 'propietario'
  ) then
    raise exception 'Solo el propietario puede vaciar el negocio.' using errcode = '42501';
  end if;

  select nombre into v_nombre from public.empresas where id = p_empresa;
  if v_nombre is null then
    raise exception 'Esa empresa no existe.' using errcode = 'P0002';
  end if;

  -- La confirmación es escribir el nombre exacto. Un "¿estás seguro?" se
  -- toca sin leer; esto no.
  if trim(coalesce(p_confirmacion, '')) is distinct from v_nombre then
    raise exception 'Para vaciar el negocio hay que escribir su nombre exacto: %', v_nombre
      using errcode = '22023';
  end if;

  -- Las rutas de los archivos ANTES de borrar: después no hay forma de
  -- saber cuáles eran, y quedarían ocupando storage para siempre.
  select coalesce(jsonb_agg(a.ruta), '[]'::jsonb) into v_rutas
  from public.adjuntos a where a.empresa_id = p_empresa and a.ruta is not null;

  -- Los movimientos primero: arrastran líneas y comprobantes.
  with borrados as (
    delete from public.movimientos where empresa_id = p_empresa returning 1
  )
  select count(*) into v_movs from borrados;

  with borrados as (
    delete from public.productos where empresa_id = p_empresa returning 1
  )
  select count(*) into v_prods from borrados;

  delete from public.retos   where empresa_id = p_empresa;
  delete from public.cierres where empresa_id = p_empresa;

  return jsonb_build_object(
    'movimientos', v_movs,
    'productos', v_prods,
    -- Que las borre quien llamó: la policy de storage ya le da permiso
    -- sobre la carpeta de su empresa.
    'archivos', v_rutas
  );
end $fn$;

revoke all on function public.vaciar_empresa(uuid, text) from public, anon;
grant execute on function public.vaciar_empresa(uuid, text) to authenticated;


-- ############################################################
-- ##  015_deudas.sql
-- ############################################################

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


-- ############################################################
-- ##  016_panel_admin.sql
-- ############################################################

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


-- ############################################################
-- ##  017_precios_por_tipo.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 017 · Precios por tipo de cuenta
--
-- POR QUÉ EL PRECIO NO PUEDE DEPENDER SOLO DEL PLAN
--
-- Una cuenta personal y un comercio pueden estar los dos en plan `pro` —los
-- mismos topes, las mismas funciones— y aun así pagar distinto. No es una
-- inconsistencia: es que **no reciben el mismo valor**.
--
-- Al comerciante, Orden le dice cuánta plata ganó de verdad. Eso se paga
-- solo. A quien lleva sus finanzas personales le dice cuánto debe y cuándo
-- vence la cuota; le sirve, pero no le genera un guaraní. Cobrarle lo mismo
-- a los dos sería no haber entendido a ninguno.
--
-- Por eso el plan sigue decidiendo QUÉ SE PUEDE HACER (`limites_plan`), y el
-- par tipo_cuenta + plan decide CUÁNTO SE PAGA. Son dos preguntas distintas
-- y ahora tienen dos respuestas distintas.
--
-- LOS PRECIOS QUE QUEDAN (Paraguay)
--
--   personal    · plan único            60.000/mes    ·  600.000/año
--   comercio    · Pro, hasta 3 vendedores  190.000/mes  · 1.900.000/año
--   comercio    · Premium, desde          250.000/mes  · 2.500.000/año
--
-- El anual son diez meses por doce. No se escribe «dos meses gratis» a mano
-- en ningún lado: `mesesDeRegalo()` lo calcula de estos números, así que si
-- mañana cambian, el cartel sigue diciendo la verdad o desaparece.
--
-- Premium es «desde»: el precio final depende de cuántos vendedores quiera,
-- a 60.000 cada uno por encima de los 3 que trae Pro. 250.000 es el primer
-- escalón (4 vendedores) y por eso es el número que se muestra.
--
-- Idempotente. Reemplaza los precios viejos (35.000 / 79.000), que eran de
-- cuando Orden tenía un solo público.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA COLUMNA
-- ------------------------------------------------------------
alter table public.precios
  add column if not exists tipo_cuenta text not null default 'emprendedor';

do $$ begin
  alter table public.precios
    add constraint precios_tipo_cuenta_check
    check (tipo_cuenta in ('personal', 'emprendedor'));
exception when duplicate_object then null; end $$;

-- La unicidad ahora incluye el tipo: el mismo plan y la misma moneda pueden
-- convivir con dos precios distintos, uno por público.
alter table public.precios drop constraint if exists precios_plan_moneda_periodo_key;

do $$ begin
  alter table public.precios
    add constraint precios_tipo_plan_moneda_periodo_key
    unique (tipo_cuenta, plan, moneda, periodo);
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. LOS PRECIOS
--
--    Se borran los viejos en vez de desactivarlos: un precio que ya no
--    existe no tiene por qué quedar dando vueltas donde alguien lo pueda
--    volver a activar por error.
-- ------------------------------------------------------------
delete from public.precios;

insert into public.precios (tipo_cuenta, plan, moneda, periodo, importe) values
  -- Cuenta personal. Un solo plan pago: no necesita nombre porque no compite
  -- con ningún otro. En la interfaz es «la suscripción», no «Pro», para que
  -- no choque con el Pro de comercios, que cuesta el triple.
  ('personal',    'pro',     'PYG', 'mensual',   60000),
  ('personal',    'pro',     'PYG', 'anual',    600000),
  ('personal',    'pro',     'USD', 'mensual',     7.99),
  ('personal',    'pro',     'USD', 'anual',      79.00),

  -- Comercio · Pro: hasta 3 vendedores.
  ('emprendedor', 'pro',     'PYG', 'mensual',  190000),
  ('emprendedor', 'pro',     'PYG', 'anual',   1900000),
  ('emprendedor', 'pro',     'USD', 'mensual',    24.99),
  ('emprendedor', 'pro',     'USD', 'anual',     249.00),

  -- Comercio · Premium: desde. El precio final se cotiza según cuántos
  -- vendedores, a 60.000 cada uno arriba de los 3 de Pro.
  ('emprendedor', 'negocio', 'PYG', 'mensual',  250000),
  ('emprendedor', 'negocio', 'PYG', 'anual',   2500000),
  ('emprendedor', 'negocio', 'USD', 'mensual',    32.99),
  ('emprendedor', 'negocio', 'USD', 'anual',     329.00);

-- ------------------------------------------------------------
-- 3. CUÁNTO CUESTA CADA VENDEDOR DE MÁS
--
--    Vive en la base y no en el código por el mismo motivo que los precios:
--    subirlo no puede requerir un despliegue. La usa la portada para
--    explicar de dónde sale el «desde», y sirve para cotizar sin improvisar
--    un número distinto en cada conversación de WhatsApp.
-- ------------------------------------------------------------
create or replace function public.precio_por_vendedor(p_moneda text default 'PYG')
returns numeric language sql immutable set search_path = public as $fn$
  select case upper(coalesce(p_moneda, 'PYG'))
    when 'PYG' then 60000::numeric
    when 'USD' then 7.99::numeric
    else 7.99::numeric
  end;
$fn$;

grant execute on function public.precio_por_vendedor(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. LISTA DE PRECIOS · ahora filtra por público
--
--    `p_tipo` en null devuelve todo, que es lo que necesita la portada para
--    mostrar los dos lados. La pantalla de Plan, en cambio, pide solo el
--    tipo de la cuenta: a alguien que lleva sus finanzas personales no se le
--    ofrece el plan de un local con vendedores.
-- ------------------------------------------------------------
create or replace function public.lista_precios(
  p_moneda text default null,
  p_tipo   text default null
)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo_cuenta', p.tipo_cuenta,
    'plan', p.plan, 'moneda', p.moneda, 'periodo', p.periodo,
    'importe', p.importe, 'referencia_externa', p.referencia_externa
  ) order by p.tipo_cuenta, p.plan, p.periodo), '[]'::jsonb)
  from public.precios p
  where p.activo
    and (p_moneda is null or p.moneda = p_moneda)
    and (p_tipo is null or p.tipo_cuenta = p_tipo);
$fn$;

-- La firma de un argumento queda muerta: si no se borra, PostgREST ve dos
-- funciones con el mismo nombre y no sabe cuál llamar.
drop function if exists public.lista_precios(text);

-- Los precios son públicos a propósito: alguien que todavía no tiene cuenta
-- tiene que poder ver cuánto cuesta antes de registrarse.
grant execute on function public.lista_precios(text, text) to anon, authenticated;


-- ############################################################
-- ##  018_solo_lectura.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 018 · Al vencer se deja de cargar, no de mirar
--
-- QUÉ CAMBIA
--
-- Hasta ahora, cuando se terminaba la prueba la cuenta caía al plan `gratis`
-- y ahí se quedaba: 20 capturas de IA al mes, pero **carga manual sin
-- límite**. Para un almacén chico eso alcanzaba de sobra. Era un sistema
-- financiero completo, gratis para siempre, y nadie tenía motivo para pagar.
--
-- Ahora `gratis` deja de significar «plan gratuito» y pasa a significar
-- **cuenta vencida**: se puede entrar, ver todo el historial y bajar el
-- Excel, pero no cargar nada nuevo.
--
-- POR QUÉ NO SE BLOQUEA LA CUENTA ENTERA
--
-- Porque los datos son de esa persona, no nuestros. Dejar a alguien afuera de
-- sus propios números es la clase de cosa que genera un mensaje furioso y
-- mala fama — y en un mercado donde los comerciantes se conocen entre ellos,
-- esa fama cuesta más que la suscripción que se estaría forzando.
--
-- Solo lectura tiene la misma presión que bloquear —para seguir trabajando
-- hay que pagar— sin quedarse con lo ajeno. Y el Excel pasa a ser el mejor
-- argumento de venta: «mirá todo lo que cargaste, seguí desde donde estás».
--
-- POR QUÉ CON TRIGGERS Y NO CON POLÍTICAS
--
-- Se escribe desde muchos lados: políticas RLS para gastos, `registrar_venta`
-- para ventas, `crear_deuda` y `registrar_pago_deuda` para deudas, `adjuntar`
-- para comprobantes, `marcar_cierre` para el cierre. Poner el control en cada
-- uno significa que el día que se agregue una ruta nueva y alguien se olvide,
-- se abre un agujero silencioso.
--
-- Un trigger por tabla lo agarra TODO, venga por donde venga, incluidas las
-- funciones `security definer` que saltean RLS. Una definición por tabla en
-- vez de una por camino.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUÉ DA CADA PLAN · ahora `gratis` es «vencida»
--
--    Dos cambios respecto de la 009:
--
--    · `excel` pasa a true. Es el corazón de todo esto: la persona tiene que
--      poder llevarse lo suyo cuando quiera, aunque no pague.
--    · aparece `escritura`, que es lo que los triggers de abajo consultan.
--
--    `capturas_mes` en 0 y no en 20: si igual no puede cargar el movimiento,
--    darle capturas de IA sería gastar créditos de OpenAI para producir un
--    borrador que después rebota.
-- ------------------------------------------------------------
create or replace function public.limites_plan(p_plan text)
returns jsonb language sql immutable set search_path = public as $fn$
  select case coalesce(p_plan, 'gratis')
    when 'negocio' then jsonb_build_object(
      'capturas_mes', 3000, 'miembros', 15,
      'adjuntos', true, 'excel', true, 'avisos', true, 'escritura', true)
    -- Tres personas: el dueño y un par de ayudantes. Una despensa chica no
    -- tiene por qué pagar el plan de una cadena, y si la apretamos termina
    -- compartiendo un solo login — que es peor para todos, porque perdemos
    -- el registro de quién cargó cada venta.
    when 'pro' then jsonb_build_object(
      'capturas_mes', 600, 'miembros', 3,
      'adjuntos', true, 'excel', true, 'avisos', true, 'escritura', true)
    else jsonb_build_object(
      -- CUENTA VENCIDA. Mira todo, se lleva todo, no carga nada.
      'capturas_mes', 0, 'miembros', 1,
      'adjuntos', false, 'excel', true, 'avisos', true, 'escritura', false)
  end;
$fn$;

grant execute on function public.limites_plan(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. ¿ESTA EMPRESA PUEDE CARGAR?
--
--    Una sola pregunta, un solo lugar donde se responde.
-- ------------------------------------------------------------
create or replace function public.puede_cargar(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce(
    (public.limites_plan(public.plan_efectivo_calculado(p_empresa))->>'escritura')::boolean,
    false);
$fn$;

revoke all on function public.puede_cargar(uuid) from public, anon;
grant execute on function public.puede_cargar(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. EL GUARDIÁN
--
--    Sobre el `auth.uid() is null`: una escritura sin sesión no es de un
--    cliente. Es el webhook de pagos, una tarea programada, una migración o
--    un arreglo con `service_role`. Esas no las puede frenar el estado de
--    cobro de nadie —si no, un pago no podría registrarse justamente cuando
--    la cuenta está vencida, que es cuando más falta hace— y además se
--    ahorra la consulta en las cargas masivas.
-- ------------------------------------------------------------
create or replace function public.exigir_cuenta_activa()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.puede_cargar(new.empresa_id) then
    raise exception 'Se te terminó la prueba. Podés seguir viendo todo y bajando tu Excel, pero para cargar hay que activar el plan.'
      using errcode = '42501';
  end if;

  return new;
end $fn$;

-- Nadie la ejecuta a mano: la llama PostgreSQL al disparar el trigger, con
-- los permisos del dueño de la función. Que figure como ejecutable por
-- cualquiera no sirve para nada y ensucia la superficie. Misma trampa de la
-- migración 012: PUBLIC recibe EXECUTE sobre toda función nueva, y `anon`
-- hereda de PUBLIC.
revoke all on function public.exigir_cuenta_activa() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. DÓNDE SE APLICA
--
--    Solo INSERT y UPDATE. El DELETE queda libre a propósito: vaciar el
--    negocio y borrar la cuenta tienen que funcionar siempre, incluso —sobre
--    todo— con la cuenta vencida. Nadie debería tener que pagar para poder
--    irse.
-- ------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'movimientos', 'movimiento_items', 'productos',
    'deudas', 'pagos_deuda', 'adjuntos', 'cierres', 'retos'
  ] loop
    -- `if exists` porque este archivo se puede correr sobre una instalación
    -- que todavía no tenga alguna tabla (deudas llegó en la 015).
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = v_tabla
    ) then
      execute format('drop trigger if exists %I on public.%I',
                     'cuenta_activa_' || v_tabla, v_tabla);
      execute format(
        'create trigger %I before insert or update on public.%I '
        || 'for each row execute function public.exigir_cuenta_activa()',
        'cuenta_activa_' || v_tabla, v_tabla);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. EL ESTADO, PARA QUE LA PANTALLA LO EXPLIQUE
--
--    Sin esto la persona se encontraría con un error rojo al intentar
--    cargar, sin entender por qué. Con esto, la app le puede avisar ANTES —y
--    ofrecerle el botón de suscribirse— en vez de dejarla chocar contra una
--    pared.
-- ------------------------------------------------------------
create or replace function public.estado_cuenta(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_sus   public.suscripciones;
  v_plan  text;
  v_dias  integer;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select * into v_sus from public.suscripciones where empresa_id = p_empresa;
  v_plan := public.plan_efectivo_calculado(p_empresa);

  v_dias := case
    when v_sus.periodo_fin is null then null
    else floor(extract(epoch from (v_sus.periodo_fin - now())) / 86400)::integer
  end;

  return jsonb_build_object(
    'plan', v_plan,
    'estado', v_sus.estado,
    'en_prueba', v_sus.estado = 'prueba' and coalesce(v_sus.periodo_fin > now(), false),
    'vencida', not coalesce(
      (public.limites_plan(v_plan)->>'escritura')::boolean, false),
    'puede_cargar', coalesce(
      (public.limites_plan(v_plan)->>'escritura')::boolean, false),
    'dias_restantes', v_dias,
    'periodo_fin', v_sus.periodo_fin,
    -- A partir de acá la pantalla decide si avisar. Tres días es cuando deja
    -- de ser un dato y pasa a ser algo que hay que resolver.
    'avisar', v_dias is not null and v_dias <= 3,
    'tipo_cuenta', (select e.tipo_cuenta from public.empresas e where e.id = p_empresa)
  );
end $fn$;

revoke all on function public.estado_cuenta(uuid) from public, anon;
grant execute on function public.estado_cuenta(uuid) to authenticated;


-- ############################################################
-- ##  019_orden_es_un_negocio.sql
-- ############################################################

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


-- ############################################################
-- ##  020_precios_ajustados.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 020 · Precios en dólares y un mes de regalo
--
-- DOS CORRECCIONES SOBRE LA 017
--
-- 1. LOS DÓLARES ESTABAN MAL. Se habían puesto números «bonitos» de
--    marketing (7,99 y 24,99) sin mirar el cambio real. A 190.000 guaraníes
--    le corresponden unos 32 dólares, no 25: cobrar 25 era regalar el 20% a
--    todo el que pague en dólares.
--
--    Los precios en guaraníes NO cambian. Es la conversión la que estaba
--    equivocada.
--
--      personal   Gs.  60.000  →  US$ 11
--      Pro        Gs. 190.000  →  US$ 32
--      Premium    Gs. 250.000  →  US$ 42   (el mismo cambio que Pro)
--
-- 2. EL ANUAL DA UN MES, NO DOS. Doce meses al precio de once.
--
--    Dos meses era demasiado para un producto que todavía no tiene historia
--    de retención: se regalaba un sexto del año a cambio de un adelanto que
--    hoy no hace falta. Con uno, el descuento sigue siendo un motivo real
--    para pagar por año y el número cierra mejor.
--
--    El cartel de «un mes de regalo» no se escribe a mano en ningún lado:
--    `mesesDeRegalo()` lo calcula de estos importes. Si mañana cambian, el
--    texto sigue diciendo la verdad o desaparece — nunca miente.
--
-- Idempotente.
-- ============================================================

delete from public.precios;

insert into public.precios (tipo_cuenta, plan, moneda, periodo, importe) values
  -- Cuenta personal. Un solo plan pago.
  ('personal',    'pro',     'PYG', 'mensual',   60000),
  ('personal',    'pro',     'PYG', 'anual',    660000),
  ('personal',    'pro',     'USD', 'mensual',      11),
  ('personal',    'pro',     'USD', 'anual',       121),

  -- Comercio · Pro: hasta 3 vendedores.
  ('emprendedor', 'pro',     'PYG', 'mensual',  190000),
  ('emprendedor', 'pro',     'PYG', 'anual',   2090000),
  ('emprendedor', 'pro',     'USD', 'mensual',      32),
  ('emprendedor', 'pro',     'USD', 'anual',       352),

  -- Comercio · Premium: desde. Cada vendedor extra suma aparte.
  ('emprendedor', 'negocio', 'PYG', 'mensual',  250000),
  ('emprendedor', 'negocio', 'PYG', 'anual',   2750000),
  ('emprendedor', 'negocio', 'USD', 'mensual',      42),
  ('emprendedor', 'negocio', 'USD', 'anual',       462);

-- Cada vendedor de más, con el mismo cambio que el resto.
create or replace function public.precio_por_vendedor(p_moneda text default 'PYG')
returns numeric language sql immutable set search_path = public as $fn$
  select case upper(coalesce(p_moneda, 'PYG'))
    when 'PYG' then 60000::numeric
    when 'USD' then 10::numeric
    else 10::numeric
  end;
$fn$;

grant execute on function public.precio_por_vendedor(text) to anon, authenticated;


-- ############################################################
-- ##  021_rubros.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 021 · El rubro de cada negocio
--
-- LA IDEA: UN MOTOR, VARIAS PUERTAS
--
-- Entró plata, salió plata, esto me queda, debo esto y vence tal día. Eso es
-- igual para un almacén, un ganadero, un agricultor y un taller — y es el
-- 90% de Orden. Lo que cambia entre ellos es más chico de lo que parece:
--
--   · las palabras («producto» vs «hacienda» vs «cultivo»);
--   · las categorías de gasto (Publicidad vs Sanidad vs Fertilizante);
--   · el RITMO, que es lo único que rompe algo de verdad.
--
-- POR QUÉ EL RITMO IMPORTA MÁS QUE LAS PALABRAS
--
-- Orden está construido sobre el hábito diario: la racha, el cierre del día,
-- el recordatorio de la noche. Eso le calza perfecto a quien vende todos los
-- días.
--
-- A un ganadero no. Compra un ternero, gasta en maíz y sanidad durante
-- dieciocho meses, y recién ahí vende. Su cierre del día diría «hoy no hubo
-- actividad» casi siempre, y su racha se cortaría sin parar. Un sistema que
-- todos los días te dice que fallaste, cuando no fallaste en nada, se
-- desinstala.
--
-- Por eso el rubro decide QUÉ SECCIONES EXISTEN, no solo cómo se llaman.
--
-- DÓNDE VIVE CADA COSA
--
-- Acá vive el DATO: qué rubro eligió cada empresa, y las categorías de gasto
-- que le corresponden (para que la IA las sugiera sin desplegar nada).
--
-- Las palabras y qué pantallas se muestran viven en `src/lib/rubros.ts`,
-- porque son presentación y no seguridad: que un ganadero vea el cierre del
-- día no filtra nada de nadie. La regla de siempre —lo que protege va en
-- PostgreSQL— sigue intacta.
--
-- Idempotente. Todo lo que ya existe queda como 'comercio', que es lo que es.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA COLUMNA
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists rubro text not null default 'comercio';

do $$ begin
  alter table public.empresas
    add constraint empresas_rubro_check
    check (rubro in ('comercio', 'ganaderia', 'agricultura', 'servicios'));
exception when duplicate_object then null; end $$;

comment on column public.empresas.rubro is
  'Adapta vocabulario, categorías y qué secciones existen. No es un permiso: '
  'lo que protege datos sigue siendo RLS y los roles.';

-- ------------------------------------------------------------
-- 2. LAS CATEGORÍAS DE GASTO DE CADA RUBRO
--
--    Viven en la base y no en el código por el mismo motivo que los precios:
--    ajustar una lista no puede requerir un despliegue. Las usa el prompt de
--    la captura para sugerir, y la persona puede escribir cualquier otra —la
--    columna `categoria` es texto libre y va a seguir siéndolo. Una lista
--    cerrada obligaría a alguien a meter su gasto en el casillero
--    equivocado, que es peor que no sugerir nada.
-- ------------------------------------------------------------
create or replace function public.categorias_de_rubro(p_rubro text)
returns jsonb language sql immutable set search_path = public as $fn$
  -- Cada categoría viene con PISTAS, no solo con su nombre.
  --
  -- Hizo falta al probarlo con el modelo real: «compré veinte bolsas de maíz»
  -- caía en «Otros» porque nada le decía que el maíz de un ganadero es
  -- comida de animales. Con las pistas cae en Alimentación. Un nombre de
  -- categoría solo, sin contexto, no alcanza para clasificar bien.
  select case coalesce(p_rubro, 'comercio')
    when 'ganaderia' then jsonb_build_array(
      jsonb_build_object('nombre','Alimentación','pistas','maíz, balanceado, ración, fardos, sal, pasto'),
      jsonb_build_object('nombre','Sanidad','pistas','vacunas, antiparasitarios, veterinario, remedios'),
      jsonb_build_object('nombre','Personal','pistas','peón, capataz, jornales, sueldos'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo, pastaje'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de hacienda, camión jaula'),
      jsonb_build_object('nombre','Mantenimiento','pistas','alambrado, aguadas, maquinaria, herramientas'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))
    when 'agricultura' then jsonb_build_array(
      jsonb_build_object('nombre','Semilla','pistas','semilla, plantines'),
      jsonb_build_object('nombre','Fertilizante','pistas','urea, fosfato, abono'),
      jsonb_build_object('nombre','Agroquímicos','pistas','herbicida, fungicida, insecticida'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Cosecha','pistas','cosechadora, trilla, secado'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de granos'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo'),
      jsonb_build_object('nombre','Personal','pistas','jornales, tractorista, peón'),
      jsonb_build_object('nombre','Otros','pistas',''))
    when 'servicios' then jsonb_build_array(
      jsonb_build_object('nombre','Materiales','pistas','cemento, arena, cables, pintura, insumos'),
      jsonb_build_object('nombre','Repuestos','pistas','piezas, filtros, aceite'),
      jsonb_build_object('nombre','Herramientas','pistas',''),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Personal','pistas','ayudante, jornales, sueldos'),
      jsonb_build_object('nombre','Transporte','pistas','flete, viaje, delivery'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))
    else jsonb_build_array(
      jsonb_build_object('nombre','Mercadería','pistas','lo que comprás para revender'),
      jsonb_build_object('nombre','Transporte','pistas','combustible, flete, delivery'),
      jsonb_build_object('nombre','Comida','pistas',''),
      jsonb_build_object('nombre','Publicidad','pistas',''),
      jsonb_build_object('nombre','Servicios','pistas','luz, agua, internet, teléfono'),
      jsonb_build_object('nombre','Alquiler','pistas',''),
      jsonb_build_object('nombre','Sueldos','pistas','empleados, jornales'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))
  end;
$fn$;

grant execute on function public.categorias_de_rubro(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. ¿ESTE RUBRO CIERRA EL DÍA?
--
--    Una sola pregunta en un solo lugar, para que la pantalla y las tareas
--    programadas no puedan contestarla distinto. Sin esto, el recordatorio
--    de la noche le seguiría llegando a un ganadero aunque la pantalla del
--    cierre no exista — que es la peor combinación posible.
-- ------------------------------------------------------------
create or replace function public.rubro_cierra_el_dia(p_rubro text)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p_rubro, 'comercio') in ('comercio', 'servicios');
$fn$;

grant execute on function public.rubro_cierra_el_dia(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. CAMBIAR DE RUBRO
--
--    NO borra nada. Cambiar de rubro cambia palabras, categorías sugeridas y
--    qué pantallas se ven; los datos quedan donde están. Si alguien vuelve
--    atrás, los encuentra intactos.
-- ------------------------------------------------------------
create or replace function public.cambiar_rubro(p_empresa uuid, p_rubro text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el propietario o un administrador puede cambiar el rubro.'
      using errcode = '42501';
  end if;

  if p_rubro not in ('comercio', 'ganaderia', 'agricultura', 'servicios') then
    raise exception 'Rubro desconocido: %', p_rubro using errcode = '22023';
  end if;

  select rubro into v_antes from public.empresas where id = p_empresa;
  if v_antes is null then
    raise exception 'Esa empresa no existe.' using errcode = 'P0002';
  end if;

  update public.empresas set rubro = p_rubro where id = p_empresa;

  return jsonb_build_object('rubro', p_rubro, 'antes', v_antes);
end $fn$;

revoke all on function public.cambiar_rubro(uuid, text) from public, anon;
grant execute on function public.cambiar_rubro(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 5. CREAR EMPRESA · ahora también con rubro
--
--    Redefinición de la versión de la 016. Lo único que cambia: recibe el
--    rubro. Una cuenta personal no tiene rubro de negocio —no vende nada—
--    así que se le fuerza 'comercio', que es el neutro y del que no ve
--    ninguna pantalla de comercio igual.
-- ------------------------------------------------------------
create or replace function public.crear_empresa(
  p_nombre text,
  p_moneda text default 'PYG',
  p_nombre_usuario text default null,
  p_zona text default 'America/Asuncion',
  p_tipo_cuenta text default 'emprendedor',
  p_rubro text default 'comercio'
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_codigo text;
  v_intentos int := 0;
  v_fin timestamptz;
  v_tipo text;
  v_rubro text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre del negocio es muy corto.' using errcode = '22023';
  end if;

  v_tipo := case when p_tipo_cuenta = 'personal' then 'personal' else 'emprendedor' end;

  v_rubro := case
    when v_tipo = 'personal' then 'comercio'
    when p_rubro in ('comercio', 'ganaderia', 'agricultura', 'servicios') then p_rubro
    else 'comercio'
  end;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresa_accesos where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código de acceso.' using errcode = '55000';
    end if;
  end loop;

  insert into public.empresas (nombre, moneda, creada_por, zona_horaria, tipo_cuenta, rubro)
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), auth.uid(),
          coalesce(nullif(trim(p_zona), ''), 'America/Asuncion'), v_tipo, v_rubro)
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

-- La firma de 5 argumentos queda muerta: si no se borra, PostgREST ve dos
-- funciones con el mismo nombre y no sabe cuál llamar.
drop function if exists public.crear_empresa(text, text, text, text, text);

revoke all on function public.crear_empresa(text, text, text, text, text, text)
  from public, anon;
grant execute on function public.crear_empresa(text, text, text, text, text, text)
  to authenticated;

-- ------------------------------------------------------------
-- 6. EL RECORDATORIO NO LE LLEGA A QUIEN NO CIERRA EL DÍA
--
--    Redefine `empresas_sin_cargar_hoy()` de la 008, con la MISMA firma y
--    la misma forma de respuesta: lo único que se agrega es el filtro por
--    rubro. Cambiarle el tipo de retorno habría roto la tarea de la noche
--    en silencio.
--
--    Sin este filtro, un ganadero recibiría todas las noches un «no
--    cargaste nada hoy» — y no cargó nada porque no tenía nada que cargar.
--    Es la forma más rápida de que alguien apague los avisos y no los
--    vuelva a encender nunca.
-- ------------------------------------------------------------
create or replace function public.empresas_sin_cargar_hoy(p_racha_minima integer default 2)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id', e.id,
      'nombre',     e.nombre,
      'zona',       e.zona_horaria,
      'racha',      r.largo
    ) as x
    from public.empresas e
    join lateral (
      with dias as (
        select distinct m.fecha from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo'
          and m.fecha <= (now() at time zone e.zona_horaria)::date
      ),
      numeradas as (
        select fecha, (fecha - (row_number() over (order by fecha))::int) as isla from dias
      ),
      rachas as (
        select count(*)::int as largo, max(fecha) as hasta from numeradas group by isla
      )
      select largo, hasta from rachas order by hasta desc limit 1
    ) r on true
    where public.rubro_cierra_el_dia(e.rubro)
      and r.hasta = (now() at time zone e.zona_horaria)::date - 1
      and r.largo >= greatest(p_racha_minima, 1)
  ) s;

  return v_res;
end $fn$;

revoke all on function public.empresas_sin_cargar_hoy(integer) from public, anon, authenticated;
grant execute on function public.empresas_sin_cargar_hoy(integer) to service_role;


-- ############################################################
-- ##  022_ficha_y_correcciones.sql
-- ############################################################

-- ============================================================
-- ORDEN · Migración 022 · Ficha del cliente, deshacer y borrar
--
-- TRES COSAS QUE FALTABAN, Y LAS TRES APARECIERON USANDO EL PANEL DE VERDAD
--
-- 1. NO SE PODÍA DESHACER UNA ACTIVACIÓN. Se activó un plan por error sobre
--    una cuenta que todavía estaba en prueba, y el periodo de prueba se
--    perdió: quedó reemplazado por el mes pagado. Ninguna pantalla podía
--    devolverlo.
--
--    El arreglo sale gratis porque el registro de auditoría ya guardaba cómo
--    estaba todo ANTES de cada cambio. Estaba ahí para reclamos; resulta que
--    también sirve para deshacer. Un registro que solo se lee cuando hay un
--    problema es medio registro.
--
-- 2. NO SE PODÍA BORRAR UNA CUENTA. Y hacía falta: al borrar un usuario
--    desde el panel de Supabase, sus `miembros` se van por cascada y
--    `empresas.creada_por` queda en null — la empresa sobrevive **sin dueño
--    y sin nadie adentro**. Nadie puede entrar, nadie puede borrarla, y
--    ensucia la lista de clientes para siempre.
--
--    Pasó con dos cuentas de prueba. Va a volver a pasar cada vez que se
--    borre un usuario por fuera de la app.
--
-- 3. NO HABÍA DÓNDE ANOTAR QUIÉN ES EL CLIENTE. Había un botón para
--    escribirle por WhatsApp y ningún lugar donde guardar su teléfono. El
--    panel sabía todo del cobro y nada de la persona.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CÓMO NOS CONOCIÓ
--
--    Va en `empresas` y no en la ficha de abajo porque lo contesta la propia
--    persona al registrarse, no lo anota la administración. Preguntarlo en el
--    momento da un dato honesto; reconstruirlo después de memoria, no.
--
--    Es texto libre con una lista sugerida en la pantalla: encasillar a
--    alguien en cinco opciones fijas hace que la mitad elija «otro» y se
--    pierda justo lo que se quería saber.
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists como_nos_conocio text not null default '';

comment on column public.empresas.como_nos_conocio is
  'Lo contesta quien crea la cuenta. Texto libre: la pantalla sugiere opciones.';

-- ------------------------------------------------------------
-- 2. LA FICHA DEL CLIENTE
--
--    Datos de contacto y de seguimiento. Tabla aparte y no columnas en
--    `empresas` por una razón concreta: `empresas` la leen los miembros del
--    negocio, y las notas de seguimiento son de la administración. Nadie
--    tiene por qué leer lo que anotamos sobre él.
-- ------------------------------------------------------------
create table if not exists public.ficha_cliente (
  empresa_id  uuid primary key references public.empresas (id) on delete cascade,
  contacto    text not null default '',
  telefono    text not null default '',
  se_dedica   text not null default '',
  notas       text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.ficha_cliente enable row level security;

drop policy if exists ficha_cliente_select on public.ficha_cliente;
create policy ficha_cliente_select on public.ficha_cliente
  for select to authenticated
  using (public.es_superadmin());

revoke all on public.ficha_cliente from anon, authenticated;
grant select on public.ficha_cliente to authenticated;

create or replace function public.guardar_ficha_cliente(
  p_empresa   uuid,
  p_contacto  text default '',
  p_telefono  text default '',
  p_se_dedica text default '',
  p_notas     text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.empresas where id = p_empresa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  insert into public.ficha_cliente (empresa_id, contacto, telefono, se_dedica, notas, updated_at)
  values (p_empresa, left(coalesce(p_contacto, ''), 120), left(coalesce(p_telefono, ''), 40),
          left(coalesce(p_se_dedica, ''), 200), left(coalesce(p_notas, ''), 2000), now())
  on conflict (empresa_id) do update set
    contacto = excluded.contacto,
    telefono = excluded.telefono,
    se_dedica = excluded.se_dedica,
    notas = excluded.notas,
    updated_at = now();

  return jsonb_build_object('guardada', true);
end $fn$;

revoke all on function public.guardar_ficha_cliente(uuid, text, text, text, text) from public, anon;
grant execute on function public.guardar_ficha_cliente(uuid, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3. DESHACER EL ÚLTIMO CAMBIO
--
--    Restaura plan, estado y vencimiento a como estaban antes, leyéndolo del
--    registro de auditoría.
--
--    Si ese cambio había anotado un cobro, el ingreso NO se borra: se ANULA.
--    Es la misma regla que rige todo el sistema — un movimiento que existió
--    deja rastro aunque deje de sumar. Borrarlo dejaría un registro de
--    auditoría apuntando a algo que ya no está.
--
--    Solo deshace el ÚLTIMO cambio, y una sola vez. Deshacer en cadena
--    llevaría a estados que nunca existieron: el registro guarda «cómo
--    estaba antes de este cambio», no una línea de tiempo completa.
-- ------------------------------------------------------------
create or replace function public.deshacer_ultimo_cambio(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_reg     public.registro_admin;
  v_plan    text;
  v_estado  text;
  v_fin     timestamptz;
  v_ingreso uuid;
  v_anulado boolean := false;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_reg
  from public.registro_admin
  where empresa_id = p_empresa
    and accion in ('cambiar_plan', 'extender_prueba')
  order by created_at desc
  limit 1;

  if v_reg.id is null then
    raise exception 'No hay ningún cambio para deshacer en esta cuenta.' using errcode = 'P0002';
  end if;

  -- Ya se deshizo: sin esto, tocar dos veces dejaría el estado de dos
  -- cambios atrás, que es un estado que nunca existió.
  if coalesce((v_reg.detalle->>'deshecho')::boolean, false) then
    raise exception 'Ese cambio ya se deshizo.' using errcode = '22023';
  end if;

  v_plan   := coalesce(v_reg.detalle->>'plan_antes', 'pro');
  v_estado := coalesce(v_reg.detalle->>'estado_antes', 'prueba');
  v_fin    := nullif(v_reg.detalle->>'vence_antes', '')::timestamptz;

  update public.suscripciones
  set plan = v_plan,
      estado = v_estado,
      periodo_fin = v_fin,
      updated_at = now()
  where empresa_id = p_empresa;

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas
  set plan = case when v_plan = 'gratis' then 'gratis' else 'pro' end
  where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  -- El cobro que se había anotado, si lo hubo.
  v_ingreso := nullif(v_reg.detalle->>'ingreso_id', '')::uuid;
  if v_ingreso is not null then
    update public.movimientos
    set estado = 'anulado',
        anulado_por = auth.uid(),
        anulado_at = now(),
        motivo_anulacion = 'Se deshizo la activación desde el panel'
    where id = v_ingreso and estado = 'activo';
    v_anulado := found;
  end if;

  -- Se marca el registro para que no se pueda deshacer dos veces.
  update public.registro_admin
  set detalle = detalle || jsonb_build_object('deshecho', true, 'deshecho_at', now())
  where id = v_reg.id;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'deshacer', jsonb_build_object(
    'registro', v_reg.id,
    'volvio_a_plan', v_plan,
    'volvio_a_estado', v_estado,
    'volvio_a_vencer', v_fin,
    'ingreso_anulado', v_anulado
  ));

  return jsonb_build_object(
    'plan', v_plan, 'estado', v_estado, 'periodo_fin', v_fin,
    'ingreso_anulado', v_anulado
  );
end $fn$;

revoke all on function public.deshacer_ultimo_cambio(uuid) from public, anon;
grant execute on function public.deshacer_ultimo_cambio(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. QUÉ ARCHIVOS DEJARÍA UNA CUENTA AL BORRARSE
--
--    Se pide ANTES de borrar. Storage no entiende de claves foráneas: si no
--    se guardan las rutas primero, las fotos quedan ocupando lugar para
--    siempre y ya no hay ninguna fila que las nombre.
-- ------------------------------------------------------------
create or replace function public.archivos_de_cuenta(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(a.ruta)
    from public.adjuntos a
    where a.empresa_id = p_empresa and a.ruta is not null
  ), '[]'::jsonb);
end $fn$;

revoke all on function public.archivos_de_cuenta(uuid) from public, anon;
grant execute on function public.archivos_de_cuenta(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. BORRAR UNA CUENTA
--
--    Pide el nombre exacto escrito a mano. Es la misma barrera que usa
--    `vaciar_empresa()`, y por el mismo motivo: un botón rojo se toca por
--    curiosidad, escribir «Perfumeria Zurik» letra por letra no se hace sin
--    querer.
--
--    Lo que NO hace: borrar al usuario de `auth.users`. Esa persona puede
--    tener otra empresa, y además una cuenta de acceso no es lo mismo que un
--    negocio. Si además hay que borrar el usuario, se hace aparte y a
--    conciencia.
-- ------------------------------------------------------------
create or replace function public.borrar_cuenta(p_empresa uuid, p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre  text;
  v_movs    integer;
  v_persona integer;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select nombre into v_nombre from public.empresas where id = p_empresa;
  if v_nombre is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  if trim(coalesce(p_confirmacion, '')) <> v_nombre then
    raise exception 'Para borrar hay que escribir el nombre exacto: %', v_nombre
      using errcode = '22023';
  end if;

  select count(*) into v_movs from public.movimientos where empresa_id = p_empresa;
  select count(*) into v_persona from public.miembros where empresa_id = p_empresa;

  -- Se deja constancia ANTES de borrar: después la empresa ya no existe y
  -- `registro_admin.empresa_id` queda en null. El nombre va en el detalle
  -- para que el registro siga diciendo de quién se trataba.
  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'borrar_cuenta', jsonb_build_object(
    'nombre', v_nombre, 'movimientos', v_movs, 'personas', v_persona
  ));

  delete from public.empresas where id = p_empresa;

  return jsonb_build_object('borrada', true, 'nombre', v_nombre, 'movimientos', v_movs);
end $fn$;

revoke all on function public.borrar_cuenta(uuid, text) from public, anon;
grant execute on function public.borrar_cuenta(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 6. LA LISTA DE CUENTAS, CON LO NUEVO
--
--    Redefine `listar_cuentas()` de la 016 sumando la ficha, cómo nos
--    conoció, y —importante— si la cuenta quedó SIN DUEÑO.
--
--    Esa última bandera existe porque el caso es real y silencioso: borrar
--    un usuario desde Supabase deja la empresa viva y vacía. Antes se veía
--    como «sin correo» y parecía un dato que faltaba; ahora se dice lo que
--    es, para que se pueda limpiar.
--
--    Sigue sin devolver un solo monto de nadie. La prueba que lo comprueba
--    también.
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
      'rubro',        e.rubro,
      'moneda',       e.moneda,
      'creada',       e.created_at,
      'propietario',  coalesce(prop.nombre, ''),
      'correo',       coalesce(u.email, ''),
      'sin_duenio',   prop.id is null,
      'como_nos_conocio', e.como_nos_conocio,

      'contacto',  coalesce(f.contacto, ''),
      'telefono',  coalesce(f.telefono, ''),
      'se_dedica', coalesce(f.se_dedica, ''),
      'notas',     coalesce(f.notas, ''),

      'plan',         public.plan_efectivo_calculado(e.id),
      'plan_guardado', s.plan,
      'estado',       s.estado,
      'periodo_fin',  s.periodo_fin,
      'prueba_fin',   s.prueba_fin,
      'dias_restantes', case
        when s.periodo_fin is null then null
        else floor(extract(epoch from (s.periodo_fin - now())) / 86400)::integer
      end,
      'miembros', (select count(*) from public.miembros m where m.empresa_id = e.id),
      'movimientos', (select count(*) from public.movimientos mv where mv.empresa_id = e.id),
      'ultima_actividad', (select max(mv.created_at) from public.movimientos mv where mv.empresa_id = e.id),
      'ia_usada', coalesce((
        select ui.usados from public.uso_ia ui
        where ui.empresa_id = e.id and ui.periodo = v_periodo
      ), 0),
      'ia_tope', (public.limites_plan(public.plan_efectivo_calculado(e.id))->>'capturas_mes')::integer,
      'puede_deshacer', exists (
        select 1 from public.registro_admin r
        where r.empresa_id = e.id
          and r.accion in ('cambiar_plan', 'extender_prueba')
          and not coalesce((r.detalle->>'deshecho')::boolean, false)
      ),
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
    left join public.ficha_cliente f on f.empresa_id = e.id
    where (
        p_busqueda is null
        or trim(p_busqueda) = ''
        or e.nombre ilike '%' || trim(p_busqueda) || '%'
        or coalesce(u.email, '') ilike '%' || trim(p_busqueda) || '%'
        or coalesce(f.contacto, '') ilike '%' || trim(p_busqueda) || '%'
        or coalesce(f.telefono, '') ilike '%' || trim(p_busqueda) || '%'
      )
      and (p_estado is null or trim(p_estado) = '' or s.estado = p_estado)
    limit greatest(1, least(coalesce(p_limite, 200), 500))
  ) t;

  return v_res;
end $fn$;

revoke all on function public.listar_cuentas(text, text, integer) from public, anon;
grant execute on function public.listar_cuentas(text, text, integer) to authenticated;

-- ------------------------------------------------------------
-- 7. CREAR EMPRESA · ahora también guarda cómo nos conoció
-- ------------------------------------------------------------
create or replace function public.crear_empresa(
  p_nombre text,
  p_moneda text default 'PYG',
  p_nombre_usuario text default null,
  p_zona text default 'America/Asuncion',
  p_tipo_cuenta text default 'emprendedor',
  p_rubro text default 'comercio',
  p_como_nos_conocio text default ''
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_codigo text;
  v_intentos int := 0;
  v_fin timestamptz;
  v_tipo text;
  v_rubro text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre del negocio es muy corto.' using errcode = '22023';
  end if;

  v_tipo := case when p_tipo_cuenta = 'personal' then 'personal' else 'emprendedor' end;
  v_rubro := case
    when v_tipo = 'personal' then 'comercio'
    when p_rubro in ('comercio', 'ganaderia', 'agricultura', 'servicios') then p_rubro
    else 'comercio'
  end;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresa_accesos where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código de acceso.' using errcode = '55000';
    end if;
  end loop;

  insert into public.empresas (
    nombre, moneda, creada_por, zona_horaria, tipo_cuenta, rubro, como_nos_conocio
  )
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), auth.uid(),
          coalesce(nullif(trim(p_zona), ''), 'America/Asuncion'), v_tipo, v_rubro,
          left(coalesce(p_como_nos_conocio, ''), 80))
  returning id into v_id;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Propietario'), 'propietario');

  insert into public.empresa_accesos (empresa_id, codigo)
  values (v_id, v_codigo);

  v_fin := now() + make_interval(days => public.dias_de_prueba(v_tipo));
  insert into public.suscripciones (empresa_id, plan, estado, periodo_inicio, periodo_fin, prueba_fin)
  values (v_id, 'pro', 'prueba', now(), v_fin, v_fin);

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = 'pro' where id = v_id;
  perform set_config('orden.suscripcion_confiable', '0', true);

  return v_id;
end $fn$;

drop function if exists public.crear_empresa(text, text, text, text, text, text);

revoke all on function public.crear_empresa(text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.crear_empresa(text, text, text, text, text, text, text)
  to authenticated;


-- ############################################################
-- ##  023_registro_con_ficha.sql
-- ############################################################

-- ORDEN · Migración 023 · El registro pregunta quién es la persona
--
-- Hasta acá el orden del registro era: correo y contraseña primero, datos
-- después. Está al revés por dos motivos.
--
-- El primero es de quien se registra: la primera pantalla de un producto que
-- no conoce le pedía una contraseña. Es la peor pregunta para arrancar —
-- todavía no sabe si le sirve y ya le estás pidiendo que se comprometa.
--
-- El segundo es del negocio: el teléfono y a qué se dedica se preguntaban en
-- el panel, o sea NUNCA, porque había que preguntárselo por WhatsApp uno por
-- uno. Se pregunta en el registro o no se sabe.
--
-- La ficha la escribe `crear_empresa`, no la persona. La tabla sigue sin
-- permisos de escritura para nadie: se llena una vez, por esta función, y
-- después solo la administración de Orden la puede tocar. Alguien registrando
-- su negocio no tiene por qué poder editar la ficha de otro.

create or replace function public.crear_empresa(
  p_nombre text,
  p_moneda text default 'PYG',
  p_nombre_usuario text default null,
  p_zona text default 'America/Asuncion',
  p_tipo_cuenta text default 'emprendedor',
  p_rubro text default 'comercio',
  p_como_nos_conocio text default '',
  p_telefono text default '',
  p_se_dedica text default ''
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_codigo text;
  v_intentos int := 0;
  v_fin timestamptz;
  v_tipo text;
  v_rubro text;
  v_contacto text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre del negocio es muy corto.' using errcode = '22023';
  end if;

  v_tipo := case when p_tipo_cuenta = 'personal' then 'personal' else 'emprendedor' end;
  v_rubro := case
    when v_tipo = 'personal' then 'comercio'
    when p_rubro in ('comercio', 'ganaderia', 'agricultura', 'servicios') then p_rubro
    else 'comercio' end;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresa_accesos where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código de acceso.' using errcode = '55000';
    end if;
  end loop;

  insert into public.empresas (
    nombre, moneda, creada_por, zona_horaria, tipo_cuenta, rubro, como_nos_conocio)
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), auth.uid(),
          coalesce(nullif(trim(p_zona), ''), 'America/Asuncion'), v_tipo, v_rubro,
          left(coalesce(p_como_nos_conocio, ''), 80))
  returning id into v_id;

  v_contacto := nullif(trim(coalesce(p_nombre_usuario, '')), '');

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(v_contacto, 'Propietario'), 'propietario');

  insert into public.empresa_accesos (empresa_id, codigo) values (v_id, v_codigo);

  -- La ficha solo se crea si contestó algo. Una fila con los tres campos
  -- vacíos no es un dato, es ruido en la lista de clientes.
  if v_contacto is not null
     or nullif(trim(coalesce(p_telefono, '')), '') is not null
     or nullif(trim(coalesce(p_se_dedica, '')), '') is not null then
    insert into public.ficha_cliente (empresa_id, contacto, telefono, se_dedica, updated_at)
    values (v_id,
            left(coalesce(v_contacto, ''), 120),
            left(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), 40),
            left(coalesce(trim(p_se_dedica), ''), 200),
            now())
    on conflict (empresa_id) do nothing;
  end if;

  v_fin := now() + make_interval(days => public.dias_de_prueba(v_tipo));
  insert into public.suscripciones (empresa_id, plan, estado, periodo_inicio, periodo_fin, prueba_fin)
  values (v_id, 'pro', 'prueba', now(), v_fin, v_fin);

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = 'pro' where id = v_id;
  perform set_config('orden.suscripcion_confiable', '0', true);

  return v_id;
end $fn$;

drop function if exists public.crear_empresa(text, text, text, text, text, text, text);

revoke all on function public.crear_empresa(text, text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.crear_empresa(text, text, text, text, text, text, text, text, text)
  to authenticated;


-- ############################################################
-- ##  024_cuenta_personal.sql
-- ############################################################

-- ORDEN · Migración 024 · La cuenta personal deja de ser un comercio disfrazado
--
-- Hasta acá, "personal" solo quitaba pantallas: no había Vender, ni Productos,
-- ni Reto. Pero por debajo seguía siendo una cuenta de comercio, y eso se
-- filtraba por dos agujeros que nadie había mirado:
--
--   · EL CIERRE DEL DÍA SEGUÍA AHÍ. Esa pantalla se oculta por RUBRO, y a
--     toda cuenta personal se le guarda rubro 'comercio' porque una persona
--     no tiene rubro. O sea que el filtro nunca se le aplicó. Alguien que
--     lleva su sueldo estaba viendo «cuánto ganaste hoy», que para él no
--     significa nada: su plata no se mide por día.
--
--   · LAS CATEGORÍAS ERAN LAS DE UN ALMACÉN. Mercadería, Publicidad,
--     Sueldos («empleados, jornales»), Impuestos. Ninguna de Comida, Salud,
--     Ropa o Cuidado personal. La IA venía clasificando el gasto de una
--     persona con los casilleros de un negocio.
--
-- Lo segundo importa más de lo que parece: el presupuesto que se agrega en
-- esta misma migración se arma POR CATEGORÍA. Con las categorías de un
-- comercio, toda la organización quedaría construida sobre casilleros
-- equivocados.
--
-- Y se agrega lo que hacía falta para que la cuenta personal sirva de verdad:
-- ingresos que se repiten, un plan de en qué se va la plata, y un ciclo que
-- va de cobro a cobro en vez de día a día.

-- ============================================================
-- 1. LA PUERTA: LAS DOS PREGUNTAS AHORA SABEN QUÉ TIPO DE CUENTA ES
--
--    Las dos funciones pasan a recibir el tipo de cuenta. Se REEMPLAZAN las
--    versiones de un solo argumento en vez de convivir con ellas: dos
--    funciones contestando la misma pregunta es exactamente cómo se llega a
--    que la pantalla diga una cosa y la tarea de la noche otra.
-- ============================================================

drop function if exists public.categorias_de_rubro(text);

create or replace function public.categorias_de_rubro(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns jsonb language sql immutable set search_path = public as $fn$
  select case
    when coalesce(p_tipo_cuenta, 'emprendedor') = 'personal' then jsonb_build_array(
      jsonb_build_object('nombre','Comida','pistas','supermercado, almacén, verdulería, carnicería, despensa, panadería'),
      jsonb_build_object('nombre','Alquiler','pistas','alquiler, expensas, condominio'),
      jsonb_build_object('nombre','Servicios','pistas','luz, agua, internet, teléfono, cable, gas'),
      jsonb_build_object('nombre','Transporte','pistas','colectivo, nafta, combustible, pasaje, taxi, uber, peaje'),
      jsonb_build_object('nombre','Salud','pistas','farmacia, remedios, médico, dentista, seguro médico, análisis'),
      jsonb_build_object('nombre','Educación','pistas','colegio, cuota, universidad, útiles, curso, libros'),
      jsonb_build_object('nombre','Ropa','pistas','ropa, calzado, zapatillas, campera'),
      jsonb_build_object('nombre','Cuidado personal','pistas','peluquería, uñas, barbería, cosmética, gimnasio, perfume'),
      jsonb_build_object('nombre','Ocio','pistas','salida, restaurante, cine, streaming, viaje, cerveza, cumpleaños'),
      jsonb_build_object('nombre','Hogar','pistas','limpieza, muebles, arreglos, electrodomésticos, ferretería'),
      jsonb_build_object('nombre','Cuotas y deudas','pistas','tarjeta, préstamo, cuota, financiera'),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'ganaderia' then jsonb_build_array(
      jsonb_build_object('nombre','Alimentación','pistas','maíz, balanceado, ración, fardos, sal, pasto'),
      jsonb_build_object('nombre','Sanidad','pistas','vacunas, antiparasitarios, veterinario, remedios'),
      jsonb_build_object('nombre','Personal','pistas','peón, capataz, jornales, sueldos'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo, pastaje'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de hacienda, camión jaula'),
      jsonb_build_object('nombre','Mantenimiento','pistas','alambrado, aguadas, maquinaria, herramientas'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'agricultura' then jsonb_build_array(
      jsonb_build_object('nombre','Semilla','pistas','semilla, plantines'),
      jsonb_build_object('nombre','Fertilizante','pistas','urea, fosfato, abono'),
      jsonb_build_object('nombre','Agroquímicos','pistas','herbicida, fungicida, insecticida'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Cosecha','pistas','cosechadora, trilla, secado'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de granos'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo'),
      jsonb_build_object('nombre','Personal','pistas','jornales, tractorista, peón'),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'servicios' then jsonb_build_array(
      jsonb_build_object('nombre','Materiales','pistas','cemento, arena, cables, pintura, insumos'),
      jsonb_build_object('nombre','Repuestos','pistas','piezas, filtros, aceite'),
      jsonb_build_object('nombre','Herramientas','pistas',''),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Personal','pistas','ayudante, jornales, sueldos'),
      jsonb_build_object('nombre','Transporte','pistas','flete, viaje, delivery'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    else jsonb_build_array(
      jsonb_build_object('nombre','Mercadería','pistas','lo que comprás para revender'),
      jsonb_build_object('nombre','Transporte','pistas','combustible, flete, delivery'),
      jsonb_build_object('nombre','Comida','pistas',''),
      jsonb_build_object('nombre','Publicidad','pistas',''),
      jsonb_build_object('nombre','Servicios','pistas','luz, agua, internet, teléfono'),
      jsonb_build_object('nombre','Alquiler','pistas',''),
      jsonb_build_object('nombre','Sueldos','pistas','empleados, jornales'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))
  end;
$fn$;

grant execute on function public.categorias_de_rubro(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- ¿ESTA CUENTA CIERRA EL DÍA?
--
-- Una persona con sueldo no cierra el día por el mismo motivo que un
-- ganadero no lo cierra: el día no es su ciclo. El del ganadero es el
-- novillo; el de alguien con sueldo va de cobro a cobro.
-- ------------------------------------------------------------
drop function if exists public.rubro_cierra_el_dia(text);

create or replace function public.rubro_cierra_el_dia(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p_tipo_cuenta, 'emprendedor') <> 'personal'
     and coalesce(p_rubro, 'comercio') in ('comercio', 'servicios');
$fn$;

grant execute on function public.rubro_cierra_el_dia(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- El recordatorio de la noche, con la misma firma y la misma forma de
-- respuesta que en la 008 y la 021. Lo único que cambia es que ahora la
-- cuenta personal tampoco recibe el «no cargaste nada hoy».
-- ------------------------------------------------------------
create or replace function public.empresas_sin_cargar_hoy(p_racha_minima integer default 2)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id', e.id,
      'nombre',     e.nombre,
      'zona',       e.zona_horaria,
      'racha',      r.largo
    ) as x
    from public.empresas e
    join lateral (
      with dias as (
        select distinct m.fecha from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo'
          and m.fecha <= (now() at time zone e.zona_horaria)::date
      ),
      numeradas as (
        select fecha, (fecha - (row_number() over (order by fecha))::int) as isla from dias
      ),
      rachas as (
        select count(*)::int as largo, max(fecha) as hasta from numeradas group by isla
      )
      select largo, hasta from rachas order by hasta desc limit 1
    ) r on true
    where public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta)
      and r.hasta = (now() at time zone e.zona_horaria)::date - 1
      and r.largo >= greatest(p_racha_minima, 1)
  ) s;

  return v_res;
end $fn$;

revoke all on function public.empresas_sin_cargar_hoy(integer) from public, anon, authenticated;
grant execute on function public.empresas_sin_cargar_hoy(integer) to service_role;

-- ============================================================
-- 2. INGRESOS FIJOS
--
--    No se llama «sueldo» a propósito. Mucha gente tiene más de una entrada
--    —sueldo, changas, el alquiler de una pieza— y un comisionista no tiene
--    sueldo fijo pero sí ingresos que se repiten. Un solo concepto los cubre
--    a todos; una casilla llamada «salario» dejaría afuera a la mitad.
--
--    Esto NO crea movimientos. Es lo que la persona ESPERA cobrar, no lo que
--    cobró. La plata entra cuando la carga, como cualquier otro ingreso. Si
--    esta tabla generara movimientos sola, el sistema mostraría plata que
--    todavía no existe — que es la única mentira que un sistema de plata no
--    se puede permitir.
-- ============================================================
create table if not exists public.ingresos_fijos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nombre      text not null check (char_length(trim(nombre)) between 1 and 60),
  importe     numeric(14,2) not null check (importe > 0),
  -- Qué día del mes entra. Define el ciclo: para alguien con sueldo, el mes
  -- útil no va del 1 al 30, va de cobro a cobro.
  dia_del_mes smallint not null default 1 check (dia_del_mes between 1 and 31),
  -- Cuál manda para definir el ciclo, si hay varios.
  principal   boolean not null default false,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ingresos_fijos_empresa_idx
  on public.ingresos_fijos (empresa_id) where activo;

-- Un solo principal por cuenta: si hubiera dos, el ciclo dependería del
-- orden en que se leyeran las filas.
create unique index if not exists ingresos_fijos_un_principal
  on public.ingresos_fijos (empresa_id) where principal and activo;

-- ============================================================
-- 3. EL PLAN: EN QUÉ SE VA A IR LA PLATA
--
--    Un número por categoría, que vale todos los meses. No se guarda una
--    copia por mes a propósito: obligaría a rearmar el plan cada treinta
--    días, y un plan que hay que rehacer es un plan que se abandona.
--
--    La comparación contra la realidad sale gratis: cada gasto ya se guarda
--    con su categoría desde el día uno.
-- ============================================================
create table if not exists public.presupuesto (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  categoria  text not null check (char_length(trim(categoria)) between 1 and 40),
  importe    numeric(14,2) not null check (importe >= 0),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, categoria)
);

-- ------------------------------------------------------------
-- Permisos de las dos tablas.
--
-- Se lee con `es_admin`, no con `es_miembro`. Cuánto cobra alguien y cómo
-- reparte su plata es del mismo orden que sus deudas y sus costos: un
-- vendedor no lo ve nunca. Hoy una cuenta personal no tiene vendedores, pero
-- la tabla es genérica y el día que un comercio use el presupuesto la regla
-- ya tiene que estar puesta.
-- ------------------------------------------------------------
alter table public.ingresos_fijos enable row level security;
alter table public.presupuesto    enable row level security;

drop policy if exists ingresos_fijos_select on public.ingresos_fijos;
create policy ingresos_fijos_select on public.ingresos_fijos
  for select to authenticated using (public.es_admin(empresa_id));

drop policy if exists presupuesto_select on public.presupuesto;
create policy presupuesto_select on public.presupuesto
  for select to authenticated using (public.es_admin(empresa_id));

revoke all on public.ingresos_fijos from anon, authenticated;
revoke all on public.presupuesto    from anon, authenticated;
grant select on public.ingresos_fijos to authenticated;
grant select on public.presupuesto    to authenticated;

-- La cuenta vencida queda en solo lectura, igual que todo lo demás. El
-- DELETE sigue libre: nadie tiene que pagar para poder irse.
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['ingresos_fijos', 'presupuesto'] loop
    execute format('drop trigger if exists %I on public.%I',
                   'cuenta_activa_' || v_tabla, v_tabla);
    execute format(
      'create trigger %I before insert or update on public.%I '
      || 'for each row execute function public.exigir_cuenta_activa()',
      'cuenta_activa_' || v_tabla, v_tabla);
  end loop;
end $$;

-- ============================================================
-- 4. ESCRIBIR: SIEMPRE POR LA PUERTA OFICIAL
-- ============================================================
create or replace function public.guardar_ingreso_fijo(
  p_empresa   uuid,
  p_nombre    text,
  p_importe   numeric,
  p_dia       integer default 1,
  p_principal boolean default false,
  p_id        uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre, para saber qué es cuando entre.' using errcode = '22023';
  end if;

  if coalesce(p_importe, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  -- Si este pasa a ser el principal, el anterior deja de serlo. Se hace
  -- ANTES de escribir, porque el índice único no admite dos.
  if coalesce(p_principal, false) then
    update public.ingresos_fijos
    set principal = false, updated_at = now()
    where empresa_id = p_empresa and principal
      and (p_id is null or id <> p_id);
  end if;

  if p_id is null then
    insert into public.ingresos_fijos (empresa_id, nombre, importe, dia_del_mes, principal)
    values (p_empresa, trim(p_nombre), p_importe,
            least(greatest(coalesce(p_dia, 1), 1), 31), coalesce(p_principal, false))
    returning id into v_id;
  else
    update public.ingresos_fijos
    set nombre = trim(p_nombre), importe = p_importe,
        dia_del_mes = least(greatest(coalesce(p_dia, 1), 1), 31),
        principal = coalesce(p_principal, false), updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese ingreso no existe en esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_ingreso_fijo(uuid, text, numeric, integer, boolean, uuid)
  from public, anon;
grant execute on function public.guardar_ingreso_fijo(uuid, text, numeric, integer, boolean, uuid)
  to authenticated;

create or replace function public.borrar_ingreso_fijo(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  delete from public.ingresos_fijos where id = p_id and empresa_id = p_empresa;
  if not found then
    raise exception 'Ese ingreso no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_ingreso_fijo(uuid, uuid) from public, anon;
grant execute on function public.borrar_ingreso_fijo(uuid, uuid) to authenticated;

-- Poner en cero es sacar la categoría del plan. Sin esto haría falta un
-- segundo botón de borrar para algo que la persona piensa como «ya no le
-- pongo número a esto».
create or replace function public.guardar_presupuesto(
  p_empresa   uuid,
  p_categoria text,
  p_importe   numeric
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_categoria, ''))) = 0 then
    raise exception 'Falta la categoría.' using errcode = '22023';
  end if;

  if coalesce(p_importe, 0) <= 0 then
    delete from public.presupuesto
    where empresa_id = p_empresa and categoria = trim(p_categoria);
    return jsonb_build_object('quitada', true);
  end if;

  insert into public.presupuesto (empresa_id, categoria, importe, updated_at)
  values (p_empresa, trim(p_categoria), p_importe, now())
  on conflict (empresa_id, categoria) do update
    set importe = excluded.importe, updated_at = now();

  return jsonb_build_object('guardado', true);
end $fn$;

revoke all on function public.guardar_presupuesto(uuid, text, numeric) from public, anon;
grant execute on function public.guardar_presupuesto(uuid, text, numeric) to authenticated;

-- ============================================================
-- 5. EL CICLO: DE COBRO A COBRO
--
--    Para alguien con sueldo el mes útil no empieza el 1. Empieza el día que
--    cobra y termina el día antes del próximo cobro. Esa es la pregunta que
--    de verdad le quita el sueño: es 20, ¿llego al 30?
-- ============================================================

-- El día de cobro de un mes dado, recortado si el mes es más corto: quien
-- cobra el 31 en febrero cobra el 28.
create or replace function public.fecha_de_cobro(p_mes date, p_dia integer)
returns date language sql immutable set search_path = public as $fn$
  select (date_trunc('month', p_mes)
          + (least(
               greatest(coalesce(p_dia, 1), 1),
               extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int
             ) - 1) * interval '1 day')::date;
$fn$;

-- Revocar ANTES de otorgar: `anon` hereda de PUBLIC, así que un grant
-- suelto la deja abierta aunque nunca se la haya nombrado.
revoke all on function public.fecha_de_cobro(date, integer) from public, anon;
grant execute on function public.fecha_de_cobro(date, integer) to authenticated;

create or replace function public.ciclo_personal(p_empresa uuid)
returns table (desde date, hasta date, dia_cobro integer)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona   text;
  v_hoy    date;
  v_dia    integer;
  v_inicio date;
begin
  select zona_horaria into v_zona from public.empresas where id = p_empresa;
  v_hoy := (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date;

  -- Manda el ingreso marcado como principal; si no hay, el más grande. Sin
  -- ningún ingreso fijo cargado, el ciclo es el mes corrido.
  select i.dia_del_mes into v_dia
  from public.ingresos_fijos i
  where i.empresa_id = p_empresa and i.activo
  order by i.principal desc, i.importe desc, i.created_at
  limit 1;

  v_dia := coalesce(v_dia, 1);

  v_inicio := public.fecha_de_cobro(v_hoy, v_dia);
  if v_hoy < v_inicio then
    v_inicio := public.fecha_de_cobro((v_hoy - interval '1 month')::date, v_dia);
  end if;

  desde     := v_inicio;
  hasta     := public.fecha_de_cobro((v_inicio + interval '1 month')::date, v_dia) - 1;
  dia_cobro := v_dia;
  return next;
end $fn$;

revoke all on function public.ciclo_personal(uuid) from public, anon;
grant execute on function public.ciclo_personal(uuid) to authenticated;

-- ============================================================
-- 6. LA PANTALLA, EN UNA SOLA LLAMADA
--
--    Contesta la única pregunta que importa: cuánto te queda y para cuántos
--    días. Todo lo demás de esta función es el detalle de cómo se llegó a
--    ese número.
--
--    `disponible` sale de plata REAL: lo que entró menos lo que salió, menos
--    las cuotas que todavía faltan pagar antes de que cierre el ciclo. No se
--    suma el sueldo esperado si todavía no entró — decirle a alguien que
--    tiene plata que no cobró es cómo se hace que deje de creerte.
-- ============================================================
create or replace function public.resumen_personal(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_c            record;
  v_zona         text;
  v_hoy          date;
  v_entro        numeric := 0;
  v_salio        numeric := 0;
  v_cuotas       numeric := 0;
  v_dias         integer;
  v_plan         jsonb;
  v_sin_planear  numeric := 0;
  v_fijos        jsonb;
  v_esperado     numeric := 0;
  v_hubo_ingreso boolean := false;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a esta cuenta.' using errcode = '42501';
  end if;

  select zona_horaria into v_zona from public.empresas where id = p_empresa;
  v_hoy := (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date;

  select * into v_c from public.ciclo_personal(p_empresa);

  select
    coalesce(sum(m.monto) filter (where m.tipo in ('ingreso', 'venta')), 0),
    coalesce(sum(m.monto) filter (where m.tipo = 'gasto'), 0),
    bool_or(m.tipo in ('ingreso', 'venta'))
  into v_entro, v_salio, v_hubo_ingreso
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.estado = 'activo'
    and m.fecha between v_c.desde and v_c.hasta;

  -- Cuotas que todavía no se pagaron y vencen antes de que cierre el ciclo.
  -- Lo ya pagado no se cuenta acá: está en `v_salio` como gasto, y sumarlo
  -- dos veces le descontaría a la persona plata que ya descontó.
  select coalesce(sum(d.monto_cuota), 0) into v_cuotas
  from public.deudas d
  where d.empresa_id = p_empresa
    and d.activa and d.saldo > 0
    and d.monto_cuota is not null
    and d.vence_el between v_hoy and v_c.hasta;

  v_dias := greatest(1, (v_c.hasta - v_hoy) + 1);

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'categoria', p.categoria,
      'planeado',  p.importe,
      'gastado',   coalesce(g.total, 0),
      'resta',     p.importe - coalesce(g.total, 0)
    ) order by p.categoria), '[]'::jsonb)
  into v_plan
  from public.presupuesto p
  left join lateral (
    select sum(m.monto) as total
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
      and m.categoria = p.categoria
      and m.fecha between v_c.desde and v_c.hasta
  ) g on true
  where p.empresa_id = p_empresa;

  -- Lo que se gastó fuera del plan. Sin este número el plan miente por
  -- omisión: podés estar bien en las cinco categorías que anotaste y
  -- fundido igual.
  select coalesce(sum(m.monto), 0) into v_sin_planear
  from public.movimientos m
  where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
    and m.fecha between v_c.desde and v_c.hasta
    and not exists (
      select 1 from public.presupuesto p
      where p.empresa_id = p_empresa and p.categoria = m.categoria);

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'nombre', i.nombre, 'importe', i.importe,
      'dia_del_mes', i.dia_del_mes, 'principal', i.principal
    ) order by i.principal desc, i.importe desc), '[]'::jsonb),
    coalesce(sum(i.importe), 0)
  into v_fijos, v_esperado
  from public.ingresos_fijos i
  where i.empresa_id = p_empresa and i.activo;

  return jsonb_build_object(
    'desde', v_c.desde,
    'hasta', v_c.hasta,
    'dia_cobro', v_c.dia_cobro,
    'dias_restantes', v_dias,
    'entro', v_entro,
    'salio', v_salio,
    'cuotas_por_vencer', v_cuotas,
    'disponible', v_entro - v_salio - v_cuotas,
    'por_dia', round((v_entro - v_salio - v_cuotas) / v_dias, 2),
    'plan', v_plan,
    'gastado_sin_planear', v_sin_planear,
    'ingresos_fijos', v_fijos,
    'esperado', v_esperado,
    -- Para poder preguntarle «¿ya cobraste?» en vez de mostrarle un cero
    -- sin explicación el día que arranca el ciclo.
    'cobro_pendiente', v_esperado > 0 and not coalesce(v_hubo_ingreso, false)
  );
end $fn$;

revoke all on function public.resumen_personal(uuid) from public, anon;
grant execute on function public.resumen_personal(uuid) to authenticated;


-- ############################################################
-- ##  025_gastos_fijos.sql
-- ############################################################

-- ORDEN · Migración 025 · Lo que se paga todos los meses
--
-- Faltaba la otra mitad. La 024 trajo lo que ENTRA todos los meses; esto es
-- lo que SALE sí o sí: el wifi, la línea del celular, el pasaje del bus, la
-- cuota del gimnasio.
--
-- Sin esto, el número de «te quedan» mentía por optimismo. El día que cobrás
-- te decía que tenías 1.850.000 disponibles cuando 500.000 ya estaban
-- comprometidos antes de que decidieras nada. Es el error más caro que puede
-- cometer un sistema de plata: hacerte creer que tenés más de lo que tenés.
--
-- CÓMO SE EVITA CONTAR DOS VECES
--
-- Un gasto fijo es algo que va a pasar, no algo que pasó. Cuando de verdad
-- pagás el wifi, lo cargás como cualquier gasto — y a partir de ahí ya no
-- puede seguir descontándose, o estaría restado dos veces.
--
-- La regla, por categoría:
--
--     pendiente = max(0, suma de los fijos − lo ya gastado en esa categoría)
--
-- Wifi 200.000 en «Servicios»: si todavía no gastaste nada en Servicios,
-- faltan 200.000. Si gastaste 150.000, faltan 50.000. Si gastaste 200.000 o
-- más, no falta nada.
--
-- No hace falta que nadie marque «ya lo pagué», que es justo lo que la gente
-- deja de hacer a la segunda semana. Y si tenés dos fijos en la misma
-- categoría —wifi y luz, los dos «Servicios»— se suman y se comparan juntos,
-- que es exactamente lo correcto.

create table if not exists public.gastos_fijos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nombre      text not null check (char_length(trim(nombre)) between 1 and 60),
  importe     numeric(14,2) not null check (importe > 0),
  -- En qué casillero cae. Es lo que permite saber si ya se pagó: se compara
  -- contra lo gastado en esta misma categoría durante el ciclo.
  categoria   text not null default 'Otros' check (char_length(trim(categoria)) between 1 and 40),
  -- Qué día vence. Puede ir vacío a propósito: el pasaje del bus se gasta
  -- todos los días, no tiene fecha. Obligar a inventar un día haría que el
  -- dato sea mentira.
  dia_del_mes smallint check (dia_del_mes is null or dia_del_mes between 1 and 31),
  -- Para escribir lo que no entra en un nombre de sesenta caracteres.
  notas       text not null default '',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists gastos_fijos_empresa_idx
  on public.gastos_fijos (empresa_id) where activo;

alter table public.gastos_fijos enable row level security;

drop policy if exists gastos_fijos_select on public.gastos_fijos;
create policy gastos_fijos_select on public.gastos_fijos
  for select to authenticated using (public.es_admin(empresa_id));

revoke all on public.gastos_fijos from anon, authenticated;
grant select on public.gastos_fijos to authenticated;

do $$ begin
  execute 'drop trigger if exists cuenta_activa_gastos_fijos on public.gastos_fijos';
  execute 'create trigger cuenta_activa_gastos_fijos before insert or update '
       || 'on public.gastos_fijos for each row execute function public.exigir_cuenta_activa()';
end $$;

create or replace function public.guardar_gasto_fijo(
  p_empresa   uuid,
  p_nombre    text,
  p_importe   numeric,
  p_categoria text default 'Otros',
  p_dia       integer default null,
  p_notas     text default '',
  p_id        uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id  uuid;
  v_dia smallint;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre, para reconocerlo cuando lo pagues.' using errcode = '22023';
  end if;

  if coalesce(p_importe, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  v_dia := case
    when p_dia is null then null
    else least(greatest(p_dia, 1), 31)::smallint end;

  if p_id is null then
    insert into public.gastos_fijos (empresa_id, nombre, importe, categoria, dia_del_mes, notas)
    values (p_empresa, trim(p_nombre), p_importe,
            coalesce(nullif(trim(p_categoria), ''), 'Otros'), v_dia,
            left(coalesce(p_notas, ''), 500))
    returning id into v_id;
  else
    update public.gastos_fijos
    set nombre = trim(p_nombre), importe = p_importe,
        categoria = coalesce(nullif(trim(p_categoria), ''), 'Otros'),
        dia_del_mes = v_dia, notas = left(coalesce(p_notas, ''), 500),
        updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese gasto fijo no existe en esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_gasto_fijo(uuid, text, numeric, text, integer, text, uuid)
  from public, anon;
grant execute on function public.guardar_gasto_fijo(uuid, text, numeric, text, integer, text, uuid)
  to authenticated;

create or replace function public.borrar_gasto_fijo(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  delete from public.gastos_fijos where id = p_id and empresa_id = p_empresa;
  if not found then
    raise exception 'Ese gasto fijo no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_gasto_fijo(uuid, uuid) from public, anon;
grant execute on function public.borrar_gasto_fijo(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- LO QUE SE REPITE, PARA QUE LA IA LO SEPA
--
-- Sin esto pasaba lo que tenía que pasar: alguien con el sueldo cargado
-- decía «ya cobré mi sueldo de este mes» y el sistema contestaba «no pude
-- sacar el monto del mensaje, escribilo vos». El monto estaba guardado en la
-- fila de al lado. Es lo mismo que ya se hace con las deudas: la IA no
-- adivina, se le da lo que la cuenta ya sabe.
--
-- Va con `es_admin` como todo lo demás de esta familia: un vendedor no tiene
-- por qué enterarse de cuánto cobra el dueño, ni siquiera de rebote por el
-- prompt de una captura.
-- ------------------------------------------------------------
create or replace function public.fijos_para_captura(p_empresa uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select case when public.es_admin(p_empresa) then coalesce((
    select jsonb_agg(x order by x->>'nombre') from (
      select jsonb_build_object(
        'clase', 'ingreso', 'nombre', i.nombre, 'importe', i.importe,
        'dia', i.dia_del_mes, 'categoria', 'Sueldo') as x
      from public.ingresos_fijos i
      where i.empresa_id = p_empresa and i.activo
      union all
      select jsonb_build_object(
        'clase', 'gasto', 'nombre', g.nombre, 'importe', g.importe,
        'dia', g.dia_del_mes, 'categoria', g.categoria) as x
      from public.gastos_fijos g
      where g.empresa_id = p_empresa and g.activo
    ) t), '[]'::jsonb)
  else '[]'::jsonb end;
$fn$;

revoke all on function public.fijos_para_captura(uuid) from public, anon;
grant execute on function public.fijos_para_captura(uuid) to authenticated;

-- ------------------------------------------------------------
-- EL RESUMEN, AHORA CON LO QUE FALTA PAGAR
--
-- Cambia una sola cosa en el número grande: `disponible` ahora también
-- descuenta los gastos fijos que todavía no se pagaron en este ciclo.
-- ------------------------------------------------------------
create or replace function public.resumen_personal(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_c            record;
  v_zona         text;
  v_hoy          date;
  v_entro        numeric := 0;
  v_salio        numeric := 0;
  v_cuotas       numeric := 0;
  v_fijos_falta  numeric := 0;
  v_dias         integer;
  v_plan         jsonb;
  v_sin_planear  numeric := 0;
  v_entradas     jsonb;
  v_salidas      jsonb;
  v_esperado     numeric := 0;
  v_fijo_mes     numeric := 0;
  v_hubo_ingreso boolean := false;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a esta cuenta.' using errcode = '42501';
  end if;

  select zona_horaria into v_zona from public.empresas where id = p_empresa;
  v_hoy := (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date;

  select * into v_c from public.ciclo_personal(p_empresa);

  select
    coalesce(sum(m.monto) filter (where m.tipo in ('ingreso', 'venta')), 0),
    coalesce(sum(m.monto) filter (where m.tipo = 'gasto'), 0),
    bool_or(m.tipo in ('ingreso', 'venta'))
  into v_entro, v_salio, v_hubo_ingreso
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.estado = 'activo'
    and m.fecha between v_c.desde and v_c.hasta;

  select coalesce(sum(d.monto_cuota), 0) into v_cuotas
  from public.deudas d
  where d.empresa_id = p_empresa
    and d.activa and d.saldo > 0
    and d.monto_cuota is not null
    and d.vence_el between v_hoy and v_c.hasta;

  -- Lo que falta pagar de los fijos, categoría por categoría. Ver el
  -- comentario de arriba sobre por qué se compara contra lo ya gastado.
  select coalesce(sum(greatest(0, f.total - coalesce(g.gastado, 0))), 0)
  into v_fijos_falta
  from (
    select categoria, sum(importe) as total
    from public.gastos_fijos
    where empresa_id = p_empresa and activo
    group by categoria
  ) f
  left join lateral (
    select sum(m.monto) as gastado
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
      and m.categoria = f.categoria
      and m.fecha between v_c.desde and v_c.hasta
  ) g on true;

  v_dias := greatest(1, (v_c.hasta - v_hoy) + 1);

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'categoria', p.categoria,
      'planeado',  p.importe,
      'gastado',   coalesce(g.total, 0),
      'resta',     p.importe - coalesce(g.total, 0)
    ) order by p.categoria), '[]'::jsonb)
  into v_plan
  from public.presupuesto p
  left join lateral (
    select sum(m.monto) as total
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
      and m.categoria = p.categoria
      and m.fecha between v_c.desde and v_c.hasta
  ) g on true
  where p.empresa_id = p_empresa;

  select coalesce(sum(m.monto), 0) into v_sin_planear
  from public.movimientos m
  where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
    and m.fecha between v_c.desde and v_c.hasta
    and not exists (
      select 1 from public.presupuesto p
      where p.empresa_id = p_empresa and p.categoria = m.categoria);

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'nombre', i.nombre, 'importe', i.importe,
      'dia_del_mes', i.dia_del_mes, 'principal', i.principal
    ) order by i.principal desc, i.importe desc), '[]'::jsonb),
    coalesce(sum(i.importe), 0)
  into v_entradas, v_esperado
  from public.ingresos_fijos i
  where i.empresa_id = p_empresa and i.activo;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'nombre', g.nombre, 'importe', g.importe,
      'categoria', g.categoria, 'dia_del_mes', g.dia_del_mes, 'notas', g.notas
    ) order by g.dia_del_mes nulls last, g.importe desc), '[]'::jsonb),
    coalesce(sum(g.importe), 0)
  into v_salidas, v_fijo_mes
  from public.gastos_fijos g
  where g.empresa_id = p_empresa and g.activo;

  return jsonb_build_object(
    'desde', v_c.desde,
    'hasta', v_c.hasta,
    'dia_cobro', v_c.dia_cobro,
    'dias_restantes', v_dias,
    'entro', v_entro,
    'salio', v_salio,
    'cuotas_por_vencer', v_cuotas,
    'fijos_por_pagar', v_fijos_falta,
    'disponible', v_entro - v_salio - v_cuotas - v_fijos_falta,
    'por_dia', round((v_entro - v_salio - v_cuotas - v_fijos_falta) / v_dias, 2),
    'plan', v_plan,
    'gastado_sin_planear', v_sin_planear,
    'ingresos_fijos', v_entradas,
    'gastos_fijos', v_salidas,
    'esperado', v_esperado,
    'fijo_mensual', v_fijo_mes,
    'cobro_pendiente', v_esperado > 0 and not coalesce(v_hubo_ingreso, false)
  );
end $fn$;

revoke all on function public.resumen_personal(uuid) from public, anon;
grant execute on function public.resumen_personal(uuid) to authenticated;


-- ############################################################
-- ##  026_ahorros_y_entradas.sql
-- ############################################################

-- ORDEN · Migración 026 · Ahorros, y de dónde vino la plata
--
-- Le faltaban dos cosas a la cuenta personal, y una de ellas es la que más
-- define si alguien siente que le va bien: el ahorro.
--
-- POR QUÉ EL AHORRO NO ES UN GASTO
--
-- Era tentador resolverlo con una categoría de gasto llamada «Ahorro»: no
-- costaba nada y ya quedaba descontado de lo disponible. Pero sería mentira
-- en el peor lugar posible. Guardar plata no es gastarla — no se fue a
-- ningún lado, la tenés. Si el reporte de fin de año dijera que gastaste
-- cuatro millones en «Ahorro», la persona vería su mejor mes como el peor.
--
-- Así que el ahorro es una MUDANZA, no una salida: la plata pasa del bolsillo
-- de gastar al bolsillo de guardar. Y por eso sí baja lo disponible —no la
-- podés gastar dos veces— pero no cuenta como gasto en ningún reporte. Un
-- retiro hace el camino inverso y vuelve a estar disponible.
--
-- LO SEGUNDO: DE DÓNDE VINO
--
-- Hasta acá todo ingreso caía en una bolsa sin nombre. Para una persona con
-- sueldo eso pierde la única distinción que le importa: qué parte de lo que
-- entró es su sueldo y qué parte fue extra —horas extra, una changa, haber
-- vendido algo que no usaba—. Es la diferencia entre «gano bien» y «este mes
-- zafé».

-- ============================================================
-- 1. LOS FONDOS DE AHORRO
-- ============================================================
create table if not exists public.ahorros (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre     text not null check (char_length(trim(nombre)) between 1 and 60),
  -- Cuánto quiere juntar. Opcional: mucha gente ahorra sin una meta puesta,
  -- y exigirla sería inventarle un número para poder empezar.
  meta       numeric(14,2) check (meta is null or meta > 0),
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ahorros_empresa_idx on public.ahorros (empresa_id) where activo;

-- Cada vez que entra o sale plata del fondo. No se guarda un saldo: se
-- calcula sumando. Un saldo guardado se desincroniza el día que algo falla
-- en el medio, y entonces el número que la persona mira deja de ser cierto.
create table if not exists public.movimientos_ahorro (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  ahorro_id  uuid not null references public.ahorros (id) on delete cascade,
  tipo       text not null check (tipo in ('aporte', 'retiro')),
  monto      numeric(14,2) not null check (monto > 0),
  fecha      date not null default (now() at time zone 'America/Asuncion')::date,
  nota       text not null default '',
  creado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists movimientos_ahorro_idx
  on public.movimientos_ahorro (empresa_id, fecha desc);
create index if not exists movimientos_ahorro_fondo_idx
  on public.movimientos_ahorro (ahorro_id);

alter table public.ahorros            enable row level security;
alter table public.movimientos_ahorro enable row level security;

drop policy if exists ahorros_select on public.ahorros;
create policy ahorros_select on public.ahorros
  for select to authenticated using (public.es_admin(empresa_id));

drop policy if exists movimientos_ahorro_select on public.movimientos_ahorro;
create policy movimientos_ahorro_select on public.movimientos_ahorro
  for select to authenticated using (public.es_admin(empresa_id));

revoke all on public.ahorros            from anon, authenticated;
revoke all on public.movimientos_ahorro from anon, authenticated;
grant select on public.ahorros            to authenticated;
grant select on public.movimientos_ahorro to authenticated;

do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['ahorros', 'movimientos_ahorro'] loop
    execute format('drop trigger if exists %I on public.%I',
                   'cuenta_activa_' || v_tabla, v_tabla);
    execute format(
      'create trigger %I before insert or update on public.%I '
      || 'for each row execute function public.exigir_cuenta_activa()',
      'cuenta_activa_' || v_tabla, v_tabla);
  end loop;
end $$;

create or replace function public.saldo_ahorro(p_ahorro uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select coalesce(sum(case when tipo = 'aporte' then monto else -monto end), 0)
  from public.movimientos_ahorro where ahorro_id = p_ahorro;
$fn$;

revoke all on function public.saldo_ahorro(uuid) from public, anon;
grant execute on function public.saldo_ahorro(uuid) to authenticated;

create or replace function public.guardar_ahorro(
  p_empresa uuid,
  p_nombre  text,
  p_meta    numeric default null,
  p_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre, para saber para qué estás juntando.' using errcode = '22023';
  end if;

  if p_meta is not null and p_meta <= 0 then
    raise exception 'La meta tiene que ser mayor que cero, o dejala vacía.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.ahorros (empresa_id, nombre, meta)
    values (p_empresa, trim(p_nombre), p_meta)
    returning id into v_id;
  else
    update public.ahorros
    set nombre = trim(p_nombre), meta = p_meta, updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese fondo no existe en esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_ahorro(uuid, text, numeric, uuid) from public, anon;
grant execute on function public.guardar_ahorro(uuid, text, numeric, uuid) to authenticated;

-- Un fondo con plata adentro no se borra de un toque. No es burocracia: si
-- se borrara, el registro de esa plata desaparecería y el historial diría que
-- nunca existió. Primero se retira, que además deja el rastro de a dónde fue.
create or replace function public.borrar_ahorro(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_saldo numeric;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  select public.saldo_ahorro(p_id) into v_saldo
  from public.ahorros where id = p_id and empresa_id = p_empresa;

  if v_saldo is null then
    raise exception 'Ese fondo no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  if v_saldo > 0 then
    raise exception 'Ese fondo todavía tiene plata. Retirala primero y después borralo.'
      using errcode = '22023';
  end if;

  delete from public.ahorros where id = p_id and empresa_id = p_empresa;
  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_ahorro(uuid, uuid) from public, anon;
grant execute on function public.borrar_ahorro(uuid, uuid) to authenticated;

create or replace function public.mover_ahorro(
  p_empresa uuid,
  p_ahorro  uuid,
  p_tipo    text,
  p_monto   numeric,
  p_fecha   date default null,
  p_nota    text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo numeric;
  v_zona  text;
  v_id    uuid;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if p_tipo not in ('aporte', 'retiro') then
    raise exception 'Solo se puede guardar o retirar.' using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  select public.saldo_ahorro(a.id) into v_saldo
  from public.ahorros a where a.id = p_ahorro and a.empresa_id = p_empresa;

  if v_saldo is null then
    raise exception 'Ese fondo no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  -- No se puede sacar lo que no hay. Un saldo negativo no significa nada:
  -- nadie tiene menos que cero guardado en una lata.
  if p_tipo = 'retiro' and p_monto > v_saldo then
    raise exception 'Ese fondo tiene menos de lo que querés retirar.' using errcode = '22023';
  end if;

  select zona_horaria into v_zona from public.empresas where id = p_empresa;

  insert into public.movimientos_ahorro (empresa_id, ahorro_id, tipo, monto, fecha, nota, creado_por)
  values (p_empresa, p_ahorro, p_tipo, p_monto,
          coalesce(p_fecha, (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date),
          left(coalesce(p_nota, ''), 200), auth.uid())
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'saldo', v_saldo + case when p_tipo = 'aporte' then p_monto else -p_monto end);
end $fn$;

revoke all on function public.mover_ahorro(uuid, uuid, text, numeric, date, text) from public, anon;
grant execute on function public.mover_ahorro(uuid, uuid, text, numeric, date, text) to authenticated;

create or replace function public.borrar_movimiento_ahorro(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  delete from public.movimientos_ahorro where id = p_id and empresa_id = p_empresa;
  if not found then
    raise exception 'Ese movimiento no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_movimiento_ahorro(uuid, uuid) from public, anon;
grant execute on function public.borrar_movimiento_ahorro(uuid, uuid) to authenticated;

-- ============================================================
-- 2. DE DÓNDE VINO LA PLATA
--
--    Para un negocio, un ingreso es un ingreso. Para una persona con sueldo,
--    la distinción entre «esto es lo que gano todos los meses» y «esto fue
--    de una» es la más importante que hay: es la diferencia entre gano bien
--    y este mes zafé.
-- ============================================================
create or replace function public.categorias_de_ingreso(p_tipo_cuenta text default 'emprendedor')
returns jsonb language sql immutable set search_path = public as $fn$
  select case when coalesce(p_tipo_cuenta, 'emprendedor') = 'personal' then jsonb_build_array(
      jsonb_build_object('nombre','Sueldo','pistas','sueldo, salario, quincena, me pagaron el mes'),
      jsonb_build_object('nombre','Extra','pistas','horas extra, bonificación, comisión, aguinaldo, propina'),
      jsonb_build_object('nombre','Changa','pistas','trabajo aparte, freelance, un servicio suelto'),
      jsonb_build_object('nombre','Vendí algo','pistas','vendí, revendí, me compraron algo mío'),
      jsonb_build_object('nombre','Me devolvieron','pistas','devolución, reintegro, me pagaron lo que le presté'),
      jsonb_build_object('nombre','Regalo o ayuda','pistas','me regalaron, me ayudaron, me mandaron plata'),
      jsonb_build_object('nombre','Otros ingresos','pistas',''))
    else jsonb_build_array(
      jsonb_build_object('nombre','Ventas','pistas','lo que entra por vender'),
      jsonb_build_object('nombre','Aporte de capital','pistas','plata que puso el dueño'),
      jsonb_build_object('nombre','Devolución','pistas','reintegro, nota de crédito'),
      jsonb_build_object('nombre','Otros ingresos','pistas',''))
  end;
$fn$;

revoke all on function public.categorias_de_ingreso(text) from public, anon;
grant execute on function public.categorias_de_ingreso(text) to anon, authenticated;

-- ============================================================
-- 3. EL RESUMEN, CON EL AHORRO Y EL DESGLOSE
--
--    `disponible` ahora también descuenta lo que se guardó en este ciclo.
--    No porque se haya gastado —no se gastó— sino porque ya no está para
--    gastar. Un retiro va al revés y vuelve a sumar.
-- ============================================================
create or replace function public.resumen_personal(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_c            record;
  v_zona         text;
  v_hoy          date;
  v_entro        numeric := 0;
  v_salio        numeric := 0;
  v_cuotas       numeric := 0;
  v_fijos_falta  numeric := 0;
  v_ahorro_ciclo numeric := 0;
  v_ahorro_total numeric := 0;
  v_dias         integer;
  v_plan         jsonb;
  v_sin_planear  numeric := 0;
  v_entradas     jsonb;
  v_salidas      jsonb;
  v_fondos       jsonb;
  v_de_donde     jsonb;
  v_esperado     numeric := 0;
  v_fijo_mes     numeric := 0;
  v_hubo_ingreso boolean := false;
  v_disponible   numeric;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a esta cuenta.' using errcode = '42501';
  end if;

  select zona_horaria into v_zona from public.empresas where id = p_empresa;
  v_hoy := (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date;

  select * into v_c from public.ciclo_personal(p_empresa);

  select
    coalesce(sum(m.monto) filter (where m.tipo in ('ingreso', 'venta')), 0),
    coalesce(sum(m.monto) filter (where m.tipo = 'gasto'), 0),
    bool_or(m.tipo in ('ingreso', 'venta'))
  into v_entro, v_salio, v_hubo_ingreso
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.estado = 'activo'
    and m.fecha between v_c.desde and v_c.hasta;

  select coalesce(sum(d.monto_cuota), 0) into v_cuotas
  from public.deudas d
  where d.empresa_id = p_empresa
    and d.activa and d.saldo > 0
    and d.monto_cuota is not null
    and d.vence_el between v_hoy and v_c.hasta;

  select coalesce(sum(greatest(0, f.total - coalesce(g.gastado, 0))), 0)
  into v_fijos_falta
  from (
    select categoria, sum(importe) as total
    from public.gastos_fijos
    where empresa_id = p_empresa and activo
    group by categoria
  ) f
  left join lateral (
    select sum(m.monto) as gastado
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
      and m.categoria = f.categoria
      and m.fecha between v_c.desde and v_c.hasta
  ) g on true;

  -- Lo guardado en ESTE ciclo, neto de retiros.
  select coalesce(sum(case when ma.tipo = 'aporte' then ma.monto else -ma.monto end), 0)
  into v_ahorro_ciclo
  from public.movimientos_ahorro ma
  where ma.empresa_id = p_empresa and ma.fecha between v_c.desde and v_c.hasta;

  -- Y lo acumulado de siempre, que es el número del que la gente se
  -- enorgullece.
  select coalesce(sum(case when ma.tipo = 'aporte' then ma.monto else -ma.monto end), 0)
  into v_ahorro_total
  from public.movimientos_ahorro ma
  where ma.empresa_id = p_empresa;

  v_dias := greatest(1, (v_c.hasta - v_hoy) + 1);
  v_disponible := v_entro - v_salio - v_cuotas - v_fijos_falta - v_ahorro_ciclo;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'categoria', p.categoria,
      'planeado',  p.importe,
      'gastado',   coalesce(g.total, 0),
      'resta',     p.importe - coalesce(g.total, 0)
    ) order by p.categoria), '[]'::jsonb)
  into v_plan
  from public.presupuesto p
  left join lateral (
    select sum(m.monto) as total
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
      and m.categoria = p.categoria
      and m.fecha between v_c.desde and v_c.hasta
  ) g on true
  where p.empresa_id = p_empresa;

  select coalesce(sum(m.monto), 0) into v_sin_planear
  from public.movimientos m
  where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
    and m.fecha between v_c.desde and v_c.hasta
    and not exists (
      select 1 from public.presupuesto p
      where p.empresa_id = p_empresa and p.categoria = m.categoria);

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'nombre', i.nombre, 'importe', i.importe,
      'dia_del_mes', i.dia_del_mes, 'principal', i.principal
    ) order by i.principal desc, i.importe desc), '[]'::jsonb),
    coalesce(sum(i.importe), 0)
  into v_entradas, v_esperado
  from public.ingresos_fijos i
  where i.empresa_id = p_empresa and i.activo;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'nombre', g.nombre, 'importe', g.importe,
      'categoria', g.categoria, 'dia_del_mes', g.dia_del_mes, 'notas', g.notas
    ) order by g.dia_del_mes nulls last, g.importe desc), '[]'::jsonb),
    coalesce(sum(g.importe), 0)
  into v_salidas, v_fijo_mes
  from public.gastos_fijos g
  where g.empresa_id = p_empresa and g.activo;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'nombre', a.nombre, 'meta', a.meta,
    'saldo', public.saldo_ahorro(a.id)
  ) order by a.created_at), '[]'::jsonb)
  into v_fondos
  from public.ahorros a
  where a.empresa_id = p_empresa and a.activo;

  -- De dónde vino lo que entró en el ciclo.
  select coalesce(jsonb_agg(x order by (x->>'monto')::numeric desc), '[]'::jsonb)
  into v_de_donde
  from (
    select jsonb_build_object('categoria', m.categoria, 'monto', sum(m.monto)) as x
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo'
      and m.tipo in ('ingreso', 'venta')
      and m.fecha between v_c.desde and v_c.hasta
    group by m.categoria
  ) t;

  return jsonb_build_object(
    'desde', v_c.desde,
    'hasta', v_c.hasta,
    'dia_cobro', v_c.dia_cobro,
    'dias_restantes', v_dias,
    'entro', v_entro,
    'salio', v_salio,
    'cuotas_por_vencer', v_cuotas,
    'fijos_por_pagar', v_fijos_falta,
    'ahorrado_en_el_ciclo', v_ahorro_ciclo,
    'ahorro_total', v_ahorro_total,
    'disponible', v_disponible,
    'por_dia', round(v_disponible / v_dias, 2),
    'plan', v_plan,
    'gastado_sin_planear', v_sin_planear,
    'ingresos_fijos', v_entradas,
    'gastos_fijos', v_salidas,
    'ahorros', v_fondos,
    'de_donde_vino', v_de_donde,
    'esperado', v_esperado,
    'fijo_mensual', v_fijo_mes,
    'cobro_pendiente', v_esperado > 0 and not coalesce(v_hubo_ingreso, false)
  );
end $fn$;

revoke all on function public.resumen_personal(uuid) from public, anon;
grant execute on function public.resumen_personal(uuid) to authenticated;


-- ############################################################
-- ##  027_categorias_propias.sql
-- ############################################################

-- ORDEN · Migración 027 · Cada uno nombra sus gastos como los entiende
--
-- Las categorías venían fijas: doce para una persona, nueve para un comercio,
-- y listo. Funciona para el 80% de los casos y falla justo en el que hace que
-- alguien deje de usar el sistema.
--
-- Alguien tiene un perro y gasta en veterinaria, comida y baño todos los
-- meses. Hoy eso cae en «Otros». Al tercer mes su presupuesto tiene una
-- bolsa llamada «Otros» con la mitad de su plata adentro, que es exactamente
-- lo que vino a evitar. Otro paga la cuota del club, otro manda plata a la
-- familia, otro tiene un auto y quiere separar nafta de mantenimiento.
--
-- Cada persona entiende su plata a su manera, y un sistema que la obliga a
-- usar los casilleros de otro deja de ser suyo.
--
-- LO QUE HACE QUE ESTO SIRVA DE VERDAD
--
-- Que la categoría propia también la conozca la IA. Si alguien crea
-- «Mascotas» pero al dictar «compré comida para el perro» el modelo sigue
-- clasificando en «Otros», la categoría nueva es un adorno: nunca se llena
-- sola y hay que corregir a mano cada vez. Por eso se guardan PISTAS, igual
-- que las categorías fijas, y por eso todo pasa por una sola función que
-- devuelve las fijas y las propias juntas.

create table if not exists public.categorias_propias (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre     text not null check (char_length(trim(nombre)) between 1 and 40),
  -- Las de gasto y las de ingreso son listas distintas: «Sueldo» no es un
  -- lugar donde gastar, y «Mascotas» no es de dónde viene la plata.
  clase      text not null default 'gasto' check (clase in ('gasto', 'ingreso')),
  -- Palabras que hacen que la IA sepa cuándo usarla. Sin esto la categoría
  -- existe pero nunca se llena sola.
  pistas     text not null default '',
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categorias_propias_unica
  on public.categorias_propias (empresa_id, clase, lower(trim(nombre)))
  where activo;

alter table public.categorias_propias enable row level security;

-- Se LEEN con es_miembro y no con es_admin: un vendedor carga gastos, y para
-- clasificarlos necesita ver los nombres. Son etiquetas, no plata.
drop policy if exists categorias_propias_select on public.categorias_propias;
create policy categorias_propias_select on public.categorias_propias
  for select to authenticated using (public.es_miembro(empresa_id));

revoke all on public.categorias_propias from anon, authenticated;
grant select on public.categorias_propias to authenticated;

do $$ begin
  execute 'drop trigger if exists cuenta_activa_categorias_propias on public.categorias_propias';
  execute 'create trigger cuenta_activa_categorias_propias before insert or update '
       || 'on public.categorias_propias for each row execute function public.exigir_cuenta_activa()';
end $$;

-- ------------------------------------------------------------
-- LA LISTA COMPLETA, EN UN SOLO LUGAR
--
-- Las fijas de esta cuenta más las propias. Todo lo que ofrece una pantalla
-- y todo lo que conoce la IA sale de acá. Que fueran dos fuentes distintas
-- es cómo se llegó a que el prompt clasificara en «Salidas» mientras el
-- presupuesto ofrecía «Ocio», y el gasto quedara fuera de la cuenta que la
-- persona había hecho.
-- ------------------------------------------------------------
create or replace function public.categorias_de_empresa(
  p_empresa uuid,
  p_clase   text default 'gasto'
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_rubro  text;
  v_tipo   text;
  v_fijas  jsonb;
  v_mias   jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No tenés acceso a esta cuenta.' using errcode = '42501';
  end if;

  select rubro, tipo_cuenta into v_rubro, v_tipo
  from public.empresas where id = p_empresa;

  v_fijas := case
    when p_clase = 'ingreso' then public.categorias_de_ingreso(v_tipo)
    else public.categorias_de_rubro(v_rubro, v_tipo) end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nombre', c.nombre, 'pistas', c.pistas, 'propia', true
         ) order by c.nombre), '[]'::jsonb)
  into v_mias
  from public.categorias_propias c
  where c.empresa_id = p_empresa and c.activo
    and c.clase = case when p_clase = 'ingreso' then 'ingreso' else 'gasto' end;

  -- Las propias van ANTES de «Otros», que siempre cierra la lista: una
  -- categoría nueva escondida debajo del cajón de sastre no se usa nunca.
  return (
    select coalesce(jsonb_agg(x order by orden, i), '[]'::jsonb)
    from (
      select value as x,
             case when value->>'nombre' ilike 'otro%' then 2 else 0 end as orden,
             ordinality as i
      from jsonb_array_elements(v_fijas) with ordinality
      union all
      select value, 1, 0 from jsonb_array_elements(v_mias)
    ) t
  );
end $fn$;

revoke all on function public.categorias_de_empresa(uuid, text) from public, anon;
grant execute on function public.categorias_de_empresa(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- CREARLAS Y BORRARLAS
--
-- Solo la administración. Un vendedor que pudiera inventar categorías estaría
-- reescribiendo el presupuesto del dueño sin querer.
-- ------------------------------------------------------------
create or replace function public.guardar_categoria_propia(
  p_empresa uuid,
  p_nombre  text,
  p_clase   text default 'gasto',
  p_pistas  text default '',
  p_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_clase  text;
  v_nombre text;
  v_rubro  text;
  v_tipo   text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  v_nombre := trim(coalesce(p_nombre, ''));
  if char_length(v_nombre) = 0 then
    raise exception 'Escribí un nombre para la categoría.' using errcode = '22023';
  end if;
  if char_length(v_nombre) > 40 then
    raise exception 'Ese nombre es muy largo. Con 40 letras alcanza.' using errcode = '22023';
  end if;

  v_clase := case when p_clase = 'ingreso' then 'ingreso' else 'gasto' end;

  select rubro, tipo_cuenta into v_rubro, v_tipo from public.empresas where id = p_empresa;

  -- Que no repita una que ya viene de fábrica: quedarían dos renglones con
  -- el mismo nombre en el mismo menú y ninguno sabría cuál es cuál.
  if exists (
    select 1 from jsonb_array_elements(
      case when v_clase = 'ingreso'
        then public.categorias_de_ingreso(v_tipo)
        else public.categorias_de_rubro(v_rubro, v_tipo) end) f
    where lower(trim(f.value->>'nombre')) = lower(v_nombre)
  ) then
    raise exception 'Esa categoría ya existe.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.categorias_propias (empresa_id, nombre, clase, pistas)
    values (p_empresa, v_nombre, v_clase, left(coalesce(p_pistas, ''), 200))
    returning id into v_id;
  else
    update public.categorias_propias
    set nombre = v_nombre, clase = v_clase,
        pistas = left(coalesce(p_pistas, ''), 200), updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa categoría no existe en esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Esa categoría ya existe.' using errcode = '22023';
end $fn$;

revoke all on function public.guardar_categoria_propia(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.guardar_categoria_propia(uuid, text, text, text, uuid) to authenticated;

-- Borrar la categoría NO toca los movimientos que ya la usaron. Quedan con
-- su nombre escrito, que es lo correcto: el gasto de marzo fue en Mascotas
-- aunque hoy esa categoría ya no se ofrezca.
create or replace function public.borrar_categoria_propia(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_nombre text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  delete from public.categorias_propias
  where id = p_id and empresa_id = p_empresa
  returning nombre into v_nombre;

  if v_nombre is null then
    raise exception 'Esa categoría no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  -- Si tenía presupuesto asignado, se va con ella: un límite para una
  -- categoría que ya no existe es un renglón que no se puede tocar.
  delete from public.presupuesto
  where empresa_id = p_empresa and categoria = v_nombre;

  return jsonb_build_object('borrada', true, 'nombre', v_nombre);
end $fn$;

revoke all on function public.borrar_categoria_propia(uuid, uuid) from public, anon;
grant execute on function public.borrar_categoria_propia(uuid, uuid) to authenticated;


-- ############################################################
-- ##  028_ingresos_por_categoria.sql
-- ############################################################

-- ORDEN · Migración 028 · De dónde vino la plata, en el período que elijas
--
-- `gastos_por_categoria` existe desde la 005 y contesta «en qué se me fue».
-- Para un comercio con eso alcanza: casi todo lo que entra es una venta, y el
-- desglose de ingresos no dice nada.
--
-- Para una persona con sueldo es al revés. Saber que este mes entraron
-- 2.350.000 no sirve de mucho; saber que 1.850.000 fue el sueldo y 500.000
-- fueron horas extra y una changa sí, porque una parte se repite el mes que
-- viene y la otra no. Es la diferencia entre gano bien y este mes zafé.
--
-- Espejo exacto de `gastos_por_categoria`: misma forma de respuesta, mismos
-- controles, mismo orden. Solo cambia el tipo de movimiento que mira.

create or replace function public.ingresos_por_categoria(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  return query
  with porCategoria as (
    select
      trim(coalesce(nullif(trim(m.categoria), ''), 'General')) as nombre,
      sum(m.monto)::numeric as monto,
      count(*)::bigint      as operaciones
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      -- Ventas e ingresos juntos: para quien mira esto, todo lo que entró es
      -- lo que entró. La distinción venta/ingreso es interna.
      and m.tipo in ('venta', 'ingreso')
    group by 1
  ),
  con_total as (
    select c.*, sum(c.monto) over () as total from porCategoria c
  )
  select jsonb_build_object(
    'nombre',        c.nombre,
    'monto',         c.monto,
    'operaciones',   c.operaciones,
    'participacion', case when c.total > 0 then (c.monto / c.total) * 100 else 0 end
  )
  from con_total c
  order by c.monto desc;
end $$;

revoke all on function public.ingresos_por_categoria(uuid, date, date) from public, anon;
grant execute on function public.ingresos_por_categoria(uuid, date, date) to authenticated;


-- ############################################################
-- ##  029_meta_con_fecha.sql
-- ############################################################

-- ORDEN · Migración 029 · El ahorro con fecha
--
-- La 026 le puso META a los fondos: cuánto quiere juntar. Faltaba la mitad
-- de la pregunta, y es la mitad que hace que alguien ahorre de verdad.
--
-- «Quiero juntar 5.000.000» no le dice a nadie qué hacer este mes. «Quiero
-- juntar 5.000.000 para el viaje de fin de año» sí: son once meses, faltan
-- 3.800.000, o sea 345.000 por mes. Ese número —cuánto tengo que guardar
-- ahora— es el único que cambia una conducta. Una meta sin fecha es un deseo;
-- con fecha es un plan.
--
-- POR QUÉ LA FECHA ES OPCIONAL, IGUAL QUE LA META
--
-- Mucha gente ahorra sin fecha —el fondo de emergencia no vence nunca— y
-- exigirle una la obligaría a inventar un dato falso para poder empezar. Los
-- dos campos son independientes: se puede tener meta sin fecha (junto hasta
-- llegar), fecha sin meta (guardo para diciembre, lo que pueda), las dos, o
-- ninguna.
--
-- EL RITMO LO CALCULA LA BASE, NO LA PANTALLA
--
-- `por_mes` sale de acá y no del navegador por el mismo motivo que todo lo
-- demás: es un número sobre la plata de alguien. Si lo calculara la pantalla,
-- el día que ese cálculo aparezca también en un email o en un aviso habría
-- dos fórmulas para la misma respuesta, y tarde o temprano dirían cosas
-- distintas.

-- ============================================================
-- 1. LA COLUMNA
-- ============================================================
alter table public.ahorros add column if not exists fecha_limite date;

comment on column public.ahorros.fecha_limite is
  'Para cuándo quiere tener juntada la meta. Null = sin fecha, se junta hasta llegar.';

-- ============================================================
-- 2. GUARDAR
--
--    Se REEMPLAZA la función de cuatro argumentos en vez de dejar las dos
--    conviviendo: dos versiones de la misma puerta es cómo se llega a que la
--    pantalla guarde la fecha y otra cosa la pise con null.
-- ============================================================
drop function if exists public.guardar_ahorro(uuid, text, numeric, uuid);

create or replace function public.guardar_ahorro(
  p_empresa      uuid,
  p_nombre       text,
  p_meta         numeric default null,
  p_fecha_limite date    default null,
  p_id           uuid    default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id       uuid;
  v_zona     text;
  v_hoy      date;
  v_anterior date;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre, para saber para qué estás juntando.' using errcode = '22023';
  end if;

  if p_meta is not null and p_meta <= 0 then
    raise exception 'La meta tiene que ser mayor que cero, o dejala vacía.' using errcode = '22023';
  end if;

  select zona_horaria into v_zona from public.empresas where id = p_empresa;
  v_hoy := (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date;

  -- Una fecha que ya pasó casi siempre es un año mal tipeado. Se rechaza al
  -- ponerla, pero NO se rechaza guardar un fondo cuya fecha venció mientras
  -- tanto: si no, el día después del viaje la persona no podría ni corregirle
  -- el nombre a su propio fondo.
  if p_id is not null then
    select fecha_limite into v_anterior
    from public.ahorros where id = p_id and empresa_id = p_empresa;
  end if;

  if p_fecha_limite is not null
     and p_fecha_limite < v_hoy
     and p_fecha_limite is distinct from v_anterior then
    raise exception 'Esa fecha ya pasó. Poné para cuándo lo querés juntar.' using errcode = '22007';
  end if;

  if p_id is null then
    insert into public.ahorros (empresa_id, nombre, meta, fecha_limite)
    values (p_empresa, trim(p_nombre), p_meta, p_fecha_limite)
    returning id into v_id;
  else
    update public.ahorros
    set nombre = trim(p_nombre), meta = p_meta, fecha_limite = p_fecha_limite,
        updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese fondo no existe en esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_ahorro(uuid, text, numeric, date, uuid) from public, anon;
grant execute on function public.guardar_ahorro(uuid, text, numeric, date, uuid) to authenticated;

-- ============================================================
-- 3. EL RESUMEN, CON EL RITMO DE CADA FONDO
--
--    Se reescribe entera (la última versión venía de la 026) porque en
--    PostgreSQL no se puede parchear el cuerpo de una función: o se
--    reemplaza completa o queda la vieja.
-- ============================================================
create or replace function public.resumen_personal(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_c            record;
  v_zona         text;
  v_hoy          date;
  v_entro        numeric := 0;
  v_salio        numeric := 0;
  v_cuotas       numeric := 0;
  v_fijos_falta  numeric := 0;
  v_ahorro_ciclo numeric := 0;
  v_ahorro_total numeric := 0;
  v_dias         integer;
  v_plan         jsonb;
  v_sin_planear  numeric := 0;
  v_entradas     jsonb;
  v_salidas      jsonb;
  v_fondos       jsonb;
  v_de_donde     jsonb;
  v_esperado     numeric := 0;
  v_fijo_mes     numeric := 0;
  v_hubo_ingreso boolean := false;
  v_disponible   numeric;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a esta cuenta.' using errcode = '42501';
  end if;

  select zona_horaria into v_zona from public.empresas where id = p_empresa;
  v_hoy := (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date;

  select * into v_c from public.ciclo_personal(p_empresa);

  select
    coalesce(sum(m.monto) filter (where m.tipo in ('ingreso', 'venta')), 0),
    coalesce(sum(m.monto) filter (where m.tipo = 'gasto'), 0),
    bool_or(m.tipo in ('ingreso', 'venta'))
  into v_entro, v_salio, v_hubo_ingreso
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.estado = 'activo'
    and m.fecha between v_c.desde and v_c.hasta;

  select coalesce(sum(d.monto_cuota), 0) into v_cuotas
  from public.deudas d
  where d.empresa_id = p_empresa
    and d.activa and d.saldo > 0
    and d.monto_cuota is not null
    and d.vence_el between v_hoy and v_c.hasta;

  select coalesce(sum(greatest(0, f.total - coalesce(g.gastado, 0))), 0)
  into v_fijos_falta
  from (
    select categoria, sum(importe) as total
    from public.gastos_fijos
    where empresa_id = p_empresa and activo
    group by categoria
  ) f
  left join lateral (
    select sum(m.monto) as gastado
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
      and m.categoria = f.categoria
      and m.fecha between v_c.desde and v_c.hasta
  ) g on true;

  -- Lo guardado en ESTE ciclo, neto de retiros.
  select coalesce(sum(case when ma.tipo = 'aporte' then ma.monto else -ma.monto end), 0)
  into v_ahorro_ciclo
  from public.movimientos_ahorro ma
  where ma.empresa_id = p_empresa and ma.fecha between v_c.desde and v_c.hasta;

  -- Y lo acumulado de siempre, que es el número del que la gente se
  -- enorgullece.
  select coalesce(sum(case when ma.tipo = 'aporte' then ma.monto else -ma.monto end), 0)
  into v_ahorro_total
  from public.movimientos_ahorro ma
  where ma.empresa_id = p_empresa;

  v_dias := greatest(1, (v_c.hasta - v_hoy) + 1);
  v_disponible := v_entro - v_salio - v_cuotas - v_fijos_falta - v_ahorro_ciclo;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'categoria', p.categoria,
      'planeado',  p.importe,
      'gastado',   coalesce(g.total, 0),
      'resta',     p.importe - coalesce(g.total, 0)
    ) order by p.categoria), '[]'::jsonb)
  into v_plan
  from public.presupuesto p
  left join lateral (
    select sum(m.monto) as total
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
      and m.categoria = p.categoria
      and m.fecha between v_c.desde and v_c.hasta
  ) g on true
  where p.empresa_id = p_empresa;

  select coalesce(sum(m.monto), 0) into v_sin_planear
  from public.movimientos m
  where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
    and m.fecha between v_c.desde and v_c.hasta
    and not exists (
      select 1 from public.presupuesto p
      where p.empresa_id = p_empresa and p.categoria = m.categoria);

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'nombre', i.nombre, 'importe', i.importe,
      'dia_del_mes', i.dia_del_mes, 'principal', i.principal
    ) order by i.principal desc, i.importe desc), '[]'::jsonb),
    coalesce(sum(i.importe), 0)
  into v_entradas, v_esperado
  from public.ingresos_fijos i
  where i.empresa_id = p_empresa and i.activo;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'nombre', g.nombre, 'importe', g.importe,
      'categoria', g.categoria, 'dia_del_mes', g.dia_del_mes, 'notas', g.notas
    ) order by g.dia_del_mes nulls last, g.importe desc), '[]'::jsonb),
    coalesce(sum(g.importe), 0)
  into v_salidas, v_fijo_mes
  from public.gastos_fijos g
  where g.empresa_id = p_empresa and g.activo;

  -- Cada fondo con su ritmo: cuánto falta y cuánto habría que guardar por
  -- mes para llegar a tiempo. `por_mes` en null significa que no hay ritmo
  -- que calcular, y son tres casos distintos que la pantalla distingue por
  -- los otros campos: sin meta, sin fecha, o con la fecha ya vencida.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'nombre', a.nombre, 'meta', a.meta,
    'fecha_limite', a.fecha_limite,
    'saldo', s.saldo,
    'falta', case when a.meta is null then null
                  else greatest(0, a.meta - s.saldo) end,
    'dias_para_limite', case when a.fecha_limite is null then null
                             else (a.fecha_limite - v_hoy) end,
    'por_mes', case
                 when a.meta is null or a.fecha_limite is null then null
                 when a.meta - s.saldo <= 0 then 0
                 when a.fecha_limite < v_hoy then null
                 -- Los meses se redondean para arriba y nunca bajan de uno:
                 -- si faltan diez días, el ritmo es todo lo que falta.
                 else round((a.meta - s.saldo)
                            / greatest(1, ceil((a.fecha_limite - v_hoy)::numeric / 30)), 2)
               end
  ) order by a.created_at), '[]'::jsonb)
  into v_fondos
  from public.ahorros a
  cross join lateral (select public.saldo_ahorro(a.id) as saldo) s
  where a.empresa_id = p_empresa and a.activo;

  -- De dónde vino lo que entró en el ciclo.
  select coalesce(jsonb_agg(x order by (x->>'monto')::numeric desc), '[]'::jsonb)
  into v_de_donde
  from (
    select jsonb_build_object('categoria', m.categoria, 'monto', sum(m.monto)) as x
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo'
      and m.tipo in ('ingreso', 'venta')
      and m.fecha between v_c.desde and v_c.hasta
    group by m.categoria
  ) t;

  return jsonb_build_object(
    'desde', v_c.desde,
    'hasta', v_c.hasta,
    'dia_cobro', v_c.dia_cobro,
    'dias_restantes', v_dias,
    'entro', v_entro,
    'salio', v_salio,
    'cuotas_por_vencer', v_cuotas,
    'fijos_por_pagar', v_fijos_falta,
    'ahorrado_en_el_ciclo', v_ahorro_ciclo,
    'ahorro_total', v_ahorro_total,
    'disponible', v_disponible,
    'por_dia', round(v_disponible / v_dias, 2),
    'plan', v_plan,
    'gastado_sin_planear', v_sin_planear,
    'ingresos_fijos', v_entradas,
    'gastos_fijos', v_salidas,
    'ahorros', v_fondos,
    'de_donde_vino', v_de_donde,
    'esperado', v_esperado,
    'fijo_mensual', v_fijo_mes,
    'cobro_pendiente', v_esperado > 0 and not coalesce(v_hubo_ingreso, false)
  );
end $fn$;

revoke all on function public.resumen_personal(uuid) from public, anon;
grant execute on function public.resumen_personal(uuid) to authenticated;


-- ############################################################
-- ##  030_ahorro_del_periodo.sql
-- ############################################################

-- ORDEN · Migración 030 · El ahorro dentro de un período elegido
--
-- `resumen_personal` ya cuenta el ahorro, pero siempre del CICLO en curso: de
-- cobro a cobro. El reporte y el Excel trabajan con otro recorte —el rango de
-- fechas que la persona elige— y ahí ese número no sirve.
--
-- Mezclar los dos sería el peor error posible en una planilla: mostrar «entró
-- y salió» de enero a marzo junto a un ahorro que en realidad es el de los
-- últimos veinte días. Dos períodos distintos en la misma hoja, sin que nada
-- lo diga.
--
-- POR QUÉ ES UNA FUNCIÓN Y NO UNA CONSULTA DESDE EL SERVIDOR
--
-- Por lo mismo que los otros agregados: sumar en el servidor obliga a traerse
-- las filas, y una lista traída puede venir recortada por el tope de la Data
-- API sin avisar. Un total que se calcula sobre una lista incompleta no se
-- ve mal: se ve como un total más chico. Sumar acá adentro no puede recortar.

create or replace function public.resumen_ahorro_periodo(
  p_empresa uuid,
  p_desde   date,
  p_hasta   date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_aportado numeric := 0;
  v_retirado numeric := 0;
  v_fondos   jsonb;
begin
  -- Se lee con `es_admin` y no con `es_miembro`, igual que las tablas de
  -- ahorro desde la 026: cuánto guarda alguien no lo ve un vendedor.
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a esta cuenta.' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select
    coalesce(sum(ma.monto) filter (where ma.tipo = 'aporte'), 0),
    coalesce(sum(ma.monto) filter (where ma.tipo = 'retiro'), 0)
  into v_aportado, v_retirado
  from public.movimientos_ahorro ma
  where ma.empresa_id = p_empresa
    and ma.fecha between p_desde and p_hasta;

  -- Solo los fondos que se movieron en el período. Listar los quietos en cero
  -- alargaría la hoja sin decir nada: que un fondo no se haya tocado en marzo
  -- no es información, es ruido.
  select coalesce(jsonb_agg(x order by (x->>'neto')::numeric desc), '[]'::jsonb)
  into v_fondos
  from (
    select jsonb_build_object(
      'nombre',   a.nombre,
      'aportado', coalesce(sum(ma.monto) filter (where ma.tipo = 'aporte'), 0),
      'retirado', coalesce(sum(ma.monto) filter (where ma.tipo = 'retiro'), 0),
      'neto',     coalesce(sum(case when ma.tipo = 'aporte' then ma.monto else -ma.monto end), 0),
      -- El saldo del fondo a hoy, que es de otro recorte y por eso va con su
      -- propio nombre: la hoja lo rotula aparte para que nadie lo sume con
      -- las columnas del período.
      'saldo_hoy', public.saldo_ahorro(a.id)
    ) as x
    from public.movimientos_ahorro ma
    join public.ahorros a on a.id = ma.ahorro_id
    where ma.empresa_id = p_empresa
      and ma.fecha between p_desde and p_hasta
    group by a.id, a.nombre
  ) t;

  return jsonb_build_object(
    'aportado', v_aportado,
    'retirado', v_retirado,
    'neto',     v_aportado - v_retirado,
    'por_fondo', v_fondos
  );
end $fn$;

revoke all on function public.resumen_ahorro_periodo(uuid, date, date) from public, anon;
grant execute on function public.resumen_ahorro_periodo(uuid, date, date) to authenticated;


-- ############################################################
-- ##  031_aviso_para_personas.sql
-- ############################################################

-- ORDEN · Migración 031 · El recordatorio también es para una persona
--
-- La 024 sacó a las cuentas personales del recordatorio de la noche, y el
-- motivo era bueno: una persona con sueldo no cierra el día. Su ciclo va de
-- cobro a cobro, y decirle «cerrá el día» era hablarle en el idioma de un
-- almacén.
--
-- Pero la conclusión se pasó de largo. Que no cierre el día no quiere decir
-- que no necesite que le recuerden cargar. Es al revés: el gasto de una
-- persona es el que más fácil se olvida —son montos chicos, muchos por día, y
-- ninguno tiene factura que lo recuerde— y si no los carga, en dos semanas la
-- app le miente sobre cuánto le queda. Una cuenta sin datos no es una cuenta
-- prolija: es una cuenta que no sirve.
--
-- Así que vuelve al recordatorio, pero con las mismas dos condiciones que
-- protegen a todos los demás:
--
--   · SOLO A QUIEN YA TIENE EL HÁBITO. Hacen falta dos días seguidos de
--     carga. A quien todavía no lo tiene, un aviso no se lo crea: lo único
--     que logra es enseñarle a ignorar nuestras notificaciones.
--
--   · UNO POR DÍA COMO MÁXIMO. Lo garantiza la tabla `envios`, que no se
--     toca acá.
--
-- Lo que cambia en la respuesta es que ahora dice QUÉ TIPO DE CUENTA es cada
-- una, porque el aviso de una persona no puede llevarla a la pantalla de
-- cierre del día: esa pantalla no existe en su cuenta.
--
-- OJO CON `rubro_cierra_el_dia`: NO SE TOCA
--
-- Esa función contesta otra pregunta —¿esta cuenta ve la pantalla de cierre?—
-- y la respuesta para una persona sigue siendo que no. Meter acá el cambio
-- habría sido más corto y habría hecho aparecer «Cierre del día» en el menú
-- de todas las cuentas personales. Dos preguntas distintas, dos funciones.

create or replace function public.empresas_sin_cargar_hoy(p_racha_minima integer default 2)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id',  e.id,
      'nombre',      e.nombre,
      'zona',        e.zona_horaria,
      'racha',       r.largo,
      -- Para que quien manda el aviso sepa a qué pantalla mandarlo y en qué
      -- idioma hablarle. Sin esto habría que volver a consultar la empresa
      -- una por una desde el servidor.
      'tipo_cuenta', coalesce(e.tipo_cuenta, 'emprendedor')
    ) as x
    from public.empresas e
    join lateral (
      with dias as (
        select distinct m.fecha from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo'
          and m.fecha <= (now() at time zone e.zona_horaria)::date
      ),
      numeradas as (
        select fecha, (fecha - (row_number() over (order by fecha))::int) as isla from dias
      ),
      rachas as (
        select count(*)::int as largo, max(fecha) as hasta from numeradas group by isla
      )
      select largo, hasta from rachas order by hasta desc limit 1
    ) r on true
    where (
        -- Una persona: siempre, porque su ciclo no depende del rubro.
        coalesce(e.tipo_cuenta, 'emprendedor') = 'personal'
        -- Un negocio: solo los de ciclo diario. A un ganadero no se le
        -- recuerda cargar todos los días porque su ciclo es el novillo.
        or public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta)
      )
      and r.hasta = (now() at time zone e.zona_horaria)::date - 1
      and r.largo >= greatest(p_racha_minima, 1)
  ) s;

  return v_res;
end $fn$;

revoke all on function public.empresas_sin_cargar_hoy(integer) from public, anon, authenticated;
grant execute on function public.empresas_sin_cargar_hoy(integer) to service_role;
