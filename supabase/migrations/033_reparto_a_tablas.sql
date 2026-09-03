-- ORDEN · Migración 033 · El reparto con los profesionales
--
-- El primer módulo de un rubro. Se llama «reparto» y no «barbería» a
-- propósito: el problema es el mismo en una peluquería, un centro de estética,
-- un consultorio con dos kinesiólogos o una escuela con profesores. El rubro
-- decide si el módulo se enciende y con qué palabras; el módulo no sabe de
-- rubros.
--
-- QUÉ RESUELVE
--
-- En una peluquería real la plata del corte casi nunca es toda del local ni
-- toda del profesional. Conviven cuatro arreglos:
--
--   · LOCAL     el dueño se corta a sí mismo. Todo es del local.
--   · COMISION  el barbero cobra 30.000 y el local se queda el 50%.
--   · ALQUILER  el barbero se queda con el 100% y le paga una mensualidad.
--   · SUELDO    el barbero cobra para el local, que le paga un sueldo aparte.
--
-- DÓNDE VA LA PARTE DEL PROFESIONAL
--
-- En `costo_total` de la venta. No es una analogía forzada: para un almacén
-- ese campo es lo que costó la mercadería, y acá es lo que costó el servicio.
-- En los dos casos es plata que entró por la venta y que el local NO se queda.
--
-- Eso hace que todo lo demás salga solo, sin escribir una fórmula nueva:
-- `ganancia_bruta = ventas − costo_mercaderia` pasa a ser, sin tocarla, lo
-- que de verdad le queda al dueño. El panel, los reportes y el Excel ya
-- calculan sobre esa resta. Y desde la migración 005 esos dos campos vuelven
-- en NULL para quien no es admin, así que un barbero no ve el margen del
-- local: eso ya estaba resuelto en la base y no hubo que construirlo.
--
-- EL ALQUILER ES EL QUE ROMPE ALGO
--
-- Si el barbero se queda con el 100%, esa plata NUNCA fue del local.
-- Registrarla como venta del negocio inflaría la facturación por el monto
-- entero: un local con tres sillas alquiladas mostraría cuatro veces la plata
-- que maneja. Por eso ese corte se registra en la atribución —queda el
-- historial de quién atendió a quién— pero no genera ningún movimiento. Lo
-- que el local factura es la mensualidad, que se carga como cualquier ingreso.
--
-- Es la regla de siempre un paso más allá: además de no mostrar plata que
-- todavía no está, tampoco mostrar plata que nunca fue tuya.

-- ============================================================
-- 1. LOS PROFESIONALES
--
--    `user_id` es opcional a propósito. Un barbero puede estar en la lista y
--    en el reparto sin tener cuenta en Orden: el dueño le carga los cortes.
--    Atarlo a un miembro obligaría a pagar una silla del plan por cada
--    persona que solo necesita aparecer en una lista, y el dueño terminaría
--    llevando a la mitad de su equipo en un cuaderno aparte.
-- ============================================================
create table if not exists public.turnos_profesional (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre     text not null check (char_length(trim(nombre)) between 1 and 60),
  -- Si tiene cuenta, es quien puede cargar sus propios cortes y ver lo suyo.
  user_id    uuid references auth.users (id) on delete set null,
  reparto    text not null default 'local'
             check (reparto in ('local', 'comision', 'alquiler', 'sueldo')),
  -- Qué porcentaje se lleva el PROFESIONAL. Solo tiene sentido con comisión.
  porcentaje numeric(5,2) check (porcentaje is null or (porcentaje > 0 and porcentaje <= 100)),
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Una comisión sin porcentaje es un reparto que nadie puede calcular, y el
  -- día que se intente cobrar un corte va a fallar en el peor momento.
  constraint comision_con_porcentaje
    check (reparto <> 'comision' or porcentaje is not null)
);

create index if not exists turnos_profesional_empresa_idx
  on public.turnos_profesional (empresa_id) where activo;

-- Una persona no puede estar dos veces en el mismo equipo.
create unique index if not exists turnos_profesional_una_cuenta
  on public.turnos_profesional (empresa_id, user_id) where user_id is not null;

-- ============================================================
-- 2. EL PRECIO DE CADA UNO
--
--    El mismo «Corte» vale 50.000 con el dueño, 35.000 con uno y 30.000 con
--    otro. Sin fila acá, vale el precio del catálogo del local.
-- ============================================================
create table if not exists public.turnos_precio (
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  profesional_id uuid not null references public.turnos_profesional (id) on delete cascade,
  producto_id    uuid not null references public.productos (id) on delete cascade,
  precio         numeric(14,2) not null check (precio >= 0),
  updated_at     timestamptz not null default now(),
  primary key (profesional_id, producto_id)
);

-- ============================================================
-- 3. DE QUIÉN FUE CADA CORTE
--
--    Tabla propia y no una columna en `movimientos` a propósito. Si cada
--    módulo le agrega la suya, dentro de cuatro rubros la tabla más
--    importante del sistema tiene cuarenta columnas de las que treinta están
--    siempre vacías.
--
--    `movimiento_id` es NULO cuando el reparto es alquiler: ahí hubo un corte
--    y hay que dejar constancia, pero no hubo una venta del local.
--
--    Las dos partes se guardan CONGELADAS, igual que el costo de un producto
--    en el momento de la venta: si el mes que viene cambia el porcentaje, los
--    cortes viejos siguen diciendo lo que se repartió ese día.
-- ============================================================
create table if not exists public.turnos_atribucion (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas (id) on delete cascade,
  profesional_id    uuid not null references public.turnos_profesional (id) on delete restrict,
  movimiento_id     uuid references public.movimientos (id) on delete cascade,
  producto_id       uuid references public.productos (id) on delete set null,
  servicio          text not null default '',
  fecha             date not null,
  monto_cobrado     numeric(14,2) not null check (monto_cobrado >= 0),
  parte_profesional numeric(14,2) not null check (parte_profesional >= 0),
  parte_local       numeric(14,2) not null,
  reparto           text not null,
  creado_por        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),

  -- Las dos partes tienen que sumar exactamente lo cobrado. Sin esto, un
  -- redondeo mal hecho hace aparecer o desaparecer plata, y el desglose del
  -- panel deja de cerrar con el total.
  constraint partes_suman_el_total
    check (parte_profesional + parte_local = monto_cobrado)
);

create index if not exists turnos_atribucion_empresa_idx
  on public.turnos_atribucion (empresa_id, fecha desc);
create index if not exists turnos_atribucion_profesional_idx
  on public.turnos_atribucion (profesional_id, fecha desc);
create unique index if not exists turnos_atribucion_un_movimiento
  on public.turnos_atribucion (movimiento_id) where movimiento_id is not null;

-- ============================================================
-- 4. PERMISOS
--
--    `turnos_atribucion` se lee SOLO con es_admin, y no es un detalle: la
--    columna `parte_local` es el margen del dueño. Un barbero que la viera
--    sabría cuánto gana el local con cada corte suyo — y con los de sus
--    compañeros. Lo suyo lo lee por una función que le devuelve solo su parte.
--
--    Es la misma división que ya existe: un vendedor carga ventas, pero
--    costo_mercaderia y ganancia_bruta le vuelven vacías desde la 005.
-- ============================================================
alter table public.turnos_profesional enable row level security;
alter table public.turnos_precio      enable row level security;
alter table public.turnos_atribucion  enable row level security;

drop policy if exists turnos_profesional_select on public.turnos_profesional;
create policy turnos_profesional_select on public.turnos_profesional
  for select to authenticated using (public.es_miembro(empresa_id));

drop policy if exists turnos_precio_select on public.turnos_precio;
create policy turnos_precio_select on public.turnos_precio
  for select to authenticated using (public.es_miembro(empresa_id));

drop policy if exists turnos_atribucion_select on public.turnos_atribucion;
create policy turnos_atribucion_select on public.turnos_atribucion
  for select to authenticated using (public.es_admin(empresa_id));

revoke all on public.turnos_profesional from anon, authenticated;
revoke all on public.turnos_precio      from anon, authenticated;
revoke all on public.turnos_atribucion  from anon, authenticated;

grant select on public.turnos_profesional to authenticated;
grant select on public.turnos_precio      to authenticated;
grant select on public.turnos_atribucion  to authenticated;

-- La cuenta vencida queda en solo lectura, igual que todo lo demás.
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['turnos_profesional', 'turnos_precio', 'turnos_atribucion'] loop
    execute format('drop trigger if exists %I on public.%I',
                   'cuenta_activa_' || v_tabla, v_tabla);
    execute format(
      'create trigger %I before insert or update on public.%I '
      || 'for each row execute function public.exigir_cuenta_activa()',
      'cuenta_activa_' || v_tabla, v_tabla);
  end loop;
end $$;

-- ============================================================
-- 5. CUÁNTOS DECIMALES TIENE UNA MONEDA
--
--    El guaraní no tiene centavos. Repartir 33.333 al 50% sin saberlo deja
--    medio guaraní colgando, y medio guaraní que no existe es exactamente el
--    tipo de número que hace que alguien deje de creerle al sistema.
-- ============================================================
create or replace function public.decimales_de(p_moneda text)
returns integer language sql immutable set search_path = public as $fn$
  select case upper(coalesce(p_moneda, 'PYG')) when 'PYG' then 0 else 2 end;
$fn$;

grant execute on function public.decimales_de(text) to anon, authenticated;
