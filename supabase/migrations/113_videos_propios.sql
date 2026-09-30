-- ============================================================
-- 113 · LOS VIDEOS PROPIOS DEL TRAINER
-- ============================================================
--
-- QUÉ PIDIÓ MATÍAS (30/09/2026), A PARTIR DE UN ENTRENADOR DE VERDAD
--
-- El trainer quiere subir SUS videos —él haciendo el ejercicio— a cada
-- ejercicio de su lista, sin depender de YouTube ni de Instagram. El link
-- sigue como alternativa. Los topes los decidió Matías: hasta 100 videos por
-- cuenta y 60 segundos cada uno.
--
-- QUÉ HACE
--
--   1. Los topes: `limite_segundos_video()` (60) y `limite_bytes_video()`
--      (15 MB), como `limite_bytes_adjunto` (007).
--   2. `limites_plan` suma la clave `videos` (100 en Básico, Pro y Negocio;
--      0 en Gratis) y `limites_de_empresa` le da 0 a toda cuenta personal y
--      `limite_videos_en_prueba()` (20) a una cuenta en la prueba (revisión
--      del 30/09: una prueba sin pagar podía dejar 1,5 GB que nadie borra).
--      Lo pago se pregunta con limites_de_empresa, nunca con puede_cargar.
--   3. La tabla `videos`, genérica (una fila por archivo, sin nada del
--      oficio: mañana la pueden usar las clases), y `ejercicios.video_id`,
--      lo del trainer. Un video por ejercicio.
--   4. Las funciones para subir: reservar → el navegador sube DIRECTO a
--      Storage (Vercel corta los pedidos en ~4,5 MB) → poner_video_ejercicio
--      confirma con el tamaño real de Storage y engancha, todo junto.
--   5. El alumno: `rutina_por_token` trae `clip` (id, bytes, segundos; SIN la
--      ruta ni la empresa) y `videos_por_token` (solo service_role) le da a la
--      ruta pública /rutina/<token>/videos las rutas a firmar.
--   6. La limpieza: Storage no tiene claves foráneas. Un disparador pasa a
--      `borrando` el video que un ejercicio suelta, el navegador borra el
--      archivo enseguida, y un reloj diario (orden-limpiar-videos) barre lo
--      que quedó y los archivos huérfanos. Borrar la cuenta se lleva los
--      archivos (videos_a_borrar).
--   7. El bucket `videos` PRIVADO (15 MB, solo video/mp4) y sus tres policies,
--      con el mismo resguardo que la 007 y la 111.
--
-- LOS ESTADOS DE UN VIDEO
--
--   subiendo · reservado: el archivo puede no estar todavía.
--   listo    · puesto en un ejercicio. Toda fila `listo` está referenciada.
--   borrando · soltado: falta borrar el archivo.
--
-- El tope de 100 cuenta TODAS las filas de la cuenta, en cualquier estado.
-- Una fila se libera recién cuando su archivo ya no está en Storage: si
-- soltar una reserva liberara el cupo con el archivo guardado, se podría
-- subir sin tope repitiendo reservar → subir → soltar.
--
-- QUÉ NO HACE, A PROPÓSITO
--
--   · No mide la duración en el servidor: la limitan la pantalla (que achica
--     el video en el celular), el check de `segundos` y el tope de bytes.
--     ACEPTADO POR ESCRITO (revisión del 30/09, D1.7 del contrato): quien
--     esquive la pantalla y llame a la API a mano puede guardar hasta 15 MB
--     de CUALQUIER cosa rotulada video/mp4 (de cualquier duración, o que ni
--     sea un video), porque `segundos` lo declara el navegador y el
--     mimetype de Storage es el Content-Type que mandó. Lo que frena el
--     costo es el tope de bytes, que sí se cumple en el servidor (15 MB ×
--     el tope de videos). Los «hasta 60 segundos» de la pantalla y de la
--     Privacidad describen lo que hace Orden, no una garantía contra quien
--     arma los pedidos a mano. Si hiciera falta: una ruta con la clave de
--     servicio que lea `ftyp` y la duración de `mvhd` del archivo (con un
--     Range) antes de poner_video_ejercicio.
--   · No borra videos por cuenta vencida: se dejan de mostrar a los 30 días,
--     como la rutina (098). Borrarlos a los N meses es otra tarea.
--   · El candado (cuenta_activa_videos) va SOLO en INSERT: pasar un video a
--     `borrando` es limpiar, y limpiar anda siempre (018). Enganchar un video
--     ya lo frena cuenta_activa_ejercicios, que es UPDATE.
--   · No hay policy de UPDATE en Storage: un video no se pisa, se sube otro.
--
-- QUÉ QUEDA ABIERTO
--
--   · Si el rol que aplica esto no puede tocar storage, el bloque del bucket
--     avisa con un WARNING y el resto se aplica igual: el bucket y las
--     policies se crean a mano (el aviso dice cómo).
--   · allowed_mime_types confía en el Content-Type que manda el celular.
--   · Con el Smart CDN (plan Pro), una dirección firmada que ya se usó se
--     sigue sirviendo desde el CDN aunque venza: apagar el link corta las
--     direcciones nuevas; cortar un video del todo es borrar su archivo
--     (quitarlo o cambiarlo). Lo dicen la ruta /rutina/[token]/videos y la
--     Privacidad.
--   · Cuánto vale limite_videos_en_prueba() y si se borran los videos de
--     las cuentas que vencieron hace mucho (pregunta 4): los decide Matías.
--
-- Idempotente: se puede aplicar dos veces. No toca datos.
-- ============================================================


-- ------------------------------------------------------------
-- 1. LOS TOPES (como 007:75-79)
--
--    60 s los decidió Matías. La base acepta hasta 60,5 por el redondeo del
--    codificador. 15 MB: 60 s a ~1 Mbps son ~8 MB, y 15 dejan margen y
--    frenan a quien esquive la pantalla.
-- ------------------------------------------------------------
create or replace function public.limite_segundos_video() returns integer
  language sql immutable as $fn$ select 60 $fn$;

create or replace function public.limite_bytes_video() returns integer
  language sql immutable as $fn$ select 15 * 1024 * 1024 $fn$;


-- ------------------------------------------------------------
-- 2. QUÉ INCLUYE CADA PLAN (077:48-64 y 110:103-121)
--
--    Copia exacta de la 077 más `videos`. Gratis es, para un negocio, la
--    cuenta vencida: 0.
-- ------------------------------------------------------------
create or replace function public.limites_plan(p_plan text)
returns jsonb language sql immutable set search_path = public as $fn$
  select case coalesce(p_plan, 'gratis')
    when 'negocio' then jsonb_build_object(
      'capturas_mes', 3000, 'miembros', 15,
      'adjuntos', true, 'excel', true, 'avisos', true, 'escritura', true, 'videos', 100)
    when 'pro' then jsonb_build_object(
      'capturas_mes', 600, 'miembros', 3,
      'adjuntos', true, 'excel', true, 'avisos', true, 'escritura', true, 'videos', 100)
    when 'basico' then jsonb_build_object(
      'capturas_mes', 300, 'miembros', 1,
      'adjuntos', true, 'excel', true, 'avisos', true, 'escritura', true, 'videos', 100)
    else jsonb_build_object(
      'capturas_mes', 0, 'miembros', 1,
      'adjuntos', false, 'excel', true, 'avisos', true, 'escritura', false, 'videos', 0)
  end;
$fn$;

-- En la PRUEBA (sin haber pagado todavía) el tope de videos es más chico
-- (revisión del 30/09). La prueba da un plan pago sin pagar: con 100 × 15 MB
-- una cuenta de prueba podía dejar 1,5 GB en Storage que nadie borra (los
-- videos no se borran por vencimiento, pregunta 4), y con correos
-- descartables se llenaba el lugar del plan Pro de Supabase. Con la cuenta
-- activa (pagando) vuelve a ser el del plan (100). Pregunta abierta para
-- Matías: el número vive acá, en una sola función.
create or replace function public.limite_videos_en_prueba() returns integer
  language sql immutable as $fn$ select 20 $fn$;

-- Copia exacta de la 110 salvo el final: una cuenta personal no tiene dónde
-- usar videos (no tiene ejercicios) y no debe ocupar Storage por API; y en
-- la prueba, el tope de videos es limite_videos_en_prueba().
-- La rama de la personal en Gratis ya trae `videos` 0 de limites_plan('gratis').
create or replace function public.limites_de_empresa(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_plan text := public.plan_efectivo_calculado(p_empresa);
  v_tipo text;
  v_prueba boolean;
begin
  select coalesce(e.tipo_cuenta, 'emprendedor') into v_tipo
  from public.empresas e where e.id = p_empresa;

  if v_plan = 'gratis' and v_tipo = 'personal' then
    return public.limites_plan('gratis')
      || jsonb_build_object('escritura', true, 'excel', false, 'gratis_personal', true);
  end if;

  select coalesce(bool_or(s.estado = 'prueba'), false) into v_prueba
  from public.suscripciones s where s.empresa_id = p_empresa;

  return public.limites_plan(v_plan) || jsonb_build_object('gratis_personal', false)
         || case
              when v_tipo = 'personal' then jsonb_build_object('videos', 0)
              when v_prueba and v_plan <> 'gratis' then jsonb_build_object('videos',
                least(coalesce((public.limites_plan(v_plan)->>'videos')::int, 0), public.limite_videos_en_prueba()))
              else '{}'::jsonb
            end;
end $fn$;

revoke all on function public.limites_de_empresa(uuid) from public, anon, authenticated;
grant execute on function public.limites_de_empresa(uuid) to service_role;


-- ------------------------------------------------------------
-- 3. LA TABLA DE VIDEOS
--
--    Genérica: no sabe de ejercicios. La ruta dentro del bucket es el id y
--    nada más: la URL firmada la ve el alumno, y con la empresa adentro
--    filtraría un id interno que la 098 promete no mostrar. La arma la base,
--    nunca el navegador. Las policies deciden por esta fila, no por carpetas.
-- ------------------------------------------------------------
create table if not exists public.videos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  ruta        text generated always as (id::text || '.mp4') stored,
  estado      text not null default 'subiendo' check (estado in ('subiendo', 'listo', 'borrando')),
  estado_at   timestamptz not null default now(),
  segundos    numeric(4, 1) not null check (segundos > 0 and segundos <= public.limite_segundos_video() + 0.5),
  bytes       integer not null check (bytes between 1 and public.limite_bytes_video()),
  creado_por  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint videos_id_empresa unique (id, empresa_id)
);

create unique index if not exists videos_ruta_unica on public.videos (ruta);
create index if not exists videos_empresa_idx on public.videos (empresa_id, estado);

alter table public.videos enable row level security;
revoke all on public.videos from anon, authenticated;

-- Solo INSERT (decisión escrita, ver arriba): reservar es cargar; pasar a
-- `borrando` o borrar la fila es limpiar, y limpiar anda siempre.
drop trigger if exists cuenta_activa_videos on public.videos;
create trigger cuenta_activa_videos
  before insert on public.videos
  for each row execute function public.exigir_cuenta_activa();


-- ------------------------------------------------------------
-- 4. EL VIDEO DE CADA EJERCICIO
--
--    Clave compuesta: un ejercicio no puede apuntar al video de otra
--    empresa. NO ACTION (se borran juntos con la empresa, como en la 098) y
--    SIN unique: al unir dos ejercicios, los dos lo comparten un instante.
--    `video_url` y su check (098:102) no se tocan: el link es la alternativa.
-- ------------------------------------------------------------
alter table public.ejercicios add column if not exists video_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ejercicios_video_fk') then
    alter table public.ejercicios add constraint ejercicios_video_fk
      foreign key (video_id, empresa_id) references public.videos (id, empresa_id);
  end if;
end $$;

create index if not exists ejercicios_video_idx on public.ejercicios (video_id) where video_id is not null;

-- El ejercicio que suelta su video (lo cambia, lo quita o se borra) lo pasa
-- a `borrando`, salvo que otro ejercicio lo siga usando (unir, D1.10).
create or replace function public.soltar_video_de_ejercicio()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if old.video_id is not null and (tg_op = 'DELETE' or new.video_id is distinct from old.video_id) then
    update public.videos set estado = 'borrando', estado_at = now()
    where id = old.video_id and estado = 'listo'
      and not exists (select 1 from public.ejercicios e where e.video_id = old.video_id and e.id <> old.id);
  end if;
  return null;
end $fn$;

revoke all on function public.soltar_video_de_ejercicio() from public, anon, authenticated;

drop trigger if exists ejercicio_suelta_video on public.ejercicios;
create trigger ejercicio_suelta_video
  after update of video_id or delete on public.ejercicios
  for each row execute function public.soltar_video_de_ejercicio();


-- ------------------------------------------------------------
-- 5. AYUDANTES
--
--    `video_en_storage` es interna. Las otras cuatro las llaman las policies
--    de storage.objects, que corren con el permiso de quien sube
--    (authenticated), y contestan solo a quien es de la cuenta: si no, le
--    dirían a cualquiera con sesión si una cuenta ajena tiene videos.
-- ------------------------------------------------------------
create or replace function public.video_en_storage(p_ruta text)
returns boolean language plpgsql stable security definer set search_path = public as $fn$
declare v_hay boolean;
begin
  if to_regclass('storage.objects') is null then
    return false;
  end if;
  execute 'select exists (select 1 from storage.objects where bucket_id = ''videos'' and name = $1)'
    into v_hay using p_ruta;
  return coalesce(v_hay, false);
end $fn$;

revoke all on function public.video_en_storage(text) from public, anon, authenticated;

-- Mismo molde que puede_adjuntar (111): ser de la cuenta, que la cuenta
-- pueda escribir y que su plan traiga videos.
create or replace function public.puede_subir_video(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select public.es_miembro(p_empresa)
     and coalesce((l->>'escritura')::boolean, false)
     and coalesce((l->>'videos')::int, 0) > 0
  from (select public.limites_de_empresa(p_empresa) as l) x;
$fn$;

revoke all on function public.puede_subir_video(uuid) from public, anon;
grant execute on function public.puede_subir_video(uuid) to authenticated;

create or replace function public.video_visible(p_ruta text)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.videos v
    where v.ruta = p_ruta and public.es_miembro(v.empresa_id)
  );
$fn$;

revoke all on function public.video_visible(text) from public, anon;
grant execute on function public.video_visible(text) to authenticated;

-- Solo una reserva de hace menos de 3 horas: sin reserva no entra nada.
create or replace function public.video_subible(p_ruta text)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.videos v
    where v.ruta = p_ruta
      and v.estado = 'subiendo'
      and v.estado_at > now() - interval '3 hours'
      and public.es_miembro(v.empresa_id)
      and public.puede_subir_video(v.empresa_id)
  );
$fn$;

revoke all on function public.video_subible(text) from public, anon;
grant execute on function public.video_subible(text) to authenticated;

-- Un video puesto en un ejercicio no se borra desde el navegador: primero
-- se suelta (poner_video_ejercicio) y después se borra el archivo.
create or replace function public.video_borrable(p_ruta text)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.videos v
    where v.ruta = p_ruta
      and v.estado <> 'listo'
      and public.es_miembro(v.empresa_id)
  );
$fn$;

revoke all on function public.video_borrable(text) from public, anon;
grant execute on function public.video_borrable(text) to authenticated;


-- ------------------------------------------------------------
-- 6. LO QUE LLAMA LA PANTALLA DEL TRAINER
-- ------------------------------------------------------------

-- Reservar un lugar antes de subir. Devuelve {id, ruta}: la ruta la arma la
-- base, y la policy de subida solo acepta rutas reservadas.
create or replace function public.reservar_video(p_empresa uuid, p_segundos numeric, p_bytes integer)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_lim  jsonb;
  v_n    integer;
  v_id   uuid;
  v_ruta text;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_lim := public.limites_de_empresa(p_empresa);
  if coalesce((v_lim->>'escritura')::boolean, false) is not true then
    raise exception 'Se te terminó la prueba. Para seguir usando Orden hace falta activar tu plan.'
      using errcode = '42501';
  end if;
  if coalesce((v_lim->>'videos')::int, 0) <= 0 then
    raise exception 'Tu plan no incluye videos propios.' using errcode = '42501';
  end if;

  if p_segundos is null or p_segundos <= 0 or p_segundos > public.limite_segundos_video() + 0.5 then
    raise exception 'Un video puede durar hasta 60 segundos.' using errcode = '22023';
  end if;

  if p_bytes is null or p_bytes < 1 or p_bytes > public.limite_bytes_video() then
    raise exception 'El video pesa demasiado: hasta 15 MB.' using errcode = '22023';
  end if;

  -- Dos subidas a la vez no pasan juntas el tope.
  perform 1 from public.empresas where id = p_empresa for update;

  -- Lo que ya se puede liberar: reservas vencidas y videos soltados cuyo
  -- archivo ya no está.
  delete from public.videos
  where empresa_id = p_empresa
    and ((estado = 'subiendo' and estado_at < now() - interval '3 hours') or estado = 'borrando')
    and not public.video_en_storage(ruta);

  select count(*) into v_n from public.videos where empresa_id = p_empresa;
  if v_n >= (v_lim->>'videos')::int then
    -- En la prueba el tope es más chico (limite_videos_en_prueba): se dice por qué.
    if exists (select 1 from public.suscripciones s where s.empresa_id = p_empresa and s.estado = 'prueba')
       and (v_lim->>'videos')::int < coalesce((public.limites_plan(public.plan_efectivo_calculado(p_empresa))->>'videos')::int, 0) then
      raise exception 'En la prueba se pueden subir menos videos. Activá tu plan para subir más.' using errcode = '22023';
    end if;
    raise exception 'Llegaste al tope de videos de tu cuenta. Quitá uno para subir otro.' using errcode = '22023';
  end if;

  insert into public.videos (empresa_id, segundos, bytes, creado_por)
  values (p_empresa, round(p_segundos, 1), p_bytes, auth.uid())
  returning id, ruta into v_id, v_ruta;

  return jsonb_build_object('id', v_id, 'ruta', v_ruta);
end $fn$;

revoke all on function public.reservar_video(uuid, numeric, integer) from public, anon;
grant execute on function public.reservar_video(uuid, numeric, integer) to authenticated;

-- Confirmar un video subido y ponerlo en un ejercicio, todo junto: así no
-- quedan videos «listos» sueltos. Con p_video null, quita el que tenga.
create or replace function public.poner_video_ejercicio(p_empresa uuid, p_ejercicio uuid, p_video uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v       public.videos;
  v_bytes bigint;
  v_mime  text;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  perform 1 from public.ejercicios where id = p_ejercicio and empresa_id = p_empresa for update;
  if not found then
    raise exception 'Ese ejercicio no existe.' using errcode = 'P0002';
  end if;

  -- Quitar: el disparador pasa el video a `borrando`.
  if p_video is null then
    update public.ejercicios set video_id = null where id = p_ejercicio;
    return jsonb_build_object('video', null);
  end if;

  select * into v from public.videos where id = p_video and empresa_id = p_empresa for update;
  if v.id is null then
    raise exception 'Ese video no existe.' using errcode = 'P0002';
  end if;
  if v.estado <> 'subiendo' then
    raise exception 'Ese video ya está puesto en un ejercicio.' using errcode = '22023';
  end if;

  -- El tamaño y el tipo REALES, de Storage: no los que dijo el navegador.
  -- Sin esquema storage (las pruebas) vale lo declarado.
  if to_regclass('storage.objects') is not null then
    execute 'select (metadata->>''size'')::bigint, metadata->>''mimetype'' from storage.objects '
         || 'where bucket_id = ''videos'' and name = $1'
      into v_bytes, v_mime using v.ruta;
    -- Un archivo vacío tampoco terminó de subir.
    if v_bytes is null or v_bytes < 1 then
      raise exception 'El video no terminó de subir. Probá de nuevo.' using errcode = '22023';
    end if;
    if v_mime is distinct from 'video/mp4' then
      raise exception 'El video tiene que ser MP4.' using errcode = '22023';
    end if;
    if v_bytes > public.limite_bytes_video() then
      raise exception 'El video pesa demasiado: hasta 15 MB.' using errcode = '22023';
    end if;
  else
    v_bytes := v.bytes;
  end if;

  update public.videos set estado = 'listo', estado_at = now(), bytes = v_bytes where id = p_video;
  -- El candado de `ejercicios` (UPDATE) frena a un vencido y deshace todo;
  -- el disparador suelta el video que tenía antes.
  update public.ejercicios set video_id = p_video where id = p_ejercicio;

  return jsonb_build_object('video', jsonb_build_object(
    'id', v.id, 'bytes', v_bytes, 'seg', v.segundos, 'ruta', v.ruta));
end $fn$;

revoke all on function public.poner_video_ejercicio(uuid, uuid, uuid) from public, anon;
grant execute on function public.poner_video_ejercicio(uuid, uuid, uuid) to authenticated;

-- Soltar filas cuyo archivo ya no está (el navegador lo acaba de borrar, o
-- la subida falló). Una `listo` nunca se suelta.
create or replace function public.soltar_videos(p_empresa uuid, p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $fn$
declare v_n integer;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  delete from public.videos
  where empresa_id = p_empresa
    and id = any(coalesce(p_ids, '{}'::uuid[]))
    and estado in ('subiendo', 'borrando')
    and not public.video_en_storage(ruta);
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke all on function public.soltar_videos(uuid, uuid[]) from public, anon;
grant execute on function public.soltar_videos(uuid, uuid[]) to authenticated;

-- Lo que el navegador del trainer puede borrar ya: soltados y reservas
-- vencidas.
create or replace function public.videos_por_soltar(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'ruta', x.ruta)), '[]'::jsonb) into v_res
  from (
    select v.id, v.ruta from public.videos v
    where v.empresa_id = p_empresa
      and (v.estado = 'borrando' or (v.estado = 'subiendo' and v.estado_at < now() - interval '3 hours'))
    order by v.estado_at
    limit 200
  ) x;
  return v_res;
end $fn$;

revoke all on function public.videos_por_soltar(uuid) from public, anon;
grant execute on function public.videos_por_soltar(uuid) to authenticated;

-- «Videos propios: N de 100». Cuenta todas las filas, como el tope.
create or replace function public.videos_de_la_cuenta(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  -- `tope_plan`: el del plan cuando la cuenta está activa. En la prueba es
  -- más que `tope`, y la pantalla lo dice («con tu plan activo, hasta 100»).
  return jsonb_build_object(
    'usados', (select count(*)::int from public.videos where empresa_id = p_empresa),
    'tope', coalesce((public.limites_de_empresa(p_empresa)->>'videos')::int, 0),
    'tope_plan', coalesce((public.limites_plan(public.plan_efectivo_calculado(p_empresa))->>'videos')::int, 0));
end $fn$;

revoke all on function public.videos_de_la_cuenta(uuid) from public, anon;
grant execute on function public.videos_de_la_cuenta(uuid) to authenticated;


-- ------------------------------------------------------------
-- 7. FUNCIONES DE LA 098, RE-CREADAS CON EL VIDEO PROPIO
-- ------------------------------------------------------------

-- La biblioteca (098:649-683): lo mismo más `video` (el propio, si está listo).
create or replace function public.ejercicios_de(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_lista jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  -- Los más usados primero: son los que el trainer va a buscar.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',           e.id,
    'nombre',       e.nombre,
    'grupo',        e.grupo,
    'indicaciones', e.indicaciones,
    'video_url',    e.video_url,
    'activo',       e.activo,
    'usos',         u.usos,
    'video',        case when v.id is null then null
                    else jsonb_build_object('id', v.id, 'bytes', v.bytes, 'seg', v.segundos, 'ruta', v.ruta) end
  ) order by u.usos desc, e.clave, e.nombre), '[]'::jsonb)
  into v_lista
  from public.ejercicios e
  left join public.videos v on v.id = e.video_id and v.estado = 'listo'
  cross join lateral (
    select count(*)::int as usos from public.rutina_ejercicios re where re.ejercicio_id = e.id
  ) u
  where e.empresa_id = p_empresa;

  return v_lista;
end $fn$;

revoke all on function public.ejercicios_de(uuid) from public, anon;
grant execute on function public.ejercicios_de(uuid) to authenticated;

-- Crear o editar un ejercicio de la biblioteca (098:687-783).
--
-- Renombrar uno al nombre de OTRO que ya existe es unirlos: «Sentadila»
-- pasa a ser «Sentadilla» en todas las rutinas y en el historial de cargas,
-- y el repetido desaparece. Es la única forma de arreglar un duplicado, y
-- como cambia rutinas de muchos clientes, es del dueño o de un admin.
--
-- 113: al unir, el que queda se lleva el video propio del otro si no tenía;
-- si los dos tenían, el del que se va lo suelta el disparador al borrarlo.
create or replace function public.guardar_ejercicio(
  p_empresa       uuid,
  p_nombre        text,
  p_grupo         text default null,
  p_indicaciones  text default '',
  p_video         text default null,
  p_activo        boolean default true,
  p_id            uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre text;
  v_grupo  text;
  v_ind    text;
  v_video  text;
  v_otro   uuid;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_nombre := btrim(left(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), 80));
  if v_nombre = '' then
    raise exception 'A un ejercicio le falta el nombre.' using errcode = '22023';
  end if;

  v_grupo := nullif(btrim(coalesce(p_grupo, '')), '');
  if v_grupo is not null and v_grupo not in ('piernas', 'gluteos', 'pecho', 'espalda', 'hombros',
                                             'brazos', 'core', 'cardio', 'movilidad', 'otro') then
    raise exception 'Ese grupo de ejercicios no existe.' using errcode = '22023';
  end if;

  v_ind := left(coalesce(p_indicaciones, ''), 500);

  v_video := nullif(btrim(coalesce(p_video, '')), '');
  if v_video is not null and v_video !~ '^https://\S+$' then
    raise exception 'El video tiene que ser un link que empiece con https://.' using errcode = '22023';
  end if;
  if char_length(v_video) > 300 then
    raise exception 'El link del video es demasiado largo.' using errcode = '22023';
  end if;

  -- Nuevo.
  if p_id is null then
    if exists (select 1 from public.ejercicios
               where empresa_id = p_empresa and clave = public.clave_ejercicio(v_nombre)) then
      raise exception 'Ya tenés un ejercicio que se llama así.' using errcode = '22023';
    end if;

    insert into public.ejercicios (empresa_id, nombre, grupo, indicaciones, video_url, activo)
    values (p_empresa, v_nombre, v_grupo, v_ind, v_video, coalesce(p_activo, true))
    returning id into v_otro;

    return jsonb_build_object('id', v_otro, 'unido', false);
  end if;

  -- Editar.
  perform 1 from public.ejercicios where id = p_id and empresa_id = p_empresa for update;
  if not found then
    raise exception 'Ese ejercicio no existe.' using errcode = 'P0002';
  end if;

  select id into v_otro from public.ejercicios
  where empresa_id = p_empresa and clave = public.clave_ejercicio(v_nombre) and id <> p_id;

  if v_otro is not null then
    if not public.es_admin(p_empresa) then
      raise exception 'Unir dos ejercicios es del dueño o de un administrador.' using errcode = '42501';
    end if;

    update public.rutina_ejercicios set ejercicio_id = v_otro where ejercicio_id = p_id;
    update public.cargas_historial  set ejercicio_id = v_otro where ejercicio_id = p_id;

    -- El que queda conserva lo suyo y completa lo que le faltaba con lo que
    -- traía el otro: unir no puede borrar un video o un «cómo se hace».
    update public.ejercicios
    set grupo        = coalesce(grupo, v_grupo),
        indicaciones = case when indicaciones = '' then v_ind else indicaciones end,
        video_url    = coalesce(video_url, v_video),
        video_id     = coalesce(video_id, (select e2.video_id from public.ejercicios e2 where e2.id = p_id)),
        activo       = activo or coalesce(p_activo, true)
    where id = v_otro;

    delete from public.ejercicios where id = p_id;

    return jsonb_build_object('id', v_otro, 'unido', true);
  end if;

  update public.ejercicios
  set nombre = v_nombre, grupo = v_grupo, indicaciones = v_ind,
      video_url = v_video, activo = coalesce(p_activo, true)
  where id = p_id;

  return jsonb_build_object('id', p_id, 'unido', false);
end $fn$;

revoke all on function public.guardar_ejercicio(uuid, text, text, text, text, boolean, uuid) from public, anon;
grant execute on function public.guardar_ejercicio(uuid, text, text, text, text, boolean, uuid) to authenticated;

-- LO QUE VE EL CLIENTE (098:1653-1745), pública, sin sesión.
--
--    El patrón de `reserva_por_token` (038): el token ES la credencial, así
--    que se devuelve lo justo. El nombre de pila, el negocio y la rutina
--    vigente. NUNCA el teléfono, el apellido, «Salud y lesiones», medidas,
--    paquetes, plata, borradores, rutinas anteriores ni ids (salvo el de
--    cada renglón, que es con lo que el celular guarda sus tildes).
--
--    113: cada ejercicio suma `clip` (el video propio, si está listo): su id,
--    sus bytes y sus segundos, para que el celular lo guarde y diga cuánto
--    pesa. SIN la ruta ni la empresa: las rutas firmadas las da la ruta
--    /rutina/<token>/videos, a partir del mismo token (videos_por_token).
--
--    Un token que no existe, un link apagado o cambiado, un cliente
--    archivado o un negocio que ya no es de entrenamiento dan EXACTAMENTE
--    lo mismo: `{"existe": false}`. Distinguirlos le diría a quien prueba
--    tokens cuál existió.
--
--    La cuenta vencida (decisión de Matías): 30 días de gracia; después, en
--    vez de la rutina, «Tu entrenador tiene que renovar su cuenta».
create or replace function public.rutina_por_token(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_en      public.rutina_enlaces;
  v_cli     public.clientes;
  v_emp     public.empresas;
  v_r       public.rutinas;
  v_nombre  text;
  v_renovar boolean;
begin
  select * into v_en from public.rutina_enlaces where token = p_token;
  if v_en.cliente_id is null or not v_en.activo then
    return jsonb_build_object('existe', false);
  end if;

  select * into v_cli from public.clientes where id = v_en.cliente_id and empresa_id = v_en.empresa_id;
  if v_cli.id is null or not v_cli.activo then
    return jsonb_build_object('existe', false);
  end if;

  select * into v_emp from public.empresas where id = v_en.empresa_id;
  if v_emp.id is null or v_emp.rubro is distinct from 'entrenamiento' then
    return jsonb_build_object('existe', false);
  end if;

  -- El nombre de pila: lo que va hasta el primer espacio de CUALQUIER tipo.
  -- `guardar_cliente` solo recorta los espacios comunes, y un nombre pegado
  -- desde WhatsApp o desde los contactos trae espacios duros (U+00A0 y
  -- parientes), tabuladores o saltos: cortar solo en « » mostraría el
  -- apellido. Las mismas clases en PGlite (idioma C) y en producción (ICU).
  -- El espacio duro de WhatsApp (U+00A0) y sus parientes, escritos como
  -- códigos y no pegados: pegados, se volvían espacios comunes al aplicar la
  -- migración, y el link mostraba el apellido.
  v_nombre := coalesce(substring(v_cli.nombre from E'[^[:space:]\u00A0\u2007\u202F\u2060\uFEFF]+'), '');

  v_renovar := not public.puede_cargar(v_emp.id)
    and coalesce((
      select s.periodo_fin is null or s.periodo_fin <= now() - interval '30 days'
      from public.suscripciones s where s.empresa_id = v_emp.id
    ), true);

  if v_renovar then
    return jsonb_build_object(
      'existe', true, 'negocio', v_emp.nombre, 'nombre', v_nombre,
      'renovar', true, 'actualizada', null, 'rutina', null);
  end if;

  select * into v_r from public.rutinas
  where cliente_id = v_cli.id and empresa_id = v_emp.id and estado = 'vigente';

  return jsonb_build_object(
    'existe',      true,
    'negocio',     v_emp.nombre,
    'nombre',      v_nombre,
    'renovar',     false,
    'actualizada', v_r.updated_at,
    'rutina', case when v_r.id is null then null else jsonb_build_object(
      'nombre', v_r.nombre,
      'notas',  v_r.notas,
      'desde',  v_r.desde,
      'dias', coalesce((
        select jsonb_agg(jsonb_build_object(
          'orden',  d.orden,
          'nombre', d.nombre,
          'notas',  d.notas,
          'ejercicios', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',           re.id,
              'orden',        re.orden,
              'nombre',       e.nombre,
              'series',       re.series,
              'reps',         re.reps,
              'carga',        re.carga,
              'descanso_seg', re.descanso_seg,
              'nota',         re.nota,
              'junto',        re.junto_al_anterior,
              'video',        e.video_url,
              'como',         e.indicaciones,
              'clip',         case when v.id is null then null
                              else jsonb_build_object('id', v.id, 'bytes', v.bytes, 'seg', v.segundos) end
            ) order by re.orden)
            from public.rutina_ejercicios re
            join public.ejercicios e on e.id = re.ejercicio_id
            left join public.videos v on v.id = e.video_id and v.estado = 'listo'
            where re.dia_id = d.id
          ), '[]'::jsonb)
        ) order by d.orden)
        from public.rutina_dias d
        where d.rutina_id = v_r.id
      ), '[]'::jsonb)
    ) end
  );
end $fn$;

revoke all on function public.rutina_por_token(uuid) from public;
grant execute on function public.rutina_por_token(uuid) to anon, authenticated;

-- borrar_ejercicio no se toca: el disparador suelta el video.


-- ------------------------------------------------------------
-- 8. FUNCIONES DEL SISTEMA (solo service_role)
-- ------------------------------------------------------------

-- Las rutas que la ruta pública /rutina/<token>/videos puede firmar. Los
-- controles de quién ve (link activo, alumno activo, rubro, 30 días) viven
-- en un solo lugar: rutina_por_token. Sin rutina o con `renovar`, nada.
create or replace function public.videos_por_token(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v     jsonb;
  v_res jsonb;
begin
  v := public.rutina_por_token(p_token);
  if (v->>'existe') is distinct from 'true'
     or (v->>'renovar') = 'true'
     or jsonb_typeof(v->'rutina') is distinct from 'object'
     or jsonb_typeof(v->'rutina'->'dias') is distinct from 'array' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', vv.id, 'ruta', vv.ruta) order by vv.ruta), '[]'::jsonb)
  into v_res
  from public.videos vv
  where vv.estado = 'listo'
    and vv.id in (
      select public.uuid_o_null(ej->'clip'->>'id')
      from jsonb_array_elements(v->'rutina'->'dias') d
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(d->'ejercicios') = 'array' then d->'ejercicios' else '[]'::jsonb end) ej
      where jsonb_typeof(ej->'clip') = 'object'
    );

  return v_res;
end $fn$;

revoke all on function public.videos_por_token(uuid) from public, anon, authenticated;
grant execute on function public.videos_por_token(uuid) to service_role;

-- Lo que el reloj de la noche tiene que borrar de Storage: soltados hace
-- más de 10 minutos (el navegador ya tuvo su oportunidad), reservas de hace
-- más de 3 horas y archivos que no tienen fila.
create or replace function public.videos_para_limpiar()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_filas     jsonb;
  v_huerfanos jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(x.ruta), '[]'::jsonb) into v_filas
  from (
    select v.ruta from public.videos v
    where (v.estado = 'borrando' and v.estado_at < now() - interval '10 minutes')
       or (v.estado = 'subiendo' and v.estado_at < now() - interval '3 hours')
    order by v.estado_at
    limit 500
  ) x;

  if to_regclass('storage.objects') is not null then
    execute 'select coalesce(jsonb_agg(x.name), ''[]''::jsonb) from ('
         || '  select o.name from storage.objects o'
         || '  where o.bucket_id = ''videos'' and o.created_at < now() - interval ''3 hours'''
         || '    and not exists (select 1 from public.videos v where v.ruta = o.name)'
         || '  order by o.created_at limit 500) x'
      into v_huerfanos;
  end if;

  return v_filas || coalesce(v_huerfanos, '[]'::jsonb);
end $fn$;

revoke all on function public.videos_para_limpiar() from public, anon, authenticated;
grant execute on function public.videos_para_limpiar() to service_role;

-- Después de borrar los archivos: las filas cuyo archivo ya no está.
create or replace function public.videos_limpiados(p_rutas text[])
returns integer language plpgsql security definer set search_path = public as $fn$
declare v_n integer;
begin
  delete from public.videos
  where ruta = any(coalesce(p_rutas, '{}'::text[]))
    and estado <> 'listo'
    and not public.video_en_storage(ruta);
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke all on function public.videos_limpiados(text[]) from public, anon, authenticated;
grant execute on function public.videos_limpiados(text[]) to service_role;

-- Borrar la cuenta (014): las rutas de los videos de las mismas empresas que
-- archivos_a_borrar (propietario y único miembro). La ruta las pide ANTES de
-- borrar los datos: después ya no habría cómo saber cuáles eran.
create or replace function public.videos_a_borrar(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(v.ruta), '[]'::jsonb) into v_res
  from public.videos v
  where v.empresa_id in (
    select m.empresa_id
    from public.miembros m
    where m.user_id = p_user
      and m.rol = 'propietario'
      and (select count(*) from public.miembros mm where mm.empresa_id = m.empresa_id) = 1
  );

  return v_res;
end $fn$;

revoke all on function public.videos_a_borrar(uuid) from public, anon, authenticated;
grant execute on function public.videos_a_borrar(uuid) to service_role;


-- ------------------------------------------------------------
-- 9. EL BUCKET Y SUS POLICIES (mismo resguardo que 007:99-158 y 111)
--
--    Privado: el alumno recibe URLs firmadas de 3 horas. Apagar o cambiar el
--    link corta el acceso, y nadie incrusta los videos del trainer —su cara
--    y su cuerpo— en otra página. Sin policy de UPDATE.
-- ------------------------------------------------------------
do $bloque$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice 'Sin esquema storage: se omiten el bucket y las policies de videos.';
    return;
  end if;

  execute format($sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('videos', 'videos', false, %s, array['video/mp4'])
    on conflict (id) do update set public = false,
      file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$, public.limite_bytes_video());

  execute 'drop policy if exists videos_ver on storage.objects';
  execute 'drop policy if exists videos_subir on storage.objects';
  execute 'drop policy if exists videos_borrar on storage.objects';

  execute $sql$ create policy videos_ver on storage.objects for select to authenticated
    using (bucket_id = 'videos' and public.video_visible(name)) $sql$;
  execute $sql$ create policy videos_subir on storage.objects for insert to authenticated
    with check (bucket_id = 'videos' and public.video_subible(name)) $sql$;
  execute $sql$ create policy videos_borrar on storage.objects for delete to authenticated
    using (bucket_id = 'videos' and public.video_borrable(name)) $sql$;

exception
  when insufficient_privilege then
    raise warning 'No se pudieron crear el bucket o las policies de videos (falta permiso sobre storage). Crealos a mano en Storage: bucket «videos» privado, 15 MB, solo video/mp4, y las policies videos_ver, videos_subir y videos_borrar con las condiciones de este bloque. El resto de la migración se aplicó bien.';
end $bloque$;


-- ------------------------------------------------------------
-- 10. EL RELOJ DE LA LIMPIEZA (como 081:118-148)
--
--    06:40 UTC = 03:40 en Paraguay. Sin pg_cron (las pruebas) no se
--    programa nada, y no revienta.
-- ------------------------------------------------------------
do $cal$
begin
  execute format('select cron.schedule(%L, %L, %L)', 'orden-limpiar-videos', '40 6 * * *',
    format('select public.disparar_tarea(%L)', '/api/tareas/limpiar-videos'));
exception when others then
  raise notice 'Sin pg_cron acá (%): la limpieza de videos no se programa en este entorno.', sqlerrm;
end $cal$;
