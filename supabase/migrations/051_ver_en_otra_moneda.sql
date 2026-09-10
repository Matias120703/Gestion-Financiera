-- ============================================================
-- ORDEN · Migración 051 · Ver en otra moneda
--
-- LO QUE HAY HOY ESTÁ MAL, Y ES PEOR QUE QUE FALTE
--
-- En Ajustes se puede cambiar la moneda del negocio, y NO CONVIERTE NADA:
-- solo cambia la etiqueta. Quien pasa de guaraníes a dólares ve sus
-- 5.000.000 de ventas convertidos en «US$ 5.000.000». El panel, los reportes
-- y el Excel pasan a mentir, sin un aviso, sin un error, y con los mismos
-- números de siempre — que es lo que lo hace difícil de notar.
--
-- LA DIFERENCIA ENTRE LAS DOS COSAS
--
-- Hay dos preguntas distintas que se estaban contestando con un solo campo:
--
--   `moneda`        → en qué moneda cargás. Es la moneda de tus datos.
--                     Cada importe guardado está en ESTA y en ninguna otra.
--   `moneda_vista`  → en qué moneda querés MIRARLOS ahora.
--
-- La primera se elige al abrir la cuenta y no se cambia más. La segunda se
-- cambia cuando se quiera, no toca un solo dato guardado, y se puede volver
-- atrás sin consecuencias.
--
-- POR QUÉ LA COTIZACIÓN LA PONE EL NEGOCIO
--
-- Porque no hay «el» cambio: hay el del banco, el de la casa de cambio de la
-- esquina y el que le hizo su proveedor. Traerlo de una API sería inventar
-- una precisión que no tenemos y, peor, cambiaría los números de ayer sin
-- que nadie toque nada. El dueño escribe el suyo y sabe de dónde salió.
--
-- Y POR QUÉ SE GUARDA LA FECHA
--
-- Porque una cotización de hace tres meses mostrada como número de hoy es
-- otra forma de mentir. La pantalla dice «al cambio 7.300, cargado el 5/9»:
-- el que lo lee decide si le sirve.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LOS TRES CAMPOS
--
--    `cotizacion` es CUÁNTO VALE UNA UNIDAD DE `moneda_vista` EN `moneda`.
--    Con moneda = PYG y vista = USD, es «a cuánto está el dólar»: 7300.
--    Se guarda en esa dirección y no al revés porque es la que la persona
--    dice en voz alta, y la que va a escribir sin pensarlo dos veces.
--
--    Para convertir: importe_a_la_vista = importe_guardado / cotizacion.
-- ------------------------------------------------------------
alter table public.empresas
  add column if not exists moneda_vista  text,
  add column if not exists cotizacion    numeric(18,6),
  add column if not exists cotizacion_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vista_moneda_conocida') then
    alter table public.empresas add constraint vista_moneda_conocida
      check (moneda_vista is null or moneda_vista in ('PYG', 'USD', 'ARS', 'BRL', 'EUR'));
  end if;

  -- Una vista sin cotización no se puede calcular, y una cotización en cero
  -- o negativa daría importes infinitos o con el signo cambiado. Las dos
  -- cosas van juntas o no va ninguna.
  if not exists (select 1 from pg_constraint where conname = 'vista_con_cotizacion') then
    alter table public.empresas add constraint vista_con_cotizacion
      check (
        (moneda_vista is null and cotizacion is null)
        or (moneda_vista is not null and cotizacion is not null and cotizacion > 0)
      );
  end if;
end $$;

comment on column public.empresas.moneda_vista is
  'Solo para MIRAR. Los importes se guardan siempre en `moneda`. NULL = se ve en la moneda propia.';
comment on column public.empresas.cotizacion is
  'Cuánto vale 1 unidad de `moneda_vista` en `moneda`. Con PYG y USD: a cuánto está el dólar.';

-- ------------------------------------------------------------
-- 2. LA MONEDA DE LOS DATOS NO SE TOCA DESPUÉS
--
--    Este es el arreglo del error de hoy. Cambiar `moneda` con movimientos
--    cargados no convierte nada: reetiqueta el historial entero y lo vuelve
--    falso.
--
--    No se prohíbe siempre, y eso importa: quien se equivocó al abrir la
--    cuenta y todavía no cargó nada tiene que poder corregirlo. Lo que no se
--    puede es reetiquetar plata que ya existe.
--
--    Va como trigger y no como política de RLS porque una política mira la
--    fila, no lo que cambió en ella. Esto necesita comparar el antes con el
--    después.
-- ------------------------------------------------------------
create or replace function public.moneda_no_se_reetiqueta()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.moneda is distinct from old.moneda
     and exists (select 1 from public.movimientos m where m.empresa_id = old.id) then
    raise exception
      'Ya tenés movimientos cargados en %, así que la moneda del negocio no se puede cambiar: se reetiquetaría todo tu historial sin convertirlo. Si querés ver tus números en otra moneda, usá «Ver en» y poné la cotización.',
      old.moneda
      using errcode = '22023';
  end if;

  -- Si se cambia la moneda de los datos, una vista vieja deja de tener
  -- sentido: la cotización que había era contra la moneda anterior.
  if new.moneda is distinct from old.moneda then
    new.moneda_vista  := null;
    new.cotizacion    := null;
    new.cotizacion_at := null;
  end if;

  -- Ver en la misma moneda que se carga no es una vista: es no tener
  -- ninguna. Se normaliza acá para que no haya dos maneras de decir lo mismo
  -- y una pantalla muestre «al cambio 1,00».
  if new.moneda_vista = new.moneda then
    new.moneda_vista  := null;
    new.cotizacion    := null;
    new.cotizacion_at := null;
  end if;

  return new;
end $fn$;

drop trigger if exists moneda_no_se_reetiqueta on public.empresas;
create trigger moneda_no_se_reetiqueta
  before update on public.empresas
  for each row execute function public.moneda_no_se_reetiqueta();

-- Una función de trigger no la llama nadie a mano: la dispara PostgreSQL.
-- Por defecto queda ejecutable por todos, y como es `security definer` eso
-- la deja abierta a `anon` sin ninguna razón. La prueba de permisos tiene un
-- control que lista cuáles pueden estarlo y frenó esto — es la segunda vez
-- esta semana que ataja un `security definer` puesto por costumbre.
--
-- Revocar no rompe el trigger: el permiso se comprueba al CREAR el trigger,
-- no cada vez que se dispara.
revoke all on function public.moneda_no_se_reetiqueta() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. GUARDAR LA VISTA
--
--    Por función y no por UPDATE directo porque hay que escribir la fecha, y
--    la fecha es la mitad del dato: sin ella, la pantalla no puede decir de
--    cuándo es el cambio que está usando.
--
--    `p_moneda` en null apaga la vista y vuelve a la moneda propia.
-- ------------------------------------------------------------
create or replace function public.guardar_vista_moneda(
  p_empresa    uuid,
  p_moneda     text default null,
  p_cotizacion numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_propia text;
  v_moneda text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el propietario o un administrador puede cambiar esto.' using errcode = '42501';
  end if;

  select moneda into v_propia from public.empresas where id = p_empresa;
  if v_propia is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  v_moneda := nullif(upper(trim(coalesce(p_moneda, ''))), '');

  -- Apagar la vista: se vuelve a ver en la moneda propia.
  if v_moneda is null or v_moneda = v_propia then
    update public.empresas
    set moneda_vista = null, cotizacion = null, cotizacion_at = null
    where id = p_empresa;
    return jsonb_build_object('moneda_vista', null, 'cotizacion', null);
  end if;

  if v_moneda not in ('PYG', 'USD', 'ARS', 'BRL', 'EUR') then
    raise exception 'No conocemos esa moneda.' using errcode = '22023';
  end if;

  if p_cotizacion is null or p_cotizacion <= 0 then
    raise exception 'Poné a cuánto está el cambio: sin eso no se puede convertir nada.'
      using errcode = '22023';
  end if;

  -- Un tope alto y no una validación fina. No sabemos cuánto vale una moneda
  -- mañana; lo único que se puede afirmar es que un dedazo de más ceros no
  -- es un tipo de cambio.
  if p_cotizacion > 100000000 then
    raise exception 'Esa cotización es demasiado grande. Revisá los ceros.' using errcode = '22023';
  end if;

  update public.empresas
  set moneda_vista = v_moneda, cotizacion = p_cotizacion, cotizacion_at = now()
  where id = p_empresa;

  return jsonb_build_object(
    'moneda_vista', v_moneda,
    'cotizacion', p_cotizacion,
    'desde', v_propia
  );
end $fn$;

revoke all on function public.guardar_vista_moneda(uuid, text, numeric) from public, anon;
grant execute on function public.guardar_vista_moneda(uuid, text, numeric) to authenticated;
