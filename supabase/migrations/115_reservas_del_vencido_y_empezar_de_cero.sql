-- ============================================================
-- 115 · LA PÁGINA DE RESERVAS DEL NEGOCIO VENCIDO SE APAGA, Y
--       «EMPEZAR DE CERO» ANDA SIEMPRE
-- ============================================================
--
-- El número salta de la 112 a la 115 a propósito: la 113 y la 114 son de
-- otro trabajo (los videos del personal trainer). Esta no depende de ellas
-- ni ellas de esta.
--
-- A. LA PÁGINA DE RESERVAS DE UN NEGOCIO VENCIDO
--
-- Lo decidió Matías el 30/09/2026: «se vence y ya no funciona más; cuando
-- paga, vuelve». La 111 lo había dejado sin decidir (111:66-77): como
-- reservar_publico corre sin sesión, el guardián la dejaba pasar, y un
-- negocio vencido con el link prendido seguía mostrando su página y sus
-- huecos y tomando reservas que su dueño no podía ni ver (la pantalla está
-- tapada) ni atender.
--
-- Desde acá, para un negocio que no puede cargar (puede_cargar = false),
-- las tres puertas públicas que dan turnos nuevos contestan EXACTAMENTE lo
-- mismo que con el link apagado (038): agenda_publica {existe: false},
-- huecos_publicos [] y reservar_publico «Esta página de reservas no está
-- disponible.». Por el mismo camino: la condición se suma a la que ya mira
-- si el link está activo. No se distingue un vencido de un link apagado o
-- inexistente, por lo mismo que la 038 no distingue esos dos: decirle
-- «este negocio no pagó» a cualquiera que pruebe links sería peor que
-- decirle «no existe». (Hasta hoy, quien reservaba con una sesión de Orden
-- abierta en ese navegador chocaba con el guardián y leía «Se te terminó la
-- prueba…»: se enteraba justo de eso. Ahora lee lo mismo que todos.)
--
-- No se guarda nada: ni se apaga el link ni se toca turnos_publico. Es una
-- cuenta que se hace en cada visita, así que cuando el negocio paga la
-- página vuelve sola, con el mismo link y los mismos datos, sin que nadie
-- la prenda. (Distinto de pasarse a clases, 089, donde el link sí se apaga
-- y el dueño lo vuelve a prender: ahí cambió cómo trabaja; acá es plata, y
-- dura lo que dura la deuda.) Por eso el vencido tampoco necesita poder
-- apagarla él (111:74-76): ya está apagada.
--
-- La personal y todo negocio en prueba o pagando: nada cambia, porque para
-- ellos puede_cargar es true (a la personal en Gratis también, 110).
--
-- LO QUE YA ESTABA RESERVADO NO SE ESCONDE
--
--   · reserva_por_token (la página /turno/[token]) no se toca: el cliente
--     sigue viendo su turno, con el negocio, el día y la hora.
--   · cancelar_reserva sigue abierta, y ahora para cualquiera que tenga el
--     enlace. Hasta hoy, si quien cancelaba tenía una sesión de Orden en ese
--     navegador (un cliente que además usa Orden, o el mismo dueño probando
--     su link), el guardián le leía auth.uid() y lo rechazaba con «Se te
--     terminó la prueba…»: no lo dejaba cancelar y encima le contaba que el
--     negocio no pagó. Sin sesión, andaba. Ahora cancelar_reserva marca la
--     transacción con el token de ESA reserva (como vaciar_empresa con
--     orden.vaciando, 110/111) y el guardián deja pasar ese UPDATE y ningún
--     otro (bloques 4 y 5). No abre nada nuevo: con el token, cancelar sin
--     sesión ya andaba siempre.
--   · Las reservas que ya existen no se borran ni se tocan. Desde adentro
--     el dueño sigue sin poder cancelar, mover ni atender (cancelar_turno y
--     compañía): eso es usar la agenda, y el candado sigue igual.
--
-- LAS OTRAS PUERTAS SIN SESIÓN (grep de «to anon» en todas las migraciones)
--
--   · slug_de, lista_precios, limites_plan, dias_de_prueba,
--     precio_por_vendedor, categorias_de_rubro, categorias_de_ingreso,
--     rubro_cierra_el_dia, rubros_validos, rubro_de_alumnos, decimales_de,
--     promo_de_la_prueba, planes_de_rubro y plan_de_prueba no son de ningún
--     negocio: no dan turnos.
--   · rutina_por_token (098) no da turnos y ya tiene su propia regla para
--     el vencido, decidida por Matías: 30 días de gracia y después «Tu
--     entrenador tiene que renovar su cuenta». No se toca.
--   · /api/aviso-reserva llama a aviso_de_reserva (046) con service_role y
--     solo anuncia una reserva que ya se hizo: sin reservas nuevas, no hay
--     nada que anunciar.
--   Ninguna otra da turnos nuevos.
--
-- B. «EMPEZAR DE CERO» ANDA SIEMPRE
--
-- Irse tiene que ser gratis y tiene que andar siempre (018:124-129). Hasta
-- hoy vaciar_empresa fallaba con CUALQUIER plan, en prueba, pagando o
-- vencido:
--
--   · en todo negocio con una reserva de la agenda, en cualquier estado
--     (servicios; clases con alumnos inscriptos; entrenamiento con clientes
--     agendados): «violates RESTRICT setting of foreign key constraint
--     turnos_reserva_producto_id_fkey». turnos_reserva.producto_id es NOT
--     NULL con ON DELETE RESTRICT (037:116) y vaciar borra los productos.
--   · en agricultura con una liquidación, activa o anulada:
--     liquidaciones_mov_fk (100:299) apunta a la venta sin ON DELETE, y
--     vaciar borra los movimientos.
--
-- EL DIAGNÓSTICO (pruebas/empezar-de-cero.test.js, grupo 1, contra la base)
--
-- Se recorrió pg_constraint desde lo que vaciar borra —movimientos,
-- productos, retos y cierres— y todo lo que eso arrastra en cascada
-- (líneas, comprobantes, el fiado de una venta, las atribuciones cobradas,
-- los precios y servicios de la agenda). Las llaves RESTRICT o NO ACTION
-- que apuntan ahí son exactamente esas dos. Al sumar reservas y
-- liquidaciones a lo que se borra aparecen dos más, que apuntan a las
-- liquidaciones: movimientos_liquidacion_fk y pagos_deuda_liquidacion_fk
-- (100:346-358). Sumar los paquetes (1b, abajo) no agrega ninguna: lo que
-- los apunta es CASCADE. Los ON DELETE SET NULL en cascada (pagos de
-- cuota, fiado cobrado, turnos pagados, la silla alquilada, las clases
-- dadas desde una reserva, lo traído a una cuenta personal, las comisiones
-- y los retiros que Orden anotó en su propia cuenta) son UPDATE que los
-- guardianes ya dejan pasar con la marca orden.vaciando (110, 111): la
-- prueba comprueba que cada trigger de UPDATE de esas tablas, antes o
-- después, la lee, que no hay triggers de DELETE en lo que se borra y que
-- ninguna de esas columnas es NOT NULL. Y se
-- armó en PGlite un negocio de cada rubro cargado con todo, en prueba,
-- pagando y vencido, más la personal en Gratis: comercio, ganadería y la
-- personal ya se vaciaban; servicios, clases y entrenamiento frenaban en
-- las reservas, y agricultura en las liquidaciones. Nada más.
--
-- LO QUE SE DECIDIÓ, con el criterio de lo que vaciar ya borra y conserva
-- (014:199-205: se van «movimientos, productos, retos y los cierres
-- marcados»; queda la empresa, el equipo, la suscripción y el código):
--
--   1. Las RESERVAS se van todas: pasadas y futuras, atendidas, canceladas,
--      las del link y las de un alumno inscripto. Una reserva es de un
--      servicio del catálogo (producto_id NOT NULL) y el catálogo se va: no
--      puede quedar colgando de nada. Se borran ANTES que los productos.
--      Eso incluye los turnos que un cliente sacó por el link para la
--      semana que viene: su enlace pasa a decir «No encontramos este turno»
--      y a nadie le llega un aviso. Por eso la pantalla de «Empezar de
--      cero» lo dice antes de confirmar, con cuántos turnos por venir tiene
--      la agenda (src/components/ZonaPeligro.tsx). No se frena: irse tiene
--      que andar siempre.
--   1b. Los PAQUETES Y LAS INSCRIPCIONES de los alumnos se van, con sus
--      clases dadas (clases_dadas.paquete_id y turnos_reserva.paquete_id son
--      CASCADE, 088 y 091). Un paquete es una venta (088: se cobra con
--      registrar_venta) y las ventas se van. Si quedaran, perderían su venta
--      (paquetes.movimiento_id es SET NULL) y ese null es justo lo que
--      por_cobrar_alumnos, panel_profe, reporte_alumnos y cobrar_inscripcion
--      leen como «no se cobró»: después de vaciar, cada alumno que ya había
--      pagado figuraba debiendo todo y se le podía volver a cobrar. Se van
--      también las inscripciones sin cobrar: sin ventas ni agenda, empezar de
--      cero es eso. Los ALUMNOS quedan (clientes), como quedan los clientes
--      de cualquier negocio.
--   2. Las LIQUIDACIONES se van: son el papel de una venta de grano, y la
--      venta es un movimiento. Se borran en la MISMA sentencia que los
--      movimientos, porque se apuntan entre sí (la venta a su papel y el
--      papel a su venta, las dos NO ACTION): NO ACTION se controla al final
--      de la sentencia, y ahí ya no queda ninguna de las dos puntas. Es lo
--      mismo que la 100 explica para borrar la empresa entera (100:341-344).
--   3. Los PAGOS DE DEUDA que el silo se cobró en una liquidación QUEDAN,
--      sin su liquidación, igual que un pago de cuota queda sin su
--      movimiento (pagos_deuda.movimiento_id es SET NULL, 015). La deuda no
--      vuelve a deber lo que ya se pagó. Se hace con un UPDATE antes de
--      borrar, que es lo que haría un SET NULL: la llave es compuesta
--      (liquidacion_id, empresa_id) y un SET NULL de la llave entera
--      borraría también empresa_id.
--   4. Todo lo demás queda, como hoy: campañas y cosechas, deudas, el fiado
--      que no es de una venta, la billetera, los clientes, el equipo de la
--      agenda con sus horarios y su link, las rutinas y las medidas, el
--      presupuesto. vaciar no los borraba y no frenan. (En
--      agricultura se nota: sin liquidaciones, lo cosechado vuelve a
--      figurar sin vender. Si «Empezar de cero» tiene que llevarse también
--      las cosechas y las campañas es otra decisión, que esta migración no
--      toma.)
--
-- No se cambió ninguna llave: con el orden correcto alcanza, y cambiar una
-- FK es tocar lo que protege a todos los demás caminos.
--
-- vaciar_empresa sigue devolviendo lo mismo (movimientos, productos y las
-- rutas de Storage de los comprobantes), sigue siendo solo del propietario
-- con el nombre exacto y sigue apagando la marca antes de volver.
--
-- Cada función redefinida es copia exacta de su última versión (el .sql
-- que se cita en cada bloque) más el cambio marcado «115», con los mismos
-- permisos. No hay mensajes nuevos: los que se usan ya tienen su portugués
-- en src/lib/mensajes-base.ts.
--
-- Idempotente: se puede aplicar dos veces. No toca datos.
-- ============================================================


-- ------------------------------------------------------------
-- 1. PUERTA PÚBLICA · QUÉ ES ESTE NEGOCIO (038:224-281)
--
--    Un negocio que no puede cargar contesta lo mismo que un link apagado
--    o que no existe: {existe: false}. La página (src/app/r/[slug]) ya
--    muestra la misma pantalla para los tres.
-- ------------------------------------------------------------
create or replace function public.agenda_publica(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_emp   uuid;
  v_pub   public.turnos_publico%rowtype;
  v_nom   text;
  v_mon   text;
  v_profs jsonb;
begin
  select * into v_pub from public.turnos_publico where slug = lower(trim(coalesce(p_slug, '')));

  -- Un link apagado y un link que no existe contestan lo mismo. Distinguirlos
  -- le diría a cualquiera qué negocios usan Orden y cuáles cerraron.
  -- 115 (30/09/2026): y un negocio vencido también. Es una cuenta, no un
  -- dato guardado: cuando paga, la página vuelve sola.
  if v_pub.empresa_id is null or not v_pub.activo
     or not public.puede_cargar(v_pub.empresa_id) then
    return jsonb_build_object('existe', false);
  end if;

  v_emp := v_pub.empresa_id;

  select nombre, moneda into v_nom, v_mon from public.empresas where id = v_emp;

  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) into v_profs
  from (
    select jsonb_build_object(
      'id',     p.id,
      'nombre', p.nombre,
      'servicios', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',       pr.id,
          'nombre',   pr.nombre,
          'duracion', s.duracion_min,
          'precio',   public.precio_de_servicio(p.id, pr.id)
        ) order by pr.nombre)
        from public.turnos_servicio s
        join public.productos pr on pr.id = s.producto_id
        where s.empresa_id = v_emp and s.reservable and pr.activo and not pr.controla_stock
      ), '[]'::jsonb)
    ) as x
    from public.turnos_profesional p
    where p.empresa_id = v_emp and p.activo
      -- Solo quien tiene horario cargado: ofrecer a alguien que nunca
      -- trabaja es mandar al cliente a una pantalla vacía.
      and exists (select 1 from public.turnos_horario h
                  where h.profesional_id = p.id and h.activo)
  ) t;

  return jsonb_build_object(
    'existe',    true,
    'negocio',   coalesce(nullif(v_pub.titulo, ''), v_nom),
    'direccion', v_pub.direccion,
    'mensaje',   v_pub.mensaje,
    'moneda',    v_mon,
    'profesionales', v_profs
  );
end $fn$;

revoke all on function public.agenda_publica(text) from public;
grant execute on function public.agenda_publica(text) to anon, authenticated;


-- ------------------------------------------------------------
-- 2. PUERTA PÚBLICA · QUÉ HUECOS QUEDAN (038:289-330)
--
--    Para un negocio vencido, ningún hueco: lo mismo que con el link
--    apagado. La condición va en la misma consulta que busca el link.
-- ------------------------------------------------------------
create or replace function public.huecos_publicos(
  p_slug        text,
  p_profesional uuid,
  p_producto    uuid,
  p_fecha       date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_emp  uuid;
  v_res  jsonb;
begin
  -- 115 (30/09/2026): un negocio vencido no ofrece huecos, como un link
  -- apagado.
  select tp.empresa_id into v_emp
  from public.turnos_publico tp
  where tp.slug = lower(trim(coalesce(p_slug, ''))) and tp.activo
    and public.puede_cargar(tp.empresa_id);

  if v_emp is null then
    return '[]'::jsonb;
  end if;

  -- El profesional tiene que ser de ESE negocio. Sin esta comprobación, el
  -- link de una barbería serviría para espiar la agenda de cualquier otra.
  if not exists (select 1 from public.turnos_profesional
                 where id = p_profesional and empresa_id = v_emp and activo) then
    return '[]'::jsonb;
  end if;

  -- Ni ayer ni dentro de dos años. El tope corta el paseo de quien quiera
  -- recorrer la agenda entera pidiendo fechas.
  if p_fecha is null
     or p_fecha < public.hoy_empresa(v_emp)
     or p_fecha > public.hoy_empresa(v_emp) + 60 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(h.inicia order by h.inicia), '[]'::jsonb) into v_res
  from public.huecos_del_dia(p_profesional, p_fecha, p_producto) h;

  return v_res;
end $fn$;

revoke all on function public.huecos_publicos(text, uuid, uuid, date) from public;
grant execute on function public.huecos_publicos(text, uuid, uuid, date) to anon, authenticated;


-- ------------------------------------------------------------
-- 3. PUERTA PÚBLICA · TOMAR EL TURNO (038:340-446)
--
--    Un negocio vencido no toma turnos: «Esta página de reservas no está
--    disponible.», el mismo mensaje y el mismo código (P0002) que un link
--    apagado. Hasta hoy la dejaba pasar el guardián, porque corre sin
--    sesión (auth.uid() null).
-- ------------------------------------------------------------
create or replace function public.reservar_publico(
  p_slug        text,
  p_profesional uuid,
  p_producto    uuid,
  p_inicia      timestamptz,
  p_nombre      text,
  p_telefono    text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_emp      uuid;
  v_tel      text;
  v_zona     text;
  v_fecha    date;
  v_fin      timestamptz;
  v_id       uuid;
  v_token    uuid;
  v_pendientes integer;
begin
  -- 115 (30/09/2026): un negocio vencido no toma turnos, como un link
  -- apagado.
  select tp.empresa_id into v_emp
  from public.turnos_publico tp
  where tp.slug = lower(trim(coalesce(p_slug, ''))) and tp.activo
    and public.puede_cargar(tp.empresa_id);

  if v_emp is null then
    raise exception 'Esta página de reservas no está disponible.' using errcode = 'P0002';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Escribí tu nombre.' using errcode = '22023';
  end if;

  v_tel := trim(coalesce(p_telefono, ''));
  if char_length(v_tel) < 6 then
    raise exception 'Escribí un teléfono, para poder avisarte si pasa algo.' using errcode = '22023';
  end if;

  if exists (select 1 from public.turnos_bloqueo
             where empresa_id = v_emp and telefono = v_tel) then
    raise exception 'No se pueden tomar turnos con ese número. Comunicate con el local.'
      using errcode = '42501';
  end if;

  -- El candado, igual que en la puerta de adentro: serializa las reservas de
  -- esa persona para que dos clientes no se queden con el mismo horario.
  perform 1 from public.turnos_profesional
  where id = p_profesional and empresa_id = v_emp and activo
  for update;

  if not found then
    raise exception 'Esa persona no atiende en este local.' using errcode = 'P0002';
  end if;

  -- Tres pendientes por teléfono. Quien de verdad quiere cortarse no tiene
  -- cuatro turnos abiertos a la vez; quien está jugando, sí.
  select count(*)::int into v_pendientes
  from public.turnos_reserva
  where empresa_id = v_emp and cliente_telefono = v_tel
    and estado in ('pendiente', 'confirmada') and inicia > now();

  if v_pendientes >= 3 then
    raise exception 'Ya tenés varios turnos reservados. Cancelá alguno antes de tomar otro.'
      using errcode = '22023';
  end if;

  -- Y un minuto entre reserva y reserva desde el mismo número.
  if exists (
    select 1 from public.turnos_reserva
    where empresa_id = v_emp and cliente_telefono = v_tel
      and created_at > now() - interval '1 minute'
  ) then
    raise exception 'Esperá un momento antes de tomar otro turno.' using errcode = '22023';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas where id = v_emp;
  v_fecha := (p_inicia at time zone v_zona)::date;

  if p_inicia is null or v_fecha > public.hoy_empresa(v_emp) + 60 then
    raise exception 'Ese horario no está disponible.' using errcode = '23505';
  end if;

  select h.termina into v_fin
  from public.huecos_del_dia(p_profesional, v_fecha, p_producto) h
  where h.inicia = p_inicia;

  if v_fin is null then
    raise exception 'Ese horario ya no está disponible.' using errcode = '23505';
  end if;

  insert into public.turnos_reserva (
    empresa_id, profesional_id, producto_id, inicia, termina,
    cliente_nombre, cliente_telefono, origen
  )
  values (
    v_emp, p_profesional, p_producto, p_inicia, v_fin,
    left(trim(p_nombre), 80), left(v_tel, 40), 'publico'
  )
  returning id, token into v_id, v_token;

  -- Se devuelve el token porque es lo único que el cliente se lleva: su
  -- enlace para cancelar. Sin eso la agenda se llena de fantasmas.
  return jsonb_build_object('reserva', v_id, 'token', v_token,
                            'inicia', p_inicia, 'termina', v_fin);
end $fn$;

revoke all on function public.reservar_publico(text, uuid, uuid, timestamptz, text, text) from public;
grant execute on function public.reservar_publico(text, uuid, uuid, timestamptz, text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- 4. CANCELAR CON EL ENLACE (037:261-284)
--
--    Lo que ya se reservó se puede anular siempre, con o sin sesión: el
--    token ES la credencial (038). La función marca la transacción con el
--    token de la reserva que cancela y el guardián (5) deja pasar ese
--    UPDATE aunque el negocio esté vencido y quien llama tenga sesión. La
--    marca dura solo esta transacción, se apaga antes de volver y vale solo
--    para poner en «cancelada» la reserva de ese token. Desde el navegador
--    no se puede poner (PostgREST no deja mandar un SET ni llamar a
--    set_config), y aunque se pudiera no abriría nada: con el token,
--    cancelar sin sesión ya andaba.
--
--    Permisos: los de la 037 (authenticated) más el de la 038 (anon).
-- ------------------------------------------------------------
create or replace function public.cancelar_reserva(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_estado text;
begin
  select estado into v_estado from public.turnos_reserva where token = p_token;

  if v_estado is null then
    raise exception 'Esa reserva no existe.' using errcode = 'P0002';
  end if;

  if v_estado = 'cancelada' then
    return jsonb_build_object('cancelada', true, 'ya_estaba', true);
  end if;

  if v_estado <> 'pendiente' and v_estado <> 'confirmada' then
    raise exception 'Esa reserva ya no se puede cancelar.' using errcode = '22023';
  end if;

  -- 115 (30/09/2026): cancelar con el enlace anda aunque el negocio esté
  -- vencido y quien cancela tenga una sesión de Orden abierta. Ver
  -- exigir_cuenta_activa.
  perform set_config('orden.cancelando_turno', p_token::text, true);

  update public.turnos_reserva set estado = 'cancelada' where token = p_token;

  perform set_config('orden.cancelando_turno', '', true);

  return jsonb_build_object('cancelada', true);
end $fn$;

revoke all on function public.cancelar_reserva(uuid) from public, anon;
grant execute on function public.cancelar_reserva(uuid) to authenticated;
-- Cancelar también es público: es el enlace que el cliente guardó (038).
grant execute on function public.cancelar_reserva(uuid) to anon;


-- ------------------------------------------------------------
-- 5. EL GUARDIÁN (111:117-158)
--
--    Copia exacta de la 111 con un paso más, justo después del de
--    «vaciar»: el UPDATE que hace cancelar_reserva (4) sobre la reserva de
--    su token, y solo si la pone en «cancelada». Anidado a propósito, como
--    `new.tipo` en la 110: `new.token` existe solo en turnos_reserva y no
--    se puede leer en las demás tablas con candado.
--
--    No cambia nada más: el INSERT de una reserva, moverla, atenderla o
--    marcar que no vino siguen con el candado, y cancelar_turno (la puerta
--    del local, 041) no pone la marca.
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
-- 6. VACIAR: «EMPEZAR DE CERO» (110:575-644)
--
--    Copia exacta de la 110 más cuatro pasos, marcados «115», en este
--    orden: los paquetes (arrastran sus clases dadas y las clases de la
--    agenda de cada inscripción), las demás reservas (antes que los
--    productos), los pagos que se cobró el silo (sueltan su liquidación) y
--    las liquidaciones (en la misma sentencia que los movimientos). Corren
--    con la marca orden.vaciando ya puesta: el SET NULL en cascada de
--    clases_dadas.reserva_id y el UPDATE de pagos_deuda pasan el guardián
--    para cualquier cuenta (111). Devuelve lo mismo que antes.
-- ------------------------------------------------------------
create or replace function public.vaciar_empresa(p_empresa uuid, p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre     text;
  v_rutas      jsonb;
  v_movs       int := 0;
  v_prods      int := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  -- Solo el propietario. Un administrador maneja el día a día, pero borrar
  -- la historia entera del negocio es decisión del dueño.
  if not exists (
    select 1 from public.miembros
    where empresa_id = p_empresa and user_id = auth.uid() and rol = 'propietario'
  ) then
    raise exception 'Solo el propietario puede vaciar el negocio.' using errcode = '42501';
  end if;

  select nombre into v_nombre from public.empresas where id = p_empresa;
  if v_nombre is null then
    raise exception 'Esa empresa no existe.' using errcode = 'P0002';
  end if;

  -- La confirmación es escribir el nombre exacto. Un "¿estás seguro?" se
  -- toca sin leer; esto no.
  if trim(coalesce(p_confirmacion, '')) is distinct from v_nombre then
    raise exception 'Para vaciar el negocio hay que escribir su nombre exacto: %', v_nombre
      using errcode = '22023';
  end if;

  -- Las rutas de los archivos ANTES de borrar: después no hay forma de
  -- saber cuáles eran, y quedarían ocupando storage para siempre.
  select coalesce(jsonb_agg(a.ruta), '[]'::jsonb) into v_rutas
  from public.adjuntos a where a.empresa_id = p_empresa and a.ruta is not null;

  -- 110 (28/09/2026): los candados de la gratis personal dejan pasar el
  -- SET NULL en cascada de este borrado (ver exigir_cuenta_activa). Solo
  -- dentro de esta transacción y solo para esta empresa.
  perform set_config('orden.vaciando', p_empresa::text, true);

  -- 115 (30/09/2026): los paquetes y las inscripciones, con sus clases
  -- dadas y las clases de su agenda (CASCADE). Son ventas: si quedaran sin
  -- su venta (SET NULL), figurarían como «por cobrar» y se podrían volver
  -- a cobrar. Los alumnos quedan.
  delete from public.paquetes where empresa_id = p_empresa;

  -- 115 (30/09/2026): las reservas de la agenda, todas, ANTES que los
  -- productos: turnos_reserva.producto_id es RESTRICT (037).
  delete from public.turnos_reserva where empresa_id = p_empresa;

  -- 115 (30/09/2026): el pago de una deuda que el silo se cobró en una
  -- liquidación queda, como queda un pago de cuota sin su movimiento; solo
  -- suelta la liquidación, que se borra abajo.
  update public.pagos_deuda set liquidacion_id = null
  where empresa_id = p_empresa and liquidacion_id is not null;

  -- Los movimientos primero: arrastran líneas y comprobantes.
  -- 115 (30/09/2026): y en la misma sentencia las liquidaciones, que
  -- apuntan a su venta y la venta a ellas (NO ACTION las dos: se controlan
  -- al final de la sentencia, cuando ya no queda ninguna de las dos puntas).
  with papeles as (
    delete from public.liquidaciones where empresa_id = p_empresa returning 1
  ), borrados as (
    delete from public.movimientos where empresa_id = p_empresa returning 1
  )
  select count(*) into v_movs from borrados;

  with borrados as (
    delete from public.productos where empresa_id = p_empresa returning 1
  )
  select count(*) into v_prods from borrados;

  delete from public.retos   where empresa_id = p_empresa;
  delete from public.cierres where empresa_id = p_empresa;

  perform set_config('orden.vaciando', '', true);

  return jsonb_build_object(
    'movimientos', v_movs,
    'productos', v_prods,
    -- Que las borre quien llamó: la policy de storage ya le da permiso
    -- sobre la carpeta de su empresa.
    'archivos', v_rutas
  );
end $fn$;

revoke all on function public.vaciar_empresa(uuid, text) from public, anon;
grant execute on function public.vaciar_empresa(uuid, text) to authenticated;
