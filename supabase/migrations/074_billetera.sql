-- ============================================================
-- ORDEN · Migración 074 · La billetera: cuánto hay en cada banco
--
-- LO QUE PIDIÓ MATÍAS (16/09/2026)
--
--   «Todas las personas tienen muchos bancos, no solamente un banco. En el
--    Banco Familiar recibe su sueldo, tiene un poquito más de plata en otro
--    banco, y así. Que puedan cargar cuánto saldo tiene cada banco.»
--
-- Y eligió que el saldo SE MUEVA CON LO QUE CARGA, no que se escriba a mano.
--
-- CÓMO SE MUEVE SOLO
--
-- Cada cuenta dice qué formas de pago entran en ella: «Efectivo» recibe lo
-- cobrado en efectivo; «Banco Familiar», las transferencias y la tarjeta.
-- Cuando se carga una venta, un gasto o un ingreso, un trigger mira su forma
-- de pago y lo anota en esa cuenta.
--
-- Así no hubo que tocar ninguna de las puertas por donde entra un
-- movimiento —la venta, el gasto a mano, la voz, la foto, el ingreso fijo,
-- el pago de una deuda—: todas terminan en `movimientos`, y ahí se resuelve.
--
--   SALDO = saldo con que se creó la cuenta
--         + lo que entró por ella (ventas e ingresos activos)
--         − lo que salió (gastos activos)
--         + ajustes y transferencias.
--
-- Lo cargado ANTES de crear la cuenta no cuenta: ese pasado ya está dentro
-- del saldo inicial que la persona escribió al crearla.
--
-- LO QUE NO HACE, Y HAY QUE DECIRLO
--
-- En Paraguay no hay forma de conectarse a los bancos. El saldo es el que
-- calcula Orden con lo que la persona carga, y puede no coincidir con el del
-- banco (una comisión, algo que se olvidó cargar). Para eso está «ajustar
-- saldo»: queda como un ajuste con fecha, no se reescribe la historia.
--
-- Solo el dueño y los administradores: cuánto hay en cada banco no lo ve un
-- vendedor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LAS CUENTAS
-- ------------------------------------------------------------
create table if not exists public.cuentas_dinero (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  nombre        text not null check (char_length(trim(nombre)) between 1 and 40),
  tipo          text not null default 'banco' check (tipo in ('banco', 'efectivo', 'billetera')),
  saldo_inicial numeric(14,2) not null default 0,
  -- Qué formas de pago caen acá. Cada forma, en una sola cuenta.
  metodos       text[] not null default '{}',
  activa        boolean not null default true,
  orden         smallint not null default 0,
  creada_por    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists cuentas_dinero_empresa_idx on public.cuentas_dinero (empresa_id) where activa;

alter table public.cuentas_dinero enable row level security;
revoke all on public.cuentas_dinero from anon, authenticated;

-- ------------------------------------------------------------
-- 2. AJUSTES Y TRANSFERENCIAS
--
--    Una transferencia son dos filas con el mismo `par`: sale de una y entra
--    en la otra. Pasar plata del banco al bolsillo no es un gasto ni un
--    ingreso: no cambia cuánto tenés, cambia dónde.
-- ------------------------------------------------------------
create table if not exists public.ajustes_cuenta (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  cuenta_id  uuid not null references public.cuentas_dinero (id) on delete cascade,
  tipo       text not null check (tipo in ('ajuste', 'transferencia')),
  monto      numeric(14,2) not null check (monto <> 0),
  par        uuid,
  fecha      date not null,
  nota       text not null default '' check (char_length(nota) <= 200),
  creado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ajustes_cuenta_idx on public.ajustes_cuenta (cuenta_id, fecha desc);

alter table public.ajustes_cuenta enable row level security;
revoke all on public.ajustes_cuenta from anon, authenticated;

-- ------------------------------------------------------------
-- 3. CADA MOVIMIENTO, EN SU CUENTA
-- ------------------------------------------------------------
alter table public.movimientos
  add column if not exists cuenta_id uuid references public.cuentas_dinero (id) on delete set null;

create index if not exists movimientos_cuenta_idx
  on public.movimientos (cuenta_id) where cuenta_id is not null;

create or replace function public.cuenta_de_metodo(p_empresa uuid, p_metodo text)
returns uuid language sql stable security definer set search_path = public as $fn$
  select c.id from public.cuentas_dinero c
  where c.empresa_id = p_empresa and c.activa and p_metodo = any (c.metodos)
  order by c.orden, c.created_at
  limit 1;
$fn$;

revoke all on function public.cuenta_de_metodo(uuid, text) from public, anon, authenticated;

create or replace function public.anotar_en_su_cuenta()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'UPDATE' and new.metodo_pago is distinct from old.metodo_pago then
    -- Si se corrige la forma de pago, el movimiento se muda de cuenta.
    new.cuenta_id := public.cuenta_de_metodo(new.empresa_id, new.metodo_pago);
  elsif tg_op = 'UPDATE' and new.cuenta_id is distinct from old.cuenta_id
        and new.cuenta_id is not null
        and not exists (select 1 from public.cuentas_dinero c
                        where c.id = new.cuenta_id and c.empresa_id = new.empresa_id) then
    new.cuenta_id := old.cuenta_id;
  elsif tg_op = 'INSERT' then
    -- Una cuenta de OTRO negocio no se acepta aunque alguien arme el pedido a
    -- mano: sería meterle plata en el saldo de un desconocido.
    if new.cuenta_id is not null
       and not exists (select 1 from public.cuentas_dinero c
                       where c.id = new.cuenta_id and c.empresa_id = new.empresa_id) then
      new.cuenta_id := null;
    end if;
    if new.cuenta_id is null then
      new.cuenta_id := public.cuenta_de_metodo(new.empresa_id, new.metodo_pago);
    end if;
  end if;
  return new;
end $fn$;

revoke all on function public.anotar_en_su_cuenta() from public, anon, authenticated;

drop trigger if exists anotar_en_su_cuenta on public.movimientos;
create trigger anotar_en_su_cuenta
  before insert or update on public.movimientos
  for each row execute function public.anotar_en_su_cuenta();

-- ------------------------------------------------------------
-- 4. EL SALDO
-- ------------------------------------------------------------
create or replace function public.saldo_cuenta_dinero(p_cuenta uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select c.saldo_inicial
       + coalesce((select sum(case when m.tipo = 'gasto' then -m.monto else m.monto end)
                   from public.movimientos m
                   where m.cuenta_id = c.id and m.empresa_id = c.empresa_id and m.estado = 'activo'), 0)
       + coalesce((select sum(a.monto) from public.ajustes_cuenta a where a.cuenta_id = c.id), 0)
  from public.cuentas_dinero c
  where c.id = p_cuenta;
$fn$;

revoke all on function public.saldo_cuenta_dinero(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. LA BILLETERA ENTERA
-- ------------------------------------------------------------
create or replace function public.billetera(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_cuentas jsonb;
  v_zona    text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nombre', c.nombre,
    'tipo', c.tipo,
    'metodos', to_jsonb(c.metodos),
    'saldo', s.saldo,
    -- Lo que se movió este mes por esta cuenta, para que el número no esté solo.
    'entro_mes', coalesce(mes.entro, 0),
    'salio_mes', coalesce(mes.salio, 0)
  ) order by c.orden, c.created_at), '[]'::jsonb)
  into v_cuentas
  from public.cuentas_dinero c
  cross join lateral (select public.saldo_cuenta_dinero(c.id) as saldo) s
  left join lateral (
    select
      sum(m.monto) filter (where m.tipo <> 'gasto') as entro,
      sum(m.monto) filter (where m.tipo = 'gasto')  as salio
    from public.movimientos m
    where m.cuenta_id = c.id and m.estado = 'activo'
      and m.fecha >= date_trunc('month', (now() at time zone v_zona))::date
  ) mes on true
  where c.empresa_id = p_empresa and c.activa;

  return jsonb_build_object(
    'cuentas', v_cuentas,
    'total', coalesce((select sum((x->>'saldo')::numeric) from jsonb_array_elements(v_cuentas) x), 0)
  );
end $fn$;

revoke all on function public.billetera(uuid) from public, anon;
grant execute on function public.billetera(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. CREAR O EDITAR UNA CUENTA
--
--    El saldo inicial se escribe al crearla y después no se toca: una
--    corrección posterior es un ajuste con fecha (ver 7). Si se toca el
--    inicial, cambia todo el pasado sin dejar rastro.
--
--    Una forma de pago va a una sola cuenta: marcar «transferencia» en el
--    Itaú la saca del Familiar. Si no, cada cobro tendría dos casas.
-- ------------------------------------------------------------
create or replace function public.guardar_cuenta_dinero(
  p_empresa       uuid,
  p_nombre        text,
  p_tipo          text default 'banco',
  p_saldo_inicial numeric default 0,
  p_metodos       text[] default '{}',
  p_id            uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id      uuid;
  v_metodos text[];
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre: el del banco, «Efectivo», «Tigo Money».' using errcode = '22023';
  end if;

  if coalesce(p_tipo, '') not in ('banco', 'efectivo', 'billetera') then
    raise exception 'Ese tipo de cuenta no existe.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct m), '{}') into v_metodos
  from unnest(coalesce(p_metodos, '{}')) m
  where m in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro');

  if p_id is null then
    if (select count(*) from public.cuentas_dinero where empresa_id = p_empresa and activa) >= 20 then
      raise exception 'Ya tenés 20 cuentas. Archivá alguna antes de sumar otra.' using errcode = '22023';
    end if;

    insert into public.cuentas_dinero (empresa_id, nombre, tipo, saldo_inicial, metodos, orden, creada_por)
    values (p_empresa, trim(p_nombre), p_tipo, coalesce(p_saldo_inicial, 0), v_metodos,
            coalesce((select max(orden) + 1 from public.cuentas_dinero where empresa_id = p_empresa), 0),
            auth.uid())
    returning id into v_id;
  else
    update public.cuentas_dinero
    set nombre = trim(p_nombre), tipo = p_tipo, metodos = v_metodos, updated_at = now()
    where id = p_id and empresa_id = p_empresa and activa
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
    end if;
  end if;

  -- Cada forma de pago, en una sola casa.
  update public.cuentas_dinero
  set metodos = array(select x from unnest(metodos) x where not (x = any (v_metodos))),
      updated_at = now()
  where empresa_id = p_empresa and id <> v_id and metodos && v_metodos;

  return v_id;
end $fn$;

revoke all on function public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid) from public, anon;
grant execute on function public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. AJUSTAR EL SALDO A LO QUE DICE EL BANCO
-- ------------------------------------------------------------
create or replace function public.ajustar_saldo_cuenta(
  p_empresa    uuid,
  p_cuenta     uuid,
  p_saldo_real numeric,
  p_nota       text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo numeric;
  v_dif   numeric;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if p_saldo_real is null then
    raise exception 'Escribí cuánto dice tu banco que tenés.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.cuentas_dinero where id = p_cuenta and empresa_id = p_empresa and activa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  v_saldo := public.saldo_cuenta_dinero(p_cuenta);
  v_dif := round(p_saldo_real - v_saldo, 2);

  if v_dif <> 0 then
    insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, fecha, nota, creado_por)
    values (p_empresa, p_cuenta, 'ajuste', v_dif, public.hoy_empresa(p_empresa),
            left(coalesce(trim(p_nota), ''), 200), auth.uid());
  end if;

  return jsonb_build_object('ok', true, 'antes', v_saldo, 'ahora', p_saldo_real, 'diferencia', v_dif);
end $fn$;

revoke all on function public.ajustar_saldo_cuenta(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.ajustar_saldo_cuenta(uuid, uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 8. PASAR PLATA DE UNA CUENTA A OTRA
-- ------------------------------------------------------------
create or replace function public.transferir_entre_cuentas(
  p_empresa uuid,
  p_desde   uuid,
  p_hacia   uuid,
  p_monto   numeric,
  p_nota    text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_par uuid := gen_random_uuid();
  v_hoy date;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_desde = p_hacia then
    raise exception 'Elegí dos cuentas distintas.' using errcode = '22023';
  end if;

  if (select count(*) from public.cuentas_dinero
      where id in (p_desde, p_hacia) and empresa_id = p_empresa and activa) <> 2 then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  v_hoy := public.hoy_empresa(p_empresa);

  insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, par, fecha, nota, creado_por)
  values
    (p_empresa, p_desde, 'transferencia', -p_monto, v_par, v_hoy, left(coalesce(trim(p_nota), ''), 200), auth.uid()),
    (p_empresa, p_hacia, 'transferencia',  p_monto, v_par, v_hoy, left(coalesce(trim(p_nota), ''), 200), auth.uid());

  return jsonb_build_object('ok', true, 'par', v_par);
end $fn$;

revoke all on function public.transferir_entre_cuentas(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.transferir_entre_cuentas(uuid, uuid, uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 9. SACAR UNA CUENTA
--
--    Sin historia se borra. Con historia se archiva: los movimientos viejos
--    siguen diciendo de dónde salieron, y deja de recibir los nuevos.
-- ------------------------------------------------------------
create or replace function public.quitar_cuenta_dinero(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.cuentas_dinero where id = p_id and empresa_id = p_empresa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.movimientos where cuenta_id = p_id)
     or exists (select 1 from public.ajustes_cuenta where cuenta_id = p_id) then
    update public.cuentas_dinero set activa = false, metodos = '{}', updated_at = now()
    where id = p_id;
    return jsonb_build_object('ok', true, 'archivada', true);
  end if;

  delete from public.cuentas_dinero where id = p_id;
  return jsonb_build_object('ok', true, 'archivada', false);
end $fn$;

revoke all on function public.quitar_cuenta_dinero(uuid, uuid) from public, anon;
grant execute on function public.quitar_cuenta_dinero(uuid, uuid) to authenticated;
