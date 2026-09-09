-- ============================================================
-- ORDEN · Migración 050 · El precio del vendedor, donde viven los precios
--
-- DOS COSAS MAL, Y LA SEGUNDA ES LA QUE IMPORTA
--
-- 1. El número en dólares estaba mal. `precio_por_vendedor` (017) devolvía
--    60.000 Gs. y US$ 7,99, o sea un cambio de 7.509 Gs. por dólar. Los
--    planes usan entre 5.937 y 5.952 (190.000 = 32, 250.000 = 42), así que
--    ese 7,99 no salía de ningún lado. Pasa a US$ 11, que es el número que
--    se decidió.
--
--    Los 60.000 con los 11 dan 5.454, que tampoco es exactamente el cambio
--    de los planes, y está bien: son dos precios redondos, uno en cada
--    moneda. Un precio se elige, no se calcula con la calculadora del día.
--
-- 2. Estaba escrito a mano adentro de una función.
--
--    El módulo de precios lo dice desde el primer día: «Los importes viven en
--    la tabla `precios`, no acá: cambiar un precio no puede requerir un
--    despliegue». Este número se saltó esa regla, y cambiarlo obligaba a
--    escribir una migración y desplegar — para tocar un precio.
--
--    Eso no es solo incómodo. Un precio que cuesta cambiar se cambia tarde, y
--    mientras tanto la portada le está diciendo un número a la gente.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA FILA EN `precios`
--
-- `precios` está indexada por (tipo_cuenta, plan, moneda, periodo) y su check
-- solo admite los planes 'pro' y 'negocio'. Meter al vendedor ahí obligaría a
-- ensanchar ese check con un plan que no es un plan, y `lista_precios()` lo
-- devolvería junto a los demás: la pantalla de planes mostraría «Vendedor»
-- como si fuera una opción a contratar.
--
-- Un vendedor no es un plan: es algo que se suma a uno. Tabla propia.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LO QUE SE COBRA ADEMÁS DEL PLAN
--
--    `concepto` con lista cerrada y no texto libre: el día que haya un
--    segundo agregado, va a haber que escribirlo acá y pensarlo, en vez de
--    que aparezca una fila con una palabra que nadie sabe de dónde salió.
-- ------------------------------------------------------------
create table if not exists public.precios_adicionales (
  concepto   text not null check (concepto in ('vendedor')),
  moneda     text not null check (moneda in ('PYG', 'USD', 'ARS', 'BRL', 'EUR')),
  importe    numeric(14,2) not null check (importe > 0),
  activo     boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (concepto, moneda)
);

comment on table public.precios_adicionales is
  'Lo que se cobra ADEMÁS del plan. Hoy solo el vendedor extra. Se edita acá, sin desplegar nada.';

alter table public.precios_adicionales enable row level security;

-- Pública igual que `precios`: la portada la muestra antes de que la persona
-- se registre.
drop policy if exists precios_adicionales_select on public.precios_adicionales;
create policy precios_adicionales_select on public.precios_adicionales
  for select using (activo);

revoke all on public.precios_adicionales from anon, authenticated;
grant select on public.precios_adicionales to anon, authenticated;

-- ------------------------------------------------------------
-- 2. LOS IMPORTES
--
--    Idempotente: correr esta migración dos veces no duplica ni pisa con
--    valores viejos algo que se haya ajustado a mano después.
-- ------------------------------------------------------------
insert into public.precios_adicionales (concepto, moneda, importe) values
  ('vendedor', 'PYG', 60000),
  ('vendedor', 'USD', 11)
on conflict (concepto, moneda) do update
  set importe = excluded.importe, updated_at = now();

-- ------------------------------------------------------------
-- 3. LA FUNCIÓN, AHORA LEYENDO
--
--    Deja de ser `immutable` —lee una tabla— y pasa a `stable`. Si no se
--    cambiara, PostgreSQL podría cachear el valor viejo dentro de una misma
--    consulta y el precio nuevo no aparecería.
--
--    NO lleva `security definer`, y eso es deliberado. La primera versión de
--    esta migración se lo puso por costumbre y la prueba de permisos la
--    frenó: hay un control que lista qué funciones `security definer` pueden
--    estar abiertas a `anon`, y esta no tiene por qué estarlo. La tabla ya es
--    pública por su política; no hace falta prestarle a nadie privilegios que
--    no necesita para leer un precio.
--
--    Sin fila devuelve NULL, y eso está bien: la portada ya sabe no mostrar
--    la nota cuando no hay número. Mejor no decir nada que decir un importe
--    inventado sobre algo que se cobra.
-- ------------------------------------------------------------
create or replace function public.precio_por_vendedor(p_moneda text default 'PYG')
returns numeric language sql stable set search_path = public as $fn$
  select a.importe
  from public.precios_adicionales a
  where a.concepto = 'vendedor'
    and a.moneda = upper(coalesce(nullif(trim(p_moneda), ''), 'PYG'))
    and a.activo;
$fn$;

grant execute on function public.precio_por_vendedor(text) to anon, authenticated;
