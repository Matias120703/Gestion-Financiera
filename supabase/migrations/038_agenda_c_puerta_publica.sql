-- ORDEN · Migración 038 · El link público de reservas
--
-- Acá se rompe algo a propósito. La migración 012 se llama «Cerrarle la
-- puerta a `anon`», y su argumento sigue siendo bueno: el permiso no debería
-- depender de que nadie se equivoque nunca dentro del cuerpo de una función.
--
-- La página de reservas obliga a abrir esa puerta —un desconocido sin cuenta
-- tiene que poder ver los huecos y tomar uno— así que se abre del ancho
-- exacto: TRES FUNCIONES Y NADA MÁS, cada una devolviendo lo mínimo.
--
-- LO QUE LO PÚBLICO NUNCA PUEDE VER
--
--   · quién ocupa un horario tomado. La respuesta es «libre» u «ocupado»,
--     nunca de quién: si la página dijera «14:00 — Juan Pérez», el barbero
--     acabaría de publicar la agenda de sus clientes en internet;
--   · ningún dato de la empresa que no sea su nombre, dirección y mensaje;
--   · costos, márgenes, ni un solo producto con stock.
--
-- EL LINK ES PARA SIEMPRE
--
-- Una vez que está en la biografía de Instagram, en el estado de WhatsApp y
-- en cien publicaciones viejas, ya no se puede cambiar: no es una URL, es la
-- dirección del local. De ahí sale la regla más importante de este archivo,
-- que un slug liberado NUNCA se le reasigna a otro negocio. Si «barberia-juan»
-- se libera y un año después se lo damos a otro, un cliente que entra por un
-- posteo viejo termina reservando con un barbero que no eligió.

-- ============================================================
-- 1. EL LINK
-- ============================================================
create table if not exists public.turnos_publico (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  slug       text not null unique
             check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  activo     boolean not null default true,
  titulo     text not null default '',
  mensaje    text not null default '',
  direccion  text not null default '',
  updated_at timestamptz not null default now()
);

-- Los slugs que alguna vez existieron. No se borran nunca: es la única forma
-- de garantizar que un link viejo no lleve a otro negocio.
create table if not exists public.turnos_slug_usado (
  slug       text primary key,
  empresa_id uuid references public.empresas (id) on delete set null,
  liberado   timestamptz not null default now()
);

-- Teléfonos que el dueño no quiere volver a ver en su agenda.
create table if not exists public.turnos_bloqueo (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  telefono   text not null,
  motivo     text not null default '',
  created_at timestamptz not null default now(),
  primary key (empresa_id, telefono)
);

alter table public.turnos_publico    enable row level security;
alter table public.turnos_slug_usado enable row level security;
alter table public.turnos_bloqueo    enable row level security;

drop policy if exists turnos_publico_select on public.turnos_publico;
create policy turnos_publico_select on public.turnos_publico
  for select to authenticated using (public.es_miembro(empresa_id));

drop policy if exists turnos_bloqueo_select on public.turnos_bloqueo;
create policy turnos_bloqueo_select on public.turnos_bloqueo
  for select to authenticated using (public.es_admin(empresa_id));

revoke all on public.turnos_publico    from anon, authenticated;
revoke all on public.turnos_slug_usado from anon, authenticated;
revoke all on public.turnos_bloqueo    from anon, authenticated;

grant select on public.turnos_publico to authenticated;
grant select on public.turnos_bloqueo to authenticated;

drop trigger if exists cuenta_activa_turnos_publico on public.turnos_publico;
create trigger cuenta_activa_turnos_publico
  before insert or update on public.turnos_publico
  for each row execute function public.exigir_cuenta_activa();

-- ============================================================
-- 2. ARMAR EL SLUG
--
--    Se genera solo a partir del nombre del negocio. Si el dueño tuviera que
--    inventarlo, la mitad no lo hace nunca y el módulo no se usa.
--
--    Sin `unaccent`: esa extensión no está en todos lados, y una función que
--    depende de una extensión ausente falla en el peor momento. `translate`
--    hace el trabajo y no depende de nada.
-- ============================================================
create or replace function public.slug_de(p_texto text)
returns text language sql immutable set search_path = public as $fn$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(
          lower(translate(coalesce(p_texto, ''),
                          'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
                          'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
          '[^a-z0-9]+', '-', 'g'),
        '-+', '-', 'g')),
    '');
$fn$;

grant execute on function public.slug_de(text) to anon, authenticated;

-- ¿Está libre? Libre quiere decir: no lo usa nadie Y no lo usó nadie antes.
create or replace function public.slug_disponible(p_slug text)
returns boolean language sql stable security definer set search_path = public as $fn$
  select p_slug is not null
     and p_slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'
     and not exists (select 1 from public.turnos_publico where slug = p_slug)
     and not exists (select 1 from public.turnos_slug_usado where slug = p_slug);
$fn$;

revoke all on function public.slug_disponible(text) from public, anon;
grant execute on function public.slug_disponible(text) to authenticated;

-- ============================================================
-- 3. CREAR Y CAMBIAR EL LINK
-- ============================================================
create or replace function public.guardar_link_publico(
  p_empresa   uuid,
  p_slug      text default null,
  p_activo    boolean default null,
  p_titulo    text default null,
  p_mensaje   text default null,
  p_direccion text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_actual text;
  v_slug   text;
  v_base   text;
  v_n      integer := 1;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar el link.' using errcode = '42501';
  end if;

  select slug into v_actual from public.turnos_publico where empresa_id = p_empresa;

  if p_slug is not null and trim(p_slug) <> '' then
    v_slug := public.slug_de(p_slug);
    if v_slug is null or length(v_slug) < 3 then
      raise exception 'Ese link es demasiado corto.' using errcode = '22023';
    end if;
    if v_slug <> coalesce(v_actual, '') and not public.slug_disponible(v_slug) then
      raise exception 'Ese link ya está tomado.' using errcode = '23505';
    end if;
  elsif v_actual is not null then
    v_slug := v_actual;
  else
    -- Primera vez: se arma del nombre del negocio y se le agrega un número
    -- si hace falta. Dos «Barbería Juan» no pueden compartir dirección.
    select public.slug_de(nombre) into v_base from public.empresas where id = p_empresa;
    v_base := coalesce(nullif(v_base, ''), 'negocio');
    v_slug := v_base;
    while not public.slug_disponible(v_slug) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
      if v_n > 500 then
        raise exception 'No se pudo generar un link.' using errcode = 'P0001';
      end if;
    end loop;
  end if;

  -- El slug viejo se quema: no vuelve a estar disponible para nadie.
  if v_actual is not null and v_actual <> v_slug then
    insert into public.turnos_slug_usado (slug, empresa_id)
    values (v_actual, p_empresa)
    on conflict (slug) do nothing;
  end if;

  insert into public.turnos_publico (empresa_id, slug, activo, titulo, mensaje, direccion)
  values (p_empresa, v_slug, coalesce(p_activo, true),
          left(coalesce(p_titulo, ''), 80), left(coalesce(p_mensaje, ''), 300),
          left(coalesce(p_direccion, ''), 160))
  on conflict (empresa_id) do update
    set slug      = excluded.slug,
        activo    = coalesce(p_activo, public.turnos_publico.activo),
        titulo    = coalesce(nullif(excluded.titulo, ''), public.turnos_publico.titulo),
        mensaje   = case when p_mensaje is null then public.turnos_publico.mensaje else excluded.mensaje end,
        direccion = case when p_direccion is null then public.turnos_publico.direccion else excluded.direccion end,
        updated_at = now();

  return jsonb_build_object('slug', v_slug, 'cambio', v_actual is distinct from v_slug);
end $fn$;

revoke all on function public.guardar_link_publico(uuid, text, boolean, text, text, text) from public, anon;
grant execute on function public.guardar_link_publico(uuid, text, boolean, text, text, text) to authenticated;

create or replace function public.bloquear_telefono(
  p_empresa uuid, p_telefono text, p_motivo text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede bloquear.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_telefono, ''))) = 0 then
    raise exception 'Falta el teléfono.' using errcode = '22023';
  end if;

  insert into public.turnos_bloqueo (empresa_id, telefono, motivo)
  values (p_empresa, trim(p_telefono), left(coalesce(p_motivo, ''), 100))
  on conflict (empresa_id, telefono) do update set motivo = excluded.motivo;

  return jsonb_build_object('bloqueado', true);
end $fn$;

revoke all on function public.bloquear_telefono(uuid, text, text) from public, anon;
grant execute on function public.bloquear_telefono(uuid, text, text) to authenticated;

-- ============================================================
-- 4. PUERTA PÚBLICA · 1 de 3 · QUÉ ES ESTE NEGOCIO
--
--    Nombre, dirección, mensaje, quiénes atienden y qué servicios se pueden
--    reservar con su precio. Nada más. Ni el id de la empresa hace falta que
--    salga de acá: quien reserva lo hace por el slug.
-- ============================================================
create or replace function public.agenda_publica(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_emp   uuid;
  v_pub   public.turnos_publico%rowtype;
  v_nom   text;
  v_mon   text;
  v_profs jsonb;
begin
  select * into v_pub from public.turnos_publico where slug = lower(trim(coalesce(p_slug, '')));

  -- Un link apagado y un link que no existe contestan lo mismo. Distinguirlos
  -- le diría a cualquiera qué negocios usan Orden y cuáles cerraron.
  if v_pub.empresa_id is null or not v_pub.activo then
    return jsonb_build_object('existe', false);
  end if;

  v_emp := v_pub.empresa_id;

  select nombre, moneda into v_nom, v_mon from public.empresas where id = v_emp;

  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) into v_profs
  from (
    select jsonb_build_object(
      'id',     p.id,
      'nombre', p.nombre,
      'servicios', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',       pr.id,
          'nombre',   pr.nombre,
          'duracion', s.duracion_min,
          'precio',   public.precio_de_servicio(p.id, pr.id)
        ) order by pr.nombre)
        from public.turnos_servicio s
        join public.productos pr on pr.id = s.producto_id
        where s.empresa_id = v_emp and s.reservable and pr.activo and not pr.controla_stock
      ), '[]'::jsonb)
    ) as x
    from public.turnos_profesional p
    where p.empresa_id = v_emp and p.activo
      -- Solo quien tiene horario cargado: ofrecer a alguien que nunca
      -- trabaja es mandar al cliente a una pantalla vacía.
      and exists (select 1 from public.turnos_horario h
                  where h.profesional_id = p.id and h.activo)
  ) t;

  return jsonb_build_object(
    'existe',    true,
    'negocio',   coalesce(nullif(v_pub.titulo, ''), v_nom),
    'direccion', v_pub.direccion,
    'mensaje',   v_pub.mensaje,
    'moneda',    v_mon,
    'profesionales', v_profs
  );
end $fn$;

revoke all on function public.agenda_publica(text) from public;
grant execute on function public.agenda_publica(text) to anon, authenticated;

-- ============================================================
-- 5. PUERTA PÚBLICA · 2 de 3 · QUÉ HUECOS QUEDAN
--
--    Devuelve horarios y nada más. Quién ocupa los que faltan no sale de
--    acá, y no por omisión: la consulta no lo trae.
-- ============================================================
create or replace function public.huecos_publicos(
  p_slug        text,
  p_profesional uuid,
  p_producto    uuid,
  p_fecha       date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_emp  uuid;
  v_res  jsonb;
begin
  select tp.empresa_id into v_emp
  from public.turnos_publico tp
  where tp.slug = lower(trim(coalesce(p_slug, ''))) and tp.activo;

  if v_emp is null then
    return '[]'::jsonb;
  end if;

  -- El profesional tiene que ser de ESE negocio. Sin esta comprobación, el
  -- link de una barbería serviría para espiar la agenda de cualquier otra.
  if not exists (select 1 from public.turnos_profesional
                 where id = p_profesional and empresa_id = v_emp and activo) then
    return '[]'::jsonb;
  end if;

  -- Ni ayer ni dentro de dos años. El tope corta el paseo de quien quiera
  -- recorrer la agenda entera pidiendo fechas.
  if p_fecha is null
     or p_fecha < public.hoy_empresa(v_emp)
     or p_fecha > public.hoy_empresa(v_emp) + 60 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(h.inicia order by h.inicia), '[]'::jsonb) into v_res
  from public.huecos_del_dia(p_profesional, p_fecha, p_producto) h;

  return v_res;
end $fn$;

revoke all on function public.huecos_publicos(text, uuid, uuid, date) from public;
grant execute on function public.huecos_publicos(text, uuid, uuid, date) to anon, authenticated;

-- ============================================================
-- 6. PUERTA PÚBLICA · 3 de 3 · TOMAR EL TURNO
--
--    La única que escribe. Un formulario abierto en internet es un
--    formulario que alguien va a llenar cien veces: sin freno, cualquiera con
--    el link le llena el sábado de reservas falsas en dos minutos y el módulo
--    pasa a ser un problema en vez de una solución.
-- ============================================================
create or replace function public.reservar_publico(
  p_slug        text,
  p_profesional uuid,
  p_producto    uuid,
  p_inicia      timestamptz,
  p_nombre      text,
  p_telefono    text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_emp      uuid;
  v_tel      text;
  v_zona     text;
  v_fecha    date;
  v_fin      timestamptz;
  v_id       uuid;
  v_token    uuid;
  v_pendientes integer;
begin
  select tp.empresa_id into v_emp
  from public.turnos_publico tp
  where tp.slug = lower(trim(coalesce(p_slug, ''))) and tp.activo;

  if v_emp is null then
    raise exception 'Esta página de reservas no está disponible.' using errcode = 'P0002';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Escribí tu nombre.' using errcode = '22023';
  end if;

  v_tel := trim(coalesce(p_telefono, ''));
  if char_length(v_tel) < 6 then
    raise exception 'Escribí un teléfono, para poder avisarte si pasa algo.' using errcode = '22023';
  end if;

  if exists (select 1 from public.turnos_bloqueo
             where empresa_id = v_emp and telefono = v_tel) then
    raise exception 'No se pueden tomar turnos con ese número. Comunicate con el local.'
      using errcode = '42501';
  end if;

  -- El candado, igual que en la puerta de adentro: serializa las reservas de
  -- esa persona para que dos clientes no se queden con el mismo horario.
  perform 1 from public.turnos_profesional
  where id = p_profesional and empresa_id = v_emp and activo
  for update;

  if not found then
    raise exception 'Esa persona no atiende en este local.' using errcode = 'P0002';
  end if;

  -- Tres pendientes por teléfono. Quien de verdad quiere cortarse no tiene
  -- cuatro turnos abiertos a la vez; quien está jugando, sí.
  select count(*)::int into v_pendientes
  from public.turnos_reserva
  where empresa_id = v_emp and cliente_telefono = v_tel
    and estado in ('pendiente', 'confirmada') and inicia > now();

  if v_pendientes >= 3 then
    raise exception 'Ya tenés varios turnos reservados. Cancelá alguno antes de tomar otro.'
      using errcode = '22023';
  end if;

  -- Y un minuto entre reserva y reserva desde el mismo número.
  if exists (
    select 1 from public.turnos_reserva
    where empresa_id = v_emp and cliente_telefono = v_tel
      and created_at > now() - interval '1 minute'
  ) then
    raise exception 'Esperá un momento antes de tomar otro turno.' using errcode = '22023';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas where id = v_emp;
  v_fecha := (p_inicia at time zone v_zona)::date;

  if p_inicia is null or v_fecha > public.hoy_empresa(v_emp) + 60 then
    raise exception 'Ese horario no está disponible.' using errcode = '23505';
  end if;

  select h.termina into v_fin
  from public.huecos_del_dia(p_profesional, v_fecha, p_producto) h
  where h.inicia = p_inicia;

  if v_fin is null then
    raise exception 'Ese horario ya no está disponible.' using errcode = '23505';
  end if;

  insert into public.turnos_reserva (
    empresa_id, profesional_id, producto_id, inicia, termina,
    cliente_nombre, cliente_telefono, origen
  )
  values (
    v_emp, p_profesional, p_producto, p_inicia, v_fin,
    left(trim(p_nombre), 80), left(v_tel, 40), 'publico'
  )
  returning id, token into v_id, v_token;

  -- Se devuelve el token porque es lo único que el cliente se lleva: su
  -- enlace para cancelar. Sin eso la agenda se llena de fantasmas.
  return jsonb_build_object('reserva', v_id, 'token', v_token,
                            'inicia', p_inicia, 'termina', v_fin);
end $fn$;

revoke all on function public.reservar_publico(text, uuid, uuid, timestamptz, text, text) from public;
grant execute on function public.reservar_publico(text, uuid, uuid, timestamptz, text, text) to anon, authenticated;

-- Cancelar también es público: es el enlace que el cliente guardó. Sin él la
-- agenda deja de ser confiable en dos semanas.
grant execute on function public.cancelar_reserva(uuid) to anon;

-- Ver la reserva propia con el token, para la pantalla de confirmación.
create or replace function public.reserva_por_token(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select jsonb_build_object(
    'existe',   true,
    'inicia',   r.inicia,
    'termina',  r.termina,
    'estado',   r.estado,
    'servicio', pr.nombre,
    'con',      p.nombre,
    'negocio',  coalesce(nullif(tp.titulo, ''), e.nombre),
    'cliente',  r.cliente_nombre
  ) into v_res
  from public.turnos_reserva r
  join public.productos pr on pr.id = r.producto_id
  join public.turnos_profesional p on p.id = r.profesional_id
  join public.empresas e on e.id = r.empresa_id
  left join public.turnos_publico tp on tp.empresa_id = r.empresa_id
  where r.token = p_token;

  return coalesce(v_res, jsonb_build_object('existe', false));
end $fn$;

revoke all on function public.reserva_por_token(uuid) from public;
grant execute on function public.reserva_por_token(uuid) to anon, authenticated;
