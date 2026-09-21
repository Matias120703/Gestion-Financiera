-- ============================================================
-- 087 · UN RUBRO PARA QUIEN VENDE CLASES
-- ============================================================
--
-- Matías quiere que Orden sirva también a quien da clases: profes de inglés,
-- de matemática, de música, de programación, presenciales u online.
--
-- POR QUÉ NO ALCANZA CON «SERVICIOS Y OFICIOS»
--
-- Un plomero y un profe de inglés se parecen en que los dos venden su
-- tiempo, y ahí se termina el parecido:
--
--   · El plomero cobra un trabajo y se termina. El profe tiene ALUMNOS, que
--     vuelven todas las semanas durante meses.
--   · El plomero factura un arreglo. El profe vende OCHO CLASES juntas y
--     después las va dando.
--   · El plomero gasta en cemento y repuestos. El profe gasta en internet,
--     en el micrófono y en la plataforma que le come una comisión.
--
-- Meterlos en la misma puerta le deja a cada uno la mitad de las palabras
-- equivocadas. Y hay un motivo más concreto: los paquetes de clases se van a
-- prender solo acá, y no en la barbería, donde no significan nada.
--
-- QUÉ HACE ESTA MIGRACIÓN Y QUÉ NO
--
-- Solo abre la puerta: que el rubro exista, que tenga sus categorías de
-- gasto y que se pueda elegir. Los paquetes vienen aparte, en su propia
-- migración, porque tocan plata y esto no toca nada.
--
-- LA LISTA ESTABA ESCRITA CUATRO VECES
--
-- En el constraint de `empresas`, en `cambiar_rubro`, en `crear_empresa` y,
-- de refilón, en `categorias_de_rubro`. Cuatro copias que tienen que decir
-- lo mismo o el rubro se rompe de una forma particularmente fea: la peor es
-- la de `crear_empresa`, que a un rubro que no conoce NO lo rechaza —lo
-- convierte en 'comercio' sin avisar—. Alguien elegiría «Clases y cursos»,
-- vería la pantalla de un almacén, y no habría ningún error en ningún lado.
--
-- Así que primero se deja una sola lista y después se agrega el rubro. El
-- que viene detrás —personal trainer— va a ser una línea.

-- ------------------------------------------------------------
-- 1. LA ÚNICA LISTA DE RUBROS
--
--    `immutable` para poder usarla dentro de un CHECK. Que no revalide las
--    filas viejas al cambiarla no es un problema acá: esta lista solo crece.
-- ------------------------------------------------------------
create or replace function public.rubros_validos()
returns text[] language sql immutable set search_path = public as $fn$
  select array['comercio', 'ganaderia', 'agricultura', 'servicios', 'clases'];
$fn$;

grant execute on function public.rubros_validos() to anon, authenticated;

alter table public.empresas drop constraint if exists empresas_rubro_check;
alter table public.empresas
  add constraint empresas_rubro_check
  check (rubro = any (public.rubros_validos()));

-- ------------------------------------------------------------
-- 2. EN QUÉ GASTA QUIEN DA CLASES
--
--    Se redefine la versión de DOS argumentos, que es la que vive desde la
--    024. Crear una de un argumento al lado sería dejar una función muerta:
--    la app llama a la de dos, y el rubro nuevo caería en el `else` —las
--    categorías de un almacén— sin que nada fallara.
--
--    Con pistas, como todas: un nombre de categoría solo no alcanza para que
--    el modelo clasifique bien lo que se dicta. «Pagué el Zoom» tiene que
--    caer en Internet y plataformas, no en Otros.
--
--    La categoría que ningún otro rubro tiene es «Comisiones»: quien enseña
--    por Preply, Superprof o Italki no cobra lo que factura, cobra lo que
--    queda después de que la plataforma se lleve su parte. Sin esa
--    categoría, esa mordida se reparte entre «Otros» y la nada, y el profe
--    nunca ve cuánto le cuesta de verdad conseguir alumnos ahí.
-- ------------------------------------------------------------
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

    when coalesce(p_rubro, 'comercio') = 'clases' then jsonb_build_array(
      jsonb_build_object('nombre','Internet y plataformas','pistas','internet, wifi, Zoom, Meet, plan del celular, hosting'),
      jsonb_build_object('nombre','Comisiones','pistas','Preply, Italki, Superprof, lo que se lleva la plataforma, comisión de cobro'),
      jsonb_build_object('nombre','Material','pistas','libros, licencias, PDF, impresiones, fotocopias, cuadernos'),
      jsonb_build_object('nombre','Equipo','pistas','notebook, micrófono, cámara, auriculares, tablet, pizarra, luz'),
      jsonb_build_object('nombre','Publicidad','pistas','anuncios, Instagram, Facebook, volantes'),
      jsonb_build_object('nombre','Capacitación','pistas','cursos propios, certificaciones, exámenes, membresías'),
      jsonb_build_object('nombre','Alquiler','pistas','aula, salón, espacio de trabajo'),
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
-- 3. SÍ CIERRA EL DÍA
--
--    Un profe da sus clases hoy y las cobra hoy: el día es su unidad, igual
--    que la de un peluquero. Por eso tiene cierre y tiene racha.
--
--    Es lo contrario del ganadero, que vende tres veces al año: a él se le
--    apagó justamente para no decirle todas las noches que no cargó nada.
--
--    También acá se redefine la de dos argumentos: la cuenta personal no
--    cierra el día sea cual sea su rubro, y esa regla no se puede perder.
-- ------------------------------------------------------------
create or replace function public.rubro_cierra_el_dia(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p_tipo_cuenta, 'emprendedor') <> 'personal'
     and coalesce(p_rubro, 'comercio') in ('comercio', 'servicios', 'clases');
$fn$;

grant execute on function public.rubro_cierra_el_dia(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. CAMBIAR DE RUBRO, CONTRA LA LISTA ÚNICA
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

  if not (p_rubro = any (public.rubros_validos())) then
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
-- 5. CREAR LA EMPRESA, TAMBIÉN CONTRA LA LISTA ÚNICA
--
--    Copia exacta de la versión que está viva (023), con UNA línea
--    cambiada: la que decide `v_rubro`. Se transcribe entera porque
--    PostgreSQL no sabe reemplazar un pedazo del cuerpo de una función.
--
--    Sigue cayendo a 'comercio' cuando el rubro no existe, y eso queda a
--    propósito: en el alta, rechazar es dejar a alguien afuera de Orden por
--    un dato que se arregla después en Ajustes. Lo que cambia es que ahora
--    'clases' sí está en la lista, que era el agujero.
-- ------------------------------------------------------------
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
    when p_rubro = any (public.rubros_validos()) then p_rubro
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

revoke all on function public.crear_empresa(text, text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.crear_empresa(text, text, text, text, text, text, text, text, text)
  to authenticated;
