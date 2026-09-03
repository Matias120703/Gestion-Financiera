-- ORDEN · Migración 040 · La agenda desde el mostrador
--
-- La 037 dejó el motor entero: calcular huecos y tomar uno. La 038 le puso
-- la puerta pública. Faltaba la puerta de adentro, que es por donde entran
-- casi todos los turnos de verdad: el cliente que llama, el que escribe por
-- WhatsApp, el que pasa por la puerta y pide para el jueves.
--
-- `reservar()` ya estaba escrita para eso desde la 037 —exige pertenecer a la
-- empresa y todo— pero para poder ofrecer horarios había que leer
-- `huecos_del_dia`, y esa función es el MOTOR, no una puerta: no pregunta de
-- quién es la agenda que le están pidiendo. Estaba abierta a cualquier
-- cuenta de Orden. No filtraba datos de clientes —solo horas libres— pero
-- una barbería no tiene por qué contarle su agenda a un desconocido.
--
-- Entonces esta migración hace dos cosas chicas y una sola idea: el motor se
-- cierra, y se abre una puerta que sí pregunta quién sos.

-- ============================================================
-- 1. EL MOTOR SE CIERRA
--
--    Nadie lo llama de afuera: lo usan `huecos_publicos` y `reservar`, las
--    dos `security definer`, que corren con los permisos del dueño de la
--    función y no con los de quien la invoca. Sacarle el permiso directo no
--    les cambia nada a ellas y le saca a un extraño la única forma que tenía
--    de mirar la agenda ajena.
-- ============================================================
revoke execute on function public.huecos_del_dia(uuid, date, uuid) from authenticated;

-- ============================================================
-- 2. LA PUERTA DE ADENTRO
--
--    Misma respuesta que el link público, con dos diferencias: pregunta si
--    pertenecés a la empresa en vez de mirar un slug, y devuelve también la
--    hora de fin, porque en el mostrador se lee «10:00 a 10:30» y no una
--    hora suelta.
--
--    La ve cualquiera del equipo, no solo administración. El que atiende el
--    teléfono un sábado a la mañana suele ser justamente el empleado.
-- ============================================================
create or replace function public.huecos_local(
  p_empresa     uuid,
  p_profesional uuid,
  p_producto    uuid,
  p_fecha       date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  -- El profesional tiene que ser de ESTA empresa. Sin esto, pertenecer a
  -- cualquier negocio alcanzaría para leer la agenda de cualquier otro: la
  -- comprobación de arriba mira la empresa que te pasan, no la del turno.
  if not exists (
    select 1 from public.turnos_profesional
    where id = p_profesional and empresa_id = p_empresa and activo
  ) then
    return '[]'::jsonb;
  end if;

  -- Un año para adelante es más de lo que cualquiera agenda, y evita que un
  -- error de tipeo en la fecha ponga a la base a generar series eternas.
  if p_fecha is null or p_fecha > public.hoy_empresa(p_empresa) + 365 then
    return '[]'::jsonb;
  end if;

  -- Los días pasados no hace falta cortarlos acá: `huecos_del_dia` ya
  -- descarta todo instante anterior a ahora, así que un día de la semana
  -- pasada devuelve vacío solo.
  select coalesce(jsonb_agg(
    jsonb_build_object('inicia', h.inicia, 'termina', h.termina) order by h.inicia
  ), '[]'::jsonb)
  into v_res
  from public.huecos_del_dia(p_profesional, p_fecha, p_producto) h;

  return v_res;
end $fn$;

revoke all on function public.huecos_local(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.huecos_local(uuid, uuid, uuid, date) to authenticated;
