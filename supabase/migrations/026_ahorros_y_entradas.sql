-- ORDEN · Migración 026 · Ahorros, y de dónde vino la plata
--
-- Le faltaban dos cosas a la cuenta personal, y una de ellas es la que más
-- define si alguien siente que le va bien: el ahorro.
--
-- POR QUÉ EL AHORRO NO ES UN GASTO
--
-- Era tentador resolverlo con una categoría de gasto llamada «Ahorro»: no
-- costaba nada y ya quedaba descontado de lo disponible. Pero sería mentira
-- en el peor lugar posible. Guardar plata no es gastarla — no se fue a
-- ningún lado, la tenés. Si el reporte de fin de año dijera que gastaste
-- cuatro millones en «Ahorro», la persona vería su mejor mes como el peor.
--
-- Así que el ahorro es una MUDANZA, no una salida: la plata pasa del bolsillo
-- de gastar al bolsillo de guardar. Y por eso sí baja lo disponible —no la
-- podés gastar dos veces— pero no cuenta como gasto en ningún reporte. Un
-- retiro hace el camino inverso y vuelve a estar disponible.
--
-- LO SEGUNDO: DE DÓNDE VINO
--
-- Hasta acá todo ingreso caía en una bolsa sin nombre. Para una persona con
-- sueldo eso pierde la única distinción que le importa: qué parte de lo que
-- entró es su sueldo y qué parte fue extra —horas extra, una changa, haber
-- vendido algo que no usaba—. Es la diferencia entre «gano bien» y «este mes
-- zafé».

-- ============================================================
-- 1. LOS FONDOS DE AHORRO
-- ============================================================
create table if not exists public.ahorros (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre     text not null check (char_length(trim(nombre)) between 1 and 60),
  -- Cuánto quiere juntar. Opcional: mucha gente ahorra sin una meta puesta,
  -- y exigirla sería inventarle un número para poder empezar.
  meta       numeric(14,2) check (meta is null or meta > 0),
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ahorros_empresa_idx on public.ahorros (empresa_id) where activo;

-- Cada vez que entra o sale plata del fondo. No se guarda un saldo: se
-- calcula sumando. Un saldo guardado se desincroniza el día que algo falla
-- en el medio, y entonces el número que la persona mira deja de ser cierto.
create table if not exists public.movimientos_ahorro (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  ahorro_id  uuid not null references public.ahorros (id) on delete cascade,
  tipo       text not null check (tipo in ('aporte', 'retiro')),
  monto      numeric(14,2) not null check (monto > 0),
  fecha      date not null default (now() at time zone 'America/Asuncion')::date,
  nota       text not null default '',
  creado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists movimientos_ahorro_idx
  on public.movimientos_ahorro (empresa_id, fecha desc);
create index if not exists movimientos_ahorro_fondo_idx
  on public.movimientos_ahorro (ahorro_id);

alter table public.ahorros            enable row level security;
alter table public.movimientos_ahorro enable row level security;

drop policy if exists ahorros_select on public.ahorros;
create policy ahorros_select on public.ahorros
  for select to authenticated using (public.es_admin(empresa_id));

drop policy if exists movimientos_ahorro_select on public.movimientos_ahorro;
create policy movimientos_ahorro_select on public.movimientos_ahorro
  for select to authenticated using (public.es_admin(empresa_id));

revoke all on public.ahorros            from anon, authenticated;
revoke all on public.movimientos_ahorro from anon, authenticated;
grant select on public.ahorros            to authenticated;
grant select on public.movimientos_ahorro to authenticated;

do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['ahorros', 'movimientos_ahorro'] loop
    execute format('drop trigger if exists %I on public.%I',
                   'cuenta_activa_' || v_tabla, v_tabla);
    execute format(
      'create trigger %I before insert or update on public.%I '
      || 'for each row execute function public.exigir_cuenta_activa()',
      'cuenta_activa_' || v_tabla, v_tabla);
  end loop;
end $$;

create or replace function public.saldo_ahorro(p_ahorro uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select coalesce(sum(case when tipo = 'aporte' then monto else -monto end), 0)
  from public.movimientos_ahorro where ahorro_id = p_ahorro;
$fn$;

revoke all on function public.saldo_ahorro(uuid) from public, anon;
grant execute on function public.saldo_ahorro(uuid) to authenticated;

create or replace function public.guardar_ahorro(
  p_empresa uuid,
  p_nombre  text,
  p_meta    numeric default null,
  p_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
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

  if p_id is null then
    insert into public.ahorros (empresa_id, nombre, meta)
    values (p_empresa, trim(p_nombre), p_meta)
    returning id into v_id;
  else
    update public.ahorros
    set nombre = trim(p_nombre), meta = p_meta, updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese fondo no existe en esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_ahorro(uuid, text, numeric, uuid) from public, anon;
grant execute on function public.guardar_ahorro(uuid, text, numeric, uuid) to authenticated;

-- Un fondo con plata adentro no se borra de un toque. No es burocracia: si
-- se borrara, el registro de esa plata desaparecería y el historial diría que
-- nunca existió. Primero se retira, que además deja el rastro de a dónde fue.
create or replace function public.borrar_ahorro(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_saldo numeric;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  select public.saldo_ahorro(p_id) into v_saldo
  from public.ahorros where id = p_id and empresa_id = p_empresa;

  if v_saldo is null then
    raise exception 'Ese fondo no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  if v_saldo > 0 then
    raise exception 'Ese fondo todavía tiene plata. Retirala primero y después borralo.'
      using errcode = '22023';
  end if;

  delete from public.ahorros where id = p_id and empresa_id = p_empresa;
  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_ahorro(uuid, uuid) from public, anon;
grant execute on function public.borrar_ahorro(uuid, uuid) to authenticated;

create or replace function public.mover_ahorro(
  p_empresa uuid,
  p_ahorro  uuid,
  p_tipo    text,
  p_monto   numeric,
  p_fecha   date default null,
  p_nota    text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo numeric;
  v_zona  text;
  v_id    uuid;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if p_tipo not in ('aporte', 'retiro') then
    raise exception 'Solo se puede guardar o retirar.' using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  select public.saldo_ahorro(a.id) into v_saldo
  from public.ahorros a where a.id = p_ahorro and a.empresa_id = p_empresa;

  if v_saldo is null then
    raise exception 'Ese fondo no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  -- No se puede sacar lo que no hay. Un saldo negativo no significa nada:
  -- nadie tiene menos que cero guardado en una lata.
  if p_tipo = 'retiro' and p_monto > v_saldo then
    raise exception 'Ese fondo tiene menos de lo que querés retirar.' using errcode = '22023';
  end if;

  select zona_horaria into v_zona from public.empresas where id = p_empresa;

  insert into public.movimientos_ahorro (empresa_id, ahorro_id, tipo, monto, fecha, nota, creado_por)
  values (p_empresa, p_ahorro, p_tipo, p_monto,
          coalesce(p_fecha, (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date),
          left(coalesce(p_nota, ''), 200), auth.uid())
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'saldo', v_saldo + case when p_tipo = 'aporte' then p_monto else -p_monto end);
end $fn$;

revoke all on function public.mover_ahorro(uuid, uuid, text, numeric, date, text) from public, anon;
grant execute on function public.mover_ahorro(uuid, uuid, text, numeric, date, text) to authenticated;

create or replace function public.borrar_movimiento_ahorro(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  delete from public.movimientos_ahorro where id = p_id and empresa_id = p_empresa;
  if not found then
    raise exception 'Ese movimiento no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_movimiento_ahorro(uuid, uuid) from public, anon;
grant execute on function public.borrar_movimiento_ahorro(uuid, uuid) to authenticated;

-- ============================================================
-- 2. DE DÓNDE VINO LA PLATA
--
--    Para un negocio, un ingreso es un ingreso. Para una persona con sueldo,
--    la distinción entre «esto es lo que gano todos los meses» y «esto fue
--    de una» es la más importante que hay: es la diferencia entre gano bien
--    y este mes zafé.
-- ============================================================
create or replace function public.categorias_de_ingreso(p_tipo_cuenta text default 'emprendedor')
returns jsonb language sql immutable set search_path = public as $fn$
  select case when coalesce(p_tipo_cuenta, 'emprendedor') = 'personal' then jsonb_build_array(
      jsonb_build_object('nombre','Sueldo','pistas','sueldo, salario, quincena, me pagaron el mes'),
      jsonb_build_object('nombre','Extra','pistas','horas extra, bonificación, comisión, aguinaldo, propina'),
      jsonb_build_object('nombre','Changa','pistas','trabajo aparte, freelance, un servicio suelto'),
      jsonb_build_object('nombre','Vendí algo','pistas','vendí, revendí, me compraron algo mío'),
      jsonb_build_object('nombre','Me devolvieron','pistas','devolución, reintegro, me pagaron lo que le presté'),
      jsonb_build_object('nombre','Regalo o ayuda','pistas','me regalaron, me ayudaron, me mandaron plata'),
      jsonb_build_object('nombre','Otros ingresos','pistas',''))
    else jsonb_build_array(
      jsonb_build_object('nombre','Ventas','pistas','lo que entra por vender'),
      jsonb_build_object('nombre','Aporte de capital','pistas','plata que puso el dueño'),
      jsonb_build_object('nombre','Devolución','pistas','reintegro, nota de crédito'),
      jsonb_build_object('nombre','Otros ingresos','pistas',''))
  end;
$fn$;

revoke all on function public.categorias_de_ingreso(text) from public, anon;
grant execute on function public.categorias_de_ingreso(text) to anon, authenticated;

-- ============================================================
-- 3. EL RESUMEN, CON EL AHORRO Y EL DESGLOSE
--
--    `disponible` ahora también descuenta lo que se guardó en este ciclo.
--    No porque se haya gastado —no se gastó— sino porque ya no está para
--    gastar. Un retiro va al revés y vuelve a sumar.
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'nombre', a.nombre, 'meta', a.meta,
    'saldo', public.saldo_ahorro(a.id)
  ) order by a.created_at), '[]'::jsonb)
  into v_fondos
  from public.ahorros a
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
