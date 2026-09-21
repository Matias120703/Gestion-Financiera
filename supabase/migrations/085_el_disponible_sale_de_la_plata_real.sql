-- ============================================================
-- 085 · EL DISPONIBLE SALE DE LA PLATA QUE TENÉS DE VERDAD
-- ============================================================
--
-- Matías: «entro en mi billetera y tengo cinco mil guaraníes, entro en mi
-- presupuesto y tengo todavía dos millones. Como que no conecta, no tiene
-- sentido».
--
-- POR QUÉ NO CONECTABAN
--
-- Eran dos formas distintas de contar la misma plata:
--
--   · La billetera suma los saldos de las cuentas. Es «lo que tengo ahora»,
--     venga de donde venga, incluida plata de meses anteriores.
--   · El disponible arrancaba en cero cada ciclo: «lo que entró este ciclo,
--     menos lo que salió, menos lo que falta pagar». No sabía nada de lo que
--     ya había antes, ni de que esa plata se hubiera ido.
--
-- LO QUE PIDIÓ, EN SUS PALABRAS
--
-- «Cargo mi ingreso fijo con cómo me pagan y a qué cuenta. El 21 se acredita
-- y el Atlas sube en mi billetera. Ahí me aparece el disponible y cuánto por
-- día. Y durante el mes, cada movimiento en esa cuenta tiene que actualizar
-- ese saldo y recalcular el por día».
--
-- Así que el disponible deja de ser un flujo del ciclo y pasa a ser plata
-- real: lo que hay en las cuentas, menos lo que ya tiene dueño.
--
--     disponible = saldo de las cuentas
--                − lo guardado en los fondos de ahorro
--                − los gastos fijos que faltan pagar
--                − las cuotas que vencen antes de que cierre el ciclo
--
-- POR QUÉ SE RESTA EL AHORRO ENTERO Y NO SOLO EL DE ESTE CICLO
--
-- Porque guardar en un fondo NO baja ningún saldo: los fondos viven en
-- `movimientos_ahorro`, que la billetera no mira. Esa plata sigue contada
-- dentro del banco. Si no se restara, el disponible incluiría los ahorros de
-- toda la vida como si fueran para gastar. Y se resta el total y no el del
-- ciclo justamente porque lo de los ciclos anteriores también sigue adentro.
--
-- EL RESPALDO, QUE NO ES UN DETALLE
--
-- Quien todavía no cargó ninguna cuenta en la billetera sigue con el cálculo
-- de siempre. Si no, abriría Orden y vería «disponible: Gs. 0» teniendo
-- plata, que es peor que un número impreciso: es un número que asusta. Al
-- 21/09 hay tres cuentas de Matías sin cuentas de dinero creadas.

-- ------------------------------------------------------------
-- 1. EL CÁLCULO DE SIEMPRE, CON SU NOMBRE PROPIO
--
--    Se renombra en vez de copiarlo: son doscientas líneas y tener dos
--    versiones de la misma cuenta es tenerlas esperando a separarse. El
--    bloque se traga el error si ya se renombró, para que volver a aplicar
--    la migración no falle.
-- ------------------------------------------------------------
do $ren$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'resumen_personal'
  ) and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'resumen_personal_por_ciclo'
  ) then
    alter function public.resumen_personal(uuid) rename to resumen_personal_por_ciclo;
  end if;
end $ren$;

revoke all on function public.resumen_personal_por_ciclo(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Y EL QUE MIRA LA PLATA DE VERDAD
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
begin
  -- Se parte del resumen de siempre y se corrige el disponible. Repetir
  -- acá las doscientas líneas que lo arman sería tener dos versiones de la
  -- misma cuenta esperando a separarse.
  v_res := public.resumen_personal_por_ciclo(p_empresa);

  select count(*)::int into v_cuentas
  from public.cuentas_dinero c where c.empresa_id = p_empresa and c.activa;

  -- Sin cuentas cargadas no hay saldo real del que partir: queda el cálculo
  -- por ciclo, que es impreciso pero no asusta.
  if v_cuentas = 0 then
    return v_res;
  end if;

  select coalesce(sum(public.saldo_cuenta_dinero(c.id)), 0) into v_en_cuentas
  from public.cuentas_dinero c where c.empresa_id = p_empresa and c.activa;

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
