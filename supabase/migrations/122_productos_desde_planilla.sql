-- ============================================================
-- 122 · LOS PRODUCTOS, DESDE UNA PLANILLA
-- ============================================================
--
-- Matías (01/10/2026): «Muchos negocios se manejan en planillas donde tienen
-- sus productos, costos, ventas. Nadie va a anotar uno por uno sus miles de
-- productos. Que en Productos se pueda subir el Excel o el Google Sheet como
-- lo tengan, y automáticamente se cargue y se acomode todo: el producto, el
-- costo, por cuánto venden, y aparezcan en Vender con el precio».
--
-- Productos → «Subir planilla». La pantalla lee el archivo y entiende qué es
-- cada columna (src/lib/catalogo-planilla.ts), lo muestra para revisar, y
-- guarda acá POR TANDAS de hasta 1.000 filas, todo o nada por tanda: 20.000
-- productos son 20 pedidos chicos, cada uno muy por debajo de los 8 s del
-- statement_timeout de `authenticated` (medido en PGlite: 0,5 a 0,75 s por
-- tanda, con los disparadores de siempre).
--
-- LO QUE HACE
--   1. productos.codigo (el código de barras, el SKU o el código interno) y
--      productos.unidad (kg, un, lt). Opcionales. El código no se repite
--      dentro de un negocio (índice único parcial: los que no tienen, no
--      cuentan, y los productos de hoy no tienen ninguno).
--   2. clave_producto(nombre): el nombre para comparar (minúsculas, sin
--      tildes en las vocales, sin espacios invisibles ni de más), con su
--      índice. «yerba  mate pajarito» encuentra a «Yerba Mate Pajarito».
--   3. importar_productos(empresa, filas, opciones): crea o actualiza.
--      Empareja por código (000123 es 123: codigo_sin_ceros); si no, por el
--      nombre (la clave). Lo que ya existe se ACTUALIZA, sin duplicar. Un
--      código que es de un producto con el nombre de OTRO no toca a ninguno.
--      NUNCA escribe en movimientos: el stock inicial es lo que ya había en
--      el local, no una compra de mercadería (punto 5 de lo acordado con Matías).
--   4. cotejar_productos(empresa, filas): para la revisión, antes de
--      guardar, cuáles ya existen y cuáles son nuevos. Solo lee.
--   5. listar_productos: copia exacta de la 006 más codigo y unidad.
--
-- PERMISOS Y CANDADOS
--   · Solo administración (propietario o admin), como la policy
--     productos_insert (002): un vendedor no carga catálogo.
--   · Una cuenta personal no tiene productos (tampoco en Gratis).
--   · Negocio vencido: el mismo mensaje del candado (069/111), dicho una vez
--     antes de empezar; el disparador cuenta_activa_productos lo vuelve a
--     mirar en cada fila.
--   · Ningún plan limita la cantidad de productos (limites_plan no tiene esa
--     clave): si algún día lo hace, el tope va acá.
--
-- La costumbre de la 113: los caracteres invisibles se escriben con chr(),
-- nunca pegados (pegados se volvían espacios comunes al aplicar la migración).
-- ============================================================


-- ------------------------------------------------------------
-- 1. CÓDIGO Y UNIDAD
-- ------------------------------------------------------------
alter table public.productos add column if not exists codigo text;
alter table public.productos add column if not exists unidad text;

do $$ begin
  alter table public.productos add constraint productos_codigo_valido
    check (codigo is null or (char_length(codigo) between 1 and 60 and codigo = btrim(codigo)));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.productos add constraint productos_unidad_valida
    check (unidad is null or char_length(unidad) between 1 and 12);
exception when duplicate_object then null; end $$;

create unique index if not exists productos_codigo_unico
  on public.productos (empresa_id, codigo) where codigo is not null;

-- La lectura por columna (003): el código y la unidad no son sensibles, los
-- lee cualquiera de la cuenta, como el nombre. El costo sigue cerrado.
grant select (codigo, unidad) on public.productos to authenticated;

-- El código para comparar: uno de solo cifras no cambia por los ceros de
-- adelante. El Excel con formato «000000» muestra 000123, el sistema de caja
-- exporta 000123 y otra planilla lo guardó 123: es el mismo producto, no un
-- duplicado «Yerba (000123)». Los códigos con letras, tal cual. La misma
-- regla vive en src/lib/codigo-producto.ts (`codigoSinCeros`, también en
-- Vender para el lector de barras), y pruebas/productos-planilla.test.js pasa
-- los mismos códigos por las dos.
create or replace function public.codigo_sin_ceros(p_codigo text)
returns text language sql immutable parallel safe set search_path = public as $fn$
  select case when p_codigo ~ '^[0-9]+$'
              then coalesce(nullif(ltrim(p_codigo, '0'), ''), '0')
              else p_codigo end;
$fn$;

revoke all on function public.codigo_sin_ceros(text) from public, anon;
grant execute on function public.codigo_sin_ceros(text) to authenticated, service_role;

-- Con su índice: emparejar 1.000 filas por código no recorre el catálogo.
create index if not exists productos_codigo_sin_ceros_idx
  on public.productos (empresa_id, public.codigo_sin_ceros(codigo));


-- ------------------------------------------------------------
-- 2. EL NOMBRE PARA COMPARAR
--
--    Minúsculas; sin tilde en las vocales (español y portugués: «Azucar» y
--    «Azúcar» son el mismo; la ñ y la ç se quedan, y bajan a minúscula acá
--    mismo, sin depender del idioma de la base); el espacio duro de WhatsApp
--    (U+00A0), el de cifras (U+2007), el fino (U+202F), el tabulador y los
--    saltos de línea son espacios; los de ancho cero (U+200B, U+2060,
--    U+FEFF) no son nada; los espacios seguidos, uno.
--
--    La misma regla vive en src/lib/catalogo-planilla.ts (`claveProducto`),
--    y pruebas/productos-planilla.test.js pasa las mismas frases por las dos.
-- ------------------------------------------------------------
create or replace function public.clave_producto(p_nombre text)
returns text language sql immutable parallel safe set search_path = public as $fn$
  select btrim(regexp_replace(lower(translate(coalesce(p_nombre, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜáàâãäéèêëíìîïóòôõöúùûüÑÇ'
      || chr(160) || chr(8199) || chr(8239) || chr(9) || chr(10) || chr(13)
      || chr(8203) || chr(8288) || chr(65279),
    'AAAAAEEEEIIIIOOOOOUUUUaaaaaeeeeiiiiooooouuuuñç' || '      ')), ' {2,}', ' ', 'g'));
$fn$;

revoke all on function public.clave_producto(text) from public, anon;
grant execute on function public.clave_producto(text) to authenticated, service_role;

-- Por qué índice y no `unique`: en un negocio puede haber «Coca» y «coca» ya
-- cargados a mano; un único sobre la clave haría fallar esta migración.
-- importar_productos elige el del mismo tipo, activo y más viejo.
create index if not exists productos_clave_idx
  on public.productos (empresa_id, public.clave_producto(nombre));

-- Cuántas filas entran en una tanda. 1.000 filas de catálogo son ~150 KB de
-- JSON. La pantalla manda tandas de este tamaño (TANDA_IMPORTAR).
create or replace function public.tope_importar_productos() returns integer
  language sql immutable set search_path = public as $fn$ select 1000 $fn$;

revoke all on function public.tope_importar_productos() from public, anon;
grant execute on function public.tope_importar_productos() to authenticated;


-- ------------------------------------------------------------
-- 3. IMPORTAR UNA TANDA
--
--    p_filas: [{ fila, codigo?, nombre, categoria?, costo?, precio?, stock?,
--                stock_minimo?, unidad?, servicio? }]. `fila` es el número de
--    fila de la planilla (para decir «fila 37» en lo que no se cargó). Un
--    dato que no viene (o viene null) NO SE TOCA al actualizar, y al crear
--    toma lo de siempre (General, 0). `servicio`: si la fila es un servicio
--    (una tabla «Servicio | Precio» de la barbería); sin él, lo que diga
--    p_opciones.tipo.
--
--    p_opciones: { tipo: 'productos' | 'servicios', stock: 'reemplazar' |
--    'no_tocar' }. Un servicio no tiene costo ni stock (como el diálogo).
--
--    Emparejar, en este orden:
--      a. por código, si la fila trae código, sin mirar los ceros de adelante
--         de un código de solo cifras (codigo_sin_ceros; el igualito, primero);
--      b. por nombre (la clave), entre los que NO tienen código si la fila
--         trae código (el primer import con códigos sobre un catálogo cargado
--         a mano adopta el código), o entre todos si no trae. Primero los del
--         mismo tipo, después los activos, después el más viejo.
--    Si lo encontrado POR CÓDIGO se llama distinto y el nombre de la fila es
--    el de OTRO producto, no se toca ninguno: va en `omitidos` con motivo
--    'codigo_de_otro'. Es un código roto (el «7,84E+12» que Excel dejó igual
--    en todas las filas): sin esto, la Coca-Cola de la planilla le ponía su
--    precio, su costo y su stock al agua que tenía ese código.
--    Si lo encontrado es del otro tipo (un servicio y la fila es producto),
--    no se toca: va en `omitidos` con motivo 'otro_tipo'.
--
--    Crear necesita precio: un producto nuevo sin precio va a `omitidos`
--    ('sin_precio'). Si el nombre exacto ya lo usa otro producto (otro
--    código: dos proveedores), se crea «Nombre (código)» y se avisa en
--    `renombrados`: unique (empresa_id, nombre) es de la 001.
--
--    Actualizar: precio, costo, stock (si 'reemplazar'), categoría, mínimo,
--    unidad; el código si no tenía; el nombre solo si se emparejó por código
--    y el nombre nuevo está libre. Un pausado vuelve a la venta (está en la
--    planilla: lo vende). Sin cambios de verdad no se escribe nada y cuenta
--    en `sin_cambios`: subir dos veces la misma planilla no ensucia nada, y
--    seguir una subida cortada desde el principio es seguro.
--
--    Todo o nada por tanda: una fila mal armada (lo que la pantalla ya
--    filtró y alguien mandó igual) frena la tanda entera con su número.
-- ------------------------------------------------------------
create or replace function public.importar_productos(
  p_empresa  uuid,
  p_filas    jsonb,
  p_opciones jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_tipo         text := coalesce(nullif(coalesce(p_opciones, '{}'::jsonb) ->> 'tipo', ''), 'productos');
  v_modo_stock   text := coalesce(nullif(coalesce(p_opciones, '{}'::jsonb) ->> 'stock', ''), 'reemplazar');
  v_servicio     boolean;
  v_x            jsonb;
  v_fila         integer;
  v_nombre       text;
  v_clave        text;
  v_codigo       text;
  v_categoria    text;
  v_unidad       text;
  v_costo        numeric;
  v_precio       numeric;
  v_stock        numeric;
  v_minimo       numeric;
  v_campo        text;
  v_prod         public.productos%rowtype;
  v_hallado      boolean;
  v_por_codigo   boolean;
  v_final        text;
  v_sufijo       text;
  v_cambio       integer;
  v_creados      integer := 0;
  v_actualizados integer := 0;
  v_reactivados  integer := 0;
  v_iguales      integer := 0;
  v_renombrados  jsonb := '[]'::jsonb;
  v_omitidos     jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if not public.es_admin(p_empresa) then
    raise exception 'Subir productos es del dueño o de un administrador.' using errcode = '42501';
  end if;
  if exists (select 1 from public.empresas e where e.id = p_empresa and e.tipo_cuenta = 'personal') then
    raise exception 'Una cuenta personal no lleva productos.' using errcode = '42501';
  end if;
  -- El candado de cuenta vencida (069/111), dicho antes de empezar. El
  -- disparador cuenta_activa_productos lo vuelve a mirar en cada fila.
  if not public.puede_cargar(p_empresa) then
    raise exception 'Se te terminó la prueba. Para seguir usando Orden hace falta activar tu plan.'
      using errcode = '42501';
  end if;
  if v_tipo not in ('productos', 'servicios') or v_modo_stock not in ('reemplazar', 'no_tocar') then
    raise exception 'Las opciones de la importación no son válidas.' using errcode = '22023';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No llegó ningún producto para cargar.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > public.tope_importar_productos() then
    raise exception 'Mandá hasta 1.000 productos por vez.' using errcode = '22023';
  end if;

  -- Una importación por negocio a la vez: dos pestañas con la misma
  -- planilla no crean el mismo código dos veces.
  perform pg_advisory_xact_lock(hashtext('importar_productos:' || p_empresa::text));

  for v_x in select x from jsonb_array_elements(p_filas) as t(x) loop
    if jsonb_typeof(v_x) <> 'object' then
      raise exception 'La planilla llegó mal armada. Volvé a subirla.' using errcode = '22023';
    end if;
    v_fila := case
      when jsonb_typeof(v_x -> 'fila') = 'number' and (v_x ->> 'fila')::numeric between 0 and 1000000
        then (v_x ->> 'fila')::numeric::integer
      else 0 end;

    -- Los montos: números JSON o nada. Lo que la pantalla ya leyó de
    -- «Gs. 15.000» llega como 15000; un texto acá es un pedido armado a mano.
    foreach v_campo in array array['costo', 'precio', 'stock', 'stock_minimo'] loop
      if jsonb_typeof(v_x -> v_campo) not in ('number', 'null') then
        raise exception 'La fila % tiene un número que no se entiende.', v_fila using errcode = '22023';
      end if;
    end loop;
    if jsonb_typeof(v_x -> 'servicio') not in ('boolean', 'null') then
      raise exception 'La planilla llegó mal armada. Volvé a subirla.' using errcode = '22023';
    end if;
    v_costo  := round((v_x ->> 'costo')::numeric, 2);
    v_precio := round((v_x ->> 'precio')::numeric, 2);
    v_stock  := round((v_x ->> 'stock')::numeric, 2);
    v_minimo := round((v_x ->> 'stock_minimo')::numeric, 2);
    if v_costo < 0 or v_precio < 0 or v_minimo < 0 then
      raise exception 'La fila % tiene un monto negativo.', v_fila using errcode = '22023';
    end if;
    if greatest(v_costo, v_precio, abs(v_stock), v_minimo) >= 1000000000000 then
      raise exception 'La fila % tiene un número demasiado grande.', v_fila using errcode = '22023';
    end if;

    -- El nombre, limpio como lo deja el diálogo (y sin espacios invisibles).
    v_nombre := btrim(left(btrim(regexp_replace(translate(coalesce(v_x ->> 'nombre', ''),
      chr(160) || chr(8199) || chr(8239) || chr(9) || chr(10) || chr(13) || chr(8203) || chr(8288) || chr(65279),
      '      '), ' {2,}', ' ', 'g')), 120));
    if v_nombre = '' then
      raise exception 'La fila % no tiene nombre.', v_fila using errcode = '22023';
    end if;
    v_clave     := public.clave_producto(v_nombre);
    v_codigo    := nullif(btrim(left(btrim(coalesce(v_x ->> 'codigo', '')), 60)), '');
    v_categoria := nullif(btrim(left(btrim(coalesce(v_x ->> 'categoria', '')), 40)), '');
    v_unidad    := nullif(btrim(left(btrim(coalesce(v_x ->> 'unidad', '')), 12)), '');
    v_servicio  := coalesce((v_x ->> 'servicio')::boolean, v_tipo = 'servicios');
    -- Un servicio no tiene costo ni stock (PantallaProductos, el diálogo).
    if v_servicio then
      v_costo := null;
      v_stock := null;
      v_minimo := null;
    end if;

    -- a. Por código (000123 es 123; el igualito, primero).
    v_hallado := false;
    v_por_codigo := false;
    if v_codigo is not null then
      select * into v_prod from public.productos p
      where p.empresa_id = p_empresa
        and public.codigo_sin_ceros(p.codigo) = public.codigo_sin_ceros(v_codigo)
      order by (p.codigo = v_codigo) desc, p.created_at
      limit 1
      for update;
      v_hallado := found;
      v_por_codigo := found;
      -- El código es de un producto y el nombre, de OTRO: no se toca ninguno.
      if v_hallado and public.clave_producto(v_prod.nombre) <> v_clave
         and exists (select 1 from public.productos o
                     where o.empresa_id = p_empresa and o.id <> v_prod.id
                       and public.clave_producto(o.nombre) = v_clave) then
        v_omitidos := v_omitidos || jsonb_build_object('fila', v_fila, 'nombre', v_nombre, 'motivo', 'codigo_de_otro');
        continue;
      end if;
    end if;
    -- b. Por nombre.
    if not v_hallado then
      select * into v_prod from public.productos p
      where p.empresa_id = p_empresa
        and public.clave_producto(p.nombre) = v_clave
        and (v_codigo is null or p.codigo is null)
      order by (p.controla_stock = not v_servicio) desc, p.activo desc, p.created_at
      limit 1
      for update;
      v_hallado := found;
    end if;

    if v_hallado then
      if v_prod.controla_stock = v_servicio then
        v_omitidos := v_omitidos || jsonb_build_object('fila', v_fila, 'nombre', v_nombre, 'motivo', 'otro_tipo');
        continue;
      end if;

      v_final := v_prod.nombre;
      if v_por_codigo and v_nombre <> v_prod.nombre
         and not exists (select 1 from public.productos o
                         where o.empresa_id = p_empresa and o.nombre = v_nombre and o.id <> v_prod.id) then
        v_final := v_nombre;
      end if;

      update public.productos p set
        nombre       = v_final,
        codigo       = coalesce(p.codigo, v_codigo),
        categoria    = coalesce(v_categoria, p.categoria),
        precio       = coalesce(v_precio, p.precio),
        costo        = coalesce(v_costo, p.costo),
        stock        = case when v_modo_stock = 'reemplazar' then coalesce(v_stock, p.stock) else p.stock end,
        stock_minimo = coalesce(v_minimo, p.stock_minimo),
        unidad       = coalesce(v_unidad, p.unidad),
        activo       = true
      where p.id = v_prod.id
        and (p.nombre, p.codigo, p.categoria, p.precio, p.costo, p.stock, p.stock_minimo, p.unidad, p.activo)
            is distinct from
            (v_final, coalesce(p.codigo, v_codigo), coalesce(v_categoria, p.categoria),
             coalesce(v_precio, p.precio), coalesce(v_costo, p.costo),
             case when v_modo_stock = 'reemplazar' then coalesce(v_stock, p.stock) else p.stock end,
             coalesce(v_minimo, p.stock_minimo), coalesce(v_unidad, p.unidad), true);
      get diagnostics v_cambio = row_count;
      if v_cambio > 0 then
        v_actualizados := v_actualizados + 1;
        if not v_prod.activo then v_reactivados := v_reactivados + 1; end if;
      else
        v_iguales := v_iguales + 1;
      end if;
      continue;
    end if;

    -- Nuevo.
    if v_precio is null then
      v_omitidos := v_omitidos || jsonb_build_object('fila', v_fila, 'nombre', v_nombre, 'motivo', 'sin_precio');
      continue;
    end if;

    v_final := v_nombre;
    if exists (select 1 from public.productos o where o.empresa_id = p_empresa and o.nombre = v_final) then
      v_sufijo := ' (' || coalesce(v_codigo, '2') || ')';
      v_final := btrim(left(v_nombre, 120 - char_length(v_sufijo))) || v_sufijo;
      if char_length(v_final) > 120
         or exists (select 1 from public.productos o where o.empresa_id = p_empresa and o.nombre = v_final) then
        v_omitidos := v_omitidos || jsonb_build_object('fila', v_fila, 'nombre', v_nombre, 'motivo', 'nombre_repetido');
        continue;
      end if;
      v_renombrados := v_renombrados || jsonb_build_object('fila', v_fila, 'nombre', v_final);
    end if;

    insert into public.productos
      (empresa_id, nombre, codigo, categoria, costo, precio, stock, stock_minimo, controla_stock, unidad)
    values
      (p_empresa, v_final, v_codigo, coalesce(v_categoria, 'General'), coalesce(v_costo, 0), v_precio,
       coalesce(v_stock, 0), coalesce(v_minimo, 0), not v_servicio, v_unidad);
    v_creados := v_creados + 1;
  end loop;

  return jsonb_build_object(
    'creados', v_creados, 'actualizados', v_actualizados, 'reactivados', v_reactivados,
    'sin_cambios', v_iguales, 'renombrados', v_renombrados, 'omitidos', v_omitidos);
end $fn$;

revoke all on function public.importar_productos(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.importar_productos(uuid, jsonb, jsonb) to authenticated;


-- ------------------------------------------------------------
-- 4. COTEJAR ANTES DE GUARDAR (solo lee)
--
--    p_filas: [{ codigo?, nombre, servicio? }] en el orden de la planilla
--    (hasta 5.000 por pedido). Devuelve un array del mismo largo, con la
--    misma regla de emparejar que importar_productos: 'nuevo', 'existe',
--    'pausado' (existe y vuelve a la venta), 'otro_tipo' o 'codigo_de_otro'
--    (su código es de otro producto: la revisión lo muestra antes de
--    guardar). Para «se crean 1.200, se actualizan 340» antes de tocar nada.
-- ------------------------------------------------------------
create or replace function public.cotejar_productos(
  p_empresa uuid,
  p_filas   jsonb,
  p_tipo    text default 'productos'
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_servicio boolean := coalesce(p_tipo, 'productos') = 'servicios';
  v_res      jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if not public.es_admin(p_empresa) then
    raise exception 'Subir productos es del dueño o de un administrador.' using errcode = '42501';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 5000 then
    raise exception 'La planilla llegó mal armada. Volvé a subirla.' using errcode = '22023';
  end if;

  with f as (
    select t.ord,
           nullif(btrim(left(btrim(coalesce(t.x ->> 'codigo', '')), 60)), '') as codigo,
           public.clave_producto(t.x ->> 'nombre') as clave,
           case when jsonb_typeof(t.x -> 'servicio') = 'boolean' then (t.x ->> 'servicio')::boolean else v_servicio end as servicio
    from jsonb_array_elements(p_filas) with ordinality as t(x, ord)
  )
  select coalesce(jsonb_agg(
           case
             when h.controla_stock is null then 'nuevo'
             when h.orden = 0 and h.clave <> f.clave
                  and exists (select 1 from public.productos o
                              where o.empresa_id = p_empresa and o.id <> h.id
                                and public.clave_producto(o.nombre) = f.clave) then 'codigo_de_otro'
             when h.controla_stock = f.servicio then 'otro_tipo'
             when not h.activo then 'pausado'
             else 'existe'
           end order by f.ord), '[]'::jsonb)
  into v_res
  from f
  left join lateral (
    select x.id, x.controla_stock, x.activo, x.orden, x.clave from (
      select * from (
        select p.id, p.controla_stock, p.activo, 0 as orden, public.clave_producto(p.nombre) as clave
        from public.productos p
        where f.codigo is not null and p.empresa_id = p_empresa
          and public.codigo_sin_ceros(p.codigo) = public.codigo_sin_ceros(f.codigo)
        order by (p.codigo = f.codigo) desc, p.created_at
        limit 1
      ) c
      union all
      select * from (
        select p.id, p.controla_stock, p.activo, 1 as orden, public.clave_producto(p.nombre) as clave
        from public.productos p
        where p.empresa_id = p_empresa
          and public.clave_producto(p.nombre) = f.clave
          and (f.codigo is null or p.codigo is null)
        order by (p.controla_stock = not f.servicio) desc, p.activo desc, p.created_at
        limit 1
      ) n
    ) x
    order by x.orden
    limit 1
  ) h on true;

  return v_res;
end $fn$;

revoke all on function public.cotejar_productos(uuid, jsonb, text) from public, anon;
grant execute on function public.cotejar_productos(uuid, jsonb, text) to authenticated;


-- ------------------------------------------------------------
-- 5. EL CATÁLOGO, CON CÓDIGO Y UNIDAD (006:43-73)
--
--    Copia exacta de la 006 más `codigo` y `unidad`, marcados «122». Mismo
--    envoltorio (un solo jsonb), mismos permisos: el costo sigue llegando
--    solo a administración.
-- ------------------------------------------------------------
create or replace function public.listar_productos(
  p_empresa uuid,
  p_incluir_pausados boolean default false
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean;
  v_res   jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_admin := public.es_admin(p_empresa);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.nombre), '[]'::jsonb) into v_res
  from (
    select
      p.id, p.empresa_id, p.nombre, p.categoria,
      case when v_admin then p.costo else null end as costo,
      p.precio, p.stock, p.stock_minimo, p.controla_stock, p.activo, p.created_at,
      -- 122: el código (para buscar o escanear) y la unidad.
      p.codigo, p.unidad
    from public.productos p
    where p.empresa_id = p_empresa
      and (p_incluir_pausados or p.activo)
  ) x;

  return v_res;
end $$;

revoke all on function public.listar_productos(uuid, boolean) from public, anon;
grant execute on function public.listar_productos(uuid, boolean) to authenticated;
