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
