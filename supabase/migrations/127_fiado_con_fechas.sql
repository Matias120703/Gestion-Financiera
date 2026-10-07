-- ============================================================
-- 127 · EL FIADO CON FECHA DE COBRO Y EN CUOTAS
-- ============================================================
--
-- Matías (07/10/2026): una venta a crédito puede llevar fecha de cobro, una
-- sola o en cuotas (cuántas, cada cuánto, la primera fecha); el negocio
-- recibe un aviso a la mañana el día que le toca cobrar; y lo de siempre
-- («me debe y punto», sin fecha) sigue igual, en la misma pantalla.
--
-- LA IDEA, ENTERA
--
--   · EL LIBRO NO SE TOCA. `fiado` sigue siendo un libro de líneas y lo que
--     alguien debe sigue siendo `saldo_fiado()` (054): la suma del libro.
--     Las cuotas son un CALENDARIO ENCIMA: una tabla aparte,
--     `fiado_cuotas`, que cuelga de la línea 'fio' y se va con ella.
--   · NADA GUARDADO DE «PAGADA». Si una cuota está pagada se calcula al
--     leer, desde el libro (`estado_cuotas`). Si mañana se borrara la tabla
--     de cuotas, nadie debería un guaraní distinto.
--   · UN COBRO PUEDE DECIR DE QUÉ DEUDA ES (`fiado.fio_id`). Sin eso, un
--     cliente con libreta vieja y una heladera en cuotas paga la cuota, Orden
--     marca la libreta, y al día siguiente el aviso dice «Juan atrasado»
--     cuando pagó.
--   · SIN INTERESES NI RECARGOS. Una cuota atrasada vale lo que valía.
--
-- SE APLICA ANTES DE DESPLEGAR EL CÓDIGO NUEVO
--
-- Con esta migración aplicada, el código publicado hoy tiene que seguir
-- andando igual. Por eso:
--   · `anotar_fiado`, `cobrar_fiado` y `guardar_preferencias` conservan sus
--     parámetros de siempre, con el mismo nombre y en el mismo orden; lo
--     nuevo va al final y con valor por defecto;
--   · `resumen_fiado`, `libro_fiado`, `cobrar_fiado` y `mis_preferencias`
--     devuelven las claves de siempre y solo SUMAN claves;
--   · `registrar_venta` no se toca: Vender programa las cuotas con una
--     segunda llamada (`programar_cuotas`), y la venta nunca se deshace por
--     el plan.
-- La firma vieja de las tres primeras se borra antes de crear la nueva: con
-- las dos vivas, una llamada con los argumentos de siempre sería ambigua
-- (084, 071).
--
-- ESTE ARCHIVO NO TIENE NI UNA BARRA INVERTIDA, A PROPÓSITO: la herramienta
-- que lo aplica en producción las altera (30/09/2026). Nada de escapes ni de
-- expresiones regulares.
--
-- Idempotente: se puede aplicar dos veces.
-- ============================================================


-- ------------------------------------------------------------
-- 1. EL CALENDARIO: UNA FILA POR CUOTA
--
--    Una sola fecha es un plan de una cuota. No hay columna de «pagada», de
--    «estado» ni de «saldo»: eso se calcula (bloque 4).
--
--    INVARIANTE (la cuida programar_cuotas): las cuotas de una línea suman
--    el monto de esa línea. `fiado.monto` no se puede modificar por ninguna
--    función ni por RLS, así que no se desacomoda.
-- ------------------------------------------------------------
create table if not exists public.fiado_cuotas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  cliente_id  uuid not null,
  -- La línea 'fio' del libro (venta fiada o fiado a mano). Si esa línea se va
  -- (anular la venta, borrarla, empezar de cero), el calendario se va con ella.
  fio_id      uuid not null references public.fiado (id) on delete cascade,
  numero      smallint not null check (numero between 1 and 60),
  vence_el    date not null check (vence_el >= date '2000-01-01'),
  monto       numeric(14,2) not null check (monto > 0),
  -- El día que el negocio le escribió al cliente por ESTA cuota (el botón de
  -- WhatsApp). Si la cuota se mueve de fecha, vuelve a null.
  avisado_el  date,
  creado_por  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),

  -- El candado estructural de siempre: una cuota no puede apuntar al cliente
  -- de otro negocio.
  constraint fiado_cuotas_cliente_misma_empresa
    foreign key (cliente_id, empresa_id)
    references public.clientes (id, empresa_id) on delete cascade,
  constraint fiado_cuotas_una_por_numero unique (fio_id, numero)
);

comment on table public.fiado_cuotas is
  'Cuándo se espera cobrar cada parte de un fiado (127). Si una cuota está pagada se calcula desde el libro (estado_cuotas); nunca se guarda.';

create index if not exists fiado_cuotas_cliente_idx on public.fiado_cuotas (cliente_id, vence_el);
create index if not exists fiado_cuotas_empresa_idx on public.fiado_cuotas (empresa_id, vence_el);
create index if not exists fiado_cuotas_fio_idx     on public.fiado_cuotas (fio_id);

alter table public.fiado_cuotas enable row level security;

-- Se lee como miembro; se escribe solo por función, igual que el libro (054):
-- hay que validar que las cuotas sumen lo que suma la deuda.
drop policy if exists fiado_cuotas_select on public.fiado_cuotas;
create policy fiado_cuotas_select on public.fiado_cuotas
  for select using (public.es_miembro(empresa_id));

revoke all on public.fiado_cuotas from anon, authenticated;
grant select on public.fiado_cuotas to authenticated;

-- El candado de la cuenta vencida. El bucle de la 111 no conoce esta tabla,
-- así que se crea a mano. Solo INSERT y UPDATE: el DELETE queda libre a
-- propósito, porque anular una venta, borrar una línea y «empezar de cero»
-- tienen que poder llevarse las cuotas siempre.
drop trigger if exists cuenta_activa_fiado_cuotas on public.fiado_cuotas;
create trigger cuenta_activa_fiado_cuotas
  before insert or update on public.fiado_cuotas
  for each row execute function public.exigir_cuenta_activa();


-- ------------------------------------------------------------
-- 2. A QUÉ DEUDA VA CADA COBRO
--
--    Solo en líneas 'cobro': «este pago es de ESA deuda» (una línea 'fio'
--    con cuotas). Se apunta a la deuda y no a la cuota: adentro de una deuda
--    las cuotas se tapan en orden, así rearmar o mover cuotas nunca obliga a
--    reasignar pagos.
--
--    En null es un pago suelto, como todos los de hasta hoy: baja primero lo
--    que no tiene fecha y, si sobra, tapa cuotas por fecha.
--
--    ON DELETE SET NULL: si la deuda se va («empezar de cero»), el pago queda
--    como pago suelto. Ese UPDATE pasa el candado por la marca
--    orden.vaciando, igual que el de `cobro_id`.
-- ------------------------------------------------------------
alter table public.fiado
  add column if not exists fio_id uuid references public.fiado (id) on delete set null;

comment on column public.fiado.fio_id is
  'En un cobro: de qué deuda con cuotas es este pago. Null = pago suelto (127).';

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'fiado_fio_solo_en_cobros'
                   and conrelid = 'public.fiado'::regclass) then
    alter table public.fiado
      add constraint fiado_fio_solo_en_cobros check (fio_id is null or tipo = 'cobro');
  end if;
end $$;

create index if not exists fiado_fio_idx on public.fiado (fio_id) where fio_id is not null;


-- ------------------------------------------------------------
-- 3. DOS AYUDAS INTERNAS
--
--    Ninguna se le da a nadie: las usan las funciones de abajo.
-- ------------------------------------------------------------

-- «600.000» y no «600000.00»: los mensajes los lee una persona. Es el mismo
-- formato que ya usaba cobrar_fiado (084), en un solo lugar.
create or replace function public.fiado_monto_texto(p_monto numeric)
returns text language sql immutable set search_path = public as $fn$
  select case when p_monto = trunc(p_monto)
              then replace(to_char(p_monto, 'FM999,999,999,990'), ',', '.')
              else p_monto::text end;
$fn$;

revoke all on function public.fiado_monto_texto(numeric) from public, anon, authenticated;

-- ¿Esta cuenta tiene la pantalla de Fiado? Espejo de `src/lib/rubros.ts`
-- (la ficha de cada rubro): la tienen todos menos el profe y el personal
-- trainer, a quienes les deben inscripciones y no fiado. La cuenta personal
-- la tiene (con el Pro; eso lo pregunta es_gratis_personal).
-- Sirve para una sola cosa: no mandarle el aviso de cobros a quien no puede
-- abrir la pantalla a la que el aviso lo lleva.
create or replace function public.rubro_tiene_fiado(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p_tipo_cuenta, 'emprendedor') = 'personal'
      or coalesce(p_rubro, 'comercio') not in ('clases', 'entrenamiento');
$fn$;

revoke all on function public.rubro_tiene_fiado(text, text) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 4. QUÉ CUOTA ESTÁ PAGADA: LA ÚNICA REGLA
--
--    Nada guardado; se calcula al leer, como el saldo. Para un cliente:
--
--      saldo      lo de siempre: lo fiado menos lo cobrado. MANDA.
--      F0         lo fiado SIN cuotas («sin fecha»).
--      L(p)       los cobros que dicen ser de la deuda p (fio_id = p), siendo
--                 p una línea CON cuotas.
--      U          los cobros sueltos: sin fio_id, o apuntando a una línea que
--                 hoy no tiene cuotas.
--      sin fecha  lo que queda de F0 después de U (nunca menos que cero).
--      derrame    lo suelto que SOBRA de lo sin fecha: tapa cuotas por fecha.
--
--    Dos pasadas:
--      1. adentro de cada deuda, por NÚMERO de cuota (el orden del plan, no
--         la fecha: mover una cuota no cambia cuál se pagó), se descuenta
--         L(p);
--      2. entre todas las cuotas del cliente, por fecha, se descuenta el
--         derrame.
--
--    LO QUE SIEMPRE SE CUMPLE (y las pruebas lo afirman después de cada
--    paso): sin fecha + lo pendiente de todas las cuotas = el saldo del
--    libro (o cero, si el libro quedó por debajo de cero).
--
--    El derrame es la red, no el mecanismo: la pantalla manda siempre de qué
--    cuota es el pago cuando hay deudas con cuotas.
-- ------------------------------------------------------------

-- F0 y U, en un solo lugar: de acá salen «lo sin fecha» y el derrame.
create or replace function public.partes_fiado(p_cliente uuid)
returns table (f0 numeric, u numeric)
language sql stable security definer set search_path = public as $fn$
  select
    coalesce(sum(f.monto) filter (
      where f.tipo = 'fio'
        and not exists (select 1 from public.fiado_cuotas q where q.fio_id = f.id)
    ), 0)::numeric,
    coalesce(sum(f.monto) filter (
      where f.tipo = 'cobro'
        and (f.fio_id is null
             or not exists (select 1 from public.fiado_cuotas q where q.fio_id = f.fio_id))
    ), 0)::numeric
  from public.fiado f
  where f.cliente_id = p_cliente;
$fn$;

revoke all on function public.partes_fiado(uuid) from public, anon, authenticated;

create or replace function public.sin_fecha_fiado(p_cliente uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select greatest(0, p.f0 - p.u) from public.partes_fiado(p_cliente) p;
$fn$;

revoke all on function public.sin_fecha_fiado(uuid) from public, anon, authenticated;

create or replace function public.estado_cuotas(p_cliente uuid)
returns table (
  cuota_id   uuid,
  fio_id     uuid,
  numero     smallint,
  de         smallint,
  vence_el   date,
  monto      numeric,
  pagado     numeric,
  pendiente  numeric,
  -- vence_el menos hoy, en la zona del negocio: negativo = atrasada.
  dias       integer,
  avisado_el date,
  concepto   text,
  fecha_fio  date,
  monto_fio  numeric,
  venta_id   uuid
)
language sql stable security definer set search_path = public as $fn$
  with cli as (
    select c.id, public.hoy_empresa(c.empresa_id) as hoy
    from public.clientes c where c.id = p_cliente
  ),
  -- Las deudas: las líneas 'fio' que tienen cuotas.
  deudas as (
    select f.id, f.concepto, f.fecha, f.monto, f.venta_id, f.created_at
    from public.fiado f
    where f.cliente_id = p_cliente and f.tipo = 'fio'
      and exists (select 1 from public.fiado_cuotas q where q.fio_id = f.id)
  ),
  -- L(p): lo cobrado diciendo que es de cada deuda.
  lp as (
    select c.fio_id, sum(c.monto) as total
    from public.fiado c
    where c.cliente_id = p_cliente and c.tipo = 'cobro'
      and c.fio_id in (select d.id from deudas d)
    group by c.fio_id
  ),
  derrame as (
    select greatest(0, p.u - p.f0) as total from public.partes_fiado(p_cliente) p
  ),
  paso1 as (
    select q.id, q.fio_id, q.numero, q.vence_el, q.monto, q.avisado_el,
           d.concepto, d.fecha as fecha_fio, d.monto as monto_fio, d.venta_id,
           d.created_at as creada,
           count(*) over (partition by q.fio_id) as de,
           greatest(0, least(q.monto,
             sum(q.monto) over (partition by q.fio_id order by q.numero
                                rows between unbounded preceding and current row)
             - coalesce(l.total, 0))) as pend1
    from public.fiado_cuotas q
    join deudas d on d.id = q.fio_id
    left join lp l on l.fio_id = q.fio_id
  ),
  paso2 as (
    select p.*,
           greatest(0, least(p.pend1,
             sum(p.pend1) over (order by p.vence_el, p.creada, p.fio_id, p.numero
                                rows between unbounded preceding and current row)
             - (select total from derrame))) as pendiente
    from paso1 p
  )
  select p.id, p.fio_id, p.numero, p.de::smallint, p.vence_el, p.monto,
         p.monto - p.pendiente, p.pendiente,
         (p.vence_el - cli.hoy)::int, p.avisado_el,
         p.concepto, p.fecha_fio, p.monto_fio, p.venta_id
  from paso2 p cross join cli
  order by p.vence_el, p.creada, p.fio_id, p.numero;
$fn$;

revoke all on function public.estado_cuotas(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 5. PONERLE FECHAS A UNA DEUDA
--
--    `p_plan` es la lista de cuotas ya armada:
--      [{"vence_el": "2026-11-15", "monto": 150000}, ...]
--    Una sola fecha es una lista de un elemento. La pantalla reparte; la
--    base solo controla que cierre.
--
--    Se dice la deuda por su línea (`p_fio`) o por la venta (`p_venta`):
--    Vender conoce el id de la venta, no el de la línea del libro.
--
--    Si la línea ya tenía cuotas, se REEMPLAZAN. Los cobros que decían ser de
--    esa deuda siguen apuntando a la línea y se reacomodan solos sobre las
--    cuotas nuevas (bloque 4).
--
--    Cualquier miembro: el que fía es el que pone la fecha (054).
-- ------------------------------------------------------------
create or replace function public.programar_cuotas(
  p_fio   uuid default null,
  p_plan  jsonb default null,
  p_venta uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v        public.fiado;
  v_hoy    date;
  v_item   jsonb;
  v_fecha  date;
  v_monto  numeric;
  v_antes  date;
  v_suma   numeric := 0;
  v_fechas date[] := '{}';
  v_montos numeric[] := '{}';
  v_n      integer;
  v_res    jsonb;
begin
  if p_fio is not null then
    select * into v from public.fiado where id = p_fio;
    if v.id is null then
      raise exception 'Esa línea no es un fiado.' using errcode = 'P0002';
    end if;
  elsif p_venta is not null then
    select * into v from public.fiado where venta_id = p_venta and tipo = 'fio' limit 1;
    if v.id is null then
      raise exception 'Esa venta no tiene fiado.' using errcode = 'P0002';
    end if;
  else
    raise exception 'Esa línea no es un fiado.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if v.tipo <> 'fio' then
    raise exception 'Esa línea no es un fiado.' using errcode = '22023';
  end if;

  -- El mismo candado que al cobrar (056): mientras se arma el plan, nadie le
  -- cobra a este cliente.
  perform 1 from public.clientes where id = v.cliente_id for update;

  if p_plan is null or jsonb_typeof(p_plan) <> 'array' then
    raise exception 'Las cuotas tienen que ser entre 1 y 60.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_plan);
  if v_n < 1 or v_n > 60 then
    raise exception 'Las cuotas tienen que ser entre 1 y 60.' using errcode = '22023';
  end if;

  v_hoy := public.hoy_empresa(v.empresa_id);

  for v_item in select t.value from jsonb_array_elements(p_plan) with ordinality as t(value, pos) order by t.pos loop
    v_fecha := null;
    v_monto := null;

    -- Un texto que no es una fecha, o un 31 de febrero.
    begin
      v_fecha := (v_item ->> 'vence_el')::date;
    exception when others then
      raise exception 'La fecha de la cuota no es válida.' using errcode = '22023';
    end;

    begin
      v_monto := round((v_item ->> 'monto')::numeric, 2);
    exception when others then
      raise exception 'Cada cuota necesita una fecha y un monto mayor que cero.' using errcode = '22023';
    end;

    -- El tope de arriba es el de la columna (14,2): también frena un «NaN» o
    -- un infinito, que para PostgreSQL son mayores que cualquier número.
    if v_fecha is null or v_monto is null or v_monto <= 0 or v_monto > 999999999999.99 then
      raise exception 'Cada cuota necesita una fecha y un monto mayor que cero.' using errcode = '22023';
    end if;

    -- Para atrás se puede («tenía que pagarme la semana pasada»: nace
    -- atrasada). Para adelante, diez años: un 2206 es un dedo de más.
    if v_fecha < date '2000-01-01' or v_fecha > (v_hoy + interval '10 years')::date then
      raise exception 'La fecha de la cuota no es válida.' using errcode = '22023';
    end if;

    if v_antes is not null and v_fecha < v_antes then
      raise exception 'Las fechas de las cuotas tienen que ir en orden.' using errcode = '22023';
    end if;

    v_antes  := v_fecha;
    v_suma   := v_suma + v_monto;
    v_fechas := v_fechas || v_fecha;
    v_montos := v_montos || v_monto;
  end loop;

  -- Lo que hace que el calendario sea solo un calendario: suma lo mismo que
  -- la deuda, ni un guaraní más ni uno menos.
  if v_suma <> v.monto then
    raise exception 'Las cuotas suman %, y la deuda es %.',
      public.fiado_monto_texto(v_suma), public.fiado_monto_texto(v.monto)
      using errcode = '22023';
  end if;

  delete from public.fiado_cuotas where fio_id = v.id;

  insert into public.fiado_cuotas (empresa_id, cliente_id, fio_id, numero, vence_el, monto, creado_por)
  select v.empresa_id, v.cliente_id, v.id, g.i::smallint, v_fechas[g.i], v_montos[g.i], auth.uid()
  from generate_series(1, v_n) as g(i);

  select jsonb_build_object(
    'fio_id', v.id,
    'cliente_id', v.cliente_id,
    'cuotas', coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'numero', q.numero, 'vence_el', q.vence_el, 'monto', q.monto
    ) order by q.numero), '[]'::jsonb)
  ) into v_res
  from public.fiado_cuotas q where q.fio_id = v.id;

  return v_res;
end $fn$;

revoke all on function public.programar_cuotas(uuid, jsonb, uuid) from public, anon;
grant execute on function public.programar_cuotas(uuid, jsonb, uuid) to authenticated;


-- ------------------------------------------------------------
-- 6. SACARLE LAS FECHAS
--
--    «No tenía que tener fechas». Se borra el calendario y NADA MÁS: lo que
--    debe y lo que pagó quedan igual. Los cobros que decían ser de esa deuda
--    pasan a contar como sueltos; si se le vuelven a poner fechas, se
--    reenganchan solos.
--
--    Es un DELETE: anda también en una cuenta vencida (111).
-- ------------------------------------------------------------
create or replace function public.quitar_cuotas(p_fio uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v public.fiado;
begin
  select * into v from public.fiado where id = p_fio;
  if v.id is null then
    raise exception 'Esa línea no es un fiado.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if v.tipo <> 'fio' then
    raise exception 'Esa línea no es un fiado.' using errcode = '22023';
  end if;

  perform 1 from public.clientes where id = v.cliente_id for update;

  delete from public.fiado_cuotas where fio_id = p_fio;

  return jsonb_build_object('saldo', public.saldo_fiado(v.cliente_id));
end $fn$;

revoke all on function public.quitar_cuotas(uuid) from public, anon;
grant execute on function public.quitar_cuotas(uuid) to authenticated;


-- ------------------------------------------------------------
-- 7. CORRER LA FECHA DE UNA CUOTA
--
--    «Me dijo que me paga el viernes». Si se movió, hay que volver a
--    avisarle: `avisado_el` vuelve a null. Qué cuota está pagada no cambia:
--    adentro de una deuda el orden es el número, no la fecha.
-- ------------------------------------------------------------
create or replace function public.mover_cuota(p_cuota uuid, p_vence_el date)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v public.fiado_cuotas;
begin
  select * into v from public.fiado_cuotas where id = p_cuota;
  if v.id is null then
    raise exception 'Esa cuota ya no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if p_vence_el is null
     or p_vence_el < date '2000-01-01'
     or p_vence_el > (public.hoy_empresa(v.empresa_id) + interval '10 years')::date then
    raise exception 'La fecha de la cuota no es válida.' using errcode = '22023';
  end if;

  update public.fiado_cuotas
  set vence_el = p_vence_el, avisado_el = null
  where id = p_cuota;

  return jsonb_build_object('cuota', jsonb_build_object(
    'id', v.id, 'numero', v.numero, 'vence_el', p_vence_el));
end $fn$;

revoke all on function public.mover_cuota(uuid, date) from public, anon;
grant execute on function public.mover_cuota(uuid, date) to authenticated;


-- ------------------------------------------------------------
-- 8. «YA LE ESCRIBÍ»
--
--    La marca del botón de WhatsApp, por cuota. Como `marcar_avisado` de la
--    agenda (043): no mueve plata, es una marca, y por eso no lleva reglas.
--    Guarda el DÍA (en la zona del negocio) y no la hora: la pantalla dice
--    «le escribiste hoy».
-- ------------------------------------------------------------
create or replace function public.marcar_cuota_avisada(
  p_cuota   uuid,
  p_avisado boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v     public.fiado_cuotas;
  v_dia date;
begin
  select * into v from public.fiado_cuotas where id = p_cuota;
  if v.id is null then
    raise exception 'Esa cuota ya no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_dia := case when coalesce(p_avisado, true) then public.hoy_empresa(v.empresa_id) else null end;

  update public.fiado_cuotas set avisado_el = v_dia where id = p_cuota;

  return jsonb_build_object('avisado_el', v_dia);
end $fn$;

revoke all on function public.marcar_cuota_avisada(uuid, boolean) from public, anon;
grant execute on function public.marcar_cuota_avisada(uuid, boolean) to authenticated;


-- ------------------------------------------------------------
-- 9. ANOTAR: AHORA PUEDE LLEVAR EL PLAN
--
--    El cuerpo es el de la 084, entero. Lo único nuevo es `p_plan`, al final
--    y opcional: si viene, las cuotas se programan en la MISMA transacción.
--    No existe «le fié en tres cuotas y quedó en una».
--
--    Sigue devolviendo el id de la línea.
-- ------------------------------------------------------------
drop function if exists public.anotar_fiado(uuid, uuid, numeric, text, date, uuid);

create or replace function public.anotar_fiado(
  p_empresa  uuid,
  p_cliente  uuid,
  p_monto    numeric,
  p_concepto text default '',
  p_fecha    date default null,
  p_cuenta   uuid default null,
  p_plan     jsonb default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_fecha  date;
  v_nombre text;
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

  -- Tocar el saldo de una cuenta es cosa de quien administra la plata, no de
  -- cualquiera que pueda anotar un fiado.
  if p_cuenta is not null then
    if not public.es_admin(p_empresa) then
      raise exception 'Solo el dueño de la cuenta puede sacar plata de la billetera.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.cuentas_dinero c
                   where c.id = p_cuenta and c.empresa_id = p_empresa and c.activa) then
      raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
    end if;
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  insert into public.fiado (empresa_id, cliente_id, tipo, monto, fecha, concepto, cuenta_id, creado_por)
  values (p_empresa, p_cliente, 'fio', p_monto, v_fecha,
          left(coalesce(p_concepto, ''), 200), p_cuenta, auth.uid())
  returning id into v_id;

  -- La plata salió: el saldo baja. Como ajuste y no como gasto, porque no
  -- perdiste esa plata, la prestaste.
  if p_cuenta is not null then
    insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, fecha, nota, creado_por)
    values (p_empresa, p_cuenta, 'prestamo', -p_monto, v_fecha,
            left('Le prestaste a ' || v_nombre, 200), auth.uid());
  end if;

  -- (127) Con fecha o en cuotas. Si el plan no cierra, no se anota nada.
  if p_plan is not null and jsonb_typeof(p_plan) <> 'null' then
    perform public.programar_cuotas(p_fio => v_id, p_plan => p_plan);
  end if;

  return v_id;
end $fn$;

revoke all on function public.anotar_fiado(uuid, uuid, numeric, text, date, uuid, jsonb) from public, anon;
grant execute on function public.anotar_fiado(uuid, uuid, numeric, text, date, uuid, jsonb) to authenticated;


-- ------------------------------------------------------------
-- 10. COBRAR: AHORA PUEDE DECIR DE QUÉ CUOTA ES
--
--    Sin `p_cuota` es EXACTAMENTE lo de la 084: un pago suelto contra todo lo
--    que debe el cliente. Devuelve lo de siempre (`id`, `saldo`) y suma
--    claves.
--
--    Con `p_cuota`:
--      · la cuota tiene que existir y ser de ese cliente;
--      · si ya está cobrada, se rechaza. Es el freno al doble toque: el
--        segundo toque en «Cobrar» la encuentra cobrada;
--      · no se puede cobrar más de lo que falta de ESA deuda. Paga más que
--        la cuota: tapa esa y parte de la que sigue. Paga menos: la cuota
--        queda a medias y sigue pendiente por lo que falta.
--    El pago queda apuntando a la deuda (`fio_id`), no a la cuota.
--
--    El concepto sigue siendo «Pago recibido»: de qué deuda fue lo arma la
--    pantalla con `fio_id`, en el idioma de cada uno.
-- ------------------------------------------------------------
drop function if exists public.cobrar_fiado(uuid, uuid, numeric, text, date, uuid);

create or replace function public.cobrar_fiado(
  p_empresa uuid,
  p_cliente uuid,
  p_monto   numeric,
  p_metodo  text default 'efectivo',
  p_fecha   date default null,
  p_cuenta  uuid default null,
  p_cuota   uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo   numeric;
  v_nombre  text;
  v_id      uuid;
  v_fecha   date;
  v_fio     uuid;
  v_pend    numeric;
  v_falta   numeric;
  v_deuda   jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  select nombre into v_nombre from public.clientes
  where id = p_cliente and empresa_id = p_empresa
  for update;
  if v_nombre is null then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  if coalesce(p_metodo, '') not in ('efectivo', 'transferencia', 'tarjeta', 'otro') then
    raise exception 'Esa forma de cobro no es válida.' using errcode = '22023';
  end if;

  -- Decir en qué cuenta entró es administrar la billetera, igual que sacar
  -- plata de ella para prestarla.
  if p_cuenta is not null then
    if not public.es_admin(p_empresa) then
      raise exception 'Solo el dueño de la cuenta puede elegir en qué cuenta entra.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.cuentas_dinero c
                   where c.id = p_cuenta and c.empresa_id = p_empresa and c.activa) then
      raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
    end if;
  end if;

  -- (127) El pago es de una cuota. Va ANTES del control del saldo para que
  -- el mensaje hable de lo que la persona está mirando: esa cuota, esa deuda.
  if p_cuota is not null then
    select q.fio_id into v_fio from public.fiado_cuotas q
    where q.id = p_cuota and q.cliente_id = p_cliente;
    if v_fio is null then
      raise exception 'Esa cuota ya no existe.' using errcode = 'P0002';
    end if;

    select e.pendiente into v_pend
    from public.estado_cuotas(p_cliente) e where e.cuota_id = p_cuota;
    if coalesce(v_pend, 0) <= 0 then
      raise exception 'Esa cuota ya está cobrada.' using errcode = '22023';
    end if;

    -- Lo que falta de esa deuda es lo pendiente de TODAS sus cuotas: nunca
    -- es más que el saldo del libro, así que este tope alcanza.
    select coalesce(sum(e.pendiente), 0) into v_falta
    from public.estado_cuotas(p_cliente) e where e.fio_id = v_fio;
    if p_monto > v_falta then
      raise exception 'De esa deuda faltan %, no podés cobrarle más que eso.',
        public.fiado_monto_texto(v_falta) using errcode = '22023';
    end if;
  end if;

  v_saldo := public.saldo_fiado(p_cliente);
  if v_saldo <= 0 then
    raise exception '% no te debe nada.', v_nombre using errcode = '22023';
  end if;

  if p_monto > v_saldo then
    raise exception '% te debe %, no podés cobrarle más que eso.',
      v_nombre, public.fiado_monto_texto(v_saldo)
      using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  insert into public.fiado (
    empresa_id, cliente_id, tipo, monto, fecha, concepto, metodo, cuenta_id, fio_id, creado_por
  ) values (
    p_empresa, p_cliente, 'cobro', p_monto, v_fecha,
    'Pago recibido', p_metodo, p_cuenta, v_fio, auth.uid()
  )
  returning id into v_id;

  if p_cuenta is not null then
    insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, fecha, nota, creado_por)
    values (p_empresa, p_cuenta, 'prestamo', p_monto, v_fecha,
            left('Te pagó ' || v_nombre, 200), auth.uid());
  end if;

  -- Cómo quedó la deuda que se cobró: lo que falta y la cuota que sigue, para
  -- que la pantalla pueda decir «la próxima vence el 15/12» sin volver a leer.
  if v_fio is not null then
    select jsonb_build_object(
      'fio_id', v_fio,
      'falta', coalesce(sum(e.pendiente), 0),
      'proxima', (array_agg(
        jsonb_build_object(
          'cuota_id', e.cuota_id, 'numero', e.numero, 'de', e.de,
          'vence_el', e.vence_el, 'dias', e.dias, 'pendiente', e.pendiente)
        order by e.pos) filter (where e.pendiente > 0))[1]
    ) into v_deuda
    from public.estado_cuotas(p_cliente) with ordinality as e(
      cuota_id, fio_id, numero, de, vence_el, monto, pagado, pendiente, dias,
      avisado_el, concepto, fecha_fio, monto_fio, venta_id, pos)
    where e.fio_id = v_fio;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'saldo', public.saldo_fiado(p_cliente),
    'sin_fecha', public.sin_fecha_fiado(p_cliente),
    'deuda', v_deuda
  );
end $fn$;

revoke all on function public.cobrar_fiado(uuid, uuid, numeric, text, date, uuid, uuid) from public, anon;
grant execute on function public.cobrar_fiado(uuid, uuid, numeric, text, date, uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- 11. LO QUE TE DEBEN, TODO JUNTO: AHORA CON LAS FECHAS
--
--    La misma forma de siempre —`total`, `cuantos` y `clientes` en el mismo
--    orden, de quien más debe a quien menos— y SOLO SUMA CLAVES. El panel,
--    la captura por voz, el Excel y la revisión no se enteran.
--
--    Por cliente: cuánto de lo que debe no tiene fecha (`sin_fecha`), cuánto
--    sí (`con_fecha`), sus cuotas atrasadas, la cuota pendiente de fecha más
--    cercana (`proxima`) y en cuál de los cuatro grupos de la pantalla va
--    (`grupo`): atrasada, hoy, proxima o sin_fecha.
--
--    Las cuotas se miran DESPUÉS de quedarse con quienes deben algo: quien no
--    debe nada no hace trabajar a nadie.
-- ------------------------------------------------------------
create or replace function public.resumen_fiado(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
  v_hoy date;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_hoy := public.hoy_empresa(p_empresa);

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
      (v_hoy - s.desde) as dias
    from saldos s
    join public.clientes c on c.id = s.cliente_id
    -- Quien ya pagó todo no aparece en «lo que te deben». Sigue en Clientes.
    where s.saldo > 0
  ),
  -- Las cuotas con algo pendiente de quienes deben. `pos` es el orden en que
  -- las devuelve estado_cuotas: por fecha.
  cuotas as (
    select n.cliente_id, e.cuota_id, e.fio_id, e.numero, e.de, e.vence_el,
           e.pendiente, e.dias as faltan, e.avisado_el, e.pos
    from conNombre n
    cross join lateral public.estado_cuotas(n.cliente_id) with ordinality as e(
      cuota_id, fio_id, numero, de, vence_el, monto, pagado, pendiente, dias,
      avisado_el, concepto, fecha_fio, monto_fio, venta_id, pos)
    where e.pendiente > 0
  ),
  porCliente as (
    select
      q.cliente_id,
      sum(q.pendiente) as con_fecha,
      (count(*) filter (where q.faltan < 0))::int as atrasadas,
      coalesce(sum(q.pendiente) filter (where q.faltan < 0), 0) as monto_atrasado,
      (array_agg(jsonb_build_object(
         'cuota_id', q.cuota_id, 'fio_id', q.fio_id, 'numero', q.numero, 'de', q.de,
         'vence_el', q.vence_el, 'dias', q.faltan, 'pendiente', q.pendiente,
         'avisado_el', q.avisado_el
       ) order by q.pos))[1] as proxima
    from cuotas q
    group by q.cliente_id
  ),
  completo as (
    select
      n.cliente_id, n.nombre, n.telefono, n.saldo, n.desde, n.dias,
      -- Sin ninguna cuota, todo lo que debe es «sin fecha»: lo de siempre.
      case when exists (select 1 from public.fiado_cuotas k where k.cliente_id = n.cliente_id)
           then public.sin_fecha_fiado(n.cliente_id) else n.saldo end as sin_fecha,
      coalesce(p.con_fecha, 0) as con_fecha,
      coalesce(p.atrasadas, 0) as atrasadas,
      coalesce(p.monto_atrasado, 0) as monto_atrasado,
      p.proxima,
      case
        when p.proxima is null then 'sin_fecha'
        when (p.proxima ->> 'dias')::int < 0 then 'atrasada'
        when (p.proxima ->> 'dias')::int = 0 then 'hoy'
        else 'proxima'
      end as grupo
    from conNombre n
    left join porCliente p on p.cliente_id = n.cliente_id
  )
  select jsonb_build_object(
    'total',    coalesce((select sum(saldo) from completo), 0),
    'cuantos',  coalesce((select count(*) from completo), 0),
    'clientes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.saldo desc, x.nombre, x.cliente_id)
      from completo x
    ), '[]'::jsonb),
    -- (127) Lo que hay para cobrar con fecha, contado en cuotas.
    'atrasadas',      coalesce((select count(*) from cuotas where faltan < 0), 0),
    'monto_atrasado', coalesce((select sum(pendiente) from cuotas where faltan < 0), 0),
    'vencen_hoy',     coalesce((select count(*) from cuotas where faltan = 0), 0),
    'monto_hoy',      coalesce((select sum(pendiente) from cuotas where faltan = 0), 0),
    'vencen_semana',  coalesce((select count(*) from cuotas where faltan between 1 and 7), 0),
    'monto_semana',   coalesce((select sum(pendiente) from cuotas where faltan between 1 and 7), 0),
    'proximo_vencimiento', (select min(vence_el) from cuotas where faltan >= 0),
    'con_fecha_cuantos',   coalesce((select count(*) from completo where proxima is not null), 0)
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.resumen_fiado(uuid) from public, anon;
grant execute on function public.resumen_fiado(uuid) to authenticated;


-- ------------------------------------------------------------
-- 12. EL LIBRO DE UN CLIENTE: CADA LÍNEA DICE DE QUÉ DEUDA ES Y CÓMO SE PAGÓ
--
--    Lo de la 054, con dos claves más por línea: `fio_id` (en un cobro, la
--    deuda que pagó) y `metodo`. Mismo tope de 500.
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
    select f.id, f.tipo, f.monto, f.fecha, f.concepto, f.venta_id, f.fio_id, f.metodo, f.created_at
    from public.fiado f
    where f.cliente_id = p_cliente
    order by f.fecha desc, f.created_at desc
    limit least(greatest(coalesce(p_limite, 100), 1), 500)
  ) x;

  return v_res;
end $fn$;

revoke all on function public.libro_fiado(uuid, integer) from public, anon;
grant execute on function public.libro_fiado(uuid, integer) to authenticated;


-- ------------------------------------------------------------
-- 13. TODO LO DE UN CLIENTE, PARA ABRIR SU HOJA
--
--    Una sola lectura: cuánto debe, cada deuda con sus cuotas, lo que no
--    tiene fecha y el libro. Las partes SUMAN el saldo: lo sin fecha más lo
--    que falta de cada deuda es lo que dice la fila.
-- ------------------------------------------------------------
create or replace function public.detalle_fiado(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  c        public.clientes;
  v_hoy    date;
  v_desde  date;
  v_deudas jsonb;
  v_sin    jsonb;
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null then
    raise exception 'Ese cliente no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(c.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_hoy := public.hoy_empresa(c.empresa_id);

  -- La misma «desde» de resumen_fiado: la línea fiada más vieja.
  select min(f.fecha) into v_desde
  from public.fiado f where f.cliente_id = p_cliente and f.tipo = 'fio';

  -- Cada deuda con cuotas, de la más vieja a la más nueva.
  select coalesce(jsonb_agg(d.j order by d.fecha_fio, d.creada, d.fio_id), '[]'::jsonb) into v_deudas
  from (
    select e.fio_id, e.fecha_fio, f.created_at as creada,
           jsonb_build_object(
             'fio_id', e.fio_id,
             'concepto', e.concepto,
             'fecha', e.fecha_fio,
             'monto', e.monto_fio,
             'venta_id', e.venta_id,
             'pagado', sum(e.pagado),
             'falta', sum(e.pendiente),
             'cuotas', jsonb_agg(jsonb_build_object(
               'cuota_id', e.cuota_id, 'numero', e.numero, 'de', e.de,
               'vence_el', e.vence_el, 'dias', e.dias, 'monto', e.monto,
               'pagado', e.pagado, 'pendiente', e.pendiente, 'avisado_el', e.avisado_el
             ) order by e.numero)
           ) as j
    from public.estado_cuotas(p_cliente) e
    join public.fiado f on f.id = e.fio_id
    group by e.fio_id, e.fecha_fio, f.created_at, e.concepto, e.monto_fio, e.venta_id
  ) d;

  -- Las líneas fiadas que no tienen fecha: a cada una se le puede poner.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'fecha', f.fecha, 'monto', f.monto,
           'concepto', f.concepto, 'venta_id', f.venta_id
         ) order by f.fecha, f.created_at, f.id), '[]'::jsonb) into v_sin
  from public.fiado f
  where f.cliente_id = p_cliente and f.tipo = 'fio'
    and not exists (select 1 from public.fiado_cuotas q where q.fio_id = f.id);

  return jsonb_build_object(
    'cliente_id', c.id,
    'nombre', c.nombre,
    'telefono', c.telefono,
    'activo', c.activo,
    'saldo', public.saldo_fiado(p_cliente),
    'sin_fecha', public.sin_fecha_fiado(p_cliente),
    'desde', v_desde,
    'dias', (v_hoy - v_desde),
    'deudas', v_deudas,
    'sin_fecha_lineas', v_sin,
    'libro', public.libro_fiado(p_cliente, 500)
  );
end $fn$;

revoke all on function public.detalle_fiado(uuid) from public, anon;
grant execute on function public.detalle_fiado(uuid) to authenticated;


-- ------------------------------------------------------------
-- 14. LAS CUOTAS QUE FALTA COBRAR, DE TODO EL NEGOCIO
--
--    Para el Excel y los reportes: una fila por cuota con algo pendiente,
--    por fecha. Con `p_hasta`, solo las que vencen hasta ese día.
-- ------------------------------------------------------------
create or replace function public.cuotas_por_cobrar(p_empresa uuid, p_hasta date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'cuota_id', e.cuota_id, 'cliente_id', c.id, 'nombre', c.nombre,
           'telefono', c.telefono, 'concepto', e.concepto,
           'numero', e.numero, 'de', e.de, 'vence_el', e.vence_el, 'dias', e.dias,
           'pendiente', e.pendiente, 'avisado_el', e.avisado_el
         ) order by e.vence_el, c.nombre, e.fio_id, e.numero), '[]'::jsonb) into v_res
  from public.clientes c
  cross join lateral public.estado_cuotas(c.id) e
  where c.empresa_id = p_empresa
    and exists (select 1 from public.fiado_cuotas q where q.cliente_id = c.id)
    and e.pendiente > 0
    and (p_hasta is null or e.vence_el <= p_hasta);

  return v_res;
end $fn$;

revoke all on function public.cuotas_por_cobrar(uuid, date) from public, anon;
grant execute on function public.cuotas_por_cobrar(uuid, date) to authenticated;


-- ------------------------------------------------------------
-- 15. BORRAR UNA LÍNEA: UNA DEUDA CON CUOTAS YA COBRADAS NO SE BORRA
--
--    Lo de la 056, con un freno más. El control del saldo no alcanzaba: con
--    otras deudas el saldo podía seguir sobre cero, la deuda se borraba y sus
--    pagos quedaban tapando la libreta. Primero se borran esos pagos.
--
--    Sin pagos propios, la deuda se borra y sus cuotas se van con ella
--    (CASCADE). Borrar un pago que era de una cuota: como siempre, y la
--    cuota vuelve a quedar pendiente sola.
-- ------------------------------------------------------------
create or replace function public.borrar_linea_fiado(p_linea uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v public.fiado;
begin
  select * into v from public.fiado where id = p_linea;
  if v.id is null then
    raise exception 'Esa línea ya no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not (public.es_admin(v.empresa_id) or v.creado_por = auth.uid()) then
    raise exception 'Solo quien la anotó o un administrador puede borrarla.' using errcode = '42501';
  end if;

  if v.venta_id is not null then
    raise exception
      'Esa deuda viene de una venta. Para borrarla, anulá la venta desde el historial: así también vuelve el stock.'
      using errcode = '22023';
  end if;

  -- El mismo candado que al cobrar: el control del saldo no puede correr
  -- en paralelo con un cobro.
  perform 1 from public.clientes where id = v.cliente_id for update;

  -- (127)
  if v.tipo = 'fio'
     and exists (select 1 from public.fiado_cuotas q where q.fio_id = p_linea)
     and exists (select 1 from public.fiado c where c.fio_id = p_linea and c.tipo = 'cobro') then
    raise exception 'Esa deuda tiene cuotas ya cobradas. Borrá primero esos pagos.'
      using errcode = '22023';
  end if;

  if v.tipo = 'fio' and public.saldo_fiado(v.cliente_id) - v.monto < 0 then
    raise exception
      'Si borrás eso quedaría debiendo menos que cero, porque ya te pagó parte. Borrá primero el pago.'
      using errcode = '22023';
  end if;

  delete from public.fiado where id = p_linea;

  return jsonb_build_object('saldo', public.saldo_fiado(v.cliente_id));
end $fn$;

revoke all on function public.borrar_linea_fiado(uuid) from public, anon;
grant execute on function public.borrar_linea_fiado(uuid) to authenticated;


-- ------------------------------------------------------------
-- 16. ANULAR UNA VENTA FIADA CON CUOTAS YA COBRADAS
--
--    El trigger de la 056, con una condición más y ANTES de la del saldo, por
--    lo mismo que en el bloque 15: si a esa venta ya le cobraron una cuota,
--    primero se borra el pago. El mensaje es el de siempre.
--
--    Al borrar la línea, sus cuotas se van con ella (CASCADE).
-- ------------------------------------------------------------
create or replace function public.anular_borra_el_fiado()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_linea   uuid;
  v_cliente uuid;
  v_monto   numeric;
begin
  if new.estado <> 'anulado' or old.estado = 'anulado' then
    return new;
  end if;

  select f.id, f.cliente_id, f.monto into v_linea, v_cliente, v_monto
  from public.fiado f
  where f.venta_id = new.id and f.tipo = 'fio';

  if v_cliente is null then return new; end if;

  -- (127) Pagos que dicen ser de ESTA venta.
  if exists (select 1 from public.fiado c where c.fio_id = v_linea and c.tipo = 'cobro') then
    raise exception
      'Esa venta fiada ya fue cobrada, entera o en parte. Borrá primero el pago desde Fiado y después anulá la venta.'
      using errcode = '22023';
  end if;

  if public.saldo_fiado(v_cliente) - v_monto < 0 then
    raise exception
      'Esa venta fiada ya fue cobrada, entera o en parte. Borrá primero el pago desde Fiado y después anulá la venta.'
      using errcode = '22023';
  end if;

  delete from public.fiado where venta_id = new.id and tipo = 'fio';
  return new;
end $fn$;

revoke all on function public.anular_borra_el_fiado() from public, anon, authenticated;


-- ------------------------------------------------------------
-- 17. PODER APAGAR EL AVISO DE COBROS
--
--    Una columna más en las preferencias, encendida por defecto, y las dos
--    funciones de siempre. `guardar_preferencias` gana un parámetro al
--    final: la firma de seis se borra antes, o una llamada con algunos
--    campos quedaría ambigua (043, 071).
-- ------------------------------------------------------------
alter table public.preferencias
  add column if not exists aviso_cobros boolean not null default true;

create or replace function public.mis_preferencias()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'idioma', p.idioma, 'aviso_cierre', p.aviso_cierre,
    'aviso_semanal', p.aviso_semanal, 'aviso_turnos', p.aviso_turnos,
    'aviso_diario', p.aviso_diario, 'aviso_cobros', p.aviso_cobros,
    'hora_cierre', p.hora_cierre
  ) into v_res
  from public.preferencias p where p.user_id = auth.uid();

  return coalesce(v_res, jsonb_build_object(
    'idioma', 'es', 'aviso_cierre', true, 'aviso_semanal', true,
    'aviso_turnos', true, 'aviso_diario', true, 'aviso_cobros', true,
    'hora_cierre', 20));
end $fn$;

drop function if exists public.guardar_preferencias(text, boolean, boolean, smallint, boolean, boolean);

create or replace function public.guardar_preferencias(
  p_idioma text default null,
  p_aviso_cierre boolean default null,
  p_aviso_semanal boolean default null,
  p_hora_cierre smallint default null,
  p_aviso_turnos boolean default null,
  p_aviso_diario boolean default null,
  p_aviso_cobros boolean default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  insert into public.preferencias as p (
    user_id, idioma, aviso_cierre, aviso_semanal, hora_cierre, aviso_turnos, aviso_diario, aviso_cobros)
  values (
    auth.uid(),
    coalesce(nullif(lower(trim(p_idioma)), ''), 'es'),
    coalesce(p_aviso_cierre, true),
    coalesce(p_aviso_semanal, true),
    coalesce(p_hora_cierre, 20::smallint),
    coalesce(p_aviso_turnos, true),
    coalesce(p_aviso_diario, true),
    coalesce(p_aviso_cobros, true)
  )
  on conflict (user_id) do update set
    idioma        = coalesce(nullif(lower(trim(p_idioma)), ''), p.idioma),
    aviso_cierre  = coalesce(p_aviso_cierre,  p.aviso_cierre),
    aviso_semanal = coalesce(p_aviso_semanal, p.aviso_semanal),
    hora_cierre   = coalesce(p_hora_cierre,   p.hora_cierre),
    aviso_turnos  = coalesce(p_aviso_turnos,  p.aviso_turnos),
    aviso_diario  = coalesce(p_aviso_diario,  p.aviso_diario),
    aviso_cobros  = coalesce(p_aviso_cobros,  p.aviso_cobros),
    updated_at    = now();

  return public.mis_preferencias();
end $fn$;

revoke all on function public.mis_preferencias() from public, anon;
grant execute on function public.mis_preferencias() to authenticated;
revoke all on function public.guardar_preferencias(text, boolean, boolean, smallint, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.guardar_preferencias(text, boolean, boolean, smallint, boolean, boolean, boolean)
  to authenticated;


-- ------------------------------------------------------------
-- 18. A QUIÉN LE TOCA COBRAR HOY
--
--    Solo para service_role: la tarea de la mañana corre sin sesión de nadie
--    y mira todas las cuentas a la vez. Hermana de `turnos_de_manana` (043).
--
--    «Hoy» se calcula en la zona de CADA cuenta.
--
--    CUÁNDO SE AVISA DE UNA CUOTA SIN PAGAR: el día que vence, a los 3 días
--    y después una vez por semana (días 0, 3, 7, 14, 21...). Todos los días
--    sería el aviso que se aprende a ignorar. La cuenta entra en la lista
--    solo si tiene alguna cuota a la que hoy le toca; y cuando entra, la
--    frase cuenta TODO lo atrasado, no solo lo que disparó el aviso.
--
--    QUIÉN LO RECIBE: los miembros que pueden abrir Fiado y no lo apagaron.
--    Fiado lo abre cualquier rol (el que fía es el que cobra, 054), así que
--    son todos los miembros; lo que deja afuera a una cuenta entera es no
--    tener la pantalla: el profe y el trainer (rubro_tiene_fiado), la
--    personal en Gratis y la cuenta vencida.
--
--    `cuantas` cuenta cuotas; `personas`, a cuánta gente hay que cobrarle.
--    `nombres` son nombres de pila, hasta tres, sin repetir a nadie.
-- ------------------------------------------------------------
create or replace function public.cobros_de_hoy()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  with emp as (
    select e.id, e.nombre, e.moneda, e.tipo_cuenta, public.hoy_empresa(e.id) as hoy
    from public.empresas e
    where exists (select 1 from public.fiado_cuotas q where q.empresa_id = e.id)
      and public.rubro_tiene_fiado(e.rubro, e.tipo_cuenta)
      and public.puede_cargar(e.id)
      and not public.es_gratis_personal(e.id)
  ),
  -- Solo los clientes con alguna cuota de hoy o de antes: los demás no
  -- pueden tener nada que avisar.
  cli as (
    select distinct q.empresa_id, q.cliente_id
    from public.fiado_cuotas q
    join emp on emp.id = q.empresa_id
    where q.vence_el <= emp.hoy
  ),
  -- Cada cuota de hoy o atrasada con algo pendiente. `atraso` son los días
  -- que lleva vencida (0 = vence hoy).
  cu as (
    select cli.empresa_id, cli.cliente_id,
           split_part(btrim(c.nombre), ' ', 1) as nombre,
           s.vence_el, s.pendiente, s.avisado_el, (0 - s.dias) as atraso
    from cli
    join public.clientes c on c.id = cli.cliente_id
    cross join lateral public.estado_cuotas(cli.cliente_id) s
    where s.pendiente > 0 and s.dias <= 0
  ),
  toca as (
    select distinct k.empresa_id from cu k
    where k.atraso = 0 or k.atraso = 3 or (k.atraso > 0 and mod(k.atraso, 7) = 0)
  ),
  -- Una fila por persona y parte (hoy / atrasadas), para los nombres.
  gente as (
    select k.empresa_id, (k.atraso = 0) as es_hoy, k.cliente_id, k.nombre,
           min(k.vence_el) as vence, sum(k.pendiente) as monto,
           row_number() over (
             partition by k.empresa_id, (k.atraso = 0)
             order by min(k.vence_el), sum(k.pendiente) desc, k.nombre, k.cliente_id) as puesto
    from cu k
    group by k.empresa_id, (k.atraso = 0), k.cliente_id, k.nombre
  )
  select coalesce(jsonb_agg(x.j order by x.nombre, x.id), '[]'::jsonb) into v_res
  from (
    select emp.id, emp.nombre, jsonb_build_object(
      'empresa_id',  emp.id,
      'nombre',      emp.nombre,
      'moneda',      emp.moneda,
      'tipo_cuenta', emp.tipo_cuenta,
      'fecha',       emp.hoy,
      'hoy', (
        select jsonb_build_object(
          'cuantas',  count(*)::int,
          'personas', (count(distinct k.cliente_id))::int,
          'monto',    coalesce(sum(k.pendiente), 0),
          'nombres',  coalesce((select jsonb_agg(g.nombre order by g.puesto) from gente g
                                where g.empresa_id = emp.id and g.es_hoy and g.puesto <= 3), '[]'::jsonb))
        from cu k where k.empresa_id = emp.id and k.atraso = 0),
      'atrasadas', (
        select jsonb_build_object(
          'cuantas',  count(*)::int,
          'personas', (count(distinct k.cliente_id))::int,
          'monto',    coalesce(sum(k.pendiente), 0),
          'nombres',  coalesce((select jsonb_agg(g.nombre order by g.puesto) from gente g
                                where g.empresa_id = emp.id and not g.es_hoy and g.puesto <= 3), '[]'::jsonb),
          'dias_max', coalesce(max(k.atraso), 0))
        from cu k where k.empresa_id = emp.id and k.atraso > 0),
      'sin_escribir', (
        select count(*)::int from cu k
        where k.empresa_id = emp.id and k.avisado_el is null),
      'destinatarios', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'user_id', m.user_id, 'idioma', coalesce(p.idioma, 'es'))
               order by m.created_at, m.user_id)
        from public.miembros m
        left join public.preferencias p on p.user_id = m.user_id
        where m.empresa_id = emp.id and coalesce(p.aviso_cobros, true)), '[]'::jsonb)
    ) as j
    from emp
    join toca on toca.empresa_id = emp.id
  ) x;

  return v_res;
end $fn$;

revoke all on function public.cobros_de_hoy() from public, anon, authenticated;
grant execute on function public.cobros_de_hoy() to service_role;
