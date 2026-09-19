-- ============================================================
-- 080 · AHORRAR TAMBIÉN ES CARGAR (Y UN SOLO LUGAR QUE LO DECIDE)
-- ============================================================
--
-- La racha contaba los días que tienen algún movimiento. Guardar plata en un
-- fondo de ahorro no es un movimiento: va a `movimientos_ahorro`, que es otra
-- tabla. Resultado: alguien que un martes abre Orden y manda Gs. 200.000 al
-- fondo «Viaje» hizo exactamente lo que queremos que haga, y a la noche
-- pierde la racha igual. Eso no se explica; se arregla.
--
-- Desde acá, un día cuenta si la persona registró ALGO ese día: un
-- movimiento (venta, gasto, ingreso) o un movimiento de ahorro.
--
-- POR QUÉ UNA FUNCIÓN Y NO TRES CONSULTAS IGUALES
--
-- La misma cuenta —«qué días cargó»— estaba escrita tres veces: en la racha
-- del panel (008), en el descuento (078/079) y en los avisos diarios (076).
-- Tres copias de una regla es la garantía de que el día que cambie, cambie
-- en dos lugares y no en tres: el panel diría 31 días y el descuento 30, y
-- el que pierde es el descuento, porque nadie le cree a un número que se
-- contradice con el de al lado. Ahora la regla vive en `dias_cargados()` y
-- las tres la llaman.
--
-- Retirar del fondo también cuenta. No es «portarse bien», pero es usar
-- Orden para registrar plata que se movió, que es el hábito que se premia.

-- ------------------------------------------------------------
-- 1. QUÉ DÍAS CUENTAN
--
--    Devuelve las fechas, sin repetir, hasta `p_hasta` inclusive. La usan
--    funciones que ya son SECURITY DEFINER, así que no la ejecuta nadie de
--    afuera: quien pregunta por una cuenta ajena lo hace por la función de
--    arriba, que sí comprueba permisos.
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
  ) d
  group by fecha;
$fn$;

revoke all on function public.dias_cargados(uuid, date) from public, anon, authenticated;

comment on function public.dias_cargados(uuid, date) is
  'Los días en que la cuenta registró algo: movimientos y movimientos de ahorro. Única fuente de la racha.';

-- ------------------------------------------------------------
-- 2. LA RACHA DEL PANEL, SOBRE LA MISMA REGLA
-- ------------------------------------------------------------
create or replace function public.racha_empresa(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_hoy   date;
  v_ayer  date;
  v_res   jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_hoy  := public.hoy_empresa(p_empresa);
  v_ayer := v_hoy - 1;

  with dias as (
    select d.fecha from public.dias_cargados(p_empresa, v_hoy) d(fecha)
  ),
  numeradas as (
    select fecha, (fecha - (row_number() over (order by fecha))::int) as isla
    from dias
  ),
  rachas as (
    select isla, count(*)::int as largo, min(fecha) as desde, max(fecha) as hasta
    from numeradas group by isla
  ),
  vigente as (
    select * from rachas where hasta in (v_hoy, v_ayer) order by hasta desc limit 1
  )
  select jsonb_build_object(
    'hoy',           v_hoy,
    'dias',          coalesce((select largo from vigente), 0),
    'desde',         (select desde from vigente),
    'hoy_cargado',   exists (select 1 from dias where fecha = v_hoy),
    -- Solo está en riesgo si HAY algo que perder.
    'en_riesgo',     coalesce((select hasta from vigente), v_ayer - 1) = v_ayer,
    'mejor',         coalesce((select max(largo) from rachas), 0),
    'dias_activos',  (select count(*)::int from dias)
  ) into v_res;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 3. EL DESCUENTO, SOBRE LA MISMA REGLA
--
--    Igual que en la 079 —prueba: la mejor racha de la ventana; constancia:
--    la racha viva—, solo cambia de dónde salen los días.
-- ------------------------------------------------------------
create or replace function public.descuento_por_racha(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_tipo     text;
  v_zona     text;
  v_desde    date;
  v_hasta    date;
  v_hoy      date;
  v_objetivo integer;
  v_pct      numeric;
  v_mejor    integer := 0;
  v_vigente  boolean := false;
  v_fase     text;
  v_ajustes  record;
  v_sus      record;
begin
  if not public.es_admin(p_empresa) and not public.es_superadmin() then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(e.tipo_cuenta, 'emprendedor'), coalesce(e.zona_horaria, 'America/Asuncion')
  into v_tipo, v_zona
  from public.empresas e where e.id = p_empresa;

  if v_tipo is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  select * into v_ajustes from public.ajustes_orden where unica;
  v_hoy := (now() at time zone v_zona)::date;

  select s.* into v_sus from public.suscripciones s where s.empresa_id = p_empresa;

  if v_sus.empresa_id is null then
    return jsonb_build_object(
      'fase', 'prueba', 'objetivo', coalesce(v_ajustes.racha_objetivo_negocio, 8),
      'mejor', 0, 'faltan', coalesce(v_ajustes.racha_objetivo_negocio, 8),
      'logrado', false, 'porcentaje', coalesce(v_ajustes.descuento_racha_porcentaje, 18),
      'vigente', false);
  end if;

  v_fase := case
    when v_sus.estado = 'activa' and coalesce(v_sus.plan, 'gratis') <> 'gratis' then 'constancia'
    else 'prueba'
  end;

  if v_fase = 'constancia' then
    v_pct      := coalesce(v_ajustes.descuento_constancia_porcentaje, 20);
    v_objetivo := coalesce(v_ajustes.racha_objetivo_constancia, 30);
    with dias as (
      select d.fecha from public.dias_cargados(p_empresa, v_hoy) d(fecha)
    ),
    numeradas as (
      select fecha, (fecha - (row_number() over (order by fecha))::int) as isla from dias
    ),
    rachas as (
      select isla, count(*)::int as largo, max(fecha) as hasta from numeradas group by isla
    )
    select coalesce((select largo from rachas where hasta in (v_hoy, v_hoy - 1)
                     order by hasta desc limit 1), 0)
    into v_mejor;
    v_vigente := true;
  else
    v_pct      := coalesce(v_ajustes.descuento_racha_porcentaje, 18);
    v_objetivo := coalesce(
      case when v_tipo = 'personal' then v_ajustes.racha_objetivo_personal
           else v_ajustes.racha_objetivo_negocio end,
      case when v_tipo = 'personal' then 5 else 8 end);

    v_desde := (v_sus.created_at at time zone v_zona)::date;
    v_hasta := least(v_hoy, (coalesce(v_sus.prueba_fin, now()) at time zone v_zona)::date);
    v_vigente := v_sus.estado = 'prueba'
                 and v_hoy <= (coalesce(v_sus.prueba_fin, now()) at time zone v_zona)::date;

    with dias as (
      select d.fecha from public.dias_cargados(p_empresa, v_hasta) d(fecha)
      where d.fecha >= v_desde
    ),
    numeradas as (
      select fecha, (fecha - (row_number() over (order by fecha))::int) as isla from dias
    )
    select coalesce(max(largo), 0) into v_mejor
    from (select count(*)::int as largo from numeradas group by isla) r;
  end if;

  return jsonb_build_object(
    'fase',       v_fase,
    'objetivo',   v_objetivo,
    'mejor',      v_mejor,
    'faltan',     greatest(0, v_objetivo - v_mejor),
    'logrado',    v_mejor >= v_objetivo,
    'porcentaje', v_pct,
    'vigente',    v_vigente
  );
end $fn$;

-- ------------------------------------------------------------
-- 4. LOS AVISOS DIARIOS, SOBRE LA MISMA REGLA
--
--    Además de la racha, cambia una cosa más: el aviso de la tarde («todavía
--    no cargaste nada hoy») ya no se manda a quien hoy solo movió su ahorro.
--    Decirle «no cargaste nada» a alguien que acaba de guardar plata es
--    pedirle que ignore la notificación siguiente.
--
--    `cargados` sigue contando solo movimientos: es el número con el que se
--    arma el resumen de la noche, y un día de puro ahorro no tiene resumen
--    de ventas ni de gastos que contar. Por eso el ahorro va aparte.
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
      'fecha',       z.hoy,
      'hoy', jsonb_build_object(
        'ventas', a.ventas_hoy, 'ingresos', a.ingresos_hoy, 'gastos', a.gastos_hoy,
        'ganancia', a.ventas_hoy + a.ingresos_hoy - a.costo_hoy - a.gastos_hoy,
        'cargados', a.n_hoy,
        -- Movimientos de ahorro de hoy: no arman resumen, pero sí cuentan
        -- como «ya usó Orden hoy» para no empujarlo a la tarde.
        'ahorros', h.n_ahorro_hoy),
      'ayer', jsonb_build_object(
        'ventas', a.ventas_ayer, 'ingresos', a.ingresos_ayer, 'gastos', a.gastos_ayer,
        'ganancia', a.ventas_ayer + a.ingresos_ayer - a.costo_ayer - a.gastos_ayer,
        'cargados', a.n_ayer),
      'racha', jsonb_build_object('dias', r.dias, 'en_riesgo', r.en_riesgo),
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
    cross join lateral (
      select count(*)::int as n_ahorro_hoy
      from public.movimientos_ahorro ma
      where ma.empresa_id = e.id and ma.fecha = z.hoy
    ) h
    cross join lateral (
      with dias as (
        select d.fecha from public.dias_cargados(e.id, z.hoy) d(fecha)
      ),
      numeradas as (
        select fecha, (fecha - (row_number() over (order by fecha))::int) as isla
        from dias
      ),
      rachas as (
        select isla, count(*)::int as largo, max(fecha) as hasta
        from numeradas group by isla
      ),
      vigente as (
        select * from rachas where hasta in (z.hoy, z.hoy - 1) order by hasta desc limit 1
      )
      select
        coalesce((select largo from vigente), 0) as dias,
        coalesce((select hasta from vigente), z.hoy - 2) = z.hoy - 1 as en_riesgo
    ) r
    where (
        coalesce(e.tipo_cuenta, 'emprendedor') = 'personal'
        or public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta)
      )
      and public.puede_cargar(e.id)
      and (
        e.created_at > now() - interval '7 days'
        or exists (select 1 from public.movimientos m2
                   where m2.empresa_id = e.id and m2.created_at > now() - interval '30 days')
        or exists (select 1 from public.movimientos_ahorro a2
                   where a2.empresa_id = e.id and a2.created_at > now() - interval '30 days')
      )
  ) s;

  return v_res;
end $fn$;

revoke all on function public.avisos_del_dia() from public, anon, authenticated;
grant execute on function public.avisos_del_dia() to service_role;
