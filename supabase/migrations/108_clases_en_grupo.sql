-- ============================================================
-- 108 · LA CLASE EN GRUPO
-- ============================================================
--
-- Matías (24/09): «una clase de tenis tiene varios alumnos en el mismo
-- horario. Yo quiero agregar a un alumno en el mismo horario de otra persona
-- y no me permite».
--
-- QUÉ PASABA
--
-- `inscribir_alumno` (091, 094, 095) rechaza cualquier inscripción que se
-- pise con una clase pendiente o confirmada de la cuenta: «El 05/10 a las
-- 18:00 ya tenés a Ana». Para un profe particular está bien —da una clase a
-- la vez, y el aviso le evita anotar dos alumnos a la misma hora sin
-- querer—. Para una clase de tenis, de natación, de baile o un grupo de
-- entrenamiento es justo al revés: van varios a la misma hora.
--
-- QUÉ SE HACE
--
-- El choque sigue avisándose igual (la vista previa no cambia), pero deja de
-- ser un muro: `inscribir_alumno` suma `p_en_grupo`. Con `true`, el profe
-- ya vio con quién coincide y dijo «van juntos»; cada alumno queda con su
-- propia clase en la agenda a la misma hora, con su inscripción, su cobro y
-- su asistencia, como hasta ahora. Sin él (o con `false`), todo sigue
-- como antes: un horario ocupado frena la inscripción entera.
--
-- No hay cupo: el profe sabe cuántos entran en su cancha. Si algún día lo
-- pide, va en otra migración.
--
-- El resto de la función es copia exacta de la 095. Se borra la versión de
-- 14 parámetros para que PostgREST no quede con dos candidatas; las
-- llamadas de 12, 13 y 14 parámetros siguen andando por los defaults.

drop function if exists public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text, text, uuid);

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
  p_cuenta      uuid default null,
  -- La clase en grupo (108): el profe ya vio con quién coincide y dijo que
  -- van juntos. Sin esto, un horario ocupado sigue frenando todo.
  p_en_grupo    boolean default false
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
  if v_choque is not null and not coalesce(p_en_grupo, false) then
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

revoke all on function public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text, text, uuid, boolean) to authenticated;
