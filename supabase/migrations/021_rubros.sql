-- ============================================================
-- ORDEN · Migración 021 · El rubro de cada negocio
--
-- LA IDEA: UN MOTOR, VARIAS PUERTAS
--
-- Entró plata, salió plata, esto me queda, debo esto y vence tal día. Eso es
-- igual para un almacén, un ganadero, un agricultor y un taller — y es el
-- 90% de Orden. Lo que cambia entre ellos es más chico de lo que parece:
--
--   · las palabras («producto» vs «hacienda» vs «cultivo»);
--   · las categorías de gasto (Publicidad vs Sanidad vs Fertilizante);
--   · el RITMO, que es lo único que rompe algo de verdad.
--
-- POR QUÉ EL RITMO IMPORTA MÁS QUE LAS PALABRAS
--
-- Orden está construido sobre el hábito diario: la racha, el cierre del día,
-- el recordatorio de la noche. Eso le calza perfecto a quien vende todos los
-- días.
--
-- A un ganadero no. Compra un ternero, gasta en maíz y sanidad durante
-- dieciocho meses, y recién ahí vende. Su cierre del día diría «hoy no hubo
-- actividad» casi siempre, y su racha se cortaría sin parar. Un sistema que
-- todos los días te dice que fallaste, cuando no fallaste en nada, se
-- desinstala.
--
-- Por eso el rubro decide QUÉ SECCIONES EXISTEN, no solo cómo se llaman.
--
-- DÓNDE VIVE CADA COSA
--
-- Acá vive el DATO: qué rubro eligió cada empresa, y las categorías de gasto
-- que le corresponden (para que la IA las sugiera sin desplegar nada).
--
-- Las palabras y qué pantallas se muestran viven en `src/lib/rubros.ts`,
-- porque son presentación y no seguridad: que un ganadero vea el cierre del
-- día no filtra nada de nadie. La regla de siempre —lo que protege va en
-- PostgreSQL— sigue intacta.
--
-- Idempotente. Todo lo que ya existe queda como 'comercio', que es lo que es.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA COLUMNA
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists rubro text not null default 'comercio';

do $$ begin
  alter table public.empresas
    add constraint empresas_rubro_check
    check (rubro in ('comercio', 'ganaderia', 'agricultura', 'servicios'));
exception when duplicate_object then null; end $$;

comment on column public.empresas.rubro is
  'Adapta vocabulario, categorías y qué secciones existen. No es un permiso: '
  'lo que protege datos sigue siendo RLS y los roles.';

-- ------------------------------------------------------------
-- 2. LAS CATEGORÍAS DE GASTO DE CADA RUBRO
--
--    Viven en la base y no en el código por el mismo motivo que los precios:
--    ajustar una lista no puede requerir un despliegue. Las usa el prompt de
--    la captura para sugerir, y la persona puede escribir cualquier otra —la
--    columna `categoria` es texto libre y va a seguir siéndolo. Una lista
--    cerrada obligaría a alguien a meter su gasto en el casillero
--    equivocado, que es peor que no sugerir nada.
-- ------------------------------------------------------------
create or replace function public.categorias_de_rubro(p_rubro text)
returns jsonb language sql immutable set search_path = public as $fn$
  -- Cada categoría viene con PISTAS, no solo con su nombre.
  --
  -- Hizo falta al probarlo con el modelo real: «compré veinte bolsas de maíz»
  -- caía en «Otros» porque nada le decía que el maíz de un ganadero es
  -- comida de animales. Con las pistas cae en Alimentación. Un nombre de
  -- categoría solo, sin contexto, no alcanza para clasificar bien.
  select case coalesce(p_rubro, 'comercio')
    when 'ganaderia' then jsonb_build_array(
      jsonb_build_object('nombre','Alimentación','pistas','maíz, balanceado, ración, fardos, sal, pasto'),
      jsonb_build_object('nombre','Sanidad','pistas','vacunas, antiparasitarios, veterinario, remedios'),
      jsonb_build_object('nombre','Personal','pistas','peón, capataz, jornales, sueldos'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo, pastaje'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de hacienda, camión jaula'),
      jsonb_build_object('nombre','Mantenimiento','pistas','alambrado, aguadas, maquinaria, herramientas'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))
    when 'agricultura' then jsonb_build_array(
      jsonb_build_object('nombre','Semilla','pistas','semilla, plantines'),
      jsonb_build_object('nombre','Fertilizante','pistas','urea, fosfato, abono'),
      jsonb_build_object('nombre','Agroquímicos','pistas','herbicida, fungicida, insecticida'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Cosecha','pistas','cosechadora, trilla, secado'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de granos'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo'),
      jsonb_build_object('nombre','Personal','pistas','jornales, tractorista, peón'),
      jsonb_build_object('nombre','Otros','pistas',''))
    when 'servicios' then jsonb_build_array(
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

grant execute on function public.categorias_de_rubro(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. ¿ESTE RUBRO CIERRA EL DÍA?
--
--    Una sola pregunta en un solo lugar, para que la pantalla y las tareas
--    programadas no puedan contestarla distinto. Sin esto, el recordatorio
--    de la noche le seguiría llegando a un ganadero aunque la pantalla del
--    cierre no exista — que es la peor combinación posible.
-- ------------------------------------------------------------
create or replace function public.rubro_cierra_el_dia(p_rubro text)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p_rubro, 'comercio') in ('comercio', 'servicios');
$fn$;

grant execute on function public.rubro_cierra_el_dia(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. CAMBIAR DE RUBRO
--
--    NO borra nada. Cambiar de rubro cambia palabras, categorías sugeridas y
--    qué pantallas se ven; los datos quedan donde están. Si alguien vuelve
--    atrás, los encuentra intactos.
-- ------------------------------------------------------------
create or replace function public.cambiar_rubro(p_empresa uuid, p_rubro text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el propietario o un administrador puede cambiar el rubro.'
      using errcode = '42501';
  end if;

  if p_rubro not in ('comercio', 'ganaderia', 'agricultura', 'servicios') then
    raise exception 'Rubro desconocido: %', p_rubro using errcode = '22023';
  end if;

  select rubro into v_antes from public.empresas where id = p_empresa;
  if v_antes is null then
    raise exception 'Esa empresa no existe.' using errcode = 'P0002';
  end if;

  update public.empresas set rubro = p_rubro where id = p_empresa;

  return jsonb_build_object('rubro', p_rubro, 'antes', v_antes);
end $fn$;

revoke all on function public.cambiar_rubro(uuid, text) from public, anon;
grant execute on function public.cambiar_rubro(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 5. CREAR EMPRESA · ahora también con rubro
--
--    Redefinición de la versión de la 016. Lo único que cambia: recibe el
--    rubro. Una cuenta personal no tiene rubro de negocio —no vende nada—
--    así que se le fuerza 'comercio', que es el neutro y del que no ve
--    ninguna pantalla de comercio igual.
-- ------------------------------------------------------------
create or replace function public.crear_empresa(
  p_nombre text,
  p_moneda text default 'PYG',
  p_nombre_usuario text default null,
  p_zona text default 'America/Asuncion',
  p_tipo_cuenta text default 'emprendedor',
  p_rubro text default 'comercio'
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

  insert into public.empresas (nombre, moneda, creada_por, zona_horaria, tipo_cuenta, rubro)
  values (trim(p_nombre), coalesce(p_moneda, 'PYG'), auth.uid(),
          coalesce(nullif(trim(p_zona), ''), 'America/Asuncion'), v_tipo, v_rubro)
  returning id into v_id;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Propietario'), 'propietario');

  insert into public.empresa_accesos (empresa_id, codigo)
  values (v_id, v_codigo);

  -- La prueba se escribe acá directamente y no llamando a iniciar_prueba()
  -- porque esa función es de service_role: quien crea la empresa es un
  -- usuario común, y no queremos otorgarle ese permiso para esto.
  v_fin := now() + make_interval(days => public.dias_de_prueba(v_tipo));
  insert into public.suscripciones (empresa_id, plan, estado, periodo_inicio, periodo_fin, prueba_fin)
  values (v_id, 'pro', 'prueba', now(), v_fin, v_fin);

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas set plan = 'pro' where id = v_id;
  perform set_config('orden.suscripcion_confiable', '0', true);

  return v_id;
end $fn$;

-- La firma de 5 argumentos queda muerta: si no se borra, PostgREST ve dos
-- funciones con el mismo nombre y no sabe cuál llamar.
drop function if exists public.crear_empresa(text, text, text, text, text);

revoke all on function public.crear_empresa(text, text, text, text, text, text)
  from public, anon;
grant execute on function public.crear_empresa(text, text, text, text, text, text)
  to authenticated;

-- ------------------------------------------------------------
-- 6. EL RECORDATORIO NO LE LLEGA A QUIEN NO CIERRA EL DÍA
--
--    Redefine `empresas_sin_cargar_hoy()` de la 008, con la MISMA firma y
--    la misma forma de respuesta: lo único que se agrega es el filtro por
--    rubro. Cambiarle el tipo de retorno habría roto la tarea de la noche
--    en silencio.
--
--    Sin este filtro, un ganadero recibiría todas las noches un «no
--    cargaste nada hoy» — y no cargó nada porque no tenía nada que cargar.
--    Es la forma más rápida de que alguien apague los avisos y no los
--    vuelva a encender nunca.
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
    where public.rubro_cierra_el_dia(e.rubro)
      and r.hasta = (now() at time zone e.zona_horaria)::date - 1
      and r.largo >= greatest(p_racha_minima, 1)
  ) s;

  return v_res;
end $fn$;

revoke all on function public.empresas_sin_cargar_hoy(integer) from public, anon, authenticated;
grant execute on function public.empresas_sin_cargar_hoy(integer) to service_role;
