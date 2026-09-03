-- ORDEN · Migración 043 · Avisarle al cliente que mañana tiene turno
--
-- Los plantones son el problema número uno de cualquier agenda, y casi
-- ninguno es mala fe: la persona reservó hace diez días y se olvidó. Hasta
-- acá `turnos_reserva` guardaba el teléfono del cliente y NADA lo usaba.
--
-- POR QUÉ NO SE MANDA SOLO
--
-- Un cliente de la barbería nunca se registra en Orden, así que el aviso por
-- push —lo único que Orden sabe mandar hoy— no le llega. Mandarle un mensaje
-- de verdad necesita un proveedor (WhatsApp API, SMS), verificación de la
-- empresa, plantillas aprobadas y costo por mensaje: semanas de trámite y
-- una decisión de plata que todavía no está tomada.
--
-- Entonces lo que se hace es lo que sí funciona hoy: el local toca un botón
-- y se abre WhatsApp con el mensaje escrito, desde SU número. Un toque por
-- cliente. Y para que alguien se acuerde de tocarlo, la noche anterior le
-- llega un push al dueño con cuántos turnos tiene mañana y cuántos siguen
-- sin avisar.
--
-- Esta migración aporta las dos piezas que faltaban en la base: dejar
-- constancia de a quién ya se le avisó, y poder preguntar «¿qué hay para
-- mañana?» desde la tarea de la noche.

-- ============================================================
-- 1. A QUIÉN YA SE LE AVISÓ
--
--    Una fecha y no un booleano: sirve para saber CUÁNDO se le avisó, que es
--    lo que después permite no volver a molestarlo dos veces el mismo día.
-- ============================================================
alter table public.turnos_reserva
  add column if not exists avisado_at timestamptz;

-- No lleva restricción de estado a propósito: esto no mueve plata ni ocupa
-- un horario, es una marca de «ya le escribí». Que se pueda marcar un turno
-- ya atendido no rompe nada, y en cambio poner reglas donde no hacen falta
-- termina en un botón que no funciona sin que se entienda por qué.
create or replace function public.marcar_avisado(
  p_reserva uuid,
  p_avisado boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_emp uuid;
begin
  select empresa_id into v_emp from public.turnos_reserva where id = p_reserva;

  if v_emp is null then
    raise exception 'Ese turno no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_emp) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  update public.turnos_reserva
  set avisado_at = case when coalesce(p_avisado, true) then now() else null end
  where id = p_reserva;

  return jsonb_build_object('avisado', coalesce(p_avisado, true));
end $fn$;

revoke all on function public.marcar_avisado(uuid, boolean) from public, anon;
grant execute on function public.marcar_avisado(uuid, boolean) to authenticated;

-- ============================================================
-- 2. LA AGENDA DEL DÍA DICE SI YA SE AVISÓ, Y CON QUÉ ENLACE
--
--    El token va acá porque el mensaje que se le manda al cliente incluye su
--    enlace para cancelar: avisarle sin darle cómo cancelar convierte al que
--    no puede venir en un plantón en vez de en un hueco libre.
--
--    No expone nada nuevo: cualquier miembro ya podía leer la columna `token`
--    directo de `turnos_reserva` desde la 037.
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
    'origen',      r.origen,
    'token',       r.token,
    'avisado',     (r.avisado_at is not null)
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

-- ============================================================
-- 3. QUÉ HAY PARA MAÑANA (la lee la tarea de la noche)
--
--    Solo para `service_role`: la tarea corre sin sesión de nadie y mira
--    todas las cuentas a la vez, así que esto no se le da a un usuario
--    común ni por equivocación. Mismo criterio que
--    `empresas_sin_cargar_hoy` desde la 008.
--
--    «Mañana» se calcula en la zona de CADA cuenta. Para el mismo instante,
--    el mañana de Asunción y el de Madrid son días distintos.
-- ============================================================
create or replace function public.turnos_de_manana()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id', e.id,
      'nombre',     e.nombre,
      'zona',       coalesce(e.zona_horaria, 'America/Asuncion'),
      'fecha',      (public.hoy_empresa(e.id) + 1),
      'turnos',     count(*)::int,
      'sin_avisar', count(*) filter (where r.avisado_at is null)::int
    ) as x
    from public.empresas e
    join public.turnos_reserva r on r.empresa_id = e.id
    where r.estado in ('pendiente', 'confirmada')
      and (r.inicia at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date
          = public.hoy_empresa(e.id) + 1
    group by e.id, e.nombre, e.zona_horaria
  ) s;

  return v_res;
end $fn$;

revoke all on function public.turnos_de_manana() from public, anon, authenticated;
grant execute on function public.turnos_de_manana() to service_role;

-- ============================================================
-- 4. PODER APAGARLO
--
--    Un aviso sin forma de apagarlo es spam, por más útil que sea. Va como
--    preferencia de la persona y no de la empresa: en un local con dos
--    dueños, uno puede querer el aviso y el otro no.
--
--    `guardar_preferencias` se BORRA y se vuelve a crear en vez de sumarle
--    el parámetro: con las dos versiones vivas, una llamada que manda solo
--    algunos campos —como hace la pantalla de ajustes— queda ambigua y
--    PostgreSQL no sabe a cuál de las dos le habla.
-- ============================================================
alter table public.preferencias
  add column if not exists aviso_turnos boolean not null default true;

create or replace function public.mis_preferencias()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'idioma', p.idioma, 'aviso_cierre', p.aviso_cierre,
    'aviso_semanal', p.aviso_semanal, 'aviso_turnos', p.aviso_turnos,
    'hora_cierre', p.hora_cierre
  ) into v_res
  from public.preferencias p where p.user_id = auth.uid();

  return coalesce(v_res, jsonb_build_object(
    'idioma', 'es', 'aviso_cierre', true, 'aviso_semanal', true,
    'aviso_turnos', true, 'hora_cierre', 20));
end $fn$;

drop function if exists public.guardar_preferencias(text, boolean, boolean, smallint);

create or replace function public.guardar_preferencias(
  p_idioma text default null,
  p_aviso_cierre boolean default null,
  p_aviso_semanal boolean default null,
  p_hora_cierre smallint default null,
  p_aviso_turnos boolean default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  insert into public.preferencias as p (
    user_id, idioma, aviso_cierre, aviso_semanal, hora_cierre, aviso_turnos)
  values (
    auth.uid(),
    coalesce(nullif(lower(trim(p_idioma)), ''), 'es'),
    coalesce(p_aviso_cierre, true),
    coalesce(p_aviso_semanal, true),
    coalesce(p_hora_cierre, 20::smallint),
    coalesce(p_aviso_turnos, true)
  )
  on conflict (user_id) do update set
    -- coalesce con el valor viejo: mandar un solo campo no borra los otros.
    idioma        = coalesce(nullif(lower(trim(p_idioma)), ''), p.idioma),
    aviso_cierre  = coalesce(p_aviso_cierre,  p.aviso_cierre),
    aviso_semanal = coalesce(p_aviso_semanal, p.aviso_semanal),
    hora_cierre   = coalesce(p_hora_cierre,   p.hora_cierre),
    aviso_turnos  = coalesce(p_aviso_turnos,  p.aviso_turnos),
    updated_at    = now();

  return public.mis_preferencias();
end $fn$;

revoke all on function public.mis_preferencias() from public, anon;
grant execute on function public.mis_preferencias() to authenticated;
revoke all on function public.guardar_preferencias(text, boolean, boolean, smallint, boolean)
  from public, anon;
grant execute on function public.guardar_preferencias(text, boolean, boolean, smallint, boolean)
  to authenticated;
