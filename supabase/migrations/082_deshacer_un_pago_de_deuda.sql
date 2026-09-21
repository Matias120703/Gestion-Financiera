-- ============================================================
-- 082 · DESHACER UN PAGO DE DEUDA QUE NO FUE
-- ============================================================
--
-- Matías: «pagué una deuda que en realidad no pagué. Borré el historial y me
-- seguía apareciendo como pagada». Las dos mitades del problema:
--
--   1. No había forma de anular un pago. `registrar_pago_deuda` baja el
--      saldo, suma una cuota, corre el vencimiento un mes y crea el gasto.
--      Nada de eso tenía vuelta atrás.
--   2. Borrar el movimiento a mano no alcanza y encima confunde: el saldo de
--      la deuda vive en `deudas.saldo`, no se recalcula de los pagos. El
--      gasto desaparecía y la deuda seguía saldada.
--
-- Anular un pago tiene que deshacer las cuatro cosas juntas o ninguna.
--
-- POR QUÉ SE GUARDA EL «ANTES» Y NO SE RECALCULA
--
-- El saldo se puede devolver sumando: es plata. El vencimiento no. Si el
-- pago dejó la deuda saldada, `vence_el` quedó en null, y de un null no se
-- deduce qué fecha había antes. Lo mismo con la cuota: solo se sumó si la
-- deuda tenía cuotas y faltaban, así que restar siempre uno sería inventar.
--
-- Por eso cada pago anota qué había antes de tocarlo. Es la misma idea que
-- el resto del sistema: guardar el hecho, no la conclusión. Los pagos
-- anteriores a esta migración no lo tienen, y ahí se hace lo mejor posible
-- —restar un mes si hay fecha, restar la cuota si hay cuotas— y se avisa en
-- la respuesta, para que la pantalla pueda pedir que revise el vencimiento.
--
-- EL GASTO SE ANULA, NO SE BORRA
--
-- `anular_movimiento` lo deja marcado con quién y cuándo. El saldo de la
-- cuenta cuenta solo los activos, así que la billetera vuelve sola a donde
-- estaba, y queda el rastro de que hubo un pago y se deshizo.

-- ------------------------------------------------------------
-- 1. QUÉ HABÍA ANTES DE ESTE PAGO
-- ------------------------------------------------------------
alter table public.pagos_deuda
  add column if not exists vence_antes   date,
  add column if not exists cuota_contada boolean;

comment on column public.pagos_deuda.vence_antes is
  'El vencimiento de la deuda antes de este pago, para poder deshacerlo (082).';
comment on column public.pagos_deuda.cuota_contada is
  'Si este pago sumó una cuota. Null en los pagos anteriores a la 082.';

-- ------------------------------------------------------------
-- 2. REGISTRAR UN PAGO, ANOTANDO EL ANTES
--
--    Igual que en la 015; lo único nuevo es que deja constancia de lo que
--    cambió, para que se pueda volver.
-- ------------------------------------------------------------
create or replace function public.registrar_pago_deuda(
  p_deuda       uuid,
  p_monto       numeric,
  p_fecha       date default null,
  p_crear_gasto boolean default true,
  p_metodo      text default 'efectivo',
  p_nota        text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_deuda      public.deudas;
  v_fecha      date;
  v_aplicado   numeric;
  v_movimiento uuid;
  v_pago       uuid;
  v_cuenta     boolean;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_deuda from public.deudas where id = p_deuda;
  if v_deuda.id is null then
    raise exception 'Esa deuda no existe.' using errcode = 'P0002';
  end if;
  if not public.es_admin(v_deuda.empresa_id) then
    raise exception 'Solo el propietario o un administrador puede registrar pagos.' using errcode = '42501';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El pago tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_deuda.saldo <= 0 then
    raise exception 'Esa deuda ya está saldada.' using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(v_deuda.empresa_id));

  -- Nunca más de lo que falta.
  v_aplicado := least(p_monto, v_deuda.saldo);

  -- La misma condición que usa el update de abajo: se decide una vez y se
  -- guarda, para que deshacerlo no tenga que adivinarla.
  v_cuenta := v_deuda.cuotas_totales is not null
              and v_deuda.cuotas_pagadas < v_deuda.cuotas_totales;

  -- El gasto primero: si falla, no queremos haber bajado el saldo.
  if p_crear_gasto then
    insert into public.movimientos (
      empresa_id, tipo, fecha, descripcion, categoria,
      subtotal, descuento, monto, costo_total, metodo_pago, creado_por
    ) values (
      v_deuda.empresa_id, 'gasto', v_fecha,
      'Pago ' || v_deuda.nombre, 'Deudas',
      v_aplicado, 0, v_aplicado, 0, coalesce(p_metodo, 'efectivo'), auth.uid()
    )
    returning id into v_movimiento;
  end if;

  insert into public.pagos_deuda (
    deuda_id, empresa_id, monto, fecha, movimiento_id, nota, creado_por,
    vence_antes, cuota_contada
  )
  values (p_deuda, v_deuda.empresa_id, v_aplicado, v_fecha, v_movimiento,
          coalesce(left(p_nota, 300), ''), auth.uid(),
          v_deuda.vence_el, v_cuenta)
  returning id into v_pago;

  update public.deudas
  set saldo = saldo - v_aplicado,
      cuotas_pagadas = case when v_cuenta then cuotas_pagadas + 1 else cuotas_pagadas end,
      vence_el = case
        when saldo - v_aplicado <= 0 then null
        when vence_el is not null then vence_el + interval '1 month'
        else null
      end,
      updated_at = now()
  where id = p_deuda;

  return jsonb_build_object(
    'pago_id', v_pago,
    'aplicado', v_aplicado,
    'sobrante', greatest(p_monto - v_aplicado, 0),
    'saldo', v_deuda.saldo - v_aplicado,
    'saldada', (v_deuda.saldo - v_aplicado) <= 0,
    'movimiento_id', v_movimiento
  );
end $fn$;

-- ------------------------------------------------------------
-- 3. DESHACERLO
--
--    Devuelve `vencimiento_a_revisar` cuando el pago es viejo y no guardó su
--    «antes»: la deuda vuelve, pero la fecha puede no ser la que era y quien
--    la mira tiene que poder enterarse.
-- ------------------------------------------------------------
create or replace function public.anular_pago_deuda(p_pago uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_pago    public.pagos_deuda;
  v_deuda   public.deudas;
  v_revisar boolean := false;
  v_vence   date;
  v_cuotas  integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_pago from public.pagos_deuda where id = p_pago;
  if v_pago.id is null then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
  if not public.es_admin(v_pago.empresa_id) then
    raise exception 'Solo el propietario o un administrador puede deshacer un pago.' using errcode = '42501';
  end if;

  select * into v_deuda from public.deudas where id = v_pago.deuda_id;
  if v_deuda.id is null then
    raise exception 'Esa deuda no existe.' using errcode = 'P0002';
  end if;

  -- El vencimiento: el guardado, o lo mejor que se pueda deducir.
  if v_pago.vence_antes is not null then
    v_vence := v_pago.vence_antes;
  elsif v_deuda.vence_el is not null then
    v_vence := (v_deuda.vence_el - interval '1 month')::date;
    v_revisar := true;
  else
    v_vence := null;
    -- Quedó en null porque el pago la saldó, y no hay de dónde sacar la
    -- fecha vieja. La deuda vuelve sin vencimiento y se edita a mano.
    v_revisar := true;
  end if;

  -- La cuota: solo se descuenta la que este pago sumó.
  v_cuotas := case
    when v_pago.cuota_contada is true then greatest(0, v_deuda.cuotas_pagadas - 1)
    when v_pago.cuota_contada is false then v_deuda.cuotas_pagadas
    -- Pago viejo, sin constancia: se deshace lo que la 015 habría hecho.
    when v_deuda.cuotas_totales is not null then greatest(0, v_deuda.cuotas_pagadas - 1)
    else v_deuda.cuotas_pagadas
  end;

  -- El gasto se anula, no se borra: queda el rastro y la billetera vuelve
  -- sola, porque el saldo de una cuenta solo suma los movimientos activos.
  if v_pago.movimiento_id is not null then
    begin
      perform public.anular_movimiento(v_pago.movimiento_id, 'Se deshizo el pago de la deuda');
    exception when others then
      -- Ya estaba anulado, o lo borraron a mano. El resto se deshace igual:
      -- dejar la deuda pagada porque el gasto no estaba sería peor.
      null;
    end;
  end if;

  update public.deudas
  set saldo          = saldo + v_pago.monto,
      cuotas_pagadas = v_cuotas,
      vence_el       = v_vence,
      updated_at     = now()
  where id = v_deuda.id;

  delete from public.pagos_deuda where id = p_pago;

  return jsonb_build_object(
    'deuda_id',  v_deuda.id,
    'devuelto',  v_pago.monto,
    'saldo',     v_deuda.saldo + v_pago.monto,
    'vencimiento_a_revisar', v_revisar
  );
end $fn$;

revoke all on function public.anular_pago_deuda(uuid) from public, anon;
grant execute on function public.anular_pago_deuda(uuid) to authenticated;
