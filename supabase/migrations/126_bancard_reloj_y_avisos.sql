-- ============================================================
-- 126 · BANCARD (3 de 3): EL AVISO DE VENCIMIENTO Y EL RELOJ
-- ============================================================
--
-- Lo último de Bancard en la base (ver 124 y 125).
--
-- 1. EL AVISO DE VENCIMIENTO SABE CÓMO PAGA CADA CUENTA
--
-- `vencimientos_por_avisar` (107) le decía lo mismo a todos: «se te vence,
-- transferí». Con Bancard hay tres casos y el aviso tiene que distinguirlos:
--
--   · la cuenta tiene una tarjeta guardada y el débito al día → «el día X
--     cobramos Gs. Y de tu Visa •••• 0016, no tenés que hacer nada»;
--   · la cuenta puede pagar con Bancard pero no tiene tarjeta (o paga con
--     QR, que no se debita solo) → «entrá y pagá con tarjeta o QR»;
--   · la cuenta todavía no ve Bancard → lo de hoy.
--
-- Para eso cada fila gana tres claves: `debito` (la tarjeta y la fecha del
-- cobro, o null), `bancard` (si la cuenta está habilitada) e `importe` (lo
-- que de verdad se le va a cobrar: con sus personas y su descuento). `precio`
-- sigue siendo el de lista, como siempre. Lo demás no cambia: mismas cuentas,
-- mismos días, mismo orden, mismos permisos.
--
-- 2. EL RELOJ
--
-- Dos tareas nuevas en pg_cron, con `disparar_tarea` (081), que ya acepta
-- esas rutas:
--
--   · `orden-cobros-bancard`: cada hora de 09:07 a 18:07 de Paraguay (12 a
--     21 UTC). Cobra de la tarjeta guardada lo que vence. Varias corridas por
--     día y no una: cada corrida cobra pocas cuentas (hablar con Bancard
--     tarda), y a nadie se le cobra dos veces el mismo día
--     (`bancard_tomar_cobro`, 125).
--   · `orden-conciliar-bancard`: cada 10 minutos. Resuelve las operaciones
--     que quedaron sin confirmar preguntándole a Bancard (el manual: pasado
--     ese tiempo, consultar; si no se pagó, revertir).
--
-- Con Bancard sin configurar las dos rutas contestan «omitida» y no hacen
-- nada. `vercel.json` no se toca: el reloj de Orden es pg_cron.
--
-- No hay mensajes nuevos: nada de acá lanza errores.
--
-- Idempotente: un `create or replace`, un revoke, un grant y dos
-- `cron.schedule` (que reemplazan la tarea del mismo nombre). Sin una sola
-- barra invertida.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LOS VENCIMIENTOS, CON LO DE BANCARD
--
--    Copia exacta de la 107. Cambia: tres claves más por fila, `debito`,
--    `bancard` e `importe`.
-- ------------------------------------------------------------
create or replace function public.vencimientos_por_avisar()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x order by (x->>'dias')::int, x->>'nombre'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'tipo',        case when s.estado = 'prueba' then 'prueba' else 'periodo' end,
      'empresa_id',  e.id,
      'nombre',      e.nombre,
      'tipo_cuenta', coalesce(e.tipo_cuenta, 'emprendedor'),
      'plan',        s.plan,
      'periodo',     coalesce(s.periodo, 'mensual'),
      'fin',         s.periodo_fin,
      -- La fecha en la zona del negocio: es la que se escribe en el aviso y
      -- la que arma la clave de «una vez por vencimiento».
      'fecha_fin',   (s.periodo_fin at time zone z.zona)::date,
      'dias',        d.dias,
      'moneda',      'PYG',
      'precio', (
        select pr.importe
        from public.precios pr
        where pr.tipo_cuenta = coalesce(e.tipo_cuenta, 'emprendedor')
          and pr.plan = s.plan
          and pr.periodo = coalesce(s.periodo, 'mensual')
          and pr.moneda = 'PYG'
          and pr.activo
        limit 1
      ),
      'destinatarios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', mi.user_id,
          'idioma',  coalesce(p.idioma, 'es'),
          'nombre',  coalesce(mi.nombre, ''),
          'email',   u.email
        ) order by mi.rol desc, mi.created_at), '[]'::jsonb)
        from public.miembros mi
        left join public.preferencias p on p.user_id = mi.user_id
        left join auth.users u on u.id = mi.user_id
        where mi.empresa_id = e.id and mi.rol in ('propietario', 'admin')
      ),
      -- 126: la tarjeta de la que se va a cobrar y qué día, si la cuenta
      -- tiene el débito al día. Si no, null: paga la persona.
      'debito', (
        select jsonb_build_object(
          'marca',       t.marca,
          'ultimos4',    t.ultimos4,
          'fecha_cobro', (s.periodo_fin at time zone z.zona)::date + (public.bancard_dias_de_cobro())[1])
        from public.bancard_cuentas c
        join public.bancard_tarjetas t on t.id = c.tarjeta_id
        where c.empresa_id = e.id
          and c.debito_activo and c.debito_estado = 'al_dia'
          and t.estado = 'activa'
          -- Revisión 03/10: también la prueba con tarjeta guardada (la
          -- convierte el cobro automático, bancard_tomar_cobro).
          and s.estado in ('activa', 'prueba')
      ),
      -- 126: si la administración le habilitó el pago con Bancard.
      'bancard', coalesce((
        select c.habilitada from public.bancard_cuentas c where c.empresa_id = e.id
      ), false),
      -- 126: lo que se le cobra de verdad (sus personas, su descuento). Null
      -- si no se puede cotizar.
      'importe', public.bancard_importe_de_renovacion(e.id)
    ) as x
    from public.suscripciones s
    join public.empresas e on e.id = s.empresa_id
    cross join lateral (
      select coalesce(e.zona_horaria, 'America/Asuncion') as zona
    ) z
    cross join lateral (
      select (s.periodo_fin at time zone z.zona)::date
             - (now() at time zone z.zona)::date as dias
    ) d
    where s.periodo_fin is not null
      and d.dias in (0, 1, 3)
      and (
        (s.estado = 'prueba' and s.periodo_fin > now())
        or (s.estado = 'activa'
            and s.plan <> 'gratis'
            and not coalesce(s.cancela_al_vencer, false))
      )
  ) t;

  return v_res;
end $fn$;

revoke all on function public.vencimientos_por_avisar() from public, anon, authenticated;
grant execute on function public.vencimientos_por_avisar() to service_role;

-- ------------------------------------------------------------
-- 2. EL RELOJ (como 113: sin pg_cron no se programa nada y no revienta)
--
--    Horarios en UTC. 12 a 21 UTC = 09 a 18 de Paraguay.
-- ------------------------------------------------------------
do $cal$
begin
  execute format('select cron.schedule(%L, %L, %L)', 'orden-cobros-bancard', '7 12-21 * * *',
    format('select public.disparar_tarea(%L)', '/api/tareas/cobros-bancard'));
  execute format('select cron.schedule(%L, %L, %L)', 'orden-conciliar-bancard', '*/10 * * * *',
    format('select public.disparar_tarea(%L)', '/api/tareas/conciliar-bancard'));
exception when others then
  raise notice 'Sin pg_cron acá (%): los cobros y la conciliación de Bancard no se programan en este entorno.', sqlerrm;
end $cal$;
