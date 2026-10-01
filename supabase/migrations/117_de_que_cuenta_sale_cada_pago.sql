-- ============================================================
-- 117 · DE QUÉ CUENTA SALE (O A CUÁL ENTRA) CADA PAGO
-- ============================================================
--
-- Matías (01/10/2026): «en Registrar un pago tengo dos bancos, elegí
-- Transferencia, y no me salen las opciones para elegir de cuál banco
-- debitar».
--
-- Pagar una deuda no necesitaba migración: registrar_pago_deuda recibe
-- p_cuenta desde la 100 y la pantalla no lo mandaba (eso se arregla en la
-- pantalla). Pero al recorrer todos los lugares donde entra o sale plata
-- aparecieron cuatro funciones que NO dejan decir la cuenta, y tres de ellas
-- ni siquiera la forma de pago: todo iba como efectivo, a la caja.
--
--   pagar_profesional (106) ........ «Pagarle» en Reparto: 'efectivo' fijo
--   registrar_servicio (034) ....... «Cobrar un servicio» en Reparto
--   atender_reserva (037) .......... «Atendido, cobrar» en la Agenda
--   vender_paquete (088) ........... vender un paquete (rubros que no son
--                                    clases y cursos)
--   traer_ingreso_de_trabajo (039) . lo cobrado en el negocio donde trabajás,
--                                    traído a tu cuenta personal: entraba con
--                                    'otro' y casi siempre sin cuenta
--
-- LO QUE CAMBIA
--
--   Cada una es una COPIA EXACTA de su última versión con el cambio mínimo:
--   parámetros nuevos AL FINAL y con default, así las llamadas que ya existen
--   (las pantallas viejas en un celular sin actualizar, las pruebas, la
--   llamada de atender_reserva a registrar_servicio) siguen andando igual.
--   Se borra la firma vieja antes de crear la nueva: con las dos, PostgREST
--   no sabría a cuál llamar.
--
--   · p_cuenta null = como hasta hoy: la deduce la forma de pago
--     (anotar_en_su_cuenta, 074).
--   · Una cuenta de otro negocio, o archivada: 'Esa cuenta no existe.' La
--     plata nunca cae en la cuenta de otro.
--   · Elegir la cuenta es administrar la billetera: en las que pasan por
--     registrar_venta (servicio, agenda, paquete) lo valida ella (096): solo
--     quien administra, y nunca con fiado. pagar_profesional ya era solo del
--     dueño. En la cuenta personal en Gratis, ponerle cuenta a mano es del Pro
--     (110, bloque 13): traer_ingreso_de_trabajo lo frena igual.
--   · El candado del negocio vencido (111) y el de la personal en Gratis
--     (110) siguen donde estaban, en los disparadores de movimientos: estas
--     funciones escriben ahí y los heredan sin tocar nada.
--
-- QUÉ NO CAMBIA
--
--   · registrar_pago_deuda (100): ya recibe p_cuenta.
--   · Las cuentas de fiado (084), la venta (096), la inscripción (095) y la
--     liquidación de campo (100): ya la reciben.
--   · Ningún dato existente se toca: solo funciones.
-- ============================================================


-- ------------------------------------------------------------
-- 1. PAGARLE AL PROFESIONAL (106) con forma de pago y cuenta
-- ------------------------------------------------------------
drop function if exists public.pagar_profesional(uuid, uuid, numeric, date, text);

create or replace function public.pagar_profesional(p_empresa uuid, p_profesional uuid, p_monto numeric, p_fecha date DEFAULT NULL::date, p_notas text DEFAULT ''::text, p_metodo text DEFAULT 'efectivo'::text, p_cuenta uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nombre  text;
  v_fecha   date;
  v_mov     uuid;
  v_id      uuid;
  v_reparto text;
  v_metodo  text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede pagar al equipo.' using errcode = '42501';
  end if;

  select nombre, reparto into v_nombre, v_reparto from public.turnos_profesional
  where id = p_profesional and empresa_id = p_empresa;
  if v_nombre is null then
    raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El pago tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  -- 117: cómo se le pagó. Fiado no: a alguien del equipo se le paga o se le
  -- debe, y lo que se le debe ya lo dice la liquidación.
  v_metodo := lower(coalesce(nullif(trim(p_metodo), ''), 'efectivo'));
  if v_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'otro') then
    raise exception 'Esa forma de pago no es válida.' using errcode = '22023';
  end if;

  -- 117: de qué cuenta salió. Null = la de esa forma de pago (074).
  if p_cuenta is not null
     and not exists (select 1 from public.cuentas_dinero c
                     where c.id = p_cuenta and c.empresa_id = p_empresa and c.activa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  insert into public.movimientos (
    empresa_id, tipo, estado, fecha, descripcion, categoria,
    subtotal, descuento, monto, costo_total, metodo_pago, contraparte, origen, creado_por, cuenta_id
  )
  values (
    p_empresa, 'gasto', 'activo', v_fecha,
    'Pago a ' || v_nombre, 'Sueldos',
    p_monto, 0, p_monto, 0, v_metodo, v_nombre, 'manual', auth.uid(), p_cuenta
  )
  returning id into v_mov;

  -- 106: a comisión, su parte ya es el costo de cada corte (034). El pago
  -- queda marcado para que no vuelva a restar de la ganancia.
  insert into public.turnos_pago (empresa_id, profesional_id, movimiento_id, monto, fecha, notas, creado_por, de_comision)
  values (p_empresa, p_profesional, v_mov, p_monto, v_fecha, left(coalesce(p_notas, ''), 200), auth.uid(),
          v_reparto = 'comision')
  returning id into v_id;

  return jsonb_build_object('pago', v_id, 'movimiento', v_mov);
end $function$;

revoke all on function public.pagar_profesional(uuid, uuid, numeric, date, text, text, uuid) from public, anon;
grant execute on function public.pagar_profesional(uuid, uuid, numeric, date, text, text, uuid) to authenticated;


-- ------------------------------------------------------------
-- 2. COBRAR UN SERVICIO (034) diciendo a qué cuenta entró
--
--    La cuenta viaja a registrar_venta, que ya valida todo (096): que quien
--    la elige administre, que sea de este negocio y esté activa, y que no
--    sea fiado. Con alquiler de silla no hay venta: la cuenta no se usa.
-- ------------------------------------------------------------
drop function if exists public.registrar_servicio(uuid, uuid, uuid, numeric, date, text, text, text, origen_captura);

create or replace function public.registrar_servicio(
  p_empresa     uuid,
  p_profesional uuid,
  p_producto    uuid,
  p_precio      numeric default null,
  p_fecha       date    default null,
  p_metodo_pago text    default 'efectivo',
  p_cliente     text    default '',
  p_notas       text    default '',
  p_origen      origen_captura default 'manual',
  -- 117: a qué cuenta entró. Null = la de su forma de pago, como siempre.
  p_cuenta      uuid    default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_prof     public.turnos_profesional%rowtype;
  v_prod     public.productos%rowtype;
  v_moneda   text;
  v_dec      integer;
  v_monto    numeric(14,2);
  v_prof_par numeric(14,2);
  v_local    numeric(14,2);
  v_mov      uuid;
  v_fecha    date;
  v_id       uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select * into v_prof from public.turnos_profesional
  where id = p_profesional and empresa_id = p_empresa and activo;
  if not found then
    raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
  end if;

  -- Un profesional carga lo suyo; el dueño carga el de cualquiera. Sin esto,
  -- un barbero podría anotarle cortes a un compañero y ensuciarle la
  -- liquidación.
  if not public.es_admin(p_empresa)
     and not (v_prof.user_id is not null and v_prof.user_id = auth.uid()) then
    raise exception 'Solo podés cargar tus propios servicios.' using errcode = '42501';
  end if;

  select * into v_prod from public.productos
  where id = p_producto and empresa_id = p_empresa and activo;
  if not found then
    raise exception 'Ese servicio no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  -- Un servicio no lleva stock. Lo que sí lo lleva —cera, shampoo— es una
  -- venta de mercadería y va por la puerta de siempre: tiene su propio costo
  -- y su propio renglón en el panel.
  if v_prod.controla_stock then
    raise exception 'Eso es un producto con stock: cobralo como una venta normal.' using errcode = '22023';
  end if;

  v_monto := coalesce(nullif(p_precio, 0), public.precio_de_servicio(p_profesional, p_producto));
  if v_monto is null or v_monto <= 0 then
    raise exception 'Falta el precio del servicio.' using errcode = '22023';
  end if;

  select moneda into v_moneda from public.empresas where id = p_empresa;
  v_dec := public.decimales_de(v_moneda);

  -- El redondeo va sobre la parte del PROFESIONAL y el resto queda para el
  -- local. Nunca las dos por separado: ahí las partes dejan de sumar el total
  -- y aparece —o desaparece— plata que nadie cobró.
  v_prof_par := case v_prof.reparto
    when 'comision' then round(v_monto * v_prof.porcentaje / 100, v_dec)
    when 'alquiler' then v_monto
    else 0::numeric
  end;
  v_local := v_monto - v_prof_par;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  -- Con alquiler de silla la plata nunca fue del local: queda el registro del
  -- corte, pero no se crea ninguna venta. Lo que el local factura es la
  -- mensualidad, que se carga como cualquier otro ingreso.
  if v_prof.reparto <> 'alquiler' then
    v_mov := public.registrar_venta(
      p_empresa,
      jsonb_build_array(jsonb_build_object(
        'nombre',          v_prod.nombre,
        'cantidad',        1,
        'precio_unitario', v_monto,
        'costo_unitario',  v_prof_par
      )),
      v_fecha,
      trim(v_prod.nombre || case when coalesce(trim(p_cliente), '') <> ''
                                 then ' · ' || trim(p_cliente) else '' end),
      p_metodo_pago,
      left(coalesce(trim(p_cliente), ''), 80),
      p_notas,
      coalesce(p_origen, 'manual'),
      0,
      null,      -- 117: p_cliente de registrar_venta (no cambia)
      p_cuenta   -- 117: la cuenta, validada por registrar_venta (096)
    );
  end if;

  insert into public.turnos_atribucion (
    empresa_id, profesional_id, movimiento_id, producto_id, servicio,
    fecha, monto_cobrado, parte_profesional, parte_local, reparto, creado_por
  )
  values (
    p_empresa, p_profesional, v_mov, p_producto, v_prod.nombre,
    v_fecha, v_monto, v_prof_par, v_local, v_prof.reparto, auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object(
    'atribucion',        v_id,
    'movimiento',        v_mov,
    'monto',             v_monto,
    'parte_profesional', v_prof_par,
    'parte_local',       v_local,
    'reparto',           v_prof.reparto
  );
end $fn$;

revoke all on function public.registrar_servicio(uuid, uuid, uuid, numeric, date, text, text, text, origen_captura, uuid)
  from public, anon;
grant execute on function public.registrar_servicio(uuid, uuid, uuid, numeric, date, text, text, text, origen_captura, uuid)
  to authenticated;


-- ------------------------------------------------------------
-- 3. ATENDER Y COBRAR UN TURNO (037) con la cuenta
--
--    Va después de registrar_servicio: la llama con la firma nueva.
-- ------------------------------------------------------------
drop function if exists public.atender_reserva(uuid, numeric, text);

create or replace function public.atender_reserva(
  p_reserva uuid,
  p_precio  numeric default null,
  p_metodo  text default 'efectivo',
  -- 117: a qué cuenta entró. Null = la de su forma de pago, como siempre.
  p_cuenta  uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_r      public.turnos_reserva%rowtype;
  v_cobro  jsonb;
begin
  select * into v_r from public.turnos_reserva where id = p_reserva for update;
  if not found then
    raise exception 'Esa reserva no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v_r.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if v_r.estado not in ('pendiente', 'confirmada') then
    raise exception 'Esa reserva ya se cerró.' using errcode = '23505';
  end if;

  -- LA VENTA SE FECHA HOY, NO EL DÍA DEL TURNO.
  --
  -- Parece más prolijo usar la fecha de la reserva, y es un error: un turno
  -- reservado para dentro de dos semanas crearía una venta con fecha futura,
  -- que `registrar_venta` rechaza desde la migración 002 —y hace bien, porque
  -- sería facturación que todavía no ocurrió.
  --
  -- Una venta es plata que SE MOVIÓ, y se mueve cuando el cliente paga. Que
  -- el turno estuviera agendado para otro día ya quedó guardado en la
  -- reserva; no hace falta repetirlo en la contabilidad, ni conviene.
  v_cobro := public.registrar_servicio(
    v_r.empresa_id, v_r.profesional_id, v_r.producto_id,
    p_precio, null, p_metodo, v_r.cliente_nombre, '', 'manual', p_cuenta
  );

  update public.turnos_reserva
  set estado = 'atendida', atribucion_id = (v_cobro->>'atribucion')::uuid
  where id = p_reserva;

  return v_cobro || jsonb_build_object('reserva', p_reserva);
end $fn$;

revoke all on function public.atender_reserva(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.atender_reserva(uuid, numeric, text, uuid) to authenticated;


-- ------------------------------------------------------------
-- 4. VENDER UN PAQUETE (088) diciendo a qué cuenta entró
-- ------------------------------------------------------------
drop function if exists public.vender_paquete(uuid, uuid, text, numeric, numeric, text, date, date);

create or replace function public.vender_paquete(
  p_empresa uuid,
  p_cliente uuid,
  p_nombre  text,
  p_clases  numeric,
  p_precio  numeric,
  p_metodo  text default 'efectivo',
  p_fecha   date default null,
  p_vence   date default null,
  -- 117: a qué cuenta entró. Null = la de su forma de pago, como siempre.
  p_cuenta  uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_alumno text;
  v_mov    uuid;
  v_id     uuid;
  v_fecha  date;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre al paquete: «8 clases de inglés».' using errcode = '22023';
  end if;

  if coalesce(p_clases, 0) <= 0 then
    raise exception 'El paquete tiene que tener al menos una clase.' using errcode = '22023';
  end if;

  if coalesce(p_precio, -1) < 0 then
    raise exception 'El precio no puede ser negativo.' using errcode = '22023';
  end if;

  select nombre into v_alumno from public.clientes
  where id = p_cliente and empresa_id = p_empresa;
  if v_alumno is null then
    raise exception 'Ese alumno no es de esta cuenta.' using errcode = 'P0002';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  if p_vence is not null and p_vence < v_fecha then
    raise exception 'El paquete no puede vencer antes de venderse.' using errcode = '22023';
  end if;

  -- La plata, por el camino de siempre. Sin costo: una clase no tiene
  -- mercadería, así que todo lo cobrado es ganancia bruta.
  if p_precio > 0 then
    v_mov := public.registrar_venta(
      p_empresa     => p_empresa,
      p_items       => jsonb_build_array(jsonb_build_object(
                         'nombre', left(trim(p_nombre), 80),
                         'cantidad', 1,
                         'precio_unitario', p_precio,
                         'costo_unitario', 0)),
      p_fecha       => v_fecha,
      p_descripcion => left(trim(p_nombre), 80),
      p_metodo_pago => coalesce(p_metodo, 'efectivo'),
      p_contraparte => v_alumno,
      p_cliente     => p_cliente,
      -- 117: la cuenta, validada por registrar_venta (096).
      p_cuenta      => p_cuenta
    );
  end if;

  insert into public.paquetes (empresa_id, cliente_id, nombre, clases, precio, movimiento_id, vence_el, creado_por)
  values (p_empresa, p_cliente, trim(p_nombre), p_clases, p_precio, v_mov, p_vence, auth.uid())
  returning id into v_id;

  return jsonb_build_object('paquete', v_id, 'movimiento', v_mov);
end $fn$;

revoke all on function public.vender_paquete(uuid, uuid, text, numeric, numeric, text, date, date, uuid) from public, anon;
grant execute on function public.vender_paquete(uuid, uuid, text, numeric, numeric, text, date, date, uuid) to authenticated;


-- ------------------------------------------------------------
-- 5. TRAER LO COBRADO TRABAJANDO (039) a la cuenta que digas
--
--    Entraba con 'otro' y sin cuenta: casi siempre quedaba como plata
--    suelta. La cuenta tiene que ser de TU cuenta personal, y elegirla a
--    mano es del Pro (110, bloque 13).
-- ------------------------------------------------------------
drop function if exists public.traer_ingreso_de_trabajo(uuid, uuid);

create or replace function public.traer_ingreso_de_trabajo(
  p_negocio  uuid,
  p_personal uuid,
  -- 117: a qué cuenta de tu personal entra. Null = como hasta hoy.
  p_cuenta   uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_prof      public.turnos_profesional%rowtype;
  v_negocio   text;
  v_categoria text;
  v_pago      record;
  v_mov       uuid;
  v_cuantos   integer := 0;
  v_total     numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  -- Tiene que ser TU trabajo: el profesional de esa empresa cuya cuenta de
  -- Orden es la que está llamando. No alcanza con que el negocio exista.
  select * into v_prof from public.turnos_profesional
  where empresa_id = p_negocio and user_id = auth.uid();
  if not found then
    raise exception 'No trabajás en ese negocio.' using errcode = '42501';
  end if;

  select nombre into v_negocio from public.empresas where id = p_negocio;

  -- Y tiene que ser TU cuenta personal. La única forma de ser admin de una
  -- cuenta personal es ser su dueño —nadie más se puede sumar, ver la 019—
  -- así que esta comprobación alcanza para que nadie traiga un ingreso a
  -- una cuenta que no es la suya.
  if not exists (select 1 from public.empresas
                 where id = p_personal and tipo_cuenta = 'personal') then
    raise exception 'Eso no es una cuenta personal.' using errcode = '22023';
  end if;
  if not public.es_admin(p_personal) then
    raise exception 'Esa cuenta no es tuya.' using errcode = '42501';
  end if;

  -- 117: la cuenta de la billetera donde entra. Elegirla a mano es del Pro
  -- (110, bloque 13), y tiene que ser de esta cuenta personal.
  if p_cuenta is not null then
    if public.es_gratis_personal(p_personal) then
      raise exception 'Eso es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.'
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.cuentas_dinero c
                   where c.id = p_cuenta and c.empresa_id = p_personal and c.activa) then
      raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
    end if;
  end if;

  -- Comisión y propina van a «Extra»; un sueldo fijo, a «Sueldo». Las dos ya
  -- existen en categorias_de_ingreso (026) para una cuenta personal.
  v_categoria := case when v_prof.reparto = 'sueldo' then 'Sueldo' else 'Extra' end;

  for v_pago in
    select tp.* from public.turnos_pago tp
    left join public.turnos_pago_traido tt on tt.turnos_pago_id = tp.id
    where tp.profesional_id = v_prof.id and tt.turnos_pago_id is null
    order by tp.fecha
  loop
    insert into public.movimientos (
      empresa_id, tipo, fecha, descripcion, categoria,
      subtotal, descuento, monto, costo_total,
      metodo_pago, contraparte, origen, creado_por, cuenta_id
    )
    values (
      p_personal, 'ingreso', v_pago.fecha,
      'Cobrado en ' || v_negocio, v_categoria,
      v_pago.monto, 0, v_pago.monto, 0,
      'otro', v_negocio, 'manual', auth.uid(), p_cuenta
    )
    returning id into v_mov;

    -- Se registra en la MISMA transacción que el movimiento: si algo de acá
    -- para abajo fallara, PostgreSQL deshace las dos cosas juntas y no
    -- puede quedar un ingreso cargado sin su marca de «ya traído».
    insert into public.turnos_pago_traido (turnos_pago_id, traido_por, empresa_personal, movimiento_id)
    values (v_pago.id, auth.uid(), p_personal, v_mov);

    v_cuantos := v_cuantos + 1;
    v_total := v_total + v_pago.monto;
  end loop;

  if v_cuantos = 0 then
    raise exception 'Ya está todo cargado: no tenés nada pendiente de ese negocio.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('movimientos', v_cuantos, 'total', v_total);
end $fn$;

revoke all on function public.traer_ingreso_de_trabajo(uuid, uuid, uuid) from public, anon;
grant execute on function public.traer_ingreso_de_trabajo(uuid, uuid, uuid) to authenticated;
