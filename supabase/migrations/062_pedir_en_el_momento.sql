-- ============================================================
-- ORDEN · Migración 062 · Pedir la recomendación en el momento
--
-- El programa de socios (060 y 061) tiene una pantalla, y una pantalla en un
-- menú no la abre nadie. Lo que mata a estos programas no es el abuso: es el
-- silencio.
--
-- Así que se pide solo, y se pide donde la persona acaba de ver que Orden le
-- sirve: al cerrar un buen día, y justo después de pagar. Nunca en un menú,
-- nunca a alguien que recién entró, nunca dos veces seguidas.
--
-- LAS REGLAS VIVEN ACÁ Y NO EN LA PANTALLA
--
-- Son cinco condiciones, y si viven en el componente hay que repetirlas en
-- cada lugar donde se pida —y el día que se agregue el tercero, alguna se va
-- a quedar afuera—. La pantalla pregunta «¿pido?» y la base contesta.
--
-- Lo único que decide cada pantalla es lo suyo: el cierre, que el día haya
-- cerrado bien; el plan, que el pago sea reciente. Eso es el momento, y el
-- momento es distinto en cada lugar.
--
-- Y LO QUE HACE QUE TRAIGA AL SEGUNDO
--
-- Cuando el que trajo paga de verdad, hay que avisarle. Sin eso manda un
-- enlace, no pasa nada visible, y no manda nunca más. Es lo más barato de
-- todo el programa y es lo que más rinde.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DOS FECHAS EN LAS PREFERENCIAS DE LA PERSONA
--
--    Van en `preferencias` y no en la empresa: quien recomienda es una
--    persona. Si las guardara el negocio, un vendedor vería el «ahora no» de
--    su jefe, y el jefe volvería a ver el aviso en cada empresa suya.
-- ------------------------------------------------------------
alter table public.preferencias
  add column if not exists recomendar_pedido_at timestamptz,
  add column if not exists comisiones_vistas_at timestamptz;

comment on column public.preferencias.recomendar_pedido_at is
  'Última vez que se le ofreció recomendar Orden. Se respeta 30 días.';
comment on column public.preferencias.comisiones_vistas_at is
  'Hasta cuándo vio sus comisiones nuevas. Lo posterior es novedad.';

-- ------------------------------------------------------------
-- 2. ¿ES MOMENTO DE PEDIRLE?
--
--    Las cinco condiciones, en un solo lugar:
--
--    · Que ya no tenga su código: al que ya está adentro no se le pide, se le
--      muestra lo que ganó.
--    · Que hayan pasado 30 días desde la última vez. Si aparece en cada día
--      bueno, se vuelve paisaje y deja de verse.
--    · Que use Orden hace al menos una semana. Pedirle a alguien de dos días
--      que recomiende es pedirle que mienta.
--    · Que tenga movimientos cargados de verdad, no tres de prueba.
--    · Que la cuenta no esté vencida. Pedirle un favor a alguien a quien se
--      le cortó el servicio es el peor momento posible.
-- ------------------------------------------------------------
create or replace function public.momento_de_recomendar(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_ultima timestamptz;
  v_creada timestamptz;
  v_movs   integer;
begin
  -- Sin sesión o mirando un negocio ajeno no se contesta nada. Esto no
  -- devuelve datos de nadie, pero la costumbre de comprobar siempre es la
  -- que hace que no se olvide el día que sí importa.
  if v_uid is null or not public.es_miembro(p_empresa) then
    return jsonb_build_object('pedir', false);
  end if;

  if exists (select 1 from public.socios s where s.user_id = v_uid) then
    return jsonb_build_object('pedir', false);
  end if;

  select recomendar_pedido_at into v_ultima
  from public.preferencias where user_id = v_uid;

  if v_ultima is not null and v_ultima > now() - interval '30 days' then
    return jsonb_build_object('pedir', false);
  end if;

  select created_at into v_creada from public.empresas where id = p_empresa;
  if v_creada is null or v_creada > now() - interval '7 days' then
    return jsonb_build_object('pedir', false);
  end if;

  if public.plan_efectivo_calculado(p_empresa) = 'gratis' then
    return jsonb_build_object('pedir', false);
  end if;

  select count(*)::int into v_movs
  from public.movimientos mv
  where mv.empresa_id = p_empresa and mv.estado = 'activo';

  if v_movs < 15 then
    return jsonb_build_object('pedir', false);
  end if;

  return jsonb_build_object('pedir', true);
end $fn$;

revoke all on function public.momento_de_recomendar(uuid) from public, anon;
grant execute on function public.momento_de_recomendar(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. «AHORA NO»
--
--    Se guarda por persona y no en el teléfono: quien dijo que no en la
--    computadora no tiene que volver a decirlo en el celular.
--
--    Se llama también cuando SÍ acepta. Parece raro y no lo es: apenas pide
--    su código deja de entrar por esta puerta, y si algo fallara justo ahí,
--    lo peor que pasa es que no se le vuelva a ofrecer por un mes.
-- ------------------------------------------------------------
create or replace function public.posponer_recomendacion()
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  insert into public.preferencias as p (user_id, recomendar_pedido_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set
    recomendar_pedido_at = now(),
    updated_at = now();

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.posponer_recomendacion() from public, anon;
grant execute on function public.posponer_recomendacion() to authenticated;

-- ------------------------------------------------------------
-- 4. «FULANO PAGÓ SU PRIMER MES»
--
--    La novedad para el socio. Solo lo que pasó desde la última vez que
--    miró: un aviso que repite lo de siempre se aprende a ignorar en dos
--    días.
--
--    Las anuladas no avisan. Prometerle plata a alguien y después decirle
--    que no, por un cobro que se deshizo, es peor que no haberle dicho nada.
-- ------------------------------------------------------------
create or replace function public.novedad_comisiones()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_socio  uuid;
  v_desde  timestamptz;
  v_cuanto integer;
  v_total  numeric;
  v_quien  text;
begin
  if v_uid is null then
    return jsonb_build_object('hay', false);
  end if;

  select id into v_socio from public.socios where user_id = v_uid;
  if v_socio is null then
    return jsonb_build_object('hay', false);
  end if;

  select comisiones_vistas_at into v_desde from public.preferencias where user_id = v_uid;

  select count(*)::int, coalesce(sum(c.monto), 0), max(e.nombre)
  into v_cuanto, v_total, v_quien
  from public.comisiones c
  left join public.empresas e on e.id = c.empresa_id
  where c.socio_id = v_socio
    and c.estado <> 'anulada'
    and c.created_at > coalesce(v_desde, '-infinity'::timestamptz);

  if coalesce(v_cuanto, 0) = 0 then
    return jsonb_build_object('hay', false);
  end if;

  return jsonb_build_object(
    'hay', true,
    'cuantos', v_cuanto,
    'total', v_total,
    'negocio', coalesce(v_quien, 'un negocio')
  );
end $fn$;

revoke all on function public.novedad_comisiones() from public, anon;
grant execute on function public.novedad_comisiones() to authenticated;

create or replace function public.marcar_comisiones_vistas()
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  insert into public.preferencias as p (user_id, comisiones_vistas_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set
    comisiones_vistas_at = now(),
    updated_at = now();

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.marcar_comisiones_vistas() from public, anon;
grant execute on function public.marcar_comisiones_vistas() to authenticated;
