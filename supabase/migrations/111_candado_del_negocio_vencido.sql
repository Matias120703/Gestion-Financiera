-- ============================================================
-- 111 · EL CANDADO DEL NEGOCIO VENCIDO, COMPLETO
-- ============================================================
--
-- La regla es la del 15/09 (069): un NEGOCIO vencido no usa nada salvo
-- /plan, y sus datos no se borran. La pantalla lo tapa entero
-- (CandadoCuenta), pero la base todavía le dejaba hacer cosas por API. La
-- 110 dejó anotados esos huecos como tareas aparte (110:71-84) para no
-- tocar a los negocios en el mismo cambio que la cuenta personal. Esta
-- migración los cierra:
--
--   1. «Empezar de cero» no andaba para un negocio vencido con un pago de
--      cuota, un turno cobrado o una silla alquilada. Al borrar los
--      movimientos y los productos, el ON DELETE SET NULL de pagos_deuda,
--      turnos_pago y turnos_atribucion es un UPDATE, y el candado lo
--      rechazaba con «Se te terminó la prueba…». Irse tiene que ser gratis
--      (018:124-129). La marca `orden.vaciando` que pone vaciar_empresa
--      (110, bloque 12) se leía solo en la rama de la personal en Gratis;
--      ahora se lee antes de todo (bloque 1).
--
--      Lo que esto NO arregla: una reserva de la agenda, en cualquier
--      estado, sigue rompiendo «Empezar de cero» con cualquier plan, en
--      prueba o pagando también. turnos_reserva.producto_id es NOT NULL con
--      ON DELETE RESTRICT (037:116) y vaciar borra los productos. No es del
--      candado: queda como tarea aparte. (El SET NULL de
--      turnos_reserva.atribucion_id sí pasa ahora, pero el RESTRICT frena
--      después.)
--
--   2. fiado («Me deben»), cuentas_dinero y ajustes_cuenta (la billetera),
--      paquetes y clases_dadas (las clases) nunca tuvieron cuenta_activa_*.
--      Un negocio vencido todavía anotaba y cobraba fiado, creaba, editaba,
--      ajustaba y transfería entre cuentas, vendía un paquete de precio 0,
--      lo cerraba y daba clases. Ahora el mismo candado que el resto
--      (bloque 2). Ninguna migración anterior decidió dejarlas abiertas: la
--      110 lo dice para fiado y billetera, y 087, 088 y 091 no dicen nada.
--
--   3. Subir un comprobante a Storage pedía solo ser de la cuenta. Un
--      negocio vencido o una personal en Gratis podían subir archivos por
--      API: no los podían enganchar a un movimiento (`adjuntos` tiene
--      candado), pero quedaban ocupando storage (bloque 3).
--
-- El bloque 1 va primero a propósito: sin él, el candado nuevo en fiado y
-- paquetes rompía «Empezar de cero» donde hoy anda (fiado.cobro_id y
-- paquetes.movimiento_id también son SET NULL). Se verificó en PGlite.
--
-- QUÉ QUEDA ABIERTO, A PROPÓSITO
--
--   · `clientes`: archivar o eliminar a una persona anda siempre (099, D19).
--     A un alumno que solo tenía un paquete no se lo podía eliminar, con
--     ningún plan (paquetes.cliente_id es RESTRICT): lo arregla la 112, aparte
--     porque no es del candado.
--   · `rutina_enlaces`: apagar o cambiar un link es seguridad, no carga (098).
--   · `turnos_bloqueo` (bloquear_telefono, 038): bloquear un número que llena
--     la agenda de reservas falsas es seguridad, no carga, con el mismo
--     criterio que apagar un link (098). La página pública de un negocio
--     vencido sigue prendida y él no la puede apagar (ver QUÉ QUEDA SIN
--     DECIDIR): bloquear es lo único que le queda contra el abuso. Si algún
--     día se cierra, alcanza con sumar 'turnos_bloqueo' a la lista del
--     bloque 2.
--   · Todo DELETE: borrar una línea de fiado, una cuenta sin uso, una clase
--     mal anotada o vaciar el negocio (018). Solo INSERT y UPDATE tienen
--     candado, como en las otras 33 tablas.
--   · Sin sesión (tareas del sistema, webhooks, service_role): libre, igual
--     que siempre. auth.uid() es null y el guardián devuelve primero.
--
-- QUÉ QUEDA SIN DECIDIR (lo decide Matías; esta migración no lo toca)
--
--   · La página pública de reservas (038). reservar_publico corre sin sesión
--     (anon), así que el guardián la deja pasar: un negocio vencido con el
--     link prendido sigue recibiendo reservas, y su dueño las puede leer por
--     la API aunque la pantalla esté tapada. Tampoco puede apagar el link:
--     guardar_link_publico escribe turnos_publico, que tiene candado desde la
--     038. Cerrarlo sería que agenda_publica, huecos_publicos y
--     reservar_publico contesten como un link apagado cuando not
--     puede_cargar (cancelar_reserva seguiría abierta), y dejar que el
--     vencido apague su página. A cambio, sus clientes dejarían de poder
--     reservar.
--
-- QUÉ NO CAMBIA
--
--   · Una cuenta en prueba o que paga: nada.
--   · La personal en Gratis: lo mismo que en la 110. Ya tenía cerrados
--     fiado y billetera por `plan_personal_*`, con el mismo mensaje del
--     Pro; ahora también la frena cuenta_activa_*, que dispara antes y dice
--     lo mismo. `plan_personal_*` queda: es redundante, pero sacarlo es otra
--     tanda. Paquetes y clases, que no son de una personal, también le dicen
--     «Eso es del plan Pro…».
--   · El mensaje de la 069 queda letra por letra. No hay mensajes nuevos.
--
-- El comentario de adentro de vaciar_empresa (110:613-615) dice que la
-- marca la leen «los candados de la gratis personal»: desde acá la lee el
-- guardián para toda cuenta. La función no se toca.
--
-- Idempotente: se puede aplicar dos veces. No toca datos.
-- ============================================================


-- ------------------------------------------------------------
-- 1. EL GUARDIÁN (110:194-229)
--
--    Copia exacta de la 110 con una sola diferencia: el paso de «vaciar»
--    (orden.vaciando) sube antes de puede_cargar y deja de estar solo
--    adentro de la rama de Gratis. Para la personal en Gratis responde lo
--    mismo que en la 110 (el paso ya estaba antes de cualquier raise de su
--    rama). Para una cuenta al día tampoco cambia nada. Lo único nuevo es
--    que el SET NULL en cascada de «Empezar de cero» pasa para un negocio
--    vencido.
--
--    La marca la pone solo vaciar_empresa, después de exigir propietario y
--    el nombre exacto, dura esa transacción y vale solo para un UPDATE de
--    esa empresa: un INSERT con la marca puesta sigue rechazado. Desde el
--    navegador no se puede poner: PostgREST no deja mandar un SET ni llamar
--    a set_config (no está en los esquemas de la API), y ninguna función
--    de public la pone con un nombre que venga de afuera. Es el mismo
--    modelo de confianza que `orden.suscripcion_confiable` (proteger_empresa).
-- ------------------------------------------------------------
create or replace function public.exigir_cuenta_activa()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- 111 (30/09/2026) · «EMPEZAR DE CERO» TAMBIÉN PARA UN NEGOCIO VENCIDO.
  -- Al borrar los movimientos y los productos, el ON DELETE SET NULL de
  -- pagos_deuda, turnos_pago, turnos_atribucion, fiado y paquetes es un
  -- UPDATE que este candado rechazaba. vaciar_empresa (110,
  -- bloque 12) marca la transacción. Hasta la 110 la marca se leía solo en
  -- la rama de Gratis; ahora vale para toda cuenta.
  if tg_op = 'UPDATE'
     and coalesce(current_setting('orden.vaciando', true), '') = new.empresa_id::text then
    return new;
  end if;

  if not public.puede_cargar(new.empresa_id) then
    raise exception 'Se te terminó la prueba. Para seguir usando Orden hace falta activar tu plan.'
      using errcode = '42501';
  end if;

  -- 110 (28/09/2026) · LA CUENTA PERSONAL EN GRATIS. puede_cargar le da true
  -- para que anote gastos e ingresos; todo lo demás que cuida este candado
  -- es del Pro. Un negocio nunca entra acá: para él es_gratis_personal es false.
  -- El paso de «vaciar» que estaba acá subió arriba (111).
  if public.es_gratis_personal(new.empresa_id) then
    if tg_table_name <> 'movimientos' then
      raise exception 'Eso es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.'
        using errcode = '42501';
    end if;
    if new.tipo::text not in ('gasto', 'ingreso') then
      raise exception 'Eso es del plan Pro. En el plan Gratis anotás tus gastos e ingresos a mano.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $fn$;

revoke all on function public.exigir_cuenta_activa() from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2. LAS TABLAS DE UN NEGOCIO QUE NO TENÍAN CANDADO
--
--    fiado y la billetera (054, 074, 084) y las clases (087, 088, 091).
--    Solo INSERT y UPDATE, como en la 018: el DELETE queda libre. Lo que
--    pasa a quedar cerrado para un negocio vencido, además de anotar y
--    cobrar: archivar una cuenta con movimientos (quitar_cuenta_dinero hace
--    un UPDATE; la que no tiene uso se borra y eso sigue andando) y cerrar
--    un paquete. Las dos son manejar, y con la pantalla tapada nadie llega.
--
--    Los que escriben estas tablas sin sesión (ninguno hoy) siguen libres.
--    `clientes` NO va: archivar o eliminar a una persona anda siempre (099).
--    `turnos_bloqueo` tampoco: bloquear un número es seguridad (ver QUÉ
--    QUEDA ABIERTO, A PROPÓSITO).
-- ------------------------------------------------------------
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['fiado', 'cuentas_dinero', 'ajustes_cuenta', 'paquetes', 'clases_dadas'] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = v_tabla) then
      execute format('drop trigger if exists %I on public.%I', 'cuenta_activa_' || v_tabla, v_tabla);
      execute format('create trigger %I before insert or update on public.%I '
        || 'for each row execute function public.exigir_cuenta_activa()', 'cuenta_activa_' || v_tabla, v_tabla);
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 3. SUBIR UN COMPROBANTE ES DEL PLAN (Storage, 007:129-136)
--
--    Para subir hace falta ser de la cuenta Y que la cuenta tenga
--    comprobantes: limites_de_empresa() con escritura y adjuntos.
--
--      · negocio o personal en prueba o pagando ... sí
--      · negocio vencido (candado total) ......... no  (escritura=false)
--      · personal en Gratis ...................... no  (adjuntos=false)
--
--    No se pregunta con puede_cargar: desde la 110 le dice true a la
--    personal en Gratis. Y la policy no puede llamar a limites_de_empresa:
--    corre con los permisos de quien sube (authenticated) y esa función es
--    solo del sistema (110:120-121). Por eso nace `puede_adjuntar`, security
--    definer como puede_bajar_excel (110, bloque 4), y como ella le contesta
--    solo a quien es de la cuenta: si no, le diría a cualquiera con sesión
--    si una cuenta ajena paga o está en Gratis. Pide también escritura para
--    que el candado del negocio no dependa de cómo quede la clave adjuntos.
--
--    Ver y borrar quedan como en la 007, con es_miembro solo. Borrar tiene
--    que andar siempre (018): «Empezar de cero» devuelve las rutas y
--    ZonaPeligro.tsx las borra con la sesión de la persona, y Storage pide
--    ver además de borrar. Actualizar sigue cerrado para todos: no hay
--    policy de UPDATE (007:96-97), y no se crea. service_role (borrar la
--    cuenta) saltea RLS. La pantalla ya esconde el botón según
--    limites.adjuntos: no hace falta tocarla ni sumar textos.
-- ------------------------------------------------------------
create or replace function public.puede_adjuntar(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select public.es_miembro(p_empresa)
     and coalesce((l->>'escritura')::boolean, false)
     and coalesce((l->>'adjuntos')::boolean, false)
  from (select public.limites_de_empresa(p_empresa) as l) x;
$fn$;

comment on function public.puede_adjuntar(uuid) is
  'La usa la policy comprobantes_subir de storage.objects (111). true si quien pregunta es de la cuenta y la cuenta puede escribir y tiene comprobantes: no para un negocio vencido ni para la personal en Gratis.';

revoke all on function public.puede_adjuntar(uuid) from public, anon;
grant execute on function public.puede_adjuntar(uuid) to authenticated;

-- Mismo resguardo que la 007: sin esquema storage (las pruebas, PGlite) se
-- omite. Si el rol no puede crear policies en storage.objects, el bloque
-- entero se deshace (también el drop) y la policy vieja queda como estaba.
-- La condición que ya estaba se copia de pg_policies en producción
-- (30/09/2026); solo se suma puede_adjuntar.
do $bloque$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Sin esquema storage: se omite la policy comprobantes_subir.';
    return;
  end if;

  execute 'drop policy if exists comprobantes_subir on storage.objects';

  execute $sql$
    create policy comprobantes_subir on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'comprobantes'
        and public.es_miembro(nullif((storage.foldername(name))[1], '')::uuid)
        and public.puede_adjuntar(nullif((storage.foldername(name))[1], '')::uuid)
      )
  $sql$;

exception
  when insufficient_privilege then
    raise warning 'No se pudo reemplazar la policy comprobantes_subir (falta permiso sobre storage.objects). Quedó la anterior. Cargala a mano en Storage → Policies del bucket "comprobantes" sumando: and public.puede_adjuntar(nullif((storage.foldername(name))[1], '''')::uuid)';
end $bloque$;
