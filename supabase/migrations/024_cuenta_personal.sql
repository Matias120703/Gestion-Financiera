-- ORDEN · Migración 024 · La cuenta personal deja de ser un comercio disfrazado
--
-- Hasta acá, "personal" solo quitaba pantallas: no había Vender, ni Productos,
-- ni Reto. Pero por debajo seguía siendo una cuenta de comercio, y eso se
-- filtraba por dos agujeros que nadie había mirado:
--
--   · EL CIERRE DEL DÍA SEGUÍA AHÍ. Esa pantalla se oculta por RUBRO, y a
--     toda cuenta personal se le guarda rubro 'comercio' porque una persona
--     no tiene rubro. O sea que el filtro nunca se le aplicó. Alguien que
--     lleva su sueldo estaba viendo «cuánto ganaste hoy», que para él no
--     significa nada: su plata no se mide por día.
--
--   · LAS CATEGORÍAS ERAN LAS DE UN ALMACÉN. Mercadería, Publicidad,
--     Sueldos («empleados, jornales»), Impuestos. Ninguna de Comida, Salud,
--     Ropa o Cuidado personal. La IA venía clasificando el gasto de una
--     persona con los casilleros de un negocio.
--
-- Lo segundo importa más de lo que parece: el presupuesto que se agrega en
-- esta misma migración se arma POR CATEGORÍA. Con las categorías de un
-- comercio, toda la organización quedaría construida sobre casilleros
-- equivocados.
--
-- Y se agrega lo que hacía falta para que la cuenta personal sirva de verdad:
-- ingresos que se repiten, un plan de en qué se va la plata, y un ciclo que
-- va de cobro a cobro en vez de día a día.

-- ============================================================
-- 1. LA PUERTA: LAS DOS PREGUNTAS AHORA SABEN QUÉ TIPO DE CUENTA ES
--
--    Las dos funciones pasan a recibir el tipo de cuenta. Se REEMPLAZAN las
--    versiones de un solo argumento en vez de convivir con ellas: dos
--    funciones contestando la misma pregunta es exactamente cómo se llega a
--    que la pantalla diga una cosa y la tarea de la noche otra.
-- ============================================================

drop function if exists public.categorias_de_rubro(text);

create or replace function public.categorias_de_rubro(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns jsonb language sql immutable set search_path = public as $fn$
  select case
    when coalesce(p_tipo_cuenta, 'emprendedor') = 'personal' then jsonb_build_array(
      jsonb_build_object('nombre','Comida','pistas','supermercado, almacén, verdulería, carnicería, despensa, panadería'),
      jsonb_build_object('nombre','Alquiler','pistas','alquiler, expensas, condominio'),
      jsonb_build_object('nombre','Servicios','pistas','luz, agua, internet, teléfono, cable, gas'),
      jsonb_build_object('nombre','Transporte','pistas','colectivo, nafta, combustible, pasaje, taxi, uber, peaje'),
      jsonb_build_object('nombre','Salud','pistas','farmacia, remedios, médico, dentista, seguro médico, análisis'),
      jsonb_build_object('nombre','Educación','pistas','colegio, cuota, universidad, útiles, curso, libros'),
      jsonb_build_object('nombre','Ropa','pistas','ropa, calzado, zapatillas, campera'),
      jsonb_build_object('nombre','Cuidado personal','pistas','peluquería, uñas, barbería, cosmética, gimnasio, perfume'),
      jsonb_build_object('nombre','Ocio','pistas','salida, restaurante, cine, streaming, viaje, cerveza, cumpleaños'),
      jsonb_build_object('nombre','Hogar','pistas','limpieza, muebles, arreglos, electrodomésticos, ferretería'),
      jsonb_build_object('nombre','Cuotas y deudas','pistas','tarjeta, préstamo, cuota, financiera'),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'ganaderia' then jsonb_build_array(
      jsonb_build_object('nombre','Alimentación','pistas','maíz, balanceado, ración, fardos, sal, pasto'),
      jsonb_build_object('nombre','Sanidad','pistas','vacunas, antiparasitarios, veterinario, remedios'),
      jsonb_build_object('nombre','Personal','pistas','peón, capataz, jornales, sueldos'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo, pastaje'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de hacienda, camión jaula'),
      jsonb_build_object('nombre','Mantenimiento','pistas','alambrado, aguadas, maquinaria, herramientas'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'agricultura' then jsonb_build_array(
      jsonb_build_object('nombre','Semilla','pistas','semilla, plantines'),
      jsonb_build_object('nombre','Fertilizante','pistas','urea, fosfato, abono'),
      jsonb_build_object('nombre','Agroquímicos','pistas','herbicida, fungicida, insecticida'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Cosecha','pistas','cosechadora, trilla, secado'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de granos'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo'),
      jsonb_build_object('nombre','Personal','pistas','jornales, tractorista, peón'),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'servicios' then jsonb_build_array(
      jsonb_build_object('nombre','Materiales','pistas','cemento, arena, cables, pintura, insumos'),
      jsonb_build_object('nombre','Repuestos','pistas','piezas, filtros, aceite'),
      jsonb_build_object('nombre','Herramientas','pistas',''),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Personal','pistas','ayudante, jornales, sueldos'),
      jsonb_build_object('nombre','Transporte','pistas','flete, viaje, delivery'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    else jsonb_build_array(
      jsonb_build_object('nombre','Mercadería','pistas','lo que comprás para revender'),
      jsonb_build_object('nombre','Transporte','pistas','combustible, flete, delivery'),
      jsonb_build_object('nombre','Comida','pistas',''),
      jsonb_build_object('nombre','Publicidad','pistas',''),
      jsonb_build_object('nombre','Servicios','pistas','luz, agua, internet, teléfono'),
      jsonb_build_object('nombre','Alquiler','pistas',''),
      jsonb_build_object('nombre','Sueldos','pistas','empleados, jornales'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))
  end;
$fn$;

grant execute on function public.categorias_de_rubro(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- ¿ESTA CUENTA CIERRA EL DÍA?
--
-- Una persona con sueldo no cierra el día por el mismo motivo que un
-- ganadero no lo cierra: el día no es su ciclo. El del ganadero es el
-- novillo; el de alguien con sueldo va de cobro a cobro.
-- ------------------------------------------------------------
drop function if exists public.rubro_cierra_el_dia(text);

create or replace function public.rubro_cierra_el_dia(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p_tipo_cuenta, 'emprendedor') <> 'personal'
     and coalesce(p_rubro, 'comercio') in ('comercio', 'servicios');
$fn$;

grant execute on function public.rubro_cierra_el_dia(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- El recordatorio de la noche, con la misma firma y la misma forma de
-- respuesta que en la 008 y la 021. Lo único que cambia es que ahora la
-- cuenta personal tampoco recibe el «no cargaste nada hoy».
-- ------------------------------------------------------------
create or replace function public.empresas_sin_cargar_hoy(p_racha_minima integer default 2)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id', e.id,
      'nombre',     e.nombre,
      'zona',       e.zona_horaria,
      'racha',      r.largo
    ) as x
    from public.empresas e
    join lateral (
      with dias as (
        select distinct m.fecha from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo'
          and m.fecha <= (now() at time zone e.zona_horaria)::date
      ),
      numeradas as (
        select fecha, (fecha - (row_number() over (order by fecha))::int) as isla from dias
      ),
      rachas as (
        select count(*)::int as largo, max(fecha) as hasta from numeradas group by isla
      )
      select largo, hasta from rachas order by hasta desc limit 1
    ) r on true
    where public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta)
      and r.hasta = (now() at time zone e.zona_horaria)::date - 1
      and r.largo >= greatest(p_racha_minima, 1)
  ) s;

  return v_res;
end $fn$;

revoke all on function public.empresas_sin_cargar_hoy(integer) from public, anon, authenticated;
grant execute on function public.empresas_sin_cargar_hoy(integer) to service_role;

-- ============================================================
-- 2. INGRESOS FIJOS
--
--    No se llama «sueldo» a propósito. Mucha gente tiene más de una entrada
--    —sueldo, changas, el alquiler de una pieza— y un comisionista no tiene
--    sueldo fijo pero sí ingresos que se repiten. Un solo concepto los cubre
--    a todos; una casilla llamada «salario» dejaría afuera a la mitad.
--
--    Esto NO crea movimientos. Es lo que la persona ESPERA cobrar, no lo que
--    cobró. La plata entra cuando la carga, como cualquier otro ingreso. Si
--    esta tabla generara movimientos sola, el sistema mostraría plata que
--    todavía no existe — que es la única mentira que un sistema de plata no
--    se puede permitir.
-- ============================================================
create table if not exists public.ingresos_fijos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nombre      text not null check (char_length(trim(nombre)) between 1 and 60),
  importe     numeric(14,2) not null check (importe > 0),
  -- Qué día del mes entra. Define el ciclo: para alguien con sueldo, el mes
  -- útil no va del 1 al 30, va de cobro a cobro.
  dia_del_mes smallint not null default 1 check (dia_del_mes between 1 and 31),
  -- Cuál manda para definir el ciclo, si hay varios.
  principal   boolean not null default false,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ingresos_fijos_empresa_idx
  on public.ingresos_fijos (empresa_id) where activo;

-- Un solo principal por cuenta: si hubiera dos, el ciclo dependería del
-- orden en que se leyeran las filas.
create unique index if not exists ingresos_fijos_un_principal
  on public.ingresos_fijos (empresa_id) where principal and activo;

-- ============================================================
-- 3. EL PLAN: EN QUÉ SE VA A IR LA PLATA
--
--    Un número por categoría, que vale todos los meses. No se guarda una
--    copia por mes a propósito: obligaría a rearmar el plan cada treinta
--    días, y un plan que hay que rehacer es un plan que se abandona.
--
--    La comparación contra la realidad sale gratis: cada gasto ya se guarda
--    con su categoría desde el día uno.
-- ============================================================
create table if not exists public.presupuesto (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  categoria  text not null check (char_length(trim(categoria)) between 1 and 40),
  importe    numeric(14,2) not null check (importe >= 0),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, categoria)
);

-- ------------------------------------------------------------
-- Permisos de las dos tablas.
--
-- Se lee con `es_admin`, no con `es_miembro`. Cuánto cobra alguien y cómo
-- reparte su plata es del mismo orden que sus deudas y sus costos: un
-- vendedor no lo ve nunca. Hoy una cuenta personal no tiene vendedores, pero
-- la tabla es genérica y el día que un comercio use el presupuesto la regla
-- ya tiene que estar puesta.
-- ------------------------------------------------------------
alter table public.ingresos_fijos enable row level security;
alter table public.presupuesto    enable row level security;

drop policy if exists ingresos_fijos_select on public.ingresos_fijos;
create policy ingresos_fijos_select on public.ingresos_fijos
  for select to authenticated using (public.es_admin(empresa_id));

drop policy if exists presupuesto_select on public.presupuesto;
create policy presupuesto_select on public.presupuesto
  for select to authenticated using (public.es_admin(empresa_id));

revoke all on public.ingresos_fijos from anon, authenticated;
revoke all on public.presupuesto    from anon, authenticated;
grant select on public.ingresos_fijos to authenticated;
grant select on public.presupuesto    to authenticated;

-- La cuenta vencida queda en solo lectura, igual que todo lo demás. El
-- DELETE sigue libre: nadie tiene que pagar para poder irse.
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['ingresos_fijos', 'presupuesto'] loop
    execute format('drop trigger if exists %I on public.%I',
                   'cuenta_activa_' || v_tabla, v_tabla);
    execute format(
      'create trigger %I before insert or update on public.%I '
      || 'for each row execute function public.exigir_cuenta_activa()',
      'cuenta_activa_' || v_tabla, v_tabla);
  end loop;
end $$;

-- ============================================================
-- 4. ESCRIBIR: SIEMPRE POR LA PUERTA OFICIAL
-- ============================================================
create or replace function public.guardar_ingreso_fijo(
  p_empresa   uuid,
  p_nombre    text,
  p_importe   numeric,
  p_dia       integer default 1,
  p_principal boolean default false,
  p_id        uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre, para saber qué es cuando entre.' using errcode = '22023';
  end if;

  if coalesce(p_importe, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  -- Si este pasa a ser el principal, el anterior deja de serlo. Se hace
  -- ANTES de escribir, porque el índice único no admite dos.
  if coalesce(p_principal, false) then
    update public.ingresos_fijos
    set principal = false, updated_at = now()
    where empresa_id = p_empresa and principal
      and (p_id is null or id <> p_id);
  end if;

  if p_id is null then
    insert into public.ingresos_fijos (empresa_id, nombre, importe, dia_del_mes, principal)
    values (p_empresa, trim(p_nombre), p_importe,
            least(greatest(coalesce(p_dia, 1), 1), 31), coalesce(p_principal, false))
    returning id into v_id;
  else
    update public.ingresos_fijos
    set nombre = trim(p_nombre), importe = p_importe,
        dia_del_mes = least(greatest(coalesce(p_dia, 1), 1), 31),
        principal = coalesce(p_principal, false), updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese ingreso no existe en esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_ingreso_fijo(uuid, text, numeric, integer, boolean, uuid)
  from public, anon;
grant execute on function public.guardar_ingreso_fijo(uuid, text, numeric, integer, boolean, uuid)
  to authenticated;

create or replace function public.borrar_ingreso_fijo(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  delete from public.ingresos_fijos where id = p_id and empresa_id = p_empresa;
  if not found then
    raise exception 'Ese ingreso no existe en esta cuenta.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_ingreso_fijo(uuid, uuid) from public, anon;
grant execute on function public.borrar_ingreso_fijo(uuid, uuid) to authenticated;

-- Poner en cero es sacar la categoría del plan. Sin esto haría falta un
-- segundo botón de borrar para algo que la persona piensa como «ya no le
-- pongo número a esto».
create or replace function public.guardar_presupuesto(
  p_empresa   uuid,
  p_categoria text,
  p_importe   numeric
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_categoria, ''))) = 0 then
    raise exception 'Falta la categoría.' using errcode = '22023';
  end if;

  if coalesce(p_importe, 0) <= 0 then
    delete from public.presupuesto
    where empresa_id = p_empresa and categoria = trim(p_categoria);
    return jsonb_build_object('quitada', true);
  end if;

  insert into public.presupuesto (empresa_id, categoria, importe, updated_at)
  values (p_empresa, trim(p_categoria), p_importe, now())
  on conflict (empresa_id, categoria) do update
    set importe = excluded.importe, updated_at = now();

  return jsonb_build_object('guardado', true);
end $fn$;

revoke all on function public.guardar_presupuesto(uuid, text, numeric) from public, anon;
grant execute on function public.guardar_presupuesto(uuid, text, numeric) to authenticated;

-- ============================================================
-- 5. EL CICLO: DE COBRO A COBRO
--
--    Para alguien con sueldo el mes útil no empieza el 1. Empieza el día que
--    cobra y termina el día antes del próximo cobro. Esa es la pregunta que
--    de verdad le quita el sueño: es 20, ¿llego al 30?
-- ============================================================

-- El día de cobro de un mes dado, recortado si el mes es más corto: quien
-- cobra el 31 en febrero cobra el 28.
create or replace function public.fecha_de_cobro(p_mes date, p_dia integer)
returns date language sql immutable set search_path = public as $fn$
  select (date_trunc('month', p_mes)
          + (least(
               greatest(coalesce(p_dia, 1), 1),
               extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int
             ) - 1) * interval '1 day')::date;
$fn$;

-- Revocar ANTES de otorgar: `anon` hereda de PUBLIC, así que un grant
-- suelto la deja abierta aunque nunca se la haya nombrado.
revoke all on function public.fecha_de_cobro(date, integer) from public, anon;
grant execute on function public.fecha_de_cobro(date, integer) to authenticated;

create or replace function public.ciclo_personal(p_empresa uuid)
returns table (desde date, hasta date, dia_cobro integer)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona   text;
  v_hoy    date;
  v_dia    integer;
  v_inicio date;
begin
  select zona_horaria into v_zona from public.empresas where id = p_empresa;
  v_hoy := (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date;

  -- Manda el ingreso marcado como principal; si no hay, el más grande. Sin
  -- ningún ingreso fijo cargado, el ciclo es el mes corrido.
  select i.dia_del_mes into v_dia
  from public.ingresos_fijos i
  where i.empresa_id = p_empresa and i.activo
  order by i.principal desc, i.importe desc, i.created_at
  limit 1;

  v_dia := coalesce(v_dia, 1);

  v_inicio := public.fecha_de_cobro(v_hoy, v_dia);
  if v_hoy < v_inicio then
    v_inicio := public.fecha_de_cobro((v_hoy - interval '1 month')::date, v_dia);
  end if;

  desde     := v_inicio;
  hasta     := public.fecha_de_cobro((v_inicio + interval '1 month')::date, v_dia) - 1;
  dia_cobro := v_dia;
  return next;
end $fn$;

revoke all on function public.ciclo_personal(uuid) from public, anon;
grant execute on function public.ciclo_personal(uuid) to authenticated;

-- ============================================================
-- 6. LA PANTALLA, EN UNA SOLA LLAMADA
--
--    Contesta la única pregunta que importa: cuánto te queda y para cuántos
--    días. Todo lo demás de esta función es el detalle de cómo se llegó a
--    ese número.
--
--    `disponible` sale de plata REAL: lo que entró menos lo que salió, menos
--    las cuotas que todavía faltan pagar antes de que cierre el ciclo. No se
--    suma el sueldo esperado si todavía no entró — decirle a alguien que
--    tiene plata que no cobró es cómo se hace que deje de creerte.
-- ============================================================
create or replace function public.resumen_personal(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_c            record;
  v_zona         text;
  v_hoy          date;
  v_entro        numeric := 0;
  v_salio        numeric := 0;
  v_cuotas       numeric := 0;
  v_dias         integer;
  v_plan         jsonb;
  v_sin_planear  numeric := 0;
  v_fijos        jsonb;
  v_esperado     numeric := 0;
  v_hubo_ingreso boolean := false;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a esta cuenta.' using errcode = '42501';
  end if;

  select zona_horaria into v_zona from public.empresas where id = p_empresa;
  v_hoy := (now() at time zone coalesce(v_zona, 'America/Asuncion'))::date;

  select * into v_c from public.ciclo_personal(p_empresa);

  select
    coalesce(sum(m.monto) filter (where m.tipo in ('ingreso', 'venta')), 0),
    coalesce(sum(m.monto) filter (where m.tipo = 'gasto'), 0),
    bool_or(m.tipo in ('ingreso', 'venta'))
  into v_entro, v_salio, v_hubo_ingreso
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.estado = 'activo'
    and m.fecha between v_c.desde and v_c.hasta;

  -- Cuotas que todavía no se pagaron y vencen antes de que cierre el ciclo.
  -- Lo ya pagado no se cuenta acá: está en `v_salio` como gasto, y sumarlo
  -- dos veces le descontaría a la persona plata que ya descontó.
  select coalesce(sum(d.monto_cuota), 0) into v_cuotas
  from public.deudas d
  where d.empresa_id = p_empresa
    and d.activa and d.saldo > 0
    and d.monto_cuota is not null
    and d.vence_el between v_hoy and v_c.hasta;

  v_dias := greatest(1, (v_c.hasta - v_hoy) + 1);

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'categoria', p.categoria,
      'planeado',  p.importe,
      'gastado',   coalesce(g.total, 0),
      'resta',     p.importe - coalesce(g.total, 0)
    ) order by p.categoria), '[]'::jsonb)
  into v_plan
  from public.presupuesto p
  left join lateral (
    select sum(m.monto) as total
    from public.movimientos m
    where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
      and m.categoria = p.categoria
      and m.fecha between v_c.desde and v_c.hasta
  ) g on true
  where p.empresa_id = p_empresa;

  -- Lo que se gastó fuera del plan. Sin este número el plan miente por
  -- omisión: podés estar bien en las cinco categorías que anotaste y
  -- fundido igual.
  select coalesce(sum(m.monto), 0) into v_sin_planear
  from public.movimientos m
  where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
    and m.fecha between v_c.desde and v_c.hasta
    and not exists (
      select 1 from public.presupuesto p
      where p.empresa_id = p_empresa and p.categoria = m.categoria);

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'nombre', i.nombre, 'importe', i.importe,
      'dia_del_mes', i.dia_del_mes, 'principal', i.principal
    ) order by i.principal desc, i.importe desc), '[]'::jsonb),
    coalesce(sum(i.importe), 0)
  into v_fijos, v_esperado
  from public.ingresos_fijos i
  where i.empresa_id = p_empresa and i.activo;

  return jsonb_build_object(
    'desde', v_c.desde,
    'hasta', v_c.hasta,
    'dia_cobro', v_c.dia_cobro,
    'dias_restantes', v_dias,
    'entro', v_entro,
    'salio', v_salio,
    'cuotas_por_vencer', v_cuotas,
    'disponible', v_entro - v_salio - v_cuotas,
    'por_dia', round((v_entro - v_salio - v_cuotas) / v_dias, 2),
    'plan', v_plan,
    'gastado_sin_planear', v_sin_planear,
    'ingresos_fijos', v_fijos,
    'esperado', v_esperado,
    -- Para poder preguntarle «¿ya cobraste?» en vez de mostrarle un cero
    -- sin explicación el día que arranca el ciclo.
    'cobro_pendiente', v_esperado > 0 and not coalesce(v_hubo_ingreso, false)
  );
end $fn$;

revoke all on function public.resumen_personal(uuid) from public, anon;
grant execute on function public.resumen_personal(uuid) to authenticated;
