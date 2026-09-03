-- ORDEN · Migración 034 · El reparto · las puertas para escribir
--
-- Todo lo que escribe pasa por acá. Las tablas de la 033 solo tienen policy
-- de lectura: nadie inserta ni actualiza desde el cliente, igual que con las
-- ventas y los ahorros.

-- ============================================================
-- 1. EL EQUIPO
--
--    Solo el propietario o un administrador toca esto, y el motivo no es
--    jerárquico: el PORCENTAJE del reparto se define acá. Si un barbero
--    pudiera editarlo, se pone el 100% y el local se entera cuando cuadra la
--    semana.
-- ============================================================
create or replace function public.guardar_profesional(
  p_empresa    uuid,
  p_nombre     text,
  p_reparto    text    default 'local',
  p_porcentaje numeric default null,
  p_user       uuid    default null,
  p_id         uuid    default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar el equipo.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre, para saber de quién es cada corte.' using errcode = '22023';
  end if;

  if coalesce(p_reparto, '') not in ('local', 'comision', 'alquiler', 'sueldo') then
    raise exception 'Ese tipo de arreglo no existe.' using errcode = '22023';
  end if;

  if p_reparto = 'comision'
     and (p_porcentaje is null or p_porcentaje <= 0 or p_porcentaje > 100) then
    raise exception 'Con comisión hace falta un porcentaje entre 1 y 100.' using errcode = '22023';
  end if;

  -- Si tiene cuenta, tiene que ser de este negocio: si no, se le estaría
  -- dando acceso a los cortes de una empresa a la que no pertenece.
  if p_user is not null
     and not exists (select 1 from public.miembros m
                     where m.empresa_id = p_empresa and m.user_id = p_user) then
    raise exception 'Esa persona no es parte de este negocio.' using errcode = '42501';
  end if;

  -- El porcentaje solo se guarda donde significa algo. Dejarlo escrito en un
  -- profesional a sueldo haría dudar el día que alguien lea la tabla.
  if p_id is null then
    insert into public.turnos_profesional (empresa_id, nombre, user_id, reparto, porcentaje)
    values (p_empresa, trim(p_nombre), p_user, p_reparto,
            case when p_reparto = 'comision' then p_porcentaje else null end)
    returning id into v_id;
  else
    update public.turnos_profesional
    set nombre = trim(p_nombre),
        user_id = p_user,
        reparto = p_reparto,
        porcentaje = case when p_reparto = 'comision' then p_porcentaje else null end,
        updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_profesional(uuid, text, text, numeric, uuid, uuid) from public, anon;
grant execute on function public.guardar_profesional(uuid, text, text, numeric, uuid, uuid) to authenticated;

-- Con cortes cargados no se borra: se desactiva. Borrarlo haría desaparecer
-- de quién fue cada corte, y la liquidación del mes pasado dejaría de cerrar.
create or replace function public.borrar_profesional(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_cortes integer;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar el equipo.' using errcode = '42501';
  end if;

  select count(*)::int into v_cortes
  from public.turnos_atribucion where profesional_id = p_id and empresa_id = p_empresa;

  if v_cortes > 0 then
    update public.turnos_profesional set activo = false, updated_at = now()
    where id = p_id and empresa_id = p_empresa;
    if not found then
      raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
    end if;
    return jsonb_build_object('desactivado', true, 'cortes', v_cortes);
  end if;

  delete from public.turnos_profesional where id = p_id and empresa_id = p_empresa;
  if not found then
    raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_profesional(uuid, uuid) from public, anon;
grant execute on function public.borrar_profesional(uuid, uuid) to authenticated;

-- ============================================================
-- 2. EL PRECIO DE CADA UNO
--
--    Acá la regla se invierte: el precio de sus cortes lo maneja el propio
--    profesional. Es lo que cobra él, y obligarlo a pedirle al dueño que se
--    lo cambie es la forma más rápida de que vuelva a anotar en un cuaderno.
--    El dueño también puede, porque muchos barberos no van a tener cuenta.
-- ============================================================
create or replace function public.guardar_precio_profesional(
  p_empresa     uuid,
  p_profesional uuid,
  p_producto    uuid,
  p_precio      numeric
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_suyo boolean;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select (user_id is not null and user_id = auth.uid()) into v_suyo
  from public.turnos_profesional
  where id = p_profesional and empresa_id = p_empresa;

  if v_suyo is null then
    raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
  end if;

  if not public.es_admin(p_empresa) and not v_suyo then
    raise exception 'Solo podés cambiar el precio de tus propios servicios.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.productos
                 where id = p_producto and empresa_id = p_empresa) then
    raise exception 'Ese servicio no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  -- Poner el precio en cero es volver al del local: sin fila, manda el
  -- catálogo. Sin esto haría falta un segundo botón para algo que la persona
  -- piensa como «cobro lo mismo que la casa».
  if coalesce(p_precio, 0) <= 0 then
    delete from public.turnos_precio
    where profesional_id = p_profesional and producto_id = p_producto;
    return jsonb_build_object('quitado', true);
  end if;

  insert into public.turnos_precio (empresa_id, profesional_id, producto_id, precio)
  values (p_empresa, p_profesional, p_producto, p_precio)
  on conflict (profesional_id, producto_id) do update
    set precio = excluded.precio, updated_at = now();

  return jsonb_build_object('guardado', true);
end $fn$;

revoke all on function public.guardar_precio_profesional(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.guardar_precio_profesional(uuid, uuid, uuid, numeric) to authenticated;

-- Qué cobra este profesional por este servicio. Sin fila propia, el catálogo.
create or replace function public.precio_de_servicio(p_profesional uuid, p_producto uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select coalesce(
    (select p.precio from public.turnos_precio p
      where p.profesional_id = p_profesional and p.producto_id = p_producto),
    (select pr.precio from public.productos pr where pr.id = p_producto),
    0);
$fn$;

revoke all on function public.precio_de_servicio(uuid, uuid) from public, anon;
grant execute on function public.precio_de_servicio(uuid, uuid) to authenticated;

-- ============================================================
-- 3. COBRAR UN SERVICIO
--
--    La puerta principal del módulo. Calcula el reparto, crea la venta y deja
--    la atribución, todo en una transacción: o queda todo o no queda nada.
--
--    La venta se registra con el servicio como línea suelta y no como
--    producto del catálogo. Es a propósito: `registrar_venta` descarta el
--    costo que le manden para un producto de catálogo —y hace bien, es lo que
--    impide que un cliente invente su margen— así que la única forma honesta
--    de que el costo sea la parte del barbero es no pasar por ahí. Qué
--    servicio fue queda guardado en la atribución, que es de donde sale el
--    ranking de servicios del módulo.
-- ============================================================
create or replace function public.registrar_servicio(
  p_empresa     uuid,
  p_profesional uuid,
  p_producto    uuid,
  p_precio      numeric default null,
  p_fecha       date    default null,
  p_metodo_pago text    default 'efectivo',
  p_cliente     text    default '',
  p_notas       text    default '',
  p_origen      origen_captura default 'manual'
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
      0
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

revoke all on function public.registrar_servicio(uuid, uuid, uuid, numeric, date, text, text, text, origen_captura)
  from public, anon;
grant execute on function public.registrar_servicio(uuid, uuid, uuid, numeric, date, text, text, text, origen_captura)
  to authenticated;
