-- ============================================================
-- 091 · INSCRIBIR A UN ALUMNO
-- ============================================================
--
-- Cómo trabaja un profe online, en palabras de Matías:
--
--   «El alumno se conecta con el profesor por WhatsApp. El profesor entra a
--   su sistema para ver si tiene libre tal día, tal hora. Cuando llegan a un
--   acuerdo —cuántos días, cuántas semanas, cuántos meses— el profesor anota:
--   Matías va a tener clases lunes, martes y jueves de 6 a 7 de la tarde. Yo
--   cobro 50.000 la hora. Y automáticamente se calcula cuánto sería en el
--   plazo que marqué. El alumno paga y el profesor registra ese pago.»
--
-- Eso es esta migración. Una inscripción es:
--
--   · un horario  — qué días de la semana, de qué hora a qué hora;
--   · un período  — desde cuándo hasta cuándo;
--   · un precio   — por hora (y Orden multiplica) o cerrado;
--   · y las clases que salen de cruzar lo anterior, puestas en la agenda.
--
-- POR DENTRO ES UN PAQUETE (088) CON HORARIO
--
-- Lo que la 088 llamaba paquete —N clases, un precio, un vencimiento, un
-- contador— es exactamente lo que resulta de inscribir a alguien: trece
-- clases, Gs. 650.000, vence el 31. Así que no se crea otra tabla: el
-- paquete gana el horario, y las clases de la agenda saben de qué paquete
-- salieron. Nada de lo que ya estaba probado se tira.
--
-- SE GANA AL COBRAR, TAMBIÉN ACÁ
--
-- Matías lo eligió: la plata cuenta el día que entra. Por eso una
-- inscripción que todavía no se pagó NO es una venta fiada. Una venta fiada
-- cuenta como cobrada el día de la venta (056), y eso sería decirle al profe
-- que ganó en octubre plata que recién le pagan en noviembre. Una
-- inscripción sin pagar queda «por cobrar», sin movimiento de plata, y la
-- venta nace el día que el alumno paga.

-- ------------------------------------------------------------
-- 1. EL PAQUETE GANA UN HORARIO
--
--    `dias` con la numeración de PostgreSQL (`extract(dow)`): 0 es domingo,
--    1 lunes… 6 sábado. Todo o nada: un horario a medias no genera clases.
-- ------------------------------------------------------------
alter table public.paquetes
  add column if not exists dias        smallint[],
  add column if not exists hora_desde  time,
  add column if not exists hora_hasta  time,
  add column if not exists desde       date,
  add column if not exists precio_hora numeric;

alter table public.paquetes drop constraint if exists paquete_horario_completo;
alter table public.paquetes add constraint paquete_horario_completo check (
  (dias is null and hora_desde is null and hora_hasta is null and desde is null)
  or (dias is not null and cardinality(dias) > 0
      and hora_desde is not null and hora_hasta is not null and hora_hasta > hora_desde
      and desde is not null)
);

alter table public.paquetes drop constraint if exists paquete_precio_hora;
alter table public.paquetes add constraint paquete_precio_hora
  check (precio_hora is null or precio_hora >= 0);

-- ------------------------------------------------------------
-- 2. CADA CLASE DE LA AGENDA SABE DE QUÉ INSCRIPCIÓN SALIÓ
--
--    El alumno ya lo sabía: `cliente_id` existe desde la 052. Lo nuevo es
--    el paquete, que es lo que va a permitir descontar la clase al marcarla
--    como dada, y cancelar las que faltan si el alumno deja.
-- ------------------------------------------------------------
alter table public.turnos_reserva
  add column if not exists paquete_id uuid references public.paquetes (id) on delete cascade;

create index if not exists turnos_reserva_paquete_idx
  on public.turnos_reserva (paquete_id) where paquete_id is not null;

-- ------------------------------------------------------------
-- 3. LAS FECHAS QUE SALEN DE UN HORARIO
--
--    Tope de un año: un error de tipeo en el año («2062») generaría miles
--    de clases, y nadie inscribe a un alumno por más de un año de una vez.
-- ------------------------------------------------------------
create or replace function public.fechas_de_horario(p_dias smallint[], p_desde date, p_hasta date)
returns setof date language sql immutable set search_path = public as $fn$
  select d::date
  from generate_series(p_desde, least(p_hasta, p_desde + 366), interval '1 day') d
  where extract(dow from d)::smallint = any (p_dias)
  order by 1;
$fn$;

revoke all on function public.fechas_de_horario(smallint[], date, date) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. LO QUE VA A PASAR, ANTES DE QUE PASE
--
--    La pantalla lo llama mientras el profe completa el formulario: cuántas
--    clases, cuántas horas, cuánto da, y con quién choca. Es lo que le
--    reemplaza el cuaderno: «el jueves 15 a las 18 ya tenés a Ana».
--
--    Choca con cualquier clase pendiente o confirmada de la cuenta, sea de
--    quien sea: un profe da una clase a la vez.
-- ------------------------------------------------------------
create or replace function public.vista_previa_inscripcion(
  p_empresa     uuid,
  p_dias        smallint[],
  p_hora_desde  time,
  p_hora_hasta  time,
  p_desde       date,
  p_hasta       date,
  p_precio_hora numeric default null,
  p_total       numeric default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona   text;
  v_clases integer;
  v_horas  numeric;
  v_total  numeric;
  v_choques jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  -- Un formulario a medio completar no es un error: devuelve ceros.
  if p_dias is null or cardinality(p_dias) = 0 or p_hora_desde is null or p_hora_hasta is null
     or p_hora_hasta <= p_hora_desde or p_desde is null or p_hasta is null or p_hasta < p_desde then
    return jsonb_build_object('clases', 0, 'horas', 0, 'total', 0, 'choques', '[]'::jsonb);
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;

  select count(*)::int into v_clases from public.fechas_de_horario(p_dias, p_desde, p_hasta);
  v_horas := round(v_clases * extract(epoch from (p_hora_hasta - p_hora_desde)) / 3600.0, 2);
  v_total := coalesce(p_total, round(v_horas * coalesce(p_precio_hora, 0)));

  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha', f.d,
           'hora', to_char(r.inicia at time zone v_zona, 'HH24:MI'),
           'alumno', r.cliente_nombre
         ) order by f.d, r.inicia), '[]'::jsonb)
  into v_choques
  from public.fechas_de_horario(p_dias, p_desde, p_hasta) f(d)
  join public.turnos_reserva r
    on r.empresa_id = p_empresa
   and r.estado in ('pendiente', 'confirmada')
   and r.inicia < ((f.d + p_hora_hasta) at time zone v_zona)
   and ((f.d + p_hora_desde) at time zone v_zona) < r.termina;

  return jsonb_build_object('clases', v_clases, 'horas', v_horas, 'total', v_total, 'choques', v_choques);
end $fn$;

revoke all on function public.vista_previa_inscripcion(uuid, smallint[], time, time, date, date, numeric, numeric) from public, anon;
grant execute on function public.vista_previa_inscripcion(uuid, smallint[], time, time, date, date, numeric, numeric) to authenticated;

-- ------------------------------------------------------------
-- 5. EL QUE DA LAS CLASES Y LO QUE SE DA
--
--    La agenda exige un profesional y un servicio por turno: se hizo para
--    una barbería. Un profe no tiene por qué saberlo. Si no existen, se
--    crean acá: él, sin comisión (`local`: todo queda para el negocio), y un
--    servicio «Clase» que nunca ve, porque no tiene catálogo.
-- ------------------------------------------------------------
create or replace function public.profe_y_clase(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_prof     uuid;
  v_producto uuid;
  v_nombre   text;
begin
  select id into v_prof from public.turnos_profesional
  where empresa_id = p_empresa and activo
  order by (user_id = auth.uid()) desc nulls last, created_at
  limit 1;

  if v_prof is null then
    select nombre into v_nombre from public.miembros
    where empresa_id = p_empresa and user_id = auth.uid();
    insert into public.turnos_profesional (empresa_id, nombre, user_id, reparto)
    values (p_empresa, left(coalesce(nullif(trim(v_nombre), ''), 'Yo'), 60), auth.uid(), 'local')
    returning id into v_prof;
  end if;

  select id into v_producto from public.productos
  where empresa_id = p_empresa and nombre = 'Clase' and activo and not controla_stock
  order by created_at limit 1;

  if v_producto is null then
    insert into public.productos (empresa_id, nombre, precio, costo, controla_stock)
    values (p_empresa, 'Clase', 0, 0, false)
    returning id into v_producto;
  end if;

  return jsonb_build_object('profesional', v_prof, 'producto', v_producto);
end $fn$;

revoke all on function public.profe_y_clase(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6. COBRAR UNA INSCRIPCIÓN
--
--    Es la venta de siempre, el día que el alumno paga. Va antes de
--    `inscribir_alumno` porque la usa cuando el pago es en el momento.
-- ------------------------------------------------------------
create or replace function public.cobrar_inscripcion(
  p_paquete uuid,
  p_metodo  text default 'efectivo',
  p_fecha   date default null
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

  update public.paquetes set movimiento_id = v_mov where id = p_paquete;

  return jsonb_build_object('movimiento', v_mov, 'monto', v_p.precio);
end $fn$;

revoke all on function public.cobrar_inscripcion(uuid, text, date) from public, anon;
grant execute on function public.cobrar_inscripcion(uuid, text, date) to authenticated;

-- ------------------------------------------------------------
-- 7. INSCRIBIR
--
--    Todo o nada: el paquete, sus clases en la agenda y —si ya pagó— la
--    venta. Si una sola clase choca, no se inscribe nada: una inscripción a
--    la que le faltan dos martes es peor que ninguna, porque el profe cree
--    que las tiene.
-- ------------------------------------------------------------
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
  p_nombre      text default null
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
    dias, hora_desde, hora_hasta, desde, precio_hora)
  values (
    p_empresa, p_cliente,
    left(coalesce(nullif(trim(p_nombre), ''), 'Clases'), 80),
    (v_previa->>'clases')::numeric, v_total, p_hasta, auth.uid(),
    (select array_agg(distinct d order by d) from unnest(p_dias) d),
    p_hora_desde, p_hora_hasta, p_desde,
    case when p_total is null then p_precio_hora end)
  returning id into v_id;

  -- Las clases, en la agenda. Confirmadas: ya se acordaron por WhatsApp.
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
    v_mov := (public.cobrar_inscripcion(v_id, p_metodo, null)->>'movimiento')::uuid;
  end if;

  return jsonb_build_object(
    'paquete', v_id, 'clases', (v_previa->>'clases')::int, 'total', v_total, 'movimiento', v_mov);
end $fn$;

revoke all on function public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text) from public, anon;
grant execute on function public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text) to authenticated;

-- ------------------------------------------------------------
-- 8. LO QUE FALTA COBRAR
--
--    Inscripciones con precio, sin cobrar y sin cerrar. Es lo que el profe
--    ve arriba de sus alumnos: a quién le tiene que pedir la plata.
-- ------------------------------------------------------------
create or replace function public.por_cobrar_alumnos(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'paquete', p.id, 'cliente_id', p.cliente_id, 'alumno', c.nombre,
           'nombre', p.nombre, 'monto', p.precio, 'desde', p.desde, 'hasta', p.vence_el)
         order by p.desde nulls last, c.nombre), '[]'::jsonb)
  into v_lista
  from public.paquetes p
  join public.clientes c on c.id = p.cliente_id
  where p.empresa_id = p_empresa and p.movimiento_id is null and p.precio > 0 and not p.cerrado;

  return jsonb_build_object(
    'total', coalesce((select sum((x->>'monto')::numeric) from jsonb_array_elements(v_lista) x), 0),
    'lista', v_lista);
end $fn$;

revoke all on function public.por_cobrar_alumnos(uuid) from public, anon;
grant execute on function public.por_cobrar_alumnos(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9. CERRAR UNA INSCRIPCIÓN SACA SUS CLASES DE LA AGENDA
--
--    El alumno dejó: las clases que faltaban no se van a dar, y si quedan
--    en la agenda ocupan un horario que el profe podría darle a otro.
--    Reabrirla las vuelve a poner, pero solo si ese horario sigue libre: el
--    profe pudo habérselo dado a alguien mientras tanto.
-- ------------------------------------------------------------
create or replace function public.cerrar_paquete(p_paquete uuid, p_cerrado boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.paquetes where id = p_paquete;
  if v_empresa is null then
    raise exception 'Ese paquete no existe.' using errcode = 'P0002';
  end if;

  if not public.es_admin(v_empresa) then
    raise exception 'Solo el dueño de la cuenta puede cerrar un paquete.' using errcode = '42501';
  end if;

  update public.paquetes set cerrado = coalesce(p_cerrado, true) where id = p_paquete;

  if coalesce(p_cerrado, true) then
    update public.turnos_reserva
    set estado = 'cancelada'
    where paquete_id = p_paquete and estado in ('pendiente', 'confirmada') and inicia > now();
  else
    update public.turnos_reserva r
    set estado = 'confirmada'
    where r.paquete_id = p_paquete and r.estado = 'cancelada' and r.inicia > now()
      and not exists (
        select 1 from public.turnos_reserva o
        where o.empresa_id = r.empresa_id and o.id <> r.id
          and o.estado in ('pendiente', 'confirmada')
          and o.inicia < r.termina and r.inicia < o.termina);
  end if;

  return public.estado_paquete(p_paquete);
end $fn$;

revoke all on function public.cerrar_paquete(uuid, boolean) from public, anon;
grant execute on function public.cerrar_paquete(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 10. LA FICHA DEL ALUMNO VE EL HORARIO Y SI ESTÁ PAGADO
-- ------------------------------------------------------------
create or replace function public.paquetes_del_alumno(p_empresa uuid, p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x.fila order by x.orden, x.creado desc), '[]'::jsonb)
  into v_lista
  from (
    select
      p.created_at as creado,
      case when (public.estado_paquete(p.id)->>'estado') = 'activo' then 0 else 1 end as orden,
      jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre,
        'clases', p.clases,
        'precio', p.precio,
        'vence_el', p.vence_el,
        'creado', p.created_at,
        'dias', to_jsonb(p.dias),
        'hora_desde', to_char(p.hora_desde, 'HH24:MI'),
        'hora_hasta', to_char(p.hora_hasta, 'HH24:MI'),
        'desde', p.desde,
        'precio_hora', p.precio_hora,
        -- Pagado si tiene su venta, o si no había nada que cobrar.
        'pagado', p.movimiento_id is not null or coalesce(p.precio, 0) = 0
      ) || public.estado_paquete(p.id)
        || jsonb_build_object('historia', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', c.id, 'fecha', c.fecha, 'cantidad', c.cantidad, 'motivo', c.motivo)
                    order by c.fecha desc, c.created_at desc)
             from public.clases_dadas c where c.paquete_id = p.id
           ), '[]'::jsonb)) as fila
    from public.paquetes p
    where p.empresa_id = p_empresa and p.cliente_id = p_cliente
  ) x;

  return v_lista;
end $fn$;

revoke all on function public.paquetes_del_alumno(uuid, uuid) from public, anon;
grant execute on function public.paquetes_del_alumno(uuid, uuid) to authenticated;
