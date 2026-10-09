-- ============================================================
-- VUELTA ATRÁS DE LA 132 · LO QUE TENÉS Y NO ES PLATA (EL PATRIMONIO)
-- ============================================================
--
-- NO ES UNA MIGRACIÓN. Vive fuera de supabase/migrations a propósito: todo
-- .sql de esa carpeta va a parar a schema.sql. Se corre a mano, una sola
-- vez, y solo si hay que sacar la 132 de la base.
--
-- CASI NUNCA HACE FALTA
--
--   La 132 no tocó nada de lo que existía: una tabla nueva y cuatro
--   funciones nuevas. Con la 132 puesta y el código anterior publicado, la
--   base se porta exactamente como antes (el código de antes no conoce la
--   tabla ni las funciones). Lo primero, y casi siempre lo único, es volver
--   al código anterior.
--
-- CUÁNDO SIRVE, Y CUÁNDO SE NIEGA
--
--   Sirve mientras NADIE haya anotado nada. Es lo primero que mira: si hay
--   alguna fila en `bienes` (también de algo que ya se quitó de la lista),
--   SE NIEGA y no toca nada. No es por los números: ningún saldo,
--   movimiento ni reporte depende de un bien. Es porque borrar la tabla
--   borra lo que la persona escribió (su auto, su terreno, cuánto calcula
--   que valen), y eso no se recupera.
--
--   Si de verdad hay que sacarla con cosas anotadas, es una decisión de
--   Matías: primero se guarda una copia de `bienes` y se vacía la tabla a
--   mano; después se corre esto.
--
-- QUÉ HACE
--
--   1. La guarda.
--   2. Afuera las cuatro funciones.
--   3. Afuera la tabla (con ella se van su candado, su índice, sus
--      restricciones y sus comentarios).
--
--   No devuelve ninguna función a un texto anterior porque la 132 no volvió
--   a definir ninguna. No toca `cotizaciones_moneda` ni nada de la 131.
--
--   Se manda ENTERO, de una vez (así va en una sola transacción). Corrido
--   dos veces no falla. La 132 se puede volver a aplicar encima cuando haga
--   falta. Sin barras invertidas (el MCP las duplica).
--
--   pruebas/bienes.test.js lo prueba en una base armada como producción
--   (con los privilegios por defecto de Supabase desde antes de la 001): la
--   132 y después esto dejan el catálogo de la 131, objeto por objeto; con
--   algo anotado se niega sin tocar nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA GUARDA
--
--    Cuenta todas las filas, también las de lo que ya no está en la lista:
--    siguen siendo algo que la persona escribió. Si la 132 no está (o ya se
--    volvió atrás) la tabla no existe y no hay nada que cuidar.
-- ------------------------------------------------------------
do $guarda$
declare
  v_bienes integer := 0;
begin
  if to_regclass('public.bienes') is not null then
    execute 'select count(*) from public.bienes' into v_bienes;
  end if;
  if v_bienes > 0 then
    raise exception 'Hay % cosas anotadas en «Lo que tenés»: sacar la 132 las borraría y no se recuperan. Lo que se vuelve atrás es el código; la tabla puede quedar, no molesta a nadie.',
      v_bienes;
  end if;
end $guarda$;

-- ------------------------------------------------------------
-- 2. AFUERA LAS CUATRO FUNCIONES
-- ------------------------------------------------------------
drop function if exists public.patrimonio(uuid);
drop function if exists public.quitar_bien(uuid, uuid, text);
drop function if exists public.actualizar_valor_bien(uuid, uuid, numeric, text);
drop function if exists public.guardar_bien(uuid, text, text, numeric, text, text, uuid);

-- ------------------------------------------------------------
-- 3. AFUERA LA TABLA
--
--    Vacía (lo miró la guarda). Con ella se van el disparador
--    cuenta_activa_bienes, el índice, las restricciones y los comentarios.
--    La función del candado (exigir_cuenta_activa) es de antes y queda.
-- ------------------------------------------------------------
drop table if exists public.bienes;
