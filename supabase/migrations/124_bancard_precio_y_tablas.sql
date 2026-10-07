-- ============================================================
-- 124 · BANCARD (1 de 3): EL PRECIO QUE SE COBRA Y LAS TABLAS
-- ============================================================
--
-- Matías (02/10/2026): ya tiene contratado Bancard vPOS 2.0 y quiere que las
-- suscripciones se paguen con tarjeta y QR sin tener que escribirle por
-- WhatsApp. «Al momento de pagar con tarjeta o QR, el propietario elige
-- cuántos funcionarios va a querer, y de acuerdo a eso aparece el precio».
--
-- Son tres migraciones chicas (se aplican de a una):
--
--   · 124 (esta): las secuencias, las tablas y LA ÚNICA FUENTE DEL IMPORTE.
--   · 125: las operaciones, la confirmación, la reversa, las tarjetas, el
--     débito, lo que leen las pantallas y la administración.
--   · 126: el aviso de vencimiento que sabe de Bancard y el reloj.
--
-- HASTA ACÁ NO EXISTÍA «CUÁNTO HAY QUE COBRARLE A ESTA CUENTA»
--
-- La lista vivía en `precios`, las personas extra del Premium en
-- `precios_adicionales`, el descuento en `descuento_por_racha`, y la suma la
-- hacía una persona en el panel. Una pasarela no puede cobrar así. Desde acá
-- hay UNA función, `precio_de_la_cuenta`: la pantalla la muestra, el inicio
-- del pago congela su resultado en la operación, la confirmación lo compara
-- y la tarea diaria lo vuelve a pedir. El importe nunca viaja desde el
-- navegador.
--
-- LAS REGLAS DEL PRECIO (todo en guaraníes enteros)
--
--   · Lista: la fila de `precios` del tipo de cuenta, el plan y el período.
--   · El año se cobra por 11 meses y da 12 de servicio (así está la lista).
--   · Premium de un negocio: su precio trae 4 personas (el dueño y 3 más,
--     `personas_incluidas_premium()`), y cada persona más cuesta lo que dice
--     `precio_por_vendedor()` (050) por cada mes cobrado, hasta el tope del
--     plan (`limites_plan('negocio')`, 15). La cantidad se elige al pagar y
--     no puede ser menor que el equipo que la cuenta ya tiene.
--   · Descuento: el de la racha de la prueba (18 % un negocio, 5 % una cuenta
--     personal) SOLO en el primer pago de la cuenta; el de la constancia
--     (5 %) en las renovaciones de quien ya pagó. Se aplica sobre UN mes de
--     lista con sus personas, también cuando se paga el año. Esas dos
--     decisiones están en una sola línea (`v_base`) y son preguntas abiertas
--     para Matías.
--   · «Ya pagó» es un hecho guardado (`cuenta_ya_pago`): antes, a una cuenta
--     que pagó y fue cortada le volvía a aparecer el 18 % del primer mes.
--
-- `descuento_por_racha` NO LA PODÍA LLAMAR EL SERVIDOR SIN SESIÓN
--
-- Exige `es_admin` o `es_superadmin`, y ni la confirmación de Bancard ni la
-- tarea diaria tienen sesión. Su cuerpo pasa entero a `descuento_de_la_cuenta`
-- (interna, sin guarda, cerrada a todos) y `descuento_por_racha` queda como
-- envoltorio con la guarda de siempre: misma firma, mismos permisos, misma
-- respuesta.
--
-- LAS TABLAS
--
-- Cinco, todas `bancard_*`, con RLS activa, SIN policies y sin ningún permiso
-- para `anon` ni `authenticated`: se leen y se escriben solo por funciones
-- `security definer`. Un vendedor no ve nada de plata ni de tarjetas. No
-- llevan los triggers `cuenta_activa_*` (110, 111): un negocio vencido tiene
-- que poder pagar.
--
-- De la tarjeta se guarda el número que Orden le dio (`card_id`), la marca,
-- los últimos cuatro y si es de crédito o débito. Nunca el número, el
-- enmascarado completo, el vencimiento, el código ni el alias: el manual de
-- Bancard lo prohíbe y el alias dura minutos (se pide justo antes de cobrar).
--
-- Cada fila guarda su `entorno` (staging | produccion): hay una sola base, y
-- un pago de prueba no puede contar como plata.
--
-- MENSAJES NUEVOS (con su portugués en src/lib/mensajes-base.ts)
--
--   · «Ese período de cobro no existe.»
--   · «Ese plan no está disponible para tu rubro.»
--   · «Ese plan no tiene precio cargado.»
--   · «Elegí cuántas personas van a usar la cuenta (entre % y %).»
--   · «Ese plan no lleva cantidad de personas.»
--   · «No está cargado el precio por persona.»
--   · «Primero renová tu plan eligiendo cuántas personas son.»
--   · «Ya tenés esa cantidad de personas o más.»
--
-- Idempotente: `create ... if not exists`, `create or replace` y revoke/grant.
-- Sin una sola barra invertida (el MCP con el que se aplica las duplica).
-- ============================================================

-- ------------------------------------------------------------
-- 1. LAS SECUENCIAS
--
--    Bancard identifica todo con ENTEROS que inventa el comercio: el pedido
--    (`shop_process_id`, hasta 15 dígitos), el usuario (`user_id`) y la
--    tarjeta (`card_id`). Orden usa uuid en todo, así que hacen falta tres
--    numeraciones propias. Ninguna empieza en cero ni se reusa: un intento
--    fallido quema su número.
-- ------------------------------------------------------------
create sequence if not exists public.bancard_operacion_seq start 1000001;
create sequence if not exists public.bancard_pagador_seq start 5001;
create sequence if not exists public.bancard_tarjeta_seq start 101;

revoke all on sequence public.bancard_operacion_seq from public, anon, authenticated;
revoke all on sequence public.bancard_pagador_seq from public, anon, authenticated;
revoke all on sequence public.bancard_tarjeta_seq from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. LAS TABLAS
-- ------------------------------------------------------------

-- El número de usuario que Orden le da a Bancard. Uno por cuenta y entorno:
-- la tarjeta es de la suscripción, no de la persona que la cargó.
create table if not exists public.bancard_pagadores (
  id          bigint primary key default nextval('public.bancard_pagador_seq'),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  entorno     text not null check (entorno in ('staging', 'produccion')),
  created_at  timestamptz not null default now(),
  unique (empresa_id, entorno)
);

-- La tarjeta guardada. `id` ES el card_id de Bancard.
create table if not exists public.bancard_tarjetas (
  id              bigint primary key default nextval('public.bancard_tarjeta_seq'),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  pagador_id      bigint not null references public.bancard_pagadores (id) on delete cascade,
  entorno         text not null check (entorno in ('staging', 'produccion')),
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'activa', 'por_quitar', 'quitada', 'fallida')),
  marca           text check (char_length(marca) <= 30),
  ultimos4        text check (ultimos4 ~ '^[0-9]{4}$'),
  tipo            text check (tipo in ('credit', 'debit')),
  -- La respuesta «INHABILITACIÓN 30 DIAS EN COMERCIO» del manual.
  bloqueada_hasta timestamptz,
  creada_por      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  activada_at     timestamptz,
  quitada_at      timestamptz,
  quitada_por     uuid references auth.users (id) on delete set null,
  motivo          text check (char_length(motivo) <= 200)
);

comment on table public.bancard_tarjetas is
  'La tarjeta guardada de una cuenta. Solo card_id, marca, últimos 4 y tipo. PROHIBIDO agregar columnas para el número, el enmascarado completo, el vencimiento, el código o el alias.';

-- Una sola activa por cuenta y entorno.
create unique index if not exists bancard_tarjetas_una_activa
  on public.bancard_tarjetas (empresa_id, entorno) where estado = 'activa';
create index if not exists bancard_tarjetas_empresa_idx
  on public.bancard_tarjetas (empresa_id, created_at desc);

-- Lo de Bancard de cada cuenta. Una fila por empresa; nace al habilitarla,
-- al guardar una tarjeta o al programar una baja de personas.
create table if not exists public.bancard_cuentas (
  empresa_id        uuid primary key references public.empresas (id) on delete cascade,
  -- El interruptor por cuenta: lo escribe la administración desde /admin.
  habilitada        boolean not null default false,
  habilitada_por    uuid references auth.users (id) on delete set null,
  habilitada_at     timestamptz,
  -- La tarjeta del débito.
  tarjeta_id        bigint references public.bancard_tarjetas (id) on delete set null,
  debito_activo     boolean not null default false,
  debito_estado     text not null default 'al_dia'
                    check (debito_estado in ('al_dia', 'reintentando', 'requiere_3ds', 'pausado')),
  -- El vencimiento al que pertenecen los intentos.
  ciclo_fin         date,
  intentos          integer not null default 0 check (intentos >= 0),
  ultimo_intento    date,
  -- response_description del último rechazo.
  ultimo_error      text check (char_length(ultimo_error) <= 120),
  ultimo_codigo     text check (char_length(ultimo_codigo) <= 4),
  -- «Bajar desde la próxima renovación».
  personas_proxima  integer check (personas_proxima between 4 and 15),
  -- El consentimiento del cobro recurrente: quién, cuándo y qué texto aceptó.
  aceptado_por      uuid references auth.users (id) on delete set null,
  aceptado_at       timestamptz,
  aceptado_texto    text check (char_length(aceptado_texto) <= 600),
  updated_at        timestamptz not null default now()
);

-- Una operación = un intento = un shop_process_id. Guarda TODO lo elegido:
-- la confirmación de Bancard trae solo el número.
create table if not exists public.bancard_operaciones (
  id             bigint primary key default nextval('public.bancard_operacion_seq'),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  -- null = la tarea diaria.
  usuario_id     uuid references auth.users (id) on delete set null,
  entorno        text not null check (entorno in ('staging', 'produccion')),
  -- 'personas' = sumar gente al Premium, prorrateado.
  tipo           text not null check (tipo in ('plan', 'personas')),
  -- formulario = tarjeta, QR o PIX (se elige adentro del iframe de Bancard).
  medio          text not null check (medio in ('formulario', 'token')),
  origen         text not null check (origen in ('usuario', 'automatico')),
  plan           text not null check (plan in ('basico', 'pro', 'negocio')),
  periodo        text not null check (periodo in ('mensual', 'anual')),
  -- Solo el Premium de un negocio; si no, null.
  personas       integer check (personas between 4 and 15),
  -- La respuesta entera de precio_de_la_cuenta / prorrateo_de_personas.
  desglose       jsonb not null,
  lista          numeric(14,0) not null,
  extras         numeric(14,0) not null default 0,
  descuento      numeric(14,0) not null default 0,
  -- Guaraníes enteros.
  importe        numeric(14,0) not null check (importe > 0),
  moneda         text not null default 'PYG' check (moneda = 'PYG'),
  -- Lo que ve la persona en el formulario de Bancard: 20 caracteres.
  descripcion    text not null check (char_length(descripcion) between 1 and 20),
  estado         text not null default 'creada'
                 check (estado in ('creada', 'en_3ds', 'incierta', 'pagada', 'rechazada', 'revertida', 'vencida')),
  -- El de Bancard. Solo se le entrega a quien inició la operación.
  process_id     text check (char_length(process_id) <= 100),
  -- Si medio = 'token'.
  tarjeta_id     bigint references public.bancard_tarjetas (id) on delete set null,
  -- Saneada: ver bancard_sanear (125).
  respuesta      jsonb,
  fuente         text check (fuente in ('confirmacion', 'consulta', 'charge')),
  confirmada_at  timestamptz,
  -- Foto de la suscripción antes de activar, para poder revertir.
  antes          jsonb,
  -- El periodo_fin que dejó este pago.
  vence_despues  timestamptz,
  ingreso_id     uuid references public.movimientos (id) on delete set null,
  comision_id    uuid references public.comisiones (id) on delete set null,
  revertida_at   timestamptz,
  revertida_por  uuid references auth.users (id) on delete set null,
  motivo         text check (char_length(motivo) <= 300),
  -- No null = la administración tiene que mirarla.
  revisar        text check (char_length(revisar) <= 200),
  consultas      integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists bancard_operaciones_empresa_idx
  on public.bancard_operaciones (empresa_id, created_at desc);
-- UNA SOLA OPERACIÓN VIVA POR CUENTA. Es lo que impide el cobro doble: una
-- operación con estado incierto no se vuelve a cobrar hasta resolverla.
create unique index if not exists bancard_operaciones_una_viva
  on public.bancard_operaciones (empresa_id) where estado in ('creada', 'en_3ds', 'incierta');
-- Para la conciliación: las vivas, de la más vieja a la más nueva.
create index if not exists bancard_operaciones_vivas_idx
  on public.bancard_operaciones (created_at) where estado in ('creada', 'en_3ds', 'incierta');

-- El registro: qué se le pidió a Bancard y qué mandó. Sin llave a la
-- operación: a la URL de confirmación también llegan números que Orden no
-- creó (el «Cliente de prueba» del portal).
create table if not exists public.bancard_eventos (
  id            bigserial primary key,
  operacion_id  bigint,
  tarjeta_id    bigint,
  entorno       text,
  -- single_buy | charge | consulta | rollback | cards_new | users_cards |
  -- delete_card | confirmacion | conexion
  tipo          text not null check (char_length(tipo) <= 40),
  ok            boolean not null,
  -- messages[].key de Bancard, o 'timeout', 'no_json', 'token_invalido',
  -- 'desconocida', 'vacia', 'importe_distinto'.
  clave         text check (char_length(clave) <= 80),
  http          integer,
  -- Saneado: ver bancard_anotar_evento (125).
  detalle       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists bancard_eventos_operacion_idx
  on public.bancard_eventos (operacion_id, created_at desc);
create index if not exists bancard_eventos_fecha_idx
  on public.bancard_eventos (created_at desc);

alter table public.bancard_pagadores   enable row level security;
alter table public.bancard_tarjetas    enable row level security;
alter table public.bancard_cuentas     enable row level security;
alter table public.bancard_operaciones enable row level security;
alter table public.bancard_eventos     enable row level security;

-- Sin policies y sin permisos: dos cerrojos. Supabase le da por defecto
-- todos los privilegios de tabla a `anon` y `authenticated` sobre lo nuevo.
revoke all on public.bancard_pagadores   from public, anon, authenticated;
revoke all on public.bancard_tarjetas    from public, anon, authenticated;
revoke all on public.bancard_cuentas     from public, anon, authenticated;
revoke all on public.bancard_operaciones from public, anon, authenticated;
revoke all on public.bancard_eventos     from public, anon, authenticated;
revoke all on sequence public.bancard_eventos_id_seq from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. LOS NÚMEROS DEL PRECIO, CADA UNO EN UN SOLO LUGAR
-- ------------------------------------------------------------

-- Espejo de PERSONAS_INCLUIDAS_PREMIUM (src/lib/constantes.ts). Hasta acá
-- la base no conocía el 4. `pruebas/precios-prueba.test.js` los ata.
-- Sin `security definer`: no lee nada, y así no suma una puerta a la lista
-- de funciones definer abiertas a `anon` (pruebas/permisos.test.js).
create or replace function public.personas_incluidas_premium()
returns integer language sql immutable set search_path = public as $fn$
  select 4;
$fn$;

grant execute on function public.personas_incluidas_premium() to anon, authenticated;

-- Cuántos meses se cobran en cada período: el año son once.
create or replace function public.meses_que_se_cobran(p_periodo text)
returns integer language sql immutable set search_path = public as $fn$
  select case when p_periodo = 'anual' then 11 else 1 end;
$fn$;

grant execute on function public.meses_que_se_cobran(text) to anon, authenticated;

-- El único lugar del redondeo: al guaraní.
create or replace function public.redondeo_de_cobro(p numeric)
returns numeric language sql immutable set search_path = public as $fn$
  select round(p, 0);
$fn$;

grant execute on function public.redondeo_de_cobro(numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. EL DESCUENTO, PARTIDO EN DOS
--
--    `descuento_de_la_cuenta` es el cuerpo de `descuento_por_racha` (123)
--    SIN la guarda de sesión, para que lo puedan usar la confirmación de
--    Bancard y la tarea diaria. Cerrada a todos: la llaman otras funciones
--    definer.
-- ------------------------------------------------------------
create or replace function public.descuento_de_la_cuenta(p_empresa uuid)
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

revoke all on function public.descuento_de_la_cuenta(uuid) from public, anon, authenticated;

-- Copia exacta de la 123. Cambia: el cuerpo, que ahora vive en
-- `descuento_de_la_cuenta`; acá quedan la guarda de sesión de siempre y la
-- llamada. Misma firma, mismos permisos, misma respuesta.
create or replace function public.descuento_por_racha(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) and not public.es_superadmin() then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  return public.descuento_de_la_cuenta(p_empresa);
end $fn$;

revoke all on function public.descuento_por_racha(uuid) from public, anon;
grant execute on function public.descuento_por_racha(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. «¿YA PAGÓ?», COMO UN HECHO
--
--    El mismo filtro que usan `usar_codigo_referido` (063) y
--    `asignar_referido` (103): un renglón 'cambiar_plan' con importe. Los
--    pagos de Bancard en producción dejan ese renglón (125); los de staging
--    no. Un cambio deshecho o un pago revertido no cuenta.
-- ------------------------------------------------------------
create or replace function public.cuenta_ya_pago(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.registro_admin r
    where r.empresa_id = p_empresa and r.accion = 'cambiar_plan'
      and coalesce(r.detalle->>'importe', '') ~ '^[0-9]+([.][0-9]+)?$'
      and (r.detalle->>'importe')::numeric > 0
      and coalesce(r.detalle->>'deshecho', 'false') <> 'true'
  );
$fn$;

revoke all on function public.cuenta_ya_pago(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6. CUÁNTO HAY QUE COBRARLE A ESTA CUENTA
--
--    La única fuente del importe. Sin guarda de sesión y cerrada a todos:
--    la llaman otras funciones definer (cotizar_plan, el inicio del pago, la
--    tarea diaria).
-- ------------------------------------------------------------
create or replace function public.precio_de_la_cuenta(
  p_empresa  uuid,
  p_plan     text,
  p_periodo  text,
  p_personas integer
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_tipo          text;
  v_rubro         text;
  v_sus           public.suscripciones;
  v_lista         numeric;
  v_lista_mensual numeric;
  v_usd           numeric;
  v_usd_mensual   numeric;
  v_ppv           numeric;
  v_ppv_usd       numeric;
  v_miembros      integer;
  v_incluidas     integer := public.personas_incluidas_premium();
  v_max           integer := (public.limites_plan('negocio')->>'miembros')::integer;
  v_min           integer;
  v_lleva         boolean;
  v_extra         integer := 0;
  v_meses         integer;
  v_servicio      integer;
  v_extras        numeric := 0;
  v_subtotal      numeric;
  v_d             jsonb;
  v_ya            boolean;
  v_fase          text;
  v_pct           numeric := 0;
  v_base          numeric;
  v_descuento     numeric := 0;
  v_ref           numeric;
begin
  -- 1. La cuenta, el plan y el período.
  select coalesce(e.tipo_cuenta, 'emprendedor'), e.rubro
  into v_tipo, v_rubro
  from public.empresas e where e.id = p_empresa;

  if v_tipo is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;
  if p_plan is null or p_plan not in ('basico', 'pro', 'negocio') then
    raise exception 'Plan desconocido: %', coalesce(p_plan, '') using errcode = '22023';
  end if;
  if p_periodo is null or p_periodo not in ('mensual', 'anual') then
    raise exception 'Ese período de cobro no existe.' using errcode = '22023';
  end if;

  select * into v_sus from public.suscripciones where empresa_id = p_empresa;

  -- 2. Los planes de su rubro, o el que ya tiene pago (un rubro que cambió
  --    de lista no deja sin renovar a quien ya paga).
  if not (p_plan = any (public.planes_de_rubro(v_rubro, v_tipo)))
     and not coalesce(v_sus.estado = 'activa' and v_sus.plan = p_plan, false) then
    raise exception 'Ese plan no está disponible para tu rubro.' using errcode = '22023';
  end if;

  -- 3. La lista, en guaraníes.
  select pr.importe into v_lista
  from public.precios pr
  where pr.tipo_cuenta = v_tipo and pr.plan = p_plan and pr.moneda = 'PYG'
    and pr.periodo = p_periodo and pr.activo;
  select pr.importe into v_lista_mensual
  from public.precios pr
  where pr.tipo_cuenta = v_tipo and pr.plan = p_plan and pr.moneda = 'PYG'
    and pr.periodo = 'mensual' and pr.activo;

  if v_lista is null or v_lista_mensual is null then
    raise exception 'Ese plan no tiene precio cargado.' using errcode = '22023';
  end if;

  -- 4. Las personas: solo el Premium de un negocio las lleva.
  select count(*)::int into v_miembros from public.miembros m where m.empresa_id = p_empresa;
  v_lleva := (p_plan = 'negocio' and v_tipo <> 'personal');
  v_ppv := public.precio_por_vendedor('PYG');

  if v_lleva then
    v_min := least(greatest(v_incluidas, v_miembros), v_max);
    if p_personas is null or p_personas < v_min or p_personas > v_max then
      raise exception 'Elegí cuántas personas van a usar la cuenta (entre % y %).', v_min, v_max
        using errcode = '22023';
    end if;
    v_extra := greatest(0, p_personas - v_incluidas);
  elsif p_personas is not null then
    raise exception 'Ese plan no lleva cantidad de personas.' using errcode = '22023';
  end if;

  -- 5. Sin precio por persona no se puede cobrar a nadie de más.
  if v_extra > 0 and v_ppv is null then
    raise exception 'No está cargado el precio por persona.' using errcode = '22023';
  end if;

  -- La cuenta. El año se cobra por 11 meses y da 12 de servicio.
  v_meses    := public.meses_que_se_cobran(p_periodo);
  v_servicio := case when p_periodo = 'anual' then 12 else 1 end;
  v_extras   := v_extra * coalesce(v_ppv, 0) * v_meses;
  v_subtotal := v_lista + v_extras;

  -- El descuento: la racha de la prueba solo en el PRIMER pago; la
  -- constancia solo en las renovaciones de quien ya pagó.
  v_d  := public.descuento_de_la_cuenta(p_empresa);
  v_ya := public.cuenta_ya_pago(p_empresa);
  v_fase := case
    when not v_ya and v_d->>'fase' = 'prueba'     and coalesce((v_d->>'logrado')::boolean, false) then 'prueba'
    when v_ya     and v_d->>'fase' = 'constancia' and coalesce((v_d->>'logrado')::boolean, false) then 'constancia'
    else null
  end;
  v_pct := case when v_fase is null then 0 else coalesce((v_d->>'porcentaje')::numeric, 0) end;

  -- LAS DOS REGLAS DUDOSAS VIVEN EN ESTA LÍNEA: el descuento es sobre UN mes
  -- (también al pagar el año) y alcanza a las personas extra.
  v_base := v_lista_mensual + v_extra * coalesce(v_ppv, 0);
  v_descuento := case when v_fase is null then 0
                      else least(public.redondeo_de_cobro(v_base * v_pct / 100), v_subtotal) end;

  -- La referencia en dólares: se muestra, no se cobra. Null si falta una fila.
  select pr.importe into v_usd
  from public.precios pr
  where pr.tipo_cuenta = v_tipo and pr.plan = p_plan and pr.moneda = 'USD'
    and pr.periodo = p_periodo and pr.activo;
  select pr.importe into v_usd_mensual
  from public.precios pr
  where pr.tipo_cuenta = v_tipo and pr.plan = p_plan and pr.moneda = 'USD'
    and pr.periodo = 'mensual' and pr.activo;
  v_ppv_usd := public.precio_por_vendedor('USD');

  if v_usd is null or v_usd_mensual is null or (v_extra > 0 and v_ppv_usd is null) then
    v_ref := null;
  else
    v_ref := v_usd + v_extra * coalesce(v_ppv_usd, 0) * v_meses
             - round((v_usd_mensual + v_extra * coalesce(v_ppv_usd, 0)) * v_pct / 100, 2);
  end if;

  return jsonb_build_object(
    'plan',                 p_plan,
    'periodo',              p_periodo,
    'tipo_cuenta',          v_tipo,
    'moneda',               'PYG',
    'lista',                public.redondeo_de_cobro(v_lista),
    'lista_mensual',        public.redondeo_de_cobro(v_lista_mensual),
    'meses_cobrados',       v_meses,
    'meses_de_servicio',    v_servicio,
    'personas',             case when v_lleva then p_personas else null end,
    'personas_incluidas',   case when v_lleva then v_incluidas else null end,
    'personas_extra',       v_extra,
    'personas_min',         case when v_lleva then v_min else null end,
    'personas_max',         case when v_lleva then v_max else null end,
    'miembros',             v_miembros,
    'precio_por_persona',   case when v_ppv is null then null else public.redondeo_de_cobro(v_ppv) end,
    'extras',               public.redondeo_de_cobro(v_extras),
    'subtotal',             public.redondeo_de_cobro(v_subtotal),
    'descuento_fase',       v_fase,
    'descuento_porcentaje', v_pct,
    'descuento_base',       public.redondeo_de_cobro(v_base),
    'descuento',            v_descuento,
    'total',                public.redondeo_de_cobro(v_subtotal - v_descuento),
    'referencia_usd',       v_ref
  ) || jsonb_build_object(
    -- Las piezas en dólares, para que la pantalla recalcule la referencia
    -- al mover la cantidad de personas (src/lib/cotizacion.ts).
    'usd_lista',            v_usd,
    'usd_lista_mensual',    v_usd_mensual,
    'usd_por_persona',      v_ppv_usd,
    'primer_pago',          not v_ya,
    'vence_hasta',          greatest(coalesce(v_sus.periodo_fin, now()), now())
                            + make_interval(months => v_servicio)
  );
end $fn$;

revoke all on function public.precio_de_la_cuenta(uuid, text, text, integer) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 7. SUMAR PERSONAS A UN PREMIUM VIGENTE: EL PRORRATEO
--
--    Se paga en el momento por los días que faltan del período; desde la
--    próxima renovación entran en el precio. Mensual sobre 30 días; anual
--    sobre 365 y por los 11 meses que se cobran. Sin descuento.
-- ------------------------------------------------------------
create or replace function public.prorrateo_de_personas(p_empresa uuid, p_personas integer)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_sus      public.suscripciones;
  v_tipo     text;
  v_max      integer := (public.limites_plan('negocio')->>'miembros')::integer;
  v_antes    integer;
  v_ppv      numeric;
  v_dias     integer;
  v_periodo  integer;
  v_precio   numeric;
  v_importe  numeric;
begin
  select coalesce(e.tipo_cuenta, 'emprendedor') into v_tipo
  from public.empresas e where e.id = p_empresa;
  select * into v_sus from public.suscripciones where empresa_id = p_empresa;

  if v_tipo is null or v_sus.empresa_id is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  if v_tipo = 'personal' or v_sus.plan <> 'negocio' or v_sus.estado <> 'activa' then
    raise exception 'Ese plan no lleva cantidad de personas.' using errcode = '22023';
  end if;
  -- Vencido, o un Premium «sin número» (activado a mano): primero se renueva
  -- eligiendo la cantidad, y recién ahí hay algo a lo que sumarle.
  if v_sus.periodo_fin is null or v_sus.periodo_fin <= now() or v_sus.tope_vendedores is null then
    raise exception 'Primero renová tu plan eligiendo cuántas personas son.' using errcode = '22023';
  end if;

  v_antes := v_sus.tope_vendedores + 1;
  if p_personas is null or p_personas <= v_antes then
    raise exception 'Ya tenés esa cantidad de personas o más.' using errcode = '22023';
  end if;
  if p_personas > v_max then
    raise exception 'Elegí cuántas personas van a usar la cuenta (entre % y %).', v_antes + 1, v_max
      using errcode = '22023';
  end if;

  v_ppv := public.precio_por_vendedor('PYG');
  if v_ppv is null then
    raise exception 'No está cargado el precio por persona.' using errcode = '22023';
  end if;

  -- Nunca menos de un día: Bancard rechaza un importe de cero.
  v_dias    := greatest(1, ceil(extract(epoch from (v_sus.periodo_fin - now())) / 86400)::integer);
  v_periodo := case when coalesce(v_sus.periodo, 'mensual') = 'anual' then 365 else 30 end;
  v_precio  := v_ppv * public.meses_que_se_cobran(coalesce(v_sus.periodo, 'mensual'));
  v_importe := greatest(1, public.redondeo_de_cobro(
    (p_personas - v_antes) * v_precio * v_dias / v_periodo));

  return jsonb_build_object(
    'plan',               v_sus.plan,
    'periodo',            coalesce(v_sus.periodo, 'mensual'),
    'personas_antes',     v_antes,
    'personas',           p_personas,
    'personas_sumadas',   p_personas - v_antes,
    'dias_restantes',     v_dias,
    'dias_del_periodo',   v_periodo,
    'precio_por_persona', public.redondeo_de_cobro(v_ppv),
    'importe',            v_importe,
    'total',              v_importe,
    'moneda',             'PYG',
    'vence_hasta',        v_sus.periodo_fin
  );
end $fn$;

revoke all on function public.prorrateo_de_personas(uuid, integer) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 8. LO QUE PIDE LA PANTALLA
--
--    Las dos de arriba, con la guarda de sesión: solo quien administra la
--    cuenta (o la administración de Orden) ve cuánto se le cobra.
-- ------------------------------------------------------------
create or replace function public.cotizar_plan(
  p_empresa  uuid,
  p_plan     text,
  p_periodo  text default 'mensual',
  p_personas integer default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) and not public.es_superadmin() then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  return public.precio_de_la_cuenta(p_empresa, p_plan, p_periodo, p_personas);
end $fn$;

revoke all on function public.cotizar_plan(uuid, text, text, integer) from public, anon;
grant execute on function public.cotizar_plan(uuid, text, text, integer) to authenticated;

create or replace function public.cotizar_personas(p_empresa uuid, p_personas integer)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) and not public.es_superadmin() then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  return public.prorrateo_de_personas(p_empresa, p_personas);
end $fn$;

revoke all on function public.cotizar_personas(uuid, integer) from public, anon;
grant execute on function public.cotizar_personas(uuid, integer) to authenticated;
