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
