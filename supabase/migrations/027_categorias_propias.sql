-- ORDEN · Migración 027 · Cada uno nombra sus gastos como los entiende
--
-- Las categorías venían fijas: doce para una persona, nueve para un comercio,
-- y listo. Funciona para el 80% de los casos y falla justo en el que hace que
-- alguien deje de usar el sistema.
--
-- Alguien tiene un perro y gasta en veterinaria, comida y baño todos los
-- meses. Hoy eso cae en «Otros». Al tercer mes su presupuesto tiene una
-- bolsa llamada «Otros» con la mitad de su plata adentro, que es exactamente
-- lo que vino a evitar. Otro paga la cuota del club, otro manda plata a la
-- familia, otro tiene un auto y quiere separar nafta de mantenimiento.
--
-- Cada persona entiende su plata a su manera, y un sistema que la obliga a
-- usar los casilleros de otro deja de ser suyo.
--
-- LO QUE HACE QUE ESTO SIRVA DE VERDAD
--
-- Que la categoría propia también la conozca la IA. Si alguien crea
-- «Mascotas» pero al dictar «compré comida para el perro» el modelo sigue
-- clasificando en «Otros», la categoría nueva es un adorno: nunca se llena
-- sola y hay que corregir a mano cada vez. Por eso se guardan PISTAS, igual
-- que las categorías fijas, y por eso todo pasa por una sola función que
-- devuelve las fijas y las propias juntas.

create table if not exists public.categorias_propias (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre     text not null check (char_length(trim(nombre)) between 1 and 40),
  -- Las de gasto y las de ingreso son listas distintas: «Sueldo» no es un
  -- lugar donde gastar, y «Mascotas» no es de dónde viene la plata.
  clase      text not null default 'gasto' check (clase in ('gasto', 'ingreso')),
  -- Palabras que hacen que la IA sepa cuándo usarla. Sin esto la categoría
  -- existe pero nunca se llena sola.
  pistas     text not null default '',
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categorias_propias_unica
  on public.categorias_propias (empresa_id, clase, lower(trim(nombre)))
  where activo;

alter table public.categorias_propias enable row level security;

-- Se LEEN con es_miembro y no con es_admin: un vendedor carga gastos, y para
-- clasificarlos necesita ver los nombres. Son etiquetas, no plata.
drop policy if exists categorias_propias_select on public.categorias_propias;
create policy categorias_propias_select on public.categorias_propias
  for select to authenticated using (public.es_miembro(empresa_id));

revoke all on public.categorias_propias from anon, authenticated;
grant select on public.categorias_propias to authenticated;

do $$ begin
  execute 'drop trigger if exists cuenta_activa_categorias_propias on public.categorias_propias';
  execute 'create trigger cuenta_activa_categorias_propias before insert or update '
       || 'on public.categorias_propias for each row execute function public.exigir_cuenta_activa()';
end $$;

-- ------------------------------------------------------------
-- LA LISTA COMPLETA, EN UN SOLO LUGAR
--
-- Las fijas de esta cuenta más las propias. Todo lo que ofrece una pantalla
-- y todo lo que conoce la IA sale de acá. Que fueran dos fuentes distintas
-- es cómo se llegó a que el prompt clasificara en «Salidas» mientras el
-- presupuesto ofrecía «Ocio», y el gasto quedara fuera de la cuenta que la
-- persona había hecho.
-- ------------------------------------------------------------
create or replace function public.categorias_de_empresa(
  p_empresa uuid,
  p_clase   text default 'gasto'
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_rubro  text;
  v_tipo   text;
  v_fijas  jsonb;
  v_mias   jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No tenés acceso a esta cuenta.' using errcode = '42501';
  end if;

  select rubro, tipo_cuenta into v_rubro, v_tipo
  from public.empresas where id = p_empresa;

  v_fijas := case
    when p_clase = 'ingreso' then public.categorias_de_ingreso(v_tipo)
    else public.categorias_de_rubro(v_rubro, v_tipo) end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nombre', c.nombre, 'pistas', c.pistas, 'propia', true
         ) order by c.nombre), '[]'::jsonb)
  into v_mias
  from public.categorias_propias c
  where c.empresa_id = p_empresa and c.activo
    and c.clase = case when p_clase = 'ingreso' then 'ingreso' else 'gasto' end;

  -- Las propias van ANTES de «Otros», que siempre cierra la lista: una
  -- categoría nueva escondida debajo del cajón de sastre no se usa nunca.
  return (
    select coalesce(jsonb_agg(x order by orden, i), '[]'::jsonb)
    from (
      select value as x,
             case when value->>'nombre' ilike 'otro%' then 2 else 0 end as orden,
             ordinality as i
      from jsonb_array_elements(v_fijas) with ordinality
      union all
      select value, 1, 0 from jsonb_array_elements(v_mias)
    ) t
  );
end $fn$;

revoke all on function public.categorias_de_empresa(uuid, text) from public, anon;
grant execute on function public.categorias_de_empresa(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- CREARLAS Y BORRARLAS
--
-- Solo la administración. Un vendedor que pudiera inventar categorías estaría
-- reescribiendo el presupuesto del dueño sin querer.
-- ------------------------------------------------------------
create or replace function public.guardar_categoria_propia(
  p_empresa uuid,
  p_nombre  text,
  p_clase   text default 'gasto',
  p_pistas  text default '',
  p_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_clase  text;
  v_nombre text;
  v_rubro  text;
  v_tipo   text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  v_nombre := trim(coalesce(p_nombre, ''));
  if char_length(v_nombre) = 0 then
    raise exception 'Escribí un nombre para la categoría.' using errcode = '22023';
  end if;
  if char_length(v_nombre) > 40 then
    raise exception 'Ese nombre es muy largo. Con 40 letras alcanza.' using errcode = '22023';
  end if;

  v_clase := case when p_clase = 'ingreso' then 'ingreso' else 'gasto' end;

  select rubro, tipo_cuenta into v_rubro, v_tipo from public.empresas where id = p_empresa;

  -- Que no repita una que ya viene de fábrica: quedarían dos renglones con
  -- el mismo nombre en el mismo menú y ninguno sabría cuál es cuál.
  if exists (
    select 1 from jsonb_array_elements(
      case when v_clase = 'ingreso'
        then public.categorias_de_ingreso(v_tipo)
        else public.categorias_de_rubro(v_rubro, v_tipo) end) f
    where lower(trim(f.value->>'nombre')) = lower(v_nombre)
  ) then
    raise exception 'Esa categoría ya existe.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.categorias_propias (empresa_id, nombre, clase, pistas)
    values (p_empresa, v_nombre, v_clase, left(coalesce(p_pistas, ''), 200))
    returning id into v_id;
  else
    update public.categorias_propias
    set nombre = v_nombre, clase = v_clase,
        pistas = left(coalesce(p_pistas, ''), 200), updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa categoría no existe en esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Esa categoría ya existe.' using errcode = '22023';
end $fn$;

revoke all on function public.guardar_categoria_propia(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.guardar_categoria_propia(uuid, text, text, text, uuid) to authenticated;

-- Borrar la categoría NO toca los movimientos que ya la usaron. Quedan con
-- su nombre escrito, que es lo correcto: el gasto de marzo fue en Mascotas
-- aunque hoy esa categoría ya no se ofrezca.
create or replace function public.borrar_categoria_propia(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_nombre text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  delete from public.categorias_propias
  where id = p_id and empresa_id = p_empresa
  returning nombre into v_nombre;

  if v_nombre is null then
    raise exception 'Esa categoría no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  -- Si tenía presupuesto asignado, se va con ella: un límite para una
  -- categoría que ya no existe es un renglón que no se puede tocar.
  delete from public.presupuesto
  where empresa_id = p_empresa and categoria = v_nombre;

  return jsonb_build_object('borrada', true, 'nombre', v_nombre);
end $fn$;

revoke all on function public.borrar_categoria_propia(uuid, uuid) from public, anon;
grant execute on function public.borrar_categoria_propia(uuid, uuid) to authenticated;
