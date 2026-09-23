-- ============================================================
-- 102 · CADA RUBRO CON SUS PLANES, Y LA COMISIÓN SOBRE EL PRECIO DE LISTA
-- ============================================================
--
-- Dos decisiones de Matías del 23/09/2026 (CONTRATO-102, §1 y §3). No se
-- re-discuten; acá queda el porqué para quien venga después.
--
-- 1. CADA RUBRO OFRECE SOLO LOS PLANES QUE LE SIRVEN
--
-- Hasta hoy todo negocio veía Básico, Pro y Premium. Pro y Premium venden
-- GENTE cargando a la vez —vendedores, cajeros, encargados—. Un profe de
-- inglés o un personal trainer trabajan solos: ofrecerles pagar por
-- vendedores que nunca van a tener es venderles aire, y lo único que logra
-- es que el precio que sí les sirve parezca el «barato», el de segunda.
--
--     comercio, servicios        básico, pro, premium (negocio)
--     clases, entrenamiento      básico
--     agricultura, ganadería     básico, pro  (el dueño y un par de encargados)
--     cuenta personal            pro, como hoy (su único plan pago)
--
-- Lo que NO cambia, y es a propósito: el sistema de planes sigue siendo UNO.
-- Los mismos precios (`precios`), los mismos topes (`limites_plan`), las
-- mismas sillas (048). Esta migración no toca un solo precio ni un solo
-- tope: solo dice cuáles se ofrecen a quién.
--
-- La tabla vive dos veces, en `planes_de_rubro()` acá y en `FichaRubro.planes`
-- de src/lib/rubros.ts, igual que `dias_de_prueba()` y `DIAS_DE_PRUEBA`. Una
-- prueba compara las dos, rubro por rubro, y falla si se separan.
--
-- LA PRUEBA ARRANCA EN UN PLAN QUE SE PUEDE COMPRAR
--
-- Desde la 009 toda cuenta nace en prueba de Pro. Con la tabla nueva eso
-- sería una trampa para el profe: ocho días con tres personas y 600
-- capturas, y el día nueve le ofrecemos un plan de una persona y 300. Lo
-- que probó no existe para él. Por eso `plan_de_prueba()`: Pro si su rubro
-- lo ofrece —el más completo que se vende por igual a casi todos—, y si no,
-- el más alto de su lista (clases y entrenamiento → básico). La cuenta
-- personal sigue con lo de hoy: Pro.
--
-- `crear_empresa` y `cambiar_rubro` son copia EXACTA de su versión viva
-- (verificada en producción con pg_get_functiondef) con UNA diferencia cada
-- una:
--
--   · `crear_empresa`: la suscripción de prueba nace en
--     `plan_de_prueba(v_rubro, v_tipo)` en vez de 'pro'. `empresas.plan`
--     sigue diciendo 'pro': es el campo viejo de «tiene acceso», y
--     `cambiar_plan_cuenta` también escribe 'pro' ahí para cualquier plan
--     pago. El plan de verdad sale de `suscripciones` (plan_efectivo).
--   · `cambiar_rubro`: si la cuenta está EN PRUEBA, la prueba pasa al plan
--     de prueba del rubro nuevo. Un comercio que se da cuenta de que es un
--     profe no puede seguir probando algo que no se le va a vender. Una
--     suscripción paga NUNCA se toca: el que pagó Pro lo sigue teniendo,
--     aunque su rubro nuevo no lo ofrezca (la pantalla lo muestra como su
--     plan actual). No se le cambian las fechas a la prueba: el rubro cambia
--     qué se prueba, no cuánto dura.
--
-- 2. LA COMISIÓN DEL SOCIO: LA MITAD DEL PRECIO DE LISTA DE UN MES
--
-- Hasta hoy (060, 063, 068) la comisión era la mitad de LO QUE ENTRÓ en el
-- primer pago. Dos bordes que Matías no quiere:
--
--   · El que pagó con el descuento de la prueba (078) dejaba al socio con la
--     mitad de un precio rebajado: el socio pagaba un descuento que no dio.
--   · El que pagó el año entero de una le dejaba al socio la mitad de once
--     meses. Había que ajustarla a mano, y a mano se olvida.
--
-- La regla nueva es un número que el socio puede saber de antemano: la
-- mitad del precio de lista MENSUAL del plan que se activó, del tipo de
-- cuenta de la empresa, en la moneda del cobro. Sin sillas extra: el
-- precio de lista del plan. Si pagó el año, la base igual es UN mes.
--
-- LA MONEDA DEL COBRO: `suscripciones.moneda`; si es null, LA DE LA
-- EMPRESA (`empresas.moneda`); recién después, guaraníes. El contrato
-- decía «null = guaraníes», pero en producción `suscripciones.moneda` es
-- null en TODAS las suscripciones: solo la escribe el webhook de la
-- pasarela (009), que hoy no se usa, y `cambiar_plan_cuenta` (el cobro por
-- transferencia, el único camino real) nunca la toca. Con «null =
-- guaraníes» a secas, una cuenta argentina que paga Premium con 60.000 ARS
-- tomaba de base el precio en guaraníes (250.000); la mitad, 125.000,
-- quedaba topada en 60.000 y el socio se llevaba EL 100 % de lo que entró.
-- Un cliente en dólares que paga 32 dejaba 32 en vez de 16. La empresa sí
-- sabe en qué moneda trabaja: el que factura en pesos paga en pesos. Una
-- moneda sin precio de lista (ARS hoy) cae en la regla de antes: base =
-- importe, la mitad de lo que entró.
--
-- Lo que NO cambia:
--
--   · Cuándo nace: con el primer pago, una sola vez por negocio (el índice
--     único de `comisiones`), y se cae si el cobro se anula (063).
--   · La salvaguarda, ahora explícita: nunca más de lo que entró. Un cobro
--     de prueba de 1.000 no genera una comisión de 55.000.
--   · Si no hay precio de lista para ese plan en esa moneda, la base es el
--     importe, como hasta hoy. Mejor una comisión como la de antes que
--     ninguna.
--
-- `base` guarda el precio de lista (lo que se tomó de base); `monto`, lo
-- calculado. El redondeo sigue la moneda: guaraníes sin decimales, el resto
-- con dos. `precios.activo` no se mira a propósito: un precio que se dejó
-- de ofrecer sigue siendo el precio de lista del que ya lo compró.
--
-- La regla vive en dos helpers internos —`base_de_comision` y
-- `monto_de_comision`— porque la comisión nace en DOS lugares:
-- `cambiar_plan_cuenta` (el cobro, 063) y `asignar_referido` (el código que
-- se había perdido, 068). Se verificó en producción que no hay otra función
-- que inserte en `comisiones` (pg_proc, prosrc). Las dos se redefinen como
-- copia exacta de lo vivo usando los helpers, que nadie de afuera puede
-- llamar (revocados a public, anon y authenticated). `asignar_referido`
-- saca el plan del primer pago del mismo renglón de `registro_admin` de
-- donde ya sacaba el importe (`plan_despues`).
--
-- UNA CORRECCIÓN QUE VA DE PASO: `cambiar_plan_cuenta` NO CONOCÍA EL BÁSICO
--
-- La 077 creó el plan Básico y el panel de administración lo ofrece, pero
-- `cambiar_plan_cuenta` (063, viva) seguía aceptando solo gratis, pro y
-- negocio: activar un Básico por transferencia terminaba en «Plan
-- desconocido: basico». Con esta migración un profe o un trainer SOLO
-- pueden comprar Básico, así que dejarlo así era dejarlos sin forma de
-- pagar. Es la única línea que cambia en esa función además de la comisión.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUÉ PLANES SE LE OFRECEN A CADA RUBRO
--
--    Espejo de `FichaRubro.planes` en src/lib/rubros.ts, en el mismo orden
--    (de menor a mayor). Un rubro desconocido o null cae en comercio, igual
--    que `fichaDe()`. `immutable` y sin leer tablas, como `dias_de_prueba`:
--    la pantalla de planes la puede preguntar antes de iniciar sesión.
-- ------------------------------------------------------------
create or replace function public.planes_de_rubro(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns text[] language sql immutable set search_path = public as $fn$
  select case
    -- La cuenta personal ya es de una sola persona y tiene su propio precio.
    when coalesce(p_tipo_cuenta, 'emprendedor') = 'personal' then array['pro']
    -- Trabajan solos: pagar por vendedores sería pagar por aire.
    when p_rubro in ('clases', 'entrenamiento') then array['basico']
    -- El dueño y un par de encargados; nadie tiene quince en el campo.
    when p_rubro in ('agricultura', 'ganaderia') then array['basico', 'pro']
    else array['basico', 'pro', 'negocio']
  end;
$fn$;

grant execute on function public.planes_de_rubro(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. EN QUÉ PLAN ARRANCA LA PRUEBA
--
--    Pro si el rubro lo ofrece; si no, el más alto de su lista. Nunca un
--    plan que después no se le pueda vender.
-- ------------------------------------------------------------
create or replace function public.plan_de_prueba(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns text language sql immutable set search_path = public as $fn$
  select case
    when 'pro' = any (l) then 'pro'
    else l[array_length(l, 1)]
  end
  from (select public.planes_de_rubro(p_rubro, p_tipo_cuenta) as l) x;
$fn$;

grant execute on function public.plan_de_prueba(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. CREAR LA EMPRESA: LA PRUEBA EN EL PLAN DE SU RUBRO
--
--    Copia exacta de la viva (087) con una sola línea cambiada: el plan de
--    la suscripción de prueba.
-- ------------------------------------------------------------
create or replace function public.crear_empresa(
  p_nombre text,
  p_moneda text default 'PYG',
  p_nombre_usuario text default null,
  p_zona text default 'America/Asuncion',
  p_tipo_cuenta text default 'emprendedor',
  p_rubro text default 'comercio',
  p_como_nos_conocio text default '',
  p_telefono text default '',
  p_se_dedica text default ''
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_codigo text;
  v_intentos int := 0;
  v_fin timestamptz;
  v_tipo text;
  v_rubro text;
  v_contacto text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre del negocio es muy corto.' using errcode = '22023';
  end if;

  v_tipo := case when p_tipo_cuenta = 'personal' then 'personal' else 'emprendedor' end;
  v_rubro := case
    when v_tipo = 'personal' then 'comercio'
    when p_rubro = any (public.rubros_validos()) then p_rubro
    else 'comercio' end;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresa_accesos where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código de acceso.' using errcode = '55000';
    end if;
  end loop;

  insert into public.empresas (
    nombre, moneda, creada_por, zona_horaria, tipo_cuenta, rubro, como_nos_conocio)
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), auth.uid(),
          coalesce(nullif(trim(p_zona), ''), 'America/Asuncion'), v_tipo, v_rubro,
          left(coalesce(p_como_nos_conocio, ''), 80))
  returning id into v_id;

  v_contacto := nullif(trim(coalesce(p_nombre_usuario, '')), '');

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(v_contacto, 'Propietario'), 'propietario');

  insert into public.empresa_accesos (empresa_id, codigo) values (v_id, v_codigo);

  if v_contacto is not null
     or nullif(trim(coalesce(p_telefono, '')), '') is not null
     or nullif(trim(coalesce(p_se_dedica, '')), '') is not null then
    insert into public.ficha_cliente (empresa_id, contacto, telefono, se_dedica, updated_at)
    values (v_id,
            left(coalesce(v_contacto, ''), 120),
            left(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), 40),
            left(coalesce(trim(p_se_dedica), ''), 200),
            now())
    on conflict (empresa_id) do nothing;
  end if;

  v_fin := now() + make_interval(days => public.dias_de_prueba(v_tipo));
  insert into public.suscripciones (empresa_id, plan, estado, periodo_inicio, periodo_fin, prueba_fin)
  values (v_id, public.plan_de_prueba(v_rubro, v_tipo), 'prueba', now(), v_fin, v_fin);

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = 'pro' where id = v_id;
  perform set_config('orden.suscripcion_confiable', '0', true);

  return v_id;
end $fn$;

revoke all on function public.crear_empresa(text, text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.crear_empresa(text, text, text, text, text, text, text, text, text)
  to authenticated;

-- ------------------------------------------------------------
-- 4. CAMBIAR DE RUBRO: LA PRUEBA SE MUDA CON ÉL
--
--    Copia exacta de la viva (087) más el ajuste de la prueba. Solo
--    `estado = 'prueba'`: una suscripción paga no se toca nunca.
-- ------------------------------------------------------------
create or replace function public.cambiar_rubro(p_empresa uuid, p_rubro text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el propietario o un administrador puede cambiar el rubro.'
      using errcode = '42501';
  end if;

  if not (p_rubro = any (public.rubros_validos())) then
    raise exception 'Rubro desconocido: %', p_rubro using errcode = '22023';
  end if;

  select rubro into v_antes from public.empresas where id = p_empresa;
  if v_antes is null then
    raise exception 'Esa empresa no existe.' using errcode = 'P0002';
  end if;

  update public.empresas set rubro = p_rubro where id = p_empresa;

  -- La prueba se muda con el rubro: nadie prueba un plan que después no se
  -- le va a ofrecer. Lo pago no se toca nunca.
  update public.suscripciones s
  set plan = public.plan_de_prueba(p_rubro, e.tipo_cuenta),
      updated_at = now()
  from public.empresas e
  where s.empresa_id = p_empresa
    and e.id = p_empresa
    and s.estado = 'prueba';

  return jsonb_build_object('rubro', p_rubro, 'antes', v_antes);
end $fn$;

revoke all on function public.cambiar_rubro(uuid, text) from public, anon;
grant execute on function public.cambiar_rubro(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 5. LA BASE DE LA COMISIÓN: EL PRECIO DE LISTA DE UN MES
--
--    El precio mensual del plan, del tipo de cuenta de la empresa, en la
--    moneda del cobro: la de la suscripción; si es null, la de la empresa;
--    si no, guaraníes (ver la cabecera: la de la suscripción hoy es siempre
--    null). Si no hay precio de lista para esa combinación, el importe: la
--    regla de antes.
--
--    `security definer` porque la llaman funciones que ya lo son y tiene
--    que leer `suscripciones` sin depender de quién mira; revocada a todos
--    porque no es una puerta: es una cuenta interna.
-- ------------------------------------------------------------
create or replace function public.base_de_comision(
  p_empresa uuid,
  p_plan    text,
  p_importe numeric
)
returns numeric language sql stable security definer set search_path = public as $fn$
  select coalesce((
    select pr.importe
    from public.empresas e
    left join public.suscripciones s on s.empresa_id = e.id
    join public.precios pr
      on pr.tipo_cuenta = e.tipo_cuenta
     and pr.plan = p_plan
     and pr.moneda = coalesce(s.moneda, e.moneda, 'PYG')
     and pr.periodo = 'mensual'
    where e.id = p_empresa
    limit 1
  ), p_importe);
$fn$;

-- ------------------------------------------------------------
-- 6. EL MONTO: EL PORCENTAJE DE LA BASE, NUNCA MÁS DE LO QUE ENTRÓ
--
--    Guaraníes sin decimales (como siempre); el resto con dos, porque la
--    mitad de 19 dólares son 9,50 y no 10. La moneda sale igual que en
--    `base_de_comision`: la de la suscripción, la de la empresa, guaraníes.
-- ------------------------------------------------------------
create or replace function public.monto_de_comision(
  p_empresa uuid,
  p_base    numeric,
  p_pct     numeric,
  p_importe numeric
)
returns numeric language sql stable security definer set search_path = public as $fn$
  select least(
    round(p_base * p_pct / 100,
      case when coalesce((select coalesce(s.moneda, e.moneda)
                          from public.empresas e
                          left join public.suscripciones s on s.empresa_id = e.id
                          where e.id = p_empresa), 'PYG') = 'PYG'
           then 0 else 2 end),
    p_importe
  );
$fn$;

revoke all on function public.base_de_comision(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.monto_de_comision(uuid, numeric, numeric, numeric) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 7. EL COBRO (063): LA COMISIÓN SOBRE EL PRECIO DE LISTA
--
--    Copia exacta de la viva. Cambian dos cosas: acepta 'basico' (ver la
--    cabecera) y la comisión usa los helpers de arriba.
-- ------------------------------------------------------------
create or replace function public.cambiar_plan_cuenta(
  p_empresa    uuid,
  p_plan       text,
  p_meses      integer default 1,
  p_nota       text default '',
  p_importe    numeric default null,
  p_vendedores integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes    public.suscripciones;
  v_fin      timestamptz;
  v_estado   text;
  v_orden    uuid;
  v_cliente  text;
  v_ingreso  uuid;
  v_aviso    text := null;
  v_tope     integer;
  v_personas integer;
  v_socio    uuid;
  v_pct      numeric;
  v_comision boolean := false;
  v_base     numeric;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  -- 'basico' faltaba desde la 077 (ver la cabecera de la 102).
  if p_plan not in ('gratis', 'basico', 'pro', 'negocio') then
    raise exception 'Plan desconocido: %', p_plan using errcode = '22023';
  end if;

  if p_vendedores is not null and p_vendedores < -1 then
    raise exception 'El tope de vendedores no puede ser negativo.' using errcode = '22023';
  end if;

  select * into v_antes from public.suscripciones where empresa_id = p_empresa;
  if v_antes.empresa_id is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  select nombre into v_cliente from public.empresas where id = p_empresa;

  if p_plan = 'gratis' then
    v_estado := 'vencida';
    v_fin := now();
    -- Cortar el servicio borra el trato: si vuelve, se negocia de nuevo.
    v_tope := null;
  else
    v_estado := 'activa';
    -- Si todavía le queda tiempo pago, se le suma; si no, arranca hoy.
    v_fin := greatest(coalesce(v_antes.periodo_fin, now()), now())
             + make_interval(months => greatest(1, coalesce(p_meses, 1)));
    v_tope := case
      when p_vendedores is null then v_antes.tope_vendedores  -- no se toca
      when p_vendedores = -1    then null                     -- volver al plan
      else p_vendedores
    end;
  end if;

  update public.suscripciones
  set plan = p_plan,
      estado = v_estado,
      periodo_inicio = case when p_plan = 'gratis' then periodo_inicio else now() end,
      periodo_fin = v_fin,
      tope_vendedores = v_tope,
      proveedor_pago = case when p_plan = 'gratis' then proveedor_pago else 'transferencia' end,
      updated_at = now()
  where empresa_id = p_empresa;

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas
  set plan = case when p_plan = 'gratis' then 'gratis' else 'pro' end
  where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  -- ---- ¿le queda gente afuera del tope nuevo? ----
  --
  -- No se echa a nadie: bajar un número en un panel no puede sacarle el
  -- acceso a una persona que hoy está trabajando. Pero hay que decirlo, o
  -- el que lo bajó se entera cuando el cliente reclama.
  if v_tope is not null then
    select count(*)::int into v_personas from public.miembros where empresa_id = p_empresa;
    if v_personas > v_tope + 1 then
      v_aviso := 'Ojo: este negocio ya tiene ' || v_personas || ' personas y le habilitaste '
              || v_tope || ' vendedores (' || (v_tope + 1) || ' con el dueño). '
              || 'No se sacó a nadie, pero no va a poder sumar a nadie más.';
    end if;
  end if;

  -- ---- el cobro, como ingreso de Orden ----
  if p_plan <> 'gratis' and coalesce(p_importe, 0) > 0 then
    select empresa_id into v_orden from public.ajustes_orden where unica;

    if v_orden is null then
      v_aviso := coalesce(v_aviso || ' ', '')
              || 'No hay una empresa de Orden elegida, así que el cobro no se anotó en tus finanzas.';
    elsif v_orden = p_empresa then
      v_aviso := coalesce(v_aviso || ' ', '')
              || 'Esta ES tu empresa, así que no se anotó ningún ingreso.';
    else
      begin
        insert into public.movimientos (
          empresa_id, tipo, estado, fecha, descripcion, categoria,
          subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por
        ) values (
          v_orden, 'ingreso', 'activo', public.hoy_empresa(v_orden),
          'Suscripción ' || coalesce(v_cliente, 'cliente'), 'Suscripciones',
          p_importe, 0, p_importe, 0, 'transferencia',
          left(coalesce(v_cliente, ''), 80), auth.uid()
        )
        returning id into v_ingreso;
      exception when others then
        v_aviso := coalesce(v_aviso || ' ', '')
                || 'La cuenta se activó, pero el ingreso no se pudo anotar: ' || sqlerrm;
      end;
    end if;
  end if;

  -- ---- la comisión de quien trajo al cliente (060, corregida acá) ----
  -- Nace cuando se cobra, una sola vez por negocio, y eso lo garantiza el
  -- índice único de comisiones y no el acordarse.
  --
  -- Antes colgaba de que el ingreso se hubiera podido anotar, y eso costó
  -- una comisión de verdad: la empresa que representaba a Orden estaba
  -- borrada, el ingreso no se pudo escribir, y el socio se quedó sin nada
  -- por un problema de contabilidad que no tenía nada que ver con él.
  --
  -- La señal de que entró plata no es la fila del libro: es que una
  -- persona escribió un importe porque vio la transferencia. Eso es lo
  -- que se mira. El movimiento se guarda si existe, y puede ser null.
  if p_plan <> 'gratis' and coalesce(p_importe, 0) > 0 then
    select r.socio_id into v_socio
    from public.referidos r
    join public.socios s on s.id = r.socio_id
    where r.empresa_id = p_empresa and s.activo;

    if v_socio is not null then
      select coalesce(a.comision_porcentaje, 50) into v_pct
      from public.ajustes_orden a where a.unica;

      -- Desde la 102: la mitad del precio de lista de un mes del plan que
      -- se activó, nunca más de lo que entró.
      v_base := public.base_de_comision(p_empresa, p_plan, p_importe);

      begin
        insert into public.comisiones (
          socio_id, empresa_id, movimiento_id, base, porcentaje, monto
        ) values (
          v_socio, p_empresa, v_ingreso, v_base, coalesce(v_pct, 50),
          public.monto_de_comision(p_empresa, v_base, coalesce(v_pct, 50), p_importe)
        );
        v_comision := true;
      exception when unique_violation then
        -- Ya cobró por este negocio. Se paga una sola vez: el primer pago.
        null;
      end;
    end if;
  end if;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'cambiar_plan', jsonb_build_object(
    'plan_antes', v_antes.plan, 'plan_despues', p_plan,
    'estado_antes', v_antes.estado, 'estado_despues', v_estado,
    'vence_antes', v_antes.periodo_fin, 'vence_despues', v_fin,
    'meses', greatest(1, coalesce(p_meses, 1)),
    'importe', p_importe,
    'tope_antes', v_antes.tope_vendedores,
    'tope_despues', v_tope,
    'ingreso_id', v_ingreso,
    'nota', left(coalesce(p_nota, ''), 300)
  ));

  return jsonb_build_object(
    'plan', p_plan, 'estado', v_estado, 'periodo_fin', v_fin,
    'tope_vendedores', v_tope,
    'personas_permitidas', public.tope_de_miembros(p_empresa),
    'ingreso_anotado', v_ingreso is not null,
    'comision_generada', v_comision,
    'aviso', v_aviso
  );
end $fn$;

revoke all on function public.cambiar_plan_cuenta(uuid, text, integer, text, numeric, integer) from public, anon;
grant execute on function public.cambiar_plan_cuenta(uuid, text, integer, text, numeric, integer) to authenticated;

-- ------------------------------------------------------------
-- 8. EL CÓDIGO QUE SE HABÍA PERDIDO (068): LA MISMA REGLA
--
--    Copia exacta de la viva. La comisión del primer pago sale del plan de
--    ese pago (`plan_despues` del mismo renglón del registro) y de los
--    helpers de arriba.
-- ------------------------------------------------------------
create or replace function public.asignar_referido(
  p_empresa uuid,
  p_codigo  text,
  p_nota    text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_socio      public.socios;
  v_ya         uuid;
  v_pagos      integer;
  v_aviso      text := null;
  v_rechazo    public.codigos_rechazados;
  v_por_enlace boolean := false;
  v_primero    record;
  v_pct        numeric;
  v_comision   boolean := false;
  v_base       numeric;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios
  where codigo = upper(trim(coalesce(p_codigo, '')));

  if v_socio.id is null then
    raise exception 'No hay ningún socio con ese código.' using errcode = '22023';
  end if;

  if not v_socio.activo then
    raise exception '% está desactivado como socio. Activalo en «Socios» y volvé a anotarlo.',
      v_socio.nombre using errcode = '22023';
  end if;

  if not exists (select 1 from public.empresas where id = p_empresa) then
    raise exception 'Ese negocio no existe.' using errcode = '22023';
  end if;

  if v_socio.user_id is not null and exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa and m.user_id = v_socio.user_id
  ) then
    raise exception
      '% trabaja en ese negocio: no se cobra comisión por traerse a uno mismo.',
      v_socio.nombre using errcode = '22023';
  end if;

  select socio_id into v_ya from public.referidos where empresa_id = p_empresa;

  if v_ya is not null then
    if v_ya = v_socio.id then
      return jsonb_build_object(
        'ok', true, 'socio', v_socio.nombre,
        'aviso', 'Ya estaba anotado a nombre de ' || v_socio.nombre || '.'
      );
    end if;
    raise exception
      'Ese negocio ya está anotado a nombre de %. Se cuenta una sola vez y no se cambia.',
      coalesce((select nombre from public.socios where id = v_ya), 'otra persona')
      using errcode = '22023';
  end if;

  -- ¿Esta cuenta intentó entrar con ESTE código y se lo rechazaron?
  select * into v_rechazo from public.codigos_rechazados where empresa_id = p_empresa;
  v_por_enlace := v_rechazo.empresa_id is not null and v_rechazo.codigo = v_socio.codigo;

  -- «Ya pagó» se mide por el importe, no por el asiento (ver arriba).
  select count(*)::int into v_pagos
  from public.registro_admin r
  where r.empresa_id = p_empresa
    and r.accion = 'cambiar_plan'
    and coalesce(r.detalle->>'importe', '') ~ '^[0-9]+(\.[0-9]+)?$'
    and (r.detalle->>'importe')::numeric > 0;

  insert into public.referidos (empresa_id, socio_id, origen, nota, creado_por)
  values (
    p_empresa, v_socio.id,
    case when v_por_enlace then 'link' else 'a_mano' end,
    left(coalesce(p_nota, ''), 300), auth.uid()
  );

  if v_por_enlace and v_pagos > 0 then
    -- Entró con el enlace antes de pagar: la comisión del primer pago es
    -- suya, igual que si el código no se hubiera perdido. El primero y no
    -- el último, por la misma razón que en la 063.
    select (ra.detalle->>'importe')::numeric as importe,
           nullif(ra.detalle->>'ingreso_id', '')::uuid as ingreso,
           ra.detalle->>'plan_despues' as plan,
           ra.created_at
    into v_primero
    from public.registro_admin ra
    where ra.empresa_id = p_empresa
      and ra.accion = 'cambiar_plan'
      and coalesce(ra.detalle->>'importe', '') ~ '^[0-9]+(\.[0-9]+)?$'
      and (ra.detalle->>'importe')::numeric > 0
    order by ra.created_at
    limit 1;

    select coalesce(a.comision_porcentaje, 50) into v_pct from public.ajustes_orden a where a.unica;
    v_pct := coalesce(v_pct, 50);

    -- Desde la 102: el precio de lista del plan de ESE primer pago.
    v_base := public.base_de_comision(p_empresa, v_primero.plan, v_primero.importe);

    begin
      insert into public.comisiones (
        socio_id, empresa_id, movimiento_id, base, porcentaje, monto, nota
      ) values (
        v_socio.id, p_empresa, v_primero.ingreso, v_base, v_pct,
        public.monto_de_comision(p_empresa, v_base, v_pct, v_primero.importe),
        'Entró con el enlace el ' || to_char(v_rechazo.intentado_at at time zone 'America/Asuncion', 'DD/MM/YYYY')
          || ', pero el código fue rechazado (' || coalesce(nullif(v_rechazo.motivo, ''), 'sin motivo') || ') y se anotó después.'
      );
      v_comision := true;
      v_aviso := 'Entró con este código y se había perdido. Se generó la comisión por su primer pago.';
    exception when unique_violation then
      v_aviso := 'Entró con este código y se había perdido. Ya tenía una comisión, así que no se generó otra.';
    end;
  elsif v_por_enlace then
    v_aviso := 'Entró con este código y se había perdido. Cuando pague, la comisión sale sola.';
  elsif v_pagos > 0 then
    v_aviso := 'Ojo: este negocio ya pagó ' || v_pagos
            || (case when v_pagos = 1 then ' vez' else ' veces' end)
            || ' antes de anotarlo. La comisión no se genera por esos pagos, sino con el próximo cobro. Revisá el monto antes de pagarla.';
  end if;

  -- Resuelto: el rechazo deja de figurar.
  delete from public.codigos_rechazados where empresa_id = p_empresa;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'asignar_referido', jsonb_build_object(
    'socio_id', v_socio.id, 'socio', v_socio.nombre, 'codigo', v_socio.codigo,
    'pagos_previos', v_pagos, 'por_enlace', v_por_enlace, 'comision_generada', v_comision
  ));

  return jsonb_build_object(
    'ok', true, 'socio', v_socio.nombre, 'aviso', v_aviso,
    'por_enlace', v_por_enlace, 'comision_generada', v_comision
  );
end $fn$;

revoke all on function public.asignar_referido(uuid, text, text) from public, anon;
grant execute on function public.asignar_referido(uuid, text, text) to authenticated;
