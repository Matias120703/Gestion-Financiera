-- ============================================================
-- 105 · LA COMISIÓN EN GUARANÍES
-- ============================================================
--
-- Decisión de Matías del 23/09/2026 (no se re-discute): la suscripción de
-- Orden se cobra SIEMPRE en guaraníes. Bancard le permite una sola moneda
-- y eligió guaraníes. En pantalla el precio grande va en guaraníes, con un
-- «≈ US$ 19» chico de referencia que no se cobra, y el que tiene una
-- tarjeta de otro país deja que su banco convierta. Los precios no
-- cambian: las filas en USD de `precios` siguen ahí, como referencia.
--
-- Esta migración lleva esa decisión a la comisión del socio. La regla de
-- la 102 no cambia —la mitad del precio de lista de UN mes del plan, nunca
-- más de lo que entró (103)—; cambia de qué moneda se toma esa lista.
--
-- LO QUE HACÍA LA 102, Y POR QUÉ ESTABA BIEN EN SU MOMENTO
--
-- `base_de_comision` y `monto_de_comision` elegían la moneda así:
--
--     coalesce(suscripciones.moneda, empresas.moneda, 'PYG')
--
-- En producción `suscripciones.moneda` es null en TODAS las suscripciones
-- (verificado el 23/09: 7 de 7). Solo la escribe `aplicar_suscripcion`, la
-- puerta de la pasarela, que hoy está apagada; `cambiar_plan_cuenta`, el
-- cobro por transferencia —el único camino real—, nunca la toca. Con
-- «null = guaraníes» a secas, la 102 temía esto: una cuenta argentina que
-- paga Premium con 60.000 ARS tomaba de base la lista en guaraníes
-- (250.000); la mitad, 125.000, quedaba topada en los 60.000 que entraron y
-- el socio se llevaba EL 100 % del cobro. Para evitarlo, la 102 supuso que
-- el que lleva su negocio en pesos paga en pesos, y cayó en
-- `empresas.moneda`.
--
-- POR QUÉ YA NO APLICA
--
-- Desde el 23/09 esa suposición es falsa: nadie paga en su moneda, todos
-- pagan en guaraníes. `empresas.moneda` dice en qué moneda LLEVA SUS
-- CUENTAS el negocio, no en qué moneda le paga a Orden. Y caer en ella
-- ahora da el error al revés, que es peor:
--
--     un sojero que lleva el campo en dólares paga Básico por transferencia
--       entró              90.200 Gs (con el descuento de la prueba, 078)
--       moneda elegida     USD (la de la empresa: suscripciones.moneda null)
--       base               19        (la lista de Básico en USD)
--       monto              9,50      (la mitad, con centavos)
--       y el monto se guarda sin moneda, al lado de un importe en guaraníes:
--       el socio cobraría 9,50 GUARANÍES por un cliente que pagó 90.200.
--
-- Lo correcto es base 110.000 y monto 55.000: la lista de Básico en la
-- moneda en que entró la plata.
--
-- LA REGLA NUEVA: `coalesce(suscripciones.moneda, 'PYG')`
--
--   · null —todo cobro por transferencia, que es hoy el 100 %— es
--     guaraníes, porque así se cobra.
--   · Si algún día un cobro llega en otra moneda, lo dice
--     `suscripciones.moneda`, y la escribe la pasarela: `aplicar_suscripcion`
--     (104, verificada en producción el 23/09 con pg_get_functiondef) hace
--     el upsert con `moneda = coalesce(p_moneda, la de antes)` ANTES de
--     calcular base y monto, así que la comisión usa la moneda del pago que
--     la generó. Una suscripción con moneda USD explícita sigue tomando la
--     lista en USD (19, 32, 42) y redondeando con centavos.
--   · `empresas.moneda` ya no se mira. El caso que la 102 cuidaba (un
--     argentino que paga 60.000 PESOS) no puede pasar por transferencia:
--     paga en guaraníes. Y si pagara 60.000 guaraníes por un Premium de
--     250.000 —un cobro parcial o de prueba—, la base es 250.000, la mitad
--     125.000 y el monto queda topado en los 60.000 que entraron: es la
--     salvaguarda de siempre (102), la misma que con 1.000 de prueba en una
--     cuenta en guaraníes, y no depende de la moneda de la empresa.
--
-- Si no hay precio de lista para esa moneda (BRL, ARS hoy), la base sigue
-- siendo el importe, como desde la 102. El redondeo sigue la moneda
-- elegida: guaraníes sin decimales, el resto con dos.
--
-- LOS QUE LLAMAN A ESTAS FUNCIONES NO CAMBIAN
--
-- Se verificó en producción (pg_proc, prosrc) que solo las llaman tres
-- funciones, y ninguna necesita tocarse:
--
--   · `cambiar_plan_cuenta` (103): no escribe `suscripciones.moneda`; con
--     la regla nueva, null = guaraníes, que es como se cobró.
--   · `asignar_referido` (103): mismo caso; el primer pago salió de
--     `registro_admin`, es decir, de una transferencia.
--   · `aplicar_suscripcion` (104): escribe la moneda del pago antes de
--     calcular (ver arriba).
--
-- NADA QUE CORREGIR HACIA ATRÁS
--
-- En producción la tabla `comisiones` está vacía (verificado el 23/09): no
-- hay ninguna comisión calculada con la moneda de la empresa que haya que
-- rehacer.
--
-- LO QUE NO CAMBIA
--
-- Todo lo demás es copia EXACTA de lo vivo (la 102, verificada en
-- producción el 23/09 con pg_get_functiondef): las firmas, `language sql
-- stable security definer`, el `search_path`, el left join a
-- `suscripciones` (una empresa sin fila de suscripción cae en guaraníes),
-- el tipo de cuenta, el período mensual, `precios.activo` sin mirar, el
-- `least(..., p_importe)`, y que son internas: revocadas a public, anon y
-- authenticated. Los permisos se reescriben igual (mismas firmas:
-- `create or replace` los conserva) para que este archivo diga por sí solo
-- quién puede llamarlas.
--
-- No hay mensajes nuevos: estas funciones no lanzan errores.
--
-- Idempotente: son dos `create or replace` y dos revoke.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA BASE: EL PRECIO DE LISTA DE UN MES, EN LA MONEDA DEL COBRO
--
--    La moneda del cobro es la de la suscripción; si es null, guaraníes
--    (105: antes caía en la de la empresa). Si no hay precio de lista para
--    esa combinación, el importe: la regla de antes.
-- ------------------------------------------------------------
create or replace function public.base_de_comision(
  p_empresa uuid,
  p_plan    text,
  p_importe numeric
)
returns numeric language sql stable security definer set search_path = public as $fn$
  select coalesce((
    select pr.importe
    from public.empresas e
    left join public.suscripciones s on s.empresa_id = e.id
    join public.precios pr
      on pr.tipo_cuenta = e.tipo_cuenta
     and pr.plan = p_plan
     and pr.moneda = coalesce(s.moneda, 'PYG')
     and pr.periodo = 'mensual'
    where e.id = p_empresa
    limit 1
  ), p_importe);
$fn$;

-- ------------------------------------------------------------
-- 2. EL MONTO: EL PORCENTAJE DE LA BASE, NUNCA MÁS DE LO QUE ENTRÓ
--
--    Guaraníes sin decimales; el resto con dos. La moneda sale igual que
--    en `base_de_comision`: la de la suscripción, y si no, guaraníes.
-- ------------------------------------------------------------
create or replace function public.monto_de_comision(
  p_empresa uuid,
  p_base    numeric,
  p_pct     numeric,
  p_importe numeric
)
returns numeric language sql stable security definer set search_path = public as $fn$
  select least(
    round(p_base * p_pct / 100,
      case when coalesce((select s.moneda
                          from public.empresas e
                          left join public.suscripciones s on s.empresa_id = e.id
                          where e.id = p_empresa), 'PYG') = 'PYG'
           then 0 else 2 end),
    p_importe
  );
$fn$;

revoke all on function public.base_de_comision(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.monto_de_comision(uuid, numeric, numeric, numeric) from public, anon, authenticated;
