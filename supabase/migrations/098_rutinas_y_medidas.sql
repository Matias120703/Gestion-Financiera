-- ============================================================
-- 098 · RUTINAS, MEDIDAS Y PROGRESO DEL PERSONAL TRAINER
-- ============================================================
--
-- La 097 le dio al trainer el motor del profe con una rutina que era una
-- nota suelta («Qué están trabajando»). Matías lo dio vuelta: «ponete en el
-- lugar de un personal trainer: ¿qué necesitaría para trabajar?», y la
-- respuesta es lo que hace todo el día y Orden no tenía: rutinas de verdad
-- (ejercicio, series, repeticiones, carga, descanso, nota), mandárselas al
-- cliente, y anotar cómo va.
--
-- LO QUE DECIDIÓ MATÍAS, Y QUÉ SIGNIFICA ACÁ
--
--   · «Anotar los pesos» es, en esta vuelta, el peso, la altura y las
--     medidas del cuerpo con fecha, MÁS la carga de cada ejercicio con su
--     historia: «Sentadilla: de 40 a 50 kg desde el 15/08». Lo que se
--     levantó serie por serie en cada sesión queda para la fase 2.
--   · Si la cuenta del trainer vence, el link de rutina de sus clientes
--     sigue andando 30 días; después dice «Tu entrenador tiene que renovar
--     su cuenta». Un cliente en el gimnasio no tiene la culpa de un pago
--     atrasado, pero la prueba gratis tampoco puede servir para alojar
--     rutinas para siempre.
--   · Uno a uno, faltas como el profe, se gana al cobrar: eso ya estaba.
--
-- CÓMO ESTÁ ARMADO
--
-- Una biblioteca de ejercicios por negocio, que se arma sola: el trainer
-- escribe «Sentadilla» en una rutina y la próxima vez ya está. Todo apunta
-- a esa biblioteca, así que el «cómo se hace» y el video salen de un solo
-- lugar, y el historial de cargas se sigue por ejercicio y no por renglón.
--
-- Una rutina es una plantilla (sin cliente) o la de un cliente, que está en
-- preparación (borrador), vigente, o ya pasó (anterior). El cliente tiene UN
-- link, no uno por rutina: guarda un solo mensaje de WhatsApp y siempre ve
-- la vigente.
--
-- Las medidas del cuerpo son datos de salud: las anota y las ve solo el
-- dueño o un administrador, con el consentimiento del cliente, y nunca
-- viajan por el link.
--
-- LAS REGLAS DE SIEMPRE
--
-- Todas las tablas cuelgan de la empresa con borrado en cascada (así
-- `borrar_cuenta` se lleva todo) y apuntan a clientes y ejercicios con
-- claves compuestas (x_id, empresa_id), el candado de la 052: una fila de un
-- negocio no puede referirse a la de otro ni con un UPDATE a mano. Ninguna
-- se lee ni se escribe directo: todo pasa por funciones.
--
-- Las claves a clientes y ejercicios son NO ACTION y no RESTRICT: NO ACTION
-- se controla al final de la sentencia, así que el borrado en cascada de una
-- empresa no depende del orden en que PostgreSQL recorre las tablas, y un
-- borrado directo de un cliente con historia sigue frenado. Para eso
-- `eliminar_cliente` ahora archiva a quien tiene rutinas o medidas.
--
-- Los tokens son `gen_random_uuid()` y no `gen_random_bytes()`: las pruebas
-- corren en PGlite, que no tiene pgcrypto (igual que turnos_reserva.token).

-- ------------------------------------------------------------
-- 0. LA CLAVE DE UN NOMBRE DE EJERCICIO
--
--    «Sentadilla búlgara», «SENTADILLA BULGARA» y «sentadilla  búlgara»
--    son el mismo ejercicio. Sin esto la biblioteca se llena de repetidos
--    que no se ven como repetidos, y el historial de cargas queda partido.
--    `translate` y no `unaccent`: PGlite no tiene esa extensión.
-- ------------------------------------------------------------
create or replace function public.clave_ejercicio(p text)
returns text language sql immutable set search_path = public as $fn$
  select translate(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')),
                   'áàâãäéèêëíìîïóòôõöúùûüñç', 'aaaaaeeeeiiiiooooouuuunc');
$fn$;

revoke all on function public.clave_ejercicio(text) from public, anon, authenticated;

-- Un id que llega en un JSON puede venir roto: se toma solo si es un uuid.
-- Un id que no es un uuid es, para quien guarda, un renglón nuevo.
create or replace function public.uuid_o_null(p text)
returns uuid language sql immutable set search_path = public as $fn$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then p::uuid end;
$fn$;

revoke all on function public.uuid_o_null(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 1. LA BIBLIOTECA DE EJERCICIOS
--
--    Empieza vacía. La lista base de unos cien ejercicios vive en el código
--    (src/lib/ejercicios-base.ts) y solo se sugiere: un ejercicio entra acá
--    la primera vez que se usa. No se borra el que está en una rutina: se
--    apaga, deja de sugerirse y las rutinas que lo tienen lo siguen viendo.
-- ------------------------------------------------------------
create table if not exists public.ejercicios (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  nombre       text not null check (char_length(trim(nombre)) between 1 and 80),
  clave        text generated always as (public.clave_ejercicio(nombre)) stored,
  grupo        text check (grupo in ('piernas', 'gluteos', 'pecho', 'espalda', 'hombros',
                                     'brazos', 'core', 'cardio', 'movilidad', 'otro')),
  -- «Cómo se hace». LO VE EL CLIENTE en su link.
  indicaciones text not null default '' check (char_length(indicaciones) <= 500),
  -- YouTube, Instagram, TikTok: lo que el trainer ya usa. Solo https.
  video_url    text check (video_url ~ '^https://\S+$' and char_length(video_url) <= 300),
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint ejercicios_id_empresa unique (id, empresa_id)
);

create unique index if not exists ejercicios_clave_unica on public.ejercicios (empresa_id, clave);

alter table public.ejercicios enable row level security;
revoke all on public.ejercicios from anon, authenticated;

-- ------------------------------------------------------------
-- 2. LAS RUTINAS
--
--    plantilla → sin cliente, para reusar.
--    borrador  → «la próxima»: el trainer la arma sin tocar lo que el
--                cliente ve.
--    vigente   → la que ve el cliente en su link. Una por cliente.
--    anterior  → la historia. Las rutinas de un cliente no se borran.
--
--    `version` es para dos celulares editando a la vez: el que guarda con
--    una versión vieja se entera, en vez de pisar al otro sin saberlo.
-- ------------------------------------------------------------
create table if not exists public.rutinas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  cliente_id  uuid,
  estado      text not null check (estado in ('plantilla', 'borrador', 'vigente', 'anterior')),
  -- «Fuerza base». LO VE EL CLIENTE.
  nombre      text not null check (char_length(trim(nombre)) between 1 and 60),
  -- Las indicaciones generales. LAS VE EL CLIENTE.
  notas       text not null default '' check (char_length(notas) <= 1000),
  desde       date,
  hasta       date,
  -- «Cambiarla en N semanas»: es solo un aviso para el trainer.
  semanas     smallint check (semanas between 1 and 52),
  -- De qué plantilla o rutina salió.
  origen_id   uuid references public.rutinas (id) on delete set null,
  version     integer not null default 1,
  creado_por  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint rutinas_id_empresa unique (id, empresa_id),
  -- NO ACTION. Con cliente en null (plantilla) la clave no se controla.
  constraint rutinas_cliente foreign key (cliente_id, empresa_id)
    references public.clientes (id, empresa_id),
  constraint rutinas_plantilla_sin_cliente check ((cliente_id is null) = (estado = 'plantilla')),
  constraint rutinas_con_fecha check (estado not in ('vigente', 'anterior') or desde is not null),
  constraint rutinas_fechas check (hasta is null or hasta >= desde)
);

create unique index if not exists rutinas_una_vigente on public.rutinas (cliente_id) where estado = 'vigente';
create unique index if not exists rutinas_un_borrador on public.rutinas (cliente_id) where estado = 'borrador';
create index if not exists rutinas_empresa_idx on public.rutinas (empresa_id, estado);
create index if not exists rutinas_cliente_idx on public.rutinas (cliente_id);

alter table public.rutinas enable row level security;
revoke all on public.rutinas from anon, authenticated;

-- ------------------------------------------------------------
-- 3. LOS DÍAS («Día A · Piernas»)
--
--    El orden es único pero DIFERIDO: al reordenar, el día 2 pasa a ser el
--    1 y el 1 el 2, y en el medio los dos son el 1 un instante. Se controla
--    al terminar la transacción, cuando ya quedó cada uno en su lugar.
-- ------------------------------------------------------------
create table if not exists public.rutina_dias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  rutina_id   uuid not null,
  orden       smallint not null check (orden between 1 and 10),
  nombre      text not null check (char_length(trim(nombre)) between 1 and 40),
  -- Entrada en calor, vuelta a la calma. LO VE EL CLIENTE.
  notas       text not null default '' check (char_length(notas) <= 500),
  constraint rutina_dias_id_empresa unique (id, empresa_id),
  constraint rutina_dias_rutina foreign key (rutina_id, empresa_id)
    references public.rutinas (id, empresa_id) on delete cascade,
  constraint rutina_dias_orden unique (rutina_id, orden) deferrable initially deferred
);

alter table public.rutina_dias enable row level security;
revoke all on public.rutina_dias from anon, authenticated;

-- ------------------------------------------------------------
-- 4. LOS EJERCICIOS DE CADA DÍA
--
--    Lo que el trainer indica es texto corto, no número: «8-12», «12-10-8»,
--    «45 s», «al fallo»; «40 kg», «25 lb», «placa 7», «banda roja». La base
--    NUNCA le agrega una unidad a la carga: en muchos gimnasios los discos
--    vienen en libras, y leer «25 kg» donde el trainer pensó «25 lb» es el
--    único error de pantalla que puede lastimar a alguien.
--
--    Lo que se mide sí es número (las medidas, más abajo).
-- ------------------------------------------------------------
create table if not exists public.rutina_ejercicios (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas (id) on delete cascade,
  dia_id            uuid not null,
  orden             smallint not null check (orden between 1 and 30),
  ejercicio_id      uuid not null,
  -- En null para el cardio o lo que va por tiempo.
  series            smallint check (series between 1 and 20),
  reps              text not null default '' check (char_length(reps) <= 20),
  carga             text not null default '' check (char_length(carga) <= 24),
  descanso_seg      smallint check (descanso_seg between 0 and 900),
  -- «Codos pegados», «no cargar la rodilla». LA VE EL CLIENTE.
  nota              text not null default '' check (char_length(nota) <= 200),
  -- Superserie: el cliente lo ve como 2a / 2b.
  junto_al_anterior boolean not null default false,
  constraint rutina_ejercicios_id_empresa unique (id, empresa_id),
  constraint rutina_ej_dia foreign key (dia_id, empresa_id)
    references public.rutina_dias (id, empresa_id) on delete cascade,
  -- NO ACTION: un ejercicio que está en una rutina se apaga, no se borra.
  constraint rutina_ej_ejercicio foreign key (ejercicio_id, empresa_id)
    references public.ejercicios (id, empresa_id),
  constraint rutina_ej_orden unique (dia_id, orden) deferrable initially deferred,
  constraint rutina_ej_primero_suelto check (orden > 1 or not junto_al_anterior)
);

create index if not exists rutina_ej_ejercicio_idx on public.rutina_ejercicios (ejercicio_id);

alter table public.rutina_ejercicios enable row level security;
revoke all on public.rutina_ejercicios from anon, authenticated;

-- ------------------------------------------------------------
-- 5. EL LINK DEL CLIENTE
--
--    Uno por persona, no por rutina: siempre muestra la vigente. El token
--    ES la credencial. Cambiarlo deja al viejo igual que uno inexistente.
-- ------------------------------------------------------------
create table if not exists public.rutina_enlaces (
  cliente_id  uuid primary key,
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  token       uuid not null default gen_random_uuid(),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint rutina_enlaces_cliente foreign key (cliente_id, empresa_id)
    references public.clientes (id, empresa_id) on delete cascade
);

create unique index if not exists rutina_enlaces_token on public.rutina_enlaces (token);

alter table public.rutina_enlaces enable row level security;
revoke all on public.rutina_enlaces from anon, authenticated;

-- ------------------------------------------------------------
-- 6. LA FICHA DE ENTRENAMIENTO (mínima; crece en la fase 3)
--
--    Por ahora guarda una sola cosa: que el cliente (o su madre, padre o
--    tutor, si es menor) está de acuerdo con que se guarden sus medidas.
--    Son datos de salud (Ley 7593/2025 en Paraguay, LGPD en Brasil): sin
--    ese sí, no se anota ninguna.
-- ------------------------------------------------------------
create table if not exists public.fichas_entreno (
  cliente_id           uuid primary key,
  empresa_id           uuid not null references public.empresas (id) on delete cascade,
  consiente_medidas_at timestamptz,
  consiente_por        uuid references auth.users (id) on delete set null,
  updated_at           timestamptz not null default now(),
  constraint fichas_entreno_cliente foreign key (cliente_id, empresa_id)
    references public.clientes (id, empresa_id) on delete cascade
);

alter table public.fichas_entreno enable row level security;
revoke all on public.fichas_entreno from anon, authenticated;

-- ------------------------------------------------------------
-- 7. LAS MEDICIONES
--
--    Una fila es «el control del 22/09», como lo piensa el trainer, y no
--    una fila por valor: así los rangos los controla la base, como en todo
--    Orden. Los rangos frenan dedazos («8,5» en vez de «85»), no
--    diagnostican nada, y son los mismos de src/lib/medidas.ts.
--
--    No se guarda nada calculado (IMC, cintura/altura): se calcula en
--    medidas.ts, y así se puede corregir sin migrar.
--
--    Los nombres de todos los check empiezan con `mediciones_`: la regla
--    de src/lib/errores.ts los traduce a «Ese valor está fuera de rango».
-- ------------------------------------------------------------
create table if not exists public.mediciones (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  cliente_id     uuid not null,
  fecha          date not null,
  peso_kg        numeric(4, 1) check (peso_kg between 20 and 300),
  altura_cm      numeric(4, 1) check (altura_cm between 100 and 230),
  cintura_cm     numeric(4, 1) check (cintura_cm between 40 and 200),
  cadera_cm      numeric(4, 1) check (cadera_cm between 50 and 200),
  pecho_cm       numeric(4, 1) check (pecho_cm between 50 and 180),
  -- Contraído.
  brazo_cm       numeric(4, 1) check (brazo_cm between 15 and 75),
  muslo_cm       numeric(4, 1) check (muslo_cm between 30 and 110),
  grasa_pct      numeric(3, 1) check (grasa_pct between 3 and 70),
  -- Una balanza y un plicómetro no se comparan: el % de grasa va siempre
  -- con su método.
  grasa_metodo   text check (grasa_metodo in ('balanza', 'plicometro', 'cinta', 'otro')),
  pantorrilla_cm numeric(4, 1) check (pantorrilla_cm between 20 and 70),
  cuello_cm      numeric(4, 1) check (cuello_cm between 25 and 65),
  nota           text not null default '' check (char_length(nota) <= 300),
  creado_por     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- NO ACTION.
  constraint mediciones_cliente foreign key (cliente_id, empresa_id)
    references public.clientes (id, empresa_id),
  constraint mediciones_un_control_por_dia unique (cliente_id, fecha),
  constraint mediciones_con_algo check (num_nonnulls(peso_kg, altura_cm, cintura_cm, cadera_cm,
    pecho_cm, brazo_cm, muslo_cm, grasa_pct, pantorrilla_cm, cuello_cm) >= 1),
  constraint mediciones_grasa_con_metodo check ((grasa_pct is null) = (grasa_metodo is null))
);

create index if not exists mediciones_cliente_idx on public.mediciones (cliente_id, fecha desc);

alter table public.mediciones enable row level security;
revoke all on public.mediciones from anon, authenticated;

-- ------------------------------------------------------------
-- 8. CÓMO SUBIERON LAS CARGAS
--
--    Cada vez que cambia la carga o las repeticiones de un ejercicio de la
--    rutina VIGENTE, queda una fila. Es lo que el cliente festeja y lo que
--    lo hace renovar: «Sentadilla: de 40 a 50 kg desde el 15/08».
-- ------------------------------------------------------------
create table if not exists public.cargas_historial (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  cliente_id    uuid not null,
  ejercicio_id  uuid not null,
  rutina_id     uuid references public.rutinas (id) on delete set null,
  fecha         date not null,
  carga_antes   text,
  carga_despues text,
  reps_antes    text,
  reps_despues  text,
  creado_por    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  -- NO ACTION las dos.
  constraint cargas_historial_cliente foreign key (cliente_id, empresa_id)
    references public.clientes (id, empresa_id),
  constraint cargas_historial_ejercicio foreign key (ejercicio_id, empresa_id)
    references public.ejercicios (id, empresa_id)
);

create index if not exists cargas_historial_idx on public.cargas_historial (cliente_id, ejercicio_id, fecha);

alter table public.cargas_historial enable row level security;
revoke all on public.cargas_historial from anon, authenticated;

-- ------------------------------------------------------------
-- 9. CON LA CUENTA VENCIDA NO SE CARGA (018, 069)
--
--    En todas las tablas nuevas MENOS `rutina_enlaces`. Apagar o cambiar un
--    link que se reenvió a quien no debía es seguridad, no carga: tiene que
--    poder hacerse justo cuando la cuenta está vencida y Orden cerrado.
-- ------------------------------------------------------------
drop trigger if exists cuenta_activa_ejercicios on public.ejercicios;
create trigger cuenta_activa_ejercicios
  before insert or update on public.ejercicios
  for each row execute function public.exigir_cuenta_activa();

drop trigger if exists cuenta_activa_rutinas on public.rutinas;
create trigger cuenta_activa_rutinas
  before insert or update on public.rutinas
  for each row execute function public.exigir_cuenta_activa();

drop trigger if exists cuenta_activa_rutina_dias on public.rutina_dias;
create trigger cuenta_activa_rutina_dias
  before insert or update on public.rutina_dias
  for each row execute function public.exigir_cuenta_activa();

drop trigger if exists cuenta_activa_rutina_ejercicios on public.rutina_ejercicios;
create trigger cuenta_activa_rutina_ejercicios
  before insert or update on public.rutina_ejercicios
  for each row execute function public.exigir_cuenta_activa();

drop trigger if exists cuenta_activa_fichas_entreno on public.fichas_entreno;
create trigger cuenta_activa_fichas_entreno
  before insert or update on public.fichas_entreno
  for each row execute function public.exigir_cuenta_activa();

drop trigger if exists cuenta_activa_mediciones on public.mediciones;
create trigger cuenta_activa_mediciones
  before insert or update on public.mediciones
  for each row execute function public.exigir_cuenta_activa();

drop trigger if exists cuenta_activa_cargas_historial on public.cargas_historial;
create trigger cuenta_activa_cargas_historial
  before insert or update on public.cargas_historial
  for each row execute function public.exigir_cuenta_activa();

-- ============================================================
-- LAS FUNCIONES
--
-- Todas reciben la empresa primero, arrancan preguntando si quien llama es
-- de esa empresa, y controlan que la fila que tocan sea de ella: un id de
-- otro negocio es, para esta, un id que no existe.
--
-- Los datos de salud (medidas, consentimiento, «Salud y lesiones») son del
-- dueño o de un administrador. Un vendedor que cobra en el mostrador arma
-- rutinas si hace falta, pero no ve cuánto pesa nadie.
-- ============================================================

-- ------------------------------------------------------------
-- 10. AYUDANTES (no se llaman desde afuera)
-- ------------------------------------------------------------

-- ¿Está entrenando? Un cliente activo con un plan que se puede usar, o con
-- una sesión cerca (un mes para atrás o para adelante), o con una rutina
-- vigente o en preparación. El que dejó de venir no se archiva —se le
-- cierra el plan o no renueva—, y sin esto «sin rutina» listaría para
-- siempre a cada cliente viejo o de prueba.
create or replace function public.cliente_entrenando(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce((
    select c.activo and (
      exists (
        select 1 from public.paquetes p
        where p.cliente_id = c.id and not p.cerrado
          and (public.estado_paquete(p.id)->>'estado') = 'activo')
      or exists (
        select 1 from public.turnos_reserva r
        where r.cliente_id = c.id and r.empresa_id = c.empresa_id and r.estado <> 'cancelada'
          and (r.inicia at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date
              between public.hoy_empresa(c.empresa_id) - 30 and public.hoy_empresa(c.empresa_id) + 30)
      or exists (
        select 1 from public.rutinas ru
        where ru.cliente_id = c.id and ru.estado in ('vigente', 'borrador')))
    from public.clientes c
    join public.empresas e on e.id = c.empresa_id
    where c.id = p_cliente
  ), false);
$fn$;

revoke all on function public.cliente_entrenando(uuid) from public, anon, authenticated;

-- Una rutina entera, con cada ejercicio completado desde la biblioteca.
-- `p_con_notas`: si trae «Salud y lesiones» del cliente, para el aviso en
-- ámbar. Lo ve todo el equipo (ver rutinas_del_cliente).
create or replace function public.rutina_json(p_rutina uuid, p_con_notas boolean)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'id',             r.id,
    'cliente_id',     r.cliente_id,
    'cliente_nombre', c.nombre,
    'cliente_notas',  case when p_con_notas and r.cliente_id is not null then c.notas end,
    'estado',         r.estado,
    'nombre',         r.nombre,
    'notas',          r.notas,
    'desde',          r.desde,
    'hasta',          r.hasta,
    'semanas',        r.semanas,
    'version',        r.version,
    'updated_at',     r.updated_at,
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',     d.id,
        'orden',  d.orden,
        'nombre', d.nombre,
        'notas',  d.notas,
        'ejercicios', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',                re.id,
            'orden',             re.orden,
            'ejercicio_id',      re.ejercicio_id,
            'nombre',            e.nombre,
            'grupo',             e.grupo,
            'indicaciones',      e.indicaciones,
            'video_url',         e.video_url,
            'series',            re.series,
            'reps',              re.reps,
            'carga',             re.carga,
            'descanso_seg',      re.descanso_seg,
            'nota',              re.nota,
            'junto_al_anterior', re.junto_al_anterior
          ) order by re.orden)
          from public.rutina_ejercicios re
          join public.ejercicios e on e.id = re.ejercicio_id
          where re.dia_id = d.id
        ), '[]'::jsonb)
      ) order by d.orden)
      from public.rutina_dias d
      where d.rutina_id = r.id
    ), '[]'::jsonb)
  )
  from public.rutinas r
  left join public.clientes c on c.id = r.cliente_id and c.empresa_id = r.empresa_id
  where r.id = p_rutina;
$fn$;

revoke all on function public.rutina_json(uuid, boolean) from public, anon, authenticated;

-- Un ejercicio por su nombre: el que ya está (aunque cambien mayúsculas,
-- tildes o espacios), y si estaba apagado se prende; si no está, se crea.
-- `on conflict`: dos celulares guardando a la vez el mismo nombre nuevo
-- terminan en el mismo ejercicio, no en un error.
create or replace function public.ejercicio_por_nombre(p_empresa uuid, p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre text;
  v_id     uuid;
  v_activo boolean;
begin
  v_nombre := btrim(left(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), 80));
  if v_nombre = '' then
    raise exception 'A un ejercicio le falta el nombre.' using errcode = '22023';
  end if;

  select id, activo into v_id, v_activo
  from public.ejercicios
  where empresa_id = p_empresa and clave = public.clave_ejercicio(v_nombre);

  if v_id is null then
    insert into public.ejercicios (empresa_id, nombre)
    values (p_empresa, v_nombre)
    on conflict (empresa_id, clave) do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from public.ejercicios
      where empresa_id = p_empresa and clave = public.clave_ejercicio(v_nombre);
    end if;
  elsif not v_activo then
    update public.ejercicios set activo = true where id = v_id;
  end if;

  return v_id;
end $fn$;

revoke all on function public.ejercicio_por_nombre(uuid, text) from public, anon, authenticated;

-- En qué estado nace una rutina nueva. Sin cliente, plantilla. Con cliente:
-- vigente si no tiene ninguna, «la próxima» si ya tiene una vigente, y si
-- ya hay una próxima en preparación, no se arma otra al lado: dos
-- borradores del mismo cliente terminan con uno pisando al otro.
--
-- Primero se pregunta por la vigente y recién después por la próxima: el
-- que tocó «Terminar» con una próxima ya armada queda sin vigente y con un
-- borrador. La pantalla le muestra «Sin rutina» (Armar desde cero · Usar
-- una plantilla · Copiar la de otro cliente), y esos tres botones no
-- pueden chocar con un borrador que para él no está a la vista: la nueva
-- nace vigente, como dice el contrato.
--
-- El cliente queda bloqueado hasta el final de la transacción: dos toques
-- casi juntos no pueden crear las dos una vigente.
create or replace function public.destino_nueva_rutina(p_empresa uuid, p_cliente uuid)
returns text language plpgsql security definer set search_path = public as $fn$
begin
  if p_cliente is null then
    return 'plantilla';
  end if;

  perform 1 from public.clientes
  where id = p_cliente and empresa_id = p_empresa and activo
  for update;
  if not found then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.rutinas where cliente_id = p_cliente and estado = 'vigente') then
    return 'vigente';
  end if;

  if exists (select 1 from public.rutinas where cliente_id = p_cliente and estado = 'borrador') then
    raise exception 'Este cliente ya tiene una próxima rutina en preparación: seguí con esa.'
      using errcode = '22023';
  end if;
  return 'borrador';
end $fn$;

revoke all on function public.destino_nueva_rutina(uuid, uuid) from public, anon, authenticated;

-- El link del cliente: lo crea si no existe y devuelve el token. Se llama
-- cada vez que una rutina queda vigente, así el botón de WhatsApp es un
-- link común, sin esperar nada antes de abrir (el Safari del iPhone
-- bloquea las ventanas que se abren después de un await).
create or replace function public.asegurar_enlace_rutina(p_empresa uuid, p_cliente uuid)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_token uuid;
begin
  insert into public.rutina_enlaces (cliente_id, empresa_id)
  values (p_cliente, p_empresa)
  on conflict (cliente_id) do nothing;

  select token into v_token from public.rutina_enlaces
  where cliente_id = p_cliente and empresa_id = p_empresa;
  return v_token;
end $fn$;

revoke all on function public.asegurar_enlace_rutina(uuid, uuid) from public, anon, authenticated;

-- Un texto sin ninguna palabra del nombre de una persona. Lo usa
-- `copiar_rutina` entre personas distintas: el trainer que tiene dos «Ana»
-- escribe el nombre entero («Rutina de Ana Ruiz», «Gabi Medina · fuerza»),
-- y sacar solo la primera palabra dejaría el apellido en el link de otro.
--
-- Se saca cada palabra del nombre con dos letras o más que no sea una
-- partícula («de», «da», «dos»…: sacarlas rompería «Rutina de fuerza»),
-- entera, sin mayúsculas ni tildes: «ANA» y «Ána» son «Ana», y «Ana» no
-- rompe «Semana» ni «Mariana».
--
-- Las letras se escriben a mano, sin \w ni \m: en PGlite (idioma C) la «é»
-- no es una letra para las expresiones regulares y en producción (ICU) sí,
-- y «José» se sacaría en un lado y en el otro no. El espacio duro (U+00A0)
-- que llega pegando desde WhatsApp o desde los contactos tampoco une dos
-- palabras: no es una letra.
create or replace function public.sin_nombre_de_persona(p_texto text, p_persona text)
returns text language plpgsql immutable set search_path = public as $fn$
declare
  c_con    constant text := 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇáàâãäéèêëíìîïóòôõöúùûüñç';
  c_sin    constant text := 'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc';
  c_letras constant text := '0-9A-Za-zÀ-ÖØ-öø-ɏ';
  v_nombre text[] := '{}';
  v_trozo  text;
  v_res    text := '';
begin
  for v_trozo in
    select m[1] from regexp_matches(coalesce(p_persona, ''), '([' || c_letras || ']+)', 'g') m
  loop
    v_trozo := translate(lower(v_trozo), c_con, c_sin);
    if char_length(v_trozo) >= 2
       and v_trozo <> all (array['de', 'del', 'la', 'las', 'los', 'da', 'das', 'do', 'dos',
                                 'di', 'du', 'van', 'von', 'y', 'e']) then
      v_nombre := v_nombre || v_trozo;
    end if;
  end loop;

  -- El texto en pedazos que son palabras o lo que va entre ellas, en orden:
  -- se deja todo tal cual salvo las palabras del nombre.
  for v_trozo in
    select m[1] from regexp_matches(coalesce(p_texto, ''),
                                    '([' || c_letras || ']+|[^' || c_letras || ']+)', 'g') m
  loop
    if not (translate(lower(v_trozo), c_con, c_sin) = any (v_nombre)) then
      v_res := v_res || v_trozo;
    end if;
  end loop;
  return v_res;
end $fn$;

revoke all on function public.sin_nombre_de_persona(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 11. LA BIBLIOTECA
-- ------------------------------------------------------------
create or replace function public.ejercicios_de(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_lista jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  -- Los más usados primero: son los que el trainer va a buscar.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',           e.id,
    'nombre',       e.nombre,
    'grupo',        e.grupo,
    'indicaciones', e.indicaciones,
    'video_url',    e.video_url,
    'activo',       e.activo,
    'usos',         u.usos
  ) order by u.usos desc, e.clave, e.nombre), '[]'::jsonb)
  into v_lista
  from public.ejercicios e
  cross join lateral (
    select count(*)::int as usos from public.rutina_ejercicios re where re.ejercicio_id = e.id
  ) u
  where e.empresa_id = p_empresa;

  return v_lista;
end $fn$;

revoke all on function public.ejercicios_de(uuid) from public, anon;
grant execute on function public.ejercicios_de(uuid) to authenticated;

-- Crear o editar un ejercicio de la biblioteca.
--
-- Renombrar uno al nombre de OTRO que ya existe es unirlos: «Sentadila»
-- pasa a ser «Sentadilla» en todas las rutinas y en el historial de cargas,
-- y el repetido desaparece. Es la única forma de arreglar un duplicado, y
-- como cambia rutinas de muchos clientes, es del dueño o de un admin.
create or replace function public.guardar_ejercicio(
  p_empresa       uuid,
  p_nombre        text,
  p_grupo         text default null,
  p_indicaciones  text default '',
  p_video         text default null,
  p_activo        boolean default true,
  p_id            uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre text;
  v_grupo  text;
  v_ind    text;
  v_video  text;
  v_otro   uuid;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_nombre := btrim(left(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), 80));
  if v_nombre = '' then
    raise exception 'A un ejercicio le falta el nombre.' using errcode = '22023';
  end if;

  v_grupo := nullif(btrim(coalesce(p_grupo, '')), '');
  if v_grupo is not null and v_grupo not in ('piernas', 'gluteos', 'pecho', 'espalda', 'hombros',
                                             'brazos', 'core', 'cardio', 'movilidad', 'otro') then
    raise exception 'Ese grupo de ejercicios no existe.' using errcode = '22023';
  end if;

  v_ind := left(coalesce(p_indicaciones, ''), 500);

  v_video := nullif(btrim(coalesce(p_video, '')), '');
  if v_video is not null and v_video !~ '^https://\S+$' then
    raise exception 'El video tiene que ser un link que empiece con https://.' using errcode = '22023';
  end if;
  if char_length(v_video) > 300 then
    raise exception 'El link del video es demasiado largo.' using errcode = '22023';
  end if;

  -- Nuevo.
  if p_id is null then
    if exists (select 1 from public.ejercicios
               where empresa_id = p_empresa and clave = public.clave_ejercicio(v_nombre)) then
      raise exception 'Ya tenés un ejercicio que se llama así.' using errcode = '22023';
    end if;

    insert into public.ejercicios (empresa_id, nombre, grupo, indicaciones, video_url, activo)
    values (p_empresa, v_nombre, v_grupo, v_ind, v_video, coalesce(p_activo, true))
    returning id into v_otro;

    return jsonb_build_object('id', v_otro, 'unido', false);
  end if;

  -- Editar.
  perform 1 from public.ejercicios where id = p_id and empresa_id = p_empresa for update;
  if not found then
    raise exception 'Ese ejercicio no existe.' using errcode = 'P0002';
  end if;

  select id into v_otro from public.ejercicios
  where empresa_id = p_empresa and clave = public.clave_ejercicio(v_nombre) and id <> p_id;

  if v_otro is not null then
    if not public.es_admin(p_empresa) then
      raise exception 'Unir dos ejercicios es del dueño o de un administrador.' using errcode = '42501';
    end if;

    update public.rutina_ejercicios set ejercicio_id = v_otro where ejercicio_id = p_id;
    update public.cargas_historial  set ejercicio_id = v_otro where ejercicio_id = p_id;

    -- El que queda conserva lo suyo y completa lo que le faltaba con lo que
    -- traía el otro: unir no puede borrar un video o un «cómo se hace».
    update public.ejercicios
    set grupo        = coalesce(grupo, v_grupo),
        indicaciones = case when indicaciones = '' then v_ind else indicaciones end,
        video_url    = coalesce(video_url, v_video),
        activo       = activo or coalesce(p_activo, true)
    where id = v_otro;

    delete from public.ejercicios where id = p_id;

    return jsonb_build_object('id', v_otro, 'unido', true);
  end if;

  update public.ejercicios
  set nombre = v_nombre, grupo = v_grupo, indicaciones = v_ind,
      video_url = v_video, activo = coalesce(p_activo, true)
  where id = p_id;

  return jsonb_build_object('id', p_id, 'unido', false);
end $fn$;

revoke all on function public.guardar_ejercicio(uuid, text, text, text, text, boolean, uuid) from public, anon;
grant execute on function public.guardar_ejercicio(uuid, text, text, text, text, boolean, uuid) to authenticated;

-- Borrar de verdad solo lo que no se usó: lo escrito mal y nunca usado.
create or replace function public.borrar_ejercicio(p_empresa uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(p_empresa) then
    raise exception 'Borrar un ejercicio es del dueño o de un administrador.' using errcode = '42501';
  end if;

  perform 1 from public.ejercicios where id = p_id and empresa_id = p_empresa for update;
  if not found then
    raise exception 'Ese ejercicio no existe.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.rutina_ejercicios where ejercicio_id = p_id)
     or exists (select 1 from public.cargas_historial where ejercicio_id = p_id) then
    raise exception 'Ese ejercicio está en rutinas: apagalo en vez de borrarlo.' using errcode = '22023';
  end if;

  delete from public.ejercicios where id = p_id;
end $fn$;

revoke all on function public.borrar_ejercicio(uuid, uuid) from public, anon;
grant execute on function public.borrar_ejercicio(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 12. LA PANTALLA /rutinas
--
--    «Para atender» es lo que el trainer tiene que hacer hoy: el que entrena
--    y no tiene rutina, el que ya cumplió las semanas que se dijo, y (solo
--    para quien ve la salud) el que hace más de un mes que no se mide.
-- ------------------------------------------------------------
create or replace function public.rutinas_de(p_empresa uuid, p_todos boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_admin boolean;
  v_hoy   date;
  v_res   jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_admin := public.es_admin(p_empresa);
  v_hoy   := public.hoy_empresa(p_empresa);

  with base as (
    select c.id as cli, c.nombre as cli_nombre, c.telefono as cli_tel,
           public.cliente_entrenando(c.id) as entrena,
           vg.id as vig_id, vg.nombre as vig_nombre, vg.desde as vig_desde,
           vg.semanas as vig_semanas, vg.updated_at as vig_upd,
           (select b.id from public.rutinas b
            where b.cliente_id = c.id and b.estado = 'borrador') as borr_id,
           en.cliente_id as en_cli, en.token as en_token, en.activo as en_activo,
           case when v_admin then (select max(m.fecha) from public.mediciones m
                                   where m.cliente_id = c.id) end as ult_med
    from public.clientes c
    left join public.rutinas vg on vg.cliente_id = c.id and vg.estado = 'vigente'
    left join public.rutina_enlaces en on en.cliente_id = c.id
    where c.empresa_id = p_empresa and c.activo
  )
  select jsonb_build_object(
    'clientes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',          b.cli,
        'nombre',      b.cli_nombre,
        'telefono',    b.cli_tel,
        'vigente',     case when b.vig_id is null then null else jsonb_build_object(
                         'id',         b.vig_id,
                         'nombre',     b.vig_nombre,
                         'desde',      b.vig_desde,
                         'semanas',    b.vig_semanas,
                         'cambia_el',  case when b.vig_semanas is not null
                                            then b.vig_desde + b.vig_semanas * 7 end,
                         'updated_at', b.vig_upd) end,
        'borrador_id', b.borr_id,
        'enlace',      case when b.en_cli is null then null
                            else jsonb_build_object('token', b.en_token, 'activo', b.en_activo) end,
        'ultima_medicion', b.ult_med,
        'entrenando',  b.entrena
      ) order by lower(b.cli_nombre), b.cli_nombre, b.cli)
      from base b
      where b.entrena or coalesce(p_todos, false)
    ), '[]'::jsonb),
    'para_atender', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cliente_id', a.cli, 'nombre', a.cli_nombre, 'motivo', a.motivo
      ) order by lower(a.cli_nombre), a.cli, a.prioridad)
      from (
        select b.cli, b.cli_nombre, 'sin_rutina' as motivo, 1 as prioridad
        from base b where b.entrena and b.vig_id is null
        union all
        select b.cli, b.cli_nombre, 'cambiar', 2
        from base b where b.entrena and b.vig_semanas is not null
          and b.vig_desde + b.vig_semanas * 7 <= v_hoy
        union all
        select b.cli, b.cli_nombre, 'medir', 3
        from base b where b.entrena and v_admin and b.ult_med is not null
          and b.ult_med < v_hoy - 30
      ) a
    ), '[]'::jsonb),
    'plantillas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',         p.id,
        'nombre',     p.nombre,
        'semanas',    p.semanas,
        'dias',       (select count(*)::int from public.rutina_dias d where d.rutina_id = p.id),
        'ejercicios', (select count(*)::int from public.rutina_ejercicios re
                       join public.rutina_dias d on d.id = re.dia_id where d.rutina_id = p.id),
        'updated_at', p.updated_at
      ) order by lower(p.nombre), p.nombre, p.id)
      from public.rutinas p
      where p.empresa_id = p_empresa and p.estado = 'plantilla'
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.rutinas_de(uuid, boolean) from public, anon;
grant execute on function public.rutinas_de(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 13. LA CARPETA DE UNA PERSONA, Y UNA RUTINA ENTERA
-- ------------------------------------------------------------
create or replace function public.rutinas_del_cliente(p_empresa uuid, p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_admin boolean;
  v_cli   public.clientes;
  v_vig   uuid;
  v_res   jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select * into v_cli from public.clientes where id = p_cliente and empresa_id = p_empresa;
  if v_cli.id is null then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  v_admin := public.es_admin(p_empresa);
  select id into v_vig from public.rutinas where cliente_id = p_cliente and estado = 'vigente';

  select jsonb_build_object(
    'cliente', jsonb_build_object(
      'id',       v_cli.id,
      'nombre',   v_cli.nombre,
      'telefono', v_cli.telefono,
      -- «Salud y lesiones» la ve TODO el equipo, no solo el dueño: un
      -- trainer que trabaja para otro tiene que saber de la rodilla operada
      -- antes de entrenar a esa persona. Ya era así en la agenda y en
      -- Clientes (052, 097). Lo que es solo del dueño son las medidas.
      'notas',    v_cli.notas),
    'vigente', case when v_vig is null then null else public.rutina_json(v_vig, true) end,
    'borrador', (
      select jsonb_build_object('id', b.id, 'nombre', b.nombre, 'updated_at', b.updated_at)
      from public.rutinas b where b.cliente_id = p_cliente and b.estado = 'borrador'),
    'anteriores', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'desde', a.desde, 'hasta', a.hasta)
                       order by a.desde desc, a.created_at desc)
      from public.rutinas a where a.cliente_id = p_cliente and a.estado = 'anterior'
    ), '[]'::jsonb),
    'enlace', (
      select jsonb_build_object('token', en.token, 'activo', en.activo)
      from public.rutina_enlaces en where en.cliente_id = p_cliente),
    'entrenando', public.cliente_entrenando(p_cliente)
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.rutinas_del_cliente(uuid, uuid) from public, anon;
grant execute on function public.rutinas_del_cliente(uuid, uuid) to authenticated;

-- La usan el editor y la hoja de la agenda. Las lesiones van aparte, en
-- `cliente_notas`, para el aviso en ámbar del editor: nunca se copian a la
-- rutina, que es lo que ve el cliente.
create or replace function public.rutina(p_empresa uuid, p_rutina uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.rutinas where id = p_rutina and empresa_id = p_empresa) then
    raise exception 'Esa rutina no existe.' using errcode = 'P0002';
  end if;

  return public.rutina_json(p_rutina, true);
end $fn$;

revoke all on function public.rutina(uuid, uuid) from public, anon;
grant execute on function public.rutina(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 14. GUARDAR UNA RUTINA
--
--    Todo de una vez, con una sola llamada: el editor no autoguarda, porque
--    si no el cliente vería una rutina a medio editar.
--
--    Los días y los ejercicios CONSERVAN SU ID: los tildes que el cliente
--    hizo en su celular están guardados por id, y el historial de cargas
--    necesita saber que «el mismo renglón» pasó de 40 a 50. Lo que llega
--    con un id de esta rutina se actualiza, lo nuevo se inserta, y lo que
--    no llegó se borra.
-- ------------------------------------------------------------
create or replace function public.guardar_rutina(
  p_empresa uuid,
  p_datos   jsonb,
  p_id      uuid default null,
  p_cliente uuid default null,
  p_version integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_hoy      date;
  v_r        public.rutinas;
  v_id       uuid;
  v_estado   text;
  v_version  integer;
  v_cliente  uuid;
  v_nombre   text;
  v_notas    text;
  v_semanas  numeric;
  v_desde    date;
  v_dias     jsonb;
  v_dia      jsonb;
  v_ejs      jsonb;
  v_ej       jsonb;
  v_i        integer;
  v_j        integer;
  v_num      numeric;
  v_texto    text;
  v_dia_id   uuid;
  v_ren_id   uuid;
  v_ejer_id  uuid;
  v_series   smallint;
  v_desc     smallint;
  v_reps     text;
  v_carga    text;
  v_viejo    public.rutina_ejercicios;
  v_dias_ant uuid[];
  v_ejs_ant  uuid[];
  v_dias_ok  uuid[] := '{}';
  v_ejs_ok   uuid[] := '{}';
  v_token    uuid;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_hoy := public.hoy_empresa(p_empresa);

  -- ---- 1. Lo que llega, entero, antes de escribir nada ----
  v_dias := case when jsonb_typeof(p_datos->'dias') = 'array' then p_datos->'dias' else '[]'::jsonb end;
  if jsonb_array_length(v_dias) not between 1 and 10 then
    raise exception 'Una rutina tiene entre 1 y 10 días.' using errcode = '22023';
  end if;

  v_nombre := btrim(left(btrim(coalesce(p_datos->>'nombre', '')), 60));
  if v_nombre = '' then
    raise exception 'Ponele un nombre a la rutina.' using errcode = '22023';
  end if;
  v_notas := left(coalesce(p_datos->>'notas', ''), 1000);

  v_semanas := nullif(btrim(coalesce(p_datos->>'semanas', '')), '')::numeric;
  if v_semanas is not null and (v_semanas <> trunc(v_semanas) or v_semanas not between 1 and 52) then
    raise exception 'Las semanas van de 1 a 52.' using errcode = '22023';
  end if;
  v_desde := nullif(btrim(coalesce(p_datos->>'desde', '')), '')::date;

  for v_dia in select value from jsonb_array_elements(v_dias) loop
    if btrim(coalesce(v_dia->>'nombre', '')) = '' then
      raise exception 'Cada día de la rutina necesita un nombre.' using errcode = '22023';
    end if;
    v_ejs := case when jsonb_typeof(v_dia->'ejercicios') = 'array' then v_dia->'ejercicios' else '[]'::jsonb end;
    if jsonb_array_length(v_ejs) > 30 then
      raise exception 'Un día tiene como máximo 30 ejercicios.' using errcode = '22023';
    end if;

    for v_ej in select value from jsonb_array_elements(v_ejs) loop
      if nullif(btrim(coalesce(v_ej->>'ejercicio_id', '')), '') is null
         and btrim(coalesce(v_ej->>'nombre', '')) = '' then
        raise exception 'A un ejercicio le falta el nombre.' using errcode = '22023';
      end if;

      v_num := nullif(btrim(coalesce(v_ej->>'series', '')), '')::numeric;
      if v_num is not null and (v_num <> trunc(v_num) or v_num not between 1 and 20) then
        raise exception 'Las series van de 1 a 20.' using errcode = '22023';
      end if;

      v_num := nullif(btrim(coalesce(v_ej->>'descanso_seg', '')), '')::numeric;
      if v_num is not null and (v_num <> trunc(v_num) or v_num not between 0 and 900) then
        raise exception 'El descanso va de 0 a 15 minutos.' using errcode = '22023';
      end if;

      -- La carga y las repeticiones no se recortan en silencio: «25 lb por
      -- lado» cortado a la mitad puede decir otra cosa.
      if char_length(btrim(coalesce(v_ej->>'carga', ''))) > 24 then
        raise exception 'La carga se escribe corta: hasta 24 letras.' using errcode = '22023';
      end if;
      if char_length(btrim(coalesce(v_ej->>'reps', ''))) > 20 then
        raise exception 'Las repeticiones se escriben cortas: hasta 20 letras.' using errcode = '22023';
      end if;
    end loop;
  end loop;

  -- ---- 2. La rutina ----
  if p_id is null then
    v_estado := public.destino_nueva_rutina(p_empresa, p_cliente);
    v_cliente := case when v_estado = 'plantilla' then null else p_cliente end;

    insert into public.rutinas (empresa_id, cliente_id, estado, nombre, notas, desde, semanas, creado_por)
    values (p_empresa, v_cliente, v_estado, v_nombre, v_notas,
            case when v_estado = 'vigente' then coalesce(v_desde, v_hoy) end,
            v_semanas::smallint, auth.uid())
    returning id, version into v_id, v_version;
  else
    select * into v_r from public.rutinas where id = p_id for update;
    if v_r.id is null or v_r.empresa_id <> p_empresa then
      raise exception 'Esa rutina no existe.' using errcode = 'P0002';
    end if;

    if v_r.estado = 'anterior' then
      raise exception 'Esa rutina ya terminó: armá la próxima a partir de ella.' using errcode = '22023';
    end if;

    if p_version is not null and p_version <> v_r.version then
      raise exception 'Alguien cambió esta rutina mientras la editabas. Recargá para ver la última.'
        using errcode = '22023';
    end if;

    v_id := v_r.id;
    v_estado := v_r.estado;
    v_cliente := v_r.cliente_id;

    update public.rutinas
    set nombre = v_nombre,
        notas = v_notas,
        semanas = v_semanas::smallint,
        -- Solo la vigente tiene «desde» (la próxima lo toma al activarse).
        desde = case when v_estado = 'vigente' then coalesce(v_desde, desde) else desde end,
        version = version + 1,
        updated_at = now()
    where id = v_id
    returning version into v_version;
  end if;

  -- ---- 3. Los días y sus ejercicios ----
  select coalesce(array_agg(d.id), '{}') into v_dias_ant
  from public.rutina_dias d where d.rutina_id = v_id;

  select coalesce(array_agg(re.id), '{}') into v_ejs_ant
  from public.rutina_ejercicios re
  join public.rutina_dias d on d.id = re.dia_id
  where d.rutina_id = v_id;

  for v_dia, v_i in select value, ordinality::int from jsonb_array_elements(v_dias) with ordinality loop
    v_dia_id := public.uuid_o_null(v_dia->>'id');

    -- Un id que no es de esta rutina, o que ya se usó arriba, es un día nuevo.
    if v_dia_id is not null and v_dia_id = any (v_dias_ant) and not (v_dia_id = any (v_dias_ok)) then
      update public.rutina_dias
      set orden = v_i,
          nombre = btrim(left(btrim(v_dia->>'nombre'), 40)),
          notas = left(coalesce(v_dia->>'notas', ''), 500)
      where id = v_dia_id;
    else
      insert into public.rutina_dias (empresa_id, rutina_id, orden, nombre, notas)
      values (p_empresa, v_id, v_i, btrim(left(btrim(v_dia->>'nombre'), 40)),
              left(coalesce(v_dia->>'notas', ''), 500))
      returning id into v_dia_id;
    end if;
    v_dias_ok := v_dias_ok || v_dia_id;

    v_ejs := case when jsonb_typeof(v_dia->'ejercicios') = 'array' then v_dia->'ejercicios' else '[]'::jsonb end;

    for v_ej, v_j in select value, ordinality::int from jsonb_array_elements(v_ejs) with ordinality loop
      -- El ejercicio de la biblioteca: por id (tiene que ser de esta
      -- empresa; la clave compuesta lo frenaría igual, pero así se dice
      -- con palabras) o por nombre.
      v_texto := nullif(btrim(coalesce(v_ej->>'ejercicio_id', '')), '');
      if v_texto is not null then
        v_ejer_id := public.uuid_o_null(v_texto);
        if v_ejer_id is null
           or not exists (select 1 from public.ejercicios where id = v_ejer_id and empresa_id = p_empresa) then
          raise exception 'Ese ejercicio no existe.' using errcode = 'P0002';
        end if;
      else
        v_ejer_id := public.ejercicio_por_nombre(p_empresa, v_ej->>'nombre');
      end if;

      v_series := nullif(btrim(coalesce(v_ej->>'series', '')), '')::numeric::smallint;
      v_desc   := nullif(btrim(coalesce(v_ej->>'descanso_seg', '')), '')::numeric::smallint;
      v_reps   := btrim(coalesce(v_ej->>'reps', ''));
      v_carga  := btrim(coalesce(v_ej->>'carga', ''));

      v_ren_id := public.uuid_o_null(v_ej->>'id');
      if v_ren_id is not null and v_ren_id = any (v_ejs_ant) and not (v_ren_id = any (v_ejs_ok)) then
        select * into v_viejo from public.rutina_ejercicios where id = v_ren_id;

        update public.rutina_ejercicios
        set dia_id = v_dia_id,
            orden = v_j,
            ejercicio_id = v_ejer_id,
            series = v_series,
            reps = v_reps,
            carga = v_carga,
            descanso_seg = v_desc,
            nota = left(coalesce(v_ej->>'nota', ''), 200),
            -- El primero de un día no puede ir «junto al anterior».
            junto_al_anterior = (v_j > 1 and coalesce((v_ej->>'junto_al_anterior')::boolean, false))
        where id = v_ren_id;

        -- Subir la carga editando la rutina vigente también es avance. Si
        -- se cambió el ejercicio por otro, no: «de 40 en sentadilla a 100
        -- en prensa» no es progreso de nada.
        if v_estado = 'vigente' and v_viejo.ejercicio_id = v_ejer_id
           and (v_viejo.carga is distinct from v_carga or v_viejo.reps is distinct from v_reps) then
          insert into public.cargas_historial (empresa_id, cliente_id, ejercicio_id, rutina_id, fecha,
                                               carga_antes, carga_despues, reps_antes, reps_despues, creado_por)
          values (p_empresa, v_cliente, v_ejer_id, v_id, v_hoy,
                  v_viejo.carga, v_carga, v_viejo.reps, v_reps, auth.uid());
        end if;
      else
        insert into public.rutina_ejercicios (empresa_id, dia_id, orden, ejercicio_id, series, reps, carga,
                                              descanso_seg, nota, junto_al_anterior)
        values (p_empresa, v_dia_id, v_j, v_ejer_id, v_series, v_reps, v_carga, v_desc,
                left(coalesce(v_ej->>'nota', ''), 200),
                (v_j > 1 and coalesce((v_ej->>'junto_al_anterior')::boolean, false)))
        returning id into v_ren_id;
      end if;
      v_ejs_ok := v_ejs_ok || v_ren_id;
    end loop;
  end loop;

  -- Lo que no llegó, se va. Primero los días (sus ejercicios caen en
  -- cascada, salvo los que ya se mudaron a otro día), después los
  -- ejercicios que quedaron sueltos en los días que siguen.
  delete from public.rutina_dias where rutina_id = v_id and not (id = any (v_dias_ok));

  delete from public.rutina_ejercicios re
  using public.rutina_dias d
  where d.id = re.dia_id and d.rutina_id = v_id and not (re.id = any (v_ejs_ok));

  -- ---- 4. El link, si quedó vigente ----
  if v_estado = 'vigente' then
    v_token := public.asegurar_enlace_rutina(p_empresa, v_cliente);
  end if;

  return jsonb_build_object('id', v_id, 'estado', v_estado, 'version', v_version, 'token', v_token);
end $fn$;

revoke all on function public.guardar_rutina(uuid, jsonb, uuid, uuid, integer) from public, anon;
grant execute on function public.guardar_rutina(uuid, jsonb, uuid, uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- 15. COPIAR UNA RUTINA
--
--    Una sola función para cuatro botones: «Usar para Ana» (de una
--    plantilla), «Copiar la de otro cliente», «Armar la próxima» (la
--    vigente de Ana a un borrador de Ana) y «Guardar como plantilla».
--
--    Entre personas distintas no viaja nada de la persona: el nombre del
--    cliente de origen, palabra por palabra, se saca del nombre de la rutina
--    («Rutina de Ana Ruiz» no puede aparecer en el link de Pedro, ni como
--    «Rutina de Ruiz»), y con «Copiar sin las notas» se vacían las notas,
--    que pueden tener lesiones de la otra persona.
-- ------------------------------------------------------------
create or replace function public.copiar_rutina(
  p_empresa   uuid,
  p_origen    uuid,
  p_cliente   uuid default null,
  p_con_notas boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_o         public.rutinas;
  v_estado    text;
  v_cliente   uuid;
  v_mismo     boolean;
  v_sin_notas boolean;
  v_pila      text;
  v_nombre    text;
  v_id        uuid;
  v_dia       public.rutina_dias;
  v_dia_id    uuid;
  v_token     uuid;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select * into v_o from public.rutinas where id = p_origen and empresa_id = p_empresa;
  if v_o.id is null then
    raise exception 'Esa rutina no existe.' using errcode = 'P0002';
  end if;

  v_estado := public.destino_nueva_rutina(p_empresa, p_cliente);
  v_cliente := case when v_estado = 'plantilla' then null else p_cliente end;

  -- «Armar la próxima» (el mismo cliente) conserva todo.
  v_mismo := v_o.cliente_id is not null and v_cliente is not null and v_o.cliente_id = v_cliente;
  v_sin_notas := not v_mismo and not coalesce(p_con_notas, true);

  v_nombre := v_o.nombre;
  if v_o.cliente_id is not null and not v_mismo then
    -- El nombre ENTERO de la persona, no solo el de pila: «Rutina de Ana
    -- Ruiz» sin «Ana» dejaría «Rutina de Ruiz» en el link de Pedro.
    select nombre into v_pila from public.clientes where id = v_o.cliente_id;
    v_nombre := public.sin_nombre_de_persona(v_nombre, v_pila);
    -- Lo que quedó suelto: «Rutina ()», «Rutina ·  · piernas», «· fuerza»,
    -- y un «de» que se quedó sin la persona antes de un separador.
    v_nombre := regexp_replace(v_nombre, '\(\s*\)|\[\s*\]', ' ', 'g');
    -- Los espacios raros van escritos como códigos (E'\u00A0') y no pegados:
    -- pegados, se volvían espacios comunes al aplicar la migración.
    v_nombre := regexp_replace(v_nombre, E'[[:space:]\u00A0]+', ' ', 'g');
    v_nombre := regexp_replace(v_nombre, '\s*([·•|/,:;–—-])(\s*[·•|/,:;–—-])+\s*', ' \1 ', 'g');
    v_nombre := regexp_replace(v_nombre, '(^|\s)(de|del|da|do|das|dos|para|pra)\s+(?=[·•|/,:;–—-])', '\1', 'gi');
    v_nombre := btrim(v_nombre, ' ·•|/,:;–—-');
    -- Vacío, o colgando de una partícula («Fuerza de», «Treino da»): «Rutina».
    if v_nombre = '' or lower(v_nombre) ~ '(^|\s)(de|del|da|do|das|dos|para|pra)$' then
      v_nombre := 'Rutina';
    end if;
  end if;

  insert into public.rutinas (empresa_id, cliente_id, estado, nombre, notas, desde, semanas, origen_id, creado_por)
  values (p_empresa, v_cliente, v_estado, v_nombre,
          case when v_sin_notas then '' else v_o.notas end,
          case when v_estado = 'vigente' then public.hoy_empresa(p_empresa) end,
          v_o.semanas, v_o.id, auth.uid())
  returning id into v_id;

  for v_dia in select * from public.rutina_dias where rutina_id = v_o.id order by orden loop
    insert into public.rutina_dias (empresa_id, rutina_id, orden, nombre, notas)
    values (p_empresa, v_id, v_dia.orden, v_dia.nombre, case when v_sin_notas then '' else v_dia.notas end)
    returning id into v_dia_id;

    insert into public.rutina_ejercicios (empresa_id, dia_id, orden, ejercicio_id, series, reps, carga,
                                          descanso_seg, nota, junto_al_anterior)
    select p_empresa, v_dia_id, re.orden, re.ejercicio_id, re.series, re.reps, re.carga,
           re.descanso_seg, case when v_sin_notas then '' else re.nota end, re.junto_al_anterior
    from public.rutina_ejercicios re
    where re.dia_id = v_dia.id
    order by re.orden;
  end loop;

  if v_estado = 'vigente' then
    v_token := public.asegurar_enlace_rutina(p_empresa, v_cliente);
  end if;

  return jsonb_build_object('id', v_id, 'estado', v_estado, 'token', v_token);
end $fn$;

revoke all on function public.copiar_rutina(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.copiar_rutina(uuid, uuid, uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 16. ACTIVAR LA PRÓXIMA, TERMINAR, BORRAR
--
--    `hasta` nunca queda antes de `desde`: una rutina que se puso a
--    arrancar el lunes y se termina el viernes anterior termina el día que
--    arrancaba.
-- ------------------------------------------------------------
create or replace function public.activar_rutina(p_empresa uuid, p_rutina uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_r   public.rutinas;
  v_hoy date;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select * into v_r from public.rutinas where id = p_rutina and empresa_id = p_empresa for update;
  if v_r.id is null then
    raise exception 'Esa rutina no existe.' using errcode = 'P0002';
  end if;

  if v_r.estado <> 'borrador' then
    raise exception 'Solo se puede activar una rutina en preparación.' using errcode = '22023';
  end if;

  perform 1 from public.clientes where id = v_r.cliente_id for update;
  v_hoy := public.hoy_empresa(p_empresa);

  -- Primero la vieja pasa a la historia: hay una sola vigente por cliente.
  update public.rutinas
  set estado = 'anterior', hasta = greatest(v_hoy, desde), updated_at = now()
  where cliente_id = v_r.cliente_id and estado = 'vigente';

  update public.rutinas
  set estado = 'vigente', desde = v_hoy, hasta = null, updated_at = now()
  where id = p_rutina;

  return jsonb_build_object('id', p_rutina,
                            'token', public.asegurar_enlace_rutina(p_empresa, v_r.cliente_id));
end $fn$;

revoke all on function public.activar_rutina(uuid, uuid) from public, anon;
grant execute on function public.activar_rutina(uuid, uuid) to authenticated;

-- El cliente queda sin rutina y su link dice «Tu entrenador está preparando
-- tu rutina». El link no se apaga: eso es otro botón.
create or replace function public.terminar_rutina(p_empresa uuid, p_rutina uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_r public.rutinas;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select * into v_r from public.rutinas where id = p_rutina and empresa_id = p_empresa for update;
  if v_r.id is null then
    raise exception 'Esa rutina no existe.' using errcode = 'P0002';
  end if;

  if v_r.estado <> 'vigente' then
    raise exception 'Esa rutina no está vigente.' using errcode = '22023';
  end if;

  update public.rutinas
  set estado = 'anterior', hasta = greatest(public.hoy_empresa(p_empresa), desde), updated_at = now()
  where id = p_rutina;
end $fn$;

revoke all on function public.terminar_rutina(uuid, uuid) from public, anon;
grant execute on function public.terminar_rutina(uuid, uuid) to authenticated;

-- Se borra lo que nunca vio nadie: una próxima que no se usó (cualquiera
-- del equipo) o una plantilla (dueño o admin: la usa todo el negocio). Lo
-- que un cliente ya tuvo es su historia.
create or replace function public.borrar_rutina(p_empresa uuid, p_rutina uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_r public.rutinas;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select * into v_r from public.rutinas where id = p_rutina and empresa_id = p_empresa for update;
  if v_r.id is null then
    raise exception 'Esa rutina no existe.' using errcode = 'P0002';
  end if;

  if v_r.estado in ('vigente', 'anterior') then
    raise exception 'Las rutinas de un cliente no se borran: quedan como historia.' using errcode = '22023';
  end if;

  if v_r.estado = 'plantilla' and not public.es_admin(p_empresa) then
    raise exception 'Borrar una plantilla es del dueño o de un administrador.' using errcode = '42501';
  end if;

  delete from public.rutinas where id = p_rutina;
end $fn$;

revoke all on function public.borrar_rutina(uuid, uuid) from public, anon;
grant execute on function public.borrar_rutina(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 17. SUBIR LA CARGA DESDE LA AGENDA
--
--    El trainer que entrena en persona sube las cargas en la sesión, con el
--    celular en la mano: no va a abrir el editor para cambiar un número.
--    Solo en la vigente, que es la que se está entrenando. Suma una versión:
--    si alguien tenía el editor abierto, al guardar se entera en vez de
--    pisar la carga nueva con la vieja.
-- ------------------------------------------------------------
create or replace function public.cambiar_carga(
  p_empresa          uuid,
  p_rutina_ejercicio uuid,
  p_carga            text,
  p_reps             text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_rid   uuid;
  v_re    public.rutina_ejercicios;
  v_r     public.rutinas;
  v_carga text;
  v_reps  text;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  -- Los candados en el MISMO orden que `guardar_rutina`: primero la
  -- rutina, después el renglón. Al revés, un celular que guarda en el
  -- editor mientras otro sube la carga desde la agenda se quedarían
  -- esperando uno al otro, y PostgreSQL cortaría a uno con «deadlock
  -- detected», que nadie entiende. Así el segundo espera, y choca limpio
  -- con el control de versión.
  select d.rutina_id into v_rid
  from public.rutina_ejercicios re
  join public.rutina_dias d on d.id = re.dia_id
  where re.id = p_rutina_ejercicio and re.empresa_id = p_empresa;
  if v_rid is null then
    raise exception 'Ese ejercicio no existe.' using errcode = 'P0002';
  end if;

  select * into v_r from public.rutinas where id = v_rid and empresa_id = p_empresa for update;

  select * into v_re from public.rutina_ejercicios
  where id = p_rutina_ejercicio and empresa_id = p_empresa
  for update;
  -- Mientras esperaba, el editor pudo sacarlo de la rutina.
  if v_re.id is null or v_r.id is null then
    raise exception 'Ese ejercicio no existe.' using errcode = 'P0002';
  end if;

  if v_r.estado <> 'vigente' then
    raise exception 'Solo se cambia la carga de la rutina vigente.' using errcode = '22023';
  end if;

  v_carga := btrim(coalesce(p_carga, ''));
  v_reps  := case when p_reps is null then v_re.reps else btrim(p_reps) end;

  if char_length(v_carga) > 24 then
    raise exception 'La carga se escribe corta: hasta 24 letras.' using errcode = '22023';
  end if;
  if char_length(v_reps) > 20 then
    raise exception 'Las repeticiones se escriben cortas: hasta 20 letras.' using errcode = '22023';
  end if;

  if v_carga is distinct from v_re.carga or v_reps is distinct from v_re.reps then
    update public.rutina_ejercicios set carga = v_carga, reps = v_reps where id = v_re.id;

    insert into public.cargas_historial (empresa_id, cliente_id, ejercicio_id, rutina_id, fecha,
                                         carga_antes, carga_despues, reps_antes, reps_despues, creado_por)
    values (p_empresa, v_r.cliente_id, v_re.ejercicio_id, v_r.id, public.hoy_empresa(p_empresa),
            v_re.carga, v_carga, v_re.reps, v_reps, auth.uid());

    update public.rutinas set version = version + 1, updated_at = now() where id = v_r.id;
  end if;

  return jsonb_build_object('carga', v_carga, 'reps', v_reps);
end $fn$;

revoke all on function public.cambiar_carga(uuid, uuid, text, text) from public, anon;
grant execute on function public.cambiar_carga(uuid, uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 18. EL LINK DEL CLIENTE
--
--    Ninguna de estas escribe en una tabla con el candado de cuenta
--    vencida: apagar o cambiar un link que se reenvió a quien no debía
--    tiene que andar siempre.
-- ------------------------------------------------------------
create or replace function public.enlace_rutina(p_empresa uuid, p_cliente uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente and empresa_id = p_empresa) then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  perform public.asegurar_enlace_rutina(p_empresa, p_cliente);

  select jsonb_build_object('token', token, 'activo', activo) into v_res
  from public.rutina_enlaces where cliente_id = p_cliente;
  return v_res;
end $fn$;

revoke all on function public.enlace_rutina(uuid, uuid) from public, anon;
grant execute on function public.enlace_rutina(uuid, uuid) to authenticated;

-- «Cambiar link»: el viejo deja de existir, y quien lo tenga ve lo mismo que
-- con uno inventado.
create or replace function public.renovar_enlace_rutina(p_empresa uuid, p_cliente uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente and empresa_id = p_empresa) then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  insert into public.rutina_enlaces (cliente_id, empresa_id, token, activo)
  values (p_cliente, p_empresa, gen_random_uuid(), true)
  on conflict (cliente_id) do update
    set token = excluded.token, activo = true, updated_at = now();

  select jsonb_build_object('token', token, 'activo', activo) into v_res
  from public.rutina_enlaces where cliente_id = p_cliente;
  return v_res;
end $fn$;

revoke all on function public.renovar_enlace_rutina(uuid, uuid) from public, anon;
grant execute on function public.renovar_enlace_rutina(uuid, uuid) to authenticated;

-- Prender o apagar el link de una persona.
create or replace function public.activar_enlace_rutina(p_empresa uuid, p_cliente uuid, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente and empresa_id = p_empresa) then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  insert into public.rutina_enlaces (cliente_id, empresa_id, activo)
  values (p_cliente, p_empresa, coalesce(p_activo, true))
  on conflict (cliente_id) do update
    set activo = excluded.activo, updated_at = now();
end $fn$;

revoke all on function public.activar_enlace_rutina(uuid, uuid, boolean) from public, anon;
grant execute on function public.activar_enlace_rutina(uuid, uuid, boolean) to authenticated;

-- «Apagar mis links de rutina», desde la pantalla del candado: el dueño que
-- se va, o que no va a renovar, corta todos de una vez. Devuelve cuántos.
create or replace function public.apagar_enlaces_rutina(p_empresa uuid)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_n integer;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(p_empresa) then
    raise exception 'Apagar todos los links es del dueño o de un administrador.' using errcode = '42501';
  end if;

  update public.rutina_enlaces set activo = false, updated_at = now()
  where empresa_id = p_empresa and activo;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke all on function public.apagar_enlaces_rutina(uuid) from public, anon;
grant execute on function public.apagar_enlaces_rutina(uuid) to authenticated;

-- ------------------------------------------------------------
-- 19. LO QUE VE EL CLIENTE (pública, sin sesión)
--
--    El patrón de `reserva_por_token` (038): el token ES la credencial, así
--    que se devuelve lo justo. El nombre de pila, el negocio y la rutina
--    vigente. NUNCA el teléfono, el apellido, «Salud y lesiones», medidas,
--    paquetes, plata, borradores, rutinas anteriores ni ids (salvo el de
--    cada renglón, que es con lo que el celular guarda sus tildes).
--
--    Un token que no existe, un link apagado o cambiado, un cliente
--    archivado o un negocio que ya no es de entrenamiento dan EXACTAMENTE
--    lo mismo: `{"existe": false}`. Distinguirlos le diría a quien prueba
--    tokens cuál existió.
--
--    La cuenta vencida (decisión de Matías): 30 días de gracia; después, en
--    vez de la rutina, «Tu entrenador tiene que renovar su cuenta».
-- ------------------------------------------------------------
create or replace function public.rutina_por_token(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_en      public.rutina_enlaces;
  v_cli     public.clientes;
  v_emp     public.empresas;
  v_r       public.rutinas;
  v_nombre  text;
  v_renovar boolean;
begin
  select * into v_en from public.rutina_enlaces where token = p_token;
  if v_en.cliente_id is null or not v_en.activo then
    return jsonb_build_object('existe', false);
  end if;

  select * into v_cli from public.clientes where id = v_en.cliente_id and empresa_id = v_en.empresa_id;
  if v_cli.id is null or not v_cli.activo then
    return jsonb_build_object('existe', false);
  end if;

  select * into v_emp from public.empresas where id = v_en.empresa_id;
  if v_emp.id is null or v_emp.rubro is distinct from 'entrenamiento' then
    return jsonb_build_object('existe', false);
  end if;

  -- El nombre de pila: lo que va hasta el primer espacio de CUALQUIER tipo.
  -- `guardar_cliente` solo recorta los espacios comunes, y un nombre pegado
  -- desde WhatsApp o desde los contactos trae espacios duros (U+00A0 y
  -- parientes), tabuladores o saltos: cortar solo en « » mostraría el
  -- apellido. Las mismas clases en PGlite (idioma C) y en producción (ICU).
  -- El espacio duro de WhatsApp (U+00A0) y sus parientes, escritos como
  -- códigos y no pegados: pegados, se volvían espacios comunes al aplicar la
  -- migración, y el link mostraba el apellido.
  v_nombre := coalesce(substring(v_cli.nombre from E'[^[:space:]\u00A0\u2007\u202F\u2060\uFEFF]+'), '');

  v_renovar := not public.puede_cargar(v_emp.id)
    and coalesce((
      select s.periodo_fin is null or s.periodo_fin <= now() - interval '30 days'
      from public.suscripciones s where s.empresa_id = v_emp.id
    ), true);

  if v_renovar then
    return jsonb_build_object(
      'existe', true, 'negocio', v_emp.nombre, 'nombre', v_nombre,
      'renovar', true, 'actualizada', null, 'rutina', null);
  end if;

  select * into v_r from public.rutinas
  where cliente_id = v_cli.id and empresa_id = v_emp.id and estado = 'vigente';

  return jsonb_build_object(
    'existe',      true,
    'negocio',     v_emp.nombre,
    'nombre',      v_nombre,
    'renovar',     false,
    'actualizada', v_r.updated_at,
    'rutina', case when v_r.id is null then null else jsonb_build_object(
      'nombre', v_r.nombre,
      'notas',  v_r.notas,
      'desde',  v_r.desde,
      'dias', coalesce((
        select jsonb_agg(jsonb_build_object(
          'orden',  d.orden,
          'nombre', d.nombre,
          'notas',  d.notas,
          'ejercicios', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',           re.id,
              'orden',        re.orden,
              'nombre',       e.nombre,
              'series',       re.series,
              'reps',         re.reps,
              'carga',        re.carga,
              'descanso_seg', re.descanso_seg,
              'nota',         re.nota,
              'junto',        re.junto_al_anterior,
              'video',        e.video_url,
              'como',         e.indicaciones
            ) order by re.orden)
            from public.rutina_ejercicios re
            join public.ejercicios e on e.id = re.ejercicio_id
            where re.dia_id = d.id
          ), '[]'::jsonb)
        ) order by d.orden)
        from public.rutina_dias d
        where d.rutina_id = v_r.id
      ), '[]'::jsonb)
    ) end
  );
end $fn$;

revoke all on function public.rutina_por_token(uuid) from public;
grant execute on function public.rutina_por_token(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 20. ANOTAR UN CONTROL DE MEDIDAS
--
--    Solo el dueño o un admin, y con el sí del cliente (una sola vez: queda
--    en su ficha con la fecha y quién lo registró).
--
--    Si ese día ya hay un control, se COMPLETA en vez de duplicarlo: lo que
--    llega pisa, lo que no llega queda. Y se devuelve qué cambió de lo que
--    ya tenía valor, para que la pantalla lo muestre antes de que alguien
--    pise sin querer el peso de la mañana con el de la tarde.
--
--    Los rangos los controlan los check de la tabla. Arriba de 1000 (o de
--    100 en la grasa) el número ni entra en la columna, y PostgreSQL diría
--    «numeric field overflow»: se frena antes, con el mismo mensaje.
-- ------------------------------------------------------------
create or replace function public.anotar_medicion(
  p_empresa   uuid,
  p_cliente   uuid,
  p_fecha     date,
  p_datos     jsonb,
  p_consiente boolean default false,
  p_id        uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_medidas constant text[] := array['peso_kg', 'altura_cm', 'cintura_cm', 'cadera_cm', 'pecho_cm',
                                      'brazo_cm', 'muslo_cm', 'grasa_pct', 'pantorrilla_cm', 'cuello_cm'];
  v_orden   constant text[] := array['peso_kg', 'altura_cm', 'cintura_cm', 'cadera_cm', 'pecho_cm',
                                      'brazo_cm', 'muslo_cm', 'grasa_pct', 'grasa_metodo',
                                      'pantorrilla_cm', 'cuello_cm', 'nota'];
  v_hoy       date;
  v_fecha     date;
  v_clave     text;
  v_valor     jsonb;
  v_texto     text;
  v_num       numeric;
  v_limpio    jsonb := '{}'::jsonb;
  v_previa    public.mediciones;
  v_antes     jsonb;
  v_fila      jsonb;
  v_fusion    boolean := false;
  v_cambios   jsonb := '[]'::jsonb;
  v_consintio timestamptz;
  v_id        uuid;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(p_empresa) then
    raise exception 'Las medidas y el progreso son del dueño o de un administrador.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente and empresa_id = p_empresa) then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  -- El control que se edita, si es una edición.
  if p_id is not null then
    select * into v_previa from public.mediciones
    where id = p_id and empresa_id = p_empresa and cliente_id = p_cliente
    for update;
    if v_previa.id is null then
      raise exception 'Ese control no existe.' using errcode = 'P0002';
    end if;
  end if;

  v_hoy := public.hoy_empresa(p_empresa);
  -- Editar sin mandar la fecha no la mueve a hoy.
  v_fecha := coalesce(p_fecha, v_previa.fecha, v_hoy);
  if v_fecha > v_hoy then
    raise exception 'La fecha del control no puede ser futura.' using errcode = '22023';
  end if;
  if v_fecha < date '2000-01-01' then
    raise exception 'Esa fecha no es válida.' using errcode = '22023';
  end if;

  -- Solo las claves conocidas; lo demás se ignora. Un número puede venir
  -- con coma («72,5»), como lo escribe cualquiera.
  for v_clave, v_valor in
    select key, value from jsonb_each(case when jsonb_typeof(p_datos) = 'object' then p_datos else '{}'::jsonb end)
  loop
    if v_clave = any (v_medidas) then
      v_texto := btrim(v_valor #>> '{}');
      if v_texto is null or v_texto = '' then
        v_limpio := v_limpio || jsonb_build_object(v_clave, null);
      elsif v_texto ~ '^-?[0-9]+([.,][0-9]+)?$' then
        v_num := round(replace(v_texto, ',', '.')::numeric, 1);
        if abs(v_num) >= 1000 or (v_clave = 'grasa_pct' and abs(v_num) >= 100) then
          raise exception 'Ese valor está fuera de rango. Revisalo.' using errcode = '23514';
        end if;
        v_limpio := v_limpio || jsonb_build_object(v_clave, v_num);
      else
        raise exception 'Cada medida tiene que ser un número.' using errcode = '22023';
      end if;
    elsif v_clave = 'grasa_metodo' then
      v_limpio := v_limpio || jsonb_build_object(v_clave, nullif(btrim(coalesce(v_valor #>> '{}', '')), ''));
    elsif v_clave = 'nota' then
      v_limpio := v_limpio || jsonb_build_object(v_clave, left(coalesce(v_valor #>> '{}', ''), 300));
    end if;
  end loop;

  select consiente_medidas_at into v_consintio from public.fichas_entreno where cliente_id = p_cliente;
  if v_consintio is null and not coalesce(p_consiente, false) then
    raise exception 'Antes de anotar medidas, confirmá que el cliente está de acuerdo.' using errcode = '22023';
  end if;

  if p_id is not null then
    if v_fecha <> v_previa.fecha
       and exists (select 1 from public.mediciones
                   where cliente_id = p_cliente and fecha = v_fecha and id <> p_id) then
      raise exception 'Ya hay un control ese día: editá ese.' using errcode = '22023';
    end if;
  else
    select * into v_previa from public.mediciones
    where cliente_id = p_cliente and fecha = v_fecha
    for update;
    v_fusion := v_previa.id is not null;
  end if;

  v_antes := case when v_previa.id is null then '{}'::jsonb else to_jsonb(v_previa) end;
  v_fila  := v_antes || v_limpio;

  if not exists (select 1 from unnest(v_medidas) k where v_fila->>k is not null) then
    raise exception 'Anotá al menos una medida.' using errcode = '22023';
  end if;

  if (v_fila->>'grasa_pct' is null) <> (v_fila->>'grasa_metodo' is null) then
    raise exception 'La grasa corporal va con su método: balanza, plicómetro, cinta u otro.' using errcode = '22023';
  end if;

  if v_fusion then
    select coalesce(jsonb_agg(jsonb_build_object('campo', k, 'antes', v_antes->k, 'despues', v_limpio->k)
                              order by array_position(v_orden, k)), '[]'::jsonb)
    into v_cambios
    from jsonb_object_keys(v_limpio) k
    where coalesce(v_antes->k, 'null'::jsonb) <> 'null'::jsonb
      and not (k = 'nota' and v_antes->>k = '')
      and (v_antes->k) is distinct from (v_limpio->k);
  end if;

  if v_previa.id is null then
    insert into public.mediciones (
      empresa_id, cliente_id, fecha, peso_kg, altura_cm, cintura_cm, cadera_cm, pecho_cm, brazo_cm,
      muslo_cm, grasa_pct, grasa_metodo, pantorrilla_cm, cuello_cm, nota, creado_por)
    values (
      p_empresa, p_cliente, v_fecha,
      (v_fila->>'peso_kg')::numeric, (v_fila->>'altura_cm')::numeric, (v_fila->>'cintura_cm')::numeric,
      (v_fila->>'cadera_cm')::numeric, (v_fila->>'pecho_cm')::numeric, (v_fila->>'brazo_cm')::numeric,
      (v_fila->>'muslo_cm')::numeric, (v_fila->>'grasa_pct')::numeric, v_fila->>'grasa_metodo',
      (v_fila->>'pantorrilla_cm')::numeric, (v_fila->>'cuello_cm')::numeric,
      coalesce(v_fila->>'nota', ''), auth.uid())
    returning id into v_id;
  else
    update public.mediciones
    set fecha          = v_fecha,
        peso_kg        = (v_fila->>'peso_kg')::numeric,
        altura_cm      = (v_fila->>'altura_cm')::numeric,
        cintura_cm     = (v_fila->>'cintura_cm')::numeric,
        cadera_cm      = (v_fila->>'cadera_cm')::numeric,
        pecho_cm       = (v_fila->>'pecho_cm')::numeric,
        brazo_cm       = (v_fila->>'brazo_cm')::numeric,
        muslo_cm       = (v_fila->>'muslo_cm')::numeric,
        grasa_pct      = (v_fila->>'grasa_pct')::numeric,
        grasa_metodo   = v_fila->>'grasa_metodo',
        pantorrilla_cm = (v_fila->>'pantorrilla_cm')::numeric,
        cuello_cm      = (v_fila->>'cuello_cm')::numeric,
        nota           = coalesce(v_fila->>'nota', ''),
        updated_at     = now()
    where id = v_previa.id;
    v_id := v_previa.id;
  end if;

  -- El sí del cliente, la primera vez. Si ya estaba, se conserva el
  -- original: lo que importa es desde cuándo y quién lo registró.
  if coalesce(p_consiente, false) then
    insert into public.fichas_entreno (cliente_id, empresa_id, consiente_medidas_at, consiente_por, updated_at)
    values (p_cliente, p_empresa, now(), auth.uid(), now())
    on conflict (cliente_id) do update
      set consiente_medidas_at = coalesce(fichas_entreno.consiente_medidas_at, excluded.consiente_medidas_at),
          consiente_por = case when fichas_entreno.consiente_medidas_at is null
                               then excluded.consiente_por else fichas_entreno.consiente_por end,
          updated_at = now();
  end if;

  return jsonb_build_object('id', v_id, 'fusionada', v_fusion, 'cambios', v_cambios);
end $fn$;

revoke all on function public.anotar_medicion(uuid, uuid, date, jsonb, boolean, uuid) from public, anon;
grant execute on function public.anotar_medicion(uuid, uuid, date, jsonb, boolean, uuid) to authenticated;

create or replace function public.borrar_medicion(p_empresa uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(p_empresa) then
    raise exception 'Las medidas y el progreso son del dueño o de un administrador.' using errcode = '42501';
  end if;

  delete from public.mediciones where id = p_id and empresa_id = p_empresa;
  if not found then
    raise exception 'Ese control no existe.' using errcode = 'P0002';
  end if;
end $fn$;

revoke all on function public.borrar_medicion(uuid, uuid) from public, anon;
grant execute on function public.borrar_medicion(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 21. EL PROGRESO DE UNA PERSONA
--
--    Los números, en orden de fecha; los cálculos (IMC, cintura/altura,
--    diferencias) los hace src/lib/medidas.ts. Y cómo subieron las cargas,
--    ejercicio por ejercicio.
-- ------------------------------------------------------------
create or replace function public.progreso_de(p_empresa uuid, p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_cli public.clientes;
  v_res jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(p_empresa) then
    raise exception 'Las medidas y el progreso son del dueño o de un administrador.' using errcode = '42501';
  end if;

  select * into v_cli from public.clientes where id = p_cliente and empresa_id = p_empresa;
  if v_cli.id is null then
    raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'cliente', jsonb_build_object('id', v_cli.id, 'nombre', v_cli.nombre, 'telefono', v_cli.telefono),
    'consiente_medidas_at', (select f.consiente_medidas_at from public.fichas_entreno f
                             where f.cliente_id = p_cliente),
    'mediciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',             m.id,
        'fecha',          m.fecha,
        'peso_kg',        m.peso_kg,
        'altura_cm',      m.altura_cm,
        'cintura_cm',     m.cintura_cm,
        'cadera_cm',      m.cadera_cm,
        'pecho_cm',       m.pecho_cm,
        'brazo_cm',       m.brazo_cm,
        'muslo_cm',       m.muslo_cm,
        'grasa_pct',      m.grasa_pct,
        'grasa_metodo',   m.grasa_metodo,
        'pantorrilla_cm', m.pantorrilla_cm,
        'cuello_cm',      m.cuello_cm,
        'nota',           m.nota
      ) order by m.fecha)
      from public.mediciones m where m.cliente_id = p_cliente
    ), '[]'::jsonb),
    'rutina_vigente', (
      select jsonb_build_object('nombre', r.nombre, 'desde', r.desde)
      from public.rutinas r where r.cliente_id = p_cliente and r.estado = 'vigente'),
    'cargas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ejercicio_id', g.ejercicio_id,
        'nombre',       g.nombre,
        'cambios',      g.cambios
      ) order by g.clave, g.nombre)
      from (
        select e.id as ejercicio_id, e.nombre, e.clave,
               jsonb_agg(jsonb_build_object(
                 'fecha',         h.fecha,
                 'carga_antes',   h.carga_antes,
                 'carga_despues', h.carga_despues,
                 'reps_antes',    h.reps_antes,
                 'reps_despues',  h.reps_despues
               ) order by h.fecha, h.created_at) as cambios
        from public.cargas_historial h
        join public.ejercicios e on e.id = h.ejercicio_id
        where h.cliente_id = p_cliente
        group by e.id, e.nombre, e.clave
      ) g
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.progreso_de(uuid, uuid) from public, anon;
grant execute on function public.progreso_de(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 22. LA RUTINA DE CADA SESIÓN DE LA AGENDA
--
--    Aparte, y no dentro de `agenda_del_dia` o `panel_profe`: esas ya van
--    por su quinta copia, y cada copia es una oportunidad de perder algo.
--    La pantalla llama las dos y junta por id de reserva.
-- ------------------------------------------------------------
create or replace function public.rutinas_de_la_agenda(p_empresa uuid, p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona  text;
  v_fecha date;
  v_res   jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;
  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  select coalesce(jsonb_object_agg(r.id::text, jsonb_build_object('rutina_id', ru.id, 'nombre', ru.nombre)),
                  '{}'::jsonb)
  into v_res
  from public.turnos_reserva r
  join public.rutinas ru on ru.cliente_id = r.cliente_id and ru.empresa_id = r.empresa_id
                        and ru.estado = 'vigente'
  where r.empresa_id = p_empresa
    and r.estado <> 'cancelada'
    and (r.inicia at time zone v_zona)::date = v_fecha;

  return v_res;
end $fn$;

revoke all on function public.rutinas_de_la_agenda(uuid, date) from public, anon;
grant execute on function public.rutinas_de_la_agenda(uuid, date) to authenticated;

-- ------------------------------------------------------------
-- 23. ELIMINAR UN CLIENTE (058), AHORA CON SU HISTORIA DE ENTRENAMIENTO
--
--    Copia exacta de la 058 —la versión viva; su cuerpo, sin comentarios,
--    da la misma huella— con lo marcado (098). Misma firma: se reemplaza
--    sin crear otra al lado.
--
--    Quien tiene rutinas, medidas o cargas anotadas se ARCHIVA. Sin esto el
--    DELETE chocaría con las claves NO ACTION de esas tablas y la persona
--    leería el engañoso «Eso hace referencia a algo que ya no existe». El
--    link y la ficha caen en cascada solo cuando se borra de verdad; al
--    archivar, el link se apaga y cambia de token (ver abajo por qué).
-- ------------------------------------------------------------
create or replace function public.eliminar_cliente(p_cliente uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v       public.clientes;
  v_saldo numeric;
  v_debe  text;
begin
  select * into v from public.clientes where id = p_cliente;
  if v.id is null then
    raise exception 'Ese cliente ya no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(v.empresa_id) then
    raise exception 'Eliminar clientes es del dueño o de un administrador.' using errcode = '42501';
  end if;

  -- El mismo candado que al cobrar (056): mientras se decide, nadie le fía
  -- ni le cobra a este cliente.
  perform 1 from public.clientes where id = p_cliente for update;

  v_saldo := public.saldo_fiado(p_cliente);
  if v_saldo > 0 then
    -- «80.000» y no «80000.00»: esto lo lee una persona.
    v_debe := case when v_saldo = trunc(v_saldo)
                   then replace(to_char(v_saldo, 'FM999,999,999,990'), ',', '.')
                   else v_saldo::text end;
    raise exception '% todavía te debe %. Cobrale o borrá esa deuda desde Fiado, y después lo eliminás.',
      v.nombre, v_debe using errcode = '22023';
  end if;

  -- Sin nada atado se borra de verdad: no hay nada que conservar.
  if not exists (select 1 from public.fiado where cliente_id = p_cliente)
     and not exists (select 1 from public.movimientos where cliente_id = p_cliente)
     and not exists (select 1 from public.turnos_reserva where cliente_id = p_cliente)
     -- (098) Sus rutinas, sus medidas y cómo subieron sus cargas son su
     -- historia: con cualquiera de las tres, se archiva.
     and not exists (select 1 from public.rutinas where cliente_id = p_cliente)
     and not exists (select 1 from public.mediciones where cliente_id = p_cliente)
     and not exists (select 1 from public.cargas_historial where cliente_id = p_cliente) then
    delete from public.clientes where id = p_cliente;
    return 'borrado';
  end if;

  -- Con historia se archiva. La lista y el buscador ya dejan afuera a los
  -- archivados (052, 053); «lo que te deben» no, así que si alguna vez
  -- vuelve a deber algo, aparece ahí igual.
  update public.clientes set activo = false, updated_at = now() where id = p_cliente;

  -- (098) Su link se apaga y cambia de token. Apagado solo por estar
  -- archivado no alcanza: `guardar_cliente` (052) toma un teléfono repetido
  -- como la misma persona y reactiva la ficha, y con un teléfono compartido
  -- (madre e hijo, una pareja) el link que la otra persona tiene en su
  -- celular volvería a andar, a nombre de otra. Si vuelve la misma persona,
  -- el trainer prende el link y le manda el nuevo. `rutina_enlaces` no
  -- tiene el candado de cuenta vencida: esto anda siempre.
  update public.rutina_enlaces
  set activo = false, token = gen_random_uuid(), updated_at = now()
  where cliente_id = p_cliente;

  return 'archivado';
end $fn$;

revoke all on function public.eliminar_cliente(uuid) from public, anon;
grant execute on function public.eliminar_cliente(uuid) to authenticated;
