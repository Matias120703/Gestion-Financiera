-- ============================================================
-- 077 · EL PLAN BÁSICO: UN NEGOCIO DE UNA SOLA PERSONA
-- ============================================================
--
-- Hasta hoy un negocio tenía dos precios: Pro (190.000, hasta 3 personas) y
-- Premium (250.000, hasta 15). Los dos cobran por gente que muchos no
-- tienen: el que atiende solo su despensa, el que arregla celulares, el que
-- corta el pelo en su casa. A ese le estábamos cobrando vendedores que nunca
-- va a cargar.
--
-- Decisión de Matías: un tercer plan, **Básico**, a 110.000 Gs. Es el negocio
-- completo —ventas, gastos, fiado, agenda, billetera, reportes, Excel— con
-- una sola diferencia: **una sola persona**. Sin vendedores. Vale para todos
-- los rubros: comercio, servicios y oficios.
--
-- POR QUÉ `miembros = 1` Y NO UN CAMPO NUEVO
--
-- El tope de gente ya sale de `limites_plan()` y lo aplica `tope_de_miembros`
-- (048), que suma `tope_vendedores + 1` cuando la administración cobró
-- sillas. Con `miembros = 1` el plan Básico queda cerrado a una persona sin
-- tocar una sola función más, y si algún día alguien paga una silla suelta,
-- el mecanismo de siempre la habilita.

-- ------------------------------------------------------------
-- 1. LOS CHECKS CONOCEN EL PLAN NUEVO
-- ------------------------------------------------------------
alter table public.empresas      drop constraint if exists empresas_plan_check;
alter table public.suscripciones drop constraint if exists suscripciones_plan_check;
alter table public.precios       drop constraint if exists precios_plan_check;

alter table public.empresas
  add constraint empresas_plan_check check (plan in ('gratis', 'basico', 'pro', 'negocio'));

alter table public.suscripciones
  add constraint suscripciones_plan_check check (plan in ('gratis', 'basico', 'pro', 'negocio'));

alter table public.precios
  add constraint precios_plan_check check (plan in ('basico', 'pro', 'negocio'));

-- ------------------------------------------------------------
-- 2. QUÉ INCLUYE
--
--    Todo lo de un negocio, con una persona. Las capturas con IA van en 300
--    —la mitad de Pro— porque es el único costo que crece con el uso y el
--    plan sale casi la mitad. No es un recorte de funciones: es el mismo
--    Orden, para uno solo.
-- ------------------------------------------------------------
create or replace function public.limites_plan(p_plan text)
returns jsonb language sql immutable set search_path = public as $fn$
  select case coalesce(p_plan, 'gratis')
    when 'negocio' then jsonb_build_object(
      'capturas_mes', 3000, 'miembros', 15,
      'adjuntos', true, 'excel', true, 'avisos', true, 'escritura', true)
    when 'pro' then jsonb_build_object(
      'capturas_mes', 600, 'miembros', 3,
      'adjuntos', true, 'excel', true, 'avisos', true, 'escritura', true)
    when 'basico' then jsonb_build_object(
      'capturas_mes', 300, 'miembros', 1,
      'adjuntos', true, 'excel', true, 'avisos', true, 'escritura', true)
    else jsonb_build_object(
      'capturas_mes', 0, 'miembros', 1,
      'adjuntos', false, 'excel', true, 'avisos', true, 'escritura', false)
  end;
$fn$;

-- ------------------------------------------------------------
-- 3. EL PRECIO
--
--    Solo para cuentas de negocio: una cuenta personal ya es de una sola
--    persona y tiene su propio precio. El anual son once meses, como en los
--    otros dos planes.
-- ------------------------------------------------------------
insert into public.precios (plan, tipo_cuenta, moneda, periodo, importe) values
  ('basico', 'emprendedor', 'PYG', 'mensual',  110000),
  ('basico', 'emprendedor', 'PYG', 'anual',   1210000),
  ('basico', 'emprendedor', 'USD', 'mensual',      19),
  ('basico', 'emprendedor', 'USD', 'anual',       209)
on conflict (tipo_cuenta, plan, moneda, periodo) do nothing;
