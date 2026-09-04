-- ORDEN · Migración 045 · Cómo viene el lote
--
-- La 044 dejó el lote y su enganche. Acá se contesta la única pregunta que
-- importa: cuánta plata le pusiste, cuánta sacaste, y cómo va.
--
-- QUÉ MIDE EL RESULTADO DE UN LOTE
--
-- Plata que entró menos plata que salió, de ese ciclo. Nada más.
--
-- No es el margen contable y es a propósito. En un lote, la compra de los
-- novillos YA es un gasto cargado: contarla otra vez como costo de la venta
-- sería restarla dos veces y mostrarle una pérdida que no existe. Por eso el
-- resultado no toca `costo_total` —el margen del núcleo— y se queda con lo
-- que de verdad pasó por la caja.
--
-- Como efecto, tampoco hace falta esconderle nada a un vendedor: todo lo que
-- se suma acá son montos que la 003 ya le deja ver de a uno. Esconder la
-- suma de números visibles no protege nada, solo estorba a quien carga los
-- gastos. Lo único reservado del núcleo —`costo_total`— no entra en ninguna
-- de estas cuentas.
--
-- LO ANULADO NO CUENTA
--
-- Un gasto anulado no es plata que saliste. Todas las sumas de acá filtran
-- por `estado = 'activo'`, igual que el panel y el cierre.

-- ============================================================
-- 1. LA LISTA
-- ============================================================
create or replace function public.listar_lotes(
  p_empresa           uuid,
  p_incluir_cerrados  boolean default false
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb; v_hoy date;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_hoy := public.hoy_empresa(p_empresa);

  select coalesce(jsonb_agg(x order by x->>'estado', (x->>'abierto_el') desc), '[]'::jsonb)
  into v_res
  from (
    select jsonb_build_object(
      'id',         l.id,
      'nombre',     l.nombre,
      'unidad',     l.unidad,
      'cantidad',   l.cantidad,
      'estado',     l.estado,
      'abierto_el', l.abierto_el,
      'cerrado_el', l.cerrado_el,
      'notas',      l.notas,
      -- Cuánto lleva en curso, o cuánto duró si ya cerró.
      'dias',        (coalesce(l.cerrado_el, v_hoy) - l.abierto_el),
      'movimientos', coalesce(c.movimientos, 0),
      'puesto',      coalesce(c.puesto, 0),
      'cobrado',     coalesce(c.cobrado, 0),
      'resultado',   coalesce(c.cobrado, 0) - coalesce(c.puesto, 0),
      -- Lo que de verdad mira un ganadero: cuánto por cabeza.
      'por_unidad',  case
                       when l.cantidad > 0
                       then round((coalesce(c.cobrado, 0) - coalesce(c.puesto, 0)) / l.cantidad, 2)
                       else null
                     end
    ) as x
    from public.lotes l
    left join lateral (
      select
        count(*)::int as movimientos,
        sum(m.monto) filter (where m.tipo = 'gasto')              as puesto,
        sum(m.monto) filter (where m.tipo in ('venta', 'ingreso')) as cobrado
      from public.movimientos m
      where m.lote_id = l.id and m.estado = 'activo'
    ) c on true
    where l.empresa_id = p_empresa
      and (coalesce(p_incluir_cerrados, false) or l.estado = 'abierto')
  ) s;

  return v_res;
end $fn$;

revoke all on function public.listar_lotes(uuid, boolean) from public, anon;
grant execute on function public.listar_lotes(uuid, boolean) to authenticated;

-- ============================================================
-- 2. UN LOTE, CON TODO LO QUE TIENE ADENTRO
--
--    Los movimientos vienen sin `costo_total`: es la única columna que la
--    003 reserva, y esta función no tiene por qué ser la puerta de atrás que
--    la deja salir.
-- ============================================================
create or replace function public.resumen_lote(p_empresa uuid, p_lote uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lote jsonb; v_movs jsonb; v_hoy date;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_hoy := public.hoy_empresa(p_empresa);

  select jsonb_build_object(
    'id', l.id, 'nombre', l.nombre, 'unidad', l.unidad, 'cantidad', l.cantidad,
    'estado', l.estado, 'abierto_el', l.abierto_el, 'cerrado_el', l.cerrado_el,
    'notas', l.notas,
    'dias', (coalesce(l.cerrado_el, v_hoy) - l.abierto_el)
  ) into v_lote
  from public.lotes l where l.id = p_lote and l.empresa_id = p_empresa;

  if v_lote is null then
    raise exception 'Ese lote no existe.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          m.id,
    'tipo',        m.tipo,
    'estado',      m.estado,
    'fecha',       m.fecha,
    'descripcion', m.descripcion,
    'categoria',   m.categoria,
    'monto',       m.monto
  ) order by m.fecha desc, m.created_at desc), '[]'::jsonb)
  into v_movs
  from public.movimientos m
  where m.lote_id = p_lote and m.empresa_id = p_empresa;

  return v_lote || jsonb_build_object('movimientos', v_movs);
end $fn$;

revoke all on function public.resumen_lote(uuid, uuid) from public, anon;
grant execute on function public.resumen_lote(uuid, uuid) to authenticated;

-- ============================================================
-- 3. LO QUE TODAVÍA NO ES DE NINGÚN LOTE
--
--    Para el que ya venía cargando gastos antes de abrir el lote, que va a
--    ser el caso de todos la primera vez. Sin esto habría que volver a
--    cargar a mano lo que ya está cargado, y nadie lo hace.
--
--    Devuelve solo gastos e ingresos activos del rango: las ventas también
--    pueden ir a un lote, pero se asignan desde la venta misma; mezclar acá
--    la lista entera de ventas del mes haría inusable el desplegable.
-- ============================================================
create or replace function public.movimientos_sin_lote(
  p_empresa uuid,
  p_desde   date,
  p_hasta   date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          m.id,
    'tipo',        m.tipo,
    'fecha',       m.fecha,
    'descripcion', m.descripcion,
    'categoria',   m.categoria,
    'monto',       m.monto
  ) order by m.fecha desc, m.created_at desc), '[]'::jsonb)
  into v_res
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.lote_id is null
    and m.estado = 'activo'
    and m.tipo in ('gasto', 'ingreso')
    and m.fecha between p_desde and p_hasta;

  return v_res;
end $fn$;

revoke all on function public.movimientos_sin_lote(uuid, date, date) from public, anon;
grant execute on function public.movimientos_sin_lote(uuid, date, date) to authenticated;
