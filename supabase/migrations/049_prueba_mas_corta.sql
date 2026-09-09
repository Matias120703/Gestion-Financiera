-- ============================================================
-- ORDEN · Migración 049 · La prueba, más corta
--
-- 20 días para un negocio y 14 para una cuenta personal pasan a ser 8 y 5.
--
-- POR QUÉ SE TOCA UNA SOLA FUNCIÓN
--
-- `dias_de_prueba()` la llama `crear_empresa()` UNA vez, en el momento de
-- nacer la cuenta, y escribe el resultado en `suscripciones.prueba_fin`.
-- Desde ahí manda esa fecha y nadie vuelve a preguntar.
--
-- Eso tiene una consecuencia que conviene saber y no descubrir después:
-- A NADIE QUE YA ESTÉ PROBANDO SE LE ACORTA LA PRUEBA. Quien entró ayer
-- con 20 días sigue teniendo sus 20. El número nuevo solo lo ven las
-- cuentas que se creen a partir de acá.
--
-- Y así tiene que ser. Recortarle la prueba a alguien que la está usando es
-- cambiarle el trato después de haberlo hecho — la misma razón por la que
-- `extender_prueba()` (016) solo estira y nunca acorta.
--
-- LA OTRA MITAD DE ESTE CAMBIO NO ESTÁ ACÁ
--
-- El número está escrito a mano en la portada y en los Términos del
-- servicio. Si se cambia solo esto, la web sigue prometiendo 20 días y la
-- persona entra y tiene 8: un reclamo con la razón entera del lado del
-- cliente. Por eso, junto con esta migración, la web pasa a leer el número
-- de un solo lugar (`DIAS_DE_PRUEBA` en src/lib/precios.ts) y hay una
-- prueba que compara ese archivo contra esta función y falla si se separan.
-- ============================================================

create or replace function public.dias_de_prueba(p_tipo text)
returns integer language sql immutable set search_path = public as $fn$
  select case coalesce(p_tipo, 'emprendedor')
    -- Quien anota sus gastos personales sabe en pocos días si le sirve:
    -- lo usa todos los días desde el primero.
    when 'personal' then 5
    -- Un comercio necesita ver un pedazo de semana suyo —los días flojos y
    -- los buenos— antes de poder decidir.
    else 8
  end;
$fn$;

grant execute on function public.dias_de_prueba(text) to anon, authenticated;
