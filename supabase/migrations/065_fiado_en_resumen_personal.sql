-- ============================================================
-- ORDEN · Migración 065 · El fiado cobrado también es plata disponible, en la cuenta personal
--
-- EL AGUJERO
--
-- Desde la 054, «Me deben» existe también en la cuenta personal: le
-- prestaste plata a alguien, o te deben por lo que sea, y queda anotado
-- ahí. La 056 decidió, con razón, que cobrar un fiado no crea un ingreso
-- —esa plata ya había salido antes, y contarla de nuevo la duplicaría—, y
-- la 057 le sumó al CIERRE DEL DÍA dos números aparte para que esa plata
-- no desapareciera del resumen del negocio.
--
-- Pero `resumen_personal()` no se tocó desde la 030, antes de que el fiado
-- existiera. Y la cuenta personal no tiene Cierre del día (en el código,
-- PERSONAL.secciones['/cierre'] = false: esa pantalla es de un negocio, no
-- de alguien con sueldo). Entonces cobrar un fiado en una cuenta personal
-- no aparecía en NINGÚN lado: no sumaba a lo disponible, y no había una
-- sola línea que dijera qué había pasado con esa plata. Entraba de verdad
-- y el sistema no se enteraba.
--
-- LO QUE CAMBIA
--
-- `disponible` ahora también suma lo cobrado de fiado en este ciclo: es
-- plata real en el bolsillo, aunque no sea ganancia — la misma distinción
-- que ya vale para el negocio, acá aplicada al número del que depende una
-- decisión de gasto. Y el resumen devuelve dos campos nuevos para que la
-- persona vea de dónde salió ese número:
--
--   fiado_cobrado_en_el_ciclo → lo que cobró de fiados en este ciclo.
--   fiado_pendiente           → lo que todavía le deben, en total.
--
-- Idempotente. No toca datos existentes: solo cambia lo que la función
-- calcula a partir de ellos.
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
  v_fiado_ciclo  numeric := 0;
  v_fiado_total  numeric := 0;
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

  select coalesce(sum(case when ma.tipo = 'aporte' then ma.monto else -ma.monto end), 0)
  into v_ahorro_ciclo
  from public.movimientos_ahorro ma
  where ma.empresa_id = p_empresa and ma.fecha between v_c.desde and v_c.hasta;

  select coalesce(sum(case when ma.tipo = 'aporte' then ma.monto else -ma.monto end), 0)
  into v_ahorro_total
  from public.movimientos_ahorro ma
  where ma.empresa_id = p_empresa;

  -- Lo cobrado de fiado en ESTE ciclo. `cobrar_fiado` (056) no crea
  -- movimiento a propósito, así que sin esto esa plata no aparecía en
  -- ningún cálculo.
  select coalesce(sum(f.monto) filter (where f.tipo = 'cobro'), 0)
  into v_fiado_ciclo
  from public.fiado f
  where f.empresa_id = p_empresa and f.fecha between v_c.desde and v_c.hasta;

  -- Lo que le deben en total, sumando a todos los que le deben. Mismo
  -- cálculo que `resumen_fiado()` (054), acá sin el desglose por persona
  -- porque este resumen ya tiene bastante.
  select coalesce(sum(case when f.tipo = 'fio' then f.monto else -f.monto end), 0)
  into v_fiado_total
  from public.fiado f
  where f.empresa_id = p_empresa;

  v_dias := greatest(1, (v_c.hasta - v_hoy) + 1);
  -- El fiado cobrado suma a lo disponible: es plata real en el bolsillo,
  -- aunque no haya sido «entro» (eso ya se explicó por qué no).
  v_disponible := v_entro - v_salio - v_cuotas - v_fijos_falta - v_ahorro_ciclo + v_fiado_ciclo;

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
                 else round((a.meta - s.saldo)
                            / greatest(1, ceil((a.fecha_limite - v_hoy)::numeric / 30)), 2)
               end
  ) order by a.created_at), '[]'::jsonb)
  into v_fondos
  from public.ahorros a
  cross join lateral (select public.saldo_ahorro(a.id) as saldo) s
  where a.empresa_id = p_empresa and a.activo;

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
    'fiado_cobrado_en_el_ciclo', v_fiado_ciclo,
    'fiado_pendiente', v_fiado_total,
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
