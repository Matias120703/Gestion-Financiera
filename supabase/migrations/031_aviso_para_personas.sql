-- ORDEN · Migración 031 · El recordatorio también es para una persona
--
-- La 024 sacó a las cuentas personales del recordatorio de la noche, y el
-- motivo era bueno: una persona con sueldo no cierra el día. Su ciclo va de
-- cobro a cobro, y decirle «cerrá el día» era hablarle en el idioma de un
-- almacén.
--
-- Pero la conclusión se pasó de largo. Que no cierre el día no quiere decir
-- que no necesite que le recuerden cargar. Es al revés: el gasto de una
-- persona es el que más fácil se olvida —son montos chicos, muchos por día, y
-- ninguno tiene factura que lo recuerde— y si no los carga, en dos semanas la
-- app le miente sobre cuánto le queda. Una cuenta sin datos no es una cuenta
-- prolija: es una cuenta que no sirve.
--
-- Así que vuelve al recordatorio, pero con las mismas dos condiciones que
-- protegen a todos los demás:
--
--   · SOLO A QUIEN YA TIENE EL HÁBITO. Hacen falta dos días seguidos de
--     carga. A quien todavía no lo tiene, un aviso no se lo crea: lo único
--     que logra es enseñarle a ignorar nuestras notificaciones.
--
--   · UNO POR DÍA COMO MÁXIMO. Lo garantiza la tabla `envios`, que no se
--     toca acá.
--
-- Lo que cambia en la respuesta es que ahora dice QUÉ TIPO DE CUENTA es cada
-- una, porque el aviso de una persona no puede llevarla a la pantalla de
-- cierre del día: esa pantalla no existe en su cuenta.
--
-- OJO CON `rubro_cierra_el_dia`: NO SE TOCA
--
-- Esa función contesta otra pregunta —¿esta cuenta ve la pantalla de cierre?—
-- y la respuesta para una persona sigue siendo que no. Meter acá el cambio
-- habría sido más corto y habría hecho aparecer «Cierre del día» en el menú
-- de todas las cuentas personales. Dos preguntas distintas, dos funciones.

create or replace function public.empresas_sin_cargar_hoy(p_racha_minima integer default 2)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id',  e.id,
      'nombre',      e.nombre,
      'zona',        e.zona_horaria,
      'racha',       r.largo,
      -- Para que quien manda el aviso sepa a qué pantalla mandarlo y en qué
      -- idioma hablarle. Sin esto habría que volver a consultar la empresa
      -- una por una desde el servidor.
      'tipo_cuenta', coalesce(e.tipo_cuenta, 'emprendedor')
    ) as x
    from public.empresas e
    join lateral (
      with dias as (
        select distinct m.fecha from public.movimientos m
        where m.empresa_id = e.id and m.estado = 'activo'
          and m.fecha <= (now() at time zone e.zona_horaria)::date
      ),
      numeradas as (
        select fecha, (fecha - (row_number() over (order by fecha))::int) as isla from dias
      ),
      rachas as (
        select count(*)::int as largo, max(fecha) as hasta from numeradas group by isla
      )
      select largo, hasta from rachas order by hasta desc limit 1
    ) r on true
    where (
        -- Una persona: siempre, porque su ciclo no depende del rubro.
        coalesce(e.tipo_cuenta, 'emprendedor') = 'personal'
        -- Un negocio: solo los de ciclo diario. A un ganadero no se le
        -- recuerda cargar todos los días porque su ciclo es el novillo.
        or public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta)
      )
      and r.hasta = (now() at time zone e.zona_horaria)::date - 1
      and r.largo >= greatest(p_racha_minima, 1)
  ) s;

  return v_res;
end $fn$;

revoke all on function public.empresas_sin_cargar_hoy(integer) from public, anon, authenticated;
grant execute on function public.empresas_sin_cargar_hoy(integer) to service_role;
