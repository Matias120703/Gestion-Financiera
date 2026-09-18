-- ============================================================
-- 076 · LOS AVISOS DIARIOS, CON MÁS FUERZA
-- ============================================================
--
-- No hay widget de pantalla de inicio: eso pide una app nativa (Swift para
-- iPhone, Kotlin para Android) subida a cada tienda, y Orden es una PWA a
-- propósito —se instala en un minuto, sin pasar por ninguna revisión—. Es
-- una limitación real del sistema, no una que se resuelva con código.
--
-- Matías, de acuerdo: «por ahora metámosle más fuerza a los avisos, y
-- cuando subamos a las tiendas metemos los widgets». Esto es la primera
-- parte: los avisos de la mañana, la tarde y la noche (071) ahora también
-- dicen la racha de días seguidos, que es lo que en Duolingo hace que la app
-- se sienta presente sin necesitar un widget.
--
-- La racha ya se calculaba para el panel (`racha_empresa`, 008), pero esa
-- función exige `auth.uid()` porque la llama la persona con su sesión. Acá
-- la llama un cron con el rol de servicio, sin sesión de nadie: se repite el
-- mismo cálculo, sin la comprobación de sesión, adentro de esta función.

create or replace function public.avisos_del_dia()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id',  e.id,
      'nombre',      e.nombre,
      'moneda',      e.moneda,
      'tipo_cuenta', coalesce(e.tipo_cuenta, 'emprendedor'),
      -- La fecha de hoy EN LA ZONA DEL NEGOCIO: con ella se arma la clave
      -- de «una vez por día».
      'fecha',       z.hoy,
      'hoy', jsonb_build_object(
        'ventas', a.ventas_hoy, 'ingresos', a.ingresos_hoy, 'gastos', a.gastos_hoy,
        'ganancia', a.ventas_hoy + a.ingresos_hoy - a.costo_hoy - a.gastos_hoy, 'cargados', a.n_hoy),
      'ayer', jsonb_build_object(
        'ventas', a.ventas_ayer, 'ingresos', a.ingresos_ayer, 'gastos', a.gastos_ayer,
        'ganancia', a.ventas_ayer + a.ingresos_ayer - a.costo_ayer - a.gastos_ayer, 'cargados', a.n_ayer),
      -- Días seguidos cargando, la misma cuenta que ve el panel (008). Si
      -- hoy ya cargó algo, cuenta hasta hoy; si no, hasta ayer —que es
      -- justo lo que hace falta a la tarde para el empujón «no la cortés»—.
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
      select
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy and m.tipo = 'venta'), 0)       as ventas_hoy,
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy and m.tipo = 'ingreso'), 0)     as ingresos_hoy,
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy and m.tipo = 'gasto'), 0)       as gastos_hoy,
        coalesce(sum(coalesce(m.costo_total, 0)) filter (where m.fecha = z.hoy and m.tipo = 'venta'), 0) as costo_hoy,
        count(*) filter (where m.fecha = z.hoy)::int                                       as n_hoy,
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1 and m.tipo = 'venta'), 0)   as ventas_ayer,
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1 and m.tipo = 'ingreso'), 0) as ingresos_ayer,
        coalesce(sum(m.monto) filter (where m.fecha = z.hoy - 1 and m.tipo = 'gasto'), 0)   as gastos_ayer,
        coalesce(sum(coalesce(m.costo_total, 0)) filter (where m.fecha = z.hoy - 1 and m.tipo = 'venta'), 0) as costo_ayer,
        count(*) filter (where m.fecha = z.hoy - 1)::int                                   as n_ayer
      from public.movimientos m
      where m.empresa_id = e.id and m.estado = 'activo'
        and m.fecha between z.hoy - 1 and z.hoy
    ) a
    cross join lateral (
      with dias as (
        select distinct m.fecha
        from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo' and m.fecha <= z.hoy
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
        -- En riesgo: la racha llega hasta ayer y hoy todavía no cargó nada.
        -- Sin racha (dias = 0) esto da false, que es lo correcto.
        coalesce((select hasta from vigente), z.hoy - 2) = z.hoy - 1 as en_riesgo
    ) r
    where (
        coalesce(e.tipo_cuenta, 'emprendedor') = 'personal'
        or public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta)
      )
      -- Una cuenta vencida no puede cargar: pedirle que cargue es mentirle.
      and public.puede_cargar(e.id)
      and (
        e.created_at > now() - interval '7 days'
        or exists (select 1 from public.movimientos m2
                   where m2.empresa_id = e.id and m2.created_at > now() - interval '30 days')
      )
  ) s;

  return v_res;
end $fn$;

revoke all on function public.avisos_del_dia() from public, anon, authenticated;
grant execute on function public.avisos_del_dia() to service_role;
