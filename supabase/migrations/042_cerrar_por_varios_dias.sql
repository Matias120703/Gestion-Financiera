-- ORDEN · Migración 042 · Cerrar y reabrir varios días de una
--
-- `turnos_excepcion` guarda UN DÍA por fila, y está bien: así la excepción de
-- una persona puede ganarle al feriado del local en un día puntual sin que
-- haya que partir rangos. Pero nadie se toma vacaciones de un día.
--
-- Sin esto, «me voy del 10 al 24» eran catorce llamadas desde el navegador,
-- cada una con su ida y vuelta y sin transacción que las junte: si la séptima
-- fallaba, quedaban seis días cerrados y ocho abiertos, y el link público
-- seguía ofreciendo turnos en la mitad de las vacaciones.
--
-- LAS REGLAS NO SE REESCRIBEN ACÁ
--
-- Las dos funciones de abajo no deciden nada: llaman en un bucle a
-- `guardar_excepcion` y `borrar_excepcion`, que ya saben que un feriado del
-- local lo pone el dueño y el día libre de alguien lo pone esa persona. Si
-- mañana esa regla cambia, cambia en un solo lugar. Lo único que agregan es
-- que el rango entero entra o no entra: una sola transacción.

create or replace function public.cerrar_dias(
  p_empresa     uuid,
  p_desde       date,
  p_hasta       date,
  p_profesional uuid default null,
  p_motivo      text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_dia     date;
  v_cuantos integer := 0;
begin
  if p_desde is null or p_hasta is null then
    raise exception 'Faltan las fechas.' using errcode = '22023';
  end if;
  if p_hasta < p_desde then
    raise exception 'El último día no puede ser anterior al primero.' using errcode = '22023';
  end if;
  -- Un año es más que cualquier cierre real y evita que un error de tipeo en
  -- el año escriba miles de filas.
  if p_hasta - p_desde > 366 then
    raise exception 'No se puede cerrar más de un año seguido.' using errcode = '22023';
  end if;

  v_dia := p_desde;
  while v_dia <= p_hasta loop
    -- Cada vuelta comprueba los permisos por su cuenta. Es a propósito: la
    -- regla de quién puede cerrar qué vive en `guardar_excepcion` y no se
    -- duplica acá.
    perform public.guardar_excepcion(p_empresa, v_dia, true, p_profesional, null, null, p_motivo);
    v_cuantos := v_cuantos + 1;
    v_dia := v_dia + 1;
  end loop;

  return jsonb_build_object('dias', v_cuantos);
end $fn$;

revoke all on function public.cerrar_dias(uuid, date, date, uuid, text) from public, anon;
grant execute on function public.cerrar_dias(uuid, date, date, uuid, text) to authenticated;

-- Volver a abrir lo que se había cerrado. Borra solo las excepciones de ESE
-- profesional (o las del local, si viene sin profesional): reabrir el local
-- no le levanta a nadie el día libre que se había tomado aparte.
create or replace function public.abrir_dias(
  p_empresa     uuid,
  p_desde       date,
  p_hasta       date,
  p_profesional uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id      uuid;
  v_cuantos integer := 0;
begin
  if p_desde is null or p_hasta is null then
    raise exception 'Faltan las fechas.' using errcode = '22023';
  end if;

  for v_id in
    select x.id from public.turnos_excepcion x
    where x.empresa_id = p_empresa
      and x.fecha between p_desde and p_hasta
      and x.profesional_id is not distinct from p_profesional
    order by x.fecha
  loop
    perform public.borrar_excepcion(p_empresa, v_id);
    v_cuantos := v_cuantos + 1;
  end loop;

  return jsonb_build_object('dias', v_cuantos);
end $fn$;

revoke all on function public.abrir_dias(uuid, date, date, uuid) from public, anon;
grant execute on function public.abrir_dias(uuid, date, date, uuid) to authenticated;
