-- ============================================================
-- 131 · LA BILLETERA EN OTRAS MONEDAS
-- ============================================================
--
-- Matías (07/10/2026): «Tengo una cuenta bancaria en dólares con 10 mil
-- dólares: ¿cómo la guardo en mi billetera, si solo me aparece la opción de
-- cargar en guaraníes? También en reales.» Nombró una tarjeta y Binance.
--
-- Hasta acá una cuenta de la billetera no tenía moneda: su saldo se leía en
-- la del negocio. Diez mil dólares cargados así eran «Gs. 10.000» y se
-- sumaban a los guaraníes de la caja. Desde acá cada cuenta puede decir en
-- qué moneda está.
--
-- LO QUE SE DECIDIÓ PARA ESTA PRIMERA VERSIÓN (08/10/2026)
--
-- El encargo de construcción da estas decisiones por confirmadas por Matías
-- («sí a todo»). ANTES DE APLICAR ESTA MIGRACIÓN EN PRODUCCIÓN, QUE CONSTE
-- DE ÉL: acá no se aplicó nada.
--
--   1. Con una cuenta en otra moneda se puede GUARDAR plata, PASARLA a otra
--      cuenta (con dos importes: cuánto salió y cuánto entró) y pagar GASTOS
--      o anotar OTROS INGRESOS. Vender, Fiado, Deudas, Reparto, Agenda,
--      Alumnos y la liquidación del silo no la ofrecen todavía, y la base la
--      rechaza con un mensaje claro si alguien arma el pedido a mano.
--   2. La cotización la escribe la persona, con su fecha. Orden no la baja
--      de internet. Sirve solo para un renglón «≈ todo junto» que arma la
--      pantalla: no entra en ningún saldo, movimiento ni reporte.
--   3. El patrimonio (auto, terreno) es otra entrega y no está acá.
--
-- LAS REGLAS QUE CUIDA LA BASE
--
--   I1. Una cuenta en otra moneda no reclama formas de pago: nada cae solo
--       en ella (un CHECK, y `guardar_cuenta_dinero`).
--   I2. `movimientos.monto_cuenta` (cuánto se movió LA CUENTA, en su moneda)
--       está escrito si y solo si el movimiento vive en una cuenta en otra
--       moneda. `monto` sigue siempre en la moneda del negocio: la ganancia,
--       el cierre, los reportes y el Excel no cambian.
--   I3. Ningún préstamo del fiado cae en una cuenta en otra moneda.
--   I4. La moneda de una cuenta se elige al crearla y no cambia.
--   I5. NUNCA SE SUMAN MONEDAS DISTINTAS. Lo exacto va por moneda.
--   I6. La base NUNCA CONVIERTE SOLA: una cuenta en otra moneda sin su
--       importe es un error, no un número inventado.
--
--   «Propia» = `cuentas_dinero.moneda is null` (la del negocio).
--   «En otra moneda» = `moneda is not null`. Es simétrico: un negocio en
--   dólares con una caja en guaraníes es el mismo caso.
--
-- SE APLICA ANTES QUE EL CÓDIGO, Y CON EL CÓDIGO PUBLICADO NO CAMBIA NADA
-- PARA NADIE
--
--   · Ninguna fila existente se toca. Las dos columnas nuevas nacen en null
--     y la tabla nueva, vacía.
--   · Para una cuenta propia (hoy, todas) el saldo sale de la MISMA cuenta
--     de siempre, y el disparador de los movimientos hace lo mismo que
--     hacía: lo nuevo es un bloque al final que, con una cuenta propia, solo
--     deja `monto_cuenta` en null.
--   · Las claves que ya devolvían `billetera()`, `cuentas_para_elegir()` y
--     `resumen_personal()` siguen devolviendo SOLO las cuentas en la moneda
--     del negocio: lo nuevo viaja en claves y parámetros nuevos. Un celular
--     con la versión vieja nunca ve «Gs. 10.000» por una cuenta de
--     US$ 10.000, ni la ofrece para cobrar.
--   · Las tres funciones que ganan un parámetro lo llevan al final y con
--     valor por defecto: la llamada de siempre resuelve igual. Hay una sola
--     función por nombre (la firma vieja se borra antes de crear la nueva,
--     como en la 086).
--   · Mientras no se publique el código nuevo nadie puede crear una cuenta
--     en otra moneda (la pantalla publicada no manda `p_moneda`).
--
--   pruebas/billetera-monedas.test.js lo demuestra con dos bases gemelas:
--   una se queda en la 130 y a la otra se le aplica esta; cargadas igual,
--   todo lo que lee el código publicado da lo mismo, carácter por carácter.
--
-- CÓMO ESTÁ ESCRITA
--
--   Cada función que se vuelve a definir es una COPIA de su última
--   definición (074, 085, 086, 118 o 051) con lo nuevo marcado «(131)»,
--   línea por línea. La prueba lo comprueba: sin las líneas marcadas queda
--   la función anterior. Sin barras invertidas (el MCP las duplica) y se
--   puede aplicar las veces que haga falta.
--
--   DESPUÉS DE ESTA NO SE VUELVE A APLICAR 074, 075, 083, 085, 086 NI 118:
--   volverían a crear las firmas viejas al lado de las nuevas, o pisarían
--   estas funciones con su versión anterior. (Volver a aplicar esta misma
--   después lo arregla.)
-- ============================================================

-- ------------------------------------------------------------
-- 0. LA GUARDA: sin la billetera (074 a 118) y sin los candados (110, 127)
--    esta migración no tiene sobre qué pararse.
-- ------------------------------------------------------------
do $guarda$
begin
  if to_regclass('public.cuentas_dinero') is null
     or to_regclass('public.ajustes_cuenta') is null
     or to_regprocedure('public.resumen_personal_por_ciclo(uuid)') is null
     or to_regprocedure('public.cuenta_de_metodo(uuid, text)') is null
     or to_regprocedure('public.es_gratis_personal(uuid)') is null
     or to_regprocedure('public.exigir_cuenta_activa()') is null
     or to_regprocedure('public.decimales_de(text)') is null then
    raise exception 'Falta aplicar las migraciones de la billetera y de los candados (074 a 127) antes que la 131.';
  end if;
end $guarda$;

-- ------------------------------------------------------------
-- 1. LA MONEDA DE CADA CUENTA
--
--    null = la del negocio (la misma regla que `ahorros.moneda`, 073). Así
--    ninguna cuenta existente cambia: todas quedan en null, que es lo que
--    eran. Y si un negocio sin movimientos corrige su moneda (051), sus
--    cuentas propias lo siguen solas.
--
--    Una cuenta en otra moneda no puede reclamar formas de pago: un cobro
--    «por transferencia» es un importe en la moneda del negocio y no puede
--    caer solo en una cuenta que cuenta dólares.
-- ------------------------------------------------------------
alter table public.cuentas_dinero add column if not exists moneda text;

do $mon$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'cuentas_dinero_moneda_conocida'
                   and conrelid = 'public.cuentas_dinero'::regclass) then
    alter table public.cuentas_dinero add constraint cuentas_dinero_moneda_conocida
      check (moneda is null or moneda in ('PYG', 'USD', 'ARS', 'BRL', 'EUR'));
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'cuentas_dinero_otra_moneda_sin_formas'
                   and conrelid = 'public.cuentas_dinero'::regclass) then
    alter table public.cuentas_dinero add constraint cuentas_dinero_otra_moneda_sin_formas
      check (moneda is null or cardinality(metodos) = 0);
  end if;
end $mon$;

comment on column public.cuentas_dinero.moneda is
  'En qué moneda está la cuenta. Null: la del negocio. Se elige al crearla y no cambia (131).';

-- ------------------------------------------------------------
-- 2. CUÁNTO SE MOVIÓ LA CUENTA, EN SU MONEDA
--
--    Un gasto de Gs. 116.727 pagado con la tarjeta en dólares sacó
--    US$ 15,99 de esa cuenta. `monto` sigue diciendo 116.727 (la moneda del
--    negocio, como siempre) y `monto_cuenta` dice 15,99. Los dos los
--    escribe la persona: el cambio de esa operación es la división de los
--    dos, y no hay un tercer número que los contradiga.
--
--    Null siempre que la cuenta sea propia o no haya cuenta (lo cuida el
--    disparador de más abajo).
--
--    El select de `movimientos` es columna por columna (003, 100): columna
--    nueva, grant nuevo. Sin él, a quien pida todas las columnas la base le
--    contestaría que no tiene permiso. El insert ya está abierto por tabla
--    (003): Gastos puede mandar `monto_cuenta`.
-- ------------------------------------------------------------
alter table public.movimientos
  add column if not exists monto_cuenta numeric(14,2) check (monto_cuenta is null or monto_cuenta > 0);

grant select (monto_cuenta) on public.movimientos to authenticated;

comment on column public.movimientos.monto_cuenta is
  'Cuánto entró o salió de la cuenta, en la moneda de la cuenta. Solo en cuentas en otra moneda; null en las demás (131).';

-- ------------------------------------------------------------
-- 3. UNA COTIZACIÓN POR MONEDA, QUE ESCRIBE LA PERSONA
--
--    `valor` es cuánto vale 1 de `moneda` en la moneda del negocio: la
--    misma dirección que `empresas.cotizacion` (051) y `movimientos.cambio`
--    (100). Negocio en guaraníes, moneda USD: 7400. Negocio en dólares,
--    moneda PYG: 0.0001351351 (1 / 7400).
--
--    No entra en ningún saldo: cambiarla mañana no mueve nada guardado.
--
--    Nace cerrada para el negocio vencido y para la personal en Gratis: es
--    el mismo candado de toda la billetera (110, 111).
-- ------------------------------------------------------------
create table if not exists public.cotizaciones_moneda (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  moneda     text not null check (moneda in ('PYG', 'USD', 'ARS', 'BRL', 'EUR')),
  valor      numeric(24,10) not null check (valor > 0),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, moneda)
);

alter table public.cotizaciones_moneda enable row level security;
revoke all on public.cotizaciones_moneda from anon, authenticated;

drop trigger if exists cuenta_activa_cotizaciones_moneda on public.cotizaciones_moneda;
create trigger cuenta_activa_cotizaciones_moneda
  before insert or update on public.cotizaciones_moneda
  for each row execute function public.exigir_cuenta_activa();

-- ------------------------------------------------------------
-- 4. EL SALDO (074)
--
--    COPIA de la 074 con una sola línea cambiada: la que suma los
--    movimientos. Para una cuenta propia es la cuenta de siempre, con
--    `monto`. Para una en otra moneda suma `monto_cuenta`, y NUNCA `monto`:
--    eso sería sumar guaraníes a una cuenta que cuenta dólares.
-- ------------------------------------------------------------
create or replace function public.saldo_cuenta_dinero(p_cuenta uuid)
returns numeric language sql stable security definer set search_path = public as $fn$
  select c.saldo_inicial
       + coalesce((select sum(case when c.moneda is not null                                               -- (131) en otra moneda: lo que se movió la cuenta
                              then (case when m.tipo = 'gasto' then -1 else 1 end) * coalesce(m.monto_cuenta, 0)  -- (131)
                              when m.tipo = 'gasto' then -m.monto else m.monto end)                        -- (131) propia: la cuenta de siempre
                   from public.movimientos m
                   where m.cuenta_id = c.id and m.empresa_id = c.empresa_id and m.estado = 'activo'), 0)
       + coalesce((select sum(a.monto) from public.ajustes_cuenta a where a.cuenta_id = c.id), 0)
  from public.cuentas_dinero c
  where c.id = p_cuenta;
$fn$;

revoke all on function public.saldo_cuenta_dinero(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. CADA MOVIMIENTO, EN SU CUENTA (074, 118)
--
--    COPIA EXACTA de la 118: ni una línea reemplazada. Lo nuevo es una
--    variable y un bloque al final, antes del `return new` de siempre.
--
--    Con una cuenta propia o sin cuenta, el bloque deja `monto_cuenta` en
--    null y sale: es lo que pasa hoy con todos los movimientos de todos.
--
--    Con una cuenta en otra moneda exige el importe. Así, sin tocar ninguna
--    otra función, toda puerta que reciba una cuenta en otra moneda y no
--    sepa decir cuánto se movió (registrar_venta, registrar_pago_deuda,
--    pagar_profesional, registrar_servicio, atender_reserva, vender_paquete,
--    cobrar_inscripcion, inscribir_alumno, registrar_liquidacion,
--    traer_ingreso_de_trabajo, asignar_cuenta_a_sueltos) falla entera, con
--    el mensaje, y no queda nada a medias.
--
--    Anular no vuelve a validar: la cuenta recupera exactamente lo que se
--    había movido, no lo que daría la cotización de hoy.
-- ------------------------------------------------------------
create or replace function public.anotar_en_su_cuenta()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_moneda text;  -- (131) la moneda de la cuenta: null si es la del negocio
begin
  if tg_op = 'UPDATE' and new.metodo_pago is distinct from old.metodo_pago then
    -- Si se corrige la forma de pago, el movimiento se muda de cuenta.
    new.cuenta_id := public.cuenta_de_metodo(new.empresa_id, new.metodo_pago);
  elsif tg_op = 'UPDATE' and new.cuenta_id is distinct from old.cuenta_id
        and new.cuenta_id is not null
        and not exists (select 1 from public.cuentas_dinero c
                        where c.id = new.cuenta_id and c.empresa_id = new.empresa_id) then
    new.cuenta_id := old.cuenta_id;
  elsif tg_op = 'INSERT' then
    -- Una cuenta de OTRO negocio no se acepta aunque alguien arme el pedido a
    -- mano: sería meterle plata en el saldo de un desconocido. Una ARCHIVADA
    -- tampoco (118): la billetera no la muestra y la plata se perdía de vista.
    if new.cuenta_id is not null
       and not exists (select 1 from public.cuentas_dinero c
                       where c.id = new.cuenta_id and c.empresa_id = new.empresa_id and c.activa) then
      new.cuenta_id := null;
    end if;
    if new.cuenta_id is null then
      new.cuenta_id := public.cuenta_de_metodo(new.empresa_id, new.metodo_pago);
    end if;
  end if;
  -- (131) CUÁNTO SE MOVIÓ LA CUENTA, EN SU MONEDA. Sin cuenta no hay nada que anotar.
  if new.cuenta_id is null then                                             -- (131)
    new.monto_cuenta := null;                                               -- (131)
    return new;                                                             -- (131)
  end if;                                                                   -- (131)
  -- (131) Anular, cambiar el lote, completar la descripción: no tocan la
  -- (131) cuenta ni lo que se movió en ella. No se vuelve a validar nada.
  if tg_op = 'UPDATE'                                                       -- (131)
     and new.cuenta_id is not distinct from old.cuenta_id                   -- (131)
     and new.monto_cuenta is not distinct from old.monto_cuenta             -- (131)
     and new.monto is not distinct from old.monto then                      -- (131)
    return new;                                                             -- (131)
  end if;                                                                   -- (131)
  select c.moneda into v_moneda from public.cuentas_dinero c where c.id = new.cuenta_id;  -- (131)
  -- (131) Una cuenta propia: lo de siempre. Es el camino de todos los
  -- (131) movimientos que existían antes de esta migración.
  if v_moneda is null then                                                  -- (131)
    new.monto_cuenta := null;                                               -- (131)
    return new;                                                             -- (131)
  end if;                                                                   -- (131)
  -- (131) Desde acá, una cuenta en otra moneda. En el plan Gratis nadie
  -- (131) elige cuenta: si alguien arma el pedido a mano, el gasto cae
  -- (131) por su forma de pago, como todos los suyos (110).
  if tg_op = 'INSERT' and public.es_gratis_personal(new.empresa_id) then    -- (131)
    new.cuenta_id := public.cuenta_de_metodo(new.empresa_id, new.metodo_pago);  -- (131)
    new.monto_cuenta := null;                                               -- (131)
    return new;                                                             -- (131)
  end if;                                                                   -- (131)
  -- (131) Solo quien administra: a los demás la pantalla no les muestra
  -- (131) las cuentas. Sin sesión (el sistema) pasa.
  if auth.uid() is not null and not public.es_admin(new.empresa_id) then    -- (131)
    raise exception 'Solo quien administra puede usar una cuenta en otra moneda.' using errcode = '42501';  -- (131)
  end if;                                                                   -- (131)
  -- (131) La base no convierte sola: el importe lo escribe la persona.
  new.monto_cuenta := round(coalesce(new.monto_cuenta, 0), public.decimales_de(v_moneda));  -- (131)
  if new.monto_cuenta <= 0 then                                             -- (131)
    raise exception 'Esa cuenta está en otra moneda: falta cuánto entró o salió en ella.' using errcode = '22023';  -- (131)
  end if;                                                                   -- (131)
  return new;
end $fn$;

revoke all on function public.anotar_en_su_cuenta() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 6. CREAR O EDITAR UNA CUENTA (074, 086)
--
--    COPIA de la 086 con `p_moneda` al final. La firma de siete se borra
--    antes: `create or replace` con un parámetro más no reemplaza, crea una
--    segunda función al lado y la llamada de siempre se vuelve ambigua
--    (086). Por nombre o por posición, las llamadas de hoy resuelven igual.
--
--    · `p_moneda` vacía o igual a la del negocio: cuenta propia, la de
--      siempre (se guarda null).
--    · Crear en otra moneda: sin formas de pago (se ignoran las que
--      vengan) y con el saldo redondeado a los decimales de ESA moneda.
--    · Editar nunca cambia la moneda. Si llega una distinta de la guardada,
--      se dice; si no llega, queda la que tiene.
--
--    Para que la copia quede letra por letra, la cuenta se inserta como
--    siempre y la moneda se le escribe en el paso siguiente, en la misma
--    transacción: para una cuenta propia ese paso no existe.
-- ------------------------------------------------------------
drop function if exists public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid, text);

create or replace function public.guardar_cuenta_dinero(
  p_empresa       uuid,
  p_nombre        text,
  p_tipo          text default 'banco',
  p_saldo_inicial numeric default 0,
  p_metodos       text[] default '{}',
  p_id            uuid default null,
  p_color         text default null
  , p_moneda      text default null  -- (131) null o la del negocio: cuenta propia
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id      uuid;
  v_metodos text[];
  v_color   text;
  v_propia   text;     -- (131) la moneda del negocio
  v_moneda   text;     -- (131) la de la cuenta: null = la del negocio
  v_dijo     boolean;  -- (131) ¿llegó una moneda escrita?
  v_guardada text;     -- (131) al editar: la que ya tiene
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre: el del banco, «Efectivo», «Tigo Money».' using errcode = '22023';
  end if;

  if coalesce(p_tipo, '') not in ('banco', 'efectivo', 'billetera') then
    raise exception 'Ese tipo de cuenta no existe.' using errcode = '22023';
  end if;

  -- Un color que no conocemos no es motivo para no guardar la cuenta: se
  -- deja en null y la pantalla elige. Lo que se pierde es una preferencia;
  -- lo que se salvaría rechazando, nada.
  v_color := case
    when p_color in ('verde', 'rojo', 'azul', 'celeste', 'naranja', 'violeta', 'rosa', 'gris')
    then p_color else null end;

  select coalesce(array_agg(distinct m), '{}') into v_metodos
  from unnest(coalesce(p_metodos, '{}')) m
  where m in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro');
  -- (131) LA MONEDA DE LA CUENTA. La del negocio se guarda como null.
  select e.moneda into v_propia from public.empresas e where e.id = p_empresa;                 -- (131)
  v_moneda := nullif(upper(trim(coalesce(p_moneda, ''))), '');                                  -- (131)
  v_dijo := v_moneda is not null;                                                               -- (131)
  if v_dijo and v_moneda not in ('PYG', 'USD', 'ARS', 'BRL', 'EUR') then                        -- (131)
    raise exception 'No conocemos esa moneda.' using errcode = '22023';                         -- (131)
  end if;                                                                                       -- (131)
  if v_moneda = v_propia then                                                                   -- (131)
    v_moneda := null;                                                                           -- (131)
  end if;                                                                                       -- (131)
  -- (131) Al editar manda la que ya tiene: la moneda no se cambia.
  if p_id is not null then                                                                      -- (131)
    select c.moneda into v_guardada from public.cuentas_dinero c                                -- (131)
    where c.id = p_id and c.empresa_id = p_empresa and c.activa;                                -- (131)
    if found and v_dijo and v_moneda is distinct from v_guardada then                           -- (131)
      raise exception 'La moneda de una cuenta no se cambia. Creá otra cuenta.' using errcode = '22023';  -- (131)
    end if;                                                                                     -- (131)
    v_moneda := v_guardada;                                                                     -- (131)
  end if;                                                                                       -- (131)
  -- (131) En otra moneda no reclama formas de pago: nada cae solo en ella.
  if v_moneda is not null then                                                                  -- (131)
    v_metodos := '{}';                                                                          -- (131)
  end if;                                                                                       -- (131)

  if p_id is null then
    if (select count(*) from public.cuentas_dinero where empresa_id = p_empresa and activa) >= 20 then
      raise exception 'Ya tenés 20 cuentas. Archivá alguna antes de sumar otra.' using errcode = '22023';
    end if;

    insert into public.cuentas_dinero (empresa_id, nombre, tipo, saldo_inicial, metodos, color, orden, creada_por)
    values (p_empresa, trim(p_nombre), p_tipo, coalesce(p_saldo_inicial, 0), v_metodos, v_color,
            coalesce((select max(orden) + 1 from public.cuentas_dinero where empresa_id = p_empresa), 0),
            auth.uid())
    returning id into v_id;
    -- (131) En otra moneda: su moneda, y el saldo con los decimales de esa moneda.
    if v_moneda is not null then                                                                -- (131)
      update public.cuentas_dinero                                                              -- (131)
      set moneda = v_moneda,                                                                    -- (131)
          saldo_inicial = round(coalesce(p_saldo_inicial, 0), public.decimales_de(v_moneda))    -- (131)
      where id = v_id;                                                                          -- (131)
    end if;                                                                                     -- (131)
  else
    update public.cuentas_dinero
    set nombre = trim(p_nombre), tipo = p_tipo, metodos = v_metodos, color = v_color, updated_at = now()
    where id = p_id and empresa_id = p_empresa and activa
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
    end if;
  end if;

  -- Cada forma de pago, en una sola casa.
  update public.cuentas_dinero
  set metodos = array(select x from unnest(metodos) x where not (x = any (v_metodos))),
      updated_at = now()
  where empresa_id = p_empresa and id <> v_id and metodos && v_metodos;

  return v_id;
end $fn$;

-- Una función que se borra y se crea es NUEVA: en Supabase nace ejecutable
-- por public, anon, authenticated y service_role (129). Se nombra, uno por
-- uno, a quien no la tiene que llamar: la billetera es de la sesión.
revoke all on function public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid, text, text) from public, anon, service_role;
grant execute on function public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 7. PASAR PLATA DE UNA CUENTA A OTRA (074)
--
--    COPIA de la 074 con `p_monto_hacia` al final.
--
--    `p_monto` es lo que SALE, en la moneda de la cuenta de la que sale.
--
--    · Entre dos cuentas en la misma moneda: un solo monto, como siempre.
--      Entre dos propias no hay ni un redondeo nuevo.
--    · Entre monedas distintas: dos importes, cuánto salió y cuánto entró,
--      cada uno con los decimales de su moneda. Son las dos filas de
--      siempre, con el mismo `par` y montos distintos. La base no calcula
--      ninguno de los dos.
--
--    No nace ningún gasto ni ingreso: cambiar de moneda no es ganar ni
--    gastar. Tampoco controla si alcanza el saldo (igual que hoy).
-- ------------------------------------------------------------
drop function if exists public.transferir_entre_cuentas(uuid, uuid, uuid, numeric, text);

create or replace function public.transferir_entre_cuentas(
  p_empresa uuid,
  p_desde   uuid,
  p_hacia   uuid,
  p_monto   numeric,
  p_nota    text default ''
  , p_monto_hacia numeric default null  -- (131) cuánto ENTRA, si la otra cuenta está en otra moneda
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_par uuid := gen_random_uuid();
  v_hoy date;
  v_propia text;     -- (131) la moneda del negocio
  v_md     text;     -- (131) la moneda de la cuenta de la que sale, siempre escrita
  v_mh     text;     -- (131) la de la cuenta a la que entra
  v_otra   boolean;  -- (131) ¿la cuenta de la que sale está en otra moneda?
  v_sale   numeric;  -- (131)
  v_entra  numeric;  -- (131)
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_desde = p_hacia then
    raise exception 'Elegí dos cuentas distintas.' using errcode = '22023';
  end if;

  if (select count(*) from public.cuentas_dinero
      where id in (p_desde, p_hacia) and empresa_id = p_empresa and activa) <> 2 then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  v_hoy := public.hoy_empresa(p_empresa);
  -- (131) EN QUÉ MONEDA ESTÁ CADA UNA.
  select e.moneda into v_propia from public.empresas e where e.id = p_empresa;                 -- (131)
  select coalesce(c.moneda, v_propia), c.moneda is not null into v_md, v_otra                  -- (131)
  from public.cuentas_dinero c where c.id = p_desde;                                            -- (131)
  select coalesce(c.moneda, v_propia) into v_mh from public.cuentas_dinero c where c.id = p_hacia;  -- (131)
  if v_md = v_mh then                                                                           -- (131)
    -- (131) La misma moneda: un solo monto, el de siempre.
    if p_monto_hacia is not null and p_monto_hacia <> p_monto then                              -- (131)
      raise exception 'Las dos cuentas están en la misma moneda: va un solo monto.' using errcode = '22023';  -- (131)
    end if;                                                                                     -- (131)
    v_sale  := p_monto;                                                                         -- (131)
    v_entra := p_monto;                                                                         -- (131)
    -- (131) Entre dos propias no se redondea nada nuevo. Entre dos en
    -- (131) OTRA moneda (dólares a dólares), con los decimales de esa.
    if v_otra then                                                                              -- (131)
      v_sale  := round(p_monto, public.decimales_de(v_md));                                     -- (131)
      v_entra := v_sale;                                                                        -- (131)
    end if;                                                                                     -- (131)
  else                                                                                          -- (131)
    -- (131) Dos monedas: los dos importes los escribe la persona.
    if coalesce(p_monto_hacia, 0) <= 0 then                                                     -- (131)
      raise exception 'Son dos monedas: escribí cuánto salió y cuánto entró.' using errcode = '22023';  -- (131)
    end if;                                                                                     -- (131)
    -- (131) Un dedazo de ceros no es un tipo de cambio (el tope de la 051).
    if p_monto / p_monto_hacia > 100000000 or p_monto_hacia / p_monto > 100000000 then          -- (131)
      raise exception 'Revisá los montos: ese cambio no puede ser.' using errcode = '22023';    -- (131)
    end if;                                                                                     -- (131)
    v_sale  := round(p_monto, public.decimales_de(v_md));                                       -- (131)
    v_entra := round(p_monto_hacia, public.decimales_de(v_mh));                                 -- (131)
  end if;                                                                                       -- (131)
  if v_sale <= 0 or v_entra <= 0 then                                                           -- (131)
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';           -- (131)
  end if;                                                                                       -- (131)

  insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, par, fecha, nota, creado_por)
  values
    (p_empresa, p_desde, 'transferencia', -v_sale,  v_par, v_hoy, left(coalesce(trim(p_nota), ''), 200), auth.uid()),  -- (131) lo que salió
    (p_empresa, p_hacia, 'transferencia',  v_entra, v_par, v_hoy, left(coalesce(trim(p_nota), ''), 200), auth.uid());  -- (131) lo que entró

  return jsonb_build_object('ok', true, 'par', v_par,                                           -- (131) `ok` y `par`, como siempre
                            'salio', v_sale, 'entro', v_entra,                                  -- (131)
                            'moneda_desde', v_md, 'moneda_hacia', v_mh);                        -- (131)
end $fn$;

revoke all on function public.transferir_entre_cuentas(uuid, uuid, uuid, numeric, text, numeric) from public, anon, service_role;
grant execute on function public.transferir_entre_cuentas(uuid, uuid, uuid, numeric, text, numeric) to authenticated;

-- ------------------------------------------------------------
-- 8. AJUSTAR EL SALDO A LO QUE DICE EL BANCO (074)
--
--    COPIA EXACTA de la 074: ni una línea reemplazada. En una cuenta en
--    otra moneda la diferencia se redondea con los decimales de esa moneda
--    (una caja en guaraníes de un negocio en dólares no tiene centavos).
-- ------------------------------------------------------------
create or replace function public.ajustar_saldo_cuenta(
  p_empresa    uuid,
  p_cuenta     uuid,
  p_saldo_real numeric,
  p_nota       text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo numeric;
  v_dif   numeric;
  v_moneda text;  -- (131) la de la cuenta: null = la del negocio
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  if p_saldo_real is null then
    raise exception 'Escribí cuánto dice tu banco que tenés.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.cuentas_dinero where id = p_cuenta and empresa_id = p_empresa and activa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  v_saldo := public.saldo_cuenta_dinero(p_cuenta);
  v_dif := round(p_saldo_real - v_saldo, 2);
  -- (131) En otra moneda, con sus decimales. Una propia: lo de arriba, sin tocar.
  select c.moneda into v_moneda from public.cuentas_dinero c where c.id = p_cuenta;            -- (131)
  if v_moneda is not null then                                                                  -- (131)
    v_dif := round(p_saldo_real - v_saldo, public.decimales_de(v_moneda));                      -- (131)
  end if;                                                                                       -- (131)

  if v_dif <> 0 then
    insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, fecha, nota, creado_por)
    values (p_empresa, p_cuenta, 'ajuste', v_dif, public.hoy_empresa(p_empresa),
            left(coalesce(trim(p_nota), ''), 200), auth.uid());
  end if;

  return jsonb_build_object('ok', true, 'antes', v_saldo, 'ahora', p_saldo_real, 'diferencia', v_dif);
end $fn$;

revoke all on function public.ajustar_saldo_cuenta(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.ajustar_saldo_cuenta(uuid, uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 9. LA BILLETERA ENTERA (074, 083, 086)
--
--    COPIA de la 086. Las cuatro claves de siempre (`cuentas`, `total`,
--    `sin_cuenta`, `metodos_sin_cuenta`) siguen siendo SOLO de las cuentas
--    en la moneda del negocio: dos líneas ganan `and … moneda is null`.
--
--    Lo nuevo viaja en cuatro claves nuevas:
--
--      moneda          la del negocio
--      cuentas_otras   las cuentas en otra moneda, cada una con la suya
--      totales_otras   un total POR MONEDA. Nunca uno de todas juntas
--      cotizaciones    lo que escribió la persona, con su fecha
--
--    La base no convierte nada: el «≈ todo junto» lo arma la pantalla.
-- ------------------------------------------------------------
create or replace function public.billetera(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_cuentas jsonb;
  v_zona    text;
  v_sueltos record;
  v_propia  text;   -- (131) la moneda del negocio
  v_otras   jsonb;  -- (131) las cuentas en otra moneda
  v_totales jsonb;  -- (131) un total por moneda
  v_cotiza  jsonb;  -- (131) las cotizaciones que escribió la persona
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nombre', c.nombre,
    'tipo', c.tipo,
    'color', c.color,
    'metodos', to_jsonb(c.metodos),
    'saldo', s.saldo,
    -- Lo que se movió este mes por esta cuenta, para que el número no esté solo.
    'entro_mes', coalesce(mes.entro, 0),
    'salio_mes', coalesce(mes.salio, 0)
  ) order by c.orden, c.created_at), '[]'::jsonb)
  into v_cuentas
  from public.cuentas_dinero c
  cross join lateral (select public.saldo_cuenta_dinero(c.id) as saldo) s
  left join lateral (
    select
      sum(m.monto) filter (where m.tipo <> 'gasto') as entro,
      sum(m.monto) filter (where m.tipo = 'gasto')  as salio
    from public.movimientos m
    where m.cuenta_id = c.id and m.estado = 'activo'
      and m.fecha >= date_trunc('month', (now() at time zone v_zona))::date
  ) mes on true
  where c.empresa_id = p_empresa and c.activa and c.moneda is null;  -- (131) solo las propias: las de siempre

  -- Lo que se cargó y no llegó a ninguna cuenta. El neto y no la suma a
  -- secas: un gasto de 100 y un ingreso de 100 sin asignar no son 200 de
  -- desajuste, son cero.
  select count(*)::int as cantidad,
         coalesce(sum(case when m.tipo = 'gasto' then -m.monto else m.monto end), 0) as neto,
         min(m.fecha) as desde
  into v_sueltos
  from public.movimientos m
  where m.empresa_id = p_empresa and m.estado = 'activo' and m.cuenta_id is null;
  -- (131) LAS CUENTAS EN OTRA MONEDA. Todo en la moneda de cada cuenta:
  -- (131) el saldo, y lo que entró y salió este mes (sus movimientos por
  -- (131) `monto_cuenta`, más los pases, que es por donde más se mueven).
  select e.moneda into v_propia from public.empresas e where e.id = p_empresa;                 -- (131)
  select coalesce(jsonb_agg(jsonb_build_object(                                                 -- (131)
    'id', c.id,                                                                                 -- (131)
    'nombre', c.nombre,                                                                         -- (131)
    'tipo', c.tipo,                                                                             -- (131)
    'color', c.color,                                                                           -- (131)
    'metodos', to_jsonb(c.metodos),                                                             -- (131)
    'moneda', c.moneda,                                                                         -- (131)
    'saldo', s.saldo,                                                                           -- (131)
    'entro_mes', coalesce(mes.entro, 0) + coalesce(pas.entro, 0),                               -- (131)
    'salio_mes', coalesce(mes.salio, 0) + coalesce(pas.salio, 0)                                -- (131)
  ) order by c.moneda, c.orden, c.created_at), '[]'::jsonb)                                     -- (131)
  into v_otras                                                                                  -- (131)
  from public.cuentas_dinero c                                                                  -- (131)
  cross join lateral (select public.saldo_cuenta_dinero(c.id) as saldo) s                       -- (131)
  left join lateral (                                                                           -- (131)
    select                                                                                      -- (131)
      sum(m.monto_cuenta) filter (where m.tipo <> 'gasto') as entro,                            -- (131)
      sum(m.monto_cuenta) filter (where m.tipo = 'gasto')  as salio                             -- (131)
    from public.movimientos m                                                                   -- (131)
    where m.cuenta_id = c.id and m.estado = 'activo'                                            -- (131)
      and m.fecha >= date_trunc('month', (now() at time zone v_zona))::date                     -- (131)
  ) mes on true                                                                                 -- (131)
  left join lateral (                                                                           -- (131)
    select                                                                                      -- (131)
      sum(a.monto)  filter (where a.monto > 0) as entro,                                        -- (131)
      sum(-a.monto) filter (where a.monto < 0) as salio                                         -- (131)
    from public.ajustes_cuenta a                                                                -- (131)
    where a.cuenta_id = c.id and a.tipo = 'transferencia'                                       -- (131)
      and a.fecha >= date_trunc('month', (now() at time zone v_zona))::date                     -- (131)
  ) pas on true                                                                                 -- (131)
  where c.empresa_id = p_empresa and c.activa and c.moneda is not null;                         -- (131)
  -- (131) UN TOTAL POR MONEDA. Se agrupa por moneda: nunca se suman dos distintas.
  select coalesce(jsonb_agg(jsonb_build_object(                                                 -- (131)
           'moneda', t.moneda, 'total', t.total, 'cuentas', t.cuentas) order by t.moneda), '[]'::jsonb)  -- (131)
  into v_totales                                                                                -- (131)
  from (select x->>'moneda' as moneda, sum((x->>'saldo')::numeric) as total, count(*)::int as cuentas  -- (131)
        from jsonb_array_elements(v_otras) x                                                    -- (131)
        group by x->>'moneda') t;                                                               -- (131)
  select coalesce(jsonb_agg(jsonb_build_object(                                                 -- (131)
           'moneda', k.moneda, 'valor', k.valor, 'desde', k.updated_at) order by k.moneda), '[]'::jsonb)  -- (131)
  into v_cotiza                                                                                 -- (131)
  from public.cotizaciones_moneda k                                                             -- (131)
  where k.empresa_id = p_empresa;                                                               -- (131)

  return jsonb_build_object(
    'cuentas', v_cuentas,
    'total', coalesce((select sum((x->>'saldo')::numeric) from jsonb_array_elements(v_cuentas) x), 0),
    'sin_cuenta', jsonb_build_object(
      'cantidad', coalesce(v_sueltos.cantidad, 0),
      'neto',     coalesce(v_sueltos.neto, 0),
      'desde',    v_sueltos.desde
    ),
    'metodos_sin_cuenta', (
      select coalesce(jsonb_agg(m order by m), '[]'::jsonb)
      from unnest(array['efectivo', 'transferencia', 'tarjeta', 'credito', 'otro']) m
      where exists (select 1 from public.cuentas_dinero c2
                    where c2.empresa_id = p_empresa and c2.activa and c2.moneda is null)  -- (131) quien solo tiene cuentas en otra moneda no recibe el cartel
        and not exists (select 1 from public.cuentas_dinero c3
                        where c3.empresa_id = p_empresa and c3.activa and m = any (c3.metodos))
    )
    , 'moneda', v_propia          -- (131)
    , 'cuentas_otras', v_otras    -- (131)
    , 'totales_otras', v_totales  -- (131)
    , 'cotizaciones', v_cotiza    -- (131)
  );
end $fn$;

revoke all on function public.billetera(uuid) from public, anon;
grant execute on function public.billetera(uuid) to authenticated;

-- ------------------------------------------------------------
-- 10. LAS CUENTAS PARA ELEGIR AL COBRAR O PAGAR (075, 083, 086)
--
--     COPIA de la 086 con `p_otras_monedas` al final (por defecto, false).
--
--     · Sin la bandera (lo que manda el código publicado y TODA pantalla
--       salvo Gastos): solo las cuentas propias, con las cinco claves de
--       siempre. Vender, Fiado, Deudas y el resto no pueden ofrecer una
--       cuenta en otra moneda porque no la reciben.
--     · Con la bandera: las propias, igual, y después las de otra moneda,
--       con tres claves más: `moneda`, `otra: true` y `cotizacion` (la que
--       escribió la persona para esa moneda, o null).
-- ------------------------------------------------------------
drop function if exists public.cuentas_para_elegir(uuid);

create or replace function public.cuentas_para_elegir(p_empresa uuid, p_otras_monedas boolean default false)  -- (131) la bandera, al final
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
  v_otras jsonb;  -- (131)
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
                    'id', c.id, 'nombre', c.nombre, 'tipo', c.tipo, 'color', c.color,
                    'metodos', to_jsonb(c.metodos))
                            order by c.orden, c.created_at), '[]'::jsonb)
  into v_lista
  from public.cuentas_dinero c
  where c.empresa_id = p_empresa and c.activa and c.moneda is null;  -- (131) solo las propias: las de siempre
  -- (131) Solo si las piden: las de otra moneda, después de las propias.
  if coalesce(p_otras_monedas, false) then                                                      -- (131)
    select coalesce(jsonb_agg(jsonb_build_object(                                               -- (131)
                      'id', c.id, 'nombre', c.nombre, 'tipo', c.tipo, 'color', c.color,         -- (131)
                      'metodos', to_jsonb(c.metodos),                                           -- (131)
                      'moneda', c.moneda, 'otra', true,                                         -- (131)
                      'cotizacion', (select k.valor from public.cotizaciones_moneda k           -- (131)
                                     where k.empresa_id = c.empresa_id and k.moneda = c.moneda))  -- (131)
                              order by c.moneda, c.orden, c.created_at), '[]'::jsonb)           -- (131)
    into v_otras                                                                                -- (131)
    from public.cuentas_dinero c                                                                -- (131)
    where c.empresa_id = p_empresa and c.activa and c.moneda is not null;                       -- (131)
    v_lista := v_lista || v_otras;                                                              -- (131)
  end if;                                                                                       -- (131)

  return v_lista;
end $fn$;

revoke all on function public.cuentas_para_elegir(uuid, boolean) from public, anon, service_role;
grant execute on function public.cuentas_para_elegir(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 11. EL DISPONIBLE DE LA CUENTA PERSONAL (085)
--
--     COPIA de la 085. «Disponible», «por día» y `en_cuentas` salen SOLO de
--     las cuentas en la moneda propia: dos líneas ganan `and c.moneda is
--     null`. Diez mil dólares no son diez mil guaraníes para gastar hoy.
--
--     Quien tiene solo cuentas en otra moneda queda con el cálculo por
--     ciclo, igual que quien no cargó ninguna (085).
--
--     Clave nueva, siempre presente: `en_otras_monedas`, un total por
--     moneda. La pantalla lo muestra debajo, sin sumarlo.
-- ------------------------------------------------------------
create or replace function public.resumen_personal(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
  v_cuentas integer;
  v_en_cuentas numeric;
  v_dias integer;
  v_hoy date;
  v_hasta date;
  v_descontar numeric;
  v_otras jsonb;  -- (131) lo que hay en otras monedas, por moneda
begin
  -- Se parte del resumen de siempre y se corrige el disponible. Repetir
  -- acá las doscientas líneas que lo arman sería tener dos versiones de la
  -- misma cuenta esperando a separarse.
  v_res := public.resumen_personal_por_ciclo(p_empresa);
  -- (131) Lo que hay en otras monedas va aparte, agrupado por moneda.
  select coalesce(jsonb_agg(jsonb_build_object('moneda', t.moneda, 'total', t.total) order by t.moneda), '[]'::jsonb)  -- (131)
  into v_otras                                                                                  -- (131)
  from (select c.moneda, sum(public.saldo_cuenta_dinero(c.id)) as total                         -- (131)
        from public.cuentas_dinero c                                                            -- (131)
        where c.empresa_id = p_empresa and c.activa and c.moneda is not null                    -- (131)
        group by c.moneda) t;                                                                   -- (131)
  v_res := v_res || jsonb_build_object('en_otras_monedas', v_otras);                            -- (131)

  select count(*)::int into v_cuentas
  from public.cuentas_dinero c where c.empresa_id = p_empresa and c.activa and c.moneda is null;  -- (131) solo las propias

  -- Sin cuentas cargadas no hay saldo real del que partir: queda el cálculo
  -- por ciclo, que es impreciso pero no asusta.
  if v_cuentas = 0 then
    return v_res;
  end if;

  select coalesce(sum(public.saldo_cuenta_dinero(c.id)), 0) into v_en_cuentas
  from public.cuentas_dinero c where c.empresa_id = p_empresa and c.activa and c.moneda is null;  -- (131) solo las propias

  -- Lo que está en las cuentas pero ya tiene dueño.
  v_descontar := coalesce((v_res->>'ahorro_total')::numeric, 0)
               + coalesce((v_res->>'fijos_por_pagar')::numeric, 0)
               + coalesce((v_res->>'cuotas_por_vencer')::numeric, 0);

  v_hoy   := public.hoy_empresa(p_empresa);
  v_hasta := (v_res->>'hasta')::date;
  v_dias  := greatest(1, (v_hasta - v_hoy) + 1);

  return v_res
    || jsonb_build_object(
         'disponible', v_en_cuentas - v_descontar,
         'por_dia',    round((v_en_cuentas - v_descontar) / v_dias, 2),
         -- Para que la pantalla pueda explicar de dónde sale el número en
         -- vez de pedir que se le crea.
         'en_cuentas', v_en_cuentas,
         'desde_la_billetera', true
       );
end $fn$;

revoke all on function public.resumen_personal(uuid) from public, anon;
grant execute on function public.resumen_personal(uuid) to authenticated;

-- ------------------------------------------------------------
-- 12. LA MONEDA DEL NEGOCIO NO SE TOCA DESPUÉS (051)
--
--     COPIA EXACTA de la 051: ni una línea reemplazada. Dos cosas más:
--
--     · Con cuentas ACTIVAS en otra moneda no se cambia la moneda del
--       negocio: una cuenta «en dólares» de un negocio que pasa a dólares
--       dejaría de ser «otra» sin que nadie lo decidiera.
--     · Si se cambia (sin movimientos y sin esas cuentas), las cotizaciones
--       se borran: eran contra la moneda anterior, igual que la vista.
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
  -- (131) Con cuentas activas en otra moneda, tampoco.
  if new.moneda is distinct from old.moneda                                                     -- (131)
     and exists (select 1 from public.cuentas_dinero c                                          -- (131)
                 where c.empresa_id = old.id and c.activa and c.moneda is not null) then        -- (131)
    raise exception 'Tenés cuentas en otra moneda. Quitalas antes de cambiar tu moneda principal.' using errcode = '22023';  -- (131)
  end if;                                                                                       -- (131)

  -- Si se cambia la moneda de los datos, una vista vieja deja de tener
  -- sentido: la cotización que había era contra la moneda anterior.
  if new.moneda is distinct from old.moneda then
    new.moneda_vista  := null;
    new.cotizacion    := null;
    new.cotizacion_at := null;
    delete from public.cotizaciones_moneda where empresa_id = old.id;  -- (131) y las de la billetera, por lo mismo
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

revoke all on function public.moneda_no_se_reetiqueta() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 13. EL FIADO NO PRESTA NI COBRA EN OTRA MONEDA (nueva)
--
--     Prestar y cobrar un fiado mueven la cuenta con un ajuste 'prestamo'
--     por el importe del fiado, que está en la moneda del negocio
--     (anotar_fiado y cobrar_fiado, 127). En una cuenta en dólares ese
--     número sería otra cosa. Este disparador los frena a los dos sin
--     tocarlos: ninguna de las dos atrapa el error, así que se deshace todo
--     (la línea del fiado, las cuotas y el ajuste).
--
--     TODO TIPO NUEVO DE AJUSTE QUE MUEVA UNA CUENTA POR UN IMPORTE DEL
--     NEGOCIO SE SUMA ACÁ. 'ajuste' y 'transferencia' no: sus importes ya
--     están en la moneda de la cuenta.
--
--     El nombre empieza con «m» para disparar DESPUÉS de
--     cuenta_activa_ajustes_cuenta: el negocio vencido y la personal en
--     Gratis leen primero su mensaje de siempre.
-- ------------------------------------------------------------
create or replace function public.moneda_ajustes_cuenta()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.tipo = 'prestamo'
     and exists (select 1 from public.cuentas_dinero c
                 where c.id = new.cuenta_id and c.moneda is not null) then
    raise exception 'Esa cuenta está en otra moneda. Elegí una en tu moneda principal.' using errcode = '22023';
  end if;
  return new;
end $fn$;

revoke all on function public.moneda_ajustes_cuenta() from public, anon, authenticated, service_role;

drop trigger if exists moneda_ajustes_cuenta on public.ajustes_cuenta;
create trigger moneda_ajustes_cuenta
  before insert or update on public.ajustes_cuenta
  for each row execute function public.moneda_ajustes_cuenta();

-- ------------------------------------------------------------
-- 14. GUARDAR O BORRAR UNA COTIZACIÓN (nueva)
--
--     `p_valor` llega en la dirección de la base: cuánto vale 1 de
--     `p_moneda` en la moneda del negocio. La vuelta («a cuánto está el
--     dólar» para un negocio en dólares con una caja en guaraníes) la da la
--     pantalla.
--
--     `p_valor` en null la borra. El borrado no pasa por el candado
--     (solo cuida insertar y editar): antes se «toca» la fila sin cambiarle
--     nada, para que el vencido y la Gratis lean su mensaje de siempre.
--
--     Los dos textos del importe son los de `guardar_vista_moneda` (051).
-- ------------------------------------------------------------
create or replace function public.guardar_cotizacion_moneda(
  p_empresa uuid,
  p_moneda  text,
  p_valor   numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_propia text;
  v_moneda text;
  v_fila   public.cotizaciones_moneda%rowtype;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  select e.moneda into v_propia from public.empresas e where e.id = p_empresa;
  v_moneda := nullif(upper(trim(coalesce(p_moneda, ''))), '');

  if v_moneda is null or v_moneda not in ('PYG', 'USD', 'ARS', 'BRL', 'EUR') then
    raise exception 'No conocemos esa moneda.' using errcode = '22023';
  end if;

  if v_moneda = v_propia then
    raise exception 'Esa es tu moneda: no necesita cotización.' using errcode = '22023';
  end if;

  if p_valor is null then
    update public.cotizaciones_moneda set updated_at = updated_at
    where empresa_id = p_empresa and moneda = v_moneda;
    delete from public.cotizaciones_moneda
    where empresa_id = p_empresa and moneda = v_moneda;
    return jsonb_build_object('moneda', v_moneda, 'valor', null, 'desde', null);
  end if;

  -- Diez decimales es lo que se guarda: lo que redondea a cero no es un cambio.
  if round(p_valor, 10) <= 0 then
    raise exception 'Poné a cuánto está el cambio: sin eso no se puede convertir nada.'
      using errcode = '22023';
  end if;

  if p_valor > 100000000 then
    raise exception 'Esa cotización es demasiado grande. Revisá los ceros.' using errcode = '22023';
  end if;

  insert into public.cotizaciones_moneda (empresa_id, moneda, valor, updated_at)
  values (p_empresa, v_moneda, p_valor, now())
  on conflict (empresa_id, moneda)
  do update set valor = excluded.valor, updated_at = now()
  returning * into v_fila;

  return jsonb_build_object('moneda', v_fila.moneda, 'valor', v_fila.valor, 'desde', v_fila.updated_at);
end $fn$;

revoke all on function public.guardar_cotizacion_moneda(uuid, text, numeric) from public, anon, service_role;
grant execute on function public.guardar_cotizacion_moneda(uuid, text, numeric) to authenticated;

-- ------------------------------------------------------------
-- 15. DESHACER UNA TRANSFERENCIA (nueva)
--
--     Hasta acá un pase mal hecho se arreglaba con otro al revés. Entre dos
--     monedas eso no devuelve lo mismo (el cambio de la vuelta es otro), así
--     que se borra: las dos filas del `par` juntas, o ninguna. Sirve para
--     cualquier transferencia, también entre dos cuentas propias.
--
--     El borrado no pasa por el candado: antes se «tocan» las dos filas sin
--     cambiarles nada, y ahí hablan el del vencido y el de Gratis.
-- ------------------------------------------------------------
create or replace function public.deshacer_transferencia(p_empresa uuid, p_par uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_cuentas uuid[];
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  -- La que salió primero, la que entró después.
  select array_agg(a.cuenta_id order by a.monto) into v_cuentas
  from public.ajustes_cuenta a
  where a.empresa_id = p_empresa and a.par = p_par and a.tipo = 'transferencia';

  if p_par is null or coalesce(cardinality(v_cuentas), 0) <> 2 then
    raise exception 'Esa transferencia no existe.' using errcode = 'P0002';
  end if;

  update public.ajustes_cuenta set nota = nota
  where empresa_id = p_empresa and par = p_par and tipo = 'transferencia';

  delete from public.ajustes_cuenta
  where empresa_id = p_empresa and par = p_par and tipo = 'transferencia';

  return jsonb_build_object('ok', true, 'cuentas', to_jsonb(v_cuentas));
end $fn$;

revoke all on function public.deshacer_transferencia(uuid, uuid) from public, anon, service_role;
grant execute on function public.deshacer_transferencia(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 16. LOS ÚLTIMOS PASES DE UNA CUENTA (nueva)
--
--     Para poder mirar y deshacer. Cada pase desde el lado de ESTA cuenta:
--     `monto` con signo y en su moneda; `otro_monto` con signo y en la
--     moneda de la otra. Dos importes exactos: nada convertido.
--     `otra_cuenta` es el nombre, aunque esté archivada.
-- ------------------------------------------------------------
create or replace function public.transferencias_de_cuenta(
  p_empresa uuid,
  p_cuenta  uuid,
  p_limite  integer default 10
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_propia text;
  v_lista  jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.cuentas_dinero where id = p_cuenta and empresa_id = p_empresa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  select e.moneda into v_propia from public.empresas e where e.id = p_empresa;

  select coalesce(jsonb_agg(jsonb_build_object(
           'par', t.par,
           'fecha', t.fecha,
           'nota', t.nota,
           'monto', t.monto,
           'moneda', t.moneda,
           'otra_cuenta', t.otra_cuenta,
           'otra_moneda', t.otra_moneda,
           'otro_monto', t.otro_monto
         ) order by t.created_at desc, t.id), '[]'::jsonb)
  into v_lista
  from (
    select a.id, a.par, a.fecha, a.nota, a.monto, a.created_at,
           coalesce(c.moneda, v_propia) as moneda,
           oc.nombre as otra_cuenta,
           coalesce(oc.moneda, v_propia) as otra_moneda,
           o.monto as otro_monto
    from public.ajustes_cuenta a
    join public.cuentas_dinero c on c.id = a.cuenta_id
    join public.ajustes_cuenta o
      on o.par = a.par and o.id <> a.id and o.tipo = 'transferencia' and o.empresa_id = a.empresa_id
    join public.cuentas_dinero oc on oc.id = o.cuenta_id
    where a.empresa_id = p_empresa and a.cuenta_id = p_cuenta
      and a.tipo = 'transferencia' and a.par is not null
    order by a.created_at desc, a.id
    limit greatest(1, least(coalesce(p_limite, 10), 50))
  ) t;

  return v_lista;
end $fn$;

revoke all on function public.transferencias_de_cuenta(uuid, uuid, integer) from public, anon, service_role;
grant execute on function public.transferencias_de_cuenta(uuid, uuid, integer) to authenticated;
