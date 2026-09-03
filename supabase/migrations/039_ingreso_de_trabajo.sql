-- ORDEN · Migración 039 · Lo que cobraste trabajando, a tu cuenta personal
--
-- Un empleado con reparto —comisión o sueldo— puede tener DOS cuentas en
-- Orden: es miembro del negocio donde trabaja, y puede tener su propia
-- cuenta personal para llevar sus finanzas. Hasta acá, si quería que su
-- cuenta personal reflejara lo que cobra en el negocio, tenía que volver a
-- escribir el número a mano.
--
-- LA CONEXIÓN YA EXISTE, NO SE CREA ACÁ
--
-- Cuando el dueño lo agrega en Equipo y reparto y elige su cuenta en el
-- desplegable, `turnos_profesional.user_id` ya queda apuntando a esa
-- persona. Esta migración no inventa un vínculo nuevo: LEE el que ya está,
-- cruzando por identidad (auth.uid()) y no por pertenecer a la empresa.
--
-- POR QUÉ ES UN TOQUE Y NO ALGO AUTOMÁTICO
--
-- La parte del empleado, apenas se cobra un corte, está en la caja del local
-- pero todavía no es plata que tiene en la mano — está en `le_debe` hasta
-- que el dueño la paga (`pagar_profesional`, migración 035). Cargarla sola
-- en la cuenta personal en el momento del corte sería mostrarle plata que
-- todavía no cobró: la misma mentira que el sistema no se permite en
-- ningún otro lado. Por eso lo que se puede «traer» es lo YA PAGADO, nunca
-- lo que falta cobrar.
--
-- POR QUÉ LA ESCRITURA NUNCA CRUZA LA FRONTERA
--
-- La función que trae el ingreso la ejecuta el propio empleado, sobre su
-- propia cuenta personal, con su propia sesión. El negocio nunca escribe en
-- una cuenta que no es la suya. La lectura cruza la frontera de empresa_id
-- —por eso hace falta SECURITY DEFINER, igual que en `mis_servicios`—; la
-- escritura, nunca.

-- ============================================================
-- 1. QUÉ YA SE TRAJO
--
--    Clave por `turnos_pago_id`, no por (usuario, monto): eso hace que
--    traer dos veces el mismo pago sea imposible al nivel de la base, no
--    solo del botón. Si dos pestañas tocan «Traer» a la vez, la segunda
--    inserción choca contra la primary key y no duplica nada.
-- ============================================================
create table if not exists public.turnos_pago_traido (
  turnos_pago_id    uuid primary key references public.turnos_pago (id) on delete cascade,
  traido_por        uuid not null references auth.users (id) on delete cascade,
  empresa_personal  uuid not null references public.empresas (id) on delete cascade,
  movimiento_id     uuid references public.movimientos (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists turnos_pago_traido_persona_idx
  on public.turnos_pago_traido (traido_por);

alter table public.turnos_pago_traido enable row level security;

drop policy if exists turnos_pago_traido_select on public.turnos_pago_traido;
create policy turnos_pago_traido_select on public.turnos_pago_traido
  for select to authenticated using (traido_por = auth.uid());

revoke all on public.turnos_pago_traido from anon, authenticated;
grant select on public.turnos_pago_traido to authenticated;

-- Sin esto, buscar «en qué empresas trabajo» recorrería turnos_profesional
-- entera. Con user_id como primera columna, la búsqueda por identidad es
-- directa.
create index if not exists turnos_profesional_user_idx
  on public.turnos_profesional (user_id) where user_id is not null;

-- ============================================================
-- 2. LO QUE TENÉS PENDIENTE DE TRAER
--
--    Sin argumentos: busca por auth.uid(), no por empresa. Es la pregunta
--    «¿dónde trabajo y cuánto me pagaron que todavía no anoté?», y esa
--    pregunta no la puede contestar la empresa activa —el empleado puede
--    trabajar en más de un negocio a la vez—.
-- ============================================================
create or replace function public.trabajos_pendientes()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x->>'negocio'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id', e.id,
      'negocio',    e.nombre,
      'moneda',     e.moneda,
      'pendiente',  sum(tp.monto),
      'pagos',      count(tp.id)
    ) as x
    from public.turnos_profesional p
    join public.empresas e on e.id = p.empresa_id
    join public.turnos_pago tp on tp.profesional_id = p.id
    left join public.turnos_pago_traido tt on tt.turnos_pago_id = tp.id
    where p.user_id = auth.uid()
      and tt.turnos_pago_id is null
    group by e.id, e.nombre, e.moneda
    having sum(tp.monto) > 0
  ) t;

  return v_res;
end $fn$;

revoke all on function public.trabajos_pendientes() from public, anon;
grant execute on function public.trabajos_pendientes() to authenticated;

-- ============================================================
-- 3. TRAERLO
--
--    Un movimiento POR PAGO, fechado el día real en que el negocio lo pagó
--    —nunca «hoy», que sería el día en que tocaste el botón—. Si te
--    pagaron el 5 y el 12, son dos ingresos en dos días distintos, no uno
--    solo en el día que se te ocurrió cargarlo.
-- ============================================================
create or replace function public.traer_ingreso_de_trabajo(
  p_negocio  uuid,
  p_personal uuid
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_prof      public.turnos_profesional%rowtype;
  v_negocio   text;
  v_categoria text;
  v_pago      record;
  v_mov       uuid;
  v_cuantos   integer := 0;
  v_total     numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  -- Tiene que ser TU trabajo: el profesional de esa empresa cuya cuenta de
  -- Orden es la que está llamando. No alcanza con que el negocio exista.
  select * into v_prof from public.turnos_profesional
  where empresa_id = p_negocio and user_id = auth.uid();
  if not found then
    raise exception 'No trabajás en ese negocio.' using errcode = '42501';
  end if;

  select nombre into v_negocio from public.empresas where id = p_negocio;

  -- Y tiene que ser TU cuenta personal. La única forma de ser admin de una
  -- cuenta personal es ser su dueño —nadie más se puede sumar, ver la 019—
  -- así que esta comprobación alcanza para que nadie traiga un ingreso a
  -- una cuenta que no es la suya.
  if not exists (select 1 from public.empresas
                 where id = p_personal and tipo_cuenta = 'personal') then
    raise exception 'Eso no es una cuenta personal.' using errcode = '22023';
  end if;
  if not public.es_admin(p_personal) then
    raise exception 'Esa cuenta no es tuya.' using errcode = '42501';
  end if;

  -- Comisión y propina van a «Extra»; un sueldo fijo, a «Sueldo». Las dos ya
  -- existen en categorias_de_ingreso (026) para una cuenta personal.
  v_categoria := case when v_prof.reparto = 'sueldo' then 'Sueldo' else 'Extra' end;

  for v_pago in
    select tp.* from public.turnos_pago tp
    left join public.turnos_pago_traido tt on tt.turnos_pago_id = tp.id
    where tp.profesional_id = v_prof.id and tt.turnos_pago_id is null
    order by tp.fecha
  loop
    insert into public.movimientos (
      empresa_id, tipo, fecha, descripcion, categoria,
      subtotal, descuento, monto, costo_total,
      metodo_pago, contraparte, origen, creado_por
    )
    values (
      p_personal, 'ingreso', v_pago.fecha,
      'Cobrado en ' || v_negocio, v_categoria,
      v_pago.monto, 0, v_pago.monto, 0,
      'otro', v_negocio, 'manual', auth.uid()
    )
    returning id into v_mov;

    -- Se registra en la MISMA transacción que el movimiento: si algo de acá
    -- para abajo fallara, PostgreSQL deshace las dos cosas juntas y no
    -- puede quedar un ingreso cargado sin su marca de «ya traído».
    insert into public.turnos_pago_traido (turnos_pago_id, traido_por, empresa_personal, movimiento_id)
    values (v_pago.id, auth.uid(), p_personal, v_mov);

    v_cuantos := v_cuantos + 1;
    v_total := v_total + v_pago.monto;
  end loop;

  if v_cuantos = 0 then
    raise exception 'Ya está todo cargado: no tenés nada pendiente de ese negocio.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('movimientos', v_cuantos, 'total', v_total);
end $fn$;

revoke all on function public.traer_ingreso_de_trabajo(uuid, uuid) from public, anon;
grant execute on function public.traer_ingreso_de_trabajo(uuid, uuid) to authenticated;
