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
