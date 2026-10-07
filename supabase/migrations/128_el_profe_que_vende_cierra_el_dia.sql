-- ============================================================
-- 128 · EL PROFE QUE VENDE CIERRA EL DÍA
-- ============================================================
--
-- Matías (07/10/2026): «También tenemos que agregar lo que sería cierre del
-- día, en la parte de cuando el profesor activa lo que sería venta de
-- productos y más cosas. Tiene que tener un cierre del día también.»
--
-- DE DÓNDE VIENE
--
-- La 090 («Un profe no cierra caja») le sacó el Cierre del día al profe, y
-- la 097 al trainer, por un motivo que sigue valiendo: con el rubro en
-- `true`, a quien no da clases los sábados le llegaba todos los sábados
-- «no cargaste nada hoy». Es retarlo por descansar.
--
-- La 121 sumó «También vendo productos» (`empresas.vende_productos`): el
-- profe de tenis que vende raquetas, el trainer que vende proteína. Ese
-- profe sí tiene algo que cerrar a la noche: lo que cobró de sus clases y
-- lo que vendió, contra lo que gastó.
--
-- LA DECISIÓN: DOS PREGUNTAS, DOS FUNCIONES
--
--   · `rubro_cierra_el_dia(rubro, tipo)` NO SE TOCA. Contesta «¿este RUBRO
--     vive al día?» y es la llave de los avisos que EMPUJAN a cargar: el de
--     la mañana, el de la tarde y el recordatorio de la racha
--     (`empresas_sin_cargar_hoy`). El profe que vende tampoco da clases ni
--     vende raquetas todos los días: ninguno de esos tres le llega.
--
--   · `cuenta_cierra_el_dia(empresa)` ES NUEVA. Contesta «¿ESTA cuenta
--     tiene Cierre del día?»: el rubro cierra, o es un negocio de alumnos
--     con el interruptor prendido. Es la autoridad de la pantalla; su
--     espejo es `fichaDeLaCuenta(empresa).secciones['/cierre']`
--     (src/lib/rubros.ts), y pruebas/cierre-profe.test.js compara los dos
--     lados, cuenta por cuenta.
--
-- LOS AVISOS DEL PROFE QUE VENDE
--
--   · Mañana, tarde y recordatorio de racha: NO. Los tres retan un día sin
--     clases («anotá tu primera venta de hoy», «todavía no cargaste nada»,
--     «cargá algo para no perder la racha»).
--   · Noche: SÍ, y solo si ese día cargó plata. No reta: es el resumen de
--     un día que existió, y lo lleva a su cierre. La frase la elige el
--     código (`fraseDelDia`), que con un día vacío no manda nada.
--
-- Por eso `avisos_del_dia` gana un parámetro, `p_momento`, con default
-- null. Sin él devuelve EXACTAMENTE las cuentas de siempre; con 'noche'
-- suma las que `cuenta_cierra_el_dia` dice. Cada fila trae además la clave
-- `de_alumnos`, para que el código elija la frase del profe.
--
-- COMPATIBLE CON EL CÓDIGO PUBLICADO (esta migración se aplica ANTES del
-- deploy). El código de hoy llama `avisos_del_dia()` sin argumentos: cae en
-- el default y recibe las mismas cuentas con las mismas claves, más una
-- (`de_alumnos`) que ignora. Ninguna otra función cambia de firma.
--
-- OJO AL APLICARLA: cambia la firma de `avisos_del_dia`, así que hay un
-- `drop` y un `create`. Tienen que ir en UNA sola transacción (una sola
-- llamada de la herramienta que aplica): entre uno y otro la base no puede
-- quedar sin la función. Con las dos firmas vivas, la llamada sin
-- argumentos sería ambigua; por eso el drop (como en 019, 048, 055 y 095).
-- Y antes de aplicarla, comparar el cuerpo vivo (`pg_get_functiondef`) con
-- el de la 106: esta copia sale de ahí.
--
-- QUÉ NO CAMBIA
--
-- `rubro_cierra_el_dia`, `empresas_sin_cargar_hoy`, `cierre_del_dia`,
-- `marcar_cierre`, `racha_empresa`, `dias_cargados`, `panel_profe`,
-- `reporte_alumnos`, `productos_del_periodo` y `resumen_financiero`: ni una
-- coma. `cierre_del_dia` y `marcar_cierre` nunca miraron el rubro (solo
-- que quien llama sea de la cuenta), y lo cobrado de las clases y lo
-- vendido en productos ya son todos movimientos de tipo venta: la base ya
-- calculaba bien el cierre de esta cuenta. Faltaba abrir la puerta.
--
-- No toca datos. Idempotente: aplicada dos veces deja lo mismo.
-- Apagar el interruptor vuelve todo a como estaba; los días ya cerrados
-- (tabla `cierres`) quedan guardados.

-- ------------------------------------------------------------
-- 1. ¿ESTA CUENTA TIENE CIERRE DEL DÍA?
--
--    El rubro cierra (comercio y servicios), o es un negocio de alumnos
--    (profe, trainer) que prendió «También vendo productos». Una cuenta
--    personal nunca, aunque tenga la columna prendida a mano. Una cuenta
--    que no existe, tampoco.
--
--    Definer porque lee `empresas` para funciones que corren sin usuario
--    (los avisos). La llaman solo otras funciones y las pruebas: sin
--    permiso para nadie más, como `dias_cargados` y `rubro_tiene_fiado`.
-- ------------------------------------------------------------
create or replace function public.cuenta_cierra_el_dia(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce((
    select public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta)
        or (coalesce(e.tipo_cuenta, 'emprendedor') <> 'personal'
            and public.rubro_de_alumnos(e.rubro)
            and coalesce(e.vende_productos, false))
    from public.empresas e
    where e.id = p_empresa
  ), false);
$fn$;

revoke all on function public.cuenta_cierra_el_dia(uuid) from public, anon, authenticated;
grant execute on function public.cuenta_cierra_el_dia(uuid) to service_role;

comment on function public.cuenta_cierra_el_dia(uuid) is
  'Si ESTA cuenta tiene Cierre del dia (128): su rubro cierra, o es de alumnos y vende productos. Espejo de fichaDeLaCuenta(empresa).secciones[/cierre] en src/lib/rubros.ts.';

-- ------------------------------------------------------------
-- 2. LOS AVISOS DEL DÍA, CON EL MOMENTO
--
--    Copia EXACTA de la viva (106) salvo las dos líneas marcadas (128) y
--    la firma:
--      · la clave `de_alumnos`, para que el código elija la frase;
--      · con p_momento = 'noche' entran además las cuentas que tienen
--        Cierre del día por el interruptor.
--    Sin p_momento, el `where` es el de siempre.
--    Mismos permisos (solo service_role).
-- ------------------------------------------------------------
drop function if exists public.avisos_del_dia();

create or replace function public.avisos_del_dia(p_momento text default null)
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
      'de_alumnos', (coalesce(e.tipo_cuenta, 'emprendedor') <> 'personal' and public.rubro_de_alumnos(e.rubro)), -- (128)
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
        or (p_momento = 'noche' and public.cuenta_cierra_el_dia(e.id)) -- (128)
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

revoke all on function public.avisos_del_dia(text) from public, anon, authenticated;
grant execute on function public.avisos_del_dia(text) to service_role;
