-- ============================================================
-- ORDEN · Migración 058 · Eliminar un cliente, y eliminar del catálogo
--
-- Hasta acá no había forma de sacar a nadie de la lista de clientes, y del
-- catálogo solo se podía pausar. Las dos cosas se piden igual —«eliminar»—
-- pero ninguna puede ser un DELETE a secas, porque cada ficha tiene cosas
-- colgadas.
--
-- 1. UN CLIENTE
--
--    El libro de fiado cuelga del cliente con borrado en cascada (054):
--    borrar la ficha de alguien que te debe borraría también su deuda, sin
--    avisar a nadie. Por eso:
--
--      · Si te debe, no se elimina. Primero se cobra o se borra la deuda.
--      · Si no tiene nada atado —la ficha repetida, el nombre mal escrito—
--        se borra de verdad.
--      · Si tiene historia —ventas, turnos, un fiado ya pagado— se archiva:
--        deja de aparecer en la lista y al elegir cliente, y lo que ya pasó
--        sigue diciendo a quién. Si vuelve a reservar o se lo carga con el
--        mismo teléfono, reaparece con su historial (la 052 ya lo hacía).
--
--    Y un arreglo que esto vuelve necesario: al ponerle a un cliente el
--    teléfono de una ficha eliminada, el índice único lo frenaba con «ya
--    existe algo con ese nombre». Ahora el número eliminado queda libre, y
--    si es de una ficha activa se dice de quién es.
--
-- 2. ALGO DEL CATÁLOGO
--
--    Lo que ya se vendió o tiene turnos no se borra: se pausa, que es lo que
--    la pantalla ofreció siempre. Deja de aparecer para vender sin soltar las
--    ventas ni los turnos que ya pasaron. Lo que nunca se usó —lo cargado
--    por error— se borra de verdad.
--
-- LAS DOS COSAS SON DEL DUEÑO O DE UN ADMINISTRADOR
--
--    Un vendedor puede cargar clientes (052) pero no sacarlos: sacarlos
--    esconde historia, y eso lo decide quien administra.
--
-- El cuerpo de guardar_cliente se extrajo de la 052 con un script y se le
-- agregó solo la parte marcada con (058).
-- ============================================================

-- ------------------------------------------------------------
-- 1. GUARDAR UN CLIENTE
--
--    Misma firma que en la 052: se reemplaza sin tocar a quien ya la llama.
-- ------------------------------------------------------------
create or replace function public.guardar_cliente(
  p_empresa  uuid,
  p_nombre   text,
  p_telefono text default '',
  p_notas    text default '',
  p_id       uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_nombre text;
  v_tel    text;
  v_norm   text;
  v_otro   public.clientes;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_nombre := trim(coalesce(p_nombre, ''));
  if char_length(v_nombre) = 0 then
    raise exception 'Ponele un nombre, para saber de quién estamos hablando.' using errcode = '22023';
  end if;
  v_nombre := left(v_nombre, 80);

  v_tel  := left(trim(coalesce(p_telefono, '')), 40);
  v_norm := regexp_replace(v_tel, '\D', '', 'g');

  -- Un teléfono de dos dígitos no es un teléfono: es un dedazo. Se guarda
  -- vacío antes que guardar algo que después va a hacer chocar a dos
  -- personas distintas en el mismo índice.
  if v_norm <> '' and char_length(v_norm) < 6 then
    v_tel := '';
    v_norm := '';
  end if;

  if p_id is not null then
    -- (058) El número nuevo puede ser de otra ficha. Si esa ficha se
    -- eliminó, el número quedó libre: se le saca a la vieja, que conserva
    -- su historial por id. Si está activa, se dice de quién es, en vez del
    -- «ya existe algo con ese nombre» del índice único, que encima hablaba
    -- del nombre cuando el problema era el teléfono.
    if v_norm <> '' then
      select * into v_otro
      from public.clientes c
      where c.empresa_id = p_empresa and c.telefono_norm = v_norm and c.id <> p_id;

      if v_otro.id is not null then
        if v_otro.activo then
          raise exception 'Ese teléfono ya es de «%». Si son la misma persona, eliminá la ficha que sobra.',
            v_otro.nombre using errcode = '22023';
        end if;
        update public.clientes set telefono = '', updated_at = now() where id = v_otro.id;
      end if;
    end if;

    update public.clientes
    set nombre = v_nombre,
        telefono = v_tel,
        notas = left(coalesce(p_notas, ''), 1000),
        updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
    end if;
    return v_id;
  end if;

  -- Sin id: si el teléfono ya está, es la misma persona.
  if v_norm <> '' then
    select c.id into v_id
    from public.clientes c
    where c.empresa_id = p_empresa and c.telefono_norm = v_norm;

    if v_id is not null then
      update public.clientes
      set nombre = v_nombre,
          notas = case when trim(coalesce(p_notas, '')) = '' then notas
                       else left(p_notas, 1000) end,
          activo = true,
          updated_at = now()
      where id = v_id;
      return v_id;
    end if;
  end if;

  insert into public.clientes (empresa_id, nombre, telefono, notas, creado_por)
  values (p_empresa, v_nombre, v_tel, left(coalesce(p_notas, ''), 1000), auth.uid())
  returning id into v_id;

  return v_id;
end $fn$;

revoke all on function public.guardar_cliente(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.guardar_cliente(uuid, text, text, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. ELIMINAR UN CLIENTE
--
--    Devuelve qué hizo: 'borrado' o 'archivado'. Para quien toca el botón es
--    lo mismo —deja de estar en la lista—, pero las pruebas necesitan saber
--    cuál de las dos pasó.
-- ------------------------------------------------------------
create or replace function public.eliminar_cliente(p_cliente uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v       public.clientes;
  v_saldo numeric;
  v_debe  text;
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

  -- Sin nada atado se borra de verdad: no hay nada que conservar.
  if not exists (select 1 from public.fiado where cliente_id = p_cliente)
     and not exists (select 1 from public.movimientos where cliente_id = p_cliente)
     and not exists (select 1 from public.turnos_reserva where cliente_id = p_cliente) then
    delete from public.clientes where id = p_cliente;
    return 'borrado';
  end if;

  -- Con historia se archiva. La lista y el buscador ya dejan afuera a los
  -- archivados (052, 053); «lo que te deben» no, así que si alguna vez
  -- vuelve a deber algo, aparece ahí igual.
  update public.clientes set activo = false, updated_at = now() where id = p_cliente;
  return 'archivado';
end $fn$;

revoke all on function public.eliminar_cliente(uuid) from public, anon;
grant execute on function public.eliminar_cliente(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. ELIMINAR DEL CATÁLOGO
--
--    Devuelve 'borrado' o 'pausado', y la pantalla lo dice: si quedó
--    pausado, que no parezca que el botón no hizo lo que decía.
-- ------------------------------------------------------------
create or replace function public.eliminar_producto(p_producto uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.productos where id = p_producto;
  if v_empresa is null then
    raise exception 'Eso ya no está en tu catálogo.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(v_empresa) then
    raise exception 'Eliminar del catálogo es del dueño o de un administrador.' using errcode = '42501';
  end if;

  -- Que no se venda ni se reserve justo mientras se decide.
  perform 1 from public.productos where id = p_producto for update;

  -- Lo vendido queda atado a sus ventas (001) y al reparto (033), y un
  -- turno no puede quedar sin su servicio (037). En esos casos pausar hace
  -- lo que se busca —que no aparezca más para vender— sin soltar nada de lo
  -- que ya pasó.
  if exists (select 1 from public.movimiento_items where producto_id = p_producto)
     or exists (select 1 from public.turnos_atribucion where producto_id = p_producto)
     or exists (select 1 from public.turnos_reserva where producto_id = p_producto) then
    update public.productos set activo = false where id = p_producto;
    return 'pausado';
  end if;

  -- Nunca se usó: se borra, y con él su duración en la agenda (036) y sus
  -- precios por profesional (033), que sin el servicio no significan nada.
  delete from public.productos where id = p_producto;
  return 'borrado';
end $fn$;

revoke all on function public.eliminar_producto(uuid) from public, anon;
grant execute on function public.eliminar_producto(uuid) to authenticated;
