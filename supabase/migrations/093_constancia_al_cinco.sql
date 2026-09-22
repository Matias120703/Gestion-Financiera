-- ============================================================
-- 093 · EL DESCUENTO POR CONSTANCIA BAJA A 5%
-- ============================================================
--
-- Matías: «el descuento después de la primera suscripción, si completaba
-- la racha de 30 días, era de 20%. Estuve calculando y 20% es muchísimo.
-- Quiero que sea solo 5%».
--
-- LO QUE QUEDA, ENTERO
--
--   · LA PRUEBA NO CAMBIA. Junta la racha de la prueba —8 días un negocio,
--     5 una cuenta personal— y el primer mes sale 18% más barato.
--   · DESPUÉS DE PAGAR: con 30 días seguidos cargando, la renovación sale
--     5% más barata. Y así todos los meses, mientras la racha siga viva.
--     Si se corta, se pausa hasta volver a juntar los 30. Es el mismo
--     trato de la 079, con otro número.
--
-- A QUIÉN LE TOCA
--
-- A nadie se le quita algo que ya ganó. Al 21/09 hay dos suscripciones
-- activas, y ninguna tiene racha hoy: la más larga que llegaron a juntar
-- fue de 2 días, lejos de los 30 que hacían falta para el 20%.
--
-- EL NÚMERO VIVE EN UN SOLO LUGAR
--
-- `ajustes_orden.descuento_constancia_porcentaje`. Todos los textos —el
-- panel, el plan, la página de inicio, el correo de activación, el
-- recordatorio— lo leen de ahí. Se cambia también el valor por defecto de
-- la columna y la reserva de las dos funciones que lo leen, para que no
-- quede un 20 escrito en ningún lado esperando a reaparecer.

-- ------------------------------------------------------------
-- 1. EL NÚMERO
-- ------------------------------------------------------------
alter table public.ajustes_orden
  alter column descuento_constancia_porcentaje set default 5;

update public.ajustes_orden set descuento_constancia_porcentaje = 5 where unica;

-- ------------------------------------------------------------
-- 2. LO QUE MUESTRA LA PÁGINA DE INICIO
--
--    Copia exacta de la versión viva (079), con la reserva de la
--    constancia en 5.
-- ------------------------------------------------------------
create or replace function public.promo_de_la_prueba()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'porcentaje',            coalesce((select descuento_racha_porcentaje from public.ajustes_orden where unica), 18),
    'negocio',               coalesce((select racha_objetivo_negocio    from public.ajustes_orden where unica), 8),
    'personal',              coalesce((select racha_objetivo_personal   from public.ajustes_orden where unica), 5),
    'constancia_porcentaje', coalesce((select descuento_constancia_porcentaje from public.ajustes_orden where unica), 5),
    'constancia_dias',       coalesce((select racha_objetivo_constancia       from public.ajustes_orden where unica), 30)
  );
$fn$;

-- ------------------------------------------------------------
-- 3. EL DESCUENTO QUE CORRESPONDE HOY
--
--    Copia exacta de la versión viva (080), con la reserva de la
--    constancia en 5. Nada más cambia: ni las fases, ni los objetivos, ni
--    cómo se cuenta la racha.
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
    v_pct      := coalesce(v_ajustes.descuento_constancia_porcentaje, 5);
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

revoke all on function public.descuento_por_racha(uuid) from public, anon;
grant execute on function public.descuento_por_racha(uuid) to authenticated;
grant execute on function public.promo_de_la_prueba() to anon, authenticated;
