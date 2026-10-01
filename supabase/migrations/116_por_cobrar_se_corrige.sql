-- ============================================================
-- 116 · LO QUE FALTA COBRAR SE CORRIGE
-- ============================================================
--
-- Matías (30/09/2026, rubro clases, «Tenis manía»): «registré un alumno,
-- puse cuánto le voy a cobrar y que todavía no me pagó. Me aparece por
-- cobrar. Anoté mal: puse un monto extremadamente diferente. Eliminé al
-- alumno y me sigue apareciendo cuánto tengo que cobrar. Donde dice Por
-- cobrar tengo que tener la opción de editar cuánto. No puede ser que tenga
-- que eliminar la cuenta para volver a hacer.»
--
-- En su captura: Alumnos, 1 cargado. Por cobrar, Gs. 9.375.000, «2 alumnos
-- te deben su período»: Marianela Gs. 8.775.000 —la que eliminó— y Matias
-- Gs. 600.000.
--
-- POR QUÉ PASABA
--
--   · Eliminar a un alumno con una inscripción lo ARCHIVA (112): paquetes.
--     cliente_id es RESTRICT (088) y la inscripción es su historia. La
--     inscripción quedaba como estaba: sin cobrar, abierta, con sus clases
--     en la agenda.
--   · por_cobrar_alumnos (094) suma toda inscripción con precio, sin su
--     venta y sin cerrar, SIN mirar si el alumno sigue en la lista. Lo mismo
--     el «Por cobrar» y el «deben» de panel_profe (097) y el «por cobrar» y
--     el «debe» de cada alumno en reporte_alumnos (106).
--   · Y no había cómo corregir el monto de una inscripción: ni función ni
--     botón. La única salida era cobrarla (entraba plata que no existe) o
--     cerrarla desde la ficha, que no se ve una vez eliminado.
--
-- LAS LECTURAS DE «DEBE», UNA POR UNA (paquetes con movimiento_id null,
-- precio > 0 y sin cerrar):
--
--   por_cobrar_alumnos (094:353) ... lista y total ....... no miraba al alumno
--   panel_profe (097:198) .......... por_cobrar y deben ... no miraba al alumno
--   reporte_alumnos (106:861) ...... por_cobrar y el debe_inscripciones de
--                                    cada alumno ......... no miraba al alumno
--   paquetes_del_alumno (094:308) .. «pagado» de la ficha: es la ficha de UN
--                                    alumno, y a la de un archivado no se llega
--   cobrar_inscripcion (095:30) .... cobra lo que tenga movimiento_id null:
--                                    no es una lectura de deuda
--   El Excel de alumnos, la pantalla de Reportes y el panel leen esas tres.
--   El correo del lunes (109) no lee paquetes.
--
-- LO QUE SE DECIDIÓ
--
--   1. EDITAR EL MONTO de lo que falta cobrar (cambiar_precio_paquete): solo
--      mientras no se cobró, solo el dueño o un administrador (como cerrar un
--      paquete, 088), con el candado del negocio vencido (el trigger
--      cuenta_activa_paquetes de la 111: es un UPDATE). El monto se redondea
--      a los decimales de la moneda (decimales_de, 033: guaraníes sin
--      centavos), igual que el campo de la pantalla al inscribir. El precio
--      queda cerrado: precio_hora pasa a null, porque el total ya no es
--      horas × precio por hora. Lo cobrado no se edita: la plata ya entró y
--      está en el Historial.
--
--   2. «NO LO VOY A COBRAR» (anular_por_cobrar): saca una inscripción de Por
--      cobrar sin cobrarla. Con un criterio, el de lo que el modelo guarda:
--        · si no tuvo ninguna clase (ni dada ni falta en clases_dadas, ni una
--          clase marcada en la agenda) SE BORRA, con sus clases de la agenda
--          (turnos_reserva.paquete_id es CASCADE, 091). Es lo anotado por
--          error: no hay nada que conservar, y si quedara cerrada seguiría
--          contando como «vendida» y «nueva» en los reportes;
--        · si ya tuvo clases SE CIERRA SIN COBRAR, exactamente como
--          cerrar_paquete (091): su historia queda en la ficha, las clases
--          que faltaban salen de la agenda, y reabrirla la vuelve a poner
--          por cobrar.
--      Borrar no tiene candado (111: «todo DELETE queda libre», como una
--      clase mal anotada); cerrar sí, como cerrar un paquete.
--
--   3. ELIMINAR A UN ALUMNO anula lo que no se le cobró, con el mismo
--      criterio que el punto 2, ANTES de decidir si se borra o se archiva.
--      Lo cobrado queda como historia, igual que hasta hoy. Así la deuda no
--      queda colgando, y si vuelve con el mismo teléfono (guardar_cliente
--      reactiva la ficha, 052/099) vuelve sin ella. Si después de anular no
--      le queda nada atado, se borra de verdad (Marianela, la del caso: se
--      inscribió, no pagó, no tuvo clases). La pantalla lo avisa antes de
--      confirmar, con el monto.
--      Eliminar anda siempre (099, D19; 112), también en un negocio vencido:
--      cerrar su período y cancelar sus clases son dos UPDATE que el candado
--      rechazaría. eliminar_cliente marca la transacción con el alumno
--      (orden.eliminando_cliente, como orden.vaciando de la 110/111 y
--      orden.cancelando_turno de la 115) y el guardián deja pasar solo eso:
--      cerrar SUS paquetes y cancelar SUS clases.
--
--   4. Las lecturas de «debe» NO cuentan a un alumno archivado:
--      por_cobrar_alumnos, panel_profe (por_cobrar, deben y también
--      alumnos_activos) y reporte_alumnos (por_cobrar, el debe_inscripciones
--      de cada uno, activos, «a quién llamar» y su paquete vigente). Un
--      alumno eliminado no te debe ni está activo. Lo que ya pasó con él
--      (clases dadas, lo cobrado, lo vendido en el período) sigue en el
--      reporte: es historia. El fiado no se toca: «lo que te deben» del
--      fiado muestra a los archivados a propósito (058, 112).
--
--   5. ANULAR EL COBRO DE UNA INSCRIPCIÓN la vuelve a dejar por cobrar. Es el
--      camino para corregir el monto de algo ya cobrado, y el mensaje de la
--      función lo dice. Hasta hoy no andaba: anular marca la venta como
--      anulada (032) pero la inscripción seguía apuntándole, y quedaba
--      «pagada» por una venta que no cuenta en ningún lado; cobrarla de nuevo
--      decía «ya está cobrada». Un trigger, como el del fiado (055/056):
--      es una regla sobre el dato y tiene que valer venga de donde venga.
--      Si el alumno ya se eliminó, lo que vuelve a quedar sin cobrar se
--      anula en el acto, con el criterio del punto 2: es la regla del punto
--      3. Sin eso quedaba una deuda que ninguna pantalla mostraba y que
--      volvía con él si lo cargaban de nuevo con el mismo teléfono —justo lo
--      que esta migración arregla—.
--
--   6. La ficha del alumno (paquetes_del_alumno) también dice si cada
--      período ya tuvo clases: «Editar» está también ahí, junto a «Falta
--      cobrar», y avisa lo mismo que en Por cobrar.
--
-- LO QUE ESTA MIGRACIÓN HACE CON LOS DATOS QUE YA ESTÁN (al aplicarla de
-- nuevo no cambia nada):
--
--   a. Las inscripciones que apuntan a una venta anulada antes de hoy NO se
--      tocan: solo se listan, una por una. El punto 5 vale para adelante.
--      Hasta hoy, anular ese cobro y volver a cobrar no se podía («ya está
--      cobrada»), así que quien lo necesitó cargó el cobro bueno como una
--      venta suelta; o el cobro se anuló porque se devolvió la plata, o era
--      la venta repetida de un doble toque. Soltarlas todas inventaba deudas
--      que ya estaban resueltas —un monto disparatado en Por cobrar, lo
--      mismo de lo que se quejó Matías—. Con la lista, quien aplica la
--      migración ve cuáles son, y si alguna de verdad se debe se suelta a
--      mano (ver el bloque 11).
--   b. Las inscripciones sin cobrar de los alumnos ya archivados se anulan
--      con el criterio del punto 2 (el punto 3, hacia atrás). Todo alumno
--      archivado lo archivó eliminar_cliente —es la única función que pone
--      clientes.activo en false—, así que todos fueron eliminados a
--      propósito. Es el caso de Matías: la inscripción de Marianela se
--      borra, con sus clases de la agenda, y si la vuelve a cargar con el
--      mismo teléfono no reaparecen ni los Gs. 8.775.000 ni sus clases.
--      Se listan, una por una, y se avisa cuántas.
--
-- Cada función redefinida es copia exacta de su última versión (el .sql y
-- la línea se citan en cada bloque) más lo marcado «116», con los mismos
-- permisos, security definer y search_path. Las nuevas siguen el mismo
-- molde. Los mensajes nuevos tienen su portugués en src/lib/mensajes-base.ts.
--
-- Idempotente: se puede aplicar dos veces.
-- ============================================================


-- ------------------------------------------------------------
-- 1. ¿ESE PERÍODO YA TUVO CLASES?
--
--    Un solo lugar que lo decide, para que «No lo voy a cobrar», eliminar
--    al alumno y la pantalla (que avisa qué va a pasar) no puedan contestar
--    distinto. Tuvo clases si descontó alguna (clases_dadas: dada o falta,
--    088) o si alguna clase suya de la agenda se marcó (atendida o no vino,
--    092): marcar una falta sin descontarla no deja clases_dadas, pero es
--    historia igual.
-- ------------------------------------------------------------
create or replace function public.periodo_con_clases(p_paquete uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.clases_dadas c where c.paquete_id = p_paquete)
      or exists (select 1 from public.turnos_reserva r
                 where r.paquete_id = p_paquete and r.estado in ('atendida', 'no_vino'));
$fn$;

revoke all on function public.periodo_con_clases(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2. ANULAR UN PERÍODO SIN COBRAR (por dentro)
--
--    Lo usan anular_por_cobrar (3), eliminar_cliente (5), el trigger que
--    suelta un cobro anulado (7) y el arreglo de los datos (11). No revisa
--    quién llama: eso lo hace cada puerta. No hace
--    nada si ya se cobró, si no tiene precio o si ya está cerrado, y lo
--    devuelve en null.
--
--      · sin clases: se borra, y con él sus clases de la agenda (CASCADE,
--        091) → 'borrado';
--      · con clases: se cierra y salen de la agenda las que faltaban, lo
--        mismo que cerrar_paquete (091:421-453) → 'cerrado'.
-- ------------------------------------------------------------
create or replace function public.anular_periodo(p_paquete uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_p public.paquetes;
begin
  select * into v_p from public.paquetes where id = p_paquete for update;
  if v_p.id is null or v_p.movimiento_id is not null
     or coalesce(v_p.precio, 0) <= 0 or v_p.cerrado then
    return null;
  end if;

  if public.periodo_con_clases(p_paquete) then
    update public.paquetes set cerrado = true where id = p_paquete;
    update public.turnos_reserva
    set estado = 'cancelada'
    where paquete_id = p_paquete and estado in ('pendiente', 'confirmada') and inicia > now();
    return 'cerrado';
  end if;

  delete from public.paquetes where id = p_paquete;
  return 'borrado';
end $fn$;

revoke all on function public.anular_periodo(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 3. «NO LO VOY A COBRAR»
--
--    La puerta de la pantalla (Por cobrar). Del dueño o un administrador:
--    es decidir que una plata no se va a pedir.
-- ------------------------------------------------------------
create or replace function public.anular_por_cobrar(p_paquete uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_p public.paquetes;
begin
  select * into v_p from public.paquetes where id = p_paquete for update;
  if v_p.id is null then
    raise exception 'Ese paquete no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v_p.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(v_p.empresa_id) then
    raise exception 'Corregir lo que falta cobrar es del dueño o de un administrador.' using errcode = '42501';
  end if;

  if v_p.movimiento_id is not null then
    raise exception 'Eso ya se cobró. Para corregirlo, anulá ese cobro en el Historial: vuelve a quedar por cobrar y ahí lo cambiás.'
      using errcode = '22023';
  end if;

  if coalesce(v_p.precio, 0) <= 0 then
    raise exception 'Esa inscripción no tiene nada que cobrar.' using errcode = '22023';
  end if;

  if v_p.cerrado then
    raise exception 'Ese paquete está cerrado.' using errcode = '22023';
  end if;

  return jsonb_build_object('resultado', public.anular_periodo(p_paquete), 'monto', v_p.precio);
end $fn$;

revoke all on function public.anular_por_cobrar(uuid) from public, anon;
grant execute on function public.anular_por_cobrar(uuid) to authenticated;


-- ------------------------------------------------------------
-- 4. CORREGIR EL MONTO DE LO QUE FALTA COBRAR
--
--    «Si erré, sin querer puse de más o de menos.» Las mismas puertas que
--    «No lo voy a cobrar», y el candado del negocio vencido lo pone el
--    trigger cuenta_activa_paquetes (111): es un UPDATE.
--
--    El tope es el de una venta: movimientos.monto es numeric(14,2) (001),
--    y un monto que no entra ahí no se podría cobrar nunca.
-- ------------------------------------------------------------
create or replace function public.cambiar_precio_paquete(p_paquete uuid, p_precio numeric)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_p      public.paquetes;
  v_moneda text;
  v_precio numeric;
begin
  select * into v_p from public.paquetes where id = p_paquete for update;
  if v_p.id is null then
    raise exception 'Ese paquete no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v_p.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(v_p.empresa_id) then
    raise exception 'Corregir lo que falta cobrar es del dueño o de un administrador.' using errcode = '42501';
  end if;

  if v_p.movimiento_id is not null then
    raise exception 'Eso ya se cobró. Para corregirlo, anulá ese cobro en el Historial: vuelve a quedar por cobrar y ahí lo cambiás.'
      using errcode = '22023';
  end if;

  -- Un paquete de regalo no es «lo que falta cobrar»: ponerle precio acá lo
  -- convertiría en una deuda que nadie acordó.
  if coalesce(v_p.precio, 0) <= 0 then
    raise exception 'Esa inscripción no tiene nada que cobrar.' using errcode = '22023';
  end if;

  if v_p.cerrado then
    raise exception 'Ese paquete está cerrado.' using errcode = '22023';
  end if;

  -- Guaraníes sin centavos, el resto con dos (033): lo mismo que admite el
  -- campo de la pantalla al inscribir.
  select moneda into v_moneda from public.empresas where id = v_p.empresa_id;
  v_precio := round(coalesce(p_precio, 0), public.decimales_de(v_moneda));

  if v_precio <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_precio >= 1000000000000 then
    raise exception 'Ese monto es demasiado grande. Revisá los ceros.' using errcode = '22023';
  end if;

  update public.paquetes set precio = v_precio, precio_hora = null where id = p_paquete;

  return jsonb_build_object('paquete', p_paquete, 'antes', v_p.precio, 'monto', v_precio);
end $fn$;

revoke all on function public.cambiar_precio_paquete(uuid, numeric) from public, anon;
grant execute on function public.cambiar_precio_paquete(uuid, numeric) to authenticated;


-- ------------------------------------------------------------
-- 5. ELIMINAR UN CLIENTE (112:42-124)
--
--    Copia exacta de la 112 con un paso más, marcado (116), entre el
--    candado y la decisión de borrar o archivar: sus períodos sin cobrar se
--    anulan (2). Va antes a propósito: si lo único que lo ataba era una
--    inscripción anotada por error, después de anularla no le queda nada y
--    se borra de verdad. Devuelve lo mismo de siempre: 'borrado' o
--    'archivado'.
-- ------------------------------------------------------------
create or replace function public.eliminar_cliente(p_cliente uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v       public.clientes;
  v_saldo numeric;
  v_debe  text;
  v_paq   uuid;
begin
  select * into v from public.clientes where id = p_cliente;
  if v.id is null then
    raise exception 'Ese cliente ya no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(v.empresa_id) then
    raise exception 'Eliminar clientes es del dueño o de un administrador.' using errcode = '42501';
  end if;

  -- El mismo candado que al cobrar (056): mientras se decide, nadie le fía
  -- ni le cobra a este cliente.
  perform 1 from public.clientes where id = p_cliente for update;

  v_saldo := public.saldo_fiado(p_cliente);
  if v_saldo > 0 then
    -- «80.000» y no «80000.00»: esto lo lee una persona.
    v_debe := case when v_saldo = trunc(v_saldo)
                   then replace(to_char(v_saldo, 'FM999,999,999,990'), ',', '.')
                   else v_saldo::text end;
    raise exception '% todavía te debe %. Cobrale o borrá esa deuda desde Fiado, y después lo eliminás.',
      v.nombre, v_debe using errcode = '22023';
  end if;

  -- (116) Lo que no se le cobró se anula: sin clases se borra con su
  -- agenda, con clases se cierra y salen de la agenda las que faltaban.
  -- Lo cobrado queda como historia. Sin esto la deuda quedaba en «Por
  -- cobrar» a nombre de alguien que ya no está, y volvía con él si lo
  -- cargaban de nuevo con el mismo teléfono. La marca deja pasar ese
  -- cierre en un negocio vencido (ver exigir_cuenta_activa): eliminar anda
  -- siempre (099, D19). Dura hasta el final de este paso.
  perform set_config('orden.eliminando_cliente', p_cliente::text, true);
  for v_paq in
    select p.id from public.paquetes p
    where p.cliente_id = p_cliente and p.movimiento_id is null and p.precio > 0 and not p.cerrado
  loop
    perform public.anular_periodo(v_paq);
  end loop;
  perform set_config('orden.eliminando_cliente', '', true);

  -- Sin nada atado se borra de verdad: no hay nada que conservar.
  if not exists (select 1 from public.fiado where cliente_id = p_cliente)
     and not exists (select 1 from public.movimientos where cliente_id = p_cliente)
     and not exists (select 1 from public.turnos_reserva where cliente_id = p_cliente)
     -- (098) Sus rutinas, sus medidas y cómo subieron sus cargas son su
     -- historia: con cualquiera de las tres, se archiva.
     and not exists (select 1 from public.rutinas where cliente_id = p_cliente)
     and not exists (select 1 from public.mediciones where cliente_id = p_cliente)
     and not exists (select 1 from public.cargas_historial where cliente_id = p_cliente)
     -- (112) Sus paquetes también: paquetes.cliente_id es ON DELETE RESTRICT
     -- (088) y, sin esta línea, el borrado fallaba en vez de archivar.
     and not exists (select 1 from public.paquetes where cliente_id = p_cliente) then
    delete from public.clientes where id = p_cliente;
    return 'borrado';
  end if;

  -- Con historia se archiva. La lista y el buscador ya dejan afuera a los
  -- archivados (052, 053); «lo que te deben» no, así que si alguna vez
  -- vuelve a deber algo, aparece ahí igual.
  update public.clientes set activo = false, updated_at = now() where id = p_cliente;

  -- (099) Archivado, ninguna pantalla llega a su Progreso ni a su ficha,
  -- así que sus medidas, su consentimiento y «Salud y lesiones» quedaban
  -- guardados sin forma de borrarlos (Ley 7593/2025). Se van acá, en la
  -- misma transacción. Las rutinas y cómo subieron sus cargas se quedan:
  -- son el trabajo del trainer, no datos de salud, y no se ven en ningún
  -- link. Si la persona vuelve con el mismo nombre y teléfono, vuelve a dar
  -- su consentimiento. Los candados de cuenta vencida (098) son de insert
  -- y update, y `clientes` no tiene uno: esto anda siempre, como el link.
  delete from public.mediciones where cliente_id = p_cliente;
  delete from public.fichas_entreno where cliente_id = p_cliente;
  update public.clientes set notas = '' where id = p_cliente;

  -- (098) Su link se apaga y cambia de token. Apagado solo por estar
  -- archivado no alcanza: `guardar_cliente` (052) toma un teléfono repetido
  -- como la misma persona y reactiva la ficha, y con un teléfono compartido
  -- (madre e hijo, una pareja) el link que la otra persona tiene en su
  -- celular volvería a andar, a nombre de otra. Si vuelve la misma persona,
  -- el trainer prende el link y le manda el nuevo. `rutina_enlaces` no
  -- tiene el candado de cuenta vencida: esto anda siempre.
  update public.rutina_enlaces
  set activo = false, token = gen_random_uuid(), updated_at = now()
  where cliente_id = p_cliente;

  return 'archivado';
end $fn$;

revoke all on function public.eliminar_cliente(uuid) from public, anon;
grant execute on function public.eliminar_cliente(uuid) to authenticated;


-- ------------------------------------------------------------
-- 6. EL GUARDIÁN (115:483-535)
--
--    Copia exacta de la 115 con un paso más, marcado «116», después del de
--    cancelar con el enlace: los dos UPDATE con que eliminar_cliente (5)
--    anula el período con clases de un alumno —cerrar su paquete y cancelar
--    sus clases que faltaban— pasan aunque el negocio esté vencido, y solo
--    esos: la marca es el id del alumno, y vale para un paquete de ESE
--    alumno que queda cerrado y una reserva de ESE alumno que queda
--    cancelada. Anidado por tabla, como `new.token` en la 115: `new.cerrado`
--    existe solo en paquetes.
--
--    La marca la pone solo eliminar_cliente, después de exigir dueño o
--    administrador, y la apaga antes de seguir. Desde el navegador no se
--    puede poner: PostgREST no deja mandar un SET ni llamar a set_config
--    (111). Borrar un período sin clases no la necesita: todo DELETE está
--    libre (111).
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

  -- 115 (30/09/2026) · CANCELAR CON EL ENLACE ANDA SIEMPRE. cancelar_reserva
  -- marca la transacción con el token de la reserva que cancela. Sin sesión
  -- ya pasaba por el primer `if`; con sesión (un cliente que además usa
  -- Orden) este candado la rechazaba si el negocio estaba vencido.
  if tg_op = 'UPDATE' and tg_table_name = 'turnos_reserva' then
    if coalesce(current_setting('orden.cancelando_turno', true), '') = new.token::text
       and new.estado = 'cancelada' then
      return new;
    end if;
  end if;

  -- 116 (30/09/2026) · ELIMINAR A UN ALUMNO ANDA SIEMPRE, TAMBIÉN CON LO
  -- QUE NO SE LE COBRÓ. eliminar_cliente marca la transacción con el
  -- alumno: pasa cerrar SU paquete y cancelar SUS clases, nada más.
  if tg_op = 'UPDATE' and tg_table_name = 'paquetes' then
    if coalesce(current_setting('orden.eliminando_cliente', true), '') = new.cliente_id::text
       and new.cerrado then
      return new;
    end if;
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'turnos_reserva' then
    if coalesce(current_setting('orden.eliminando_cliente', true), '') = new.cliente_id::text
       and new.estado = 'cancelada' then
      return new;
    end if;
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
-- 7. ANULAR EL COBRO DE UNA INSCRIPCIÓN LA VUELVE A DEJAR POR COBRAR
--
--    Anular no borra la venta: la marca (032). La inscripción le seguía
--    apuntando y quedaba «pagada» por una venta que no suma en ningún lado.
--    Se suelta acá, como el fiado de una venta anulada se borra en
--    anular_borra_el_fiado (055/056), y por lo mismo con un trigger: es una
--    regla sobre el dato y vale venga por donde venga.
--
--    El UPDATE de paquetes pasa por su candado (111): quien puede anular una
--    venta puede cargar, así que para él pasa igual.
--
--    Si el alumno ya se eliminó (archivado porque tenía un cobro, 112), lo
--    que se acaba de soltar se anula enseguida con anular_periodo (2), la
--    misma regla que eliminar_cliente (5) y el arreglo de los datos (11):
--    sin clases se borra con su agenda; con clases se cierra. Si no, quedaba
--    abierto y sin cobrar a nombre de un archivado: las lecturas de «debe»
--    no lo cuentan (8-10) y ninguna pantalla llega a él para sacarlo, pero
--    al volver con el mismo teléfono (guardar_cliente lo reactiva, 099)
--    reaparecía en Por cobrar un período cuya plata ya se le había
--    devuelto. Cerrar no necesita la marca de eliminar: anular_movimiento
--    escribe en movimientos, que ya exige la cuenta activa (111).
-- ------------------------------------------------------------
create or replace function public.anular_vuelve_por_cobrar()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_archivados uuid[];
  v_paq        uuid;
begin
  if new.estado <> 'anulado' or old.estado = 'anulado' then
    return new;
  end if;

  with sueltos as (
    update public.paquetes set movimiento_id = null
    where movimiento_id = new.id
    returning id, cliente_id
  )
  select coalesce(array_agg(s.id), '{}'::uuid[]) into v_archivados
  from sueltos s
  join public.clientes c on c.id = s.cliente_id
  where not c.activo;

  foreach v_paq in array v_archivados loop
    perform public.anular_periodo(v_paq);
  end loop;

  return new;
end $fn$;

revoke all on function public.anular_vuelve_por_cobrar() from public, anon, authenticated;

drop trigger if exists anular_vuelve_por_cobrar on public.movimientos;
create trigger anular_vuelve_por_cobrar
  after update of estado on public.movimientos
  for each row execute function public.anular_vuelve_por_cobrar();


-- ------------------------------------------------------------
-- 8. LO QUE FALTA COBRAR (094:353-377) Y LA FICHA DEL ALUMNO (094:308-351)
--
--    Copia exacta de la 094 con dos cambios, marcados (116): el alumno
--    tiene que estar en la lista (c.activo), y cada fila dice si ese
--    período ya tuvo clases, para que la pantalla avise qué va a pasar con
--    «No lo voy a cobrar» antes de tocarlo. La ficha, más abajo, dice lo
--    mismo de cada período.
-- ------------------------------------------------------------
create or replace function public.por_cobrar_alumnos(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'paquete', p.id, 'cliente_id', p.cliente_id, 'alumno', c.nombre,
           'nombre', p.nombre, 'materia', p.materia,
           'monto', p.precio, 'desde', p.desde, 'hasta', p.vence_el,
           -- (116) Si ya tuvo clases, «No lo voy a cobrar» la cierra en vez
           -- de borrarla (ver anular_periodo).
           'tuvo_clases', public.periodo_con_clases(p.id))
         order by p.desde nulls last, c.nombre), '[]'::jsonb)
  into v_lista
  from public.paquetes p
  join public.clientes c on c.id = p.cliente_id
  where p.empresa_id = p_empresa and p.movimiento_id is null and p.precio > 0 and not p.cerrado
    -- (116) Un alumno eliminado ya no te debe: no aparece.
    and c.activo;

  return jsonb_build_object(
    'total', coalesce((select sum((x->>'monto')::numeric) from jsonb_array_elements(v_lista) x), 0),
    'lista', v_lista);
end $fn$;

revoke all on function public.por_cobrar_alumnos(uuid) from public, anon;
grant execute on function public.por_cobrar_alumnos(uuid) to authenticated;

-- La ficha del alumno (094:308-351). Copia exacta de la 094 con una clave
-- más, marcada (116): si ese período ya tuvo clases. «Editar» también está
-- en la ficha, junto a «Falta cobrar», y su «No lo voy a cobrar» avisa lo
-- mismo que en la tarjeta, con la misma respuesta de periodo_con_clases.
create or replace function public.paquetes_del_alumno(p_empresa uuid, p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_lista jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x.fila order by x.orden, x.creado desc), '[]'::jsonb)
  into v_lista
  from (
    select
      p.created_at as creado,
      case when (public.estado_paquete(p.id)->>'estado') = 'activo' then 0 else 1 end as orden,
      jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre,
        'materia', p.materia,
        'clases', p.clases,
        'precio', p.precio,
        'vence_el', p.vence_el,
        'creado', p.created_at,
        'dias', to_jsonb(p.dias),
        'hora_desde', to_char(p.hora_desde, 'HH24:MI'),
        'hora_hasta', to_char(p.hora_hasta, 'HH24:MI'),
        'desde', p.desde,
        'precio_hora', p.precio_hora,
        'pagado', p.movimiento_id is not null or coalesce(p.precio, 0) = 0,
        -- (116)
        'tuvo_clases', public.periodo_con_clases(p.id)
      ) || public.estado_paquete(p.id)
        || jsonb_build_object('historia', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', c.id, 'fecha', c.fecha, 'cantidad', c.cantidad, 'motivo', c.motivo)
                    order by c.fecha desc, c.created_at desc)
             from public.clases_dadas c where c.paquete_id = p.id
           ), '[]'::jsonb)) as fila
    from public.paquetes p
    where p.empresa_id = p_empresa and p.cliente_id = p_cliente
  ) x;

  return v_lista;
end $fn$;

revoke all on function public.paquetes_del_alumno(uuid, uuid) from public, anon;
grant execute on function public.paquetes_del_alumno(uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- 9. EL PANEL DEL PROFE (097:198-248)
--
--    Copia exacta de la 097 con el alumno en la lista (c.activo) en lo que
--    falta cobrar, cuántos deben y cuántos alumnos activos hay, marcado
--    (116). Un alumno eliminado no te debe ni está activo.
-- ------------------------------------------------------------
create or replace function public.panel_profe(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona text;
  v_hoy  date;
  v_res  jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;
  v_hoy := public.hoy_empresa(p_empresa);

  select jsonb_build_object(
    'hoy', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'hora', to_char(r.inicia at time zone v_zona, 'HH24:MI'),
        'alumno', r.cliente_nombre, 'estado', r.estado, 'materia', pq.materia,
        'notas', nullif(trim(cl.notas), '')) order by r.inicia)
      from public.turnos_reserva r
      left join public.paquetes pq on pq.id = r.paquete_id
      left join public.clientes cl on cl.id = r.cliente_id and cl.empresa_id = r.empresa_id
      where r.empresa_id = p_empresa and r.estado <> 'cancelada'
        and (r.inicia at time zone v_zona)::date = v_hoy), '[]'::jsonb),
    'clases_periodo', (
      select count(*)::int from public.turnos_reserva r
      where r.empresa_id = p_empresa and r.estado = 'atendida'
        and (r.inicia at time zone v_zona)::date between p_desde and p_hasta),
    'cobrado', coalesce((
      select sum(m.monto) from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo in ('venta', 'ingreso')
        and m.fecha between p_desde and p_hasta), 0),
    'gastado', coalesce((
      select sum(m.monto) from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
        and m.fecha between p_desde and p_hasta), 0),
    'por_cobrar', coalesce((
      select sum(p.precio) from public.paquetes p
      where p.empresa_id = p_empresa and p.movimiento_id is null and p.precio > 0 and not p.cerrado
        -- (116)
        and exists (select 1 from public.clientes c where c.id = p.cliente_id and c.activo)), 0),
    'deben', (
      select count(distinct p.cliente_id)::int from public.paquetes p
      where p.empresa_id = p_empresa and p.movimiento_id is null and p.precio > 0 and not p.cerrado
        -- (116)
        and exists (select 1 from public.clientes c where c.id = p.cliente_id and c.activo)),
    'alumnos_activos', (
      select count(distinct p.cliente_id)::int from public.paquetes p
      where p.empresa_id = p_empresa and not p.cerrado
        and (public.estado_paquete(p.id)->>'estado') = 'activo'
        -- (116)
        and exists (select 1 from public.clientes c where c.id = p.cliente_id and c.activo))
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.panel_profe(uuid, date, date) from public, anon;
grant execute on function public.panel_profe(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 10. ALUMNOS DEL PERÍODO (106:861-1036)
--
--    Copia exacta de la 106 con lo marcado (116): cada paquete sabe si su
--    alumno sigue en la lista (`alumno_activo`), y con eso lo que se debe
--    hoy (por_cobrar y el debe_inscripciones de cada uno), los activos de
--    hoy, «a quién llamar» y el paquete vigente de cada alumno dejan afuera
--    a los eliminados. Lo que ya pasó —clases, faltas, lo cobrado, lo
--    vendido, los nuevos— no se toca: es historia. El fiado tampoco (058,
--    112).
-- ------------------------------------------------------------
create or replace function public.reporte_alumnos(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona text;
  v_hoy  date;
  v_res  jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;
  v_hoy := public.hoy_empresa(p_empresa);

  with
  paq as (
    select p.*,
           (p.created_at at time zone v_zona)::date as creado_el,
           coalesce(u.usadas, 0) as usadas,
           u.ultima,
           case
             when p.cerrado then 'cerrado'
             when coalesce(u.usadas, 0) >= p.clases then 'terminado'
             when p.vence_el is not null and p.vence_el < v_hoy then 'vencido'
             else 'activo' end as estado,
           -- (116) Si su alumno sigue en la lista.
           al.activo as alumno_activo
    from public.paquetes p
    join public.clientes al on al.id = p.cliente_id
    left join lateral (
      select sum(c.cantidad) as usadas, max(c.fecha) as ultima
      from public.clases_dadas c where c.paquete_id = p.id
    ) u on true
    where p.empresa_id = p_empresa
  ),
  clases as (
    select c.* from public.clases_dadas c
    where c.empresa_id = p_empresa and c.fecha between p_desde and p_hasta
  ),
  cierres as (
    -- Los paquetes que terminaron o vencieron DENTRO del período.
    select q.*,
           case when q.usadas >= q.clases then 'terminado' else 'vencido' end as como,
           exists (select 1 from public.paquetes n
                   where n.empresa_id = p_empresa and n.cliente_id = q.cliente_id
                     and n.id <> q.id and n.created_at > q.created_at) as renovo
    from paq q
    where not q.cerrado
      and (
        (q.usadas >= q.clases and q.ultima between p_desde and p_hasta)
        or (q.usadas < q.clases and q.vence_el between p_desde and p_hasta and q.vence_el < v_hoy)
      )
  ),
  ventas as (
    select m.* from public.movimientos m
    where m.empresa_id = p_empresa and m.tipo = 'venta' and m.estado = 'activo'
      and m.fecha between p_desde and p_hasta
  ),
  fiado as (
    select f.cliente_id, sum(case when f.tipo = 'fio' then f.monto else -f.monto end) as saldo
    from public.fiado f where f.empresa_id = p_empresa
    group by f.cliente_id
  ),
  por_alumno as (
    select c.id as cliente_id, c.nombre,
           coalesce((select sum(k.cantidad) from clases k join paq q on q.id = k.paquete_id
                     where q.cliente_id = c.id and k.motivo = 'dada'), 0) as clases,
           coalesce((select sum(k.cantidad) from clases k join paq q on q.id = k.paquete_id
                     where q.cliente_id = c.id and k.motivo = 'falta'), 0) as faltas,
           coalesce((select sum(v.monto) from ventas v where v.cliente_id = c.id), 0) as cobrado,
           coalesce((select sum(q.precio) from paq q
                     where q.cliente_id = c.id and q.movimiento_id is null
                       and q.precio > 0 and not q.cerrado
                       -- (116)
                       and q.alumno_activo), 0) as debe_inscripciones,
           greatest(coalesce((select f.saldo from fiado f where f.cliente_id = c.id), 0), 0) as debe_fiado,
           (select jsonb_build_object('id', q.id, 'nombre', q.nombre, 'materia', q.materia,
                                      'clases', q.clases, 'usadas', q.usadas,
                                      'quedan', greatest(0, q.clases - q.usadas),
                                      'vence_el', q.vence_el)
              from paq q where q.cliente_id = c.id and q.estado = 'activo'
                -- (116)
                and q.alumno_activo
              order by q.created_at desc limit 1) as vigente,
           (select max(k.fecha) from public.clases_dadas k join paq q on q.id = k.paquete_id
             where q.cliente_id = c.id and k.motivo = 'dada' and k.fecha <= v_hoy) as ultima_clase
    from public.clientes c
    where c.empresa_id = p_empresa
      and exists (select 1 from paq q where q.cliente_id = c.id)
  ),
  materias as (
    select count(distinct q.materia) as n from paq q where q.materia is not null
  )
  select jsonb_build_object(
    'clases_dadas', coalesce((select sum(cantidad) from clases where motivo = 'dada'), 0),
    'faltas',       coalesce((select sum(cantidad) from clases where motivo = 'falta'), 0),
    'por_semana', coalesce((
      select jsonb_agg(jsonb_build_object('semana', s.semana, 'dadas', s.dadas, 'faltas', s.faltas)
             order by s.semana)
      from (
        select date_trunc('week', k.fecha)::date as semana,
               coalesce(sum(k.cantidad) filter (where k.motivo = 'dada'), 0)  as dadas,
               coalesce(sum(k.cantidad) filter (where k.motivo = 'falta'), 0) as faltas
        from clases k group by 1
      ) s), '[]'::jsonb),
    'cobrado', coalesce((select sum(monto) from ventas), 0),
    -- Sin clases dadas no hay «por clase»: null, no un cero que parece dato.
    'cobrado_por_clase', (
      select case when coalesce(sum(k.cantidad), 0) > 0
                  then coalesce((select sum(monto) from ventas), 0) / sum(k.cantidad)
                  else null end
      from clases k where k.motivo = 'dada'),
    'por_cobrar', coalesce((select sum(q.precio) from paq q
                            where q.movimiento_id is null and q.precio > 0 and not q.cerrado
                              -- (116)
                              and q.alumno_activo), 0),
    -- El fiado va aparte de las inscripciones: así «por cobrar» es el mismo
    -- número que `por_cobrar_alumnos` y la suma de `alumnos[].debe` es
    -- por_cobrar + fiado_pendiente, sin contar nada dos veces.
    'fiado_pendiente', coalesce((select sum(a.debe_fiado) from por_alumno a), 0),
    'activos', (select count(distinct q.cliente_id)::int from paq q
                where q.estado = 'activo'
                  -- (116)
                  and q.alumno_activo),
    'nuevos', (
      select count(*)::int from (
        select q.cliente_id from paq q group by q.cliente_id
        having min(q.creado_el) between p_desde and p_hasta) n),
    'paquetes', jsonb_build_object(
      'vendidos',   (select count(*)::int from paq q where q.creado_el between p_desde and p_hasta),
      'terminados', (select count(*)::int from cierres where como = 'terminado'),
      'vencidos',   (select count(*)::int from cierres where como = 'vencido'),
      'renovaron',  (select count(*)::int from cierres where renovo)),
    -- A quién llamar: paquetes activos con 2 clases o menos, o que vencen
    -- en la próxima semana.
    'por_terminar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'paquete', q.id, 'cliente_id', q.cliente_id, 'alumno', c.nombre,
               'nombre', q.nombre, 'quedan', greatest(0, q.clases - q.usadas),
               'vence_el', q.vence_el)
             order by greatest(0, q.clases - q.usadas), q.vence_el nulls last, c.nombre)
      from paq q join public.clientes c on c.id = q.cliente_id
      where q.estado = 'activo'
        -- (116) A un alumno eliminado no se lo llama.
        and q.alumno_activo
        and (q.clases - q.usadas <= 2 or (q.vence_el is not null and q.vence_el <= v_hoy + 7))), '[]'::jsonb),
    'alumnos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cliente_id', a.cliente_id, 'nombre', a.nombre,
               'clases', a.clases, 'faltas', a.faltas, 'cobrado', a.cobrado,
               'debe', a.debe_inscripciones + a.debe_fiado,
               'debe_inscripciones', a.debe_inscripciones, 'debe_fiado', a.debe_fiado,
               'paquete', a.vigente->>'nombre',
               'materia', a.vigente->>'materia',
               'usadas', (a.vigente->>'usadas')::numeric,
               'quedan', (a.vigente->>'quedan')::numeric,
               'vence_el', a.vigente->>'vence_el',
               'ultima_clase', a.ultima_clase)
             order by a.nombre)
      from por_alumno a
      where a.clases > 0 or a.faltas > 0 or a.cobrado > 0
         or a.debe_inscripciones > 0 or a.debe_fiado > 0 or a.vigente is not null), '[]'::jsonb),
    -- Cobrado por paquete o plan: sin costo ni margen, que acá no existen.
    'por_paquete', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'vendidos', x.vendidos, 'cobrado', x.cobrado)
             order by x.cobrado desc, x.nombre)
      from (
        select q.nombre, count(*)::int as vendidos, sum(v.monto) as cobrado
        from paq q join ventas v on v.id = q.movimiento_id
        group by q.nombre
      ) x), '[]'::jsonb),
    -- Por materia, solo si el profe enseña dos o más (094).
    'por_materia', case when (select n from materias) >= 2 then coalesce((
      select jsonb_agg(jsonb_build_object('materia', x.materia, 'alumnos', x.alumnos, 'cobrado', x.cobrado)
             order by x.cobrado desc)
      from (
        select q.materia, count(distinct q.cliente_id)::int as alumnos, sum(v.monto) as cobrado
        from paq q join ventas v on v.id = q.movimiento_id
        group by q.materia
      ) x), '[]'::jsonb) else '[]'::jsonb end
  ) into v_res;

  return v_res;
end $fn$;

revoke all on function public.reporte_alumnos(uuid, date, date) from public, anon;
grant execute on function public.reporte_alumnos(uuid, date, date) to authenticated;


-- ------------------------------------------------------------
-- 11. LOS DATOS QUE YA ESTÁN (una vez)
--
--    Corre sin sesión (auth.uid() null): el guardián deja pasar todo, como
--    a cualquier tarea del sistema (111). Al aplicarla otra vez no cambia
--    nada: (a) vuelve a listar lo mismo y (b) ya no encuentra nada.
--
--    a. Lo cobrado con una venta que se anuló ANTES de esta migración se deja
--       como estaba —apuntando a su venta anulada, fuera de Por cobrar, como
--       hasta la 115— y solo se lista: negocio, alumno, período y monto. El
--       trigger del bloque 7 vale para las anulaciones de ahora en más.
--       Soltarlas todas a ciegas convertía en deuda cobros que ya estaban
--       resueltos: el cobro bueno cargado a mano como venta suelta (cobrar
--       otra vez decía «ya está cobrada»), la plata devuelta de un período
--       terminado, la venta repetida de un doble toque. Si alguna de la
--       lista de verdad se debe, se suelta a mano, de a una, y aparece en Por
--       cobrar para corregirla o cobrarla:
--         update public.paquetes set movimiento_id = null where id = '<paquete>';
--    b. Lo que no se cobró de los alumnos ya eliminados se anula como si se
--       los eliminara hoy (5, hacia atrás), y también se lista.
-- ------------------------------------------------------------
do $$
declare
  v_f        record;
  v_res      text;
  v_viejos   integer := 0;
  v_borrados integer := 0;
  v_cerrados integer := 0;
begin
  for v_f in
    select e.nombre as negocio, c.nombre as alumno, p.id, p.nombre, p.desde, p.vence_el, p.precio
    from public.paquetes p
    join public.movimientos m on m.id = p.movimiento_id
    join public.clientes c on c.id = p.cliente_id
    join public.empresas e on e.id = p.empresa_id
    where m.estado = 'anulado'
    order by e.nombre, c.nombre, p.desde nulls last
  loop
    v_viejos := v_viejos + 1;
    raise notice '116: cobro anulado antes de hoy, queda como estaba: «%» · % · % (% a %) · % · paquete %',
      v_f.negocio, v_f.alumno, v_f.nombre, v_f.desde, v_f.vence_el, v_f.precio, v_f.id;
  end loop;
  if v_viejos > 0 then
    raise notice '116: % inscripciones con su cobro anulado quedan como estaban. Ver el bloque 11 para soltar una a mano.',
      v_viejos;
  end if;

  for v_f in
    select e.nombre as negocio, c.nombre as alumno, p.id, p.nombre, p.desde, p.vence_el, p.precio
    from public.paquetes p
    join public.clientes c on c.id = p.cliente_id
    join public.empresas e on e.id = p.empresa_id
    where not c.activo and p.movimiento_id is null and p.precio > 0 and not p.cerrado
    order by e.nombre, c.nombre, p.desde nulls last
  loop
    v_res := public.anular_periodo(v_f.id);
    if v_res = 'borrado' then v_borrados := v_borrados + 1; end if;
    if v_res = 'cerrado' then v_cerrados := v_cerrados + 1; end if;
    raise notice '116: alumno ya eliminado, sin cobrar, %: «%» · % · % (% a %) · % · paquete %',
      v_res, v_f.negocio, v_f.alumno, v_f.nombre, v_f.desde, v_f.vence_el, v_f.precio, v_f.id;
  end loop;
  if v_borrados + v_cerrados > 0 then
    raise notice '116: de alumnos ya eliminados, % inscripciones sin cobrar se borraron y % se cerraron.',
      v_borrados, v_cerrados;
  end if;
end $$;
