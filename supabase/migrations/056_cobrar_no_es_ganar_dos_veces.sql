-- ============================================================
-- ORDEN · Migración 056 · Cobrar un fiado no es ganar dos veces
--
-- EL ERROR, QUE ESTABA EN LA 054
--
-- `cobrar_fiado` registraba cada cobro como «otro ingreso». La intención
-- era no duplicar la FACTURACIÓN —la venta ya se había registrado el día que
-- salió la mercadería— y eso se cumplía. Pero la ganancia se calcula como
--
--     ventas − costo + otros ingresos − gastos
--
-- así que una venta fiada de 500.000 contaba 500.000 el día de la venta y
-- otros 500.000 el día del cobro. La ganancia del negocio quedaba inflada
-- exactamente en todo lo que se cobraba de fiado.
--
-- Con lo anotado a mano era igual de falso: si le prestaste 500.000 a David
-- y te los devuelve, no ganaste nada. Con la 054, ganabas 500.000.
--
-- Apareció escribiendo la pantalla de Fiado, antes de que existiera ningún
-- botón «Cobrar». La prueba de la 054 afirmaba que el cobro entraba como
-- otro ingreso —describía el error como si fuera la regla— y por eso pasaba.
--
-- LO QUE PASA AHORA
--
-- Cobrar solo baja lo que te deben. No crea ningún movimiento: la venta ya
-- está contada, y un préstamo que vuelve no es ganancia. El panel va a decir
-- cuánto de lo vendido todavía no se cobró, que es la otra mitad de la verdad.
--
-- LO QUE ESTO NO RESUELVE, DICHO DE FRENTE
--
-- La plata que se cobra en efectivo entra al cajón y no aparece entre los
-- movimientos del día, así que el cierre de caja no la ve. Es información que
-- falta, no un número falso, y se arregla mostrando los cobros de fiado en el
-- cierre. Duplicar la ganancia era peor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CÓMO SE COBRÓ
--
--    Sin movimiento, el libro es el único lugar donde queda. Y va a hacer
--    falta el día que el cierre de caja muestre los cobros en efectivo.
-- ------------------------------------------------------------
alter table public.fiado
  add column if not exists metodo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fiado_metodo_valido') then
    alter table public.fiado add constraint fiado_metodo_valido
      check (metodo is null or metodo in ('efectivo', 'transferencia', 'tarjeta', 'otro'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. COBRAR, SIN INGRESO
--
--    Misma firma que en la 054, así que se reemplaza sin tocar a quien ya la
--    llama. Lo único que cambia es que no inserta nada en `movimientos`.
--
--    Se agrega un candado sobre el cliente: dos cobros al mismo tiempo podían
--    pasar los dos el control del saldo y dejarlo por debajo de cero.
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
  v_saldo  numeric;
  v_nombre text;
  v_id     uuid;
  v_debe   text;
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

  insert into public.fiado (
    empresa_id, cliente_id, tipo, monto, fecha, concepto, metodo, creado_por
  ) values (
    p_empresa, p_cliente, 'cobro', p_monto,
    coalesce(p_fecha, public.hoy_empresa(p_empresa)),
    'Pago recibido', p_metodo, auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'saldo', public.saldo_fiado(p_cliente));
end $fn$;

revoke all on function public.cobrar_fiado(uuid, uuid, numeric, text, date) from public, anon;
grant execute on function public.cobrar_fiado(uuid, uuid, numeric, text, date) to authenticated;

-- ------------------------------------------------------------
-- 3. BORRAR LO ANOTADO POR ERROR
--
--    Un fiado cargado dos veces, un pago con el monto equivocado: sin esto,
--    la única salida era anotar una línea al revés y ensuciar el libro.
--
--    Lo puede borrar quien lo anotó o un administrador. Lo que vino de una
--    venta NO se borra acá: se deshace anulando la venta, que es la que
--    además devuelve el stock.
--
--    Y borrar algo fiado no puede dejar el saldo por debajo de cero: si ya te
--    pagó parte, primero va el cobro.
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
-- 4. EL MENSAJE AL ANULAR UNA VENTA YA COBRADA
--
--    Decía «anulá primero el cobro», y no había forma de hacerlo. Ahora la
--    hay, así que el mensaje dice dónde.
-- ------------------------------------------------------------
create or replace function public.anular_borra_el_fiado()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_cliente uuid;
  v_monto   numeric;
begin
  if new.estado <> 'anulado' or old.estado = 'anulado' then
    return new;
  end if;

  select f.cliente_id, f.monto into v_cliente, v_monto
  from public.fiado f
  where f.venta_id = new.id and f.tipo = 'fio';

  if v_cliente is null then return new; end if;

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
-- 5. LOS COBROS QUE YA SE HABÍAN CONTADO COMO INGRESO
--
--    Si alguno llegó a existir, su «otro ingreso» sigue inflando la ganancia.
--    No se tocan solos: son movimientos de un negocio real, y anularlos es
--    una decisión que se toma mirándolos. Se avisa cuántos hay.
-- ------------------------------------------------------------
do $$
declare v_cuantos integer;
begin
  select count(*) into v_cuantos
  from public.fiado f
  join public.movimientos m on m.id = f.cobro_id
  where f.tipo = 'cobro' and m.estado = 'activo';

  if v_cuantos > 0 then
    raise notice
      'Hay % cobros de fiado anteriores que siguen contando como ingreso. Revisalos en el historial (categoría «Fiado») y anulalos.',
      v_cuantos;
  end if;
end $$;
