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
--    el monto de esa línea. El monto de una línea 'fio' no lo modifica
--    ninguna función ni la RLS, así que no se desacomoda. (Lo único que
--    cambia de monto en el libro es un 'cobro' cuando se parte en dos al
--    atarlo, bloque 4b; las dos partes suman lo mismo.)
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
--    EL DERRAME ES LA RED, Y NO QUEDA NUNCA GUARDADO. Como se calcula al
--    leer, es movedizo: si el cliente lleva después algo sin fecha, F0 sube,
--    el derrame se achica y una cuota que figuraba pagada vuelve a figurar
--    atrasada (con aviso al comerciante y todo). Por eso cada operación que
--    podría dejar pagos sueltos de más los ATA en esa misma transacción a la
--    deuda que tapan (bloque 4b): cobrar parte el cobro (bloque 10), ponerle
--    fecha a algo ya pagado ata lo que esa línea tenía cubierto (bloque 5), y
--    borrar una línea sin fecha, anular una venta fiada o empezar de cero
--    atan lo que sobra (bloques 15, 16 y 19). La segunda pasada queda para
--    que la cuenta cierre igual si alguna vez sobrara algo.
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
-- 4b. LOS PAGOS SUELTOS QUE SOBRAN SE ATAN (el derrame no queda nunca)
--
--    Tres ayudas internas; ninguna se le da a nadie.
--
--    QUÉ LÍNEA SIN FECHA ESTÁ PAGADA (`fiado_cubierto`). Lo sin fecha de un
--    cliente es un solo número (F0 menos U), pero al «ponerle fecha» a UNA
--    línea hay que saber cuánto de ESA ya se cobró. La regla, una sola:
--      · primero, cada línea con sus pagos propios (los que quedaron
--        apuntándole cuando se le sacaron las cuotas);
--      · después, los pagos sueltos (sin `fio_id`) cubren las líneas por
--        antigüedad, de la que se anotó primero a la última.
--    «Antigüedad» es el orden en que se anotaron (`created_at`), no la fecha
--    que llevan: una venta fiada recién hecha, aunque se cargue con fecha de
--    ayer, es la última de la fila y no se lleva pagos de la libreta vieja.
--    La suma de lo cubierto es lo mismo que descuenta `sin_fecha_fiado`.
--
--    ATAR (`fiado_atar_a`). Re-etiqueta líneas 'cobro' sueltas poniéndoles el
--    `fio_id` de la deuda, de la más vieja a la más nueva. Si una alcanza
--    para más de lo que hay que atar, se PARTE en dos líneas con la misma
--    fecha, forma de pago, cuenta, autor y hora: la que ya existía se queda
--    con lo que sigue suelto y la nueva lleva lo atado. El libro suma lo
--    mismo antes y después: no entra ni sale un guaraní, y la billetera no
--    se toca. `p_saltar` deja pasar la plata suelta que cubre líneas más
--    viejas, para atar el pago que de verdad era de esa línea.
--
--    QUE NO SOBRE (`fiado_atar_sueltos`). Con `p_primero`, ata primero ahí
--    lo que se le pide (hasta lo que a esa deuda le falta). Después, si
--    todavía hay pagos sueltos de más (U mayor que F0), ata a cada deuda
--    EXACTAMENTE lo que la segunda pasada de `estado_cuotas` le estaba
--    tapando: ninguna cuota cambia de estado al atar; lo que cambia es que
--    ya no se puede desatar sola. No hace nada si no sobra o si no hay
--    cuotas pendientes.
--
--    Atar es un UPDATE (y, si hay que partir, un INSERT) sobre el libro, y
--    pasa también después de un BORRADO, que anda siempre (111): el guardián
--    lo deja pasar por la marca `orden.atando_fiado` (bloque 19), que vale
--    solo para líneas 'cobro' de ese negocio y solo mientras dura el atado.
-- ------------------------------------------------------------
create or replace function public.fiado_cubierto(p_cliente uuid)
returns table (
  fio_id   uuid,
  monto    numeric,
  -- Sus pagos propios (cobros con fio_id = esta línea).
  atado    numeric,
  -- Lo que tiene cubierto en total: lo propio más lo que le toca de lo suelto.
  cubierto numeric,
  -- La plata suelta que se llevan las líneas anotadas antes que esta.
  antes    numeric
)
language sql stable security definer set search_path = public as $fn$
  with lineas as (
    select f.id, f.monto, f.created_at,
           least(f.monto, coalesce((select sum(c.monto) from public.fiado c
                                    where c.fio_id = f.id and c.tipo = 'cobro'), 0)) as atado
    from public.fiado f
    where f.cliente_id = p_cliente and f.tipo = 'fio'
      and not exists (select 1 from public.fiado_cuotas q where q.fio_id = f.id)
  ),
  sueltos as (
    select coalesce(sum(c.monto), 0) as total
    from public.fiado c
    where c.cliente_id = p_cliente and c.tipo = 'cobro' and c.fio_id is null
  ),
  fila as (
    select l.id, l.monto, l.atado,
           coalesce(sum(l.monto - l.atado) over (
             order by l.created_at, l.id
             rows between unbounded preceding and 1 preceding), 0) as delante
    from lineas l
  )
  select f.id, f.monto, f.atado,
         f.atado + greatest(0, least(f.monto - f.atado, s.total - f.delante)),
         least(s.total, f.delante)
  from fila f cross join sueltos s;
$fn$;

revoke all on function public.fiado_cubierto(uuid) from public, anon, authenticated;

create or replace function public.fiado_atar_a(
  p_cliente uuid,
  p_fio     uuid,
  p_monto   numeric,
  p_saltar  numeric default 0
)
returns numeric language plpgsql security definer set search_path = public as $fn$
declare
  v_empresa uuid;
  v_resta   numeric := coalesce(p_monto, 0);
  v_saltar  numeric := greatest(coalesce(p_saltar, 0), 0);
  v_atado   numeric := 0;
  v_libre   numeric;
  v_toma    numeric;
  c         public.fiado;
begin
  if v_resta <= 0 then return 0; end if;

  -- La deuda tiene que ser una línea 'fio' de ese cliente.
  select f.empresa_id into v_empresa from public.fiado f
  where f.id = p_fio and f.cliente_id = p_cliente and f.tipo = 'fio';
  if v_empresa is null then return 0; end if;

  perform set_config('orden.atando_fiado', v_empresa::text, true);

  for c in
    select * from public.fiado k
    where k.cliente_id = p_cliente and k.tipo = 'cobro' and k.fio_id is null
    order by k.created_at, k.id
  loop
    exit when v_resta <= 0;

    v_libre := c.monto;
    if v_saltar > 0 then
      if v_saltar >= c.monto then
        v_saltar := v_saltar - c.monto;
        continue;
      end if;
      v_libre  := c.monto - v_saltar;
      v_saltar := 0;
    end if;

    v_toma := least(v_libre, v_resta);

    if v_toma = c.monto then
      update public.fiado set fio_id = p_fio where id = c.id;
    else
      -- Se parte: la línea de siempre se queda con lo suelto y una gemela
      -- lleva lo atado. Entre las dos suman lo que sumaba la primera.
      update public.fiado set monto = c.monto - v_toma where id = c.id;
      insert into public.fiado (
        empresa_id, cliente_id, tipo, monto, fecha, concepto, venta_id, cobro_id,
        metodo, cuenta_id, fio_id, creado_por, created_at
      ) values (
        c.empresa_id, c.cliente_id, 'cobro', v_toma, c.fecha, c.concepto, c.venta_id, c.cobro_id,
        c.metodo, c.cuenta_id, p_fio, c.creado_por, c.created_at
      );
    end if;

    v_resta := v_resta - v_toma;
    v_atado := v_atado + v_toma;
  end loop;

  perform set_config('orden.atando_fiado', '', true);

  return v_atado;
end $fn$;

revoke all on function public.fiado_atar_a(uuid, uuid, numeric, numeric) from public, anon, authenticated;

create or replace function public.fiado_atar_sueltos(
  p_cliente uuid,
  p_primero uuid default null,
  p_monto   numeric default null,
  p_saltar  numeric default 0
)
returns numeric language plpgsql security definer set search_path = public as $fn$
declare
  v_atado  numeric := 0;
  v_falta  numeric;
  v_fios   uuid[];
  v_tomas  numeric[];
  i        integer;
begin
  -- El mismo candado que al cobrar (056). Quien llama ya lo tiene casi
  -- siempre; pedirlo otra vez no cuesta nada.
  perform 1 from public.clientes where id = p_cliente for update;
  if not found then return 0; end if;

  -- 1. Lo que se pide para una deuda en particular: la línea a la que se le
  --    acaba de poner fecha. Nunca más de lo que a esa deuda le falta.
  if p_primero is not null and coalesce(p_monto, 0) > 0
     and exists (select 1 from public.fiado_cuotas q
                 where q.fio_id = p_primero and q.cliente_id = p_cliente) then
    select f.monto - coalesce((select sum(c.monto) from public.fiado c
                               where c.fio_id = f.id and c.tipo = 'cobro'), 0)
    into v_falta
    from public.fiado f
    where f.id = p_primero and f.cliente_id = p_cliente and f.tipo = 'fio';

    if coalesce(v_falta, 0) > 0 then
      v_atado := v_atado + public.fiado_atar_a(p_cliente, p_primero, least(p_monto, v_falta), p_saltar);
    end if;
  end if;

  -- 2. Lo que sobra. Si lo suelto no pasa de lo sin fecha, no hay nada que
  --    atar (es lo de casi siempre, y sale acá sin mirar las cuotas).
  if not exists (select 1 from public.partes_fiado(p_cliente) p where p.u > p.f0) then
    return v_atado;
  end if;

  -- A cada deuda, lo que el derrame le está tapando hoy: lo pagado de sus
  -- cuotas menos sus pagos propios. La cuenta se hace entera ANTES de tocar
  -- el libro.
  select array_agg(t.fio_id order by t.pos), array_agg(t.toma order by t.pos)
  into v_fios, v_tomas
  from (
    select e.fio_id, min(e.pos) as pos,
           sum(e.pagado) - least(sum(e.monto), coalesce((
             select sum(c.monto) from public.fiado c
             where c.fio_id = e.fio_id and c.tipo = 'cobro'), 0)) as toma
    from public.estado_cuotas(p_cliente) with ordinality as e(
      cuota_id, fio_id, numero, de, vence_el, monto, pagado, pendiente, dias,
      avisado_el, concepto, fecha_fio, monto_fio, venta_id, pos)
    group by e.fio_id
  ) t
  where t.toma > 0;

  if v_fios is not null then
    for i in 1 .. array_length(v_fios, 1) loop
      v_atado := v_atado + public.fiado_atar_a(p_cliente, v_fios[i], v_tomas[i]);
    end loop;
  end if;

  return v_atado;
end $fn$;

revoke all on function public.fiado_atar_sueltos(uuid, uuid, numeric, numeric) from public, anon, authenticated;


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
--    SI LA LÍNEA ESTABA SIN FECHA Y YA TENÍA ALGO PAGADO, ESO SE LE ATA.
--    Lo que tenía cubierto por pagos sueltos (`fiado_cubierto`: los pagos
--    sueltos cubren primero lo que se anotó primero) pasa a ser pago de ESTA
--    deuda en la misma transacción (`fiado_atar_sueltos`). Sin eso quedaba
--    como derrame calculado al leer: Libreta 400.000 con 150.000 pagados, se
--    le ponen 2 cuotas de 200.000 y la primera figura con 50.000 pendientes;
--    al día siguiente el cliente lleva 100.000 sin fecha y la cuota pasa a
--    150.000 pendientes mientras lo nuevo figura pagado. Atado, no se mueve.
--    Es el número que la hoja de «Ponerle fecha» muestra antes de guardar
--    («Ya cobraste Gs. X»: `detalle_fiado.sin_fecha_lineas[].cubierto`).
--    Una venta fiada recién hecha a la que se le ponen cuotas en el acto es
--    la última de la fila: no se lleva pagos de nadie.
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
  v_tenia  boolean;
  v_ata    numeric := 0;
  v_saltar numeric := 0;
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

  -- Si la línea estaba sin fecha, cuánto tenía cubierto por pagos sueltos.
  -- Se mira ANTES de ponerle las cuotas, mientras todavía está en la fila.
  v_tenia := exists (select 1 from public.fiado_cuotas q where q.fio_id = v.id);
  if not v_tenia then
    select greatest(k.cubierto - k.atado, 0), k.antes into v_ata, v_saltar
    from public.fiado_cubierto(v.cliente_id) k where k.fio_id = v.id;
  end if;

  delete from public.fiado_cuotas where fio_id = v.id;

  insert into public.fiado_cuotas (empresa_id, cliente_id, fio_id, numero, vence_el, monto, creado_por)
  select v.empresa_id, v.cliente_id, v.id, g.i::smallint, v_fechas[g.i], v_montos[g.i], auth.uid()
  from generate_series(1, v_n) as g(i);

  -- Eso que tenía cubierto queda atado a esta deuda; y si sobrara algo
  -- suelto, a las cuotas que tapa. Al rearmar no hay nada que atar.
  perform public.fiado_atar_sueltos(v.cliente_id, v.id, coalesce(v_ata, 0), coalesce(v_saltar, 0));

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
--    siguen apuntándole (`fio_id` no se toca) y pasan a contar como sueltos;
--    si se le vuelven a poner fechas, se reenganchan solos.
--
--    No puede dejar pagos sueltos de más: lo sin fecha sube por el monto de
--    la línea y lo suelto sube por sus pagos propios, que nunca son más que
--    ese monto. Por eso acá no se ata nada. Y esos pagos siguen siendo de
--    esa línea para `fiado_cubierto` (primero lo propio), para la hoja de
--    «Ponerle fecha» y para borrar_linea_fiado, que no deja borrar la línea
--    sin borrar antes sus pagos.
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
--
--    LAS FECHAS SIGUEN EN ORDEN. Justamente porque los pagos tapan por
--    número, una cuota no puede saltar por encima de sus vecinas: si la 1 se
--    corre para después de la 2, el pago de hoy tapa la 1 (que vence en un
--    mes) y la 2, la de hoy, queda «sin pagar»: la clienta que pagó a tiempo
--    pasa a atrasada y recibe el reclamo. Se compara contra TODAS las cuotas
--    de la deuda, también las ya pagadas: si después se borra un pago, esa
--    cuota vuelve a quedar pendiente y el desorden reaparecería. La misma
--    fecha que la vecina sí se puede, igual que en programar_cuotas. Para
--    cambiar el orden está «Rearmar».
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

  if exists (select 1 from public.fiado_cuotas o
             where o.fio_id = v.fio_id and o.id <> v.id
               and ((o.numero < v.numero and o.vence_el > p_vence_el)
                 or (o.numero > v.numero and o.vence_el < p_vence_el))) then
    raise exception 'Las fechas de las cuotas tienen que ir en orden.' using errcode = '22023';
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
--    La marca del botón de WhatsApp. Como `marcar_avisado` de la agenda
--    (043): no mueve plata, es una marca, y por eso no lleva reglas.
--    Guarda el DÍA (en la zona del negocio) y no la hora: la pantalla dice
--    «le escribiste hoy».
--
--    SE LE ESCRIBE A UNA PERSONA, NO A UNA CUOTA. El mensaje de WhatsApp
--    habla de todo lo que esa persona tiene vencido, así que la marca cae
--    sobre la cuota que se pide Y sobre todas las de ese cliente que vencen
--    hoy o ya vencieron y todavía tienen algo pendiente. Si se marcara solo
--    una, quien debe dos cuotas seguiría contando en «a N todavía no les
--    escribiste» por más que se toque el botón. Desmarcar hace lo mismo al
--    revés, sobre las mismas cuotas.
--
--    Devuelve `avisado_el` (lo de siempre) y `marcadas`: cuántas cuotas
--    quedaron con esa marca.
-- ------------------------------------------------------------
create or replace function public.marcar_cuota_avisada(
  p_cuota   uuid,
  p_avisado boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v     public.fiado_cuotas;
  v_dia date;
  v_n   integer;
begin
  select * into v from public.fiado_cuotas where id = p_cuota;
  if v.id is null then
    raise exception 'Esa cuota ya no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_dia := case when coalesce(p_avisado, true) then public.hoy_empresa(v.empresa_id) else null end;

  -- `dias <= 0`: vence hoy o ya venció, en el día del negocio.
  update public.fiado_cuotas q
  set avisado_el = v_dia
  where q.cliente_id = v.cliente_id
    and (q.id = p_cuota
         or q.id in (select e.cuota_id from public.estado_cuotas(v.cliente_id) e
                     where e.pendiente > 0 and e.dias <= 0));
  get diagnostics v_n = row_count;

  return jsonb_build_object('avisado_el', v_dia, 'marcadas', v_n);
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
--    Sin `p_cuota`, para quien no tiene cuotas pendientes es EXACTAMENTE lo
--    de la 084: un pago suelto contra todo lo que debe el cliente. Devuelve
--    lo de siempre (`id`, `saldo`) y suma claves.
--
--    Sin `p_cuota` y con cuotas pendientes («Todo», «Lo sin fecha» con un
--    monto mayor, o un cobro dictado por voz):
--      · el pago baja primero lo sin fecha, como siempre;
--      · LO QUE SOBRA QUEDA ATADO A LAS CUOTAS QUE TAPA. El cobro se parte
--        en la misma transacción: una línea suelta por lo sin fecha (si hay)
--        y una línea con `fio_id` por cada deuda, repartiendo por fecha de
--        cuota (el orden de `estado_cuotas`) hasta lo pendiente de cada una.
--        Si quedara una sola línea suelta, lo que sobra sería «derrame»
--        calculado al leer, y el día que el cliente vuelve a llevar algo sin
--        fecha ese derrame se lo come la compra nueva: la cuota ya cobrada
--        reaparece atrasada y el pan de hoy figura pagado. Atado, no se
--        mueve más;
--      · la billetera recibe UN solo ajuste por el total: entró una plata;
--      · `id` es el de la primera línea y `lineas` dice cuántas quedaron en
--        el libro. `deuda` sigue en null: no se eligió ninguna.
--    Tampoco deja derrame: suelto va solo lo que entra en lo sin fecha.
--    Los otros caminos por donde podía nacer (ponerle fecha a algo ya
--    pagado, borrar una línea sin fecha pagada) atan lo que sobra ahí mismo
--    (bloque 4b).
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
  v_suelto  numeric;
  v_atado   numeric;
  v_sobra   numeric;
  v_parte   record;
  v_linea   uuid;
  v_lineas  integer := 0;
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

  -- (127) Cuánto del pago va suelto y cuánto atado. Con `p_cuota` nada
  -- cambia: una línea, de esa deuda. Sin ella, suelto va lo que alcanza a lo
  -- sin fecha y lo demás se ata a las cuotas que tapa. Si no hay cuotas
  -- pendientes, o el pago no llega a ellas, es el cobro de siempre: una
  -- sola línea suelta.
  v_suelto := p_monto;
  v_atado  := 0;
  if p_cuota is null
     and exists (select 1 from public.estado_cuotas(p_cliente) e where e.pendiente > 0) then
    v_suelto := least(p_monto, public.sin_fecha_fiado(p_cliente));
    v_atado  := p_monto - v_suelto;
  end if;

  if v_atado = 0 then
    insert into public.fiado (
      empresa_id, cliente_id, tipo, monto, fecha, concepto, metodo, cuenta_id, fio_id, creado_por
    ) values (
      p_empresa, p_cliente, 'cobro', p_monto, v_fecha,
      'Pago recibido', p_metodo, p_cuenta, v_fio, auth.uid()
    )
    returning id into v_id;
    v_lineas := 1;
  else
    if v_suelto > 0 then
      insert into public.fiado (
        empresa_id, cliente_id, tipo, monto, fecha, concepto, metodo, cuenta_id, creado_por
      ) values (
        p_empresa, p_cliente, 'cobro', v_suelto, v_fecha,
        'Pago recibido', p_metodo, p_cuenta, auth.uid()
      )
      returning id into v_id;
      v_lineas := 1;
    end if;

    -- Cuánto le toca a cada deuda: se recorren las cuotas pendientes por
    -- fecha (lo mismo que haría el derrame) y se junta por deuda. La cuenta
    -- se hace entera ANTES de insertar: el reparto no se pisa a sí mismo.
    v_sobra := v_atado;
    for v_parte in
      select t.fio_id, sum(t.toma) as monto
      from (
        select e.fio_id, e.pos,
               greatest(0, least(e.pendiente,
                 v_atado - coalesce(sum(e.pendiente) over (
                   order by e.pos rows between unbounded preceding and 1 preceding), 0))) as toma
        from public.estado_cuotas(p_cliente) with ordinality as e(
          cuota_id, fio_id, numero, de, vence_el, monto, pagado, pendiente, dias,
          avisado_el, concepto, fecha_fio, monto_fio, venta_id, pos)
        where e.pendiente > 0
      ) t
      where t.toma > 0
      group by t.fio_id
      order by min(t.pos)
    loop
      -- Cada parte, un instante después de la anterior: el libro las
      -- muestra siempre en el orden en que se repartieron (bloque 12).
      insert into public.fiado (
        empresa_id, cliente_id, tipo, monto, fecha, concepto, metodo, cuenta_id, fio_id, creado_por, created_at
      ) values (
        p_empresa, p_cliente, 'cobro', v_parte.monto, v_fecha,
        'Pago recibido', p_metodo, p_cuenta, v_parte.fio_id, auth.uid(),
        now() + v_lineas * interval '1 microsecond'
      )
      returning id into v_linea;
      v_id     := coalesce(v_id, v_linea);
      v_lineas := v_lineas + 1;
      v_sobra  := v_sobra - v_parte.monto;
    end loop;

    -- No debería sobrar nada: el pago no supera el saldo, y el saldo es lo
    -- sin fecha más lo pendiente de las cuotas. Si igual sobrara, entra como
    -- pago suelto: la plata que se cobró está SIEMPRE entera en el libro.
    if v_sobra > 0 then
      insert into public.fiado (
        empresa_id, cliente_id, tipo, monto, fecha, concepto, metodo, cuenta_id, creado_por, created_at
      ) values (
        p_empresa, p_cliente, 'cobro', v_sobra, v_fecha,
        'Pago recibido', p_metodo, p_cuenta, auth.uid(),
        now() + v_lineas * interval '1 microsecond'
      )
      returning id into v_linea;
      v_id     := coalesce(v_id, v_linea);
      v_lineas := v_lineas + 1;
    end if;
  end if;

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
    'deuda', v_deuda,
    'lineas', v_lineas
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
--    Las cuotas se miran DESPUÉS de quedarse con quienes deben algo, y solo
--    para quien tiene alguna: quien no debe nada, o debe «y punto», no hace
--    trabajar a nadie. `estado_cuotas` no se puede incrustar en la consulta
--    (es security definer), así que sin ese filtro se la llamaba una vez por
--    deudor: con 1.500 deudores y ninguna cuota, la pantalla de siempre
--    tardaba el triple.
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
    where exists (select 1 from public.fiado_cuotas k where k.cliente_id = n.cliente_id)
      and e.pendiente > 0
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
--
--    EL ORDEN ES FIJO. Las partes de un cobro partido compartían fecha y
--    hora, y salían en cualquier orden, distinto de una lectura a la otra.
--    Dos cosas lo fijan:
--      · cobrar_fiado (bloque 10) anota cada parte un microsegundo después
--        de la anterior: primero la suelta, después cada deuda por fecha de
--        cuota. El libro, que va de lo más nuevo a lo más viejo, las muestra
--        al revés, siempre igual;
--      · para las que sí comparten la hora (un pago que se partió al atarlo,
--        bloque 4b: la gemela hereda la hora de la primera), un desempate:
--        primero lo atado a una deuda, después lo suelto, y al final el id.
--    Lo que ya existía no cambia de lugar: dos líneas con hora distinta
--    siguen como estaban.
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

  select coalesce(jsonb_agg(to_jsonb(x)
           order by x.fecha desc, x.created_at desc, (x.fio_id is null), x.id desc), '[]'::jsonb)
  into v_res
  from (
    select f.id, f.tipo, f.monto, f.fecha, f.concepto, f.venta_id, f.fio_id, f.metodo, f.created_at
    from public.fiado f
    where f.cliente_id = p_cliente
    order by f.fecha desc, f.created_at desc, (f.fio_id is null), f.id desc
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
  -- `cubierto` es lo que esa línea ya tiene pagado (bloque 4b): lo mismo que
  -- programar_cuotas le va a atar si se le pone fecha. La hoja lo dice antes
  -- de guardar («Ya cobraste Gs. X»).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'fecha', f.fecha, 'monto', f.monto,
           'concepto', f.concepto, 'venta_id', f.venta_id,
           'cubierto', k.cubierto
         ) order by f.fecha, f.created_at, f.id), '[]'::jsonb) into v_sin
  from public.fiado_cubierto(p_cliente) k
  join public.fiado f on f.id = k.fio_id;

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
-- 15. BORRAR UNA LÍNEA: UNA DEUDA CON PAGOS PROPIOS NO SE BORRA
--
--    Lo de la 056, con un freno más. El control del saldo no alcanzaba: con
--    otras deudas el saldo podía seguir sobre cero, la deuda se borraba y sus
--    pagos quedaban tapando la libreta. Primero se borran esos pagos.
--
--    El freno mira los PAGOS ATADOS a la deuda (`fio_id`), tenga o no cuotas
--    hoy: es lo mismo que hace anular_borra_el_fiado (bloque 16). Si exigiera
--    que la deuda todavía tenga cuotas, se saltearía sacándole antes las
--    fechas; y ese borrado dispararía el ON DELETE SET NULL de `fio_id`, que
--    es un UPDATE sobre el libro: en una cuenta vencida (o en la personal en
--    Gratis) chocaba con el candado y contestaba «Se te terminó la prueba» a
--    quien solo quería BORRAR, que anda siempre (111). Así el SET NULL queda
--    solo para «empezar de cero», que lleva su marca.
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
     and exists (select 1 from public.fiado c where c.fio_id = p_linea and c.tipo = 'cobro') then
    raise exception 'Esa deuda tiene pagos anotados. Borrá primero esos pagos.'
      using errcode = '22023';
  end if;

  if v.tipo = 'fio' and public.saldo_fiado(v.cliente_id) - v.monto < 0 then
    raise exception
      'Si borrás eso quedaría debiendo menos que cero, porque ya te pagó parte. Borrá primero el pago.'
      using errcode = '22023';
  end if;

  delete from public.fiado where id = p_linea;

  -- (127) Si lo borrado era una línea sin fecha que estaba cubierta por
  -- pagos sueltos, esos pagos quedaron de más: se atan a las cuotas que
  -- tapan. En cualquier otro caso no hay nada que atar y no hace nada.
  if v.tipo = 'fio' then
    perform public.fiado_atar_sueltos(v.cliente_id);
  end if;

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

  -- (127) Lo mismo que al borrar una línea desde Fiado: si la venta estaba
  -- sin fecha y cubierta por pagos sueltos, lo que sobra se ata.
  perform public.fiado_atar_sueltos(v_cliente);
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
--    SE CUENTAN PERSONAS, NO CUOTAS. `cuantas` cuenta cuotas y es lo único
--    que lo hace; todo lo demás habla de gente, porque la frase habla de
--    gente («Hoy te pagan 2», «a 1 todavía no le escribiste»):
--      · `personas` (en `hoy` y en `atrasadas`): a cuánta gente hay que
--        cobrarle en esa parte;
--      · `personas` (arriba): cuánta gente distinta hay ENTRE LAS DOS
--        partes. Quien paga hoy y además arrastra una cuota atrasada es una
--        sola persona: con un plan semanal pasa siempre que queda una cuota
--        sin pagar, y sin este número el aviso decía «Hoy te paga Juan. Y 1
--        atrasado» como si fueran dos. Los atrasados que NO están en lo de
--        hoy son `personas` menos `hoy.personas`;
--      · `sin_escribir`: personas con ALGUNA cuota de hoy o atrasada, con
--        algo pendiente, por la que todavía no se les escribió. Contando
--        cuotas, un solo cliente con dos daba «a 2 todavía no les
--        escribiste». Y alcanza con UNA sin avisar: el botón marca todas
--        las vencidas de la persona de una vez (bloque 8), así que si le
--        queda una sin marca es porque venció después del último mensaje.
--        A quien se le escribió hace una semana y hoy le vence otra hay que
--        volver a escribirle, y por eso se lo vuelve a contar.
--
--    `nombres` son nombres de pila, hasta tres, sin repetir a nadie:
--      · el tratamiento no es el nombre: «Don Pedro Ayala» es Pedro (don,
--        doña, dona, sr, sra, ña, señor, señora, con o sin punto);
--      · si dos personas del mismo aviso comparten el nombre de pila, cada
--        una lleva también la palabra que sigue («Juan Pérez» y «Juan
--        Gómez»): «Juan y Juan» no le dice a nadie a quién cobrarle.
--    Sin expresiones regulares (este archivo no puede llevar barras
--    invertidas): se parte el nombre por espacios. Las minúsculas se comparan
--    escritas de las dos maneras porque `lower` no baja la Ñ en todas las
--    configuraciones de la base.
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
           s.vence_el, s.pendiente, s.avisado_el, (0 - s.dias) as atraso
    from cli
    cross join lateral public.estado_cuotas(cli.cliente_id) s
    where s.pendiente > 0 and s.dias <= 0
  ),
  toca as (
    select distinct k.empresa_id from cu k
    where k.atraso = 0 or k.atraso = 3 or (k.atraso > 0 and mod(k.atraso, 7) = 0)
  ),
  -- El nombre de cada persona del aviso, partido en palabras. `salta` vale 1
  -- cuando la primera palabra es un tratamiento y atrás viene el nombre.
  partes as (
    select p.empresa_id, p.cliente_id, p.palabras,
           case when coalesce(array_length(p.palabras, 1), 0) > 1
                 and lower(rtrim(p.palabras[1], '.')) in (
                   'don', 'doña', 'doÑa', 'dona', 'sr', 'sra', 'ña', 'Ña',
                   'señor', 'seÑor', 'señora', 'seÑora')
                then 1 else 0 end as salta
    from (
      select d.empresa_id, d.cliente_id,
             array_remove(string_to_array(btrim(c.nombre), ' '), '') as palabras
      from (select distinct k.empresa_id, k.cliente_id from cu k) d
      join public.clientes c on c.id = d.cliente_id
    ) p
  ),
  -- Cómo se nombra a cada uno: el nombre de pila y, si en el aviso de ese
  -- negocio hay otro con el mismo, también la palabra que sigue.
  nombrada as (
    select x.empresa_id, x.cliente_id,
           case when count(*) over (partition by x.empresa_id, lower(x.pila)) > 1 and x.sigue is not null
                then x.pila || ' ' || x.sigue else x.pila end as nombre
    from (
      select p.empresa_id, p.cliente_id,
             coalesce(p.palabras[1 + p.salta], '') as pila,
             p.palabras[2 + p.salta] as sigue
      from partes p
    ) x
  ),
  -- Una fila por persona y parte (hoy / atrasadas), para los nombres.
  gente as (
    select k.empresa_id, (k.atraso = 0) as es_hoy, k.cliente_id, m.nombre,
           min(k.vence_el) as vence, sum(k.pendiente) as monto,
           row_number() over (
             partition by k.empresa_id, (k.atraso = 0)
             order by min(k.vence_el), sum(k.pendiente) desc, m.nombre, k.cliente_id) as puesto
    from cu k
    join nombrada m on m.empresa_id = k.empresa_id and m.cliente_id = k.cliente_id
    group by k.empresa_id, (k.atraso = 0), k.cliente_id, m.nombre
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
      -- Gente distinta entre lo de hoy y lo atrasado.
      'personas', (
        select (count(distinct k.cliente_id))::int from cu k
        where k.empresa_id = emp.id),
      -- Personas con ALGUNA cuota sin avisar (count no cuenta los null).
      'sin_escribir', (
        select count(*)::int from (
          select k.cliente_id from cu k
          where k.empresa_id = emp.id
          group by k.cliente_id
          having count(k.avisado_el) < count(*)) z),
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


-- ------------------------------------------------------------
-- 19. ATAR TAMBIÉN DESPUÉS DE UN BORRADO: LOS DOS GUARDIANES Y «EMPEZAR
--     DE CERO»
--
--    Tres funciones de antes, copiadas enteras con un paso más cada una,
--    marcado «127»:
--
--      · exigir_cuenta_activa (116:443-509) y exigir_plan_personal
--        (110:251-267), los dos candados del libro: dejan pasar el atado de
--        pagos sueltos (bloque 4b) por la marca `orden.atando_fiado`. La
--        marca la pone solo fiado_atar_a, que no se le da a nadie, y la apaga
--        al terminar; desde el navegador no se puede poner (111). Vale para
--        el negocio marcado, para la tabla `fiado` y para líneas 'cobro':
--        nada más pasa.
--      · vaciar_empresa (115:550-637): al final, ata lo que haya quedado
--        suelto de más en los clientes que conservan deudas en cuotas.
-- ------------------------------------------------------------
create or replace function public.exigir_cuenta_activa()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- 127 (07/10/2026) · ATAR UN PAGO SUELTO A SU DEUDA ANDA SIEMPRE.
  -- fiado_atar_a marca la transacción con el negocio mientras re-etiqueta
  -- (o parte en dos) líneas 'cobro' que ya estaban en el libro: no entra ni
  -- sale plata. Pasa después de BORRAR una línea, que anda siempre (111), y
  -- al empezar de cero; sin esto, a un negocio vencido borrar una línea le
  -- contestaba «Se te terminó la prueba». Solo el libro y solo cobros.
  if tg_table_name = 'fiado' then
    if coalesce(current_setting('orden.atando_fiado', true), '') = new.empresa_id::text
       and new.tipo = 'cobro' then
      return new;
    end if;
  end if;

  -- 111 (30/09/2026) · «EMPEZAR DE CERO» TAMBIÉN PARA UN NEGOCIO VENCIDO.
  -- Al borrar los movimientos y los productos, el ON DELETE SET NULL de
  -- pagos_deuda, turnos_pago, turnos_atribucion, fiado y paquetes es un
  -- UPDATE que este candado rechazaba. vaciar_empresa (110,
  -- bloque 12) marca la transacción. Hasta la 110 la marca se leía solo en
  -- la rama de Gratis; ahora vale para toda cuenta.
  if tg_op = 'UPDATE'
     and coalesce(current_setting('orden.vaciando', true), '') = new.empresa_id::text then
    return new;
  end if;

  -- 115 (30/09/2026) · CANCELAR CON EL ENLACE ANDA SIEMPRE. cancelar_reserva
  -- marca la transacción con el token de la reserva que cancela. Sin sesión
  -- ya pasaba por el primer `if`; con sesión (un cliente que además usa
  -- Orden) este candado la rechazaba si el negocio estaba vencido.
  if tg_op = 'UPDATE' and tg_table_name = 'turnos_reserva' then
    if coalesce(current_setting('orden.cancelando_turno', true), '') = new.token::text
       and new.estado = 'cancelada' then
      return new;
    end if;
  end if;

  -- 116 (30/09/2026) · ELIMINAR A UN ALUMNO ANDA SIEMPRE, TAMBIÉN CON LO
  -- QUE NO SE LE COBRÓ. eliminar_cliente marca la transacción con el
  -- alumno: pasa cerrar SU paquete y cancelar SUS clases, nada más.
  if tg_op = 'UPDATE' and tg_table_name = 'paquetes' then
    if coalesce(current_setting('orden.eliminando_cliente', true), '') = new.cliente_id::text
       and new.cerrado then
      return new;
    end if;
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'turnos_reserva' then
    if coalesce(current_setting('orden.eliminando_cliente', true), '') = new.cliente_id::text
       and new.estado = 'cancelada' then
      return new;
    end if;
  end if;

  if not public.puede_cargar(new.empresa_id) then
    raise exception 'Se te terminó la prueba. Para seguir usando Orden hace falta activar tu plan.'
      using errcode = '42501';
  end if;

  -- 110 (28/09/2026) · LA CUENTA PERSONAL EN GRATIS. puede_cargar le da true
  -- para que anote gastos e ingresos; todo lo demás que cuida este candado
  -- es del Pro. Un negocio nunca entra acá: para él es_gratis_personal es false.
  -- El paso de «vaciar» que estaba acá subió arriba (111).
  if public.es_gratis_personal(new.empresa_id) then
    if tg_table_name <> 'movimientos' then
      raise exception 'Eso es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.'
        using errcode = '42501';
    end if;
    if new.tipo::text not in ('gasto', 'ingreso') then
      raise exception 'Eso es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $fn$;

revoke all on function public.exigir_cuenta_activa() from public, anon, authenticated;

create or replace function public.exigir_plan_personal()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    return new;
  end if;
  -- 127 (07/10/2026) · Atar un pago suelto a su deuda después de borrar una
  -- línea (ver exigir_cuenta_activa). Solo el libro y solo cobros.
  if tg_table_name = 'fiado' then
    if coalesce(current_setting('orden.atando_fiado', true), '') = new.empresa_id::text
       and new.tipo = 'cobro' then
      return new;
    end if;
  end if;
  if public.es_gratis_personal(new.empresa_id) then
    -- El SET NULL en cascada de «Empezar de cero» (fiado.cobro_id). Ver (12).
    if tg_op = 'UPDATE'
       and coalesce(current_setting('orden.vaciando', true), '') = new.empresa_id::text then
      return new;
    end if;
    raise exception 'Eso es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.'
      using errcode = '42501';
  end if;
  return new;
end $fn$;

revoke all on function public.exigir_plan_personal() from public, anon, authenticated;

create or replace function public.vaciar_empresa(p_empresa uuid, p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre     text;
  v_rutas      jsonb;
  v_movs       int := 0;
  v_prods      int := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  -- Solo el propietario. Un administrador maneja el día a día, pero borrar
  -- la historia entera del negocio es decisión del dueño.
  if not exists (
    select 1 from public.miembros
    where empresa_id = p_empresa and user_id = auth.uid() and rol = 'propietario'
  ) then
    raise exception 'Solo el propietario puede vaciar el negocio.' using errcode = '42501';
  end if;

  select nombre into v_nombre from public.empresas where id = p_empresa;
  if v_nombre is null then
    raise exception 'Esa empresa no existe.' using errcode = 'P0002';
  end if;

  -- La confirmación es escribir el nombre exacto. Un "¿estás seguro?" se
  -- toca sin leer; esto no.
  if trim(coalesce(p_confirmacion, '')) is distinct from v_nombre then
    raise exception 'Para vaciar el negocio hay que escribir su nombre exacto: %', v_nombre
      using errcode = '22023';
  end if;

  -- Las rutas de los archivos ANTES de borrar: después no hay forma de
  -- saber cuáles eran, y quedarían ocupando storage para siempre.
  select coalesce(jsonb_agg(a.ruta), '[]'::jsonb) into v_rutas
  from public.adjuntos a where a.empresa_id = p_empresa and a.ruta is not null;

  -- 110 (28/09/2026): los candados de la gratis personal dejan pasar el
  -- SET NULL en cascada de este borrado (ver exigir_cuenta_activa). Solo
  -- dentro de esta transacción y solo para esta empresa.
  perform set_config('orden.vaciando', p_empresa::text, true);

  -- 115 (30/09/2026): los paquetes y las inscripciones, con sus clases
  -- dadas y las clases de su agenda (CASCADE). Son ventas: si quedaran sin
  -- su venta (SET NULL), figurarían como «por cobrar» y se podrían volver
  -- a cobrar. Los alumnos quedan.
  delete from public.paquetes where empresa_id = p_empresa;

  -- 115 (30/09/2026): las reservas de la agenda, todas, ANTES que los
  -- productos: turnos_reserva.producto_id es RESTRICT (037).
  delete from public.turnos_reserva where empresa_id = p_empresa;

  -- 115 (30/09/2026): el pago de una deuda que el silo se cobró en una
  -- liquidación queda, como queda un pago de cuota sin su movimiento; solo
  -- suelta la liquidación, que se borra abajo.
  update public.pagos_deuda set liquidacion_id = null
  where empresa_id = p_empresa and liquidacion_id is not null;

  -- Los movimientos primero: arrastran líneas y comprobantes.
  -- 115 (30/09/2026): y en la misma sentencia las liquidaciones, que
  -- apuntan a su venta y la venta a ellas (NO ACTION las dos: se controlan
  -- al final de la sentencia, cuando ya no queda ninguna de las dos puntas).
  with papeles as (
    delete from public.liquidaciones where empresa_id = p_empresa returning 1
  ), borrados as (
    delete from public.movimientos where empresa_id = p_empresa returning 1
  )
  select count(*) into v_movs from borrados;

  with borrados as (
    delete from public.productos where empresa_id = p_empresa returning 1
  )
  select count(*) into v_prods from borrados;

  delete from public.retos   where empresa_id = p_empresa;
  delete from public.cierres where empresa_id = p_empresa;

  -- 127 (07/10/2026): al irse las ventas fiadas, los pagos que eran de
  -- ellas quedan sueltos (SET NULL) y las que estaban sin fecha dejan de
  -- contar. Si con eso sobra plata suelta y el cliente tiene otras deudas
  -- en cuotas, se ata a las cuotas que tapa, como al borrar una línea.
  perform public.fiado_atar_sueltos(x.cliente_id)
  from (select distinct q.cliente_id from public.fiado_cuotas q
        where q.empresa_id = p_empresa) x;

  perform set_config('orden.vaciando', '', true);

  return jsonb_build_object(
    'movimientos', v_movs,
    'productos', v_prods,
    -- Que las borre quien llamó: la policy de storage ya le da permiso
    -- sobre la carpeta de su empresa.
    'archivos', v_rutas
  );
end $fn$;

revoke all on function public.vaciar_empresa(uuid, text) from public, anon;
grant execute on function public.vaciar_empresa(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 20. SI YA HABÍA PAGOS SUELTOS DE MÁS, SE ATAN AL APLICAR
--
--    La primera vez no hay nada que hacer: todavía no existe ninguna cuota.
--    Sirve para cuando esta migración se vuelve a aplicar después de haber
--    vuelto atrás: los cobros hechos mientras tanto con el código de antes
--    entraron todos sueltos, y los que pasaron de lo sin fecha quedaron
--    tapando cuotas «por derrame». Acá quedan atados a la deuda que tapan,
--    igual que si se hubieran cobrado con esta versión. No cambia lo que
--    debe nadie ni qué cuota figura pagada; aplicada dos veces, la segunda
--    no encuentra nada.
-- ------------------------------------------------------------
do $$
declare v_cliente uuid;
begin
  for v_cliente in
    select distinct q.cliente_id from public.fiado_cuotas q
    where exists (select 1 from public.partes_fiado(q.cliente_id) p where p.u > p.f0)
  loop
    perform public.fiado_atar_sueltos(v_cliente);
  end loop;
end $$;
