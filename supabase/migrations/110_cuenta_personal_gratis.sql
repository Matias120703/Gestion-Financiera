-- ============================================================
-- 110 · LA CUENTA PERSONAL NO SE CIERRA: PASA AL PLAN GRATIS
-- ============================================================
--
-- QUÉ DECIDIÓ MATÍAS (28/09/2026)
--
-- El candado total del 15/09 (069) cerraba cualquier cuenta al terminar la
-- prueba. Para la cuenta PERSONAL, desde hoy no: cuando terminan sus 5 días
-- de prueba del Pro —o se le vence el Pro que pagó— pasa al plan Gratis.
-- En Gratis anota a mano sus gastos y sus ingresos, ve su historial e
-- invita (la comisión sigue naciendo solo con el primer pago del invitado).
-- La voz, la foto y el texto con IA, los comprobantes, los reportes, el
-- Excel, el presupuesto (fijos, metas, ahorros, categorías propias), las
-- deudas, «Me deben» y la billetera son del Pro. Nada se borra: lo que
-- cargó queda guardado y vuelve entero cuando paga.
--
-- Y para los negocios, sus palabras: «Los negocios no se tocan, así se
-- quedan». Un negocio vencido sigue con el candado total, con el mismo
-- mensaje.
--
-- CÓMO SE DECIDE
--
-- `limites_plan(plan)` (077) responde por un plan y no sabe de tipos de
-- cuenta: no se toca, y para ella 'gratis' sigue siendo «cuenta vencida».
-- Nace `limites_de_empresa(empresa)`, la ÚNICA que mira el tipo de cuenta.
-- A la personal en Gratis le da escritura=true, excel=false,
-- adjuntos=false, capturas_mes=0 y gratis_personal=true. A cualquier otra
-- cuenta, lo mismo que limites_plan más gratis_personal=false.
--
--   · puede_cargar, estado_cuenta y datos_empresa pasan a leerla.
--   · exigir_cuenta_activa (los 33 triggers cuenta_activa_*) deja pasar a
--     la personal en Gratis SOLO en `movimientos` de gasto o ingreso. En
--     las otras 32 tablas le dice «Eso es del plan Pro…».
--   · exigir_plan_personal (nueva) cierra fiado, cuentas_dinero y
--     ajustes_cuenta a la personal en Gratis. Esas tablas no tienen el
--     candado; para un negocio este trigger no hace nada.
--   · asignar_cuenta_a_sueltos (083): ponerle cuenta a la plata suelta es
--     manejar la billetera. Solo la frenaba el candado, que ahora le deja
--     pasar el UPDATE de un gasto: se lo pregunta ella misma.
--   · puede_bajar_excel (nueva): la ruta del Excel la usa en vez de
--     puede_cargar.
--   · proteger_empresa: como ahora todo depende del tipo de cuenta, lo
--     cambia solo la administración.
--   · vaciar_empresa: «Empezar de cero» anda en Gratis aunque haya un pago
--     de cuota atado a un movimiento.
--   · consumir_credito_ia: con tope 0 ya no regala la primera captura del
--     mes (era un bug, para todos).
--   · resumen_panel: la personal en Gratis no cuenta como «vencida» ni como
--     «pagando»; se cuenta aparte en `gratis_personales`.
--
-- LA REGLA QUE QUEDA
--
-- Lo pago se pregunta con `limites_de_empresa`, NO con `puede_cargar`.
-- Desde acá puede_cargar le dice true a la personal en Gratis, porque tiene
-- que poder anotar. Si mañana algo del Pro se decide con puede_cargar, se
-- le abre a Gratis. Hoy la leen este candado, avisos_del_dia (106: que
-- Gratis reciba los avisos para anotar es a propósito) y la 098, que es del
-- trainer (un negocio). La ruta del Excel deja de leerla.
--
-- QUÉ NO CAMBIA
--
-- Para un negocio, puede_cargar, exigir_cuenta_activa, estado_cuenta,
-- datos_empresa y vaciar_empresa responden lo mismo que ayer, y el mensaje
-- de la 069 queda letra por letra. La única diferencia a la vista es la
-- clave limites.gratis_personal=false. Lo que sí le llega a un negocio, y
-- solo por API o en el panel de Orden: no puede cambiar su tipo de cuenta
-- por su cuenta, la IA con tope 0 no le regala la primera del mes y
-- resumen_panel cuenta distinto. No se tocan limites_plan ni
-- plan_efectivo_calculado.
--
-- Tampoco se cierran, a propósito, dos huecos previos de los negocios (van
-- como tareas aparte, para no tocarlos acá): un negocio vencido todavía
-- escribe fiado, clientes y la billetera por API, y todavía no puede
-- «Empezar de cero» si tiene un pago de cuota. `clientes` queda sin candado
-- también en Gratis: archivar o eliminar a una persona tiene que andar
-- siempre (099).
--
-- Storage tampoco se toca: la policy `comprobantes_subir` (007) solo pide
-- es_miembro, así que la personal en Gratis todavía puede subir un archivo
-- por API, aunque no lo pueda enganchar a un movimiento (`adjuntos` sí tiene
-- candado) y no se vea en ningún lado. No es nuevo: una personal vencida ya
-- podía. Tarea aparte: que la policy pregunte por `adjuntos` en
-- limites_de_empresa, con una función que authenticated pueda llamar (la
-- policy corre con los permisos de quien sube, y esta es solo del sistema).
--
-- Cada función redefinida es copia exacta de su última versión —el .sql
-- que se cita en cada bloque, cotejado con prosrc en producción el
-- 28/09/2026— más el cambio marcado «110». Los dos mensajes nuevos tienen
-- su portugués en src/lib/mensajes-base.ts.
--
-- Idempotente: se puede aplicar dos veces.
-- ============================================================


-- ------------------------------------------------------------
-- 1. LOS LÍMITES DE ESTA CUENTA (nueva)
--
--    `limites_plan` responde por un plan; esta, por una cuenta. Es la única
--    que conoce el tipo de cuenta: si mañana cambia qué trae Gratis, se
--    cambia acá y en ningún otro lado. Solo la llaman otras funciones de la
--    base; la app la ve adentro de `datos_empresa().limites`.
-- ------------------------------------------------------------
create or replace function public.limites_de_empresa(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_plan text := public.plan_efectivo_calculado(p_empresa);
  v_tipo text;
begin
  select coalesce(e.tipo_cuenta, 'emprendedor') into v_tipo
  from public.empresas e where e.id = p_empresa;

  if v_plan = 'gratis' and v_tipo = 'personal' then
    return public.limites_plan('gratis')
      || jsonb_build_object('escritura', true, 'excel', false, 'gratis_personal', true);
  end if;

  return public.limites_plan(v_plan) || jsonb_build_object('gratis_personal', false);
end $fn$;

revoke all on function public.limites_de_empresa(uuid) from public, anon, authenticated;
grant execute on function public.limites_de_empresa(uuid) to service_role;


-- ------------------------------------------------------------
-- 2. ¿ES UNA CUENTA PERSONAL EN GRATIS? (nueva)
--
--    La pregunta que se hacen los dos candados. Para un negocio es siempre
--    false, venza o no.
-- ------------------------------------------------------------
create or replace function public.es_gratis_personal(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce((public.limites_de_empresa(p_empresa)->>'gratis_personal')::boolean, false);
$fn$;

revoke all on function public.es_gratis_personal(uuid) from public, anon, authenticated;
grant execute on function public.es_gratis_personal(uuid) to service_role;


-- ------------------------------------------------------------
-- 3. ¿ESTA EMPRESA PUEDE CARGAR? (018:81-86)
--
--    La misma pregunta de la 018, que ahora responde por la cuenta y no por
--    el plan: a la personal en Gratis le dice que sí (anota gastos e
--    ingresos; el candado frena el resto). A un negocio, lo mismo que antes.
-- ------------------------------------------------------------
create or replace function public.puede_cargar(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce(
    (public.limites_de_empresa(p_empresa)->>'escritura')::boolean,
    false);
$fn$;

revoke all on function public.puede_cargar(uuid) from public, anon;
grant execute on function public.puede_cargar(uuid) to authenticated;


-- ------------------------------------------------------------
-- 4. ¿PUEDE BAJAR EL EXCEL? (nueva)
--
--    Hasta hoy la ruta del Excel preguntaba puede_cargar. Con la personal en
--    Gratis diciendo que sí, el Excel se le abría solo. Ahora pide las dos
--    cosas: poder escribir (un negocio vencido, no) y tener el Excel en el
--    plan (la personal en Gratis, no). Toda cuenta al día o en prueba, sí.
--
--    Y le contesta solo a quien es de la cuenta. puede_cargar (018) le
--    contesta a cualquiera con sesión que sepa el id de una empresa; juntas,
--    le decían de una cuenta ajena si está en Gratis, si paga o si venció.
--    A puede_cargar no se le puede sumar lo mismo: la leen avisos_del_dia,
--    que corre sin sesión, y la 098.
-- ------------------------------------------------------------
create or replace function public.puede_bajar_excel(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select public.es_miembro(p_empresa)
     and coalesce((l->>'escritura')::boolean, false)
     and coalesce((l->>'excel')::boolean, false)
  from (select public.limites_de_empresa(p_empresa) as l) x;
$fn$;

revoke all on function public.puede_bajar_excel(uuid) from public, anon;
grant execute on function public.puede_bajar_excel(uuid) to authenticated;


-- ------------------------------------------------------------
-- 5. EL GUARDIÁN (069:19-32)
--
--    Para un negocio, igual que en la 069, con el mismo mensaje. La
--    personal en Gratis pasa el primer `if` (puede_cargar le da true) y
--    entra al bloque nuevo: en `movimientos` solo gasto o ingreso; en las
--    otras 32 tablas con candado, nada. El `if` va anidado a propósito:
--    `new.tipo` existe solo en `movimientos` y no se puede leer en otra
--    tabla. Toda tabla nueva con cuenta_activa_* nace cerrada para Gratis;
--    si algún día algo más tiene que ser gratis, se suma acá.
-- ------------------------------------------------------------
create or replace function public.exigir_cuenta_activa()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.puede_cargar(new.empresa_id) then
    raise exception 'Se te terminó la prueba. Para seguir usando Orden hace falta activar tu plan.'
      using errcode = '42501';
  end if;

  -- 110 (28/09/2026) · LA CUENTA PERSONAL EN GRATIS. puede_cargar le da true
  -- para que anote gastos e ingresos; todo lo demás que cuida este candado
  -- es del Pro. Un negocio nunca entra acá: para él es_gratis_personal es false.
  if public.es_gratis_personal(new.empresa_id) then
    -- «Empezar de cero» tiene que andar siempre (018:124-129). Al borrar los
    -- movimientos, el ON DELETE SET NULL de pagos_deuda (y de turnos_pago)
    -- es un UPDATE que este candado rechazaba. vaciar_empresa (12) marca la
    -- transacción, como orden.suscripcion_confiable en proteger_empresa.
    if tg_op = 'UPDATE'
       and coalesce(current_setting('orden.vaciando', true), '') = new.empresa_id::text then
      return new;
    end if;
    if tg_table_name <> 'movimientos' then
      raise exception 'Eso es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.'
        using errcode = '42501';
    end if;
    if new.tipo::text not in ('gasto', 'ingreso') then
      raise exception 'Eso es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $fn$;

revoke all on function public.exigir_cuenta_activa() from public, anon, authenticated;


-- ------------------------------------------------------------
-- 6. LAS TABLAS DEL PRO QUE NO TENÍAN CANDADO (nueva)
--
--    fiado («Me deben»), cuentas_dinero y ajustes_cuenta (la billetera)
--    nunca tuvieron cuenta_activa_*: al negocio vencido lo tapaba la
--    pantalla. La personal en Gratis entra a la app, así que acá la base es
--    lo único que queda. Solo frena a la personal en Gratis: para un
--    negocio no cambia nada (su hueco es previo y va aparte). El DELETE
--    queda libre, como en la 018: borrar una línea de fiado anda siempre.
--    `clientes` no va (099: archivar o eliminar a una persona anda siempre)
--    ni `uso_ia` (lo resuelve consumir_credito_ia, 9).
--
--    Los gastos de Gratis siguen cayendo en su cuenta por la forma de pago
--    (`anotar_en_su_cuenta`, 074): eso escribe en movimientos, no acá, y el
--    saldo se calcula. Al volver al Pro, la billetera está al día. Ponerle
--    cuenta a mano a lo que quedó suelto sí es del Pro: ver (13).
-- ------------------------------------------------------------
create or replace function public.exigir_plan_personal()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.es_gratis_personal(new.empresa_id) then
    -- El SET NULL en cascada de «Empezar de cero» (fiado.cobro_id). Ver (12).
    if tg_op = 'UPDATE'
       and coalesce(current_setting('orden.vaciando', true), '') = new.empresa_id::text then
      return new;
    end if;
    raise exception 'Eso es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.'
      using errcode = '42501';
  end if;
  return new;
end $fn$;

revoke all on function public.exigir_plan_personal() from public, anon, authenticated;

do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['fiado', 'cuentas_dinero', 'ajustes_cuenta'] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = v_tabla) then
      execute format('drop trigger if exists %I on public.%I', 'plan_personal_' || v_tabla, v_tabla);
      execute format('create trigger %I before insert or update on public.%I '
        || 'for each row execute function public.exigir_plan_personal()', 'plan_personal_' || v_tabla, v_tabla);
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 7. DATOS DE LA EMPRESA (010:255-311)
--
--    Lo que lee la app en cada página. `limites` pasa a ser el de la
--    cuenta: así el layout sabe que la personal en Gratis escribe (no la
--    tapa el CandadoCuenta), que no tiene comprobantes y que es Gratis
--    (`gratis_personal`, para el CandadoSeccion). El `uso_ia.tope` sigue
--    saliendo del plan: para Gratis es el mismo 0.
-- ------------------------------------------------------------
create or replace function public.datos_empresa(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res   jsonb;
  v_plan  text;
  v_sus   public.suscripciones;
  v_usados integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_plan := public.plan_efectivo_calculado(p_empresa);
  select * into v_sus from public.suscripciones where empresa_id = p_empresa;

  select usados into v_usados from public.uso_ia
  where empresa_id = p_empresa and periodo = to_char(public.hoy_empresa(p_empresa), 'YYYY-MM');

  select jsonb_build_object(
    'id', e.id,
    'nombre', e.nombre,
    'moneda', e.moneda,
    'zona_horaria', e.zona_horaria,
    'plan_efectivo', v_plan,
    'permitir_stock_negativo', e.permitir_stock_negativo,
    'codigo_acceso', case
      when public.es_admin(e.id) then (select a.codigo from public.empresa_accesos a where a.empresa_id = e.id and a.activo)
      else null
    end,
    -- 110 (28/09/2026): los límites de ESTA cuenta, no los del plan. Es lo
    -- que lee el layout (escritura, adjuntos, gratis_personal).
    'limites', public.limites_de_empresa(p_empresa),
    'uso_ia', jsonb_build_object('usados', coalesce(v_usados, 0),
                                 'tope', (public.limites_plan(v_plan)->>'capturas_mes')::integer),
    'suscripcion', jsonb_build_object(
      'estado',      coalesce(v_sus.estado, 'activa'),
      'plan',        coalesce(v_sus.plan, 'gratis'),
      'periodo',     coalesce(v_sus.periodo, 'mensual'),
      'periodo_fin', v_sus.periodo_fin,
      'en_prueba',   coalesce(v_sus.estado, '') = 'prueba'
                     and v_sus.periodo_fin is not null and v_sus.periodo_fin > now(),
      -- Días enteros que faltan. Se redondea hacia arriba: mientras quede
      -- una hora, todavía es "un día", no "cero días".
      'dias_restantes', case
        when v_sus.periodo_fin is null or v_sus.periodo_fin <= now() then 0
        else ceil(extract(epoch from (v_sus.periodo_fin - now())) / 86400)::int
      end,
      'ya_uso_prueba', v_sus.prueba_fin is not null,
      'cancela_al_vencer', coalesce(v_sus.cancela_al_vencer, false)
    ),
    'miembros', (select count(*)::int from public.miembros mm where mm.empresa_id = e.id)
  ) into v_res
  from public.empresas e where e.id = p_empresa;

  return v_res;
end $fn$;

grant execute on function public.datos_empresa(uuid)                  to authenticated;


-- ------------------------------------------------------------
-- 8. EL ESTADO DE LA CUENTA (018:163-197)
--
--    `vencida` y `puede_cargar` salen de los límites de la cuenta. Para un
--    negocio, lo mismo que antes; la personal en Gratis no está «vencida».
-- ------------------------------------------------------------
create or replace function public.estado_cuenta(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_sus   public.suscripciones;
  v_plan  text;
  v_dias  integer;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select * into v_sus from public.suscripciones where empresa_id = p_empresa;
  v_plan := public.plan_efectivo_calculado(p_empresa);

  v_dias := case
    when v_sus.periodo_fin is null then null
    else floor(extract(epoch from (v_sus.periodo_fin - now())) / 86400)::integer
  end;

  return jsonb_build_object(
    'plan', v_plan,
    'estado', v_sus.estado,
    'en_prueba', v_sus.estado = 'prueba' and coalesce(v_sus.periodo_fin > now(), false),
    -- 110 (28/09/2026): la personal en Gratis no está vencida: carga.
    'vencida', not coalesce(
      (public.limites_de_empresa(p_empresa)->>'escritura')::boolean, false),
    'puede_cargar', coalesce(
      (public.limites_de_empresa(p_empresa)->>'escritura')::boolean, false),
    'dias_restantes', v_dias,
    'periodo_fin', v_sus.periodo_fin,
    -- A partir de acá la pantalla decide si avisar. Tres días es cuando deja
    -- de ser un dato y pasa a ser algo que hay que resolver.
    'avisar', v_dias is not null and v_dias <= 3,
    'tipo_cuenta', (select e.tipo_cuenta from public.empresas e where e.id = p_empresa)
  );
end $fn$;

revoke all on function public.estado_cuenta(uuid) from public, anon;
grant execute on function public.estado_cuenta(uuid) to authenticated;


-- ------------------------------------------------------------
-- 9. CONSUMIR UN CRÉDITO DE IA (009:227-264)
--
--    El arreglo vale para todos: es un bug. Con tope 0 (Gratis, o un
--    negocio vencido) la primera captura del mes pasaba y gastaba una
--    llamada a OpenAI. Un negocio vencido no ve el micrófono, así que no
--    nota nada; la personal en Gratis sí lo ve, y ahora la base le dice que
--    no antes de gastar nada.
-- ------------------------------------------------------------
create or replace function public.consumir_credito_ia(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_periodo text;
  v_tope    integer;
  v_usados  integer;
  v_plan    text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_plan    := public.plan_efectivo_calculado(p_empresa);
  v_tope    := (public.limites_plan(v_plan)->>'capturas_mes')::integer;
  v_periodo := to_char(public.hoy_empresa(p_empresa), 'YYYY-MM');

  -- 110 (28/09/2026): con tope cero no se gasta nada, ni la primera del mes.
  -- El `where` del `on conflict` solo frena la rama UPDATE: sin fila del mes,
  -- el INSERT entraba con usados = 1 y dejaba pasar una captura —y una
  -- llamada a OpenAI— por mes a toda cuenta sin IA.
  if coalesce(v_tope, 0) <= 0 then
    select usados into v_usados from public.uso_ia
    where empresa_id = p_empresa and periodo = v_periodo;
    return jsonb_build_object(
      'permitido', false, 'usados', coalesce(v_usados, 0), 'tope', 0, 'plan', v_plan);
  end if;

  insert into public.uso_ia (empresa_id, periodo, usados)
  values (p_empresa, v_periodo, 1)
  on conflict (empresa_id, periodo) do update
    set usados = public.uso_ia.usados + 1, updated_at = now()
    where public.uso_ia.usados < v_tope
  returning usados into v_usados;

  if v_usados is null then
    select usados into v_usados from public.uso_ia
    where empresa_id = p_empresa and periodo = v_periodo;

    return jsonb_build_object(
      'permitido', false, 'usados', coalesce(v_usados, v_tope),
      'tope', v_tope, 'plan', v_plan);
  end if;

  return jsonb_build_object(
    'permitido', true, 'usados', v_usados, 'tope', v_tope, 'plan', v_plan);
end $fn$;

revoke all on function public.consumir_credito_ia(uuid) from public, anon;
grant execute on function public.consumir_credito_ia(uuid) to authenticated;


-- ------------------------------------------------------------
-- 10. RESUMEN DEL PANEL DE ORDEN (016:273-303)
--
--    «Vencidas» es la lista de a quiénes escribir para que paguen. Una
--    personal en Gratis no está cortada: usa el plan gratis, y ahí no
--    cuenta. Tampoco cuenta como «pagando» la Pro pagada que ya venció por
--    fecha (sigue con estado 'activa' hasta que alguien la mueve).
-- ------------------------------------------------------------
create or replace function public.resumen_panel()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'cuentas',      count(*),
    'personales',   count(*) filter (where e.tipo_cuenta = 'personal'),
    'comercios',    count(*) filter (where e.tipo_cuenta = 'emprendedor'),
    'en_prueba',    count(*) filter (where s.estado = 'prueba' and s.periodo_fin > now()),
    -- 110 (28/09/2026): una personal a la que se le terminó el Pro está en
    -- Gratis, no «pagando» ni «vencida»: se cuenta aparte. Para un negocio,
    -- «pagando» y «vencidas» cuentan lo mismo que antes.
    'pagando',      count(*) filter (where s.estado = 'activa' and s.plan <> 'gratis'
                                       and not (coalesce(e.tipo_cuenta, 'emprendedor') = 'personal'
                                                and public.plan_efectivo_calculado(e.id) = 'gratis')),
    'vencidas',     count(*) filter (where s.periodo_fin is not null and s.periodo_fin <= now()
                                       and coalesce(e.tipo_cuenta, 'emprendedor') <> 'personal'),
    'gratis_personales', count(*) filter (where coalesce(e.tipo_cuenta, 'emprendedor') = 'personal'
                                            and public.plan_efectivo_calculado(e.id) = 'gratis'),
    'vencen_semana', count(*) filter (
      where s.periodo_fin between now() and now() + interval '7 days'
    ),
    -- Cuánta IA se consumió este mes entre todos. Es el número que hay que
    -- mirar para saber si la factura de OpenAI va a sorprender.
    'ia_mes', coalesce((
      select sum(ui.usados) from public.uso_ia ui
      where ui.periodo = to_char(now(), 'YYYY-MM')
    ), 0)
  ) into v_res
  from public.empresas e
  join public.suscripciones s on s.empresa_id = e.id;

  return v_res;
end $fn$;

revoke all on function public.resumen_panel()                          from public, anon;
grant execute on function public.resumen_panel()                          to authenticated;


-- ------------------------------------------------------------
-- 11. PROTEGER LA EMPRESA (013:53-71)
--
--    Hasta hoy el dueño podía cambiar su tipo de cuenta con un UPDATE
--    directo (la policy empresas_update es es_admin). Ya era un abuso —el
--    checkout pone el precio según el tipo de cuenta— y desde acá sería la
--    salida del candado. Ninguna pantalla lo hace: crear_empresa lo pone en
--    el INSERT y el panel usa cambiar_tipo_cuenta, que exige superadmin. El
--    trigger `empresas_proteger` (002) no cambia.
-- ------------------------------------------------------------
create or replace function public.proteger_empresa()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.id is distinct from old.id then
    raise exception 'No se pueden cambiar los datos de identidad de la empresa.' using errcode = '42501';
  end if;

  if new.creada_por is distinct from old.creada_por
     and not (new.creada_por is null and old.creada_por is not null) then
    raise exception 'No se puede cambiar quién creó la empresa.' using errcode = '42501';
  end if;

  if new.plan is distinct from old.plan
     and coalesce(current_setting('orden.suscripcion_confiable', true), '') <> '1' then
    raise exception 'El plan solo lo puede cambiar el sistema de suscripciones.' using errcode = '42501';
  end if;

  -- 110 (28/09/2026): desde que la cuenta personal tiene Gratis, el tipo de
  -- cuenta decide qué se puede. Con un UPDATE directo, un negocio vencido se
  -- pasaba a personal y salía del candado (y podía pagar el Pro personal y
  -- volver). Lo cambia solo la administración: cambiar_tipo_cuenta (016).
  -- Sin sesión (tareas del sistema, pruebas) sigue libre.
  if new.tipo_cuenta is distinct from old.tipo_cuenta
     and auth.uid() is not null
     and not public.es_superadmin() then
    raise exception 'El tipo de cuenta solo lo cambia la administración de Orden.' using errcode = '42501';
  end if;

  return new;
end $fn$;

revoke all on function public.proteger_empresa() from public, anon, authenticated;


-- ------------------------------------------------------------
-- 12. VACIAR: «EMPEZAR DE CERO» (014:207-266)
--
--    Al borrar los movimientos, las cuotas pagadas (pagos_deuda), el fiado
--    cobrado y los turnos pagos quedan con su movimiento en null: un UPDATE
--    que el candado le rechazaba a la personal en Gratis. Irse tiene que
--    ser gratis (018), así que el vaciado marca la transacción y los dos
--    candados dejan pasar ese UPDATE, solo de esta empresa. Es el patrón
--    de `orden.suscripcion_confiable` (013). La marca solo se lee adentro
--    de la rama de Gratis: para un negocio vencido, vaciar sigue igual que
--    hoy (hueco previo, tarea aparte).
-- ------------------------------------------------------------
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

  -- 110 (28/09/2026): los candados de la gratis personal dejan pasar el
  -- SET NULL en cascada de este borrado (ver exigir_cuenta_activa). Solo
  -- dentro de esta transacción y solo para esta empresa.
  perform set_config('orden.vaciando', p_empresa::text, true);

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

  perform set_config('orden.vaciando', '', true);

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


-- ------------------------------------------------------------
-- 13. PONERLE CUENTA A LA PLATA SUELTA (083:150-181)
--
--    La usa «Plata sin cuenta», adentro de /billetera. No tenía control
--    propio: la frenaba el candado, porque solo hace un UPDATE de
--    movimientos. Desde el bloque (5) ese UPDATE pasa para un gasto o un
--    ingreso de la personal en Gratis, así que se le volvía a abrir y movía
--    los saldos de sus cuentas. Ponerle cuenta a lo suelto es manejar la
--    billetera, como crear, ajustar o quitar una cuenta (6), y eso es del
--    Pro. No se frena en el candado mirando cuenta_id: anotar_en_su_cuenta
--    (074) también la cambia cuando cambia la forma de pago, y eso tiene que
--    seguir andando: así, al volver al Pro, la billetera está al día. Para un
--    negocio no cambia nada.
-- ------------------------------------------------------------
create or replace function public.asignar_cuenta_a_sueltos(
  p_empresa uuid,
  p_cuenta  uuid,
  p_movimiento uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_filas integer;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  -- 110 (28/09/2026): ponerle cuenta a la plata suelta es manejar la
  -- billetera, que es del Pro.
  if public.es_gratis_personal(p_empresa) then
    raise exception 'Eso es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.cuentas_dinero c
                 where c.id = p_cuenta and c.empresa_id = p_empresa and c.activa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  update public.movimientos m
  set cuenta_id = p_cuenta
  where m.empresa_id = p_empresa
    and m.estado = 'activo'
    and m.cuenta_id is null
    and (p_movimiento is null or m.id = p_movimiento);

  get diagnostics v_filas = row_count;

  return jsonb_build_object('asignados', v_filas, 'saldo', public.saldo_cuenta_dinero(p_cuenta));
end $fn$;

revoke all on function public.asignar_cuenta_a_sueltos(uuid, uuid, uuid) from public, anon;
grant execute on function public.asignar_cuenta_a_sueltos(uuid, uuid, uuid) to authenticated;
