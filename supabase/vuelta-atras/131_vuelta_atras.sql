-- ============================================================
-- VUELTA ATRÁS DE LA 131 · LA BILLETERA EN OTRAS MONEDAS
-- ============================================================
--
-- NO ES UNA MIGRACIÓN. Vive fuera de supabase/migrations a propósito: todo
-- .sql de esa carpeta va a parar a schema.sql. Se corre a mano, una sola
-- vez, y solo si hay que sacar la 131 de la base.
--
-- CUÁNDO SIRVE, Y CUÁNDO YA NO
--
--   Sirve mientras NADIE haya creado una cuenta en otra moneda. Es lo
--   primero que mira: si hay alguna (activa o archivada), o algún
--   movimiento con su importe de cuenta, SE NIEGA y no toca nada. Sin la
--   131 el saldo de esa cuenta sumaría las dos monedas como si fueran una
--   (10.000 dólares + 1.000 dólares - 116.727 guaraníes = «-105.727») y
--   entraría en el total de siempre. Desde ese momento lo único que se
--   vuelve atrás es el código: el de antes sigue viendo números verdaderos
--   con la 131 puesta.
--
-- EL ORDEN NO ES OPCIONAL
--
--   1. La guarda.
--   2. Afuera el disparador y las cuatro funciones nuevas.
--   3. Afuera las tres firmas nuevas.
--   4. Las nueve funciones, de vuelta a su texto anterior (074, 118, 086,
--      085, 051), con los permisos de su migración de origen.
--   5. RECIÉN AHÍ las dos columnas, las dos restricciones y la tabla.
--
--   Al revés no: con la columna `monto_cuenta` quitada y el disparador de
--   la 131 todavía puesto, cargar cualquier movimiento de cualquier cuenta
--   falla («record "new" has no field "monto_cuenta"»).
--
--   Se manda ENTERO, de una vez (así va en una sola transacción: o queda
--   todo vuelto atrás o no cambia nada). No se corre por partes.
--
-- ANTES Y DESPUÉS
--
--   · Conviene volver antes al código anterior. El nuevo anda igual contra
--     una base sin la 131 (lo nuevo lo lee con «si falta, vacío»), pero no
--     tiene sentido dejarlo.
--   · Se pierden las cotizaciones escritas (la tabla se borra). No entran
--     en ningún saldo. Sin cuentas en otra moneda no hay nada más que perder.
--   · Las tres funciones que la 131 dejó solo para la sesión vuelven a
--     nacer como nacen todas en Supabase, y quedan como estaban antes de la
--     131: para la sesión y para la llave de servicio.
--   · La 131 se puede volver a aplicar encima cuando haga falta.
--
-- CÓMO ESTÁ ESCRITO
--
--   Cada función es, letra por letra, su última definición anterior a la
--   131 en supabase/migrations. pruebas/billetera-monedas.test.js lo
--   comprueba, y prueba el archivo entero en una base armada como
--   producción (con los privilegios por defecto de Supabase desde antes de
--   la 001): la 131 y después esto dejan el catálogo de la 130; con una
--   cuenta en otra moneda se niega sin tocar nada; aplicado dos veces no
--   falla. Sin barras invertidas (el MCP las duplica).
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA GUARDA
--
--    Mira todas las cuentas, también las archivadas: una archivada en
--    dólares conserva su saldo y sus pases. Si la 131 no está (o ya se
--    volvió atrás) las columnas no existen y no hay nada que cuidar.
-- ------------------------------------------------------------
do $guarda$
declare
  v_cuentas     integer := 0;
  v_movimientos integer := 0;
begin
  -- Desde la 132, «Tengo en total» usa las cotizaciones de la 131: primero se saca la 132.
  if to_regclass('public.bienes') is not null then
    raise exception 'Primero hay que volver atrás la 132 (supabase/vuelta-atras/132_vuelta_atras.sql): el patrimonio usa las cotizaciones de la 131.';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'cuentas_dinero' and column_name = 'moneda') then
    execute 'select count(*) from public.cuentas_dinero where moneda is not null' into v_cuentas;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'movimientos' and column_name = 'monto_cuenta') then
    execute 'select count(*) from public.movimientos where monto_cuenta is not null' into v_movimientos;
  end if;
  if v_cuentas > 0 or v_movimientos > 0 then
    raise exception 'Hay % cuentas en otra moneda y % movimientos con su importe de cuenta: sin la 131 se leerían en la moneda del negocio y entrarían en el total. La base ya no se vuelve atrás; lo que se vuelve atrás es el código.',
      v_cuentas, v_movimientos;
  end if;
end $guarda$;

-- ------------------------------------------------------------
-- 2. AFUERA EL DISPARADOR Y LAS CUATRO FUNCIONES NUEVAS
-- ------------------------------------------------------------
drop trigger if exists moneda_ajustes_cuenta on public.ajustes_cuenta;
drop function if exists public.moneda_ajustes_cuenta();
drop function if exists public.guardar_cotizacion_moneda(uuid, text, numeric);
drop function if exists public.deshacer_transferencia(uuid, uuid);
drop function if exists public.transferencias_de_cuenta(uuid, uuid, integer);

-- ------------------------------------------------------------
-- 3. AFUERA LAS TRES FIRMAS NUEVAS
--
--    Antes de volver a crear las de siempre: con las dos al lado, la
--    llamada del código publicado no sabría a cuál ir.
-- ------------------------------------------------------------
drop function if exists public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid, text, text);
drop function if exists public.transferir_entre_cuentas(uuid, uuid, uuid, numeric, text, numeric);
drop function if exists public.cuentas_para_elegir(uuid, boolean);

-- ------------------------------------------------------------
-- 4. LAS NUEVE FUNCIONES, COMO ESTABAN ANTES DE LA 131
-- ------------------------------------------------------------

-- saldo_cuenta_dinero · de 074_billetera.sql
create or replace function public.saldo_cuenta_dinero(p_cuenta uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select c.saldo_inicial
       + coalesce((select sum(case when m.tipo = 'gasto' then -m.monto else m.monto end)
                   from public.movimientos m
                   where m.cuenta_id = c.id and m.empresa_id = c.empresa_id and m.estado = 'activo'), 0)
       + coalesce((select sum(a.monto) from public.ajustes_cuenta a where a.cuenta_id = c.id), 0)
  from public.cuentas_dinero c
  where c.id = p_cuenta;
$fn$;

revoke all on function public.saldo_cuenta_dinero(uuid) from public, anon, authenticated;

-- anotar_en_su_cuenta · de 118_cuenta_archivada_no_recibe.sql
create or replace function public.anotar_en_su_cuenta()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'UPDATE' and new.metodo_pago is distinct from old.metodo_pago then
    -- Si se corrige la forma de pago, el movimiento se muda de cuenta.
    new.cuenta_id := public.cuenta_de_metodo(new.empresa_id, new.metodo_pago);
  elsif tg_op = 'UPDATE' and new.cuenta_id is distinct from old.cuenta_id
        and new.cuenta_id is not null
        and not exists (select 1 from public.cuentas_dinero c
                        where c.id = new.cuenta_id and c.empresa_id = new.empresa_id) then
    new.cuenta_id := old.cuenta_id;
  elsif tg_op = 'INSERT' then
    -- Una cuenta de OTRO negocio no se acepta aunque alguien arme el pedido a
    -- mano: sería meterle plata en el saldo de un desconocido. Una ARCHIVADA
    -- tampoco (118): la billetera no la muestra y la plata se perdía de vista.
    if new.cuenta_id is not null
       and not exists (select 1 from public.cuentas_dinero c
                       where c.id = new.cuenta_id and c.empresa_id = new.empresa_id and c.activa) then
      new.cuenta_id := null;
    end if;
    if new.cuenta_id is null then
      new.cuenta_id := public.cuenta_de_metodo(new.empresa_id, new.metodo_pago);
    end if;
  end if;
  return new;
end $fn$;

revoke all on function public.anotar_en_su_cuenta() from public, anon, authenticated;

-- guardar_cuenta_dinero · de 086_cada_cuenta_con_su_color.sql
create or replace function public.guardar_cuenta_dinero(
  p_empresa       uuid,
  p_nombre        text,
  p_tipo          text default 'banco',
  p_saldo_inicial numeric default 0,
  p_metodos       text[] default '{}',
  p_id            uuid default null,
  p_color         text default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id      uuid;
  v_metodos text[];
  v_color   text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre: el del banco, «Efectivo», «Tigo Money».' using errcode = '22023';
  end if;

  if coalesce(p_tipo, '') not in ('banco', 'efectivo', 'billetera') then
    raise exception 'Ese tipo de cuenta no existe.' using errcode = '22023';
  end if;

  -- Un color que no conocemos no es motivo para no guardar la cuenta: se
  -- deja en null y la pantalla elige. Lo que se pierde es una preferencia;
  -- lo que se salvaría rechazando, nada.
  v_color := case
    when p_color in ('verde', 'rojo', 'azul', 'celeste', 'naranja', 'violeta', 'rosa', 'gris')
    then p_color else null end;

  select coalesce(array_agg(distinct m), '{}') into v_metodos
  from unnest(coalesce(p_metodos, '{}')) m
  where m in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro');

  if p_id is null then
    if (select count(*) from public.cuentas_dinero where empresa_id = p_empresa and activa) >= 20 then
      raise exception 'Ya tenés 20 cuentas. Archivá alguna antes de sumar otra.' using errcode = '22023';
    end if;

    insert into public.cuentas_dinero (empresa_id, nombre, tipo, saldo_inicial, metodos, color, orden, creada_por)
    values (p_empresa, trim(p_nombre), p_tipo, coalesce(p_saldo_inicial, 0), v_metodos, v_color,
            coalesce((select max(orden) + 1 from public.cuentas_dinero where empresa_id = p_empresa), 0),
            auth.uid())
    returning id into v_id;
  else
    update public.cuentas_dinero
    set nombre = trim(p_nombre), tipo = p_tipo, metodos = v_metodos, color = v_color, updated_at = now()
    where id = p_id and empresa_id = p_empresa and activa
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
    end if;
  end if;

  -- Cada forma de pago, en una sola casa.
  update public.cuentas_dinero
  set metodos = array(select x from unnest(metodos) x where not (x = any (v_metodos))),
      updated_at = now()
  where empresa_id = p_empresa and id <> v_id and metodos && v_metodos;

  return v_id;
end $fn$;

revoke all on function public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid, text) from public, anon;
grant execute on function public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid, text) to authenticated;

-- transferir_entre_cuentas · de 074_billetera.sql
create or replace function public.transferir_entre_cuentas(
  p_empresa uuid,
  p_desde   uuid,
  p_hacia   uuid,
  p_monto   numeric,
  p_nota    text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_par uuid := gen_random_uuid();
  v_hoy date;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_desde = p_hacia then
    raise exception 'Elegí dos cuentas distintas.' using errcode = '22023';
  end if;

  if (select count(*) from public.cuentas_dinero
      where id in (p_desde, p_hacia) and empresa_id = p_empresa and activa) <> 2 then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  v_hoy := public.hoy_empresa(p_empresa);

  insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, par, fecha, nota, creado_por)
  values
    (p_empresa, p_desde, 'transferencia', -p_monto, v_par, v_hoy, left(coalesce(trim(p_nota), ''), 200), auth.uid()),
    (p_empresa, p_hacia, 'transferencia',  p_monto, v_par, v_hoy, left(coalesce(trim(p_nota), ''), 200), auth.uid());

  return jsonb_build_object('ok', true, 'par', v_par);
end $fn$;

revoke all on function public.transferir_entre_cuentas(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.transferir_entre_cuentas(uuid, uuid, uuid, numeric, text) to authenticated;

-- ajustar_saldo_cuenta · de 074_billetera.sql
create or replace function public.ajustar_saldo_cuenta(
  p_empresa    uuid,
  p_cuenta     uuid,
  p_saldo_real numeric,
  p_nota       text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo numeric;
  v_dif   numeric;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if p_saldo_real is null then
    raise exception 'Escribí cuánto dice tu banco que tenés.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.cuentas_dinero where id = p_cuenta and empresa_id = p_empresa and activa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  v_saldo := public.saldo_cuenta_dinero(p_cuenta);
  v_dif := round(p_saldo_real - v_saldo, 2);

  if v_dif <> 0 then
    insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, fecha, nota, creado_por)
    values (p_empresa, p_cuenta, 'ajuste', v_dif, public.hoy_empresa(p_empresa),
            left(coalesce(trim(p_nota), ''), 200), auth.uid());
  end if;

  return jsonb_build_object('ok', true, 'antes', v_saldo, 'ahora', p_saldo_real, 'diferencia', v_dif);
end $fn$;

revoke all on function public.ajustar_saldo_cuenta(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.ajustar_saldo_cuenta(uuid, uuid, numeric, text) to authenticated;

-- billetera · de 086_cada_cuenta_con_su_color.sql (permisos: 074_billetera.sql)
create or replace function public.billetera(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_cuentas jsonb;
  v_zona    text;
  v_sueltos record;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nombre', c.nombre,
    'tipo', c.tipo,
    'color', c.color,
    'metodos', to_jsonb(c.metodos),
    'saldo', s.saldo,
    -- Lo que se movió este mes por esta cuenta, para que el número no esté solo.
    'entro_mes', coalesce(mes.entro, 0),
    'salio_mes', coalesce(mes.salio, 0)
  ) order by c.orden, c.created_at), '[]'::jsonb)
  into v_cuentas
  from public.cuentas_dinero c
  cross join lateral (select public.saldo_cuenta_dinero(c.id) as saldo) s
  left join lateral (
    select
      sum(m.monto) filter (where m.tipo <> 'gasto') as entro,
      sum(m.monto) filter (where m.tipo = 'gasto')  as salio
    from public.movimientos m
    where m.cuenta_id = c.id and m.estado = 'activo'
      and m.fecha >= date_trunc('month', (now() at time zone v_zona))::date
  ) mes on true
  where c.empresa_id = p_empresa and c.activa;

  -- Lo que se cargó y no llegó a ninguna cuenta. El neto y no la suma a
  -- secas: un gasto de 100 y un ingreso de 100 sin asignar no son 200 de
  -- desajuste, son cero.
  select count(*)::int as cantidad,
         coalesce(sum(case when m.tipo = 'gasto' then -m.monto else m.monto end), 0) as neto,
         min(m.fecha) as desde
  into v_sueltos
  from public.movimientos m
  where m.empresa_id = p_empresa and m.estado = 'activo' and m.cuenta_id is null;

  return jsonb_build_object(
    'cuentas', v_cuentas,
    'total', coalesce((select sum((x->>'saldo')::numeric) from jsonb_array_elements(v_cuentas) x), 0),
    'sin_cuenta', jsonb_build_object(
      'cantidad', coalesce(v_sueltos.cantidad, 0),
      'neto',     coalesce(v_sueltos.neto, 0),
      'desde',    v_sueltos.desde
    ),
    'metodos_sin_cuenta', (
      select coalesce(jsonb_agg(m order by m), '[]'::jsonb)
      from unnest(array['efectivo', 'transferencia', 'tarjeta', 'credito', 'otro']) m
      where exists (select 1 from public.cuentas_dinero c2
                    where c2.empresa_id = p_empresa and c2.activa)
        and not exists (select 1 from public.cuentas_dinero c3
                        where c3.empresa_id = p_empresa and c3.activa and m = any (c3.metodos))
    )
  );
end $fn$;

revoke all on function public.billetera(uuid) from public, anon;
grant execute on function public.billetera(uuid) to authenticated;

-- cuentas_para_elegir · de 086_cada_cuenta_con_su_color.sql (permisos: 075_cada_movimiento_su_cuenta.sql)
create or replace function public.cuentas_para_elegir(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
                    'id', c.id, 'nombre', c.nombre, 'tipo', c.tipo, 'color', c.color,
                    'metodos', to_jsonb(c.metodos))
                            order by c.orden, c.created_at), '[]'::jsonb)
  into v_lista
  from public.cuentas_dinero c
  where c.empresa_id = p_empresa and c.activa;

  return v_lista;
end $fn$;

revoke all on function public.cuentas_para_elegir(uuid) from public, anon;
grant execute on function public.cuentas_para_elegir(uuid) to authenticated;

-- resumen_personal · de 085_el_disponible_sale_de_la_plata_real.sql
create or replace function public.resumen_personal(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
  v_cuentas integer;
  v_en_cuentas numeric;
  v_dias integer;
  v_hoy date;
  v_hasta date;
  v_descontar numeric;
begin
  -- Se parte del resumen de siempre y se corrige el disponible. Repetir
  -- acá las doscientas líneas que lo arman sería tener dos versiones de la
  -- misma cuenta esperando a separarse.
  v_res := public.resumen_personal_por_ciclo(p_empresa);

  select count(*)::int into v_cuentas
  from public.cuentas_dinero c where c.empresa_id = p_empresa and c.activa;

  -- Sin cuentas cargadas no hay saldo real del que partir: queda el cálculo
  -- por ciclo, que es impreciso pero no asusta.
  if v_cuentas = 0 then
    return v_res;
  end if;

  select coalesce(sum(public.saldo_cuenta_dinero(c.id)), 0) into v_en_cuentas
  from public.cuentas_dinero c where c.empresa_id = p_empresa and c.activa;

  -- Lo que está en las cuentas pero ya tiene dueño.
  v_descontar := coalesce((v_res->>'ahorro_total')::numeric, 0)
               + coalesce((v_res->>'fijos_por_pagar')::numeric, 0)
               + coalesce((v_res->>'cuotas_por_vencer')::numeric, 0);

  v_hoy   := public.hoy_empresa(p_empresa);
  v_hasta := (v_res->>'hasta')::date;
  v_dias  := greatest(1, (v_hasta - v_hoy) + 1);

  return v_res
    || jsonb_build_object(
         'disponible', v_en_cuentas - v_descontar,
         'por_dia',    round((v_en_cuentas - v_descontar) / v_dias, 2),
         -- Para que la pantalla pueda explicar de dónde sale el número en
         -- vez de pedir que se le crea.
         'en_cuentas', v_en_cuentas,
         'desde_la_billetera', true
       );
end $fn$;

revoke all on function public.resumen_personal(uuid) from public, anon;
grant execute on function public.resumen_personal(uuid) to authenticated;

-- moneda_no_se_reetiqueta · de 051_ver_en_otra_moneda.sql
create or replace function public.moneda_no_se_reetiqueta()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.moneda is distinct from old.moneda
     and exists (select 1 from public.movimientos m where m.empresa_id = old.id) then
    raise exception
      'Ya tenés movimientos cargados en %, así que la moneda del negocio no se puede cambiar: se reetiquetaría todo tu historial sin convertirlo. Si querés ver tus números en otra moneda, usá «Ver en» y poné la cotización.',
      old.moneda
      using errcode = '22023';
  end if;

  -- Si se cambia la moneda de los datos, una vista vieja deja de tener
  -- sentido: la cotización que había era contra la moneda anterior.
  if new.moneda is distinct from old.moneda then
    new.moneda_vista  := null;
    new.cotizacion    := null;
    new.cotizacion_at := null;
  end if;

  -- Ver en la misma moneda que se carga no es una vista: es no tener
  -- ninguna. Se normaliza acá para que no haya dos maneras de decir lo mismo
  -- y una pantalla muestre «al cambio 1,00».
  if new.moneda_vista = new.moneda then
    new.moneda_vista  := null;
    new.cotizacion    := null;
    new.cotizacion_at := null;
  end if;

  return new;
end $fn$;

revoke all on function public.moneda_no_se_reetiqueta() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. RECIÉN AHORA, LAS COLUMNAS, LAS RESTRICCIONES Y LA TABLA
--
--    El disparador de los movimientos ya es el de la 118 y no nombra
--    `monto_cuenta`. Con la tabla se va su candado
--    (cuenta_activa_cotizaciones_moneda); con las columnas, su permiso y
--    sus comentarios.
-- ------------------------------------------------------------
alter table public.movimientos drop column if exists monto_cuenta;
alter table public.cuentas_dinero drop constraint if exists cuentas_dinero_otra_moneda_sin_formas;
alter table public.cuentas_dinero drop constraint if exists cuentas_dinero_moneda_conocida;
alter table public.cuentas_dinero drop column if exists moneda;
drop table if exists public.cotizaciones_moneda;
