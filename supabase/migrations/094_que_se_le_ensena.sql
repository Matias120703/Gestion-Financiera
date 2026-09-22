-- ============================================================
-- 094 · QUÉ SE LE ENSEÑA A CADA ALUMNO
-- ============================================================
--
-- Matías: «al momento de inscribir a un alumno, tener una opción donde
-- especificar qué es lo que se le va a enseñar: inglés, matemática, o algo
-- distinto. Así para saber qué se le enseña a cada alumno».
--
-- Un profe que da inglés a las cinco y matemática a las seis mira la agenda
-- y tiene que saber qué preparar sin abrir la ficha de cada uno. Así que la
-- materia se anota al inscribir y se ve donde se mira el día: la agenda, las
-- clases de hoy del panel, la ficha del alumno y lo que falta cobrar.
--
-- ES DE LA INSCRIPCIÓN, NO DEL ALUMNO
--
-- El mismo alumno puede tomar inglés en marzo y francés en agosto, o las dos
-- cosas a la vez en dos horarios. La materia va con cada inscripción.
--
-- TEXTO LIBRE, CON SUGERENCIAS
--
-- No hay una lista cerrada de materias: nadie puede adivinar qué enseña cada
-- profe («Guitarra», «Excel», «Apoyo escolar 3er grado»). Se escribe lo que
-- sea, y al escribir se sugieren las que ese profe ya usó, para que «Inglés»
-- no termine siendo también «ingles» e «Ingles».

-- ------------------------------------------------------------
-- 1. LA COLUMNA
-- ------------------------------------------------------------
alter table public.paquetes
  add column if not exists materia text check (materia is null or char_length(materia) <= 60);

comment on column public.paquetes.materia is
  'Qué se le enseña en esta inscripción (094). Texto libre; null si no se dijo.';

-- ------------------------------------------------------------
-- 2. INSCRIBIR, AHORA CON LA MATERIA
--
--    La firma vieja se borra antes de crear la nueva: con un parámetro
--    más, `create or replace` no reemplaza, crea una segunda función al
--    lado, y la llamada de siempre se vuelve ambigua.
--
--    Copia exacta de la 091 salvo `p_materia` y la columna que la guarda.
-- ------------------------------------------------------------
drop function if exists public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text);

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
  p_materia     text default null
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
    v_mov := (public.cobrar_inscripcion(v_id, p_metodo, null)->>'movimiento')::uuid;
  end if;

  return jsonb_build_object(
    'paquete', v_id, 'clases', (v_previa->>'clases')::int, 'total', v_total, 'movimiento', v_mov);
end $fn$;

revoke all on function public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text, text) from public, anon;
grant execute on function public.inscribir_alumno(uuid, uuid, smallint[], time, time, date, date, numeric, numeric, boolean, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3. LAS MATERIAS QUE YA USÓ, PARA SUGERIRLAS
--
--    La más usada primero. Así el profe escribe «In» y le aparece «Inglés»
--    tal como la escribió la primera vez.
-- ------------------------------------------------------------
create or replace function public.materias_usadas(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(m.materia order by m.veces desc, m.ultima desc), '[]'::jsonb)
  into v_lista
  from (
    select p.materia, count(*) as veces, max(p.created_at) as ultima
    from public.paquetes p
    where p.empresa_id = p_empresa and p.materia is not null
    group by p.materia
    order by count(*) desc, max(p.created_at) desc
    limit 30
  ) m;

  return v_lista;
end $fn$;

revoke all on function public.materias_usadas(uuid) from public, anon;
grant execute on function public.materias_usadas(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. LA AGENDA DEL DÍA DICE QUÉ SE DA EN CADA CLASE
--
--    Copia exacta de la 092 con la materia de la inscripción.
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
    'paquete_id',  r.paquete_id,
    'materia',     pq.materia
  ) order by r.inicia), '[]'::jsonb)
  into v_res
  from public.turnos_reserva r
  join public.turnos_profesional p on p.id = r.profesional_id
  join public.productos pr on pr.id = r.producto_id
  left join public.paquetes pq on pq.id = r.paquete_id
  where r.empresa_id = p_empresa
    and (r.inicia at time zone v_zona)::date = v_fecha
    and r.estado <> 'cancelada';

  return v_res;
end $fn$;

revoke all on function public.agenda_del_dia(uuid, date) from public, anon;
grant execute on function public.agenda_del_dia(uuid, date) to authenticated;

-- ------------------------------------------------------------
-- 5. LAS CLASES DE HOY DEL PANEL, CON SU MATERIA
--
--    Copia exacta de la 092 con la materia en cada clase de hoy.
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
        'alumno', r.cliente_nombre, 'estado', r.estado, 'materia', pq.materia) order by r.inicia)
      from public.turnos_reserva r
      left join public.paquetes pq on pq.id = r.paquete_id
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

-- ------------------------------------------------------------
-- 6. LA FICHA DEL ALUMNO Y LO QUE FALTA COBRAR, CON LA MATERIA
--
--    Copias exactas de la 091 con la materia.
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
        'materia', p.materia,
        'clases', p.clases,
        'precio', p.precio,
        'vence_el', p.vence_el,
        'creado', p.created_at,
        'dias', to_jsonb(p.dias),
        'hora_desde', to_char(p.hora_desde, 'HH24:MI'),
        'hora_hasta', to_char(p.hora_hasta, 'HH24:MI'),
        'desde', p.desde,
        'precio_hora', p.precio_hora,
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

create or replace function public.por_cobrar_alumnos(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'paquete', p.id, 'cliente_id', p.cliente_id, 'alumno', c.nombre,
           'nombre', p.nombre, 'materia', p.materia,
           'monto', p.precio, 'desde', p.desde, 'hasta', p.vence_el)
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
