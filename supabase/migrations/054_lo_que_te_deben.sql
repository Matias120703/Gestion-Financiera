-- ============================================================
-- ORDEN · Migración 054 · Lo que te deben
--
-- EL ERROR QUE ESTABA A MEDIO HACER
--
-- La forma de cobro «Fiado» ya existía: se podía marcar una venta como
-- fiada. Pero no se guardaba QUIÉN debe, ni si alguna vez pagó, y —lo
-- grave— esa venta sumaba como ingreso del día igual que si te hubieran
-- pagado en efectivo. El método de pago solo se usaba para agrupar, nunca
-- para descontar.
--
-- Vendés 500.000 fiado y el panel te dice que ganaste 500.000. Esa plata no
-- está en tu bolsillo. Es exactamente lo que este sistema promete no hacer.
--
-- POR QUÉ NO VA ADENTRO DE `deudas`
--
-- `deudas` es lo que el negocio DEBE: tiene una columna `acreedor`, a quién
-- le debés. Meter las dos direcciones en la misma tabla obliga a que cada
-- consulta que ya existe lleve un filtro nuevo, y el día que alguien se
-- olvide de uno, tu deuda va a aparecer sumando como plata tuya. Ese error
-- no avisa: da un número lindo y falso.
--
-- CÓMO SE MODELA
--
-- No como «una deuda por cliente con su saldo», sino como un LIBRO: cada
-- línea es «se le fio tanto» o «me pagó tanto», y el saldo es la resta.
--
-- Un saldo guardado se desincroniza —basta una línea borrada, un pago
-- cargado dos veces, un UPDATE a mano— y cuando eso pasa nadie se entera
-- hasta que el cliente reclama. Sumando el libro, el saldo no puede estar
-- mal: es lo que hay escrito.
--
-- SIRVE PARA LOS DOS TIPOS DE CUENTA
--
-- Un almacén fía; a una persona también le deben. Y quien debe puede ser
-- una persona o un negocio —«hoy me llevó tanto el supermercado»—, que es
-- por lo que el que debe es un `cliente` y un cliente es solo un nombre con
-- un teléfono.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EL LIBRO
--
--    `venta_id` enlaza la línea con la venta que la originó, cuando vino de
--    una. Es lo que permite que anular una venta fiada borre la deuda que
--    creó, en vez de dejarla viva reclamando plata por algo que no pasó.
--
--    Y es opcional, porque el otro caso es igual de real: «David me debe
--    500.000» dicho en un audio, sin ninguna venta detrás.
-- ------------------------------------------------------------
create table if not exists public.fiado (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  cliente_id uuid not null,
  -- 'fio'   → le fiaste: te deben más.
  -- 'cobro' → te pagó: te deben menos.
  tipo       text not null check (tipo in ('fio', 'cobro')),
  monto      numeric(14,2) not null check (monto > 0),
  fecha      date not null,
  concepto   text not null default '' check (char_length(concepto) <= 200),
  -- La venta que lo originó, si vino de una.
  venta_id   uuid references public.movimientos (id) on delete cascade,
  -- El movimiento de ingreso que generó el cobro, para poder anularlo junto.
  cobro_id   uuid references public.movimientos (id) on delete set null,
  creado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- El mismo candado estructural de siempre: una línea de fiado no puede
  -- apuntar al cliente de otro negocio.
  constraint fiado_cliente_misma_empresa
    foreign key (cliente_id, empresa_id)
    references public.clientes (id, empresa_id) on delete cascade,

  constraint fiado_fecha_razonable check (fecha >= date '2000-01-01')
);

comment on table public.fiado is
  'Libro de lo que le deben al negocio. Cada línea suma o resta; el saldo es la resta, nunca un número guardado.';

create index if not exists fiado_cliente_idx on public.fiado (cliente_id, fecha desc);
create index if not exists fiado_empresa_idx on public.fiado (empresa_id, fecha desc);
create index if not exists fiado_venta_idx   on public.fiado (venta_id) where venta_id is not null;

alter table public.fiado enable row level security;

-- Se lee como miembro; se escribe solo por función, porque hay que validar
-- el cliente, la fecha y el tope contra lo que realmente se debe.
drop policy if exists fiado_select on public.fiado;
create policy fiado_select on public.fiado
  for select using (public.es_miembro(empresa_id));

revoke all on public.fiado from anon, authenticated;
grant select on public.fiado to authenticated;

-- ------------------------------------------------------------
-- 2. CUÁNTO DEBE UNO
--
--    Una sola definición del saldo. Si esta cuenta estuviera repetida en la
--    pantalla, en el reporte y en el Excel, tarde o temprano una de las tres
--    diría otra cosa — y ninguna sabría cuál está mal.
-- ------------------------------------------------------------
create or replace function public.saldo_fiado(p_cliente uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select coalesce(sum(
    case when f.tipo = 'fio' then f.monto else -f.monto end
  ), 0)::numeric
  from public.fiado f
  where f.cliente_id = p_cliente;
$fn$;

revoke all on function public.saldo_fiado(uuid) from public, anon;
grant execute on function public.saldo_fiado(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. ANOTAR QUE ALGUIEN TE DEBE
--
--    Cualquier miembro: el que fía es el que está en el mostrador.
-- ------------------------------------------------------------
create or replace function public.anotar_fiado(
  p_empresa  uuid,
  p_cliente  uuid,
  p_monto    numeric,
  p_concepto text default '',
  p_fecha    date default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.clientes
                 where id = p_cliente and empresa_id = p_empresa) then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  insert into public.fiado (empresa_id, cliente_id, tipo, monto, fecha, concepto, creado_por)
  values (p_empresa, p_cliente, 'fio', p_monto,
          coalesce(p_fecha, public.hoy_empresa(p_empresa)),
          left(coalesce(p_concepto, ''), 200), auth.uid())
  returning id into v_id;

  return v_id;
end $fn$;

revoke all on function public.anotar_fiado(uuid, uuid, numeric, text, date) from public, anon;
grant execute on function public.anotar_fiado(uuid, uuid, numeric, text, date) to authenticated;

-- ------------------------------------------------------------
-- 4. COBRAR
--
--    ACÁ ES DONDE LA PLATA ENTRA DE VERDAD, y por eso acá —y no en la venta
--    fiada— es donde se registra el ingreso.
--
--    El movimiento se crea primero: si falla, no queremos haber bajado el
--    saldo. Es la misma secuencia que `registrar_pago_deuda` (015), por la
--    misma razón.
--
--    No se puede cobrar más de lo que se debe. Un saldo negativo no
--    significa nada: si el cliente pagó de más, eso es otra cosa (un
--    adelanto) y no se resuelve fingiendo que debe menos que cero.
-- ------------------------------------------------------------
create or replace function public.cobrar_fiado(
  p_empresa uuid,
  p_cliente uuid,
  p_monto   numeric,
  p_metodo  text default 'efectivo',
  p_fecha   date default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo   numeric;
  v_nombre  text;
  v_fecha   date;
  v_mov     uuid;
  v_id      uuid;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  select nombre into v_nombre from public.clientes
  where id = p_cliente and empresa_id = p_empresa;
  if v_nombre is null then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  v_saldo := public.saldo_fiado(p_cliente);
  if v_saldo <= 0 then
    raise exception '% no te debe nada.', v_nombre using errcode = '22023';
  end if;
  if p_monto > v_saldo then
    raise exception '% te debe %, no podés cobrarle más que eso.', v_nombre, v_saldo
      using errcode = '22023';
  end if;

  if coalesce(p_metodo, '') not in ('efectivo', 'transferencia', 'tarjeta', 'otro') then
    raise exception 'Esa forma de cobro no es válida.' using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  -- Entra como «otro ingreso» y NO como venta: la venta ya se registró el
  -- día que se entregó la mercadería. Contarla otra vez acá duplicaría la
  -- facturación del negocio.
  insert into public.movimientos (
    empresa_id, tipo, fecha, descripcion, categoria,
    subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por
  ) values (
    p_empresa, 'ingreso', v_fecha,
    'Cobro de fiado · ' || v_nombre, 'Fiado',
    p_monto, 0, p_monto, 0, coalesce(p_metodo, 'efectivo'), left(v_nombre, 80), auth.uid()
  )
  returning id into v_mov;

  insert into public.fiado (
    empresa_id, cliente_id, tipo, monto, fecha, concepto, cobro_id, creado_por
  ) values (
    p_empresa, p_cliente, 'cobro', p_monto, v_fecha, 'Pago recibido', v_mov, auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'movimiento', v_mov,
    'saldo', public.saldo_fiado(p_cliente)
  );
end $fn$;

revoke all on function public.cobrar_fiado(uuid, uuid, numeric, text, date) from public, anon;
grant execute on function public.cobrar_fiado(uuid, uuid, numeric, text, date) to authenticated;

-- ------------------------------------------------------------
-- 5. LO QUE TE DEBEN, TODO JUNTO
--
--    El total y la lista de quiénes. Es la pantalla, y es también el número
--    que el panel necesita para poder decir la verdad.
--
--    `dias` es cuántos hace de la línea más vieja sin saldar. No es un
--    adorno: la diferencia entre «me deben 800.000» y «me deben 800.000
--    desde hace cuatro meses» es toda.
-- ------------------------------------------------------------
create or replace function public.resumen_fiado(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  with saldos as (
    select
      f.cliente_id,
      sum(case when f.tipo = 'fio' then f.monto else -f.monto end)::numeric as saldo,
      min(f.fecha) filter (where f.tipo = 'fio') as desde
    from public.fiado f
    where f.empresa_id = p_empresa
    group by f.cliente_id
  ),
  conNombre as (
    select
      s.cliente_id, c.nombre, c.telefono, s.saldo, s.desde,
      (public.hoy_empresa(p_empresa) - s.desde) as dias
    from saldos s
    join public.clientes c on c.id = s.cliente_id
    -- Quien ya pagó todo no aparece en «lo que te deben». Sigue en Clientes.
    where s.saldo > 0
  )
  select jsonb_build_object(
    'total',    coalesce((select sum(saldo) from conNombre), 0),
    'cuantos',  coalesce((select count(*) from conNombre), 0),
    'clientes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.saldo desc)
      from conNombre x
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.resumen_fiado(uuid) from public, anon;
grant execute on function public.resumen_fiado(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. EL MOVIMIENTO DE UN CLIENTE
-- ------------------------------------------------------------
create or replace function public.libro_fiado(p_cliente uuid, p_limite integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_empresa uuid;
  v_res     jsonb;
begin
  select empresa_id into v_empresa from public.clientes where id = p_cliente;
  if v_empresa is null then
    raise exception 'Ese cliente no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha desc, x.created_at desc), '[]'::jsonb)
  into v_res
  from (
    select f.id, f.tipo, f.monto, f.fecha, f.concepto, f.venta_id, f.created_at
    from public.fiado f
    where f.cliente_id = p_cliente
    order by f.fecha desc, f.created_at desc
    limit least(greatest(coalesce(p_limite, 100), 1), 500)
  ) x;

  return v_res;
end $fn$;

revoke all on function public.libro_fiado(uuid, integer) from public, anon;
grant execute on function public.libro_fiado(uuid, integer) to authenticated;
