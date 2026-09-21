-- ============================================================
-- 089 · UN PROFE NO TIENE LINK PÚBLICO DE RESERVAS
-- ============================================================
--
-- Matías: «el link, no sé para qué estaría sirviendo. Si entro a reservar,
-- solo voy a poder reservar un día y una hora. Pero un profesor no trabaja
-- así: tiene un horario definido para cada alumno —todos los martes,
-- miércoles y viernes a tal hora— y se cobra el mes antes de empezar».
--
-- Tiene razón, y es más que una preferencia. El link de la 038 se hizo
-- para una barbería: un desconocido entra, ve los huecos libres y toma uno.
-- Un profe no deja que un desconocido le tome un hueco de la agenda: los
-- horarios los arma él, alumno por alumno. Un link así abierto sería una
-- puerta por la que le entran reservas que después tiene que ir a cancelar.
--
-- POR QUÉ SE CIERRA ACÁ Y NO SOLO EN LA PANTALLA
--
-- Esconder la tarjeta del link alcanza para que nadie lo configure. No
-- alcanza para el caso que sí va a pasar: una barbería que tenía su link
-- publicado y un día se pasa a «Clases y cursos». Su link sigue en la
-- biografía de Instagram, y seguiría tomando reservas.
--
-- Las tres puertas públicas (`agenda_publica`, `huecos_publicos`,
-- `reservar_publico`) ya miran si el link está activo, y a un link apagado
-- le contestan lo mismo que a uno que no existe. Así que no se tocan: se
-- garantiza que el link de un profe nunca esté activo, y las tres se
-- cierran de una. Reescribir tres funciones de seguridad para agregarles
-- una condición sería arriesgar lo que ya estaba probado.
--
-- Pasarse de vuelta a un rubro con link NO lo reactiva solo: el dueño lo
-- vuelve a prender cuando quiera. Un link que reaparece sin que nadie lo
-- pida es tan sorpresivo como uno que desaparece.

-- ------------------------------------------------------------
-- 1. QUÉ RUBROS TRABAJAN CON ALUMNOS DE HORARIO FIJO
--
--    Espejo de `agendaDeAlumnos` en `src/lib/rubros.ts`. Una sola pregunta
--    en un solo lugar de la base, igual que `rubro_cierra_el_dia`.
-- ------------------------------------------------------------
create or replace function public.rubro_de_alumnos(p_rubro text)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p_rubro, '') = 'clases';
$fn$;

grant execute on function public.rubro_de_alumnos(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. EL LINK DE UN PROFE NO SE PUEDE PRENDER
--
--    Se rechaza con un mensaje, no se apaga en silencio: si alguien llega
--    hasta acá, tiene que saber por qué su link no anda.
-- ------------------------------------------------------------
create or replace function public.link_publico_segun_rubro()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.activo and public.rubro_de_alumnos(
       (select e.rubro from public.empresas e where e.id = new.empresa_id)) then
    raise exception 'Una cuenta de clases no tiene link de reservas: los horarios de cada alumno los armás vos.'
      using errcode = '22023';
  end if;
  return new;
end $fn$;

revoke all on function public.link_publico_segun_rubro() from public, anon, authenticated;

drop trigger if exists link_publico_segun_rubro on public.turnos_publico;
create trigger link_publico_segun_rubro
  before insert or update on public.turnos_publico
  for each row execute function public.link_publico_segun_rubro();

-- ------------------------------------------------------------
-- 3. PASARSE A CLASES APAGA EL LINK QUE HUBIERA
--
--    Es la barbería del ejemplo de arriba. Se apaga, no se borra: el slug
--    es la dirección del negocio (038) y si vuelve a su rubro anterior lo
--    tiene que encontrar igual.
-- ------------------------------------------------------------
create or replace function public.apagar_link_de_alumnos()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if public.rubro_de_alumnos(new.rubro) and not public.rubro_de_alumnos(old.rubro) then
    update public.turnos_publico
    set activo = false, updated_at = now()
    where empresa_id = new.id and activo;
  end if;
  return new;
end $fn$;

revoke all on function public.apagar_link_de_alumnos() from public, anon, authenticated;

drop trigger if exists apagar_link_de_alumnos on public.empresas;
create trigger apagar_link_de_alumnos
  after update of rubro on public.empresas
  for each row execute function public.apagar_link_de_alumnos();

-- ------------------------------------------------------------
-- 4. Y SI YA HABÍA ALGUNO, SE APAGA AHORA
--
--    No debería haber ninguno —el rubro existe desde la 087, de hoy—, pero
--    la regla vale desde que se aplica, no desde el próximo cambio.
-- ------------------------------------------------------------
update public.turnos_publico tp
set activo = false, updated_at = now()
from public.empresas e
where e.id = tp.empresa_id and public.rubro_de_alumnos(e.rubro) and tp.activo;
