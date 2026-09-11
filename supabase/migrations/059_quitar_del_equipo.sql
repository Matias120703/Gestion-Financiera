-- ============================================================
-- ORDEN · Migración 059 · Quitar a alguien del equipo sin romper nada
--
-- Lo pidió el dueño: poder quitar a alguien desde Equipo y reparto, y
-- cambiar cómo se le paga. Cambiar ya se podía, y no reescribe el pasado:
-- cada cobro guarda su propia parte desde la 033. Quitar tenía tres agujeros:
--
-- 1. Solo miraba los cobros. Alguien sin cobros pero con un pago registrado
--    no se podía borrar —la 035 frena ese borrado— y el dueño recibía un
--    error de la base que no dice nada.
--
-- 2. Alguien sin cobros pero con turnos se borraba, y sus turnos se iban con
--    él en cascada (037): el cliente llegaba y no había turno, y nadie le
--    había avisado.
--
-- 3. A quien se quitaba no había forma de volver a sumarlo.
--
-- Ahora:
--   · Con turnos agendados de acá en adelante, no se quita: primero se
--     mueven o se cancelan desde Agenda. El mensaje dice cuántos son.
--   · Con historia —cobros, pagos o turnos que ya pasaron— se desactiva.
--     Deja de aparecer para cobrar y para reservar (la agenda, el link y el
--     mostrador ya filtran por activo), y lo que pasó sigue diciendo de
--     quién fue.
--   · Sin nada, se borra de verdad.
--   · Guardarlo de nuevo lo vuelve a sumar.
--
-- El cuerpo de guardar_profesional se extrajo de la 048 con un script y se
-- le agregó solo la línea marcada con (059).
-- ============================================================

-- ------------------------------------------------------------
-- 1. GUARDAR A ALGUIEN DEL EQUIPO
--
--    Misma firma que en la 048: se reemplaza sin tocar a quien ya la llama.
-- ------------------------------------------------------------
create or replace function public.guardar_profesional(
  p_empresa    uuid,
  p_nombre     text,
  p_reparto    text    default 'local',
  p_porcentaje numeric default null,
  p_user       uuid    default null,
  p_id         uuid    default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar el equipo.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre, para saber de quién es cada corte.' using errcode = '22023';
  end if;

  if coalesce(p_reparto, '') not in ('local', 'comision', 'alquiler', 'sueldo') then
    raise exception 'Ese tipo de arreglo no existe.' using errcode = '22023';
  end if;

  if p_reparto = 'comision'
     and (p_porcentaje is null or p_porcentaje <= 0 or p_porcentaje > 100) then
    raise exception 'Con comisión hace falta un porcentaje entre 1 y 100.' using errcode = '22023';
  end if;

  -- El cambio de la 048. El mensaje explica el camino completo, porque el
  -- dueño está mirando una lista de nombres y no tiene por qué adivinar que
  -- primero hay que pasarle un código.
  if p_user is null then
    raise exception
      'Para estar en el equipo, esa persona tiene que entrar antes al negocio con el código de acceso. Pasale el código, que se cree su cuenta, y después sumala acá.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.miembros m
                 where m.empresa_id = p_empresa and m.user_id = p_user) then
    raise exception 'Esa persona no es parte de este negocio.' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.turnos_profesional (empresa_id, nombre, user_id, reparto, porcentaje)
    values (p_empresa, trim(p_nombre), p_user, p_reparto,
            case when p_reparto = 'comision' then p_porcentaje else null end)
    returning id into v_id;
  else
    update public.turnos_profesional
    set nombre = trim(p_nombre),
        user_id = p_user,
        reparto = p_reparto,
        porcentaje = case when p_reparto = 'comision' then p_porcentaje else null end,
        -- (059) Guardar a alguien es tenerlo en el equipo. Sin esto, a quien se
        -- quitaba no había forma de volver a sumarlo: se lo editaba, se
        -- guardaba, y seguía afuera.
        activo = true,
        updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_profesional(uuid, text, text, numeric, uuid, uuid) from public, anon;
grant execute on function public.guardar_profesional(uuid, text, text, numeric, uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. QUITAR DEL EQUIPO
--
--    Devuelve lo mismo que en la 034 —{borrado} o {desactivado}— para que
--    quien ya la llama no tenga que cambiar.
-- ------------------------------------------------------------
create or replace function public.borrar_profesional(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v        public.turnos_profesional;
  v_turnos integer;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar el equipo.' using errcode = '42501';
  end if;

  -- El candado: que no se le anote un turno ni un cobro justo mientras se
  -- decide qué hacer con él.
  select * into v
  from public.turnos_profesional
  where id = p_id and empresa_id = p_empresa
  for update;

  if v.id is null then
    raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
  end if;

  select count(*)::int into v_turnos
  from public.turnos_reserva r
  where r.profesional_id = p_id
    and r.estado in ('pendiente', 'confirmada')
    and r.inicia > now();

  if v_turnos > 0 then
    raise exception
      '% todavía tiene turnos agendados (%). Pasalos a otra persona o cancelalos desde Agenda, y después lo sacás del equipo.',
      v.nombre, v_turnos
      using errcode = '22023';
  end if;

  -- Con historia se desactiva: sus cobros, lo que se le pagó y sus turnos
  -- viejos siguen diciendo de quién fueron, y la liquidación del mes pasado
  -- sigue cerrando.
  if exists (select 1 from public.turnos_atribucion where profesional_id = p_id)
     or exists (select 1 from public.turnos_pago where profesional_id = p_id)
     or exists (select 1 from public.turnos_reserva where profesional_id = p_id) then
    update public.turnos_profesional
    set activo = false, updated_at = now()
    where id = p_id;
    return jsonb_build_object('desactivado', true);
  end if;

  -- Sin nada: se borra, y con él su horario y sus precios propios, que sin
  -- la persona no significan nada.
  delete from public.turnos_profesional where id = p_id;
  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_profesional(uuid, uuid) from public, anon;
grant execute on function public.borrar_profesional(uuid, uuid) to authenticated;
