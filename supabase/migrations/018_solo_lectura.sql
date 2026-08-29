-- ============================================================
-- ORDEN · Migración 018 · Al vencer se deja de cargar, no de mirar
--
-- QUÉ CAMBIA
--
-- Hasta ahora, cuando se terminaba la prueba la cuenta caía al plan `gratis`
-- y ahí se quedaba: 20 capturas de IA al mes, pero **carga manual sin
-- límite**. Para un almacén chico eso alcanzaba de sobra. Era un sistema
-- financiero completo, gratis para siempre, y nadie tenía motivo para pagar.
--
-- Ahora `gratis` deja de significar «plan gratuito» y pasa a significar
-- **cuenta vencida**: se puede entrar, ver todo el historial y bajar el
-- Excel, pero no cargar nada nuevo.
--
-- POR QUÉ NO SE BLOQUEA LA CUENTA ENTERA
--
-- Porque los datos son de esa persona, no nuestros. Dejar a alguien afuera de
-- sus propios números es la clase de cosa que genera un mensaje furioso y
-- mala fama — y en un mercado donde los comerciantes se conocen entre ellos,
-- esa fama cuesta más que la suscripción que se estaría forzando.
--
-- Solo lectura tiene la misma presión que bloquear —para seguir trabajando
-- hay que pagar— sin quedarse con lo ajeno. Y el Excel pasa a ser el mejor
-- argumento de venta: «mirá todo lo que cargaste, seguí desde donde estás».
--
-- POR QUÉ CON TRIGGERS Y NO CON POLÍTICAS
--
-- Se escribe desde muchos lados: políticas RLS para gastos, `registrar_venta`
-- para ventas, `crear_deuda` y `registrar_pago_deuda` para deudas, `adjuntar`
-- para comprobantes, `marcar_cierre` para el cierre. Poner el control en cada
-- uno significa que el día que se agregue una ruta nueva y alguien se olvide,
-- se abre un agujero silencioso.
--
-- Un trigger por tabla lo agarra TODO, venga por donde venga, incluidas las
-- funciones `security definer` que saltean RLS. Una definición por tabla en
-- vez de una por camino.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUÉ DA CADA PLAN · ahora `gratis` es «vencida»
--
--    Dos cambios respecto de la 009:
--
--    · `excel` pasa a true. Es el corazón de todo esto: la persona tiene que
--      poder llevarse lo suyo cuando quiera, aunque no pague.
--    · aparece `escritura`, que es lo que los triggers de abajo consultan.
--
--    `capturas_mes` en 0 y no en 20: si igual no puede cargar el movimiento,
--    darle capturas de IA sería gastar créditos de OpenAI para producir un
--    borrador que después rebota.
-- ------------------------------------------------------------
create or replace function public.limites_plan(p_plan text)
returns jsonb language sql immutable set search_path = public as $fn$
  select case coalesce(p_plan, 'gratis')
    when 'negocio' then jsonb_build_object(
      'capturas_mes', 3000, 'miembros', 15,
      'adjuntos', true, 'excel', true, 'avisos', true, 'escritura', true)
    -- Tres personas: el dueño y un par de ayudantes. Una despensa chica no
    -- tiene por qué pagar el plan de una cadena, y si la apretamos termina
    -- compartiendo un solo login — que es peor para todos, porque perdemos
    -- el registro de quién cargó cada venta.
    when 'pro' then jsonb_build_object(
      'capturas_mes', 600, 'miembros', 3,
      'adjuntos', true, 'excel', true, 'avisos', true, 'escritura', true)
    else jsonb_build_object(
      -- CUENTA VENCIDA. Mira todo, se lleva todo, no carga nada.
      'capturas_mes', 0, 'miembros', 1,
      'adjuntos', false, 'excel', true, 'avisos', true, 'escritura', false)
  end;
$fn$;

grant execute on function public.limites_plan(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. ¿ESTA EMPRESA PUEDE CARGAR?
--
--    Una sola pregunta, un solo lugar donde se responde.
-- ------------------------------------------------------------
create or replace function public.puede_cargar(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce(
    (public.limites_plan(public.plan_efectivo_calculado(p_empresa))->>'escritura')::boolean,
    false);
$fn$;

revoke all on function public.puede_cargar(uuid) from public, anon;
grant execute on function public.puede_cargar(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. EL GUARDIÁN
--
--    Sobre el `auth.uid() is null`: una escritura sin sesión no es de un
--    cliente. Es el webhook de pagos, una tarea programada, una migración o
--    un arreglo con `service_role`. Esas no las puede frenar el estado de
--    cobro de nadie —si no, un pago no podría registrarse justamente cuando
--    la cuenta está vencida, que es cuando más falta hace— y además se
--    ahorra la consulta en las cargas masivas.
-- ------------------------------------------------------------
create or replace function public.exigir_cuenta_activa()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.puede_cargar(new.empresa_id) then
    raise exception 'Se te terminó la prueba. Podés seguir viendo todo y bajando tu Excel, pero para cargar hay que activar el plan.'
      using errcode = '42501';
  end if;

  return new;
end $fn$;

-- Nadie la ejecuta a mano: la llama PostgreSQL al disparar el trigger, con
-- los permisos del dueño de la función. Que figure como ejecutable por
-- cualquiera no sirve para nada y ensucia la superficie. Misma trampa de la
-- migración 012: PUBLIC recibe EXECUTE sobre toda función nueva, y `anon`
-- hereda de PUBLIC.
revoke all on function public.exigir_cuenta_activa() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. DÓNDE SE APLICA
--
--    Solo INSERT y UPDATE. El DELETE queda libre a propósito: vaciar el
--    negocio y borrar la cuenta tienen que funcionar siempre, incluso —sobre
--    todo— con la cuenta vencida. Nadie debería tener que pagar para poder
--    irse.
-- ------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'movimientos', 'movimiento_items', 'productos',
    'deudas', 'pagos_deuda', 'adjuntos', 'cierres', 'retos'
  ] loop
    -- `if exists` porque este archivo se puede correr sobre una instalación
    -- que todavía no tenga alguna tabla (deudas llegó en la 015).
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = v_tabla
    ) then
      execute format('drop trigger if exists %I on public.%I',
                     'cuenta_activa_' || v_tabla, v_tabla);
      execute format(
        'create trigger %I before insert or update on public.%I '
        || 'for each row execute function public.exigir_cuenta_activa()',
        'cuenta_activa_' || v_tabla, v_tabla);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. EL ESTADO, PARA QUE LA PANTALLA LO EXPLIQUE
--
--    Sin esto la persona se encontraría con un error rojo al intentar
--    cargar, sin entender por qué. Con esto, la app le puede avisar ANTES —y
--    ofrecerle el botón de suscribirse— en vez de dejarla chocar contra una
--    pared.
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
    'vencida', not coalesce(
      (public.limites_plan(v_plan)->>'escritura')::boolean, false),
    'puede_cargar', coalesce(
      (public.limites_plan(v_plan)->>'escritura')::boolean, false),
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
