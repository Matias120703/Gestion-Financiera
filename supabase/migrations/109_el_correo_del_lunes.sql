-- ============================================================
-- 109 · EL CORREO DEL LUNES, QUE NUNCA SALIÓ
-- ============================================================
--
-- QUÉ PASABA
--
-- El resumen semanal por correo (`/api/tareas/resumen-semanal`, los lunes a
-- las 11:30 UTC) no le llegó nunca a nadie. La ruta corre con la clave de
-- servicio, sin usuario, y le pedía los números a `resumen_financiero`,
-- `serie_financiera_diaria` y `ranking_productos`. Las tres empiezan, desde
-- la 005, con «sin sesión, error»: con la clave de servicio `auth.uid()` es
-- null, así que las tres contestaban «Necesitás iniciar sesión.» y cada
-- destinatario terminaba en `fallados`. Encima la ruta reservaba el envío
-- (`reservar_envio`) ANTES de pedir los números: esa semana quedaba gastada
-- y no se reintentaba nunca. En producción, al 24/09/2026: dos reservas
-- `semanal` (el 21/09, de dos cuentas personales) y ningún correo.
--
-- EL ARREGLO: `resumen_semanal_para(empresa, persona, desde, hasta)`
--
-- No calcula nada. Se pone en los zapatos del destinatario —le pone su id a
-- los claims del JWT, que es de donde `auth.uid()` lo lee en Supabase
-- (verificado en producción el 24/09/2026 con pg_get_functiondef)—, llama a
-- las TRES funciones vivas tal cual y deja los claims como estaban. Así el
-- correo dice exactamente lo que esa persona ve en /reportes: la regla de la
-- mercadería y la de las comisiones (106), y la ganancia en null para quien
-- no es dueño ni administrador. El día que una de las tres cambie, el correo
-- cambia con ella.
--
-- La otra opción era copiar `resumen_financiero` acá con un parámetro de
-- usuario. No: la última vez que se reescribió a mano una función así se
-- perdió una clave del jsonb, y serían tres copias que mantener iguales.
--
-- Nada se abre. La función es solo de service_role, que ya lee todas las
-- tablas, y lo que devuelve es lo mismo que el destinatario ve con su
-- sesión. Si algún día Supabase lee el usuario de otro lado, falla cerrado:
-- el resumen vuelve a decir «Necesitás iniciar sesión.» y no sale nada (la
-- ruta ahora reserva DESPUÉS de calcular, así que la semana no se pierde).
--
-- Y QUIÉN LO RECIBE (`destinatarios_resumen_semanal`, 010)
--
-- El correo dice «Vendido · N ventas · Gastado · Ganancia · Lo más
-- vendido». Copia exacta de la 010 (verificada en producción el 24/09/2026
-- con md5 de prosrc) más dos condiciones:
--
--   · La cuenta personal no vende: lo que cobra entra como ingreso. Le iba a
--     llegar «Vendido ₲0 (0 ventas)» y una «ganancia». Afuera hasta que
--     tenga un correo propio.
--   · El campo (ganadería y agricultura, `ciclosLargos` en rubros.ts) vende
--     dos o tres veces al año: casi todos los lunes le diría que perdió
--     plata. Es lo que ya se decidió con la racha: contarle la semana a
--     quien mide por campaña es contarle su fracaso.
--
-- `rubro_de_ciclos_largos()` es el espejo en la base de `ciclosLargos`;
-- pruebas/resumen-semanal.test.js los compara rubro por rubro.
--
-- Idempotente: se puede aplicar dos veces.
-- ============================================================


-- ------------------------------------------------------------
-- 1. ¿EL NEGOCIO MIDE POR CICLO LARGO? (espejo de `ciclosLargos`)
--
--    Como `fichaDe`: la cuenta personal manda sobre el rubro, y un rubro
--    desconocido es un comercio.
-- ------------------------------------------------------------
create or replace function public.rubro_de_ciclos_largos(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p_tipo_cuenta, 'emprendedor') <> 'personal'
     and coalesce(p_rubro, 'comercio') in ('ganaderia', 'agricultura');
$fn$;

revoke all on function public.rubro_de_ciclos_largos(text, text) from public, anon;
grant execute on function public.rubro_de_ciclos_largos(text, text) to authenticated;


-- ------------------------------------------------------------
-- 2. DESTINATARIOS DEL RESUMEN SEMANAL (010) sin la cuenta personal ni el campo
-- ------------------------------------------------------------
create or replace function public.destinatarios_resumen_semanal()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'user_id',    u.id,
      'email',      u.email,
      'nombre',     mi.nombre,
      'empresa_id', e.id,
      'empresa',    e.nombre,
      'moneda',     e.moneda,
      'zona',       e.zona_horaria,
      'idioma',     coalesce(p.idioma, 'es')
    ) as x
    from public.miembros mi
    join public.empresas e on e.id = mi.empresa_id
    join auth.users u      on u.id = mi.user_id
    left join public.preferencias p on p.user_id = mi.user_id
    where mi.rol in ('propietario', 'admin')
      and u.email is not null
      and coalesce(p.aviso_semanal, true)
      -- 109: el correo habla de ventas de la semana.
      and coalesce(e.tipo_cuenta, 'emprendedor') <> 'personal'
      and not public.rubro_de_ciclos_largos(e.rubro, e.tipo_cuenta)
      and exists (
        select 1 from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo'
          and m.fecha >= (now() at time zone e.zona_horaria)::date - 30
      )
  ) s;

  return v_res;
end $fn$;

revoke all on function public.destinatarios_resumen_semanal() from public, anon, authenticated;
grant execute on function public.destinatarios_resumen_semanal() to service_role;


-- ------------------------------------------------------------
-- 3. LOS NÚMEROS DE LA SEMANA, COMO LOS VE EL DESTINATARIO
--
--    Devuelve { resumen, serie, ranking }: lo que devuelven
--    `resumen_financiero`, `serie_financiera_diaria` y `ranking_productos`
--    (el primero, p_limite 1) llamadas con la sesión de `p_user`.
--
--    Volatile, no stable: cambia variables de la sesión. `set_config(…,
--    true)` dura hasta el final de la transacción, no de la función, así
--    que se devuelve a mano lo que había; si algo falla en el medio, la
--    transacción se deshace y las variables vuelven solas.
-- ------------------------------------------------------------
create or replace function public.resumen_semanal_para(
  p_empresa uuid,
  p_user    uuid,
  p_desde   date,
  p_hasta   date
)
returns jsonb language plpgsql volatile security definer set search_path = public as $fn$
declare
  v_sub    text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  v_res    jsonb;
begin
  if p_user is null then
    raise exception 'Falta para quién es el resumen.' using errcode = '22023';
  end if;

  -- Las dos formas en que `auth.uid()` busca al usuario: la vieja, un claim
  -- por variable, y la de ahora, todos juntos en un json.
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);

  v_res := jsonb_build_object(
    'resumen', public.resumen_financiero(p_empresa, p_desde, p_hasta),
    'serie',   public.serie_financiera_diaria(p_empresa, p_desde, p_hasta),
    'ranking', public.ranking_productos(p_empresa, p_desde, p_hasta, 1)
  );

  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);

  return v_res;
end $fn$;

revoke all on function public.resumen_semanal_para(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function public.resumen_semanal_para(uuid, uuid, date, date) to service_role;
