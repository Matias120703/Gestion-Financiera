-- ============================================================
-- 132 · LO QUE TENÉS Y NO ES PLATA (EL PATRIMONIO)
-- ============================================================
--
-- Matías (07/10/2026), después de pedir las cuentas en dólares (131):
-- «También tiene que ver lo que sería patrimonios; por ejemplo, un auto, un
-- terreno, lo que sea.» Quiere anotar lo que tiene y no es plata, con su
-- valor, y ver cuánto tiene en total.
--
-- Hasta acá Orden sabía cuánta plata hay en cada cuenta, cuánto te deben,
-- cuánto debés y cuánta mercadería hay, cada cosa en su pantalla. No sabía
-- del auto ni del terreno, y nada juntaba todo. Desde acá hay una lista de
-- «lo que tenés» y una lectura (`patrimonio`) que devuelve todas las partes.
--
-- LO QUE CONFIRMÓ MATÍAS (08/10/2026, «sí a todo» a las cuatro preguntas)
--
-- El encargo de construcción da estas decisiones por confirmadas. ANTES DE
-- APLICAR ESTA MIGRACIÓN EN PRODUCCIÓN, QUE CONSTE DE ÉL: acá no se aplicó
-- nada. De las cuatro, las tres que tocan a esta entrega:
--
--   1. La cotización la escribe la persona (la misma tabla de la 131). Orden
--      no la baja de internet.
--   2. «Tengo en total» = plata + lo que te deben + la mercadería a precio
--      de costo + lo que tenés − lo que debés.
--   3. Es la SEGUNDA entrega: viene después de las cuentas en otra moneda,
--      que ya están en producción.
--
-- LA REGLA: UNA FOTO, NO UNA PELÍCULA
--
--   UN BIEN ES UNA ANOTACIÓN CON UN VALOR. Nunca crea un movimiento, nunca
--   mueve una cuenta ni un ajuste, nunca entra en la ganancia, en
--   «Disponible», en un reporte, en el Excel, en el panel, en un aviso ni en
--   el resumen semanal. Ninguna función de acá escribe en otra tabla que
--   `bienes`.
--
--   El total suma ESTADOS (cuánto hay hoy en cada cuenta, cuánto vale hoy
--   cada cosa, cuánto te deben, cuánto debés), no hechos. Sumando estados no
--   se cuenta nada dos veces: quien compró el auto y cargó el gasto ya tiene
--   la cuenta más baja, y el auto entra hoy con lo que vale. Por eso no hay
--   «cuenta de origen» ni «valor de compra»: cada vínculo entre un bien y
--   una cuenta sería una manera nueva de que algo no cierre.
--
--   NUNCA SE SUMAN MONEDAS DISTINTAS. `patrimonio` devuelve cada parte en su
--   moneda, sin convertir. El único número convertido es «Tengo en total ≈»,
--   y lo arma la pantalla con la cotización que escribió la persona
--   (`cotizaciones_moneda`, 131). La base no convierte nada.
--
--   Es simétrico: un negocio en dólares con un campo anotado en guaraníes es
--   el mismo caso. La moneda de cada bien va SIEMPRE escrita: si un negocio
--   sin movimientos corrige su moneda (051), su terreno no se reetiqueta.
--
-- NO TOCA NADA DE LO QUE EXISTE
--
--   · Una tabla nueva (`bienes`), su candado (`cuenta_activa_bienes`, con la
--     función de siempre) y CUATRO FUNCIONES NUEVAS: `guardar_bien`,
--     `actualizar_valor_bien`, `quitar_bien` y `patrimonio`.
--   · NO VUELVE A DEFINIR NINGUNA FUNCIÓN: ni la billetera, ni el fiado, ni
--     las deudas, ni el resumen personal, ni los candados, ni «empezar de
--     cero». No agrega una columna, una restricción ni un disparador a
--     ninguna tabla que ya exista, y no cambia el permiso de nadie sobre
--     nada que ya exista.
--   · `patrimonio` LEE lo de siempre, para dar el mismo número que la
--     persona ya ve en otra pantalla, y lo lee PREGUNTÁNDOLE a la función
--     que ya lo calcula: la plata por moneda y las cotizaciones a
--     `billetera`, lo que te deben a `resumen_fiado` y lo que debés a
--     `resumen_deudas`. Repite solo dos cuentas cortas que no tienen a quién
--     preguntarle: lo guardado (la de `ahorro_total`, 073) y la mercadería
--     (la de «Invertido en stock» de Productos, que hoy vive en la
--     pantalla). No suma el saldo de ninguna cuenta por su lado.
--     pruebas/bienes.test.js compara cada uno de esos números con el suyo.
--   · SE APLICA ANTES QUE EL CÓDIGO y con el código publicado no cambia nada
--     para nadie: el código publicado no conoce la tabla ni las funciones, y
--     nada de lo que conoce se movió. Mientras no se publique el código
--     nuevo nadie puede anotar un bien.
--
--   pruebas/bienes.test.js lo demuestra en una base armada como producción
--   (con los privilegios por defecto de Supabase desde antes de la 001): al
--   aplicar esta migración, del catálogo entero solo APARECEN la tabla y las
--   cuatro funciones; cada función, tabla, columna, restricción, disparador,
--   política, índice y permiso que existía queda idéntico, y todo lo que lee
--   el código publicado da lo mismo carácter por carácter.
--
-- SI HAY QUE VOLVER ATRÁS
--
--   · VOLVER AL CÓDIGO ANTERIOR DEJANDO LA 132 APLICADA: se puede siempre y
--     es lo que hay que hacer primero. El código de antes no lee `bienes`:
--     lo anotado queda guardado y nadie lo ve hasta que vuelva el código.
--   · SACAR LA 132 DE LA BASE: con supabase/vuelta-atras/132_vuelta_atras.sql
--     (fuera de migrations a propósito: lo que hay ahí va a parar a
--     schema.sql). Borra las cuatro funciones y la tabla, y nada más: no hay
--     otra cosa que devolver a como estaba, porque esta migración no tocó
--     otra cosa.
--   · LO ÚNICO QUE SE PUEDE PERDER son las anotaciones. Por eso ese archivo
--     mira primero: si hay algo anotado (también lo ya quitado), SE NIEGA y
--     no toca nada. No hay saldo, movimiento ni reporte que dependa de un
--     bien: con la 132 puesta y sin el código, la base es la de antes.
--
-- CÓMO ESTÁ ESCRITA
--
--   Sin barras invertidas (el MCP las duplica al aplicar) y se puede aplicar
--   las veces que haga falta: deja lo mismo.
-- ============================================================

-- ------------------------------------------------------------
-- 0. LA GUARDA: sin la billetera en otras monedas (131) y sin lo que lee
--    `patrimonio`, esta migración no tiene sobre qué pararse. Las funciones
--    se revisan recién al usarlas: sin esto se aplicaría sin error y
--    fallaría la primera vez que alguien abra su billetera.
-- ------------------------------------------------------------
do $guarda$
begin
  if to_regclass('public.cotizaciones_moneda') is null
     or to_regclass('public.cuentas_dinero') is null
     or to_regclass('public.ahorros') is null
     or to_regclass('public.movimientos_ahorro') is null
     or to_regclass('public.productos') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'cuentas_dinero' and column_name = 'moneda')
     or to_regprocedure('public.billetera(uuid)') is null
     or to_regprocedure('public.saldo_ahorro(uuid)') is null
     or to_regprocedure('public.resumen_fiado(uuid)') is null
     or to_regprocedure('public.resumen_deudas(uuid)') is null
     or to_regprocedure('public.exigir_cuenta_activa()') is null
     or to_regprocedure('public.es_admin(uuid)') is null
     or to_regprocedure('public.hoy_empresa(uuid)') is null
     or to_regprocedure('public.decimales_de(text)') is null then
    raise exception 'Falta aplicar las migraciones de la billetera, el fiado y las deudas (hasta la 131) antes que la 132.';
  end if;
end $guarda$;

-- ------------------------------------------------------------
-- 1. LO QUE TENÉS
--
--    Una fila por cosa: qué es, cuánto vale hoy según quien la anota, en qué
--    moneda y de cuándo es esa estimación.
--
--    · La moneda va SIEMPRE escrita (no hay «null = la del negocio»): es una
--      tabla nueva, sin nada viejo que cuidar, y así un cambio de moneda del
--      negocio no le cambia la etiqueta a un terreno.
--    · Sin ningún vínculo con movimientos ni con cuentas: un bien no sabe de
--      qué cuenta salió la plata. «Empezar de cero» no lo toca (queda, como
--      las cuentas, los ahorros y las deudas).
--    · NUNCA SE BORRA UNA FILA: «ya no lo tengo» apaga `activo` y anota por
--      qué (`baja`) y cuándo (`baja_el`). Como es un UPDATE, el candado del
--      negocio vencido y el de la personal en Gratis lo cubren solos.
--    · No se lee ni se escribe directo: solo por las funciones de abajo.
--    · Nace cerrada para el negocio vencido y para la personal en Gratis: es
--      el mismo candado de toda la billetera (110, 111).
-- ------------------------------------------------------------
create table if not exists public.bienes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nombre      text not null check (char_length(trim(nombre)) between 1 and 60),
  tipo        text not null default 'otro'
              check (tipo in ('vehiculo', 'terreno', 'casa', 'maquina', 'animales', 'otro')),
  valor       numeric(14,2) not null check (valor > 0),
  moneda      text not null check (moneda in ('PYG', 'USD', 'ARS', 'BRL', 'EUR')),
  valor_al    date not null,
  nota        text not null default '' check (char_length(nota) <= 200),
  activo      boolean not null default true,
  baja        text check (baja is null or baja in ('vendido', 'quitado')),
  baja_el     date,
  creado_por  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Lo que está en la lista no tiene baja; lo que salió dice por qué y cuándo.
  constraint bienes_baja_coherente
    check ((activo and baja is null and baja_el is null)
           or (not activo and baja is not null and baja_el is not null))
);

create index if not exists bienes_empresa_idx on public.bienes (empresa_id) where activo;

alter table public.bienes enable row level security;
revoke all on public.bienes from anon, authenticated;

drop trigger if exists cuenta_activa_bienes on public.bienes;
create trigger cuenta_activa_bienes
  before insert or update on public.bienes
  for each row execute function public.exigir_cuenta_activa();

comment on table public.bienes is
  'Lo que la persona tiene y no es plata (un auto, un terreno), con el valor que ella calcula. Una anotación: no crea movimientos ni mueve cuentas (132).';
comment on column public.bienes.valor is
  'Cuánto vale hoy según quien lo anota, en `moneda`. Una estimación, no un precio de compra (132).';
comment on column public.bienes.moneda is
  'En qué moneda está el valor. Siempre escrita: no sigue a la moneda del negocio (132).';
comment on column public.bienes.valor_al is
  'De qué día es la estimación: el de la última vez que se escribió el valor (132).';
comment on column public.bienes.baja is
  'Por qué salió de la lista: vendido o quitado. Null mientras está (132).';

-- ------------------------------------------------------------
-- 2. ANOTAR ALGO QUE TENÉS, O CORREGIR CÓMO SE LLAMA
--
--    · ALTA (`p_id` en null): nombre, tipo, valor y moneda. La moneda vacía
--      es la del negocio. El valor se redondea a los decimales de SU moneda
--      (un terreno en dólares lleva centavos; un auto en guaraníes, no) y
--      queda con la fecha de hoy. Hasta 100 cosas en la lista.
--    · EDICIÓN (`p_id`): cambia el nombre, el tipo y la nota. EL VALOR Y LA
--      MONEDA NO SE TOCAN ACÁ aunque lleguen: cambiar cuánto vale es
--      `actualizar_valor_bien`, que además le pone la fecha de hoy. Así
--      corregir una letra del nombre no hace parecer nueva una estimación
--      vieja.
--
--    No pregunta de qué cuenta salió la plata y no escribe en ninguna otra
--    tabla.
-- ------------------------------------------------------------
create or replace function public.guardar_bien(
  p_empresa uuid,
  p_nombre  text,
  p_tipo    text default 'otro',
  p_valor   numeric default null,
  p_moneda  text default null,
  p_nota    text default '',
  p_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_nombre text;
  v_tipo   text;
  v_nota   text;
  v_propia text;
  v_moneda text;
  v_valor  numeric;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  -- Hasta sesenta letras: lo que sobre se corta, no es motivo para no guardar.
  v_nombre := trim(left(trim(coalesce(p_nombre, '')), 60));
  if char_length(v_nombre) = 0 then
    raise exception 'Ponele un nombre, para saber qué es.' using errcode = '22023';
  end if;

  -- Sin tipo es «otro», que es para lo que está.
  v_tipo := coalesce(nullif(trim(coalesce(p_tipo, '')), ''), 'otro');
  if v_tipo not in ('vehiculo', 'terreno', 'casa', 'maquina', 'animales', 'otro') then
    raise exception 'Ese tipo de bien no existe.' using errcode = '22023';
  end if;

  v_nota := left(trim(coalesce(p_nota, '')), 200);

  if p_id is not null then
    update public.bienes
    set nombre = v_nombre, tipo = v_tipo, nota = v_nota, updated_at = now()
    where id = p_id and empresa_id = p_empresa and activo
    returning id into v_id;

    if v_id is null then
      raise exception 'Eso ya no está en tu lista.' using errcode = 'P0002';
    end if;

    return v_id;
  end if;

  select e.moneda into v_propia from public.empresas e where e.id = p_empresa;
  v_moneda := coalesce(nullif(upper(trim(coalesce(p_moneda, ''))), ''), v_propia);
  if v_moneda is null or v_moneda not in ('PYG', 'USD', 'ARS', 'BRL', 'EUR') then
    raise exception 'No conocemos esa moneda.' using errcode = '22023';
  end if;

  -- Con los decimales de su moneda. Lo que redondea a cero no es un valor.
  v_valor := round(p_valor, public.decimales_de(v_moneda));
  if v_valor is null or v_valor <= 0 then
    raise exception 'Poné cuánto vale hoy, aunque sea un aproximado.' using errcode = '22023';
  end if;
  if v_valor >= 1000000000000 then
    raise exception 'Ese monto es demasiado grande. Revisá los ceros.' using errcode = '22023';
  end if;

  if (select count(*) from public.bienes where empresa_id = p_empresa and activo) >= 100 then
    raise exception 'Ya tenés 100 cosas anotadas. Quitá alguna antes de sumar otra.' using errcode = '22023';
  end if;

  insert into public.bienes (empresa_id, nombre, tipo, valor, moneda, valor_al, nota, creado_por)
  values (p_empresa, v_nombre, v_tipo, v_valor, v_moneda, public.hoy_empresa(p_empresa), v_nota, auth.uid())
  returning id into v_id;

  return v_id;
end $fn$;

-- En Supabase toda función nueva nace ejecutable por public, anon,
-- authenticated y service_role (129, 131). Se nombra, uno por uno, a quien
-- no la tiene que llamar: lo que tenés es de la sesión de quien administra.
revoke all on function public.guardar_bien(uuid, text, text, numeric, text, text, uuid) from public, anon, service_role;
grant execute on function public.guardar_bien(uuid, text, text, numeric, text, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. ACTUALIZAR CUÁNTO VALE
--
--    Escribe el valor nuevo y le pone la fecha de hoy: la lista dice «valor
--    del 7 oct» y avisa cuando una estimación quedó vieja. Con `p_moneda`
--    cambia también la moneda: sirve para pasar a dólares un terreno que se
--    anotó en guaraníes. La base no convierte: el número nuevo lo escribe la
--    persona, en la moneda que diga.
--
--    Devuelve lo que valía y lo que vale. No guarda historial.
-- ------------------------------------------------------------
create or replace function public.actualizar_valor_bien(
  p_empresa uuid,
  p_id      uuid,
  p_valor   numeric,
  p_moneda  text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes  public.bienes%rowtype;
  v_moneda text;
  v_valor  numeric;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  select * into v_antes from public.bienes b
  where b.id = p_id and b.empresa_id = p_empresa and b.activo
  for update;

  if not found then
    raise exception 'Eso ya no está en tu lista.' using errcode = 'P0002';
  end if;

  -- Sin moneda, queda en la que estaba.
  v_moneda := coalesce(nullif(upper(trim(coalesce(p_moneda, ''))), ''), v_antes.moneda);
  if v_moneda not in ('PYG', 'USD', 'ARS', 'BRL', 'EUR') then
    raise exception 'No conocemos esa moneda.' using errcode = '22023';
  end if;

  v_valor := round(p_valor, public.decimales_de(v_moneda));
  if v_valor is null or v_valor <= 0 then
    raise exception 'Poné cuánto vale hoy, aunque sea un aproximado.' using errcode = '22023';
  end if;
  if v_valor >= 1000000000000 then
    raise exception 'Ese monto es demasiado grande. Revisá los ceros.' using errcode = '22023';
  end if;

  update public.bienes
  set valor = v_valor, moneda = v_moneda, valor_al = public.hoy_empresa(p_empresa), updated_at = now()
  where id = v_antes.id;

  return jsonb_build_object(
    'antes', v_antes.valor,
    'antes_moneda', v_antes.moneda,
    'ahora', v_valor,
    'moneda', v_moneda
  );
end $fn$;

revoke all on function public.actualizar_valor_bien(uuid, uuid, numeric, text) from public, anon, service_role;
grant execute on function public.actualizar_valor_bien(uuid, uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 4. YA NO LO TENGO
--
--    «Lo vendí» o «sacarlo de la lista». La fila queda, apagada: sale de la
--    lista y del total. NO ANOTA NINGÚN INGRESO: si vendiéndolo entró plata,
--    la persona la anota donde siempre (un ingreso, o ajustar el saldo de la
--    cuenta), y la pantalla se lo recuerda.
-- ------------------------------------------------------------
create or replace function public.quitar_bien(
  p_empresa uuid,
  p_id      uuid,
  p_motivo  text default 'quitado'
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_motivo text;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar esto.' using errcode = '42501';
  end if;

  v_motivo := coalesce(nullif(trim(coalesce(p_motivo, '')), ''), 'quitado');
  if v_motivo not in ('vendido', 'quitado') then
    raise exception 'Ese motivo no existe.' using errcode = '22023';
  end if;

  update public.bienes
  set activo = false, baja = v_motivo, baja_el = public.hoy_empresa(p_empresa), updated_at = now()
  where id = p_id and empresa_id = p_empresa and activo
  returning id into v_id;

  if v_id is null then
    raise exception 'Eso ya no está en tu lista.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.quitar_bien(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.quitar_bien(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 5. TODO LO QUE TENÉS Y LO QUE DEBÉS, CADA PARTE EN SU MONEDA
--
--    Solo lee. Devuelve las partes de «Tengo en total» SIN SUMARLAS ENTRE
--    MONEDAS Y SIN CONVERTIR NADA: la cuenta la hace la pantalla, con la
--    cotización que escribió la persona, y siempre con «≈».
--
--      moneda             la del negocio
--      bienes             la lista: id, nombre, tipo, valor, moneda,
--                         valor_al, nota (solo lo que sigue en la lista, en
--                         el orden en que se anotó)
--      bienes_por_moneda  un total POR MONEDA de esa lista
--      plata              un total POR MONEDA de lo que hay en las cuentas.
--                         Primero la del negocio, que está siempre (en cero
--                         si no hay cuentas en ella); después las otras, por
--                         código. La plata sin cuenta no entra, igual que
--                         en «Tu plata».
--      plata_de_ahorros   ver abajo
--      ahorro_apartado    de esa plata, cuánto está guardado en fondos
--      te_deben           lo que te deben
--      mercaderia         la mercadería, a precio de costo
--      debes              lo que debés
--      cotizaciones       lo que escribió la persona, con su fecha (131)
--
--    `te_deben`, `mercaderia`, `debes` y `ahorro_apartado` están en la moneda
--    del negocio. En `bienes_por_moneda` también va primero la del negocio.
--
--    CADA NÚMERO ES EL QUE LA PERSONA YA VE EN OTRA PANTALLA, y para eso no
--    se copia ninguna cuenta que ya exista en una función: se le PREGUNTA a
--    la función.
--
--      · La plata y las cotizaciones, a `billetera`: `total` es la moneda
--        del negocio y `totales_otras` las demás. Acá no se suma el saldo
--        de ninguna cuenta: las únicas funciones que suman saldos siguen
--        siendo `billetera` y `resumen_personal` (131), y las dos ya van
--        por moneda.
--      · Lo que te deben, a `resumen_fiado` (su `total`).
--      · Lo que debés, a `resumen_deudas` (su `total_debido`).
--
--    Dos cuentas no tienen a quién preguntarle sin traer otras doscientas
--    líneas, y se repiten acá con su regla:
--
--      · Lo guardado: la de `ahorro_total` de `resumen_personal` (073).
--      · La mercadería: la de «Invertido en stock» de la pantalla de
--        Productos, que hoy solo existe en la pantalla: stock × costo de lo
--        que lleva stock, está activo y tiene costo cargado. Un stock en
--        negativo resta, igual que allá.
--
--    LOS AHORROS NO SE SUMAN. Guardar en un fondo no saca plata de ninguna
--    cuenta (085): lo guardado ya está adentro de «plata». Va aparte, en
--    `ahorro_apartado`, para decir «de eso, guardado».
--
--    LA ÚNICA EXCEPCIÓN, la misma de la 085: quien no tiene NINGUNA cuenta
--    en su billetera pero sí fondos. Sin cuentas la plata sería cero
--    teniendo ahorros, así que su plata SON sus fondos, cada uno en la
--    moneda del fondo (`saldo_ahorro`), y `plata_de_ahorros` va en true. Ahí
--    `ahorro_apartado` va en cero: no hay un «de eso», es todo.
--    Con una sola cuenta, en la moneda que sea, vale la regla de arriba:
--    nunca se mezclan cuentas y fondos, que sería contar dos veces.
--
--    No entran solos el ganado, el grano ni los lotes (Orden sabe cuánta
--    plata se les puso, no cuánto valen: quien quiera los anota como un
--    bien), ni lo que deben los alumnos.
-- ------------------------------------------------------------
create or replace function public.patrimonio(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_propia     text;
  v_bienes     jsonb;
  v_por_moneda jsonb;
  v_billetera  jsonb;
  v_plata      jsonb;
  v_de_ahorros boolean;
  v_apartado   numeric := 0;
  v_te_deben   numeric;
  v_mercaderia numeric;
  v_debes      numeric;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';
  end if;

  select e.moneda into v_propia from public.empresas e where e.id = p_empresa;

  -- LO QUE TENÉS: lo que sigue en la lista, en el orden en que se anotó.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'nombre', b.nombre,
    'tipo', b.tipo,
    'valor', b.valor,
    'moneda', b.moneda,
    'valor_al', b.valor_al,
    'nota', b.nota
  ) order by b.created_at, b.id), '[]'::jsonb)
  into v_bienes
  from public.bienes b
  where b.empresa_id = p_empresa and b.activo;

  -- Un total por moneda. Se agrupa por moneda: nunca se suman dos distintas.
  select coalesce(jsonb_agg(jsonb_build_object('moneda', t.moneda, 'total', t.total)
                            order by (t.moneda <> v_propia), t.moneda), '[]'::jsonb)
  into v_por_moneda
  from (select b.moneda, sum(b.valor) as total
        from public.bienes b
        where b.empresa_id = p_empresa and b.activo
        group by b.moneda) t;

  -- LA PLATA: lo que dice la billetera, que ya lo trae por moneda.
  v_billetera := public.billetera(p_empresa);

  -- Sin ninguna cuenta en la billetera y con fondos, la plata son los fondos.
  v_de_ahorros :=
    jsonb_array_length(coalesce(v_billetera -> 'cuentas', '[]'::jsonb))
      + jsonb_array_length(coalesce(v_billetera -> 'cuentas_otras', '[]'::jsonb)) = 0
    and exists (select 1 from public.ahorros a where a.empresa_id = p_empresa and a.activo);

  if v_de_ahorros then
    -- Cada fondo en la moneda del fondo (null = la del negocio).
    select coalesce(jsonb_agg(jsonb_build_object('moneda', t.moneda, 'total', t.total)
                              order by (t.moneda <> v_propia), t.moneda), '[]'::jsonb)
    into v_plata
    from (select x.moneda, sum(x.total) as total
          from (select v_propia as moneda, 0::numeric as total
                union all
                select coalesce(a.moneda, v_propia), public.saldo_ahorro(a.id)
                from public.ahorros a
                where a.empresa_id = p_empresa and a.activo) x
          group by x.moneda) t;
  else
    -- El total de la billetera en la moneda del negocio y, aparte, el de
    -- cada otra moneda. Se agrupa por moneda: una sola fila por cada una.
    select coalesce(jsonb_agg(jsonb_build_object('moneda', t.moneda, 'total', t.total)
                              order by (t.moneda <> v_propia), t.moneda), '[]'::jsonb)
    into v_plata
    from (select x.moneda, sum(x.total) as total
          from (select v_propia as moneda, coalesce((v_billetera ->> 'total')::numeric, 0) as total
                union all
                select o ->> 'moneda', (o ->> 'total')::numeric
                from jsonb_array_elements(coalesce(v_billetera -> 'totales_otras', '[]'::jsonb)) o) x
          group by x.moneda) t;

    -- Lo guardado en fondos: la cuenta de `ahorro_total` (073), en la moneda
    -- del negocio. Está adentro de la plata de arriba: no se suma.
    select coalesce(sum(case when ma.tipo = 'aporte' then coalesce(ma.monto_local, ma.monto)
                             else -coalesce(ma.monto_local, ma.monto) end), 0)
    into v_apartado
    from public.movimientos_ahorro ma
    where ma.empresa_id = p_empresa;
  end if;

  -- LO QUE TE DEBEN y LO QUE DEBÉS: se les pregunta a las funciones de
  -- siempre, para que el número sea el de sus pantallas hoy y mañana.
  v_te_deben := coalesce((public.resumen_fiado(p_empresa) ->> 'total')::numeric, 0);
  v_debes    := coalesce((public.resumen_deudas(p_empresa) ->> 'total_debido')::numeric, 0);

  -- LA MERCADERÍA, a precio de costo: lo que lleva stock, está activo y
  -- tiene costo cargado. La regla de «Invertido en stock» de Productos.
  select coalesce(sum(p.stock * p.costo), 0)
  into v_mercaderia
  from public.productos p
  where p.empresa_id = p_empresa and p.activo and p.controla_stock and p.costo > 0;

  return jsonb_build_object(
    'moneda', v_propia,
    'bienes', v_bienes,
    'plata', v_plata,
    'plata_de_ahorros', v_de_ahorros,
    'ahorro_apartado', v_apartado,
    'te_deben', v_te_deben,
    'mercaderia', v_mercaderia,
    'bienes_por_moneda', v_por_moneda,
    'debes', v_debes,
    -- Las mismas que muestra la billetera: a cuánto puso cada moneda, y cuándo.
    'cotizaciones', coalesce(v_billetera -> 'cotizaciones', '[]'::jsonb)
  );
end $fn$;

revoke all on function public.patrimonio(uuid) from public, anon, service_role;
grant execute on function public.patrimonio(uuid) to authenticated;
