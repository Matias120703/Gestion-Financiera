-- ============================================================
-- 075 · EN QUÉ CUENTA ENTRÓ O DE CUÁL SALIÓ, ELEGIDO A MANO
-- ============================================================
--
-- La 074 hizo que cada movimiento caiga solo en la cuenta que recibe su
-- forma de pago. Alcanza cuando hay un banco: lo cobrado por transferencia
-- va ahí y listo. Con dos bancos ya no alcanza —«transferencia» no dice a
-- cuál de los dos— y Matías lo pidió explícito: «si tengo varias cuentas en
-- mi billetera, quiero elegir de qué banco salió, o si fue en efectivo».
--
-- Para los movimientos eso ya funciona sin tocar la base: el disparador
-- `anotar_en_su_cuenta` (074) respeta la `cuenta_id` que venga escrita y solo
-- la deduce de la forma de pago cuando llega vacía. Y si alguien manda la
-- cuenta de otro negocio, la descarta.
--
-- Lo que falta es el OTRO pedido: el sueldo. «El ingreso fijo normalmente es
-- un sueldo, y normalmente se cobra en un banco en específico.» Eso es parte
-- de la definición del ingreso, no de un movimiento suelto: se guarda una vez
-- y después cada cobro ya sabe dónde cae.
--
-- `on delete set null`: si la cuenta se archiva, el sueldo no se borra —
-- queda sin cuenta asignada, que es exactamente lo que pasó.

alter table public.ingresos_fijos
  add column if not exists cuenta_id uuid references public.cuentas_dinero (id) on delete set null;

comment on column public.ingresos_fijos.cuenta_id is
  'En qué cuenta de la billetera se cobra este ingreso. Null = sin definir.';

-- La versión de seis parámetros se borra en vez de dejarla al lado: con las
-- dos vivas, una llamada por nombre queda ambigua y PostgREST no sabe cuál
-- elegir.
drop function if exists public.guardar_ingreso_fijo(uuid, text, numeric, integer, boolean, uuid);

create or replace function public.guardar_ingreso_fijo(
  p_empresa   uuid,
  p_nombre    text,
  p_importe   numeric,
  p_dia       integer default 1,
  p_principal boolean default false,
  p_id        uuid default null,
  p_cuenta    uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre, para saber qué es cuando entre.' using errcode = '22023';
  end if;

  if coalesce(p_importe, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  -- Una cuenta de otro negocio no se acepta ni por error ni a propósito.
  if p_cuenta is not null and not exists (
    select 1 from public.cuentas_dinero c
    where c.id = p_cuenta and c.empresa_id = p_empresa
  ) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  -- Si este pasa a ser el principal, el anterior deja de serlo. Se hace
  -- ANTES de escribir, porque el índice único no admite dos.
  if coalesce(p_principal, false) then
    update public.ingresos_fijos
    set principal = false, updated_at = now()
    where empresa_id = p_empresa and principal
      and (p_id is null or id <> p_id);
  end if;

  if p_id is null then
    insert into public.ingresos_fijos (empresa_id, nombre, importe, dia_del_mes, principal, cuenta_id)
    values (p_empresa, trim(p_nombre), p_importe,
            least(greatest(coalesce(p_dia, 1), 1), 31), coalesce(p_principal, false), p_cuenta)
    returning id into v_id;
  else
    update public.ingresos_fijos
    set nombre = trim(p_nombre), importe = p_importe,
        dia_del_mes = least(greatest(coalesce(p_dia, 1), 1), 31),
        principal = coalesce(p_principal, false),
        cuenta_id = p_cuenta, updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese ingreso no existe en esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_ingreso_fijo(uuid, text, numeric, integer, boolean, uuid, uuid)
  from public, anon;
grant execute on function public.guardar_ingreso_fijo(uuid, text, numeric, integer, boolean, uuid, uuid)
  to authenticated;

-- ------------------------------------------------------------
-- LAS CUENTAS, SOLO PARA ELEGIR UNA
-- ------------------------------------------------------------
--
-- `cuentas_dinero` no se lee directo desde el navegador (la 074 le revocó
-- todo) y `billetera()` calcula el saldo de cada cuenta, que acá no hace
-- falta: para llenar un selector alcanzan el nombre y el tipo. Esta devuelve
-- eso y nada más, y solo a quien administra la cuenta.
create or replace function public.cuentas_para_elegir(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'tipo', c.tipo)
                            order by c.orden, c.created_at), '[]'::jsonb)
  into v_lista
  from public.cuentas_dinero c
  where c.empresa_id = p_empresa and c.activa;

  return v_lista;
end $fn$;

revoke all on function public.cuentas_para_elegir(uuid) from public, anon;
grant execute on function public.cuentas_para_elegir(uuid) to authenticated;
