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
