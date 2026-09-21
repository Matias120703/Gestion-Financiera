-- ============================================================
-- 084 · PRESTAR PLATA SALE DE UNA CUENTA (Y NO ES UN GASTO)
-- ============================================================
--
-- Matías: «el fiado puede ser prestarle plata de tu billetera a alguien. Yo
-- le presté 300.000 y se los transferí de mi banco. Tendría que poder elegir
-- de cuál banco lo debité, así se actualiza el saldo que tengo realmente. O
-- el fiado puede ser solo porque te debe: tiene que estar la opción de
-- «¿querés debitar de tu billetera o dejamos así nomás?»».
--
-- Son dos cosas distintas que hoy se anotaban igual:
--
--   · FIASTE UNA VENTA. Entregaste mercadería, no plata. De tus cuentas no
--     salió nada, y está bien que el saldo no se mueva.
--   · PRESTASTE PLATA. Salió de una cuenta tuya de verdad. Que el saldo no
--     baje es mentirle a la persona sobre cuánto tiene.
--
-- POR QUÉ NO SE REGISTRA COMO GASTO
--
-- Sería lo fácil: un gasto baja el saldo y listo. Pero prestar plata NO es
-- un gasto, es la misma plata cambiada de lugar —de tu banco a «lo que me
-- deben»—. Anotarlo como gasto le inflaría los gastos del mes y le bajaría
-- la ganancia neta por algo que no perdió. Ese es justamente el número que
-- Matías ya vio raro («me aparece en negativo cuando no tenía nada que ver»).
--
-- Va como un ajuste de cuenta, que es lo que mueve el saldo sin tocar las
-- ventas ni los gastos. Con su propio tipo, `prestamo`, para que la fila
-- diga qué es y no se confunda con una corrección a mano.
--
-- LO QUE ESTA MIGRACIÓN NO RESUELVE
--
-- Cuando el cliente devuelve la plata, `cobrar_fiado` la registra como «otro
-- ingreso». Para una venta fiada eso es correcto —la plata entra recién ahí—
-- pero para un préstamo devuelto no: estás recuperando lo tuyo, no ganando.
-- Se deja así a propósito: un cobro se hace contra el total del cliente, que
-- puede mezclar ventas fiadas y préstamos, y repartirlo entre los dos es una
-- decisión de producto que hay que tomar con Matías, no adivinar acá.

-- ------------------------------------------------------------
-- 1. UN AJUSTE PUEDE SER UN PRÉSTAMO
-- ------------------------------------------------------------
alter table public.ajustes_cuenta drop constraint if exists ajustes_cuenta_tipo_check;
alter table public.ajustes_cuenta
  add constraint ajustes_cuenta_tipo_check
  check (tipo in ('ajuste', 'transferencia', 'prestamo'));

-- ------------------------------------------------------------
-- 2. EL FIADO RECUERDA DE DÓNDE SALIÓ LA PLATA
--
--    En null cuando no salió de ningún lado, que es el caso de una venta
--    fiada. No es lo mismo «no se eligió cuenta» que «no salió plata»: acá
--    significan lo mismo a propósito, porque si no salió de una cuenta el
--    saldo no tiene por qué moverse.
-- ------------------------------------------------------------
alter table public.fiado
  add column if not exists cuenta_id uuid references public.cuentas_dinero (id) on delete set null;

comment on column public.fiado.cuenta_id is
  'De qué cuenta salió la plata prestada. Null si fue una venta fiada: ahí no salió plata (084).';

-- ------------------------------------------------------------
-- 3. ANOTAR: CON CUENTA ES PRÉSTAMO, SIN CUENTA ES FIADO
--
--    La firma vieja se borra antes de crear la nueva. Si quedaran las dos,
--    llamarla con cinco argumentos sería ambiguo y PostgreSQL rechazaría la
--    llamada: la pantalla dejaría de poder anotar nada.
-- ------------------------------------------------------------
drop function if exists public.anotar_fiado(uuid, uuid, numeric, text, date);

create or replace function public.anotar_fiado(
  p_empresa  uuid,
  p_cliente  uuid,
  p_monto    numeric,
  p_concepto text default '',
  p_fecha    date default null,
  p_cuenta   uuid default null
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

  return v_id;
end $fn$;

revoke all on function public.anotar_fiado(uuid, uuid, numeric, text, date, uuid) from public, anon;
grant execute on function public.anotar_fiado(uuid, uuid, numeric, text, date, uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Y COBRAR ENTRA EN LA CUENTA QUE SE ELIJA
--
--    Matías: «me puede pagar por transferencia, y yo elijo el banco al que
--    me transfirió, así ya me aparece actualizado en mi billetera».
--
--    OJO CON CÓMO SE ARREGLA ESTO. La 056 sacó a propósito el ingreso que
--    creaba el cobro, porque inflaba la ganancia: una venta fiada de 500.000
--    se contaba el día de la venta y otra vez el día del cobro. Volver a
--    crear ese movimiento para mover el saldo sería revertir ese arreglo y
--    devolverle al negocio una ganancia que no tuvo.
--
--    Va por el mismo camino que el préstamo, y por el mismo motivo: un
--    ajuste de cuenta mueve el saldo SIN tocar ventas, ingresos ni ganancia.
--    Queda simétrico y se lee solo:
--
--      · prestar  → ajuste  −monto  (bajó tu plata, no fue un gasto)
--      · cobrar   → ajuste  +monto  (subió tu plata, no fue una ganancia)
--
--    Sin cuenta elegida no se toca ningún saldo, igual que hasta ahora: si
--    te pagaron en efectivo y no llevás caja en Orden, nada que mover.
-- ------------------------------------------------------------
drop function if exists public.cobrar_fiado(uuid, uuid, numeric, text, date);

create or replace function public.cobrar_fiado(
  p_empresa uuid,
  p_cliente uuid,
  p_monto   numeric,
  p_metodo  text default 'efectivo',
  p_fecha   date default null,
  p_cuenta  uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo  numeric;
  v_nombre text;
  v_id     uuid;
  v_debe   text;
  v_fecha  date;
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

  v_saldo := public.saldo_fiado(p_cliente);
  if v_saldo <= 0 then
    raise exception '% no te debe nada.', v_nombre using errcode = '22023';
  end if;

  if p_monto > v_saldo then
    -- «600.000» y no «600000.00»: esto lo lee una persona.
    v_debe := case when v_saldo = trunc(v_saldo)
                   then replace(to_char(v_saldo, 'FM999,999,999,990'), ',', '.')
                   else v_saldo::text end;
    raise exception '% te debe %, no podés cobrarle más que eso.', v_nombre, v_debe
      using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  insert into public.fiado (
    empresa_id, cliente_id, tipo, monto, fecha, concepto, metodo, cuenta_id, creado_por
  ) values (
    p_empresa, p_cliente, 'cobro', p_monto, v_fecha,
    'Pago recibido', p_metodo, p_cuenta, auth.uid()
  )
  returning id into v_id;

  if p_cuenta is not null then
    insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, fecha, nota, creado_por)
    values (p_empresa, p_cuenta, 'prestamo', p_monto, v_fecha,
            left('Te pagó ' || v_nombre, 200), auth.uid());
  end if;

  return jsonb_build_object('id', v_id, 'saldo', public.saldo_fiado(p_cliente));
end $fn$;

revoke all on function public.cobrar_fiado(uuid, uuid, numeric, text, date, uuid) from public, anon;
grant execute on function public.cobrar_fiado(uuid, uuid, numeric, text, date, uuid) to authenticated;
