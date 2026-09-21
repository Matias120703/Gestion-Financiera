-- ============================================================
-- 088 · EL PAQUETE DE CLASES
-- ============================================================
--
-- «Ocho clases por Gs. 400.000, pagadas el día 1.» Es la forma en que cobra
-- casi todo el que enseña, y hasta ahora Orden no tenía dónde anotarla: se
-- cargaba una venta de 400.000 y el profe llevaba en la cabeza —o en un
-- cuaderno— cuántas le quedaban a cada alumno.
--
-- LO QUE DECIDIÓ MATÍAS, Y QUÉ SIGNIFICA ACÁ
--
-- «Se gana al cobrar.» Los 400.000 cuentan como ingreso el día que entran,
-- no clase por clase. Por eso esta migración NO inventa ninguna lógica de
-- plata: el paquete se cobra con `registrar_venta`, igual que cualquier
-- venta. Cae en la billetera por su forma de pago, suma en la ganancia, y
-- si se fía queda en el fiado. Todo eso ya estaba probado; acá no se toca.
--
-- Lo que el paquete agrega es solo el CONTADOR: cuántas clases se
-- compraron, cuántas se dieron, cuántas quedan.
--
-- LA CONSECUENCIA, DICHA UNA VEZ
--
-- Si un alumno abandona en la tercera clase y se le devuelve plata, esa
-- devolución cae en el mes en que se devuelve, no en el que pagó. Es la
-- regla que eligió Matías con esa consecuencia a la vista.
--
-- LO USADO SE CALCULA, NO SE GUARDA
--
-- Cada clase dada es una fila, con su fecha. Lo usado es la suma de esas
-- filas, igual que el saldo de una cuenta es la suma de sus movimientos. Un
-- contador guardado aparte termina, tarde o temprano, diciendo otra cosa
-- que su historia —y el alumno que pregunta «¿cuándo usé mis clases?»
-- merece una respuesta con fechas, no un número.

-- ------------------------------------------------------------
-- 1. EL PAQUETE
-- ------------------------------------------------------------
create table if not exists public.paquetes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  -- El alumno. `restrict`: un alumno con paquetes no se borra por
  -- accidente llevándose la historia de lo que pagó.
  cliente_id    uuid not null references public.clientes (id) on delete restrict,
  nombre        text not null check (char_length(trim(nombre)) between 1 and 80),
  -- `numeric` y no entero: el mismo paquete sirve para «8 clases», para
  -- «10 horas» y para una clase de hora y media que cuenta 1,5.
  clases        numeric(8, 2) not null check (clases > 0 and clases <= 1000),
  precio        numeric not null check (precio >= 0),
  -- La venta que lo pagó. En null si el paquete fue gratis (una clase de
  -- prueba): no hay venta de cero que anotar.
  movimiento_id uuid references public.movimientos (id) on delete set null,
  -- En null no vence. Matías: «vos decidís en cada paquete».
  vence_el      date,
  -- Cerrado a mano: el alumno abandonó. Las clases que quedaban no se
  -- pueden usar, pero la historia sigue ahí.
  cerrado       boolean not null default false,
  creado_por    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists paquetes_alumno_idx on public.paquetes (cliente_id, created_at desc);
create index if not exists paquetes_empresa_idx on public.paquetes (empresa_id);

alter table public.paquetes enable row level security;
revoke all on public.paquetes from anon, authenticated;

-- ------------------------------------------------------------
-- 2. CADA CLASE QUE SE DESCONTÓ
--
--    `motivo` distingue la clase que se dio de la falta que se descontó:
--    Matías quiere decidir en cada falta si se cobra. Las dos restan igual,
--    pero en la historia no son lo mismo.
--
--    `reserva_id` queda listo para cuando se enganche la agenda: el turno
--    marcado como atendido va a descontar solo. El índice único garantiza
--    que un mismo turno nunca descuente dos veces, aunque alguien toque el
--    botón dos veces o la pantalla reintente.
-- ------------------------------------------------------------
create table if not exists public.clases_dadas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  paquete_id  uuid not null references public.paquetes (id) on delete cascade,
  fecha       date not null,
  cantidad    numeric(8, 2) not null check (cantidad > 0),
  motivo      text not null default 'dada' check (motivo in ('dada', 'falta')),
  reserva_id  uuid references public.turnos_reserva (id) on delete set null,
  creado_por  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists clases_dadas_paquete_idx on public.clases_dadas (paquete_id, fecha desc);
create unique index if not exists clases_dadas_reserva_idx
  on public.clases_dadas (reserva_id) where reserva_id is not null;

alter table public.clases_dadas enable row level security;
revoke all on public.clases_dadas from anon, authenticated;

-- ------------------------------------------------------------
-- 3. LO QUE SE LEE DE UN PAQUETE
--
--    Un solo lugar que dice cuánto se usó y en qué estado está, para que la
--    pantalla y las funciones de abajo no puedan contestar distinto.
-- ------------------------------------------------------------
create or replace function public.estado_paquete(p_paquete uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'usadas', coalesce(u.usadas, 0),
    'quedan', greatest(0, p.clases - coalesce(u.usadas, 0)),
    'estado', case
      when p.cerrado then 'cerrado'
      when coalesce(u.usadas, 0) >= p.clases then 'terminado'
      when p.vence_el is not null and p.vence_el < public.hoy_empresa(p.empresa_id) then 'vencido'
      else 'activo' end
  )
  from public.paquetes p
  left join lateral (
    select sum(c.cantidad) as usadas from public.clases_dadas c where c.paquete_id = p.id
  ) u on true
  where p.id = p_paquete;
$fn$;

revoke all on function public.estado_paquete(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. VENDER UN PAQUETE
--
--    Todo o nada: la venta y el paquete se crean juntos. Un paquete sin su
--    venta es un alumno con clases que nadie cobró; una venta sin paquete es
--    plata que entró sin que se sepa por qué.
-- ------------------------------------------------------------
create or replace function public.vender_paquete(
  p_empresa uuid,
  p_cliente uuid,
  p_nombre  text,
  p_clases  numeric,
  p_precio  numeric,
  p_metodo  text default 'efectivo',
  p_fecha   date default null,
  p_vence   date default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_alumno text;
  v_mov    uuid;
  v_id     uuid;
  v_fecha  date;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre al paquete: «8 clases de inglés».' using errcode = '22023';
  end if;

  if coalesce(p_clases, 0) <= 0 then
    raise exception 'El paquete tiene que tener al menos una clase.' using errcode = '22023';
  end if;

  if coalesce(p_precio, -1) < 0 then
    raise exception 'El precio no puede ser negativo.' using errcode = '22023';
  end if;

  select nombre into v_alumno from public.clientes
  where id = p_cliente and empresa_id = p_empresa;
  if v_alumno is null then
    raise exception 'Ese alumno no es de esta cuenta.' using errcode = 'P0002';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  if p_vence is not null and p_vence < v_fecha then
    raise exception 'El paquete no puede vencer antes de venderse.' using errcode = '22023';
  end if;

  -- La plata, por el camino de siempre. Sin costo: una clase no tiene
  -- mercadería, así que todo lo cobrado es ganancia bruta.
  if p_precio > 0 then
    v_mov := public.registrar_venta(
      p_empresa     => p_empresa,
      p_items       => jsonb_build_array(jsonb_build_object(
                         'nombre', left(trim(p_nombre), 80),
                         'cantidad', 1,
                         'precio_unitario', p_precio,
                         'costo_unitario', 0)),
      p_fecha       => v_fecha,
      p_descripcion => left(trim(p_nombre), 80),
      p_metodo_pago => coalesce(p_metodo, 'efectivo'),
      p_contraparte => v_alumno,
      p_cliente     => p_cliente
    );
  end if;

  insert into public.paquetes (empresa_id, cliente_id, nombre, clases, precio, movimiento_id, vence_el, creado_por)
  values (p_empresa, p_cliente, trim(p_nombre), p_clases, p_precio, v_mov, p_vence, auth.uid())
  returning id into v_id;

  return jsonb_build_object('paquete', v_id, 'movimiento', v_mov);
end $fn$;

revoke all on function public.vender_paquete(uuid, uuid, text, numeric, numeric, text, date, date) from public, anon;
grant execute on function public.vender_paquete(uuid, uuid, text, numeric, numeric, text, date, date) to authenticated;

-- ------------------------------------------------------------
-- 5. DESCONTAR UNA CLASE
--
--    `for update` sobre el paquete: dos toques casi juntos —el profe y la
--    agenda, o un reintento de la red— no pueden descontar las dos la
--    última clase que quedaba.
-- ------------------------------------------------------------
create or replace function public.dar_clase(
  p_paquete  uuid,
  p_cantidad numeric default 1,
  p_fecha    date default null,
  p_motivo   text default 'dada',
  p_reserva  uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_p      record;
  v_estado jsonb;
  v_fecha  date;
begin
  select * into v_p from public.paquetes where id = p_paquete for update;
  if v_p.id is null then
    raise exception 'Ese paquete no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v_p.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Hay que descontar al menos una clase.' using errcode = '22023';
  end if;

  if coalesce(p_motivo, '') not in ('dada', 'falta') then
    raise exception 'Eso no es una clase ni una falta.' using errcode = '22023';
  end if;

  v_estado := public.estado_paquete(p_paquete);
  v_fecha  := coalesce(p_fecha, public.hoy_empresa(v_p.empresa_id));

  if v_estado->>'estado' = 'cerrado' then
    raise exception 'Ese paquete está cerrado.' using errcode = '22023';
  end if;

  -- Vencido se mira contra la fecha de la clase y no contra hoy: una clase
  -- que se dio el día 30 se puede anotar el 2, aunque el paquete venciera
  -- el 31. Lo que importa es cuándo fue, no cuándo se acordó alguien.
  if v_p.vence_el is not null and v_fecha > v_p.vence_el then
    raise exception 'Ese paquete venció el %.', to_char(v_p.vence_el, 'DD/MM') using errcode = '22023';
  end if;

  if (v_estado->>'quedan')::numeric < p_cantidad then
    raise exception 'Le quedan % clases y querés descontar %.',
      trim(to_char((v_estado->>'quedan')::numeric, 'FM999990.##')),
      trim(to_char(p_cantidad, 'FM999990.##'))
      using errcode = '22023';
  end if;

  insert into public.clases_dadas (empresa_id, paquete_id, fecha, cantidad, motivo, reserva_id, creado_por)
  values (v_p.empresa_id, p_paquete, v_fecha, p_cantidad, p_motivo, p_reserva, auth.uid());

  return public.estado_paquete(p_paquete);
end $fn$;

revoke all on function public.dar_clase(uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.dar_clase(uuid, numeric, date, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. DESHACER UNA CLASE ANOTADA POR ERROR
--
--    Se borra la fila, sin más. No es plata —la plata está en la venta, que
--    no se toca—: es una marca en un contador, y el error más común del
--    mundo es tocar el botón dos veces.
-- ------------------------------------------------------------
create or replace function public.deshacer_clase(p_clase uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_empresa uuid;
  v_paquete uuid;
begin
  select empresa_id, paquete_id into v_empresa, v_paquete
  from public.clases_dadas where id = p_clase;
  if v_empresa is null then
    raise exception 'Esa clase no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  delete from public.clases_dadas where id = p_clase;

  return public.estado_paquete(v_paquete);
end $fn$;

revoke all on function public.deshacer_clase(uuid) from public, anon;
grant execute on function public.deshacer_clase(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. CERRAR EL PAQUETE DE QUIEN ABANDONÓ
--
--    Y reabrirlo, porque el que dijo «no vuelvo más» a veces vuelve. Cerrar
--    es cosa de quien administra: es decidir que unas clases pagadas ya no
--    se van a dar.
-- ------------------------------------------------------------
create or replace function public.cerrar_paquete(p_paquete uuid, p_cerrado boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.paquetes where id = p_paquete;
  if v_empresa is null then
    raise exception 'Ese paquete no existe.' using errcode = 'P0002';
  end if;

  if not public.es_admin(v_empresa) then
    raise exception 'Solo el dueño de la cuenta puede cerrar un paquete.' using errcode = '42501';
  end if;

  update public.paquetes set cerrado = coalesce(p_cerrado, true) where id = p_paquete;

  return public.estado_paquete(p_paquete);
end $fn$;

revoke all on function public.cerrar_paquete(uuid, boolean) from public, anon;
grant execute on function public.cerrar_paquete(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 8. LOS PAQUETES DE UN ALUMNO, CON SU HISTORIA
--
--    Primero los que se pueden usar, después los viejos. Cada uno con las
--    clases que se descontaron y cuándo: es la respuesta a «¿cuándo usé mis
--    clases?».
-- ------------------------------------------------------------
create or replace function public.paquetes_del_alumno(p_empresa uuid, p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x.fila order by x.orden, x.creado desc), '[]'::jsonb)
  into v_lista
  from (
    select
      p.created_at as creado,
      case when (public.estado_paquete(p.id)->>'estado') = 'activo' then 0 else 1 end as orden,
      jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre,
        'clases', p.clases,
        'precio', p.precio,
        'vence_el', p.vence_el,
        'creado', p.created_at
      ) || public.estado_paquete(p.id)
        || jsonb_build_object('historia', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', c.id, 'fecha', c.fecha, 'cantidad', c.cantidad, 'motivo', c.motivo)
                    order by c.fecha desc, c.created_at desc)
             from public.clases_dadas c where c.paquete_id = p.id
           ), '[]'::jsonb)) as fila
    from public.paquetes p
    where p.empresa_id = p_empresa and p.cliente_id = p_cliente
  ) x;

  return v_lista;
end $fn$;

revoke all on function public.paquetes_del_alumno(uuid, uuid) from public, anon;
grant execute on function public.paquetes_del_alumno(uuid, uuid) to authenticated;
