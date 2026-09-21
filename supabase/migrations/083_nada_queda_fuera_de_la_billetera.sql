-- ============================================================
-- 083 · LO QUE QUEDÓ FUERA DE LA BILLETERA SE VE Y SE ARREGLA
-- ============================================================
--
-- Matías: «entro a Orden y lo primero que veo es cuánto tengo. Si gasté de
-- mi Banco Atlas y no se me descuenta, eso no es lo que tengo». Tenía razón,
-- y el agujero es más ancho de lo que parecía.
--
-- CÓMO FUNCIONA EL REPARTO (074) Y DÓNDE SE ROMPE
--
-- Cada forma de pago vive en UNA sola cuenta: transferencia en el banco,
-- efectivo en la caja. Al cargar un movimiento, un trigger lo manda a la
-- cuenta que reclama esa forma de pago. Limpio, mientras todas las formas de
-- pago tengan casa. Cuando alguna no la tiene, el movimiento se guarda con
-- `cuenta_id` en null y **desaparece de la billetera sin decir nada**.
--
-- Pasa más de lo que uno creería. Mirando la base el 21/09:
--
--   · «otro» no estaba asignado a ninguna cuenta en NINGUNA empresa. Todo
--     gasto cargado con esa forma de pago caía al vacío.
--   · «Banco Atlas» existía con la lista de formas de pago vacía: una cuenta
--     que no puede recibir nada, ahí en la pantalla como si funcionara.
--   · Había Gs. 13.000.000 y Gs. 2.711.156 sin asignar en dos cuentas.
--
-- QUÉ SE HACE ACÁ
--
-- Nada de adivinar. Un movimiento que no se pudo repartir NO se manda a una
-- cuenta cualquiera para que el total cierre: eso sería cambiar un número
-- que miente por otro que miente distinto. Lo que se hace es **mostrarlo**,
-- con el monto y la cantidad, y dar la forma de asignarlo —de a uno o todos
-- juntos—. La plata la ubica quien sabe dónde estuvo.
--
-- El arreglo de raíz es de pantalla y va aparte: que al cargar un gasto se
-- pregunte siempre de qué cuenta sale.

-- ------------------------------------------------------------
-- 1. LA BILLETERA TAMBIÉN CUENTA LO QUE NO ESTÁ EN ELLA
--
--    Va adentro de `billetera()` y no en una función aparte para que sea
--    imposible dibujar el total sin tener a mano lo que falta: quien pinte
--    la pantalla lo recibe sí o sí.
-- ------------------------------------------------------------
create or replace function public.billetera(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_cuentas jsonb;
  v_zona    text;
  v_sueltos record;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nombre', c.nombre,
    'tipo', c.tipo,
    'metodos', to_jsonb(c.metodos),
    'saldo', s.saldo,
    -- Lo que se movió este mes por esta cuenta, para que el número no esté solo.
    'entro_mes', coalesce(mes.entro, 0),
    'salio_mes', coalesce(mes.salio, 0)
  ) order by c.orden, c.created_at), '[]'::jsonb)
  into v_cuentas
  from public.cuentas_dinero c
  cross join lateral (select public.saldo_cuenta_dinero(c.id) as saldo) s
  left join lateral (
    select
      sum(m.monto) filter (where m.tipo <> 'gasto') as entro,
      sum(m.monto) filter (where m.tipo = 'gasto')  as salio
    from public.movimientos m
    where m.cuenta_id = c.id and m.estado = 'activo'
      and m.fecha >= date_trunc('month', (now() at time zone v_zona))::date
  ) mes on true
  where c.empresa_id = p_empresa and c.activa;

  -- Lo que se cargó y no llegó a ninguna cuenta. El neto y no la suma a
  -- secas: un gasto de 100 y un ingreso de 100 sin asignar no son 200 de
  -- desajuste, son cero.
  select count(*)::int as cantidad,
         coalesce(sum(case when m.tipo = 'gasto' then -m.monto else m.monto end), 0) as neto,
         min(m.fecha) as desde
  into v_sueltos
  from public.movimientos m
  where m.empresa_id = p_empresa and m.estado = 'activo' and m.cuenta_id is null;

  return jsonb_build_object(
    'cuentas', v_cuentas,
    'total', coalesce((select sum((x->>'saldo')::numeric) from jsonb_array_elements(v_cuentas) x), 0),
    'sin_cuenta', jsonb_build_object(
      'cantidad', coalesce(v_sueltos.cantidad, 0),
      'neto',     coalesce(v_sueltos.neto, 0),
      'desde',    v_sueltos.desde
    ),
    -- Formas de pago que no tienen dónde caer. Con esto la pantalla puede
    -- decir «arreglá esto» en vez de esperar a que la plata se pierda.
    'metodos_sin_cuenta', (
      select coalesce(jsonb_agg(m order by m), '[]'::jsonb)
      from unnest(array['efectivo', 'transferencia', 'tarjeta', 'credito', 'otro']) m
      where exists (select 1 from public.cuentas_dinero c2
                    where c2.empresa_id = p_empresa and c2.activa)
        and not exists (select 1 from public.cuentas_dinero c3
                        where c3.empresa_id = p_empresa and c3.activa and m = any (c3.metodos))
    )
  );
end $fn$;

-- ------------------------------------------------------------
-- 2. LA LISTA DE LO QUE QUEDÓ SUELTO
--
--    Con la forma de pago adentro: es el dato que le dice a la persona de
--    qué cuenta salió realmente («fue transferencia» → fue del banco).
-- ------------------------------------------------------------
create or replace function public.movimientos_sin_cuenta(p_empresa uuid, p_limite integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'fecha', x.fecha, 'tipo', x.tipo, 'descripcion', x.descripcion,
    'categoria', x.categoria, 'monto', x.monto, 'metodo_pago', x.metodo_pago
  ) order by x.fecha desc, x.created_at desc), '[]'::jsonb)
  into v_res
  from (
    select m.id, m.fecha, m.tipo, m.descripcion, m.categoria, m.monto, m.metodo_pago, m.created_at
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo' and m.cuenta_id is null
    order by m.fecha desc, m.created_at desc
    limit greatest(1, least(coalesce(p_limite, 100), 500))
  ) x;

  return v_res;
end $fn$;

revoke all on function public.movimientos_sin_cuenta(uuid, integer) from public, anon;
grant execute on function public.movimientos_sin_cuenta(uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- 3. PONERLE CUENTA A LO QUE NO LA TIENE
--
--    Solo mueve lo que está suelto. Un movimiento que YA tiene cuenta no se
--    toca desde acá: cambiarle la cuenta a algo que ya cuadró es corregir un
--    error distinto, y para eso está editar el movimiento.
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

-- ------------------------------------------------------------
-- 4. EL SELECTOR TIENE QUE PODER DECIR A DÓNDE VA A IR LA PLATA
--
--    Sin las formas de pago de cada cuenta, la pantalla puede ofrecer
--    «automática» pero no puede decir qué significa. Y «automática» sin
--    decir a dónde es exactamente el agujero de esta migración: la persona
--    elige confiando y la plata se va a ningún lado.
-- ------------------------------------------------------------
create or replace function public.cuentas_para_elegir(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
                    'id', c.id, 'nombre', c.nombre, 'tipo', c.tipo,
                    'metodos', to_jsonb(c.metodos))
                            order by c.orden, c.created_at), '[]'::jsonb)
  into v_lista
  from public.cuentas_dinero c
  where c.empresa_id = p_empresa and c.activa;

  return v_lista;
end $fn$;
