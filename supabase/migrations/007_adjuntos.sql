-- ============================================================
-- ORDEN · Migración 007 · Adjuntos (comprobantes y transcripciones)
--
-- Hasta acá, la foto de un comprobante se mandaba a la IA, se interpretaba
-- y se tiraba. Lo mismo el audio. Eso convertía a Orden en un anotador:
-- el número quedaba, la prueba no.
--
-- Esta migración le da respaldo al movimiento. Dos decisiones que conviene
-- entender antes de leer el SQL:
--
--   1. LA FOTO SE GUARDA, EL AUDIO NO. De un audio lo único que sirve
--      después es lo que se dijo, y eso ya lo tenemos transcripto. Guardar
--      el archivo costaría storage todos los meses para que nadie lo vuelva
--      a escuchar nunca. Por eso `audio` guarda texto y ruta en null.
--
--   2. LOS ARCHIVOS NO VIVEN EN ESTA TABLA. Viven en Storage, bucket
--      privado `comprobantes`, con la ruta empresa_id/movimiento_id/archivo.
--      La primera carpeta es el empresa_id justamente para que la policy de
--      storage.objects pueda decidir con es_miembro() sin consultar nada más.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

do $$ begin
  create type tipo_adjunto as enum ('foto', 'audio');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 1. TABLA
--
--    `movimiento_id` es NOT NULL a propósito: un adjunto suelto no le
--    sirve a nadie y nos dejaría huérfanos imposibles de encontrar. El
--    orden del flujo es: se guarda el movimiento, se sube el archivo,
--    se crea esta fila.
-- ------------------------------------------------------------
create table if not exists public.adjuntos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  movimiento_id uuid not null references public.movimientos (id) on delete cascade,
  tipo          tipo_adjunto not null,
  -- Ruta dentro del bucket. null cuando el adjunto es solo texto (audio).
  ruta          text,
  mime          text,
  bytes         integer not null default 0 check (bytes >= 0),
  -- Transcripción del audio, o lo que la IA leyó de la foto.
  texto         text not null default '',
  creado_por    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),

  -- Una foto sin archivo no es una foto. Un audio con archivo no lo guardamos.
  constraint adjunto_coherente check (
    (tipo = 'foto'  and ruta is not null and char_length(ruta) > 0) or
    (tipo = 'audio' and ruta is null)
  )
);

create index if not exists adjuntos_movimiento_idx on public.adjuntos (movimiento_id);
create index if not exists adjuntos_empresa_idx    on public.adjuntos (empresa_id, created_at desc);

-- La ruta es única: dos filas apuntando al mismo archivo harían que borrar
-- una deje a la otra apuntando a la nada.
create unique index if not exists adjuntos_ruta_idx on public.adjuntos (ruta) where ruta is not null;

comment on table public.adjuntos is
  'Respaldo de un movimiento: foto del comprobante (archivo en Storage) o transcripción de la nota de voz (solo texto, sin archivo).';

-- ------------------------------------------------------------
-- 2. TOPES
--
--    No son de seguridad, son de costo. Storage se paga todos los meses;
--    un usuario subiendo veinte fotos de 4 MB por venta sale más caro que
--    lo que paga. El cliente ya comprime a ~150 KB antes de subir, así que
--    estos topes solo atrapan a quien esquive la interfaz.
-- ------------------------------------------------------------
create or replace function public.limite_adjuntos_movimiento() returns integer
  language sql immutable as $fn$ select 8 $fn$;

create or replace function public.limite_bytes_adjunto() returns integer
  language sql immutable as $fn$ select 5 * 1024 * 1024 $fn$;

-- ------------------------------------------------------------
-- 3. BUCKET PRIVADO Y PERMISOS SOBRE LOS ARCHIVOS
--
--    Todo este bloque está guardado detrás de "¿existe storage.objects?".
--    En Supabase existe siempre. En un PostgreSQL pelado —el que levantan
--    las pruebas— no, y sin la guarda la migración entera fallaría por algo
--    que no tiene nada que ver con las reglas de negocio.
--
--    `public = false`: nadie llega por URL adivinada. La app pide una URL
--    firmada de corta vida, y para que se la den tiene que pasar la policy.
--
--    storage.foldername(name) parte la ruta: [1] es el empresa_id. Con eso
--    es_miembro() decide sin tocar la tabla adjuntos, que puede todavía no
--    tener la fila (el archivo se sube antes de registrarlo).
--
--    Nadie puede ACTUALIZAR un objeto: un comprobante que se puede
--    reemplazar en su lugar no es un comprobante. Se borra y se sube otro.
-- ------------------------------------------------------------
do $bloque$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Sin esquema storage: se omiten bucket y policies de comprobantes.';
    return;
  end if;

  execute format($sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('comprobantes', 'comprobantes', false, %s,
            array['image/webp', 'image/jpeg', 'image/png', 'image/heic'])
    on conflict (id) do update
      set public             = false,
          file_size_limit    = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types
  $sql$, public.limite_bytes_adjunto());

  execute 'drop policy if exists comprobantes_ver    on storage.objects';
  execute 'drop policy if exists comprobantes_subir  on storage.objects';
  execute 'drop policy if exists comprobantes_borrar on storage.objects';

  execute $sql$
    create policy comprobantes_ver on storage.objects
      for select to authenticated
      using (
        bucket_id = 'comprobantes'
        and public.es_miembro(nullif((storage.foldername(name))[1], '')::uuid)
      )
  $sql$;

  execute $sql$
    create policy comprobantes_subir on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'comprobantes'
        and public.es_miembro(nullif((storage.foldername(name))[1], '')::uuid)
      )
  $sql$;

  execute $sql$
    create policy comprobantes_borrar on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'comprobantes'
        and public.es_miembro(nullif((storage.foldername(name))[1], '')::uuid)
      )
  $sql$;

exception
  -- En algunos proyectos de Supabase el rol que corre el SQL Editor no es
  -- dueño de storage.objects y no puede crear policies ahí. No es motivo
  -- para que falle la migración entera: todo lo demás (la tabla `adjuntos`,
  -- las funciones, los topes) queda perfecto, y las tres policies se pueden
  -- cargar a mano desde Storage → Policies con estas mismas condiciones.
  --
  -- Se avisa fuerte porque, hasta que existan, subir un comprobante va a
  -- fallar con "new row violates row-level security policy".
  when insufficient_privilege then
    raise warning 'No se pudieron crear las policies de storage (falta ser dueño de storage.objects). Crealas a mano en Storage → Policies del bucket "comprobantes". El resto de la migración se aplicó bien.';
end $bloque$;

-- ------------------------------------------------------------
-- 5. RLS DE LA TABLA
--
--    Lectura: cualquier miembro. Escritura: NADIE por la puerta directa.
--    Se entra por adjuntar() y borrar_adjunto(), que validan empresa,
--    movimiento, tipo y topes. Si dejáramos el insert abierto, un cliente
--    podría crear una fila que apunta a la ruta de otra empresa.
-- ------------------------------------------------------------
alter table public.adjuntos enable row level security;

drop policy if exists adjuntos_select on public.adjuntos;
create policy adjuntos_select on public.adjuntos
  for select to authenticated
  using (public.es_miembro(empresa_id));

revoke all on public.adjuntos from anon, authenticated;
grant select on public.adjuntos to authenticated;

-- ------------------------------------------------------------
-- 6. ADJUNTAR · la única puerta de entrada
--
--    Valida en este orden: sesión, movimiento visible, coherencia del tipo,
--    tope por movimiento y tope de bytes. Devuelve el id creado.
--
--    Para 'foto' exige que la ruta empiece con "<empresa_id>/<movimiento_id>/".
--    Sin eso, alguien podría registrar como propio un archivo que subió en
--    la carpeta de otro movimiento de su misma empresa y confundir el
--    respaldo de una venta con el de otra.
-- ------------------------------------------------------------
create or replace function public.adjuntar(
  p_movimiento uuid,
  p_tipo       text,
  p_ruta       text default null,
  p_mime       text default null,
  p_bytes      integer default 0,
  p_texto      text default ''
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_empresa uuid;
  v_estado  text;
  v_cuantos integer;
  v_id      uuid;
  v_prefijo text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if p_tipo not in ('foto', 'audio') then
    raise exception 'Tipo de adjunto no reconocido.' using errcode = '22023';
  end if;

  select m.empresa_id, m.estado::text into v_empresa, v_estado
  from public.movimientos m where m.id = p_movimiento;

  if v_empresa is null then
    raise exception 'Ese movimiento no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if v_estado = 'anulado' then
    raise exception 'No se le pueden agregar comprobantes a un movimiento anulado.' using errcode = '42501';
  end if;

  select count(*) into v_cuantos from public.adjuntos where movimiento_id = p_movimiento;
  if v_cuantos >= public.limite_adjuntos_movimiento() then
    raise exception 'Este movimiento ya tiene % comprobantes, que es el máximo.',
      public.limite_adjuntos_movimiento() using errcode = '54000';
  end if;

  if p_tipo = 'foto' then
    if p_ruta is null or char_length(trim(p_ruta)) = 0 then
      raise exception 'Falta la ruta del archivo.' using errcode = '22023';
    end if;
    if coalesce(p_bytes, 0) > public.limite_bytes_adjunto() then
      raise exception 'La foto pesa demasiado.' using errcode = '54000';
    end if;

    v_prefijo := v_empresa::text || '/' || p_movimiento::text || '/';
    if position(v_prefijo in p_ruta) <> 1 then
      raise exception 'La ruta no corresponde a este movimiento.' using errcode = '42501';
    end if;

    insert into public.adjuntos (empresa_id, movimiento_id, tipo, ruta, mime, bytes, texto, creado_por)
    values (v_empresa, p_movimiento, 'foto', p_ruta, p_mime, coalesce(p_bytes, 0),
            coalesce(left(p_texto, 2000), ''), auth.uid())
    returning id into v_id;
  else
    if coalesce(trim(p_texto), '') = '' then
      raise exception 'Una nota de voz sin transcripción no se guarda.' using errcode = '22023';
    end if;

    insert into public.adjuntos (empresa_id, movimiento_id, tipo, ruta, mime, bytes, texto, creado_por)
    values (v_empresa, p_movimiento, 'audio', null, null, 0, left(p_texto, 2000), auth.uid())
    returning id into v_id;
  end if;

  return v_id;
end $fn$;

-- ------------------------------------------------------------
-- 7. BORRAR
--
--    Solo borra la FILA. El archivo lo borra el cliente contra Storage, que
--    tiene su propia policy. Se hace en ese orden a propósito: si el borrado
--    del archivo falla, queda un archivo sin fila (invisible, se limpia
--    después) y no una fila sin archivo (un comprobante roto en pantalla).
--
--    Quien no administra solo puede borrar lo que subió él.
-- ------------------------------------------------------------
create or replace function public.borrar_adjunto(p_adjunto uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_fila public.adjuntos;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_fila from public.adjuntos where id = p_adjunto;
  if v_fila.id is null then
    raise exception 'Ese comprobante no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_fila.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if not public.es_admin(v_fila.empresa_id) and v_fila.creado_por is distinct from auth.uid() then
    raise exception 'Solo podés borrar los comprobantes que subiste vos.' using errcode = '42501';
  end if;

  delete from public.adjuntos where id = p_adjunto;
  return v_fila.ruta;  -- para que el cliente sepa qué archivo borrar
end $fn$;

-- ------------------------------------------------------------
-- 8. LISTAR · una sola fila jsonb
--
--    Mismo criterio que la 006: nada que PostgREST pueda recortar.
-- ------------------------------------------------------------
create or replace function public.adjuntos_de(p_movimiento uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_empresa uuid;
  v_res     jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select m.empresa_id into v_empresa from public.movimientos m where m.id = p_movimiento;
  if v_empresa is null or not public.es_miembro(v_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'id', a.id, 'tipo', a.tipo, 'ruta', a.ruta, 'mime', a.mime,
      'bytes', a.bytes, 'texto', a.texto, 'creado_por', a.creado_por,
      'created_at', a.created_at
    ) as x
    from public.adjuntos a where a.movimiento_id = p_movimiento
  ) s;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 9. CUÁNTOS TIENE CADA MOVIMIENTO · para el listado
--
--    El historial necesita mostrar el clip sin traer los adjuntos de cada
--    fila. Esto devuelve solo el conteo, de a un lote de movimientos.
-- ------------------------------------------------------------
create or replace function public.conteo_adjuntos(p_empresa uuid, p_movimientos uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if auth.uid() is null or not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(movimiento_id::text, n), '{}'::jsonb) into v_res
  from (
    select a.movimiento_id, count(*)::int as n
    from public.adjuntos a
    where a.empresa_id = p_empresa
      and a.movimiento_id = any(coalesce(p_movimientos, '{}'::uuid[]))
    group by a.movimiento_id
  ) s;

  return v_res;
end $fn$;

revoke all on function public.adjuntar(uuid, text, text, text, integer, text) from public, anon;
revoke all on function public.borrar_adjunto(uuid) from public, anon;
revoke all on function public.adjuntos_de(uuid) from public, anon;
revoke all on function public.conteo_adjuntos(uuid, uuid[]) from public, anon;

grant execute on function public.adjuntar(uuid, text, text, text, integer, text) to authenticated;
grant execute on function public.borrar_adjunto(uuid) to authenticated;
grant execute on function public.adjuntos_de(uuid) to authenticated;
grant execute on function public.conteo_adjuntos(uuid, uuid[]) to authenticated;
