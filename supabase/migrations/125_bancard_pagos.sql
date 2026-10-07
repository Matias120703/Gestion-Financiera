-- ============================================================
-- 125 · BANCARD (2 de 3): LOS PAGOS
-- ============================================================
--
-- Sobre las tablas y el precio de la 124, todo lo que hace falta para cobrar
-- una suscripción por Bancard vPOS 2.0 sin que nadie active un plan a mano.
--
-- LAS REGLAS QUE ORDENAN ESTE ARCHIVO
--
--   · UNA OPERACIÓN = UN INTENTO = UN shop_process_id. Guarda todo lo
--     elegido (plan, período, personas, desglose, entorno) y el importe
--     congelado. La confirmación de Bancard trae solo el número: lo demás
--     sale de la fila. El importe nunca viaja desde el navegador.
--   · UNA SOLA OPERACIÓN VIVA POR CUENTA (índice de la 124). Una operación
--     con estado incierto no se vuelve a cobrar hasta resolverla consultando
--     a Bancard: así no hay cobro doble.
--   · EL PLAN SE ACTIVA EN UN SOLO LUGAR, `bancard_confirmar`, una vez por
--     operación y con la fila bloqueada. La llaman tres caminos (la
--     confirmación que manda Bancard, la consulta, y la respuesta del cobro
--     con tarjeta guardada) y los tres pueden llegar a la vez.
--   · TODO LO QUE ESCRIBE ES SOLO DE `service_role` y recibe `p_usuario`;
--     adentro se vuelve a comprobar que esa persona administra la cuenta.
--     Las tablas no tienen permisos: las pantallas leen por función.
--   · CADA FILA GUARDA SU ENTORNO. Un pago de staging activa el plan de la
--     cuenta de prueba, pero NO anota ingreso en las finanzas de Orden, NO
--     genera comisión y NO cuenta como «ya pagó».
--   · EL PREMIUM QUEDA CON LAS PERSONAS QUE SE PAGARON: al confirmar,
--     `tope_vendedores = personas - 1`. Nunca más un Premium «sin número»
--     (15 personas por el precio base) cuando se paga por Bancard.
--   · DE LA RESPUESTA DE BANCARD SE GUARDA LO JUSTO (`bancard_sanear`): ni el
--     token, ni la IP de la persona, ni el process_id, ni el alias.
--
-- LO QUE `aplicar_suscripcion` (104) NO HACE Y ACÁ SÍ
--
-- Se la reusa tal cual (su firma está atada por las pruebas) para el upsert
-- y la comisión, y alrededor se hace lo que le falta: calcular la fecha
-- («nunca se le comen días», como `cambiar_plan_cuenta`), escribir el tope de
-- personas, anotar el ingreso en la empresa de Orden, atar la comisión a ese
-- ingreso y dejar el renglón `cambiar_plan` en `registro_admin`, que es lo que
-- miran `usar_codigo_referido` (063) y `asignar_referido` (103) para saber si
-- una cuenta ya pagó.
--
-- EL DÉBITO AUTOMÁTICO COBRA ANTES DEL CORTE
--
-- `plan_efectivo_calculado` corta al instante al pasar `periodo_fin`. Por eso
-- el primer intento es el día ANTERIOR al vencimiento, y los reintentos +1 y
-- +4 días después (`bancard_dias_de_cobro`). Un intento por día como mucho:
-- Bancard bloquea 30 días una tarjeta con 7 rechazos en 24 horas.
--
-- `deshacer_ultimo_cambio` (022) SE COMÍA UN PAGO CON TARJETA
--
-- Deshacía el renglón del pago devolviendo la cuenta al estado anterior y
-- anulando el ingreso, sin pedirle nada a Bancard. Ahora se niega: un pago de
-- Bancard se revierte con `bancard_revertir`, que primero le pide la reversa
-- a Bancard.
--
-- MENSAJES NUEVOS (con su portugués en src/lib/mensajes-base.ts)
--
--   · «Ese pedido de pago no es válido.»
--   · «Solo el dueño de la cuenta puede pagar el plan.»
--   · «Tu plan actual está pago hasta el %. Para cambiar de plan antes de esa
--     fecha escribinos.»
--   · «Para cambiar la cantidad de personas usá «Sumar personas» o «Bajar
--     desde la próxima renovación».»
--   · «No hay una tarjeta guardada.»
--   · «Probaste varias veces con esta tarjeta y fue rechazada. Probá con otra
--     o pagá con QR.»
--   · «Demasiados intentos hoy. Probá de nuevo más tarde o escribinos.»
--   · «Falta un teléfono para registrar la tarjeta.»
--   · «Falta un correo para registrar la tarjeta.»
--   · «Ese pago no existe.» (ya traducido, 082)
--   · «Ese pago no está aprobado, no hay nada que revertir.»
--   · «Ya pasó el día del pago: se anula por el portal de comercios (Soporte
--     → Anulaciones) y después se marca acá.»
--   · «Después de ese pago hubo otros cambios en la cuenta. Deshacé primero
--     esos.»
--   · «Ese cambio tiene un pago con Bancard: se revierte desde los pagos de
--     Bancard de la cuenta.»
--   · «No podés bajar a menos personas de las que hoy tiene tu equipo.»
--
-- LA REVISIÓN DEL 03/10 (lente: la plata del cliente y de Orden)
--
-- Doce hallazgos sobre esto mismo; lo que cambió acá:
--   · Una operación que ya no está viva (rechazada, vencida) y llega
--     aprobada SE VUELVE A COTIZAR: si hoy vale más (el 18 % del primer
--     pago ya se usó, la lista subió, el equipo creció) o es un «sumar
--     personas» de un período que ya se renovó, la plata se anota pero NO
--     activa nada: queda para la administración (`revisar`).
--   · Las rechazadas de formulario se cierran en Bancard (reversa) cuando la
--     cuenta abre otro pago y en la conciliación: `rechazada → vencida` con
--     motivo 'reemplazada'.
--   · Una `vencida` con motivo 'RollbackSuccessful' (Bancard devolvió la
--     plata en la conciliación) no se activa con una aprobación tardía.
--   · El tope de personas (`tope_de_miembros`, sección 13) respeta la baja
--     programada y la renovación viva por menos personas; y al confirmar se
--     vuelve a contar el equipo.
--   · «Sumar personas» cancela una baja programada menor.
--   · Un cobro automático que no llegó al banco (sin red, pedido no
--     aceptado, la conciliación no encontró pago) DEVUELVE el intento.
--   · Los reintentos de un vencimiento cobran lo que se anunció: el
--     descuento del primer intento del ciclo vale para sus reintentos.
--   · La tarjeta guardada en la prueba la convierte: el cobro automático
--     también toma `estado = 'prueba'` (lo que prometía la pantalla).
--   · `bancard_eventos` se purga (90 días) y 'desconocida' se anota una vez
--     por número y día.
--
-- Idempotente: todo es `create or replace` y revoke/grant. Sin una sola barra
-- invertida.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LOS NÚMEROS, CADA UNO EN UN SOLO LUGAR
-- ------------------------------------------------------------

-- Días respecto del vencimiento en que se intenta el débito: el día anterior,
-- y dos reintentos con la cuenta ya vencida.
create or replace function public.bancard_dias_de_cobro()
returns integer[] language sql immutable set search_path = public as $fn$
  select array[-1, 1, 4];
$fn$;

-- Rechazos de una misma tarjeta en 24 horas antes de frenar a la persona.
create or replace function public.bancard_tope_de_rechazos()
returns integer language sql immutable set search_path = public as $fn$
  select 3;
$fn$;

-- Cuánto vive un formulario sin pagar antes de darlo por abandonado.
create or replace function public.bancard_minutos_de_vida()
returns integer language sql immutable set search_path = public as $fn$
  select 30;
$fn$;

-- Cuánto se espera a que la persona confirme un pago que pidió 3D Secure.
create or replace function public.bancard_minutos_de_3ds()
returns integer language sql immutable set search_path = public as $fn$
  select 60;
$fn$;

-- Operaciones que una cuenta puede iniciar en 24 horas.
create or replace function public.bancard_operaciones_por_dia()
returns integer language sql immutable set search_path = public as $fn$
  select 20;
$fn$;

-- Pedidos de guardar tarjeta que una cuenta puede iniciar en 24 horas.
create or replace function public.bancard_catastros_por_dia()
returns integer language sql immutable set search_path = public as $fn$
  select 5;
$fn$;

-- Lo que la persona lee en el formulario de Bancard. ASCII y hasta 20
-- caracteres (el manual: `description` String 20).
create or replace function public.bancard_descripcion(p_tipo text, p_plan text)
returns text language sql immutable set search_path = public as $fn$
  select case
    when p_tipo = 'personas' then 'Orden mas personas'
    when p_plan = 'basico'   then 'Orden Basico'
    when p_plan = 'negocio'  then 'Orden Premium'
    else 'Orden Pro'
  end;
$fn$;

-- Qué hacer con un rechazo según su código. Criterio de Orden, no de Bancard:
-- a la persona se le muestra `response_description`; el código solo decide
-- si vale la pena reintentar.
create or replace function public.bancard_clase_de_rechazo(p_codigo text)
returns text language sql immutable set search_path = public as $fn$
  select case
    when c in ('06', '09', '19', '22', '46', '47', '90', '91', '92', '96', '98') then 'transitorio'
    when c in ('51', '61', '65') then 'fondos'
    when c in ('04', '14', '33', '34', '36', '38', '41', '43', '54', '59', '62', '9G') then 'tarjeta'
    when c in ('01', '02', '55', '57', '73', '75', '77', '82', '83', '5C') then 'titular'
    else 'otro'
  end
  from (select upper(lpad(coalesce(trim(p_codigo), ''), 2, '0')) as c) x;
$fn$;

revoke all on function public.bancard_dias_de_cobro() from public, anon, authenticated;
revoke all on function public.bancard_tope_de_rechazos() from public, anon, authenticated;
revoke all on function public.bancard_minutos_de_vida() from public, anon, authenticated;
revoke all on function public.bancard_minutos_de_3ds() from public, anon, authenticated;
revoke all on function public.bancard_operaciones_por_dia() from public, anon, authenticated;
revoke all on function public.bancard_catastros_por_dia() from public, anon, authenticated;
revoke all on function public.bancard_descripcion(text, text) from public, anon, authenticated;
revoke all on function public.bancard_clase_de_rechazo(text) from public, anon, authenticated;
grant execute on function public.bancard_dias_de_cobro() to service_role;
grant execute on function public.bancard_tope_de_rechazos() to service_role;
grant execute on function public.bancard_minutos_de_vida() to service_role;
grant execute on function public.bancard_minutos_de_3ds() to service_role;
grant execute on function public.bancard_operaciones_por_dia() to service_role;
grant execute on function public.bancard_catastros_por_dia() to service_role;
grant execute on function public.bancard_descripcion(text, text) to service_role;
grant execute on function public.bancard_clase_de_rechazo(text) to service_role;

-- ------------------------------------------------------------
-- 2. QUÉ SE GUARDA DE UNA RESPUESTA DE BANCARD
--
--    Solo lo de esta lista, y solo valores sueltos (texto, número). Se
--    descartan el token, la IP de la persona, el process_id, el alias, la
--    respuesta de facturación y cualquier clave que no esté acá.
-- ------------------------------------------------------------
create or replace function public.bancard_sanear(p jsonb)
returns jsonb language sql immutable set search_path = public as $fn$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then '{}'::jsonb
    else
      coalesce((
        select jsonb_object_agg(k,
          case when jsonb_typeof(p -> k) = 'string' then to_jsonb(left(p ->> k, 200)) else p -> k end)
        from unnest(array['response', 'response_code', 'response_description', 'response_details',
                          'extended_response_description', 'authorization_number', 'ticket_number',
                          'amount', 'currency']) k
        where jsonb_typeof(p -> k) in ('string', 'number', 'boolean')
      ), '{}'::jsonb)
      || case
           when jsonb_typeof(p -> 'security_information') = 'object' then jsonb_build_object(
             'security_information', coalesce((
               select jsonb_object_agg(k,
                 case when jsonb_typeof(p -> 'security_information' -> k) = 'string'
                      then to_jsonb(left(p -> 'security_information' ->> k, 60))
                      else p -> 'security_information' -> k end)
               from unnest(array['card_source', 'card_country', 'risk_index']) k
               where jsonb_typeof(p -> 'security_information' -> k) in ('string', 'number', 'boolean')
             ), '{}'::jsonb))
           else '{}'::jsonb
         end
  end;
$fn$;

-- Lo mismo para el detalle de un evento del registro: un `operation` o un
-- `confirmation` pasan por la lista de arriba; de `messages` quedan la clave,
-- el nivel y la descripción; del resto, solo valores sueltos cuyo nombre no
-- sea de los que nunca se guardan.
create or replace function public.bancard_sanear_detalle(p jsonb)
returns jsonb language sql immutable set search_path = public as $fn$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then '{}'::jsonb
    else
      coalesce((
        select jsonb_object_agg(e.key,
          case when jsonb_typeof(e.value) = 'string' then to_jsonb(left(e.value #>> '{}', 300)) else e.value end)
        from jsonb_each(p) e
        where jsonb_typeof(e.value) in ('string', 'number', 'boolean')
          and lower(e.key) not in ('token', 'alias_token', 'card_token', 'process_id', 'public_key',
                                   'private_key', 'customer_ip', 'user_cell_phone', 'user_mail',
                                   'card_masked_number', 'expiration_date')
      ), '{}'::jsonb)
      || case when p ? 'operation'
              then jsonb_build_object('operation', public.bancard_sanear(p -> 'operation'))
              else '{}'::jsonb end
      || case when p ? 'confirmation'
              then jsonb_build_object('confirmation', public.bancard_sanear(p -> 'confirmation'))
              else '{}'::jsonb end
      || case when jsonb_typeof(p -> 'messages') = 'array'
              then jsonb_build_object('messages', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'key',   left(coalesce(m ->> 'key', ''), 80),
                  'level', left(coalesce(m ->> 'level', ''), 20),
                  'dsc',   left(coalesce(m ->> 'dsc', ''), 200)))
                from jsonb_array_elements(p -> 'messages') m
                where jsonb_typeof(m) = 'object'
              ), '[]'::jsonb))
              else '{}'::jsonb end
  end;
$fn$;

revoke all on function public.bancard_sanear(jsonb) from public, anon, authenticated;
revoke all on function public.bancard_sanear_detalle(jsonb) from public, anon, authenticated;
grant execute on function public.bancard_sanear(jsonb) to service_role;
grant execute on function public.bancard_sanear_detalle(jsonb) to service_role;

-- ------------------------------------------------------------
-- 3. AYUDAS INTERNAS (cerradas a todos: las llaman las de abajo)
-- ------------------------------------------------------------

-- ¿Esta persona administra esta cuenta? Con `service_role` no hay
-- `auth.uid()`, así que `es_admin()` y `es_superadmin()` no sirven acá.
create or replace function public.bancard_administra(p_empresa uuid, p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select p_usuario is not null and (
    exists (
      select 1 from public.miembros m
      where m.empresa_id = p_empresa and m.user_id = p_usuario
        and m.rol in ('propietario', 'admin'))
    or exists (select 1 from public.superadmins s where s.usuario_id = p_usuario)
  );
$fn$;

-- A quién se le avisa lo de la plata de una cuenta: propietarios y
-- administradores, como en `vencimientos_por_avisar` (107).
create or replace function public.bancard_destinatarios(p_empresa uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', mi.user_id,
    'idioma',  coalesce(p.idioma, 'es'),
    'nombre',  coalesce(mi.nombre, ''),
    'email',   u.email
  ) order by mi.rol desc, mi.created_at), '[]'::jsonb)
  from public.miembros mi
  left join public.preferencias p on p.user_id = mi.user_id
  left join auth.users u on u.id = mi.user_id
  where mi.empresa_id = p_empresa and mi.rol in ('propietario', 'admin');
$fn$;

-- Por cuántas personas se renueva el Premium de esta cuenta: la baja
-- programada si la hay, si no lo contratado, y nunca menos que el equipo de
-- hoy. Null si su plan no lleva cantidad de personas.
create or replace function public.bancard_personas_de_renovacion(p_empresa uuid)
returns integer language sql stable security definer set search_path = public as $fn$
  select case
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

-- Cuánto se le cobraría hoy la renovación (su plan, su período y sus
-- personas). Null si no se puede cotizar: nunca lanza.
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

  return (public.precio_de_la_cuenta(
    p_empresa, v_plan, v_periodo, public.bancard_personas_de_renovacion(p_empresa)) ->> 'total')::numeric;
exception when others then
  return null;
end $fn$;

revoke all on function public.bancard_administra(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bancard_destinatarios(uuid) from public, anon, authenticated;
revoke all on function public.bancard_personas_de_renovacion(uuid) from public, anon, authenticated;
revoke all on function public.bancard_importe_de_renovacion(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. INICIAR UNA OPERACIÓN
--
--    La interna hace todo y no confía en nadie más que en sus argumentos; la
--    llaman `bancard_crear_operacion` (una persona, con su permiso
--    comprobado) y `bancard_tomar_cobro` (la tarea diaria, sin persona).
--
--    Devuelve una de tres cosas:
--      · la operación nueva;
--      · la MISMA operación de hace un momento (`reusada`): doble clic, o
--        cerrar y volver a abrir la ventana de pago;
--      · `{viva: <id>}`: ya hay una operación sin resolver de esa cuenta. No
--        se crea nada: el servidor la resuelve consultando a Bancard y vuelve
--        a llamar.
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
begin
  if p_entorno is null or p_entorno not in ('staging', 'produccion')
     or p_tipo is null or p_tipo not in ('plan', 'personas')
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
       and p_personas is distinct from public.bancard_personas_de_renovacion(p_empresa) then
      raise exception 'Para cambiar la cantidad de personas usá «Sumar personas» o «Bajar desde la próxima renovación».'
        using errcode = '22023';
    end if;

    v_lista     := (v ->> 'lista')::numeric;
    v_extras    := (v ->> 'extras')::numeric;
    v_descuento := (v ->> 'descuento')::numeric;
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

create or replace function public.bancard_crear_operacion(
  p_empresa  uuid,
  p_usuario  uuid,
  p_entorno  text,
  p_tipo     text,
  p_medio    text,
  p_plan     text,
  p_periodo  text,
  p_personas integer
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  -- 2. La persona tiene que administrar la cuenta. Sin persona no hay pago:
  --    eso es solo de la tarea diaria, que entra por otra puerta.
  if not public.bancard_administra(p_empresa, p_usuario) then
    raise exception 'Solo el dueño de la cuenta puede pagar el plan.' using errcode = '42501';
  end if;

  return public.bancard_crear_operacion_interna(
    p_empresa, p_usuario, p_entorno, p_tipo, p_medio, 'usuario', p_plan, p_periodo, p_personas);
end $fn$;

revoke all on function public.bancard_crear_operacion(uuid, uuid, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.bancard_crear_operacion(uuid, uuid, text, text, text, text, text, integer)
  to service_role;

-- El process_id que devolvió Bancard al abrir el formulario.
create or replace function public.bancard_guardar_proceso(p_operacion bigint, p_process_id text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_ok boolean;
begin
  update public.bancard_operaciones
  set process_id = left(p_process_id, 100), updated_at = now()
  where id = p_operacion and estado = 'creada'
    and coalesce(p_process_id, '') <> '';
  v_ok := found;
  return jsonb_build_object('ok', v_ok);
end $fn$;

revoke all on function public.bancard_guardar_proceso(bigint, text) from public, anon, authenticated;
grant execute on function public.bancard_guardar_proceso(bigint, text) to service_role;

-- Lo mínimo de una operación, para la confirmación y la conciliación. No
-- devuelve el process_id ni la respuesta. Null si no existe.
-- `consultas`: cuántas veces se le preguntó a Bancard por ella. La pantalla
-- de vuelta consulta una vez aunque la confirmación ya haya llegado: es lo
-- que marca «Recibimos pedido de confirmación del comercio» en la lista de
-- tests del portal.
create or replace function public.bancard_operacion_interna(p_operacion bigint)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'operacion',  o.id,
    'empresa_id', o.empresa_id,
    'entorno',    o.entorno,
    'estado',     o.estado,
    'tipo',       o.tipo,
    'medio',      o.medio,
    'origen',     o.origen,
    'importe',    o.importe,
    'user_id',    (select t.pagador_id from public.bancard_tarjetas t where t.id = o.tarjeta_id),
    'card_id',    o.tarjeta_id,
    'minutos',    floor(extract(epoch from (now() - o.created_at)) / 60)::integer,
    'consultas',  o.consultas,
    -- Revisión 03/10: hace cuántos segundos se le preguntó a Bancard por
    -- última vez (null si nunca). Frena las consultas repetidas: la pantalla
    -- que sondea y la URL pública con un token que no coincide.
    'consulta_hace', (
      select floor(extract(epoch from (now() - max(e.created_at))))::integer
      from public.bancard_eventos e
      where e.operacion_id = o.id and e.tipo = 'consulta')
  )
  from public.bancard_operaciones o
  where o.id = p_operacion;
$fn$;

revoke all on function public.bancard_operacion_interna(bigint) from public, anon, authenticated;
grant execute on function public.bancard_operacion_interna(bigint) to service_role;

-- ------------------------------------------------------------
-- 5. CERRAR UNA OPERACIÓN SIN UNA RESPUESTA DE PAGO
--
--    'en_3ds'   el banco pide que la persona confirme (guarda el process_id).
--    'incierta' no se sabe qué pasó (se cortó el cobro): la resuelve la
--               conciliación consultando a Bancard. NUNCA se cobra de nuevo.
--    'vencida'  abandonada, o el pedido a Bancard falló.
--
--    Respeta la máquina de estados: sobre una pagada, una revertida o una ya
--    vencida no hace nada. Una rechazada solo pasa a vencida cuando el
--    servidor la cerró en Bancard ('reemplazada': reversa hecha, o
--    'RollbackSuccessful': la reversa encontró plata y la devolvió).
-- ------------------------------------------------------------
create or replace function public.bancard_cerrar_operacion(
  p_operacion bigint,
  p_estado    text,
  p_detalle   jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_op    public.bancard_operaciones;
  v_clave text := left(coalesce(p_detalle ->> 'clave', ''), 80);
begin
  if p_estado is null or p_estado not in ('en_3ds', 'incierta', 'vencida') then
    raise exception 'Ese pedido de pago no es válido.' using errcode = '22023';
  end if;

  select * into v_op from public.bancard_operaciones where id = p_operacion for update;
  if v_op.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'desconocida');
  end if;

  if not (
    (v_op.estado = 'creada')
    or (v_op.estado in ('en_3ds', 'incierta') and p_estado = 'vencida')
    or (v_op.estado = 'rechazada' and p_estado = 'vencida' and v_clave in ('reemplazada', 'RollbackSuccessful'))
  ) then
    return jsonb_build_object('ok', true, 'cambio', false, 'estado', v_op.estado);
  end if;

  if p_estado = 'en_3ds' then
    update public.bancard_operaciones
    set estado = 'en_3ds',
        process_id = left(coalesce(nullif(p_detalle ->> 'process_id', ''), process_id), 100),
        updated_at = now()
    where id = v_op.id;

    -- La tarea diaria no puede completar un 3D Secure: hace falta la persona.
    if v_op.origen = 'automatico' then
      update public.bancard_cuentas
      set debito_estado = 'requiere_3ds', updated_at = now()
      where empresa_id = v_op.empresa_id;
    end if;

  elsif p_estado = 'incierta' then
    update public.bancard_operaciones
    set estado = 'incierta', updated_at = now()
    where id = v_op.id;

  else
    update public.bancard_operaciones
    set estado = 'vencida',
        motivo = coalesce(nullif(v_clave, ''), motivo),
        updated_at = now()
    where id = v_op.id;

    -- Un 3D Secure del débito que nadie confirmó: se vuelve a intentar el
    -- día que toque.
    if v_op.origen = 'automatico' and v_op.estado = 'en_3ds' then
      update public.bancard_cuentas
      set debito_estado = 'reintentando', updated_at = now()
      where empresa_id = v_op.empresa_id and debito_estado = 'requiere_3ds';
    end if;

    -- Bancard dice que esa tarjeta ya no sirve: el débito no insiste.
    if v_op.tarjeta_id is not null and v_clave in ('CardBlockedError', 'CardNotFoundError') then
      update public.bancard_cuentas
      set debito_estado = 'pausado', ultimo_error = v_clave, ultimo_codigo = null, updated_at = now()
      where empresa_id = v_op.empresa_id and tarjeta_id = v_op.tarjeta_id;

    -- Revisión 03/10: un pedido que no llegó al banco no es un rechazo. Si
    -- el cobro automático se cierra sin que el banco haya contestado el
    -- charge (la lista de tarjetas falló, Bancard no aceptó el pedido, la
    -- conciliación no encontró ningún pago), el intento se devuelve y se
    -- vuelve a probar al día siguiente (`ultimo_intento` queda: un intento
    -- por día, también de infraestructura). Un 3D Secure que nadie
    -- confirmó sí cuenta: el banco contestó.
    elsif v_op.origen = 'automatico' and v_op.tarjeta_id is not null
          and v_op.estado in ('creada', 'incierta') then
      update public.bancard_cuentas
      set intentos = greatest(0, intentos - 1), updated_at = now()
      where empresa_id = v_op.empresa_id and tarjeta_id = v_op.tarjeta_id;
    end if;
  end if;

  -- Un 3D Secure del débito: hace falta la persona, así que el servidor le
  -- avisa. Solo acá se devuelve a quién (el resto no avisa nada).
  if p_estado = 'en_3ds' and v_op.origen = 'automatico' then
    return jsonb_build_object(
      'ok', true, 'cambio', true, 'estado', p_estado,
      'operacion',     v_op.id,
      'empresa_id',    v_op.empresa_id,
      'origen',        v_op.origen,
      'nombre',        (select e.nombre from public.empresas e where e.id = v_op.empresa_id),
      'destinatarios', public.bancard_destinatarios(v_op.empresa_id));
  end if;

  return jsonb_build_object('ok', true, 'cambio', true, 'estado', p_estado);
end $fn$;

revoke all on function public.bancard_cerrar_operacion(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.bancard_cerrar_operacion(bigint, text, jsonb) to service_role;

-- Dejarle una nota a la administración sobre una operación.
create or replace function public.bancard_marcar_revisar(p_operacion bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_ok boolean;
begin
  update public.bancard_operaciones
  set revisar = left(coalesce(nullif(trim(p_motivo), ''), 'Revisar'), 200), updated_at = now()
  where id = p_operacion;
  v_ok := found;
  return jsonb_build_object('ok', v_ok);
end $fn$;

revoke all on function public.bancard_marcar_revisar(bigint, text) from public, anon, authenticated;
grant execute on function public.bancard_marcar_revisar(bigint, text) to service_role;

-- ------------------------------------------------------------
-- 6. CONFIRMAR: EL ÚNICO LUGAR DONDE UN PAGO ACTIVA UN PLAN
--
--    `p_respuesta` es el objeto `operation` (confirmación, cobro con tarjeta
--    guardada) o `confirmation` (consulta) de Bancard, tal como llegó.
--
--    La máquina de estados, entera:
--      creada    → pagada | rechazada | en_3ds | incierta | vencida
--      en_3ds    → pagada | rechazada | vencida
--      incierta  → pagada | rechazada | vencida
--      rechazada → pagada   (un reintento adentro del mismo formulario)
--      vencida   → pagada   (un pago que entró tarde: la plata entró)
--      pagada    → pagada   (no toca NADA: idempotencia) | revertida
--      revertida → (nada)   (una aprobación acá no activa: queda para revisar)
--
--    Revisión 03/10: una aprobación sobre una operación que YA NO ESTABA
--    VIVA (rechazada, vencida) se vuelve a cotizar antes de activar. Si hoy
--    vale más (el 18 % del primer pago ya se usó en otro pago, la lista
--    subió, el equipo creció) o es un «sumar personas» cotizado para un
--    período que ya se renovó, es un conflicto: la plata se anota, el plan no
--    se toca, y lo mira una persona. Una `vencida` con motivo
--    'RollbackSuccessful' (Bancard devolvió la plata) se trata como revertida.
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
     and v_sus.periodo_fin > now() and v_sus.plan <> 'gratis' and v_sus.plan <> v_op.plan then
    v_conflicto := true;
    v_revisar := 'Pagó un plan distinto del que tiene activo: resolver a mano';
  end if;

  -- 6b. Revisión 03/10: lo que ya no estaba vivo se vuelve a cotizar. Una
  --     operación rechazada o vencida se cotizó en otro momento: si hoy vale
  --     más, o pertenece a un período que ya se renovó, no activa nada.
  if not v_viva and not v_conflicto then
    if v_op.tipo = 'plan' then
      begin
        v_hoy := public.precio_de_la_cuenta(v_op.empresa_id, v_op.plan, v_op.periodo, v_op.personas);
        if coalesce((v_op.desglose ->> 'primer_pago')::boolean, false)
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
      end if;

      update public.suscripciones
      set tope_vendedores = v_tope, updated_at = now()
      where empresa_id = v_op.empresa_id;

      update public.bancard_cuentas
      set personas_proxima = null, updated_at = now()
      where empresa_id = v_op.empresa_id and personas_proxima is not null;
    end;
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
        else 'bancard_personas'
      end,
      jsonb_build_object(
        'plan_antes',     v_sus.plan,
        'plan_despues',   case when v_op.tipo = 'plan' then v_op.plan else v_sus.plan end,
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
-- 7. REVERTIR UN PAGO APROBADO
--
--    La reversa a Bancard la pide el servidor; esto deshace en Orden lo que
--    el pago activó. La ruta llama primero con `p_solo_comprobar` (antes de
--    hablar con Bancard) y después de verdad.
--
--    Bancard solo revierte el mismo día. Después se tramita por el portal de
--    comercios y acá se marca con `p_sin_bancard`.
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

  if (v_op.tipo = 'plan' and v_sus.periodo_fin is distinct from v_op.vence_despues)
     or exists (
       select 1 from public.registro_admin r
       where r.empresa_id = v_op.empresa_id
         and r.accion in ('cambiar_plan', 'extender_prueba', 'bancard_personas')
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

  if coalesce(p_solo_comprobar, false) then
    return jsonb_build_object('puede', true);
  end if;

  -- La suscripción vuelve a la foto.
  v_antes := coalesce(v_op.antes, '{}'::jsonb);
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
    where empresa_id = v_op.empresa_id;
  end if;

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
    and accion in ('cambiar_plan', 'bancard_personas', 'bancard_prueba')
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
    'comision',        v_comision);
end $fn$;

revoke all on function public.bancard_revertir(bigint, uuid, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.bancard_revertir(bigint, uuid, text, boolean, boolean) to service_role;

-- ------------------------------------------------------------
-- 8. LAS TARJETAS
--
--    El alias de Bancard no se guarda nunca: se pide justo antes de cobrar o
--    de borrar. Acá vive solo el número que Orden le puso a la tarjeta, la
--    marca, los últimos cuatro y el tipo.
-- ------------------------------------------------------------

-- Pedir el formulario para guardar una tarjeta. Guarda el consentimiento del
-- cobro recurrente: quién, cuándo y qué texto aceptó.
create or replace function public.bancard_crear_catastro(
  p_empresa        uuid,
  p_usuario        uuid,
  p_entorno        text,
  p_telefono       text,
  p_consentimiento text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_pagador  bigint;
  v_telefono text;
  v_correo   text;
  v_tarjeta  bigint;
begin
  if p_entorno is null or p_entorno not in ('staging', 'produccion') then
    raise exception 'Ese pedido de pago no es válido.' using errcode = '22023';
  end if;
  if not public.bancard_administra(p_empresa, p_usuario) then
    raise exception 'Solo el dueño de la cuenta puede pagar el plan.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  -- Bancard exige teléfono y correo del usuario. El teléfono es el que
  -- escribió ahora o el que dejó al registrarse (ficha_cliente).
  v_telefono := nullif(trim(left(coalesce(p_telefono, ''), 30)), '');
  if v_telefono is null then
    select nullif(trim(f.telefono), '') into v_telefono
    from public.ficha_cliente f where f.empresa_id = p_empresa;
  end if;
  if v_telefono is null then
    raise exception 'Falta un teléfono para registrar la tarjeta.' using errcode = '22023';
  end if;

  select nullif(trim(u.email), '') into v_correo from auth.users u where u.id = p_usuario;
  if v_correo is null then
    raise exception 'Falta un correo para registrar la tarjeta.' using errcode = '22023';
  end if;

  if (
    select count(*) from public.bancard_tarjetas t
    where t.empresa_id = p_empresa and t.created_at > now() - interval '24 hours'
  ) >= public.bancard_catastros_por_dia() then
    raise exception 'Demasiados intentos hoy. Probá de nuevo más tarde o escribinos.' using errcode = '22023';
  end if;

  insert into public.bancard_pagadores (empresa_id, entorno)
  values (p_empresa, p_entorno)
  on conflict (empresa_id, entorno) do nothing;

  select p.id into v_pagador
  from public.bancard_pagadores p
  where p.empresa_id = p_empresa and p.entorno = p_entorno;

  insert into public.bancard_tarjetas (empresa_id, pagador_id, entorno, creada_por)
  values (p_empresa, v_pagador, p_entorno, p_usuario)
  returning id into v_tarjeta;

  insert into public.bancard_cuentas (empresa_id, aceptado_por, aceptado_at, aceptado_texto)
  values (p_empresa, p_usuario, now(), left(coalesce(p_consentimiento, ''), 600))
  on conflict (empresa_id) do update set
    aceptado_por   = excluded.aceptado_por,
    aceptado_at    = excluded.aceptado_at,
    aceptado_texto = excluded.aceptado_texto,
    updated_at     = now();

  -- Si la cuenta no tenía teléfono, queda el que acaba de dar.
  insert into public.ficha_cliente (empresa_id, telefono)
  values (p_empresa, v_telefono)
  on conflict (empresa_id) do update set
    telefono = excluded.telefono, updated_at = now()
  where coalesce(trim(public.ficha_cliente.telefono), '') = '';

  return jsonb_build_object(
    'card_id',  v_tarjeta,
    'user_id',  v_pagador,
    'telefono', v_telefono,
    'email',    v_correo);
end $fn$;

revoke all on function public.bancard_crear_catastro(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.bancard_crear_catastro(uuid, uuid, text, text, text) to service_role;

-- La tarjeta apareció en Bancard: queda activa. La que estaba activa pasa a
-- «por quitar» y se devuelve, para que el servidor la borre en Bancard.
-- Idempotente.
create or replace function public.bancard_activar_tarjeta(
  p_tarjeta  bigint,
  p_marca    text,
  p_ultimos4 text,
  p_tipo     text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_t        public.bancard_tarjetas;
  v_anterior bigint;
begin
  select * into v_t from public.bancard_tarjetas where id = p_tarjeta for update;
  if v_t.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'desconocida');
  end if;
  if v_t.estado = 'activa' then
    return jsonb_build_object('ok', true, 'ya', true, 'tarjeta', v_t.id, 'anterior', null,
      'user_id', v_t.pagador_id, 'marca', v_t.marca, 'ultimos4', v_t.ultimos4);
  end if;
  -- 'fallida' también: la persona pudo terminar el formulario después de que
  -- la conciliación la diera por abandonada, y Bancard la tiene.
  if v_t.estado not in ('pendiente', 'fallida') then
    return jsonb_build_object('ok', false, 'motivo', v_t.estado);
  end if;

  update public.bancard_tarjetas
  set estado = 'por_quitar', motivo = 'Reemplazada por otra tarjeta'
  where empresa_id = v_t.empresa_id and entorno = v_t.entorno and estado = 'activa'
  returning id into v_anterior;

  update public.bancard_tarjetas
  set estado      = 'activa',
      marca       = nullif(left(trim(coalesce(p_marca, '')), 30), ''),
      ultimos4    = case when coalesce(p_ultimos4, '') ~ '^[0-9]{4}$' then p_ultimos4 else null end,
      tipo        = case when p_tipo in ('credit', 'debit') then p_tipo else null end,
      activada_at = now(),
      motivo      = null
  where id = v_t.id;

  insert into public.bancard_cuentas (empresa_id, tarjeta_id, debito_activo, debito_estado, intentos)
  values (v_t.empresa_id, v_t.id, true, 'al_dia', 0)
  on conflict (empresa_id) do update set
    tarjeta_id    = excluded.tarjeta_id,
    debito_activo = true,
    debito_estado = 'al_dia',
    intentos      = 0,
    ciclo_fin     = null,
    ultimo_error  = null,
    ultimo_codigo = null,
    updated_at    = now();

  select * into v_t from public.bancard_tarjetas where id = p_tarjeta;
  return jsonb_build_object('ok', true, 'ya', false, 'tarjeta', v_t.id, 'anterior', v_anterior,
    'user_id', v_t.pagador_id, 'marca', v_t.marca, 'ultimos4', v_t.ultimos4);
end $fn$;

revoke all on function public.bancard_activar_tarjeta(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.bancard_activar_tarjeta(bigint, text, text, text) to service_role;

-- El formulario terminó (o se abandonó) y Bancard no tiene la tarjeta.
create or replace function public.bancard_tarjeta_fallida(p_tarjeta bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_ok boolean;
begin
  update public.bancard_tarjetas
  set estado = 'fallida', motivo = left(coalesce(p_motivo, ''), 200)
  where id = p_tarjeta and estado = 'pendiente';
  v_ok := found;
  return jsonb_build_object('ok', v_ok);
end $fn$;

revoke all on function public.bancard_tarjeta_fallida(bigint, text) from public, anon, authenticated;
grant execute on function public.bancard_tarjeta_fallida(bigint, text) to service_role;

-- Quitar la tarjeta, en dos pasos. 'pedido' apaga el débito EN EL MISMO ACTO
-- (la cancelación rige ya, aunque Bancard no conteste); 'hecho' la da por
-- borrada en Bancard. Sin persona solo se admite 'hecho' (la conciliación).
create or replace function public.bancard_quitar_tarjeta(
  p_tarjeta bigint,
  p_usuario uuid,
  p_paso    text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_t public.bancard_tarjetas;
begin
  if p_paso is null or p_paso not in ('pedido', 'hecho') then
    raise exception 'Ese pedido de pago no es válido.' using errcode = '22023';
  end if;

  select * into v_t from public.bancard_tarjetas where id = p_tarjeta for update;
  if v_t.id is null then
    raise exception 'No hay una tarjeta guardada.' using errcode = 'P0002';
  end if;

  if p_paso = 'pedido' or p_usuario is not null then
    if not public.bancard_administra(v_t.empresa_id, p_usuario) then
      raise exception 'Solo el dueño de la cuenta puede pagar el plan.' using errcode = '42501';
    end if;
  end if;

  if p_paso = 'pedido' then
    if v_t.estado = 'activa' then
      update public.bancard_tarjetas
      set estado = 'por_quitar', quitada_por = p_usuario, motivo = 'La quitó la persona'
      where id = v_t.id;
    end if;
    -- Aunque ya estuviera por quitar: el débito queda apagado.
    update public.bancard_cuentas
    set debito_activo = false, tarjeta_id = null, updated_at = now()
    where empresa_id = v_t.empresa_id and tarjeta_id = v_t.id;
  else
    update public.bancard_tarjetas
    set estado = 'quitada', quitada_at = now(), quitada_por = coalesce(p_usuario, quitada_por)
    where id = v_t.id and estado = 'por_quitar';
    -- Una activa que Bancard ya no tiene: también se va, con su débito.
    if v_t.estado = 'activa' then
      update public.bancard_tarjetas
      set estado = 'quitada', quitada_at = now(), quitada_por = p_usuario,
          motivo = 'Bancard ya no la tenía'
      where id = v_t.id;
      update public.bancard_cuentas
      set debito_activo = false, tarjeta_id = null, updated_at = now()
      where empresa_id = v_t.empresa_id and tarjeta_id = v_t.id;
    end if;
  end if;

  select * into v_t from public.bancard_tarjetas where id = p_tarjeta;
  return jsonb_build_object('ok', true, 'estado', v_t.estado, 'tarjeta', v_t.id,
    'user_id', v_t.pagador_id, 'card_id', v_t.id, 'empresa_id', v_t.empresa_id);
end $fn$;

revoke all on function public.bancard_quitar_tarjeta(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.bancard_quitar_tarjeta(bigint, uuid, text) to service_role;

-- Los dos números que hacen falta para pedirle a Bancard la tarjeta activa
-- de una cuenta. Null si no tiene.
create or replace function public.bancard_datos_de_tarjeta(p_empresa uuid, p_entorno text)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'user_id',    t.pagador_id,
    'card_id',    t.id,
    'tarjeta_id', t.id,
    'marca',      t.marca,
    'ultimos4',   t.ultimos4)
  from public.bancard_tarjetas t
  where t.empresa_id = p_empresa and t.entorno = p_entorno and t.estado = 'activa';
$fn$;

revoke all on function public.bancard_datos_de_tarjeta(uuid, text) from public, anon, authenticated;
grant execute on function public.bancard_datos_de_tarjeta(uuid, text) to service_role;

-- Lo mismo para una tarjeta cualquiera (la verificación y la conciliación).
create or replace function public.bancard_tarjeta_interna(p_tarjeta bigint)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'tarjeta_id', t.id,
    'card_id',    t.id,
    'user_id',    t.pagador_id,
    'empresa_id', t.empresa_id,
    'entorno',    t.entorno,
    'estado',     t.estado)
  from public.bancard_tarjetas t
  where t.id = p_tarjeta;
$fn$;

revoke all on function public.bancard_tarjeta_interna(bigint) from public, anon, authenticated;
grant execute on function public.bancard_tarjeta_interna(bigint) to service_role;

-- ------------------------------------------------------------
-- 9. LO QUE NECESITA LA TAREA DIARIA
-- ------------------------------------------------------------

-- Toma EL SIGUIENTE cobro que toca y lo reserva en la misma transacción
-- (crea la operación). Null si no hay ninguno. Llamarla dos veces a la vez
-- nunca devuelve la misma cuenta: `skip locked`, `ultimo_intento = hoy` y el
-- índice de «una viva».
--
-- Revisión 03/10: también una cuenta EN PRUEBA con la tarjeta guardada. La
-- pantalla le prometió «el día anterior al vencimiento cobramos tu plan de
-- esta tarjeta» y el consentimiento dice «en cada renovación»: la prueba
-- termina y sigue su plan, cobrado de la tarjeta (con el descuento de la
-- racha si lo ganó). Pregunta abierta para Matías en la guía.
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
    and s.estado in ('activa', 'prueba') and s.plan <> 'gratis' and s.periodo_fin is not null
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
    and s.estado in ('activa', 'prueba') and s.plan <> 'gratis'
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
  if v.n > 0 then
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

-- Las cuentas con débito al día que vencen en 5 días: para el aviso «tu
-- tarjeta vence antes del próximo cobro», que se decide pidiéndole la
-- tarjeta a Bancard en vivo (el vencimiento no se guarda).
create or replace function public.bancard_tarjetas_por_revisar(p_entorno text)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'empresa_id',    c.empresa_id,
    'user_id',       t.pagador_id,
    'card_id',       t.id,
    'marca',         t.marca,
    'ultimos4',      t.ultimos4,
    'fecha_fin',     d.fin,
    'fecha_cobro',   d.fin + (public.bancard_dias_de_cobro())[1],
    'destinatarios', public.bancard_destinatarios(c.empresa_id)
  ) order by d.fin, c.empresa_id), '[]'::jsonb)
  from public.bancard_cuentas c
  join public.suscripciones s on s.empresa_id = c.empresa_id
  join public.empresas e on e.id = c.empresa_id
  join public.bancard_tarjetas t on t.id = c.tarjeta_id
  cross join lateral (
    select (s.periodo_fin at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date as fin,
           (now() at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date as hoy
  ) d
  where c.debito_activo and c.debito_estado = 'al_dia'
    and t.estado = 'activa' and t.entorno = p_entorno
    and s.estado in ('activa', 'prueba') and s.plan <> 'gratis'
    and not coalesce(s.cancela_al_vencer, false)
    and s.periodo_fin is not null
    and d.fin - d.hoy = 5;
$fn$;

revoke all on function public.bancard_tarjetas_por_revisar(text) from public, anon, authenticated;
grant execute on function public.bancard_tarjetas_por_revisar(text) to service_role;

-- Lo que la conciliación tiene que resolver: operaciones vivas de más de 10
-- minutos (el manual: pasado ese tiempo, consultar), tarjetas a medio
-- guardar y tarjetas que falta borrar en Bancard.
create or replace function public.bancard_por_conciliar(p_entorno text, p_limite integer default 10)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'operaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',      x.id,
        'estado',  x.estado,
        'medio',   x.medio,
        'origen',  x.origen,
        'minutos', x.minutos,
        'vencida', x.minutos >= case when x.estado = 'en_3ds' then public.bancard_minutos_de_3ds()
                                     else public.bancard_minutos_de_vida() end,
        'entorno', x.entorno
      ) order by x.created_at)
      from (
        select o.id, o.estado, o.medio, o.origen, o.entorno, o.created_at,
               floor(extract(epoch from (now() - o.created_at)) / 60)::integer as minutos
        from public.bancard_operaciones o
        where o.estado in ('creada', 'en_3ds', 'incierta')
          and o.entorno = p_entorno
          and o.created_at < now() - interval '10 minutes'
        order by o.created_at
        limit greatest(1, least(coalesce(p_limite, 10), 100))
      ) x
    ), '[]'::jsonb),
    'tarjetas_pendientes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tarjeta_id', x.id, 'card_id', x.id, 'user_id', x.pagador_id, 'empresa_id', x.empresa_id
      ) order by x.created_at)
      from (
        select t.id, t.pagador_id, t.empresa_id, t.created_at
        from public.bancard_tarjetas t
        where t.estado = 'pendiente' and t.entorno = p_entorno
          and t.created_at < now() - interval '30 minutes'
        order by t.created_at
        limit greatest(1, least(coalesce(p_limite, 10), 100))
      ) x
    ), '[]'::jsonb),
    'tarjetas_por_quitar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tarjeta_id', x.id, 'card_id', x.id, 'user_id', x.pagador_id, 'empresa_id', x.empresa_id
      ) order by x.created_at)
      from (
        select t.id, t.pagador_id, t.empresa_id, t.created_at
        from public.bancard_tarjetas t
        where t.estado = 'por_quitar' and t.entorno = p_entorno
        order by t.created_at
        limit greatest(1, least(coalesce(p_limite, 10), 100))
      ) x
    ), '[]'::jsonb),
    -- Las vivas del otro entorno (el servidor cambió de staging a
    -- producción): se cierran sin llamar a Bancard.
    'de_otro_entorno', coalesce((
      select jsonb_agg(o.id order by o.created_at)
      from public.bancard_operaciones o
      where o.estado in ('creada', 'en_3ds', 'incierta')
        and o.entorno <> p_entorno
        and o.created_at < now() - make_interval(mins => public.bancard_minutos_de_3ds())
    ), '[]'::jsonb),
    -- Revisión 03/10: las rechazadas de formulario que todavía tienen un
    -- formulario abierto en Bancard. Diez minutos después del rechazo (el
    -- reintento adentro del mismo formulario ya pasó) se les manda la
    -- reversa y se cierran: una rechazada no queda pagable para siempre.
    'rechazadas', coalesce((
      select jsonb_agg(x.id order by x.id)
      from (
        select o.id from public.bancard_operaciones o
        where o.estado = 'rechazada' and o.medio = 'formulario' and o.entorno = p_entorno
          and o.process_id is not null
          and o.updated_at < now() - interval '10 minutes'
          and o.created_at > now() - interval '24 hours'
        order by o.id
        limit greatest(1, least(coalesce(p_limite, 10), 100))
      ) x
    ), '[]'::jsonb)
  );
$fn$;

revoke all on function public.bancard_por_conciliar(text, integer) from public, anon, authenticated;
grant execute on function public.bancard_por_conciliar(text, integer) to service_role;

-- El registro de lo que se habló con Bancard. El detalle se guarda saneado.
create or replace function public.bancard_anotar_evento(
  p_operacion bigint,
  p_tarjeta   bigint,
  p_entorno   text,
  p_tipo      text,
  p_ok        boolean,
  p_clave     text,
  p_http      integer,
  p_detalle   jsonb
)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  -- Revisión 03/10: un número que Orden no creó se anota una vez por día
  -- (la URL es pública: mil POST no pueden ser mil filas). Lo mismo para
  -- una confirmación que no cambia nada: la del otro entorno y la de un
  -- token que no coincide sobre una operación ya terminada (los números son
  -- correlativos: cada operación vieja es un blanco).
  if p_tipo = 'confirmacion' and p_operacion is not null
     and p_clave in ('desconocida', 'otro_entorno', 'token_invalido_cerrada', 'token_de_charge_cerrada')
     and exists (
    select 1 from public.bancard_eventos e
    where e.operacion_id = p_operacion and e.tipo = 'confirmacion' and e.clave = p_clave
      and e.created_at > now() - interval '24 hours'
  ) then
    return;
  end if;

  insert into public.bancard_eventos (operacion_id, tarjeta_id, entorno, tipo, ok, clave, http, detalle)
  values (
    p_operacion, p_tarjeta, left(p_entorno, 20), left(coalesce(nullif(p_tipo, ''), 'otro'), 40),
    coalesce(p_ok, false), left(p_clave, 80), p_http, public.bancard_sanear_detalle(p_detalle));

  if p_tipo = 'consulta' and p_operacion is not null then
    update public.bancard_operaciones
    set consultas = consultas + 1
    where id = p_operacion;
  end if;
end $fn$;

revoke all on function public.bancard_anotar_evento(bigint, bigint, text, text, boolean, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.bancard_anotar_evento(bigint, bigint, text, text, boolean, text, integer, jsonb)
  to service_role;

-- ------------------------------------------------------------
-- 10. LO QUE LEEN LAS PANTALLAS (con sesión y con la guarda adentro)
-- ------------------------------------------------------------

-- Para decidir quién ve Bancard. No dice nada de tarjetas.
create or replace function public.bancard_acceso(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_miembro(p_empresa) and not public.es_superadmin() then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'superadmin', public.es_superadmin(),
    'habilitada', coalesce((select c.habilitada from public.bancard_cuentas c where c.empresa_id = p_empresa), false),
    'admin',      public.es_admin(p_empresa));
end $fn$;

revoke all on function public.bancard_acceso(uuid) from public, anon;
grant execute on function public.bancard_acceso(uuid) to authenticated;

-- La tarjeta guardada, el débito, las personas del Premium, la operación
-- viva y el último pago. Solo para quien administra la cuenta.
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
  -- reintento que sigue. También en la prueba (revisión 03/10): la tarjeta
  -- guardada la convierte.
  v_hoy := (now() at time zone v_zona)::date;
  if v_tarjeta.id is not null and coalesce(v_cuenta.debito_activo, false)
     and v_cuenta.debito_estado in ('al_dia', 'reintentando')
     and v_sus.estado in ('activa', 'prueba') and v_sus.plan <> 'gratis' and v_sus.periodo_fin is not null
     and not coalesce(v_sus.cancela_al_vencer, false) then
    v_fin := (v_sus.periodo_fin at time zone v_zona)::date;
    v_n   := case when v_cuenta.ciclo_fin is distinct from v_fin then 0 else v_cuenta.intentos end;
    if v_n < array_length(v_dias, 1) then
      v_fecha := greatest(
        v_fin + v_dias[v_n + 1],
        case when v_cuenta.ultimo_intento = v_hoy then v_hoy + 1 else v_hoy end);
    end if;
  end if;

  return jsonb_build_object(
    'tarjeta', case when v_tarjeta.id is null then null else jsonb_build_object(
      'id', v_tarjeta.id, 'marca', v_tarjeta.marca, 'ultimos4', v_tarjeta.ultimos4, 'tipo', v_tarjeta.tipo) end,
    'debito', jsonb_build_object(
      'activo',       v_tarjeta.id is not null and coalesce(v_cuenta.debito_activo, false),
      'estado',       coalesce(v_cuenta.debito_estado, 'al_dia'),
      'fecha_cobro',  v_fecha,
      'importe',      case when v_sus.estado in ('activa', 'prueba') then public.bancard_importe_de_renovacion(p_empresa) else null end,
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

-- Una operación, para la pantalla de resultado y el comprobante. Devuelve
-- SOLO lo que el manual de Bancard deja mostrar: fecha, número de pedido,
-- importe y descripción de la respuesta. Nunca el número de autorización, el
-- código de respuesta, la respuesta extendida ni los datos de seguridad.
-- «No es tuyo» y «no existe» contestan lo mismo.
create or replace function public.bancard_operacion_ver(p_operacion bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_op public.bancard_operaciones;
begin
  select * into v_op from public.bancard_operaciones where id = p_operacion;

  if v_op.id is null or not (public.es_admin(v_op.empresa_id) or public.es_superadmin()) then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'operacion',             v_op.id,
    'estado',                v_op.estado,
    'tipo',                  v_op.tipo,
    'medio',                 v_op.medio,
    'origen',                v_op.origen,
    'plan',                  v_op.plan,
    'periodo',               v_op.periodo,
    'personas',              v_op.personas,
    'desglose',              v_op.desglose,
    'importe',               v_op.importe,
    'moneda',                v_op.moneda,
    'fecha',                 coalesce(v_op.confirmada_at, v_op.created_at),
    'minutos',               floor(extract(epoch from (now() - v_op.created_at)) / 60)::integer,
    'descripcion_respuesta', v_op.respuesta ->> 'response_description',
    'vence',                 v_op.vence_despues,
    'entorno',               v_op.entorno,
    'tarjeta',               (
      select jsonb_build_object('marca', t.marca, 'ultimos4', t.ultimos4)
      from public.bancard_tarjetas t where t.id = v_op.tarjeta_id),
    -- Solo mientras hace falta para abrir el formulario, y solo a quien la
    -- inició (o a quien administra la cuenta, si la inició la tarea diaria).
    'process_id',            case
      when v_op.estado in ('creada', 'en_3ds')
           and (v_op.usuario_id = auth.uid() or v_op.origen = 'automatico')
      then v_op.process_id else null end);
end $fn$;

revoke all on function public.bancard_operacion_ver(bigint) from public, anon;
grant execute on function public.bancard_operacion_ver(bigint) to authenticated;

-- «Bajar desde la próxima renovación»: no cobra nada, deja anotado por
-- cuántas personas se renueva. Null lo deshace.
create or replace function public.bancard_bajar_personas(p_empresa uuid, p_personas integer)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_sus      public.suscripciones;
  v_tipo     text;
  v_miembros integer;
  v_min      integer;
begin
  if not public.es_admin(p_empresa) then
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

  insert into public.bancard_cuentas (empresa_id, personas_proxima)
  values (p_empresa, p_personas)
  on conflict (empresa_id) do update set
    personas_proxima = excluded.personas_proxima, updated_at = now();

  return jsonb_build_object(
    'personas_proxima', p_personas,
    'contratadas',      v_sus.tope_vendedores + 1,
    'importe',          public.bancard_importe_de_renovacion(p_empresa));
end $fn$;

revoke all on function public.bancard_bajar_personas(uuid, integer) from public, anon;
grant execute on function public.bancard_bajar_personas(uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- 11. LA ADMINISTRACIÓN DE ORDEN
-- ------------------------------------------------------------

-- El interruptor por cuenta: quién puede pagar con Bancard mientras no está
-- abierto a todos (la cuenta de prueba que se le da al certificador).
create or replace function public.habilitar_bancard(p_empresa uuid, p_si boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  insert into public.bancard_cuentas (empresa_id, habilitada, habilitada_por, habilitada_at)
  values (p_empresa, coalesce(p_si, false), auth.uid(), now())
  on conflict (empresa_id) do update set
    habilitada     = excluded.habilitada,
    habilitada_por = excluded.habilitada_por,
    habilitada_at  = excluded.habilitada_at,
    updated_at     = now();

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'habilitar_bancard', jsonb_build_object('habilitada', coalesce(p_si, false)));

  return jsonb_build_object('habilitada', coalesce(p_si, false));
end $fn$;

revoke all on function public.habilitar_bancard(uuid, boolean) from public, anon;
grant execute on function public.habilitar_bancard(uuid, boolean) to authenticated;

-- Los pagos, con TODO: acá sí van la autorización, el ticket, el código y la
-- respuesta extendida, lo que hay para revisar, los últimos eventos de cada
-- uno y si se puede revertir. Con una cuenta, los de esa cuenta (y arriba,
-- si está habilitada, su tarjeta y su débito); sin cuenta, los últimos de
-- todas, con los que hay que revisar primero.
create or replace function public.bancard_operaciones_admin(
  p_empresa uuid default null,
  p_limite  integer default 50
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_lista  jsonb := '[]'::jsonb;
  v_puede  boolean;
  v_porque text;
  r        record;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  for r in
    select o.*, e.nombre as empresa_nombre
    from public.bancard_operaciones o
    join public.empresas e on e.id = o.empresa_id
    where p_empresa is null or o.empresa_id = p_empresa
    order by (case when p_empresa is null and o.revisar is not null then 0 else 1 end), o.created_at desc
    limit greatest(1, least(coalesce(p_limite, 50), 200))
  loop
    v_puede  := false;
    v_porque := null;
    if r.estado = 'pagada' then
      begin
        perform public.bancard_revertir(r.id, auth.uid(), '', true, false);
        v_puede := true;
      exception when others then
        v_porque := sqlerrm;
      end;
    end if;

    v_lista := v_lista || jsonb_build_array(jsonb_build_object(
      'operacion',     r.id,
      'empresa_id',    r.empresa_id,
      'empresa',       r.empresa_nombre,
      'entorno',       r.entorno,
      'tipo',          r.tipo,
      'medio',         r.medio,
      'origen',        r.origen,
      'plan',          r.plan,
      'periodo',       r.periodo,
      'personas',      r.personas,
      'desglose',      r.desglose,
      'importe',       r.importe,
      'estado',        r.estado,
      'creada',        r.created_at,
      'confirmada',    r.confirmada_at,
      'fuente',        r.fuente,
      'descripcion',   r.respuesta ->> 'response_description',
      'codigo',        r.respuesta ->> 'response_code',
      'autorizacion',  r.respuesta ->> 'authorization_number',
      'ticket',        r.respuesta ->> 'ticket_number',
      'respuesta',     r.respuesta
    ) || jsonb_build_object(
      'antes',         r.antes,
      'vence',         r.vence_despues,
      'ingreso_id',    r.ingreso_id,
      'comision_id',   r.comision_id,
      'revertida',     r.revertida_at,
      'motivo',        r.motivo,
      'revisar',       r.revisar,
      'consultas',     r.consultas,
      'puede_revertir', v_puede,
      'por_que_no',    v_porque,
      'eventos',       coalesce((
        select jsonb_agg(jsonb_build_object(
          'tipo', x.tipo, 'ok', x.ok, 'clave', x.clave, 'http', x.http,
          'detalle', x.detalle, 'cuando', x.created_at) order by x.created_at desc)
        from (
          select ev.* from public.bancard_eventos ev
          where ev.operacion_id = r.id
          order by ev.created_at desc
          limit 10
        ) x
      ), '[]'::jsonb)));
  end loop;

  return jsonb_build_object(
    'habilitada', case when p_empresa is null then null else
      coalesce((select c.habilitada from public.bancard_cuentas c where c.empresa_id = p_empresa), false) end,
    'tarjeta', case when p_empresa is null then null else (
      select jsonb_build_object(
        'id', t.id, 'entorno', t.entorno, 'marca', t.marca, 'ultimos4', t.ultimos4, 'tipo', t.tipo,
        'bloqueada_hasta', t.bloqueada_hasta, 'activada', t.activada_at)
      from public.bancard_cuentas c
      join public.bancard_tarjetas t on t.id = c.tarjeta_id
      where c.empresa_id = p_empresa) end,
    'debito', case when p_empresa is null then null else (
      select jsonb_build_object(
        'activo', c.debito_activo, 'estado', c.debito_estado, 'ciclo_fin', c.ciclo_fin,
        'intentos', c.intentos, 'ultimo_intento', c.ultimo_intento,
        'ultimo_error', c.ultimo_error, 'ultimo_codigo', c.ultimo_codigo,
        'personas_proxima', c.personas_proxima, 'aceptado_at', c.aceptado_at)
      from public.bancard_cuentas c
      where c.empresa_id = p_empresa) end,
    'operaciones', v_lista);
end $fn$;

revoke all on function public.bancard_operaciones_admin(uuid, integer) from public, anon;
grant execute on function public.bancard_operaciones_admin(uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- 12. «DESHACER EL ÚLTIMO CAMBIO» NO SE COME UN PAGO DE BANCARD
--
--    Copia exacta de la 022. Cambia: después de elegir el renglón, si ese
--    cambio es un pago de Bancard, o si después de él hubo un pago de
--    Bancard, se niega. Un pago con tarjeta se revierte con
--    `bancard_revertir`, que primero le pide la reversa a Bancard.
-- ------------------------------------------------------------
create or replace function public.deshacer_ultimo_cambio(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_reg     public.registro_admin;
  v_plan    text;
  v_estado  text;
  v_fin     timestamptz;
  v_ingreso uuid;
  v_anulado boolean := false;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_reg
  from public.registro_admin
  where empresa_id = p_empresa
    and accion in ('cambiar_plan', 'extender_prueba')
  order by created_at desc
  limit 1;

  if v_reg.id is null then
    raise exception 'No hay ningún cambio para deshacer en esta cuenta.' using errcode = 'P0002';
  end if;

  -- 125: un pago de Bancard no se deshace desde acá.
  if v_reg.detalle->>'via' = 'bancard' or exists (
    select 1 from public.bancard_operaciones o
    where o.empresa_id = p_empresa and o.estado = 'pagada'
      and o.confirmada_at > v_reg.created_at
  ) then
    raise exception 'Ese cambio tiene un pago con Bancard: se revierte desde los pagos de Bancard de la cuenta.'
      using errcode = '22023';
  end if;

  -- Ya se deshizo: sin esto, tocar dos veces dejaría el estado de dos
  -- cambios atrás, que es un estado que nunca existió.
  if coalesce((v_reg.detalle->>'deshecho')::boolean, false) then
    raise exception 'Ese cambio ya se deshizo.' using errcode = '22023';
  end if;

  v_plan   := coalesce(v_reg.detalle->>'plan_antes', 'pro');
  v_estado := coalesce(v_reg.detalle->>'estado_antes', 'prueba');
  v_fin    := nullif(v_reg.detalle->>'vence_antes', '')::timestamptz;

  update public.suscripciones
  set plan = v_plan,
      estado = v_estado,
      periodo_fin = v_fin,
      updated_at = now()
  where empresa_id = p_empresa;

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas
  set plan = case when v_plan = 'gratis' then 'gratis' else 'pro' end
  where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  -- El cobro que se había anotado, si lo hubo.
  v_ingreso := nullif(v_reg.detalle->>'ingreso_id', '')::uuid;
  if v_ingreso is not null then
    update public.movimientos
    set estado = 'anulado',
        anulado_por = auth.uid(),
        anulado_at = now(),
        motivo_anulacion = 'Se deshizo la activación desde el panel'
    where id = v_ingreso and estado = 'activo';
    v_anulado := found;
  end if;

  -- Se marca el registro para que no se pueda deshacer dos veces.
  update public.registro_admin
  set detalle = detalle || jsonb_build_object('deshecho', true, 'deshecho_at', now())
  where id = v_reg.id;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'deshacer', jsonb_build_object(
    'registro', v_reg.id,
    'volvio_a_plan', v_plan,
    'volvio_a_estado', v_estado,
    'volvio_a_vencer', v_fin,
    'ingreso_anulado', v_anulado
  ));

  return jsonb_build_object(
    'plan', v_plan, 'estado', v_estado, 'periodo_fin', v_fin,
    'ingreso_anulado', v_anulado
  );
end $fn$;

revoke all on function public.deshacer_ultimo_cambio(uuid) from public, anon;
grant execute on function public.deshacer_ultimo_cambio(uuid) to authenticated;

-- ------------------------------------------------------------
-- 13. LA REVISIÓN DEL 03/10: EL TOPE DE PERSONAS Y LA PURGA DEL REGISTRO
-- ------------------------------------------------------------

-- El tope de personas mira lo que se está por pagar. Copia exacta de la 048.
-- Cambia: al tope de siempre se le aplica `least` con la baja programada
-- (`bancard_cuentas.personas_proxima`) y con la renovación VIVA del Premium
-- por menos personas. Sin eso, entre crear la renovación por 4 y confirmarla
-- entraban 8 con el código y nadie los sacaba.
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
    )
  end;
$fn$;

revoke all on function public.tope_de_miembros(uuid) from public, anon;
grant execute on function public.tope_de_miembros(uuid) to authenticated;

-- El registro de lo hablado con Bancard no crece sin tope: la conciliación
-- borra lo de más de 90 días (nunca menos de 30). Devuelve cuántas filas.
create or replace function public.bancard_purgar_eventos(p_dias integer default 90)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_n integer;
begin
  delete from public.bancard_eventos
  where created_at < now() - make_interval(days => greatest(coalesce(p_dias, 90), 30));
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke all on function public.bancard_purgar_eventos(integer) from public, anon, authenticated;
grant execute on function public.bancard_purgar_eventos(integer) to service_role;
