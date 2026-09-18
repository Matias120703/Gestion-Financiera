-- ============================================================
-- 078 · EL DESCUENTO QUE SE GANA USANDO ORDEN EN LA PRUEBA
-- ============================================================
--
-- Idea de Matías: la prueba gratis no alcanza para que alguien tome el
-- hábito. Hay que darle un motivo para volver TODOS los días, y que ese
-- motivo valga plata: **si durante la prueba junta una racha de días
-- seguidos cargando, se lleva un descuento en su primer mes.**
--
--   · Negocio  → 8 días seguidos.
--   · Personal → 5 días seguidos (carga menos cosas por día; pedirle ocho
--     sería pedirle el doble de esfuerzo por el mismo premio).
--   · El premio: 18% del primer pago.
--
-- POR QUÉ NO SE GUARDA UN «YA LO GANÓ» EN NINGUNA COLUMNA
--
-- Un premio ganado no se puede perder, y una bandera se puede perder: un
-- borrado, un rollback, un movimiento anulado y la persona que cumplió ve
-- que su descuento desapareció. Acá se calcula de los hechos —qué días
-- tuvieron movimientos dentro de la ventana de la prueba— así que la
-- respuesta es siempre la misma y se puede auditar mirando la lista de
-- movimientos. Si mañana cambia el objetivo, los que ya lo cumplieron lo
-- siguen teniendo.
--
-- La ventana es la prueba y nada más: desde que se creó la suscripción hasta
-- que termina (o hasta hoy, si sigue corriendo). Cargar después de pagar ya
-- no suma — el descuento es para el primer mes.

-- ------------------------------------------------------------
-- 1. LOS NÚMEROS SE EDITAN, NO SE DESPLIEGAN
--
--    Mismo criterio que la comisión y el retiro mínimo: viven en
--    `ajustes_orden` para que cambiar la promo sea un UPDATE.
-- ------------------------------------------------------------
alter table public.ajustes_orden
  add column if not exists descuento_racha_porcentaje numeric(5,2) not null default 18
    check (descuento_racha_porcentaje >= 0 and descuento_racha_porcentaje <= 100),
  add column if not exists racha_objetivo_negocio integer not null default 8
    check (racha_objetivo_negocio between 1 and 60),
  add column if not exists racha_objetivo_personal integer not null default 5
    check (racha_objetivo_personal between 1 and 60);

comment on column public.ajustes_orden.descuento_racha_porcentaje is
  'Cuánto se descuenta del primer mes al que junta la racha durante la prueba.';

-- ------------------------------------------------------------
-- 2. CUÁNTO LLEVA Y CUÁNTO LE FALTA
--
--    `mejor` es la racha más larga DENTRO de la prueba, no la de hoy: quien
--    hizo ocho días y después se tomó el domingo no perdió lo ganado.
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

  select descuento_racha_porcentaje,
         case when v_tipo = 'personal' then racha_objetivo_personal else racha_objetivo_negocio end
  into v_pct, v_objetivo
  from public.ajustes_orden where unica;

  v_pct      := coalesce(v_pct, 18);
  v_objetivo := coalesce(v_objetivo, case when v_tipo = 'personal' then 5 else 8 end);
  v_hoy      := (now() at time zone v_zona)::date;

  select s.* into v_sus from public.suscripciones s where s.empresa_id = p_empresa;

  -- Sin suscripción no hay prueba de la que hablar.
  if v_sus.empresa_id is null then
    return jsonb_build_object('objetivo', v_objetivo, 'mejor', 0, 'faltan', v_objetivo,
                              'logrado', false, 'porcentaje', v_pct, 'vigente', false);
  end if;

  v_desde := (v_sus.created_at at time zone v_zona)::date;
  v_hasta := least(v_hoy, (coalesce(v_sus.prueba_fin, now()) at time zone v_zona)::date);
  -- Todavía se puede sumar mientras la prueba corre y no se pagó nada.
  v_vigente := v_sus.estado = 'prueba' and v_hoy <= (coalesce(v_sus.prueba_fin, now()) at time zone v_zona)::date;

  with dias as (
    select distinct m.fecha
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.estado = 'activo'
      and m.fecha between v_desde and v_hasta
  ),
  numeradas as (
    select fecha, (fecha - (row_number() over (order by fecha))::int) as isla from dias
  )
  select coalesce(max(largo), 0) into v_mejor
  from (select count(*)::int as largo from numeradas group by isla) r;

  return jsonb_build_object(
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
-- 3. LOS NÚMEROS DE LA PROMO, PARA LA PORTADA
--
--    La portada la lee alguien que todavía no tiene cuenta, así que esto es
--    público. No dice nada de nadie: solo cuánto se descuenta y cuántos días
--    hay que juntar. Si el número se cambia en `ajustes_orden`, la portada
--    lo dice al instante — sin desplegar.
-- ------------------------------------------------------------
create or replace function public.promo_de_la_prueba()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'porcentaje', coalesce((select descuento_racha_porcentaje from public.ajustes_orden where unica), 18),
    'negocio',    coalesce((select racha_objetivo_negocio    from public.ajustes_orden where unica), 8),
    'personal',   coalesce((select racha_objetivo_personal   from public.ajustes_orden where unica), 5)
  );
$fn$;

grant execute on function public.promo_de_la_prueba() to anon, authenticated;
