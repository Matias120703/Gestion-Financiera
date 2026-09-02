-- ORDEN · Migración 025 · Lo que se paga todos los meses
--
-- Faltaba la otra mitad. La 024 trajo lo que ENTRA todos los meses; esto es
-- lo que SALE sí o sí: el wifi, la línea del celular, el pasaje del bus, la
-- cuota del gimnasio.
--
-- Sin esto, el número de «te quedan» mentía por optimismo. El día que cobrás
-- te decía que tenías 1.850.000 disponibles cuando 500.000 ya estaban
-- comprometidos antes de que decidieras nada. Es el error más caro que puede
-- cometer un sistema de plata: hacerte creer que tenés más de lo que tenés.
--
-- CÓMO SE EVITA CONTAR DOS VECES
--
-- Un gasto fijo es algo que va a pasar, no algo que pasó. Cuando de verdad
-- pagás el wifi, lo cargás como cualquier gasto — y a partir de ahí ya no
-- puede seguir descontándose, o estaría restado dos veces.
--
-- La regla, por categoría:
--
--     pendiente = max(0, suma de los fijos − lo ya gastado en esa categoría)
--
-- Wifi 200.000 en «Servicios»: si todavía no gastaste nada en Servicios,
-- faltan 200.000. Si gastaste 150.000, faltan 50.000. Si gastaste 200.000 o
-- más, no falta nada.
--
-- No hace falta que nadie marque «ya lo pagué», que es justo lo que la gente
-- deja de hacer a la segunda semana. Y si tenés dos fijos en la misma
-- categoría —wifi y luz, los dos «Servicios»— se suman y se comparan juntos,
-- que es exactamente lo correcto.

create table if not exists public.gastos_fijos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nombre      text not null check (char_length(trim(nombre)) between 1 and 60),
  importe     numeric(14,2) not null check (importe > 0),
  -- En qué casillero cae. Es lo que permite saber si ya se pagó: se compara
  -- contra lo gastado en esta misma categoría durante el ciclo.
  categoria   text not null default 'Otros' check (char_length(trim(categoria)) between 1 and 40),
  -- Qué día vence. Puede ir vacío a propósito: el pasaje del bus se gasta
  -- todos los días, no tiene fecha. Obligar a inventar un día haría que el
  -- dato sea mentira.
  dia_del_mes smallint check (dia_del_mes is null or dia_del_mes between 1 and 31),
  -- Para escribir lo que no entra en un nombre de sesenta caracteres.
  notas       text not null default '',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists gastos_fijos_empresa_idx
  on public.gastos_fijos (empresa_id) where activo;

alter table public.gastos_fijos enable row level security;

drop policy if exists gastos_fijos_select on public.gastos_fijos;
create policy gastos_fijos_select on public.gastos_fijos
  for select to authenticated using (public.es_admin(empresa_id));

revoke all on public.gastos_fijos from anon, authenticated;
grant select on public.gastos_fijos to authenticated;

do $$ begin
  execute 'drop trigger if exists cuenta_activa_gastos_fijos on public.gastos_fijos';
  execute 'create trigger cuenta_activa_gastos_fijos before insert or update '
       || 'on public.gastos_fijos for each row execute function public.exigir_cuenta_activa()';
end $$;

create or replace function public.guardar_gasto_fijo(
  p_empresa   uuid,
  p_nombre    text,
  p_importe   numeric,
  p_categoria text default 'Otros',
  p_dia       integer default null,
  p_notas     text default '',
  p_id        uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id  uuid;
  v_dia smallint;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre, para reconocerlo cuando lo pagues.' using errcode = '22023';
  end if;

  if coalesce(p_importe, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  v_dia := case
    when p_dia is null then null
    else least(greatest(p_dia, 1), 31)::smallint end;

  if p_id is null then
    insert into public.gastos_fijos (empresa_id, nombre, importe, categoria, dia_del_mes, notas)
    values (p_empresa, trim(p_nombre), p_importe,
            coalesce(nullif(trim(p_categoria), ''), 'Otros'), v_dia,
            left(coalesce(p_notas, ''), 500))
    returning id into v_id;
  else
    update public.gastos_fijos
    set nombre = trim(p_nombre), importe = p_importe,
        categoria = coalesce(nullif(trim(p_categoria), ''), 'Otros'),
        dia_del_mes = v_dia, notas = left(coalesce(p_notas, ''), 500),
        updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese gasto fijo no existe en esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_gasto_fijo(uuid, text, numeric, text, integer, text, uuid)
  from public, anon;
grant execute on function public.guardar_gasto_fijo(uuid, text, numeric, text, integer, text, uuid)
  to authenticated;

create or replace function public.borrar_gasto_fijo(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  delete from public.gastos_fijos where id = p_id and empresa_id = p_empresa;
  if not found then
    raise exception 'Ese gasto fijo no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_gasto_fijo(uuid, uuid) from public, anon;
grant execute on function public.borrar_gasto_fijo(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- LO QUE SE REPITE, PARA QUE LA IA LO SEPA
--
-- Sin esto pasaba lo que tenía que pasar: alguien con el sueldo cargado
-- decía «ya cobré mi sueldo de este mes» y el sistema contestaba «no pude
-- sacar el monto del mensaje, escribilo vos». El monto estaba guardado en la
-- fila de al lado. Es lo mismo que ya se hace con las deudas: la IA no
-- adivina, se le da lo que la cuenta ya sabe.
--
-- Va con `es_admin` como todo lo demás de esta familia: un vendedor no tiene
-- por qué enterarse de cuánto cobra el dueño, ni siquiera de rebote por el
-- prompt de una captura.
-- ------------------------------------------------------------
create or replace function public.fijos_para_captura(p_empresa uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select case when public.es_admin(p_empresa) then coalesce((
    select jsonb_agg(x order by x->>'nombre') from (
      select jsonb_build_object(
        'clase', 'ingreso', 'nombre', i.nombre, 'importe', i.importe,
        'dia', i.dia_del_mes, 'categoria', 'Sueldo') as x
      from public.ingresos_fijos i
      where i.empresa_id = p_empresa and i.activo
      union all
      select jsonb_build_object(
        'clase', 'gasto', 'nombre', g.nombre, 'importe', g.importe,
        'dia', g.dia_del_mes, 'categoria', g.categoria) as x
      from public.gastos_fijos g
      where g.empresa_id = p_empresa and g.activo
    ) t), '[]'::jsonb)
  else '[]'::jsonb end;
$fn$;

revoke all on function public.fijos_para_captura(uuid) from public, anon;
grant execute on function public.fijos_para_captura(uuid) to authenticated;

-- ------------------------------------------------------------
-- EL RESUMEN, AHORA CON LO QUE FALTA PAGAR
--
-- Cambia una sola cosa en el número grande: `disponible` ahora también
-- descuenta los gastos fijos que todavía no se pagaron en este ciclo.
-- ------------------------------------------------------------
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
  v_dias         integer;
  v_plan         jsonb;
  v_sin_planear  numeric := 0;
  v_entradas     jsonb;
  v_salidas      jsonb;
  v_esperado     numeric := 0;
  v_fijo_mes     numeric := 0;
  v_hubo_ingreso boolean := false;
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

  -- Lo que falta pagar de los fijos, categoría por categoría. Ver el
  -- comentario de arriba sobre por qué se compara contra lo ya gastado.
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

  v_dias := greatest(1, (v_c.hasta - v_hoy) + 1);

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

  return jsonb_build_object(
    'desde', v_c.desde,
    'hasta', v_c.hasta,
    'dia_cobro', v_c.dia_cobro,
    'dias_restantes', v_dias,
    'entro', v_entro,
    'salio', v_salio,
    'cuotas_por_vencer', v_cuotas,
    'fijos_por_pagar', v_fijos_falta,
    'disponible', v_entro - v_salio - v_cuotas - v_fijos_falta,
    'por_dia', round((v_entro - v_salio - v_cuotas - v_fijos_falta) / v_dias, 2),
    'plan', v_plan,
    'gastado_sin_planear', v_sin_planear,
    'ingresos_fijos', v_entradas,
    'gastos_fijos', v_salidas,
    'esperado', v_esperado,
    'fijo_mensual', v_fijo_mes,
    'cobro_pendiente', v_esperado > 0 and not coalesce(v_hubo_ingreso, false)
  );
end $fn$;

revoke all on function public.resumen_personal(uuid) from public, anon;
grant execute on function public.resumen_personal(uuid) to authenticated;
