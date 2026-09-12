-- ============================================================
-- ORDEN · Migración 061 · Recomendar Orden desde adentro
--
-- La 060 dejó el programa de socios funcionando, pero con una sola puerta: la
-- administración cargaba a la persona a mano. El cuaderno del dueño dice otra
-- cosa, y es mejor:
--
--   «Cada usuario tendrá la opción de generar un extra comisionando,
--    recomendando Orden. Se le dará el 50% de lo que pagó el nuevo usuario.»
--   «El usuario que accedió para recomendar Orden tendrá un link para
--    compartir o un código.»
--
-- Así que el socio no es alguien de afuera que se carga a mano: es cualquier
-- usuario de Orden que pide su código. Esta migración abre esa puerta.
--
-- QUIÉN PUEDE RECOMENDAR
--
-- Cualquiera con cuenta, pague o no. Bloquearlo a los que ya pagan achicaría
-- el programa justo donde más sirve: el que está en la prueba y le encantó es
-- el que más habla del sistema esta semana. Lo que sí se sostiene es la otra
-- regla, que es la que protege la plata: nadie se trae a sí mismo, y la
-- comisión se paga a mano, mirándola.
--
-- POR QUÉ EL CÓDIGO SE PIDE Y NO SE REPARTE SOLO
--
-- Se podría crear un código para cada usuario al registrarse. No se hace: la
-- inmensa mayoría no va a recomendar nada, y quedarían miles de filas
-- muertas. El código nace cuando alguien entra a la pantalla y lo pide.
-- ============================================================

-- ------------------------------------------------------------
-- 1. MI CÓDIGO
--
--    Lo pide el usuario para sí mismo. Si ya lo tenía, se le devuelve el
--    mismo: el código no cambia nunca, porque puede estar pegado en un
--    mensaje que mandó hace dos meses.
--
--    Y si la administración ya lo había cargado a mano por su correo, es la
--    misma persona: se le pega la cuenta en vez de dejarle dos códigos
--    distintos y dos listas de referidos que nadie va a poder juntar después.
-- ------------------------------------------------------------
create or replace function public.mi_codigo_socio()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid     uuid := auth.uid();
  v_socio   public.socios;
  v_nombre  text;
  v_email   text;
  v_codigo  text;
  v_intento integer := 0;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios where user_id = v_uid;

  if v_socio.id is null then
    select lower(coalesce(u.email, '')) into v_email from auth.users u where u.id = v_uid;

    select * into v_socio from public.socios
    where user_id is null and email <> '' and email = v_email
    limit 1;

    if v_socio.id is not null then
      update public.socios set user_id = v_uid, updated_at = now() where id = v_socio.id;
    end if;
  end if;

  if v_socio.id is null then
    -- El nombre con el que se presentó en su negocio. Es el que va a
    -- reconocer cuando lo vea en la lista de socios.
    select m.nombre into v_nombre
    from public.miembros m
    where m.user_id = v_uid and coalesce(trim(m.nombre), '') <> ''
    order by m.created_at
    limit 1;

    loop
      v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      exit when not exists (select 1 from public.socios where codigo = v_codigo);
      v_intento := v_intento + 1;
      if v_intento > 20 then
        raise exception 'No se pudo generar el código. Probá de nuevo.' using errcode = '55000';
      end if;
    end loop;

    insert into public.socios (nombre, email, codigo, user_id, creado_por)
    values (
      left(coalesce(nullif(trim(v_nombre), ''), nullif(split_part(v_email, '@', 1), ''), 'Socio'), 80),
      left(coalesce(v_email, ''), 120), v_codigo, v_uid, v_uid
    )
    returning * into v_socio;
  end if;

  -- Desactivado no es un error a esconder: si alguien quedó afuera del
  -- programa tiene que enterarse, y no quedarse esperando una comisión.
  if not v_socio.activo then
    raise exception 'Tu código de recomendación está desactivado. Escribinos y lo vemos.'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'codigo',   v_socio.codigo,
    'nombre',   v_socio.nombre,
    'cobra_en', v_socio.cobra_en
  );
end $fn$;

revoke all on function public.mi_codigo_socio() from public, anon;
grant execute on function public.mi_codigo_socio() to authenticated;

-- ------------------------------------------------------------
-- 2. DÓNDE COBRO
--
--    El socio escribe su banco o su billetera. Es lo único suyo que puede
--    editar: el nombre y el correo salen de su cuenta, y el código no se
--    toca. Que lo escriba él ahorra el ida y vuelta de pedírselo por
--    WhatsApp justo cuando hay que transferirle.
-- ------------------------------------------------------------
create or replace function public.guardar_donde_cobro(p_cobra_en text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  update public.socios
  set cobra_en = left(coalesce(trim(p_cobra_en), ''), 200), updated_at = now()
  where user_id = v_uid
  returning id into v_id;

  if v_id is null then
    raise exception 'Todavía no pediste tu código de recomendación.' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.guardar_donde_cobro(text) from public, anon;
grant execute on function public.guardar_donde_cobro(text) to authenticated;

-- ------------------------------------------------------------
-- 3. MI PANEL DE RECOMENDADOS
--
--    Lo que el socio necesita ver, y nada más: a quiénes trajo, cuáles
--    llegaron a pagar, cuánto le van a dar y cuánto ya cobró.
--
--    NO devuelve un solo número de las finanzas del negocio que trajo. Ve el
--    nombre, si está pagando y la comisión que le toca —que sale de un pago
--    que él mismo generó—. Nada de lo que ese negocio vende, gasta o debe.
--
--    No crea nada: si todavía no pidió su código, contesta que no lo tiene.
--    Una lectura que escribe es una lectura que un día se llama dos veces.
-- ------------------------------------------------------------
create or replace function public.mi_panel_socio()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  v_socio public.socios;
  v_lista jsonb;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios where user_id = v_uid;

  if v_socio.id is null then
    return jsonb_build_object('tiene_codigo', false);
  end if;

  select coalesce(jsonb_agg(x order by x->>'desde' desc), '[]'::jsonb) into v_lista
  from (
    select jsonb_build_object(
      'negocio',  coalesce(e.nombre, 'Negocio borrado'),
      'desde',    r.created_at,
      'paga',     public.plan_efectivo_calculado(r.empresa_id) <> 'gratis',
      'plan',     public.plan_efectivo_calculado(r.empresa_id),
      'estado',   coalesce(c.estado, 'sin_pagar'),
      'monto',    coalesce(c.monto, 0),
      'cuando',   c.created_at,
      'pagada_at', c.pagada_at
    ) as x
    from public.referidos r
    left join public.empresas e on e.id = r.empresa_id
    left join public.comisiones c on c.empresa_id = r.empresa_id
    where r.socio_id = v_socio.id
  ) t;

  return jsonb_build_object(
    'tiene_codigo', true,
    'codigo',    v_socio.codigo,
    'nombre',    v_socio.nombre,
    'cobra_en',  v_socio.cobra_en,
    'activo',    v_socio.activo,
    'traidos',   (select count(*) from public.referidos r where r.socio_id = v_socio.id),
    'pagaron',   (select count(*) from public.comisiones c
                  where c.socio_id = v_socio.id and c.estado <> 'anulada'),
    'por_pagar', coalesce((select sum(c.monto) from public.comisiones c
                           where c.socio_id = v_socio.id and c.estado = 'por_pagar'), 0),
    'pagado',    coalesce((select sum(c.monto) from public.comisiones c
                           where c.socio_id = v_socio.id and c.estado = 'pagada'), 0),
    'referidos', v_lista
  );
end $fn$;

revoke all on function public.mi_panel_socio() from public, anon;
grant execute on function public.mi_panel_socio() to authenticated;

-- ------------------------------------------------------------
-- 4. ENTRAR CON EL CÓDIGO DE ALGUIEN
--
--    Lo llama el dueño de la cuenta recién creada, no la administración. Es
--    la otra mitad del link que comparte el socio.
--
--    LAS TRES PUERTAS QUE CIERRA
--
--    · El código es para cuentas NUEVAS. Pasados los 30 días ya no sirve: si
--      no, alguien reparte su código entre clientes que Orden ya tenía y
--      cobra por gente que no trajo.
--    · Una cuenta que ya pagó no se puede reclamar. El premio es por traer a
--      alguien, no por llegar primero a un cliente que ya estaba pagando.
--    · Nadie se trae a sí mismo, ni a un negocio donde trabaja.
--
--    Y si algo de eso falla, falla con un mensaje claro: esto lo llama una
--    persona que acaba de registrarse, y no puede quedarse pensando que su
--    cuenta se rompió.
-- ------------------------------------------------------------
create or replace function public.usar_codigo_referido(p_empresa uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_socio  public.socios;
  v_creada timestamptz;
  v_ya     uuid;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  -- Solo el dueño. Un vendedor no decide a nombre de quién queda el negocio
  -- donde trabaja.
  if not exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa and m.user_id = v_uid and m.rol = 'propietario'
  ) then
    raise exception 'Solo el dueño de la cuenta puede usar un código.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios
  where codigo = upper(trim(coalesce(p_codigo, '')));

  if v_socio.id is null then
    raise exception 'Ese código no existe. Revisalo con quien te lo pasó.' using errcode = '22023';
  end if;

  if not v_socio.activo then
    raise exception 'Ese código ya no está activo.' using errcode = '22023';
  end if;

  if v_socio.user_id = v_uid then
    raise exception 'Ese es tu propio código: no se gana comisión por uno mismo.'
      using errcode = '22023';
  end if;

  if v_socio.user_id is not null and exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa and m.user_id = v_socio.user_id
  ) then
    raise exception 'Esa persona trabaja en este negocio: no corresponde comisión.'
      using errcode = '22023';
  end if;

  select socio_id into v_ya from public.referidos where empresa_id = p_empresa;
  if v_ya is not null then
    if v_ya = v_socio.id then
      return jsonb_build_object('ok', true, 'socio', v_socio.nombre, 'repetido', true);
    end if;
    raise exception 'Esta cuenta ya entró con otro código.' using errcode = '22023';
  end if;

  select created_at into v_creada from public.empresas where id = p_empresa;
  if v_creada is null then
    raise exception 'Esa cuenta no existe.' using errcode = '22023';
  end if;

  if v_creada < now() - interval '30 days' then
    raise exception 'El código es para cuentas nuevas, y esta ya tiene más de un mes.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.registro_admin r
    where r.empresa_id = p_empresa and r.accion = 'cambiar_plan'
      and coalesce(r.detalle->>'ingreso_id', '') <> ''
  ) then
    raise exception 'Esta cuenta ya pagó, así que el código no corresponde.'
      using errcode = '22023';
  end if;

  insert into public.referidos (empresa_id, socio_id, origen, nota, creado_por)
  values (p_empresa, v_socio.id, 'link', '', v_uid);

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (v_uid, p_empresa, 'asignar_referido', jsonb_build_object(
    'socio_id', v_socio.id, 'socio', v_socio.nombre, 'codigo', v_socio.codigo,
    'origen', 'link'
  ));

  return jsonb_build_object('ok', true, 'socio', v_socio.nombre, 'repetido', false);
end $fn$;

revoke all on function public.usar_codigo_referido(uuid, text) from public, anon;
grant execute on function public.usar_codigo_referido(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 5. LA LISTA DEL ADMINISTRADOR, CON LO QUE FALTABA
--
--    Del cuaderno: «ver los usuarios que accedieron para ganar la comisión, a
--    cuántas personas hizo suscribir, cuánto le debería de dar por el 50%, y
--    en qué se suscribieron sus recomendados».
--
--    Lo que faltaba era lo último: el plan de cada negocio traído y si está
--    pagando. Sin eso, «trajo cuatro» no dice si trajo cuatro clientes o
--    cuatro cuentas gratis que nunca van a pagar.
-- ------------------------------------------------------------
create or replace function public.listar_referidos(p_limite integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id', r.empresa_id,
      'negocio',    coalesce(e.nombre, 'Negocio borrado'),
      'socio_id',   r.socio_id,
      'socio',      s.nombre,
      'codigo',     s.codigo,
      'origen',     r.origen,
      'nota',       r.nota,
      'desde',      r.created_at,
      'plan',       public.plan_efectivo_calculado(r.empresa_id),
      'paga',       public.plan_efectivo_calculado(r.empresa_id) <> 'gratis',
      'comision',   c.estado,
      'base',       c.base,
      'monto',      c.monto
    ) as x
    from public.referidos r
    join public.socios s on s.id = r.socio_id
    left join public.empresas e on e.id = r.empresa_id
    left join public.comisiones c on c.empresa_id = r.empresa_id
    limit greatest(1, least(coalesce(p_limite, 500), 2000))
  ) t;

  return v_res;
end $fn$;

revoke all on function public.listar_referidos(integer) from public, anon;
grant execute on function public.listar_referidos(integer) to authenticated;
