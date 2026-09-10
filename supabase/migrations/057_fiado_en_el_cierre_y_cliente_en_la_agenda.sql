-- ============================================================
-- ORDEN · Migración 057 · El fiado en el cierre, y el cliente en la agenda
--
-- 1. EL CIERRE DEL DÍA NO SABÍA DEL FIADO
--
-- «Entró» es ventas más otros ingresos. Una venta fiada está en ventas, así
-- que el cierre la mostraba como plata que entró ese día, cuando al cajón no
-- entró nada. Y lo que te pagan de fiados viejos (desde la 056, un cobro ya
-- no es un ingreso) no aparecía en ningún lado: un día en que solo cobraste
-- fiados salía «sin actividad».
--
-- No se cambia lo que significa «Entró»: rompería las comparaciones con la
-- semana pasada, que se calculan igual. Se agregan dos números, y la pantalla
-- los muestra solo cuando no son cero:
--
--   fiado_vendido → de lo vendido hoy, cuánto se fio: se vendió, no entró.
--   fiado_cobrado → cuánto se cobró hoy de fiados: entró, sin venta de hoy.
--
-- 2. RESERVAR, CON EL CLIENTE ELEGIDO
--
-- Al agendar desde el local ahora se elige al cliente de la lista. La 053 ya
-- ata cada reserva a su cliente por el teléfono; lo que faltaba es el cliente
-- elegido que no tiene teléfono, que quedaba suelto y se perdía su historial.
-- El trigger de la 053 respeta un cliente que ya viene puesto, así que alcanza
-- con que `reservar` lo reciba.
--
-- La firma cambia, así que la vieja se borra: con las dos, PostgREST no
-- sabría cuál llamar. Es lo mismo que hicieron la 019, la 048 y la 055.
--
-- LOS CUERPOS NO SE TOCARON A MANO
--
-- Se extrajeron de la 008 y la 037 con un script y se les agregaron solo las
-- partes marcadas.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EL CIERRE DEL DÍA
--
--    Misma firma que en la 008, así que se reemplaza sin tocar a quien ya la
--    llama.
-- ------------------------------------------------------------
create or replace function public.cierre_del_dia(p_empresa uuid, p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_fecha    date;
  v_previo   date;
  v_hoy_r    jsonb;
  v_prev_r   jsonb;
  v_sem_r    jsonb;
  v_top      jsonb;
  v_res      jsonb;
  v_admin    boolean;
  v_fiado_vendido numeric;
  v_fiado_cobrado numeric;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_fecha  := coalesce(p_fecha, public.hoy_empresa(p_empresa));
  v_previo := v_fecha - 7;
  v_admin  := public.es_admin(p_empresa);

  v_hoy_r  := public.resumen_financiero(p_empresa, v_fecha, v_fecha);
  v_prev_r := public.resumen_financiero(p_empresa, v_previo, v_previo);
  -- Los siete días ANTERIORES, sin incluir el que se está cerrando: si lo
  -- incluyéramos, el día se estaría comparando en parte contra sí mismo.
  v_sem_r  := public.resumen_financiero(p_empresa, v_fecha - 7, v_fecha - 1);

  -- Lo que la venta del día no dice. Una venta fiada está en «ventas» —se
  -- vendió— pero no entró al cajón; y lo que se cobra de fiados viejos
  -- entró al cajón pero no está en ninguna venta de hoy (056).
  select coalesce(sum(m.monto), 0) into v_fiado_vendido
  from public.movimientos m
  where m.empresa_id = p_empresa and m.fecha = v_fecha
    and m.tipo = 'venta' and m.estado = 'activo' and m.metodo_pago = 'credito';

  select coalesce(sum(f.monto), 0) into v_fiado_cobrado
  from public.fiado f
  where f.empresa_id = p_empresa and f.fecha = v_fecha and f.tipo = 'cobro';

  select jsonb_build_object('nombre', r->>'nombre', 'unidades', r->'unidades', 'ingresos', r->'ingresos')
  into v_top
  from jsonb_array_elements(
    coalesce(public.ranking_productos(p_empresa, v_fecha, v_fecha, 1), '[]'::jsonb)
  ) as r
  limit 1;

  select jsonb_build_object(
    'fecha',              v_fecha,
    'es_hoy',             v_fecha = public.hoy_empresa(p_empresa),
    'hubo_actividad',     coalesce((v_hoy_r->>'cantidad_ventas')::numeric, 0) > 0
                          or coalesce((v_hoy_r->>'gastos')::numeric, 0) > 0
                          or coalesce((v_hoy_r->>'otros_ingresos')::numeric, 0) > 0
                          -- Un día en que solo se cobraron fiados también tuvo
                          -- plata que entró: no es un día «sin actividad».
                          or v_fiado_cobrado > 0,
    'resumen',            v_hoy_r,
    'misma_dia_semana_pasada', v_prev_r,
    -- Promedio diario de la semana previa, para decir "hoy vendiste más que
    -- un día normal tuyo" sin que un lunes flojo arruine la comparación.
    'promedio_semana',    jsonb_build_object(
                            'ventas',  round(coalesce((v_sem_r->>'ventas')::numeric, 0) / 7, 2),
                            'gastos',  round(coalesce((v_sem_r->>'gastos')::numeric, 0) / 7, 2),
                            'ganancia_neta', case when v_admin
                              then round(coalesce((v_sem_r->>'ganancia_neta')::numeric, 0) / 7, 2)
                              else null end
                          ),
    'producto_estrella',  v_top,
    'fiado_vendido',      v_fiado_vendido,
    'fiado_cobrado',      v_fiado_cobrado,
    'racha',              public.racha_empresa(p_empresa),
    'ya_cerrado',         exists (
                            select 1 from public.cierres c
                            where c.empresa_id = p_empresa
                              and c.user_id = auth.uid()
                              and c.fecha = v_fecha
                          )
  ) into v_res;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 2. RESERVAR
-- ------------------------------------------------------------
create or replace function public.reservar(
  p_empresa     uuid,
  p_profesional uuid,
  p_producto    uuid,
  p_inicia      timestamptz,
  p_nombre      text,
  p_telefono    text default '',
  p_origen      text default 'local',
  -- El cliente elegido de la lista (057). Si viene, la reserva queda atada a
  -- él aunque no tenga teléfono; si no, el trigger de la 053 lo busca por el
  -- teléfono, como siempre.
  p_cliente     uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_zona   text;
  v_fecha  date;
  v_libre  boolean;
  v_fin    timestamptz;
  v_id     uuid;
  v_token  uuid;
  v_cliente uuid;
begin
  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Falta el nombre de quien reserva.' using errcode = '22023';
  end if;

  if p_inicia is null then
    raise exception 'Falta el horario.' using errcode = '22023';
  end if;

  -- Esta puerta es la del LOCAL: la usa quien trabaja ahí para anotar a
  -- alguien que llamó por teléfono. La puerta pública —la del link que el
  -- dueño comparte— es otra función, con sus propios límites, y por eso acá
  -- se exige pertenecer. Sin esta línea, cualquiera con una cuenta de Orden
  -- podía llenarle la agenda a un negocio ajeno.
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  -- El candado. Todo lo que sigue está serializado por profesional.
  perform 1 from public.turnos_profesional
  where id = p_profesional and empresa_id = p_empresa and activo
  for update;

  if not found then
    raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
  end if;

  select coalesce(e.zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas e where e.id = p_empresa;

  v_fecha := (p_inicia at time zone v_zona)::date;

  -- Que el hueco EXISTA, no solo que esté libre. Sin esto se podría reservar
  -- a las tres de la mañana mandando el horario a mano.
  select exists (
    select 1 from public.huecos_del_dia(p_profesional, v_fecha, p_producto) h
    where h.inicia = p_inicia
  ) into v_libre;

  if not v_libre then
    raise exception 'Ese horario ya no está disponible.' using errcode = '23505';
  end if;

  select h.termina into v_fin
  from public.huecos_del_dia(p_profesional, v_fecha, p_producto) h
  where h.inicia = p_inicia;

  -- Un cliente de otro negocio no se puede colgar de un turno de este. La
  -- clave compuesta de la 053 ya lo impediría, pero con un error que nadie
  -- entiende; esto lo dice en castellano.
  v_cliente := p_cliente;
  if v_cliente is not null
     and not exists (select 1 from public.clientes
                     where id = v_cliente and empresa_id = p_empresa) then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  insert into public.turnos_reserva (
    empresa_id, profesional_id, producto_id, inicia, termina,
    cliente_nombre, cliente_telefono, origen, creada_por, cliente_id
  )
  values (
    p_empresa, p_profesional, p_producto, p_inicia, v_fin,
    left(trim(p_nombre), 80), left(coalesce(trim(p_telefono), ''), 40),
    case when p_origen = 'publico' then 'publico' else 'local' end,
    auth.uid(), v_cliente
  )
  returning id, token into v_id, v_token;

  return jsonb_build_object('reserva', v_id, 'token', v_token, 'inicia', p_inicia, 'termina', v_fin);
end $fn$;

drop function if exists public.reservar(uuid, uuid, uuid, timestamptz, text, text, text);

revoke all on function public.reservar(uuid, uuid, uuid, timestamptz, text, text, text, uuid)
  from public, anon;
grant execute on function public.reservar(uuid, uuid, uuid, timestamptz, text, text, text, uuid)
  to authenticated;
