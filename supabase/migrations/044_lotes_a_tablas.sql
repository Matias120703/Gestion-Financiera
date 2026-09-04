-- ORDEN · Migración 044 · Lotes: lo que tarda meses en dar ganancia
--
-- Hay negocios donde la pregunta «¿cómo me fue hoy?» no significa nada. El
-- ganadero compra cuarenta novillos en marzo, les pone plata todos los meses
-- —alimento, sanidad, flete— y recién los vende en octubre. El agricultor
-- siembra, gasta toda la campaña y cobra una vez. El de la obra compra
-- materiales y paga jornales durante cuatro meses.
--
-- Para los tres, el día es la unidad equivocada: durante siete meses el
-- sistema les muestra pura pérdida, y un día muestran una ganancia enorme.
-- Ninguna de las dos cosas es verdad. La verdad es del CICLO, no del día.
--
-- POR QUÉ SE LLAMA «LOTE» Y NO «HACIENDA» NI «OBRA»
--
-- Porque es el mismo problema en los tres rubros, y el módulo se llama como
-- el problema. Cuarenta novillos, una hectárea de soja y la casa de Pérez son
-- la misma forma: algo que se abre, junta costos durante meses, y recién al
-- cerrarse dice si ganaste. Construirlo tres veces con tres nombres sería
-- mantener el mismo bug en tres lugares.
--
-- CÓMO SE ENGANCHA: POR EL MOVIMIENTO, COMO TODO
--
-- Un lote no tiene su propia contabilidad. No guarda montos, ni totales, ni
-- una caja aparte. Lo único que se agrega al núcleo es UNA COLUMNA en
-- `movimientos`: de qué lote es este gasto, de qué lote es esta venta.
--
-- Eso es lo que hace que todo lo que ya existe siga funcionando sin tocarlo.
-- Comprar los novillos sigue siendo un gasto de marzo —tu plata bajó en
-- marzo, y eso es cierto—; venderlos sigue siendo una venta de octubre.
-- Anular una compra sigue siendo `anular_movimiento`. El panel, el Excel y
-- el cierre no se enteran de que existen los lotes.
--
-- Lo que el lote agrega es la OTRA vista de la misma plata: «este lote lleva
-- siete millones puestos y todavía no vendí nada».

-- ============================================================
-- 1. EL LOTE
-- ============================================================
create table if not exists public.lotes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nombre      text not null check (char_length(trim(nombre)) between 1 and 80),
  -- Qué se cuenta: cabezas, hectáreas, o nada (una obra no se mide así).
  unidad      text not null default '' check (char_length(unidad) <= 20),
  cantidad    numeric(14,2) not null default 0 check (cantidad >= 0),
  estado      text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  abierto_el  date not null,
  cerrado_el  date,
  notas       text not null default '' check (char_length(notas) <= 500),
  creado_por  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),

  -- Un lote cerrado tiene fecha de cierre y uno abierto no. Sin esto queda
  -- la puerta abierta a un lote «cerrado» sin decir cuándo, que después no
  -- se puede ordenar ni comparar con nada.
  constraint lote_cierre_coherente check (
    (estado = 'abierto' and cerrado_el is null)
    or (estado = 'cerrado' and cerrado_el is not null)
  ),
  constraint lote_no_cierra_antes_de_abrir check (
    cerrado_el is null or cerrado_el >= abierto_el
  )
);

create index if not exists lotes_empresa_idx on public.lotes (empresa_id, estado, abierto_el desc);

-- La clave que permite la llave foránea compuesta de más abajo. No es un
-- índice de rendimiento: es lo que hace estructuralmente imposible colgar un
-- movimiento del lote de otra empresa.
create unique index if not exists lotes_id_empresa_idx on public.lotes (id, empresa_id);

alter table public.lotes enable row level security;

-- Los lee cualquier miembro: para cargarle un gasto a un lote hay que poder
-- elegirlo de una lista. La tabla no guarda ni un monto, así que verla no
-- muestra plata; los números salen de las funciones de la 045, que sí miran
-- el rol antes de contestar.
drop policy if exists lotes_select on public.lotes;
create policy lotes_select on public.lotes
  for select to authenticated using (public.es_miembro(empresa_id));

revoke all on public.lotes from anon, authenticated;
grant select on public.lotes to authenticated;

drop trigger if exists cuenta_activa_lotes on public.lotes;
create trigger cuenta_activa_lotes
  before insert or update on public.lotes
  for each row execute function public.exigir_cuenta_activa();

-- ============================================================
-- 2. EL ENGANCHE: UNA COLUMNA
--
--    La llave foránea es COMPUESTA —(lote_id, empresa_id)— y ahí está todo
--    el trabajo de seguridad de esta migración. Con una llave simple sobre
--    `lote_id`, un movimiento de la barbería podía colgarse del lote de la
--    estancia de al lado y falsearle el resultado a otro. Con la compuesta,
--    PostgreSQL directamente no lo deja escribir.
--
--    Cuando `lote_id` es null la llave no se evalúa (MATCH SIMPLE), así que
--    todos los movimientos que ya existen siguen siendo válidos.
--
--    Sin `on delete`: borrar un lote que tiene plata cargada se RECHAZA. Un
--    lote no es una etiqueta, es dónde quedó registrado lo que gastaste;
--    borrarlo en cascada dejaría gastos huérfanos y borrarlo poniendo null
--    borraría la única prueba de a qué ciclo pertenecían.
-- ============================================================
alter table public.movimientos
  add column if not exists lote_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'movimientos_lote_fk'
  ) then
    alter table public.movimientos
      add constraint movimientos_lote_fk
      foreign key (lote_id, empresa_id) references public.lotes (id, empresa_id);
  end if;
end $$;

create index if not exists movimientos_lote_idx
  on public.movimientos (lote_id) where lote_id is not null;

-- Sin esto la columna nueva no se puede leer: la 003 le sacó a
-- `authenticated` el SELECT sobre toda la tabla y se lo devolvió columna por
-- columna, para que nadie llegue a los costos por consulta directa. Una
-- columna nueva no entra sola en esa lista.
grant select (lote_id) on public.movimientos to authenticated;

-- ============================================================
-- 3. ABRIR Y EDITAR
--
--    Solo administración. Abrir un lote es decidir cómo se mide un ciclo del
--    negocio, del mismo orden que definir un producto o el reparto: quien
--    carga gastos no define contra qué se los mide.
-- ============================================================
create or replace function public.guardar_lote(
  p_empresa  uuid,
  p_nombre   text,
  p_unidad   text default '',
  p_cantidad numeric default 0,
  p_notas    text default '',
  p_id       uuid default null,
  p_abierto  date default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
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

  if p_id is null then
    insert into public.lotes (empresa_id, nombre, unidad, cantidad, notas, abierto_el, creado_por)
    values (
      p_empresa, trim(p_nombre), left(trim(coalesce(p_unidad, '')), 20),
      coalesce(p_cantidad, 0), left(coalesce(p_notas, ''), 500),
      coalesce(p_abierto, public.hoy_empresa(p_empresa)), auth.uid()
    )
    returning id into v_id;
  else
    update public.lotes set
      nombre     = trim(p_nombre),
      unidad     = left(trim(coalesce(p_unidad, '')), 20),
      cantidad   = coalesce(p_cantidad, 0),
      notas      = left(coalesce(p_notas, ''), 500),
      abierto_el = coalesce(p_abierto, abierto_el)
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese lote no existe.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_lote(uuid, text, text, numeric, text, uuid, date) from public, anon;
grant execute on function public.guardar_lote(uuid, text, text, numeric, text, uuid, date) to authenticated;

-- ============================================================
-- 4. CERRAR Y REABRIR
--
--    Cerrar no calcula ni congela nada: el resultado se saca siempre de los
--    movimientos, así que un lote cerrado que después recibe una corrección
--    —una anulación, un gasto que faltaba— muestra el número correcto igual.
--    Cerrar es decir «este ciclo terminó», y sirve para sacarlo de la lista
--    de lo que está en curso.
-- ============================================================
create or replace function public.cerrar_lote(
  p_empresa uuid,
  p_id      uuid,
  p_fecha   date default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_abierto date; v_estado text; v_fecha date;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo administración maneja los lotes.' using errcode = '42501';
  end if;

  select abierto_el, estado into v_abierto, v_estado
  from public.lotes where id = p_id and empresa_id = p_empresa;

  if v_abierto is null then
    raise exception 'Ese lote no existe.' using errcode = 'P0002';
  end if;
  if v_estado = 'cerrado' then
    return jsonb_build_object('cerrado', true, 'ya_estaba', true);
  end if;

  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));
  if v_fecha < v_abierto then
    raise exception 'Un lote no puede cerrarse antes de haberse abierto.' using errcode = '22007';
  end if;

  update public.lotes set estado = 'cerrado', cerrado_el = v_fecha
  where id = p_id and empresa_id = p_empresa;

  return jsonb_build_object('cerrado', true, 'fecha', v_fecha);
end $fn$;

revoke all on function public.cerrar_lote(uuid, uuid, date) from public, anon;
grant execute on function public.cerrar_lote(uuid, uuid, date) to authenticated;

create or replace function public.reabrir_lote(p_empresa uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo administración maneja los lotes.' using errcode = '42501';
  end if;

  update public.lotes set estado = 'abierto', cerrado_el = null
  where id = p_id and empresa_id = p_empresa;

  if not found then
    raise exception 'Ese lote no existe.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('abierto', true);
end $fn$;

revoke all on function public.reabrir_lote(uuid, uuid) from public, anon;
grant execute on function public.reabrir_lote(uuid, uuid) to authenticated;

-- ============================================================
-- 5. BORRAR
--
--    Solo uno vacío. La llave foránea ya lo impediría, pero lo haría con un
--    error de PostgreSQL que nadie entiende. Acá se dice por qué y cuántos
--    movimientos hay que sacarle primero.
-- ============================================================
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

  select count(*)::int into v_cuantos
  from public.movimientos where lote_id = p_id;

  if v_cuantos > 0 then
    raise exception 'Ese lote tiene % movimientos cargados. Sacáselos antes de borrarlo.', v_cuantos
      using errcode = '23503';
  end if;

  delete from public.lotes where id = p_id and empresa_id = p_empresa;
  return jsonb_build_object('borrado', true);
end $fn$;

revoke all on function public.borrar_lote(uuid, uuid) from public, anon;
grant execute on function public.borrar_lote(uuid, uuid) to authenticated;

-- ============================================================
-- 6. PONERLE UN MOVIMIENTO, O SACÁRSELO
--
--    Esto sí lo hace cualquier miembro: el que carga la bolsa de balanceado
--    es el que sabe a qué corral fue. Decir de qué lote es un gasto no es
--    información reservada — es parte de cargarlo bien.
--
--    Cambia una sola columna. El monto, la fecha y todo lo demás del
--    movimiento quedan intactos, así que mover un gasto de lote no puede
--    alterar la caja de ningún día.
-- ============================================================
create or replace function public.asignar_a_lote(
  p_movimiento uuid,
  p_lote       uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_emp uuid; v_estado text;
begin
  select empresa_id, estado into v_emp, v_estado
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

  -- Que el lote sea de la misma empresa lo garantiza la llave compuesta,
  -- pero un error de llave foránea no le explica nada a nadie.
  if p_lote is not null
     and not exists (select 1 from public.lotes where id = p_lote and empresa_id = v_emp) then
    raise exception 'Ese lote no es de esta cuenta.' using errcode = '42501';
  end if;

  update public.movimientos set lote_id = p_lote where id = p_movimiento;

  return jsonb_build_object('lote', p_lote);
end $fn$;

revoke all on function public.asignar_a_lote(uuid, uuid) from public, anon;
grant execute on function public.asignar_a_lote(uuid, uuid) to authenticated;
