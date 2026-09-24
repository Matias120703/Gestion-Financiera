-- ============================================================
-- 106 · REPORTES POR RUBRO: PRIMERO, QUE LA PLATA NO MIENTA
-- ============================================================
--
-- Los reportes van a adaptarse a cada rubro (comercio, servicios, alumnos,
-- campo y la cuenta personal). Antes de dibujar nada nuevo, tres números de
-- la base estaban mal, y los tres salían también en el panel. Cada uno se
-- probó ANTES de arreglarlo (la primera parte de pruebas/reportes.test.js
-- falla contra la base sin esta migración: 27 de 44 comprobaciones; se
-- repite con REPORTES_SIN_106=1) y cada arreglo es copia
-- EXACTA de la versión viva (verificada en producción el 23/09/2026 con
-- pg_get_functiondef) más lo nuevo. Ninguna firma cambia.
--
-- 1. LA COMPRA DE MERCADERÍA RESTABA DOS VECES (decisión de Matías, 23/09)
--
--    `resumen_financiero` calcula  ventas − costo + otros ingresos − gastos,
--    y `gastos` sumaba también la categoría «Mercadería», que es la primera
--    que ofrece la pantalla de Gastos. Un almacén que compra 1.000.000 de
--    mercadería, la anota como gasto y la vende en 1.500.000 con el costo
--    cargado, ganó 500.000; el reporte decía −500.000: la mercadería restaba
--    como gasto el día de la compra Y como costo el día de la venta.
--
--    La regla (no se re-discute): en un período en que las ventas tienen
--    costo cargado, los gastos de la categoría «Mercadería» NO restan de la
--    ganancia; se devuelven aparte en `compras_mercaderia`, con
--    `mercaderia_aparte = true`. Si en el período no hay costo cargado,
--    siguen restando como siempre (si no, la mercadería no restaría nunca).
--
--    Qué cuenta como «costo cargado»: el costo de las ventas que NO son un
--    servicio del reparto (033). En una barbería a comisión la parte del
--    barbero se guarda como costo de la venta (034); eso no es mercadería, y
--    si contara, las ceras que compra el local dejarían de restar aunque las
--    venda sin costo. Así que el costo de un corte no enciende la regla.
--
--    La categoría se reconoce sin mayúsculas ni tilde: «Mercadería»,
--    «mercaderia» y la de portugués, «Mercadoria». La misma regla vive en
--    `src/lib/calculos.ts` (el espejo en TypeScript) y en la serie diaria:
--    la bandera es DEL PERÍODO, no de cada día, para que la suma de la serie
--    dé la misma ganancia que el resumen.
--
-- 2. EL PAGO AL PROFESIONAL A COMISIÓN RESTABA DOS VECES
--
--    Al cobrar un corte, la parte del barbero se guarda como costo de la
--    venta (034:285, 'costo_unitario' = su parte). Al pagarle,
--    `pagar_profesional` (035) crea además un gasto «Sueldos» por el mismo
--    monto. Un corte de 30.000 al 50 %, ya pagado, daba ganancia neta 0
--    cuando al local le quedaron 15.000.
--
--    El arreglo: el pago queda MARCADO, de forma explícita, en
--    `turnos_pago.de_comision` (columna nueva). No en `movimientos`, porque
--    ahí cualquier miembro inserta gastos a mano (policy de la 047) y podría
--    esconder un gasto de verdad; `turnos_pago` solo la escribe
--    `pagar_profesional`. Los pagos marcados:
--      · no entran en `gastos` de `resumen_financiero`, de la serie ni de
--        `gastos_por_categoria` (así la lista por categoría suma lo mismo
--        que el total);
--      · se devuelven aparte en `pagado_a_profesionales` (solo a
--        administración, como todo lo que es sueldo, 047);
--      · SÍ siguen siendo un gasto en el historial y en la billetera: la
--        plata sale de la caja igual.
--    Se marca el pago a quien cobra A COMISIÓN en el momento de pagar. El
--    sueldo fijo no es costo de ninguna venta: sigue restando. Los pagos que
--    ya existían se marcan una sola vez, al crear la columna, según el
--    arreglo que tiene hoy cada profesional (en producción hay cero pagos).
--
-- 3. EL QUE ALQUILA LA SILLA APARECÍA CON UNA DEUDA QUE NO EXISTE
--
--    En `registrar_servicio` el que alquila la silla se queda con el 100 %
--    y no se crea ninguna venta: la plata nunca pasó por el local. Aun así
--    `liquidacion` sumaba esos cortes en `le_toca`, y `le_debe` salía como
--    todo lo que facturó; la pantalla lo pintaba en rojo con un botón para
--    pagarle. Ahora `le_toca` (y `le_debe`) cuentan solo los cortes que
--    pasaron por la caja del local; lo que el que alquila cobró directo va
--    aparte en `cobro_directo`. Lo mismo en `mis_servicios`, la vista del
--    propio profesional, que le decía «te deben» por la misma plata.
--
-- LECTURAS NUEVAS POR PERÍODO (todas stable, security definer, sin anon)
--
--   · `pagina_movimientos`: copia exacta + cuenta, cliente, quién lo cargó,
--     lote y moneda original de cada movimiento (el Excel los pedía aparte).
--   · `reporte_turnos`: turnos del período por estado, origen, profesional,
--     servicio, y los clientes que más vuelven.
--   · `reporte_alumnos`: clases dadas y faltas desde `clases_dadas` (NO desde
--     turnos: `dar_clase` guarda clases sin turno), por semana, activos,
--     nuevos, paquetes vendidos/terminados/vencidos y cuántos renovaron,
--     por alumno, por paquete y por materia.
--   · `progreso_clientes`: el resumen de medidas del trainer (admin, como
--     las medidas, 098).
--   · `ventas_por_vendedor`: por quien cargó la venta (admin).
--   · `fiado_del_periodo`: lo que se fió y se cobró en el período.
--
-- Y EL AVISO DEL DÍA (080): el push de la mañana y el de la noche calculaban
-- la ganancia a mano y, con los arreglos 1 y 2, iban a decir otro número que
-- el panel. Ahora aplican la misma regla (sección 13).
--
-- Permisos, los de la 047: primera línea `es_miembro`/`es_admin`; costo,
-- margen y sueldos le llegan en null a un vendedor; nada abierto a anon.
-- Lo que te deben los alumnos (`reporte_alumnos`: por cobrar y fiado) lo
-- ve cualquier miembro, igual que en `por_cobrar_alumnos` y `resumen_fiado`
-- vivas: es plata que entra, no una deuda del negocio ni un sueldo.
-- Idempotente: se puede aplicar dos veces (pruebas/migracion.test.js).
-- ============================================================


-- ------------------------------------------------------------
-- 0. AYUDANTES Y LA MARCA DEL PAGO A COMISIÓN
-- ------------------------------------------------------------

-- ¿Es la categoría «Mercadería»? Sin mayúsculas, sin espacios de más, con o
-- sin tilde, y la palabra en portugués. La misma lista está en calculos.ts.
create or replace function public.es_categoria_mercaderia(p_categoria text)
returns boolean language sql immutable set search_path = public as $fn$
  select lower(trim(coalesce(p_categoria, ''))) in ('mercadería', 'mercaderia', 'mercadoria');
$fn$;

revoke all on function public.es_categoria_mercaderia(text) from public, anon;
grant execute on function public.es_categoria_mercaderia(text) to authenticated;

-- La columna y su relleno van juntos y UNA sola vez: si se aplicara el
-- relleno de nuevo, marcaría pagos hechos a alguien que en ese momento
-- cobraba a sueldo y después pasó a comisión.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'turnos_pago' and column_name = 'de_comision'
  ) then
    alter table public.turnos_pago add column de_comision boolean not null default false;

    update public.turnos_pago tp
       set de_comision = true
      from public.turnos_profesional p
     where p.id = tp.profesional_id
       and p.reparto = 'comision';
  end if;
end $$;

comment on column public.turnos_pago.de_comision is
  'El pago liquida la parte a comisión, que ya es costo de la venta (034): no vuelve a restar de la ganancia (106).';

-- Los resúmenes preguntan «¿este gasto es un pago de comisión?» por cada
-- gasto del período: con este índice es una búsqueda, no un recorrido.
create index if not exists turnos_pago_de_comision_idx
  on public.turnos_pago (movimiento_id) where de_comision;


-- ------------------------------------------------------------
-- 1. RESUMEN FINANCIERO (047) + mercadería aparte + pagos de comisión
-- ------------------------------------------------------------
create or replace function public.resumen_financiero(p_empresa uuid, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_admin := public.es_admin(p_empresa);

  with base as (
    select m.tipo, m.estado, m.monto, m.subtotal, m.costo_total, m.id,
           -- 106: la compra de mercadería, el pago de una comisión y la venta
           -- de un servicio del reparto se reconocen acá una sola vez.
           (m.tipo = 'gasto' and public.es_categoria_mercaderia(m.categoria)) as es_mercaderia,
           (m.tipo = 'gasto' and exists (
              select 1 from public.turnos_pago tp
              where tp.movimiento_id = m.id and tp.de_comision)) as es_comision,
           (m.tipo = 'venta' and exists (
              select 1 from public.turnos_atribucion a
              where a.movimiento_id = m.id)) as es_servicio
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and (v_admin or m.tipo = 'venta' or m.creado_por = auth.uid())
  ),
  totales as (
    select
      coalesce(sum(monto)       filter (where estado = 'activo' and tipo = 'venta'),   0)::numeric as ventas,
      coalesce(sum(subtotal)    filter (where estado = 'activo' and tipo = 'venta'),   0)::numeric as ventas_brutas,
      coalesce(sum(costo_total) filter (where estado = 'activo' and tipo = 'venta'),   0)::numeric as costo_mercaderia,
      coalesce(sum(monto)       filter (where estado = 'activo' and tipo = 'ingreso'), 0)::numeric as otros_ingresos,
      coalesce(sum(monto)       filter (where estado = 'activo' and tipo = 'gasto'),   0)::numeric as gastos_todos,
      coalesce(count(*)         filter (where estado = 'activo' and tipo = 'venta'),   0)::bigint  as cantidad_ventas,
      coalesce(count(*)         filter (where estado = 'anulado' and tipo = 'venta'),  0)::bigint  as ventas_anuladas,
      coalesce(sum(monto)       filter (where estado = 'anulado' and tipo = 'venta'),  0)::numeric as monto_ventas_anuladas,
      coalesce(count(*)         filter (where estado = 'anulado'),                     0)::bigint  as movimientos_anulados,
      coalesce(sum(monto)       filter (where estado = 'anulado'),                     0)::numeric as monto_movimientos_anulados,
      -- 106
      coalesce(sum(costo_total) filter (where estado = 'activo' and tipo = 'venta' and not es_servicio), 0)::numeric
        as costo_de_productos,
      coalesce(sum(monto) filter (where estado = 'activo' and es_mercaderia and not es_comision), 0)::numeric
        as compras_mercaderia,
      coalesce(sum(monto) filter (where estado = 'activo' and es_comision), 0)::numeric
        as pagado_a_profesionales
    from base
  ),
  regla as (
    -- La decisión 2: con costo de mercadería cargado en el período, la
    -- compra va aparte. Sin costo cargado, resta como siempre.
    select t.*,
           (t.costo_de_productos > 0) as mercaderia_aparte,
           (t.gastos_todos - t.pagado_a_profesionales
              - case when t.costo_de_productos > 0 then t.compras_mercaderia else 0 end) as gastos
    from totales t
  ),
  unidades as (
    select coalesce(sum(i.cantidad), 0)::numeric as unidades
    from public.movimiento_items i
    join public.movimientos m on m.id = i.movimiento_id
    where i.empresa_id = p_empresa
      and m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and m.tipo = 'venta'
  ),
  derivados as (
    select
      t.*,
      u.unidades,
      (t.ventas + t.otros_ingresos) as ingresos_totales,
      (t.ventas - t.costo_mercaderia) as ganancia_bruta,
      (t.ventas - t.costo_mercaderia + t.otros_ingresos - t.gastos) as ganancia_neta
    from regla t cross join unidades u
  )
  select jsonb_build_object(
    'ventas',                     d.ventas,
    'ventas_brutas',              d.ventas_brutas,
    'descuentos',                 d.ventas_brutas - d.ventas,
    'otros_ingresos',             d.otros_ingresos,
    'ingresos_totales',           d.ingresos_totales,
    'gastos',                     d.gastos,
    'cantidad_ventas',            d.cantidad_ventas,
    'unidades_vendidas',          d.unidades,
    'ticket_promedio',            case when d.cantidad_ventas > 0 then d.ventas / d.cantidad_ventas else 0 end,
    'ventas_anuladas',            d.ventas_anuladas,
    'monto_ventas_anuladas',      d.monto_ventas_anuladas,
    'movimientos_anulados',       d.movimientos_anulados,
    'monto_movimientos_anulados', d.monto_movimientos_anulados,
    'costo_mercaderia', case when v_admin then d.costo_mercaderia else null end,
    'ganancia_bruta',   case when v_admin then d.ganancia_bruta   else null end,
    'ganancia_neta',    case when v_admin then d.ganancia_neta    else null end,
    'margen_bruto',     case when v_admin and d.ventas > 0
                             then (d.ganancia_bruta / d.ventas) * 100 else null end,
    'margen_neto',      case when v_admin and d.ingresos_totales > 0
                             then (d.ganancia_neta / d.ingresos_totales) * 100 else null end,
    'con_costos',       v_admin,
    -- 106
    'compras_mercaderia',     d.compras_mercaderia,
    'mercaderia_aparte',      d.mercaderia_aparte,
    'pagado_a_profesionales', case when v_admin then d.pagado_a_profesionales else null end
  ) into v_res
  from derivados d;

  return v_res;
end $function$;

revoke all on function public.resumen_financiero(uuid, date, date) from public, anon;
grant execute on function public.resumen_financiero(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 2. SERIE DIARIA (047) con la misma regla, decidida para el PERÍODO
-- ------------------------------------------------------------
create or replace function public.serie_financiera_diaria(p_empresa uuid, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin  boolean;
  v_dias   integer;
  v_res    jsonb;
  v_aparte boolean;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_dias := (p_hasta - p_desde) + 1;
  if v_dias > 1100 then
    raise exception 'El rango no puede superar los 3 años para la serie diaria.' using errcode = '22023';
  end if;

  v_admin := public.es_admin(p_empresa);

  -- 106: la bandera es del período entero, igual que en el resumen. Si se
  -- decidiera día por día, la suma de la serie no daría la ganancia neta.
  select coalesce(sum(m.costo_total), 0) > 0 into v_aparte
  from public.movimientos m
  where m.empresa_id = p_empresa
    and m.fecha between p_desde and p_hasta
    and m.estado = 'activo'
    and m.tipo = 'venta'
    and not exists (select 1 from public.turnos_atribucion a where a.movimiento_id = m.id);

  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha
  ),
  marcados as (
    select m.fecha, m.tipo, m.monto, m.costo_total,
           (m.tipo = 'gasto' and public.es_categoria_mercaderia(m.categoria)) as es_mercaderia,
           (m.tipo = 'gasto' and exists (
              select 1 from public.turnos_pago tp
              where tp.movimiento_id = m.id and tp.de_comision)) as es_comision
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and (v_admin or m.tipo = 'venta' or m.creado_por = auth.uid())
  ),
  porDia as (
    select
      m.fecha,
      coalesce(sum(m.monto)       filter (where m.tipo = 'venta'), 0)::numeric   as ventas,
      coalesce(sum(m.monto)       filter (where m.tipo = 'gasto' and not m.es_comision
                                            and not (v_aparte and m.es_mercaderia)), 0)::numeric as gastos,
      coalesce(sum(m.monto)       filter (where m.tipo = 'ingreso'), 0)::numeric as otros_ingresos,
      coalesce(sum(m.costo_total) filter (where m.tipo = 'venta'), 0)::numeric   as costo,
      coalesce(sum(m.monto)       filter (where m.es_mercaderia and not m.es_comision), 0)::numeric as compras,
      coalesce(sum(m.monto)       filter (where m.es_comision), 0)::numeric      as comisiones
    from marcados m
    group by m.fecha
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'fecha',          to_char(d.fecha, 'YYYY-MM-DD'),
      'ventas',         coalesce(p.ventas, 0),
      'gastos',         coalesce(p.gastos, 0),
      'otros_ingresos', coalesce(p.otros_ingresos, 0),
      'ganancia', case
        when v_admin then coalesce(p.ventas, 0) - coalesce(p.costo, 0)
                        + coalesce(p.otros_ingresos, 0) - coalesce(p.gastos, 0)
        else null
      end,
      -- 106
      'compras_mercaderia',     coalesce(p.compras, 0),
      'mercaderia_aparte',      v_aparte,
      'pagado_a_profesionales', case when v_admin then coalesce(p.comisiones, 0) else null end
    ) order by d.fecha
  ), '[]'::jsonb) into v_res
  from dias d
  left join porDia p on p.fecha = d.fecha;

  return v_res;
end $function$;

revoke all on function public.serie_financiera_diaria(uuid, date, date) from public, anon;
grant execute on function public.serie_financiera_diaria(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 3. GASTOS POR CATEGORÍA (047) sin los pagos de comisión
--
--    Si el total de gastos los deja afuera y la lista por categoría no, la
--    lista suma más que el total y el reporte se contradice solo. La
--    Mercadería SÍ queda en la lista: se reconoce por su nombre y la pantalla
--    la muestra aparte cuando `mercaderia_aparte` (contrato, 2.1).
-- ------------------------------------------------------------
create or replace function public.gastos_por_categoria(p_empresa uuid, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_admin := public.es_admin(p_empresa);

  with porCategoria as (
    select
      trim(coalesce(nullif(trim(m.categoria), ''), 'General')) as nombre,
      sum(m.monto)::numeric as monto,
      count(*)::bigint      as operaciones
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and m.tipo = 'gasto'
      and (v_admin or m.creado_por = auth.uid())
      -- 106
      and not exists (select 1 from public.turnos_pago tp
                      where tp.movimiento_id = m.id and tp.de_comision)
    group by 1
  ),
  con_total as (
    select c.*, sum(c.monto) over () as total from porCategoria c
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'nombre',        c.nombre,
      'monto',         c.monto,
      'operaciones',   c.operaciones,
      'participacion', case when c.total > 0 then (c.monto / c.total) * 100 else 0 end
    ) order by c.monto desc
  ), '[]'::jsonb) into v_res
  from con_total c;

  return v_res;
end $function$;

revoke all on function public.gastos_por_categoria(uuid, date, date) from public, anon;
grant execute on function public.gastos_por_categoria(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 4. PAGAR AL PROFESIONAL (035) marcando si liquida una comisión
-- ------------------------------------------------------------
create or replace function public.pagar_profesional(p_empresa uuid, p_profesional uuid, p_monto numeric, p_fecha date DEFAULT NULL::date, p_notas text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nombre  text;
  v_fecha   date;
  v_mov     uuid;
  v_id      uuid;
  v_reparto text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede pagar al equipo.' using errcode = '42501';
  end if;

  select nombre, reparto into v_nombre, v_reparto from public.turnos_profesional
  where id = p_profesional and empresa_id = p_empresa;
  if v_nombre is null then
    raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El pago tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  insert into public.movimientos (
    empresa_id, tipo, estado, fecha, descripcion, categoria,
    subtotal, descuento, monto, costo_total, metodo_pago, contraparte, origen, creado_por
  )
  values (
    p_empresa, 'gasto', 'activo', v_fecha,
    'Pago a ' || v_nombre, 'Sueldos',
    p_monto, 0, p_monto, 0, 'efectivo', v_nombre, 'manual', auth.uid()
  )
  returning id into v_mov;

  -- 106: a comisión, su parte ya es el costo de cada corte (034). El pago
  -- queda marcado para que no vuelva a restar de la ganancia.
  insert into public.turnos_pago (empresa_id, profesional_id, movimiento_id, monto, fecha, notas, creado_por, de_comision)
  values (p_empresa, p_profesional, v_mov, p_monto, v_fecha, left(coalesce(p_notas, ''), 200), auth.uid(),
          v_reparto = 'comision')
  returning id into v_id;

  return jsonb_build_object('pago', v_id, 'movimiento', v_mov);
end $function$;

revoke all on function public.pagar_profesional(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.pagar_profesional(uuid, uuid, numeric, date, text) to authenticated;


-- ------------------------------------------------------------
-- 5. LIQUIDACIÓN (035) sin la deuda falsa del alquiler de silla
-- ------------------------------------------------------------
create or replace function public.liquidacion(p_empresa uuid, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_res jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a estos números.' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select coalesce(jsonb_agg(x order by (x->>'le_toca')::numeric desc), '[]'::jsonb)
  into v_res
  from (
    select jsonb_build_object(
      'id',         p.id,
      'nombre',     p.nombre,
      'reparto',    p.reparto,
      'porcentaje', p.porcentaje,
      'activo',     p.activo,
      'cortes',     coalesce(c.cortes, 0),
      'cobrado',    coalesce(c.cobrado, 0),
      'le_toca',    coalesce(c.suyo, 0),
      'del_local',  coalesce(c.local, 0),
      'pagado',     coalesce(g.pagado, 0),
      'le_debe',    coalesce(c.suyo, 0) - coalesce(g.pagado, 0),
      -- 106: lo que el que alquila la silla cobró directo. Es suyo y ya lo
      -- tiene: no es plata que el local le deba.
      'cobro_directo', coalesce(c.directo, 0)
    ) as x
    from public.turnos_profesional p
    left join lateral (
      select count(*)::int              as cortes,
             sum(a.monto_cobrado)       as cobrado,
             -- 106: solo lo que pasó por la caja del local le toca cobrar.
             sum(a.parte_profesional) filter (where a.reparto <> 'alquiler') as suyo,
             sum(a.parte_profesional) filter (where a.reparto = 'alquiler')  as directo,
             sum(a.parte_local)         as local
      from public.turnos_atribucion a
      where a.profesional_id = p.id
        and a.fecha between p_desde and p_hasta
        and (a.movimiento_id is null
             or exists (select 1 from public.movimientos m
                        where m.id = a.movimiento_id and m.estado = 'activo'))
    ) c on true
    left join lateral (
      select sum(t.monto) as pagado
      from public.turnos_pago t
      where t.profesional_id = p.id and t.fecha between p_desde and p_hasta
    ) g on true
    where p.empresa_id = p_empresa
      and (p.activo or coalesce(c.cortes, 0) > 0 or coalesce(g.pagado, 0) > 0)
  ) t;

  return v_res;
end $function$;

revoke all on function public.liquidacion(uuid, date, date) from public, anon;
grant execute on function public.liquidacion(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 6. MIS SERVICIOS (035): la misma regla en la vista del profesional
-- ------------------------------------------------------------
create or replace function public.mis_servicios(p_empresa uuid, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prof    uuid;
  v_cortes  jsonb;
  v_total   numeric := 0;
  v_pagado  numeric := 0;
  v_directo numeric := 0;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select id into v_prof from public.turnos_profesional
  where empresa_id = p_empresa and user_id = auth.uid();

  if v_prof is null then
    return jsonb_build_object('es_profesional', false, 'cortes', '[]'::jsonb,
                              'le_toca', 0, 'pagado', 0, 'le_deben', 0, 'cobro_directo', 0);
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'fecha',    a.fecha,
      'servicio', a.servicio,
      'monto',    a.monto_cobrado,
      'tuyo',     a.parte_profesional
    ) order by a.fecha desc, a.created_at desc), '[]'::jsonb),
    -- 106: con alquiler de silla el corte ya lo cobró él; no se lo deben.
    coalesce(sum(a.parte_profesional) filter (where a.reparto <> 'alquiler'), 0),
    coalesce(sum(a.parte_profesional) filter (where a.reparto = 'alquiler'), 0)
  into v_cortes, v_total, v_directo
  from public.turnos_atribucion a
  where a.profesional_id = v_prof
    and a.fecha between p_desde and p_hasta
    and (a.movimiento_id is null
         or exists (select 1 from public.movimientos m
                    where m.id = a.movimiento_id and m.estado = 'activo'));

  select coalesce(sum(t.monto), 0) into v_pagado
  from public.turnos_pago t
  where t.profesional_id = v_prof and t.fecha between p_desde and p_hasta;

  return jsonb_build_object(
    'es_profesional', true,
    'cortes',   v_cortes,
    'le_toca',  v_total,
    'pagado',   v_pagado,
    'le_deben', v_total - v_pagado,
    'cobro_directo', v_directo
  );
end $function$;

revoke all on function public.mis_servicios(uuid, date, date) from public, anon;
grant execute on function public.mis_servicios(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 7. PÁGINA DE MOVIMIENTOS (047) + cuenta, cliente, quién, lote y moneda
--
--    Copia exacta; cada dato nuevo es una subconsulta por id (con índice de
--    clave primaria), así el orden, el cursor y la búsqueda no cambian.
--    `creado_por` ya venía; se le suma el nombre.
-- ------------------------------------------------------------
create or replace function public.pagina_movimientos(p_empresa uuid, p_desde date, p_hasta date, p_tamano integer DEFAULT 100, p_cursor_fecha date DEFAULT NULL::date, p_cursor_created timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_tipo tipo_movimiento DEFAULT NULL::tipo_movimiento, p_incluir_anuladas boolean DEFAULT true, p_busqueda text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin   boolean;
  v_tamano  integer;
  v_busca   text;
  v_filas   jsonb;
  v_cuantas integer;
  v_ultima  jsonb;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_tamano := least(greatest(coalesce(p_tamano, 100), 1), 500);
  v_admin  := public.es_admin(p_empresa);
  v_busca  := nullif(lower(trim(coalesce(p_busqueda, ''))), '');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha desc, x.created_at desc, x.id desc), '[]'::jsonb)
  into v_filas
  from (
    select
      m.id, m.empresa_id, m.tipo, m.estado, m.fecha, m.descripcion, m.categoria,
      m.subtotal, m.descuento, m.monto,
      case when v_admin then m.costo_total else null end as costo_total,
      m.metodo_pago, m.contraparte, m.notas, m.origen, m.creado_por, m.created_at,
      m.anulado_por, m.anulado_at, m.motivo_anulacion, m.actualizado_por, m.updated_at,
      -- 106
      m.cuenta_id,
      (select cd.nombre from public.cuentas_dinero cd where cd.id = m.cuenta_id) as cuenta_nombre,
      m.cliente_id,
      (select cl.nombre from public.clientes cl where cl.id = m.cliente_id) as cliente_nombre,
      (select mi.nombre from public.miembros mi
        where mi.empresa_id = m.empresa_id and mi.user_id = m.creado_por) as creado_por_nombre,
      m.lote_id,
      (select l.nombre from public.lotes l where l.id = m.lote_id) as lote_nombre,
      m.moneda_original,
      m.monto_original,
      -- El cambio va con la moneda (100 exige los tres juntos): sin él, el
      -- Excel no podría explicar cómo 3 dólares se volvieron 20.000.
      m.cambio,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'movimiento_id', i.movimiento_id,
            'empresa_id', i.empresa_id,
            'producto_id', i.producto_id,
            'nombre', i.nombre,
            'cantidad', i.cantidad,
            'precio_unitario', i.precio_unitario,
            'costo_unitario', case when v_admin then i.costo_unitario else null end,
            'afecto_stock', i.afecto_stock
          ) order by i.nombre
        )
        from public.movimiento_items i where i.movimiento_id = m.id
      ), '[]'::jsonb) as movimiento_items
    from public.movimientos m
    where m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and (v_admin or m.tipo = 'venta' or m.creado_por = auth.uid())
      and (p_tipo is null or m.tipo = p_tipo)
      and (p_incluir_anuladas or m.estado = 'activo')
      and (
        p_cursor_id is null
        or (m.fecha, m.created_at, m.id) < (p_cursor_fecha, p_cursor_created, p_cursor_id)
      )
      and (
        v_busca is null
        or lower(m.descripcion) like '%' || v_busca || '%'
        or lower(m.categoria)   like '%' || v_busca || '%'
        or lower(coalesce(m.contraparte, '')) like '%' || v_busca || '%'
        or exists (
          select 1 from public.movimiento_items i2
          where i2.movimiento_id = m.id and lower(i2.nombre) like '%' || v_busca || '%'
        )
      )
    order by m.fecha desc, m.created_at desc, m.id desc
    limit v_tamano
  ) x;

  v_cuantas := jsonb_array_length(v_filas);
  v_ultima  := case when v_cuantas > 0 then v_filas -> (v_cuantas - 1) else null end;

  return jsonb_build_object(
    'movimientos', v_filas,
    'siguiente', case
      when v_cuantas = v_tamano and v_ultima is not null then jsonb_build_object(
        'fecha',      v_ultima ->> 'fecha',
        'created_at', v_ultima ->> 'created_at',
        'id',         v_ultima ->> 'id'
      )
      else null
    end,
    'tamano', v_tamano
  );
end $function$;

revoke all on function public.pagina_movimientos(uuid, date, date, integer, date, timestamptz, uuid, tipo_movimiento, boolean, text) from public, anon;
grant execute on function public.pagina_movimientos(uuid, date, date, integer, date, timestamptz, uuid, tipo_movimiento, boolean, text) to authenticated;


-- ------------------------------------------------------------
-- 8. TURNOS DEL PERÍODO (servicios, clases y entrenamiento)
--
--    El día de un turno es el de la zona horaria del negocio, como en la
--    agenda. Estados reales (turnos_reserva_estado_check): pendiente,
--    confirmada, atendida, cancelada, no_vino. Orígenes: local, publico.
--    Cancelar solo cambia el estado, sin fecha (041): un turno cancelado
--    cuenta en el período de la fecha del turno, no del día que se canceló.
-- ------------------------------------------------------------
create or replace function public.reporte_turnos(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona text;
  v_res  jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;

  with t as (
    select r.*, (r.inicia at time zone v_zona)::date as dia
    from public.turnos_reserva r
    where r.empresa_id = p_empresa
      and (r.inicia at time zone v_zona)::date between p_desde and p_hasta
  )
  select jsonb_build_object(
    'total', (select count(*)::int from t),
    'por_estado', jsonb_build_object(
      'pendiente',  (select count(*)::int from t where estado = 'pendiente'),
      'confirmada', (select count(*)::int from t where estado = 'confirmada'),
      'atendida',   (select count(*)::int from t where estado = 'atendida'),
      'no_vino',    (select count(*)::int from t where estado = 'no_vino'),
      'cancelada',  (select count(*)::int from t where estado = 'cancelada')),
    'por_origen', jsonb_build_object(
      'local',   (select count(*)::int from t where origen = 'local'),
      'publico', (select count(*)::int from t where origen = 'publico')),
    'por_profesional', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.profesional_id, 'nombre', x.nombre, 'total', x.total,
               'atendidas', x.atendidas, 'no_vino', x.no_vino,
               'canceladas', x.canceladas, 'pendientes', x.pendientes)
             order by x.total desc, x.nombre)
      from (
        select t.profesional_id, p.nombre,
               count(*)::int as total,
               count(*) filter (where t.estado = 'atendida')::int  as atendidas,
               count(*) filter (where t.estado = 'no_vino')::int   as no_vino,
               count(*) filter (where t.estado = 'cancelada')::int as canceladas,
               count(*) filter (where t.estado in ('pendiente', 'confirmada'))::int as pendientes
        from t join public.turnos_profesional p on p.id = t.profesional_id
        group by t.profesional_id, p.nombre
      ) x), '[]'::jsonb),
    'por_servicio', coalesce((
      select jsonb_agg(jsonb_build_object(
               'producto_id', x.producto_id, 'nombre', x.nombre,
               'total', x.total, 'atendidas', x.atendidas)
             order by x.total desc, x.nombre)
      from (
        select t.producto_id, pr.nombre,
               count(*)::int as total,
               count(*) filter (where t.estado = 'atendida')::int as atendidas
        from t join public.productos pr on pr.id = t.producto_id
        group by t.producto_id, pr.nombre
      ) x), '[]'::jsonb),
    -- Los que más vuelven: solo turnos atendidos y con cliente de la agenda
    -- (cliente_id, 053). Un nombre escrito a mano no alcanza para saber que
    -- dos turnos son de la misma persona.
    'clientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cliente_id', x.cliente_id, 'nombre', x.nombre,
               'visitas', x.visitas, 'ultima', x.ultima)
             order by x.visitas desc, x.ultima desc)
      from (
        select t.cliente_id, c.nombre, count(*)::int as visitas, max(t.dia) as ultima
        from t join public.clientes c on c.id = t.cliente_id
        where t.estado = 'atendida'
        group by t.cliente_id, c.nombre
        order by count(*) desc, max(t.dia) desc
        limit 20
      ) x), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.reporte_turnos(uuid, date, date) from public, anon;
grant execute on function public.reporte_turnos(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 9. ALUMNOS DEL PERÍODO (clases y entrenamiento)
--
--    Todo sale de `paquetes` y `clases_dadas` (088), las mismas tablas que
--    usa `estado_paquete`, con las mismas palabras:
--      · dada / falta: `clases_dadas.motivo`, sumando `cantidad`;
--      · activo: lo que dice `estado_paquete` HOY (es una foto);
--      · nuevo: el primer paquete del alumno se creó en el período;
--      · terminado en el período: usó todas sus clases y la última se dio
--        en el período;
--      · vencido en el período: le quedaban clases y `vence_el` cayó en el
--        período (y ya pasó);
--      · renovó: tiene un paquete creado después de ese.
--    Los paquetes cerrados a mano no cuentan como terminados ni vencidos.
--    Lo cobrado es lo vendido (ventas activas), la misma base que el
--    «Cobrado» del resumen; la deuda es la de hoy: inscripciones sin cobrar
--    (la regla de `por_cobrar_alumnos`, 094) más el saldo de fiado.
-- ------------------------------------------------------------
create or replace function public.reporte_alumnos(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona text;
  v_hoy  date;
  v_res  jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;
  v_hoy := public.hoy_empresa(p_empresa);

  with
  paq as (
    select p.*,
           (p.created_at at time zone v_zona)::date as creado_el,
           coalesce(u.usadas, 0) as usadas,
           u.ultima,
           case
             when p.cerrado then 'cerrado'
             when coalesce(u.usadas, 0) >= p.clases then 'terminado'
             when p.vence_el is not null and p.vence_el < v_hoy then 'vencido'
             else 'activo' end as estado
    from public.paquetes p
    left join lateral (
      select sum(c.cantidad) as usadas, max(c.fecha) as ultima
      from public.clases_dadas c where c.paquete_id = p.id
    ) u on true
    where p.empresa_id = p_empresa
  ),
  clases as (
    select c.* from public.clases_dadas c
    where c.empresa_id = p_empresa and c.fecha between p_desde and p_hasta
  ),
  cierres as (
    -- Los paquetes que terminaron o vencieron DENTRO del período.
    select q.*,
           case when q.usadas >= q.clases then 'terminado' else 'vencido' end as como,
           exists (select 1 from public.paquetes n
                   where n.empresa_id = p_empresa and n.cliente_id = q.cliente_id
                     and n.id <> q.id and n.created_at > q.created_at) as renovo
    from paq q
    where not q.cerrado
      and (
        (q.usadas >= q.clases and q.ultima between p_desde and p_hasta)
        or (q.usadas < q.clases and q.vence_el between p_desde and p_hasta and q.vence_el < v_hoy)
      )
  ),
  ventas as (
    select m.* from public.movimientos m
    where m.empresa_id = p_empresa and m.tipo = 'venta' and m.estado = 'activo'
      and m.fecha between p_desde and p_hasta
  ),
  fiado as (
    select f.cliente_id, sum(case when f.tipo = 'fio' then f.monto else -f.monto end) as saldo
    from public.fiado f where f.empresa_id = p_empresa
    group by f.cliente_id
  ),
  por_alumno as (
    select c.id as cliente_id, c.nombre,
           coalesce((select sum(k.cantidad) from clases k join paq q on q.id = k.paquete_id
                     where q.cliente_id = c.id and k.motivo = 'dada'), 0) as clases,
           coalesce((select sum(k.cantidad) from clases k join paq q on q.id = k.paquete_id
                     where q.cliente_id = c.id and k.motivo = 'falta'), 0) as faltas,
           coalesce((select sum(v.monto) from ventas v where v.cliente_id = c.id), 0) as cobrado,
           coalesce((select sum(q.precio) from paq q
                     where q.cliente_id = c.id and q.movimiento_id is null
                       and q.precio > 0 and not q.cerrado), 0) as debe_inscripciones,
           greatest(coalesce((select f.saldo from fiado f where f.cliente_id = c.id), 0), 0) as debe_fiado,
           (select jsonb_build_object('id', q.id, 'nombre', q.nombre, 'materia', q.materia,
                                      'clases', q.clases, 'usadas', q.usadas,
                                      'quedan', greatest(0, q.clases - q.usadas),
                                      'vence_el', q.vence_el)
              from paq q where q.cliente_id = c.id and q.estado = 'activo'
              order by q.created_at desc limit 1) as vigente,
           (select max(k.fecha) from public.clases_dadas k join paq q on q.id = k.paquete_id
             where q.cliente_id = c.id and k.motivo = 'dada' and k.fecha <= v_hoy) as ultima_clase
    from public.clientes c
    where c.empresa_id = p_empresa
      and exists (select 1 from paq q where q.cliente_id = c.id)
  ),
  materias as (
    select count(distinct q.materia) as n from paq q where q.materia is not null
  )
  select jsonb_build_object(
    'clases_dadas', coalesce((select sum(cantidad) from clases where motivo = 'dada'), 0),
    'faltas',       coalesce((select sum(cantidad) from clases where motivo = 'falta'), 0),
    'por_semana', coalesce((
      select jsonb_agg(jsonb_build_object('semana', s.semana, 'dadas', s.dadas, 'faltas', s.faltas)
             order by s.semana)
      from (
        select date_trunc('week', k.fecha)::date as semana,
               coalesce(sum(k.cantidad) filter (where k.motivo = 'dada'), 0)  as dadas,
               coalesce(sum(k.cantidad) filter (where k.motivo = 'falta'), 0) as faltas
        from clases k group by 1
      ) s), '[]'::jsonb),
    'cobrado', coalesce((select sum(monto) from ventas), 0),
    -- Sin clases dadas no hay «por clase»: null, no un cero que parece dato.
    'cobrado_por_clase', (
      select case when coalesce(sum(k.cantidad), 0) > 0
                  then coalesce((select sum(monto) from ventas), 0) / sum(k.cantidad)
                  else null end
      from clases k where k.motivo = 'dada'),
    'por_cobrar', coalesce((select sum(q.precio) from paq q
                            where q.movimiento_id is null and q.precio > 0 and not q.cerrado), 0),
    -- El fiado va aparte de las inscripciones: así «por cobrar» es el mismo
    -- número que `por_cobrar_alumnos` y la suma de `alumnos[].debe` es
    -- por_cobrar + fiado_pendiente, sin contar nada dos veces.
    'fiado_pendiente', coalesce((select sum(a.debe_fiado) from por_alumno a), 0),
    'activos', (select count(distinct q.cliente_id)::int from paq q where q.estado = 'activo'),
    'nuevos', (
      select count(*)::int from (
        select q.cliente_id from paq q group by q.cliente_id
        having min(q.creado_el) between p_desde and p_hasta) n),
    'paquetes', jsonb_build_object(
      'vendidos',   (select count(*)::int from paq q where q.creado_el between p_desde and p_hasta),
      'terminados', (select count(*)::int from cierres where como = 'terminado'),
      'vencidos',   (select count(*)::int from cierres where como = 'vencido'),
      'renovaron',  (select count(*)::int from cierres where renovo)),
    -- A quién llamar: paquetes activos con 2 clases o menos, o que vencen
    -- en la próxima semana.
    'por_terminar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'paquete', q.id, 'cliente_id', q.cliente_id, 'alumno', c.nombre,
               'nombre', q.nombre, 'quedan', greatest(0, q.clases - q.usadas),
               'vence_el', q.vence_el)
             order by greatest(0, q.clases - q.usadas), q.vence_el nulls last, c.nombre)
      from paq q join public.clientes c on c.id = q.cliente_id
      where q.estado = 'activo'
        and (q.clases - q.usadas <= 2 or (q.vence_el is not null and q.vence_el <= v_hoy + 7))), '[]'::jsonb),
    'alumnos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cliente_id', a.cliente_id, 'nombre', a.nombre,
               'clases', a.clases, 'faltas', a.faltas, 'cobrado', a.cobrado,
               'debe', a.debe_inscripciones + a.debe_fiado,
               'debe_inscripciones', a.debe_inscripciones, 'debe_fiado', a.debe_fiado,
               'paquete', a.vigente->>'nombre',
               'materia', a.vigente->>'materia',
               'usadas', (a.vigente->>'usadas')::numeric,
               'quedan', (a.vigente->>'quedan')::numeric,
               'vence_el', a.vigente->>'vence_el',
               'ultima_clase', a.ultima_clase)
             order by a.nombre)
      from por_alumno a
      where a.clases > 0 or a.faltas > 0 or a.cobrado > 0
         or a.debe_inscripciones > 0 or a.debe_fiado > 0 or a.vigente is not null), '[]'::jsonb),
    -- Cobrado por paquete o plan: sin costo ni margen, que acá no existen.
    'por_paquete', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'vendidos', x.vendidos, 'cobrado', x.cobrado)
             order by x.cobrado desc, x.nombre)
      from (
        select q.nombre, count(*)::int as vendidos, sum(v.monto) as cobrado
        from paq q join ventas v on v.id = q.movimiento_id
        group by q.nombre
      ) x), '[]'::jsonb),
    -- Por materia, solo si el profe enseña dos o más (094).
    'por_materia', case when (select n from materias) >= 2 then coalesce((
      select jsonb_agg(jsonb_build_object('materia', x.materia, 'alumnos', x.alumnos, 'cobrado', x.cobrado)
             order by x.cobrado desc)
      from (
        select q.materia, count(distinct q.cliente_id)::int as alumnos, sum(v.monto) as cobrado
        from paq q join ventas v on v.id = q.movimiento_id
        group by q.materia
      ) x), '[]'::jsonb) else '[]'::jsonb end
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.reporte_alumnos(uuid, date, date) from public, anon;
grant execute on function public.reporte_alumnos(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 10. PROGRESO DE LOS CLIENTES DEL TRAINER (admin, como las medidas, 098)
--
--    Por cliente, primera contra última medición DEL PERÍODO que tenga ese
--    dato (hacen falta dos). La grasa solo se compara si las dos se
--    midieron con el mismo método: balanza contra plicómetro no es un cambio,
--    es otro aparato. Los promedios son de los clientes que se pueden
--    comparar; si ninguno, null.
--    «Sin medir» y «sin rutina» miran a los clientes con un plan activo hoy.
-- ------------------------------------------------------------
create or replace function public.progreso_clientes(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_hoy date;
  v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if not public.es_admin(p_empresa) then
    raise exception 'Las medidas y el progreso son del dueño o de un administrador.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_hoy := public.hoy_empresa(p_empresa);

  with
  activos as (
    select distinct p.cliente_id from public.paquetes p
    where p.empresa_id = p_empresa and (public.estado_paquete(p.id)->>'estado') = 'activo'
  ),
  med as (
    select m.*, row_number() over (partition by m.cliente_id order by m.fecha, m.created_at) as n
    from public.mediciones m
    where m.empresa_id = p_empresa and m.fecha between p_desde and p_hasta
  ),
  universo as (
    select c.id, c.nombre from public.clientes c
    where c.empresa_id = p_empresa
      and (c.id in (select cliente_id from activos) or c.id in (select cliente_id from med))
  ),
  fila as (
    select u.id as cliente_id, u.nombre,
           (select count(*)::int from med where med.cliente_id = u.id) as mediciones,
           (select m.peso_kg from med m where m.cliente_id = u.id and m.peso_kg is not null order by m.n limit 1) as peso_ini,
           (select m.peso_kg from med m where m.cliente_id = u.id and m.peso_kg is not null order by m.n desc limit 1) as peso_fin,
           (select count(*) from med m where m.cliente_id = u.id and m.peso_kg is not null) as n_peso,
           (select m.cintura_cm from med m where m.cliente_id = u.id and m.cintura_cm is not null order by m.n limit 1) as cint_ini,
           (select m.cintura_cm from med m where m.cliente_id = u.id and m.cintura_cm is not null order by m.n desc limit 1) as cint_fin,
           (select count(*) from med m where m.cliente_id = u.id and m.cintura_cm is not null) as n_cint,
           (select m.grasa_pct from med m where m.cliente_id = u.id and m.grasa_pct is not null order by m.n limit 1) as grasa_ini,
           (select m.grasa_metodo from med m where m.cliente_id = u.id and m.grasa_pct is not null order by m.n limit 1) as met_ini,
           (select m.grasa_pct from med m where m.cliente_id = u.id and m.grasa_pct is not null order by m.n desc limit 1) as grasa_fin,
           (select m.grasa_metodo from med m where m.cliente_id = u.id and m.grasa_pct is not null order by m.n desc limit 1) as met_fin,
           (select count(*) from med m where m.cliente_id = u.id and m.grasa_pct is not null) as n_grasa,
           (select max(m.fecha) from public.mediciones m
             where m.cliente_id = u.id and m.empresa_id = p_empresa and m.fecha <= v_hoy) as ultima,
           (select r.nombre from public.rutinas r
             where r.cliente_id = u.id and r.empresa_id = p_empresa and r.estado = 'vigente'
             order by r.desde desc limit 1) as rutina,
           u.id in (select cliente_id from activos) as activo
    from universo u
  ),
  calc as (
    select f.*,
           case when f.n_peso >= 2 then f.peso_fin - f.peso_ini end as peso_cambio,
           case when f.n_cint >= 2 then f.cint_fin - f.cint_ini end as cintura_cambio,
           case when f.n_grasa >= 2 and f.met_ini = f.met_fin then f.grasa_fin - f.grasa_ini end as grasa_cambio,
           case when f.ultima is null then null else v_hoy - f.ultima end as dias_sin_medir
    from fila f
  )
  select jsonb_build_object(
    'medidos',            (select count(*)::int from calc where mediciones > 0),
    'con_peso',           (select count(*)::int from calc where peso_cambio is not null),
    'cambio_peso',        (select round(avg(peso_cambio), 2) from calc where peso_cambio is not null),
    'con_cintura',        (select count(*)::int from calc where cintura_cambio is not null),
    'cambio_cintura',     (select round(avg(cintura_cambio), 2) from calc where cintura_cambio is not null),
    'con_grasa',          (select count(*)::int from calc where grasa_cambio is not null),
    'cambio_grasa',       (select round(avg(grasa_cambio), 2) from calc where grasa_cambio is not null),
    'sin_medir_30',       (select count(*)::int from calc where activo and (ultima is null or ultima < v_hoy - 30)),
    'sin_rutina',         (select count(*)::int from calc where activo and rutina is null),
    'clientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cliente_id', c.cliente_id, 'nombre', c.nombre, 'activo', c.activo,
               'mediciones', c.mediciones,
               'peso_inicial',   case when c.peso_cambio is not null then c.peso_ini end,
               'peso_final',     case when c.peso_cambio is not null then c.peso_fin end,
               'peso_cambio',    c.peso_cambio,
               'cintura_inicial', case when c.cintura_cambio is not null then c.cint_ini end,
               'cintura_final',   case when c.cintura_cambio is not null then c.cint_fin end,
               'cintura_cambio', c.cintura_cambio,
               'grasa_inicial',  case when c.grasa_cambio is not null then c.grasa_ini end,
               'grasa_final',    case when c.grasa_cambio is not null then c.grasa_fin end,
               'grasa_cambio',   c.grasa_cambio,
               'grasa_metodo',   case when c.grasa_cambio is not null then c.met_ini end,
               'ultima_medicion', c.ultima,
               'dias_sin_medir', c.dias_sin_medir,
               'sin_medir_30',   c.activo and (c.ultima is null or c.ultima < v_hoy - 30),
               'rutina_vigente', c.rutina)
             order by c.nombre)
      from calc c), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.progreso_clientes(uuid, date, date) from public, anon;
grant execute on function public.progreso_clientes(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 11. VENTAS POR VENDEDOR (admin)
--
--    Por quien la cargó (`creado_por`). El nombre es el del miembro; si ya
--    no está en el negocio, o la venta no tiene autor (una migración vieja),
--    va null y la pantalla dice «sin dato»: no se inventa un nombre.
-- ------------------------------------------------------------
create or replace function public.ventas_por_vendedor(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a estos números.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', x.creado_por, 'nombre', x.nombre, 'rol', x.rol,
           'vendido', x.vendido, 'cantidad', x.cantidad,
           'ticket_promedio', case when x.cantidad > 0 then x.vendido / x.cantidad else null end,
           'anuladas', x.anuladas, 'monto_anulado', x.monto_anulado)
         order by x.vendido desc, x.nombre), '[]'::jsonb)
  into v_res
  from (
    select m.creado_por, mi.nombre, mi.rol::text as rol,
           coalesce(sum(m.monto) filter (where m.estado = 'activo'), 0)  as vendido,
           count(*) filter (where m.estado = 'activo')::int              as cantidad,
           count(*) filter (where m.estado = 'anulado')::int             as anuladas,
           coalesce(sum(m.monto) filter (where m.estado = 'anulado'), 0) as monto_anulado
    from public.movimientos m
    left join public.miembros mi on mi.empresa_id = m.empresa_id and mi.user_id = m.creado_por
    where m.empresa_id = p_empresa and m.tipo = 'venta'
      and m.fecha between p_desde and p_hasta
    group by m.creado_por, mi.nombre, mi.rol
  ) x;

  return v_res;
end $fn$;

revoke all on function public.ventas_por_vendedor(uuid, date, date) from public, anon;
grant execute on function public.ventas_por_vendedor(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 12. FIADO DEL PERÍODO
--
--    `resumen_fiado` (054) es la foto de hoy; esto es lo que pasó en el
--    período: cuánto se fió y cuánto se cobró, por cliente. El saldo de hoy
--    se calcula igual que allá (todo lo fiado menos todo lo cobrado).
-- ------------------------------------------------------------
create or replace function public.fiado_del_periodo(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  with periodo as (
    select f.cliente_id,
           coalesce(sum(f.monto) filter (where f.tipo = 'fio'), 0)   as otorgado,
           coalesce(sum(f.monto) filter (where f.tipo = 'cobro'), 0) as cobrado
    from public.fiado f
    where f.empresa_id = p_empresa and f.fecha between p_desde and p_hasta
    group by f.cliente_id
  ),
  saldos as (
    select f.cliente_id, sum(case when f.tipo = 'fio' then f.monto else -f.monto end) as saldo
    from public.fiado f
    where f.empresa_id = p_empresa and f.cliente_id in (select cliente_id from periodo)
    group by f.cliente_id
  )
  select jsonb_build_object(
    'otorgado', coalesce((select sum(otorgado) from periodo), 0),
    'cobrado',  coalesce((select sum(cobrado) from periodo), 0),
    'clientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cliente_id', p.cliente_id, 'nombre', c.nombre,
               'otorgado', p.otorgado, 'cobrado', p.cobrado, 'saldo_hoy', coalesce(s.saldo, 0))
             order by p.otorgado desc, c.nombre)
      from periodo p
      join public.clientes c on c.id = p.cliente_id
      left join saldos s on s.cliente_id = p.cliente_id), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.fiado_del_periodo(uuid, date, date) from public, anon;
grant execute on function public.fiado_del_periodo(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 13. EL AVISO DEL DÍA (080) CON LA MISMA GANANCIA QUE EL PANEL
--
--    El push de la mañana («ayer ganaste X») y el de la noche calculan la
--    ganancia a mano: ventas + ingresos − costo − TODOS los gastos. Con los
--    arreglos 1 y 2 de arriba eso dejaba de coincidir con `/panel`: el día
--    que el almacén compra mercadería (con el costo cargado) o que la
--    barbería le paga a un barbero a comisión, el aviso decía «perdiste»
--    mientras el panel del mismo día decía que ganó.
--
--    No se puede llamar a `resumen_financiero` desde acá: la corrida es del
--    service_role, sin usuario, y el resumen pide sesión. Así que se aplica
--    la misma regla, con la bandera decidida para ESE día (el panel de «hoy»
--    y el de «ayer» son un período de un día):
--      · los pagos marcados `de_comision` no restan;
--      · la «Mercadería» no resta si ese día hubo costo cargado en ventas
--        que no son servicios del reparto.
--    `gastos` del aviso es el mismo número que muestra el panel ese día. Una
--    cuenta personal no tiene ventas con costo: ahí no cambia nada.
--    Copia EXACTA de la viva (080, verificada en producción el 24/09/2026
--    con pg_get_functiondef) salvo el bloque `a`. Misma firma y mismos
--    permisos (solo service_role).
-- ------------------------------------------------------------
create or replace function public.avisos_del_dia()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id',  e.id,
      'nombre',      e.nombre,
      'moneda',      e.moneda,
      'tipo_cuenta', coalesce(e.tipo_cuenta, 'emprendedor'),
      'fecha',       z.hoy,
      'hoy', jsonb_build_object(
        'ventas', a.ventas_hoy, 'ingresos', a.ingresos_hoy, 'gastos', a.gastos_hoy,
        'ganancia', a.ventas_hoy + a.ingresos_hoy - a.costo_hoy - a.gastos_hoy,
        'cargados', a.n_hoy,
        'ahorros', h.n_ahorro_hoy),
      'ayer', jsonb_build_object(
        'ventas', a.ventas_ayer, 'ingresos', a.ingresos_ayer, 'gastos', a.gastos_ayer,
        'ganancia', a.ventas_ayer + a.ingresos_ayer - a.costo_ayer - a.gastos_ayer,
        'cargados', a.n_ayer),
      'racha', jsonb_build_object('dias', r.dias, 'en_riesgo', r.en_riesgo),
      'destinatarios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', mi.user_id, 'idioma', coalesce(p.idioma, 'es'))), '[]'::jsonb)
        from public.miembros mi
        left join public.preferencias p on p.user_id = mi.user_id
        where mi.empresa_id = e.id
          and mi.rol in ('propietario', 'admin')
          and coalesce(p.aviso_diario, true)
      )
    ) as x
    from public.empresas e
    cross join lateral (
      select (now() at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date as hoy
    ) z
    cross join lateral (
      -- 106: los gastos de cada día con la regla del resumen (ver arriba).
      select b.*,
             b.gastos_todos_hoy - b.comision_hoy
               - case when b.costo_productos_hoy > 0 then b.mercaderia_hoy else 0 end   as gastos_hoy,
             b.gastos_todos_ayer - b.comision_ayer
               - case when b.costo_productos_ayer > 0 then b.mercaderia_ayer else 0 end as gastos_ayer
      from (
        select
          coalesce(sum(m.monto) filter (where m.fecha = z.hoy and m.tipo = 'venta'), 0)       as ventas_hoy,
          coalesce(sum(m.monto) filter (where m.fecha = z.hoy and m.tipo = 'ingreso'), 0)     as ingresos_hoy,
          coalesce(sum(m.monto) filter (where m.fecha = z.hoy and m.tipo = 'gasto'), 0)       as gastos_todos_hoy,
          coalesce(sum(coalesce(m.costo_total, 0)) filter (where m.fecha = z.hoy and m.tipo = 'venta'), 0) as costo_hoy,
          count(*) filter (where m.fecha = z.hoy)::int                                       as n_hoy,
          coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1 and m.tipo = 'venta'), 0)   as ventas_ayer,
          coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1 and m.tipo = 'ingreso'), 0) as ingresos_ayer,
          coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1 and m.tipo = 'gasto'), 0)   as gastos_todos_ayer,
          coalesce(sum(coalesce(m.costo_total, 0)) filter (where m.fecha = z.hoy - 1 and m.tipo = 'venta'), 0) as costo_ayer,
          count(*) filter (where m.fecha = z.hoy - 1)::int                                   as n_ayer,
          -- 106
          coalesce(sum(m.monto) filter (where m.fecha = z.hoy and m.es_comision), 0)         as comision_hoy,
          coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1 and m.es_comision), 0)     as comision_ayer,
          coalesce(sum(m.monto) filter (where m.fecha = z.hoy
                                          and m.es_mercaderia and not m.es_comision), 0)     as mercaderia_hoy,
          coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1
                                          and m.es_mercaderia and not m.es_comision), 0)     as mercaderia_ayer,
          coalesce(sum(coalesce(m.costo_total, 0)) filter (where m.fecha = z.hoy
                                          and m.tipo = 'venta' and not m.es_servicio), 0)    as costo_productos_hoy,
          coalesce(sum(coalesce(m.costo_total, 0)) filter (where m.fecha = z.hoy - 1
                                          and m.tipo = 'venta' and not m.es_servicio), 0)    as costo_productos_ayer
        from (
          select m.fecha, m.tipo, m.monto, m.costo_total,
                 (m.tipo = 'gasto' and public.es_categoria_mercaderia(m.categoria)) as es_mercaderia,
                 (m.tipo = 'gasto' and exists (
                    select 1 from public.turnos_pago tp
                    where tp.movimiento_id = m.id and tp.de_comision)) as es_comision,
                 (m.tipo = 'venta' and exists (
                    select 1 from public.turnos_atribucion ta
                    where ta.movimiento_id = m.id)) as es_servicio
          from public.movimientos m
          where m.empresa_id = e.id and m.estado = 'activo'
            and m.fecha between z.hoy - 1 and z.hoy
        ) m
      ) b
    ) a
    cross join lateral (
      select count(*)::int as n_ahorro_hoy
      from public.movimientos_ahorro ma
      where ma.empresa_id = e.id and ma.fecha = z.hoy
    ) h
    cross join lateral (
      with dias as (
        select d.fecha from public.dias_cargados(e.id, z.hoy) d(fecha)
      ),
      numeradas as (
        select fecha, (fecha - (row_number() over (order by fecha))::int) as isla
        from dias
      ),
      rachas as (
        select isla, count(*)::int as largo, max(fecha) as hasta
        from numeradas group by isla
      ),
      vigente as (
        select * from rachas where hasta in (z.hoy, z.hoy - 1) order by hasta desc limit 1
      )
      select
        coalesce((select largo from vigente), 0) as dias,
        coalesce((select hasta from vigente), z.hoy - 2) = z.hoy - 1 as en_riesgo
    ) r
    where (
        coalesce(e.tipo_cuenta, 'emprendedor') = 'personal'
        or public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta)
      )
      and public.puede_cargar(e.id)
      and (
        e.created_at > now() - interval '7 days'
        or exists (select 1 from public.movimientos m2
                   where m2.empresa_id = e.id and m2.created_at > now() - interval '30 days')
        or exists (select 1 from public.movimientos_ahorro a2
                   where a2.empresa_id = e.id and a2.created_at > now() - interval '30 days')
      )
  ) s;

  return v_res;
end $function$;

revoke all on function public.avisos_del_dia() from public, anon, authenticated;
grant execute on function public.avisos_del_dia() to service_role;
