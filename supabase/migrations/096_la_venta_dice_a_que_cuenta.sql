-- ============================================================
-- 096 · LA VENTA TAMBIÉN DICE A QUÉ CUENTA ENTRÓ
-- ============================================================
--
-- La 095 lo hizo para el cobro de un alumno. Matías lo pidió para todo
-- cobro: «al cobrar, si selecciono transferencia, me debería aparecer la
-- opción de a cuál banco se me va a acreditar». En la pantalla de Cobrar
-- pasa lo mismo: con Atlas y Continental, toda transferencia caía en el que
-- reclama «transferencia», aunque la plata haya llegado al otro.
--
-- `registrar_venta` suma un parámetro al final, `p_cuenta`. Sin él todo
-- sigue igual: la captura inteligente, los paquetes y las correcciones
-- (`reemplazar_venta`, que la llama con nueve argumentos) no cambian.
--
-- Es una copia exacta de la 055 —la versión viva; su cuerpo, sin
-- comentarios, da la misma huella— con la cuenta agregada. La firma vieja
-- se borra antes: con un parámetro más, `create or replace` crearía una
-- segunda función al lado y cada llamada de siempre se volvería ambigua.

drop function if exists public.registrar_venta(
  uuid, jsonb, date, text, text, text, text, origen_captura, numeric, uuid);

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
  p_cliente uuid default null,
  -- En qué cuenta entró (096). Null = la de su forma de pago, como siempre.
  p_cuenta uuid default null
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

  -- Decir a qué cuenta entró es administrar la billetera: el que vende no
  -- decide dónde queda la plata del dueño (lo mismo que el fiado, 084). Y lo
  -- fiado no entra en ninguna: todavía no te lo pagaron.
  if p_cuenta is not null then
    if not public.es_admin(p_empresa) then
      raise exception 'Solo el dueño de la cuenta puede elegir en qué cuenta entra.' using errcode = '42501';
    end if;
    if v_metodo = 'credito' then
      raise exception 'Lo fiado no entra en ninguna cuenta hasta que te lo paguen.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.cuentas_dinero c
                   where c.id = p_cuenta and c.empresa_id = p_empresa and c.activa) then
      raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
    end if;
  end if;

  ------------------------------------------------ cabecera
  insert into public.movimientos (
    empresa_id, tipo, estado, fecha, descripcion, categoria,
    subtotal, descuento, monto, costo_total,
    metodo_pago, contraparte, notas, origen, creado_por, cliente_id, cuenta_id
  )
  values (
    p_empresa, 'venta', 'activo', v_fecha,
    left(coalesce(trim(p_descripcion), ''), 200), 'Ventas',
    v_subtotal, v_desc, v_subtotal - v_desc, v_costo,
    v_metodo, left(coalesce(trim(p_contraparte), ''), 80), left(coalesce(p_notas, ''), 500),
    coalesce(p_origen, 'manual'), auth.uid(), v_cliente, p_cuenta
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

revoke all on function public.registrar_venta(
  uuid, jsonb, date, text, text, text, text, origen_captura, numeric, uuid, uuid) from public, anon;
grant execute on function public.registrar_venta(
  uuid, jsonb, date, text, text, text, text, origen_captura, numeric, uuid, uuid) to authenticated;
