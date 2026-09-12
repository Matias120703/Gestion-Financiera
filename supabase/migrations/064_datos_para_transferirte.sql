-- ============================================================
-- ORDEN · Migración 064 · Los datos para transferirle, en su lugar
--
-- «Dónde te transferimos» era UNA línea de texto libre. El dueño escribió
-- «Banco Familiar, alias 0984158986» y quedó claro el problema: al momento de
-- transferir hay que leer esa frase y adivinar qué parte es el banco, cuál el
-- alias y a nombre de quién está la cuenta. Y falta el dato que todos los
-- bancos de acá piden igual: la cédula o el RUC del titular.
--
-- Cuatro campos, que son los que pide cualquier formulario de transferencia:
-- dónde, a nombre de quién, a qué cuenta y con qué documento.
--
-- `cobra_en` no se borra: es lo que ya escribieron los que cargaron algo, y
-- borrarlo sería perder el único dato que había para pagarles. Queda como
-- lo anterior, a la vista, hasta que completen los campos nuevos.
-- ============================================================

alter table public.socios
  add column if not exists banco     text not null default '' check (char_length(banco) <= 80),
  add column if not exists titular   text not null default '' check (char_length(titular) <= 120),
  add column if not exists cuenta    text not null default '' check (char_length(cuenta) <= 60),
  add column if not exists documento text not null default '' check (char_length(documento) <= 30);

comment on column public.socios.banco is 'Banco, financiera o billetera.';
comment on column public.socios.titular is 'A nombre de quién está la cuenta.';
comment on column public.socios.cuenta is 'Número de cuenta o alias.';
comment on column public.socios.documento is 'CI o RUC del titular: los bancos lo piden.';
comment on column public.socios.cobra_en is 'Texto libre viejo (anterior a la 064). Se conserva para no perder datos.';

-- ------------------------------------------------------------
-- 1. LO ESCRIBE EL SOCIO
--
--    Cuatro campos y ninguno obligatorio: alguien puede tener solo una
--    billetera, y pedirle un número de cuenta que no tiene lo dejaría sin
--    poder guardar nada.
--
--    La línea vieja se sigue armando con lo nuevo, porque hay pantallas que
--    muestran «cobra en …» de un vistazo y no tienen por qué saber de cuatro
--    campos.
-- ------------------------------------------------------------
drop function if exists public.guardar_donde_cobro(text);

create or replace function public.guardar_donde_cobro(
  p_banco     text default '',
  p_titular   text default '',
  p_cuenta    text default '',
  p_documento text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_banco text := left(coalesce(trim(p_banco), ''), 80);
  v_tit   text := left(coalesce(trim(p_titular), ''), 120);
  v_cta   text := left(coalesce(trim(p_cuenta), ''), 60);
  v_doc   text := left(coalesce(trim(p_documento), ''), 30);
  v_linea text;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  v_linea := left(trim(both ' ·' from concat_ws(' · ', nullif(v_banco, ''), nullif(v_cta, ''))), 200);

  update public.socios set
    banco      = v_banco,
    titular    = v_tit,
    cuenta     = v_cta,
    documento  = v_doc,
    cobra_en   = case when v_linea <> '' then v_linea else cobra_en end,
    updated_at = now()
  where user_id = v_uid
  returning id into v_id;

  if v_id is null then
    raise exception 'Todavía no pediste tu código de recomendación.' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.guardar_donde_cobro(text, text, text, text) from public, anon;
grant execute on function public.guardar_donde_cobro(text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 2. Y SE VEN DONDE HAY QUE PAGARLE
--
--    Las tres lecturas devuelven los cuatro campos. La administración no
--    tendría que entrar a «editar» para leer un número de cuenta: editar es
--    para cambiar, no para mirar.
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
      'banco',     s.banco,
      'titular',   s.titular,
      'cuenta',    s.cuenta,
      'documento', s.documento,
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
    'referidos', v_lista
  );
end $fn$;

revoke all on function public.mi_panel_socio() from public, anon;
grant execute on function public.mi_panel_socio() to authenticated;
