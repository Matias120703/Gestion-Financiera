-- ============================================================
-- 100 · CAMPAÑAS, COSECHAS Y LIQUIDACIONES: AGRICULTURA, FASE 1
-- ============================================================
--
-- La 044 dejó el lote: algo que se abre, junta plata durante meses y recién
-- al cerrar dice si ganaste. Para el ganadero alcanzaba. Para el sojero
-- —el que mira Orden desde la camioneta, entre el silo y la cooperativa—
-- faltaban tres cosas que la plata sola no cuenta:
--
--   · CUÁNTO SEMBRÓ. Sin hectáreas no hay «cuánto me sale la hectárea» ni
--     «cuántos kilos necesito para cubrir», que son las dos preguntas que
--     se hace todos los días de la campaña.
--   · CUÁNTO COSECHÓ. Los kilos entran al silo semanas antes de que haya
--     un peso. Un ticket de balanza no es una venta: es un camión.
--   · CÓMO LE PAGARON. La cooperativa liquida en UN papel: bruto por los
--     kilos, menos secado, menos flete, menos lo que le fió a cosecha, menos
--     el alquiler en kilos del dueño del campo… y el banco acredita el neto.
--     Ese papel toca la caja, la campaña y las deudas al mismo tiempo, y
--     tiene que cuadrar peso por peso o no sirve.
--
-- LAS DECISIONES (CONTRATO-100, §1; no se re-discuten)
--
--   1. La caja sigue siendo de caja. Un insumo «a cosecha» nace como DEUDA
--      atada a la campaña, sin gasto. El gasto nace cuando se paga —a mano
--      o porque el silo lo compensó en la liquidación— con la categoría y la
--      campaña de la deuda. `billetera()`, `resumen_financiero`, el año y el
--      Excel no cambian.
--   2. Una sola moneda de datos por negocio (`empresas.moneda`). Si pagó o
--      cobró en otra, `monto` va convertido y se guardan `monto_original`,
--      `moneda_original` y `cambio` (cuántas unidades de la moneda propia
--      vale 1 de la original). Sin valuación histórica ni dólar de
--      referencia: la vista de la 051 sigue siendo la forma de mirar todo al
--      cambio de hoy.
--   3. Un solo «Resultado»: `cobrado − puesto`, la regla de la 045. El
--      renglón «si pagás lo que debés a cosecha» es `resultado − a_cosecha`
--      y se dibuja en la pantalla; acá nunca hay dos números con el mismo
--      nombre.
--   4. Nada sin señal. `registrar_cosecha` y `registrar_liquidacion`
--      aceptan un id (o un `grupo_id`) generado en el celular: el reintento
--      devuelve lo mismo y no duplica.
--   5. La liquidación es por socio: un papel puede juntar kilos de dos
--      campañas. `p_partes` trae una parte por campaña; cada parte es una
--      fila de `liquidaciones` con el mismo `grupo_id`, en UNA transacción.
--      Anular es anular el grupo entero.
--   6. Vínculo por columna: `movimientos.liquidacion_id` y
--      `pagos_deuda.liquidacion_id`. El historial dice «parte de la
--      liquidación del 12/04» y no deja editar ni anular suelto.
--   7. Un pago parcial de una deuda con campaña NO corre `vence_el`: el
--      «a cosecha» vence cuando vence la cosecha, no un mes después de cada
--      compensación.
--   8. Un ingreso «Préstamo» o «Aporte» colgado de una campaña no cuenta en
--      `cobrado`: es plata prestada, no plata que la campaña dio.
--   9. `kg_netos` = «kilos que te acreditaron»; `kg_brutos` = «peso de
--      balanza». Sin tabla de merma.
--  10. Neto cero sin cuenta está permitido (canje puro: entregué kilos para
--      pagar el alquiler). Neto negativo se rechaza: la pantalla topa lo
--      compensado al bruto y lo que falte sigue como deuda.
--  11. `borrar_lote` no cambia su conteo de anulados (la FK sin `on delete`
--      frenaría el delete igual); lo que sí frena son cosechas,
--      liquidaciones y deudas, con un mensaje que se entiende.
--  12. `registrar_venta` no cambia de firma: desde Vender, la campaña se
--      asigna después con `asignar_a_lote`.
--
-- QUIÉN VE QUÉ (015, 045 y 047, juntas)
--
-- La 045 decidió que `puesto`, `cobrado` y `resultado` los ve todo miembro:
-- son sumas de montos que la 003 ya le deja ver de a uno, y `lotes.test.js`
-- lo comprueba («el peón que carga el balanceado ve lo mismo»). Esa regla
-- se mantiene tal cual. Lo que ESTA migración agrega —cuánto se debe a
-- cosecha y todo lo que se deriva de eso— es de administración, como las
-- deudas desde la 015: para un miembro que no es admin, `numeros_de_lote`
-- devuelve null en `a_cosecha`, `costo`, `costo_ha`, `costo_ton`,
-- `kg_ha_para_cubrir`, `falta_cubrir` y `kg_para_cubrir`; `resumen_lote` le
-- da `deudas = null` y `estructura = null`, filtra los movimientos con la
-- regla de la 047 (`v_admin or tipo = 'venta' or creado_por = auth.uid()`)
-- y en cada liquidación le tapa `descuentos`, `compensado` y
-- `pagado_con_grano`. Kilos, rendimiento, vendido y precio promedio sí se
-- ven: las ventas son de todos.
--
-- CÓMO ESTÁ ARMADO
--
-- `lotes` gana cultivo, campaña, hectáreas y precio esperado; una fila
-- sigue siendo UNA campaña de un lote físico (comparar zafra contra zafra =
-- agrupar por nombre). `cosechas` es un ticket por camión, kilos sin plata.
-- `liquidaciones` es una venta de grano de UNA campaña: apunta a la venta
-- (por el bruto) y guarda cómo se repartió el papel. Las fórmulas viven en
-- un solo lugar, `numeros_de_lote`, que llaman `listar_lotes` y
-- `resumen_lote`.
--
-- La venta de una liquidación se inserta DIRECTO y no con
-- `registrar_venta`: sus items redondean el precio unitario a 2 decimales,
-- y US$ 0,415 el kilo se volvería 0,42. Se rellenan todas las columnas que
-- `registrar_venta` rellena; los triggers de la 074 (cuenta) y
-- `exigir_cuenta_activa` corren solos.
--
-- LAS REGLAS DE SIEMPRE
--
-- Todo idempotente (`pruebas/migracion.test.js` aplica dos veces). Toda
-- función `security definer set search_path = public`, primera línea
-- `es_miembro`/`es_admin`. Claves compuestas `(x_id, empresa_id)` en toda
-- FK que cruce tablas, el candado de la 044/052: una fila de un negocio no
-- puede apuntar a la de otro ni con un UPDATE a mano. Nadie escribe lotes,
-- cosechas, liquidaciones, deudas ni pagos directo. Las funciones
-- redefinidas son copia exacta de su definición viva en producción
-- (verificada con `pg_get_functiondef` el 23/09/2026) más lo nuevo; las que
-- cambian de firma borran la vieja antes (patrón 096).

-- ------------------------------------------------------------
-- 1. LA CAMPAÑA: QUÉ SE SEMBRÓ, CUÁNTO Y A QUÉ PRECIO SE ESPERA
--
--    `unidad`/`cantidad` quedan como están (ganadería: cabezas). Cuando se
--    abre con hectáreas y sin unidad, `guardar_lote` escribe `unidad = 'ha'`
--    y `cantidad = hectareas`, así el `por_unidad` de siempre es «por
--    hectárea» y ganadería no cambia. `precio_esperado` es por TONELADA, en
--    `empresas.moneda`, sin valor por defecto: envejece en un mes.
-- ------------------------------------------------------------
alter table public.lotes
  add column if not exists cultivo         text not null default '' check (char_length(cultivo) <= 40),
  add column if not exists campana         text not null default '' check (char_length(campana) <= 40),
  add column if not exists hectareas       numeric(10,2) check (hectareas is null or (hectareas > 0 and hectareas <= 50000)),
  add column if not exists precio_esperado numeric(14,2) check (precio_esperado is null or precio_esperado >= 0);

create index if not exists lotes_cultivo_idx on public.lotes (empresa_id, lower(cultivo));

-- La 044 dio `grant select` sobre la tabla entera: las columnas nuevas
-- entran solas.

-- ------------------------------------------------------------
-- 2. EL MOVIMIENTO: EN QUÉ MONEDA VINO, CON QUIÉN SE REPARTE, DE QUÉ PAPEL ES
--
--    `cambio` son unidades de la moneda propia por 1 de la original;
--    `monto = round(monto_original × cambio, 2)`. Los tres van juntos o
--    ninguno. `reparto_id`: un gasto repartido entre campañas por hectáreas
--    son N inserts con el mismo id, y se anulan juntos. `liquidacion_id`:
--    la venta o el gasto que nació dentro de una liquidación; su FK se
--    agrega en 6, después de crear la tabla.
-- ------------------------------------------------------------
alter table public.movimientos
  add column if not exists monto_original  numeric(14,2)  check (monto_original is null or monto_original >= 0),
  add column if not exists moneda_original text           check (moneda_original is null or moneda_original in ('PYG','USD','BRL','ARS','EUR')),
  add column if not exists cambio          numeric(24,10) check (cambio is null or cambio > 0),
  add column if not exists reparto_id      uuid,
  add column if not exists liquidacion_id  uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimiento_original_coherente') then
    alter table public.movimientos
      add constraint movimiento_original_coherente check (
        (monto_original is null) = (moneda_original is null)
        and (moneda_original is null) = (cambio is null));
  end if;
end $$;

-- La clave que permite que `liquidaciones` apunte a la venta con la llave
-- compuesta. No existía: el único unique de `movimientos` era el `id`.
create unique index if not exists movimientos_id_empresa_idx on public.movimientos (id, empresa_id);
create index if not exists movimientos_reparto_idx     on public.movimientos (reparto_id)     where reparto_id is not null;
create index if not exists movimientos_liquidacion_idx on public.movimientos (liquidacion_id) where liquidacion_id is not null;

-- La 003 revocó el select total y lo devolvió columna por columna: columna
-- nueva = grant nuevo (como la 044 con `lote_id`).
grant select (monto_original, moneda_original, cambio, reparto_id, liquidacion_id) on public.movimientos to authenticated;

-- La policy de insert, EXACTA como está viva (032) más `liquidacion_id is
-- null`: nadie se inventa desde el celular una venta «parte de una
-- liquidación». `reparto_id`, `monto_original`, `moneda_original` y
-- `cambio` sí los manda la pantalla en el insert directo.
drop policy if exists movimientos_insert on public.movimientos;
create policy movimientos_insert on public.movimientos
  for insert with check (
    public.es_miembro(empresa_id)
    and tipo <> 'venta'
    and estado = 'activo'
    and creado_por = auth.uid()
    and descuento = 0
    and costo_total = 0
    and subtotal = monto
    and anulado_por is null
    and anulado_at is null
    and fecha >= date '2000-01-01'
    and fecha <= (public.hoy_empresa(empresa_id) + 1)
    and liquidacion_id is null
  );

-- ------------------------------------------------------------
-- 3. LA DEUDA «A COSECHA»: QUÉ CAMPAÑA LA PAGA Y QUÉ GASTO NACE AL PAGARLA
--
--    `categoria` es la del gasto que nace al pagarla ('' = 'Deudas', como
--    siempre). `pagos_deuda.liquidacion_id`: el pago que hizo el silo al
--    compensar; su FK va en 6. La columna de «activa/archivada» de `deudas`
--    se llama `activa` (015) y se usa igual en todas las consultas nuevas.
-- ------------------------------------------------------------
alter table public.deudas
  add column if not exists lote_id   uuid,
  add column if not exists categoria text not null default '' check (char_length(categoria) <= 60);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deudas_lote_fk') then
    alter table public.deudas
      add constraint deudas_lote_fk
      foreign key (lote_id, empresa_id) references public.lotes (id, empresa_id);
  end if;
end $$;

create index if not exists deudas_lote_idx on public.deudas (lote_id) where lote_id is not null;

alter table public.pagos_deuda
  add column if not exists liquidacion_id uuid;

-- `deudas` y `pagos_deuda` tienen `grant select` sobre la tabla entera
-- (015): las columnas nuevas entran solas.

-- ------------------------------------------------------------
-- 4. LA COSECHA: UN TICKET DE BALANZA POR CAMIÓN, KILOS SIN PLATA
--
--    No se valida el rendimiento en SQL (la caña da 56.000 kg/ha); los
--    avisos de rango son de pantalla. Se escribe solo por funciones.
-- ------------------------------------------------------------
create table if not exists public.cosechas (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  lote_id    uuid not null,
  fecha      date not null,
  -- Kilos que le acreditaron.
  kg_netos   numeric(12,0) not null check (kg_netos > 0 and kg_netos <= 5000000),
  -- Peso de balanza (camión − tara).
  kg_brutos  numeric(12,0) check (kg_brutos is null or kg_brutos >= kg_netos),
  humedad    numeric(4,1) check (humedad is null or humedad between 5 and 40),
  destino    text not null default '' check (char_length(destino) <= 80),
  ticket     text not null default '' check (char_length(ticket) <= 40),
  notas      text not null default '' check (char_length(notas) <= 300),
  creado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cosechas_lote_fk foreign key (lote_id, empresa_id) references public.lotes (id, empresa_id),
  constraint cosechas_id_empresa unique (id, empresa_id)
);

create index if not exists cosechas_lote_idx on public.cosechas (lote_id, fecha desc);

alter table public.cosechas enable row level security;

drop policy if exists cosechas_select on public.cosechas;
create policy cosechas_select on public.cosechas
  for select to authenticated using (public.es_miembro(empresa_id));

revoke all on public.cosechas from anon, authenticated;
grant select on public.cosechas to authenticated;

drop trigger if exists cuenta_activa_cosechas on public.cosechas;
create trigger cuenta_activa_cosechas
  before insert or update on public.cosechas
  for each row execute function public.exigir_cuenta_activa();

-- ------------------------------------------------------------
-- 5. LA LIQUIDACIÓN: UNA VENTA DE GRANO DE UNA CAMPAÑA
--
--    Un papel = un `grupo_id` con 1..10 filas. `movimiento_id` es la venta,
--    por el BRUTO. `descuentos` es la suma de los gastos que creó (secado,
--    flete, retención…), `compensado` la de los pagos de deudas que el silo
--    se cobró, `pagado_con_grano` el alquiler en kilos u otro gasto que
--    pagó el grano, y `neto` lo que acreditó el banco (0 en un canje puro).
--    `liquidacion_cuadra` no deja guardar un papel que no cierra.
-- ------------------------------------------------------------
create table if not exists public.liquidaciones (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas (id) on delete cascade,
  -- El papel; lo genera el celular (idempotencia).
  grupo_id         uuid not null,
  lote_id          uuid not null,
  fecha            date not null,
  movimiento_id    uuid not null,
  comprador        text not null default '' check (char_length(comprador) <= 80),
  kg               numeric(12,0) not null check (kg > 0),
  -- En empresas.moneda, por tonelada.
  precio_tonelada  numeric(14,4) not null check (precio_tonelada >= 0),
  -- round(kg × precio_tonelada / 1000, 2)
  bruto            numeric(14,2) not null check (bruto >= 0),
  descuentos       numeric(14,2) not null default 0 check (descuentos >= 0),
  compensado       numeric(14,2) not null default 0 check (compensado >= 0),
  pagado_con_grano numeric(14,2) not null default 0 check (pagado_con_grano >= 0),
  neto             numeric(14,2) not null check (neto >= 0),
  cuenta_id        uuid references public.cuentas_dinero (id) on delete set null,
  moneda_original  text check (moneda_original is null or moneda_original in ('PYG','USD','BRL','ARS','EUR')),
  -- Como venía en el papel.
  precio_original  numeric(14,4) check (precio_original is null or precio_original >= 0),
  cambio           numeric(24,10) check (cambio is null or cambio > 0),
  estado           text not null default 'activa' check (estado in ('activa', 'anulada')),
  anulada_por      uuid references auth.users (id) on delete set null,
  anulada_at       timestamptz,
  notas            text not null default '' check (char_length(notas) <= 300),
  creado_por       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint liquidacion_original_coherente check (
    (moneda_original is null) = (precio_original is null)
    and (moneda_original is null) = (cambio is null)),
  constraint liquidaciones_lote_fk foreign key (lote_id, empresa_id) references public.lotes (id, empresa_id),
  constraint liquidaciones_mov_fk  foreign key (movimiento_id, empresa_id) references public.movimientos (id, empresa_id),
  constraint liquidaciones_id_empresa unique (id, empresa_id),
  constraint liquidacion_cuadra check (abs(bruto - descuentos - compensado - pagado_con_grano - neto) < 0.01),
  constraint liquidacion_anulada_coherente check ((estado = 'anulada') = (anulada_at is not null))
);

create index if not exists liquidaciones_lote_idx on public.liquidaciones (lote_id, fecha desc);
-- ÚNICO por (grupo, campaña): «cada campaña una sola vez en el papel» lo
-- hace cumplir la base, y de paso frena el doble toque sin señal. Dos
-- llamadas a `registrar_liquidacion` con el mismo `p_grupo` que llegan al
-- mismo tiempo pasan las dos el `exists` de la idempotencia; con este
-- índice la segunda espera a la primera y falla con unique_violation en
-- vez de insertar el papel dos veces, y el reintento siguiente ya entra por
-- la rama idempotente. Sirve también para buscar por grupo.
drop index if exists public.liquidaciones_grupo_idx;
create unique index if not exists liquidaciones_grupo_lote_idx on public.liquidaciones (grupo_id, lote_id);

alter table public.liquidaciones enable row level security;

drop policy if exists liquidaciones_select on public.liquidaciones;
create policy liquidaciones_select on public.liquidaciones
  for select to authenticated using (public.es_miembro(empresa_id));

-- Grant por columnas, como hace la 003 con `movimientos`: la policy deja
-- leer la fila a todo miembro, pero `descuentos`, `compensado` y
-- `pagado_con_grano` son de administración (decisión 6) y por PostgREST
-- no se pueden pedir. `resumen_lote` es definer: las lee y las tapa según
-- el rol.
revoke all on public.liquidaciones from anon, authenticated;
grant select (
  id, empresa_id, grupo_id, lote_id, fecha, movimiento_id, comprador, kg, precio_tonelada, bruto, neto,
  cuenta_id, moneda_original, precio_original, cambio, estado, anulada_por, anulada_at, notas, creado_por, created_at
) on public.liquidaciones to authenticated;

drop trigger if exists cuenta_activa_liquidaciones on public.liquidaciones;
create trigger cuenta_activa_liquidaciones
  before insert or update on public.liquidaciones
  for each row execute function public.exigir_cuenta_activa();

-- ------------------------------------------------------------
-- 6. LAS LLAVES DE VUELTA: DEL MOVIMIENTO Y DEL PAGO A SU LIQUIDACIÓN
--
--    Compuestas y sin `on delete`: una liquidación con plata colgada no se
--    borra, se anula. Borrar la empresa entera sigue andando: las llaves
--    son NO ACTION, se controlan al final de la sentencia y para entonces
--    ya no queda ninguna de las dos puntas.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_liquidacion_fk') then
    alter table public.movimientos
      add constraint movimientos_liquidacion_fk
      foreign key (liquidacion_id, empresa_id) references public.liquidaciones (id, empresa_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pagos_deuda_liquidacion_fk') then
    alter table public.pagos_deuda
      add constraint pagos_deuda_liquidacion_fk
      foreign key (liquidacion_id, empresa_id) references public.liquidaciones (id, empresa_id);
  end if;
end $$;

create index if not exists pagos_deuda_liquidacion_idx on public.pagos_deuda (liquidacion_id) where liquidacion_id is not null;

-- ------------------------------------------------------------
-- 7. LA COTIZACIÓN CON MÁS DECIMALES
--
--    Un negocio en dólares que mira en guaraníes guarda 1/6000: con seis
--    decimales (051) pierde un 0,2 %. `guardar_vista_moneda` no cambia de
--    firma; se verificó en producción que ninguna vista ni regla depende
--    del tipo (la constraint `vista_con_cotizacion` se reevalúa sola).
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'empresas' and column_name = 'cotizacion'
      and numeric_scale is distinct from 10
  ) then
    alter table public.empresas alter column cotizacion type numeric(24,10);
  end if;
end $$;

-- ------------------------------------------------------------
-- 8. LOS NÚMEROS DE UNA CAMPAÑA, EN UN SOLO LUGAR
--
--    Interna: la llaman `listar_lotes` y `resumen_lote`, que ya miraron el
--    rol. Todas las claves están siempre; null donde no aplica o donde no
--    corresponde verlo (ver la cabecera). Montos a 2 decimales, kilos a 0,
--    kg/ha y precios por tonelada a 2.
--
--    `kg_vendidos` cuenta solo liquidaciones activas cuya venta sigue
--    activa: si alguien anuló la venta desde el historial, los kilos vuelven
--    al silo solos, igual que la plata.
-- ------------------------------------------------------------
create or replace function public.numeros_de_lote(p_lote uuid, p_admin boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_l           public.lotes;
  v_admin       boolean := coalesce(p_admin, false);
  v_movs        integer;
  v_puesto      numeric;
  v_cobrado     numeric;
  v_a_cosecha   numeric;
  v_kg_cos      numeric;
  v_kg_vend     numeric;
  v_vendido     numeric;
  v_resultado   numeric;
  v_costo       numeric;
  v_costo_ha    numeric;
  v_precio_prom numeric;
  v_precio_ref  numeric;
  v_falta       numeric;
begin
  select * into v_l from public.lotes where id = p_lote;

  select count(*)::int,
         coalesce(sum(m.monto) filter (where m.tipo = 'gasto'), 0),
         -- Un préstamo o un aporte colgado de la campaña es plata prestada,
         -- no plata que la campaña dio (decisión 8). Son los nombres exactos
         -- que guarda PantallaGastos en sus chips de ingreso.
         coalesce(sum(m.monto) filter (where m.tipo = 'venta'
                                          or (m.tipo = 'ingreso' and m.categoria not in ('Préstamo', 'Aporte'))), 0)
  into v_movs, v_puesto, v_cobrado
  from public.movimientos m
  where m.lote_id = p_lote and m.estado = 'activo';

  select coalesce(sum(d.saldo), 0) into v_a_cosecha
  from public.deudas d
  where d.lote_id = p_lote and d.activa and d.saldo > 0;

  select coalesce(sum(c.kg_netos), 0) into v_kg_cos
  from public.cosechas c where c.lote_id = p_lote;

  select coalesce(sum(q.kg), 0), coalesce(sum(q.bruto), 0) into v_kg_vend, v_vendido
  from public.liquidaciones q
  join public.movimientos m on m.id = q.movimiento_id
  where q.lote_id = p_lote and q.estado = 'activa' and m.estado = 'activo';

  v_resultado   := v_cobrado - v_puesto;
  v_costo       := v_puesto + v_a_cosecha;
  v_costo_ha    := case when v_l.hectareas > 0 then round(v_costo / v_l.hectareas, 2) end;
  v_precio_prom := case when v_kg_vend > 0 then round(v_vendido / v_kg_vend * 1000, 2) end;
  v_precio_ref  := coalesce(v_precio_prom, v_l.precio_esperado);
  v_falta       := greatest(v_costo - v_cobrado, 0);

  return jsonb_build_object(
    'movimientos',      v_movs,
    'puesto',           v_puesto,
    'cobrado',          v_cobrado,
    'resultado',        v_resultado,
    'por_unidad',       case when v_l.cantidad > 0 then round(v_resultado / v_l.cantidad, 2) end,
    'a_cosecha',        case when v_admin then v_a_cosecha end,
    'costo',            case when v_admin then v_costo end,
    'costo_ha',         case when v_admin then v_costo_ha end,
    'resultado_ha',     case when v_l.hectareas > 0 then round(v_resultado / v_l.hectareas, 2) end,
    'kg_cosechados',    v_kg_cos,
    'kg_vendidos',      v_kg_vend,
    -- Puede ser negativo (vendió más de lo que cargó como cosecha): la
    -- pantalla lo dice.
    'kg_sin_vender',    v_kg_cos - v_kg_vend,
    'vendido',          v_vendido,
    'precio_promedio',  v_precio_prom,
    'precio_ref',       v_precio_ref,
    'rendimiento',      case when v_l.hectareas > 0 and v_kg_cos > 0 then round(v_kg_cos / v_l.hectareas, 2) end,
    'costo_ton',        case when v_admin and v_kg_cos > 0 then round(v_costo / (v_kg_cos / 1000), 2) end,
    'kg_ha_para_cubrir', case when v_admin and v_costo_ha is not null and v_precio_ref > 0
                              then round(v_costo_ha / v_precio_ref * 1000, 2) end,
    'falta_cubrir',     case when v_admin then v_falta end,
    'kg_para_cubrir',   case when v_admin and v_precio_ref > 0 then round(v_falta / v_precio_ref * 1000, 0) end
  );
end $fn$;

revoke all on function public.numeros_de_lote(uuid, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 9. ABRIR Y EDITAR, AHORA CON CULTIVO, CAMPAÑA, HECTÁREAS Y PRECIO
--
--    Copia exacta de la 044 más las cuatro columnas. Con un parámetro más,
--    `create or replace` dejaría la vieja al lado y toda llamada sería
--    ambigua: se borra antes (096).
-- ------------------------------------------------------------
drop function if exists public.guardar_lote(uuid, text, text, numeric, text, uuid, date);

create or replace function public.guardar_lote(
  p_empresa         uuid,
  p_nombre          text,
  p_unidad          text default '',
  p_cantidad        numeric default 0,
  p_notas           text default '',
  p_id              uuid default null,
  p_abierto         date default null,
  p_cultivo         text default '',
  p_campana         text default '',
  p_hectareas       numeric default null,
  p_precio_esperado numeric default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id       uuid;
  v_rubro    text;
  v_unidad   text;
  v_cantidad numeric;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo administración maneja los lotes.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'El lote necesita un nombre.' using errcode = '22023';
  end if;
  if coalesce(p_cantidad, 0) < 0 then
    raise exception 'La cantidad no puede ser negativa.' using errcode = '22023';
  end if;
  if p_hectareas is not null and p_hectareas <= 0 then
    raise exception 'Las hectáreas tienen que ser más que cero.' using errcode = '22023';
  end if;
  if p_precio_esperado is not null and p_precio_esperado < 0 then
    raise exception 'El precio esperado no puede ser negativo.' using errcode = '22023';
  end if;

  -- Sin hectáreas no hay costo por hectárea ni kilos para cubrir: en
  -- agricultura son obligatorias. Ganadería y el resto siguen como siempre.
  select rubro into v_rubro from public.empresas where id = p_empresa;
  if v_rubro = 'agricultura' and p_hectareas is null then
    raise exception 'Decinos cuántas hectáreas tiene.' using errcode = '22023';
  end if;

  -- Con hectáreas y sin unidad, la unidad ES la hectárea: así `por_unidad`
  -- de siempre es «por hectárea» sin tocar ganadería.
  v_unidad   := left(trim(coalesce(p_unidad, '')), 20);
  v_cantidad := coalesce(p_cantidad, 0);
  if p_hectareas is not null and v_unidad = '' and v_cantidad = 0 then
    v_unidad   := 'ha';
    v_cantidad := p_hectareas;
  end if;

  if p_id is null then
    insert into public.lotes (empresa_id, nombre, unidad, cantidad, notas, abierto_el, creado_por,
                              cultivo, campana, hectareas, precio_esperado)
    values (
      p_empresa, trim(p_nombre), v_unidad,
      v_cantidad, left(coalesce(p_notas, ''), 500),
      coalesce(p_abierto, public.hoy_empresa(p_empresa)), auth.uid(),
      left(trim(coalesce(p_cultivo, '')), 40), left(trim(coalesce(p_campana, '')), 40),
      p_hectareas, p_precio_esperado
    )
    returning id into v_id;
  else
    update public.lotes set
      nombre          = trim(p_nombre),
      unidad          = v_unidad,
      cantidad        = v_cantidad,
      notas           = left(coalesce(p_notas, ''), 500),
      abierto_el      = coalesce(p_abierto, abierto_el),
      cultivo         = left(trim(coalesce(p_cultivo, '')), 40),
      campana         = left(trim(coalesce(p_campana, '')), 40),
      hectareas       = p_hectareas,
      precio_esperado = p_precio_esperado
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese lote no existe.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

-- ------------------------------------------------------------
-- 10. LA LISTA
--
--    Copia exacta de la 045 más las columnas nuevas y los números de
--    `numeros_de_lote`, que pisan puesto/cobrado/resultado/por_unidad con
--    los mismos valores (o con el rol mirado, para lo nuevo).
-- ------------------------------------------------------------
create or replace function public.listar_lotes(
  p_empresa           uuid,
  p_incluir_cerrados  boolean default false
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_res jsonb; v_hoy date; v_admin boolean;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_hoy   := public.hoy_empresa(p_empresa);
  v_admin := public.es_admin(p_empresa);

  select coalesce(jsonb_agg(x order by x->>'estado', (x->>'abierto_el') desc), '[]'::jsonb)
  into v_res
  from (
    select jsonb_build_object(
      'id',         l.id,
      'nombre',     l.nombre,
      'unidad',     l.unidad,
      'cantidad',   l.cantidad,
      'estado',     l.estado,
      'abierto_el', l.abierto_el,
      'cerrado_el', l.cerrado_el,
      'notas',      l.notas,
      -- Cuánto lleva en curso, o cuánto duró si ya cerró.
      'dias',        (coalesce(l.cerrado_el, v_hoy) - l.abierto_el),
      'movimientos', coalesce(c.movimientos, 0),
      'puesto',      coalesce(c.puesto, 0),
      'cobrado',     coalesce(c.cobrado, 0),
      'resultado',   coalesce(c.cobrado, 0) - coalesce(c.puesto, 0),
      -- Lo que de verdad mira un ganadero: cuánto por cabeza.
      'por_unidad',  case
                       when l.cantidad > 0
                       then round((coalesce(c.cobrado, 0) - coalesce(c.puesto, 0)) / l.cantidad, 2)
                       else null
                     end,
      'cultivo',         l.cultivo,
      'campana',         l.campana,
      'hectareas',       l.hectareas,
      'precio_esperado', l.precio_esperado
    ) || public.numeros_de_lote(l.id, v_admin) as x
    from public.lotes l
    left join lateral (
      select
        count(*)::int as movimientos,
        sum(m.monto) filter (where m.tipo = 'gasto')              as puesto,
        sum(m.monto) filter (where m.tipo in ('venta', 'ingreso')) as cobrado
      from public.movimientos m
      where m.lote_id = l.id and m.estado = 'activo'
    ) c on true
    where l.empresa_id = p_empresa
      and (coalesce(p_incluir_cerrados, false) or l.estado = 'abierto')
  ) s;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 11. UNA CAMPAÑA, CON TODO LO QUE TIENE ADENTRO
--
--    Copia exacta de la 045 más: los números, las cosechas, las
--    liquidaciones, las deudas a cosecha y la estructura de costos por
--    categoría. Los movimientos siguen sin `costo_total` y ahora se filtran
--    con la regla de la 047 para quien no es admin.
-- ------------------------------------------------------------
create or replace function public.resumen_lote(p_empresa uuid, p_lote uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_lote  jsonb; v_movs jsonb; v_hoy date; v_admin boolean;
  v_cosechas jsonb; v_liqs jsonb; v_deudas jsonb; v_estructura jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_hoy   := public.hoy_empresa(p_empresa);
  v_admin := public.es_admin(p_empresa);

  select jsonb_build_object(
    'id', l.id, 'nombre', l.nombre, 'unidad', l.unidad, 'cantidad', l.cantidad,
    'estado', l.estado, 'abierto_el', l.abierto_el, 'cerrado_el', l.cerrado_el,
    'notas', l.notas,
    'dias', (coalesce(l.cerrado_el, v_hoy) - l.abierto_el),
    'cultivo', l.cultivo, 'campana', l.campana,
    'hectareas', l.hectareas, 'precio_esperado', l.precio_esperado
  ) into v_lote
  from public.lotes l where l.id = p_lote and l.empresa_id = p_empresa;

  if v_lote is null then
    raise exception 'Ese lote no existe.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',              m.id,
    'tipo',            m.tipo,
    'estado',          m.estado,
    'fecha',           m.fecha,
    'descripcion',     m.descripcion,
    'categoria',       m.categoria,
    'monto',           m.monto,
    'liquidacion_id',  m.liquidacion_id,
    'reparto_id',      m.reparto_id,
    'monto_original',  m.monto_original,
    'moneda_original', m.moneda_original,
    'cambio',          m.cambio,
    'metodo_pago',     m.metodo_pago
  ) order by m.fecha desc, m.created_at desc), '[]'::jsonb)
  into v_movs
  from public.movimientos m
  where m.lote_id = p_lote and m.empresa_id = p_empresa
    -- La regla de la 047: las ventas son de todos; lo demás, de su autor y
    -- del admin.
    and (v_admin or m.tipo = 'venta' or m.creado_por = auth.uid());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'fecha', c.fecha, 'kg_netos', c.kg_netos, 'kg_brutos', c.kg_brutos,
    'humedad', c.humedad, 'destino', c.destino, 'ticket', c.ticket, 'notas', c.notas,
    'creado_por', c.creado_por
  ) order by c.fecha desc, c.created_at desc), '[]'::jsonb)
  into v_cosechas
  from public.cosechas c
  where c.lote_id = p_lote and c.empresa_id = p_empresa;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'grupo_id', q.grupo_id, 'fecha', q.fecha, 'comprador', q.comprador,
    'kg', q.kg, 'precio_tonelada', q.precio_tonelada,
    'precio_original', q.precio_original, 'moneda_original', q.moneda_original, 'cambio', q.cambio,
    'bruto', q.bruto,
    -- Lo que el silo descontó y compensó cuenta cuánto se debía: de
    -- administración, como las deudas (015).
    'descuentos',       case when v_admin then q.descuentos end,
    'compensado',       case when v_admin then q.compensado end,
    'pagado_con_grano', case when v_admin then q.pagado_con_grano end,
    'neto', q.neto, 'cuenta_id', q.cuenta_id, 'estado', q.estado,
    'movimiento_id', q.movimiento_id, 'notas', q.notas
  ) order by q.fecha desc, q.created_at desc), '[]'::jsonb)
  into v_liqs
  from public.liquidaciones q
  where q.lote_id = p_lote and q.empresa_id = p_empresa;

  if v_admin then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'nombre', d.nombre, 'acreedor', d.acreedor, 'categoria', d.categoria,
      'saldo', d.saldo, 'vence_el', d.vence_el
    ) order by d.vence_el nulls last, d.created_at), '[]'::jsonb)
    into v_deudas
    from public.deudas d
    where d.lote_id = p_lote and d.empresa_id = p_empresa and d.activa and d.saldo > 0;

    select coalesce(jsonb_agg(jsonb_build_object('categoria', s.categoria, 'monto', s.monto)
                              order by s.monto desc, s.categoria), '[]'::jsonb)
    into v_estructura
    from (
      select m.categoria, sum(m.monto) as monto
      from public.movimientos m
      where m.lote_id = p_lote and m.empresa_id = p_empresa
        and m.estado = 'activo' and m.tipo = 'gasto'
      group by m.categoria
    ) s;
  end if;

  return v_lote
    || public.numeros_de_lote(p_lote, v_admin)
    || jsonb_build_object(
         'movimientos',   v_movs,
         'cosechas',      v_cosechas,
         'liquidaciones', v_liqs,
         'deudas',        v_deudas,
         'estructura',    v_estructura
       );
end $fn$;

-- ------------------------------------------------------------
-- 12. BORRAR: SOLO LO QUE NO TIENE HISTORIA
--
--    Copia exacta de la 044 más el freno por cosechas, liquidaciones (de
--    cualquier estado) y deudas (de cualquier estado). El conteo de
--    movimientos queda como está (decisión 11).
-- ------------------------------------------------------------
create or replace function public.borrar_lote(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_cuantos integer;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo administración maneja los lotes.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.lotes where id = p_id and empresa_id = p_empresa) then
    raise exception 'Ese lote no existe.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.cosechas      where lote_id = p_id)
     or exists (select 1 from public.liquidaciones where lote_id = p_id)
     or exists (select 1 from public.deudas        where lote_id = p_id) then
    raise exception 'Ese lote tiene cosechas, liquidaciones o deudas cargadas. Sacáselas antes de borrarlo.'
      using errcode = '23503';
  end if;

  select count(*)::int into v_cuantos
  from public.movimientos where lote_id = p_id;

  if v_cuantos > 0 then
    raise exception 'Ese lote tiene % movimientos cargados. Sacáselos antes de borrarlo.', v_cuantos
      using errcode = '23503';
  end if;

  delete from public.lotes where id = p_id and empresa_id = p_empresa;
  return jsonb_build_object('borrado', true);
end $fn$;

-- ------------------------------------------------------------
-- 13. PONERLE UN MOVIMIENTO, O SACÁRSELO
--
--    Copia exacta de la 044 más: lo que nació dentro de una liquidación no
--    se mueve de campaña suelto, porque dejaría el papel repartido en dos.
-- ------------------------------------------------------------
create or replace function public.asignar_a_lote(
  p_movimiento uuid,
  p_lote       uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_emp uuid; v_estado text; v_liq uuid;
begin
  select empresa_id, estado, liquidacion_id into v_emp, v_estado, v_liq
  from public.movimientos where id = p_movimiento;

  if v_emp is null then
    raise exception 'Ese movimiento no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_emp) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if v_estado <> 'activo' then
    raise exception 'Ese movimiento está anulado.' using errcode = '22023';
  end if;
  if v_liq is not null then
    raise exception 'Ese movimiento es parte de una liquidación: se maneja desde la campaña.' using errcode = '22023';
  end if;

  -- Que el lote sea de la misma empresa lo garantiza la llave compuesta,
  -- pero un error de llave foránea no le explica nada a nadie.
  if p_lote is not null
     and not exists (select 1 from public.lotes where id = p_lote and empresa_id = v_emp) then
    raise exception 'Ese lote no es de esta cuenta.' using errcode = '42501';
  end if;

  update public.movimientos set lote_id = p_lote where id = p_movimiento;

  return jsonb_build_object('lote', p_lote);
end $fn$;

-- ------------------------------------------------------------
-- 14. CREAR UNA DEUDA, AHORA «A COSECHA» DE UNA CAMPAÑA
--
--    Copia exacta de la 015 más `p_lote` y `p_categoria`. La firma de 10
--    se borra antes (096).
-- ------------------------------------------------------------
drop function if exists public.crear_deuda(uuid, text, text, text, numeric, numeric, integer, numeric, date, text);

create or replace function public.crear_deuda(
  p_empresa         uuid,
  p_nombre          text,
  p_tipo            text default 'otro',
  p_acreedor        text default '',
  p_monto           numeric default 0,
  p_saldo           numeric default null,
  p_cuotas_totales  integer default null,
  p_monto_cuota     numeric default null,
  p_vence_el        date default null,
  p_notas           text default '',
  -- La campaña que va a pagar esta deuda («a cosecha»).
  p_lote            uuid default null,
  -- La categoría del gasto que nace al pagarla; '' = 'Deudas'.
  p_categoria       text default ''
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id    uuid;
  v_saldo numeric;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el propietario o un administrador puede cargar deudas.' using errcode = '42501';
  end if;
  if p_tipo not in ('tarjeta', 'prestamo', 'proveedor', 'otro') then
    raise exception 'Tipo de deuda no reconocido.' using errcode = '22023';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'La deuda tiene que tener un monto.' using errcode = '22023';
  end if;

  -- Sin saldo explícito se asume que todavía no se pagó nada. Es lo normal
  -- al cargar una deuda nueva, y evita que alguien la deje en cero sin querer.
  v_saldo := coalesce(p_saldo, p_monto);
  if v_saldo > p_monto then
    raise exception 'El saldo no puede ser mayor que el monto original.' using errcode = '22023';
  end if;

  -- La llave compuesta ya lo frenaría, pero con un error que nadie entiende.
  if p_lote is not null
     and not exists (select 1 from public.lotes where id = p_lote and empresa_id = p_empresa) then
    raise exception 'Ese lote no es de esta cuenta.' using errcode = '42501';
  end if;

  insert into public.deudas (
    empresa_id, tipo, nombre, acreedor, monto_original, saldo,
    cuotas_totales, monto_cuota, vence_el, notas, creada_por,
    lote_id, categoria
  ) values (
    p_empresa, p_tipo::tipo_deuda, trim(p_nombre), coalesce(trim(p_acreedor), ''),
    p_monto, v_saldo, p_cuotas_totales, p_monto_cuota, p_vence_el,
    coalesce(left(p_notas, 500), ''), auth.uid(),
    p_lote, left(trim(coalesce(p_categoria, '')), 60)
  )
  returning id into v_id;

  return v_id;
end $fn$;

-- ------------------------------------------------------------
-- 15. REGISTRAR UN PAGO, DICIENDO CON QUÉ CUENTA, DE QUÉ CAMPAÑA Y DE QUÉ PAPEL
--
--    Copia exacta de la 082 más `p_cuenta`, `p_lote` y `p_liquidacion`. El
--    gasto que crea lleva la categoría y la campaña de la deuda, y el
--    vencimiento de una deuda con campaña no se corre (decisión 7).
--    `anular_pago_deuda` (082) no cambia: deshace este pago igual que
--    cualquier otro. La firma de 6 se borra antes (096).
-- ------------------------------------------------------------
drop function if exists public.registrar_pago_deuda(uuid, numeric, date, boolean, text, text);

create or replace function public.registrar_pago_deuda(
  p_deuda       uuid,
  p_monto       numeric,
  p_fecha       date default null,
  p_crear_gasto boolean default true,
  p_metodo      text default 'efectivo',
  p_nota        text default '',
  -- De qué cuenta salió (095/096). Null = la de su forma de pago (074).
  p_cuenta      uuid default null,
  -- A qué campaña va el gasto, si la deuda no tiene la suya.
  p_lote        uuid default null,
  -- El papel del silo que se cobró esta deuda, si fue así.
  p_liquidacion uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_deuda      public.deudas;
  v_fecha      date;
  v_aplicado   numeric;
  v_movimiento uuid;
  v_pago       uuid;
  v_cuenta     boolean;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_deuda from public.deudas where id = p_deuda;
  if v_deuda.id is null then
    raise exception 'Esa deuda no existe.' using errcode = 'P0002';
  end if;
  if not public.es_admin(v_deuda.empresa_id) then
    raise exception 'Solo el propietario o un administrador puede registrar pagos.' using errcode = '42501';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El pago tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_deuda.saldo <= 0 then
    raise exception 'Esa deuda ya está saldada.' using errcode = '22023';
  end if;

  -- Una cuenta, una campaña o un papel de OTRO negocio no se aceptan: las
  -- llaves lo frenarían igual, pero sin explicar nada.
  if p_cuenta is not null
     and not exists (select 1 from public.cuentas_dinero c
                     where c.id = p_cuenta and c.empresa_id = v_deuda.empresa_id and c.activa) then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;
  if p_lote is not null
     and not exists (select 1 from public.lotes where id = p_lote and empresa_id = v_deuda.empresa_id) then
    raise exception 'Ese lote no es de esta cuenta.' using errcode = '42501';
  end if;
  if p_liquidacion is not null
     and not exists (select 1 from public.liquidaciones
                     where id = p_liquidacion and empresa_id = v_deuda.empresa_id) then
    raise exception 'Esa liquidación no existe.' using errcode = 'P0002';
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(v_deuda.empresa_id));

  -- Nunca más de lo que falta.
  v_aplicado := least(p_monto, v_deuda.saldo);

  -- La misma condición que usa el update de abajo: se decide una vez y se
  -- guarda, para que deshacerlo no tenga que adivinarla.
  v_cuenta := v_deuda.cuotas_totales is not null
              and v_deuda.cuotas_pagadas < v_deuda.cuotas_totales;

  -- El gasto primero: si falla, no queremos haber bajado el saldo. Lleva la
  -- categoría y la campaña de la deuda: así el insumo «a cosecha» cae como
  -- Agroquímicos de Norte el día que se paga, y no como «Deudas» suelto.
  if p_crear_gasto then
    insert into public.movimientos (
      empresa_id, tipo, fecha, descripcion, categoria,
      subtotal, descuento, monto, costo_total, metodo_pago, creado_por,
      lote_id, cuenta_id, liquidacion_id
    ) values (
      v_deuda.empresa_id, 'gasto', v_fecha,
      'Pago ' || v_deuda.nombre, coalesce(nullif(v_deuda.categoria, ''), 'Deudas'),
      v_aplicado, 0, v_aplicado, 0, coalesce(p_metodo, 'efectivo'), auth.uid(),
      coalesce(v_deuda.lote_id, p_lote), p_cuenta, p_liquidacion
    )
    returning id into v_movimiento;
  end if;

  insert into public.pagos_deuda (
    deuda_id, empresa_id, monto, fecha, movimiento_id, nota, creado_por,
    vence_antes, cuota_contada, liquidacion_id
  )
  values (p_deuda, v_deuda.empresa_id, v_aplicado, v_fecha, v_movimiento,
          coalesce(left(p_nota, 300), ''), auth.uid(),
          v_deuda.vence_el, v_cuenta, p_liquidacion)
  returning id into v_pago;

  update public.deudas
  set saldo = saldo - v_aplicado,
      cuotas_pagadas = case when v_cuenta then cuotas_pagadas + 1 else cuotas_pagadas end,
      vence_el = case
        when saldo - v_aplicado <= 0 then null
        -- Una deuda con campaña vence cuando vence la cosecha: un pago
        -- parcial no la corre (decisión 7).
        when v_deuda.lote_id is not null then vence_el
        when vence_el is not null then vence_el + interval '1 month'
        else null
      end,
      updated_at = now()
  where id = p_deuda;

  return jsonb_build_object(
    'pago_id', v_pago,
    'aplicado', v_aplicado,
    'sobrante', greatest(p_monto - v_aplicado, 0),
    'saldo', v_deuda.saldo - v_aplicado,
    'saldada', (v_deuda.saldo - v_aplicado) <= 0,
    'movimiento_id', v_movimiento
  );
end $fn$;

-- ------------------------------------------------------------
-- 16. CARGAR UN TICKET DE BALANZA
--
--    Cualquier miembro: el que pesa el camión puede ser el peón. `p_id` lo
--    genera el celular; un reintento sin señal devuelve el mismo id sin
--    insertar. Se puede cargar en una campaña cerrada: el resultado se
--    corrige igual, como manda la 044.
-- ------------------------------------------------------------
create or replace function public.registrar_cosecha(
  p_empresa   uuid,
  p_lote      uuid,
  p_fecha     date,
  p_kg_netos  numeric,
  p_kg_brutos numeric default null,
  p_humedad   numeric default null,
  p_destino   text default '',
  p_ticket    text default '',
  p_notas     text default '',
  p_id        uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_lote  public.lotes;
  v_emp   uuid;
  v_fecha date;
  v_hoy   date;
  v_id    uuid;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  -- El reintento: mismo id, misma empresa, nada que hacer. En otra
  -- empresa, no existe.
  if p_id is not null then
    select empresa_id into v_emp from public.cosechas where id = p_id;
    if v_emp is not null then
      if v_emp <> p_empresa then
        raise exception 'Esa cosecha no existe.' using errcode = 'P0002';
      end if;
      return p_id;
    end if;
  end if;

  select * into v_lote from public.lotes where id = p_lote and empresa_id = p_empresa;
  if v_lote.id is null then
    raise exception 'Ese lote no es de esta cuenta.' using errcode = '42501';
  end if;

  if coalesce(p_kg_netos, 0) <= 0 then
    raise exception 'Los kilos tienen que ser más que cero.' using errcode = '22023';
  end if;
  if p_kg_brutos is not null and p_kg_brutos < p_kg_netos then
    raise exception 'Los kilos acreditados no pueden ser más que el peso de balanza.' using errcode = '22023';
  end if;
  if p_humedad is not null and (p_humedad < 5 or p_humedad > 40) then
    raise exception 'La humedad tiene que estar entre 5 y 40.' using errcode = '22023';
  end if;

  v_hoy   := public.hoy_empresa(p_empresa);
  v_fecha := coalesce(p_fecha, v_hoy);
  if v_fecha < v_lote.abierto_el or v_fecha > v_hoy + 1 then
    raise exception 'Esa fecha no es válida.' using errcode = '22023';
  end if;

  insert into public.cosechas (
    id, empresa_id, lote_id, fecha, kg_netos, kg_brutos, humedad, destino, ticket, notas, creado_por
  ) values (
    coalesce(p_id, gen_random_uuid()), p_empresa, p_lote, v_fecha,
    round(p_kg_netos, 0), round(p_kg_brutos, 0), p_humedad,
    left(trim(coalesce(p_destino, '')), 80), left(trim(coalesce(p_ticket, '')), 40),
    left(coalesce(p_notas, ''), 300), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $fn$;

-- ------------------------------------------------------------
-- 17. BORRAR UN TICKET
--
--    Delete físico: no guarda plata. Lo borra administración o quien lo
--    cargó (un peón que se equivocó de campaña lo arregla solo).
-- ------------------------------------------------------------
create or replace function public.borrar_cosecha(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_c public.cosechas;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select * into v_c from public.cosechas where id = p_id and empresa_id = p_empresa;
  if v_c.id is null then
    raise exception 'Esa cosecha no existe.' using errcode = 'P0002';
  end if;

  if not public.es_admin(p_empresa) and v_c.creado_por is distinct from auth.uid() then
    raise exception 'Solo quien la cargó o administración puede borrar una cosecha.' using errcode = '42501';
  end if;

  delete from public.cosechas where id = v_c.id;

  return jsonb_build_object('id', v_c.id, 'lote_id', v_c.lote_id);
end $fn$;

-- ------------------------------------------------------------
-- 18. CARGAR EL PAPEL DE LA COOPERATIVA
--
--    UNA transacción para todo el papel. `p_partes` = [{lote_id, kg,
--    descuentos: [{categoria, monto}], deudas: [{deuda_id, monto}],
--    grano: [{categoria, monto, descripcion}]}], 1 a 10 partes, lotes
--    distintos. El prorrateo de descuentos por kilos entre partes lo hace
--    la pantalla (src/lib/liquidacion.ts): acá cada parte ya viene con lo
--    suyo.
--
--    Por parte: `bruto = round(kg × precio / 1000, 2)`; `neto = bruto −
--    Σdescuentos − Σdeudas − Σgrano`, y si da negativo el papel no cuadra.
--    Efecto en la cuenta elegida: +bruto − descuentos − deudas − grano =
--    +neto, lo que dice el papel. En la campaña: cobrado +bruto, puesto
--    +descuentos +grano +deudas compensadas, a_cosecha −deudas. Nada cuenta
--    dos veces.
--
--    Idempotente por `p_grupo`: si el papel ya está, devuelve la misma
--    respuesta reconstruida de las filas y no inserta nada.
-- ------------------------------------------------------------
create or replace function public.registrar_liquidacion(
  p_empresa         uuid,
  p_grupo           uuid,
  p_fecha           date,
  p_comprador       text,
  p_precio_tonelada numeric,
  p_partes          jsonb,
  p_cuenta          uuid default null,
  p_metodo          text default 'transferencia',
  p_notas           text default '',
  p_moneda_original text default null,
  p_precio_original numeric default null,
  p_cambio          numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_grupo       uuid;
  v_hoy         date;
  v_fecha       date;
  v_metodo      text;
  v_comprador   text;
  v_moneda      text;
  v_parte       jsonb;
  v_item        jsonb;
  v_lote        public.lotes;
  v_deuda       public.deudas;
  v_lotes       uuid[] := '{}';
  v_acumulado   jsonb  := '{}'::jsonb;
  v_min_abierto date;
  v_kg          numeric;
  v_monto       numeric;
  v_acum        numeric;
  v_bruto       numeric;
  v_desc        numeric;
  v_comp        numeric;
  v_grano       numeric;
  v_neto        numeric;
  v_cat         text;
  v_venta       uuid;
  v_liq         uuid;
  v_res         jsonb;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo administración carga liquidaciones.' using errcode = '42501';
  end if;

  v_grupo := coalesce(p_grupo, gen_random_uuid());

  -- El reintento sin señal: el papel ya está, se devuelve lo mismo. En otra
  -- empresa, no existe.
  if exists (select 1 from public.liquidaciones where grupo_id = v_grupo) then
    if not exists (select 1 from public.liquidaciones where grupo_id = v_grupo and empresa_id = p_empresa) then
      raise exception 'Esa liquidación no existe.' using errcode = 'P0002';
    end if;
  else
    ---------------------------------------------- lo general del papel
    if p_partes is null or jsonb_typeof(p_partes) <> 'array' or jsonb_array_length(p_partes) = 0 then
      raise exception 'La liquidación necesita al menos una campaña con kilos.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_partes) > 10 then
      raise exception 'Una liquidación no puede tener más de 10 campañas.' using errcode = '22023';
    end if;
    if p_precio_tonelada is null or p_precio_tonelada < 0 then
      raise exception 'El precio no puede ser negativo.' using errcode = '22023';
    end if;

    -- Los mismos métodos que acepta `registrar_venta` menos 'credito': la
    -- coop no paga el día que liquida, pero eso no es un fiado (decisión 18
    -- del contrato: «cargala cuando te acrediten»).
    v_metodo := lower(coalesce(nullif(trim(p_metodo), ''), 'transferencia'));
    if v_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'otro') then
      raise exception 'La forma de cobro no es válida.' using errcode = '22023';
    end if;

    if p_cuenta is not null
       and not exists (select 1 from public.cuentas_dinero c
                       where c.id = p_cuenta and c.empresa_id = p_empresa and c.activa) then
      raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
    end if;

    -- El precio en la otra moneda: los tres datos juntos o ninguno.
    if (p_moneda_original is null) <> (p_precio_original is null)
       or (p_moneda_original is null) <> (p_cambio is null) then
      raise exception 'Para guardar el precio en otra moneda hacen falta la moneda, el precio y el cambio.'
        using errcode = '22023';
    end if;
    if p_moneda_original is not null then
      v_moneda := upper(trim(p_moneda_original));
      if v_moneda not in ('PYG', 'USD', 'ARS', 'BRL', 'EUR') then
        raise exception 'No conocemos esa moneda.' using errcode = '22023';
      end if;
      if p_cambio <= 0 then
        raise exception 'Poné a cuánto está el cambio: sin eso no se puede convertir nada.'
          using errcode = '22023';
      end if;
      if p_precio_original < 0 then
        raise exception 'El precio no puede ser negativo.' using errcode = '22023';
      end if;
    end if;

    v_comprador := left(coalesce(trim(p_comprador), ''), 80);

    ---------------------------------------------- las campañas, y la fecha
    for v_parte in select * from jsonb_array_elements(p_partes) loop
      if jsonb_typeof(v_parte) <> 'object' then
        raise exception 'La liquidación necesita al menos una campaña con kilos.' using errcode = '22023';
      end if;
      select * into v_lote from public.lotes
      where id = nullif(trim(coalesce(v_parte ->> 'lote_id', '')), '')::uuid and empresa_id = p_empresa;
      if v_lote.id is null then
        raise exception 'Ese lote no es de esta cuenta.' using errcode = '42501';
      end if;
      if v_lote.id = any (v_lotes) then
        raise exception 'Cada campaña va una sola vez en la liquidación.' using errcode = '22023';
      end if;
      v_lotes := v_lotes || v_lote.id;
      v_min_abierto := least(coalesce(v_min_abierto, v_lote.abierto_el), v_lote.abierto_el);

      -- Las deudas se validan TODAS acá, antes de escribir nada. Si se
      -- validaran parte por parte, la parte 2 vería el saldo ya rebajado
      -- por el pago de la parte 1 y una deuda repartida entre dos campañas
      -- (3.000 + 1.800 sobre 4.800) se rechazaría aunque cierre. Lo que se
      -- le descuenta a una deuda en todo el papel no puede pasar su saldo;
      -- `for update` la deja trabada hasta que el papel entero esté escrito.
      if jsonb_typeof(v_parte -> 'deudas') = 'array' then
        for v_item in select * from jsonb_array_elements(v_parte -> 'deudas') loop
          select * into v_deuda from public.deudas
          where id = nullif(trim(coalesce(v_item ->> 'deuda_id', '')), '')::uuid
            and empresa_id = p_empresa and activa
          for update;
          if v_deuda.id is null then
            raise exception 'Esa deuda no existe.' using errcode = 'P0002';
          end if;
          v_monto := round(coalesce(nullif(trim(coalesce(v_item ->> 'monto', '')), '')::numeric, 0), 2);
          if v_monto <= 0 then
            raise exception 'El pago tiene que ser mayor que cero.' using errcode = '22023';
          end if;
          v_acum := coalesce((v_acumulado ->> v_deuda.id::text)::numeric, 0) + v_monto;
          if v_acum > v_deuda.saldo then
            raise exception 'Le estás descontando a esa deuda más de lo que debe.' using errcode = '22023';
          end if;
          v_acumulado := v_acumulado || jsonb_build_object(v_deuda.id::text, v_acum);
        end loop;
      end if;
    end loop;

    v_hoy   := public.hoy_empresa(p_empresa);
    v_fecha := coalesce(p_fecha, v_hoy);
    if v_fecha < v_min_abierto or v_fecha > v_hoy + 1 then
      raise exception 'Esa fecha no es válida.' using errcode = '22023';
    end if;

    ---------------------------------------------- parte por parte
    for v_parte in select * from jsonb_array_elements(p_partes) loop
      select * into v_lote from public.lotes
      where id = (v_parte ->> 'lote_id')::uuid and empresa_id = p_empresa;

      v_kg := round(coalesce(nullif(trim(coalesce(v_parte ->> 'kg', '')), '')::numeric, 0), 0);
      if v_kg <= 0 then
        raise exception 'Los kilos tienen que ser más que cero.' using errcode = '22023';
      end if;

      -- Primero se suma y se valida todo lo de la parte; recién después se
      -- escribe. Si algo no cierra, la transacción entera se va.
      v_desc := 0;
      if jsonb_typeof(v_parte -> 'descuentos') = 'array' then
        if jsonb_array_length(v_parte -> 'descuentos') > 12 then
          raise exception 'Una liquidación no puede tener más de 12 descuentos por campaña.' using errcode = '22023';
        end if;
        for v_item in select * from jsonb_array_elements(v_parte -> 'descuentos') loop
          v_monto := round(coalesce(nullif(trim(coalesce(v_item ->> 'monto', '')), '')::numeric, 0), 2);
          if trim(coalesce(v_item ->> 'categoria', '')) = '' or v_monto <= 0 then
            raise exception 'Cada descuento necesita una categoría y un monto mayor que cero.' using errcode = '22023';
          end if;
          v_desc := v_desc + v_monto;
        end loop;
      end if;

      -- Las deudas ya se validaron todas juntas, antes de escribir nada (ver
      -- arriba): acá solo se suma lo que se compensa en esta parte.
      v_comp := 0;
      if jsonb_typeof(v_parte -> 'deudas') = 'array' then
        for v_item in select * from jsonb_array_elements(v_parte -> 'deudas') loop
          v_comp := v_comp + round((v_item ->> 'monto')::numeric, 2);
        end loop;
      end if;

      v_grano := 0;
      if jsonb_typeof(v_parte -> 'grano') = 'array' then
        for v_item in select * from jsonb_array_elements(v_parte -> 'grano') loop
          v_monto := round(coalesce(nullif(trim(coalesce(v_item ->> 'monto', '')), '')::numeric, 0), 2);
          if trim(coalesce(v_item ->> 'categoria', '')) = '' or v_monto <= 0 then
            raise exception 'Cada descuento necesita una categoría y un monto mayor que cero.' using errcode = '22023';
          end if;
          v_grano := v_grano + v_monto;
        end loop;
      end if;

      v_bruto := round(v_kg * p_precio_tonelada / 1000, 2);
      v_neto  := v_bruto - v_desc - v_comp - v_grano;
      if v_neto < 0 then
        raise exception 'La liquidación no cuadra: lo que el silo descontó suma más que el bruto. Bajá lo que compensás de las deudas; lo que falte sigue como deuda.'
          using errcode = '22023';
      end if;

      -- La venta, por el bruto. Directo y no con `registrar_venta` (ver la
      -- cabecera); todas las columnas que ella rellena, más la campaña y la
      -- moneda original.
      insert into public.movimientos (
        empresa_id, tipo, estado, fecha, descripcion, categoria,
        subtotal, descuento, monto, costo_total,
        metodo_pago, contraparte, notas, origen, creado_por, cliente_id, cuenta_id,
        lote_id, monto_original, moneda_original, cambio
      )
      values (
        p_empresa, 'venta', 'activo', v_fecha,
        left(coalesce(nullif(v_lote.cultivo, ''), 'Granos') || ' · ' || v_kg::text || ' kg · ' || v_comprador, 200),
        'Granos',
        v_bruto, 0, v_bruto, 0,
        v_metodo, v_comprador, '', 'manual', auth.uid(), null, p_cuenta,
        v_lote.id,
        case when v_moneda is not null then round(v_kg * p_precio_original / 1000, 2) end,
        v_moneda, p_cambio
      )
      returning id into v_venta;

      insert into public.liquidaciones (
        empresa_id, grupo_id, lote_id, fecha, movimiento_id, comprador,
        kg, precio_tonelada, bruto, descuentos, compensado, pagado_con_grano, neto,
        cuenta_id, moneda_original, precio_original, cambio, notas, creado_por
      ) values (
        p_empresa, v_grupo, v_lote.id, v_fecha, v_venta, v_comprador,
        v_kg, p_precio_tonelada, v_bruto, v_desc, v_comp, v_grano, v_neto,
        p_cuenta, v_moneda, p_precio_original, p_cambio, left(coalesce(p_notas, ''), 300), auth.uid()
      )
      returning id into v_liq;

      update public.movimientos set liquidacion_id = v_liq where id = v_venta;

      -- Lo que el silo descontó: un gasto de la campaña por cada renglón,
      -- con la misma fecha, cuenta y forma de pago que la venta.
      if jsonb_typeof(v_parte -> 'descuentos') = 'array' then
        for v_item in select * from jsonb_array_elements(v_parte -> 'descuentos') loop
          v_cat   := left(trim(v_item ->> 'categoria'), 60);
          v_monto := round((v_item ->> 'monto')::numeric, 2);
          insert into public.movimientos (
            empresa_id, tipo, estado, fecha, descripcion, categoria,
            subtotal, descuento, monto, costo_total,
            metodo_pago, contraparte, notas, origen, creado_por, cuenta_id,
            lote_id, liquidacion_id
          ) values (
            p_empresa, 'gasto', 'activo', v_fecha,
            left(v_cat || ' · liquidación ' || v_comprador, 200), v_cat,
            v_monto, 0, v_monto, 0,
            v_metodo, v_comprador, '', 'manual', auth.uid(), p_cuenta,
            v_lote.id, v_liq
          );
        end loop;
      end if;

      -- Lo que se cobró de las deudas a cosecha: un pago por deuda, que
      -- crea su gasto con la categoría y la campaña de la deuda.
      if jsonb_typeof(v_parte -> 'deudas') = 'array' then
        for v_item in select * from jsonb_array_elements(v_parte -> 'deudas') loop
          perform public.registrar_pago_deuda(
            (v_item ->> 'deuda_id')::uuid,
            round((v_item ->> 'monto')::numeric, 2),
            v_fecha, true, v_metodo,
            'Descontado en la liquidación de ' || v_comprador,
            p_cuenta, v_lote.id, v_liq
          );
        end loop;
      end if;

      -- Lo que el grano pagó (el alquiler en kilos del dueño del campo).
      if jsonb_typeof(v_parte -> 'grano') = 'array' then
        for v_item in select * from jsonb_array_elements(v_parte -> 'grano') loop
          v_cat   := left(trim(v_item ->> 'categoria'), 60);
          v_monto := round((v_item ->> 'monto')::numeric, 2);
          insert into public.movimientos (
            empresa_id, tipo, estado, fecha, descripcion, categoria,
            subtotal, descuento, monto, costo_total,
            metodo_pago, contraparte, notas, origen, creado_por, cuenta_id,
            lote_id, liquidacion_id
          ) values (
            p_empresa, 'gasto', 'activo', v_fecha,
            left(coalesce(nullif(trim(coalesce(v_item ->> 'descripcion', '')), ''), v_cat), 200), v_cat,
            v_monto, 0, v_monto, 0,
            v_metodo, v_comprador, '', 'manual', auth.uid(), p_cuenta,
            v_lote.id, v_liq
          );
        end loop;
      end if;
    end loop;
  end if;

  -- La respuesta sale siempre de las filas: así el reintento devuelve
  -- exactamente lo mismo que la primera vez.
  select jsonb_build_object(
    'grupo_id', v_grupo,
    'bruto',    coalesce(sum(q.bruto), 0),
    'neto',     coalesce(sum(q.neto), 0),
    'liquidaciones', coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'lote_id', q.lote_id, 'movimiento_id', q.movimiento_id,
      'kg', q.kg, 'bruto', q.bruto, 'neto', q.neto
    ) order by q.created_at, q.id), '[]'::jsonb)
  ) into v_res
  from public.liquidaciones q
  where q.grupo_id = v_grupo and q.empresa_id = p_empresa;

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 19. ANULAR EL PAPEL ENTERO
--
--    Todo o nada: la venta, los gastos que nacieron adentro y los pagos de
--    deudas que el silo se cobró (con `anular_pago_deuda`, que devuelve el
--    saldo y anula su gasto). Nada se borra: queda el rastro, y la
--    billetera vuelve sola porque solo suma lo activo.
--
--    Si la venta ya estaba anulada desde el historial, se saltea: el
--    código 23505 es exactamente el que `anular_movimiento` usa para «ya
--    estaba anulado», y no se tapa ningún otro error.
-- ------------------------------------------------------------
create or replace function public.anular_liquidacion(
  p_empresa uuid,
  p_grupo   uuid,
  p_motivo  text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_q       record;
  v_g       record;
  v_p       record;
  v_total   integer;
  v_activas integer;
  v_n       integer := 0;
  v_motivo  text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo administración carga liquidaciones.' using errcode = '42501';
  end if;

  select count(*)::int, (count(*) filter (where estado = 'activa'))::int
  into v_total, v_activas
  from public.liquidaciones
  where grupo_id = p_grupo and empresa_id = p_empresa;

  if v_total = 0 then
    raise exception 'Esa liquidación no existe.' using errcode = 'P0002';
  end if;
  if v_activas = 0 then
    raise exception 'Esa liquidación ya estaba anulada.' using errcode = '22023';
  end if;

  v_motivo := nullif(trim(coalesce(p_motivo, '')), '');

  for v_q in
    select * from public.liquidaciones
    where grupo_id = p_grupo and empresa_id = p_empresa and estado = 'activa'
    for update
  loop
    begin
      perform public.anular_movimiento(v_q.movimiento_id, v_motivo);
    exception when unique_violation then
      null;
    end;

    -- Los gastos del papel (descuentos y grano). Los de los pagos de
    -- deudas los anula `anular_pago_deuda`, abajo.
    for v_g in
      select m.id from public.movimientos m
      where m.liquidacion_id = v_q.id and m.tipo = 'gasto' and m.estado = 'activo'
        and not exists (select 1 from public.pagos_deuda p where p.movimiento_id = m.id)
    loop
      perform public.anular_movimiento(v_g.id, v_motivo);
    end loop;

    -- Un pago anulado se borra (082): el que sigue estando, sigue vivo.
    for v_p in select p.id from public.pagos_deuda p where p.liquidacion_id = v_q.id loop
      perform public.anular_pago_deuda(v_p.id);
    end loop;

    update public.liquidaciones
    set estado = 'anulada', anulada_por = auth.uid(), anulada_at = now()
    where id = v_q.id;

    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('grupo_id', p_grupo, 'anuladas', v_n);
end $fn$;

-- ------------------------------------------------------------
-- 20. PERMISOS
--
--    Cada firma nueva: nada para public ni anon, ejecutar para quien inició
--    sesión. `numeros_de_lote` es interna (ver 8). Las que no cambiaron de
--    firma conservan sus permisos con `create or replace`; se reescriben
--    igual para que esta migración se lea sola.
-- ------------------------------------------------------------
revoke all on function public.guardar_lote(uuid, text, text, numeric, text, uuid, date, text, text, numeric, numeric) from public, anon;
grant execute on function public.guardar_lote(uuid, text, text, numeric, text, uuid, date, text, text, numeric, numeric) to authenticated;

revoke all on function public.listar_lotes(uuid, boolean) from public, anon;
grant execute on function public.listar_lotes(uuid, boolean) to authenticated;

revoke all on function public.resumen_lote(uuid, uuid) from public, anon;
grant execute on function public.resumen_lote(uuid, uuid) to authenticated;

revoke all on function public.borrar_lote(uuid, uuid) from public, anon;
grant execute on function public.borrar_lote(uuid, uuid) to authenticated;

revoke all on function public.asignar_a_lote(uuid, uuid) from public, anon;
grant execute on function public.asignar_a_lote(uuid, uuid) to authenticated;

revoke all on function public.crear_deuda(uuid, text, text, text, numeric, numeric, integer, numeric, date, text, uuid, text) from public, anon;
grant execute on function public.crear_deuda(uuid, text, text, text, numeric, numeric, integer, numeric, date, text, uuid, text) to authenticated;

revoke all on function public.registrar_pago_deuda(uuid, numeric, date, boolean, text, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.registrar_pago_deuda(uuid, numeric, date, boolean, text, text, uuid, uuid, uuid) to authenticated;

revoke all on function public.registrar_cosecha(uuid, uuid, date, numeric, numeric, numeric, text, text, text, uuid) from public, anon;
grant execute on function public.registrar_cosecha(uuid, uuid, date, numeric, numeric, numeric, text, text, text, uuid) to authenticated;

revoke all on function public.borrar_cosecha(uuid, uuid) from public, anon;
grant execute on function public.borrar_cosecha(uuid, uuid) to authenticated;

revoke all on function public.registrar_liquidacion(uuid, uuid, date, text, numeric, jsonb, uuid, text, text, text, numeric, numeric) from public, anon;
grant execute on function public.registrar_liquidacion(uuid, uuid, date, text, numeric, jsonb, uuid, text, text, text, numeric, numeric) to authenticated;

revoke all on function public.anular_liquidacion(uuid, uuid, text) from public, anon;
grant execute on function public.anular_liquidacion(uuid, uuid, text) to authenticated;
