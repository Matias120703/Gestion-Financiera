-- ============================================================
-- ORDEN · Migración 073 · Ahorrar en la moneda que uno quiera
--
-- LO QUE PIDIÓ MATÍAS (16/09/2026)
--
--   «Mucha gente no ahorra en su moneda local. Debemos poner la opción de si
--    quiere ahorrar en su moneda o elegir una moneda: dólares, euros, libras.»
--
-- En Paraguay casi todo el que ahorra en serio ahorra en dólares. Hasta acá
-- un fondo estaba siempre en la moneda de la cuenta: quien compraba 100
-- dólares tenía que anotar «Gs. 750.000» y, cuando el dólar subía, su fondo
-- decía una mentira.
--
-- EL MODELO
--
--   · Cada fondo tiene su moneda (`ahorros.moneda`; null = la de la cuenta).
--     El saldo, la meta y cada depósito van en ESA moneda: «US$ 350».
--   · Cada movimiento de un fondo en otra moneda guarda además cuánto costó
--     (o cuánto se recibió) en la moneda de la cuenta: `monto_local`. Es el
--     cambio que le hicieron a ESA persona ese día, no una cotización de
--     internet.
--   · Todo lo que SUMA —lo guardado en el mes, el resumen, el Excel— suma
--     `monto_local`: no se pueden sumar guaraníes con dólares.
--
-- La moneda de un fondo se elige al crearlo y no se cambia si ya tiene
-- movimientos: cambiarla reetiquetaría lo guardado sin convertirlo (la misma
-- regla que la moneda de la cuenta, 051).
-- ============================================================

alter table public.ahorros
  add column if not exists moneda text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ahorros_moneda_valida') then
    alter table public.ahorros
      add constraint ahorros_moneda_valida check (moneda is null or moneda ~ '^[A-Z]{3}$');
  end if;
end $$;

alter table public.movimientos_ahorro
  add column if not exists monto_local numeric(14,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_ahorro_local_positivo') then
    alter table public.movimientos_ahorro
      add constraint movimientos_ahorro_local_positivo check (monto_local is null or monto_local > 0);
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. CREAR O EDITAR UN FONDO, CON SU MONEDA
-- ------------------------------------------------------------
drop function if exists public.guardar_ahorro(uuid, text, numeric, date, uuid);

create or replace function public.guardar_ahorro(
  p_empresa      uuid,
  p_nombre       text,
  p_meta         numeric default null,
  p_fecha_limite date    default null,
  p_id           uuid    default null,
  p_moneda       text    default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id       uuid;
  v_zona     text;
  v_hoy      date;
  v_anterior date;
  v_propia   text;
  v_moneda   text;
  v_antes    public.ahorros;
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

  select zona_horaria, moneda into v_zona, v_propia from public.empresas where id = p_empresa;
  v_hoy := (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date;

  -- La moneda de la cuenta se guarda como null: «la de siempre».
  v_moneda := nullif(upper(trim(coalesce(p_moneda, ''))), '');
  if v_moneda is not null and v_moneda !~ '^[A-Z]{3}$' then
    raise exception 'Esa moneda no es válida.' using errcode = '22023';
  end if;
  if v_moneda = v_propia then
    v_moneda := null;
  end if;

  if p_id is not null then
    select * into v_antes from public.ahorros where id = p_id and empresa_id = p_empresa;
    v_anterior := v_antes.fecha_limite;
  end if;

  if p_fecha_limite is not null
     and p_fecha_limite < v_hoy
     and p_fecha_limite is distinct from v_anterior then
    raise exception 'Esa fecha ya pasó. Poné para cuándo lo querés juntar.' using errcode = '22007';
  end if;

  if p_id is null then
    insert into public.ahorros (empresa_id, nombre, meta, fecha_limite, moneda)
    values (p_empresa, trim(p_nombre), p_meta, p_fecha_limite, v_moneda)
    returning id into v_id;
  else
    if v_antes.id is null then
      raise exception 'Ese fondo no existe en esta cuenta.' using errcode = 'P0002';
    end if;

    -- Editar sin mandar moneda la deja como estaba.
    if p_moneda is null then
      v_moneda := v_antes.moneda;
    end if;

    if v_moneda is distinct from v_antes.moneda
       and exists (select 1 from public.movimientos_ahorro where ahorro_id = p_id) then
      raise exception 'Ese fondo ya tiene movimientos: no se le puede cambiar la moneda. Creá otro fondo.'
        using errcode = '22023';
    end if;

    update public.ahorros
    set nombre = trim(p_nombre), meta = p_meta, fecha_limite = p_fecha_limite,
        moneda = v_moneda, updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_ahorro(uuid, text, numeric, date, uuid, text) from public, anon;
grant execute on function public.guardar_ahorro(uuid, text, numeric, date, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 2. GUARDAR O RETIRAR, CON LO QUE COSTÓ
-- ------------------------------------------------------------
drop function if exists public.mover_ahorro(uuid, uuid, text, numeric, date, text);

create or replace function public.mover_ahorro(
  p_empresa     uuid,
  p_ahorro      uuid,
  p_tipo        text,
  p_monto       numeric,
  p_fecha       date default null,
  p_nota        text default '',
  p_monto_local numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo  numeric;
  v_zona   text;
  v_id     uuid;
  v_moneda text;
  v_propia text;
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

  select public.saldo_ahorro(a.id), a.moneda into v_saldo, v_moneda
  from public.ahorros a where a.id = p_ahorro and a.empresa_id = p_empresa;

  if v_saldo is null then
    raise exception 'Ese fondo no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  if p_tipo = 'retiro' and p_monto > v_saldo then
    raise exception 'Ese fondo tiene menos de lo que querés retirar.' using errcode = '22023';
  end if;

  select zona_horaria, moneda into v_zona, v_propia from public.empresas where id = p_empresa;

  -- (073) Un fondo en otra moneda necesita lo que costó en la de la cuenta:
  -- sin eso no se puede sumar a lo que guardaste este mes.
  if v_moneda is not null and coalesce(p_monto_local, 0) <= 0 then
    raise exception 'Escribí cuánto fue en %: sin eso no se puede sumar a tus números.', v_propia
      using errcode = '22023';
  end if;

  insert into public.movimientos_ahorro (empresa_id, ahorro_id, tipo, monto, monto_local, fecha, nota, creado_por)
  values (p_empresa, p_ahorro, p_tipo, p_monto,
          case when v_moneda is null then null else p_monto_local end,
          coalesce(p_fecha, (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date),
          left(coalesce(p_nota, ''), 200), auth.uid())
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'saldo', v_saldo + case when p_tipo = 'aporte' then p_monto else -p_monto end);
end $fn$;

revoke all on function public.mover_ahorro(uuid, uuid, text, numeric, date, text, numeric) from public, anon;
grant execute on function public.mover_ahorro(uuid, uuid, text, numeric, date, text, numeric) to authenticated;

-- ------------------------------------------------------------
-- 3. EL RESUMEN PERSONAL: SUMA EN LA MONEDA DE LA CUENTA
--
--    Mismo cuerpo que la 065, con lo marcado (073).
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

  select coalesce(sum(case when ma.tipo = 'aporte' then coalesce(ma.monto_local, ma.monto) else -coalesce(ma.monto_local, ma.monto) end), 0)
  into v_ahorro_ciclo
  from public.movimientos_ahorro ma
  where ma.empresa_id = p_empresa and ma.fecha between v_c.desde and v_c.hasta;

  select coalesce(sum(case when ma.tipo = 'aporte' then coalesce(ma.monto_local, ma.monto) else -coalesce(ma.monto_local, ma.monto) end), 0)
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
    -- (073) En qué moneda está el fondo (null = la de la cuenta) y cuánto
    -- costó en la moneda de la cuenta lo que tiene guardado.
    'moneda', a.moneda,
    'saldo_local', sl.saldo_local,
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
  cross join lateral (
    select coalesce(sum(case when ma.tipo = 'aporte' then coalesce(ma.monto_local, ma.monto) else -coalesce(ma.monto_local, ma.monto) end), 0) as saldo_local
    from public.movimientos_ahorro ma where ma.ahorro_id = a.id
  ) sl
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

-- ------------------------------------------------------------
-- 4. EL AHORRO DEL PERÍODO (EXCEL): TAMBIÉN
--
--    Mismo cuerpo que la 030, con lo marcado (073).
-- ------------------------------------------------------------
create or replace function public.resumen_ahorro_periodo(
  p_empresa uuid,
  p_desde   date,
  p_hasta   date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_aportado numeric := 0;
  v_retirado numeric := 0;
  v_fondos   jsonb;
begin
  -- Se lee con `es_admin` y no con `es_miembro`, igual que las tablas de
  -- ahorro desde la 026: cuánto guarda alguien no lo ve un vendedor.
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a esta cuenta.' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select
    coalesce(sum(coalesce(ma.monto_local, ma.monto)) filter (where ma.tipo = 'aporte'), 0),
    coalesce(sum(coalesce(ma.monto_local, ma.monto)) filter (where ma.tipo = 'retiro'), 0)
  into v_aportado, v_retirado
  from public.movimientos_ahorro ma
  where ma.empresa_id = p_empresa
    and ma.fecha between p_desde and p_hasta;

  -- Solo los fondos que se movieron en el período. Listar los quietos en cero
  -- alargaría la hoja sin decir nada: que un fondo no se haya tocado en marzo
  -- no es información, es ruido.
  select coalesce(jsonb_agg(x order by (x->>'neto')::numeric desc), '[]'::jsonb)
  into v_fondos
  from (
    select jsonb_build_object(
      'nombre',   a.nombre,
      'aportado', coalesce(sum(coalesce(ma.monto_local, ma.monto)) filter (where ma.tipo = 'aporte'), 0),
      'retirado', coalesce(sum(coalesce(ma.monto_local, ma.monto)) filter (where ma.tipo = 'retiro'), 0),
      'neto',     coalesce(sum(case when ma.tipo = 'aporte' then coalesce(ma.monto_local, ma.monto) else -coalesce(ma.monto_local, ma.monto) end), 0),
      -- El saldo del fondo a hoy, que es de otro recorte y por eso va con su
      -- propio nombre: la hoja lo rotula aparte para que nadie lo sume con
      -- las columnas del período.
      -- (073) En la moneda de la cuenta: la planilla suma y compara en una
      -- sola moneda. Para un fondo en dólares es lo que costó lo guardado.
      'saldo_hoy', (select coalesce(sum(case when m2.tipo = 'aporte' then coalesce(m2.monto_local, m2.monto)
                                        else -coalesce(m2.monto_local, m2.monto) end), 0)
                    from public.movimientos_ahorro m2 where m2.ahorro_id = a.id),
      'moneda', a.moneda
    ) as x
    from public.movimientos_ahorro ma
    join public.ahorros a on a.id = ma.ahorro_id
    where ma.empresa_id = p_empresa
      and ma.fecha between p_desde and p_hasta
    group by a.id, a.nombre, a.moneda
  ) t;

  return jsonb_build_object(
    'aportado', v_aportado,
    'retirado', v_retirado,
    'neto',     v_aportado - v_retirado,
    'por_fondo', v_fondos
  );
end $fn$;

revoke all on function public.resumen_ahorro_periodo(uuid, date, date) from public, anon;
grant execute on function public.resumen_ahorro_periodo(uuid, date, date) to authenticated;
