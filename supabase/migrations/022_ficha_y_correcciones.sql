-- ============================================================
-- ORDEN · Migración 022 · Ficha del cliente, deshacer y borrar
--
-- TRES COSAS QUE FALTABAN, Y LAS TRES APARECIERON USANDO EL PANEL DE VERDAD
--
-- 1. NO SE PODÍA DESHACER UNA ACTIVACIÓN. Se activó un plan por error sobre
--    una cuenta que todavía estaba en prueba, y el periodo de prueba se
--    perdió: quedó reemplazado por el mes pagado. Ninguna pantalla podía
--    devolverlo.
--
--    El arreglo sale gratis porque el registro de auditoría ya guardaba cómo
--    estaba todo ANTES de cada cambio. Estaba ahí para reclamos; resulta que
--    también sirve para deshacer. Un registro que solo se lee cuando hay un
--    problema es medio registro.
--
-- 2. NO SE PODÍA BORRAR UNA CUENTA. Y hacía falta: al borrar un usuario
--    desde el panel de Supabase, sus `miembros` se van por cascada y
--    `empresas.creada_por` queda en null — la empresa sobrevive **sin dueño
--    y sin nadie adentro**. Nadie puede entrar, nadie puede borrarla, y
--    ensucia la lista de clientes para siempre.
--
--    Pasó con dos cuentas de prueba. Va a volver a pasar cada vez que se
--    borre un usuario por fuera de la app.
--
-- 3. NO HABÍA DÓNDE ANOTAR QUIÉN ES EL CLIENTE. Había un botón para
--    escribirle por WhatsApp y ningún lugar donde guardar su teléfono. El
--    panel sabía todo del cobro y nada de la persona.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CÓMO NOS CONOCIÓ
--
--    Va en `empresas` y no en la ficha de abajo porque lo contesta la propia
--    persona al registrarse, no lo anota la administración. Preguntarlo en el
--    momento da un dato honesto; reconstruirlo después de memoria, no.
--
--    Es texto libre con una lista sugerida en la pantalla: encasillar a
--    alguien en cinco opciones fijas hace que la mitad elija «otro» y se
--    pierda justo lo que se quería saber.
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists como_nos_conocio text not null default '';

comment on column public.empresas.como_nos_conocio is
  'Lo contesta quien crea la cuenta. Texto libre: la pantalla sugiere opciones.';

-- ------------------------------------------------------------
-- 2. LA FICHA DEL CLIENTE
--
--    Datos de contacto y de seguimiento. Tabla aparte y no columnas en
--    `empresas` por una razón concreta: `empresas` la leen los miembros del
--    negocio, y las notas de seguimiento son de la administración. Nadie
--    tiene por qué leer lo que anotamos sobre él.
-- ------------------------------------------------------------
create table if not exists public.ficha_cliente (
  empresa_id  uuid primary key references public.empresas (id) on delete cascade,
  contacto    text not null default '',
  telefono    text not null default '',
  se_dedica   text not null default '',
  notas       text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.ficha_cliente enable row level security;

drop policy if exists ficha_cliente_select on public.ficha_cliente;
create policy ficha_cliente_select on public.ficha_cliente
  for select to authenticated
  using (public.es_superadmin());

revoke all on public.ficha_cliente from anon, authenticated;
grant select on public.ficha_cliente to authenticated;

create or replace function public.guardar_ficha_cliente(
  p_empresa   uuid,
  p_contacto  text default '',
  p_telefono  text default '',
  p_se_dedica text default '',
  p_notas     text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.empresas where id = p_empresa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  insert into public.ficha_cliente (empresa_id, contacto, telefono, se_dedica, notas, updated_at)
  values (p_empresa, left(coalesce(p_contacto, ''), 120), left(coalesce(p_telefono, ''), 40),
          left(coalesce(p_se_dedica, ''), 200), left(coalesce(p_notas, ''), 2000), now())
  on conflict (empresa_id) do update set
    contacto = excluded.contacto,
    telefono = excluded.telefono,
    se_dedica = excluded.se_dedica,
    notas = excluded.notas,
    updated_at = now();

  return jsonb_build_object('guardada', true);
end $fn$;

revoke all on function public.guardar_ficha_cliente(uuid, text, text, text, text) from public, anon;
grant execute on function public.guardar_ficha_cliente(uuid, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3. DESHACER EL ÚLTIMO CAMBIO
--
--    Restaura plan, estado y vencimiento a como estaban antes, leyéndolo del
--    registro de auditoría.
--
--    Si ese cambio había anotado un cobro, el ingreso NO se borra: se ANULA.
--    Es la misma regla que rige todo el sistema — un movimiento que existió
--    deja rastro aunque deje de sumar. Borrarlo dejaría un registro de
--    auditoría apuntando a algo que ya no está.
--
--    Solo deshace el ÚLTIMO cambio, y una sola vez. Deshacer en cadena
--    llevaría a estados que nunca existieron: el registro guarda «cómo
--    estaba antes de este cambio», no una línea de tiempo completa.
-- ------------------------------------------------------------
create or replace function public.deshacer_ultimo_cambio(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_reg     public.registro_admin;
  v_plan    text;
  v_estado  text;
  v_fin     timestamptz;
  v_ingreso uuid;
  v_anulado boolean := false;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_reg
  from public.registro_admin
  where empresa_id = p_empresa
    and accion in ('cambiar_plan', 'extender_prueba')
  order by created_at desc
  limit 1;

  if v_reg.id is null then
    raise exception 'No hay ningún cambio para deshacer en esta cuenta.' using errcode = 'P0002';
  end if;

  -- Ya se deshizo: sin esto, tocar dos veces dejaría el estado de dos
  -- cambios atrás, que es un estado que nunca existió.
  if coalesce((v_reg.detalle->>'deshecho')::boolean, false) then
    raise exception 'Ese cambio ya se deshizo.' using errcode = '22023';
  end if;

  v_plan   := coalesce(v_reg.detalle->>'plan_antes', 'pro');
  v_estado := coalesce(v_reg.detalle->>'estado_antes', 'prueba');
  v_fin    := nullif(v_reg.detalle->>'vence_antes', '')::timestamptz;

  update public.suscripciones
  set plan = v_plan,
      estado = v_estado,
      periodo_fin = v_fin,
      updated_at = now()
  where empresa_id = p_empresa;

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas
  set plan = case when v_plan = 'gratis' then 'gratis' else 'pro' end
  where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  -- El cobro que se había anotado, si lo hubo.
  v_ingreso := nullif(v_reg.detalle->>'ingreso_id', '')::uuid;
  if v_ingreso is not null then
    update public.movimientos
    set estado = 'anulado',
        anulado_por = auth.uid(),
        anulado_at = now(),
        motivo_anulacion = 'Se deshizo la activación desde el panel'
    where id = v_ingreso and estado = 'activo';
    v_anulado := found;
  end if;

  -- Se marca el registro para que no se pueda deshacer dos veces.
  update public.registro_admin
  set detalle = detalle || jsonb_build_object('deshecho', true, 'deshecho_at', now())
  where id = v_reg.id;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'deshacer', jsonb_build_object(
    'registro', v_reg.id,
    'volvio_a_plan', v_plan,
    'volvio_a_estado', v_estado,
    'volvio_a_vencer', v_fin,
    'ingreso_anulado', v_anulado
  ));

  return jsonb_build_object(
    'plan', v_plan, 'estado', v_estado, 'periodo_fin', v_fin,
    'ingreso_anulado', v_anulado
  );
end $fn$;

revoke all on function public.deshacer_ultimo_cambio(uuid) from public, anon;
grant execute on function public.deshacer_ultimo_cambio(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. QUÉ ARCHIVOS DEJARÍA UNA CUENTA AL BORRARSE
--
--    Se pide ANTES de borrar. Storage no entiende de claves foráneas: si no
--    se guardan las rutas primero, las fotos quedan ocupando lugar para
--    siempre y ya no hay ninguna fila que las nombre.
-- ------------------------------------------------------------
create or replace function public.archivos_de_cuenta(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(a.ruta)
    from public.adjuntos a
    where a.empresa_id = p_empresa and a.ruta is not null
  ), '[]'::jsonb);
end $fn$;

revoke all on function public.archivos_de_cuenta(uuid) from public, anon;
grant execute on function public.archivos_de_cuenta(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. BORRAR UNA CUENTA
--
--    Pide el nombre exacto escrito a mano. Es la misma barrera que usa
--    `vaciar_empresa()`, y por el mismo motivo: un botón rojo se toca por
--    curiosidad, escribir «Perfumeria Zurik» letra por letra no se hace sin
--    querer.
--
--    Lo que NO hace: borrar al usuario de `auth.users`. Esa persona puede
--    tener otra empresa, y además una cuenta de acceso no es lo mismo que un
--    negocio. Si además hay que borrar el usuario, se hace aparte y a
--    conciencia.
-- ------------------------------------------------------------
create or replace function public.borrar_cuenta(p_empresa uuid, p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre  text;
  v_movs    integer;
  v_persona integer;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select nombre into v_nombre from public.empresas where id = p_empresa;
  if v_nombre is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  if trim(coalesce(p_confirmacion, '')) <> v_nombre then
    raise exception 'Para borrar hay que escribir el nombre exacto: %', v_nombre
      using errcode = '22023';
  end if;

  select count(*) into v_movs from public.movimientos where empresa_id = p_empresa;
  select count(*) into v_persona from public.miembros where empresa_id = p_empresa;

  -- Se deja constancia ANTES de borrar: después la empresa ya no existe y
  -- `registro_admin.empresa_id` queda en null. El nombre va en el detalle
  -- para que el registro siga diciendo de quién se trataba.
  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'borrar_cuenta', jsonb_build_object(
    'nombre', v_nombre, 'movimientos', v_movs, 'personas', v_persona
  ));

  delete from public.empresas where id = p_empresa;

  return jsonb_build_object('borrada', true, 'nombre', v_nombre, 'movimientos', v_movs);
end $fn$;

revoke all on function public.borrar_cuenta(uuid, text) from public, anon;
grant execute on function public.borrar_cuenta(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 6. LA LISTA DE CUENTAS, CON LO NUEVO
--
--    Redefine `listar_cuentas()` de la 016 sumando la ficha, cómo nos
--    conoció, y —importante— si la cuenta quedó SIN DUEÑO.
--
--    Esa última bandera existe porque el caso es real y silencioso: borrar
--    un usuario desde Supabase deja la empresa viva y vacía. Antes se veía
--    como «sin correo» y parecía un dato que faltaba; ahora se dice lo que
--    es, para que se pueda limpiar.
--
--    Sigue sin devolver un solo monto de nadie. La prueba que lo comprueba
--    también.
-- ------------------------------------------------------------
create or replace function public.listar_cuentas(
  p_busqueda text default null,
  p_estado   text default null,
  p_limite   integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
  v_periodo text;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  v_periodo := to_char(now(), 'YYYY-MM');

  select coalesce(jsonb_agg(x order by x->>'orden'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id',   e.id,
      'nombre',       e.nombre,
      'tipo_cuenta',  e.tipo_cuenta,
      'rubro',        e.rubro,
      'moneda',       e.moneda,
      'creada',       e.created_at,
      'propietario',  coalesce(prop.nombre, ''),
      'correo',       coalesce(u.email, ''),
      'sin_duenio',   prop.id is null,
      'como_nos_conocio', e.como_nos_conocio,

      'contacto',  coalesce(f.contacto, ''),
      'telefono',  coalesce(f.telefono, ''),
      'se_dedica', coalesce(f.se_dedica, ''),
      'notas',     coalesce(f.notas, ''),

      'plan',         public.plan_efectivo_calculado(e.id),
      'plan_guardado', s.plan,
      'estado',       s.estado,
      'periodo_fin',  s.periodo_fin,
      'prueba_fin',   s.prueba_fin,
      'dias_restantes', case
        when s.periodo_fin is null then null
        else floor(extract(epoch from (s.periodo_fin - now())) / 86400)::integer
      end,
      'miembros', (select count(*) from public.miembros m where m.empresa_id = e.id),
      'movimientos', (select count(*) from public.movimientos mv where mv.empresa_id = e.id),
      'ultima_actividad', (select max(mv.created_at) from public.movimientos mv where mv.empresa_id = e.id),
      'ia_usada', coalesce((
        select ui.usados from public.uso_ia ui
        where ui.empresa_id = e.id and ui.periodo = v_periodo
      ), 0),
      'ia_tope', (public.limites_plan(public.plan_efectivo_calculado(e.id))->>'capturas_mes')::integer,
      'puede_deshacer', exists (
        select 1 from public.registro_admin r
        where r.empresa_id = e.id
          and r.accion in ('cambiar_plan', 'extender_prueba')
          and not coalesce((r.detalle->>'deshecho')::boolean, false)
      ),
      'orden', lpad(
        greatest(0, coalesce(
          floor(extract(epoch from (s.periodo_fin - now())) / 86400)::integer + 1000,
          9999))::text, 5, '0')
    ) as x
    from public.empresas e
    join public.suscripciones s on s.empresa_id = e.id
    left join public.miembros prop
      on prop.empresa_id = e.id and prop.rol = 'propietario'
    left join auth.users u on u.id = prop.user_id
    left join public.ficha_cliente f on f.empresa_id = e.id
    where (
        p_busqueda is null
        or trim(p_busqueda) = ''
        or e.nombre ilike '%' || trim(p_busqueda) || '%'
        or coalesce(u.email, '') ilike '%' || trim(p_busqueda) || '%'
        or coalesce(f.contacto, '') ilike '%' || trim(p_busqueda) || '%'
        or coalesce(f.telefono, '') ilike '%' || trim(p_busqueda) || '%'
      )
      and (p_estado is null or trim(p_estado) = '' or s.estado = p_estado)
    limit greatest(1, least(coalesce(p_limite, 200), 500))
  ) t;

  return v_res;
end $fn$;

revoke all on function public.listar_cuentas(text, text, integer) from public, anon;
grant execute on function public.listar_cuentas(text, text, integer) to authenticated;

-- ------------------------------------------------------------
-- 7. CREAR EMPRESA · ahora también guarda cómo nos conoció
-- ------------------------------------------------------------
create or replace function public.crear_empresa(
  p_nombre text,
  p_moneda text default 'PYG',
  p_nombre_usuario text default null,
  p_zona text default 'America/Asuncion',
  p_tipo_cuenta text default 'emprendedor',
  p_rubro text default 'comercio',
  p_como_nos_conocio text default ''
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_codigo text;
  v_intentos int := 0;
  v_fin timestamptz;
  v_tipo text;
  v_rubro text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre del negocio es muy corto.' using errcode = '22023';
  end if;

  v_tipo := case when p_tipo_cuenta = 'personal' then 'personal' else 'emprendedor' end;
  v_rubro := case
    when v_tipo = 'personal' then 'comercio'
    when p_rubro in ('comercio', 'ganaderia', 'agricultura', 'servicios') then p_rubro
    else 'comercio'
  end;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresa_accesos where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código de acceso.' using errcode = '55000';
    end if;
  end loop;

  insert into public.empresas (
    nombre, moneda, creada_por, zona_horaria, tipo_cuenta, rubro, como_nos_conocio
  )
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), auth.uid(),
          coalesce(nullif(trim(p_zona), ''), 'America/Asuncion'), v_tipo, v_rubro,
          left(coalesce(p_como_nos_conocio, ''), 80))
  returning id into v_id;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Propietario'), 'propietario');

  insert into public.empresa_accesos (empresa_id, codigo)
  values (v_id, v_codigo);

  v_fin := now() + make_interval(days => public.dias_de_prueba(v_tipo));
  insert into public.suscripciones (empresa_id, plan, estado, periodo_inicio, periodo_fin, prueba_fin)
  values (v_id, 'pro', 'prueba', now(), v_fin, v_fin);

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = 'pro' where id = v_id;
  perform set_config('orden.suscripcion_confiable', '0', true);

  return v_id;
end $fn$;

drop function if exists public.crear_empresa(text, text, text, text, text, text);

revoke all on function public.crear_empresa(text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.crear_empresa(text, text, text, text, text, text, text)
  to authenticated;
