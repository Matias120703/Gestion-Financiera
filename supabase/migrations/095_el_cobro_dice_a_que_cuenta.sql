-- ============================================================
-- 095 · EL COBRO DICE A QUÉ CUENTA ENTRÓ
-- ============================================================
--
-- Matías: «al cobrar, si selecciono transferencia, me debería aparecer la
-- opción de a cuál banco se me va a acreditar. Tengo Atlas, Continental,
-- Ueno registrados en la billetera. Si se me transfirió en mi Continental y
-- en Orden se me carga en el Atlas, no tiene sentido: no es sincronización».
--
-- Tiene razón. Desde la 074 cada forma de pago vive en UNA cuenta: todas
-- las transferencias caen en el banco que reclama «transferencia». Con un
-- solo banco da igual; con tres, el alumno que te transfirió al Continental
-- te aparece en el Atlas, y la billetera de Orden deja de coincidir con la
-- de tu celular. Que es justamente lo único que tiene que hacer.
--
-- Así que cobrar una inscripción —al inscribir o después— puede decir en
-- qué cuenta entró. Si no se dice, va como siempre: a la cuenta de esa forma
-- de pago. Es lo mismo que ya hacía el fiado desde la 084.
--
-- Las firmas viejas se borran antes de crear las nuevas: con un parámetro
-- más, `create or replace` crea una segunda función al lado y la llamada de
-- siempre se vuelve ambigua. Las dos son copias exactas de su versión viva
-- (091 y 094) con la cuenta agregada.

-- ------------------------------------------------------------
-- 1. COBRAR UNA INSCRIPCIÓN, EN LA CUENTA QUE SE ELIJA
-- ------------------------------------------------------------
drop function if exists public.cobrar_inscripcion(uuid, text, date);

create or replace function public.cobrar_inscripcion(
  p_paquete uuid,
  p_metodo  text default 'efectivo',
  p_fecha   date default null,
  p_cuenta  uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_p      record;
  v_alumno text;
  v_mov    uuid;
begin
  select * into v_p from public.paquetes where id = p_paquete for update;
  if v_p.id is null then
    raise exception 'Ese paquete no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v_p.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if v_p.movimiento_id is not null then
    raise exception 'Esa inscripción ya está cobrada.' using errcode = '22023';
  end if;

  if coalesce(v_p.precio, 0) <= 0 then
    raise exception 'Esa inscripción no tiene nada que cobrar.' using errcode = '22023';
  end if;

  -- Decir en qué cuenta entró es administrar la billetera: lo mismo que al
  -- cobrar un fiado (084). Se revisa antes de anotar nada.
  if p_cuenta is not null then
    if not public.es_admin(v_p.empresa_id) then
      raise exception 'Solo el dueño de la cuenta puede elegir en qué cuenta entra.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.cuentas_dinero c
                   where c.id = p_cuenta and c.empresa_id = v_p.empresa_id and c.activa) then
      raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
    end if;
  end if;

  -- El fiado no es un pago: sería volver a anotar como deuda lo que ya es
  -- una deuda, y contarlo como cobrado el día que no se cobró.
  if coalesce(p_metodo, '') = 'credito' then
    raise exception 'Para dejarlo pendiente no hace falta cobrar: ya queda por cobrar.' using errcode = '22023';
  end if;

  select nombre into v_alumno from public.clientes where id = v_p.cliente_id;

  v_mov := public.registrar_venta(
    p_empresa     => v_p.empresa_id,
    p_items       => jsonb_build_array(jsonb_build_object(
                       'nombre', left(v_p.nombre, 80),
                       'cantidad', 1,
                       'precio_unitario', v_p.precio,
                       'costo_unitario', 0)),
    p_fecha       => coalesce(p_fecha, public.hoy_empresa(v_p.empresa_id)),
    p_descripcion => left(v_p.nombre, 80),
    p_metodo_pago => coalesce(p_metodo, 'efectivo'),
    p_contraparte => coalesce(v_alumno, ''),
    p_cliente     => v_p.cliente_id
  );

  -- La cuenta elegida gana sobre la forma de pago (075): «me transfirió al
  -- Continental» va al Continental aunque las transferencias caigan, por
  -- defecto, en el Atlas. El disparador de la 074 acepta el cambio porque la
  -- cuenta es de la misma empresa.
  if p_cuenta is not null then
    update public.movimientos set cuenta_id = p_cuenta where id = v_mov;
  end if;

  update public.paquetes set movimiento_id = v_mov where id = p_paquete;

  return jsonb_build_object('movimiento', v_mov, 'monto', v_p.precio);
end $fn$;

revoke all on function public.cobrar_inscripcion(uuid, text, date, uuid) from public, anon;
grant execute on function public.cobrar_inscripcion(uuid, text, date, uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. INSCRIBIR, PAGANDO EN LA CUENTA QUE SE ELIJA
-- ------------------------------------------------------------
drop function if exists public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text, text);

create or replace function public.inscribir_alumno(
  p_empresa     uuid,
  p_cliente     uuid,
  p_dias        smallint[],
  p_hora_desde  time,
  p_hora_hasta  time,
  p_desde       date,
  p_hasta       date,
  p_precio_hora numeric default null,
  p_total       numeric default null,
  p_pagado      boolean default false,
  p_metodo      text default 'efectivo',
  p_nombre      text default null,
  p_materia     text default null,
  p_cuenta      uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_alumno   record;
  v_zona     text;
  v_previa   jsonb;
  v_choque   jsonb;
  v_base     jsonb;
  v_id       uuid;
  v_mov      uuid;
  v_total    numeric;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select id, nombre, coalesce(telefono, '') as telefono into v_alumno
  from public.clientes where id = p_cliente and empresa_id = p_empresa;
  if v_alumno.id is null then
    raise exception 'Ese alumno no es de esta cuenta.' using errcode = 'P0002';
  end if;

  if p_dias is null or cardinality(p_dias) = 0
     or exists (select 1 from unnest(p_dias) d where d not between 0 and 6) then
    raise exception 'Elegí al menos un día de la semana.' using errcode = '22023';
  end if;

  if p_hora_desde is null or p_hora_hasta is null or p_hora_hasta <= p_hora_desde then
    raise exception 'La clase tiene que terminar después de empezar.' using errcode = '22023';
  end if;

  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El período tiene que terminar después de empezar.' using errcode = '22023';
  end if;

  if p_hasta > p_desde + 366 then
    raise exception 'Se puede inscribir hasta un año de una vez.' using errcode = '22023';
  end if;

  if p_total is null and p_precio_hora is null then
    raise exception 'Poné cuánto cobrás: por hora o un precio cerrado.' using errcode = '22023';
  end if;

  if coalesce(p_total, 0) < 0 or coalesce(p_precio_hora, 0) < 0 then
    raise exception 'El precio no puede ser negativo.' using errcode = '22023';
  end if;

  v_previa := public.vista_previa_inscripcion(
    p_empresa, p_dias, p_hora_desde, p_hora_hasta, p_desde, p_hasta, p_precio_hora, p_total);

  if (v_previa->>'clases')::int = 0 then
    raise exception 'En ese período no cae ningún día de los que elegiste.' using errcode = '22023';
  end if;

  v_choque := v_previa->'choques'->0;
  if v_choque is not null then
    raise exception 'El % a las % ya tenés a %.',
      to_char((v_choque->>'fecha')::date, 'DD/MM'), v_choque->>'hora', v_choque->>'alumno'
      using errcode = '23P01';
  end if;

  v_total := (v_previa->>'total')::numeric;
  v_base  := public.profe_y_clase(p_empresa);
  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;

  insert into public.paquetes (
    empresa_id, cliente_id, nombre, clases, precio, vence_el, creado_por,
    dias, hora_desde, hora_hasta, desde, precio_hora, materia)
  values (
    p_empresa, p_cliente,
    left(coalesce(nullif(trim(p_nombre), ''), 'Clases'), 80),
    (v_previa->>'clases')::numeric, v_total, p_hasta, auth.uid(),
    (select array_agg(distinct d order by d) from unnest(p_dias) d),
    p_hora_desde, p_hora_hasta, p_desde,
    case when p_total is null then p_precio_hora end,
    nullif(left(trim(coalesce(p_materia, '')), 60), ''))
  returning id into v_id;

  insert into public.turnos_reserva (
    empresa_id, profesional_id, producto_id, inicia, termina,
    cliente_nombre, cliente_telefono, cliente_id, paquete_id, estado, origen, creada_por)
  select
    p_empresa, (v_base->>'profesional')::uuid, (v_base->>'producto')::uuid,
    (f.d + p_hora_desde) at time zone v_zona,
    (f.d + p_hora_hasta) at time zone v_zona,
    v_alumno.nombre, v_alumno.telefono, p_cliente, v_id, 'confirmada', 'local', auth.uid()
  from public.fechas_de_horario(p_dias, p_desde, p_hasta) f(d);

  if coalesce(p_pagado, false) and v_total > 0 then
    v_mov := (public.cobrar_inscripcion(v_id, p_metodo, null, p_cuenta)->>'movimiento')::uuid;
  end if;

  return jsonb_build_object(
    'paquete', v_id, 'clases', (v_previa->>'clases')::int, 'total', v_total, 'movimiento', v_mov);
end $fn$;

revoke all on function public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text, text, uuid) from public, anon;
grant execute on function public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text, text, uuid) to authenticated;
