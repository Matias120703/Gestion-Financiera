-- ============================================================
-- ORDEN · Migración 071 · Una app que habla todos los días
--
-- LO QUE PIDIÓ MATÍAS (16/09/2026)
--
--   «Tiene que ser bien activo Orden, que le esté enviando notificaciones
--    todos los días: no te olvides de cargar hoy, hoy ganaste esto, hoy
--    estás un dos por ciento más de venta que ayer, hoy tenés estos gastos.
--    Que la aplicación sea más viva.»
--
-- Hasta acá Orden hablaba una sola vez por día, y solo para salvar una
-- racha. Esto suma tres momentos: a la mañana (cómo fue ayer), a la tarde
-- (si todavía no cargó nada) y a la noche (cómo fue hoy, contra ayer). Y el
-- aviso de que la prueba se termina, que es el que más importa para que la
-- cuenta no se corte sin que la persona lo vea venir.
--
-- LO QUE SIGUE SIENDO REGLA
--
--   · Una preferencia para apagarlo (`aviso_diario`). Un aviso que no se
--     puede apagar termina con la persona apagando TODOS los avisos.
--   · Solo cuentas vivas: con algo cargado en los últimos 30 días o creadas
--     en la última semana. A quien abandonó hace meses no se le escribe.
--   · Solo rubros de ciclo diario. A un ganadero no se le pregunta todos los
--     días si vendió algo (ver 024, `rubro_cierra_el_dia`).
--   · Una vez por persona, momento y día: la tabla `envios` (010).
--
-- Los números salen acá y no en el servidor: el servidor solo arma la frase
-- en el idioma de cada uno.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA PREFERENCIA
-- ------------------------------------------------------------
alter table public.preferencias
  add column if not exists aviso_diario boolean not null default true;

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
    'aviso_diario', p.aviso_diario,
    'hora_cierre', p.hora_cierre
  ) into v_res
  from public.preferencias p where p.user_id = auth.uid();

  return coalesce(v_res, jsonb_build_object(
    'idioma', 'es', 'aviso_cierre', true, 'aviso_semanal', true,
    'aviso_turnos', true, 'aviso_diario', true, 'hora_cierre', 20));
end $fn$;

-- La firma cambia: sin borrar la de cinco, una llamada con algunos campos
-- queda ambigua (ver 043).
drop function if exists public.guardar_preferencias(text, boolean, boolean, smallint, boolean);

create or replace function public.guardar_preferencias(
  p_idioma text default null,
  p_aviso_cierre boolean default null,
  p_aviso_semanal boolean default null,
  p_hora_cierre smallint default null,
  p_aviso_turnos boolean default null,
  p_aviso_diario boolean default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  insert into public.preferencias as p (
    user_id, idioma, aviso_cierre, aviso_semanal, hora_cierre, aviso_turnos, aviso_diario)
  values (
    auth.uid(),
    coalesce(nullif(lower(trim(p_idioma)), ''), 'es'),
    coalesce(p_aviso_cierre, true),
    coalesce(p_aviso_semanal, true),
    coalesce(p_hora_cierre, 20::smallint),
    coalesce(p_aviso_turnos, true),
    coalesce(p_aviso_diario, true)
  )
  on conflict (user_id) do update set
    idioma        = coalesce(nullif(lower(trim(p_idioma)), ''), p.idioma),
    aviso_cierre  = coalesce(p_aviso_cierre,  p.aviso_cierre),
    aviso_semanal = coalesce(p_aviso_semanal, p.aviso_semanal),
    hora_cierre   = coalesce(p_hora_cierre,   p.hora_cierre),
    aviso_turnos  = coalesce(p_aviso_turnos,  p.aviso_turnos),
    aviso_diario  = coalesce(p_aviso_diario,  p.aviso_diario),
    updated_at    = now();

  return public.mis_preferencias();
end $fn$;

revoke all on function public.mis_preferencias() from public, anon;
grant execute on function public.mis_preferencias() to authenticated;
revoke all on function public.guardar_preferencias(text, boolean, boolean, smallint, boolean, boolean)
  from public, anon;
grant execute on function public.guardar_preferencias(text, boolean, boolean, smallint, boolean, boolean)
  to authenticated;

-- ------------------------------------------------------------
-- 2. LOS NÚMEROS DE HOY Y DE AYER, POR CUENTA
--
--    Solo para service_role: son los números de todos los negocios.
--    `ganancia` es la misma cuenta que el panel: lo que entró menos el costo
--    de lo vendido menos los gastos.
-- ------------------------------------------------------------
create or replace function public.avisos_del_dia()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id',  e.id,
      'nombre',      e.nombre,
      'moneda',      e.moneda,
      'tipo_cuenta', coalesce(e.tipo_cuenta, 'emprendedor'),
      -- La fecha de hoy EN LA ZONA DEL NEGOCIO: con ella se arma la clave
      -- de «una vez por día».
      'fecha',       z.hoy,
      'hoy', jsonb_build_object(
        'ventas', a.ventas_hoy, 'ingresos', a.ingresos_hoy, 'gastos', a.gastos_hoy,
        'ganancia', a.ventas_hoy + a.ingresos_hoy - a.costo_hoy - a.gastos_hoy, 'cargados', a.n_hoy),
      'ayer', jsonb_build_object(
        'ventas', a.ventas_ayer, 'ingresos', a.ingresos_ayer, 'gastos', a.gastos_ayer,
        'ganancia', a.ventas_ayer + a.ingresos_ayer - a.costo_ayer - a.gastos_ayer, 'cargados', a.n_ayer),
      'destinatarios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', mi.user_id, 'idioma', coalesce(p.idioma, 'es'))), '[]'::jsonb)
        from public.miembros mi
        left join public.preferencias p on p.user_id = mi.user_id
        where mi.empresa_id = e.id
          and mi.rol in ('propietario', 'admin')
          and coalesce(p.aviso_diario, true)
      )
    ) as x
    from public.empresas e
    cross join lateral (
      select (now() at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date as hoy
    ) z
    cross join lateral (
      select
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy and m.tipo = 'venta'), 0)       as ventas_hoy,
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy and m.tipo = 'ingreso'), 0)     as ingresos_hoy,
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy and m.tipo = 'gasto'), 0)       as gastos_hoy,
        coalesce(sum(coalesce(m.costo_total, 0)) filter (where m.fecha = z.hoy and m.tipo = 'venta'), 0) as costo_hoy,
        count(*) filter (where m.fecha = z.hoy)::int                                       as n_hoy,
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1 and m.tipo = 'venta'), 0)   as ventas_ayer,
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1 and m.tipo = 'ingreso'), 0) as ingresos_ayer,
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1 and m.tipo = 'gasto'), 0)   as gastos_ayer,
        coalesce(sum(coalesce(m.costo_total, 0)) filter (where m.fecha = z.hoy - 1 and m.tipo = 'venta'), 0) as costo_ayer,
        count(*) filter (where m.fecha = z.hoy - 1)::int                                   as n_ayer
      from public.movimientos m
      where m.empresa_id = e.id and m.estado = 'activo'
        and m.fecha between z.hoy - 1 and z.hoy
    ) a
    where (
        coalesce(e.tipo_cuenta, 'emprendedor') = 'personal'
        or public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta)
      )
      -- Una cuenta vencida no puede cargar: pedirle que cargue es mentirle.
      and public.puede_cargar(e.id)
      and (
        e.created_at > now() - interval '7 days'
        or exists (select 1 from public.movimientos m2
                   where m2.empresa_id = e.id and m2.created_at > now() - interval '30 days')
      )
  ) s;

  return v_res;
end $fn$;

revoke all on function public.avisos_del_dia() from public, anon, authenticated;
grant execute on function public.avisos_del_dia() to service_role;

-- ------------------------------------------------------------
-- 3. LAS PRUEBAS QUE SE TERMINAN
--
--    Faltando 3 días, 1 día y el último día. `dias` se cuenta en la fecha de
--    la zona del negocio: «termina mañana» tiene que ser mañana para él.
-- ------------------------------------------------------------
create or replace function public.pruebas_por_terminar()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x order by (x->>'dias')::int), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id',  e.id,
      'nombre',      e.nombre,
      'tipo_cuenta', coalesce(e.tipo_cuenta, 'emprendedor'),
      'fin',         s.periodo_fin,
      'dias',        (s.periodo_fin at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date
                     - (now() at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date,
      'destinatarios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', mi.user_id, 'idioma', coalesce(p.idioma, 'es'))), '[]'::jsonb)
        from public.miembros mi
        left join public.preferencias p on p.user_id = mi.user_id
        where mi.empresa_id = e.id and mi.rol in ('propietario', 'admin')
      )
    ) as x
    from public.suscripciones s
    join public.empresas e on e.id = s.empresa_id
    where s.estado = 'prueba'
      and s.periodo_fin > now()
      and (s.periodo_fin at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date
          - (now() at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date in (0, 1, 3)
  ) t;

  return v_res;
end $fn$;

revoke all on function public.pruebas_por_terminar() from public, anon, authenticated;
grant execute on function public.pruebas_por_terminar() to service_role;
