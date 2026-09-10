-- ============================================================
-- ORDEN · Migración 055 · Una venta fiada deja una deuda
--
-- LA MITAD QUE FALTABA
--
-- La 054 armó el libro de lo que te deben. Esto lo conecta con la caja:
-- cuando una venta se cobra «Fiado», queda anotada como deuda de ese
-- cliente en lugar de desaparecer en una etiqueta.
--
-- Y con eso, «Fiado» deja de ser una palabra al lado de una venta y pasa a
-- ser plata que alguien tiene que ir a cobrar.
--
-- POR QUÉ AHORA HAY QUE DECIR A QUIÉN SE LE FÍA
--
-- Antes se podía marcar una venta como fiada sin decir de quién. Eso dejaba
-- una deuda que nadie puede cobrar y un ingreso que nunca se va a cerrar.
-- Ahora es obligatorio, y es un cambio de comportamiento: una venta fiada
-- sin cliente ahora es rechazada, con un mensaje que dice qué hacer.
--
-- LA FIRMA CAMBIA, ASÍ QUE LA VIEJA SE BORRA
--
-- Si quedaran las dos, PostgREST vería dos funciones con el mismo nombre y
-- no sabría cuál llamar. Es lo mismo que hicieron la 019 y la 048.
--
-- EL CUERPO NO SE TOCÓ A MANO
--
-- Esta función mueve stock y plata. El cuerpo se extrajo del archivo de la
-- 032 con un script y se le agregaron solo las partes marcadas, para que no
-- haya forma de que se cuele una diferencia silenciosa al transcribir.
-- ============================================================

-- ------------------------------------------------------------
-- 1. A QUIÉN SE LE VENDIÓ
--
--    Sirve para toda venta, no solo para las fiadas: es lo que permite ver
--    el historial de un cliente en un almacén, donde no hay turnos.
--
--    Clave compuesta contra `clientes (id, empresa_id)`: una venta no puede
--    apuntar al cliente de otro negocio ni con un UPDATE a mano.
-- ------------------------------------------------------------
alter table public.movimientos
  add column if not exists cliente_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimiento_cliente_misma_empresa') then
    alter table public.movimientos
      add constraint movimiento_cliente_misma_empresa
      foreign key (cliente_id, empresa_id)
      references public.clientes (id, empresa_id) on delete set null;
  end if;
end $$;

create index if not exists movimientos_cliente_idx
  on public.movimientos (cliente_id) where cliente_id is not null;

-- ------------------------------------------------------------
-- 2. LA VENTA
-- ------------------------------------------------------------
create or replace function public.registrar_venta(
  p_empresa uuid,
  p_items jsonb,
  p_fecha date default null,
  p_descripcion text default '',
  p_metodo_pago text default 'efectivo',
  p_contraparte text default '',
  p_notas text default '',
  p_origen origen_captura default 'manual',
  p_descuento numeric default 0,
  -- A quién se le vende. Solo hace falta cuando la venta es fiada, pero se
  -- guarda siempre: sirve para el historial del cliente.
  p_cliente uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_mov       uuid;
  v_item      jsonb;
  v_prod      public.productos%rowtype;
  v_norm      jsonb := '[]'::jsonb;
  v_subtotal  numeric(14,2) := 0;
  v_costo     numeric(14,2) := 0;
  v_desc      numeric(14,2);
  v_cant      numeric(14,2);
  v_precio    numeric(14,2);
  v_costo_u   numeric(14,2);
  v_nombre    text;
  v_pid       uuid;
  v_fecha     date;
  v_permitir  boolean;
  v_stock     numeric(14,2);
  v_metodo    text;
  v_cliente   uuid;
begin
  ------------------------------------------------ autenticación y pertenencia
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select permitir_stock_negativo into v_permitir from public.empresas where id = p_empresa;
  if not found then
    raise exception 'La empresa no existe.' using errcode = '42501';
  end if;

  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  ------------------------------------------------ validaciones generales
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La venta necesita una lista de productos.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'La venta necesita al menos un producto.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 200 then
    raise exception 'Una venta no puede tener más de 200 líneas.' using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));
  if v_fecha < date '2000-01-01' or v_fecha > public.hoy_empresa(p_empresa) + 1 then
    raise exception 'La fecha de la venta no es válida.' using errcode = '22007';
  end if;

  v_metodo := lower(coalesce(nullif(trim(p_metodo_pago), ''), 'efectivo'));
  if v_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro') then
    raise exception 'La forma de cobro no es válida.' using errcode = '22023';
  end if;

  ------------------------------------------------ primera pasada: validar y normalizar
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada línea de la venta tiene que ser un objeto.' using errcode = '22023';
    end if;

    begin
      v_cant := (v_item ->> 'cantidad')::numeric;
    exception when others then
      raise exception 'La cantidad tiene que ser un número.' using errcode = '22023';
    end;

    if v_cant is null or v_cant <= 0 then
      raise exception 'La cantidad tiene que ser mayor a cero.' using errcode = '22023';
    end if;
    if v_cant > 1000000 then
      raise exception 'La cantidad es demasiado grande.' using errcode = '22023';
    end if;

    v_pid := null;
    if nullif(trim(coalesce(v_item ->> 'producto_id', '')), '') is not null then
      begin
        v_pid := (v_item ->> 'producto_id')::uuid;
      exception when others then
        raise exception 'El identificador del producto no es válido.' using errcode = '22023';
      end;
    end if;

    if v_pid is not null then
      -- El producto tiene que existir Y ser de esta empresa.
      select * into v_prod from public.productos where id = v_pid and empresa_id = p_empresa;
      if not found then
        raise exception 'Ese producto no pertenece a esta empresa.' using errcode = '42501';
      end if;

      v_nombre  := v_prod.nombre;
      -- El precio SÍ puede ser distinto al del catálogo (rebaja puntual, acuerdo con el cliente).
      v_precio  := coalesce(nullif(v_item ->> 'precio_unitario', '')::numeric, v_prod.precio);
      -- El costo NO: siempre el del catálogo. Lo que mande el cliente se descarta.
      v_costo_u := v_prod.costo;
    else
      v_nombre := nullif(trim(coalesce(v_item ->> 'nombre', '')), '');
      if v_nombre is null then
        raise exception 'Cada producto suelto necesita un nombre.' using errcode = '22023';
      end if;
      v_nombre  := left(v_nombre, 120);
      v_precio  := coalesce(nullif(v_item ->> 'precio_unitario', '')::numeric, 0);
      v_costo_u := coalesce(nullif(v_item ->> 'costo_unitario', '')::numeric, 0);
    end if;

    if v_precio is null or v_precio < 0 then
      raise exception 'El precio no puede ser negativo.' using errcode = '22023';
    end if;
    if v_costo_u is null or v_costo_u < 0 then
      raise exception 'El costo no puede ser negativo.' using errcode = '22023';
    end if;

    v_subtotal := v_subtotal + (v_cant * v_precio);
    v_costo    := v_costo + (v_cant * v_costo_u);

    v_norm := v_norm || jsonb_build_object(
      'producto_id', v_pid,
      'nombre', v_nombre,
      'cantidad', v_cant,
      'precio_unitario', v_precio,
      'costo_unitario', v_costo_u,
      'controla_stock', coalesce(v_pid is not null and v_prod.controla_stock, false)
    );
  end loop;

  ------------------------------------------------ descuento
  v_desc := coalesce(p_descuento, 0);
  if v_desc < 0 then
    raise exception 'El descuento no puede ser negativo.' using errcode = '22023';
  end if;
  if v_desc > v_subtotal then
    raise exception 'El descuento no puede ser mayor que el subtotal de la venta.' using errcode = '22023';
  end if;

  ------------------------------------------------ el cliente
  -- Se valida ANTES de tocar el stock: si el cliente no es de esta cuenta,
  -- que la venta entera no llegue a existir.
  v_cliente := p_cliente;
  if v_cliente is not null
     and not exists (select 1 from public.clientes
                     where id = v_cliente and empresa_id = p_empresa) then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  -- Fiar sin saber a quién es anotar en la pared. Se puede vender fiado sin
  -- cliente en otros sistemas; acá no, porque el resultado sería una deuda
  -- que nadie puede cobrar y un número que infla los ingresos para siempre.
  if v_metodo = 'credito' and v_cliente is null then
    raise exception 'Para vender fiado hay que decir a quién: elegí o creá el cliente.'
      using errcode = '22023';
  end if;

  ------------------------------------------------ cabecera
  insert into public.movimientos (
    empresa_id, tipo, estado, fecha, descripcion, categoria,
    subtotal, descuento, monto, costo_total,
    metodo_pago, contraparte, notas, origen, creado_por, cliente_id
  )
  values (
    p_empresa, 'venta', 'activo', v_fecha,
    left(coalesce(trim(p_descripcion), ''), 200), 'Ventas',
    v_subtotal, v_desc, v_subtotal - v_desc, v_costo,
    v_metodo, left(coalesce(trim(p_contraparte), ''), 80), left(coalesce(p_notas, ''), 500),
    coalesce(p_origen, 'manual'), auth.uid(), v_cliente
  )
  returning id into v_mov;

  ------------------------------------------------ items y stock
  for v_item in select * from jsonb_elements_ordenados(v_norm) loop
    v_cant := (v_item ->> 'cantidad')::numeric;
    v_pid  := nullif(v_item ->> 'producto_id', '')::uuid;

    if v_pid is not null and (v_item ->> 'controla_stock')::boolean then
      -- Aritmética relativa: dos ventas simultáneas no se pisan.
      update public.productos
        set stock = stock - v_cant
        where id = v_pid
        returning stock into v_stock;

      if not v_permitir and v_stock < 0 then
        raise exception 'No hay stock suficiente de %.', v_item ->> 'nombre' using errcode = '23514';
      end if;
    end if;

    insert into public.movimiento_items (
      movimiento_id, empresa_id, producto_id, nombre, cantidad,
      precio_unitario, costo_unitario, afecto_stock
    )
    values (
      v_mov, p_empresa, v_pid, v_item ->> 'nombre', v_cant,
      (v_item ->> 'precio_unitario')::numeric,
      (v_item ->> 'costo_unitario')::numeric,
      coalesce(v_pid is not null and (v_item ->> 'controla_stock')::boolean, false)
    );
  end loop;

  ------------------------------------------------ descripción automática
  update public.movimientos
  set descripcion = (
    select string_agg(nombre || ' x' || trim(to_char(cantidad, 'FM999999990.##')), ', ')
    from public.movimiento_items where movimiento_id = v_mov
  )
  where id = v_mov and coalesce(trim(descripcion), '') = '';

  ------------------------------------------------ si fue fiada, se anota
  --
  -- Acá está el arreglo. Hasta ahora «Fiado» era una etiqueta: la venta
  -- sumaba como ingreso igual que si te hubieran pagado en efectivo, y no
  -- quedaba escrito quién debía.
  --
  -- Va al final, después del stock y de los items: si algo de eso falla, la
  -- transacción se va entera y no queda una deuda por una venta que no pasó.
  if v_metodo = 'credito' then
    insert into public.fiado (
      empresa_id, cliente_id, tipo, monto, fecha, concepto, venta_id, creado_por
    )
    select p_empresa, v_cliente, 'fio', v_subtotal - v_desc, v_fecha,
           left(coalesce((
             select string_agg(nombre || ' x' || trim(to_char(cantidad, 'FM999999990.##')), ', ')
             from public.movimiento_items where movimiento_id = v_mov
           ), 'Venta fiada'), 200),
           v_mov, auth.uid();
  end if;

  return v_mov;
end $$;

-- La firma vieja de 9 argumentos queda muerta.
drop function if exists public.registrar_venta(
  uuid, jsonb, date, text, text, text, text, origen_captura, numeric);

revoke all on function public.registrar_venta(
  uuid, jsonb, date, text, text, text, text, origen_captura, numeric, uuid) from public, anon;
grant execute on function public.registrar_venta(
  uuid, jsonb, date, text, text, text, text, origen_captura, numeric, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. ANULAR UNA VENTA FIADA BORRA LA DEUDA
--
--    Anular no borra el movimiento: lo marca. Así que la línea del libro no
--    se va sola, y quedaría reclamando plata por una venta que se deshizo.
--
--    Se hace con un trigger y no dentro de `anular_movimiento` por lo mismo
--    de siempre: es una regla sobre el dato, y tiene que valer venga por
--    donde venga —incluido un UPDATE desde el editor SQL.
--
--    Si el cliente ya pagó algo, NO se borra en silencio: eso dejaría el
--    saldo en negativo, que no significa nada. Se frena y se explica.
-- ------------------------------------------------------------
create or replace function public.anular_borra_el_fiado()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_cliente uuid;
  v_monto   numeric;
  v_saldo   numeric;
begin
  if new.estado <> 'anulado' or old.estado = 'anulado' then
    return new;
  end if;

  select f.cliente_id, f.monto into v_cliente, v_monto
  from public.fiado f
  where f.venta_id = new.id and f.tipo = 'fio';

  if v_cliente is null then return new; end if;

  v_saldo := public.saldo_fiado(v_cliente);
  if v_saldo - v_monto < 0 then
    raise exception
      'Esa venta fiada ya fue cobrada, entera o en parte. Anulá primero el cobro y después la venta.'
      using errcode = '22023';
  end if;

  delete from public.fiado where venta_id = new.id and tipo = 'fio';
  return new;
end $fn$;

revoke all on function public.anular_borra_el_fiado() from public, anon, authenticated;

drop trigger if exists anular_borra_el_fiado on public.movimientos;
create trigger anular_borra_el_fiado
  after update on public.movimientos
  for each row execute function public.anular_borra_el_fiado();
