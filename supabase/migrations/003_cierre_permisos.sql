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
