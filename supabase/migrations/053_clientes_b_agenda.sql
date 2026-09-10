-- ============================================================
-- ORDEN · Migración 053 · Cada reserva deja un cliente
--
-- Lo que pidió el dueño, textual: «reservó un servicio y ya queda registrado
-- ese cliente».
--
-- POR QUÉ UN TRIGGER Y NO UNA LÍNEA EN CADA FUNCIÓN
--
-- Hay dos puertas por donde entra una reserva —`reservar()` desde el local y
-- `reservar_publico()` desde el link que comparte el dueño— y las dos tienen
-- que registrar al cliente. Poner la llamada en cada una significa que el día
-- que se agregue una tercera puerta, o que alguien toque una de las dos, la
-- regla se puede caer de una sola y nadie lo va a notar: las reservas van a
-- seguir funcionando, solo que sin cliente.
--
-- Con un trigger la regla se escribe una vez y no hay forma de esquivarla,
-- ni siquiera con un INSERT a mano desde el editor SQL.
--
-- LO QUE EL TRIGGER NO HACE
--
-- No inventa clientes. Si la reserva no trae teléfono, `cliente_de_contacto`
-- devuelve null y la reserva queda sin cliente — que es lo correcto: no hay
-- con qué distinguir a esa persona de la próxima que se llame igual.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA COLUMNA
--
--    La clave compuesta contra `clientes (id, empresa_id)` es la que impide
--    que una reserva de un negocio apunte al cliente de otro. No es
--    prolijidad: es lo único que lo impide incluso ante un UPDATE directo.
--
--    `on delete set null` y no `cascade`: borrar una ficha de cliente no
--    puede hacer desaparecer un turno que existió y se cobró.
-- ------------------------------------------------------------
alter table public.turnos_reserva
  add column if not exists cliente_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reserva_cliente_misma_empresa') then
    alter table public.turnos_reserva
      add constraint reserva_cliente_misma_empresa
      foreign key (cliente_id, empresa_id)
      references public.clientes (id, empresa_id)
      on delete set null;
  end if;
end $$;

create index if not exists turnos_reserva_cliente_idx
  on public.turnos_reserva (cliente_id) where cliente_id is not null;

-- ------------------------------------------------------------
-- 2. EL TRIGGER
-- ------------------------------------------------------------
create or replace function public.reserva_registra_cliente()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  -- Si ya viene con cliente (por ejemplo, se lo eligió de la lista al
  -- agendar), no se toca: quien lo eligió sabe mejor que el teléfono.
  if new.cliente_id is null then
    new.cliente_id := public.cliente_de_contacto(
      new.empresa_id, new.cliente_nombre, new.cliente_telefono);
  end if;
  return new;
end $fn$;

-- Una función de trigger no la llama nadie a mano: la dispara PostgreSQL, y
-- dejarla ejecutable por todos la abriría a `anon` sin ninguna razón. El
-- permiso se comprueba al CREAR el trigger, no cada vez que se dispara.
revoke all on function public.reserva_registra_cliente() from public, anon, authenticated;

drop trigger if exists reserva_registra_cliente on public.turnos_reserva;
create trigger reserva_registra_cliente
  before insert on public.turnos_reserva
  for each row execute function public.reserva_registra_cliente();

-- ------------------------------------------------------------
-- 3. LOS QUE YA ESTABAN
--
--    Las reservas viejas también tienen gente adentro. Se les arma la ficha
--    y se las enlaza, agrupando por teléfono normalizado y quedándose con el
--    nombre de la reserva más reciente — que es el que el local reconoce.
--
--    Se hace en dos pasos y no con un INSERT ... SELECT y un UPDATE sueltos
--    para que el enlace use exactamente las fichas que se acaban de crear.
-- ------------------------------------------------------------
do $$
declare
  v_creados integer := 0;
  v_ligados integer := 0;
begin
  with contactos as (
    select
      r.empresa_id,
      regexp_replace(r.cliente_telefono, '\D', '', 'g') as norm,
      -- El nombre de la reserva más nueva de ese número.
      (array_agg(r.cliente_nombre order by r.created_at desc))[1] as nombre,
      (array_agg(r.cliente_telefono order by r.created_at desc))[1] as telefono
    from public.turnos_reserva r
    where r.cliente_id is null
      and char_length(regexp_replace(r.cliente_telefono, '\D', '', 'g')) >= 6
    group by 1, 2
  )
  insert into public.clientes (empresa_id, nombre, telefono)
  select c.empresa_id, left(c.nombre, 80), left(c.telefono, 40)
  from contactos c
  on conflict (empresa_id, telefono_norm) where telefono_norm <> '' do nothing;

  get diagnostics v_creados = row_count;

  update public.turnos_reserva r
  set cliente_id = c.id
  from public.clientes c
  where r.cliente_id is null
    and c.empresa_id = r.empresa_id
    and c.telefono_norm = regexp_replace(r.cliente_telefono, '\D', '', 'g')
    and c.telefono_norm <> '';

  get diagnostics v_ligados = row_count;

  raise notice 'Clientes creados desde reservas viejas: %. Reservas enlazadas: %.',
    v_creados, v_ligados;
end $$;

-- ------------------------------------------------------------
-- 4. LA SECCIÓN DE CLIENTES
--
--    Una lista que solo se mira no vale el trabajo de mantenerla. Lo que la
--    hace útil es lo de al lado: cuántas veces vino, cuándo fue la última y
--    cuánto dejó. Eso es lo que convierte «Juan Pérez» en «Juan, que viene
--    cada tres semanas y hace seis meses que no aparece».
--
--    `gastado` sale de los turnos ATENDIDOS, no de los reservados: un turno
--    al que no vino no es plata. Es la misma regla de siempre.
-- ------------------------------------------------------------
create or replace function public.lista_clientes(
  p_empresa uuid,
  p_texto   text default '',
  p_limite  integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res   jsonb;
  v_busca text;
  v_norm  text;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_busca := lower(trim(coalesce(p_texto, '')));
  v_norm  := regexp_replace(v_busca, '\D', '', 'g');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.ultima_visita desc nulls last, x.nombre), '[]'::jsonb)
  into v_res
  from (
    select
      c.id, c.nombre, c.telefono, c.notas, c.created_at,
      coalesce(t.visitas, 0)::int    as visitas,
      t.ultima_visita,
      coalesce(t.gastado, 0)::numeric as gastado,
      coalesce(t.proximo, null)      as proximo_turno
    from public.clientes c
    left join lateral (
      select
        count(*) filter (where r.estado = 'atendida')::int as visitas,
        max(r.inicia) filter (where r.estado = 'atendida') as ultima_visita,
        coalesce(sum(a.monto_cobrado) filter (where r.estado = 'atendida'), 0) as gastado,
        min(r.inicia) filter (
          where r.estado in ('pendiente', 'confirmada') and r.inicia > now()
        ) as proximo
      from public.turnos_reserva r
      left join public.turnos_atribucion a on a.id = r.atribucion_id
      where r.cliente_id = c.id
    ) t on true
    where c.empresa_id = p_empresa
      and c.activo
      and (
        v_busca = ''
        or lower(c.nombre) like '%' || v_busca || '%'
        or (v_norm <> '' and c.telefono_norm like '%' || v_norm || '%')
      )
    limit least(greatest(coalesce(p_limite, 200), 1), 500)
  ) x;

  return v_res;
end $fn$;

revoke all on function public.lista_clientes(uuid, text, integer) from public, anon;
grant execute on function public.lista_clientes(uuid, text, integer) to authenticated;

-- ------------------------------------------------------------
-- 5. LA FICHA DE UNO
--
--    Sus turnos, del más nuevo al más viejo. Es lo que se abre al tocarlo en
--    la lista, y lo que contesta «¿este cliente ya vino?» sin tener que
--    acordarse.
-- ------------------------------------------------------------
create or replace function public.historial_cliente(
  p_cliente uuid,
  p_limite  integer default 50
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_empresa uuid;
  v_res     jsonb;
begin
  select empresa_id into v_empresa from public.clientes where id = p_cliente;
  if v_empresa is null then
    raise exception 'Ese cliente no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.inicia desc), '[]'::jsonb) into v_res
  from (
    select
      r.id, r.inicia, r.estado,
      pr.nombre as servicio,
      p.nombre  as profesional,
      coalesce(a.monto_cobrado, 0)::numeric as monto
    from public.turnos_reserva r
    left join public.productos pr on pr.id = r.producto_id
    left join public.turnos_profesional p on p.id = r.profesional_id
    left join public.turnos_atribucion a on a.id = r.atribucion_id
    where r.cliente_id = p_cliente
    order by r.inicia desc
    limit least(greatest(coalesce(p_limite, 50), 1), 200)
  ) x;

  return v_res;
end $fn$;

revoke all on function public.historial_cliente(uuid, integer) from public, anon;
grant execute on function public.historial_cliente(uuid, integer) to authenticated;
