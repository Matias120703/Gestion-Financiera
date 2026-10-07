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
--   · la cuenta tiene el plan activo, una tarjeta guardada y el débito al
--     día → «el día X cobramos Gs. Y de tu Visa •••• 0016, no tenés que
--     hacer nada»;
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
-- Revisión 07/10: el aviso no promete un cobro que no va a salir.
--   · `debito` es null para una cuenta EN PRUEBA aunque tenga la tarjeta
--     guardada: a una prueba no se le cobra sola (125).
--   · `debito` trae el `entorno` de la tarjeta. La base no sabe en qué
--     entorno corre el servidor: es el servidor el que descarta el débito
--     si la tarjeta es de otro entorno (una de staging después de pasar a
--     producción) o si Bancard está apagado, y avisa «pagá vos».
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
-- Los dos relojes se programan acá y no «el día que se prenda»: hacen falta
-- durante la certificación, y un paso a mano más es un paso que se olvida.
-- Como la conciliación corre 144 veces por día, se suma una tercera tarea:
--
--   · `orden-purgar-cron`: los domingos, borra de `cron.job_run_details`
--     lo de más de 14 días. pg_cron no limpia esa tabla sola.
--
-- 3. NO SE APLICA SIN LA 124 Y LA 125
--
-- `vencimientos_por_avisar` es plpgsql: se crea sin mirar si existe lo que
-- nombra adentro. Si la 125 fallaba y se aplicaba igual esta, el aviso de
-- vencimiento de TODOS los clientes quedaba roto sin que nada lo dijera.
-- Por eso lo primero es una guarda que frena con un mensaje claro.
--
-- Mensaje nuevo, solo para quien aplica la migración (no llega a ninguna
-- pantalla): «Falta aplicar la 124 y la 125 antes que la 126: …».
--
-- Idempotente: la guarda, un `create or replace`, un revoke, un grant y
-- tres `cron.schedule` (que reemplazan la tarea del mismo nombre). Sin una
-- sola barra invertida.
-- ============================================================

-- ------------------------------------------------------------
-- 0. LA GUARDA: SIN LA 124 Y LA 125 NO SE TOCA NADA
-- ------------------------------------------------------------
do $guarda$
declare
  v_falta text := '';
begin
  if to_regclass('public.bancard_cuentas') is null then
    v_falta := v_falta || ' la tabla bancard_cuentas (124);';
  end if;
  if to_regclass('public.bancard_tarjetas') is null then
    v_falta := v_falta || ' la tabla bancard_tarjetas (124);';
  end if;
  if to_regprocedure('public.bancard_dias_de_cobro()') is null then
    v_falta := v_falta || ' bancard_dias_de_cobro (125);';
  end if;
  if to_regprocedure('public.bancard_importe_de_renovacion(uuid)') is null then
    v_falta := v_falta || ' bancard_importe_de_renovacion (125);';
  end if;
  -- Lo último que crea la 125: si está, la 125 terminó entera.
  if to_regprocedure('public.bancard_baja_caduca()') is null then
    v_falta := v_falta || ' bancard_baja_caduca (el final de la 125);';
  end if;
  if v_falta <> '' then
    raise exception 'Falta aplicar la 124 y la 125 antes que la 126: no existe%', v_falta;
  end if;
end $guarda$;

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
      -- tiene el débito al día. Si no, null: paga la persona. Lleva el
      -- entorno de la tarjeta: el servidor descarta el débito si no es el
      -- suyo (la base no sabe en qué entorno corre el servidor).
      'debito', (
        select jsonb_build_object(
          'marca',       t.marca,
          'ultimos4',    t.ultimos4,
          'entorno',     t.entorno,
          'fecha_cobro', (s.periodo_fin at time zone z.zona)::date + (public.bancard_dias_de_cobro())[1])
        from public.bancard_cuentas c
        join public.bancard_tarjetas t on t.id = c.tarjeta_id
        where c.empresa_id = e.id
          and c.debito_activo and c.debito_estado = 'al_dia'
          and t.estado = 'activa'
          -- Revisión 07/10: solo planes activos. A una prueba no se le
          -- cobra sola aunque tenga la tarjeta guardada (bancard_tomar_cobro).
          and s.estado = 'activa'
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

-- La purga del registro de pg_cron, en su propio bloque: si esta falla, los
-- dos relojes de arriba quedan programados igual. Domingos 05:15 UTC.
do $cal$
begin
  execute format('select cron.schedule(%L, %L, %L)', 'orden-purgar-cron', '15 5 * * 0',
    format('delete from cron.job_run_details where end_time < now() - interval %L', '14 days'));
exception when others then
  raise notice 'Sin pg_cron acá (%): la purga del registro de pg_cron no se programa en este entorno.', sqlerrm;
end $cal$;
