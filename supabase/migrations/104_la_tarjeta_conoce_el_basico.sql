-- ============================================================
-- 104 · LA TARJETA CONOCE EL BÁSICO
-- ============================================================
--
-- `aplicar_suscripcion` es la única puerta por la que un pago con tarjeta
-- cambia el plan de una cuenta: la llama el webhook de la pasarela
-- (src/app/api/pagos/webhook/route.ts) con el rol service_role, nunca el
-- navegador. Hoy la pasarela está apagada y se cobra por transferencia
-- (`cambiar_plan_cuenta`, desde el panel de la administración). Esta
-- migración deja la puerta de la tarjeta a la par de la de la
-- transferencia en dos cosas que se le habían quedado atrás.
--
-- 1. EL BÁSICO ERA UN «PLAN DESCONOCIDO»
--
-- La versión viva (la de la 009, verificada en producción el 23/09 con
-- pg_get_functiondef) dice:
--
--     if p_plan not in ('gratis', 'pro', 'negocio') then
--       raise exception 'Plan desconocido: %' ...
--
-- El Básico nació en la 077, que se lo enseñó a las tablas; a
-- `cambiar_plan_cuenta` se lo enseñó la 102, y esta función quedó con la
-- lista vieja (la 009 es la última que la redefinió). Desde la 102 hay
-- rubros que SOLO pueden tener Básico (docentes y trainers), así que el día
-- que se prenda la pasarela un profe que paga con tarjeta rebotaría con un
-- error, después de que Stripe le cobró. Stripe reintentaría el evento
-- durante días y todos rebotarían igual: el error no es de red, es de la
-- lista.
--
-- Se agrega 'basico' a la lista y nada más. Las tres constraints que tienen
-- la palabra —empresas_plan_check, suscripciones_plan_check y
-- precios_plan_check— se verificaron en producción el 23/09 y ya aceptan
-- 'basico' (lo hizo la 077): no se tocan.
--
-- Un detalle que queda como estaba, a propósito: esta función escribe en
-- `empresas.plan` el plan tal cual (Básico queda 'basico'), mientras que
-- `cambiar_plan_cuenta` escribe 'pro' para cualquier plan pago. Lo que
-- manda de verdad es `suscripciones.plan` (plan_efectivo_calculado,
-- tope_de_miembros, limites_plan), y ahí las dos escriben el plan real. No
-- es trabajo de esta migración emparejar esa columna vieja.
--
-- 2. LA COMISIÓN DEL SOCIO SOLO NACÍA POR TRANSFERENCIA
--
-- Desde la 060 la comisión de quien trajo al cliente nace en dos lugares:
-- `cambiar_plan_cuenta` (cuando se cobra) y `asignar_referido` (cuando el
-- código se había perdido y se anota después del primer pago). Por tarjeta
-- no nacía nunca: un negocio que un socio trajo y que pagó con tarjeta le
-- dejaba cero al socio, sin error y sin aviso. Lo mismo que la 063 corrigió
-- para la transferencia, con otra causa.
--
-- Acá nace con las MISMAS reglas que `cambiar_plan_cuenta` en la 103
-- (versión viva, verificada en producción con pg_get_functiondef):
--
--   · Solo si entró plata: plan distinto de 'gratis' e importe > 0. Y, como
--     esta puerta también recibe estados que no son un cobro, solo con
--     estado 'activa'. Una 'prueba' (trialing de Stripe), una 'morosa' (la
--     tarjeta rebotó), una 'cancelada' o una 'vencida' no son plata que
--     entró. Cuando termina la prueba y Stripe cobra de verdad, el evento
--     llega con 'activa' y ahí nace.
--
--   · Solo si la empresa tiene un referido con un socio activo.
--
--   · base   = base_de_comision(empresa, plan, importe): el precio de lista
--              de UN mes del plan (102).
--     monto  = monto_de_comision(empresa, base, %, importe): el porcentaje
--              de la base, nunca más de lo que entró (102).
--     importe = lo que entró en este cobro (103).
--
--     Las dos funciones miran la moneda de la suscripción antes que la de
--     la empresa. Por eso el bloque va DESPUÉS del upsert: para cuando se
--     calcula, `suscripciones.moneda` ya es la moneda del pago (`p_moneda`).
--     Un negocio en guaraníes que paga en dólares con tarjeta recibe una
--     base de 19 (la lista en USD) y un monto de 9,50, y no una base de
--     110.000 comparada contra un importe de 19.
--
--   · Una sola vez por negocio, y eso lo garantiza el índice único de
--     `comisiones` sobre `empresa_id`, no el acordarse. Esto importa más
--     acá que en la transferencia: Stripe manda un
--     `customer.subscription.updated` en cada renovación, cada cambio de
--     plan y cada cambio de tarjeta, todos con estado 'activa' y el importe
--     del precio. El primero que llega con plata crea la comisión; los
--     demás chocan con el índice y no pasa nada. Si el negocio ya había
--     pagado por transferencia y generado la suya, la tarjeta tampoco crea
--     otra.
--
-- Una diferencia con `cambiar_plan_cuenta`, y es a propósito: allá solo se
-- ataja el choque con el índice (`unique_violation`); cualquier otro error
-- tira abajo todo el cambio de plan, y eso está bien porque del otro lado
-- hay una persona mirando el panel que ve el error y lo arregla. Acá del
-- otro lado hay un webhook: si la comisión fallara por cualquier otra cosa,
-- el cliente que YA pagó se quedaría sin su plan, y Stripe reintentaría el
-- mismo evento durante días con el mismo resultado. El que pagó no puede
-- quedar afuera por un problema entre Orden y el socio. Entonces otro
-- error en la comisión no frena la activación: deja un WARNING en el log
-- de Postgres con la empresa y el motivo, para que se pague a mano.
--
-- 3. EL COBRO NO SE ANOTA COMO INGRESO DE ORDEN, TODAVÍA
--
-- `cambiar_plan_cuenta` además anota el cobro como un ingreso en la
-- empresa de Orden (`ajustes_orden.empresa_id`), y la comisión guarda ese
-- movimiento. `aplicar_suscripcion` no lo hizo nunca, y esta migración NO
-- lo agrega: es otra decisión (con qué método de pago, si el importe es
-- bruto o neto de lo que se queda Stripe, qué pasa con los reembolsos y
-- con cada renovación, que sí es un ingreso cada mes) y merece su propia
-- migración con sus propias pruebas. Por eso la comisión que nace acá
-- lleva `movimiento_id` en null, como las que nacen por transferencia
-- cuando no hay empresa de Orden elegida (063): listar_comisiones y el
-- panel ya saben mostrarla.
--
-- La consecuencia, para que nadie se sorprenda: una comisión nacida por
-- tarjeta no se cae sola si el cobro se anula (eso cuelga del movimiento,
-- 060) y hay que anularla a mano si hay un reembolso.
--
-- LO QUE NO CAMBIA
--
-- Todo lo demás es copia EXACTA de la versión viva: la firma de 11
-- argumentos, los estados, el upsert, `orden.suscripcion_confiable`, que
-- no devuelve nada, y que es exclusiva de service_role. Los permisos se
-- reescriben igual (misma firma: `create or replace` los conserva), para
-- que este archivo diga por sí solo quién puede llamarla.
--
-- No hay mensajes nuevos: 'Plan desconocido: %' y 'Estado desconocido: %'
-- ya tienen su portugués en src/lib/mensajes-base.ts.
--
-- Idempotente: son un `create or replace` y un revoke/grant.
-- ============================================================

create or replace function public.aplicar_suscripcion(
  p_empresa uuid,
  p_plan text,
  p_estado text default 'activa',
  p_periodo_inicio timestamptz default null,
  p_periodo_fin timestamptz default null,
  p_proveedor text default null,
  p_customer_id text default null,
  p_subscription_id text default null,
  p_periodo text default 'mensual',
  p_moneda text default null,
  p_importe numeric default null
)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_socio uuid;
  v_pct   numeric;
  v_base  numeric;
begin
  -- 'basico' faltaba desde la 077 (ver la cabecera de la 104).
  if p_plan not in ('gratis', 'basico', 'pro', 'negocio') then
    raise exception 'Plan desconocido: %', p_plan using errcode = '22023';
  end if;
  if p_estado not in ('activa', 'prueba', 'vencida', 'cancelada', 'morosa') then
    raise exception 'Estado desconocido: %', p_estado using errcode = '22023';
  end if;

  insert into public.suscripciones (
    empresa_id, plan, estado, periodo_inicio, periodo_fin,
    proveedor_pago, customer_id_externo, subscription_id_externo,
    periodo, moneda, importe, updated_at
  )
  values (p_empresa, p_plan, p_estado, p_periodo_inicio, p_periodo_fin,
          p_proveedor, p_customer_id, p_subscription_id,
          coalesce(p_periodo, 'mensual'), p_moneda, p_importe, now())
  on conflict (empresa_id) do update set
    plan = excluded.plan,
    estado = excluded.estado,
    periodo_inicio = excluded.periodo_inicio,
    periodo_fin = excluded.periodo_fin,
    proveedor_pago = coalesce(excluded.proveedor_pago, public.suscripciones.proveedor_pago),
    customer_id_externo = coalesce(excluded.customer_id_externo, public.suscripciones.customer_id_externo),
    subscription_id_externo = coalesce(excluded.subscription_id_externo, public.suscripciones.subscription_id_externo),
    periodo = coalesce(excluded.periodo, public.suscripciones.periodo),
    moneda = coalesce(excluded.moneda, public.suscripciones.moneda),
    importe = coalesce(excluded.importe, public.suscripciones.importe),
    cancela_al_vencer = (excluded.estado = 'cancelada'),
    updated_at = now();

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = p_plan where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  -- ---- la comisión de quien trajo al cliente (104) ----
  -- Las mismas reglas que cambiar_plan_cuenta (103): solo si entró plata,
  -- la mitad del precio de lista de un mes, nunca más de lo que entró, y
  -- una sola vez por negocio por el índice único. Va después del upsert
  -- para que base y monto usen la moneda del pago.
  if p_estado = 'activa' and p_plan <> 'gratis' and coalesce(p_importe, 0) > 0 then
    select r.socio_id into v_socio
    from public.referidos r
    join public.socios s on s.id = r.socio_id
    where r.empresa_id = p_empresa and s.activo;

    if v_socio is not null then
      select coalesce(a.comision_porcentaje, 50) into v_pct
      from public.ajustes_orden a where a.unica;

      begin
        v_base := public.base_de_comision(p_empresa, p_plan, p_importe);

        -- Sin movimiento: la tarjeta todavía no anota el ingreso de Orden.
        insert into public.comisiones (
          socio_id, empresa_id, movimiento_id, base, porcentaje, monto, importe
        ) values (
          v_socio, p_empresa, null, v_base, coalesce(v_pct, 50),
          public.monto_de_comision(p_empresa, v_base, coalesce(v_pct, 50), p_importe),
          p_importe
        );
      exception
        when unique_violation then
          -- Ya cobró por este negocio (una renovación, o pagó antes por
          -- transferencia). Se paga una sola vez: el primer pago.
          null;
        when others then
          -- El que pagó no se queda sin su plan por la comisión: se avisa
          -- en el log y se paga a mano.
          raise warning 'aplicar_suscripcion: la comisión de la empresa % no se pudo generar: %',
            p_empresa, sqlerrm;
      end;
    end if;
  end if;
end $fn$;

revoke all on function public.aplicar_suscripcion(
  uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.aplicar_suscripcion(
  uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, numeric)
  to service_role;
