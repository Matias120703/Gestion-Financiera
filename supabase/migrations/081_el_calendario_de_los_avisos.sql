-- ============================================================
-- 081 · EL CALENDARIO DE LOS AVISOS, DESDE LA BASE
-- ============================================================
--
-- QUÉ PASABA
--
-- Matías: «no me llega ninguna notificación». Se revisó la base y el código
-- estaba bien: la persona tiene su iPhone registrado, `avisos_del_dia()`
-- devuelve a quién escribirle, y la frase se arma. Lo que faltaba era el
-- reloj. En `envios` solo hay avisos de tipo `diario_manana`: de la tarde y
-- de la noche no hay NINGUNO, y no es que no hubiera a quién escribirle —el
-- 18/09 tres cuentas no habían cargado nada a las tres de la tarde, y una
-- había cargado a la noche—. Las tareas de la tarde y de la noche nunca
-- corrieron. La de la mañana corrió una vez, 45 minutos tarde.
--
-- Eso es el plan gratuito de Vercel: las tareas programadas corren «alguna
-- vez dentro de la hora» y con un tope por cuenta. Hay seis en vercel.json y
-- se ejecuta una.
--
-- QUÉ SE HACE
--
-- El reloj se trae acá. Supabase tiene `pg_cron` —el planificador de
-- PostgreSQL— y `pg_net` —llamadas HTTP desde la base—, gratis y sin tope.
-- Cada horario llama a la misma ruta de siempre; no cambia nada del envío.
--
-- Los dos relojes pueden convivir sin peligro: cada aviso pasa por
-- `reservar_envio`, que garantiza uno por persona, momento y día. Si Vercel
-- llega primero, la corrida de la base no manda nada, y al revés. Por eso no
-- se toca vercel.json: si algún día el plan cambia, sobra, no estorba.
--
-- EL SECRETO NO ESTÁ ACÁ
--
-- Las rutas piden `Authorization: Bearer <CRON_SECRETO>`. Ese secreto no se
-- escribe en una migración —esto vive en git— ni lo maneja nadie más que
-- Matías: se guarda en el Vault de Supabase, con una sola instrucción que
-- corre él. Hasta que lo haga, `disparar_tarea` no llama a nada y lo dice.
--
--   select vault.create_secret('<el CRON_SECRETO de Vercel>', 'cron_secreto');
--
-- Para cambiarlo después:
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'cron_secreto'),
--     '<el nuevo>');

-- ------------------------------------------------------------
-- 1. A QUÉ DIRECCIÓN LLAMAR
--
--    No es secreto —es la dirección pública del sitio— pero sí tiene que ser
--    editable: en un entorno de prueba apunta a otro lado.
-- ------------------------------------------------------------
alter table public.ajustes_orden
  add column if not exists sitio_url text not null default 'https://orden.com.py';

comment on column public.ajustes_orden.sitio_url is
  'De dónde cuelgan las rutas de tareas que dispara pg_cron (081).';

-- ------------------------------------------------------------
-- 2. LA LLAMADA
--
--    No la ejecuta nadie de afuera: `cron` corre como el dueño de la base.
--    Se revoca de todos igual, porque una función que hace pedidos HTTP con
--    un secreto adentro es exactamente lo que no se quiere dejar suelto.
-- ------------------------------------------------------------
create or replace function public.disparar_tarea(p_ruta text)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_url     text;
  v_secreto text;
begin
  -- Solo rutas de tareas: si alguna vez esta función se alcanza desde otro
  -- lado, que no sirva para pedirle nada a ninguna otra dirección.
  if p_ruta !~ '^/api/tareas/[a-z-]+$' then
    raise exception 'Esa no es una ruta de tareas.' using errcode = '22023';
  end if;

  select coalesce(sitio_url, 'https://orden.com.py') into v_url
  from public.ajustes_orden where unica;
  v_url := coalesce(v_url, 'https://orden.com.py') || p_ruta;

  begin
    select decrypted_secret into v_secreto
    from vault.decrypted_secrets where name = 'cron_secreto';
  exception when others then
    v_secreto := null;
  end;

  if v_secreto is null or v_secreto = '' then
    -- Sin secreto la ruta contestaría 401. Mejor no llamar y dejar dicho por
    -- qué, que llenar el registro de pedidos rechazados.
    raise warning 'Falta el secreto «cron_secreto» en el Vault: no se llamó a %.', p_ruta;
    return 'sin secreto';
  end if;

  perform net.http_get(
    url     := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto),
    timeout_milliseconds := 55000
  );

  return v_url;
end $fn$;

revoke all on function public.disparar_tarea(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. LOS HORARIOS
--
--    En UTC, que es la hora de la base. Paraguay es UTC-3:
--
--      12:00 → 09:00, cómo fue ayer
--      18:00 → 15:00, «todavía no cargaste nada hoy»
--      23:30 → 20:30, cómo fue hoy
--
--    Va adentro de un bloque que se traga el error a propósito: las pruebas
--    corren estas migraciones sobre una base de mentira (pglite) que no
--    tiene pg_cron ni pg_net. Que ahí no se programe nada es lo correcto;
--    lo que no puede pasar es que reviente la suite entera.
-- ------------------------------------------------------------
do $cal$
declare
  v_horarios constant text[][] := array[
    ['orden-avisos-manana',  '0 12 * * *',  '/api/tareas/avisos-manana'],
    ['orden-avisos-tarde',   '0 18 * * *',  '/api/tareas/avisos-tarde'],
    ['orden-avisos-noche',   '30 23 * * *', '/api/tareas/avisos-noche'],
    ['orden-recordatorio',   '0 0 * * *',   '/api/tareas/recordatorio'],
    ['orden-turnos-manana',  '0 22 * * *',  '/api/tareas/turnos-manana'],
    ['orden-resumen-semanal','30 11 * * 1', '/api/tareas/resumen-semanal']
  ];
  v_i integer;
begin
  execute 'create extension if not exists pg_cron';
  execute 'create extension if not exists pg_net';

  for v_i in 1 .. array_length(v_horarios, 1) loop
    -- `schedule` con un nombre que ya existe lo reemplaza, así que volver a
    -- aplicar esta migración no duplica nada.
    execute format(
      'select cron.schedule(%L, %L, %L)',
      v_horarios[v_i][1],
      v_horarios[v_i][2],
      format('select public.disparar_tarea(%L)', v_horarios[v_i][3])
    );
  end loop;
exception when others then
  raise notice 'Sin pg_cron acá (%): los avisos no se programan en este entorno.', sqlerrm;
end $cal$;
