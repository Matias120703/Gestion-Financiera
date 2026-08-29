-- ============================================================
-- ORDEN · Migración 020 · Precios en dólares y un mes de regalo
--
-- DOS CORRECCIONES SOBRE LA 017
--
-- 1. LOS DÓLARES ESTABAN MAL. Se habían puesto números «bonitos» de
--    marketing (7,99 y 24,99) sin mirar el cambio real. A 190.000 guaraníes
--    le corresponden unos 32 dólares, no 25: cobrar 25 era regalar el 20% a
--    todo el que pague en dólares.
--
--    Los precios en guaraníes NO cambian. Es la conversión la que estaba
--    equivocada.
--
--      personal   Gs.  60.000  →  US$ 11
--      Pro        Gs. 190.000  →  US$ 32
--      Premium    Gs. 250.000  →  US$ 42   (el mismo cambio que Pro)
--
-- 2. EL ANUAL DA UN MES, NO DOS. Doce meses al precio de once.
--
--    Dos meses era demasiado para un producto que todavía no tiene historia
--    de retención: se regalaba un sexto del año a cambio de un adelanto que
--    hoy no hace falta. Con uno, el descuento sigue siendo un motivo real
--    para pagar por año y el número cierra mejor.
--
--    El cartel de «un mes de regalo» no se escribe a mano en ningún lado:
--    `mesesDeRegalo()` lo calcula de estos importes. Si mañana cambian, el
--    texto sigue diciendo la verdad o desaparece — nunca miente.
--
-- Idempotente.
-- ============================================================

delete from public.precios;

insert into public.precios (tipo_cuenta, plan, moneda, periodo, importe) values
  -- Cuenta personal. Un solo plan pago.
  ('personal',    'pro',     'PYG', 'mensual',   60000),
  ('personal',    'pro',     'PYG', 'anual',    660000),
  ('personal',    'pro',     'USD', 'mensual',      11),
  ('personal',    'pro',     'USD', 'anual',       121),

  -- Comercio · Pro: hasta 3 vendedores.
  ('emprendedor', 'pro',     'PYG', 'mensual',  190000),
  ('emprendedor', 'pro',     'PYG', 'anual',   2090000),
  ('emprendedor', 'pro',     'USD', 'mensual',      32),
  ('emprendedor', 'pro',     'USD', 'anual',       352),

  -- Comercio · Premium: desde. Cada vendedor extra suma aparte.
  ('emprendedor', 'negocio', 'PYG', 'mensual',  250000),
  ('emprendedor', 'negocio', 'PYG', 'anual',   2750000),
  ('emprendedor', 'negocio', 'USD', 'mensual',      42),
  ('emprendedor', 'negocio', 'USD', 'anual',       462);

-- Cada vendedor de más, con el mismo cambio que el resto.
create or replace function public.precio_por_vendedor(p_moneda text default 'PYG')
returns numeric language sql immutable set search_path = public as $fn$
  select case upper(coalesce(p_moneda, 'PYG'))
    when 'PYG' then 60000::numeric
    when 'USD' then 10::numeric
    else 10::numeric
  end;
$fn$;

grant execute on function public.precio_por_vendedor(text) to anon, authenticated;
