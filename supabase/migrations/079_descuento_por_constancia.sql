-- ============================================================
-- 079 · EL DESCUENTO QUE SE MANTIENE: RACHA VIVA, 20% MENOS
-- ============================================================
--
-- La 078 le puso premio a la prueba: junta la racha y tu PRIMER mes sale más
-- barato. Matías: «eso está bien para que arranque, pero después se acaba.
-- Si mantenés la racha de 30 días, siempre vas a tener el 20%». O sea: el
-- premio deja de ser de bienvenida y pasa a ser por constancia.
--
-- LAS DOS ETAPAS, UNA SOLA FUNCIÓN
--
-- Es el mismo trato contado en dos momentos de la vida de una cuenta, así
-- que `descuento_por_racha()` ahora contesta según dónde está parada:
--
--   · TODAVÍA NO PAGÓ (prueba, o prueba vencida sin pagar)
--     Objetivo corto —8 días un negocio, 5 una cuenta personal— y el premio
--     es del PRIMER mes. Se mira la MEJOR racha dentro de la prueba: una vez
--     ganado no se pierde, aunque después se tome un día.
--
--   · YA PAGA (suscripción activa)
--     Objetivo 30 días y el premio es 20% de cada renovación. Acá se mira la
--     racha VIVA, no la mejor: el premio es por sostenerla. Si la corta,
--     deja de tener descuento hasta que la vuelva a levantar. Eso es lo que
--     pidió: «si mantenés tu racha, siempre vas a tener el 20%».
--
-- La racha viva se cuenta igual que en el panel (`racha_empresa`, 008):
-- vale si llega hasta hoy o hasta ayer. Tiene que ser el MISMO número que la
-- persona ve en su pantalla — si el panel dice 31 y el descuento dice 30,
-- el que pierde es el descuento, porque nadie le cree.
--
-- El cobro sigue siendo a mano: esto le dice al cliente lo que se ganó y le
-- dice a la administración cuánto cobrar. Cuando entre la pasarela, el mismo
-- número se aplica solo al cobrar.

-- ------------------------------------------------------------
-- 1. LOS NÚMEROS DE LA SEGUNDA ETAPA
-- ------------------------------------------------------------
alter table public.ajustes_orden
  add column if not exists descuento_constancia_porcentaje numeric(5,2) not null default 20
    check (descuento_constancia_porcentaje >= 0 and descuento_constancia_porcentaje <= 100),
  add column if not exists racha_objetivo_constancia integer not null default 30
    check (racha_objetivo_constancia between 1 and 365);

comment on column public.ajustes_orden.descuento_constancia_porcentaje is
  'Cuánto se descuenta de cada renovación mientras la cuenta mantenga su racha viva.';

-- ------------------------------------------------------------
-- 2. EL DESCUENTO QUE CORRESPONDE HOY
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

  -- Sin suscripción no hay nada que ofrecer todavía.
  if v_sus.empresa_id is null then
    return jsonb_build_object(
      'fase', 'prueba', 'objetivo', coalesce(v_ajustes.racha_objetivo_negocio, 8),
      'mejor', 0, 'faltan', coalesce(v_ajustes.racha_objetivo_negocio, 8),
      'logrado', false, 'porcentaje', coalesce(v_ajustes.descuento_racha_porcentaje, 18),
      'vigente', false);
  end if;

  -- Paga de verdad: el trato pasa a ser por constancia.
  v_fase := case
    when v_sus.estado = 'activa' and coalesce(v_sus.plan, 'gratis') <> 'gratis' then 'constancia'
    else 'prueba'
  end;

  if v_fase = 'constancia' then
    v_pct      := coalesce(v_ajustes.descuento_constancia_porcentaje, 20);
    v_objetivo := coalesce(v_ajustes.racha_objetivo_constancia, 30);
    -- La racha VIVA, la misma que muestra el panel: vale hasta ayer.
    with dias as (
      select distinct m.fecha
      from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo' and m.fecha <= v_hoy
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
    -- Siempre se puede sostener: mientras pague, el trato sigue en pie.
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

    -- La MEJOR de la prueba: lo ganado no se pierde.
    with dias as (
      select distinct m.fecha
      from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo'
        and m.fecha between v_desde and v_hasta
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

-- ------------------------------------------------------------
-- 3. LA PROMO ENTERA, PARA LA PORTADA
--
--    Se le suman los números de la segunda etapa sin tocar los que ya lee
--    la portada: quien mira precios tiene que ver las dos mitades del trato
--    —el primer mes y los que siguen— antes de registrarse.
-- ------------------------------------------------------------
create or replace function public.promo_de_la_prueba()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'porcentaje',            coalesce((select descuento_racha_porcentaje from public.ajustes_orden where unica), 18),
    'negocio',               coalesce((select racha_objetivo_negocio    from public.ajustes_orden where unica), 8),
    'personal',              coalesce((select racha_objetivo_personal   from public.ajustes_orden where unica), 5),
    'constancia_porcentaje', coalesce((select descuento_constancia_porcentaje from public.ajustes_orden where unica), 20),
    'constancia_dias',       coalesce((select racha_objetivo_constancia       from public.ajustes_orden where unica), 30)
  );
$fn$;

grant execute on function public.promo_de_la_prueba() to anon, authenticated;
