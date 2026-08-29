-- ORDEN · Migración 023 · El registro pregunta quién es la persona
--
-- Hasta acá el orden del registro era: correo y contraseña primero, datos
-- después. Está al revés por dos motivos.
--
-- El primero es de quien se registra: la primera pantalla de un producto que
-- no conoce le pedía una contraseña. Es la peor pregunta para arrancar —
-- todavía no sabe si le sirve y ya le estás pidiendo que se comprometa.
--
-- El segundo es del negocio: el teléfono y a qué se dedica se preguntaban en
-- el panel, o sea NUNCA, porque había que preguntárselo por WhatsApp uno por
-- uno. Se pregunta en el registro o no se sabe.
--
-- La ficha la escribe `crear_empresa`, no la persona. La tabla sigue sin
-- permisos de escritura para nadie: se llena una vez, por esta función, y
-- después solo la administración de Orden la puede tocar. Alguien registrando
-- su negocio no tiene por qué poder editar la ficha de otro.

create or replace function public.crear_empresa(
  p_nombre text,
  p_moneda text default 'PYG',
  p_nombre_usuario text default null,
  p_zona text default 'America/Asuncion',
  p_tipo_cuenta text default 'emprendedor',
  p_rubro text default 'comercio',
  p_como_nos_conocio text default '',
  p_telefono text default '',
  p_se_dedica text default ''
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_codigo text;
  v_intentos int := 0;
  v_fin timestamptz;
  v_tipo text;
  v_rubro text;
  v_contacto text;
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
    else 'comercio' end;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresa_accesos where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código de acceso.' using errcode = '55000';
    end if;
  end loop;

  insert into public.empresas (
    nombre, moneda, creada_por, zona_horaria, tipo_cuenta, rubro, como_nos_conocio)
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), auth.uid(),
          coalesce(nullif(trim(p_zona), ''), 'America/Asuncion'), v_tipo, v_rubro,
          left(coalesce(p_como_nos_conocio, ''), 80))
  returning id into v_id;

  v_contacto := nullif(trim(coalesce(p_nombre_usuario, '')), '');

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(v_contacto, 'Propietario'), 'propietario');

  insert into public.empresa_accesos (empresa_id, codigo) values (v_id, v_codigo);

  -- La ficha solo se crea si contestó algo. Una fila con los tres campos
  -- vacíos no es un dato, es ruido en la lista de clientes.
  if v_contacto is not null
     or nullif(trim(coalesce(p_telefono, '')), '') is not null
     or nullif(trim(coalesce(p_se_dedica, '')), '') is not null then
    insert into public.ficha_cliente (empresa_id, contacto, telefono, se_dedica, updated_at)
    values (v_id,
            left(coalesce(v_contacto, ''), 120),
            left(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), 40),
            left(coalesce(trim(p_se_dedica), ''), 200),
            now())
    on conflict (empresa_id) do nothing;
  end if;

  v_fin := now() + make_interval(days => public.dias_de_prueba(v_tipo));
  insert into public.suscripciones (empresa_id, plan, estado, periodo_inicio, periodo_fin, prueba_fin)
  values (v_id, 'pro', 'prueba', now(), v_fin, v_fin);

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = 'pro' where id = v_id;
  perform set_config('orden.suscripcion_confiable', '0', true);

  return v_id;
end $fn$;

drop function if exists public.crear_empresa(text, text, text, text, text, text, text);

revoke all on function public.crear_empresa(text, text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.crear_empresa(text, text, text, text, text, text, text, text, text)
  to authenticated;
