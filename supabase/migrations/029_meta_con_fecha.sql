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
