-- ============================================================
-- 107 · EL AVISO DE QUE SE VENCE EL PLAN
-- ============================================================
--
-- QUÉ PASABA
--
-- Orden avisaba una sola cosa sobre la plata de la suscripción: que la
-- PRUEBA se termina (`pruebas_por_terminar`, 071), y solo por push. Al que
-- ya PAGA no le decía nada: el día que se le vence el período, la cuenta se
-- corta (ver CandadoCuenta) y la persona se entera cuando ya no puede
-- cargar. Es el peor momento para enterarse, y es el cliente que más
-- cuidamos: el que ya confió y pagó.
--
-- Y el push, solo, no alcanza para algo que corta la cuenta: en iPhone llega
-- únicamente si Orden está en la pantalla de inicio (ver lib/avisos.ts,
-- «nunca puede ser el único canal de algo importante»).
--
-- QUÉ SE HACE
--
-- Una lectura nueva, `vencimientos_por_avisar()`, que contesta quién vence y
-- cuándo, con dos clases de vencimiento en la misma lista:
--
--   · 'periodo' → suscripción ACTIVA (paga) cuyo período termina en 3 días,
--     en 1 o hoy. Recibe push Y correo.
--   · 'prueba'  → suscripción en PRUEBA que termina en 3 días, en 1 o hoy.
--     El push ya lo manda `pruebas_por_terminar` (071, no se toca); acá se
--     suma el correo, que era lo que faltaba.
--
-- Los mismos tres momentos que la prueba (3, 1, 0): el primero da tiempo a
-- transferir, el segundo recuerda, el tercero es la última oportunidad. Dos
-- días antes no, para no escribirle todos los días.
--
-- Trae lo que hace falta para escribir el aviso sin otra consulta: el plan,
-- el período, la fecha de fin EN LA ZONA DEL NEGOCIO («vence mañana» tiene
-- que ser mañana para él), el precio y a quién escribirle (dueño y
-- administradores, con su idioma, su nombre y su correo).
--
-- EL PRECIO: EL DE LISTA, EN GUARANÍES
--
-- La suscripción se cobra siempre en guaraníes (decisión del 23/09, ver
-- 105), así que el precio sale de `precios` en PYG, para el tipo de cuenta,
-- el plan y el período de la suscripción (null → mensual). Es el precio de
-- lista: el descuento por constancia (079, 093) depende de la racha del día
-- en que paga y lo calcula la administración al cobrar, así que prometerlo
-- en un correo tres días antes podría ser mentira. Si no hay precio de lista
-- para esa combinación, `precio` es null y el aviso no dice ningún número:
-- nunca un «Gs. 0» que parezca dato.
--
-- A QUIÉN NO
--
--   · Plan 'gratis': no hay nada que pagar.
--   · `cancela_al_vencer`: la persona ya dijo que no renueva; pedirle que
--     pague contradice lo que eligió.
--   · Vendedores: el aviso trae precio y plan, que son cosas del dueño.
--   · La prueba ya vencida (`periodo_fin <= now()`): igual que la 071, para
--     que el push y el correo de la prueba salgan a las mismas cuentas. Al
--     período pago no se le pide eso: si vence hoy a las 6 y el aviso corre
--     a las 9, «vence hoy» sigue siendo verdad y es justo cuando más sirve.
--
-- EL RELOJ NO CAMBIA
--
-- No hace falta un trabajo nuevo de pg_cron: esto se lee en la corrida de
-- la mañana (`orden-avisos-manana`, 081 → /api/tareas/avisos-manana), la
-- misma que ya avisa las pruebas. Cada envío pasa por `reservar_envio`
-- (010), así que si Vercel y pg_cron disparan los dos, sale uno.
--
-- PERMISOS
--
-- Son los datos de todas las cuentas, con correos: solo service_role, como
-- `pruebas_por_terminar` y `avisos_del_dia`. Revocada a public, anon y
-- authenticated.
--
-- No hay mensajes nuevos: la función no lanza errores.
--
-- Idempotente: un `create or replace`, un revoke y un grant.
-- ============================================================

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
      )
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
