-- ============================================================
-- 121 · TAMBIÉN VENDO PRODUCTOS
-- ============================================================
--
-- Matías (01/10/2026): «¿Qué pasa si un profesor de tenis vende raquetas,
-- pelotas…? ¿Cómo va a saber su ganancia de eso?». Desde la 090 el profe y
-- el trainer no tienen catálogo ni pantalla de cobrar («un profe no compra
-- ni vende nada»): solo podían anotar ingresos y gastos sueltos, sin costo,
-- sin stock y sin saber cuánto les dejó cada raqueta.
--
-- LO QUE SE APROBÓ
--
--   Un interruptor en Ajustes, «También vendo productos», APAGADO para
--   todos. Apagado, la cuenta queda exactamente como hoy. Prendido, el
--   profe y el trainer tienen Productos (el catálogo del almacén, con costo,
--   precio y stock) y Vender (la pantalla de cobrar, con la cuenta), sin
--   fiado ni cierre del día, que siguen afuera (090, 091). Qué pantallas
--   prende lo decide la ficha de su rubro (src/lib/rubros.ts,
--   `interruptores.vendeProductos`): esta columna solo guarda si está
--   prendido. Es presentación, como toda la ficha: no protege ningún dato.
--
--   El panel, Reportes y el Excel muestran aparte lo de las clases (lo
--   cobrado de inscripciones y paquetes) y lo de los productos (vendido,
--   costo y ganancia): «Con los productos ganaste Gs. 340.000 este mes».
--
-- CÓMO SE RECONOCE UNA VENTA DE PRODUCTO: movimiento_items.afecto_stock
--
--   No por `producto_id`: los servicios del catálogo que quedaron de antes
--   de la 090 (cuando el profe era «servicios») también lo tienen, y son
--   clases. registrar_venta (002, 096) marca afecto_stock solo en una línea
--   del catálogo que controla stock EN EL MOMENTO de la venta: es la foto,
--   no cambia si después se edita el producto. El cobro de una inscripción
--   o de un paquete, una venta suelta y un servicio no la tienen: siguen
--   siendo clases.
--
-- LAS COMPRAS DE MERCADERÍA SIGUEN LA REGLA DE LA 106
--
--   resumen_financiero ya no resta la compra de mercadería en un período
--   con costo cargado en las ventas: la ganancia neta del profe con
--   productos sale bien sin tocarla. El panel del profe pasa a usar esa
--   ganancia neta para «Te queda» (antes era cobrado − gastado, que restaba
--   la compra de las raquetas y no su costo). Sin productos da el mismo
--   número que antes.
--
-- QUÉ HACE
--
--   1. empresas.vende_productos, en false. Lo cambia el dueño desde Ajustes
--      con un update directo, como el nombre y la moneda: la policy
--      empresas_update es de administración y proteger_empresa (110) solo
--      frena id, creada_por, plan y tipo_cuenta. No se toca ninguna de las
--      dos.
--   2. productos_del_periodo (nueva): vendido, unidades, operaciones,
--      costo, ganancia y margen del período, y la lista por producto. Costo,
--      ganancia y margen solo a administración (047), como ranking_productos.
--      La plata sale redondeada a la moneda (el resto del reparto del
--      descuento no es plata: ver la función).
--   3. panel_profe: copia exacta de la 116 más 'productos' y
--      'cobrado_clases' (las ventas sin lo vendido del catálogo). 'cobrado'
--      y 'gastado' no cambian.
--   4. reporte_alumnos: copia exacta de la 116 más 'productos' y
--      'cobrado_clases'; lo cobrado por clase y lo cobrado a cada alumno ya
--      no cuentan la raqueta que se le vendió. 'cobrado', 'por_paquete' y
--      'por_materia' no cambian (el cobro de un paquete nunca tiene
--      productos).
--   5. Lo que ya está: el interruptor nace apagado y no se prende solo. Si
--      un profe o un trainer ya tiene productos con stock (de antes de la
--      090), se lista; se prende desde Ajustes (como la 116).
--
-- QUÉ NO CAMBIA: registrar_venta, anular_movimiento, resumen_financiero,
-- ranking_productos y todo lo de la 119 (agenda_calendario, mi_profesional)
-- y la 120 (comienzo_de_hoy, eliminar_cliente, lista_clientes).
--
-- Cada función redefinida es copia exacta de su última versión (116) más lo
-- marcado «(121)», con los mismos permisos, security definer y search_path.
-- No hay mensajes de error nuevos: los dos que usa productos_del_periodo ya
-- tienen su portugués en src/lib/mensajes-base.ts.
--
-- ORDEN DEL DEPLOY: esta migración va a producción ANTES que el código. La
-- captura y el Excel piden `vende_productos` por nombre.
--
-- Idempotente: se puede aplicar dos veces.
-- ============================================================


-- ------------------------------------------------------------
-- 1. EL INTERRUPTOR
--
--    Presentación, como la ficha del rubro: decide qué pantallas ve el
--    profe, no qué datos puede leer. Sin candado propio: lo escribe la
--    administración (empresas_update) y nadie más.
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists vende_productos boolean not null default false;

comment on column public.empresas.vende_productos is
  'El profe o el trainer que también vende productos (121): prende Productos y Vender (src/lib/rubros.ts, interruptores.vendeProductos). Presentación: no protege nada.';

-- ------------------------------------------------------------
-- 2. LO VENDIDO DEL CATÁLOGO EN UN PERÍODO (nueva)
--
--    Las líneas con afecto_stock de las ventas activas del período. El neto
--    lleva el descuento de la venta repartido igual que ranking_productos
--    (006): cantidad × precio × monto ÷ subtotal. El costo es el congelado
--    en la línea (costo_unitario, 002). La usan panel_profe y
--    reporte_alumnos, y nadie más la necesita desde afuera; queda abierta a
--    los miembros como las otras lecturas del período.
--
--    REDONDEADO A LA MONEDA. Repartir el descuento deja restos que no son
--    plata: 2/3 se corta en el dígito 20, y una raqueta de 300.000 con
--    100.000 de descuento quedaba en 200.000,000000000000001. Restado de lo
--    cobrado, «De tus clases» decía «Gs. -0», y una raqueta vendida al costo
--    pintaba en rojo «Con los productos perdiste Gs. 0». Se redondea lo que
--    sale (vendido y costo, del total y de cada producto) a los decimales de
--    la moneda (decimales_de, 033), no cada línea: así una venta de solo
--    productos suma exactamente lo que se cobró.
-- ------------------------------------------------------------
create or replace function public.productos_del_periodo(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_admin boolean;
  v_dec   integer;
  v_res   jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  v_admin := public.es_admin(p_empresa);
  v_dec := coalesce((select public.decimales_de(moneda) from public.empresas where id = p_empresa), 2);

  with lineas as (
    select i.producto_id, i.nombre, i.cantidad, m.id as movimiento_id, m.fecha, m.created_at,
           i.cantidad * i.precio_unitario * coalesce(m.monto / nullif(m.subtotal, 0), 1) as neto,
           i.cantidad * i.costo_unitario as costo
    from public.movimiento_items i
    join public.movimientos m on m.id = i.movimiento_id
    where i.empresa_id = p_empresa
      and m.empresa_id = p_empresa
      and m.fecha between p_desde and p_hasta
      and m.estado = 'activo'
      and m.tipo = 'venta'
      -- Un producto con stock, como quedó al venderse (002): ni el cobro de
      -- una inscripción, ni una venta suelta, ni un servicio del catálogo.
      and i.afecto_stock
  ),
  por_producto as (
    select producto_id,
           (array_agg(nombre order by fecha desc, created_at desc))[1] as nombre,
           sum(cantidad)::numeric as unidades,
           round(sum(neto), v_dec)  as vendido,
           round(sum(costo), v_dec) as costo
    from lineas
    group by producto_id
  ),
  total as (
    select round(coalesce(sum(neto), 0), v_dec)  as vendido,
           round(coalesce(sum(costo), 0), v_dec) as costo,
           coalesce(sum(cantidad), 0)::numeric  as unidades,
           count(distinct movimiento_id)::int   as operaciones
    from lineas
  )
  select jsonb_build_object(
    'vendido',     t.vendido,
    'unidades',    t.unidades,
    'operaciones', t.operaciones,
    'costo',    case when v_admin then t.costo else null end,
    'ganancia', case when v_admin then t.vendido - t.costo else null end,
    'margen',   case when v_admin and t.vendido > 0 then ((t.vendido - t.costo) / t.vendido) * 100 else null end,
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
               'producto_id', p.producto_id, 'nombre', p.nombre,
               'unidades', p.unidades, 'vendido', p.vendido,
               'costo',    case when v_admin then p.costo else null end,
               'ganancia', case when v_admin then p.vendido - p.costo else null end)
             order by p.vendido desc, p.nombre)
      from por_producto p), '[]'::jsonb)
  ) into v_res
  from total t;

  return v_res;
end $fn$;

revoke all on function public.productos_del_periodo(uuid, date, date) from public, anon;
grant execute on function public.productos_del_periodo(uuid, date, date) to authenticated;

-- ------------------------------------------------------------
-- 3. EL PANEL DEL PROFE (116:671-730)
--
--    Copia exacta de la 116 con lo marcado (121): lo vendido del catálogo
--    ('productos') y lo cobrado de las clases ('cobrado_clases'). 'cobrado'
--    sigue siendo todo lo que entró y 'gastado' todo lo que salió: «Te
--    queda» lo calcula la pantalla con la ganancia neta de
--    resumen_financiero (regla de la 106).
-- ------------------------------------------------------------
create or replace function public.panel_profe(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona text;
  v_hoy  date;
  v_res  jsonb;
  -- (121)
  v_productos jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;
  v_hoy := public.hoy_empresa(p_empresa);
  -- (121) Lo vendido del catálogo en el período: una sola lectura, que
  -- sirve para la tarjeta de productos y para separar lo de las clases.
  v_productos := public.productos_del_periodo(p_empresa, p_desde, p_hasta);

  select jsonb_build_object(
    'hoy', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'hora', to_char(r.inicia at time zone v_zona, 'HH24:MI'),
        'alumno', r.cliente_nombre, 'estado', r.estado, 'materia', pq.materia,
        'notas', nullif(trim(cl.notas), '')) order by r.inicia)
      from public.turnos_reserva r
      left join public.paquetes pq on pq.id = r.paquete_id
      left join public.clientes cl on cl.id = r.cliente_id and cl.empresa_id = r.empresa_id
      where r.empresa_id = p_empresa and r.estado <> 'cancelada'
        and (r.inicia at time zone v_zona)::date = v_hoy), '[]'::jsonb),
    'clases_periodo', (
      select count(*)::int from public.turnos_reserva r
      where r.empresa_id = p_empresa and r.estado = 'atendida'
        and (r.inicia at time zone v_zona)::date between p_desde and p_hasta),
    'cobrado', coalesce((
      select sum(m.monto) from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo in ('venta', 'ingreso')
        and m.fecha between p_desde and p_hasta), 0),
    'gastado', coalesce((
      select sum(m.monto) from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
        and m.fecha between p_desde and p_hasta), 0),
    'por_cobrar', coalesce((
      select sum(p.precio) from public.paquetes p
      where p.empresa_id = p_empresa and p.movimiento_id is null and p.precio > 0 and not p.cerrado
        -- (116)
        and exists (select 1 from public.clientes c where c.id = p.cliente_id and c.activo)), 0),
    'deben', (
      select count(distinct p.cliente_id)::int from public.paquetes p
      where p.empresa_id = p_empresa and p.movimiento_id is null and p.precio > 0 and not p.cerrado
        -- (116)
        and exists (select 1 from public.clientes c where c.id = p.cliente_id and c.activo)),
    'alumnos_activos', (
      select count(distinct p.cliente_id)::int from public.paquetes p
      where p.empresa_id = p_empresa and not p.cerrado
        and (public.estado_paquete(p.id)->>'estado') = 'activo'
        -- (116)
        and exists (select 1 from public.clientes c where c.id = p.cliente_id and c.activo)),
    -- (121) La raqueta, la proteína: vendido, costo y ganancia (esas dos,
    -- solo a administración). Y lo cobrado de las clases: las ventas del
    -- período sin lo vendido del catálogo (sin los otros ingresos, que
    -- siguen dentro de 'cobrado').
    'productos', v_productos,
    'cobrado_clases', coalesce((
      select sum(m.monto) from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'venta'
        and m.fecha between p_desde and p_hasta), 0) - (v_productos->>'vendido')::numeric
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.panel_profe(uuid, date, date) from public, anon;
grant execute on function public.panel_profe(uuid, date, date) to authenticated;

-- ------------------------------------------------------------
-- 4. ALUMNOS DEL PERÍODO (116:744-933)
--
--    Copia exacta de la 116 con lo marcado (121): lo de las clases aparte
--    de lo de los productos, con lo de los productos redondeado a la moneda
--    como en productos_del_periodo. Sin productos vendidos, todos los
--    números son los de la 116 y 'cobrado_clases' es igual a 'cobrado'.
-- ------------------------------------------------------------
create or replace function public.reporte_alumnos(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona text;
  v_hoy  date;
  v_res  jsonb;
  -- (121)
  v_dec  integer;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;
  v_hoy := public.hoy_empresa(p_empresa);
  -- (121) Lo de los productos, redondeado a la moneda como en
  -- productos_del_periodo: lo de las clases es el mismo número del panel y
  -- el resto del reparto del descuento nunca lo deja en «-0».
  v_dec := coalesce((select public.decimales_de(moneda) from public.empresas where id = p_empresa), 2);

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
             else 'activo' end as estado,
           -- (116) Si su alumno sigue en la lista.
           al.activo as alumno_activo
    from public.paquetes p
    join public.clientes al on al.id = p.cliente_id
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
  -- (121) Lo que de cada venta es un producto con stock (la raqueta, la
  -- proteína), con el descuento repartido como en ranking_productos. La
  -- marca es afecto_stock (002): la foto del momento de la venta. El cobro
  -- de una inscripción, una venta suelta y un servicio del catálogo («Clase»,
  -- sin stock, de antes de la 090) no la tienen: siguen siendo clases.
  prod as (
    select i.movimiento_id,
           sum(i.cantidad * i.precio_unitario * coalesce(v.monto / nullif(v.subtotal, 0), 1)) as neto
    from public.movimiento_items i
    join ventas v on v.id = i.movimiento_id
    where i.empresa_id = p_empresa and i.afecto_stock
    group by i.movimiento_id
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
           -- (121) Lo cobrado de sus clases: sin lo que le vendiste del catálogo.
           coalesce((select round(sum(v.monto - coalesce(pr.neto, 0)), v_dec) from ventas v
                     left join prod pr on pr.movimiento_id = v.id
                     where v.cliente_id = c.id), 0) as cobrado,
           coalesce((select sum(q.precio) from paq q
                     where q.cliente_id = c.id and q.movimiento_id is null
                       and q.precio > 0 and not q.cerrado
                       -- (116)
                       and q.alumno_activo), 0) as debe_inscripciones,
           greatest(coalesce((select f.saldo from fiado f where f.cliente_id = c.id), 0), 0) as debe_fiado,
           (select jsonb_build_object('id', q.id, 'nombre', q.nombre, 'materia', q.materia,
                                      'clases', q.clases, 'usadas', q.usadas,
                                      'quedan', greatest(0, q.clases - q.usadas),
                                      'vence_el', q.vence_el)
              from paq q where q.cliente_id = c.id and q.estado = 'activo'
                -- (116)
                and q.alumno_activo
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
    -- (121) Lo cobrado de las clases: todo lo cobrado menos lo vendido del
    -- catálogo. Sin productos es el mismo número que 'cobrado'.
    'cobrado_clases', coalesce((select sum(monto) from ventas), 0) - round(coalesce((select sum(neto) from prod), 0), v_dec),
    -- Sin clases dadas no hay «por clase»: null, no un cero que parece dato.
    'cobrado_por_clase', (
      select case when coalesce(sum(k.cantidad), 0) > 0
                  -- (121) Por clase cuenta solo lo de las clases.
                  then (coalesce((select sum(monto) from ventas), 0) - round(coalesce((select sum(neto) from prod), 0), v_dec)) / sum(k.cantidad)
                  else null end
      from clases k where k.motivo = 'dada'),
    'por_cobrar', coalesce((select sum(q.precio) from paq q
                            where q.movimiento_id is null and q.precio > 0 and not q.cerrado
                              -- (116)
                              and q.alumno_activo), 0),
    -- El fiado va aparte de las inscripciones: así «por cobrar» es el mismo
    -- número que `por_cobrar_alumnos` y la suma de `alumnos[].debe` es
    -- por_cobrar + fiado_pendiente, sin contar nada dos veces.
    'fiado_pendiente', coalesce((select sum(a.debe_fiado) from por_alumno a), 0),
    'activos', (select count(distinct q.cliente_id)::int from paq q
                where q.estado = 'activo'
                  -- (116)
                  and q.alumno_activo),
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
        -- (116) A un alumno eliminado no se lo llama.
        and q.alumno_activo
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
      ) x), '[]'::jsonb) else '[]'::jsonb end,
    -- (121) El catálogo del período, aparte de las clases.
    'productos', public.productos_del_periodo(p_empresa, p_desde, p_hasta)
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.reporte_alumnos(uuid, date, date) from public, anon;
grant execute on function public.reporte_alumnos(uuid, date, date) to authenticated;

-- ------------------------------------------------------------
-- 5. LO QUE YA ESTÁ: SOLO SE LISTA (como la 116)
--
--    El interruptor nace apagado para todos. Si un profe o un trainer ya
--    tiene productos con stock (de antes de la 090, cuando era «servicios»),
--    no se le prende solo: se lista, y se prende desde Ajustes.
-- ------------------------------------------------------------
do $$
declare
  v_f record;
begin
  for v_f in
    select e.nombre, count(*)::int as productos
    from public.empresas e
    join public.productos p on p.empresa_id = e.id and p.activo and p.controla_stock
    where e.tipo_cuenta <> 'personal' and public.rubro_de_alumnos(e.rubro) and not e.vende_productos
    group by e.nombre
    order by e.nombre
  loop
    raise notice '121: «%» da clases y tiene % productos con stock: el interruptor queda apagado (se prende en Ajustes).',
      v_f.nombre, v_f.productos;
  end loop;
end $$;
