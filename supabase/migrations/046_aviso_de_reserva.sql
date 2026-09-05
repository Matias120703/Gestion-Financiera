-- ORDEN · Migración 046 · Avisar al local cuando entra una reserva
--
-- El sentido del link público es que el cliente reserve solo, sin llamar. Pero
-- si al local no le avisa nadie, tiene que entrar a la agenda cada rato a ver
-- si apareció alguien — que es justo el trabajo que el link venía a sacarle.
-- Y con las reservas para el mismo día era peor: la tarea de la tarde solo
-- mira las de MAÑANA, así que quien reservaba a las diez para las cuatro no
-- aparecía en ningún aviso nunca.
--
-- QUIÉN LLAMA A ESTO Y POR QUÉ ES SEGURO
--
-- La ruta `/api/aviso-reserva`, con la clave de servicio, cuando el navegador
-- del cliente le avisa que acaba de reservar. O sea que el disparador viene de
-- afuera, sin sesión, y eso obliga a pensar el abuso:
--
--   · Hace falta el TOKEN de la reserva, que es un uuid que solo conoce quien
--     acaba de reservar. Adivinarlo no es una opción.
--   · Y encima tiene que ser RECIENTE. Un token viejo —el que el cliente
--     guardó para cancelar, por ejemplo— no dispara nada.
--   · La ruta además marca el envío en `envios`, así que un mismo turno no
--     puede avisar dos veces por más que se repita el pedido.
--
-- Las tres juntas hacen que esto no sirva para mandarle notificaciones a un
-- local ajeno ni para repetirle la misma cien veces.
--
-- NO DEVUELVE EL TELÉFONO DEL CLIENTE
--
-- El aviso dice quién reservó, qué y cuándo. El teléfono está a un toque en la
-- agenda, y no hace falta que viaje hasta una notificación para que lo lea
-- cualquiera que mire la pantalla de bloqueo del celular.

create or replace function public.aviso_de_reserva(
  p_token   uuid,
  p_minutos integer default 5
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res  jsonb;
  v_zona text;
begin
  select coalesce(e.zona_horaria, 'America/Asuncion') into v_zona
  from public.turnos_reserva r
  join public.empresas e on e.id = r.empresa_id
  where r.token = p_token;

  if v_zona is null then
    return null;
  end if;

  select jsonb_build_object(
    'reserva',     r.id,
    'empresa_id',  r.empresa_id,
    'negocio',     e.nombre,
    'cliente',     r.cliente_nombre,
    'servicio',    pr.nombre,
    'profesional', p.nombre,
    -- Ya formateado en la zona del local: la hora que le importa al barbero
    -- es la de su local, no la del servidor ni la del que reservó.
    'hora',        to_char(r.inicia at time zone v_zona, 'HH24:MI'),
    'fecha',       (r.inicia at time zone v_zona)::date,
    'es_hoy',      (r.inicia at time zone v_zona)::date = public.hoy_empresa(r.empresa_id),
    'es_manana',   (r.inicia at time zone v_zona)::date = public.hoy_empresa(r.empresa_id) + 1
  )
  into v_res
  from public.turnos_reserva r
  join public.empresas e on e.id = r.empresa_id
  join public.productos pr on pr.id = r.producto_id
  join public.turnos_profesional p on p.id = r.profesional_id
  where r.token = p_token
    -- Recién hecha. Sin esto, el enlace que el cliente guarda para cancelar
    -- serviría para hacer sonar el teléfono del barbero cuando se le antoje.
    and r.created_at > now() - make_interval(mins => greatest(coalesce(p_minutos, 5), 1))
    -- Una que ya se canceló no se anuncia como nueva.
    and r.estado in ('pendiente', 'confirmada');

  return v_res;
end $fn$;

-- Solo la ruta, que corre con la clave de servicio. Ni un usuario con sesión
-- necesita esto: para eso está la agenda.
revoke all on function public.aviso_de_reserva(uuid, integer) from public, anon, authenticated;
grant execute on function public.aviso_de_reserva(uuid, integer) to service_role;
