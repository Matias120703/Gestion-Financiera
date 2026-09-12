-- ============================================================
-- ORDEN · Migración 060 · Socios que traen clientes, y sus comisiones
--
-- La idea, tal como la escribió el dueño: cualquiera puede ganar plata
-- trayendo clientes nuevos a Orden, sin ser empleado ni tener que vender.
--
--   · La comisión es el 50% del PRIMER pago del referido.
--   · Se paga UNA SOLA VEZ. Lo que el cliente pague después es todo del
--     negocio, para siempre.
--   · Se gana cuando el cliente paga DE VERDAD, no cuando crea una cuenta
--     gratis. Por eso la comisión nace pegada al ingreso de Orden: si no
--     entró plata, no hay comisión.
--   · Se calcula sobre lo que realmente entró, no sobre el precio de lista.
--     Así los vendedores extra del Premium salen solos, y un descuento baja
--     la comisión en la misma proporción, sin tablas que mantener.
--
-- LO QUE NO SE VUELVE A CALCULAR NUNCA
--
-- Si después el negocio crece, sube de plan o suma vendedores, eso ya no le
-- toca a quien lo trajo. Sin esa regla habría que recalcular comisiones
-- viejas para siempre, y ese es el tipo de cuenta que termina mal.
--
-- SE PAGA A MANO
--
-- La comisión nace «por pagar». El dueño transfiere y la marca pagada desde
-- el panel, con el medio y una nota. El monto se puede ajustar al marcarla:
-- si alguien pagó un año por adelantado, la mitad de ese pago es mucha
-- plata, y esa decisión es de una persona, no de una fórmula.
--
-- El cuerpo de cambiar_plan_cuenta se extrajo de la 048 con un script y se
-- le agregó solo la parte marcada con (060).
-- ============================================================

-- ------------------------------------------------------------
-- 1. LOS SOCIOS
--
--    Quien trae clientes. No necesita cuenta en Orden: la mayoría no va a
--    usar el sistema, solo conoce negocios a los que les sirve.
-- ------------------------------------------------------------
create table if not exists public.socios (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (char_length(trim(nombre)) between 1 and 80),
  telefono   text not null default '' check (char_length(telefono) <= 40),
  email      text not null default '' check (char_length(email) <= 120),
  -- Lo que comparte para que le atribuyan los clientes que trae.
  codigo     text not null unique,
  -- Si tiene cuenta en Orden. Sirve para una sola cosa: que nadie se
  -- refiera a sí mismo.
  user_id    uuid references auth.users (id) on delete set null,
  activo     boolean not null default true,
  -- Cómo se le paga: banco, billetera, alias. Texto libre a propósito.
  cobra_en   text not null default '' check (char_length(cobra_en) <= 200),
  notas      text not null default '' check (char_length(notas) <= 500),
  creado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. QUIÉN TRAJO A QUIÉN
--
--    Un negocio tiene un solo socio, y para siempre: la clave primaria es la
--    empresa. Si mañana otro dice «yo también lo traje», contesta la base y
--    no hay que discutirlo con nadie.
-- ------------------------------------------------------------
create table if not exists public.referidos (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  socio_id   uuid not null references public.socios (id) on delete restrict,
  origen     text not null default 'a_mano' check (origen in ('link', 'a_mano')),
  nota       text not null default '' check (char_length(nota) <= 300),
  creado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists referidos_socio_idx on public.referidos (socio_id);

-- ------------------------------------------------------------
-- 3. LAS COMISIONES
--
--    Una por negocio. Ese índice único es lo que hace que «se paga una sola
--    vez» sea una propiedad de la base y no una intención.
-- ------------------------------------------------------------
create table if not exists public.comisiones (
  id            uuid primary key default gen_random_uuid(),
  socio_id      uuid not null references public.socios (id) on delete restrict,
  empresa_id    uuid not null unique references public.empresas (id) on delete cascade,
  -- El ingreso de Orden que la originó. Si se anula, la comisión se cae.
  movimiento_id uuid references public.movimientos (id) on delete set null,
  -- Y el gasto de Orden al pagarla. Pagar una comisión no es contabilidad
  -- aparte: es plata que salió, y tiene que verse en las finanzas de Orden.
  gasto_id      uuid references public.movimientos (id) on delete set null,
  base          numeric(14,2) not null check (base >= 0),
  porcentaje    numeric(5,2) not null check (porcentaje > 0 and porcentaje <= 100),
  monto         numeric(14,2) not null check (monto >= 0),
  estado        text not null default 'por_pagar' check (estado in ('por_pagar', 'pagada', 'anulada')),
  pagada_at     timestamptz,
  medio         text not null default '' check (char_length(medio) <= 60),
  nota          text not null default '' check (char_length(nota) <= 300),
  created_at    timestamptz not null default now()
);

create index if not exists comisiones_socio_idx on public.comisiones (socio_id, estado);

-- ------------------------------------------------------------
-- 4. QUIÉN VE ESTO
--
--    Nadie, salvo la administración de Orden, y siempre por función. Un
--    cliente no tiene por qué saber que existe un programa de socios, ni
--    cuánto se le paga a quien lo trajo.
-- ------------------------------------------------------------
alter table public.socios     enable row level security;
alter table public.referidos  enable row level security;
alter table public.comisiones enable row level security;

revoke all on public.socios     from anon, authenticated;
revoke all on public.referidos  from anon, authenticated;
revoke all on public.comisiones from anon, authenticated;

-- ------------------------------------------------------------
-- 5. EL PORCENTAJE, EN UN SOLO LUGAR
--
--    Si algún día deja de ser el 50%, se cambia acá y no en cinco lugares.
--    Las comisiones ya creadas guardan el suyo: cambiar el número de hoy no
--    puede reescribir lo que se le prometió a alguien el mes pasado.
-- ------------------------------------------------------------
alter table public.ajustes_orden
  add column if not exists comision_porcentaje numeric(5,2) not null default 50;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ajustes_orden_comision_rango') then
    alter table public.ajustes_orden
      add constraint ajustes_orden_comision_rango
      check (comision_porcentaje > 0 and comision_porcentaje <= 100);
  end if;
end $$;

-- ------------------------------------------------------------
-- 6. EL COBRO, QUE AHORA GENERA LA COMISIÓN
--
--    Misma firma que en la 048: se reemplaza sin tocar a quien ya la llama.
-- ------------------------------------------------------------
create or replace function public.cambiar_plan_cuenta(
  p_empresa    uuid,
  p_plan       text,
  p_meses      integer default 1,
  p_nota       text default '',
  p_importe    numeric default null,
  p_vendedores integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes    public.suscripciones;
  v_fin      timestamptz;
  v_estado   text;
  v_orden    uuid;
  v_cliente  text;
  v_ingreso  uuid;
  v_aviso    text := null;
  v_tope     integer;
  v_personas integer;
  v_socio    uuid;
  v_pct      numeric;
  v_comision boolean := false;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  if p_plan not in ('gratis', 'pro', 'negocio') then
    raise exception 'Plan desconocido: %', p_plan using errcode = '22023';
  end if;

  if p_vendedores is not null and p_vendedores < -1 then
    raise exception 'El tope de vendedores no puede ser negativo.' using errcode = '22023';
  end if;

  select * into v_antes from public.suscripciones where empresa_id = p_empresa;
  if v_antes.empresa_id is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  select nombre into v_cliente from public.empresas where id = p_empresa;

  if p_plan = 'gratis' then
    v_estado := 'vencida';
    v_fin := now();
    -- Cortar el servicio borra el trato: si vuelve, se negocia de nuevo.
    v_tope := null;
  else
    v_estado := 'activa';
    -- Si todavía le queda tiempo pago, se le suma; si no, arranca hoy.
    v_fin := greatest(coalesce(v_antes.periodo_fin, now()), now())
             + make_interval(months => greatest(1, coalesce(p_meses, 1)));
    v_tope := case
      when p_vendedores is null then v_antes.tope_vendedores  -- no se toca
      when p_vendedores = -1    then null                     -- volver al plan
      else p_vendedores
    end;
  end if;

  update public.suscripciones
  set plan = p_plan,
      estado = v_estado,
      periodo_inicio = case when p_plan = 'gratis' then periodo_inicio else now() end,
      periodo_fin = v_fin,
      tope_vendedores = v_tope,
      proveedor_pago = case when p_plan = 'gratis' then proveedor_pago else 'transferencia' end,
      updated_at = now()
  where empresa_id = p_empresa;

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas
  set plan = case when p_plan = 'gratis' then 'gratis' else 'pro' end
  where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  -- ---- ¿le queda gente afuera del tope nuevo? ----
  --
  -- No se echa a nadie: bajar un número en un panel no puede sacarle el
  -- acceso a una persona que hoy está trabajando. Pero hay que decirlo, o
  -- el que lo bajó se entera cuando el cliente reclama.
  if v_tope is not null then
    select count(*)::int into v_personas from public.miembros where empresa_id = p_empresa;
    if v_personas > v_tope + 1 then
      v_aviso := 'Ojo: este negocio ya tiene ' || v_personas || ' personas y le habilitaste '
              || v_tope || ' vendedores (' || (v_tope + 1) || ' con el dueño). '
              || 'No se sacó a nadie, pero no va a poder sumar a nadie más.';
    end if;
  end if;

  -- ---- el cobro, como ingreso de Orden ----
  if p_plan <> 'gratis' and coalesce(p_importe, 0) > 0 then
    select empresa_id into v_orden from public.ajustes_orden where unica;

    if v_orden is null then
      v_aviso := coalesce(v_aviso || ' ', '')
              || 'No hay una empresa de Orden elegida, así que el cobro no se anotó en tus finanzas.';
    elsif v_orden = p_empresa then
      v_aviso := coalesce(v_aviso || ' ', '')
              || 'Esta ES tu empresa, así que no se anotó ningún ingreso.';
    else
      begin
        insert into public.movimientos (
          empresa_id, tipo, estado, fecha, descripcion, categoria,
          subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por
        ) values (
          v_orden, 'ingreso', 'activo', public.hoy_empresa(v_orden),
          'Suscripción ' || coalesce(v_cliente, 'cliente'), 'Suscripciones',
          p_importe, 0, p_importe, 0, 'transferencia',
          left(coalesce(v_cliente, ''), 80), auth.uid()
        )
        returning id into v_ingreso;
      exception when others then
        v_aviso := coalesce(v_aviso || ' ', '')
                || 'La cuenta se activó, pero el ingreso no se pudo anotar: ' || sqlerrm;
      end;
    end if;
  end if;

  -- ---- la comisión de quien trajo al cliente (060) ----
  -- Nace en el mismo momento en que entra la plata, y una sola vez por
  -- negocio: lo garantiza el índice único de comisiones, no el acordarse.
  -- Si el ingreso no se pudo anotar, no hay comisión: se paga por plata
  -- que entró, no por una cuenta activada.
  if v_ingreso is not null then
    select r.socio_id into v_socio
    from public.referidos r
    join public.socios s on s.id = r.socio_id
    where r.empresa_id = p_empresa and s.activo;

    if v_socio is not null then
      select coalesce(a.comision_porcentaje, 50) into v_pct
      from public.ajustes_orden a where a.unica;

      begin
        insert into public.comisiones (
          socio_id, empresa_id, movimiento_id, base, porcentaje, monto
        ) values (
          v_socio, p_empresa, v_ingreso, p_importe, coalesce(v_pct, 50),
          round(p_importe * coalesce(v_pct, 50) / 100)
        );
        v_comision := true;
      exception when unique_violation then
        -- Ya cobró por este negocio. Se paga una sola vez: el primer pago.
        null;
      end;
    end if;
  end if;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'cambiar_plan', jsonb_build_object(
    'plan_antes', v_antes.plan, 'plan_despues', p_plan,
    'estado_antes', v_antes.estado, 'estado_despues', v_estado,
    'vence_antes', v_antes.periodo_fin, 'vence_despues', v_fin,
    'meses', greatest(1, coalesce(p_meses, 1)),
    'importe', p_importe,
    'tope_antes', v_antes.tope_vendedores,
    'tope_despues', v_tope,
    'ingreso_id', v_ingreso,
    'nota', left(coalesce(p_nota, ''), 300)
  ));

  return jsonb_build_object(
    'plan', p_plan, 'estado', v_estado, 'periodo_fin', v_fin,
    'tope_vendedores', v_tope,
    'personas_permitidas', public.tope_de_miembros(p_empresa),
    'ingreso_anotado', v_ingreso is not null,
    'comision_generada', v_comision,
    'aviso', v_aviso
  );
end $fn$;


-- ------------------------------------------------------------
-- 7. DAR DE ALTA (O EDITAR) UN SOCIO
--
--    El código se genera una sola vez y no cambia nunca más: puede estar
--    escrito en un WhatsApp que esa persona mandó hace dos meses.
--
--    Si el email coincide con un usuario de Orden, se guarda el vínculo. No
--    sirve para entrar a ningún lado todavía; sirve para una sola cosa: que
--    nadie cobre comisión por traerse a sí mismo.
-- ------------------------------------------------------------
create or replace function public.guardar_socio(
  p_socio    uuid default null,
  p_nombre   text default '',
  p_telefono text default '',
  p_email    text default '',
  p_cobra_en text default '',
  p_notas    text default '',
  p_activo   boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id      uuid;
  v_codigo  text;
  v_user    uuid;
  v_email   text;
  v_intento integer := 0;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre de la persona.' using errcode = '22023';
  end if;

  v_email := left(lower(coalesce(trim(p_email), '')), 120);

  if v_email <> '' then
    select u.id into v_user from auth.users u where lower(u.email) = v_email limit 1;
  end if;

  if p_socio is null then
    loop
      v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      exit when not exists (select 1 from public.socios where codigo = v_codigo);
      v_intento := v_intento + 1;
      if v_intento > 20 then
        raise exception 'No se pudo generar el código. Probá de nuevo.' using errcode = '22023';
      end if;
    end loop;

    insert into public.socios (
      nombre, telefono, email, codigo, user_id, cobra_en, notas, activo, creado_por
    ) values (
      left(trim(p_nombre), 80), left(coalesce(trim(p_telefono), ''), 40), v_email,
      v_codigo, v_user, left(coalesce(trim(p_cobra_en), ''), 200),
      left(coalesce(trim(p_notas), ''), 500), coalesce(p_activo, true), auth.uid()
    )
    returning id, codigo into v_id, v_codigo;
  else
    update public.socios set
      nombre     = left(trim(p_nombre), 80),
      telefono   = left(coalesce(trim(p_telefono), ''), 40),
      email      = v_email,
      user_id    = coalesce(v_user, user_id),
      cobra_en   = left(coalesce(trim(p_cobra_en), ''), 200),
      notas      = left(coalesce(trim(p_notas), ''), 500),
      activo     = coalesce(p_activo, true),
      updated_at = now()
    where id = p_socio
    returning id, codigo into v_id, v_codigo;

    if v_id is null then
      raise exception 'Ese socio no existe.' using errcode = '22023';
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end $fn$;

revoke all on function public.guardar_socio(uuid, text, text, text, text, text, boolean)
  from public, anon;
grant execute on function public.guardar_socio(uuid, text, text, text, text, text, boolean)
  to authenticated;

-- ------------------------------------------------------------
-- 8. ANOTAR QUIÉN TRAJO A UN NEGOCIO
--
--    Se anota una vez y no se cambia. Si dos personas dicen haber traído al
--    mismo cliente, contesta la base con el nombre del que ya está anotado, y
--    no hay que resolverlo de memoria ni por orden de reclamo.
--
--    Si el negocio ya había pagado antes de anotarlo, se avisa: ese primer
--    pago ya pasó, y la comisión se va a generar con el próximo cobro. Es
--    información para decidir el monto a mano, no un error que frene nada.
-- ------------------------------------------------------------
create or replace function public.asignar_referido(
  p_empresa uuid,
  p_codigo  text,
  p_nota    text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_socio public.socios;
  v_ya    uuid;
  v_pagos integer;
  v_aviso text := null;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios
  where codigo = upper(trim(coalesce(p_codigo, '')));

  if v_socio.id is null then
    raise exception 'No hay ningún socio con ese código.' using errcode = '22023';
  end if;

  if not v_socio.activo then
    raise exception '% está desactivado como socio.', v_socio.nombre using errcode = '22023';
  end if;

  if not exists (select 1 from public.empresas where id = p_empresa) then
    raise exception 'Ese negocio no existe.' using errcode = '22023';
  end if;

  if v_socio.user_id is not null and exists (
    select 1 from public.miembros m
    where m.empresa_id = p_empresa and m.user_id = v_socio.user_id
  ) then
    raise exception
      '% trabaja en ese negocio: no se cobra comisión por traerse a uno mismo.',
      v_socio.nombre using errcode = '22023';
  end if;

  select socio_id into v_ya from public.referidos where empresa_id = p_empresa;

  if v_ya is not null then
    if v_ya = v_socio.id then
      return jsonb_build_object(
        'ok', true, 'socio', v_socio.nombre,
        'aviso', 'Ya estaba anotado a nombre de ' || v_socio.nombre || '.'
      );
    end if;
    raise exception
      'Ese negocio ya está anotado a nombre de %. Se cuenta una sola vez y no se cambia.',
      coalesce((select nombre from public.socios where id = v_ya), 'otra persona')
      using errcode = '22023';
  end if;

  select count(*)::int into v_pagos
  from public.registro_admin r
  where r.empresa_id = p_empresa
    and r.accion = 'cambiar_plan'
    and coalesce(r.detalle->>'ingreso_id', '') <> '';

  if v_pagos > 0 then
    v_aviso := 'Ojo: este negocio ya pagó ' || v_pagos
            || (case when v_pagos = 1 then ' vez' else ' veces' end)
            || ' antes de anotarlo. La comisión no se genera por esos pagos, sino con el próximo cobro. Revisá el monto antes de pagarla.';
  end if;

  insert into public.referidos (empresa_id, socio_id, origen, nota, creado_por)
  values (p_empresa, v_socio.id, 'a_mano', left(coalesce(p_nota, ''), 300), auth.uid());

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'asignar_referido', jsonb_build_object(
    'socio_id', v_socio.id, 'socio', v_socio.nombre, 'codigo', v_socio.codigo,
    'pagos_previos', v_pagos
  ));

  return jsonb_build_object('ok', true, 'socio', v_socio.nombre, 'aviso', v_aviso);
end $fn$;

revoke all on function public.asignar_referido(uuid, text, text) from public, anon;
grant execute on function public.asignar_referido(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 9. DESANOTARLO, SI FUE UN ERROR
--
--    Solo mientras no haya plata de por medio. Si ya se le pagó la comisión,
--    borrar el vínculo sería borrar el por qué de un gasto real.
-- ------------------------------------------------------------
create or replace function public.quitar_referido(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_socio uuid;
  v_est   text;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select socio_id into v_socio from public.referidos where empresa_id = p_empresa;
  if v_socio is null then
    raise exception 'Ese negocio no está anotado a nombre de nadie.' using errcode = '22023';
  end if;

  select estado into v_est from public.comisiones where empresa_id = p_empresa;

  if v_est = 'pagada' then
    raise exception
      'Ya se pagó la comisión por ese negocio, así que no se puede desanotar.'
      using errcode = '22023';
  end if;

  if v_est = 'por_pagar' then
    raise exception
      'Hay una comisión por pagar por ese negocio. Anulala primero y después desanotalo.'
      using errcode = '22023';
  end if;

  delete from public.referidos where empresa_id = p_empresa;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'quitar_referido',
          jsonb_build_object('socio_id', v_socio));

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.quitar_referido(uuid) from public, anon;
grant execute on function public.quitar_referido(uuid) to authenticated;

-- ------------------------------------------------------------
-- 10. LA LISTA DE SOCIOS
--
--     Con lo único que importa mirar de un socio: a cuántos trajo, cuántos
--     de esos pagaron, cuánto se le debe y cuánto ya se le pagó.
-- ------------------------------------------------------------
create or replace function public.listar_socios(
  p_busqueda text default null,
  p_limite   integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'id',        s.id,
      'nombre',    s.nombre,
      'telefono',  s.telefono,
      'email',     s.email,
      'codigo',    s.codigo,
      'activo',    s.activo,
      'cobra_en',  s.cobra_en,
      'notas',     s.notas,
      'tiene_cuenta', s.user_id is not null,
      'creado',    s.created_at,
      'traidos',   (select count(*) from public.referidos r where r.socio_id = s.id),
      'pagaron',   (select count(*) from public.comisiones c
                    where c.socio_id = s.id and c.estado <> 'anulada'),
      'por_pagar', coalesce((select sum(c.monto) from public.comisiones c
                             where c.socio_id = s.id and c.estado = 'por_pagar'), 0),
      'pagado',    coalesce((select sum(c.monto) from public.comisiones c
                             where c.socio_id = s.id and c.estado = 'pagada'), 0)
    ) as x
    from public.socios s
    where (
        p_busqueda is null
        or trim(p_busqueda) = ''
        or s.nombre ilike '%' || trim(p_busqueda) || '%'
        or s.codigo ilike '%' || trim(p_busqueda) || '%'
        or s.telefono ilike '%' || trim(p_busqueda) || '%'
        or s.email ilike '%' || trim(p_busqueda) || '%'
      )
    order by s.nombre
    limit greatest(1, least(coalesce(p_limite, 200), 500))
  ) t;

  return v_res;
end $fn$;

revoke all on function public.listar_socios(text, integer) from public, anon;
grant execute on function public.listar_socios(text, integer) to authenticated;

-- ------------------------------------------------------------
-- 11. LAS COMISIONES
--
--     Para la pantalla de por pagar: quién, por qué negocio, sobre cuánto, y
--     dónde cobra. Con el aviso de si el ingreso que la originó terminó
--     anulado, que es el caso en el que no hay que transferir nada.
-- ------------------------------------------------------------
create or replace function public.listar_comisiones(
  p_estado text default null,
  p_socio  uuid default null,
  p_limite integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x->>'creado' desc), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'id',         c.id,
      'socio_id',   c.socio_id,
      'socio',      s.nombre,
      'telefono',   s.telefono,
      'cobra_en',   s.cobra_en,
      'empresa_id', c.empresa_id,
      'negocio',    coalesce(e.nombre, 'Negocio borrado'),
      'base',       c.base,
      'porcentaje', c.porcentaje,
      'monto',      c.monto,
      'estado',     c.estado,
      'creado',     c.created_at,
      'pagada_at',  c.pagada_at,
      'medio',      c.medio,
      'nota',       c.nota,
      -- estado es un enum: se compara como texto o revienta con el coalesce.
      'ingreso_anulado', coalesce(mv.estado::text, '') = 'anulado'
    ) as x
    from public.comisiones c
    join public.socios s on s.id = c.socio_id
    left join public.empresas e on e.id = c.empresa_id
    left join public.movimientos mv on mv.id = c.movimiento_id
    where (p_estado is null or trim(p_estado) = '' or c.estado = p_estado)
      and (p_socio is null or c.socio_id = p_socio)
    order by c.created_at desc
    limit greatest(1, least(coalesce(p_limite, 200), 500))
  ) t;

  return v_res;
end $fn$;

revoke all on function public.listar_comisiones(text, uuid, integer) from public, anon;
grant execute on function public.listar_comisiones(text, uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- 11 bis. QUIÉN TRAJO A CADA NEGOCIO
--
--        Para la ficha de cada cliente en el panel: una sola consulta para
--        toda la lista, en vez de una por cada ficha que se abre.
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
      'socio_id',   r.socio_id,
      'socio',      s.nombre,
      'codigo',     s.codigo,
      'origen',     r.origen,
      'nota',       r.nota,
      'desde',      r.created_at,
      'comision',   c.estado,
      'monto',      c.monto
    ) as x
    from public.referidos r
    join public.socios s on s.id = r.socio_id
    left join public.comisiones c on c.empresa_id = r.empresa_id
    limit greatest(1, least(coalesce(p_limite, 500), 2000))
  ) t;

  return v_res;
end $fn$;

revoke all on function public.listar_referidos(integer) from public, anon;
grant execute on function public.listar_referidos(integer) to authenticated;

-- ------------------------------------------------------------
-- 12. MARCARLA PAGADA
--
--     El monto se puede ajustar acá, y a propósito: si un negocio pagó un
--     año por adelantado, la mitad de ese pago es mucha plata, y esa
--     decisión es de una persona mirando el caso, no de una fórmula.
--
--     El pago queda como gasto de Orden. Si no se pudo anotar, la comisión
--     igual se marca pagada —la transferencia ya se hizo— y se avisa.
-- ------------------------------------------------------------
create or replace function public.marcar_comision_pagada(
  p_comision uuid,
  p_monto    numeric default null,
  p_medio    text default '',
  p_nota     text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_c     public.comisiones;
  v_socio text;
  v_monto numeric;
  v_orden uuid;
  v_gasto uuid;
  v_aviso text := null;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_c from public.comisiones where id = p_comision;

  if v_c.id is null then
    raise exception 'Esa comisión no existe.' using errcode = '22023';
  end if;

  if v_c.estado = 'pagada' then
    raise exception 'Esa comisión ya está pagada.' using errcode = '22023';
  end if;

  if v_c.estado = 'anulada' then
    raise exception 'Esa comisión está anulada: el cobro que la generó se deshizo.'
      using errcode = '22023';
  end if;

  v_monto := coalesce(p_monto, v_c.monto);

  if v_monto < 0 then
    raise exception 'El monto no puede ser negativo.' using errcode = '22023';
  end if;

  select nombre into v_socio from public.socios where id = v_c.socio_id;
  select empresa_id into v_orden from public.ajustes_orden where unica;

  if v_orden is null then
    v_aviso := 'No hay una empresa de Orden elegida, así que el pago no se anotó en tus finanzas.';
  elsif v_monto > 0 then
    begin
      insert into public.movimientos (
        empresa_id, tipo, estado, fecha, descripcion, categoria,
        subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por
      ) values (
        v_orden, 'gasto', 'activo', public.hoy_empresa(v_orden),
        'Comisión a ' || coalesce(v_socio, 'socio'), 'Comisiones',
        v_monto, 0, v_monto, 0, 'transferencia',
        left(coalesce(v_socio, ''), 80), auth.uid()
      )
      returning id into v_gasto;
    exception when others then
      v_aviso := 'La comisión quedó pagada, pero el gasto no se pudo anotar: ' || sqlerrm;
    end;
  end if;

  update public.comisiones set
    estado    = 'pagada',
    monto     = v_monto,
    pagada_at = now(),
    gasto_id  = v_gasto,
    medio     = left(coalesce(trim(p_medio), ''), 60),
    nota      = left(coalesce(trim(p_nota), ''), 300)
  where id = p_comision;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), v_c.empresa_id, 'pagar_comision', jsonb_build_object(
    'comision_id', v_c.id,
    'socio_id', v_c.socio_id,
    'socio', v_socio,
    'monto_calculado', v_c.monto,
    'monto_pagado', v_monto,
    'medio', left(coalesce(trim(p_medio), ''), 60),
    'gasto_id', v_gasto
  ));

  return jsonb_build_object(
    'ok', true,
    'monto', v_monto,
    'ajustado', v_monto <> v_c.monto,
    'gasto_anotado', v_gasto is not null,
    'aviso', v_aviso
  );
end $fn$;

revoke all on function public.marcar_comision_pagada(uuid, numeric, text, text) from public, anon;
grant execute on function public.marcar_comision_pagada(uuid, numeric, text, text) to authenticated;

-- ------------------------------------------------------------
-- 13. ANULARLA A MANO
--
--     Para el caso que no puede resolver ninguna regla: la transferencia
--     nunca llegó, el cliente se arrepintió, el referido era falso. Queda
--     anulada con el motivo escrito, y el negocio sigue anotado igual: no se
--     vuelve a generar otra comisión por él.
-- ------------------------------------------------------------
create or replace function public.anular_comision(
  p_comision uuid,
  p_nota     text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_c public.comisiones;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_c from public.comisiones where id = p_comision;

  if v_c.id is null then
    raise exception 'Esa comisión no existe.' using errcode = '22023';
  end if;

  if v_c.estado = 'pagada' then
    raise exception
      'Esa comisión ya se pagó. Si hay que recuperar la plata, eso se arregla con la persona, no borrando el registro.'
      using errcode = '22023';
  end if;

  update public.comisiones set
    estado = 'anulada',
    nota   = left(coalesce(trim(p_nota), ''), 300)
  where id = p_comision;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), v_c.empresa_id, 'anular_comision', jsonb_build_object(
    'comision_id', v_c.id, 'socio_id', v_c.socio_id, 'monto', v_c.monto,
    'motivo', left(coalesce(trim(p_nota), ''), 300)
  ));

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.anular_comision(uuid, text) from public, anon;
grant execute on function public.anular_comision(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 14. SI EL COBRO SE DESHACE, LA COMISIÓN TAMBIÉN
--
--     Se paga por plata que entró. Si el ingreso que la generó se anula, la
--     comisión que está por pagar se cae sola, y no queda esperando en la
--     lista a que alguien se acuerde de revisarla.
--
--     Si ya estaba pagada no se toca: esa plata salió de verdad, y el gasto
--     queda en las finanzas de Orden, que es exactamente lo que pasó.
--
--     Va como trigger y no dentro de anular_movimiento por lo mismo de
--     siempre: es una regla sobre el dato, y tiene que valer venga por donde
--     venga, incluido un UPDATE desde el editor SQL.
-- ------------------------------------------------------------
create or replace function public.anular_baja_la_comision()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.estado <> 'anulado' or old.estado = 'anulado' then
    return new;
  end if;

  update public.comisiones
  set estado = 'anulada',
      nota = left(
        case when coalesce(nota, '') = '' then '' else nota || ' · ' end
        || 'Se anuló el cobro que la generó.', 300)
  where movimiento_id = new.id and estado = 'por_pagar';

  return new;
end $fn$;

revoke all on function public.anular_baja_la_comision() from public, anon, authenticated;

drop trigger if exists anular_baja_la_comision on public.movimientos;
create trigger anular_baja_la_comision
  after update on public.movimientos
  for each row execute function public.anular_baja_la_comision();
