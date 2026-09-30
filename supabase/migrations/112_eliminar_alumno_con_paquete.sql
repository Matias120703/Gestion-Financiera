-- ============================================================
-- 112 · ELIMINAR A UN ALUMNO QUE SOLO TIENE UN PAQUETE
-- ============================================================
--
-- Eliminar a una persona tiene que andar siempre (099, D19): sin historia
-- se borra y con historia se archiva. A un alumno que solo tenía un paquete
-- (uno de regalo, o uno cobrado sin su venta) no se lo podía eliminar:
--
--   update or delete on table "clientes" violates RESTRICT setting of
--   foreign key constraint "paquetes_cliente_id_fkey"
--
-- eliminar_cliente decide «sin historia» mirando fiado, movimientos,
-- reservas, rutinas, medidas y cargas, pero no paquetes. Entonces intentaba
-- borrarlo, y paquetes.cliente_id es ON DELETE RESTRICT a propósito (088:41-43:
-- «un alumno con paquetes no se borra por accidente llevándose la historia
-- de lo que pagó»). Fallaba igual en prueba, pagando o vencido: no es del
-- candado (111).
--
-- El arreglo es una condición más: con un paquete, se archiva. Es su
-- historia, como las rutinas o las medidas. El paquete queda como estaba y,
-- si vuelve con el mismo teléfono, vuelve con él.
--
-- De las claves que apuntan a clientes (ver pg_constraint), es la única que
-- faltaba: fiado, fichas_entreno y rutina_enlaces van en cascada,
-- movimientos y turnos_reserva quedan en null, y rutinas, mediciones y
-- cargas_historial (NO ACTION) ya estaban en la condición.
--
-- Devuelve lo mismo de siempre: 'borrado' o 'archivado'. La pantalla
-- (PantallaClientes.tsx) no cambia ni suma textos.
--
-- Idempotente: se puede aplicar dos veces. No toca datos.
-- ============================================================


-- ------------------------------------------------------------
-- ELIMINAR UN CLIENTE (099:330-409)
--
--    Copia exacta de la 099, la versión viva (el prosrc de producción
--    coincide con la 099, verificado el 30/09/2026), con una línea más en
--    la condición de borrado, marcada (112).
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
