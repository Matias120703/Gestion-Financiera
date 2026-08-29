-- ============================================================
-- ORDEN · Migración 017 · Precios por tipo de cuenta
--
-- POR QUÉ EL PRECIO NO PUEDE DEPENDER SOLO DEL PLAN
--
-- Una cuenta personal y un comercio pueden estar los dos en plan `pro` —los
-- mismos topes, las mismas funciones— y aun así pagar distinto. No es una
-- inconsistencia: es que **no reciben el mismo valor**.
--
-- Al comerciante, Orden le dice cuánta plata ganó de verdad. Eso se paga
-- solo. A quien lleva sus finanzas personales le dice cuánto debe y cuándo
-- vence la cuota; le sirve, pero no le genera un guaraní. Cobrarle lo mismo
-- a los dos sería no haber entendido a ninguno.
--
-- Por eso el plan sigue decidiendo QUÉ SE PUEDE HACER (`limites_plan`), y el
-- par tipo_cuenta + plan decide CUÁNTO SE PAGA. Son dos preguntas distintas
-- y ahora tienen dos respuestas distintas.
--
-- LOS PRECIOS QUE QUEDAN (Paraguay)
--
--   personal    · plan único            60.000/mes    ·  600.000/año
--   comercio    · Pro, hasta 3 vendedores  190.000/mes  · 1.900.000/año
--   comercio    · Premium, desde          250.000/mes  · 2.500.000/año
--
-- El anual son diez meses por doce. No se escribe «dos meses gratis» a mano
-- en ningún lado: `mesesDeRegalo()` lo calcula de estos números, así que si
-- mañana cambian, el cartel sigue diciendo la verdad o desaparece.
--
-- Premium es «desde»: el precio final depende de cuántos vendedores quiera,
-- a 60.000 cada uno por encima de los 3 que trae Pro. 250.000 es el primer
-- escalón (4 vendedores) y por eso es el número que se muestra.
--
-- Idempotente. Reemplaza los precios viejos (35.000 / 79.000), que eran de
-- cuando Orden tenía un solo público.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA COLUMNA
-- ------------------------------------------------------------
alter table public.precios
  add column if not exists tipo_cuenta text not null default 'emprendedor';

do $$ begin
  alter table public.precios
    add constraint precios_tipo_cuenta_check
    check (tipo_cuenta in ('personal', 'emprendedor'));
exception when duplicate_object then null; end $$;

-- La unicidad ahora incluye el tipo: el mismo plan y la misma moneda pueden
-- convivir con dos precios distintos, uno por público.
alter table public.precios drop constraint if exists precios_plan_moneda_periodo_key;

do $$ begin
  alter table public.precios
    add constraint precios_tipo_plan_moneda_periodo_key
    unique (tipo_cuenta, plan, moneda, periodo);
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. LOS PRECIOS
--
--    Se borran los viejos en vez de desactivarlos: un precio que ya no
--    existe no tiene por qué quedar dando vueltas donde alguien lo pueda
--    volver a activar por error.
-- ------------------------------------------------------------
delete from public.precios;

insert into public.precios (tipo_cuenta, plan, moneda, periodo, importe) values
  -- Cuenta personal. Un solo plan pago: no necesita nombre porque no compite
  -- con ningún otro. En la interfaz es «la suscripción», no «Pro», para que
  -- no choque con el Pro de comercios, que cuesta el triple.
  ('personal',    'pro',     'PYG', 'mensual',   60000),
  ('personal',    'pro',     'PYG', 'anual',    600000),
  ('personal',    'pro',     'USD', 'mensual',     7.99),
  ('personal',    'pro',     'USD', 'anual',      79.00),

  -- Comercio · Pro: hasta 3 vendedores.
  ('emprendedor', 'pro',     'PYG', 'mensual',  190000),
  ('emprendedor', 'pro',     'PYG', 'anual',   1900000),
  ('emprendedor', 'pro',     'USD', 'mensual',    24.99),
  ('emprendedor', 'pro',     'USD', 'anual',     249.00),

  -- Comercio · Premium: desde. El precio final se cotiza según cuántos
  -- vendedores, a 60.000 cada uno arriba de los 3 de Pro.
  ('emprendedor', 'negocio', 'PYG', 'mensual',  250000),
  ('emprendedor', 'negocio', 'PYG', 'anual',   2500000),
  ('emprendedor', 'negocio', 'USD', 'mensual',    32.99),
  ('emprendedor', 'negocio', 'USD', 'anual',     329.00);

-- ------------------------------------------------------------
-- 3. CUÁNTO CUESTA CADA VENDEDOR DE MÁS
--
--    Vive en la base y no en el código por el mismo motivo que los precios:
--    subirlo no puede requerir un despliegue. La usa la portada para
--    explicar de dónde sale el «desde», y sirve para cotizar sin improvisar
--    un número distinto en cada conversación de WhatsApp.
-- ------------------------------------------------------------
create or replace function public.precio_por_vendedor(p_moneda text default 'PYG')
returns numeric language sql immutable set search_path = public as $fn$
  select case upper(coalesce(p_moneda, 'PYG'))
    when 'PYG' then 60000::numeric
    when 'USD' then 7.99::numeric
    else 7.99::numeric
  end;
$fn$;

grant execute on function public.precio_por_vendedor(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. LISTA DE PRECIOS · ahora filtra por público
--
--    `p_tipo` en null devuelve todo, que es lo que necesita la portada para
--    mostrar los dos lados. La pantalla de Plan, en cambio, pide solo el
--    tipo de la cuenta: a alguien que lleva sus finanzas personales no se le
--    ofrece el plan de un local con vendedores.
-- ------------------------------------------------------------
create or replace function public.lista_precios(
  p_moneda text default null,
  p_tipo   text default null
)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo_cuenta', p.tipo_cuenta,
    'plan', p.plan, 'moneda', p.moneda, 'periodo', p.periodo,
    'importe', p.importe, 'referencia_externa', p.referencia_externa
  ) order by p.tipo_cuenta, p.plan, p.periodo), '[]'::jsonb)
  from public.precios p
  where p.activo
    and (p_moneda is null or p.moneda = p_moneda)
    and (p_tipo is null or p.tipo_cuenta = p_tipo);
$fn$;

-- La firma de un argumento queda muerta: si no se borra, PostgREST ve dos
-- funciones con el mismo nombre y no sabe cuál llamar.
drop function if exists public.lista_precios(text);

-- Los precios son públicos a propósito: alguien que todavía no tiene cuenta
-- tiene que poder ver cuánto cuesta antes de registrarse.
grant execute on function public.lista_precios(text, text) to anon, authenticated;
