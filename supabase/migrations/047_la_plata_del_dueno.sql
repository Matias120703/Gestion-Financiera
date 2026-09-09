-- ============================================================
-- ORDEN · Migración 047 · La plata del dueño no es del vendedor
--
-- EL PROBLEMA, TAL COMO APARECIÓ
--
-- El dueño paga la cuota de su tarjeta desde Deudas. `registrar_pago_deuda`
-- (015) crea, como corresponde, un movimiento de tipo 'gasto' con la
-- descripción «Pago Tarjeta Visa» y categoría «Deudas»: la plata salió, y
-- tiene que salir en los números del negocio.
--
-- Pero después el vendedor abre Gastos y lo lee.
--
-- No es un descuido de una pantalla: es que NADIE preguntaba de quién era el
-- gasto. `movimientos_select` (002) deja ver todo lo de la empresa a todo
-- miembro, y las funciones de lectura son `security definer`, así que ni
-- siquiera pasan por esa política — suman todo y devuelven el total.
--
-- Por eso el arreglo va en los dos lugares. Cerrar solo la política dejaría
-- los totales mal; cerrar solo las funciones dejaría abierta la consulta
-- directa desde el navegador, que es justamente la que no controlamos.
--
-- LA REGLA, EN UNA LÍNEA
--
--   Las ventas son del negocio y las ve todo el mundo.
--   Todo lo demás —gastos y otros ingresos— lo ve su autor, y el admin.
--
-- POR QUÉ TAMBIÉN LOS OTROS INGRESOS
--
-- Porque están en la misma pantalla y son igual de privados. Si el dueño
-- cobra el alquiler de un local, eso entra como 'ingreso' y aparecía en la
-- lista de Gastos junto a los gastos. Tapar una mitad y dejar la otra sería
-- arreglar la captura de pantalla, no el problema.
--
-- POR QUÉ NO SE LE OCULTAN LAS VENTAS
--
-- Un vendedor tiene que ver cómo va el día: es su trabajo, es lo que mide su
-- comisión y es lo que ya veía. Los costos y el margen de esas ventas siguen
-- volviendo en NULL para él, como desde la 003. Acá no se toca nada de eso.
--
-- LO QUE ESTO NO ES
--
-- No es una sección nueva ni una preferencia. No hay ningún interruptor que
-- el dueño pueda apagar por error: si sos vendedor, no está, y punto.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA POLÍTICA
--
--    Primera barrera y la única que protege la consulta directa. Alguien con
--    la clave pública del navegador puede pedir `movimientos` sin pasar por
--    ninguna de nuestras funciones; esto es lo que le contesta.
-- ------------------------------------------------------------
drop policy if exists movimientos_select on public.movimientos;
create policy movimientos_select on public.movimientos
  for select using (
    public.es_miembro(empresa_id)
    and (
      tipo = 'venta'
      or public.es_admin(empresa_id)
      or creado_por = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 2. EL RESUMEN
--
--    De acá salen los indicadores del panel y de Gastos. Es el que mostraba
--    «Gastos del periodo: 15.000.000» a alguien que cargó tres.
--
--    `v_admin` ya existía en esta función para decidir si devuelve los
--    costos. Se reutiliza: una sola idea de «quién ve la plata entera».
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
      -- Acá se cae el gasto del dueño para el vendedor. Va en la CTE y no en
      -- cada `filter` de abajo para que no quede ni un total sin filtrar el
      -- día que se agregue una métrica nueva.
      and (v_admin or m.tipo = 'venta' or m.creado_por = auth.uid())
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
    select coalesce(sum(i.cantidad), 0)::numeric as unidades
    from public.movimiento_items i
    join public.movimientos m on m.id = i.movimiento_id
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
-- 3. LA SERIE DIARIA
--
--    El gráfico del panel. Sin esto, el vendedor no leía el número pero veía
--    la barra roja del día que el dueño pagó la cuota.
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
      and (v_admin or m.tipo = 'venta' or m.creado_por = auth.uid())
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
--
--    Es el que más contaba de una sola mirada: la categoría «Deudas» con el
--    monto al lado, y el nombre de la deuda en la lista de abajo.
--
--    Esta función no calculaba `v_admin` porque no devolvía costos. Ahora lo
--    necesita.
-- ------------------------------------------------------------
create or replace function public.gastos_por_categoria(
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
      and (v_admin or m.creado_por = auth.uid())
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
-- 5. LA PÁGINA DE MOVIMIENTOS
--
--    La lista que se ve abajo de los indicadores, en Gastos y en
--    Movimientos. Es donde se leía «Pago Tarjeta Visa» con nombre y monto.
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
      and (v_admin or m.tipo = 'venta' or m.creado_por = auth.uid())
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
-- 6. LOS DOS CAMINOS QUE NO USA NINGUNA PANTALLA
--
--    `listar_movimientos` y `contar_movimientos` no los llama nadie hoy. Se
--    cierran igual, y por la misma razón que dice el comentario de la 006:
--    mientras existan son un camino que alguien podría tomar. Una puerta que
--    nadie usa sigue siendo una puerta.
--
--    En `contar_movimientos` el efecto es más chico pero real: el conteo le
--    decía cuántos movimientos hay, y de ahí se deduce cuántos no ve.
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

  v_admin := public.es_admin(p_empresa);

  -- El tope se mide sobre lo que esta persona puede ver: si no, a un
  -- vendedor le podría fallar por movimientos que no le vamos a devolver.
  select count(*) into v_total
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.fecha between p_desde and p_hasta
    and (v_admin or m.tipo = 'venta' or m.creado_por = auth.uid());

  if v_total > v_tope then
    raise exception
      'El periodo elegido tiene % movimientos y el máximo por consulta es %. Elegí un rango más corto para que los totales sean exactos.',
      v_total, v_tope
      using errcode = '54000';
  end if;

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
      and (v_admin or m.tipo = 'venta' or m.creado_por = auth.uid())
  ) x;

  return v_res;
end $$;

create or replace function public.contar_movimientos(
  p_empresa uuid,
  p_desde date,
  p_hasta date
)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean;
  v_total bigint;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_admin := public.es_admin(p_empresa);

  select count(*) into v_total
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.fecha between p_desde and p_hasta
    and (v_admin or m.tipo = 'venta' or m.creado_por = auth.uid());

  return v_total;
end $$;
