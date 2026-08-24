-- ============================================================
-- ORDEN · Migración 012 · Cerrarle la puerta a `anon`
--
-- Dos hallazgos del linter de Supabase, los dos reales.
--
-- 1. NUEVE FUNCIONES SEGUÍAN OTORGADAS A `anon`, el rol de quien NO inició
--    sesión. Entre ellas `registrar_venta`, `anular_movimiento` y
--    `reemplazar_venta`, que escriben.
--
--    ¿Se podía hacer daño? No: las tres arrancan con
--    `if auth.uid() is null then raise`. Alguien sin sesión que las llamara
--    recibía un error, no una venta.
--
--    Entonces, ¿por qué se toca? Porque esa defensa está a UNA línea de
--    distancia de desaparecer. El día que alguien edite una de esas
--    funciones y mueva o borre esa guarda sin darse cuenta, una ruta pública
--    de internet queda escribiendo en la base. El permiso no debería
--    depender de que nadie se equivoque nunca dentro del cuerpo de la
--    función.
--
--    Vienen de la 001: Supabase otorga EXECUTE a `anon` y `authenticated`
--    por defecto sobre todo lo que se crea en `public`, y las migraciones
--    posteriores revocaron caso por caso, pero estas quedaron afuera.
--
--    `lista_precios` SÍ se queda: la pantalla de planes tiene que poder
--    mostrar los precios antes de que la persona se registre.
--
-- 2. TRES FUNCIONES SIN `search_path` FIJO. Dos son de la 007 y las
--    escribimos nosotros. En estas tres el riesgo es teórico —devuelven
--    constantes o no tocan tablas— pero dejar la excepción invita a
--    copiarla en la próxima función, que sí va a tocar tablas.
--
-- Idempotente. No toca datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. FUERA `anon`
--
--    Se usa `do` con `to_regprocedure` para no fallar si alguna firma no
--    existe en una instalación vieja: revocar algo que no está no debería
--    tirar abajo la migración.
-- ------------------------------------------------------------
--    OJO CON CÓMO SE REVOCA. `revoke ... from anon` NO alcanza y no da
--    ningún error: PostgreSQL otorga EXECUTE sobre toda función nueva al
--    pseudo-rol PUBLIC, y `anon` lo hereda de ahí. Revocarle a `anon` un
--    permiso que nunca tuvo en forma directa no cambia nada; hay que
--    quitárselo a PUBLIC y volver a otorgárselo explícitamente a quien sí
--    lo necesita.
do $bloque$
declare
  v_firma text;
  v_firmas text[] := array[
    'public.registrar_venta(uuid, jsonb, date, text, text, text, text, origen_captura, numeric)',
    'public.reemplazar_venta(uuid, jsonb, date, text, text, text, text, numeric)',
    'public.anular_movimiento(uuid, text)',
    'public.datos_empresa(uuid)',
    'public.empresa_es_pro(uuid)',
    'public.es_admin(uuid)',
    'public.es_miembro(uuid)',
    'public.plan_efectivo(uuid)'
  ];
begin
  foreach v_firma in array v_firmas loop
    if to_regprocedure(v_firma) is not null then
      execute format('revoke all on function %s from public, anon', v_firma);
      execute format('grant execute on function %s to authenticated', v_firma);
    else
      raise notice 'No existe %, se omite.', v_firma;
    end if;
  end loop;
end $bloque$;

-- `lista_precios` es la excepción y se deja explícita, para que se vea que
-- es una decisión y no un olvido: la pantalla de planes muestra los precios
-- antes de que la persona tenga cuenta.
grant execute on function public.lista_precios(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. `search_path` FIJO EN LAS TRES QUE FALTABAN
--
--    `alter function ... set search_path` no reescribe el cuerpo: solo le
--    clava el esquema. Es la forma más chica de cerrarlo.
-- ------------------------------------------------------------
do $bloque$
declare
  v_firma text;
  v_firmas text[] := array[
    'public.jsonb_elements_ordenados(jsonb)',
    'public.limite_adjuntos_movimiento()',
    'public.limite_bytes_adjunto()'
  ];
begin
  foreach v_firma in array v_firmas loop
    if to_regprocedure(v_firma) is not null then
      execute format('alter function %s set search_path = public', v_firma);
    end if;
  end loop;
end $bloque$;
