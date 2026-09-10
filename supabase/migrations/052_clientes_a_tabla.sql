-- ============================================================
-- ORDEN · Migración 052 · Los clientes del negocio
--
-- LO QUE PASA HOY
--
-- Cuando alguien reserva un turno, su nombre y su teléfono quedan sueltos
-- adentro de esa reserva (`turnos_reserva.cliente_nombre`). Si Juan viene
-- diez veces, hay diez reservas y ningún Juan: no se puede ver su historial,
-- ni cuándo vino por última vez, ni cuánto dejó en el local.
--
-- Y al vender o al agendar hay que volver a escribir el nombre y el número
-- todas las veces.
--
-- LA IDENTIDAD ES EL TELÉFONO, NO EL NOMBRE
--
-- Hay tres Juan; hay un solo 0981 234 567. Por eso el teléfono es lo único
-- que no se puede repetir dentro de un negocio, y por eso se compara
-- normalizado —solo los dígitos—: «0981 234 567», «0981234567» y
-- «0981-234-567» son la misma persona, y si se guardaran como tres clientes
-- distintos el historial quedaría partido en tres sin que nadie lo note.
--
-- PERO EL TELÉFONO PUEDE FALTAR
--
-- En un almacén entra gente que compra fiado y no deja número. Obligarlo
-- haría que el que atiende invente uno —«0000000»— y entonces sí se
-- mezclarían clientes distintos. Sin teléfono, cada uno es una ficha aparte:
-- es peor para buscar y es lo correcto.
--
-- ESTO NO ES LA FICHA DE `ficha_cliente`
--
-- Aquella (022) son los clientes de ORDEN, para tu panel de administración:
-- a quién le vendemos el sistema. Esta son los clientes DEL NEGOCIO: a quién
-- le vende él. Se llaman parecido y no tienen nada que ver.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA TABLA
--
--    `telefono_norm` es una columna generada y no algo que escriba la
--    aplicación: así no hay forma de guardar una fila cuyo teléfono
--    normalizado no corresponda a su teléfono. Un dato derivado que se
--    escribe a mano se desincroniza el día que alguien haga un UPDATE
--    directo, y ese día dos clientes pasan a ser el mismo.
-- ------------------------------------------------------------
create table if not exists public.clientes (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre     text not null check (char_length(trim(nombre)) between 1 and 80),
  telefono   text not null default '' check (char_length(telefono) <= 40),
  -- Solo los dígitos. Es lo que se compara para saber si ya existe.
  telefono_norm text generated always as
    (regexp_replace(coalesce(telefono, ''), '\D', '', 'g')) stored,
  notas      text not null default '' check (char_length(notas) <= 1000),
  activo     boolean not null default true,
  creado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Para que otras tablas puedan apuntar acá SIN poder cruzar de empresa.
  -- Es el mismo candado estructural que usan los lotes (044): con una clave
  -- compuesta, una reserva de la empresa A no puede referirse a un cliente
  -- de la B ni con un UPDATE a mano.
  constraint clientes_id_empresa unique (id, empresa_id)
);

comment on table public.clientes is
  'Los clientes DEL NEGOCIO. No confundir con ficha_cliente (022), que son los clientes de Orden.';

-- Un teléfono, un cliente. Los que no dejaron número quedan afuera del
-- índice y por eso pueden repetirse: no hay con qué distinguirlos.
create unique index if not exists clientes_telefono_unico
  on public.clientes (empresa_id, telefono_norm)
  where telefono_norm <> '';

create index if not exists clientes_empresa_nombre_idx
  on public.clientes (empresa_id, lower(nombre)) where activo;

-- ------------------------------------------------------------
-- 2. QUIÉN LOS VE
--
--    Cualquier miembro. No es un descuido: el que atiende el mostrador es
--    justamente el que necesita el nombre y el número para agendar y para
--    cobrar, y esconderlos lo obligaría a llevar la libreta aparte.
--
--    Vale decir lo que eso implica: un vendedor puede ver la agenda de
--    teléfonos de la clientela, y el día que se va, se la lleva. Es una
--    decisión de producto, no un olvido. Si algún día molesta, el lugar de
--    cambiarla es esta política y nada más.
-- ------------------------------------------------------------
alter table public.clientes enable row level security;

drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes
  for select using (public.es_miembro(empresa_id));

-- Se escribe por función, no directo: hay que normalizar, buscar duplicados
-- y no dejar que se cambie de empresa una ficha existente.
revoke all on public.clientes from anon, authenticated;
grant select on public.clientes to authenticated;

-- ------------------------------------------------------------
-- 3. GUARDAR UN CLIENTE
--
--    Lo puede hacer cualquier miembro, incluido un vendedor: es lo que pasa
--    cuando alguien llama al local y el que atiende lo anota.
--
--    Con `p_id` edita; sin él, crea. Y si el teléfono ya es de otro cliente
--    del mismo negocio, no crea un duplicado: devuelve el que existe con el
--    nombre actualizado. Un mostrador con dos «Juan 0981...» es peor que uno
--    con el nombre viejo.
-- ------------------------------------------------------------
create or replace function public.guardar_cliente(
  p_empresa  uuid,
  p_nombre   text,
  p_telefono text default '',
  p_notas    text default '',
  p_id       uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_nombre text;
  v_tel    text;
  v_norm   text;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_nombre := trim(coalesce(p_nombre, ''));
  if char_length(v_nombre) = 0 then
    raise exception 'Ponele un nombre, para saber de quién estamos hablando.' using errcode = '22023';
  end if;
  v_nombre := left(v_nombre, 80);

  v_tel  := left(trim(coalesce(p_telefono, '')), 40);
  v_norm := regexp_replace(v_tel, '\D', '', 'g');

  -- Un teléfono de dos dígitos no es un teléfono: es un dedazo. Se guarda
  -- vacío antes que guardar algo que después va a hacer chocar a dos
  -- personas distintas en el mismo índice.
  if v_norm <> '' and char_length(v_norm) < 6 then
    v_tel := '';
    v_norm := '';
  end if;

  if p_id is not null then
    update public.clientes
    set nombre = v_nombre,
        telefono = v_tel,
        notas = left(coalesce(p_notas, ''), 1000),
        updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
    end if;
    return v_id;
  end if;

  -- Sin id: si el teléfono ya está, es la misma persona.
  if v_norm <> '' then
    select c.id into v_id
    from public.clientes c
    where c.empresa_id = p_empresa and c.telefono_norm = v_norm;

    if v_id is not null then
      update public.clientes
      set nombre = v_nombre,
          notas = case when trim(coalesce(p_notas, '')) = '' then notas
                       else left(p_notas, 1000) end,
          activo = true,
          updated_at = now()
      where id = v_id;
      return v_id;
    end if;
  end if;

  insert into public.clientes (empresa_id, nombre, telefono, notas, creado_por)
  values (p_empresa, v_nombre, v_tel, left(coalesce(p_notas, ''), 1000), auth.uid())
  returning id into v_id;

  return v_id;
end $fn$;

revoke all on function public.guardar_cliente(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.guardar_cliente(uuid, text, text, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. ENCONTRAR O CREAR, PARA USO INTERNO
--
--    Lo que llaman las reservas. No comprueba pertenencia porque quien la
--    llama ya la comprobó —o es la puerta pública, que no tiene a quién
--    comprobarle— y por eso NO se le da permiso a nadie desde afuera.
--
--    Devuelve null si no hay con qué identificar a nadie, en vez de crear
--    una ficha vacía: mejor una reserva sin cliente que una lista de
--    clientes llena de fantasmas.
-- ------------------------------------------------------------
create or replace function public.cliente_de_contacto(
  p_empresa  uuid,
  p_nombre   text,
  p_telefono text
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_nombre text;
  v_tel    text;
  v_norm   text;
begin
  v_nombre := left(trim(coalesce(p_nombre, '')), 80);
  if char_length(v_nombre) = 0 then return null; end if;

  v_tel  := left(trim(coalesce(p_telefono, '')), 40);
  v_norm := regexp_replace(v_tel, '\D', '', 'g');
  if char_length(v_norm) < 6 then
    v_tel := '';
    v_norm := '';
  end if;

  if v_norm <> '' then
    select c.id into v_id
    from public.clientes c
    where c.empresa_id = p_empresa and c.telefono_norm = v_norm;

    if v_id is not null then
      -- El nombre se refresca: la gente cambia cómo se anota, y el último
      -- que dio es el que reconoce quien atiende.
      update public.clientes
      set nombre = v_nombre, activo = true, updated_at = now()
      where id = v_id;
      return v_id;
    end if;
  end if;

  -- Sin teléfono no se crea nada desde acá. Una reserva puede no tener
  -- cliente; una lista de clientes con veinte «Juan» sin número no sirve
  -- para nada y ensucia la búsqueda para siempre.
  if v_norm = '' then return null; end if;

  insert into public.clientes (empresa_id, nombre, telefono, creado_por)
  values (p_empresa, v_nombre, v_tel, auth.uid())
  returning id into v_id;

  return v_id;
end $fn$;

revoke all on function public.cliente_de_contacto(uuid, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. LA LISTA Y LA BÚSQUEDA
--
--    Dos funciones y no una: la lista es la sección de Clientes y la
--    búsqueda es el buscador de cuando estás vendiendo o agendando. La
--    segunda tiene que ser corta y rápida; la primera, completa.
--
--    Las dos devuelven UNA fila con un jsonb adentro, como el resto de las
--    lecturas desde la 006: así el tope de filas de la Data API no puede
--    recortar media lista sin avisar.
-- ------------------------------------------------------------
create or replace function public.buscar_clientes(
  p_empresa uuid,
  p_texto   text default '',
  p_limite  integer default 8
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

  select coalesce(jsonb_agg(to_jsonb(x) order by x.nombre), '[]'::jsonb) into v_res
  from (
    select c.id, c.nombre, c.telefono
    from public.clientes c
    where c.empresa_id = p_empresa
      and c.activo
      and (
        v_busca = ''
        or lower(c.nombre) like '%' || v_busca || '%'
        -- Buscar por número escrito de cualquier manera.
        or (v_norm <> '' and c.telefono_norm like '%' || v_norm || '%')
      )
    order by c.nombre
    limit least(greatest(coalesce(p_limite, 8), 1), 50)
  ) x;

  return v_res;
end $fn$;

revoke all on function public.buscar_clientes(uuid, text, integer) from public, anon;
grant execute on function public.buscar_clientes(uuid, text, integer) to authenticated;
