-- ============================================================
-- 130 · CAMBIAR DE PLAN CON DÍAS PAGOS, POR BANCARD
-- ============================================================
--
-- Matías (07/10/2026): «Me suscribí al plan Básico. Si la persona quiere
-- cambiar al Pro o al Premium me lleva al WhatsApp. ¿No hay una forma de que
-- se pueda pagar con tarjeta o con QR?»
--
-- Hasta acá la base frenaba todo cambio de plan con días pagos («Tu plan
-- actual está pago hasta el …, escribinos», 125): no existía cómo cobrar un
-- plan contra otro. Desde acá:
--
--   · SUBIR de plan se paga en el momento (tarjeta, QR o la tarjeta
--     guardada): la diferencia entre los dos planes por los días que faltan.
--     Es un tipo de operación nuevo, 'cambio'.
--   · BAJAR de plan no cobra nada: queda programado para la próxima
--     renovación (`bancard_cuentas.plan_proximo`), igual que la baja de
--     personas que ya existía.
--
-- LAS CINCO DECISIONES (Matías todavía no las confirmó: cada una vive en un
-- solo lugar, marcado «DECISIÓN n» en el código de más abajo)
--
--   1. LA REGLA. Subir: se paga hoy la diferencia de lista por los días que
--      faltan y la fecha de renovación NO cambia. Bajar: rige desde la
--      próxima renovación, sin devolución. La cuenta está en
--      `prorrateo_de_plan`; que la fecha no se mueve, en la rama 'cambio' de
--      `bancard_confirmar`; la baja, en `bancard_programar_plan`.
--   2. LA DIFERENCIA VA SIN DESCUENTO (lista contra lista). El descuento
--      vuelve entero en la renovación. Una línea de `prorrateo_de_plan`.
--   3. UN CAMBIO NO LE PAGA NI LE GASTA LA COMISIÓN AL SOCIO: la rama
--      'cambio' de `bancard_confirmar` no pasa por `aplicar_suscripcion`.
--   4. NO SE PUEDE PAGAR UN PLAN CON MENOS LUGARES QUE EL EQUIPO DE HOY, ni
--      dejando vencer: vale para TODO pago de plan por Bancard, no solo para
--      el cambio. Una función, `pago_de_plan_exige_lugar`.
--   5. LOS DÍAS DE PRUEBA QUE QUEDAN POR DELANTE NO SE COBRAN; los pagos se
--      cobran todos (decidida por Claude, en contra del tope que proponía el
--      diseño: el tope le regalaba hasta 21 días a quien renovaba antes de
--      subir). El freno de siempre queda para quien tiene más de dos
--      períodos pagos por delante. Un bloque de `prorrateo_de_plan`.
--
-- SE APLICA ANTES QUE EL CÓDIGO, Y CON EL CÓDIGO PUBLICADO NO CAMBIA NADA
--
-- Ninguna función cambia de firma ni pierde una clave. Todo lo nuevo se
-- activa solo con `p_tipo = 'cambio'` o con `plan_proximo` escrito, y el
-- código publicado no puede hacer ninguna de las dos cosas (rechaza un tipo
-- que no conoce, y no existe la ruta que programa un plan). Con
-- `plan_proximo` vacío, `bancard_plan_de_renovacion` devuelve el plan de la
-- cuenta y todo lo que la lee da lo de hoy.
--
-- LA EXCEPCIÓN, A PROPÓSITO, ES LA DECISIÓN 4. Le cambia algo SOLO a una
-- cuenta cuyo equipo (las filas de `miembros`) es más grande que los lugares
-- del plan que se paga: Básico 1, Pro 3. El Premium no entra: ya se validaba
-- por cantidad de personas. A esa cuenta:
--
--   a. Un pago de plan a mano (formulario, QR o la tarjeta guardada) que
--      antes creaba la operación, ahora contesta «Tu equipo tiene N personas
--      y el plan X admite hasta M. Achicá el equipo o elegí un plan donde
--      entren todos.» y no crea nada.
--   b. El cobro automático que antes salía, ahora no crea la operación: el
--      débito queda pausado con ese texto y la tarea le avisa a la
--      administración (el camino de «no se pudo cotizar» que ya existía).
--   c. Un pago creado ANTES de aplicar esto (o con gente que entró entre
--      crear y confirmar) se activa igual que hoy, y además queda «para
--      revisar»: 'Pagó un plan con menos lugares que las personas de su
--      equipo'.
--   d. Si además tiene una tarjeta guardada con el débito al día, deja de
--      anunciarse el cobro que (b) no va a hacer: en su fila del aviso de
--      vencimiento `debito` va null (el aviso publicado dice entonces que
--      pague, en vez de «se cobra solo de tu tarjeta»), y en
--      `bancard_estado` `debito.fecha_cobro` va null (la pantalla publicada
--      no muestra «Próximo cobro»). La pregunta la contesta una función,
--      `bancard_renovacion_frenada`, que le pregunta a la misma decisión 4:
--      apagada la decisión, esto también se apaga.
--
-- Hoy esas cuentas son las que la administración activó a mano con más
-- gente que lugares (`cambiar_plan_cuenta` no mira el equipo). Antes de
-- aplicar conviene contarlas (solo lee):
--
--   select e.nombre, s.plan, s.estado, s.periodo_fin, c.debito_activo,
--          (select count(*) from miembros m where m.empresa_id = e.id) as equipo
--   from suscripciones s
--   join empresas e on e.id = s.empresa_id
--   left join bancard_cuentas c on c.empresa_id = e.id
--   where s.plan in ('basico', 'pro')
--     and coalesce(e.tipo_cuenta, 'emprendedor') <> 'personal'
--     and (select count(*) from miembros m where m.empresa_id = e.id)
--         > (limites_plan(s.plan)->>'miembros')::int;
--
-- Y se suman claves que el código publicado no lee: `plan_proximo`,
-- `plan_proximo_pagable` y `miembros` en `bancard_estado`; `plan_antes` en
-- la respuesta de `bancard_confirmar`; `personas_de_mas` en la de
-- `bancard_revertir` y en su renglón; `plan_renovacion` y
-- `precio_renovacion` en cada fila de `vencimientos_por_avisar` (donde
-- `plan` y `precio` siguen siendo los de HOY); `plan_proximo` y `conflicto`
-- en la foto `antes` de una operación (y `debito`, solo en la foto de un
-- 'cambio').
--
-- SI HAY QUE VOLVER ATRÁS
--
--   · Apagar la decisión 4 sola: `create or replace` de
--     `pago_de_plan_exige_lugar` con `return;` como primera línea del cuerpo.
--     Se apagan con ella (a), (b) y (d).
--   · Volver al código anterior dejando la 130 aplicada: se puede, pero
--     ANTES hay que avisar a las cuentas con `bancard_cuentas.plan_proximo`
--     escrito y vaciarlo. La pantalla vieja no muestra esa baja ni deja
--     deshacerla, y la base la sigue cobrando y topando el equipo.
--   · Sacar la 130: NO alcanza con volver a aplicar la 125 y la 126. No dan
--     error y no vuelven atrás: quedan las funciones nuevas, la restricción
--     con 'cambio' y las bajas escritas, y a quien programó una baja la
--     tarea le cobra el plan alto después de haberle anunciado el bajo. Hace
--     falta un SQL propio (las doce funciones con su texto anterior, fuera
--     las nuevas, la columna y las restricciones), que se niega si queda un
--     pedido 'cambio' o una baja programada.
--
-- LAS DOCE FUNCIONES QUE SE VUELVEN A DEFINIR
--
-- Cada una es la copia de su última versión (la 125, o la 126 para
-- `vencimientos_por_avisar`) y cambia solo lo necesario. Cada línea nueva o
-- cambiada lleva la marca «(130)». `pruebas/cambiar-plan.test.js` compara
-- función por función: sin las líneas marcadas, lo que queda es la versión
-- anterior, salvo las pocas líneas reemplazadas que esa prueba lista una por
-- una.
--
-- MENSAJES NUEVOS (con su portugués en src/lib/mensajes-base.ts)
--
--   · «Tu equipo tiene % personas y el plan % admite hasta %. Achicá el
--     equipo o elegí un plan donde entren todos.»
--   · «Hay un pago en curso. Esperá a que se confirme y probá de nuevo.»
--
-- El de la guarda («Falta aplicar la 124, la 125 y la 126 antes que la
-- 130: …») es solo para quien aplica la migración.
--
-- Idempotente: la guarda, `add column if not exists`, las restricciones se
-- sacan antes de ponerlas, todo lo demás reemplaza lo que hay, y los
-- permisos se revocan y se dan de nuevo. Sin una sola barra invertida.
-- ============================================================

-- ------------------------------------------------------------
-- 0. LA GUARDA: SIN LA 124, LA 125 Y LA 126 NO SE TOCA NADA
--
--    Varias de las de abajo son plpgsql: se crearían sin error aunque no
--    existiera nada de Bancard, y `tope_de_miembros` y
--    `vencimientos_por_avisar` las usan TODAS las cuentas.
-- ------------------------------------------------------------
do $guarda$
declare
  v_falta text := '';
begin
  if to_regclass('public.bancard_cuentas') is null then
    v_falta := v_falta || ' la tabla bancard_cuentas (124);';
  end if;
  if to_regclass('public.bancard_operaciones') is null then
    v_falta := v_falta || ' la tabla bancard_operaciones (124);';
  end if;
  if to_regprocedure('public.precio_de_la_cuenta(uuid,text,text,integer)') is null then
    v_falta := v_falta || ' precio_de_la_cuenta (124);';
  end if;
  if to_regprocedure('public.bancard_confirmar(bigint,jsonb,text)') is null then
    v_falta := v_falta || ' bancard_confirmar (125);';
  end if;
  -- Lo último que crea la 125: si está, la 125 terminó entera.
  if to_regprocedure('public.bancard_baja_caduca()') is null then
    v_falta := v_falta || ' bancard_baja_caduca (el final de la 125);';
  end if;
  -- La 126 no crea nada con nombre nuevo: se la reconoce porque su aviso de
  -- vencimiento ya nombra el importe de la renovación.
  if not exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'vencimientos_por_avisar'
      and position('bancard_importe_de_renovacion' in p.prosrc) > 0
  ) then
    v_falta := v_falta || ' el aviso de vencimiento que sabe de Bancard (126);';
  end if;
  if v_falta <> '' then
    raise exception 'Falta aplicar la 124, la 125 y la 126 antes que la 130: no existe%', v_falta;
  end if;
end $guarda$;

-- ------------------------------------------------------------
-- 1. LAS TABLAS
-- ------------------------------------------------------------

-- «Bajar de plan desde la próxima renovación». Como `personas_proxima`.
alter table public.bancard_cuentas add column if not exists plan_proximo text;

comment on column public.bancard_cuentas.plan_proximo is
  'El plan más bajo que la cuenta programó para su próxima renovación (130). Null = nada programado. Lo borra solo el disparador bancard_baja_caduca cuando la suscripción cambia.';

-- El Premium nunca es el destino de una baja.
alter table public.bancard_cuentas drop constraint if exists bancard_cuentas_plan_proximo_check;
alter table public.bancard_cuentas add constraint bancard_cuentas_plan_proximo_check
  check (plan_proximo in ('basico', 'pro'));

-- Una sola cosa programada por vez: o menos personas, o un plan más bajo.
alter table public.bancard_cuentas drop constraint if exists bancard_cuentas_una_sola_baja;
alter table public.bancard_cuentas add constraint bancard_cuentas_una_sola_baja
  check (plan_proximo is null or personas_proxima is null);

-- El tipo de operación nuevo. La restricción de `tipo` de la 124 no tiene
-- nombre propio (se lo puso PostgreSQL), así que no se confía en ninguno: se
-- busca en el catálogo toda restricción `check` que mire SOLO esa columna y
-- se la saca por el nombre que tenga. Si se sacara por un nombre adivinado y
-- en producción se llamara distinto, quedarían dos y todo 'cambio' fallaría.
do $tipo$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.bancard_operaciones'::regclass
      and c.contype = 'c'
      and c.conkey = array[(
        select a.attnum from pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'tipo' and not a.attisdropped)]
  loop
    execute format('alter table public.bancard_operaciones drop constraint %I', r.conname);
  end loop;
end $tipo$;

alter table public.bancard_operaciones add constraint bancard_operaciones_tipo_check
  check (tipo in ('plan', 'personas', 'cambio'));

-- ------------------------------------------------------------
-- 2. LOS NÚMEROS Y LAS REGLAS, CADA UNO EN UN SOLO LUGAR
--
--    Ninguna lleva el prefijo `bancard_` salvo las que son `security
--    definer`: `pruebas/bancard-base.test.js` lista por nombre las que no.
-- ------------------------------------------------------------

-- El orden de los planes: «subir» y «bajar» es por este número, no por el
-- precio (los precios viven en una tabla y pueden cambiar).
create or replace function public.nivel_de_plan(p_plan text)
returns integer language sql immutable set search_path = public as $fn$
  select case p_plan when 'basico' then 1 when 'pro' then 2 when 'negocio' then 3 else 0 end;
$fn$;

-- Cómo se le dice a cada plan en un mensaje.
create or replace function public.nombre_de_plan(p_plan text)
returns text language sql immutable set search_path = public as $fn$
  select case p_plan
    when 'basico' then 'Básico' when 'pro' then 'Pro' when 'negocio' then 'Premium'
    else coalesce(p_plan, '') end;
$fn$;

-- Cuántos días de calendario antes del vencimiento se puede pagar A MANO el
-- plan que se programó. Son los días del primer aviso de vencimiento. Antes
-- de eso no: el plan baja cuando entra el pago, y pagar con 200 días por
-- delante le sacaría a la persona 200 días del plan alto que ya pagó.
create or replace function public.dias_para_adelantar_la_baja()
returns integer language sql immutable set search_path = public as $fn$
  select 3;
$fn$;

-- Cuántas personas entran en un plan: en el Premium, las que se pagan; en
-- los demás, lo que dice el plan (Básico 1, Pro 3).
create or replace function public.lugares_del_plan(p_plan text, p_personas integer)
returns integer language sql immutable set search_path = public as $fn$
  select case
    when p_plan = 'negocio' and p_personas is not null then p_personas
    else (public.limites_plan(p_plan)->>'miembros')::integer
  end;
$fn$;

-- El equipo de hoy tiene que entrar en el plan. No se echa a nadie: se dice
-- qué hacer. La usan la baja programada (siempre) y el pago (decisión 4).
create or replace function public.exigir_lugar_para_el_equipo(p_empresa uuid, p_plan text, p_personas integer)
returns void language plpgsql stable security definer set search_path = public as $fn$
declare
  v_miembros integer;
  v_lugares  integer := public.lugares_del_plan(p_plan, p_personas);
begin
  select count(*)::int into v_miembros from public.miembros m where m.empresa_id = p_empresa;

  if v_miembros > v_lugares then
    raise exception 'Tu equipo tiene % personas y el plan % admite hasta %. Achicá el equipo o elegí un plan donde entren todos.',
      v_miembros, public.nombre_de_plan(p_plan), v_lugares using errcode = '22023';
  end if;
end $fn$;

-- DECISIÓN 4 (un solo lugar). No se puede pagar por Bancard un plan con
-- menos lugares que el equipo que la cuenta tiene hoy. Cierra esto: un
-- Premium de 15 personas dejaba vencer, pagaba el Básico y seguía con las 15
-- adentro por Gs. 110.000 (el tope se mira solo cuando alguien ENTRA al
-- equipo). Vale para todo pago de plan: el de siempre, el cambio y el cobro
-- automático.
--
-- Para apagarla: que la primera línea del cuerpo sea `return;`. Para que no
-- frene el cobro automático: `if p_origen = 'automatico' then return; end if;`.
-- Lo que se le anuncia a la persona (el aviso de vencimiento y «Próximo
-- cobro») sale de preguntarle a esta misma función
-- (`bancard_renovacion_frenada`): cambia sola con cualquiera de las dos.
create or replace function public.pago_de_plan_exige_lugar(
  p_empresa  uuid,
  p_plan     text,
  p_personas integer,
  p_origen   text
)
returns void language plpgsql stable security definer set search_path = public as $fn$
begin
  perform public.exigir_lugar_para_el_equipo(p_empresa, p_plan, p_personas);
end $fn$;

revoke all on function public.nivel_de_plan(text) from public, anon, authenticated, service_role;
revoke all on function public.nombre_de_plan(text) from public, anon, authenticated, service_role;
revoke all on function public.dias_para_adelantar_la_baja() from public, anon, authenticated, service_role;
revoke all on function public.lugares_del_plan(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.exigir_lugar_para_el_equipo(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.pago_de_plan_exige_lugar(uuid, text, integer, text) from public, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3. QUÉ PLAN SE COBRA EN LA PRÓXIMA RENOVACIÓN
--
--    El programado, si la cuenta tiene el plan activo y programó uno más
--    bajo; si no, el que tiene. La leen todos los que cobran o anuncian la
--    renovación. Con `plan_proximo` vacío devuelve `suscripciones.plan`: lo
--    de siempre. Cerrada a todos: la llaman otras funciones definer.
-- ------------------------------------------------------------
create or replace function public.bancard_plan_de_renovacion(p_empresa uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select case
    when s.estado = 'activa' and c.plan_proximo is not null
         and public.nivel_de_plan(c.plan_proximo) > 0
         and public.nivel_de_plan(c.plan_proximo) < public.nivel_de_plan(s.plan)
      then c.plan_proximo
    else s.plan
  end
  from public.suscripciones s
  left join public.bancard_cuentas c on c.empresa_id = s.empresa_id
  where s.empresa_id = p_empresa;
$fn$;

revoke all on function public.bancard_plan_de_renovacion(uuid) from public, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 4. SUBIR DE PLAN: CUÁNTO ES
--
--    La única fuente del importe de un cambio. Sin guarda de sesión y
--    cerrada a todos: la llaman `cotizar_cambio` (la pantalla) y el inicio
--    del pago, que congela su resultado en la operación.
--
--    La cuenta, entera:
--
--      periodo        = el de la CUENTA (mensual si no dice nada)
--      base           = 365 si es anual; si no, 30
--      precio_antes   = lista del plan que tiene, sin descuento
--      precio         = lista del plan nuevo con sus personas, sin descuento
--      diferencia     = precio - precio_antes
--      dias_restantes = los que faltan para el vencimiento (nunca menos de 1)
--      dias_gratis    = los de la PRUEBA que todavía no pasaron
--      dias_pagos     = dias_restantes - dias_gratis
--      dias_cobrados  = dias_pagos (y `base` si son `base` + 1: recién
--                       pagado en un mes de 31 días no paga más que el mes)
--      importe        = diferencia x dias_cobrados / base, al guaraní
--
--    La base es 30 o 365 fija, como en «sumar personas» (124): recién
--    pagado en febrero quedan 28 días y Básico → Pro da 74.667, no 80.000.
--    Se deja así a propósito (una sola forma de contar los días en las dos
--    cuentas); la prueba lo documenta.
-- ------------------------------------------------------------
create or replace function public.prorrateo_de_plan(
  p_empresa  uuid,
  p_plan     text,
  p_personas integer default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_sus      public.suscripciones;
  v_tipo     text;
  v_zona     text;
  v_periodo  text;
  v_base     integer;
  v_de       jsonb;
  v_a        jsonb;
  v_dif      numeric;
  v_dias     integer;
  v_gratis   integer := 0;
  v_pagos    integer;
  v_cobrados integer;
  v_importe  numeric;
begin
  select coalesce(e.tipo_cuenta, 'emprendedor'), coalesce(e.zona_horaria, 'America/Asuncion')
  into v_tipo, v_zona
  from public.empresas e where e.id = p_empresa;
  select * into v_sus from public.suscripciones where empresa_id = p_empresa;

  if v_tipo is null or v_sus.empresa_id is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  -- Un negocio con un plan pago, activo y vigente, hacia un plan MÁS ALTO.
  -- En prueba o vencida se paga el plan entero por el camino de siempre;
  -- bajar va por `bancard_programar_plan`; una cuenta personal tiene un solo
  -- plan pago.
  if v_tipo = 'personal' or v_sus.estado is distinct from 'activa'
     or coalesce(v_sus.plan, 'gratis') = 'gratis'
     or v_sus.periodo_fin is null or v_sus.periodo_fin <= now()
     or public.nivel_de_plan(p_plan) <= public.nivel_de_plan(v_sus.plan) then
    raise exception 'Ese pedido de pago no es válido.' using errcode = '22023';
  end if;

  v_periodo := coalesce(v_sus.periodo, 'mensual');
  v_base    := case when v_periodo = 'anual' then 365 else 30 end;

  -- Los dos planes los cotiza la fuente de siempre, que es la que valida el
  -- rubro, el precio cargado y la cantidad de personas, con sus mensajes.
  v_a  := public.precio_de_la_cuenta(p_empresa, p_plan, v_periodo, p_personas);
  v_de := public.precio_de_la_cuenta(p_empresa, v_sus.plan, v_periodo, null);

  -- DECISIÓN 2 (un solo lugar): la diferencia es de LISTA contra LISTA
  -- (`subtotal` = lista + personas extra, sin descuento), las dos de hoy.
  -- Restar «lo que pagó» le cobraría de vuelta el descuento que tuvo. El
  -- descuento vuelve entero en la renovación. Si un día la diferencia
  -- tuviera que llevarlo, es esta línea.
  v_dif := (v_a ->> 'subtotal')::numeric - (v_de ->> 'subtotal')::numeric;

  -- Con los precios de hoy no pasa (el orden de los planes es el de sus
  -- precios), pero los precios viven en una tabla: nunca se cobra cero ni
  -- al revés.
  if v_dif <= 0 then
    raise exception 'Tu plan actual está pago hasta el %. Para cambiar de plan antes de esa fecha escribinos.',
      to_char(v_sus.periodo_fin at time zone v_zona, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  -- Nunca menos de un día: Bancard rechaza un importe de cero.
  v_dias := greatest(1, ceil(extract(epoch from (v_sus.periodo_fin - now())) / 86400)::integer);

  -- DECISIÓN 5 (un solo lugar): QUÉ DÍAS SE COBRAN.
  --
  -- Los días de la PRUEBA que todavía no pasaron son gratis (un pago nunca
  -- se come días: quien pagó con 10 días de prueba por delante quedó con 41,
  -- y `prueba_fin` no lo toca ningún pago). Los días PAGOS se cobran todos:
  -- quien renovó antes y tiene 51 días pagos, paga los 51.
  if v_sus.prueba_fin is not null and v_sus.prueba_fin > now() then
    v_gratis := greatest(0, least(
      v_dias - 1,
      ceil(extract(epoch from (v_sus.prueba_fin - now())) / 86400)::integer));
  end if;
  v_pagos := v_dias - v_gratis;

  -- El freno de siempre queda para quien tiene MÁS DE DOS PERÍODOS pagos
  -- por delante (62 días en el mes, 732 en el año): una cuenta activada por
  -- transferencia por varios meses queda «mensual» con cientos de días, y
  -- eso no se resuelve por acá.
  if v_pagos > 2 * v_base + 2 then
    raise exception 'Tu plan actual está pago hasta el %. Para cambiar de plan antes de esa fecha escribinos.',
      to_char(v_sus.periodo_fin at time zone v_zona, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  -- Recién pagado en un mes de 31 días (o en un año de 366) no paga más que
  -- la diferencia del período entero.
  v_cobrados := case when v_pagos = v_base + 1 then v_base else v_pagos end;

  -- DECISIÓN 1 (la cuenta de subir): la diferencia por los días que faltan.
  v_importe := greatest(1, public.redondeo_de_cobro(v_dif * v_cobrados / v_base));

  return jsonb_build_object(
    'plan_antes',           v_sus.plan,
    'plan',                 p_plan,
    'periodo',              v_periodo,
    'personas',             v_a -> 'personas',
    'personas_min',         v_a -> 'personas_min',
    'personas_max',         v_a -> 'personas_max',
    'personas_incluidas',   v_a -> 'personas_incluidas',
    'precio_por_persona',   v_a -> 'precio_por_persona',
    'miembros',             v_a -> 'miembros',
    'precio_antes',         v_de -> 'subtotal',
    'precio',               v_a -> 'subtotal',
    'diferencia',           v_dif,
    'dias_restantes',       v_dias,
    'dias_gratis',          v_gratis,
    'dias_pagos',           v_pagos,
    'dias_cobrados',        v_cobrados,
    'dias_del_periodo',     v_base,
    'importe',              v_importe,
    'total',                v_importe,
    'moneda',               'PYG',
    -- La fecha de vencimiento, que NO cambia.
    'vence_hasta',          v_sus.periodo_fin,
    -- Lo que cuesta el plan nuevo por período: de lista, y con el descuento
    -- que la cuenta tiene HOY (el mismo número que después muestra «Próximo
    -- cobro»). Sin descuento, las dos son iguales.
    'renovacion',           v_a -> 'subtotal',
    'renovacion_hoy',       v_a -> 'total',
    'descuento_fase',       v_a -> 'descuento_fase',
    'descuento_porcentaje', v_a -> 'descuento_porcentaje'
  );
end $fn$;

revoke all on function public.prorrateo_de_plan(uuid, text, integer) from public, anon, authenticated, service_role;

-- Lo que pide la pantalla: lo mismo, con la guarda de sesión. Y con la
-- decisión 4, para que la hoja no muestre un importe que después el pago no
-- va a aceptar.
create or replace function public.cotizar_cambio(
  p_empresa  uuid,
  p_plan     text,
  p_personas integer default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v jsonb;
begin
  if not public.es_admin(p_empresa) and not public.es_superadmin() then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  v := public.prorrateo_de_plan(p_empresa, p_plan, p_personas);
  perform public.pago_de_plan_exige_lugar(p_empresa, p_plan, p_personas, 'usuario');
  return v;
end $fn$;

revoke all on function public.cotizar_cambio(uuid, text, integer) from public, anon, service_role;
grant execute on function public.cotizar_cambio(uuid, text, integer) to authenticated;

-- ------------------------------------------------------------
-- 5. BAJAR DE PLAN: SE PROGRAMA PARA LA PRÓXIMA RENOVACIÓN
--
--    DECISIÓN 1 (la mitad de bajar): no se cobra ni se devuelve nada. El
--    plan actual sigue hasta la renovación; ese cobro ya es por el plan
--    nuevo. `p_plan` null lo deshace.
--
--    Es del servidor, como `bancard_bajar_personas`: la ruta comprueba que
--    la cuenta ve Bancard y pasa quién lo pide; DESHACER lo deja siempre.
--
--    En este orden:
--      1. La persona administra la cuenta.
--      2. No hay un pago en curso, NI PARA PROGRAMAR NI PARA DESHACER. Sin
--         esto, deshacer con la renovación ya iniciada por el plan
--         programado la dejaba «plata anotada, sin renovar», y al otro día
--         el débito cobraba el plan alto: dos cobros por un mes.
--         Cuenta también el formulario RECHAZADO de esa renovación que
--         sigue abierto en Bancard (`bancard_rechazadas_abiertas`, abajo),
--         cuando lo programado se va a borrar o a reemplazar.
--      3. Null: deshace y termina.
--      4. Un negocio con el plan activo y vigente, hacia un plan más bajo.
--      5. El plan es de su rubro y tiene precio (lo dice la fuente del
--         precio, con sus mensajes).
--      6. El equipo de hoy entra en el plan nuevo. No se echa a nadie.
--      7. Queda programado (y se va la baja de personas, si había: una sola
--         cosa por vez), con su renglón en el registro.
--
--    Mientras está programado, el equipo no puede pasar de los lugares del
--    plan nuevo (`tope_de_miembros`): si no, entre programar y renovar el
--    equipo crecería y la renovación quedaría imposible.
-- ------------------------------------------------------------

-- UN FORMULARIO RECHAZADO SIGUE SIENDO PAGABLE. Cuando el banco rechaza un
-- pago por el formulario, la operación queda 'rechazada' (ya no es «un pago
-- en curso»), pero su formulario sigue abierto en Bancard hasta que alguien
-- lo cierra con la reversa: la conciliación a los diez minutos, o el
-- servidor cuando la persona abre otro pago. Es la misma condición que
-- `reemplaza` en `bancard_crear_operacion_interna` (125).
--
-- Importa acá por esto: con el Básico programado, la persona abre la
-- renovación del Básico, el banco la rechaza, toca «Seguir con el Pro» y
-- después paga ese formulario (el QR ya escaneado, otro teléfono). Entraba
-- como «pagó un plan distinto», sin renovar, y al otro día el débito cobraba
-- el Pro: dos cobros por un mes.
--
-- Devuelve los números de esas operaciones (un arreglo, vacío si no hay).
-- Con `p_plan`, solo los pagos de PLAN por ese plan: los que quedarían «sin
-- renovar» si esa baja se borrara. Con `p_entorno`, solo los de ese ambiente
-- (los que ese servidor puede cerrar en Bancard). Solo del servidor.
create or replace function public.bancard_rechazadas_abiertas(p_empresa uuid, p_entorno text, p_plan text)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(o.id order by o.id), '[]'::jsonb)
  from public.bancard_operaciones o
  where o.empresa_id = p_empresa
    and o.estado = 'rechazada' and o.medio = 'formulario' and o.process_id is not null
    and o.created_at > now() - interval '24 hours'
    and (p_entorno is null or o.entorno = p_entorno)
    and (p_plan is null or (o.tipo = 'plan' and o.plan = p_plan));
$fn$;

revoke all on function public.bancard_rechazadas_abiertas(uuid, text, text) from public, anon, authenticated;
grant execute on function public.bancard_rechazadas_abiertas(uuid, text, text) to service_role;

create or replace function public.bancard_programar_plan(p_empresa uuid, p_usuario uuid, p_plan text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_sus   public.suscripciones;
  v_tipo  text;
  v_habia text;
begin
  if not public.bancard_administra(p_empresa, p_usuario) then
    raise exception 'Solo el dueño de la cuenta puede pagar el plan.' using errcode = '42501';
  end if;

  select coalesce(e.tipo_cuenta, 'emprendedor') into v_tipo from public.empresas e where e.id = p_empresa;
  -- Los candados, en el orden en que los toma la confirmación de un pago (la
  -- cuenta de Bancard y después la suscripción): un pago que se confirma en
  -- ese mismo instante espera, o hace esperar, pero nunca se traban los dos.
  -- El de la suscripción es el que toma el inicio de un pago: una cosa a la
  -- vez.
  perform 1 from public.bancard_cuentas c where c.empresa_id = p_empresa for update;
  select * into v_sus from public.suscripciones where empresa_id = p_empresa for update;

  if v_tipo is null or v_sus.empresa_id is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.bancard_operaciones o
    where o.empresa_id = p_empresa and o.estado in ('creada', 'en_3ds', 'incierta')
  ) then
    raise exception 'Hay un pago en curso. Esperá a que se confirme y probá de nuevo.' using errcode = '22023';
  end if;

  select c.plan_proximo into v_habia from public.bancard_cuentas c where c.empresa_id = p_empresa;

  -- Lo programado se va a borrar (deshacer) o a reemplazar (otro plan), y el
  -- formulario RECHAZADO de la renovación por ese plan sigue abierto en
  -- Bancard: también es un pago en curso. Pagado después, entraría «sin
  -- renovar» y el débito cobraría el plan alto. El servidor lo cierra con la
  -- reversa y prueba de nuevo; si no puede, lo cierra la conciliación.
  if v_habia is not null and p_plan is distinct from v_habia
     and public.bancard_rechazadas_abiertas(p_empresa, null, v_habia) <> '[]'::jsonb then
    raise exception 'Hay un pago en curso. Esperá a que se confirme y probá de nuevo.' using errcode = '22023';
  end if;

  -- Deshacer: siempre, también donde programar ya no se puede (la cuenta
  -- venció, o dejó de ver Bancard).
  if p_plan is null then
    update public.bancard_cuentas
    set plan_proximo = null, updated_at = now()
    where empresa_id = p_empresa and plan_proximo is not null;

    if found then
      insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
      values (p_usuario, p_empresa, 'bancard_plan_programado', jsonb_build_object(
        'plan_antes', v_sus.plan, 'plan_proximo', null, 'habia', v_habia, 'via', 'bancard'));
    end if;

    return jsonb_build_object(
      'plan_proximo', null,
      'plan',         v_sus.plan,
      'vence',        v_sus.periodo_fin,
      'importe',      public.bancard_importe_de_renovacion(p_empresa));
  end if;

  if v_tipo = 'personal' or v_sus.estado is distinct from 'activa'
     or v_sus.periodo_fin is null or v_sus.periodo_fin <= now()
     or public.nivel_de_plan(p_plan) < 1
     or public.nivel_de_plan(p_plan) >= public.nivel_de_plan(v_sus.plan) then
    raise exception 'Ese pedido de pago no es válido.' using errcode = '22023';
  end if;

  perform public.precio_de_la_cuenta(p_empresa, p_plan, coalesce(v_sus.periodo, 'mensual'), null);
  perform public.exigir_lugar_para_el_equipo(p_empresa, p_plan, null);

  insert into public.bancard_cuentas (empresa_id, plan_proximo, personas_proxima)
  values (p_empresa, p_plan, null)
  on conflict (empresa_id) do update set
    plan_proximo = excluded.plan_proximo, personas_proxima = null, updated_at = now();

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (p_usuario, p_empresa, 'bancard_plan_programado', jsonb_build_object(
    'plan_antes', v_sus.plan, 'plan_proximo', p_plan, 'habia', v_habia, 'via', 'bancard'));

  return jsonb_build_object(
    'plan_proximo', p_plan,
    'plan',         v_sus.plan,
    'vence',        v_sus.periodo_fin,
    -- Lo que se le va a cobrar la renovación, con el descuento de hoy.
    'importe',      public.bancard_importe_de_renovacion(p_empresa));
end $fn$;

revoke all on function public.bancard_programar_plan(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.bancard_programar_plan(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- 6. LO QUE SE LEE EN EL FORMULARIO DE BANCARD
--
--    Copia exacta de la 125. Cambia: las tres descripciones del cambio de
--    plan. ASCII y hasta 20 caracteres.
-- ------------------------------------------------------------
create or replace function public.bancard_descripcion(p_tipo text, p_plan text)
returns text language sql immutable set search_path = public as $fn$
  select case
    when p_tipo = 'personas' then 'Orden mas personas'
    when p_tipo = 'cambio' and p_plan = 'pro'     then 'Orden cambio Pro'  -- (130)
    when p_tipo = 'cambio' and p_plan = 'negocio' then 'Orden cambio Premium'  -- (130)
    when p_tipo = 'cambio'                        then 'Orden cambio de plan'  -- (130)
    when p_plan = 'basico'   then 'Orden Basico'
    when p_plan = 'negocio'  then 'Orden Premium'
    else 'Orden Pro'
  end;
$fn$;

revoke all on function public.bancard_descripcion(text, text) from public, anon, authenticated;
grant execute on function public.bancard_descripcion(text, text) to service_role;

-- ------------------------------------------------------------
-- 7. LA RENOVACIÓN COBRA EL PLAN PROGRAMADO
--
--    Copias exactas de la 125. Cambia: las dos miran el plan de la
--    renovación en vez del plan de hoy. Sin nada programado dan lo mismo.
-- ------------------------------------------------------------
create or replace function public.bancard_personas_de_renovacion(p_empresa uuid)
returns integer language sql stable security definer set search_path = public as $fn$
  select case
    -- (130) Con una baja de PLAN programada, lo que se renueva no es un Premium:
    -- (130) no lleva cantidad de personas.
    when public.bancard_plan_de_renovacion(e.id) is distinct from s.plan then null  -- (130)
    when s.plan = 'negocio' and coalesce(e.tipo_cuenta, 'emprendedor') <> 'personal' then
      least(
        (public.limites_plan('negocio')->>'miembros')::integer,
        greatest(
          coalesce(c.personas_proxima, s.tope_vendedores + 1, public.personas_incluidas_premium()),
          (select count(*)::int from public.miembros m where m.empresa_id = e.id),
          public.personas_incluidas_premium()))
    else null
  end
  from public.empresas e
  join public.suscripciones s on s.empresa_id = e.id
  left join public.bancard_cuentas c on c.empresa_id = e.id
  where e.id = p_empresa;
$fn$;

create or replace function public.bancard_importe_de_renovacion(p_empresa uuid)
returns numeric language plpgsql stable security definer set search_path = public as $fn$
declare
  v_plan    text;
  v_periodo text;
begin
  select s.plan, coalesce(s.periodo, 'mensual') into v_plan, v_periodo
  from public.suscripciones s where s.empresa_id = p_empresa;

  if v_plan is null or v_plan = 'gratis' then
    return null;
  end if;
  -- (130) Lo que se cobra es el plan de la RENOVACIÓN: el programado, si la
  -- (130) cuenta programó una baja de plan. Sin nada programado es el mismo.
  v_plan := public.bancard_plan_de_renovacion(p_empresa);  -- (130)

  return (public.precio_de_la_cuenta(
    p_empresa, v_plan, v_periodo, public.bancard_personas_de_renovacion(p_empresa)) ->> 'total')::numeric;
exception when others then
  return null;
end $fn$;

revoke all on function public.bancard_personas_de_renovacion(uuid) from public, anon, authenticated;
revoke all on function public.bancard_importe_de_renovacion(uuid) from public, anon, authenticated;

-- ¿EL COBRO AUTOMÁTICO DE ESTA CUENTA SE VA A FRENAR POR LA DECISIÓN 4?
--
-- Si el equipo de hoy no entra en el plan de la renovación, la tarea no crea
-- el cobro: pausa el débito y le avisa a la administración. Entonces nadie
-- puede anunciarle a la persona que «se cobra solo de tu tarjeta»: ni el
-- aviso de vencimiento, ni «Próximo cobro» en /plan. Los dos preguntan acá.
--
-- NO repite la regla: le pregunta a `pago_de_plan_exige_lugar`, con el mismo
-- plan, las mismas personas y el mismo origen ('automatico') con que lo va a
-- llamar la tarea. Si la decisión 4 se apaga, o se decide que no frene el
-- cobro automático, esto contesta «no» solo. Cerrada a todos: la llaman
-- `bancard_estado` y `vencimientos_por_avisar`, que son definer.
create or replace function public.bancard_renovacion_frenada(p_empresa uuid)
returns boolean language plpgsql stable security definer set search_path = public as $fn$
begin
  perform public.pago_de_plan_exige_lugar(
    p_empresa,
    public.bancard_plan_de_renovacion(p_empresa),
    public.bancard_personas_de_renovacion(p_empresa),
    'automatico');
  return false;
exception when invalid_parameter_value then
  -- El errcode de «Tu equipo tiene … personas y el plan … admite hasta …».
  return true;
end $fn$;

revoke all on function public.bancard_renovacion_frenada(uuid) from public, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 8. INICIAR UNA OPERACIÓN
--
--    Copia exacta de la 125. Cambia:
--      · acepta el tipo 'cambio': el plan es el pedido, el período es el de
--        la cuenta (el del pedido se ignora), y el importe sale de
--        `prorrateo_de_plan` (`lista` = el total, sin extras ni descuento);
--      · el freno de un plan distinto con días pagos deja pasar el plan que
--        la cuenta PROGRAMÓ, si lo pide la tarea del débito o faltan pocos
--        días (`dias_para_adelantar_la_baja`);
--      · renovar a mano un Premium que tiene una baja de PLAN programada
--        sigue siendo por la cantidad que tiene;
--      · la decisión 4, justo antes de crear: no cambia el orden de ninguno
--        de los rechazos de antes.
--
--    `bancard_crear_operacion` (la de 8 argumentos, la que llama el
--    servidor) no se toca: solo reenvía el tipo.
-- ------------------------------------------------------------
create or replace function public.bancard_crear_operacion_interna(
  p_empresa  uuid,
  p_usuario  uuid,
  p_entorno  text,
  p_tipo     text,
  p_medio    text,
  p_origen   text,
  p_plan     text,
  p_periodo  text,
  p_personas integer
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_sus       public.suscripciones;
  v_viva      public.bancard_operaciones;
  v_tarjeta   public.bancard_tarjetas;
  v_plan      text;
  v_periodo   text;
  v_zona      text;
  v           jsonb;
  v_lista     numeric := 0;
  v_extras    numeric := 0;
  v_descuento numeric := 0;
  v_importe   numeric;
  v_id        bigint;
  v_desc      text;
  v_programado text;     -- (130) el plan de la baja programada, si la hay
  v_faltan     integer;  -- (130) días de calendario hasta el vencimiento
begin
  if p_entorno is null or p_entorno not in ('staging', 'produccion')
     or p_tipo is null or p_tipo not in ('plan', 'personas', 'cambio')  -- (130)
     or p_medio is null or p_medio not in ('formulario', 'token')
     or p_origen is null or p_origen not in ('usuario', 'automatico') then
    raise exception 'Ese pedido de pago no es válido.' using errcode = '22023';
  end if;

  -- 1. El candado de «una cosa a la vez por cuenta».
  select * into v_sus from public.suscripciones where empresa_id = p_empresa for update;
  if v_sus.empresa_id is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  select coalesce(e.zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas e where e.id = p_empresa;

  -- Sumar personas es sobre el plan y el período que la cuenta ya tiene.
  if p_tipo = 'personas' then
    v_plan    := v_sus.plan;
    v_periodo := coalesce(v_sus.periodo, 'mensual');
  else
    v_plan    := p_plan;
    v_periodo := p_periodo;
  end if;
  -- (130) Un cambio de plan es sobre el período que la cuenta ya tiene: el que
  -- (130) venga en el pedido se ignora (el período no viaja desde el navegador).
  if p_tipo = 'cambio' then  -- (130)
    v_periodo := coalesce(v_sus.periodo, 'mensual');  -- (130)
  end if;  -- (130)
  -- (130) La baja de plan que la cuenta programó (si vale) y cuántos días faltan.
  v_programado := nullif(public.bancard_plan_de_renovacion(p_empresa), v_sus.plan);  -- (130)
  v_faltan := (v_sus.periodo_fin at time zone v_zona)::date - (now() at time zone v_zona)::date;  -- (130)

  -- 3. ¿Hay una operación viva de esta cuenta?
  select * into v_viva
  from public.bancard_operaciones o
  where o.empresa_id = p_empresa and o.estado in ('creada', 'en_3ds', 'incierta')
  limit 1;

  if v_viva.id is not null then
    if v_viva.estado = 'creada' and v_viva.medio = 'formulario' and p_medio = 'formulario'
       and v_viva.process_id is not null
       and v_viva.created_at > now() - interval '10 minutes'
       and v_viva.tipo = p_tipo and v_viva.entorno = p_entorno
       and v_viva.plan is not distinct from v_plan
       and v_viva.periodo is not distinct from v_periodo
       and v_viva.personas is not distinct from p_personas
       and p_usuario is not null and v_viva.usuario_id = p_usuario then
      -- La misma persona pidiendo lo mismo: es la misma operación.
      return jsonb_build_object(
        'operacion',   v_viva.id,
        'importe',     v_viva.importe,
        'moneda',      v_viva.moneda,
        'descripcion', v_viva.descripcion,
        'desglose',    v_viva.desglose,
        'reusada',     true,
        'process_id',  v_viva.process_id);
    end if;
    return jsonb_build_object('viva', v_viva.id, 'estado', v_viva.estado, 'medio', v_viva.medio);
  end if;

  -- 4. Cuánto es.
  if p_tipo = 'plan' then
    -- Cambiar de plan con días pagos no va por Bancard: habría que prorratear
    -- un plan contra otro. Se escribe y lo resuelve la administración.
    if v_sus.estado = 'activa' and v_sus.periodo_fin is not null and v_sus.periodo_fin > now()
       -- (130) …salvo el plan que la cuenta PROGRAMÓ para su renovación: lo cobra
       -- (130) la tarea del débito, o la persona cuando faltan pocos días. Antes
       -- (130) no: el plan baja cuando entra el pago, y perdería días ya pagos.
       and not coalesce(v_plan = v_programado and (  -- (130)
             p_origen = 'automatico' or v_faltan <= public.dias_para_adelantar_la_baja()), false)  -- (130)
       and v_sus.plan <> 'gratis' and v_plan is not null and v_sus.plan <> v_plan then
      raise exception 'Tu plan actual está pago hasta el %. Para cambiar de plan antes de esa fecha escribinos.',
        to_char(v_sus.periodo_fin at time zone v_zona, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    v := public.precio_de_la_cuenta(p_empresa, v_plan, v_periodo, p_personas);

    -- Renovar un Premium vigente es por la cantidad que tiene (o por la baja
    -- que programó). Cambiarla tiene sus dos caminos propios.
    if v_sus.estado = 'activa' and v_sus.plan = 'negocio' and v_plan = 'negocio'
       and v_sus.periodo_fin is not null and v_sus.periodo_fin > now()
       and v_sus.tope_vendedores is not null
       -- (130) Con una baja de PLAN programada, la de arriba contesta null (lo que
       -- (130) se renueva no es un Premium): renovar a mano el Premium que tiene
       -- (130) sigue siendo por lo contratado, y nunca menos que el equipo.
       and p_personas is distinct from coalesce(public.bancard_personas_de_renovacion(p_empresa),  -- (130)
             least((public.limites_plan('negocio')->>'miembros')::integer, greatest(  -- (130)
               v_sus.tope_vendedores + 1, public.personas_incluidas_premium(),  -- (130)
               (select count(*)::int from public.miembros m where m.empresa_id = p_empresa)))) then  -- (130)
      raise exception 'Para cambiar la cantidad de personas usá «Sumar personas» o «Bajar desde la próxima renovación».'
        using errcode = '22023';
    end if;

    v_lista     := (v ->> 'lista')::numeric;
    v_extras    := (v ->> 'extras')::numeric;
    v_descuento := (v ->> 'descuento')::numeric;
  elsif p_tipo = 'cambio' then  -- (130)
    -- (130) SUBIR de plan con días pagos: la diferencia por los días que faltan.
    -- (130) Todo lo que no se puede (bajar, en prueba, vencida, personal) lo
    -- (130) rechaza la misma función que cotiza.
    v := public.prorrateo_de_plan(p_empresa, v_plan, p_personas);  -- (130)
    v_lista := (v ->> 'total')::numeric;  -- (130)
  else
    v := public.prorrateo_de_personas(p_empresa, p_personas);
    v_extras := (v ->> 'total')::numeric;
  end if;
  v_importe := (v ->> 'total')::numeric;

  -- 5. Con tarjeta guardada: que exista, que sea de este entorno y que no
  --    venga de rebotar.
  if p_medio = 'token' then
    select t.* into v_tarjeta
    from public.bancard_cuentas c
    join public.bancard_tarjetas t on t.id = c.tarjeta_id
    where c.empresa_id = p_empresa and t.estado = 'activa' and t.entorno = p_entorno;

    if v_tarjeta.id is null then
      raise exception 'No hay una tarjeta guardada.' using errcode = '22023';
    end if;
    if v_tarjeta.bloqueada_hasta is not null and v_tarjeta.bloqueada_hasta > now() then
      raise exception 'Probaste varias veces con esta tarjeta y fue rechazada. Probá con otra o pagá con QR.'
        using errcode = '22023';
    end if;
    if p_origen = 'usuario' and (
      select count(*) from public.bancard_operaciones o
      where o.tarjeta_id = v_tarjeta.id and o.estado = 'rechazada'
        and o.created_at > now() - interval '24 hours'
    ) >= public.bancard_tope_de_rechazos() then
      raise exception 'Probaste varias veces con esta tarjeta y fue rechazada. Probá con otra o pagá con QR.'
        using errcode = '22023';
    end if;
  end if;

  -- 6. El freno de abuso (a la tarea diaria no le aplica: es una por día).
  if p_origen = 'usuario' and (
    select count(*) from public.bancard_operaciones o
    where o.empresa_id = p_empresa and o.created_at > now() - interval '24 hours'
  ) >= public.bancard_operaciones_por_dia() then
    raise exception 'Demasiados intentos hoy. Probá de nuevo más tarde o escribinos.' using errcode = '22023';
  end if;

  -- (130) DECISIÓN 4: el equipo de hoy tiene que entrar en el plan que se paga.
  -- (130) Va último, cuando todo lo demás ya dijo que sí: no cambia el orden de
  -- (130) ningún rechazo de antes. Sumar personas no pasa por acá.
  if p_tipo in ('plan', 'cambio') then  -- (130)
    perform public.pago_de_plan_exige_lugar(p_empresa, v_plan, p_personas, p_origen);  -- (130)
  end if;  -- (130)
  -- 7. La operación, con todo congelado.
  v_desc := public.bancard_descripcion(p_tipo, v_plan);
  begin
    insert into public.bancard_operaciones (
      empresa_id, usuario_id, entorno, tipo, medio, origen, plan, periodo, personas,
      desglose, lista, extras, descuento, importe, descripcion, tarjeta_id
    ) values (
      p_empresa, p_usuario, p_entorno, p_tipo, p_medio, p_origen, v_plan, v_periodo, p_personas,
      v, v_lista, v_extras, v_descuento, v_importe, v_desc, v_tarjeta.id
    )
    returning id into v_id;
  exception when unique_violation then
    -- La red de abajo del paso 3: alguien creó una viva en el medio.
    select * into v_viva
    from public.bancard_operaciones o
    where o.empresa_id = p_empresa and o.estado in ('creada', 'en_3ds', 'incierta')
    limit 1;
    return jsonb_build_object('viva', v_viva.id, 'estado', v_viva.estado, 'medio', v_viva.medio);
  end;

  -- 8. Lo que el servidor necesita para hablar con Bancard. `reemplaza`:
  --    las rechazadas de formulario de esta cuenta que todavía tienen un
  --    formulario abierto en Bancard; el servidor las cierra con la reversa
  --    (revisión 03/10: una rechazada no puede quedar pagable para siempre).
  return jsonb_build_object(
    'operacion',   v_id,
    'importe',     v_importe,
    'moneda',      'PYG',
    'descripcion', v_desc,
    'desglose',    v,
    'reusada',     false,
    'user_id',     v_tarjeta.pagador_id,
    'card_id',     v_tarjeta.id,
    'reemplaza',   coalesce((
      select jsonb_agg(x.id order by x.id)
      from (
        select o.id from public.bancard_operaciones o
        where o.empresa_id = p_empresa and o.entorno = p_entorno
          and o.estado = 'rechazada' and o.medio = 'formulario' and o.process_id is not null
          and o.created_at > now() - interval '24 hours'
        order by o.id desc
        limit 3
      ) x), '[]'::jsonb));
end $fn$;

revoke all on function public.bancard_crear_operacion_interna(uuid, uuid, text, text, text, text, text, text, integer)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 9. CONFIRMAR
--
--    Copia exacta de la 125. Cambia:
--      · la foto `antes` suma `plan_proximo` y `conflicto` (y, solo en un
--        'cambio', `debito`: cómo estaba el cobro automático);
--      · la regla 6a (un plan distinto del que tiene pago) no aplica al
--        plan que la cuenta programó;
--      · un 'cambio' vale solo sobre la cuenta que se cotizó (6a bis);
--      · la rama nueva que activa un 'cambio': cambia el plan y el tope, y
--        NADA más (ni la fecha, ni el período, ni el importe guardado);
--      · un pago de plan limpia también `plan_proximo`, y deja «para
--        revisar» si el equipo no entra en el plan que pagó;
--      · el renglón de un cambio es `bancard_cambio` (en staging,
--        `bancard_prueba`, como todos), con `meses` 0;
--      · la respuesta suma `plan_antes` (de qué plan viene un cambio).
-- ------------------------------------------------------------
create or replace function public.bancard_confirmar(
  p_operacion bigint,
  p_respuesta jsonb,
  p_fuente    text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_op        public.bancard_operaciones;
  v_sus       public.suscripciones;
  v_cuenta    public.bancard_cuentas;
  v_tarjeta   public.bancard_tarjetas;
  v_resp      jsonb := coalesce(p_respuesta, '{}'::jsonb);
  v_limpia    jsonb;
  v_aprobada  boolean;
  v_codigo    text;
  v_desc      text;
  v_clase     text;
  v_dias      integer[] := public.bancard_dias_de_cobro();
  v_proximo   date;
  v_monto     text;
  v_nombre    text;
  v_tipo      text;
  v_fin       timestamptz;
  v_antes     jsonb;
  v_pagador   bigint;
  v_com_antes uuid;
  v_com       uuid;
  v_orden     uuid;
  v_ingreso   uuid;
  v_revisar   text;
  v_tope      integer;
  v_conflicto boolean := false;
  v_viva      boolean;
  v_base      jsonb;
  v_miembros  integer;
  v_hoy       jsonb;
begin
  if p_fuente is null or p_fuente not in ('confirmacion', 'consulta', 'charge') then
    raise exception 'Ese pedido de pago no es válido.' using errcode = '22023';
  end if;

  -- 1. La operación, bloqueada: el segundo que llegue espera y ve el final.
  select * into v_op from public.bancard_operaciones where id = p_operacion for update;
  if v_op.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'desconocida');
  end if;

  -- 2. ¿Aprobada? `response` S y código 00 (el anexo los lista sin el cero).
  v_limpia   := public.bancard_sanear(v_resp);
  v_codigo   := upper(lpad(coalesce(nullif(trim(v_resp ->> 'response_code'), ''), '??'), 2, '0'));
  v_aprobada := coalesce(v_resp ->> 'response' = 'S', false) and v_codigo = '00';
  v_viva     := v_op.estado in ('creada', 'en_3ds', 'incierta');

  select e.nombre, coalesce(e.tipo_cuenta, 'emprendedor') into v_nombre, v_tipo
  from public.empresas e where e.id = v_op.empresa_id;

  v_base := jsonb_build_object(
    'operacion',   v_op.id,
    'empresa_id',  v_op.empresa_id,
    'nombre',      v_nombre,
    'tipo_cuenta', v_tipo,
    'tipo',        v_op.tipo,
    'plan',        v_op.plan,
    'periodo',     v_op.periodo,
    'personas',    v_op.personas,
    'importe',     v_op.importe,
    'medio',       v_op.medio,
    'origen',      v_op.origen,
    'entorno',     v_op.entorno);
  -- (130) De qué plan viene un cambio de plan, para el aviso y el comprobante.
  -- (130) Null en los demás tipos.
  v_base := v_base || jsonb_build_object('plan_antes', v_op.desglose -> 'plan_antes');  -- (130)

  -- 3. Lo que ya terminó.
  if v_op.estado = 'pagada' then
    return v_base || jsonb_build_object('ok', true, 'ya', true, 'aprobada', true, 'vence', v_op.vence_despues);
  end if;
  if v_op.estado = 'revertida' then
    if v_aprobada then
      update public.bancard_operaciones
      set revisar = 'Aprobación sobre una operación revertida', updated_at = now()
      where id = v_op.id;
    end if;
    return v_base || jsonb_build_object('ok', false, 'motivo', 'revertida');
  end if;
  -- Revisión 03/10: la conciliación mandó la reversa y Bancard la hizo
  -- (RollbackSuccessful: había un pago y lo devolvió). La aprobación de ese
  -- pago, si llega después, no activa nada: la plata ya volvió.
  if v_op.estado = 'vencida' and v_op.motivo = 'RollbackSuccessful' then
    if v_aprobada then
      update public.bancard_operaciones
      set revisar = 'Aprobación sobre un pago que Bancard ya revirtió', updated_at = now()
      where id = v_op.id;
    end if;
    return v_base || jsonb_build_object('ok', false, 'motivo', 'revertida');
  end if;

  -- Una respuesta que no dice ni S ni N no es una respuesta de pago (la del
  -- 3D Secure viene toda vacía): no se toca nada.
  if coalesce(v_resp ->> 'response', '') not in ('S', 'N') then
    return v_base || jsonb_build_object('ok', false, 'motivo', 'sin_respuesta');
  end if;

  -- Orden de los candados: operación, cuenta de Bancard, suscripción.
  select * into v_cuenta from public.bancard_cuentas where empresa_id = v_op.empresa_id for update;
  if v_op.tarjeta_id is not null then
    select * into v_tarjeta from public.bancard_tarjetas where id = v_op.tarjeta_id;
  end if;

  -- 4. NO aprobada.
  if not v_aprobada then
    v_desc  := left(coalesce(v_resp ->> 'response_description', ''), 120);
    v_clase := public.bancard_clase_de_rechazo(v_codigo);

    if v_viva then
      update public.bancard_operaciones
      set estado = 'rechazada', respuesta = v_limpia, fuente = p_fuente, updated_at = now()
      where id = v_op.id;

      if v_op.tarjeta_id is not null then
        update public.bancard_cuentas
        set ultimo_error = nullif(v_desc, ''), ultimo_codigo = left(v_codigo, 4), updated_at = now()
        where empresa_id = v_op.empresa_id and tarjeta_id = v_op.tarjeta_id;

        -- El bloqueo del manual: 7 rechazos en 24 horas o 35 en 30 días.
        if upper(v_desc || ' ' || coalesce(v_resp ->> 'extended_response_description', '')) like '%INHABILITACI%' then
          update public.bancard_tarjetas
          set bloqueada_hasta = now() + interval '30 days'
          where id = v_op.tarjeta_id;
          update public.bancard_cuentas
          set debito_estado = 'pausado', updated_at = now()
          where empresa_id = v_op.empresa_id and tarjeta_id = v_op.tarjeta_id;
        elsif v_op.origen = 'automatico' then
          update public.bancard_cuentas
          set debito_estado = case
                when v_clase = 'tarjeta' or intentos >= array_length(v_dias, 1) then 'pausado'
                else 'reintentando' end,
              updated_at = now()
          where empresa_id = v_op.empresa_id and tarjeta_id = v_op.tarjeta_id;
        end if;
      end if;
    end if;

    select * into v_cuenta from public.bancard_cuentas where empresa_id = v_op.empresa_id;
    if v_op.origen = 'automatico' and v_cuenta.debito_estado = 'reintentando'
       and v_cuenta.ciclo_fin is not null and v_cuenta.intentos < array_length(v_dias, 1) then
      v_proximo := v_cuenta.ciclo_fin + v_dias[v_cuenta.intentos + 1];
    end if;

    return v_base || jsonb_build_object(
      'ok',              true,
      'aprobada',        false,
      'ya',              not v_viva,
      'clase',           v_clase,
      'descripcion',     v_desc,
      'proximo_intento', v_proximo,
      'debito_estado',   v_cuenta.debito_estado,
      -- El vencimiento al que pertenece este intento: el aviso del último
      -- rechazo dice «tu plan vence el …».
      'ciclo_fin',       v_cuenta.ciclo_fin,
      'tarjeta',         case when v_tarjeta.id is null then null
                              else jsonb_build_object('marca', v_tarjeta.marca, 'ultimos4', v_tarjeta.ultimos4) end,
      'destinatarios',   public.bancard_destinatarios(v_op.empresa_id));
  end if;

  -- 5. Aprobada: el importe manda. Se compara como número (Bancard lo manda
  --    como "10100.00", como 10100 o como "1100.0").
  v_monto := coalesce(v_resp ->> 'amount', '');
  if v_monto !~ '^[0-9]+([.][0-9]+)?$'
     or v_monto::numeric <> v_op.importe
     or coalesce(nullif(v_resp ->> 'currency', ''), 'PYG') <> 'PYG' then
    update public.bancard_operaciones
    set estado = case when v_viva then 'incierta' else estado end,
        revisar = 'Bancard confirmó otro importe o moneda',
        updated_at = now()
    where id = v_op.id;
    return v_base || jsonb_build_object('ok', false, 'motivo', 'importe');
  end if;

  -- 6. La suscripción, bloqueada, y su foto de antes (para poder revertir).
  select * into v_sus from public.suscripciones where empresa_id = v_op.empresa_id for update;
  if v_sus.empresa_id is null then
    update public.bancard_operaciones
    set revisar = 'Pago aprobado de una cuenta sin suscripción', updated_at = now()
    where id = v_op.id;
    return v_base || jsonb_build_object('ok', false, 'motivo', 'sin_suscripcion');
  end if;

  v_antes := jsonb_build_object(
    'plan',              v_sus.plan,
    'estado',            v_sus.estado,
    'periodo',           v_sus.periodo,
    'periodo_inicio',    v_sus.periodo_inicio,
    'periodo_fin',       v_sus.periodo_fin,
    'tope_vendedores',   v_sus.tope_vendedores,
    'moneda',            v_sus.moneda,
    'importe',           v_sus.importe,
    'proveedor_pago',    v_sus.proveedor_pago,
    'cancela_al_vencer', v_sus.cancela_al_vencer,
    'personas_proxima',  v_cuenta.personas_proxima);
  -- (130) La baja de PLAN programada también entra en la foto.
  v_antes := v_antes || jsonb_build_object('plan_proximo', v_cuenta.plan_proximo);  -- (130)
  -- (130) Y en un CAMBIO de plan, cómo estaba el débito antes de este pago: el
  -- (130) paso 9 lo destraba con cualquier pago, y la reversa de un cambio no lo
  -- (130) pausa. Sin esto, un débito que estaba pausado quedaba al día después de
  -- (130) revertir, y la tarea le cobraba sola la renovación.
  if v_op.tipo = 'cambio' then  -- (130)
    v_antes := v_antes || jsonb_build_object('debito', jsonb_build_object(  -- (130)
      'estado',        v_cuenta.debito_estado,  -- (130)
      'intentos',      v_cuenta.intentos,  -- (130)
      'ciclo_fin',     v_cuenta.ciclo_fin,  -- (130)
      'ultimo_error',  v_cuenta.ultimo_error,  -- (130)
      'ultimo_codigo', v_cuenta.ultimo_codigo,  -- (130)
      'tarjeta_id',    v_cuenta.tarjeta_id));  -- (130)
  end if;  -- (130)

  if v_op.estado = 'vencida' then
    v_revisar := 'Pago que entró tarde, sobre una operación ya vencida';
  elsif v_op.estado = 'rechazada' and exists (
    select 1 from public.bancard_operaciones o
    where o.empresa_id = v_op.empresa_id and o.id > v_op.id
  ) then
    -- Un reintento adentro del mismo formulario no tiene otra operación
    -- después; si la hay, la persona se fue y volvió a un formulario viejo.
    v_revisar := 'Pagó una operación rechazada después de iniciar otra';
  end if;

  -- 6a. Un plan distinto del que tiene activo y pago. Solo puede pasar con
  --     una confirmación fuera de orden (un pago viejo que entra después de
  --     que la cuenta pagó otro plan). Nunca se le baja el plan a nadie en
  --     silencio: la plata se anota y lo mira una persona.
  if v_op.tipo = 'plan' and v_sus.estado = 'activa' and v_sus.periodo_fin is not null
     -- (130) …salvo que sea el plan que la cuenta programó para su renovación.
     -- (130) Sin nada programado esta línea repite la última de la condición.
     and v_op.plan is distinct from public.bancard_plan_de_renovacion(v_op.empresa_id)  -- (130)
     and v_sus.periodo_fin > now() and v_sus.plan <> 'gratis' and v_sus.plan <> v_op.plan then
    v_conflicto := true;
    v_revisar := 'Pagó un plan distinto del que tiene activo: resolver a mano';
  end if;
  -- (130) 6a bis. Un CAMBIO de plan vale solo sobre la cuenta que se cotizó:
  -- (130)     activa y vigente, con el mismo plan de origen y el mismo
  -- (130)     vencimiento. Si en el medio renovó, venció o cambió de plan, la
  -- (130)     plata se anota, el plan no se toca y lo mira una persona. Se
  -- (130)     comprueba SIEMPRE, también con la operación viva.
  if v_op.tipo = 'cambio' and not coalesce(  -- (130)
       v_sus.estado = 'activa' and v_sus.periodo_fin > now()  -- (130)
       and v_sus.plan = v_op.desglose ->> 'plan_antes'  -- (130)
       and v_sus.periodo_fin = nullif(v_op.desglose ->> 'vence_hasta', '')::timestamptz, false) then  -- (130)
    v_conflicto := true;  -- (130)
    v_revisar := 'Pagó un cambio de plan y la cuenta ya no está como cuando se cotizó: resolver a mano';  -- (130)
  end if;  -- (130)

  -- 6b. Revisión 03/10: lo que ya no estaba vivo se vuelve a cotizar. Una
  --     operación rechazada o vencida se cotizó en otro momento: si hoy vale
  --     más, o pertenece a un período que ya se renovó, no activa nada.
  if not v_viva and not v_conflicto then
    if v_op.tipo = 'plan' then
      begin
        v_hoy := public.precio_de_la_cuenta(v_op.empresa_id, v_op.plan, v_op.periodo, v_op.personas);
        -- Revisión 07/10: «con el descuento del primer pago» solo si la
        -- operación de verdad lo usó. Toda primera operación lleva
        -- `primer_pago`, tenga o no descuento: una sin descuento que hoy
        -- vale lo mismo no es un conflicto (sigue al chequeo de precio y
        -- activa, con su «para revisar» de pago tardío).
        if coalesce((v_op.desglose ->> 'primer_pago')::boolean, false)
           and v_op.descuento > 0
           and v_op.desglose ->> 'descuento_fase' = 'prueba'
           and public.cuenta_ya_pago(v_op.empresa_id) then
          v_conflicto := true;
          v_revisar := 'Pagó una operación vieja con el descuento del primer pago: resolver a mano';
        elsif (v_hoy ->> 'subtotal')::numeric > v_op.lista + v_op.extras then
          v_conflicto := true;
          v_revisar := 'Pagó una operación vieja por menos de lo que vale hoy: resolver a mano';
        end if;
      exception when others then
        v_conflicto := true;
        v_revisar := left('Pagó una operación vieja que hoy no se puede cotizar: ' || sqlerrm, 200);
      end;
    elsif coalesce(nullif(v_op.desglose ->> 'vence_hasta', '')::timestamptz, v_sus.periodo_fin)
          is distinct from v_sus.periodo_fin then
      v_conflicto := true;
      v_revisar := 'Sumó personas sobre un período ya renovado: resolver a mano';
    end if;
  end if;

  -- 7. Activar.
  if v_conflicto then
    -- La plata se anota (paso 8), el plan no se toca.
    v_fin  := v_sus.periodo_fin;
    v_tope := v_sus.tope_vendedores;
  elsif v_op.tipo = 'plan' then
    begin
      -- La regla de cambiar_plan_cuenta (103): «nunca se le comen días»,
      -- tampoco los de la prueba. El año son 12 meses de servicio.
      v_fin := greatest(coalesce(v_sus.periodo_fin, now()), now())
               + make_interval(months => case when v_op.periodo = 'anual' then 12 else 1 end);

      select p.id into v_pagador
      from public.bancard_pagadores p
      where p.empresa_id = v_op.empresa_id and p.entorno = v_op.entorno;

      select c.id into v_com_antes from public.comisiones c where c.empresa_id = v_op.empresa_id;

      -- Con importe null no hay comisión (104): un pago de staging no le
      -- paga nada al socio.
      perform public.aplicar_suscripcion(
        v_op.empresa_id, v_op.plan, 'activa', now(), v_fin, 'bancard', v_pagador::text, null,
        v_op.periodo, 'PYG', case when v_op.entorno = 'produccion' then v_op.importe else null end);

      -- «Solo por lo pagado»: el Premium queda con las personas que se
      -- cobraron. Los demás planes, con lo que dice su plan.
      if v_op.plan = 'negocio' and v_tipo <> 'personal' then
        v_tope := coalesce(v_op.personas, public.personas_incluidas_premium()) - 1;
        -- Un pago fuera de orden por menos gente de la contratada no le saca
        -- personas a un Premium vigente (salvo que sea la baja que programó).
        if v_sus.estado = 'activa' and v_sus.plan = 'negocio'
           and v_sus.periodo_fin is not null and v_sus.periodo_fin > now()
           and v_sus.tope_vendedores is not null and v_tope < v_sus.tope_vendedores
           and v_cuenta.personas_proxima is distinct from v_op.personas then
          v_tope := v_sus.tope_vendedores;
          v_revisar := 'Pagó por menos personas de las que tiene contratadas';
        end if;
        -- Revisión 03/10: el equipo se cuenta al confirmar, no solo al
        -- crear. Si entre una cosa y la otra entró gente por encima de lo
        -- pagado, el tope queda en lo pagado y lo mira una persona.
        select count(*)::int into v_miembros from public.miembros m where m.empresa_id = v_op.empresa_id;
        if v_miembros > v_tope + 1 then
          v_revisar := 'Pagó por menos personas de las que hoy tiene el equipo';
        end if;
      else
        v_tope := null;
        -- (130) DECISIÓN 4, del lado de la confirmación. Al crear el pago ya se
        -- (130) comprobó que el equipo entra; si igual hay gente de más (un pago
        -- (130) creado antes de esa regla, o gente que entró en el medio), el
        -- (130) plan se activa como siempre y lo mira una persona.
        select count(*)::int into v_miembros from public.miembros m where m.empresa_id = v_op.empresa_id;  -- (130)
        if v_miembros > public.lugares_del_plan(v_op.plan, null) then  -- (130)
          v_revisar := coalesce(v_revisar, 'Pagó un plan con menos lugares que las personas de su equipo');  -- (130)
        end if;  -- (130)
      end if;

      update public.suscripciones
      set tope_vendedores = v_tope, updated_at = now()
      where empresa_id = v_op.empresa_id;

      update public.bancard_cuentas
      set personas_proxima = null, updated_at = now()
      where empresa_id = v_op.empresa_id and personas_proxima is not null;
      -- (130) Y la baja de PLAN programada: esta renovación la aplicó, o la
      -- (130) reemplazó. El disparador ya la borró al cambiar la fecha; esto es
      -- (130) la segunda red.
      update public.bancard_cuentas  -- (130)
      set plan_proximo = null, updated_at = now()  -- (130)
      where empresa_id = v_op.empresa_id and plan_proximo is not null;  -- (130)
    end;
  elsif v_op.tipo = 'cambio' then  -- (130)
    -- (130) SUBIR DE PLAN.
    -- (130) DECISIÓN 1: la fecha de renovación NO cambia. Se paga la diferencia
    -- (130) por los días que faltan y el plan nuevo vale desde este momento.
    v_fin := v_sus.periodo_fin;  -- (130)
    -- (130) «Solo por lo pagado»: el Premium queda con las personas que eligió.
    if v_op.plan = 'negocio' and v_tipo <> 'personal' then  -- (130)
      v_tope := coalesce(v_op.personas, public.personas_incluidas_premium()) - 1;  -- (130)
    else  -- (130)
      v_tope := null;  -- (130)
    end if;  -- (130)
    -- (130) El equipo se cuenta al confirmar, no solo al crear (como arriba).
    select count(*)::int into v_miembros from public.miembros m where m.empresa_id = v_op.empresa_id;  -- (130)
    if v_miembros > public.lugares_del_plan(v_op.plan, v_op.personas) then  -- (130)
      v_revisar := coalesce(v_revisar, 'Cambió a un plan con menos lugares que las personas de su equipo');  -- (130)
    end if;  -- (130)
    -- (130) DECISIÓN 3: NO pasa por `aplicar_suscripcion`. No nace ni se gasta
    -- (130) la comisión del socio (es una sola por negocio y sale con un pago
    -- (130) de plan entero), y no se pisan `periodo_inicio`, `periodo`,
    -- (130) `importe`, `proveedor_pago` ni `estado`. Se escriben el plan y el
    -- (130) tope, y nada más.
    update public.suscripciones  -- (130)
    set plan = v_op.plan, tope_vendedores = v_tope, updated_at = now()  -- (130)
    where empresa_id = v_op.empresa_id;  -- (130)
    perform set_config('orden.suscripcion_confiable', '1', true);  -- (130)
    update public.empresas set plan = v_op.plan where id = v_op.empresa_id;  -- (130)
    perform set_config('orden.suscripcion_confiable', '0', true);  -- (130)
    -- (130) Lo que estaba programado se cancela: pagó por tener este plan. El
    -- (130) disparador ya lo borró al cambiar el plan; esto es la segunda red.
    update public.bancard_cuentas  -- (130)
    set personas_proxima = null, plan_proximo = null, updated_at = now()  -- (130)
    where empresa_id = v_op.empresa_id  -- (130)
      and (personas_proxima is not null or plan_proximo is not null);  -- (130)
  else
    -- Sumar personas: no toca fechas ni el plan.
    v_fin := v_sus.periodo_fin;
    if v_sus.plan = 'negocio' then
      v_tope := greatest(coalesce(v_sus.tope_vendedores, 0), v_op.personas - 1);
      update public.suscripciones
      set tope_vendedores = v_tope, updated_at = now()
      where empresa_id = v_op.empresa_id;
      -- Revisión 03/10: pagó por tener esta cantidad «y queda para las
      -- renovaciones»: una baja programada a menos personas se cancela.
      update public.bancard_cuentas
      set personas_proxima = null, updated_at = now()
      where empresa_id = v_op.empresa_id
        and personas_proxima is not null and personas_proxima < v_op.personas;
    else
      v_conflicto := true;
      v_tope := v_sus.tope_vendedores;
      v_revisar := 'Pagó por sumar personas y la cuenta ya no es Premium: resolver a mano';
    end if;
  end if;

  -- 8. La contabilidad. Solo la plata de verdad.
  if v_op.entorno = 'produccion' then
    -- a. El ingreso de Orden (como cambiar_plan_cuenta, 103). Si falla, el
    --    plan queda activo igual: no se pierde un pago por la contabilidad.
    select a.empresa_id into v_orden from public.ajustes_orden a where a.unica;
    if v_orden is not null and v_orden <> v_op.empresa_id then
      begin
        insert into public.movimientos (
          empresa_id, tipo, estado, fecha, descripcion, categoria,
          subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por
        ) values (
          v_orden, 'ingreso', 'activo', public.hoy_empresa(v_orden),
          'Suscripción ' || coalesce(v_nombre, 'cliente') || ' · Bancard ' || v_op.id, 'Suscripciones',
          v_op.importe, 0, v_op.importe, 0, 'tarjeta',
          left(coalesce(v_nombre, ''), 80), null
        )
        returning id into v_ingreso;
      exception when others then
        v_revisar := left('El ingreso no se pudo anotar: ' || sqlerrm, 200);
      end;
    end if;

    -- b. Si la comisión nació en ESTA llamada, se ata a su ingreso: así, si
    --    el ingreso se anula, la comisión se cae sola (060).
    if v_op.tipo = 'plan' and not v_conflicto and v_com_antes is null then
      select c.id into v_com from public.comisiones c where c.empresa_id = v_op.empresa_id;
      if v_com is not null and v_ingreso is not null then
        begin
          update public.comisiones set movimiento_id = v_ingreso where id = v_com;
        exception when others then
          v_revisar := left('La comisión no se pudo atar a su ingreso: ' || sqlerrm, 200);
        end;
      end if;
    end if;
  end if;

  -- c. El renglón del registro. En producción es 'cambiar_plan' con su
  --    importe: lo que miran `cuenta_ya_pago`, `usar_codigo_referido` (063)
  --    y `asignar_referido` (103). En staging tiene otro nombre y no cuenta.
  if not v_conflicto then
    insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
    values (null, v_op.empresa_id,
      case
        when v_op.entorno <> 'produccion' then 'bancard_prueba'
        when v_op.tipo = 'plan' then 'cambiar_plan'
        when v_op.tipo = 'cambio' then 'bancard_cambio'  -- (130)
        else 'bancard_personas'
      end,
      jsonb_build_object(
        'plan_antes',     v_sus.plan,
        'plan_despues',   case when v_op.tipo in ('plan', 'cambio') then v_op.plan else v_sus.plan end,  -- (130)
        'estado_antes',   v_sus.estado,
        'estado_despues', case when v_op.tipo = 'plan' then 'activa' else v_sus.estado end,
        'vence_antes',    v_sus.periodo_fin,
        'vence_despues',  v_fin,
        'meses',          case when v_op.tipo <> 'plan' then 0 when v_op.periodo = 'anual' then 12 else 1 end,
        'importe',        v_op.importe,
        'tope_antes',     v_sus.tope_vendedores,
        'tope_despues',   v_tope,
        'ingreso_id',     v_ingreso,
        'nota',           'Bancard · pedido ' || v_op.id,
        'via',            'bancard',
        'tipo',           v_op.tipo,
        'operacion',      v_op.id));
  end if;

  -- 9. Pagar por cualquier medio destraba un débito pausado.
  update public.bancard_cuentas c
  set debito_estado = 'al_dia', intentos = 0, ciclo_fin = null,
      ultimo_error = null, ultimo_codigo = null, updated_at = now()
  where c.empresa_id = v_op.empresa_id
    and exists (
      select 1 from public.bancard_tarjetas t
      where t.id = c.tarjeta_id and t.estado = 'activa' and t.entorno = v_op.entorno);

  -- (130) La foto dice si este pago quedó en conflicto (no tocó la cuenta):
  -- (130) `bancard_revertir` lo necesita para saber contra qué plan comparar.
  v_antes := v_antes || jsonb_build_object('conflicto', v_conflicto);  -- (130)
  -- 10. Listo.
  update public.bancard_operaciones
  set estado = 'pagada', confirmada_at = now(), fuente = p_fuente, respuesta = v_limpia,
      antes = v_antes, vence_despues = v_fin, ingreso_id = v_ingreso, comision_id = v_com,
      revisar = coalesce(v_revisar, revisar), updated_at = now()
  where id = v_op.id;

  -- 11. Lo que hace falta para avisar.
  return v_base || jsonb_build_object(
    'ok',            true,
    'aprobada',      true,
    'ya',            false,
    'vence',         v_fin,
    'conflicto',     v_conflicto,
    'revisar',       v_revisar,
    'tarjeta',       case when v_tarjeta.id is null then null
                          else jsonb_build_object('marca', v_tarjeta.marca, 'ultimos4', v_tarjeta.ultimos4) end,
    'comision',      (
      select jsonb_build_object(
        'id', c.id, 'socio_user_id', so.user_id, 'monto', c.monto, 'nombre', so.nombre)
      from public.comisiones c
      join public.socios so on so.id = c.socio_id
      where c.id = v_com),
    'destinatarios', public.bancard_destinatarios(v_op.empresa_id));
end $fn$;

revoke all on function public.bancard_confirmar(bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.bancard_confirmar(bigint, jsonb, text) to service_role;

-- ------------------------------------------------------------
-- 10. REVERTIR
--
--     Copia exacta de la 125. Cambia, para un 'cambio':
--       · «tiene que ser lo último»: que no se haya renovado después y que
--         el plan siga siendo el que dejó ese pago;
--       · un cambio que quedó EN CONFLICTO (plata anotada, plan sin tocar)
--         se puede devolver SIEMPRE, también después de que la cuenta pagó
--         otra cosa: no tocó la suscripción, así que no pasa por «lo
--         último», no repone ninguna foto ni lo programado, y solo anula el
--         ingreso, marca la operación y deja su renglón;
--       · NO pausa el débito: el cambio no movió la fecha, y la próxima
--         renovación tiene que salir sola, por el plan de antes. Lo deja
--         COMO ESTABA: si antes de ese pago estaba pausado, vuelve a
--         estarlo, con su motivo;
--       · su renglón (`bancard_cambio`) entra en las dos listas.
--     Y para todos: la baja de plan programada vuelve de la foto en la
--     MISMA sentencia que la de personas (la restricción «una sola baja»
--     se comprueba por sentencia), y la respuesta y el renglón dicen
--     cuánta gente quedó de más (`personas_de_mas`): no se echa a nadie.
-- ------------------------------------------------------------
create or replace function public.bancard_revertir(
  p_operacion      bigint,
  p_actor          uuid,
  p_motivo         text,
  p_solo_comprobar boolean default false,
  p_sin_bancard    boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_op       public.bancard_operaciones;
  v_sus      public.suscripciones;
  v_antes    jsonb;
  v_comision text := null;
  v_estado   text;
  v_anulado  boolean := false;
  v_pausado  boolean := false;
  v_de_mas   integer := 0;  -- (130) personas que no entran en el plan al que vuelve
  v_suelto   boolean := false;  -- (130) un cambio que quedó en conflicto: no tocó la cuenta
begin
  if p_actor is null or not exists (select 1 from public.superadmins s where s.usuario_id = p_actor) then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_op from public.bancard_operaciones where id = p_operacion for update;
  if v_op.id is null then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
  if v_op.estado <> 'pagada' then
    raise exception 'Ese pago no está aprobado, no hay nada que revertir.' using errcode = '22023';
  end if;

  if not coalesce(p_sin_bancard, false)
     and (v_op.confirmada_at at time zone 'America/Asuncion')::date
         <> (now() at time zone 'America/Asuncion')::date then
    raise exception 'Ya pasó el día del pago: se anula por el portal de comercios (Soporte → Anulaciones) y después se marca acá.'
      using errcode = '22023';
  end if;

  -- Tiene que ser lo último que tocó la suscripción: la foto de «antes» es
  -- de un solo paso, y deshacer salteando cambios lleva a un estado que
  -- nunca existió.
  select * into v_sus from public.suscripciones where empresa_id = v_op.empresa_id for update;

  -- (130) UN CAMBIO DE PLAN QUE QUEDÓ EN CONFLICTO no tocó la suscripción: la
  -- (130) plata se anotó y el plan no se movió. No hay nada que proteger con
  -- (130) «tiene que ser lo último», y es el pago que más hay que poder
  -- (130) devolver: la persona quedó con el candado y lo normal es que pague
  -- (130) otra cosa enseguida, o que el débito renueve al otro día. Con esos
  -- (130) chequeos, desde ahí ya no se podía devolver ni marcar nunca más.
  -- (130) Solo para 'cambio': un pago de plan o de personas en conflicto se
  -- (130) revierte como siempre. Las operaciones de antes no traen la clave.
  -- (130) (El «if» de abajo queda con su sangría de la 125 a propósito.)
  v_suelto := v_op.tipo = 'cambio' and coalesce((v_op.antes ->> 'conflicto')::boolean, false);  -- (130)
  if not v_suelto then  -- (130)
  if (v_op.tipo = 'plan' and v_sus.periodo_fin is distinct from v_op.vence_despues)
     -- (130) Un cambio de plan que se aplicó: que no se haya renovado después (la
     -- (130) fecha es la que dejó) y que el plan siga siendo el de ese pago.
     or (v_op.tipo = 'cambio' and (  -- (130)
           v_sus.periodo_fin is distinct from v_op.vence_despues  -- (130)
           or v_sus.plan is distinct from v_op.plan))  -- (130)
     or exists (
       select 1 from public.registro_admin r
       where r.empresa_id = v_op.empresa_id
         and r.accion in ('cambiar_plan', 'extender_prueba', 'bancard_personas', 'bancard_cambio')  -- (130)
         and r.created_at >= v_op.confirmada_at
         and coalesce(r.detalle ->> 'operacion', '') <> v_op.id::text
         and coalesce(r.detalle ->> 'deshecho', 'false') <> 'true')
     or exists (
       select 1 from public.bancard_operaciones o
       where o.empresa_id = v_op.empresa_id and o.id <> v_op.id and o.estado = 'pagada'
         and o.confirmada_at >= v_op.confirmada_at) then
    raise exception 'Después de ese pago hubo otros cambios en la cuenta. Deshacé primero esos.'
      using errcode = '22023';
  end if;
  end if;  -- (130)

  if coalesce(p_solo_comprobar, false) then
    return jsonb_build_object('puede', true);
  end if;

  -- La suscripción vuelve a la foto.
  v_antes := coalesce(v_op.antes, '{}'::jsonb);
  -- (130) …menos en un cambio que quedó en conflicto: no hay foto que reponer,
  -- (130) ni de la suscripción ni de lo programado (reponerla pisaría lo que la
  -- (130) cuenta pagó o programó después). Lo que se contesta y se anota es la
  -- (130) cuenta de HOY, que queda como está.
  if v_suelto then  -- (130)
    v_antes := jsonb_build_object('plan', v_sus.plan, 'estado', v_sus.estado, 'periodo_fin', v_sus.periodo_fin);  -- (130)
  end if;  -- (130)
  if not v_suelto then  -- (130)
  if v_antes ? 'plan' then
    update public.suscripciones
    set plan              = v_antes ->> 'plan',
        estado            = v_antes ->> 'estado',
        periodo           = coalesce(v_antes ->> 'periodo', 'mensual'),
        periodo_inicio    = nullif(v_antes ->> 'periodo_inicio', '')::timestamptz,
        periodo_fin       = nullif(v_antes ->> 'periodo_fin', '')::timestamptz,
        tope_vendedores   = nullif(v_antes ->> 'tope_vendedores', '')::integer,
        moneda            = v_antes ->> 'moneda',
        importe           = nullif(v_antes ->> 'importe', '')::numeric,
        proveedor_pago    = v_antes ->> 'proveedor_pago',
        cancela_al_vencer = coalesce((v_antes ->> 'cancela_al_vencer')::boolean, false),
        updated_at        = now()
    where empresa_id = v_op.empresa_id;

    perform set_config('orden.suscripcion_confiable', '1', true);
    update public.empresas set plan = v_antes ->> 'plan' where id = v_op.empresa_id;
    perform set_config('orden.suscripcion_confiable', '0', true);

    update public.bancard_cuentas
    set personas_proxima = nullif(v_antes ->> 'personas_proxima', '')::integer, updated_at = now()
        -- (130) La baja de plan, en la MISMA sentencia: «una sola baja» se
        -- (130) comprueba por sentencia, y cuando la reversa no mueve la
        -- (130) suscripción el disparador no vació ninguna de las dos.
        , plan_proximo = nullif(v_antes ->> 'plan_proximo', '')  -- (130)
    where empresa_id = v_op.empresa_id;
  end if;
  end if;  -- (130)

  -- Revisión 07/10: revertir un cobro PAUSA el débito. La suscripción vuelve
  -- a la foto (vence mañana, o ya venció) y el débito había quedado al día:
  -- la tarea volvía a cobrar la misma tarjeta en la corrida siguiente,
  -- justo a quien pidió la devolución. Pagar a mano lo destraba, como
  -- cualquier pausado (paso 9 de `bancard_confirmar`), y guardar otra
  -- tarjeta también.
  update public.bancard_cuentas
  set debito_estado = 'pausado', ultimo_error = 'Pago revertido por la administración',
      ultimo_codigo = null, updated_at = now()
  -- (130) …menos en un cambio de plan: no movió la fecha, así que la próxima
  -- (130) renovación tiene que salir sola, por el plan de antes.
  where empresa_id = v_op.empresa_id and debito_activo and v_op.tipo <> 'cambio';  -- (130)
  v_pausado := found;
  -- (130) Un cambio de plan deja el débito COMO ESTABA antes de ese pago. Si
  -- (130) estaba pausado (un rechazo, o una devolución anterior), ese pago lo
  -- (130) destrabó (paso 9 de `bancard_confirmar`) y acá vuelve a quedar
  -- (130) pausado, con el motivo que tenía: si no, la tarea le cobraba sola la
  -- (130) renovación a quien tenía el cobro automático frenado. Solo si desde
  -- (130) entonces nada más lo movió: sigue al día, es la misma tarjeta y no
  -- (130) entró otro pago después (un pago destraba el débito a propósito).
  -- (130) Las operaciones anteriores no traen la clave y siguen como antes.
  if v_op.tipo = 'cambio' and (v_op.antes -> 'debito' ->> 'estado') = 'pausado' then  -- (130)
    update public.bancard_cuentas c  -- (130)
    set debito_estado = 'pausado',  -- (130)
        intentos      = coalesce(nullif(v_op.antes -> 'debito' ->> 'intentos', '')::integer, 0),  -- (130)
        ciclo_fin     = nullif(v_op.antes -> 'debito' ->> 'ciclo_fin', '')::date,  -- (130)
        ultimo_error  = v_op.antes -> 'debito' ->> 'ultimo_error',  -- (130)
        ultimo_codigo = v_op.antes -> 'debito' ->> 'ultimo_codigo',  -- (130)
        updated_at    = now()  -- (130)
    where c.empresa_id = v_op.empresa_id and c.debito_estado = 'al_dia'  -- (130)
      and c.tarjeta_id is not distinct from nullif(v_op.antes -> 'debito' ->> 'tarjeta_id', '')::bigint  -- (130)
      and not exists (  -- (130)
        select 1 from public.bancard_operaciones o  -- (130)
        where o.empresa_id = v_op.empresa_id and o.id <> v_op.id and o.estado = 'pagada'  -- (130)
          and o.confirmada_at >= v_op.confirmada_at);  -- (130)
    v_pausado := found;  -- (130)
  end if;  -- (130)
  -- (130) ¿Quedó gente de más? Si en el medio entraron personas (pasó al Premium
  -- (130) de 6, invitó a 4 y se revierte al Básico), no se echa a nadie: se
  -- (130) cuenta y se dice, para que la administración lo vea.
  select greatest(0,  -- (130)
           (select count(*)::int from public.miembros m where m.empresa_id = v_op.empresa_id)  -- (130)
           - coalesce(s.tope_vendedores + 1, (public.limites_plan(s.plan)->>'miembros')::integer))  -- (130)
  into v_de_mas  -- (130)
  from public.suscripciones s where s.empresa_id = v_op.empresa_id;  -- (130)

  -- La comisión que nació con este pago se BORRA si todavía no se pagó: si
  -- solo se anulara, el índice único de `comisiones.empresa_id` le impediría
  -- al socio cobrar por el próximo pago de verdad. Si ya se pagó, queda.
  if v_op.comision_id is not null then
    select c.estado into v_estado from public.comisiones c where c.id = v_op.comision_id;
    if v_estado = 'por_pagar' then
      delete from public.comisiones where id = v_op.comision_id and estado = 'por_pagar';
      v_comision := 'borrada';
    elsif v_estado = 'pagada' then
      v_comision := 'ya_pagada';
    end if;
  end if;

  -- Y DESPUÉS el ingreso se anula (no se borra: lo que existió deja rastro).
  -- La restricción movimientos_anulacion_auditada (002) exige quién y cuándo.
  if v_op.ingreso_id is not null then
    update public.movimientos
    set estado = 'anulado',
        anulado_por = p_actor,
        anulado_at = now(),
        motivo_anulacion = 'Se revirtió el pago de Bancard ' || v_op.id
    where id = v_op.ingreso_id and estado = 'activo';
    v_anulado := found;
  end if;

  -- El renglón de ese pago deja de contar como «ya pagó».
  update public.registro_admin
  set detalle = detalle || jsonb_build_object('deshecho', true, 'deshecho_at', now())
  where empresa_id = v_op.empresa_id
    and accion in ('cambiar_plan', 'bancard_personas', 'bancard_prueba', 'bancard_cambio')  -- (130)
    and detalle ->> 'operacion' = v_op.id::text;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (p_actor, v_op.empresa_id, 'bancard_reversa', jsonb_build_object(
    'operacion',       v_op.id,
    'importe',         v_op.importe,
    'volvio_a_plan',   v_antes ->> 'plan',
    'volvio_a_estado', v_antes ->> 'estado',
    'volvio_a_vencer', v_antes ->> 'periodo_fin',
    'ingreso_anulado', v_anulado,
    'comision',        v_comision,
    'sin_bancard',     coalesce(p_sin_bancard, false),
    'personas_de_mas', coalesce(v_de_mas, 0),  -- (130)
    'nota',            left(coalesce(p_motivo, ''), 300)));

  update public.bancard_operaciones
  set estado = 'revertida', revertida_at = now(), revertida_por = p_actor,
      motivo = left(coalesce(p_motivo, ''), 300), updated_at = now()
  where id = v_op.id;

  return jsonb_build_object(
    'ok',              true,
    'plan',            v_antes ->> 'plan',
    'estado',          v_antes ->> 'estado',
    'periodo_fin',     v_antes ->> 'periodo_fin',
    'ingreso_anulado', v_anulado,
    'comision',        v_comision,
    'personas_de_mas', coalesce(v_de_mas, 0),  -- (130)
    'debito_pausado',  v_pausado);
end $fn$;

revoke all on function public.bancard_revertir(bigint, uuid, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.bancard_revertir(bigint, uuid, text, boolean, boolean) to service_role;

-- ------------------------------------------------------------
-- 11. EL COBRO AUTOMÁTICO
--
--     Copia exacta de la 125. Cambia: cobra el plan de la renovación (el
--     programado, si hay una baja de plan), también al comparar con el
--     primer intento del vencimiento.
-- ------------------------------------------------------------
create or replace function public.bancard_tomar_cobro(p_entorno text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_dias    integer[] := public.bancard_dias_de_cobro();
  v_largo   integer := array_length(public.bancard_dias_de_cobro(), 1);
  v         record;
  v_op      jsonb;
  v_motivo  text;
  v_primera public.bancard_operaciones;
begin
  if p_entorno is null or p_entorno not in ('staging', 'produccion') then
    raise exception 'Ese pedido de pago no es válido.' using errcode = '22023';
  end if;

  -- Pasada la ventana de reintentos ya no se cobra solo.
  update public.bancard_cuentas c
  set debito_estado = 'pausado', updated_at = now()
  from public.suscripciones s, public.empresas e, public.bancard_tarjetas t
  where s.empresa_id = c.empresa_id and e.id = c.empresa_id and t.id = c.tarjeta_id
    and c.debito_activo and c.debito_estado in ('al_dia', 'reintentando')
    and t.estado = 'activa' and t.entorno = p_entorno
    and s.estado = 'activa' and s.plan <> 'gratis' and s.periodo_fin is not null
    and (now() at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date
        > (s.periodo_fin at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date + v_dias[v_largo] + 2;

  select c.empresa_id, s.plan, coalesce(s.periodo, 'mensual') as periodo,
         d.fin, d.hoy, k.n, coalesce(e.zona_horaria, 'America/Asuncion') as zona
  into v
  from public.bancard_cuentas c
  join public.suscripciones s on s.empresa_id = c.empresa_id
  join public.empresas e on e.id = c.empresa_id
  join public.bancard_tarjetas t on t.id = c.tarjeta_id
  cross join lateral (
    select (s.periodo_fin at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date as fin,
           (now() at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date as hoy
  ) d
  cross join lateral (
    -- Un vencimiento nuevo arranca la cuenta de intentos desde cero.
    select case when c.ciclo_fin is distinct from d.fin then 0 else c.intentos end as n
  ) k
  where c.debito_activo
    and c.debito_estado in ('al_dia', 'reintentando')
    and t.estado = 'activa' and t.entorno = p_entorno
    and (t.bloqueada_hasta is null or t.bloqueada_hasta <= now())
    and s.estado = 'activa' and s.plan <> 'gratis'
    and not coalesce(s.cancela_al_vencer, false)
    and s.periodo_fin is not null
    and k.n < v_largo
    -- Le toca (y si la tarea no corrió un día, lo recupera).
    and d.hoy >= d.fin + v_dias[k.n + 1]
    and d.hoy <= d.fin + v_dias[v_largo] + 2
    -- Un intento por día.
    and coalesce(c.ultimo_intento, date '1900-01-01') < d.hoy
    and not exists (
      select 1 from public.bancard_operaciones o
      where o.empresa_id = c.empresa_id and o.estado in ('creada', 'en_3ds', 'incierta'))
  order by s.periodo_fin
  limit 1
  for update of c skip locked;

  if v.empresa_id is null then
    return null;
  end if;
  -- (130) Se cobra el plan de la RENOVACIÓN: el que la cuenta programó, si
  -- (130) programó una baja de plan. Vale para el primer intento y para los
  -- (130) reintentos, y es el que se compara abajo con lo anunciado.
  v.plan := public.bancard_plan_de_renovacion(v.empresa_id);  -- (130)

  -- El importe es el de ESE momento (lleva la constancia si la tiene ese día).
  begin
    v_op := public.bancard_crear_operacion_interna(
      v.empresa_id, null, p_entorno, 'plan', 'token', 'automatico',
      v.plan, v.periodo, public.bancard_personas_de_renovacion(v.empresa_id));
  exception when others then
    -- No se pudo cotizar (un precio que falta, un plan que ya no va): el
    -- débito se pausa y lo mira la administración.
    v_motivo := sqlerrm;
    update public.bancard_cuentas
    set debito_estado = 'pausado', ultimo_error = left(v_motivo, 120), ultimo_codigo = null,
        ultimo_intento = v.hoy, updated_at = now()
    where empresa_id = v.empresa_id;
    return jsonb_build_object('pausada', v.empresa_id, 'motivo', left(v_motivo, 200));
  end;

  if v_op ? 'viva' then
    return null;
  end if;

  -- Revisión 03/10: los reintentos cobran lo que se anunció. El aviso del
  -- día anterior dijo un importe con su descuento de constancia; si el
  -- candado del vencimiento cortó la racha, el reintento NO puede salir más
  -- caro. Se le respeta el descuento del primer intento de este vencimiento
  -- mientras el resto sea lo mismo (plan, período, personas: mismo subtotal).
  --
  -- Revisión 07/10: sin mirar el número de intento. Si el primer intento
  -- falló por infraestructura, el intento se devuelve (n vuelve a 0) y con
  -- «solo si n > 0» el reintento perdía lo anunciado. La búsqueda ya está
  -- acotada a ESTE vencimiento: operaciones automáticas del plan creadas
  -- desde el día del primer cobro (vencimiento − 1), que no sean esta. En el
  -- primer intento de verdad no encuentra ninguna y no cambia nada.
  select o.* into v_primera
  from public.bancard_operaciones o
  where o.empresa_id = v.empresa_id and o.origen = 'automatico' and o.tipo = 'plan'
    and o.id <> (v_op ->> 'operacion')::bigint
    and (o.created_at at time zone v.zona)::date >= v.fin + v_dias[1]
  order by o.id
  limit 1;

  if v_primera.id is not null and v_primera.descuento > 0
     and v_primera.plan = v.plan and v_primera.periodo = v.periodo
     and (v_op -> 'desglose' ->> 'descuento')::numeric = 0
     and (v_op -> 'desglose' ->> 'subtotal')::numeric = v_primera.lista + v_primera.extras then
    update public.bancard_operaciones
    set descuento  = v_primera.descuento,
        importe    = v_primera.importe,
        desglose   = desglose || jsonb_build_object(
          'descuento_fase',       v_primera.desglose -> 'descuento_fase',
          'descuento_porcentaje', v_primera.desglose -> 'descuento_porcentaje',
          'descuento_base',       v_primera.desglose -> 'descuento_base',
          'descuento',            v_primera.descuento,
          'total',                v_primera.importe,
          'anunciado_en',         v_primera.id),
        updated_at = now()
    where id = (v_op ->> 'operacion')::bigint and estado = 'creada';
    v_op := v_op || jsonb_build_object('importe', v_primera.importe);
  end if;

  update public.bancard_cuentas
  set ciclo_fin      = v.fin,
      intentos       = v.n + 1,
      ultimo_intento = v.hoy,
      debito_estado  = case when v.n > 0 then 'reintentando' else debito_estado end,
      updated_at     = now()
  where empresa_id = v.empresa_id;

  return jsonb_build_object(
    'operacion',   v_op -> 'operacion',
    'empresa_id',  v.empresa_id,
    'importe',     v_op -> 'importe',
    'descripcion', v_op -> 'descripcion',
    'user_id',     v_op -> 'user_id',
    'card_id',     v_op -> 'card_id',
    'intento',     v.n + 1);
end $fn$;

revoke all on function public.bancard_tomar_cobro(text) from public, anon, authenticated;
grant execute on function public.bancard_tomar_cobro(text) to service_role;

-- ------------------------------------------------------------
-- 12. LO QUE LEE LA PANTALLA
--
--     Copia exacta de la 125. Cambia: tres claves más. Las cinco de siempre
--     no cambian, salvo `debito.fecha_cobro`, que va null cuando el cobro
--     automático no va a salir porque el equipo no entra en el plan (el
--     punto d de la decisión 4, arriba).
-- ------------------------------------------------------------
create or replace function public.bancard_estado(p_empresa uuid, p_entorno text)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_sus      public.suscripciones;
  v_cuenta   public.bancard_cuentas;
  v_tarjeta  public.bancard_tarjetas;
  v_viva     public.bancard_operaciones;
  v_ultimo   public.bancard_operaciones;
  v_tipo     text;
  v_zona     text;
  v_dias     integer[] := public.bancard_dias_de_cobro();
  v_fin      date;
  v_hoy      date;
  v_n        integer;
  v_fecha    date;
  v_miembros integer;
  v_max      integer := (public.limites_plan('negocio')->>'miembros')::integer;
  v_programado text;  -- (130) el plan de la baja programada, si la hay
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

  select * into v_sus from public.suscripciones where empresa_id = p_empresa;
  select * into v_cuenta from public.bancard_cuentas where empresa_id = p_empresa;
  select * into v_tarjeta
  from public.bancard_tarjetas t
  where t.empresa_id = p_empresa and t.entorno = p_entorno and t.estado = 'activa';
  select * into v_viva
  from public.bancard_operaciones o
  where o.empresa_id = p_empresa and o.estado in ('creada', 'en_3ds', 'incierta')
  limit 1;
  select * into v_ultimo
  from public.bancard_operaciones o
  where o.empresa_id = p_empresa and o.entorno = p_entorno and o.estado = 'pagada'
  order by o.confirmada_at desc
  limit 1;
  select count(*)::int into v_miembros from public.miembros m where m.empresa_id = p_empresa;

  -- Cuándo es el próximo cobro: el día anterior al vencimiento, o el
  -- reintento que sigue. Revisión 07/10: solo con el plan 'activa'. En la
  -- prueba (vigente o vencida) no hay fecha ni importe: la tarjeta queda
  -- guardada y no se cobra sola, así que la pantalla no promete nada.
  v_hoy := (now() at time zone v_zona)::date;
  if v_tarjeta.id is not null and coalesce(v_cuenta.debito_activo, false)
     and v_cuenta.debito_estado in ('al_dia', 'reintentando')
     and v_sus.estado = 'activa' and v_sus.plan <> 'gratis' and v_sus.periodo_fin is not null
     and not coalesce(v_sus.cancela_al_vencer, false) then
    v_fin := (v_sus.periodo_fin at time zone v_zona)::date;
    v_n   := case when v_cuenta.ciclo_fin is distinct from v_fin then 0 else v_cuenta.intentos end;
    if v_n < array_length(v_dias, 1) then
      v_fecha := greatest(
        v_fin + v_dias[v_n + 1],
        case when v_cuenta.ultimo_intento = v_hoy then v_hoy + 1 else v_hoy end);
    end if;
  end if;
  -- (130) DECISIÓN 4, lo que se promete: si el equipo de hoy no entra en el plan
  -- (130) de la renovación, la tarea no va a cobrar (pausa el débito y le avisa a
  -- (130) la administración). La pantalla no puede anunciar ese cobro: sin fecha.
  if v_fecha is not null and public.bancard_renovacion_frenada(p_empresa) then  -- (130)
    v_fecha := null;  -- (130)
  end if;  -- (130)

  -- (130) La baja de plan programada: solo con el plan activo y hacia abajo.
  v_programado := nullif(public.bancard_plan_de_renovacion(p_empresa), v_sus.plan);  -- (130)
  return jsonb_build_object(
    -- (130) El plan que rige desde la próxima renovación, o null.
    'plan_proximo', v_programado,  -- (130)
    -- (130) Si ese plan ya se puede pagar a mano (faltan pocos días, o venció).
    'plan_proximo_pagable', coalesce(v_programado is not null  -- (130)
      and (v_sus.periodo_fin at time zone v_zona)::date - v_hoy <= public.dias_para_adelantar_la_baja(), false),  -- (130)
    -- (130) Cuántas personas tiene hoy el equipo, con cualquier plan.
    'miembros', v_miembros,  -- (130)
    'tarjeta', case when v_tarjeta.id is null then null else jsonb_build_object(
      'id', v_tarjeta.id, 'marca', v_tarjeta.marca, 'ultimos4', v_tarjeta.ultimos4, 'tipo', v_tarjeta.tipo) end,
    'debito', jsonb_build_object(
      'activo',       v_tarjeta.id is not null and coalesce(v_cuenta.debito_activo, false),
      'estado',       coalesce(v_cuenta.debito_estado, 'al_dia'),
      'fecha_cobro',  v_fecha,
      'importe',      case when v_sus.estado = 'activa' then public.bancard_importe_de_renovacion(p_empresa) else null end,
      'intentos',     coalesce(v_cuenta.intentos, 0),
      'ultimo_error', v_cuenta.ultimo_error,
      'bloqueada',    v_tarjeta.bloqueada_hasta is not null and v_tarjeta.bloqueada_hasta > now()),
    'personas', case
      when v_sus.plan = 'negocio' and v_tipo <> 'personal' and v_sus.estado = 'activa' then jsonb_build_object(
        'contratadas', v_sus.tope_vendedores + 1,
        'proxima',     v_cuenta.personas_proxima,
        'miembros',    v_miembros,
        'min',         least(greatest(public.personas_incluidas_premium(), v_miembros), v_max),
        'max',         v_max)
      else null end,
    'viva', case when v_viva.id is null then null else jsonb_build_object(
      'operacion', v_viva.id,
      'estado',    v_viva.estado,
      'tipo',      v_viva.tipo,
      'medio',     v_viva.medio,
      'importe',   v_viva.importe,
      'minutos',   floor(extract(epoch from (now() - v_viva.created_at)) / 60)::integer,
      'puede_3ds', v_viva.estado = 'en_3ds' and v_viva.entorno = p_entorno
                   and v_viva.created_at > now() - make_interval(mins => public.bancard_minutos_de_3ds())) end,
    'ultimo_pago', case when v_ultimo.id is null then null else jsonb_build_object(
      'operacion', v_ultimo.id,
      'importe',   v_ultimo.importe,
      'fecha',     v_ultimo.confirmada_at,
      'vence',     v_ultimo.vence_despues) end);
end $fn$;

revoke all on function public.bancard_estado(uuid, text) from public, anon;
grant execute on function public.bancard_estado(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 13. LA BAJA DE PERSONAS, EL TOPE Y EL DISPARADOR
--
--     Copias exactas de la 125. Cambia:
--       · programar una baja de personas borra la de plan (una por vez),
--         salvo con un pago en curso: ahí contesta «Hay un pago en curso…»,
--         igual que al programar o deshacer la de plan. Sin una baja de
--         plan programada no cambia nada;
--       · el tope de personas respeta también el plan programado;
--       · la baja de plan caduca sola, como la de personas, cuando la
--         suscripción cambia por cualquier camino. El disparador no se toca.
-- ------------------------------------------------------------
create or replace function public.bancard_bajar_personas(p_empresa uuid, p_usuario uuid, p_personas integer)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_sus      public.suscripciones;
  v_tipo     text;
  v_miembros integer;
  v_min      integer;
begin
  if not public.bancard_administra(p_empresa, p_usuario) then
    raise exception 'Solo el dueño de la cuenta puede pagar el plan.' using errcode = '42501';
  end if;

  select coalesce(e.tipo_cuenta, 'emprendedor') into v_tipo from public.empresas e where e.id = p_empresa;
  select * into v_sus from public.suscripciones where empresa_id = p_empresa for update;

  if v_sus.empresa_id is null or v_tipo = 'personal' or v_sus.plan <> 'negocio' or v_sus.estado <> 'activa' then
    raise exception 'Ese plan no lleva cantidad de personas.' using errcode = '22023';
  end if;
  if v_sus.tope_vendedores is null then
    raise exception 'Primero renová tu plan eligiendo cuántas personas son.' using errcode = '22023';
  end if;

  if p_personas is not null then
    select count(*)::int into v_miembros from public.miembros m where m.empresa_id = p_empresa;
    v_min := greatest(public.personas_incluidas_premium(), v_miembros);

    if p_personas >= v_sus.tope_vendedores + 1 then
      raise exception 'Para cambiar la cantidad de personas usá «Sumar personas» o «Bajar desde la próxima renovación».'
        using errcode = '22023';
    end if;
    if p_personas < v_miembros then
      raise exception 'No podés bajar a menos personas de las que hoy tiene tu equipo.' using errcode = '22023';
    end if;
    if p_personas < v_min then
      raise exception 'Elegí cuántas personas van a usar la cuenta (entre % y %).', v_min, v_sus.tope_vendedores
        using errcode = '22023';
    end if;
  end if;

  -- (130) Una sola cosa programada por vez: una baja de personas reemplaza a la
  -- (130) de plan. Deshacer la de personas (null) no toca la de plan.
  if p_personas is not null and exists (  -- (130)
    select 1 from public.bancard_cuentas c  -- (130)
    where c.empresa_id = p_empresa and c.plan_proximo is not null  -- (130)
  ) then  -- (130)
    -- (130) Con un pago en curso la baja de plan no se toca, igual que al
    -- (130) programarla o deshacerla: ese pago puede ser la renovación por el
    -- (130) plan programado, y sin la baja quedaría «plata anotada, sin renovar».
    -- (130) Cuenta también el formulario RECHAZADO de esa renovación que sigue
    -- (130) abierto en Bancard (`bancard_rechazadas_abiertas`).
    if exists (  -- (130)
      select 1 from public.bancard_operaciones o  -- (130)
      where o.empresa_id = p_empresa and o.estado in ('creada', 'en_3ds', 'incierta')  -- (130)
    ) or public.bancard_rechazadas_abiertas(p_empresa, null, (  -- (130)
      select c.plan_proximo from public.bancard_cuentas c where c.empresa_id = p_empresa)) <> '[]'::jsonb  -- (130)
    then  -- (130)
      raise exception 'Hay un pago en curso. Esperá a que se confirme y probá de nuevo.' using errcode = '22023';  -- (130)
    end if;  -- (130)
    update public.bancard_cuentas  -- (130)
    set plan_proximo = null, updated_at = now()  -- (130)
    where empresa_id = p_empresa and plan_proximo is not null;  -- (130)
  end if;  -- (130)
  insert into public.bancard_cuentas (empresa_id, personas_proxima)
  values (p_empresa, p_personas)
  on conflict (empresa_id) do update set
    personas_proxima = excluded.personas_proxima, updated_at = now();

  return jsonb_build_object(
    'personas_proxima', p_personas,
    'contratadas',      v_sus.tope_vendedores + 1,
    'importe',          public.bancard_importe_de_renovacion(p_empresa));
end $fn$;

revoke all on function public.bancard_bajar_personas(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.bancard_bajar_personas(uuid, uuid, integer) to service_role;

create or replace function public.tope_de_miembros(p_empresa uuid)
returns integer language sql stable security definer set search_path = public as $fn$
  select case
    when public.plan_efectivo_calculado(p_empresa) = 'gratis'
      then (public.limites_plan('gratis')->>'miembros')::integer
    else least(
      coalesce(
        (select s.tope_vendedores + 1
         from public.suscripciones s
         where s.empresa_id = p_empresa and s.tope_vendedores is not null),
        (public.limites_plan(public.plan_efectivo_calculado(p_empresa))->>'miembros')::integer
      ),
      coalesce((select c.personas_proxima from public.bancard_cuentas c where c.empresa_id = p_empresa), 32767),
      coalesce((select min(o.personas) from public.bancard_operaciones o
                where o.empresa_id = p_empresa and o.tipo = 'plan' and o.plan = 'negocio'
                  and o.estado in ('creada', 'en_3ds', 'incierta')), 32767)
      -- (130) …y con una baja de PLAN programada, con los lugares del plan que
      -- (130) viene: si no, entre programar y renovar el equipo podría crecer.
      -- (130) Sin nada programado no topa nada (32767).
      , coalesce((select (public.limites_plan(x.plan)->>'miembros')::integer  -- (130)
                  from (select nullif(public.bancard_plan_de_renovacion(p_empresa),  -- (130)
                                 (select s.plan from public.suscripciones s  -- (130)
                                  where s.empresa_id = p_empresa)) as plan) x  -- (130)
                  where x.plan is not null), 32767)  -- (130)
    )
  end;
$fn$;

revoke all on function public.tope_de_miembros(uuid) from public, anon;
grant execute on function public.tope_de_miembros(uuid) to authenticated;

create or replace function public.bancard_baja_caduca()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.periodo_fin is distinct from old.periodo_fin
     or new.tope_vendedores is distinct from old.tope_vendedores
     or new.plan is distinct from old.plan then
    begin
      update public.bancard_cuentas
      set personas_proxima = null, updated_at = now()
      where empresa_id = new.empresa_id and personas_proxima is not null;
      -- (130) Lo mismo con la baja de PLAN programada.
      update public.bancard_cuentas  -- (130)
      set plan_proximo = null, updated_at = now()  -- (130)
      where empresa_id = new.empresa_id and plan_proximo is not null;  -- (130)
    exception when others then
      -- Un cambio de plan no se pierde por esto.
      null;
    end;
  end if;
  return null;
end $fn$;

revoke all on function public.bancard_baja_caduca() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 14. EL AVISO DE VENCIMIENTO
--
--     Copia exacta de la 126. Cambia: dos claves más por fila,
--     `plan_renovacion` y `precio_renovacion`. `plan` y `precio` siguen
--     siendo los del plan que la cuenta tiene HOY (el aviso publicado dice
--     «tu plan X vence»), e `importe` ya era lo que de verdad se cobra. Y
--     `debito` va null cuando el cobro automático no va a salir porque el
--     equipo no entra en el plan (el punto d de la decisión 4, arriba).
-- ------------------------------------------------------------
create or replace function public.vencimientos_por_avisar()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x order by (x->>'dias')::int, x->>'nombre'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'tipo',        case when s.estado = 'prueba' then 'prueba' else 'periodo' end,
      'empresa_id',  e.id,
      'nombre',      e.nombre,
      'tipo_cuenta', coalesce(e.tipo_cuenta, 'emprendedor'),
      'plan',        s.plan,
      'periodo',     coalesce(s.periodo, 'mensual'),
      'fin',         s.periodo_fin,
      -- La fecha en la zona del negocio: es la que se escribe en el aviso y
      -- la que arma la clave de «una vez por vencimiento».
      'fecha_fin',   (s.periodo_fin at time zone z.zona)::date,
      'dias',        d.dias,
      'moneda',      'PYG',
      'precio', (
        select pr.importe
        from public.precios pr
        where pr.tipo_cuenta = coalesce(e.tipo_cuenta, 'emprendedor')
          and pr.plan = s.plan
          and pr.periodo = coalesce(s.periodo, 'mensual')
          and pr.moneda = 'PYG'
          and pr.activo
        limit 1
      ),
      -- (130) Con una baja de plan programada, lo que se renueva es otro plan.
      -- (130) `plan` y `precio` siguen siendo los de HOY; estas dos dicen los de
      -- (130) la renovación. Sin nada programado son iguales a aquellas.
      'plan_renovacion', public.bancard_plan_de_renovacion(e.id),  -- (130)
      'precio_renovacion', (  -- (130)
        select pr.importe  -- (130)
        from public.precios pr  -- (130)
        where pr.tipo_cuenta = coalesce(e.tipo_cuenta, 'emprendedor')  -- (130)
          and pr.plan = public.bancard_plan_de_renovacion(e.id)  -- (130)
          and pr.periodo = coalesce(s.periodo, 'mensual')  -- (130)
          and pr.moneda = 'PYG'  -- (130)
          and pr.activo  -- (130)
        limit 1  -- (130)
      ),  -- (130)
      'destinatarios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', mi.user_id,
          'idioma',  coalesce(p.idioma, 'es'),
          'nombre',  coalesce(mi.nombre, ''),
          'email',   u.email
        ) order by mi.rol desc, mi.created_at), '[]'::jsonb)
        from public.miembros mi
        left join public.preferencias p on p.user_id = mi.user_id
        left join auth.users u on u.id = mi.user_id
        where mi.empresa_id = e.id and mi.rol in ('propietario', 'admin')
      ),
      -- 126: la tarjeta de la que se va a cobrar y qué día, si la cuenta
      -- tiene el débito al día. Si no, null: paga la persona. Lleva el
      -- entorno de la tarjeta: el servidor descarta el débito si no es el
      -- suyo (la base no sabe en qué entorno corre el servidor).
      'debito', (
        select jsonb_build_object(
          'marca',       t.marca,
          'ultimos4',    t.ultimos4,
          'entorno',     t.entorno,
          'fecha_cobro', (s.periodo_fin at time zone z.zona)::date + (public.bancard_dias_de_cobro())[1])
        from public.bancard_cuentas c
        join public.bancard_tarjetas t on t.id = c.tarjeta_id
        where c.empresa_id = e.id
          and c.debito_activo and c.debito_estado = 'al_dia'
          and t.estado = 'activa'
          -- Revisión 07/10: solo planes activos. A una prueba no se le
          -- cobra sola aunque tenga la tarjeta guardada (bancard_tomar_cobro).
          and s.estado = 'activa'
          -- (130) Decisión 4: si el equipo no entra en el plan de la renovación,
          -- (130) la tarea no va a cobrar. El aviso no promete ese cobro: sin
          -- (130) «debito», le dice a la persona que pague (y ahí ve qué hacer).
          and not public.bancard_renovacion_frenada(e.id)  -- (130)
      ),
      -- 126: si la administración le habilitó el pago con Bancard.
      'bancard', coalesce((
        select c.habilitada from public.bancard_cuentas c where c.empresa_id = e.id
      ), false),
      -- 126: lo que se le cobra de verdad (sus personas, su descuento). Null
      -- si no se puede cotizar.
      'importe', public.bancard_importe_de_renovacion(e.id)
    ) as x
    from public.suscripciones s
    join public.empresas e on e.id = s.empresa_id
    cross join lateral (
      select coalesce(e.zona_horaria, 'America/Asuncion') as zona
    ) z
    cross join lateral (
      select (s.periodo_fin at time zone z.zona)::date
             - (now() at time zone z.zona)::date as dias
    ) d
    where s.periodo_fin is not null
      and d.dias in (0, 1, 3)
      and (
        (s.estado = 'prueba' and s.periodo_fin > now())
        or (s.estado = 'activa'
            and s.plan <> 'gratis'
            and not coalesce(s.cancela_al_vencer, false))
      )
  ) t;

  return v_res;
end $fn$;

revoke all on function public.vencimientos_por_avisar() from public, anon, authenticated;
grant execute on function public.vencimientos_por_avisar() to service_role;
