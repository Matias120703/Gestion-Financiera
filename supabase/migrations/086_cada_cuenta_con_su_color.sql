-- ============================================================
-- 086 · CADA CUENTA CON SU COLOR
-- ============================================================
--
-- Matías: «los colores de cada banco. El Ueno es verde, el Atlas rojo
-- oscuro, el Continental azul marino, el Familiar celeste».
--
-- PARA QUÉ
--
-- En el panel las cuentas son tarjetas que se deslizan de costado. Con seis
-- tarjetas iguales hay que leer cada nombre para saber cuál es; con seis
-- colores no hace falta leer. La pantalla ya sabe pintar los bancos que
-- reconoce por el nombre —eso no necesita base—, pero dos cosas sí:
--
--   · el banco que no está en esa lista, que hay muchos;
--   · y el gusto de cada uno, que gana siempre sobre lo que adivinemos.
--
-- POR NOMBRE Y NO POR CÓDIGO DE COLOR
--
-- Se guarda «azul», no «#1B3A6B». Dos motivos. Uno: un código libre deja
-- entrar blanco sobre blanco, y una cuenta que no se ve. Dos: el tono exacto
-- depende de si la pantalla está en claro o en oscuro, y eso lo sabe la
-- pantalla, no la base. Guardando el nombre, retocar un tono es cambiar una
-- línea en el código y no tocar una sola fila.
--
-- En null significa «el que corresponda»: el del banco si lo reconocemos, y
-- si no uno sacado del nombre. Nadie queda sin color.

-- ------------------------------------------------------------
-- 1. LA COLUMNA
-- ------------------------------------------------------------
alter table public.cuentas_dinero
  add column if not exists color text;

alter table public.cuentas_dinero drop constraint if exists cuentas_dinero_color_check;
alter table public.cuentas_dinero
  add constraint cuentas_dinero_color_check
  check (color is null or color in
    ('verde', 'rojo', 'azul', 'celeste', 'naranja', 'violeta', 'rosa', 'gris'));

comment on column public.cuentas_dinero.color is
  'Color elegido a mano. Null: lo decide la pantalla por el nombre del banco (086).';

-- ------------------------------------------------------------
-- 2. GUARDARLO AL CREAR O EDITAR
--
--    La firma vieja se borra antes de crear la nueva. `create or replace`
--    con un parámetro más no reemplaza: crea una segunda función al lado, y
--    entonces la llamada de siempre se vuelve ambigua y PostgreSQL la
--    rechaza. La pantalla dejaría de poder guardar una cuenta.
-- ------------------------------------------------------------
drop function if exists public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid);

create or replace function public.guardar_cuenta_dinero(
  p_empresa       uuid,
  p_nombre        text,
  p_tipo          text default 'banco',
  p_saldo_inicial numeric default 0,
  p_metodos       text[] default '{}',
  p_id            uuid default null,
  p_color         text default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id      uuid;
  v_metodos text[];
  v_color   text;
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

  -- Un color que no conocemos no es motivo para no guardar la cuenta: se
  -- deja en null y la pantalla elige. Lo que se pierde es una preferencia;
  -- lo que se salvaría rechazando, nada.
  v_color := case
    when p_color in ('verde', 'rojo', 'azul', 'celeste', 'naranja', 'violeta', 'rosa', 'gris')
    then p_color else null end;

  select coalesce(array_agg(distinct m), '{}') into v_metodos
  from unnest(coalesce(p_metodos, '{}')) m
  where m in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro');

  if p_id is null then
    if (select count(*) from public.cuentas_dinero where empresa_id = p_empresa and activa) >= 20 then
      raise exception 'Ya tenés 20 cuentas. Archivá alguna antes de sumar otra.' using errcode = '22023';
    end if;

    insert into public.cuentas_dinero (empresa_id, nombre, tipo, saldo_inicial, metodos, color, orden, creada_por)
    values (p_empresa, trim(p_nombre), p_tipo, coalesce(p_saldo_inicial, 0), v_metodos, v_color,
            coalesce((select max(orden) + 1 from public.cuentas_dinero where empresa_id = p_empresa), 0),
            auth.uid())
    returning id into v_id;
  else
    update public.cuentas_dinero
    set nombre = trim(p_nombre), tipo = p_tipo, metodos = v_metodos, color = v_color, updated_at = now()
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

revoke all on function public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid, text) from public, anon;
grant execute on function public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 3. Y QUE LLEGUE A LA PANTALLA
--
--    Sin esto la columna existe y no la ve nadie. Va en las dos funciones
--    que arman cuentas para mostrar.
-- ------------------------------------------------------------
create or replace function public.billetera(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_cuentas jsonb;
  v_zona    text;
  v_sueltos record;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nombre', c.nombre,
    'tipo', c.tipo,
    'color', c.color,
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

  -- Lo que se cargó y no llegó a ninguna cuenta. El neto y no la suma a
  -- secas: un gasto de 100 y un ingreso de 100 sin asignar no son 200 de
  -- desajuste, son cero.
  select count(*)::int as cantidad,
         coalesce(sum(case when m.tipo = 'gasto' then -m.monto else m.monto end), 0) as neto,
         min(m.fecha) as desde
  into v_sueltos
  from public.movimientos m
  where m.empresa_id = p_empresa and m.estado = 'activo' and m.cuenta_id is null;

  return jsonb_build_object(
    'cuentas', v_cuentas,
    'total', coalesce((select sum((x->>'saldo')::numeric) from jsonb_array_elements(v_cuentas) x), 0),
    'sin_cuenta', jsonb_build_object(
      'cantidad', coalesce(v_sueltos.cantidad, 0),
      'neto',     coalesce(v_sueltos.neto, 0),
      'desde',    v_sueltos.desde
    ),
    'metodos_sin_cuenta', (
      select coalesce(jsonb_agg(m order by m), '[]'::jsonb)
      from unnest(array['efectivo', 'transferencia', 'tarjeta', 'credito', 'otro']) m
      where exists (select 1 from public.cuentas_dinero c2
                    where c2.empresa_id = p_empresa and c2.activa)
        and not exists (select 1 from public.cuentas_dinero c3
                        where c3.empresa_id = p_empresa and c3.activa and m = any (c3.metodos))
    )
  );
end $fn$;

create or replace function public.cuentas_para_elegir(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
                    'id', c.id, 'nombre', c.nombre, 'tipo', c.tipo, 'color', c.color,
                    'metodos', to_jsonb(c.metodos))
                            order by c.orden, c.created_at), '[]'::jsonb)
  into v_lista
  from public.cuentas_dinero c
  where c.empresa_id = p_empresa and c.activa;

  return v_lista;
end $fn$;
