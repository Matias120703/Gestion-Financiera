-- ============================================================
-- 123 · EL PERSONAL A 40.000, LA PRUEBA MÁS LARGA Y EL DESCUENTO DE CADA UNO
-- ============================================================
--
-- Matías (02/10/2026):
--
--   · «El plan personal vamos a bajar el precio, vamos a poner 40.000».
--   · «Vamos a quitar el 18 % en día de prueba, vamos a poner solo 5 % para
--     uso personal. Lo que sería el negocio no vas a tocar».
--   · «Vamos a alargar los días de prueba del negocio: 20 días gratis en vez
--     de 8, y para el uso personal 8 días de prueba en vez de 5».
--
-- LO QUE QUEDA, ENTERO
--
--   · EL PRO PERSONAL: Gs. 40.000 por mes (era 60.000). El año son 11 meses:
--     Gs. 440.000. La referencia en dólares, que se muestra y no se cobra,
--     pasa a US$ 7 y US$ 77. Los precios de un negocio (Básico 110.000, Pro
--     190.000, Premium 250.000) y el de cada persona extra del Premium
--     (60.000, tabla `precios_adicionales`) NO se tocan.
--   · LA PRUEBA: 20 días un negocio, 8 una cuenta personal.
--   · EL DESCUENTO DE LA PRUEBA: se gana cargando TODA la prueba, o sea 20
--     días seguidos un negocio y 8 una cuenta personal. El negocio se lleva
--     18 % en su primer mes, como siempre; la cuenta personal, 5 %.
--   · LA CONSTANCIA (ya paga, 30 días seguidos, 5 %) no cambia.
--
-- CADA NÚMERO VIVE EN UN SOLO LUGAR
--
-- Los precios en `precios`, los porcentajes y los objetivos de la racha en
-- `ajustes_orden`, y los días de prueba en `dias_de_prueba()`. Las pantallas
-- los leen. `ajustes_orden` tiene una sola fila que puede no existir (la crea
-- `definir_empresa_orden`, 019), así que cada número se cambia en tres
-- lugares a la vez, igual que hizo la 093: el valor por defecto de la
-- columna, la fila si existe y la reserva dentro de cada función que lo lee.
-- Así una base nueva y la de producción terminan diciendo lo mismo.
--
-- HASTA ACÁ HABÍA UN SOLO PORCENTAJE PARA TODOS
--
-- `descuento_racha_porcentaje` (078) valía para el negocio y para la cuenta
-- personal. Ahora esa columna es la del negocio y la personal tiene la suya,
-- `descuento_racha_porcentaje_personal`.
--
-- A QUIÉN LE TOCA
--
--   · LAS PRUEBAS QUE YA CORREN SE ESTIRAN, NUNCA SE ACORTAN. Cada cuenta en
--     prueba pasa a tener 20 días (u 8) contados desde que nació su
--     suscripción, solo si eso es más tarde que lo que ya tiene. A quien la
--     administración le había estirado la prueba más allá, no se le toca. Una
--     prueba que venció hace poco y con la cuenta nueva todavía tendría días
--     por delante se reabre; una que igual seguiría vencida queda como está.
--   · LO YA GANADO SE RESPETA. El objetivo de la racha se compara al vuelo,
--     así que subirlo de 8 a 20 le sacaría el «¡Listo! Ganaste 18 %» a quien
--     ya lo tenía en pantalla. Para que no pase, la suscripción de quien ya
--     juntó la racha con las reglas de antes guarda el trato con el que la
--     ganó (`racha_objetivo`, `racha_porcentaje`). En todas las demás esas
--     dos columnas quedan vacías y manda `ajustes_orden`.
--   · QUIEN IBA POR LA MITAD PASA AL OBJETIVO NUEVO. Un negocio en prueba que
--     llevaba 4 de sus 8 días ahora tiene 20 días de prueba y necesita 20
--     seguidos. El objetivo siempre fue la prueba entera (8 de 8, 5 de 5) y
--     sigue siéndolo; lo único que se guarda aparte es lo ya ganado.
--   · EL QUE CAMBIA DE TIPO EN PLENA PRUEBA. Cuando la administración pasa a
--     negocio una cuenta personal que todavía está probando, su prueba pasa a
--     durar lo que dura la de un negocio (punto 8). Sin eso quedaba con 8
--     días de prueba y un objetivo de 20 días seguidos.
--
-- Cada cuenta tocada se lista con un `raise notice`: al aplicar la migración
-- se lee a quién se le respetó el descuento y a quién se le estiró la prueba.
-- Y QUEDA ANOTADA en `registro_admin` (016), sin actor —lo hizo el sistema—,
-- con la fecha en que terminaba antes: el historial de la ficha lo muestra y
-- con eso se puede volver atrás una sola cuenta. El aviso se pierde si quien
-- aplica la migración no lo muestra; el registro no.
--
-- LO QUE NO SE REDEFINE
--
-- `crear_empresa` (102) lee `dias_de_prueba()`: una cuenta nueva nace con los
-- días nuevos sin tocarla. `base_de_comision` y `monto_de_comision` (105)
-- leen `precios`: la comisión del socio por una cuenta personal pasa sola a
-- la mitad de 40.000. `lista_precios`, `estado_cuenta`, `datos_empresa`,
-- `plan_efectivo_calculado`, `extender_prueba`, `pruebas_por_terminar` y el
-- aviso de vencimiento (107) leen lo que acá se cambia, sin números propios.
--
-- Idempotente: aplicada dos veces deja lo mismo.

-- ------------------------------------------------------------
-- 1. EL PRECIO DEL PRO PERSONAL
--
--    Las cuatro filas que sembró la 020. Se actualizan por su clave
--    (tipo de cuenta, plan, moneda y período): ninguna otra fila se toca.
-- ------------------------------------------------------------
update public.precios set importe = 40000
 where tipo_cuenta = 'personal' and plan = 'pro' and moneda = 'PYG' and periodo = 'mensual';
update public.precios set importe = 440000
 where tipo_cuenta = 'personal' and plan = 'pro' and moneda = 'PYG' and periodo = 'anual';
update public.precios set importe = 7
 where tipo_cuenta = 'personal' and plan = 'pro' and moneda = 'USD' and periodo = 'mensual';
update public.precios set importe = 77
 where tipo_cuenta = 'personal' and plan = 'pro' and moneda = 'USD' and periodo = 'anual';

-- ------------------------------------------------------------
-- 2. LOS NÚMEROS DE LA PROMO
--
--    Una columna nueva para el porcentaje de la cuenta personal, con el
--    mismo control que la del negocio (078), y los objetivos nuevos.
-- ------------------------------------------------------------
alter table public.ajustes_orden
  add column if not exists descuento_racha_porcentaje_personal numeric(5,2) not null default 5
    check (descuento_racha_porcentaje_personal >= 0 and descuento_racha_porcentaje_personal <= 100);

alter table public.ajustes_orden
  alter column racha_objetivo_negocio set default 20,
  alter column racha_objetivo_personal set default 8;

update public.ajustes_orden
   set racha_objetivo_negocio = 20,
       racha_objetivo_personal = 8,
       descuento_racha_porcentaje_personal = 5
 where unica;

comment on column public.ajustes_orden.descuento_racha_porcentaje is
  'Cuánto se descuenta del primer mes al NEGOCIO que junta la racha durante la prueba.';
comment on column public.ajustes_orden.descuento_racha_porcentaje_personal is
  'Cuánto se descuenta del primer mes a la CUENTA PERSONAL que junta la racha durante la prueba.';

-- ------------------------------------------------------------
-- 3. LO YA GANADO SE RESPETA
--
--    Dos columnas en la suscripción: el objetivo y el porcentaje con los que
--    esa cuenta ganó su descuento. Vacías en casi todas: mandan los de
--    `ajustes_orden`. Mismo patrón que `tope_vendedores` (048).
--
--    Va ANTES de estirar las pruebas (punto 7): la racha se mira en la
--    ventana de la prueba que la cuenta tenía, con el objetivo de antes
--    (8 días un negocio, 5 una cuenta personal) y el 18 % de antes.
--
--    Corre una sola vez: si la columna ya existe, la migración ya pasó por
--    acá y volver a mirar con el objetivo viejo sería regalar un descuento a
--    quien entró después.
-- ------------------------------------------------------------
do $$
declare
  r         record;
  v_cuantas integer := 0;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'suscripciones'
               and column_name = 'racha_objetivo') then
    raise notice '123 · lo ya ganado: la migración ya había pasado, no se vuelve a mirar';
    return;
  end if;

  alter table public.suscripciones
    add column racha_objetivo integer,
    add column racha_porcentaje numeric(5,2);

  alter table public.suscripciones
    add constraint racha_objetivo_razonable
      check (racha_objetivo is null or racha_objetivo between 1 and 60),
    add constraint racha_porcentaje_razonable
      check (racha_porcentaje is null or (racha_porcentaje >= 0 and racha_porcentaje <= 100));

  for r in
    with pruebas as (
      select s.empresa_id,
             e.nombre,
             coalesce(e.tipo_cuenta, 'emprendedor') as tipo,
             (s.created_at at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date as desde,
             least((now() at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date,
                   (coalesce(s.prueba_fin, now()) at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date) as hasta
      from public.suscripciones s
      join public.empresas e on e.id = s.empresa_id
      where s.estado = 'prueba'
    ),
    dias as (
      select p.empresa_id, d.fecha
      from pruebas p
      cross join lateral public.dias_cargados(p.empresa_id, p.hasta) d(fecha)
      where d.fecha >= p.desde
    ),
    numeradas as (
      select empresa_id, fecha,
             (fecha - (row_number() over (partition by empresa_id order by fecha))::int) as isla
      from dias
    ),
    mejores as (
      select empresa_id, max(largo) as mejor
      from (select empresa_id, count(*)::int as largo from numeradas group by empresa_id, isla) x
      group by empresa_id
    )
    select p.empresa_id, p.nombre, p.tipo, m.mejor,
           case when p.tipo = 'personal' then 5 else 8 end as objetivo_de_antes
    from pruebas p
    join mejores m on m.empresa_id = p.empresa_id
    where m.mejor >= case when p.tipo = 'personal' then 5 else 8 end
    order by p.nombre
  loop
    update public.suscripciones
       set racha_objetivo = r.objetivo_de_antes,
           racha_porcentaje = 18
     where empresa_id = r.empresa_id;
    -- Queda en el registro de la cuenta (016): el historial de la ficha lo
    -- muestra, hecho por el sistema.
    insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
    values (null, r.empresa_id, 'descuento_conservado_123', jsonb_build_object(
      'tipo_cuenta', r.tipo,
      'racha_objetivo', r.objetivo_de_antes,
      'racha_porcentaje', 18,
      'mejor', r.mejor,
      'nota', 'Migración 123: ya había juntado su racha con las reglas de antes ('
              || r.objetivo_de_antes || ' días seguidos) y conserva su 18 % del primer mes.'
    ));
    v_cuantas := v_cuantas + 1;
    raise notice '123 · conserva su 18 %%: % (%), % · juntó % días seguidos de los % de antes',
      r.nombre, r.empresa_id, r.tipo, r.mejor, r.objetivo_de_antes;
  end loop;

  raise notice '123 · cuentas en prueba que ya habían ganado el descuento: %', v_cuantas;
end $$;

comment on column public.suscripciones.racha_objetivo is
  'Días seguidos con los que ESTA cuenta ganó el descuento de la prueba. Vacío: el de ajustes_orden.';
comment on column public.suscripciones.racha_porcentaje is
  'Porcentaje del descuento de la prueba que ESTA cuenta ya ganó. Vacío: el de ajustes_orden.';

-- ------------------------------------------------------------
-- 4. LOS DÍAS DE PRUEBA
--
--    Copia exacta de la versión viva (049), con los dos números nuevos.
--    La llama `crear_empresa` (102) una vez, al nacer la cuenta.
-- ------------------------------------------------------------
create or replace function public.dias_de_prueba(p_tipo text)
returns integer language sql immutable set search_path = public as $fn$
  select case coalesce(p_tipo, 'emprendedor')
    -- Quien anota sus gastos personales sabe en pocos días si le sirve:
    -- lo usa todos los días desde el primero.
    -- 123: 5 → 8.
    when 'personal' then 8
    -- Un comercio necesita ver un pedazo de semana suyo —los días flojos y
    -- los buenos— antes de poder decidir.
    -- 123: 8 → 20.
    else 20
  end;
$fn$;

grant execute on function public.dias_de_prueba(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. LO QUE MUESTRA LA PÁGINA DE INICIO
--
--    Copia exacta de la versión viva (093). Cambia: una clave nueva con el
--    porcentaje de la cuenta personal, y las reservas de los dos objetivos.
--    `porcentaje` sigue siendo el del negocio.
-- ------------------------------------------------------------
create or replace function public.promo_de_la_prueba()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'porcentaje',            coalesce((select descuento_racha_porcentaje from public.ajustes_orden where unica), 18),
    -- 123: el de la cuenta personal, aparte.
    'porcentaje_personal',   coalesce((select descuento_racha_porcentaje_personal from public.ajustes_orden where unica), 5),
    -- 123: reservas 8 → 20 y 5 → 8.
    'negocio',               coalesce((select racha_objetivo_negocio    from public.ajustes_orden where unica), 20),
    'personal',              coalesce((select racha_objetivo_personal   from public.ajustes_orden where unica), 8),
    'constancia_porcentaje', coalesce((select descuento_constancia_porcentaje from public.ajustes_orden where unica), 5),
    'constancia_dias',       coalesce((select racha_objetivo_constancia       from public.ajustes_orden where unica), 30)
  );
$fn$;

-- ------------------------------------------------------------
-- 6. EL DESCUENTO QUE CORRESPONDE HOY
--
--    Copia exacta de la versión viva (093). Cambia, en la fase de prueba:
--    el porcentaje sale según el tipo de cuenta, las reservas de los
--    objetivos son las nuevas, y si la suscripción guarda el trato con el
--    que ya ganó su descuento (punto 3), manda ese. La constancia, las
--    fases y cómo se cuenta la racha quedan igual.
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
    -- 123: reservas 8 → 20, y la cuenta personal con sus números (antes
    -- esta rama le contestaba los del negocio a cualquiera).
    if v_tipo = 'personal' then
      return jsonb_build_object(
        'fase', 'prueba', 'objetivo', coalesce(v_ajustes.racha_objetivo_personal, 8),
        'mejor', 0, 'faltan', coalesce(v_ajustes.racha_objetivo_personal, 8),
        'logrado', false, 'porcentaje', coalesce(v_ajustes.descuento_racha_porcentaje_personal, 5),
        'vigente', false);
    end if;
    return jsonb_build_object(
      'fase', 'prueba', 'objetivo', coalesce(v_ajustes.racha_objetivo_negocio, 20),
      'mejor', 0, 'faltan', coalesce(v_ajustes.racha_objetivo_negocio, 20),
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
    -- 123: el porcentaje es el de su tipo de cuenta (la personal tiene el
    -- suyo), salvo que la suscripción guarde el que ya ganó.
    v_pct      := coalesce(
      v_sus.racha_porcentaje,
      case when v_tipo = 'personal'
           then coalesce(v_ajustes.descuento_racha_porcentaje_personal, 5)
           else coalesce(v_ajustes.descuento_racha_porcentaje, 18) end);
    -- 123: lo mismo con el objetivo, y las reservas pasan de 5 y 8 a 8 y 20.
    v_objetivo := coalesce(
      v_sus.racha_objetivo,
      case when v_tipo = 'personal' then v_ajustes.racha_objetivo_personal
           else v_ajustes.racha_objetivo_negocio end,
      case when v_tipo = 'personal' then 8 else 20 end);

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

-- ------------------------------------------------------------
-- 7. LAS PRUEBAS QUE YA CORREN SE ESTIRAN, NUNCA SE ACORTAN
--
--    `dias_de_prueba()` se consulta una sola vez, al crear la cuenta: cambiar
--    la función no mueve a quien ya está probando. Por eso este paso.
--
--    La fecha nueva es el nacimiento de la suscripción más los días de su
--    tipo de cuenta. Se escribe SOLO si es más tarde que el `periodo_fin` y
--    el `prueba_fin` que la cuenta ya tiene (a nadie se le saca un día) y
--    además cae en el futuro (una prueba que igual seguiría vencida no se
--    toca). Solo suscripciones en estado 'prueba': quien paga queda igual.
--
--    Cada cuenta tocada queda en `registro_admin` con la fecha de antes
--    (`vence_antes`, `prueba_fin_antes`) y la nueva (`vence_despues`), igual
--    que `extender_prueba` (016), y con `reabierta` en true si su prueba ya
--    había terminado. Va con un nombre propio y no como 'extender_prueba'
--    para que «Deshacer el último cambio» (022) no aparezca por esto.
-- ------------------------------------------------------------
do $$
declare
  r         record;
  v_cuantas integer := 0;
begin
  for r in
    select s.empresa_id,
           e.nombre,
           coalesce(e.tipo_cuenta, 'emprendedor') as tipo,
           s.periodo_fin as antes,
           s.prueba_fin  as prueba_antes,
           public.dias_de_prueba(coalesce(e.tipo_cuenta, 'emprendedor')) as dias,
           s.created_at
             + make_interval(days => public.dias_de_prueba(coalesce(e.tipo_cuenta, 'emprendedor'))) as fin
    from public.suscripciones s
    join public.empresas e on e.id = s.empresa_id
    where s.estado = 'prueba'
      and s.created_at
            + make_interval(days => public.dias_de_prueba(coalesce(e.tipo_cuenta, 'emprendedor')))
          > greatest(coalesce(s.periodo_fin, '-infinity'::timestamptz),
                     coalesce(s.prueba_fin,  '-infinity'::timestamptz),
                     now())
    order by s.created_at
  loop
    update public.suscripciones
       set prueba_fin  = r.fin,
           periodo_fin = r.fin,
           updated_at  = now()
     where empresa_id = r.empresa_id;
    insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
    values (null, r.empresa_id, 'prueba_estirada_123', jsonb_build_object(
      'tipo_cuenta', r.tipo,
      'dias', r.dias,
      'vence_antes', r.antes,
      'prueba_fin_antes', r.prueba_antes,
      'vence_despues', r.fin,
      'reabierta', coalesce(r.antes <= now(), false),
      'nota', 'Migración 123: la prueba pasó a durar ' || r.dias || ' días desde que nació la cuenta'
              || case when coalesce(r.antes <= now(), false)
                      then ' (ya había terminado: se reabrió).' else '.' end
    ));
    v_cuantas := v_cuantas + 1;
    raise notice '123 · prueba estirada: % (%), % · terminaba el %, ahora el %',
      r.nombre, r.empresa_id, r.tipo,
      coalesce(to_char(r.antes at time zone 'America/Asuncion', 'DD/MM/YYYY HH24:MI'), 'sin fecha'),
      to_char(r.fin at time zone 'America/Asuncion', 'DD/MM/YYYY HH24:MI');
  end loop;

  raise notice '123 · pruebas estiradas: %', v_cuantas;
end $$;

-- ------------------------------------------------------------
-- 8. CAMBIAR EL TIPO DE CUENTA EN PLENA PRUEBA
--
--    Copia exacta de la versión viva (016). Cambia una sola cosa: si la
--    cuenta todavía está probando, su prueba pasa a durar lo que dura la del
--    tipo nuevo, contada desde que nació la suscripción, y solo si eso es
--    más tarde que lo que ya tiene.
--
--    Por qué: la prueba la escribe `crear_empresa` una vez, con los días del
--    tipo con el que la cuenta nació. Quien se registró como personal y a los
--    tres días abrió un local quedaba como negocio con 8 días de prueba y un
--    objetivo de 20 días seguidos —que no entra en 9 fechas—, mientras la
--    portada y los Términos le prometen 20 días a un negocio.
--
--    Nunca acorta: de negocio a personal conserva sus 20 días. Y no reabre
--    una prueba que ya terminó ni toca a quien paga: para eso están «Dar
--    unos días más» y «Activar» en la ficha. Así una personal en Gratis que
--    pasa a negocio sigue quedando con el candado (110).
-- ------------------------------------------------------------
create or replace function public.cambiar_tipo_cuenta(
  p_empresa uuid,
  p_tipo    text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes text;
  -- 123: la suscripción como estaba y, si se estira, hasta cuándo.
  v_sus   public.suscripciones;
  v_fin   timestamptz;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  if p_tipo not in ('personal', 'emprendedor') then
    raise exception 'Tipo de cuenta desconocido: %', p_tipo using errcode = '22023';
  end if;

  select tipo_cuenta into v_antes from public.empresas where id = p_empresa;
  if v_antes is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  update public.empresas set tipo_cuenta = p_tipo where id = p_empresa;

  -- 123: la prueba que todavía corre pasa a ser la del tipo nuevo, si es más
  -- larga. Misma cuenta que el punto 7: el nacimiento de la suscripción más
  -- los días de su tipo.
  select * into v_sus from public.suscripciones where empresa_id = p_empresa;
  if v_antes is distinct from p_tipo
     and v_sus.estado = 'prueba'
     and v_sus.periodo_fin > now() then
    v_fin := v_sus.created_at + make_interval(days => public.dias_de_prueba(p_tipo));
    if v_fin > greatest(v_sus.periodo_fin, coalesce(v_sus.prueba_fin, '-infinity'::timestamptz)) then
      update public.suscripciones
         set prueba_fin  = v_fin,
             periodo_fin = v_fin,
             updated_at  = now()
       where empresa_id = p_empresa;
    else
      v_fin := null;
    end if;
  end if;

  -- 123: si se movió el vencimiento, el registro guarda de dónde a dónde.
  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'cambiar_tipo', jsonb_build_object(
    'antes', v_antes, 'despues', p_tipo
  ) || case when v_fin is null then '{}'::jsonb else jsonb_build_object(
    'vence_antes', v_sus.periodo_fin, 'prueba_fin_antes', v_sus.prueba_fin, 'vence_despues', v_fin
  ) end);

  return jsonb_build_object('tipo_cuenta', p_tipo);
end $fn$;

revoke all on function public.cambiar_tipo_cuenta(uuid, text) from public, anon;
grant execute on function public.cambiar_tipo_cuenta(uuid, text) to authenticated;
