-- ============================================================
-- 120 · ELIMINAR A ALGUIEN LO SACA DE LA AGENDA
-- ============================================================
--
-- Matías (01/10/2026, rubro clases, «Tenis manía»): «Eliminé a mi alumna
-- Marianela y me sigue apareciendo que tengo un turno con ella hoy. Me sale
-- en mi panel y en mi agenda. Ella me pagó, perfecto. Si pagó y no vino
-- más, la elimino, y no me tiene que aparecer más en la agenda.»
--
-- En sus capturas: la Agenda, vista Día, «14:00 Marianela, Tenis» con
-- «Clase dada / Mover / No se tuvo la clase», y en el panel la misma clase
-- en «Tus clases de hoy».
--
-- POR QUÉ PASABA
--
--   La 116 decidió que eliminar_cliente anulara SOLO lo no cobrado
--   (anular_periodo) y dejara lo cobrado como historia, incluidas sus
--   clases que faltaban: el período pagado seguía abierto y sus clases
--   seguían confirmadas en la agenda, a nombre de alguien que ya no está en
--   la lista. Lo mismo un turno de barbería sacado por el link: la pantalla
--   lo decía («Su turno del … no se cancela»), y Matías no lo quiere así.
--
-- LO QUE SE DECIDIÓ
--
--   1. Al eliminar, sale de la agenda TODO lo suyo que estaba por darse,
--      haya pagado o no, sea de un paquete o un turno suelto, en cualquier
--      rubro (barbería, clases, entrenamiento): sus reservas pendientes o
--      confirmadas pasan a «cancelada». Es lo único que cambia.
--
--   2. Sus paquetes NO se tocan: lo pagado (o de regalo) sigue abierto,
--      como lo dejaba la 116. Sacarlo de la agenda no necesita cerrarlo, y
--      cerrarlo rompía dos cosas:
--        · una clase de un día anterior que el profe no marcó (vino ayer y
--          no tocó «Clase dada») se queda en la agenda de ese día, y con el
--          paquete cerrado «Clase dada» y «No se tuvo la clase» fallaban
--          («Ese paquete está cerrado», dar_clase 088): la clase dada se
--          perdía del reporte y del panel;
--        · el reporte de alumnos cuenta «Se terminaron», «Vencieron» y
--          «Renovaron» solo con paquetes sin cerrar (reporte_alumnos, 116):
--          cerrar al eliminar un paquete que terminó o venció hace meses lo
--          sacaba del reporte de esos meses.
--      Abierto no molesta en ningún lado: desde la 116 Por cobrar, el panel
--      (por cobrar, deben, alumnos activos), el reporte (activos, «a quién
--      llamar», su paquete vigente) y cliente_entrenando (098) dejan afuera
--      a un archivado. Y la regla de la 116 para un cobro anulado después de
--      eliminar (anular_vuelve_por_cobrar) sigue igual, sin tocarla: lo
--      soltado llega abierto y anular_periodo lo resuelve como siempre.
--
--   3. «POR DARSE» ES DE HOY EN ADELANTE, en la hora del negocio, y no
--      desde este instante como en cerrar_paquete. Es lo que pidió: «me
--      sigue apareciendo que tengo un turno con ella HOY». Si la elimina a
--      las 15:00, la clase de las 14:00 que no marcó seguía en «Tus clases
--      de hoy» y en la vista Día. Lo de los días anteriores sin marcar queda
--      como está, y se puede seguir marcando: es historia. Un solo lugar lo
--      decide (comienzo_de_hoy, bloque 1), para que la base y la cuenta que
--      muestra la pantalla antes de confirmar no digan distinto.
--
--   4. Va dentro de la marca orden.eliminando_cliente de la 116: así anda
--      también en un negocio vencido (099, D19). El guardián de la 116 ya
--      deja pasar cancelar SUS reservas, y nada más; no se toca.
--
--   5. La pantalla dice la verdad antes de confirmar: «Tiene N clases de
--      hoy en adelante: salen de tu agenda» (turnos o sesiones según el
--      rubro). Para eso lista_clientes cuenta cuántas tiene (bloque 3). Se
--      sacó el «Su turno del … no se cancela».
--
-- LAS LECTURAS DE LA AGENDA, UNA POR UNA (ninguna muestra una cancelada
-- como vigente; con las reservas canceladas, Marianela desaparece sola):
--
--   agenda_del_dia (097:144) ......... vista Día ........... estado <> 'cancelada'
--   panel_profe (116:671) ............ «Tus clases de hoy» . estado <> 'cancelada'
--   agenda_calendario (072:28) ....... Semana / Mes ........ cuenta solo pendiente,
--                                      confirmada, atendida y no_vino
--   rutinas_de_la_agenda (098:2046) .. la rutina de cada
--                                      sesión del día ...... estado <> 'cancelada'
--   huecos_del_dia (037) ............. el horario vuelve a
--                                      quedar libre ........ solo pendiente/confirmada
--   turnos_de_manana (043:133) ....... aviso de la tarde ... solo pendiente/confirmada
--   lista_clientes (053:137) ......... «Próximo turno» ..... solo pendiente/confirmada
--   reporte_turnos (106:758) ......... la cuenta como «cancelada», aparte: es la
--                                      verdad, no la muestra vigente
--   historial_cliente (053:200) ...... la ficha la lista como «Cancelado»
--   Ajustes (turnos por venir) ....... solo pendiente/confirmada
--
-- ¿SE LE AVISA ALGO AL CLIENTE DE UNA RESERVA DEL LINK? No, igual que
-- cuando el local cancela un turno a mano (cancelar_turno, 041): no hay
-- ningún aviso al cliente final, ni trigger en turnos_reserva que mande
-- algo. Lo que sí pasa: su link (/turno/<token>, reserva_por_token 038) le
-- muestra «Turno cancelado»; el aviso de la tarde (turnos_de_manana) ya no
-- lo cuenta, y el recordatorio por WhatsApp lo manda el dueño a mano desde
-- la agenda, donde ya no aparece. La pantalla de eliminar se lo dice antes
-- al dueño, con cuántos son. No se inventa un aviso nuevo.
--
-- LO QUE ESTA MIGRACIÓN HACE CON LOS DATOS QUE YA ESTÁN (bloque 4; al
-- aplicarla de nuevo no cambia nada): a cada alumno o cliente YA archivado
-- —todos los archivó eliminar_cliente, la única función que pone
-- clientes.activo en false— se le cancelan las clases o sesiones de un
-- período (paquete_id) de hoy en adelante. Es el caso de Marianela. Los
-- turnos sueltos (paquete_id null: barbería, link) NO se tocan: hasta hoy
-- la pantalla le decía al dueño «Su turno del … no se cancela», y el
-- cliente que lo sacó por el link no se enteraría (su link diría
-- «cancelado» y el lugar quedaría libre para otro). Solo se listan, uno
-- por uno, por si alguno se quiere cancelar a mano desde la agenda.
--
-- Cada función redefinida es copia exacta de su última versión (el .sql y la
-- línea se citan en cada bloque) más lo marcado «120», con los mismos
-- permisos, security definer y search_path. No hay mensajes nuevos: los de
-- eliminar_cliente ya tienen su portugués en src/lib/mensajes-base.ts.
--
-- Idempotente: se puede aplicar dos veces.
-- ============================================================


-- ------------------------------------------------------------
-- 1. ¿DESDE CUÁNDO ES «DE HOY EN ADELANTE»?
--
--    El comienzo de hoy en la hora del negocio (hoy_empresa, a las 00:00
--    de su zona). Lo usan eliminar_cliente (2), lista_clientes (3) y el
--    arreglo de los datos (4): la cuenta que la pantalla muestra antes de
--    confirmar es exactamente lo que la base cancela. Nadie la llama desde
--    afuera.
-- ------------------------------------------------------------
create or replace function public.comienzo_de_hoy(p_empresa uuid)
returns timestamptz language sql stable security definer set search_path = public as $fn$
  select public.hoy_empresa(e.id)::timestamp at time zone coalesce(e.zona_horaria, 'America/Asuncion')
  from public.empresas e where e.id = p_empresa;
$fn$;

revoke all on function public.comienzo_de_hoy(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
-- 2. ELIMINAR UN CLIENTE (116:323-422)
--
--    Copia exacta de la 116 con un paso más, marcado (120), dentro de la
--    marca y después de anular lo no cobrado: sus reservas de hoy en
--    adelante se cancelan. Va antes de decidir si se borra o se archiva,
--    pero no cambia esa decisión: una reserva cancelada sigue siendo una
--    reserva que existió, y lo archiva igual que antes. Devuelve lo mismo
--    de siempre: 'borrado' o 'archivado'.
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

  -- (120) «Si pagó y no vino más, la elimino, y no me tiene que aparecer
  -- más en la agenda» (Matías, 01/10/2026). Todo lo suyo que estaba por
  -- darse sale de la agenda, de un paquete o suelto, pagado o no, en
  -- cualquier rubro: de hoy en adelante y no desde este instante, para que
  -- la clase de hoy que ya pasó sin marcar no se quede en «Tus clases de
  -- hoy». Lo pagado NO se cierra: sigue abierto como historia, y así una
  -- clase de un día anterior que no se marcó todavía se puede marcar (con
  -- el paquete cerrado, dar_clase la rechaza) y el reporte de meses
  -- pasados no cambia. Con la misma marca: el guardián de la 116 deja
  -- pasar cancelar SUS reservas, también en un negocio vencido.
  update public.turnos_reserva set estado = 'cancelada'
  where cliente_id = p_cliente and estado in ('pendiente', 'confirmada')
    and inicia >= public.comienzo_de_hoy(v.empresa_id);
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
-- 3. LA LISTA DE CLIENTES DICE CUÁNTO TIENE POR DARSE (053:137-191)
--
--    Copia exacta de la 053 con una clave más, marcada (120): `por_venir`,
--    cuántas reservas suyas pendientes o confirmadas hay de hoy en
--    adelante, con el mismo corte que usa eliminar_cliente (1). Con eso la
--    confirmación de eliminar dice «Tiene 12 clases de hoy en adelante:
--    salen de tu agenda» antes de tocarlo, y no promete nada que la base no
--    haga.
-- ------------------------------------------------------------
create or replace function public.lista_clientes(
  p_empresa uuid,
  p_texto   text default '',
  p_limite  integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res   jsonb;
  v_busca text;
  v_norm  text;
  -- (120)
  v_desde timestamptz;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_busca := lower(trim(coalesce(p_texto, '')));
  v_norm  := regexp_replace(v_busca, '\D', '', 'g');
  -- (120)
  v_desde := public.comienzo_de_hoy(p_empresa);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.ultima_visita desc nulls last, x.nombre), '[]'::jsonb)
  into v_res
  from (
    select
      c.id, c.nombre, c.telefono, c.notas, c.created_at,
      coalesce(t.visitas, 0)::int    as visitas,
      t.ultima_visita,
      coalesce(t.gastado, 0)::numeric as gastado,
      coalesce(t.proximo, null)      as proximo_turno,
      -- (120) Lo que eliminar_cliente le sacaría de la agenda.
      coalesce(t.por_venir, 0)::int  as por_venir
    from public.clientes c
    left join lateral (
      select
        count(*) filter (where r.estado = 'atendida')::int as visitas,
        max(r.inicia) filter (where r.estado = 'atendida') as ultima_visita,
        coalesce(sum(a.monto_cobrado) filter (where r.estado = 'atendida'), 0) as gastado,
        min(r.inicia) filter (
          where r.estado in ('pendiente', 'confirmada') and r.inicia > now()
        ) as proximo,
        -- (120)
        count(*) filter (
          where r.estado in ('pendiente', 'confirmada') and r.inicia >= v_desde
        )::int as por_venir
      from public.turnos_reserva r
      left join public.turnos_atribucion a on a.id = r.atribucion_id
      where r.cliente_id = c.id
    ) t on true
    where c.empresa_id = p_empresa
      and c.activo
      and (
        v_busca = ''
        or lower(c.nombre) like '%' || v_busca || '%'
        or (v_norm <> '' and c.telefono_norm like '%' || v_norm || '%')
      )
    limit least(greatest(coalesce(p_limite, 200), 1), 500)
  ) x;

  return v_res;
end $fn$;

revoke all on function public.lista_clientes(uuid, text, integer) from public, anon;
grant execute on function public.lista_clientes(uuid, text, integer) to authenticated;


-- ------------------------------------------------------------
-- 4. LOS DATOS QUE YA ESTÁN (una vez)
--
--    A cada archivado se le cancelan las clases o sesiones de un período
--    (paquete_id no null) que tenga de hoy en adelante: es el caso de
--    Marianela, lo que Matías pidió. Nada más: sus paquetes no se tocan
--    (bloque 2), y lo no cobrado ya lo anuló la 116 (su bloque 11).
--
--    Los turnos sueltos de un archivado (paquete_id null: una barbería, un
--    turno sacado por el link) NO se cancelan, solo se listan. Hasta hoy
--    la pantalla de eliminar le decía al dueño «Su turno del … no se
--    cancela», y el dueño eliminó confiando en eso (una ficha repetida de
--    alguien que igual iba a venir). Cancelarlo ahora, en todos los
--    negocios, no le llega a nadie: el cliente vería «Turno cancelado» en su
--    link como si lo hubiera cancelado él, el horario quedaría libre para
--    otro en el link, y un turno de hoy que ya se atendió y falta cobrar no
--    se podría cobrar desde la agenda («Esa reserva ya se cerró»). Si alguno
--    de la lista se quiere sacar, se cancela desde la agenda, como siempre.
--
--    Corre sin sesión (auth.uid() null): el guardián deja pasar todo, como
--    a cualquier tarea del sistema (111), y no hace falta la marca. Al
--    aplicarla otra vez no cancela nada (los sueltos se vuelven a listar).
-- ------------------------------------------------------------
do $$
declare
  v_f       record;
  v_turnos  integer;
  v_primero timestamptz;
  v_ultimo  timestamptz;
  v_gente   integer := 0;
  v_t_tur   integer := 0;
  v_sueltos integer := 0;
begin
  for v_f in
    select c.id, c.nombre, e.nombre as negocio,
           coalesce(e.zona_horaria, 'America/Asuncion') as zona,
           public.comienzo_de_hoy(c.empresa_id) as desde
    from public.clientes c
    join public.empresas e on e.id = c.empresa_id
    where not c.activo
      and exists (select 1 from public.turnos_reserva r
                  where r.cliente_id = c.id and r.paquete_id is not null
                    and r.estado in ('pendiente', 'confirmada')
                    and r.inicia >= public.comienzo_de_hoy(c.empresa_id))
    order by e.nombre, c.nombre
  loop
    with canceladas as (
      update public.turnos_reserva set estado = 'cancelada'
      where cliente_id = v_f.id and paquete_id is not null
        and estado in ('pendiente', 'confirmada') and inicia >= v_f.desde
      returning inicia
    )
    select count(*)::int, min(inicia), max(inicia) into v_turnos, v_primero, v_ultimo
    from canceladas;

    v_gente := v_gente + 1;
    v_t_tur := v_t_tur + v_turnos;
    raise notice '120: ya eliminado, sus clases salen de la agenda: «%» · % · % canceladas (% a %)',
      v_f.negocio, v_f.nombre, v_turnos,
      to_char(v_primero at time zone v_f.zona, 'DD/MM/YYYY HH24:MI'),
      to_char(v_ultimo at time zone v_f.zona, 'DD/MM/YYYY HH24:MI');
  end loop;

  if v_gente > 0 then
    raise notice '120: % alumnos ya eliminados: % clases canceladas.', v_gente, v_t_tur;
  end if;

  for v_f in
    select e.nombre as negocio, c.nombre, r.id, r.origen,
           to_char(r.inicia at time zone coalesce(e.zona_horaria, 'America/Asuncion'), 'DD/MM/YYYY HH24:MI') as cuando
    from public.turnos_reserva r
    join public.clientes c on c.id = r.cliente_id
    join public.empresas e on e.id = r.empresa_id
    where not c.activo and r.paquete_id is null
      and r.estado in ('pendiente', 'confirmada')
      and r.inicia >= public.comienzo_de_hoy(r.empresa_id)
    order by e.nombre, r.inicia
  loop
    v_sueltos := v_sueltos + 1;
    raise notice '120: turno suelto de un cliente ya eliminado, queda como estaba: «%» · % · % · origen % · reserva %',
      v_f.negocio, v_f.nombre, v_f.cuando, v_f.origen, v_f.id;
  end loop;

  if v_sueltos > 0 then
    raise notice '120: % turnos sueltos de clientes ya eliminados quedan como estaban. Ver el bloque 4.', v_sueltos;
  end if;
end $$;
