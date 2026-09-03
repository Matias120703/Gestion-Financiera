-- ORDEN · Migración 041 · Mover y cancelar un turno desde el local
--
-- La 037 dejó una sola forma de que un turno deje de ocupar su lugar: que el
-- CLIENTE lo cancele desde el enlace que guardó. Adentro del local no había
-- ninguna.
--
-- En la práctica eso significaba que cuando alguien llamaba para avisar que
-- no venía, o para pasar el turno al jueves, el que atiende no podía hacer
-- nada. Lo único a mano era «no vino» —que es una acusación, no una
-- cancelación: le queda pegada al cliente que sí avisó— y el hueco quedaba
-- ocupado por un turno que nadie iba a usar.
--
-- Una agenda que no se puede corregir se llena de mentiras en dos semanas, y
-- una agenda con mentiras es peor que no tener agenda: parece que funciona.

-- ============================================================
-- 1. CANCELAR DESDE ADENTRO
--
--    Lo mismo que hace el cliente con su enlace, pero con sesión y
--    perteneciendo al local. El hueco se libera solo: `huecos_del_dia` mira
--    únicamente las reservas pendientes y confirmadas.
--
--    Un turno YA ATENDIDO no se cancela acá. Eso ya es una venta cobrada, y
--    deshacer una venta es trabajo de `anular_movimiento`, que devuelve la
--    plata y el stock. Si esto lo dejara pasar, quedaría un movimiento
--    cobrado colgado de un turno cancelado.
-- ============================================================
create or replace function public.cancelar_turno(p_reserva uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_emp uuid; v_estado text;
begin
  select empresa_id, estado into v_emp, v_estado
  from public.turnos_reserva where id = p_reserva;

  if v_emp is null then
    raise exception 'Ese turno no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_emp) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if v_estado = 'cancelada' then
    return jsonb_build_object('cancelado', true, 'ya_estaba', true);
  end if;
  if v_estado not in ('pendiente', 'confirmada') then
    raise exception 'Ese turno ya se cerró: no se puede cancelar.' using errcode = '22023';
  end if;

  update public.turnos_reserva set estado = 'cancelada' where id = p_reserva;
  return jsonb_build_object('cancelado', true);
end $fn$;

revoke all on function public.cancelar_turno(uuid) from public, anon;
grant execute on function public.cancelar_turno(uuid) to authenticated;

-- ============================================================
-- 2. MOVERLO
--
--    Cambia el horario y, si hace falta, con quién: «Pedro se enfermó, hoy
--    te atiende Juan» es la mitad de los cambios de una peluquería.
--
--    EL SERVICIO NO CAMBIA. De la duración del servicio sale la grilla de
--    horarios, así que dejar cambiarlo acá sería mover y reservar otra cosa
--    al mismo tiempo. Para eso se cancela y se anota de nuevo.
--
--    EL ENLACE DEL CLIENTE SIGUE VIVO. El token no se toca: el que reservó
--    por el link puede seguir cancelando desde el mensaje que ya tiene,
--    aunque el local le haya movido la hora.
--
--    El horario nuevo se valida contra los huecos de verdad —los mismos que
--    ve el link público—, así que mover no puede meter un turno donde no
--    entra. Y `for update` sobre el profesional nuevo serializa esto con las
--    reservas: mover y reservar no pueden quedarse con el mismo hueco.
-- ============================================================
create or replace function public.mover_turno(
  p_reserva     uuid,
  p_profesional uuid,
  p_inicia      timestamptz
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_r     public.turnos_reserva%rowtype;
  v_zona  text;
  v_fecha date;
  v_fin   timestamptz;
begin
  select * into v_r from public.turnos_reserva where id = p_reserva;

  if v_r.id is null then
    raise exception 'Ese turno no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_r.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if v_r.estado not in ('pendiente', 'confirmada') then
    raise exception 'Ese turno ya se cerró: no se puede mover.' using errcode = '22023';
  end if;
  if p_inicia is null then
    raise exception 'Falta el horario nuevo.' using errcode = '22023';
  end if;

  -- El candado, igual que en `reservar`. Todo lo que sigue queda serializado
  -- por profesional.
  perform 1 from public.turnos_profesional
  where id = p_profesional and empresa_id = v_r.empresa_id and activo
  for update;

  if not found then
    raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas where id = v_r.empresa_id;

  v_fecha := (p_inicia at time zone v_zona)::date;

  -- Que el hueco exista y esté libre. Como la grilla arranca de la ventana
  -- de atención y avanza de a una duración, un turno solo se pisa a sí mismo
  -- en su propio horario: pedir el mismo que ya tiene cae acá y se rechaza,
  -- que es exactamente lo que corresponde contestar.
  select h.termina into v_fin
  from public.huecos_del_dia(p_profesional, v_fecha, v_r.producto_id) h
  where h.inicia = p_inicia;

  if v_fin is null then
    raise exception 'Ese horario ya no está disponible.' using errcode = '23505';
  end if;

  update public.turnos_reserva
  set profesional_id = p_profesional,
      inicia         = p_inicia,
      termina        = v_fin
  where id = p_reserva;

  return jsonb_build_object('movido', true, 'inicia', p_inicia, 'termina', v_fin);
end $fn$;

revoke all on function public.mover_turno(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.mover_turno(uuid, uuid, timestamptz) to authenticated;

-- ============================================================
-- 3. LA AGENDA DEL DÍA DICE QUÉ SERVICIO ES, NO SOLO CÓMO SE LLAMA
--
--    Para ofrecer horarios al mover hay que saber cuánto dura el servicio
--    reservado, y de eso sale la grilla. Hasta acá la agenda devolvía el
--    nombre del servicio pero no su id, así que la pantalla no tenía con qué
--    preguntar por los huecos. Es el único cambio: una clave más.
-- ============================================================
create or replace function public.agenda_del_dia(
  p_empresa uuid,
  p_fecha   date default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona  text;
  v_fecha date;
  v_res   jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas where id = p_empresa;
  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          r.id,
    'inicia',      r.inicia,
    'termina',     r.termina,
    'profesional', p.nombre,
    'profesional_id', r.profesional_id,
    'servicio',    pr.nombre,
    'producto_id', r.producto_id,
    'cliente',     r.cliente_nombre,
    'telefono',    r.cliente_telefono,
    'estado',      r.estado,
    'origen',      r.origen
  ) order by r.inicia), '[]'::jsonb)
  into v_res
  from public.turnos_reserva r
  join public.turnos_profesional p on p.id = r.profesional_id
  join public.productos pr on pr.id = r.producto_id
  where r.empresa_id = p_empresa
    and (r.inicia at time zone v_zona)::date = v_fecha
    -- Una cancelada no ocupa lugar en la agenda del día.
    and r.estado <> 'cancelada';

  return v_res;
end $fn$;

revoke all on function public.agenda_del_dia(uuid, date) from public, anon;
grant execute on function public.agenda_del_dia(uuid, date) to authenticated;
