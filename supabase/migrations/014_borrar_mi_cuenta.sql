-- ============================================================
-- ORDEN · Migración 014 · Que cada uno pueda borrar su propia cuenta
--
-- No es solo un requisito legal: los datos son de la persona, y una app que
-- no te deja irte es una app que te tiene de rehén. Si alguien quiere borrar
-- todo, tiene que poder hacerlo solo, sin escribirle a nadie.
--
-- LA PREGUNTA DIFÍCIL: ¿qué pasa con el negocio?
--
--   · Si sos el ÚNICO en tu empresa → se borra entera. Es tuya y nadie más
--     la usa.
--   · Si sos propietario Y HAY MÁS GENTE ADENTRO → NO se borra nada. Sería
--     dejar sin sistema a personas que están trabajando, y borrarles la
--     contabilidad de su negocio. Se avisa y se pide que primero saque a los
--     demás (o que no se vaya).
--   · Si sos vendedor o admin de la empresa de otro → solo se va tu
--     membresía. La empresa y todo lo que cargaste quedan intactos: esos
--     movimientos son del negocio, no tuyos.
--
-- SE BORRA DE VERDAD. No hay "marcado como borrado": las filas desaparecen y
-- el borrado en cascada se lleva movimientos, productos, comprobantes,
-- suscripción y códigos. Lo único que queda afuera son los ARCHIVOS de
-- Storage, que no entienden de claves foráneas y los borra la ruta que llama
-- a esto (ver src/app/api/cuenta/borrar/route.ts).
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUÉ VA A PASAR SI ME BORRO
--
--    Se lo pide la pantalla ANTES de mostrar el botón, para que nadie
--    confirme sin saber qué está por perder. Es de solo lectura: no borra
--    nada, solo cuenta.
-- ------------------------------------------------------------
create or replace function public.resumen_borrado_cuenta()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid  uuid := auth.uid();
  v_res  jsonb;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  with mias as (
    select
      e.id,
      e.nombre,
      m.rol,
      (select count(*)::int from public.miembros mm where mm.empresa_id = e.id) as gente,
      (select count(*)::int from public.movimientos mv where mv.empresa_id = e.id) as movimientos
    from public.miembros m
    join public.empresas e on e.id = m.empresa_id
    where m.user_id = v_uid
  )
  select jsonb_build_object(
    -- Empresas que desaparecen: soy propietario y estoy solo.
    'se_borran', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', nombre, 'movimientos', movimientos))
      from mias where rol = 'propietario' and gente = 1
    ), '[]'::jsonb),
    -- Empresas de las que solo me voy.
    'me_voy_de', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', nombre))
      from mias where rol <> 'propietario'
    ), '[]'::jsonb),
    -- Lo que bloquea: soy propietario y hay más gente adentro.
    'bloqueadas', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', nombre, 'gente', gente))
      from mias where rol = 'propietario' and gente > 1
    ), '[]'::jsonb),
    'movimientos_que_se_pierden', coalesce((
      select sum(movimientos)::int from mias where rol = 'propietario' and gente = 1
    ), 0)
  ) into v_res;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 2. LAS RUTAS DE LOS ARCHIVOS QUE HAY QUE LIMPIAR
--
--    Storage no tiene claves foráneas: borrar la empresa se lleva las filas
--    de `adjuntos`, pero los archivos quedan ocupando lugar para siempre.
--    Esta función devuelve qué borrar, y la ruta lo hace ANTES de borrar los
--    datos (después ya no habría cómo saber cuáles eran).
-- ------------------------------------------------------------
create or replace function public.archivos_a_borrar(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(a.ruta), '[]'::jsonb) into v_res
  from public.adjuntos a
  where a.ruta is not null
    and a.empresa_id in (
      select m.empresa_id
      from public.miembros m
      where m.user_id = p_user
        and m.rol = 'propietario'
        and (select count(*) from public.miembros mm where mm.empresa_id = m.empresa_id) = 1
    );

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 3. BORRAR
--
--    Solo `service_role`: la llama la ruta del servidor después de comprobar
--    la sesión. No se le otorga a `authenticated` a propósito — un borrado
--    irreversible no se dispara desde el navegador sin que el servidor haya
--    verificado quién es y que confirmó.
--
--    Devuelve qué se hizo, para poder registrarlo.
-- ------------------------------------------------------------
create or replace function public.borrar_datos_de_usuario(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_bloqueadas int;
  v_borradas   int := 0;
  v_salidas    int := 0;
begin
  if p_user is null then
    raise exception 'Falta el usuario.' using errcode = '22023';
  end if;

  -- Si es propietario de una empresa con más gente, no se toca NADA.
  -- Se comprueba de nuevo acá y no solo en la pantalla: entre que alguien
  -- confirma y se ejecuta esto, pudo entrar un vendedor con el código.
  select count(*) into v_bloqueadas
  from public.miembros m
  where m.user_id = p_user
    and m.rol = 'propietario'
    and (select count(*) from public.miembros mm where mm.empresa_id = m.empresa_id) > 1;

  if v_bloqueadas > 0 then
    raise exception 'Todavía hay gente trabajando en % de tus negocios. Sacalos del equipo antes de borrar tu cuenta.', v_bloqueadas
      using errcode = '54000';
  end if;

  -- Empresas donde estoy solo: se van enteras. El cascade se lleva
  -- movimientos, items, productos, adjuntos, retos, suscripción y accesos.
  with a_borrar as (
    select m.empresa_id
    from public.miembros m
    where m.user_id = p_user and m.rol = 'propietario'
  ), borradas as (
    delete from public.empresas e
    where e.id in (select empresa_id from a_borrar)
    returning 1
  )
  select count(*) into v_borradas from borradas;

  -- De las demás, solo me voy.
  with salidas as (
    delete from public.miembros m where m.user_id = p_user returning 1
  )
  select count(*) into v_salidas from salidas;

  -- Lo que es de la persona y no del negocio.
  delete from public.preferencias      where user_id = p_user;
  delete from public.push_dispositivos where user_id = p_user;
  delete from public.cierres           where user_id = p_user;

  return jsonb_build_object(
    'empresas_borradas', v_borradas,
    'membresias_cerradas', v_salidas
  );
end $fn$;

revoke all on function public.resumen_borrado_cuenta()          from public, anon;
revoke all on function public.archivos_a_borrar(uuid)           from public, anon, authenticated;
revoke all on function public.borrar_datos_de_usuario(uuid)     from public, anon, authenticated;

grant execute on function public.resumen_borrado_cuenta()       to authenticated;
grant execute on function public.archivos_a_borrar(uuid)        to service_role;
grant execute on function public.borrar_datos_de_usuario(uuid)  to service_role;

-- El borrado necesita poder eliminar filas de estas tablas desde el cron/API.
grant delete on public.empresas          to service_role;
grant delete on public.miembros          to service_role;
grant delete on public.preferencias      to service_role;
grant delete on public.push_dispositivos to service_role;
grant delete on public.cierres           to service_role;

-- ============================================================
-- EMPEZAR DE CERO
--
-- Distinto de borrar la cuenta: acá la persona SE QUEDA. Vacía el negocio
-- para arrancar limpio —después de probar el sistema, después de un año
-- cerrado, después de cargar todo mal la primera vez.
--
-- Es la única puerta por la que un movimiento se borra de verdad. La policy
-- `movimientos_delete` no existe justamente para que no se pueda: lo normal
-- es ANULAR, que deja el rastro. Vaciar es otra cosa y por eso pide escribir
-- el nombre del negocio: nadie lo hace sin querer.
--
-- QUÉ SE VA: movimientos (y con ellos sus líneas y comprobantes), productos,
-- retos y los cierres marcados.
--
-- QUÉ SE QUEDA: la empresa, el equipo, la suscripción y el código de
-- invitación. Y el CONSUMO DE IA DEL MES, a propósito: si vaciar reseteara
-- el contador, sería una forma de tener capturas gratis infinitas vaciando
-- el negocio cada vez que se acaban.
-- ============================================================
create or replace function public.vaciar_empresa(p_empresa uuid, p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre     text;
  v_rutas      jsonb;
  v_movs       int := 0;
  v_prods      int := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  -- Solo el propietario. Un administrador maneja el día a día, pero borrar
  -- la historia entera del negocio es decisión del dueño.
  if not exists (
    select 1 from public.miembros
    where empresa_id = p_empresa and user_id = auth.uid() and rol = 'propietario'
  ) then
    raise exception 'Solo el propietario puede vaciar el negocio.' using errcode = '42501';
  end if;

  select nombre into v_nombre from public.empresas where id = p_empresa;
  if v_nombre is null then
    raise exception 'Esa empresa no existe.' using errcode = 'P0002';
  end if;

  -- La confirmación es escribir el nombre exacto. Un "¿estás seguro?" se
  -- toca sin leer; esto no.
  if trim(coalesce(p_confirmacion, '')) is distinct from v_nombre then
    raise exception 'Para vaciar el negocio hay que escribir su nombre exacto: %', v_nombre
      using errcode = '22023';
  end if;

  -- Las rutas de los archivos ANTES de borrar: después no hay forma de
  -- saber cuáles eran, y quedarían ocupando storage para siempre.
  select coalesce(jsonb_agg(a.ruta), '[]'::jsonb) into v_rutas
  from public.adjuntos a where a.empresa_id = p_empresa and a.ruta is not null;

  -- Los movimientos primero: arrastran líneas y comprobantes.
  with borrados as (
    delete from public.movimientos where empresa_id = p_empresa returning 1
  )
  select count(*) into v_movs from borrados;

  with borrados as (
    delete from public.productos where empresa_id = p_empresa returning 1
  )
  select count(*) into v_prods from borrados;

  delete from public.retos   where empresa_id = p_empresa;
  delete from public.cierres where empresa_id = p_empresa;

  return jsonb_build_object(
    'movimientos', v_movs,
    'productos', v_prods,
    -- Que las borre quien llamó: la policy de storage ya le da permiso
    -- sobre la carpeta de su empresa.
    'archivos', v_rutas
  );
end $fn$;

revoke all on function public.vaciar_empresa(uuid, text) from public, anon;
grant execute on function public.vaciar_empresa(uuid, text) to authenticated;
