-- ============================================================
-- 092 · LA CLASE DEL DÍA, EL PANEL DEL PROFE Y SU RACHA
-- ============================================================
--
-- Matías, después de probar: «llega el día y me aparece atendido, cobrar,
-- mover, cancelar, no vino. Atendido y cobrar no se puede, porque yo ya
-- cobré por adelantado. Lo que podría hacer es "clase finalizada", para
-- marcar que sí se tuvo. Y si no se tuvo, en vez de "no vino", "no se tuvo
-- la clase"».
--
-- Y sobre el panel: «si entro como profesor no me puede aparecer lo
-- vendido, ganancia bruta, ganancia neta, lo que más se vendió. Tiene que
-- estar adaptado a su rubro».
--
-- MARCAR UNA CLASE NO COBRA NADA
--
-- `atender_reserva` es de la barbería: marcar atendido ES cobrar el corte,
-- ahí mismo. Un profe ya cobró el período al inscribir. Marcar la clase es
-- solo decir que pasó —y descontarla del período, por el camino de la 088,
-- con la reserva pegada para que un doble toque no la descuente dos veces.
--
-- LA CLASE QUE NO SE TUVO
--
-- Matías decidió que en cada falta se pregunte si se descuenta. Acá se
-- recibe la respuesta: con descuento queda como «falta» en la historia del
-- alumno; sin descuento la clase sigue disponible, como si nunca hubiera
-- estado agendada. En la agenda queda igual «no se tuvo».

-- ------------------------------------------------------------
-- 1. LA AGENDA DEL DÍA DICE DE QUÉ INSCRIPCIÓN ES CADA CLASE
--
--    Sin esto la pantalla no puede saber si un turno es una clase de un
--    período pagado o un corte que hay que cobrar.
-- ------------------------------------------------------------
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
    'origen',      r.origen,
    'token',       r.token,
    'avisado',     (r.avisado_at is not null),
    'paquete_id',  r.paquete_id
  ) order by r.inicia), '[]'::jsonb)
  into v_res
  from public.turnos_reserva r
  join public.turnos_profesional p on p.id = r.profesional_id
  join public.productos pr on pr.id = r.producto_id
  where r.empresa_id = p_empresa
    and (r.inicia at time zone v_zona)::date = v_fecha
    and r.estado <> 'cancelada';

  return v_res;
end $fn$;

revoke all on function public.agenda_del_dia(uuid, date) from public, anon;
grant execute on function public.agenda_del_dia(uuid, date) to authenticated;

-- ------------------------------------------------------------
-- 2. MARCAR LA CLASE: SE TUVO, O NO SE TUVO
-- ------------------------------------------------------------
create or replace function public.marcar_clase(
  p_reserva   uuid,
  p_dada      boolean default true,
  p_descontar boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_r     public.turnos_reserva%rowtype;
  v_zona  text;
  v_fecha date;
  v_paq   jsonb;
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

  if v_r.paquete_id is null then
    raise exception 'Esa clase no es de ninguna inscripción.' using errcode = '22023';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas where id = v_r.empresa_id;
  -- La fecha de la CLASE, no la de hoy: la del lunes que se marca el martes
  -- sigue siendo del lunes.
  v_fecha := (v_r.inicia at time zone v_zona)::date;

  if coalesce(p_dada, true) then
    v_paq := public.dar_clase(v_r.paquete_id, 1, v_fecha, 'dada', p_reserva);
    update public.turnos_reserva set estado = 'atendida' where id = p_reserva;
  else
    if coalesce(p_descontar, true) then
      v_paq := public.dar_clase(v_r.paquete_id, 1, v_fecha, 'falta', p_reserva);
    else
      v_paq := public.estado_paquete(v_r.paquete_id);
    end if;
    update public.turnos_reserva set estado = 'no_vino' where id = p_reserva;
  end if;

  return jsonb_build_object('reserva', p_reserva, 'paquete', v_paq);
end $fn$;

revoke all on function public.marcar_clase(uuid, boolean, boolean) from public, anon;
grant execute on function public.marcar_clase(uuid, boolean, boolean) to authenticated;

-- ------------------------------------------------------------
-- 3. LA RACHA CUENTA LOS DÍAS CON CLASE DADA
--
--    Un profe no cierra caja ni carga ventas: su «cargué algo hoy» es marcar
--    la clase. Va a la única fuente de la racha (080), así que el panel, el
--    descuento por constancia y el recordatorio miran lo mismo.
--
--    Lo que todavía NO hace: que los días sin clases no corten la racha.
--    Eso cambia la regla de las islas y va aparte.
-- ------------------------------------------------------------
create or replace function public.dias_cargados(p_empresa uuid, p_hasta date)
returns setof date language sql stable security definer set search_path = public as $fn$
  select fecha
  from (
    select m.fecha
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo' and m.fecha <= p_hasta
    union
    select a.fecha
    from public.movimientos_ahorro a
    where a.empresa_id = p_empresa and a.fecha <= p_hasta
    union
    select c.fecha
    from public.clases_dadas c
    where c.empresa_id = p_empresa and c.motivo = 'dada' and c.fecha <= p_hasta
  ) d
  group by fecha;
$fn$;

revoke all on function public.dias_cargados(uuid, date) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. LO QUE MIRA UN PROFE AL ABRIR ORDEN
--
--    Nada de vendido ni de ganancia bruta. Sus preguntas son otras: ¿qué
--    clases tengo hoy?, ¿cuánto cobré?, ¿quién me debe?, ¿cuántos alumnos
--    activos tengo?
-- ------------------------------------------------------------
create or replace function public.panel_profe(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona text;
  v_hoy  date;
  v_res  jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;
  v_hoy := public.hoy_empresa(p_empresa);

  select jsonb_build_object(
    'hoy', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'hora', to_char(r.inicia at time zone v_zona, 'HH24:MI'),
        'alumno', r.cliente_nombre, 'estado', r.estado) order by r.inicia)
      from public.turnos_reserva r
      where r.empresa_id = p_empresa and r.estado <> 'cancelada'
        and (r.inicia at time zone v_zona)::date = v_hoy), '[]'::jsonb),
    'clases_periodo', (
      select count(*)::int from public.turnos_reserva r
      where r.empresa_id = p_empresa and r.estado = 'atendida'
        and (r.inicia at time zone v_zona)::date between p_desde and p_hasta),
    'cobrado', coalesce((
      select sum(m.monto) from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo in ('venta', 'ingreso')
        and m.fecha between p_desde and p_hasta), 0),
    'gastado', coalesce((
      select sum(m.monto) from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
        and m.fecha between p_desde and p_hasta), 0),
    'por_cobrar', coalesce((
      select sum(p.precio) from public.paquetes p
      where p.empresa_id = p_empresa and p.movimiento_id is null and p.precio > 0 and not p.cerrado), 0),
    'deben', (
      select count(distinct p.cliente_id)::int from public.paquetes p
      where p.empresa_id = p_empresa and p.movimiento_id is null and p.precio > 0 and not p.cerrado),
    'alumnos_activos', (
      select count(distinct p.cliente_id)::int from public.paquetes p
      where p.empresa_id = p_empresa and not p.cerrado
        and (public.estado_paquete(p.id)->>'estado') = 'activo')
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.panel_profe(uuid, date, date) from public, anon;
grant execute on function public.panel_profe(uuid, date, date) to authenticated;
