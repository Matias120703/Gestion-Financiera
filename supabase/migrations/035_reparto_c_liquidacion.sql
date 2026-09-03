-- ORDEN · Migración 035 · El reparto · pagar y mirar
--
-- Lo que el dueño quiere el viernes: cuánto produjo cada uno, cuánto le toca,
-- cuánto ya le pagó y cuánto falta. Y lo que quiere el barbero: lo suyo, sin
-- ver el margen del local ni lo que producen los demás.

-- ============================================================
-- 1. LOS PAGOS AL PROFESIONAL
--
--    Entre el corte y el pago, la parte del barbero está en la caja pero no
--    es del local. El saldo sale de restar —lo que le corresponde menos lo
--    que ya cobró— y por eso no se guarda: un saldo calculado nunca se
--    desincroniza. Lo que sí hay que guardar es cada pago, y que ese pago sea
--    un gasto de verdad, porque ahí la plata sale de la caja.
-- ============================================================
create table if not exists public.turnos_pago (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  profesional_id uuid not null references public.turnos_profesional (id) on delete restrict,
  movimiento_id  uuid references public.movimientos (id) on delete set null,
  monto          numeric(14,2) not null check (monto > 0),
  fecha          date not null,
  notas          text not null default '',
  creado_por     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists turnos_pago_idx
  on public.turnos_pago (empresa_id, profesional_id, fecha desc);

alter table public.turnos_pago enable row level security;

drop policy if exists turnos_pago_select on public.turnos_pago;
create policy turnos_pago_select on public.turnos_pago
  for select to authenticated using (public.es_admin(empresa_id));

revoke all on public.turnos_pago from anon, authenticated;
grant select on public.turnos_pago to authenticated;

drop trigger if exists cuenta_activa_turnos_pago on public.turnos_pago;
create trigger cuenta_activa_turnos_pago
  before insert or update on public.turnos_pago
  for each row execute function public.exigir_cuenta_activa();

create or replace function public.pagar_profesional(
  p_empresa     uuid,
  p_profesional uuid,
  p_monto       numeric,
  p_fecha       date default null,
  p_notas       text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre text;
  v_fecha  date;
  v_mov    uuid;
  v_id     uuid;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede pagar al equipo.' using errcode = '42501';
  end if;

  select nombre into v_nombre from public.turnos_profesional
  where id = p_profesional and empresa_id = p_empresa;
  if v_nombre is null then
    raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El pago tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  -- El pago es un gasto de verdad, con el nombre de la persona en la
  -- descripción. No es contabilidad paralela: sale en el panel, en los
  -- reportes y en el Excel como cualquier otro gasto.
  insert into public.movimientos (
    empresa_id, tipo, estado, fecha, descripcion, categoria,
    subtotal, descuento, monto, costo_total, metodo_pago, contraparte, origen, creado_por
  )
  values (
    p_empresa, 'gasto', 'activo', v_fecha,
    'Pago a ' || v_nombre, 'Sueldos',
    p_monto, 0, p_monto, 0, 'efectivo', v_nombre, 'manual', auth.uid()
  )
  returning id into v_mov;

  insert into public.turnos_pago (empresa_id, profesional_id, movimiento_id, monto, fecha, notas, creado_por)
  values (p_empresa, p_profesional, v_mov, p_monto, v_fecha, left(coalesce(p_notas, ''), 200), auth.uid())
  returning id into v_id;

  return jsonb_build_object('pago', v_id, 'movimiento', v_mov);
end $fn$;

revoke all on function public.pagar_profesional(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.pagar_profesional(uuid, uuid, numeric, date, text) to authenticated;

-- ============================================================
-- 2. EL PANEL DEL PROPIETARIO
--
--    Un solo número —«te quedaron 650.000»— esconde justo lo que necesita
--    saber. Un peso que entró por sus propias manos y uno que entró por la
--    comisión de un empleado son plata de naturaleza distinta.
--
--    LOS TRES PRIMEROS RENGLONES SUMAN EXACTAMENTE `ventas − costo_total`,
--    que es la ganancia bruta que el panel ya calcula. No es casualidad: cada
--    venta cae en uno y solo uno de los tres, y aporta su propia ganancia
--    bruta. Un desglose que no cierra con el total es peor que no tener
--    desglose, porque obliga a elegir a cuál de los dos creerle.
-- ============================================================
create or replace function public.resumen_reparto(
  p_empresa uuid,
  p_desde   date,
  p_hasta   date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_mios       numeric := 0;
  v_equipo     numeric := 0;
  v_mercaderia numeric := 0;
  v_ingresos   numeric := 0;
  v_detalle    jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a estos números.' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  -- Renglones 1 y 2: lo que le queda al local de cada corte, separando los
  -- que hizo con sus propias manos de los que hizo su equipo.
  select
    coalesce(sum(a.parte_local) filter (where p.user_id is not null and p.user_id = auth.uid()), 0),
    coalesce(sum(a.parte_local) filter (where p.user_id is null or p.user_id <> auth.uid()), 0)
  into v_mios, v_equipo
  from public.turnos_atribucion a
  join public.turnos_profesional p on p.id = a.profesional_id
  where a.empresa_id = p_empresa
    and a.fecha between p_desde and p_hasta
    and a.movimiento_id is not null
    and exists (select 1 from public.movimientos m
                where m.id = a.movimiento_id and m.estado = 'activo');

  -- Renglón 3: todo lo demás que se vendió. Cera, shampoo, peines: precio
  -- menos lo que costó. Son las ventas SIN atribución, así que ningún corte
  -- se cuenta dos veces.
  select coalesce(sum(m.monto - m.costo_total), 0) into v_mercaderia
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.tipo = 'venta' and m.estado = 'activo'
    and m.fecha between p_desde and p_hasta
    and not exists (select 1 from public.turnos_atribucion a where a.movimiento_id = m.id);

  -- Renglón 4: lo que entró sin ser una venta. Acá cae el alquiler de las
  -- sillas de quien se queda con el 100% de sus cortes.
  select coalesce(sum(m.monto), 0) into v_ingresos
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.tipo = 'ingreso' and m.estado = 'activo'
    and m.fecha between p_desde and p_hasta;

  -- El detalle de cada corte, para que el número se pueda verificar. A un
  -- número sobre su propia plata que no puede verificar, nadie le cree.
  select coalesce(jsonb_agg(x order by (x->>'fecha') desc, (x->>'creado') desc), '[]'::jsonb)
  into v_detalle
  from (
    select jsonb_build_object(
      'id',                a.id,
      'profesional',       p.nombre,
      'servicio',          a.servicio,
      'fecha',             a.fecha,
      'creado',            a.created_at,
      'monto',             a.monto_cobrado,
      'parte_profesional', a.parte_profesional,
      'parte_local',       a.parte_local,
      'reparto',           a.reparto,
      'anulado',           a.movimiento_id is not null and not exists (
                             select 1 from public.movimientos m
                             where m.id = a.movimiento_id and m.estado = 'activo')
    ) as x
    from public.turnos_atribucion a
    join public.turnos_profesional p on p.id = a.profesional_id
    where a.empresa_id = p_empresa and a.fecha between p_desde and p_hasta
  ) t;

  return jsonb_build_object(
    'mis_cortes',      v_mios,
    'de_mi_equipo',    v_equipo,
    'mercaderia',      v_mercaderia,
    'otros_ingresos',  v_ingresos,
    -- Los tres primeros son la ganancia bruta; el cuarto se suma aparte
    -- porque no viene de una venta.
    'ganancia_bruta',  v_mios + v_equipo + v_mercaderia,
    'total',           v_mios + v_equipo + v_mercaderia + v_ingresos,
    'cortes',          v_detalle
  );
end $fn$;

revoke all on function public.resumen_reparto(uuid, date, date) from public, anon;
grant execute on function public.resumen_reparto(uuid, date, date) to authenticated;

-- ============================================================
-- 3. LA LIQUIDACIÓN
--
--    Por profesional y por período: cuántos cortes, cuánto cobró, cuánto le
--    toca, cuánto ya se le pagó y cuánto falta. Es un reporte sobre datos que
--    ya están guardados, no plata nueva.
-- ============================================================
create or replace function public.liquidacion(
  p_empresa uuid,
  p_desde   date,
  p_hasta   date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a estos números.' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select coalesce(jsonb_agg(x order by (x->>'le_toca')::numeric desc), '[]'::jsonb)
  into v_res
  from (
    select jsonb_build_object(
      'id',         p.id,
      'nombre',     p.nombre,
      'reparto',    p.reparto,
      'porcentaje', p.porcentaje,
      'activo',     p.activo,
      'cortes',     coalesce(c.cortes, 0),
      'cobrado',    coalesce(c.cobrado, 0),
      'le_toca',    coalesce(c.suyo, 0),
      'del_local',  coalesce(c.local, 0),
      'pagado',     coalesce(g.pagado, 0),
      -- Lo que todavía está en la caja del local pero es de él.
      'le_debe',    coalesce(c.suyo, 0) - coalesce(g.pagado, 0)
    ) as x
    from public.turnos_profesional p
    left join lateral (
      select count(*)::int              as cortes,
             sum(a.monto_cobrado)       as cobrado,
             sum(a.parte_profesional)   as suyo,
             sum(a.parte_local)         as local
      from public.turnos_atribucion a
      where a.profesional_id = p.id
        and a.fecha between p_desde and p_hasta
        -- Un corte anulado no se le paga a nadie.
        and (a.movimiento_id is null
             or exists (select 1 from public.movimientos m
                        where m.id = a.movimiento_id and m.estado = 'activo'))
    ) c on true
    left join lateral (
      select sum(t.monto) as pagado
      from public.turnos_pago t
      where t.profesional_id = p.id and t.fecha between p_desde and p_hasta
    ) g on true
    where p.empresa_id = p_empresa
      -- Los desactivados solo aparecen si tuvieron movimiento en el período:
      -- si no, la lista se llena de gente que ya no trabaja ahí.
      and (p.activo or coalesce(c.cortes, 0) > 0 or coalesce(g.pagado, 0) > 0)
  ) t;

  return v_res;
end $fn$;

revoke all on function public.liquidacion(uuid, date, date) from public, anon;
grant execute on function public.liquidacion(uuid, date, date) to authenticated;

-- ============================================================
-- 4. LO QUE VE EL PROFESIONAL
--
--    Sus cortes y su parte. Nada del margen del local, nada de los demás.
--    Es una función y no una policy porque lo que hay que esconder es una
--    COLUMNA —`parte_local`— y RLS filtra filas, no columnas.
-- ============================================================
create or replace function public.mis_servicios(
  p_empresa uuid,
  p_desde   date,
  p_hasta   date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_prof   uuid;
  v_cortes jsonb;
  v_total  numeric := 0;
  v_pagado numeric := 0;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select id into v_prof from public.turnos_profesional
  where empresa_id = p_empresa and user_id = auth.uid();

  if v_prof is null then
    return jsonb_build_object('es_profesional', false, 'cortes', '[]'::jsonb,
                              'le_toca', 0, 'pagado', 0, 'le_deben', 0);
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'fecha',    a.fecha,
      'servicio', a.servicio,
      'monto',    a.monto_cobrado,
      'tuyo',     a.parte_profesional
    ) order by a.fecha desc, a.created_at desc), '[]'::jsonb),
    coalesce(sum(a.parte_profesional), 0)
  into v_cortes, v_total
  from public.turnos_atribucion a
  where a.profesional_id = v_prof
    and a.fecha between p_desde and p_hasta
    and (a.movimiento_id is null
         or exists (select 1 from public.movimientos m
                    where m.id = a.movimiento_id and m.estado = 'activo'));

  select coalesce(sum(t.monto), 0) into v_pagado
  from public.turnos_pago t
  where t.profesional_id = v_prof and t.fecha between p_desde and p_hasta;

  return jsonb_build_object(
    'es_profesional', true,
    'cortes',   v_cortes,
    'le_toca',  v_total,
    'pagado',   v_pagado,
    'le_deben', v_total - v_pagado
  );
end $fn$;

revoke all on function public.mis_servicios(uuid, date, date) from public, anon;
grant execute on function public.mis_servicios(uuid, date, date) to authenticated;
