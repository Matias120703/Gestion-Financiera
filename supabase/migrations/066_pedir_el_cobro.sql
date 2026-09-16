-- ============================================================
-- ORDEN · Migración 066 · El socio pide su cobro
--
-- LO QUE FALTABA
--
-- Desde la 060 la comisión nace sola cuando el referido paga, y desde la
-- 061 el socio la ve en su pantalla. Pero no había forma de PEDIRLA: la
-- plata figuraba como «te deben» y ahí se quedaba, esperando a que Matías
-- se acordara de mirar el panel. El socio no tenía ningún botón y nosotros
-- ningún aviso.
--
-- Eso es justo lo que mata un programa de referidos. Alguien trae un
-- cliente, ve su comisión en pantalla, no pasa nada durante dos semanas, y
-- no vuelve a recomendar nunca más.
--
-- CÓMO FUNCIONA
--
-- El socio toca «Pedir mi cobro» y se marcan sus comisiones por pagar con
-- la fecha del pedido. Eso dispara un aviso a la administración (push, en
-- la ruta que llama a esta función) y le deja al socio la promesa escrita:
-- se transfiere dentro de las 24 a 48 horas hábiles.
--
-- DOS GUARDAS QUE IMPORTAN
--
--   · SIN DATOS BANCARIOS NO SE PUEDE PEDIR. Pedir un cobro sin decir a
--     dónde transferir deja a la administración con un aviso que no puede
--     resolver, y al socio esperando una plata que nadie sabe mandar.
--   · NO SE PIDE DOS VECES. `solicitada_at` se escribe una sola vez por
--     comisión: quien toca el botón cinco veces no manda cinco avisos. La
--     función contesta que ya estaba pedido y cuándo, y la pantalla lo
--     dice.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CUÁNDO LO PIDIÓ
--
--    Una fecha y no un booleano, por lo mismo que `avisado_at` en la 043:
--    saber que pidió no sirve tanto como saber hace cuánto. «Pidió hace
--    tres días» es un reclamo; «pidió hace diez minutos» es una tarea.
-- ------------------------------------------------------------
alter table public.comisiones
  add column if not exists solicitada_at timestamptz;

comment on column public.comisiones.solicitada_at is
  'Cuándo el socio pidió que se le transfiera. Null = todavía no lo pidió.';

create index if not exists comisiones_solicitadas_idx
  on public.comisiones (solicitada_at desc)
  where estado = 'por_pagar' and solicitada_at is not null;

-- ------------------------------------------------------------
-- 2. PEDIR EL COBRO
--
--    La llama el propio socio, con su sesión. No recibe a quién pagarle:
--    se resuelve de `auth.uid()`, así que nadie puede pedir el cobro de
--    otro por más que arme el pedido a mano.
-- ------------------------------------------------------------
create or replace function public.solicitar_cobro()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid     uuid := auth.uid();
  v_socio   public.socios;
  v_pendientes integer;
  v_nuevas  integer;
  v_total   numeric;
  v_desde   timestamptz;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios where user_id = v_uid;
  if v_socio.id is null then
    raise exception 'Todavía no pediste tu código de recomendación.' using errcode = '22023';
  end if;

  if not v_socio.activo then
    raise exception 'Tu código está pausado. Escribinos y lo vemos.' using errcode = '42501';
  end if;

  select count(*)::int, coalesce(sum(monto), 0)
  into v_pendientes, v_total
  from public.comisiones
  where socio_id = v_socio.id and estado = 'por_pagar';

  if v_pendientes = 0 then
    raise exception 'Todavía no tenés nada por cobrar.' using errcode = '22023';
  end if;

  -- Sin saber a dónde transferir, el pedido no se puede resolver. Se frena
  -- acá y no en la pantalla: la pantalla puede cambiar, esto no.
  if coalesce(nullif(trim(v_socio.cuenta), ''), nullif(trim(v_socio.cobra_en), '')) is null then
    raise exception 'Antes de pedir el cobro, completá dónde te transferimos.'
      using errcode = '22023';
  end if;

  -- Solo las que todavía no pidió. Tocar el botón de nuevo no vuelve a
  -- avisar: quien llama mira `nuevas` para decidir si manda el push.
  update public.comisiones
  set solicitada_at = now()
  where socio_id = v_socio.id and estado = 'por_pagar' and solicitada_at is null;

  get diagnostics v_nuevas = row_count;

  select min(solicitada_at) into v_desde
  from public.comisiones
  where socio_id = v_socio.id and estado = 'por_pagar' and solicitada_at is not null;

  return jsonb_build_object(
    'ok', true,
    'socio', v_socio.nombre,
    'socio_id', v_socio.id,
    'comisiones', v_pendientes,
    'total', v_total,
    'nuevas', v_nuevas,
    -- true = ya lo había pedido antes y no hay que volver a avisar.
    'ya_estaba', v_nuevas = 0,
    'pedido_el', v_desde,
    'donde', coalesce(nullif(trim(v_socio.cuenta), ''), v_socio.cobra_en)
  );
end $fn$;

revoke all on function public.solicitar_cobro() from public, anon;
grant execute on function public.solicitar_cobro() to authenticated;

-- ------------------------------------------------------------
-- 3. QUE EL SOCIO VEA QUE YA LO PIDIÓ
--
--    Redefine `mi_panel_socio()` de la 064 sumando dos campos. Sin esto, el
--    socio toca el botón, recarga la pantalla y vuelve a ver el botón como
--    si no hubiera pasado nada — que es exactamente la sensación que este
--    cambio venía a arreglar.
-- ------------------------------------------------------------
create or replace function public.mi_panel_socio()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  v_socio public.socios;
  v_lista jsonb;
  v_pedido timestamptz;
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

  -- El pedido más viejo que sigue sin pagarse: es el que cuenta para saber
  -- hace cuánto está esperando.
  select min(solicitada_at) into v_pedido
  from public.comisiones
  where socio_id = v_socio.id and estado = 'por_pagar' and solicitada_at is not null;

  return jsonb_build_object(
    'tiene_codigo', true,
    'codigo',    v_socio.codigo,
    'nombre',    v_socio.nombre,
    'cobra_en',  v_socio.cobra_en,
    'banco',     v_socio.banco,
    'titular',   v_socio.titular,
    'cuenta',    v_socio.cuenta,
    'documento', v_socio.documento,
    'activo',    v_socio.activo,
    'traidos',   (select count(*) from public.referidos r where r.socio_id = v_socio.id),
    'pagaron',   (select count(*) from public.comisiones c
                  where c.socio_id = v_socio.id and c.estado <> 'anulada'),
    'por_pagar', coalesce((select sum(c.monto) from public.comisiones c
                           where c.socio_id = v_socio.id and c.estado = 'por_pagar'), 0),
    'pagado',    coalesce((select sum(c.monto) from public.comisiones c
                           where c.socio_id = v_socio.id and c.estado = 'pagada'), 0),
    'cobro_pedido_el', v_pedido,
    'referidos', v_lista
  );
end $fn$;

revoke all on function public.mi_panel_socio() from public, anon;
grant execute on function public.mi_panel_socio() to authenticated;

-- ------------------------------------------------------------
-- 4. Y QUE LA ADMINISTRACIÓN VEA QUIÉN LO PIDIÓ
--
--    Redefine `listar_comisiones()` de la 064 sumando `solicitada_at`. El
--    push avisa una vez; el panel es donde se trabaja, y sin este dato no
--    hay forma de saber a quién le urge.
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
      'banco',      s.banco,
      'titular',    s.titular,
      'cuenta',     s.cuenta,
      'documento',  s.documento,
      'empresa_id', c.empresa_id,
      'negocio',    coalesce(e.nombre, 'Negocio borrado'),
      'base',       c.base,
      'porcentaje', c.porcentaje,
      'monto',      c.monto,
      'estado',     c.estado,
      'creado',     c.created_at,
      'pagada_at',  c.pagada_at,
      'solicitada_at', c.solicitada_at,
      'medio',      c.medio,
      'nota',       c.nota,
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
-- 5. A QUIÉN AVISARLE
--
--    La ruta que manda el push necesita los usuarios de la administración.
--    `superadmins` solo deja que cada uno se vea a sí mismo (016), así que
--    hace falta esta función para que el servidor los lea a todos.
--
--    Solo `service_role`: es la lista de quiénes administran Orden, y no
--    tiene por qué salir hacia ningún navegador.
-- ------------------------------------------------------------
create or replace function public.usuarios_de_la_administracion()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(s.usuario_id), '[]'::jsonb) from public.superadmins s;
$fn$;

revoke all on function public.usuarios_de_la_administracion() from public, anon, authenticated;
grant execute on function public.usuarios_de_la_administracion() to service_role;
