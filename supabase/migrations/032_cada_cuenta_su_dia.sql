-- ORDEN · Migración 032 · Cada cuenta decide su propio día
--
-- Orden guarda la zona horaria de cada empresa desde la migración 008, y
-- tiene `hoy_empresa(empresa_id)` para preguntarle qué día es allá. Pero
-- media docena de lugares centrales seguían preguntándoselo a Asunción.
--
-- MIENTRAS TODOS LOS CLIENTES ESTUVIERON EN PARAGUAY, NO SE NOTÓ. Y esa es
-- exactamente la forma más peligrosa de un error: el que no falla hasta que
-- falla con un cliente nuevo, lejos, y sin nada en los registros que lo
-- explique.
--
-- Ya se cobró una vez. Un ingreso cargado con fecha de mañana se rechazaba
-- con «new row violates row-level security policy», un mensaje que no dice
-- nada, porque la política comparaba contra el día en Asunción.
--
-- Y se vuelve bloqueante ahora: el módulo de turnos calcula huecos libres.
-- Un motor de horarios que resuelve "hoy" en la zona equivocada ofrece turnos
-- que no existen, y eso aparece como «me dio una hora imposible» — imposible
-- de diagnosticar en producción.
--
-- LO QUE **NO** SE TOCA
--
-- Los doce lugares donde Asunción es un *valor por defecto* se quedan como
-- están: `empresas.zona_horaria`, los `p_zona text default` de las funciones
-- de registro y sus `coalesce`. Ahí Asunción no decide nada, solo cubre el
-- caso en que el navegador no informe su zona. Está bien y tiene que seguir.
--
-- Tampoco se tocan los permisos. `create or replace function` conserva los
-- privilegios que la función ya tenía, así que volver a otorgarlos acá sería
-- arriesgarse a reabrirle a `anon` algo que la migración 012 cerró.

-- ============================================================
-- 1. LA POLÍTICA QUE DIO EL ERROR
--
--    Una política se evalúa por fila, así que puede leer `empresa_id` de la
--    fila que se está insertando. El resto de la política no cambia.
-- ============================================================
drop policy if exists movimientos_insert on public.movimientos;
create policy movimientos_insert on public.movimientos
  for insert with check (
    public.es_miembro(empresa_id)
    and tipo <> 'venta'
    and estado = 'activo'
    and creado_por = auth.uid()
    and descuento = 0
    and costo_total = 0
    and subtotal = monto
    and anulado_por is null
    and anulado_at is null
    and fecha >= date '2000-01-01'
    and fecha <= (public.hoy_empresa(empresa_id) + 1)
  );

-- ============================================================
-- 2. LAS FECHAS POR DEFECTO DE LAS DOS TABLAS
--
--    Un `default` de columna no puede mirar otra columna de su propia fila,
--    así que no hay forma de escribir `hoy_empresa(empresa_id)` ahí. Se
--    resuelve con un trigger que completa la fecha cuando viene vacía.
--
--    El orden importa y sale bien: PostgreSQL corre los triggers BEFORE antes
--    de comprobar las restricciones y las políticas RLS, así que la política
--    de arriba ve la fecha que el trigger ya completó.
-- ============================================================
create or replace function public.fecha_de_la_empresa()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if new.fecha is null then
    new.fecha := public.hoy_empresa(new.empresa_id);
  end if;
  return new;
end $fn$;

alter table public.movimientos        alter column fecha drop default;
alter table public.movimientos_ahorro alter column fecha drop default;

drop trigger if exists fecha_empresa_movimientos on public.movimientos;
create trigger fecha_empresa_movimientos
  before insert on public.movimientos
  for each row execute function public.fecha_de_la_empresa();

drop trigger if exists fecha_empresa_movimientos_ahorro on public.movimientos_ahorro;
create trigger fecha_empresa_movimientos_ahorro
  before insert on public.movimientos_ahorro
  for each row execute function public.fecha_de_la_empresa();

-- ============================================================
-- 3. REGISTRAR UNA VENTA
--
--    Cuerpo idéntico al de la migración 002. Cambian dos líneas: la fecha
--    por defecto y el tope del rango válido.
-- ============================================================
create or replace function public.registrar_venta(
  p_empresa uuid,
  p_items jsonb,
  p_fecha date default null,
  p_descripcion text default '',
  p_metodo_pago text default 'efectivo',
  p_contraparte text default '',
  p_notas text default '',
  p_origen origen_captura default 'manual',
  p_descuento numeric default 0
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

  ------------------------------------------------ cabecera
  insert into public.movimientos (
    empresa_id, tipo, estado, fecha, descripcion, categoria,
    subtotal, descuento, monto, costo_total,
    metodo_pago, contraparte, notas, origen, creado_por
  )
  values (
    p_empresa, 'venta', 'activo', v_fecha,
    left(coalesce(trim(p_descripcion), ''), 200), 'Ventas',
    v_subtotal, v_desc, v_subtotal - v_desc, v_costo,
    v_metodo, left(coalesce(trim(p_contraparte), ''), 80), left(coalesce(p_notas, ''), 500),
    coalesce(p_origen, 'manual'), auth.uid()
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

  return v_mov;
end $$;

-- ============================================================
-- 4. ANULAR UN MOVIMIENTO
--
--    Un vendedor solo anula lo suyo y solo el mismo día. Ese "mismo día" es
--    el de la empresa dueña del movimiento: si no, alguien en otra zona
--    pierde o gana una hora para corregir un error.
-- ============================================================
create or replace function public.anular_movimiento(
  p_movimiento uuid,
  p_motivo text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_mov     public.movimientos%rowtype;
  v_item    public.movimiento_items%rowtype;
  v_hoy     date;
  v_filas   integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  -- El FOR UPDATE serializa dos anulaciones simultáneas del mismo movimiento.
  select * into v_mov from public.movimientos where id = p_movimiento for update;
  if not found then
    raise exception 'El movimiento no existe.' using errcode = '42501';
  end if;

  if not public.es_miembro(v_mov.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  -- Recién acá se puede saber qué día es "hoy": depende de la zona de la
  -- empresa dueña del movimiento, no de la del servidor ni de Asunción.
  v_hoy := public.hoy_empresa(v_mov.empresa_id);

  if v_mov.estado = 'anulado' then
    raise exception 'Este movimiento ya estaba anulado.' using errcode = '23505';
  end if;

  -- Un vendedor solo anula lo que cargó él y solo el mismo día.
  if not public.es_admin(v_mov.empresa_id)
     and not (v_mov.creado_por = auth.uid() and v_mov.fecha = v_hoy) then
    raise exception 'Solo un administrador puede anular movimientos de otra persona o de días anteriores.'
      using errcode = '42501';
  end if;

  -- Marcamos primero, con guarda de estado: si otra transacción ganó la carrera,
  -- v_filas = 0 y salimos sin tocar el stock.
  update public.movimientos
  set estado = 'anulado',
      anulado_por = auth.uid(),
      anulado_at = now(),
      motivo_anulacion = left(nullif(trim(coalesce(p_motivo, '')), ''), 200)
  where id = v_mov.id and estado = 'activo';

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Este movimiento ya estaba anulado.' using errcode = '23505';
  end if;

  -- Devolvemos exactamente el stock que la venta descontó.
  if v_mov.tipo = 'venta' then
    for v_item in
      select * from public.movimiento_items
      where movimiento_id = v_mov.id and afecto_stock and producto_id is not null
    loop
      update public.productos
        set stock = stock + v_item.cantidad
        where id = v_item.producto_id;
    end loop;
  end if;

  return v_mov.id;
end $$;
